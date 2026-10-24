// Solo per vitest (alias in vite.config.ts): carica OpenCV.js con `require` e lo riesporta come
// `default` di un modulo ES, così vitest non vede il suo metodo `then` e non resta in attesa.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cv = require('@techstark/opencv-js/dist/opencv.js');

export default cv;
