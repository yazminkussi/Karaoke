import { conectar } from './socket.js';
import { parsearLRC, indiceActual } from './lrc.js';
import { iniciarManos } from './manos.js';
import { crearEscena } from '../three/escena.js';
import { crearEscenarioPop } from '../three/escenarioPop.js';
import { crearCatalogo3D } from '../three/catalogo3D.js';
import { crearLetra3D } from '../three/letra3D.js';
import { crearAudioReactivo } from '../three/visualizerAudio.js';
import { crearManosNeon } from '../three/manosNeon.js';

const $ = (s) => document.querySelector(s);
const body = document.body;
const video = $('#selfCam');
const audio = $('#pista');
const socket = conectar('pantalla');

let estadoActual = 'ESPERANDO';
let estadoPrevio = null;
let catalogo = []; // version del snapshot (id/titulo/artista)
let catalogoFull = []; // con rutas de audio/lrc/duracion (desde /api/canciones)
let datosManos = null;

fetch('/api/canciones')
  .then((r) => r.json())
  .then((data) => (catalogoFull = data))
  .catch(() => {});

// --- Camara + control por manos -------------------------------------
navigator.mediaDevices
  .getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
  .then((stream) => {
    video.srcObject = stream;
    iniciarManos({
      video,
      getEstado: () => estadoActual,
      onGesto: ({ tipo, direccion }) =>
        socket.emit('accion', { evento: tipo, direccion }),
      onManos: (d) => (datosManos = d),
    }).catch((e) => console.warn('manos:', e.message));
  })
  .catch((err) => {
    console.warn('camara no disponible:', err.message);
    const a = document.createElement('div');
    a.className = 'aviso';
    a.textContent = 'Camara no disponible (' + err.name + ')';
    body.appendChild(a);
  });

// --- Escena 3D -----------------------------------------------------
const escena = crearEscena($('#gl'));
const escenario = crearEscenarioPop(escena.scene);
const cat3D = crearCatalogo3D(escena);
const letra3D = crearLetra3D(escena);
const audioViz = crearAudioReactivo(escena.scene, audio);
const manosNeon = crearManosNeon(escena);

cat3D.grupo.visible = false;
letra3D.grupo.visible = false;

escena.onFrame((dt, t) => {
  const energia = audioViz.energia();
  escenario.update(dt, t, energia);
  audioViz.update(dt, t);
  cat3D.update(dt, t);
  letra3D.update(dt, t);
  manosNeon.update(datosManos, dt, t);
});

// --- QR de onboarding --------------------------------------------
fetch('/api/qr-control')
  .then((r) => r.json())
  .then(({ dataUrl }) => {
    if (dataUrl) {
      $('#qrOnboard').src = dataUrl;
      $('#qrResultado').src = dataUrl;
    }
  })
  .catch(() => {});

// --- Estado global ---------------------------------------------
socket.on('estado', (snap) => {
  const cambio = snap.nombre !== estadoPrevio;
  estadoActual = snap.nombre;
  body.dataset.estado = snap.nombre;

  if (snap.canciones?.length && snap.canciones.length !== catalogo.length) {
    catalogo = snap.canciones;
    cat3D.setCanciones(catalogo);
    renderCatalogoDOM();
  }

  cat3D.grupo.visible = ['SELECCIONANDO', 'CONFIRMADA'].includes(snap.nombre);
  letra3D.grupo.visible = snap.nombre === 'PLAYING';

  switch (snap.nombre) {
    case 'SELECCIONANDO':
      cat3D.setIndice(snap.indiceCancion);
      marcarActivaDOM(snap.indiceCancion);
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

// --- Catalogo DOM (respaldo accesible) -------------------------
function renderCatalogoDOM() {
  const ul = $('#catalogo');
  ul.innerHTML = '';
  catalogo.forEach((c) => {
    const li = document.createElement('li');
    li.innerHTML = `${c.titulo} <span style="opacity:.6">· ${c.artista}</span>`;
    ul.appendChild(li);
  });
}
function marcarActivaDOM(i) {
  const ul = $('#catalogo');
  [...ul.children].forEach((li, k) => li.classList.toggle('activa', k === i));
  ul.children[i]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// --- PLAYING: audio + letra ----------------------------------
let letras = [];
let idxLetra = -1;
let loopId = null;
let t0 = 0;
let fallback = true;
let finTimer = null;

async function arrancarCancion(cancion) {
  const meta =
    catalogoFull.find((c) => c.id === cancion?.id) ||
    catalogo.find((c) => c.id === cancion?.id) ||
    cancion;
  letras = [];
  idxLetra = -1;
  fallback = true;
  t0 = performance.now();
  clearTimeout(finTimer);
  letra3D.setLineas('', '');

  if (meta?.lrc) {
    try {
      letras = parsearLRC(await fetch(meta.lrc).then((r) => r.text()));
    } catch (e) {
      console.warn('letra:', e.message);
    }
  }

  const dur = meta?.duracion || 40;
  if (meta?.audio) {
    audio.src = meta.audio;
    audio.currentTime = 0;
    audio.load();
    audio.play().catch(() => {});
    audio.addEventListener('playing', () => { fallback = false; clearTimeout(finTimer); }, { once: true });
    audio.addEventListener('ended', () => socket.emit('cancion-fin'), { once: true });
    audio.addEventListener('error', () => { fallback = true; }, { once: true });
  }
  finTimer = setTimeout(() => { if (fallback) socket.emit('cancion-fin'); }, dur * 1000);

  clearInterval(loopId);
  loopId = setInterval(tickLetra, 50);
}

function tickLetra() {
  const t = !fallback && !audio.paused ? audio.currentTime : (performance.now() - t0) / 1000;
  const nuevo = indiceActual(letras, t);
  if (nuevo !== idxLetra) {
    idxLetra = nuevo;
    letra3D.setLineas(letras[nuevo]?.texto ?? '', letras[nuevo + 1]?.texto ?? '');
  }
}

function detenerCancion() {
  clearInterval(loopId);
  loopId = null;
  clearTimeout(finTimer);
  letra3D.limpiar();
  try {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  } catch {}
}

// --- RESULTADO ---------------------------------------------
function mostrarResultado(snap) {
  detenerCancion();
  const el = $('#puntajeFinal');
  let v = 0;
  const meta = snap.puntaje ?? 0;
  clearInterval(el._t);
  el._t = setInterval(() => {
    v = Math.min(meta, v + Math.max(1, Math.round(meta / 40)));
    el.textContent = v;
    if (v >= meta) clearInterval(el._t);
  }, 25);
}

function flash(texto) {
  const el = $('#feedbackFlash');
  el.textContent = texto;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 1200);
}
