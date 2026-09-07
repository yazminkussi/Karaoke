import * as THREE from 'three';

// Esqueleto de la mano estilo "Just Dance": lineas de neon entre los 21 puntos
// del modelo, con el color cambiando todo el tiempo (dorado al confirmar) y un
// anillo de progreso para el gesto de "pellizcar y mantener".

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

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(CONEXIONES.length * 2 * 3), 3)
  );
  const lineMat = new THREE.LineBasicMaterial({
    color: 0xff3ea5,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lineas = new THREE.LineSegments(lineGeo, lineMat);
  grupo.add(lineas);

  const puntosGeo = new THREE.BufferGeometry();
  puntosGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(21 * 3), 3)
  );
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
  grupo.add(nodos);

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

  const v = new THREE.Vector3();
  const mundo = new Array(21).fill(0).map(() => new THREE.Vector3());
  let visibleHasta = 0;

  function update(datos, _dt, t) {
    if (datos && datos.puntos) {
      visibleHasta = performance.now() + 200; // margen para parpadeos del tracker

      datos.puntos.forEach((p, i) => {
        escena.normAMundo(p.x, p.y, Z + p.z * 4, mundo[i]);
      });

      const lp = lineGeo.attributes.position.array;
      CONEXIONES.forEach(([a, b], k) => {
        mundo[a].toArray(lp, k * 6);
        mundo[b].toArray(lp, k * 6 + 3);
      });
      lineGeo.attributes.position.needsUpdate = true;

      const pp = puntosGeo.attributes.position.array;
      mundo.forEach((m, i) => m.toArray(pp, i * 3));
      puntosGeo.attributes.position.needsUpdate = true;

      // color: cicla; dorado cuando pellizcas
      const hue = datos.pinchProgress > 0 ? 0.125 : (t * 0.12) % 1;
      lineMat.color.setHSL(hue, 1, 0.6);
      lineMat.opacity = 0.7 + 0.3 * Math.sin(t * 6);
      lineas.scale.setScalar(datos.pellizco ? 1.04 : 1);

      // anillo de progreso en el punto medio pulgar-indice: se llena y se
      // cierra hacia adentro a medida que mantenes el pellizco
      if (datos.pinchProgress > 0) {
        v.copy(mundo[4]).add(mundo[8]).multiplyScalar(0.5);
        anillo.position.copy(v);
        anillo.visible = true;
        anillo.material.opacity = 0.25 + 0.75 * datos.pinchProgress;
        anillo.scale.setScalar(1 + (1 - datos.pinchProgress) * 0.9);
      } else {
        anillo.visible = false;
      }
    }
    const visible = performance.now() < visibleHasta;
    grupo.visible = visible;
  }

  return { grupo, update };
}
