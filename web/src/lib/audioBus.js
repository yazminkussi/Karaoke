// Un único grafo de Web Audio para toda la app (createMediaElementSource se
// puede llamar UNA sola vez por elemento):
//   <audio de la canción> --> parlantes  + analizador (energía)  + grabación
//   micrófono             -->                                      grabación
//
// energia()          -> 0..1 para el latido de la estrella
// streamGrabacion()  -> MediaStream de audio (canción + voz) para MediaRecorder
// desbloquear()      -> resume() del AudioContext (necesita un gesto del usuario)

export function crearAudioBus(audioEl) {
  const AC = window.AudioContext || window.webkitAudioContext;
  let actx = null;
  let analyser = null;
  let datos = null;
  let salidaGrab = null;
  let micConectado = false;
  let energiaSuave = 0;

  if (AC) {
    actx = new AC();
    const src = actx.createMediaElementSource(audioEl);
    analyser = actx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.85;
    datos = new Uint8Array(analyser.frequencyBinCount);
    salidaGrab = actx.createMediaStreamDestination();

    src.connect(analyser);
    src.connect(actx.destination); // suena por los parlantes
    src.connect(salidaGrab); // y entra a la grabación
  }

  const desbloquear = () => actx?.resume?.();
  addEventListener('pointerdown', desbloquear);
  addEventListener('keydown', desbloquear);

  function agregarMic(stream) {
    if (!actx || micConectado || !stream?.getAudioTracks?.().length) return;
    try {
      const m = actx.createMediaStreamSource(stream);
      m.connect(salidaGrab); // el mic SOLO va a la grabación (no a los parlantes -> sin acople)
      micConectado = true;
    } catch (e) {
      console.warn('[audioBus] mic:', e.message);
    }
  }

  function tick() {
    let e = 0;
    if (analyser) {
      analyser.getByteFrequencyData(datos);
      for (let i = 0; i < datos.length; i++) e += datos[i];
      e = e / datos.length / 255;
    }
    energiaSuave += (e - energiaSuave) * 0.15;
    return energiaSuave;
  }

  return {
    tick,
    agregarMic,
    desbloquear,
    streamGrabacion: () => salidaGrab?.stream || null,
    get contexto() { return actx; },
  };
}
