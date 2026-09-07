// Reconocimiento de la camara con MediaPipe Tasks Vision (Google).
//   - HandLandmarker : manos (gestos)
//   - FaceDetector   : "hay una persona" (para volver al inicio si se va)
//
// Assets servidos desde /mediapipe/wasm, /models (los deja
// web/scripts/preparar-mediapipe.mjs en el postinstall).

import { FilesetResolver, HandLandmarker, FaceDetector } from '@mediapipe/tasks-vision';

const WASM = '/mediapipe/wasm';
const MODELO_MANOS = '/models/hand_landmarker.task';
const MODELO_CARA = '/models/blaze_face_short_range.tflite';

export async function crearReconocimiento({ video, numManos = 2, onResultado }) {
  const fileset = await FilesetResolver.forVisionTasks(WASM);

  const handLandmarker = await crearCon(HandLandmarker, fileset, {
    baseOptions: { modelAssetPath: MODELO_MANOS },
    runningMode: 'VIDEO',
    numHands: numManos,
  });

  let faceDetector = null;
  try {
    faceDetector = await crearCon(FaceDetector, fileset, {
      baseOptions: { modelAssetPath: MODELO_CARA },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.4,
    });
  } catch (err) {
    console.warn('[vision] FaceDetector no disponible:', err.message);
  }

  await esperarVideo(video);

  let ultimoT = -1;
  let corriendo = true;
  let hayPersona = false;

  function loop() {
    if (!corriendo) return;
    if (video.readyState >= 2 && video.currentTime !== ultimoT) {
      ultimoT = video.currentTime;
      const ts = performance.now();

      let manosRes;
      try {
        manosRes = handLandmarker.detectForVideo(video, ts);
      } catch (err) {
        console.warn('[vision] manos:', err.message);
      }

      if (faceDetector) {
        try {
          const f = faceDetector.detectForVideo(video, ts);
          hayPersona = (f?.detections?.length || 0) > 0;
        } catch {
          /* ignora frames sueltos */
        }
      }

      // si hay manos, obviamente hay persona
      const manos = normalizarManos(manosRes);
      onResultado({ manos, hayPersona: hayPersona || manos.length > 0 });
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return {
    detener: () => {
      corriendo = false;
      handLandmarker.close?.();
      faceDetector?.close?.();
    },
  };
}

async function crearCon(Clase, fileset, opciones) {
  try {
    return await Clase.createFromOptions(fileset, {
      ...opciones,
      baseOptions: { ...opciones.baseOptions, delegate: 'GPU' },
    });
  } catch (err) {
    console.warn(`[vision] ${Clase.name} sin GPU, uso CPU:`, err.message);
    return await Clase.createFromOptions(fileset, {
      ...opciones,
      baseOptions: { ...opciones.baseOptions, delegate: 'CPU' },
    });
  }
}

// 21 puntos por mano, normalizados 0..1 y ESPEJADOS en x (el video se ve en espejo).
function normalizarManos(res) {
  return (res?.landmarks || []).map((pts, i) => ({
    puntos: pts.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })),
    lado: res.handednesses?.[i]?.[0]?.categoryName || null,
  }));
}

function esperarVideo(video) {
  return new Promise((resolve) => {
    if (video.videoWidth) return resolve();
    video.addEventListener('loadeddata', () => resolve(), { once: true });
    setTimeout(resolve, 5000);
  });
}
