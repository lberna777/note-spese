import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { detectDocument } from '../scan/detect';
import {
  clampPoint,
  fallbackQuad,
  isConvex,
  type Point,
  type Quad,
} from '../scan/geometry';
import { canvasToBlob, fullImage, loadWorkCanvas, smallImage } from '../scan/photo';
import { rotateQuarterTurns } from '../scan/cleanup';
import { encodeJpeg, warpDocument, type ScanFilter, type WarpResult } from '../scan/warp';
import './scan.css';

// Schermata «Ritaglia» e anteprima della scansione (docs/design.md, «Scansione dello scontrino»).
// Telefono: a tutto schermo. Computer: finestra centrata. Se OpenCV non parte o l'elaborazione fallisce,
// si prosegue con la foto originale e un avviso.

const CORNER_NAMES = ['alto a sinistra', 'alto a destra', 'basso a destra', 'basso a sinistra'];
const PAD = 28; // spazio attorno alla foto nel riquadro, per le maniglie vicino ai bordi
const LOUPE = 112;
const LOUPE_ZOOM = 3;

type Phase = 'loading' | 'crop' | 'working' | 'preview';

export interface ScanScreenProps {
  file: Blob;
  /** Immagine da leggere; `notice` è un avviso da mostrare nel modulo (OpenCV non disponibile, ecc.). */
  onDone: (image: Blob, notice?: string) => void;
  onCancel: () => void;
}

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 30));

