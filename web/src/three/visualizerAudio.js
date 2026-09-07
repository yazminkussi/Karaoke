import * as THREE from 'three';

// Analizador de audio + halo reactivo detras del cantante (dos aros de barras
// finas que laten con la musica). energia() 0..1 alimenta al resto del escenario.

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
    analyser.smoothingTimeConstant = 0.82;
    datos = new Uint8Array(analyser.frequencyBinCount);
    src.connect(analyser);
    analyser.connect(actx.destination);
  }
  addEventListener('pointerdown', () => { conectar(); actx?.resume(); }, { once: true });
  addEventListener('keydown', () => { conectar(); actx?.resume(); }, { once: true });

  const N = 64;
  const halo = new THREE.Group();
  halo.position.set(0, 0.3, -4); // detras del cantante
  scene.add(halo);

  const geo = new THREE.PlaneGeometry(0.09, 1);
  const barras = [];
  for (const anillo of [{ R: 5.2, s: 1 }, { R: 4.3, s: -1 }]) {
    const g = new THREE.Group();
    g.userData.spin = anillo.s;
    for (let i = 0; i < N; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const m = new THREE.Mesh(geo, mat);
      const ang = (i / N) * Math.PI * 2;
      m.position.set(Math.cos(ang) * anillo.R, Math.sin(ang) * anillo.R, 0);
      m.rotation.z = ang - Math.PI / 2;
      g.add(m);
      barras.push({ m, anillo, i });
    }
    halo.add(g);
  }

  let energiaSuave = 0;

  function update(dt, t) {
    const con = !!analyser;
    if (con) analyser.getByteFrequencyData(datos);
    let suma = 0;

    for (const { m, anillo, i } of barras) {
      let v;
      if (con) {
        v = (datos[i % datos.length] || 0) / 255;
        suma += v;
      } else {
        v = 0.12 + 0.1 * (Math.sin(t * 2 + i * 0.4) * 0.5 + 0.5);
      }
      m.scale.y = 0.25 + v * (anillo.R > 5 ? 5 : 3.4);
      m.material.color.setHSL(
        (t * 0.05 + i / N + (anillo.R > 5 ? 0 : 0.5)) % 1,
        0.9,
        0.55 + v * 0.35
      );
      m.material.opacity = con ? 0.25 + v * 0.7 : 0.16;
    }

    halo.children.forEach((g) => (g.rotation.z += dt * 0.04 * g.userData.spin));
    const e = con ? suma / barras.length : 0.16;
    energiaSuave += (e - energiaSuave) * Math.min(1, dt * 5);
  }

  return { halo, update, energia: () => energiaSuave, conectar };
}
