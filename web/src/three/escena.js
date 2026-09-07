import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Escena Three.js de la pantalla principal, con bloom (el neon "brilla" de
// verdad) y tone mapping filmico para un look mas moderno.
// Camara perspectiva mirando al origen; helper para ubicar cosas en el plano
// z usando coordenadas normalizadas 0..1 (0,0 = arriba-izquierda).

export function crearEscena(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x05050c, 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0716, 0.03);

  const DIST = 10;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 0, DIST);
  camera.lookAt(0, 0, 0);

  // --- postproceso ---
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.45, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const clock = new THREE.Clock();
  const callbacks = [];
  const onFrame = (cb) => callbacks.push(cb);

  function tamVisible(z = 0) {
    const d = camera.position.z - z;
    const h = 2 * d * Math.tan((camera.fov * Math.PI) / 360);
    return { w: h * camera.aspect, h };
  }

  function normAMundo(nx, ny, z = 0, out = new THREE.Vector3()) {
    const { w, h } = tamVisible(z);
    return out.set((nx - 0.5) * w, (0.5 - ny) * h, z);
  }

  function resize() {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  let running = true;
  renderer.setAnimationLoop(() => {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    for (const cb of callbacks) cb(dt, t);
    composer.render();
  });

  return {
    THREE,
    renderer,
    scene,
    camera,
    bloom,
    onFrame,
    normAMundo,
    tamVisible,
    resize,
    detener: () => (running = false),
  };
}
