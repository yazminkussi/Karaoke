// Gestos de la mano -> acciones del karaoke.
// Consume los landmarks normalizados (0..1, ya espejados) que emite
// web/src/lib/vision.js (MediaPipe HandLandmarker).
//
//   mano visible en ESPERANDO            -> presencia
//   mano arriba / abajo en SELECCIONANDO -> scroll
//   pellizco (pulgar + indice) sostenido -> confirmar
//   gesto de corazon (dos manos)         -> efecto (no cambia de estado)

const UMBRAL_PELLIZCO = 0.45; // dist pulgar-indice / tamano de la mano
const MS_PRESENCIA = 700;
const MS_CONFIRMAR = 1100;
const MS_SCROLL = 550;

export function crearGestos({ getEstado, onGesto, onManos }) {
  const st = {
    lastEstado: null,
    presenciaEnviada: false,
    manoDesde: 0,
    ultimoScroll: 0,
    pinchStart: 0,
    pinchProgress: 0,
    confirmEnviado: false,
  };

  // Se llama en cada frame de MediaPipe con { manos: [{puntos, lado}] }
  return function procesar({ manos }) {
    const estado = getEstado();
    if (estado !== st.lastEstado) {
      if (estado === 'ESPERANDO') st.presenciaEnviada = false;
      st.pinchStart = 0;
      st.pinchProgress = 0;
      st.confirmEnviado = false;
      st.lastEstado = estado;
    }

    const mano = manos[0];
    if (!mano) {
      st.manoDesde = 0;
      st.pinchStart = 0;
      st.pinchProgress = 0;
      onManos?.({ manos: [], cantidadManos: 0, corazon: false, pinchProgress: 0 });
      return;
    }

    const kp = mano.puntos;
    const ahora = performance.now();
    const tam = d(kp[0], kp[9]) || 1;
    const pellizco = d(kp[4], kp[8]) / tam < UMBRAL_PELLIZCO;
    const ny = kp[9].y; // 0 arriba .. 1 abajo
    const corazon = manos.length >= 2 && esCorazon(manos[0].puntos, manos[1].puntos);

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
      manos: manos.map((m) => ({ puntos: m.puntos })),
      cantidadManos: manos.length,
      corazon,
      pellizco,
      pinchProgress: st.pinchProgress,
      zonaScroll:
        estado === 'SELECCIONANDO'
          ? ny < 0.35
            ? 'arriba'
            : ny > 0.65
              ? 'abajo'
              : null
          : null,
    });
  };
}

function d(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Gesto de corazon: puntas de pulgares juntas y puntas de indices juntas
// (adaptado del pc.html del equipo, en coordenadas normalizadas 0..1).
function esCorazon(m1, m2) {
  const dPulgares = d(m1[4], m2[4]);
  const dIndices = d(m1[8], m2[8]);
  return dPulgares < 0.09 && dIndices < 0.09;
}
