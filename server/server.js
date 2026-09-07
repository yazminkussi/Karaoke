// El cerebro del karaoke interactivo.
// - Coordina la maquina de estados y la reparte por Socket.IO
// - Expone el catalogo de canciones y los archivos de audio/letra
// - En produccion (npm start) tambien sirve el frontend Astro compilado
//
// Arquitectura:
//   [Pantalla principal]  --acciones (manos + voz)-->  [este servidor]
//   [Sensor ultrasonico Arduino] --WebSocket/Serial-->      (maquina de estados)
//
// Ya NO hay control por celular: todo se maneja desde la camara de la pantalla
// principal (MediaPipe Hands + reconocimiento de voz).
//
// En dev el frontend corre aparte con `astro dev` (:4321) y se conecta a este
// socket por su URL absoluta; por eso habilitamos CORS.

import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';
import QRCode from 'qrcode';

import { crearMaquina, ESTADOS } from './stateMachine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const WEB_PORT = process.env.WEB_PORT || 4321; // astro dev
const DIST = join(__dirname, '..', 'web', 'dist');
// Servir el frontend compilado solo cuando se pide explicitamente (npm start).
const SERVIR_BUILD = process.env.SERVE_BUILD === '1' && existsSync(DIST);

const app = express();
app.use(cors());
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// --- Catalogo de canciones ---------------------------------------------
async function cargarCanciones() {
  try {
    const raw = await readFile(join(__dirname, 'canciones', 'canciones.json'), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[canciones] no pude leer canciones.json:', err.message);
    return [];
  }
}

let canciones = await cargarCanciones();

// --- Maquina de estados -----------------------------------------------
const maquina = crearMaquina({
  canciones,
  onCambio: (snap) => io.emit('estado', snap),
});

// --- API -----------------------------------------------------------
app.get('/api/canciones', (_req, res) => res.json(canciones));
app.use('/canciones', express.static(join(__dirname, 'canciones')));

// --- Grabaciones: la pantalla sube el video, el celular lo baja por QR ---
const GRAB = join(__dirname, 'grabaciones');
await mkdir(GRAB, { recursive: true });
const idOk = (s) => /^[A-Za-z0-9]{4,40}$/.test(s || '');

// La pantalla sube el .webm al terminar la cancion.
app.post(
  '/api/video/:sesion',
  express.raw({ type: ['video/webm', 'application/octet-stream'], limit: '250mb' }),
  async (req, res) => {
    if (!idOk(req.params.sesion) || !req.body?.length) return res.sendStatus(400);
    await writeFile(join(GRAB, `${req.params.sesion}.webm`), req.body);
    console.log(`[video] guardado ${req.params.sesion}.webm (${(req.body.length / 1e6).toFixed(1)} MB)`);
    res.json({ ok: true });
  }
);

// El celular escanea el QR y cae aca. `/video/<id>.webm` = el archivo;
// `/video/<id>` = la pagina con el reproductor + boton de descarga.
app.get('/video/:archivo', (req, res) => {
  const a = req.params.archivo;
  if (a.endsWith('.webm')) {
    const s = a.slice(0, -5);
    if (!idOk(s) || !existsSync(join(GRAB, `${s}.webm`))) return res.sendStatus(404);
    return res.sendFile(join(GRAB, `${s}.webm`));
  }
  if (!idOk(a)) return res.sendStatus(404);
  const existe = existsSync(join(GRAB, `${a}.webm`));
  res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Tu video · Karaoke</title>
<style>body{margin:0;background:#0a0716;color:#f2eee5;font-family:system-ui,sans-serif;text-align:center;padding:24px}
h1{font-weight:800}video{width:100%;max-width:520px;border-radius:14px;background:#000}
a.btn{display:inline-block;margin-top:16px;background:#ec2f80;color:#fff;font-weight:700;text-decoration:none;padding:14px 22px;border-radius:999px}
p{opacity:.7}</style></head><body>
<h1>¡Sos una estrella! ⭐</h1>
${existe
  ? `<video src="/video/${a}.webm" controls playsinline></video><br>
     <a class="btn" href="/video/${a}.webm" download="karaoke-${a}.webm">↓ Descargar</a>`
  : `<p>Todavía se está subiendo tu video… recargá en unos segundos.</p>
     <script>setTimeout(()=>location.reload(),4000)</script>`}
</body></html>`);
});

// QR de la pantalla de RESULTADO -> pagina de descarga del video.
app.get('/api/qr-resultado', async (req, res) => {
  const sesion = req.query.sesion || '';
  const url = `http://${ipLocal()}:${PORT}/video/${sesion}`;
  try {
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 320 });
    res.json({ url, dataUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Frontend compilado (solo con npm start) ------------------------
if (SERVIR_BUILD) {
  app.use(express.static(DIST));
  app.get('/', (_req, res) => res.sendFile(join(DIST, 'index.html')));
}

// --- Socket.IO ----------------------------------------------------
io.on('connection', (socket) => {
  const rol = socket.handshake.query.rol || 'desconocido';
  console.log(`[socket] conexion (${rol}) ${socket.id}`);

  // La pantalla es EL show: si (re)carga, siempre volvemos al inicio.
  // Nunca debe abrir en el medio de una cancion.
  if (rol === 'pantalla' && maquina.nombre !== ESTADOS.ESPERANDO) {
    maquina.enviar('reset');
  }

  socket.emit('estado', maquina.snapshot());

  // La pantalla (gestos + voz) y el sensor mandan acciones aca.
  socket.on('accion', ({ evento, ...payload } = {}) => {
    if (!evento) return;
    console.log(`[accion] ${rol} -> ${evento}`, payload);
    const ok = maquina.enviar(evento, payload);
    if (!ok) socket.emit('accion-rechazada', { evento, estado: maquina.nombre });
  });

  // La pantalla avisa cuando la cancion termino.
  socket.on('cancion-fin', () => maquina.enviar('fin'));

  // Puntaje calculado por la pantalla (performance) al terminar.
  socket.on('puntaje', ({ valor } = {}) => maquina.enviar('fin', { puntaje: valor }));

  socket.on('disconnect', () =>
    console.log(`[socket] desconexion (${rol}) ${socket.id}`)
  );
});

// --- Arranque ---------------------------------------------------
httpServer.listen(PORT, () => {
  const front = SERVIR_BUILD ? PORT : WEB_PORT;
  console.log('\n  Karaoke interactivo - el cerebro');
  console.log('  ---------------------------------');
  console.log(`  Socket.IO / API   : http://localhost:${PORT}`);
  console.log(`  Pantalla principal : http://localhost:${front}/  ${SERVIR_BUILD ? '(build)' : '(astro dev)'}`);
  console.log(`  Estado inicial     : ${ESTADOS.ESPERANDO}`);
  console.log(`  Canciones cargadas : ${canciones.length}`);
  console.log('  Control: manos (MediaPipe) + voz, desde la camara de la pantalla\n');
});

function ipLocal() {
  const ifaces = os.networkInterfaces();
  for (const nombre of Object.keys(ifaces)) {
    for (const iface of ifaces[nombre] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}
