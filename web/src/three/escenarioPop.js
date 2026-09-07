import * as THREE from 'three';

// Escenario "pop" 3D de fondo, con onda aesthetic / synthwave:
// cielo con degrade + aurora, piso infinito que se desvanece, glow de horizonte,
// haces de luz que barren y particulas suaves. update(dt, t, energia 0..1).

const ROSA = new THREE.Color('#ff2d95');
const LILA = new THREE.Color('#b57bff');
const MENTA = new THREE.Color('#3ef2c0');

export function crearEscenarioPop(scene) {
  const grupo = new THREE.Group();
  scene.add(grupo);

  // --- Cielo ---
  const cielo = new THREE.Mesh(
    new THREE.SphereGeometry(120, 40, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        t: { value: 0 },
        cenit: { value: new THREE.Color('#180b33') },
        horizonte: { value: new THREE.Color('#3a1150') },
        piso: { value: new THREE.Color('#05040c') },
        acento: { value: LILA.clone() },
      },
      vertexShader: `
        varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        varying vec3 vDir;
        uniform float t;
        uniform vec3 cenit, horizonte, piso, acento;
        void main(){
          float y = vDir.y;
          vec3 col = mix(horizonte, cenit, smoothstep(0.0, 0.8, y));
          col = mix(col, piso, smoothstep(0.0, -0.5, y));
          // banda de aurora suave sobre el horizonte
          float aurora = exp(-pow((y - 0.12 + 0.05*sin(vDir.x*3.0 + t*0.3)) * 6.0, 2.0));
          col += acento * aurora * 0.35;
          // glow calido justo en el horizonte
          col += horizonte * exp(-pow(y*9.0, 2.0)) * 0.6;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  grupo.add(cielo);

  // --- Piso infinito que se desvanece ---
  const piso = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400, 1, 1),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        t: { value: 0 },
        energia: { value: 0 },
        colA: { value: ROSA.clone() },
        colB: { value: MENTA.clone() },
      },
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float t, energia;
        uniform vec3 colA, colB;
        float grid(vec2 p, float w){
          vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
          return 1.0 - min(min(g.x, g.y) / w, 1.0);
        }
        void main(){
          vec2 p = (vUv - 0.5) * 400.0;
          p.y += t * 3.0; // el piso "avanza"
          float l = grid(p, 1.6);
          float dist = length(vUv - 0.5) * 2.0;
          float fade = smoothstep(1.0, 0.12, dist);
          vec3 col = mix(colB, colA, clamp(p.y*0.01 + 0.5, 0.0, 1.0));
          float a = l * fade * (0.22 + energia * 0.4);
          if (a < 0.001) discard;
          gl_FragColor = vec4(col * (0.9 + energia * 0.6), a);
        }
      `,
    })
  );
  piso.rotation.x = -Math.PI / 2;
  piso.position.y = -4;
  grupo.add(piso);

  // --- Glow de horizonte (additivo, lo agarra el bloom) ---
  const horizonte = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 26),
    new THREE.MeshBasicMaterial({
      color: ROSA.clone().lerp(LILA, 0.45),
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  horizonte.position.set(0, -2.4, -40);
  grupo.add(horizonte);

  // --- Orbe central que late ---
  const orbe = new THREE.Mesh(
    new THREE.SphereGeometry(6, 32, 24),
    new THREE.MeshBasicMaterial({
      color: LILA.clone().multiplyScalar(0.5),
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  orbe.position.set(0, 1, -30);
  grupo.add(orbe);

  // --- Haces de luz ---
  const haces = [ROSA, MENTA, LILA].map((color, i) => {
    const cono = new THREE.Mesh(
      new THREE.ConeGeometry(2.4, 26, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: color.clone(),
        transparent: true,
        opacity: 0.06,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    cono.position.set((i - 1) * 7, 9, -6);
    cono.rotation.x = Math.PI;
    grupo.add(cono);
    return cono;
  });

  // --- Luces reales (para el orbe/piso material standard si se agrega) ---
  scene.add(new THREE.AmbientLight(0x2a2340, 1.4));

  // --- Particulas ---
  const N = 280;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 90;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 55;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 70 - 10;
    vel[i] = 0.4 + Math.random() * 1.2;
  }
  const particulas = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
    new THREE.PointsMaterial({
      color: 0xffe6b0,
      size: 0.14,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })
  );
  grupo.add(particulas);

  let extra = 0;
  const pulso = () => (extra = 1);

  function update(dt, t, energia = 0) {
    extra = Math.max(0, extra - dt * 1.5);
    const e = Math.min(1, energia + extra);

    cielo.material.uniforms.t.value = t;
    piso.material.uniforms.t.value = t;
    piso.material.uniforms.energia.value = e;

    grupo.rotation.y = Math.sin(t * 0.04) * 0.12;

    orbe.scale.setScalar(1 + Math.sin(t * 1.2) * 0.04 + e * 0.25);
    orbe.material.opacity = 0.14 + e * 0.28;
    horizonte.material.opacity = 0.22 + e * 0.3;
    horizonte.material.color.set(ROSA).lerp(LILA, 0.4 + 0.3 * Math.sin(t * 0.5));

    haces.forEach((c, i) => {
      c.position.x = Math.sin(t * 0.5 + i * 2.1) * 8;
      c.rotation.z = Math.sin(t * 0.7 + i) * 0.25;
      c.material.opacity = 0.04 + e * 0.12;
    });

    const arr = particulas.geometry.attributes.position.array;
    for (let i = 0; i < N; i++) {
      arr[i * 3 + 1] += vel[i] * dt * (0.6 + e);
      if (arr[i * 3 + 1] > 28) arr[i * 3 + 1] = -28;
    }
    particulas.geometry.attributes.position.needsUpdate = true;
    particulas.material.size = 0.12 + e * 0.2;
  }

  return { grupo, update, pulso };
}
