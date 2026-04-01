import { getDb } from '../index.js';
import type { Preset } from '@gamepanel/shared';

interface PresetRow {
  id: string;
  template_slug: string;
  name: string;
  description: string | null;
  environment: string;
  config_values: string;
  ports_offset: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToPreset(row: PresetRow): Preset {
  return {
    id: row.id,
    templateSlug: row.template_slug,
    name: row.name,
    description: row.description,
    environment: JSON.parse(row.environment),
    configValues: JSON.parse(row.config_values),
    portsOffset: row.ports_offset,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const presetRepo = {
  findById(id: string): Preset | null {
    const row = getDb().prepare('SELECT * FROM presets WHERE id = ?').get(id) as PresetRow | undefined;
    return row ? rowToPreset(row) : null;
  },

  findAll(): Preset[] {
    return (getDb().prepare('SELECT * FROM presets ORDER BY created_at DESC').all() as PresetRow[]).map(rowToPreset);
  },

  create(preset: {
    id: string;
    templateSlug: string;
    name: string;
    description?: string;
    environment: Record<string, string>;
    configValues: Record<string, string>;
    portsOffset?: number;
    createdBy?: string;
  }): Preset {
    getDb().prepare(
      'INSERT INTO presets (id, template_slug, name, description, environment, config_values, ports_offset, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      preset.id, preset.templateSlug, preset.name, preset.description ?? null,
      JSON.stringify(preset.environment), JSON.stringify(preset.configValues),
      preset.portsOffset ?? 0, preset.createdBy ?? null,
    );
    return this.findById(preset.id)!;
  },

  update(id: string, data: { name?: string; description?: string; environment?: Record<string, string>; configValues?: Record<string, string>; portsOffset?: number }): void {
    const preset = this.findById(id);
    if (!preset) return;
    getDb().prepare(
      "UPDATE presets SET name = ?, description = ?, environment = ?, config_values = ?, ports_offset = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(
      data.name ?? preset.name,
      data.description ?? preset.description,
      JSON.stringify(data.environment ?? preset.environment),
      JSON.stringify(data.configValues ?? preset.configValues),
      data.portsOffset ?? preset.portsOffset,
      id,
    );
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM presets WHERE id = ?').run(id);
  },
};
