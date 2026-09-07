// One Euro Filter (Casiez et al. 2012). Suaviza señales ruidosas con poca
// latencia: filtra fuerte cuando la mano está quieta, deja pasar cuando se
// mueve rápido. Se usa para que el esqueleto de la mano no tiemble.

function alpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

class Escalar {
  constructor(minCutoff, beta, dCutoff) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = 0;
  }
  filtrar(x, t) {
    if (this.xPrev == null) {
      this.xPrev = x;
      this.tPrev = t;
      return x;
    }
    const dt = Math.max(1e-3, (t - this.tPrev) / 1000);
    this.tPrev = t;

    const dx = (x - this.xPrev) / dt;
    const dxHat = this.dxPrev + alpha(this.dCutoff, dt) * (dx - this.dxPrev);
    this.dxPrev = dxHat;

    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const xHat = this.xPrev + alpha(cutoff, dt) * (x - this.xPrev);
    this.xPrev = xHat;
    return xHat;
  }
}

// Filtra un array de puntos {x,y,z}. Un filtro por coordenada por punto.
export function crearFiltroMano({ minCutoff = 1.4, beta = 0.03, dCutoff = 1.0 } = {}) {
  const fx = [];
  const fy = [];
  const fz = [];
  const nuevo = () => new Escalar(minCutoff, beta, dCutoff);
  return function filtrar(puntos, t) {
    return puntos.map((p, i) => {
      fx[i] ??= nuevo();
      fy[i] ??= nuevo();
      fz[i] ??= nuevo();
      return { x: fx[i].filtrar(p.x, t), y: fy[i].filtrar(p.y, t), z: fz[i].filtrar(p.z || 0, t) };
    });
  };
}
