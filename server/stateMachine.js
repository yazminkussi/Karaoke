// Maquina de estados del karaoke (autoridad = servidor).
//   ESPERANDO -> MODO -> SELECCIONANDO -> CONFIRMADA -> COUNTDOWN -> PLAYING -> RESULTADO -> ESPERANDO
//
// La pantalla principal recibe el estado completo por Socket.IO y renderiza.

export const ESTADOS = Object.freeze({
  ESPERANDO: 'ESPERANDO',
  MODO: 'MODO',
  SELECCIONANDO: 'SELECCIONANDO',
  CONFIRMADA: 'CONFIRMADA',
  COUNTDOWN: 'COUNTDOWN',
  PLAYING: 'PLAYING',
  RESULTADO: 'RESULTADO',
});

const TRANSICIONES = {
  ESPERANDO: { presencia: 'MODO' },
  MODO: {
    modo: 'SELECCIONANDO',
    reset: 'ESPERANDO',
    timeout: 'ESPERANDO',
  },
  SELECCIONANDO: {
    confirmar: 'CONFIRMADA',
    reset: 'ESPERANDO',
    timeout: 'ESPERANDO',
  },
  CONFIRMADA: { countdown: 'COUNTDOWN', reset: 'ESPERANDO' },
  COUNTDOWN: { play: 'PLAYING', reset: 'ESPERANDO' },
  PLAYING: { fin: 'RESULTADO', interrupcion: 'RESULTADO', reset: 'ESPERANDO' },
  RESULTADO: { reset: 'ESPERANDO', timeout: 'ESPERANDO' },
};

export function crearMaquina({ onCambio, canciones = [] } = {}) {
  const estado = {
    nombre: ESTADOS.ESPERANDO,
    modo: 'solo', // 'solo' | 'duo'
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

  const emitir = () => onCambio && onCambio(snapshot());

  function snapshot() {
    return {
      nombre: estado.nombre,
      modo: estado.modo,
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
        voces: c.voces ?? 'solo',
      })),
    };
  }

  function irA(nombre) {
    estado.nombre = nombre;
    emitir();
  }

  function enviar(evento, payload = {}) {
    const mapa = TRANSICIONES[estado.nombre] || {};
    const destino = mapa[evento];

    // eventos que cambian data pero no de estado
    if (evento === 'scroll' && estado.nombre === ESTADOS.SELECCIONANDO) {
      const n = estado.canciones.length || 1;
      const dir = payload.direccion === 'arriba' ? -1 : 1;
      estado.indiceCancion = (estado.indiceCancion + dir + n) % n;
      emitir();
      return true;
    }
    if (evento === 'seleccionar' && estado.nombre === ESTADOS.SELECCIONANDO) {
      if (Number.isInteger(payload.indice)) {
        estado.indiceCancion = Math.max(0, Math.min(payload.indice, estado.canciones.length - 1));
        emitir();
      }
      return true;
    }
    // elegir modo dentro de MODO no cambia de estado hasta confirmar
    if (evento === 'setModo' && estado.nombre === ESTADOS.MODO) {
      if (payload.valor === 'solo' || payload.valor === 'duo') {
        estado.modo = payload.valor;
        emitir();
      }
      return true;
    }

    if (!destino) return false;

    switch (destino) {
      case ESTADOS.MODO:
        limpiarTimers();
        estado.modo = 'solo';
        estado.indiceCancion = 0;
        agendar(() => enviar('timeout'), 25_000);
        irA(ESTADOS.MODO);
        break;

      case ESTADOS.SELECCIONANDO:
        limpiarTimers();
        if (payload.valor === 'solo' || payload.valor === 'duo') estado.modo = payload.valor;
        estado.cancion = null;
        estado.puntaje = null;
        agendar(() => enviar('timeout'), 30_000);
        irA(ESTADOS.SELECCIONANDO);
        break;

      case ESTADOS.CONFIRMADA:
        limpiarTimers();
        estado.cancion = estado.canciones[estado.indiceCancion] ?? null;
        irA(ESTADOS.CONFIRMADA);
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
        estado.puntaje = Number.isFinite(payload.puntaje)
          ? Math.round(payload.puntaje)
          : Math.floor(70 + Math.random() * 30);
        irA(ESTADOS.RESULTADO);
        agendar(() => enviar('timeout'), 25_000);
        break;

      case ESTADOS.ESPERANDO:
        limpiarTimers();
        Object.assign(estado, {
          modo: 'solo',
          cancion: null,
          countdown: null,
          puntaje: null,
          sesionId: null,
          indiceCancion: 0,
        });
        irA(ESTADOS.ESPERANDO);
        break;
    }
    return true;
  }

  return { snapshot, enviar, get nombre() { return estado.nombre; } };
}

function nuevaSesionId() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase();
}
