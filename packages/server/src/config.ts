import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.GAMEPANEL_PORT || '3000', 10),
  host: process.env.GAMEPANEL_HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  // Data directory (SQLite, server volumes, backups)
  dataDir: process.env.DATA_DIR || join(process.cwd(), 'data'),

  // Host data directory — used for Docker bind mounts when running inside a container.
  // Inside a container, dataDir is /app/data but Docker needs the host path for volume mounts.
  hostDataDir: process.env.HOST_DATA_DIR || process.env.DATA_DIR || join(process.cwd(), 'data'),

  // Default admin credentials (used on first run)
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'changeme',

  // Session
  sessionMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days

  // Templates directory
  templatesDir: process.env.TEMPLATES_DIR || join(process.cwd(), 'templates'),
} as const;
