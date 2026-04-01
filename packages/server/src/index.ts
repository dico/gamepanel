import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import bcrypt from 'bcrypt';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { config, VERSION } from './config.js';
import { initDb } from './db/index.js';
import { userRepo } from './db/repositories/user-repo.js';
import { nodeRepo } from './db/repositories/node-repo.js';
import { authRoutes } from './routes/auth.js';
import { serverRoutes } from './routes/servers.js';
import { nodeRoutes } from './routes/nodes.js';
import { templateRoutes } from './routes/templates.js';
import { notificationRoutes } from './routes/notifications.js';
import { fileRoutes } from './routes/files.js';
import { profileRoutes } from './routes/profile.js';
import { dockerRoutes } from './routes/docker.js';
import { importRoutes } from './routes/import.js';
import { presetRoutes } from './routes/presets.js';
import { userRoutes } from './routes/users.js';
import { systemRoutes } from './routes/system.js';
import { statusRoutes } from './routes/status.js';
import { backupRoutes } from './routes/backups.js';
import { consoleWsRoutes } from './ws/console-handler.js';
import { eventsWsRoutes } from './ws/events-handler.js';
import { startStatusMonitor } from './services/status-monitor.js';
import { startPlayerQuery } from './services/player-query.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('GamePanel starting...');
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Data directory: ${config.dataDir}`);

  // Initialize database
  initDb();
  console.log('Database initialized');

  // Seed default data on first run
  await seedDefaults();

  // Create Fastify instance
  const app = Fastify({
    logger: config.isDev ? { level: 'info' } : { level: 'warn' },
    trustProxy: true,
  });

  // Register plugins
  await app.register(fastifyCookie);
  await app.register(fastifyCors, {
    origin: config.isDev ? true : false,
    credentials: true,
  });
  await app.register(fastifyWebsocket);
  await app.register(fastifyMultipart, { limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB max

  // Serve static frontend (client build output or dev placeholder)
  // Try multiple possible paths for client dist
  const possiblePaths = [
    join(process.cwd(), 'packages', 'client', 'dist'),
    join(__dirname, '..', '..', 'client', 'dist'),
    join(__dirname, '..', 'public'),
  ];
  const staticDir = possiblePaths.find(p => existsSync(join(p, 'index.html')));
  console.log(`Static dir: ${staticDir ?? 'none (using fallback HTML)'}`);

  if (staticDir) {
    await app.register(fastifyStatic, {
      root: staticDir,
      prefix: '/',
      wildcard: false,
    });
  }

  // Register API routes
  await app.register(authRoutes);
  await app.register(serverRoutes);
  await app.register(nodeRoutes);
  await app.register(templateRoutes);
  await app.register(notificationRoutes);
  await app.register(fileRoutes);
  await app.register(profileRoutes);
  await app.register(dockerRoutes);
  await app.register(importRoutes);
  await app.register(presetRoutes);
  await app.register(userRoutes);
  await app.register(systemRoutes);
  await app.register(statusRoutes);
  await app.register(backupRoutes);

  // Register WebSocket routes
  await app.register(consoleWsRoutes);
  await app.register(eventsWsRoutes);

  // Health check
  app.get('/api/health', async () => {
    return { status: 'ok', version: VERSION };
  });

  // SPA catch-all — serve index.html for all non-API/WS routes
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/ws/')) {
      return reply.status(404).send({ error: 'NotFound', message: `Route ${request.method}:${request.url} not found` });
    }

    if (staticDir) {
      return reply.sendFile('index.html');
    }

    return reply.status(200).header('content-type', 'text/html').send(fallbackHtml());
  });

  // Start background services
  startStatusMonitor();
  startPlayerQuery();

  // Start server
  await app.listen({ port: config.port, host: config.host });
  console.log(`GamePanel running at http://${config.host}:${config.port}`);
}

async function seedDefaults() {
  // Create default admin user if no users exist
  if (userRepo.count() === 0) {
    const hash = await bcrypt.hash(config.adminPassword, 12);
    userRepo.create('admin', config.adminUsername, hash, 'admin', 'Administrator');
    console.log(`Default admin user created: ${config.adminUsername}`);
  }

  // Create local node if it doesn't exist
  if (!nodeRepo.findById('local')) {
    nodeRepo.create({ id: 'local', name: 'Lokal', host: 'local', description: 'Lokal Docker-instans' });
    console.log('Local node created');
  }
}

function fallbackHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GamePanel</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: #0f1117;
      color: #e1e4e8;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    nav {
      background: #161b22;
      border-bottom: 1px solid #30363d;
      padding: 0 24px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    nav .brand {
      font-size: 18px;
      font-weight: 700;
      color: #58a6ff;
    }
    nav .user { color: #8b949e; font-size: 14px; }
    main { flex: 1; padding: 32px; max-width: 1200px; margin: 0 auto; width: 100%; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: #8b949e; margin-bottom: 32px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 20px;
    }
    .card h3 { margin-bottom: 8px; }
    .card .status { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .status.ok { background: #1a3a2a; color: #3fb950; }
    .status.info { background: #1a2a3a; color: #58a6ff; }
    .api-section { margin-top: 32px; }
    .api-section h2 { font-size: 18px; margin-bottom: 16px; color: #c9d1d9; }
    .endpoint {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 13px;
      padding: 8px 12px;
      background: #0d1117;
      border: 1px solid #21262d;
      border-radius: 6px;
      margin-bottom: 4px;
      display: flex;
      gap: 12px;
    }
    .method { font-weight: 700; min-width: 50px; }
    .method.get { color: #3fb950; }
    .method.post { color: #58a6ff; }
    .method.patch { color: #d29922; }
    .method.delete { color: #f85149; }
    #servers-list { margin-top: 16px; }
    .server-card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .server-card .name { font-weight: 600; }
    .server-card .meta { color: #8b949e; font-size: 13px; }
    .badge {
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge.running { background: #1a3a2a; color: #3fb950; }
    .badge.stopped { background: #2a2020; color: #8b949e; }
    .badge.error { background: #3a1a1a; color: #f85149; }
    .badge.creating { background: #1a2a3a; color: #58a6ff; }
    .empty { color: #484f58; font-style: italic; padding: 32px; text-align: center; }
    .btn {
      padding: 6px 16px;
      border-radius: 6px;
      border: 1px solid #30363d;
      background: #21262d;
      color: #c9d1d9;
      cursor: pointer;
      font-size: 13px;
      margin-left: 8px;
    }
    .btn:hover { background: #30363d; }
    .btn.primary { background: #238636; border-color: #2ea043; color: white; }
    .btn.primary:hover { background: #2ea043; }
    .btn.danger { background: #da3633; border-color: #f85149; color: white; }
    .btn.danger:hover { background: #f85149; }
  </style>
</head>
<body>
  <nav>
    <span class="brand">GamePanel</span>
    <span class="user" id="user-info">Loading...</span>
  </nav>
  <main>
    <h1>Dashboard</h1>
    <p class="subtitle">Game server management</p>

    <div class="cards">
      <div class="card">
        <h3>System</h3>
        <span class="status ok" id="health-status">Checking...</span>
        <p style="margin-top: 12px; font-size: 13px; color: #8b949e;" id="node-info">-</p>
      </div>
      <div class="card">
        <h3>Templates</h3>
        <span class="status info" id="template-count">-</span>
        <p style="margin-top: 12px; font-size: 13px; color: #8b949e;" id="template-list">-</p>
      </div>
    </div>

    <div style="margin-top: 32px; display: flex; justify-content: space-between; align-items: center;">
      <h2>Servers</h2>
    </div>
    <div id="servers-list"><div class="empty">Loading...</div></div>

    <div class="api-section">
      <h2>API Endpoints</h2>
      <div class="endpoint"><span class="method get">GET</span> /api/health</div>
      <div class="endpoint"><span class="method post">POST</span> /api/auth/login</div>
      <div class="endpoint"><span class="method get">GET</span> /api/auth/me</div>
      <div class="endpoint"><span class="method get">GET</span> /api/servers</div>
      <div class="endpoint"><span class="method post">POST</span> /api/servers</div>
      <div class="endpoint"><span class="method post">POST</span> /api/servers/:id/start</div>
      <div class="endpoint"><span class="method post">POST</span> /api/servers/:id/stop</div>
      <div class="endpoint"><span class="method delete">DEL</span> /api/servers/:id</div>
      <div class="endpoint"><span class="method get">GET</span> /api/nodes</div>
      <div class="endpoint"><span class="method get">GET</span> /api/templates</div>
      <div class="endpoint"><span class="method get">GET</span> /api/notifications</div>
    </div>
  </main>

  <script>
    const API = '';

    async function api(path, opts = {}) {
      const res = await fetch(API + path, { credentials: 'include', ...opts });
      return res.json();
    }

    async function init() {
      // Health
      const health = await api('/api/health');
      document.getElementById('health-status').textContent = health.status === 'ok' ? 'Online' : 'Error';

      // Auth check
      const me = await api('/api/auth/me');
      if (me.data) {
        document.getElementById('user-info').textContent = me.data.username + ' (' + me.data.role + ')';
      } else {
        document.getElementById('user-info').textContent = 'Not logged in';
      }

      // Nodes
      const nodes = await api('/api/nodes');
      if (nodes.data) {
        document.getElementById('node-info').textContent = nodes.data.length + ' node(s): ' + nodes.data.map(n => n.name).join(', ');
      }

      // Templates
      const templates = await api('/api/templates');
      if (templates.data) {
        document.getElementById('template-count').textContent = templates.data.length + ' available';
        document.getElementById('template-list').textContent = templates.data.map(t => t.name).join(', ') || 'None';
      }

      // Servers
      await loadServers();
    }

    async function loadServers() {
      const res = await api('/api/servers');
      const el = document.getElementById('servers-list');
      if (!res.data || res.data.length === 0) {
        el.innerHTML = '<div class="empty">No servers yet. Use the API to create one.</div>';
        return;
      }
      el.innerHTML = res.data.map(s => \`
        <div class="server-card">
          <div>
            <span class="name">\${s.name}</span>
            <span class="meta"> &mdash; \${s.templateSlug} on \${s.nodeId}</span>
          </div>
          <div>
            <span class="badge \${s.status}">\${s.status}</span>
            \${s.status === 'stopped' ? \`<button class="btn primary" onclick="serverAction('\${s.id}', 'start')">Start</button>\` : ''}
            \${s.status === 'running' ? \`<button class="btn" onclick="serverAction('\${s.id}', 'stop')">Stop</button>\` : ''}
            <button class="btn danger" onclick="deleteServer('\${s.id}')">Delete</button>
          </div>
        </div>
      \`).join('');
    }

    async function serverAction(id, action) {
      await api(\`/api/servers/\${id}/\${action}\`, { method: 'POST' });
      setTimeout(loadServers, 1000);
    }

    async function deleteServer(id) {
      if (!confirm('Delete this server?')) return;
      await api(\`/api/servers/\${id}\`, { method: 'DELETE' });
      loadServers();
    }

    init();
  </script>
</body>
</html>`;
}

main().catch((err) => {
  console.error('Failed to start GamePanel:', err);
  process.exit(1);
});
