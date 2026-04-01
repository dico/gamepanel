import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { getTemplate } from '../templates/template-loader.js';
import type { Server } from '@gamepanel/shared';

/**
 * Write managed config fields from DB to actual config files.
 * Called before server start/restart to sync UI changes to disk.
 *
 * Only updates fields defined in template's configFiles[].managedFields.
 * Other fields in the file are left untouched.
 */
export function syncConfigToFiles(server: Server): void {
  const template = getTemplate(server.templateSlug);
  if (!template?.configFiles) return;

  const dataDir = join(config.dataDir, 'servers', server.id, 'data');

  for (const cfgFile of template.configFiles) {
    if (!cfgFile.managedFields?.length) continue;

    const filePath = cfgFile.path.startsWith('/')
      ? join(dataDir, cfgFile.path.replace(template.volumes?.[0]?.container || '/data', ''))
      : join(dataDir, cfgFile.path);

    if (cfgFile.format === 'properties') {
      writePropertiesFields(filePath, server.configValues, cfgFile.managedFields);
    }
    // Add json, yaml, ini support later as needed
  }
}

/**
 * Update specific keys in a .properties file, preserving all other content.
 */
function writePropertiesFields(
  filePath: string,
  values: Record<string, string>,
  fields: { key: string; default: string | number | boolean }[],
): void {
  if (!existsSync(filePath)) return;

  let content = readFileSync(filePath, 'utf-8');

  for (const field of fields) {
    const value = values[field.key] ?? String(field.default);
    const regex = new RegExp(`^${escapeRegex(field.key)}=.*$`, 'm');

    if (regex.test(content)) {
      content = content.replace(regex, `${field.key}=${value}`);
    } else {
      // Key doesn't exist yet — append
      content += `\n${field.key}=${value}`;
    }
  }

  writeFileSync(filePath, content, 'utf-8');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
