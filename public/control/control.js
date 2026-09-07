/* global io */
const socket = io({ query: { rol: 'control' } });

const $ = (s) => document.querySelector(s);
const body = document.body;

socket.on('connect', () => {
  $('#dot').classList.add('on');
  $('#estadoLabel').textContent = 'conectado';
});
socket.on('disconnect', () => {
  $('#dot').classList.remove('on');
  $('#estadoLabel').textContent = 'reconectando…';
});

socket.on('estado', (snap) => {
  body.dataset.estado = snap.nombre;
  $('#estadoLabel').textContent = snap.nombre.toLowerCase();

  if (snap.nombre === 'SELECCIONANDO') renderLista(snap);
  if (snap.nombre === 'CONFIRMADA') {
    $('#confTitulo').textContent = snap.cancion
      ? `${snap.cancion.titulo} — ${snap.cancion.artista}`
      : 'Preparando…';
  }
  if (snap.nombre === 'COUNTDOWN') $('#cd').textContent = snap.countdown ?? 3;
  if (snap.nombre === 'RESULTADO') $('#score').textContent = snap.puntaje ?? 0;
});

socket.on('accion-rechazada', ({ evento, estado }) => {
  console.warn(`accion "${evento}" rechazada en estado ${estado}`);
});

function renderLista(snap) {
  const ul = $('#lista');
  ul.innerHTML = '';
  snap.canciones.forEach((c, i) => {
    const li = document.createElement('li');
    li.textContent = `${c.titulo} · ${c.artista}`;
    if (i === snap.indiceCancion) li.classList.add('activa');
    li.addEventListener('click', () =>
      socket.emit('accion', { evento: 'seleccionar', indice: i })
    );
    ul.appendChild(li);
  });
}

// Delegacion de todos los botones con data-accion / data-fb
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  if (btn.dataset.accion) {
    const payload = { evento: btn.dataset.accion };
    if (btn.dataset.dir) payload.direccion = btn.dataset.dir;
    socket.emit('accion', payload);
  }
  if (btn.dataset.fb) {
    socket.emit('feedback-control', { texto: btn.dataset.fb });
  }
});
