import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import type { GameTemplate } from '@gamepanel/shared';

let cachedTemplates: GameTemplate[] | null = null;

export function loadTemplates(): GameTemplate[] {
  if (cachedTemplates && !config.isDev) {
    return cachedTemplates;
  }

  const dir = config.templatesDir;
  if (!existsSync(dir)) {
    console.warn(`Templates directory not found: ${dir}`);
    return [];
  }

  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const templates: GameTemplate[] = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), 'utf-8');
      const template = JSON.parse(raw) as GameTemplate;
      templates.push(template);
    } catch (err) {
      console.error(`Failed to load template ${file}:`, err);
    }
  }

  cachedTemplates = templates;
  return templates;
}

export function getTemplate(slug: string): GameTemplate | undefined {
  return loadTemplates().find(t => t.slug === slug);
}
