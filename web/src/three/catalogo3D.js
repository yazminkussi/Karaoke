import { Text } from 'troika-three-text';
import * as THREE from 'three';

// Lista de canciones en 3D. La mano / la voz mueven el indice activo; la lista
// se desliza para centrar el elegido y lo resalta.

const FUENTE = '/fonts/Unbounded.ttf';

export function crearCatalogo3D(escena) {
  const grupo = new THREE.Group();
  grupo.position.z = 4;
  escena.scene.add(grupo);

  // barra de brillo detras del item activo (fija en el centro)
  const realce = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {},
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec2 vUv;
        void main(){
          float x = abs(vUv.x - 0.5) * 2.0;
          float y = abs(vUv.y - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.0, x) * smoothstep(1.0, 0.2, y);
          vec3 col = mix(vec3(1.0,0.18,0.58), vec3(0.71,0.48,1.0), vUv.x);
          gl_FragColor = vec4(col, a * 0.5);
        }
      `,
    })
  );
  realce.position.z = 3.9;
  escena.scene.add(realce);

  const SEP = 1.25;
  let textos = [];
  let indice = 0;
  let objetivoY = 0;

  function setCanciones(canciones) {
    textos.forEach((t) => {
      grupo.remove(t);
      t.dispose();
    });
    textos = canciones.map((c, i) => {
      const t = new Text();
      t.font = FUENTE;
      t.text = c.titulo;
      t.fontSize = 0.46;
      t.fontWeight = 700;
      t.anchorX = 'center';
      t.anchorY = 'middle';
      t.color = 0xffffff;
      t.outlineWidth = 0.008;
      t.outlineColor = 0x140826;
      t.position.y = -i * SEP;
      t.sync();
      grupo.add(t);
      return t;
    });
    setIndice(Math.min(indice, textos.length - 1));
  }

  function setIndice(i) {
    indice = i;
    objetivoY = i * SEP;
    textos.forEach((t, k) => {
      const activo = k === i;
      t.color = activo ? 0xffffff : 0xbfa8e8;
      t.fillOpacity = activo ? 1 : 0.4;
      t.sync();
    });
  }

  function update(dt) {
    grupo.position.y += (objetivoY - grupo.position.y) * Math.min(1, dt * 8);
    textos.forEach((t, k) => {
      const dist = Math.abs(k * SEP - grupo.position.y);
      const s = Math.max(0.35, 1.1 - dist * 0.28);
      t.scale.setScalar(k === indice ? s * 1.15 : s);
    });
    const activo = textos[indice];
    if (activo && realce.visible) {
      const b = activo.textRenderInfo?.blockBounds;
      const w = b ? (b[2] - b[0]) * activo.scale.x : 6;
      realce.scale.set(w + 1.4, 0.95, 1);
    }
  }

  function setVisible(v) {
    grupo.visible = v;
    realce.visible = v;
  }

  return { grupo, realce, setCanciones, setIndice, update, setVisible };
}
