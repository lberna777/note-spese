// Copia in public/tesseract/ i file di Tesseract.js (worker, core WebAssembly, modello italiano),
// così l'app non contatta nessun CDN. Idempotente: si può lanciare quante volte si vuole.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'tesseract');
const require = createRequire(join(root, 'package.json'));

function pkgDir(name, from = require) {
  return dirname(from.resolve(`${name}/package.json`));
}

const tessDir = pkgDir('tesseract.js');
// tesseract.js 7 vuole il core 7 (ha le varianti «relaxedsimd»), che npm annida dentro tesseract.js
// quando il progetto dichiara il core 6: si preferisce la copia annidata, se esiste.
const nestedCore = join(tessDir, 'node_modules', 'tesseract.js-core');
const coreDir = existsSync(nestedCore) ? nestedCore : pkgDir('tesseract.js-core');
const langDir = join(pkgDir('@tesseract.js-data/ita'), '4.0.0_best_int');

mkdirSync(join(out, 'lang'), { recursive: true });

function copy(src, dst) {
  if (!existsSync(src)) throw new Error(`File mancante: ${src}`);
  if (existsSync(dst) && statSync(dst).size === statSync(src).size) return false;
  copyFileSync(src, dst);
  return true;
}

let copied = 0;
const files = [[join(tessDir, 'dist', 'worker.min.js'), join(out, 'worker.min.js')]];

// Il motore si usa solo in modalità LSTM: servono le varianti «-lstm» in forma .wasm.js
// (wasm incorporato nel file); tesseract.js sceglie da solo quella adatta al dispositivo
// (relaxedsimd, simd o base).
const coreFiles = readdirSync(coreDir).filter((f) => /^tesseract-core.*-lstm\.wasm\.js$/.test(f));
if (coreFiles.length === 0) throw new Error(`Nessun core LSTM in ${coreDir}`);
for (const f of coreFiles) files.push([join(coreDir, f), join(out, f)]);

files.push([join(langDir, 'ita.traineddata.gz'), join(out, 'lang', 'ita.traineddata.gz')]);

for (const [src, dst] of files) if (copy(src, dst)) copied++;
console.log(`tesseract: ${files.length} file in public/tesseract (${copied} copiati)`);
