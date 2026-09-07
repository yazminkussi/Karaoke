import * as THREE from 'three';

// Analizador de audio + visual reactivo (aro de barras que laten con la musica).
// Devuelve tambien energia() 0..1 para que el resto del escenario reaccione.

export function crearAudioReactivo(scene, audioEl) {
  let analyser = null;
  let datos = null;
  let actx = null;

  function conectar() {
    if (actx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    const src = actx.createMediaElementSource(audioEl);
    analyser = actx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.8;
    datos = new Uint8Array(analyser.frequencyBinCount);
    src.connect(analyser);
    analyser.connect(actx.destination);
  }
  // los navegadores exigen un gesto para arrancar el audio
  addEventListener('pointerdown', () => { conectar(); actx?.resume(); }, { once: true });
  addEventListener('keydown', () => { conectar(); actx?.resume(); }, { once: true });

  const N = 48;
  const aro = new THREE.Group();
  aro.position.set(0, 0.5, -2);
  scene.add(aro);
  const barras = [];
  const geo = new THREE.BoxGeometry(0.14, 1, 0.14);
  for (let i = 0; i < N; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const m = new THREE.Mesh(geo, mat);
    const ang = (i / N) * Math.PI * 2;
    const R = 4.4;
    m.position.set(Math.cos(ang) * R, Math.sin(ang) * R, 0);
    m.rotation.z = ang - Math.PI / 2;
    aro.add(m);
    barras.push(m);
  }

  let energiaSuave = 0;

  function update(dt, t) {
    let e = 0;
    if (analyser) {
      analyser.getByteFrequencyData(datos);
      for (let i = 0; i < N; i++) {
        const v = (datos[i % datos.length] || 0) / 255;
        e += v;
        const b = barras[i];
        b.scale.y = 0.3 + v * 6;
        b.material.color.setHSL((t * 0.1 + i / N) % 1, 1, 0.55 + v * 0.3);
        b.material.opacity = 0.35 + v * 0.65;
      }
      e /= N;
    } else {
      // sin audio: latido suave para que el escenario igual respire
      e = 0.15 + 0.1 * (Math.sin(t * 2) * 0.5 + 0.5);
      barras.forEach((b, i) => {
        b.scale.y = 0.3 + (Math.sin(t * 3 + i) * 0.5 + 0.5) * 1.5;
        b.material.opacity = 0.25;
      });
    }
    aro.rotation.z += dt * 0.05;
    energiaSuave += (e - energiaSuave) * Math.min(1, dt * 6);
  }

  return { aro, update, energia: () => energiaSuave, conectar };
}
