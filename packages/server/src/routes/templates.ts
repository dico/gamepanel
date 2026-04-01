import type { FastifyInstance } from 'fastify';
import { join, extname, basename } from 'path';
import { existsSync, readFileSync } from 'fs';
import { authMiddleware } from '../middleware/auth.js';
import { loadTemplates } from '../templates/template-loader.js';
import { config } from '../config.js';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
};

export async function templateRoutes(app: FastifyInstance): Promise<void> {
  // Template images and icons — no auth required (used on login/public pages too)
  app.get<{ Params: { filename: string } }>('/api/templates/images/:filename', async (request, reply) => {
    return serveAsset(reply, 'images', request.params.filename);
  });

  app.get<{ Params: { filename: string } }>('/api/templates/icons/:filename', async (request, reply) => {
    return serveAsset(reply, 'icons', request.params.filename);
  });

  // Authenticated routes below
  app.addHook('onRequest', authMiddleware);

  // List all templates
  app.get('/api/templates', async () => {
    const templates = loadTemplates();
    return { data: templates };
  });

  // Get template by slug
  app.get<{ Params: { slug: string } }>('/api/templates/:slug', async (request, reply) => {
    const templates = loadTemplates();
    const template = templates.find(t => t.slug === request.params.slug);
    if (!template) {
      return reply.status(404).send({ error: 'NotFound', message: 'Template not found' });
    }
    return { data: template };
  });
}

function serveAsset(reply: any, subdir: string, filename: string) {
  // Sanitize filename — no path traversal
  const safe = basename(filename);
  const filePath = join(config.templatesDir, subdir, safe);

  if (!existsSync(filePath)) {
    return reply.status(404).send({ error: 'NotFound', message: 'File not found' });
  }

  const ext = extname(safe).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  reply.header('Content-Type', mime);
  reply.header('Cache-Control', 'public, max-age=86400'); // 24h cache
  return reply.send(readFileSync(filePath));
}
