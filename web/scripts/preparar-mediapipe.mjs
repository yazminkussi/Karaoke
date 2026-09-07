// Deja listos los assets que se sirven desde public/ y no van al repo:
//   - .wasm de @mediapipe/tasks-vision   -> public/mediapipe/wasm
//   - modelos .task / .tflite de MediaPipe -> public/models
//   - fuentes .ttf para el texto 3D (troika) -> public/fonts
//
// Corre solo con `npm install` (postinstall) o `npm -w web run prep:mediapipe`.

import { cp, mkdir, access, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const existe = (p) => access(p).then(() => true).catch(() => false);

async function bajar(url, destino, nombre) {
  if (await existe(destino)) {
    console.log(`[assets] ${nombre} ya esta`);
    return;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(destino));
    console.log(`[assets] ${nombre} descargado`);
  } catch (err) {
    console.warn(`[assets] no pude bajar ${nombre} (${err.message}).\n  ${url}`);
  }
}

// --- 1. WASM de MediaPipe ---------------------------------------
const wasmOrigen = join(dirname(require.resolve('@mediapipe/tasks-vision')), 'wasm');
const wasmDestino = join(raiz, 'public', 'mediapipe', 'wasm');
try {
  await mkdir(wasmDestino, { recursive: true });
  await cp(wasmOrigen, wasmDestino, { recursive: true });
  console.log('[assets] wasm de MediaPipe copiado');
} catch (err) {
  console.warn('[assets] no pude copiar el wasm:', err.message);
}

// --- 2. Modelos de MediaPipe -----------------------------------
const modelosDir = join(raiz, 'public', 'models');
await mkdir(modelosDir, { recursive: true });
const MODELOS = [
  {
    nombre: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  },
  {
    nombre: 'blaze_face_short_range.tflite',
    url: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
  },
  {
    nombre: 'selfie_segmenter.tflite',
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
  },
  // para mas adelante (pose neon estilo Just Dance):
  // { nombre: 'pose_landmarker_lite.task', url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task' },
];
for (const m of MODELOS) await bajar(m.url, join(modelosDir, m.nombre), m.nombre);

// --- 3. Fuentes (estetica editorial) — self-host para andar offline -----
const fuentesDir = join(raiz, 'public', 'fonts');
await mkdir(fuentesDir, { recursive: true });
const FUENTES = [
  {
    nombre: 'ArchivoBlack.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/archivoblack/ArchivoBlack-Regular.ttf',
  },
  {
    nombre: 'Archivo.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/Archivo%5Bwdth,wght%5D.ttf',
  },
  {
    nombre: 'Parisienne.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/parisienne/Parisienne-Regular.ttf',
  },
];
for (const f of FUENTES) await bajar(f.url, join(fuentesDir, f.nombre), f.nombre);

await writeFile(join(raiz, 'public', 'mediapipe', '.gitkeep'), '').catch(() => {});
