import { parsearLRC, indiceActual } from '/shared/lrc.js';

/* global io */
const socket = io({ query: { rol: 'pantalla' } });

const $ = (sel) => document.querySelector(sel);
const body = document.body;
const video = $('#selfCam');
const audio = $('#pistaAudio');

let estadoPrevio = null;
let catalogoCache = [];

// ---------------------------------------------------------------------------
// 1. Camara self-view: se pide apenas carga, para no tener el delay del prompt
//    justo cuando arranca la cancion.
// ---------------------------------------------------------------------------
async function iniciarCamara() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 },
      audio: false,
    });
    video.srcObject = stream;
  } catch (err) {
    console.warn('camara no disponible:', err.message);
    const aviso = document.createElement('div');
    aviso.className = 'cam-error';
    aviso.textContent = 'Camara no disponible (' + err.name + ')';
    body.appendChild(aviso);
  }
}
iniciarCamara();

// ---------------------------------------------------------------------------
// 2. QR de onboarding (pantalla ESPERANDO)
// ---------------------------------------------------------------------------
fetch('/api/qr-control')
  .then((r) => r.json())
  .then(({ dataUrl }) => {
    if (dataUrl) $('#qrOnboard').src = dataUrl;
  })
  .catch(() => {});

// ---------------------------------------------------------------------------
// 3. Estado global desde el servidor
// ---------------------------------------------------------------------------
socket.on('estado', (snap) => {
  const cambioDeEstado = snap.nombre !== estadoPrevio;
  body.dataset.estado = snap.nombre;

  if (snap.canciones?.length) {
    catalogoCache = snap.canciones;
  }

  switch (snap.nombre) {
    case 'SELECCIONANDO':
      renderCatalogo(snap);
      break;
    case 'CONFIRMADA':
      $('#confirmadaTitulo').textContent = snap.cancion
        ? `${snap.cancion.titulo} — ${snap.cancion.artista}`
        : '';
      break;
    case 'COUNTDOWN':
      $('#countdownNum').textContent = snap.countdown ?? 3;
      break;
    case 'PLAYING':
      if (cambioDeEstado) arrancarCancion(snap.cancion);
      break;
    case 'RESULTADO':
      if (cambioDeEstado) mostrarResultado(snap);
      break;
    case 'ESPERANDO':
      if (cambioDeEstado) detenerCancion();
      break;
  }

  estadoPrevio = snap.nombre;
});

socket.on('feedback', ({ texto }) => flash(texto));

// ---------------------------------------------------------------------------
// Catalogo
// ---------------------------------------------------------------------------
function renderCatalogo(snap) {
  const ul = $('#catalogo');
  ul.innerHTML = '';
  snap.canciones.forEach((c, i) => {
    const li = document.createElement('li');
    li.innerHTML = `${c.titulo} <span class="art">· ${c.artista}</span>`;
    if (i === snap.indiceCancion) li.classList.add('activa');
    ul.appendChild(li);
  });
  const activa = ul.children[snap.indiceCancion];
  if (activa) activa.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ---------------------------------------------------------------------------
// PLAYING: audio + letra sincronizada
// ---------------------------------------------------------------------------
let letras = [];
let indiceLetra = -1;
let loopId = null; // setInterval (robusto aun con la pestaña oculta)
let t0Fallback = 0; // reloj interno (si el mp3 no carga)
let usandoFallback = true; // hasta que el audio real demuestre que anda
let finTimer = null;

async function arrancarCancion(cancion) {
  const meta = resolverCancion(cancion);
  letras = [];
  indiceLetra = -1;
  usandoFallback = true;
  t0Fallback = performance.now();
  clearTimeout(finTimer);
  $('#lineaActual').textContent = '';
  $('#lineaSiguiente').textContent = '';

  // 3a. Letra
  if (meta?.lrc) {
    try {
      const txt = await fetch(meta.lrc).then((r) => r.text());
      letras = parsearLRC(txt);
    } catch (err) {
      console.warn('no pude cargar la letra:', err.message);
    }
  }

  // 3b. Audio. Nunca bloqueamos el loop de letra esperando al audio:
  //     si carga, mandamos el reloj a audio.currentTime; si falla, seguimos
  //     con el reloj interno.
  const dur = meta?.duracion || 40;
  if (meta?.audio) {
    audio.src = meta.audio;
    audio.currentTime = 0;
    audio.load();
    audio.play().catch(() => {}); // el fallback ya cubre el rechazo
    audio.addEventListener(
      'playing',
      () => {
        usandoFallback = false;
        clearTimeout(finTimer);
      },
      { once: true }
    );
    audio.addEventListener('ended', onCancionFin, { once: true });
    audio.addEventListener(
      'error',
      () => {
        console.warn('audio no disponible, sigo con reloj interno');
        usandoFallback = true;
      },
      { once: true }
    );
  }

  // Corte por tiempo (aplica al fallback; si el audio anda, lo pisa 'ended')
  finTimer = setTimeout(() => {
    if (usandoFallback) onCancionFin();
  }, dur * 1000);

  clearInterval(loopId);
  loopId = setInterval(loopLetra, 50);
}

function relojActual() {
  if (!usandoFallback && !audio.paused) return audio.currentTime;
  return (performance.now() - t0Fallback) / 1000;
}

function loopLetra() {
  const t = relojActual();
  const nuevo = indiceActual(letras, t);
  if (nuevo !== indiceLetra) {
    indiceLetra = nuevo;
    $('#lineaActual').textContent = letras[nuevo]?.texto ?? '';
    $('#lineaSiguiente').textContent = letras[nuevo + 1]?.texto ?? '';
  }
}

function onCancionFin() {
  socket.emit('cancion-fin');
}

function detenerCancion() {
  clearInterval(loopId);
  loopId = null;
  clearTimeout(finTimer);
  try {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  } catch {}
}

// ---------------------------------------------------------------------------
// RESULTADO
// ---------------------------------------------------------------------------
function mostrarResultado(snap) {
  detenerCancion();
  animarPuntaje(snap.puntaje ?? 0);
  const sesion = snap.sesionId || '';
  fetch('/api/qr-control')
    .then((r) => r.json())
    .then(({ url, dataUrl }) => {
      // TODO: reemplazar por URL real de descarga del video con id de sesion
      $('#qrResultado').src = dataUrl || '';
      $('#qrResultado').dataset.sesion = sesion;
      void url;
    })
    .catch(() => {});
}

function animarPuntaje(objetivo) {
  const el = $('#puntajeFinal');
  let v = 0;
  const paso = Math.max(1, Math.round(objetivo / 40));
  clearInterval(el._timer);
  el._timer = setInterval(() => {
    v = Math.min(objetivo, v + paso);
    el.textContent = v;
    if (v >= objetivo) clearInterval(el._timer);
  }, 25);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function resolverCancion(cancionParcial) {
  if (!cancionParcial) return null;
  // el snapshot del server trae solo id/titulo/artista; buscamos rutas en /api/canciones
  return (
    fullCatalog.find((c) => c.id === cancionParcial.id) || cancionParcial
  );
}

let fullCatalog = [];
fetch('/api/canciones')
  .then((r) => r.json())
  .then((data) => {
    fullCatalog = data;
  })
  .catch(() => {});

function flash(texto) {
  const el = $('#feedbackFlash');
  el.textContent = texto;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 1200);
}
