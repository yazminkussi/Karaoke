import { Text } from 'troika-three-text';
import * as THREE from 'three';

// Letra karaoke en 3D: linea actual grande + linea siguiente mas chica y
// tenue, flotando en la parte de abajo del escenario.

export function crearLetra3D(escena) {
  const grupo = new THREE.Group();
  escena.scene.add(grupo);

  const actual = new Text();
  actual.fontSize = 0.72;
  actual.anchorX = 'center';
  actual.anchorY = 'middle';
  actual.color = 0xffffff;
  actual.outlineWidth = 0.02;
  actual.outlineColor = 0x000000;
  actual.maxWidth = escena.tamVisible(4).w * 0.85;
  actual.textAlign = 'center';

  const siguiente = new Text();
  siguiente.fontSize = 0.5;
  siguiente.anchorX = 'center';
  siguiente.anchorY = 'middle';
  siguiente.color = 0x9fb3c8;
  siguiente.fillOpacity = 0.6;
  siguiente.maxWidth = escena.tamVisible(4).w * 0.8;
  siguiente.textAlign = 'center';

  grupo.add(actual, siguiente);
  posicionar();

  function posicionar() {
    const { h } = escena.tamVisible(4);
    actual.position.set(0, -h * 0.24, 4);
    siguiente.position.set(0, -h * 0.24 - 1.0, 4);
  }

  function setLineas(a = '', b = '') {
    actual.text = a;
    siguiente.text = b;
    actual.sync();
    siguiente.sync();
  }

  addEventListener('resize', () => {
    actual.maxWidth = escena.tamVisible(4).w * 0.85;
    siguiente.maxWidth = escena.tamVisible(4).w * 0.8;
    posicionar();
  });

  function update(_dt, t) {
    grupo.position.y = Math.sin(t * 1.5) * 0.05;
    const pulso = 1 + Math.sin(t * 4) * 0.015;
    actual.scale.setScalar(pulso);
  }

  function limpiar() {
    setLineas('', '');
  }

  return { grupo, setLineas, update, limpiar };
}
