// Deja MediaPipe Tasks Vision listo para funcionar OFFLINE:
//   - copia los .wasm de @mediapipe/tasks-vision a web/public/mediapipe/wasm
//   - descarga los modelos .task a web/public/models (si faltan)
//
// Corre solo con `npm install` (postinstall) o `npm -w web run prep:mediapipe`.
// Los assets quedan en public/ (gitignored) para no meter binarios al repo.

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

// --- 1. WASM -------------------------------------------------------
const wasmOrigen = join(dirname(require.resolve('@mediapipe/tasks-vision')), 'wasm');
const wasmDestino = join(raiz, 'public', 'mediapipe', 'wasm');
try {
  await mkdir(wasmDestino, { recursive: true });
  await cp(wasmOrigen, wasmDestino, { recursive: true });
  console.log('[mediapipe] wasm copiado a public/mediapipe/wasm');
} catch (err) {
  console.warn('[mediapipe] no pude copiar el wasm:', err.message);
}

// --- 2. Modelos ---------------------------------------------------
const MODELOS = [
  {
    nombre: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  },
  // para mas adelante (pose neon estilo Just Dance / recorte de fondo):
  // { nombre: 'pose_landmarker_lite.task', url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task' },
  // { nombre: 'selfie_segmenter.tflite', url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite' },
];

const modelosDir = join(raiz, 'public', 'models');
await mkdir(modelosDir, { recursive: true });

for (const m of MODELOS) {
  const destino = join(modelosDir, m.nombre);
  if (await existe(destino)) {
    console.log(`[mediapipe] ${m.nombre} ya esta`);
    continue;
  }
  try {
    const res = await fetch(m.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(destino));
    console.log(`[mediapipe] ${m.nombre} descargado`);
  } catch (err) {
    console.warn(
      `[mediapipe] no pude bajar ${m.nombre} (${err.message}). ` +
        `Descargalo a mano en web/public/models/ desde:\n  ${m.url}`
    );
  }
}

// marcador para .gitkeep del dir
await writeFile(join(raiz, 'public', 'mediapipe', '.gitkeep'), '').catch(() => {});
