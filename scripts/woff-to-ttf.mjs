// Converte i file .woff (WOFF 1) di Nunito Sans in TTF per incorporarli nel PDF (jsPDF non legge WOFF).
// Solo node: la compressione dei WOFF 1 è zlib, quindi basta `inflateSync`.
// Uso: `node scripts/woff-to-ttf.mjs` (scrive in src/export/fonts/ i pesi 300, 400, 600 e OFL.txt).
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

// Converte un WOFF 1 (Buffer) nel TTF/OTF corrispondente (Buffer).
export function woffToTtf(woff) {
  if (woff.length < 44 || woff.toString('latin1', 0, 4) !== 'wOFF') throw new Error('Non è un file WOFF 1.');
  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);

  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const tag = woff.toString('latin1', o, o + 4);
    const offset = woff.readUInt32BE(o + 4);
    const compLength = woff.readUInt32BE(o + 8);
    const origLength = woff.readUInt32BE(o + 12);
    const checksum = woff.readUInt32BE(o + 16);
    const raw = woff.subarray(offset, offset + compLength);
    // Una tabella è compressa solo se la versione compressa è più corta dell'originale.
    const data = compLength < origLength ? inflateSync(raw) : raw;
    if (data.length !== origLength) throw new Error(`Tabella «${tag}» di lunghezza inattesa.`);
    tables.push({ tag, checksum, data });
  }
  // La directory dello sfnt va in ordine di tag.
  tables.sort((a, b) => (a.tag < b.tag ? -1 : 1));

  let pow = 1;
  let log = 0;
  while (pow * 2 <= numTables) {
    pow *= 2;
    log++;
  }
  const searchRange = pow * 16;
  const header = Buffer.alloc(12 + numTables * 16);
  header.writeUInt32BE(flavor, 0);
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(searchRange, 6);
  header.writeUInt16BE(log, 8);
  header.writeUInt16BE(numTables * 16 - searchRange, 10);

  const parts = [header];
  let offset = header.length;
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    header.write(t.tag, o, 4, 'latin1');
    header.writeUInt32BE(t.checksum, o + 4);
    header.writeUInt32BE(offset, o + 8);
    header.writeUInt32BE(t.data.length, o + 12);
    const pad = (4 - (t.data.length % 4)) % 4;
    parts.push(t.data, Buffer.alloc(pad));
    offset += t.data.length + pad;
  });
  return Buffer.concat(parts);
}

export const WEIGHTS = [
  [300, 'NunitoSans-Light.ttf'],
  [400, 'NunitoSans-Regular.ttf'],
  [600, 'NunitoSans-SemiBold.ttf'],
];

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const pkg = dirname(createRequire(join(root, 'package.json')).resolve('@fontsource/nunito-sans/package.json'));
  const out = join(root, 'src', 'export', 'fonts');
  mkdirSync(out, { recursive: true });
  for (const [weight, name] of WEIGHTS) {
    const ttf = woffToTtf(readFileSync(join(pkg, 'files', `nunito-sans-latin-${weight}-normal.woff`)));
    writeFileSync(join(out, name), ttf);
    console.log(`${name}: ${ttf.length} byte`);
  }
  copyFileSync(join(pkg, 'LICENSE'), join(out, 'OFL.txt'));
  console.log('OFL.txt copiato dal pacchetto');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