export function ScanScreen({ file, onDone, onCancel }: ScanScreenProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [status, setStatus] = useState('Preparo la foto…');
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 }); // dimensioni dell'immagine di lavoro
  const [corners, setCorners] = useState<Quad | null>(null);
  const [found, setFound] = useState(true);
  const [filter, setFilter] = useState<ScanFilter>('documento');
  const [turns, setTurns] = useState(0); // quarti di giro orari aggiunti con «Ruota»
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<{ idx: number; touch: boolean } | null>(null);
  const [timing, setTiming] = useState({ detect: 0, warp: 0 });

  const work = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  // Immagini raddrizzate per filtro (senza rotazione manuale) e JPEG già pronti per filtro e rotazione.
  const bases = useRef(new Map<ScanFilter, WarpResult>());
  const results = useRef(new Map<string, { blob: Blob; url: string }>());
  const alive = useRef(true);

  // Errore di OpenCV o della foto: si usa la foto com'è.
  const fallBack = (why: unknown) => {
    if (!alive.current) return;
    const msg = String((why as Error)?.message ?? why);
    onDone(file, `Scansione non riuscita (${msg}): uso la foto così com'è.`);
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const r of results.current.values()) URL.revokeObjectURL(r.url);
      results.current.clear();
    };
  }, []);

  // Carica la foto e cerca gli angoli.
  useEffect(() => {
    (async () => {
      try {
        const canvas = await loadWorkCanvas(file);
        if (!alive.current) return;
        work.current = canvas;
        setSize({ w: canvas.width, h: canvas.height });
        setImgUrl(URL.createObjectURL(await canvasToBlob(canvas, 0.9)));
        setStatus('Cerco i bordi dello scontrino…');
        await nextFrame();
        const t0 = performance.now();
        const res = await detectDocument(smallImage(canvas), { width: canvas.width, height: canvas.height });
        if (!alive.current) return;
        setTiming((t) => ({ ...t, detect: Math.round(performance.now() - t0) }));
        setCorners(res.corners);
        setFound(res.found);
        setPhase('crop');
      } catch (err) {
        fallBack(err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  useEffect(() => {
    return () => {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
    };
  }, [imgUrl]);

  // Dimensioni del riquadro della foto.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const read = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Foto adattata al riquadro (contain) e conversioni immagine <-> riquadro.
  const availW = Math.max(1, stage.w - PAD * 2);
  const availH = Math.max(1, stage.h - PAD * 2);
  const scale = size.w ? Math.min(availW / size.w, availH / size.h) : 1;
  const ox = (stage.w - size.w * scale) / 2;
  const oy = (stage.h - size.h * scale) / 2;
  const toStage = (p: Point): Point => ({ x: ox + p.x * scale, y: oy + p.y * scale });

  const setCorner = (idx: number, p: Point) => {
    setCorners((c) => {
      if (!c) return c;
      const next = [...c] as Quad;
      next[idx] = clampPoint(p, size.w, size.h);
      return next;
    });
  };

  const onPointerDown = (idx: number) => (e: PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ idx, touch: e.pointerType !== 'mouse' });
  };
  const onPointerMove = (idx: number) => (e: PointerEvent) => {
    if (!drag || drag.idx !== idx || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    setCorner(idx, { x: (e.clientX - r.left - ox) / scale, y: (e.clientY - r.top - oy) / scale });
  };
  const onPointerUp = () => setDrag(null);
  const onKeyDown = (idx: number) => (e: KeyboardEvent) => {
    if (!corners) return;
    const step = (e.shiftKey ? 10 : 1) / scale;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = d[e.key];
    if (!m) return;
    e.preventDefault();
    setCorner(idx, { x: corners[idx].x + m[0], y: corners[idx].y + m[1] });
  };

  // Lente d'ingrandimento: ridisegnata a ogni spostamento dell'angolo trascinato.
  useEffect(() => {
    if (!drag?.touch || !corners || !work.current || !loupeRef.current) return;
    const ctx = loupeRef.current.getContext('2d');
    if (!ctx) return;
    const c = corners[drag.idx];
    const s = LOUPE / (scale * LOUPE_ZOOM); // lato della zona di foto ingrandita, in pixel dell'immagine
    ctx.clearRect(0, 0, LOUPE, LOUPE);
    ctx.drawImage(work.current, c.x - s / 2, c.y - s / 2, s, s, 0, 0, LOUPE, LOUPE);
  }, [drag, corners, scale]);

  const valid = corners ? isConvex(corners) : false;

  const clearResults = () => {
    for (const r of results.current.values()) URL.revokeObjectURL(r.url);
    results.current.clear();
    bases.current.clear();
  };

  const makeResult = async (quad: Quad, f: ScanFilter, t: number): Promise<{ blob: Blob; url: string }> => {
    const key = `${f}:${t}`;
    const cached = results.current.get(key);
    if (cached) return cached;
    const t0 = performance.now();
    let base = bases.current.get(f);
    if (!base) {
      base = await warpDocument(fullImage(work.current!), quad, f);
      bases.current.set(f, base);
    }
    const blob = await encodeJpeg(rotateQuarterTurns(base, t));
    const entry = { blob, url: URL.createObjectURL(blob) };
    results.current.set(key, entry);
    setTiming((x) => ({ ...x, warp: Math.round(performance.now() - t0) }));
    return entry;
  };

  // Mostra l'anteprima per filtro e rotazione dati; in caso d'errore si ripiega sulla foto originale.
  const show = async (quad: Quad, f: ScanFilter, t: number, message: string) => {
    setPhase('working');
    setStatus(message);
    await nextFrame();
    try {
      const e = await makeResult(quad, f, t);
      if (!alive.current) return;
      setResultUrl(e.url);
      setPhase('preview');
    } catch (err) {
      fallBack(err);
    }
  };

  const goPreview = (quad: Quad) => {
    setCorners(quad);
    // gli angoli sono cambiati: le anteprime precedenti non valgono più
    clearResults();
    setTurns(0);
    void show(quad, filter, 0, 'Raddrizzo lo scontrino…');
  };

  const changeFilter = (f: ScanFilter) => {
    if (f === filter || phase !== 'preview' || !corners) return;
    setFilter(f);
    void show(corners, f, turns, 'Applico il filtro…');
  };

  const rotate = () => {
    if (phase !== 'preview' || !corners) return;
    const t = (turns + 1) % 4;
    setTurns(t);
    void show(corners, filter, t, 'Ruoto…');
  };

  const useScan = () => {
    const e = results.current.get(`${filter}:${turns}`);
    if (e) onDone(e.blob);
  };

  const backToCrop = () => {
    setResultUrl(null);
    setPhase('crop');
  };

  const showQuad = corners && (phase === 'crop' || phase === 'working') && size.w > 0;
  const poly = corners ? corners.map(toStage) : [];
  const points = poly.map((p) => `${p.x},${p.y}`).join(' ');

  // Posizione della lente: sopra l'angolo; se non c'è spazio, sotto.
  let loupeStyle: JSX.CSSProperties | undefined;
  if (drag?.touch && corners) {
    const p = toStage(corners[drag.idx]);
    const above = p.y - LOUPE - 36 >= 0;
    loupeStyle = {
      left: `${Math.min(Math.max(p.x - LOUPE / 2, 4), stage.w - LOUPE - 4)}px`,
      top: `${above ? p.y - LOUPE - 36 : p.y + 36}px`,
    };
  }

  const title = phase === 'preview' ? 'Scansione' : 'Ritaglia';

  return (
    <div
      class="scan-backdrop"
      data-phase={phase}
      data-found={found ? '1' : '0'}
      data-detect-ms={timing.detect}
      data-warp-ms={timing.warp}
      data-corners={corners ? JSON.stringify(corners.map((c) => [Math.round(c.x), Math.round(c.y)])) : undefined}
      data-size={size.w ? `${size.w}x${size.h}` : undefined}
    >
      <div class="scan-window" role="dialog" aria-modal="true" aria-label="Scansione dello scontrino">
        <header class="scan-head">
          <h1 class="lbl lbl-accent">{title}</h1>
        </header>

        <div class="scan-stage" ref={stageRef}>
          {phase !== 'preview' && imgUrl ? (
            <img
              class="scan-img"
              src={imgUrl}
              alt="Foto dello scontrino"
              draggable={false}
              style={{ left: `${ox}px`, top: `${oy}px`, width: `${size.w * scale}px`, height: `${size.h * scale}px` }}
            />
          ) : null}
          {phase === 'preview' && resultUrl ? (
            <img
              class="scan-result"
              src={resultUrl}
              alt={`Anteprima della scansione, filtro ${filter === 'documento' ? 'Documento' : 'Colore'}`}
              draggable={false}
            />
          ) : null}

          {showQuad ? (
            <svg class="scan-svg" width={stage.w} height={stage.h} aria-hidden="true">
              <polygon class="scan-quad-halo" points={points} />
              <polygon class="scan-quad" points={points} />
            </svg>
          ) : null}
          {phase === 'crop' && corners
            ? corners.map((c, i) => {
                const p = toStage(c);
                return (
                  <button
                    key={i}
                    type="button"
                    class={`scan-handle${drag?.idx === i ? ' on' : ''}`}
                    style={{ left: `${p.x}px`, top: `${p.y}px` }}
                    aria-label={`Angolo ${CORNER_NAMES[i]}`}
                    onPointerDown={onPointerDown(i)}
                    onPointerMove={onPointerMove(i)}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onKeyDown={onKeyDown(i)}
                  >
                    <i />
                  </button>
                );
              })
            : null}
          {drag?.touch ? (
            <div class="scan-loupe" style={loupeStyle} aria-hidden="true">
              <canvas ref={loupeRef} width={LOUPE} height={LOUPE} />
            </div>
          ) : null}
          {phase === 'loading' || phase === 'working' ? (
            <p class="scan-busy" role="status">{status}</p>
          ) : null}
        </div>

        {phase === 'crop' ? (
          <>
            <p class={`scan-hint${valid ? '' : ' warn'}`} role={valid ? undefined : 'alert'}>
              {!valid
                ? 'Gli angoli si incrociano: sistemali per proseguire.'
                : found
                  ? 'Trascina gli angoli per far combaciare il riquadro con lo scontrino.'
                  : 'Non ho trovato i bordi: trascina gli angoli sullo scontrino.'}
            </p>
            <footer class="scan-bar">
              <button type="button" class="btn-plain" onClick={onCancel}>Rifai</button>
              <button
                type="button"
                class="btn-out"
                onClick={() => goPreview(fallbackQuad(size.w, size.h, 0))}
              >
                Usa tutta la foto
              </button>
              <button type="button" class="btn-fill scan-go" disabled={!valid} onClick={() => corners && goPreview(corners)}>
                Continua
              </button>
            </footer>
          </>
        ) : null}

        {phase === 'preview' ? (
          <>
            <div class="scan-seg" role="radiogroup" aria-label="Filtro">
              {(['documento', 'colore'] as ScanFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={filter === f}
                  class={filter === f ? 'on' : ''}
                  onClick={() => changeFilter(f)}
                >
                  {f === 'documento' ? 'Documento' : 'Colore'}
                </button>
              ))}
            </div>
            <footer class="scan-bar">
              <button type="button" class="btn-plain" onClick={backToCrop}>Indietro</button>
              <button type="button" class="btn-out" onClick={rotate}>Ruota</button>
              <button type="button" class="btn-fill scan-go" onClick={useScan}>Usa scansione</button>
            </footer>
          </>
        ) : null}

        {phase === 'loading' || phase === 'working' ? (
          <footer class="scan-bar two">
            <button type="button" class="btn-plain" onClick={onCancel}>Annulla</button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
