// Reconocimiento de la cámara con MediaPipe Tasks Vision (Google).
//   - HandLandmarker  : manos (gestos) — con filtro One Euro para que no tiemble
//   - FaceDetector    : "hay una persona" (volver al inicio si se va)
//   - ImageSegmenter  : recorta a la persona (para que quede DELANTE de la UI)
//
// Assets desde /mediapipe/wasm, /models (web/scripts/preparar-mediapipe.mjs).

import {
  FilesetResolver,
  HandLandmarker,
  FaceDetector,
  ImageSegmenter,
} from '@mediapipe/tasks-vision';
import { crearFiltroMano } from './oneEuro.js';

const WASM = '/mediapipe/wasm';
const MODELO_MANOS = '/models/hand_landmarker.task';
const MODELO_CARA = '/models/blaze_face_short_range.tflite';
const MODELO_SEG = '/models/selfie_segmenter.tflite';

export async function crearReconocimiento({ video, numManos = 2, onResultado, onMascara }) {
  const fileset = await FilesetResolver.forVisionTasks(WASM);

  const handLandmarker = await crearCon(HandLandmarker, fileset, {
    baseOptions: { modelAssetPath: MODELO_MANOS },
    runningMode: 'VIDEO',
    numHands: numManos,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
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

  let segmenter = null;
  if (onMascara) {
    try {
      segmenter = await crearCon(ImageSegmenter, fileset, {
        baseOptions: { modelAssetPath: MODELO_SEG },
        runningMode: 'VIDEO',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    } catch (err) {
      console.warn('[vision] ImageSegmenter no disponible:', err.message);
    }
  }

  await esperarVideo(video);

  const filtros = new Map(); // lado ("Left"/"Right"/idx) -> filtro One Euro
  let ultimoT = -1;
  let corriendo = true;
  let hayPersona = false;
  let proximaCara = 0;

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

      if (faceDetector && ts >= proximaCara) {
        proximaCara = ts + 350;
        try {
          const f = faceDetector.detectForVideo(video, ts);
          hayPersona = (f?.detections?.length || 0) > 0;
        } catch {
          /* frames sueltos */
        }
      }

      if (segmenter) {
        try {
          segmenter.segmentForVideo(video, ts, (r) => {
            const m = r.confidenceMasks?.[0];
            if (m) onMascara(m.getAsFloat32Array(), m.width, m.height);
            r.close?.();
          });
        } catch {
          /* frames sueltos */
        }
      }

      const manos = normalizar(manosRes, filtros, ts);
      onResultado({ manos, hayPersona: hayPersona || manos.length > 0 });
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return {
    tieneSegmentacion: !!segmenter,
    detener: () => {
      corriendo = false;
      handLandmarker.close?.();
      faceDetector?.close?.();
      segmenter?.close?.();
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

// 21 puntos por mano, normalizados 0..1, ESPEJADOS en x, y SUAVIZADOS (One Euro).
function normalizar(res, filtros, ts) {
  const lms = res?.landmarks || [];
  return lms.map((pts, i) => {
    const lado = res.handednesses?.[i]?.[0]?.categoryName || String(i);
    if (!filtros.has(lado)) filtros.set(lado, crearFiltroMano());
    const crudos = pts.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
    return { puntos: filtros.get(lado)(crudos, ts), lado };
  });
}

function esperarVideo(video) {
  return new Promise((resolve) => {
    if (video.videoWidth) return resolve();
    video.addEventListener('loadeddata', () => resolve(), { once: true });
    setTimeout(resolve, 5000);
  });
}
