// Parser de archivos .lrc -> [{ tiempo: segundos, texto }]
// Soporta multiples timestamps por linea: "[00:10.00][00:40.00]texto"
export function parsearLRC(textoLRC) {
  const lineas = String(textoLRC).split(/\r?\n/);
  const resultado = [];
  const tiempoRe = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

  for (const linea of lineas) {
    tiempoRe.lastIndex = 0;
    const marcas = [...linea.matchAll(tiempoRe)];
    if (marcas.length === 0) continue; // metadata [ti:], [ar:], etc.

    const texto = linea.replace(tiempoRe, '').trim();
    for (const m of marcas) {
      const min = parseInt(m[1], 10);
      const seg = parseInt(m[2], 10);
      const frac = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) / 1000 : 0;
      resultado.push({ tiempo: min * 60 + seg + frac, texto });
    }
  }

  resultado.sort((a, b) => a.tiempo - b.tiempo);
  return resultado;
}

// Dado el array parseado y el tiempo actual, indice de la linea vigente (-1 si aun no arranco)
export function indiceActual(letras, t) {
  let lo = 0;
  let hi = letras.length - 1;
  let res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (letras[mid].tiempo <= t) {
      res = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return res;
}
