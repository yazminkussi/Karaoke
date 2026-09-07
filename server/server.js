// El cerebro del karaoke interactivo.
// - Coordina la maquina de estados y la reparte a todos por Socket.IO
// - Expone el catalogo de canciones y los archivos de audio/letra
// - En produccion tambien sirve el frontend Astro ya compilado (web/dist)
//
// Arquitectura (ver investigacion):
//   [Control celular] --WebSocket--> [este servidor] --WebSocket--> [Pantalla principal]
//   [Sensor/camara]  --WebSocket-->      ^
//
// En desarrollo el frontend corre aparte con `astro dev` (puerto 4321) y se
// conecta a este socket por su URL absoluta; por eso habilitamos CORS.

import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { readFile } from 'node:fs/promises';
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

const app = express();
app.use(cors());
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// --- Catalogo de canciones -------------------------------------------------
async function cargarCanciones() {
  try {
    const raw = await readFile(
      join(__dirname, 'canciones', 'canciones.json'),
      'utf8'
    );
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[canciones] no pude leer canciones.json:', err.message);
    return [];
  }
}

let canciones = await cargarCanciones();

// --- Maquina de estados ---------------------------------------------------
const maquina = crearMaquina({
  canciones,
  onCambio: (snap) => io.emit('estado', snap),
});

// --- API --------------------------------------------------------------
app.get('/api/canciones', (_req, res) => res.json(canciones));
app.use('/canciones', express.static(join(__dirname, 'canciones')));

// QR que apunta al control remoto (onboarding + pantalla de RESULTADO)
app.get('/api/qr-control', async (_req, res) => {
  const url = urlControl();
  try {
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 320 });
    res.json({ url, dataUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Frontend compilado (solo en produccion) --------------------------
if (existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('/control', (_req, res) => res.sendFile(join(DIST, 'control', 'index.html')));
  app.get('/', (_req, res) => res.sendFile(join(DIST, 'index.html')));
}

// --- Socket.IO --------------------------------------------------------
io.on('connection', (socket) => {
  const rol = socket.handshake.query.rol || 'desconocido';
  console.log(`[socket] conexion (${rol}) ${socket.id}`);

  socket.emit('estado', maquina.snapshot());

  // Control del celular, gestos y sensor mandan acciones aca.
  socket.on('accion', ({ evento, ...payload } = {}) => {
    if (!evento) return;
    console.log(`[accion] ${rol} -> ${evento}`, payload);
    const ok = maquina.enviar(evento, payload);
    if (!ok) socket.emit('accion-rechazada', { evento, estado: maquina.nombre });
  });

  // Reacciones del celular -> flash en la pantalla principal.
  socket.on('feedback-control', ({ texto } = {}) => {
    if (texto) io.emit('feedback', { texto });
  });

  // La pantalla principal avisa cuando la cancion termino.
  socket.on('cancion-fin', () => maquina.enviar('fin'));

  // Puntaje calculado por la pantalla (ml5/performance) al terminar.
  socket.on('puntaje', ({ valor } = {}) => maquina.enviar('fin', { puntaje: valor }));

  socket.on('disconnect', () =>
    console.log(`[socket] desconexion (${rol}) ${socket.id}`)
  );
});

// --- Arranque -------------------------------------------------------
httpServer.listen(PORT, () => {
  console.log('\n  Karaoke interactivo - el cerebro');
  console.log('  ---------------------------------');
  console.log(`  Socket.IO / API   : http://localhost:${PORT}`);
  if (existsSync(DIST)) {
    console.log(`  Frontend (build)  : http://localhost:${PORT}/`);
  } else {
    console.log(`  Frontend (dev)    : http://localhost:${WEB_PORT}/  (astro dev)`);
  }
  console.log(`  Control (celular)  : ${urlControl()}`);
  console.log(`  Estado inicial     : ${ESTADOS.ESPERANDO}`);
  console.log(`  Canciones cargadas : ${canciones.length}`);
  console.log('  (celular y compu deben estar en la misma red Wi-Fi)\n');
});

function urlControl() {
  const ip = ipLocal();
  const puerto = existsSync(DIST) ? PORT : WEB_PORT;
  return `http://${ip}:${puerto}/control`;
}

function ipLocal() {
  const ifaces = os.networkInterfaces();
  for (const nombre of Object.keys(ifaces)) {
    for (const iface of ifaces[nombre] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}
