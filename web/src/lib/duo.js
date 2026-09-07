// Reparte automáticamente la letra entre dos voces (P1 / P2) para el modo dúo.
// Heurística (no hay info de voces en el .lrc de lrclib):
//   1. agrupa la letra en "frases" (líneas seguidas, cortadas por silencios).
//   2. las frases que se repiten (estribillo) -> "ambos".
//   3. las demás se alternan P1, P2, P1, P2...
//
// Devuelve un array paralelo a `letras`: 'p1' | 'p2' | 'both' por línea.

function normal(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
}

export function repartirDuo(letras) {
  const asign = new Array(letras.length).fill('p1');
  if (!letras.length) return asign;

  // agrupar en frases
  const grupos = [];
  let actual = null;
  for (let i = 0; i < letras.length; i++) {
    const l = letras[i];
    const gap = i > 0 ? l.tiempo - letras[i - 1].tiempo : 0;
    if (!l.texto) { actual = null; continue; }
    if (!actual || gap > 2.6) {
      actual = { idxs: [], texto: '' };
      grupos.push(actual);
    }
    actual.idxs.push(i);
    actual.texto += ' ' + normal(l.texto);
  }

  // contar repeticiones (estribillo)
  const cuenta = new Map();
  for (const g of grupos) cuenta.set(g.texto, (cuenta.get(g.texto) || 0) + 1);

  let turno = 0;
  for (const g of grupos) {
    let voz;
    if (cuenta.get(g.texto) >= 2) {
      voz = 'both';
    } else {
      voz = turno % 2 === 0 ? 'p1' : 'p2';
      turno++;
    }
    for (const i of g.idxs) asign[i] = voz;
  }
  return asign;
}
