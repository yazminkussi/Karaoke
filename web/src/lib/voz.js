// Control por voz (Web Speech API, es-ES). Adaptado del pc.html del equipo.
// Traduce lo que decis a las mismas acciones que los gestos:
//
//   "cantar" / "empezar" / "listo"        -> presencia
//   el nombre de una cancion (en la lista) -> seleccionar
//   "siguiente" / "anterior"              -> scroll
//   "confirmar" / "dale" / "esa"          -> confirmar
//   "salir" / "cancelar" / "basta"        -> reset  (o interrupcion si esta cantando)
//
// Solo anda en Chrome / Edge. Si no hay soporte, no pasa nada (quedan las manos).

const PALABRAS = {
  presencia: ['cantar', 'canta', 'empezar', 'empeza', 'iniciar', 'inicia', 'activar', 'activa', 'listo', 'lista', 'vamos', 'arranca', 'dale karaoke'],
  confirmar: ['confirmar', 'confirma', 'confirmado', 'elegir', 'elijo', 'esta', 'esa', 'dale', 'ok', 'okey', 'aceptar', 'seleccionar'],
  reset: ['salir', 'cancelar', 'cancela', 'volver', 'volve', 'basta', 'chau', 'terminar', 'termina', 'atras total'],
  scrollAbajo: ['siguiente', 'proxima', 'proximo', 'baja', 'abajo', 'siguiente cancion'],
  scrollArriba: ['anterior', 'previa', 'sube', 'arriba', 'atras'],
};

export function crearVoz({ getEstado, getCatalogo, onGesto, onEstadoVoz }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    onEstadoVoz?.('sin soporte de voz en este navegador');
    return { activo: false, detener() {} };
  }

  const rec = new SR();
  rec.lang = 'es-ES';
  rec.continuous = true;
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  let vivo = true;

  rec.onresult = (event) => {
    const frase = normalizar(
      event.results[event.results.length - 1][0].transcript
    );
    onEstadoVoz?.(`"${frase}"`);
    interpretar(frase, { getEstado, getCatalogo, onGesto });
  };

  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      vivo = false;
      onEstadoVoz?.('microfono bloqueado');
    }
  };
  rec.onend = () => {
    if (vivo) {
      try { rec.start(); } catch {}
    }
  };

  try { rec.start(); onEstadoVoz?.('escuchando…'); } catch {}

  return {
    activo: true,
    detener() {
      vivo = false;
      try { rec.stop(); } catch {}
    },
  };
}

function interpretar(frase, { getEstado, getCatalogo, onGesto }) {
  const estado = getEstado();

  if (incluyeAlguna(frase, PALABRAS.reset)) {
    onGesto({ tipo: estado === 'PLAYING' ? 'interrupcion' : 'reset' });
    return;
  }
  if (estado === 'ESPERANDO' && incluyeAlguna(frase, PALABRAS.presencia)) {
    onGesto({ tipo: 'presencia' });
    return;
  }
  if (estado === 'SELECCIONANDO') {
    if (incluyeAlguna(frase, PALABRAS.scrollAbajo)) return onGesto({ tipo: 'scroll', direccion: 'abajo' });
    if (incluyeAlguna(frase, PALABRAS.scrollArriba)) return onGesto({ tipo: 'scroll', direccion: 'arriba' });

    // decir el nombre de la cancion
    const cat = getCatalogo() || [];
    let mejor = -1;
    let mejorScore = 0;
    cat.forEach((c, i) => {
      const titulo = normalizar(c.titulo);
      const score = solapamiento(frase, titulo);
      if (score > mejorScore) {
        mejorScore = score;
        mejor = i;
      }
    });
    if (mejor >= 0 && mejorScore >= 0.5) {
      onGesto({ tipo: 'seleccionar', indice: mejor });
      return;
    }
    if (incluyeAlguna(frase, PALABRAS.confirmar)) onGesto({ tipo: 'confirmar' });
  }
}

// --- helpers de texto ---
function normalizar(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // saca tildes
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function incluyeAlguna(frase, lista) {
  return lista.some((p) => frase.includes(p));
}

// fraccion de palabras del titulo que aparecen en la frase dicha
function solapamiento(frase, titulo) {
  const palabras = titulo.split(' ').filter((w) => w.length > 2);
  if (!palabras.length) return 0;
  const hit = palabras.filter((w) => frase.includes(w)).length;
  return hit / palabras.length;
}
