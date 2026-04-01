import { serverRepo } from '../db/repositories/server-repo.js';

/**
 * Generate a URL/filesystem-safe slug from a name.
 * "My Minecraft Server" → "my-minecraft-server"
 * Handles collisions by appending -2, -3, etc.
 */
export function generateServerSlug(name: string): string {
  let base = name
    .toLowerCase()
    .replace(/[æ]/g, 'ae').replace(/[ø]/g, 'o').replace(/[å]/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  if (!base) base = 'server';

  // Check for collisions
  let slug = base;
  let counter = 2;
  while (serverRepo.findById(slug)) {
    slug = `${base}-${counter}`;
    counter++;
  }

  return slug;
}
