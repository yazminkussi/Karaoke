import { Text } from 'troika-three-text';
import * as THREE from 'three';

// Lista de canciones en 3D. La mano (o el celular) mueve el indice activo;
// la lista se desliza para centrar el elegido y lo resalta en rosa/dorado.

export function crearCatalogo3D(escena) {
  const grupo = new THREE.Group();
  grupo.position.z = 4;
  escena.scene.add(grupo);

  const SEP = 1.15;
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
      t.text = `${c.titulo}   ·   ${c.artista}`;
      t.fontSize = 0.5;
      t.anchorX = 'center';
      t.anchorY = 'middle';
      t.color = 0xffffff;
      t.outlineWidth = 0.015;
      t.outlineColor = 0x000000;
      t.position.y = -i * SEP;
      t.sync();
      grupo.add(t);
      return t;
    });
    setIndice(indice);
  }

  function setIndice(i) {
    indice = i;
    objetivoY = i * SEP;
    textos.forEach((t, k) => {
      const activo = k === i;
      t.color = activo ? 0xff3ea5 : 0xffffff;
      t.fillOpacity = activo ? 1 : 0.45;
      t.sync();
    });
  }

  function update(dt) {
    grupo.position.y += (objetivoY - grupo.position.y) * Math.min(1, dt * 8);
    textos.forEach((t, k) => {
      const dist = Math.abs(k * SEP - grupo.position.y);
      const s = Math.max(0.4, 1.15 - dist * 0.25);
      t.scale.setScalar(k === indice ? s * 1.12 : s);
    });
  }

  return { grupo, setCanciones, setIndice, update };
}
