import { conectar } from './socket.js';
import { parsearLRC, indiceActual } from './lrc.js';
import { crearReconocimiento } from './vision.js';
import { crearGestos } from './manos.js';
import { crearVoz } from './voz.js';
import { crearAnalisis } from './audioAnalisis.js';
import { crearEscenario } from './escenario.js';
import { crearManosCanvas } from './manosCanvas.js';
import { crearGrabacion } from './grabacion.js';

const $ = (s) => document.querySelector(s);
const body = document.body;
const video = $('#selfCam');
const audio = $('#pista');
const socket = conectar('pantalla');

let estadoActual = 'ESPERANDO';
let estadoPrevio = null;
let catalogo = [];
let catalogoFull = [];
let datosManos = null;

fetch('/api/canciones')
  .then((r) => r.json())
  .then((d) => (catalogoFull = d))
  .catch(() => {});

// --- Fondo poster + audio ------------------------------------------
const escenario = crearEscenario($('#estrella-wrap'));
const analisis = crearAnalisis(audio);
const manosCanvas = crearManosCanvas($('#manos'), video);
const grabacion = crearGrabacion();
let camStream = null;

function frame() {
  escenario.latir(analisis.tick());
  if (!datosManos || !datosManos.manos?.length) manosCanvas.dibujar(null);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- Camara + MediaPipe (manos + persona) + voz ------------------
const gestos = crearGestos({
  getEstado: () => estadoActual,
  onGesto: enviarAccion,
  onManos: (d) => {
    datosManos = d;
    escenario.setModo(
      d?.corazon ? 'corazon' : d?.cantidadManos >= 2 ? 'dos' : d?.cantidadManos === 1 ? 'una' : ''
    );
    if (d?.corazon) flashCorazon();
  },
});

const MS_SIN_PERSONA = 10_000;
let ultimaPersona = performance.now();
let ultimoResultado = 0; // ultimo frame procesado por MediaPipe
const ESTADOS_TIMEOUT = ['SELECCIONANDO', 'CONFIRMADA', 'COUNTDOWN', 'PLAYING'];

navigator.mediaDevices
  .getUserMedia({ video: { width: 1280, height: 720 }, audio: true })
  .then((stream) => {
    camStream = stream;
    video.srcObject = stream;
    return crearReconocimiento({
      video,
      numManos: 2,
      onResultado: ({ manos, hayPersona }) => {
        ultimoResultado = performance.now();
        gestos({ manos }); // esto actualiza datosManos via onManos
        manosCanvas.dibujar(datosManos); // dibujar en el MISMO frame -> sin desfase
        if (hayPersona) ultimaPersona = performance.now();
      },
    });
  })
  .catch((err) => {
    console.warn('camara / MediaPipe:', err.message);
    aviso('Cámara no disponible (' + err.name + ')');
  });

setInterval(() => {
  if (!ESTADOS_TIMEOUT.includes(estadoActual)) return;
  const ahora = performance.now();
  if (ahora - ultimoResultado > 3000) return; // el pipeline no esta dando frames
  if (ahora - ultimaPersona > MS_SIN_PERSONA) {
    ultimaPersona = ahora;
    console.log('[idle] 10s sin persona -> reset');
    enviarAccion({ tipo: 'reset' });
  }
}, 1000);

crearVoz({
  getEstado: () => estadoActual,
  getCatalogo: () => (catalogoFull.length ? catalogoFull : catalogo),
  onGesto: enviarAccion,
  onEstadoVoz: (txt) => ($('#vozStatus').textContent = txt),
});

function enviarAccion({ tipo, direccion, indice }) {
  socket.emit('accion', { evento: tipo, direccion, indice });
}

// --- Estado global ---------------------------------------------
socket.on('estado', (snap) => {
  const cambio = snap.nombre !== estadoPrevio;
  estadoActual = snap.nombre;
  body.dataset.estado = snap.nombre;

  if (snap.canciones?.length && snap.canciones.length !== catalogo.length) {
    catalogo = snap.canciones;
    renderCatalogo();
  }

  switch (snap.nombre) {
    case 'SELECCIONANDO':
      marcarActiva(snap.indiceCancion);
      break;
    case 'CONFIRMADA':
      $('#confTitulo').textContent = snap.cancion
        ? `${snap.cancion.titulo} · ${snap.cancion.artista}`
        : '';
      break;
    case 'COUNTDOWN':
      $('#cuenta').textContent = snap.countdown ?? 3;
      break;
    case 'PLAYING':
      if (cambio) arrancarCancion(snap.cancion);
      break;
    case 'RESULTADO':
      if (cambio) mostrarResultado(snap);
      break;
    case 'ESPERANDO':
      if (cambio) detenerCancion();
      break;
  }
  estadoPrevio = snap.nombre;
});

socket.on('feedback', ({ texto }) => flash(texto));

// --- Catalogo ---------------------------------------------------
function renderCatalogo() {
  const ul = $('#lista');
  ul.innerHTML = '';
  catalogo.forEach((c) => {
    const li = document.createElement('li');
    li.innerHTML = `${c.titulo} <span class="art">${c.artista}</span>`;
    ul.appendChild(li);
  });
}
function marcarActiva(i) {
  const ul = $('#lista');
  [...ul.children].forEach((li, k) => li.classList.toggle('activa', k === i));
  ul.children[i]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// --- PLAYING: audio + letra --------------------------------
let letras = [];
let idxLetra = -1;
let loopId = null;
let t0 = 0;
let fallback = true;
let finTimer = null;
let offsetLetra = 0; // ajuste fino: +/- segundos entre la pista y el .lrc
let duracionCancion = 40;
const barra = $('#progreso');
const barraFill = barra.querySelector('span');

async function arrancarCancion(cancion) {
  const meta =
    catalogoFull.find((c) => c.id === cancion?.id) ||
    catalogo.find((c) => c.id === cancion?.id) ||
    cancion;
  letras = [];
  idxLetra = -1;
  fallback = true;
  t0 = performance.now();
  offsetLetra = Number(meta?.offsetLetra) || 0;
  duracionCancion = Number(meta?.duracion) || 40;
  clearTimeout(finTimer);
  mostrarLinea(-1, true);
  barra.hidden = false;
  barraFill.style.width = '0%';

  // graba en paralelo (camara + microfono)
  grabacion.iniciar(camStream);

  if (meta?.lrc) {
    try {
      letras = parsearLRC(await fetch(meta.lrc).then((r) => r.text()));
    } catch (e) {
      console.warn('letra:', e.message);
    }
  }

  const dur = duracionCancion;
  if (meta?.audio) {
    audio.src = meta.audio;
    audio.currentTime = 0;
    audio.load();
    audio.play().catch(() => {});
    audio.addEventListener('playing', () => {
      fallback = false;
      clearTimeout(finTimer);
      // red de seguridad por si el evento 'ended' no dispara (m4a DASH, etc.)
      finTimer = setTimeout(() => socket.emit('cancion-fin'), (audio.duration || dur) * 1000 + 4000);
    }, { once: true });
    audio.addEventListener('ended', () => socket.emit('cancion-fin'), { once: true });
    audio.addEventListener('error', () => { fallback = true; }, { once: true });
  }
  finTimer = setTimeout(() => { if (fallback) socket.emit('cancion-fin'); }, dur * 1000);

  clearInterval(loopId);
  loopId = setInterval(tickLetra, 60);
}

function tickLetra() {
  const base = !fallback && !audio.paused ? audio.currentTime : (performance.now() - t0) / 1000;
  const t = base - offsetLetra;

  // barra de progreso
  barraFill.style.width =
    Math.max(0, Math.min(100, (base / duracionCancion) * 100)).toFixed(1) + '%';

  const nuevo = indiceActual(letras, t);
  if (nuevo !== idxLetra) {
    idxLetra = nuevo;
    mostrarLinea(nuevo);
  }
  pintarPalabras(t);
}

// Ajuste fino de sincronía en vivo: [ y ] mueven la letra -/+ 0.2s.
addEventListener('keydown', (e) => {
  if (estadoActual !== 'PLAYING') return;
  if (e.key === '[') offsetLetra -= 0.2;
  else if (e.key === ']') offsetLetra += 0.2;
  else return;
  idxLetra = -2; // fuerza refresco
  $('#vozStatus').textContent = `offset ${offsetLetra.toFixed(1)}s`;
  console.log('[letra] offsetLetra =', offsetLetra.toFixed(2));
});

const elActual = $('#lineaActual');
const elSig = $('#lineaSiguiente');
let palabras = []; // [{ span, t0 }] de la linea actual
let lineaRender = -99; // qué línea real está en pantalla (evita re-render en los silencios)

// Enseña la línea `idx` como palabras, con un t0 estimado por palabra
// (interpolado dentro de la línea, proporcional a la cantidad de letras).
function mostrarLinea(idx, forzar = false) {
  // durante un silencio del .lrc, mostramos por adelantado la próxima línea
  // (sin resaltar nada todavía) para que la pantalla no quede vacía.
  let i = idx;
  while (letras[i] && !letras[i].texto) i++;
  if (!forzar && i === lineaRender && idx >= 0) return; // ya está en pantalla
  lineaRender = i;

  elActual.innerHTML = '';
  palabras = [];
  const cur = letras[i];

  const sig = [letras[i + 1], letras[i + 2]].find((l) => l?.texto)?.texto || '';
  elSig.textContent = sig;

  if (!cur || !cur.texto) {
    elActual.hidden = true;
    return;
  }
  elActual.hidden = false;

  const trozos = cur.texto.split(/\s+/).filter(Boolean);
  const fin = letras[i + 1] ? letras[i + 1].tiempo : cur.tiempo + 4;
  const dur = Math.max(0.6, fin - cur.tiempo);
  const totalCh = trozos.reduce((s, w) => s + w.length, 0) || 1;
  let acc = 0;
  for (const w of trozos) {
    const span = document.createElement('span');
    span.textContent = w + ' ';
    elActual.appendChild(span);
    palabras.push({ span, t0: cur.tiempo + (acc / totalCh) * dur });
    acc += w.length;
  }

  elActual.classList.remove('entrando');
  void elActual.offsetWidth;
  elActual.classList.add('entrando');
  ajustarLetra();
}

function pintarPalabras(t) {
  if (!palabras.length) return;
  let actual = -1;
  for (let i = 0; i < palabras.length; i++) if (palabras[i].t0 <= t) actual = i;
  for (let i = 0; i < palabras.length; i++) {
    const c = palabras[i].span.classList;
    c.toggle('dicha', i < actual);
    c.toggle('actual', i === actual);
  }
}

function ajustarLetra() {
  if (!elActual.textContent) return;
  const maxH = innerHeight * 0.4;
  const maxW = $('#letra').clientWidth;
  let size = Math.min(innerWidth * 0.09, innerHeight * 0.13);
  elActual.style.fontSize = size + 'px';
  let guard = 40;
  while (guard-- > 0 && (elActual.scrollHeight > maxH || elActual.scrollWidth > maxW) && size > 16) {
    size *= 0.93;
    elActual.style.fontSize = size + 'px';
  }
}
addEventListener('resize', ajustarLetra);

function detenerCancion() {
  clearInterval(loopId);
  loopId = null;
  clearTimeout(finTimer);
  mostrarLinea(-1, true);
  barra.hidden = true;
  try {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  } catch {}
}

// --- RESULTADO --------------------------------------------
function mostrarResultado(snap) {
  detenerCancion();
  const el = $('#score');
  let v = 0;
  const meta = snap.puntaje ?? 0;
  clearInterval(el._t);
  el._t = setInterval(() => {
    v = Math.min(meta, v + Math.max(1, Math.round(meta / 40)));
    el.textContent = v;
    if (v >= meta) clearInterval(el._t);
  }, 25);

  fetch('/api/qr-resultado?sesion=' + encodeURIComponent(snap.sesionId || ''))
    .then((r) => r.json())
    .then(({ dataUrl }) => { if (dataUrl) $('#qrResultado').src = dataUrl; })
    .catch(() => {});

  // cerrar la grabacion y ofrecer el video
  const bajar = $('#bajarVideo');
  bajar.hidden = true;
  grabacion.detener().then((blob) => {
    if (!blob || !blob.size) return;
    bajar.href = URL.createObjectURL(blob);
    bajar.download = `karaoke-${(snap.cancion?.id || 'video')}-${snap.sesionId || ''}.webm`;
    bajar.hidden = false;
    // TODO: subir el blob al server para servirlo por el QR
  });
}

// --- helpers UI ------------------------------------------
let ultimoCorazon = 0;
function flashCorazon() {
  if (performance.now() - ultimoCorazon < 2500) return;
  ultimoCorazon = performance.now();
  flash('♥');
}
function flash(texto) {
  const el = $('#feedbackFlash');
  el.textContent = texto;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 1100);
}
function aviso(txt) {
  const a = document.createElement('div');
  a.className = 'aviso';
  a.textContent = txt;
  body.appendChild(a);
}
