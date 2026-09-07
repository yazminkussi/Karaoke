// Grabación del cantante (MVP): graba el track de VIDEO de la cámara + el track
// de AUDIO del micrófono, en paralelo, sin frenar nada. Devuelve un Blob webm.
//
// TODO (ver docs/investigacion-features.md #7):
//   - compositor: dibujar cámara espejada + esqueleto de manos + una línea de
//     letra + marca de agua en un canvas y grabar ESE canvas (captureStream).
//   - mezclar también la pista de la canción (Web Audio + MediaStreamDestination).
//   - subir el blob al server y servirlo por QR con el id de sesión.

export function crearGrabacion() {
  let rec = null;
  let chunks = [];
  let blob = null;

  function mimeSoportado() {
    const opciones = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    return opciones.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
  }

  // stream = el MediaStream de la cámara (con o sin audio)
  function iniciar(stream) {
    if (rec || !stream || !window.MediaRecorder) return;
    const vtrack = stream.getVideoTracks()[0];
    if (!vtrack) return;
    const atracks = stream.getAudioTracks();
    const grab = new MediaStream([vtrack, ...atracks]);

    chunks = [];
    blob = null;
    try {
      const mimeType = mimeSoportado();
      rec = new MediaRecorder(grab, mimeType ? { mimeType } : undefined);
    } catch (err) {
      console.warn('[grabacion] no pude crear MediaRecorder:', err.message);
      return;
    }
    rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    rec.start(1000);
  }

  function detener() {
    return new Promise((resolve) => {
      if (!rec || rec.state === 'inactive') return resolve(blob);
      rec.onstop = () => {
        blob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });
        rec = null;
        resolve(blob);
      };
      try { rec.stop(); } catch { resolve(blob); }
    });
  }

  return { iniciar, detener, get blob() { return blob; }, get grabando() { return rec?.state === 'recording'; } };
}
