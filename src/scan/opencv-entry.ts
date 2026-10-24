// Unico punto che importa OpenCV.js; si carica con import dinamico da cv.ts. Si passa da qui perché
// il modulo di OpenCV ha un metodo `then`: importarlo direttamente con `import()` lo farebbe scambiare
// per una promessa, e `await` non finirebbe mai. Qui l'oggetto esce dentro un involucro `{ cv }`.
import cv from '@techstark/opencv-js';

export function getCv(): { cv: typeof cv } {
  return { cv };
}
