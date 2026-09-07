// Control por manos con ml5.js (handPose = MediaPipe Hands).
//
// Sobre el mismo <video> de la camara:
//   - saca los 21 puntos de la mano, normalizados 0..1 y ya espejados
//     (para que coincidan con el video, que se muestra en espejo)
//   - traduce gestos a las MISMAS acciones que manda el celular:
//       mano visible en ESPERANDO            -> presencia
//       mano arriba / abajo en SELECCIONANDO -> scroll
//       pellizco (pulgar+indice) sostenido   -> confirmar
//
// El dibujo del esqueleto neon lo hace Three.js (three/manosNeon.js) a partir
// de los landmarks que emite este modulo. Si ml5 no carga, no rompe nada.

const UMBRAL_PELLIZCO = 0.45;
const MS_PRESENCIA = 700;
const MS_CONFIRMAR = 1100;
const MS_SCROLL = 550;

export async function iniciarManos({ video, getEstado, onGesto, onManos }) {
  if (typeof window.ml5 === 'undefined') {
    console.warn('ml5 no cargo -> control por manos deshabilitado');
    return { activo: false };
  }
  await esperarVideoListo(video);

  const st = {
    lastEstado: null,
    presenciaEnviada: false,
    manoDesde: 0,
    ultimoScroll: 0,
    pinchStart: 0,
    pinchProgress: 0,
    confirmEnviado: false,
  };

  const handPose = window.ml5.handPose({ flipped: false, maxHands: 1 }, () => {
    handPose.detectStart(video, (resultados) => {
      const mano = (resultados || [])[0];
      procesar(mano, video, { getEstado, onGesto, onManos, st });
    });
  });

  return { activo: true };
}

function procesar(mano, video, { getEstado, onGesto, onManos, st }) {
  const estado = getEstado();
  if (estado !== st.lastEstado) {
    if (estado === 'ESPERANDO') st.presenciaEnviada = false;
    st.pinchStart = 0;
    st.pinchProgress = 0;
    st.confirmEnviado = false;
    st.lastEstado = estado;
  }

  if (!mano) {
    st.manoDesde = 0;
    st.pinchStart = 0;
    st.pinchProgress = 0;
    onManos?.(null);
    return;
  }

  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const kp = mano.keypoints;
  const ahora = performance.now();

  const tam = Math.hypot(kp[0].x - kp[9].x, kp[0].y - kp[9].y) || 1;
  const pellizco =
    Math.hypot(kp[4].x - kp[8].x, kp[4].y - kp[8].y) / tam < UMBRAL_PELLIZCO;
  const ny = kp[9].y / vh; // 0 arriba .. 1 abajo

  // landmarks normalizados y espejados (x: 1 - x/vw)
  const puntos = kp.map((k) => ({
    x: 1 - k.x / vw,
    y: k.y / vh,
    z: (k.z || 0) / vw,
  }));

  if (estado === 'ESPERANDO') {
    if (!st.manoDesde) st.manoDesde = ahora;
    if (!st.presenciaEnviada && ahora - st.manoDesde > MS_PRESENCIA) {
      st.presenciaEnviada = true;
      onGesto({ tipo: 'presencia' });
    }
  } else if (estado === 'SELECCIONANDO') {
    const zona = ny < 0.35 ? 'arriba' : ny > 0.65 ? 'abajo' : null;
    if (zona && ahora - st.ultimoScroll > MS_SCROLL) {
      st.ultimoScroll = ahora;
      onGesto({ tipo: 'scroll', direccion: zona });
    }
    if (pellizco) {
      if (!st.pinchStart) st.pinchStart = ahora;
      st.pinchProgress = Math.min(1, (ahora - st.pinchStart) / MS_CONFIRMAR);
      if (st.pinchProgress >= 1 && !st.confirmEnviado) {
        st.confirmEnviado = true;
        onGesto({ tipo: 'confirmar' });
      }
    } else {
      st.pinchStart = 0;
      st.pinchProgress = 0;
      st.confirmEnviado = false;
    }
  }

  onManos?.({
    puntos,
    pellizco,
    pinchProgress: st.pinchProgress,
    zonaScroll: estado === 'SELECCIONANDO' ? (ny < 0.35 ? 'arriba' : ny > 0.65 ? 'abajo' : null) : null,
  });
}

function esperarVideoListo(video) {
  return new Promise((resolve) => {
    if (video.videoWidth) return resolve();
    video.addEventListener('loadeddata', () => resolve(), { once: true });
    setTimeout(resolve, 4000);
  });
}
