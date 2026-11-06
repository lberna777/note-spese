// Dopo la pubblicazione: ogni file di dist/ deve rispondere 200 sul sito pubblicato.
// Uso: npm run check:published [-- https://indirizzo/del/sito/]
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = (process.argv[2] ?? 'https://lberna777.github.io/note-spese/').replace(/\/?$/, '/');
const dist = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'dist');

function walk(dir, rel = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), `${rel}${e.name}/`) : [`${rel}${e.name}`],
  );
}

const files = walk(dist).filter((f) => f !== '.nojekyll');
const bad = [];
await Promise.all(
  files.map(async (f) => {
    const res = await fetch(new URL(f, site), { method: 'HEAD' });
    if (!res.ok) bad.push(`${res.status} ${f}`);
  }),
);
if (bad.length) {
  console.error(`Sul sito mancano ${bad.length} file su ${files.length}:\n${bad.join('\n')}`);
  process.exit(1);
}
console.log(`Sito pubblicato: ${files.length} file su ${files.length} raggiungibili.`);
