import * as THREE from 'three';

// Esqueleto neon de las manos estilo "Just Dance": lineas de neon entre los 21
// puntos de MediaPipe, con el color cambiando todo el tiempo (dorado al
// confirmar) y un anillo de progreso para "pellizcar y mantener".
// Dibuja hasta 2 manos.

const CONEXIONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
const Z = 3; // plano donde flota la mano (mas cerca de la camara que el escenario)

export function crearManosNeon(escena) {
  const grupo = new THREE.Group();
  escena.scene.add(grupo);

  const anillo = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.62, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffcf40,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  anillo.visible = false;
  grupo.add(anillo);

  const manosGL = [crearManoGL(), crearManoGL()];
  manosGL.forEach((m) => grupo.add(m.grupo));

  const v = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let visibleHasta = 0;

  function crearManoGL() {
    const g = new THREE.Group();
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(CONEXIONES.length * 2 * 3), 3)
    );
    const lineMat = new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const lineas = new THREE.LineSegments(lineGeo, lineMat);

    const puntosGeo = new THREE.BufferGeometry();
    puntosGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(21 * 3), 3));
    const nodos = new THREE.Points(
      puntosGeo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.16,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    g.add(lineas, nodos);
    g.visible = false;
    return { grupo: g, lineGeo, lineMat, puntosGeo, mundo: Array.from({ length: 21 }, () => new THREE.Vector3()) };
  }

  function update(datos, _dt, t) {
    const manos = datos?.manos || [];
    if (manos.length) visibleHasta = performance.now() + 200;

    const hue = datos?.pinchProgress > 0 ? 0.125 : (t * 0.12) % 1;

    manosGL.forEach((mg, i) => {
      const mano = manos[i];
      mg.grupo.visible = !!mano;
      if (!mano) return;

      mano.puntos.forEach((p, k) => escena.normAMundo(p.x, p.y, Z + (p.z || 0) * 4, mg.mundo[k]));

      const lp = mg.lineGeo.attributes.position.array;
      CONEXIONES.forEach(([a, b], k) => {
        mg.mundo[a].toArray(lp, k * 6);
        mg.mundo[b].toArray(lp, k * 6 + 3);
      });
      mg.lineGeo.attributes.position.needsUpdate = true;

      const pp = mg.puntosGeo.attributes.position.array;
      mg.mundo.forEach((m, k) => m.toArray(pp, k * 3));
      mg.puntosGeo.attributes.position.needsUpdate = true;

      mg.lineMat.color.setHSL(hue, 1, 0.6);
      mg.lineMat.opacity = 0.7 + 0.3 * Math.sin(t * 6);
      mg.grupo.scale.setScalar(datos.pellizco ? 1.04 : 1);
    });

    // anillo de progreso del pellizco (sobre la primera mano)
    if (datos?.pinchProgress > 0 && manosGL[0].grupo.visible) {
      v.copy(manosGL[0].mundo[4]).add(tmp.copy(manosGL[0].mundo[8])).multiplyScalar(0.5);
      anillo.position.copy(v);
      anillo.visible = true;
      anillo.material.opacity = 0.25 + 0.75 * datos.pinchProgress;
      anillo.scale.setScalar(1 + (1 - datos.pinchProgress) * 0.9);
    } else {
      anillo.visible = false;
    }

    grupo.visible = performance.now() < visibleHasta;
  }

  return { grupo, update };
}
