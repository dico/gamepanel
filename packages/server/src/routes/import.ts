import type { FastifyInstance } from 'fastify';
import { existsSync, readdirSync, statSync, cpSync, mkdirSync, createWriteStream, readFileSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { execFileSync } from 'child_process';
import { pipeline } from 'stream/promises';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { serverRepo } from '../db/repositories/server-repo.js';
import { auditRepo } from '../db/repositories/audit-repo.js';
import { dockerManager } from '../docker/docker-manager.js';
import { getTemplate } from '../templates/template-loader.js';
import { generateServerSlug } from '../utils/slug.js';
import type { GameTemplate, PortMapping } from '@gamepanel/shared';
import { findAvailablePorts } from '../services/port-allocator.js';
import { config } from '../config.js';

const IMPORT_DIR = '/opt/gamepanel/import';

export async function importRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);

  // List available directories in the import folder
  app.get('/api/import/list', {
    onRequest: requireRole('admin'),
  }, async () => {
    const importDir = process.env.IMPORT_DIR || IMPORT_DIR;

    if (!existsSync(importDir)) {
      return { data: [], importDir, exists: false };
    }

    const entries = readdirSync(importDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => {
        const fullPath = join(importDir, e.name);
        const files = readdirSync(fullPath);
        const totalSize = files.reduce((sum, f) => {
          try { return sum + statSync(join(fullPath, f)).size; } catch { return sum; }
        }, 0);

        return {
          name: e.name,
          path: fullPath,
          fileCount: files.length,
          size: totalSize,
          // Try to detect game type from files
          detectedGame: detectGameType(files),
        };
      });

    return { data: entries, importDir, exists: true };
  });

  // Upload and extract a zip/tar.gz for import
  app.post('/api/import/upload', {
    onRequest: requireRole('admin'),
  }, async (request, reply) => {
    const importDir = process.env.IMPORT_DIR || IMPORT_DIR;
    if (!existsSync(importDir)) mkdirSync(importDir, { recursive: true });

    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'BadRequest', message: 'No file uploaded' });

    const filename = data.filename;
    const isZip = filename.endsWith('.zip');
    const isTarGz = filename.endsWith('.tar.gz') || filename.endsWith('.tgz');

    if (!isZip && !isTarGz) {
      return reply.status(400).send({ error: 'BadRequest', message: 'Only .zip and .tar.gz files are supported' });
    }

    // Save uploaded file to temp location
    const tempFile = join(importDir, filename);
    await pipeline(data.file, createWriteStream(tempFile));

    // Create extraction directory
    const dirName = filename.replace(/\.(zip|tar\.gz|tgz)$/i, '');
    const extractDir = join(importDir, dirName);
    mkdirSync(extractDir, { recursive: true });

    // Extract
    try {
      if (isZip) {
        execFileSync('unzip', ['-o', tempFile, '-d', extractDir], { timeout: 300_000 });
      } else {
        execFileSync('tar', ['-xzf', tempFile, '-C', extractDir], { timeout: 300_000 });
      }

      // Clean up archive
      const { unlinkSync } = await import('fs');
      unlinkSync(tempFile);

      return { data: { path: extractDir, name: dirName } };
    } catch (err: any) {
      return reply.status(500).send({ error: 'ExtractError', message: `Failed to extract: ${err.message}` });
    }
  });

  // Import a server from a directory
  app.post<{
    Body: {
      sourcePath: string;
      name: string;
      templateSlug: string;
      nodeId: string;
      environment?: Record<string, string>;
      move?: boolean; // true = move files, false = copy (default)
    };
  }>('/api/import', {
    onRequest: requireRole('admin'),
  }, async (request, reply) => {
    const { sourcePath, name, templateSlug, nodeId, environment, move } = request.body;

    if (!sourcePath || !name || !templateSlug) {
      return reply.status(400).send({ error: 'BadRequest', message: 'sourcePath, name, and templateSlug are required' });
    }

    // Restrict sourcePath to import directory to prevent path traversal
    const importDir = process.env.IMPORT_DIR || IMPORT_DIR;
    const { resolve } = await import('path');
    const resolvedSource = resolve(sourcePath);
    if (!resolvedSource.startsWith(resolve(importDir))) {
      return reply.status(400).send({ error: 'BadRequest', message: 'Source path must be within the import directory' });
    }

    if (!existsSync(resolvedSource)) {
      return reply.status(400).send({ error: 'BadRequest', message: 'Source path does not exist' });
    }

    const template = getTemplate(templateSlug);
    if (!template) {
      return reply.status(400).send({ error: 'BadRequest', message: 'Template not found' });
    }

    // Generate slug and create server record
    const serverId = generateServerSlug(name);
    const serverDataDir = join(config.dataDir, 'servers', serverId, 'data');

    // Auto-allocate ports
    const ports: PortMapping[] = await findAvailablePorts(
      template.ports.map(p => ({
        name: p.name,
        defaultHost: p.defaultHost,
        container: p.container,
        protocol: p.protocol as 'tcp' | 'udp',
      })),
      nodeId,
    ) as PortMapping[];

    // Merge template defaults with provided environment
    const defaultEnv: Record<string, string> = {};
    for (const field of template.environment.configurable) {
      defaultEnv[field.key] = String(field.default);
    }
    const mergedEnv = { ...defaultEnv, ...environment };

    // Copy/move files to server data directory
    mkdirSync(serverDataDir, { recursive: true });

    try {
      if (move) {
        // Use rename for speed (same filesystem)
        const { renameSync } = await import('fs');
        try {
          renameSync(sourcePath, serverDataDir);
        } catch {
          // Cross-filesystem, fall back to copy + delete
          cpSync(sourcePath, serverDataDir, { recursive: true });
          const { rmSync } = await import('fs');
          rmSync(sourcePath, { recursive: true });
        }
      } else {
        cpSync(sourcePath, serverDataDir, { recursive: true });
      }
    } catch (err: any) {
      return reply.status(500).send({ error: 'ImportError', message: `Failed to copy files: ${err.message}` });
    }

    // Update config files with allocated ports (e.g. server.properties for Minecraft)
    updateImportedConfigPorts(serverDataDir, ports, template);

    // Create server record
    const server = serverRepo.create({
      id: serverId,
      nodeId,
      name,
      templateSlug,
      ports,
      environment: mergedEnv,
    });

    auditRepo.log(request.user!.id, 'server:import', server.id, { sourcePath, name }, request.ip);

    return reply.status(201).send({ data: server });
  });
}

/**
 * Update config files in imported server data to use allocated ports.
 * For example, Minecraft's server.properties has a server-port field.
 */
function updateImportedConfigPorts(
  dataDir: string,
  ports: PortMapping[],
  template: GameTemplate,
): void {
  const gamePort = ports.find(p => p.name === 'Game') || ports[0];
  if (!gamePort) return;

  // Minecraft: update server.properties
  const serverProps = join(dataDir, 'server.properties');
  if (existsSync(serverProps)) {
    try {
      let content = readFileSync(serverProps, 'utf-8');
      content = content.replace(/^server-port=.*/m, `server-port=${gamePort.host}`);
      writeFileSync(serverProps, content, 'utf-8');
    } catch { /* skip if can't update */ }
  }
}

function detectGameType(files: string[]): string | null {
  const fileSet = new Set(files.map(f => f.toLowerCase()));

  if (fileSet.has('server.properties') || files.some(f => f.endsWith('.jar'))) return 'minecraft-java';
  if (fileSet.has('cs2') || fileSet.has('game') && fileSet.has('csgo')) return 'cs2';
  if (fileSet.has('valheim_server_data')) return 'valheim';

  return null;
}
