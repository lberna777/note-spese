// Controllo dopo la build: GitHub Pages passa il sito da Jekyll, che scarta i file il cui nome comincia
// con «_» (Vite ne produce, per esempio assets/_commonjsHelpers-*.js). Senza dist/.nojekyll quei file
// danno 404 e scansione e lettura dello scontrino non partono (guasto del 2026-11-05).
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'dist');

function walk(dir, rel = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), `${rel}${e.name}/`) : [`${rel}${e.name}`],
  );
}

const underscore = walk(dist).filter((f) => f.split('/').some((part) => part.startsWith('_')));
if (!existsSync(join(dist, '.nojekyll'))) {
  console.error(`dist/.nojekyll mancante: su GitHub Pages ${underscore.length} file daranno 404 (${underscore.join(', ')}).`);
  process.exit(1);
}
console.log(`dist: .nojekyll presente (${underscore.length} file con «_» serviti correttamente).`);
