import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { PHOTO_ID } from '../src/domain/photos.ts';

/**
 * Menu photos on the shop PC (src/domain/photos.ts), one file per photo, named by its SHA-256: the
 * same picture is kept once, a photo is never changed in place, and an old one stays for Undo.
 * Menu photos are the shop's public face, not its records: they hold no tenant's data.
 */
export interface PhotoStore {
  /** Keeps a checked WebP; returns its id. */
  put(bytes: Uint8Array): Promise<string>;
  get(id: string): Promise<Buffer | null>;
}

export const photoId = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export function filePhotos(dir: string): PhotoStore {
  const path = (id: string) => `${dir}/${id}.webp`;
  return {
    async put(bytes) {
      const id = photoId(bytes);
      await mkdir(dir, { recursive: true });
      // Written whole, then renamed: a power cut never leaves half a photo under its id.
      const tmp = `${path(id)}.${process.pid}.tmp`;
      await writeFile(tmp, bytes);
      await rename(tmp, path(id));
      return id;
    },
    async get(id) {
      if (!PHOTO_ID.test(id)) return null;
      try { return await readFile(path(id)); } catch { return null; }
    },
  };
}

export function memoryPhotos(): PhotoStore {
  const kept = new Map<string, Buffer>();
  return {
    async put(bytes) { const id = photoId(bytes); kept.set(id, Buffer.from(bytes)); return id; },
    async get(id) { return kept.get(id) ?? null; },
  };
}
