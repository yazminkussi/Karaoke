// Graba un MediaStream de video (el canvas compuesto: cámara + letra) + un
// MediaStream de audio (canción + voz, mezclados por audioBus) -> Blob webm.
// El server lo pasa a .mp4 con ffmpeg.

export function crearGrabacion() {
  let rec = null;
  let chunks = [];
  let blob = null;

  function mimeSoportado() {
    return (
      ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(
        (m) => window.MediaRecorder?.isTypeSupported?.(m)
      ) || ''
    );
  }

  function iniciar(videoStream, audioStream) {
    if (rec || !window.MediaRecorder) return;
    const vt = videoStream?.getVideoTracks?.()[0];
    if (!vt) return;
    const at = audioStream?.getAudioTracks?.() || [];
    const grab = new MediaStream([vt, ...at]);

    chunks = [];
    blob = null;
    try {
      const mimeType = mimeSoportado();
      rec = new MediaRecorder(grab, mimeType ? { mimeType, videoBitsPerSecond: 4_000_000 } : undefined);
    } catch (err) {
      console.warn('[grabacion] MediaRecorder:', err.message);
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

  return {
    iniciar,
    detener,
    get blob() { return blob; },
    get grabando() { return rec?.state === 'recording'; },
  };
}
