// Pulizia dei bordi dopo il raddrizzamento: funzioni pure, senza OpenCV.

/**
 * Porta a bianco le aree scure collegate al bordo dell'immagine (fondo rimasto fuori dalla carta).
 * `gray` è un'immagine a un canale (0 = nero), modificata sul posto. Si considerano scuri i pixel sotto `threshold`;
 * una zona scura che tocca il bordo si cancella solo se copre almeno `minFraction` dell'immagine (le lettere
 * vicine al margine sono troppo piccole), allargata di `grow` pixel per prendere anche la sfumatura del bordo.
 * Restituisce il numero di pixel schiariti.
 */
export function clearEdgeDark(
  gray: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 215,
  minFraction = 0.002,
  grow = 5,
): number {
  const n = width * height;
  const seen = new Uint8Array(n); // 1 = scuro e collegato al bordo
  const stack = new Int32Array(n);
  let sp = 0;
  const push = (i: number) => {
    if (!seen[i] && gray[i] < threshold) {
      seen[i] = 1;
      stack[sp++] = i;
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  // Una zona alla volta, per giudicarne l'area: ogni seme avvia il suo riempimento.
  const region = new Uint8Array(n);
  let cleared = 0;
  const seeds: number[] = [];
  while (sp) seeds.push(stack[--sp]);
  const minArea = Math.max(1, Math.round(n * minFraction));
  const visited = new Uint8Array(n);
  for (const s of seeds) {
    if (visited[s]) continue;
    const list: number[] = [s];
    visited[s] = 1;
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      const x = i % width;
      const y = (i - x) / width;
      const nb = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1];
      for (const j of nb) {
        if (j >= 0 && !visited[j] && gray[j] < threshold) {
          visited[j] = 1;
          list.push(j);
        }
      }
    }
    if (list.length >= minArea) for (const i of list) region[i] = 1;
  }
  // Allargamento (dilatazione a quadrato, separabile) della zona da cancellare.
  let mask = region;
  for (let pass = 0; pass < grow; pass++) {
    const next = new Uint8Array(mask);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (mask[i]) continue;
        if ((x > 0 && mask[i - 1]) || (x < width - 1 && mask[i + 1]) || (y > 0 && mask[i - width]) || (y < height - 1 && mask[i + width])) next[i] = 1;
      }
    }
    mask = next;
  }
  for (let i = 0; i < n; i++) {
    if (mask[i]) {
      gray[i] = 255;
      cleared++;
    }
  }
  return cleared;
}

/** Ruota di `turns` quarti di giro orari un'immagine RGBA (pura, senza OpenCV). */
export function rotateQuarterTurns(
  img: { data: Uint8ClampedArray; width: number; height: number },
  turns: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const t = ((turns % 4) + 4) % 4;
  if (t === 0) return img;
  const { width: w, height: h, data } = img;
  const nw = t === 2 ? w : h;
  const nh = t === 2 ? h : w;
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx: number;
      let ny: number;
      if (t === 1) [nx, ny] = [h - 1 - y, x];
      else if (t === 2) [nx, ny] = [w - 1 - x, h - 1 - y];
      else [nx, ny] = [y, w - 1 - x];
      const s = (y * w + x) * 4;
      const d = (ny * nw + nx) * 4;
      out[d] = data[s];
      out[d + 1] = data[s + 1];
      out[d + 2] = data[s + 2];
      out[d + 3] = data[s + 3];
    }
  }
  return { data: out, width: nw, height: nh };
}
