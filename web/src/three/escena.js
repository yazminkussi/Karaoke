import * as THREE from 'three';

// Escena Three.js compartida por la pantalla principal.
// Camara perspectiva mirando al origen; helpers para ubicar cosas en el
// plano z=0 usando coordenadas normalizadas 0..1 (0,0 = arriba-izquierda).

export function crearEscena(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x05050c, 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05050c, 0.035);

  const DIST = 10;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 0, DIST);
  camera.lookAt(0, 0, 0);

  const clock = new THREE.Clock();
  const callbacks = [];
  const onFrame = (cb) => callbacks.push(cb);

  function tamVisible(z = 0) {
    const d = camera.position.z - z;
    const h = 2 * d * Math.tan((camera.fov * Math.PI) / 360);
    return { w: h * camera.aspect, h };
  }

  // normalizado (0..1, y hacia abajo) -> mundo en el plano z
  function normAMundo(nx, ny, z = 0, out = new THREE.Vector3()) {
    const { w, h } = tamVisible(z);
    return out.set((nx - 0.5) * w, (0.5 - ny) * h, z);
  }

  function resize() {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  let running = true;
  renderer.setAnimationLoop(() => {
    if (!running) return;
    const dt = clock.getDelta();
    const t = clock.elapsedTime;
    for (const cb of callbacks) cb(dt, t);
    renderer.render(scene, camera);
  });

  return {
    THREE,
    renderer,
    scene,
    camera,
    onFrame,
    normAMundo,
    tamVisible,
    resize,
    detener: () => (running = false),
  };
}
