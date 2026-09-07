// Dibuja SOLO a la persona (recortada con la máscara de MediaPipe ImageSegmenter)
// en un canvas que va por encima de la UI -> la persona nunca queda tapada.
//
// setMascara(float32 0..1, w, h)  <- lo llama vision.js en cada frame
// dibujar()                       <- lo llama el rAF de pantalla.js

export function crearPersonaCanvas(canvas, video) {
  const ctx = canvas.getContext('2d');

  const mCanvas = document.createElement('canvas');
  const mCtx = mCanvas.getContext('2d');
  let mImg = null;
  let hayMascara = false;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  addEventListener('resize', resize);

  function setMascara(arr, w, h) {
    if (mCanvas.width !== w || mCanvas.height !== h) {
      mCanvas.width = w;
      mCanvas.height = h;
      mImg = mCtx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        mImg.data[i * 4] = mImg.data[i * 4 + 1] = mImg.data[i * 4 + 2] = 255;
      }
    }
    const d = mImg.data;
    for (let i = 0; i < arr.length; i++) {
      // gamma/umbral suave para bordes menos "gomosos"
      const a = arr[i];
      d[i * 4 + 3] = a > 0.2 ? Math.min(255, (a * 1.25) * 255) : 0;
    }
    mCtx.putImageData(mImg, 0, 0);
    hayMascara = true;
  }

  function dibujar() {
    if (!hayMascara || !video.videoWidth) return;
    const W = innerWidth;
    const H = innerHeight;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const s = Math.max(W / vw, H / vh);
    const dw = vw * s;
    const dh = vh * s;
    const ox = (W - dw) / 2;
    const oy = (H - dh) / 2;

    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(video, ox, oy, dw, dh);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mCanvas, ox, oy, dw, dh);
    ctx.globalCompositeOperation = 'source-over';
  }

  return { setMascara, dibujar, get lista() { return hayMascara; } };
}
