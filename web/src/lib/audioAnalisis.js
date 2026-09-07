// Analizador de audio minimo: solo devuelve una "energia" 0..1 y las bandas,
// para que el poster reaccione sutilmente a la musica (sin efectos de luz).

export function crearAnalisis(audioEl) {
  let analyser = null;
  let datos = null;
  let actx = null;
  let energiaSuave = 0;

  function conectar() {
    if (actx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    const src = actx.createMediaElementSource(audioEl);
    analyser = actx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.85;
    datos = new Uint8Array(analyser.frequencyBinCount);
    src.connect(analyser);
    analyser.connect(actx.destination);
  }
  // los navegadores exigen un gesto para arrancar el audio
  const arrancar = () => { conectar(); actx?.resume(); };
  addEventListener('pointerdown', arrancar, { once: true });
  addEventListener('keydown', arrancar, { once: true });

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

  return { tick, conectar, get bandas() { return datos; } };
}
