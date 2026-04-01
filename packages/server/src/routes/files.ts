import type { FastifyInstance } from 'fastify';
import { join, resolve, basename, dirname } from 'path';
import { existsSync, statSync, readdirSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, rmSync, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { serverRepo } from '../db/repositories/server-repo.js';
import { config } from '../config.js';

function getServerDataDir(serverId: string): string {
  return join(config.dataDir, 'servers', serverId, 'data');
}

function safePath(baseDir: string, requestedPath: string): string | null {
  const resolved = resolve(baseDir, requestedPath.replace(/^\/+/, ''));
  if (!resolved.startsWith(baseDir)) return null; // Path traversal attempt
  return resolved;
}

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);

  // List files in directory
  app.get<{
    Params: { id: string };
    Querystring: { path?: string };
  }>('/api/servers/:id/files', async (request, reply) => {
    const server = serverRepo.findById(request.params.id);
    if (!server) return reply.status(404).send({ error: 'NotFound', message: 'Server not found' });

    const baseDir = getServerDataDir(server.id);
    const requestedPath = request.query.path || '/';
    const fullPath = safePath(baseDir, requestedPath);

    if (!fullPath) return reply.status(400).send({ error: 'BadRequest', message: 'Invalid path' });
    if (!existsSync(fullPath)) return reply.status(404).send({ error: 'NotFound', message: 'Path not found' });

    const stat = statSync(fullPath);
    if (!stat.isDirectory()) {
      return reply.status(400).send({ error: 'BadRequest', message: 'Path is not a directory' });
    }

    const entries = readdirSync(fullPath, { withFileTypes: true }).map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' as const : 'file' as const,
      size: entry.isFile() ? statSync(join(fullPath, entry.name)).size : null,
      modified: statSync(join(fullPath, entry.name)).mtime.toISOString(),
    }));

    // Sort: directories first, then alphabetically
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return { data: entries, path: requestedPath };
  });

  // Read file content
  app.get<{
    Params: { id: string };
    Querystring: { path: string };
  }>('/api/servers/:id/files/read', async (request, reply) => {
    const server = serverRepo.findById(request.params.id);
    if (!server) return reply.status(404).send({ error: 'NotFound', message: 'Server not found' });

    const baseDir = getServerDataDir(server.id);
    const fullPath = safePath(baseDir, request.query.path);

    if (!fullPath) return reply.status(400).send({ error: 'BadRequest', message: 'Invalid path' });
    if (!existsSync(fullPath)) return reply.status(404).send({ error: 'NotFound', message: 'File not found' });

    const stat = statSync(fullPath);
    if (!stat.isFile()) return reply.status(400).send({ error: 'BadRequest', message: 'Path is not a file' });

    // Limit file size for reading (10MB)
    if (stat.size > 10 * 1024 * 1024) {
      return reply.status(400).send({ error: 'BadRequest', message: 'File too large to read (max 10MB)' });
    }

    const content = readFileSync(fullPath, 'utf-8');
    return { data: { content, name: basename(fullPath), size: stat.size, path: request.query.path } };
  });

  // Write file content
  app.put<{
    Params: { id: string };
    Body: { path: string; content: string };
  }>('/api/servers/:id/files/write', {
    onRequest: requireRole('operator'),
  }, async (request, reply) => {
    const server = serverRepo.findById(request.params.id);
    if (!server) return reply.status(404).send({ error: 'NotFound', message: 'Server not found' });

    const baseDir = getServerDataDir(server.id);
    const fullPath = safePath(baseDir, request.body.path);

    if (!fullPath) return reply.status(400).send({ error: 'BadRequest', message: 'Invalid path' });

    // Ensure parent directory exists
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(fullPath, request.body.content, 'utf-8');
    return { data: { ok: true, path: request.body.path } };
  });

  // Delete file or directory
  app.delete<{
    Params: { id: string };
    Querystring: { path: string };
  }>('/api/servers/:id/files', {
    onRequest: requireRole('operator'),
  }, async (request, reply) => {
    const server = serverRepo.findById(request.params.id);
    if (!server) return reply.status(404).send({ error: 'NotFound', message: 'Server not found' });

    const baseDir = getServerDataDir(server.id);
    const fullPath = safePath(baseDir, request.query.path);

    if (!fullPath) return reply.status(400).send({ error: 'BadRequest', message: 'Invalid path' });
    if (!existsSync(fullPath)) return reply.status(404).send({ error: 'NotFound', message: 'Path not found' });

    // Don't allow deleting the root data dir
    if (fullPath === baseDir) {
      return reply.status(400).send({ error: 'BadRequest', message: 'Cannot delete root directory' });
    }

    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      rmSync(fullPath, { recursive: true });
    } else {
      unlinkSync(fullPath);
    }

    return { data: { ok: true } };
  });

  // Download file
  app.get<{
    Params: { id: string };
    Querystring: { path: string };
  }>('/api/servers/:id/files/download', async (request, reply) => {
    const server = serverRepo.findById(request.params.id);
    if (!server) return reply.status(404).send({ error: 'NotFound', message: 'Server not found' });

    const baseDir = getServerDataDir(server.id);
    const fullPath = safePath(baseDir, request.query.path);

    if (!fullPath) return reply.status(400).send({ error: 'BadRequest', message: 'Invalid path' });
    if (!existsSync(fullPath)) return reply.status(404).send({ error: 'NotFound', message: 'File not found' });

    const stat = statSync(fullPath);
    if (!stat.isFile()) return reply.status(400).send({ error: 'BadRequest', message: 'Path is not a file' });

    const name = basename(fullPath);
    reply.header('Content-Disposition', `attachment; filename="${name}"`);
    reply.header('Content-Type', 'application/octet-stream');

    const content = readFileSync(fullPath);
    return reply.send(content);
  });

  // Upload file(s) via multipart
  app.post<{
    Params: { id: string };
    Querystring: { path?: string };
  }>('/api/servers/:id/files/upload', {
    onRequest: requireRole('operator'),
  }, async (request, reply) => {
    const server = serverRepo.findById(request.params.id);
    if (!server) return reply.status(404).send({ error: 'NotFound', message: 'Server not found' });

    const baseDir = getServerDataDir(server.id);
    const targetDir = safePath(baseDir, request.query.path || '/');
    if (!targetDir) return reply.status(400).send({ error: 'BadRequest', message: 'Invalid path' });

    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

    const parts = request.parts();
    const uploaded: string[] = [];

    for await (const part of parts) {
      if (part.type === 'file') {
        const filePath = join(targetDir, basename(part.filename));
        await pipeline(part.file, createWriteStream(filePath));
        uploaded.push(part.filename);
      }
    }

    return { data: { ok: true, files: uploaded } };
  });

  // Create directory
  app.post<{
    Params: { id: string };
    Body: { path: string; name: string };
  }>('/api/servers/:id/files/mkdir', {
    onRequest: requireRole('operator'),
  }, async (request, reply) => {
    const server = serverRepo.findById(request.params.id);
    if (!server) return reply.status(404).send({ error: 'NotFound', message: 'Server not found' });

    const baseDir = getServerDataDir(server.id);
    const parentPath = safePath(baseDir, request.body.path || '/');
    if (!parentPath) return reply.status(400).send({ error: 'BadRequest', message: 'Invalid path' });

    const dirPath = join(parentPath, request.body.name);
    if (existsSync(dirPath)) return reply.status(409).send({ error: 'Conflict', message: 'Directory already exists' });

    mkdirSync(dirPath, { recursive: true });
    return { data: { ok: true } };
  });
}
