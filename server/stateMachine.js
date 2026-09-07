// Maquina de estados del karaoke (autoridad = servidor).
// Refleja la tabla de la investigacion:
//   ESPERANDO -> SELECCIONANDO -> CONFIRMADA -> COUNTDOWN -> PLAYING -> RESULTADO -> ESPERANDO
//
// Cada cliente (pantalla principal y control del celular) recibe el estado
// completo por Socket.IO y se limita a renderizar lo que corresponde.

export const ESTADOS = Object.freeze({
  ESPERANDO: 'ESPERANDO',
  SELECCIONANDO: 'SELECCIONANDO',
  CONFIRMADA: 'CONFIRMADA',
  COUNTDOWN: 'COUNTDOWN',
  PLAYING: 'PLAYING',
  RESULTADO: 'RESULTADO',
});

// Transiciones validas: estado -> { evento: estadoDestino }
const TRANSICIONES = {
  ESPERANDO: {
    presencia: 'SELECCIONANDO',
  },
  SELECCIONANDO: {
    confirmar: 'CONFIRMADA',
    reset: 'ESPERANDO',
    timeout: 'ESPERANDO',
  },
  CONFIRMADA: {
    countdown: 'COUNTDOWN',
    reset: 'ESPERANDO',
  },
  COUNTDOWN: {
    play: 'PLAYING',
    reset: 'ESPERANDO',
  },
  PLAYING: {
    fin: 'RESULTADO',
    interrupcion: 'RESULTADO',
    reset: 'ESPERANDO',
  },
  RESULTADO: {
    reset: 'ESPERANDO',
    timeout: 'ESPERANDO',
  },
};

export function crearMaquina({ onCambio, canciones = [] } = {}) {
  const estado = {
    nombre: ESTADOS.ESPERANDO,
    indiceCancion: 0,
    cancion: null,
    countdown: null,
    puntaje: null,
    sesionId: null,
    canciones,
  };

  let timers = [];
  const limpiarTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };
  const agendar = (fn, ms) => {
    const t = setTimeout(fn, ms);
    timers.push(t);
    return t;
  };

  function emitir() {
    if (onCambio) onCambio(snapshot());
  }

  function snapshot() {
    return {
      nombre: estado.nombre,
      indiceCancion: estado.indiceCancion,
      cancion: estado.cancion,
      countdown: estado.countdown,
      puntaje: estado.puntaje,
      sesionId: estado.sesionId,
      canciones: estado.canciones.map((c) => ({
        id: c.id,
        titulo: c.titulo,
        artista: c.artista,
        era: c.era ?? null,
      })),
    };
  }

  function irA(nombre) {
    estado.nombre = nombre;
    emitir();
  }

  // Procesa un evento entrante. Devuelve true si produjo una transicion.
  function enviar(evento, payload = {}) {
    const mapa = TRANSICIONES[estado.nombre] || {};
    const destino = mapa[evento];

    // Eventos que no cambian de estado pero si de data (scroll del catalogo)
    if (evento === 'scroll' && estado.nombre === ESTADOS.SELECCIONANDO) {
      const n = estado.canciones.length || 1;
      const dir = payload.direccion === 'arriba' ? -1 : 1;
      estado.indiceCancion = (estado.indiceCancion + dir + n) % n;
      emitir();
      return true;
    }
    if (evento === 'seleccionar' && estado.nombre === ESTADOS.SELECCIONANDO) {
      if (Number.isInteger(payload.indice)) {
        estado.indiceCancion = Math.max(
          0,
          Math.min(payload.indice, estado.canciones.length - 1)
        );
        emitir();
      }
      return true;
    }

    if (!destino) return false;

    switch (destino) {
      case ESTADOS.SELECCIONANDO:
        limpiarTimers();
        estado.cancion = null;
        estado.puntaje = null;
        // timeout de inactividad -> vuelve a ESPERANDO (30s segun la doc)
        agendar(() => enviar('timeout'), 30_000);
        irA(ESTADOS.SELECCIONANDO);
        break;

      case ESTADOS.CONFIRMADA:
        limpiarTimers();
        estado.cancion = estado.canciones[estado.indiceCancion] ?? null;
        irA(ESTADOS.CONFIRMADA);
        // preparacion del escenario -> arranca countdown solo
        agendar(() => enviar('countdown'), 1200);
        break;

      case ESTADOS.COUNTDOWN: {
        limpiarTimers();
        estado.countdown = 3;
        irA(ESTADOS.COUNTDOWN);
        const tick = () => {
          estado.countdown -= 1;
          if (estado.countdown <= 0) {
            estado.countdown = 0;
            enviar('play');
          } else {
            emitir();
            agendar(tick, 1000);
          }
        };
        agendar(tick, 1000);
        break;
      }

      case ESTADOS.PLAYING:
        limpiarTimers();
        estado.countdown = null;
        estado.sesionId = nuevaSesionId();
        irA(ESTADOS.PLAYING);
        break;

      case ESTADOS.RESULTADO:
        limpiarTimers();
        // puntaje placeholder hasta integrar evaluacion real de performance
        estado.puntaje =
          payload.puntaje ?? Math.floor(70 + Math.random() * 30);
        irA(ESTADOS.RESULTADO);
        agendar(() => enviar('timeout'), 20_000);
        break;

      case ESTADOS.ESPERANDO:
        limpiarTimers();
        estado.cancion = null;
        estado.countdown = null;
        estado.puntaje = null;
        estado.sesionId = null;
        estado.indiceCancion = 0;
        irA(ESTADOS.ESPERANDO);
        break;
    }
    return true;
  }

  return { snapshot, enviar, get nombre() { return estado.nombre; } };
}

function nuevaSesionId() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  ).toUpperCase();
}
