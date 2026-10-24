// Inclinazione e orientamento del testo: funzioni pure su un'immagine binaria (1 = inchiostro), senza OpenCV.

export interface BinaryImage {
  /** Un byte per pixel: diverso da zero dove c'è inchiostro. */
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

/** Punteggio di nitidezza della proiezione: 1 se i pixel sono distribuiti in modo uniforme, alto se si concentrano in righe. */
function sharpness(xs: Int32Array, ys: Int32Array, n: number, deg: number, extent: number, along: number): number {
  const t = (deg * Math.PI) / 180;
  const sin = Math.sin(t);
  const cos = Math.cos(t);
  // `along` è l'estensione lungo le righe: l'inclinazione sposta la coordinata fino a along·sin(8°) ≈ 0,15·along.
  const shift = Math.ceil(along * 0.16) + 2;
  const bins = Math.ceil(extent) + 2 * shift + 4;
  const hist = new Float64Array(bins);
  for (let i = 0; i < n; i++) {
    // coordinata perpendicolare alla riga che scende verso destra di `deg` gradi
    hist[Math.floor(ys[i] * cos - xs[i] * sin + shift)]++;
  }
  let sum = 0;
  for (let i = 0; i < bins; i++) sum += hist[i] * hist[i];
  return (sum * extent) / (n * n);
}

function points(img: BinaryImage, transpose: boolean): { xs: Int32Array; ys: Int32Array; n: number } {
  const { data, width, height } = img;
  // Al più ~60000 punti: si salta un pixel ogni tanto sulle immagini molto cariche.
  let total = 0;
  for (let i = 0; i < data.length; i++) if (data[i]) total++;
  const stride = Math.max(1, Math.ceil(total / 60000));
  const xs = new Int32Array(Math.ceil(total / stride) + 1);
  const ys = new Int32Array(xs.length);
  let n = 0;
  let k = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!data[y * width + x]) continue;
      if (k++ % stride) continue;
      xs[n] = transpose ? y : x;
      ys[n] = transpose ? x : y;
      n++;
    }
  }
  return { xs, ys, n };
}

function bestAngle(xs: Int32Array, ys: Int32Array, n: number, extent: number, along: number, maxDeg: number) {
  let best = { angle: 0, score: -1 };
  for (let a = -maxDeg; a <= maxDeg + 1e-9; a += 0.5) {
    const s = sharpness(xs, ys, n, a, extent, along);
    if (s > best.score) best = { angle: a, score: s };
  }
  const centre = best.angle;
  for (let a = centre - 0.5; a <= centre + 0.5 + 1e-9; a += 0.1) {
    const s = sharpness(xs, ys, n, a, extent, along);
    if (s > best.score) best = { angle: a, score: s };
  }
  return { angle: Math.round(best.angle * 10) / 10, score: best.score };
}

/**
 * Inclinazione delle righe di testo in gradi, tra -maxDeg e +maxDeg: positiva se le righe scendono verso destra
 * (nell'immagine con l'asse y verso il basso). Per raddrizzare si ruota l'immagine in senso antiorario di questo angolo.
 * `score` dice quanto il testo è «a righe»: vicino a 1 vuol dire che non si riconoscono righe.
 */
export function estimateSkew(img: BinaryImage, maxDeg = 8): { angle: number; score: number } {
  const { xs, ys, n } = points(img, false);
  if (n < 50) return { angle: 0, score: 1 };
  return bestAngle(xs, ys, n, img.height, img.width, maxDeg);
}

/**
 * Vero se le righe di testo sono verticali (immagine ruotata di 90°): le colonne risultano molto più «a righe»
 * delle righe. Non distingue 90° da 270°.
 */
export function isTextVertical(img: BinaryImage, maxDeg = 8): boolean {
  const h = points(img, false);
  if (h.n < 50) return false;
  const v = points(img, true);
  const rows = bestAngle(h.xs, h.ys, h.n, img.height, img.width, maxDeg).score;
  const cols = bestAngle(v.xs, v.ys, v.n, img.width, img.height, maxDeg).score;
  return cols > rows * 1.15;
}
