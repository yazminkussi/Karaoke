import * as THREE from 'three';

// Escenario "pop" 3D de fondo: cielo con degrade, piso reflejante con grilla,
// luces de colores que barren, anillos de truss y particulas flotando.
// update(dt, t, energia) — energia 0..1 viene del analizador de audio.

export function crearEscenarioPop(scene) {
  const grupo = new THREE.Group();
  scene.add(grupo);

  // --- Cielo (esfera invertida con degrade vertical) ---
  const cielo = new THREE.Mesh(
    new THREE.SphereGeometry(90, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        arriba: { value: new THREE.Color(0x2a0a4a) },
        abajo: { value: new THREE.Color(0x05050c) },
      },
      vertexShader: `
        varying vec3 vP;
        void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        varying vec3 vP;
        uniform vec3 arriba; uniform vec3 abajo;
        void main(){
          float f = clamp((normalize(vP).y * 0.5 + 0.5), 0.0, 1.0);
          gl_FragColor = vec4(mix(abajo, arriba, f), 1.0);
        }
      `,
    })
  );
  grupo.add(cielo);

  // --- Piso con grilla ---
  const piso = new THREE.GridHelper(120, 60, 0xff3ea5, 0x3a1f6b);
  piso.position.y = -4;
  piso.material.transparent = true;
  piso.material.opacity = 0.5;
  grupo.add(piso);

  const pisoSolido = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({
      color: 0x0a0a18,
      metalness: 0.9,
      roughness: 0.35,
    })
  );
  pisoSolido.rotation.x = -Math.PI / 2;
  pisoSolido.position.y = -4.02;
  grupo.add(pisoSolido);

  // --- Luces ---
  scene.add(new THREE.AmbientLight(0x404060, 1.1));
  const reflectores = [0xff3ea5, 0x21e6c1, 0x7b2ff7].map((color, i) => {
    const l = new THREE.SpotLight(color, 60, 60, Math.PI / 7, 0.4, 1.2);
    l.position.set(Math.sin(i) * 8, 9, 4);
    l.target.position.set(0, -1, 0);
    scene.add(l, l.target);
    return l;
  });

  // --- Anillos de truss ---
  const anillos = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(6 + i * 2.4, 0.05, 8, 90),
      new THREE.MeshBasicMaterial({ color: 0x21e6c1, transparent: true, opacity: 0.35 })
    );
    m.position.z = -6 - i * 3;
    grupo.add(m);
    return m;
  });

  // --- Particulas ---
  const N = 500;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 80;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 50;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 60 - 10;
  }
  const particulas = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
    new THREE.PointsMaterial({
      color: 0xffcf40,
      size: 0.12,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  grupo.add(particulas);

  function update(dt, t, energia = 0) {
    grupo.rotation.y = Math.sin(t * 0.05) * 0.15;
    reflectores.forEach((l, i) => {
      l.position.x = Math.sin(t * 0.7 + i * 2.1) * 9;
      l.position.z = 4 + Math.cos(t * 0.5 + i) * 3;
      l.intensity = 40 + energia * 120;
    });
    anillos.forEach((m, i) => {
      m.rotation.z += dt * (0.1 + i * 0.05);
      m.scale.setScalar(1 + energia * 0.15);
      m.material.opacity = 0.25 + energia * 0.5;
    });
    particulas.rotation.y += dt * 0.02;
    particulas.material.size = 0.1 + energia * 0.25;
    piso.material.opacity = 0.35 + energia * 0.4;
  }

  return { grupo, update };
}
