// Esqueleto de la mano dibujado como TINTA sobre papel: lineas negras finas y
// nodos magenta. Sin glow, sin additive, sin efectos de luz — estilo editorial.

const CONEXIONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

const TINTA = '#151515';
const ROSA = '#e0447f';

export function crearManosCanvas(canvas, video) {
  const ctx = canvas.getContext('2d');

  function ajustar() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  ajustar();
  addEventListener('resize', ajustar);

  // normalizado (0..1, ya espejado) -> pixeles de pantalla, replicando el
  // "object-fit: cover" del <video>
  function aPantalla(nx, ny) {
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    const W = innerWidth;
    const H = innerHeight;
    const escala = Math.max(W / vw, H / vh);
    const dw = vw * escala;
    const dh = vh * escala;
    const offX = (W - dw) / 2;
    const offY = (H - dh) / 2;
    // el video ya viene espejado por CSS y los puntos ya vienen espejados,
    // asi que mapeamos directo
    return [offX + nx * dw, offY + ny * dh];
  }

  function dibujar(datos) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (!datos || !datos.manos || !datos.manos.length) return;

    const g = Math.min(innerWidth, innerHeight);
    const grosor = Math.max(2, g * 0.005);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const mano of datos.manos) {
      const pts = mano.puntos.map((p) => aPantalla(p.x, p.y));

      ctx.strokeStyle = TINTA;
      ctx.lineWidth = datos.pellizco ? grosor * 1.4 : grosor;
      ctx.beginPath();
      for (const [a, b] of CONEXIONES) {
        ctx.moveTo(pts[a][0], pts[a][1]);
        ctx.lineTo(pts[b][0], pts[b][1]);
      }
      ctx.stroke();

      ctx.fillStyle = ROSA;
      for (const [x, y] of pts) {
        ctx.beginPath();
        ctx.arc(x, y, grosor * 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // progreso del pellizco: arco magenta sobre pulgar-indice de la 1a mano
    if (datos.pinchProgress > 0) {
      const p = datos.manos[0].puntos;
      const [x1, y1] = aPantalla(p[4].x, p[4].y);
      const [x2, y2] = aPantalla(p[8].x, p[8].y);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      ctx.strokeStyle = ROSA;
      ctx.lineWidth = Math.max(3, g * 0.008);
      ctx.beginPath();
      ctx.arc(cx, cy, g * 0.05, -Math.PI / 2, -Math.PI / 2 + datos.pinchProgress * Math.PI * 2);
      ctx.stroke();
    }
  }

  return { dibujar };
}
