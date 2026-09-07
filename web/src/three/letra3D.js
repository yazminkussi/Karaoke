import { Text } from 'troika-three-text';
import * as THREE from 'three';

// Letra karaoke en 3D. Linea actual grande sobre un panel de vidrio, linea
// siguiente mas chica y tenue. Se ajusta sola para NO salirse de pantalla y
// entra con una animacion suave cada vez que cambia.

const FUENTE = '/fonts/Sora.ttf';

export function crearLetra3D(escena) {
  const grupo = new THREE.Group();
  escena.scene.add(grupo);

  // --- panel de vidrio detras de la linea actual ---
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { alfa: { value: 0 }, r: { value: 0.14 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec2 vUv; uniform float alfa; uniform float r;
        float rrect(vec2 p, vec2 b, float rad){
          vec2 q = abs(p) - b + rad;
          return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - rad;
        }
        void main(){
          vec2 p = (vUv - 0.5) * 2.0;            // -1..1
          float d = rrect(p, vec2(1.0, 1.0), r);
          float dentro = smoothstep(0.02, -0.02, d);
          float borde = smoothstep(0.06, 0.0, abs(d)) * 0.6;
          vec3 base = mix(vec3(0.03,0.02,0.08), vec3(0.10,0.04,0.16), vUv.y);
          vec3 col = base + vec3(1.0,0.24,0.6) * borde;
          float a = (dentro * 0.42 + borde * 0.5) * alfa;
          if (a < 0.001) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
    })
  );
  panel.renderOrder = 1;
  grupo.add(panel);

  const actual = mkText({ size: 0.62, color: 0xffffff, opacity: 1 });
  actual.outlineWidth = 0.006;
  actual.outlineColor = 0x1a0930;
  actual.outlineBlur = 0.02;
  const siguiente = mkText({ size: 0.36, color: 0xc9b8ff, opacity: 0.55 });

  actual.renderOrder = 2;
  siguiente.renderOrder = 2;
  grupo.add(actual, siguiente);

  function mkText({ size, color, opacity }) {
    const tx = new Text();
    tx.font = FUENTE;
    tx.fontSize = size;
    tx.fontWeight = 700;
    tx.anchorX = 'center';
    tx.anchorY = 'middle';
    tx.textAlign = 'center';
    tx.color = color;
    tx.fillOpacity = opacity;
    tx.letterSpacing = 0.005;
    return tx;
  }

  // animacion de entrada
  const anim = { v: 1 }; // 0 recien cambio -> 1 asentado
  let baseY = 0;

  function layout() {
    const { h } = escena.tamVisible(4);
    baseY = -h * 0.11;
    actual.maxWidth = escena.tamVisible(4).w * 0.8;
    siguiente.maxWidth = escena.tamVisible(4).w * 0.78;
    actual.fontSize = Math.min(0.62, h * 0.075);
    siguiente.fontSize = actual.fontSize * 0.58;
  }
  layout();
  addEventListener('resize', layout);

  function ajustarPanel() {
    const b = actual.textRenderInfo?.blockBounds;
    if (!b) {
      panel.visible = false;
      return;
    }
    const w = b[2] - b[0];
    const alto = b[3] - b[1];
    if (w < 0.05 || !actual.text) {
      panel.visible = false;
      return;
    }
    panel.visible = true;
    panel.scale.set(w / 2 + 0.7, alto / 2 + 0.45, 1);
  }

  function setLineas(a = '', b = '') {
    actual.text = a;
    siguiente.text = b;
    siguiente.sync();
    actual.sync(() => {
      // si la linea quedo muy alta (muchos renglones), achico
      const bb = actual.textRenderInfo?.blockBounds;
      const { h } = escena.tamVisible(4);
      if (bb) {
        const alto = bb[3] - bb[1];
        const max = h * 0.26;
        if (alto > max) actual.fontSize *= max / alto;
        actual.sync(ajustarPanel);
      } else {
        ajustarPanel();
      }
    });
    if (a) anim.v = 0; // dispara la entrada
  }

  function update(_dt, t) {
    anim.v = Math.min(1, anim.v + _dt * 4);
    const e = 1 - Math.pow(1 - anim.v, 3); // easeOut

    grupo.position.y = baseY + Math.sin(t * 1.4) * 0.04;
    const subir = (1 - e) * 0.35;

    actual.position.set(0, subir, 4);
    actual.fillOpacity = e;
    actual.scale.setScalar(0.96 + e * 0.04 + Math.sin(t * 3) * 0.006);

    siguiente.position.set(0, -0.95 + subir, 4);
    siguiente.fillOpacity = 0.5 * e;

    panel.position.set(0, subir, 3.98);
    panel.material.uniforms.alfa.value = e * 0.9;
  }

  function limpiar() {
    setLineas('', '');
    panel.visible = false;
  }

  return { grupo, setLineas, update, limpiar };
}
