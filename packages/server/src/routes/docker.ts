import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { getDocker } from '../docker/node-pool.js';
import { nodeRepo } from '../db/repositories/node-repo.js';
import { auditRepo } from '../db/repositories/audit-repo.js';

export async function dockerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);

  // List Docker images across all nodes
  app.get('/api/docker/images', {
    onRequest: requireRole('admin'),
  }, async () => {
    const nodes = nodeRepo.findAll();
    const allImages: any[] = [];

    for (const node of nodes) {
      try {
        const docker = getDocker(node.id);
        const images = await docker.listImages();
        for (const img of images) {
          allImages.push({
            id: img.Id.slice(7, 19),
            tags: img.RepoTags ?? [],
            size: img.Size,
            created: new Date(img.Created * 1000).toISOString(),
            nodeId: node.id,
            nodeName: node.name,
          });
        }
      } catch { /* skip offline nodes */ }
    }

    return { data: allImages };
  });

  // Pull an image
  app.post<{
    Body: { image: string; nodeId?: string };
  }>('/api/docker/images/pull', {
    onRequest: requireRole('admin'),
  }, async (request, reply) => {
    const { image, nodeId } = request.body;
    if (!image) {
      return reply.status(400).send({ error: 'BadRequest', message: 'image is required' });
    }

    const targetNodeId = nodeId ?? 'local';
    const docker = getDocker(targetNodeId);

    try {
      const stream = await docker.pull(image);
      await new Promise<void>((resolve, reject) => {
        docker.modem.followProgress(stream, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });

      auditRepo.log(request.user!.id, 'docker:pull', undefined, { image, nodeId: targetNodeId }, request.ip);
      return { data: { ok: true, image } };
    } catch (err: any) {
      return reply.status(500).send({ error: 'DockerError', message: err.message });
    }
  });

  // Prune unused images
  app.post<{
    Body: { nodeId?: string };
  }>('/api/docker/prune', {
    onRequest: requireRole('admin'),
  }, async (request) => {
    const nodeId = request.body?.nodeId ?? 'local';
    const docker = getDocker(nodeId);

    const result = await docker.pruneImages();
    const spaceReclaimed = result.SpaceReclaimed || 0;

    auditRepo.log(request.user!.id, 'docker:prune', undefined, {
      nodeId,
      spaceReclaimed,
      imagesDeleted: result.ImagesDeleted?.length ?? 0,
    }, request.ip);

    return {
      data: {
        spaceReclaimed,
        imagesDeleted: result.ImagesDeleted?.length ?? 0,
      },
    };
  });

  // Disk usage per node
  app.get('/api/docker/disk-usage', {
    onRequest: requireRole('admin'),
  }, async () => {
    const nodes = nodeRepo.findAll();
    const usage: any[] = [];

    for (const node of nodes) {
      try {
        const docker = getDocker(node.id);
        const df = await docker.df();
        usage.push({
          nodeId: node.id,
          nodeName: node.name,
          images: {
            count: df.Images?.length ?? 0,
            size: df.Images?.reduce((sum: number, i: any) => sum + (i.Size || 0), 0) ?? 0,
          },
          containers: {
            count: df.Containers?.length ?? 0,
            size: df.Containers?.reduce((sum: number, c: any) => sum + (c.SizeRw || 0), 0) ?? 0,
          },
          volumes: {
            count: df.Volumes?.length ?? 0,
            size: df.Volumes?.reduce((sum: number, v: any) => sum + (v.UsageData?.Size || 0), 0) ?? 0,
          },
        });
      } catch { /* skip offline */ }
    }

    return { data: usage };
  });
}
