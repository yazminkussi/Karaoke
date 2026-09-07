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

// QR de la pantalla de RESULTADO ("escanea para llevarte tu video").
// TODO: apuntar a la URL real de descarga del video con el id de sesion.
app.get('/api/qr-resultado', async (req, res) => {
  const sesion = req.query.sesion || '';
  const url = `http://${ipLocal()}:${SERVIR_BUILD ? PORT : WEB_PORT}/video/${sesion}`;
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
