// Reconocimiento de la camara con MediaPipe Tasks Vision (Google).
// Por ahora: HandLandmarker (manos). Mas adelante se pueden sumar
// PoseLandmarker (cuerpo neon) e ImageSegmenter (recortar el fondo).
//
// Los assets (wasm + modelo .task) se sirven desde /mediapipe/wasm y /models,
// que deja el script web/scripts/preparar-mediapipe.mjs (postinstall).

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const WASM = '/mediapipe/wasm';
const MODELO_MANOS = '/models/hand_landmarker.task';

export async function crearReconocimientoManos({ video, numManos = 2, onResultado }) {
  const fileset = await FilesetResolver.forVisionTasks(WASM);

  let handLandmarker;
  try {
    handLandmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODELO_MANOS, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: numManos,
    });
  } catch (err) {
    console.warn('[vision] GPU no disponible, reintento con CPU:', err.message);
    handLandmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODELO_MANOS, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numHands: numManos,
    });
  }

  await esperarVideo(video);

  let ultimoT = -1;
  let corriendo = true;

  function loop() {
    if (!corriendo) return;
    if (video.readyState >= 2 && video.currentTime !== ultimoT) {
      ultimoT = video.currentTime;
      let res;
      try {
        res = handLandmarker.detectForVideo(video, performance.now());
      } catch (err) {
        console.warn('[vision] detectForVideo:', err.message);
      }
      if (res) onResultado(normalizar(res));
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return {
    detener: () => {
      corriendo = false;
      handLandmarker.close?.();
    },
  };
}

// Devuelve las manos con los 21 puntos ya normalizados 0..1 y ESPEJADOS en x
// (para que coincidan con el <video> que se muestra en espejo), + la lateralidad.
function normalizar(res) {
  const manos = (res.landmarks || []).map((pts, i) => ({
    puntos: pts.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })),
    lado: res.handednesses?.[i]?.[0]?.categoryName || null, // "Left" / "Right"
  }));
  return { manos };
}

function esperarVideo(video) {
  return new Promise((resolve) => {
    if (video.videoWidth) return resolve();
    video.addEventListener('loadeddata', () => resolve(), { once: true });
    setTimeout(resolve, 5000);
  });
}
