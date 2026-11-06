import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// GitHub Pages scarta i file che cominciano con «_» se manca .nojekyll: il 2026-11-05 è successo e
// scansione e lettura dello scontrino non partivano più (404 su assets/_commonjsHelpers-*.js).
// Con l'ambiente jsdom import.meta.url non è un percorso di file: si parte dalla radice del progetto.
const root = process.cwd();

describe('pubblicazione su GitHub Pages', () => {
  it('public/.nojekyll esiste, così finisce in ogni build', () => {
    expect(existsSync(join(root, 'public', '.nojekyll'))).toBe(true);
  });

  it('se c’è una build, contiene .nojekyll', () => {
    const dist = join(root, 'dist');
    if (!existsSync(dist) || readdirSync(dist).length === 0) return;
    expect(existsSync(join(dist, '.nojekyll'))).toBe(true);
  });
});
