// Servidor central del karaoke interactivo.
// - Sirve la pantalla principal (/) y el control del celular (/control)
// - Coordina la maquina de estados y la reparte a todos por Socket.IO
// - Expone el catalogo de canciones y los archivos de audio/letra
//
// Arquitectura (ver investigacion):
//   [Control celular] --WebSocket--> [este servidor] --WebSocket--> [Pantalla principal]
//   [Sensor/camara]  --WebSocket-->      ^

import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';
import QRCode from 'qrcode';

import { crearMaquina, ESTADOS } from './src/stateMachine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

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

// --- Rutas de paginas (antes del static para evitar redirecciones) -----
app.get('/', (_req, res) =>
  res.sendFile(join(__dirname, 'public', 'pantalla', 'index.html'))
);
app.get('/control', (_req, res) =>
  res.sendFile(join(__dirname, 'public', 'control', 'index.html'))
);

// --- Archivos estaticos -------------------------------------------------
app.use(express.static(join(__dirname, 'public')));
app.use('/canciones', express.static(join(__dirname, 'canciones')));

app.get('/api/canciones', (_req, res) => res.json(canciones));

// QR que apunta al control remoto (para la pantalla de RESULTADO / onboarding)
app.get('/api/qr-control', async (_req, res) => {
  const url = `http://${ipLocal()}:${PORT}/control`;
  try {
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 320 });
    res.json({ url, dataUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Socket.IO ----------------------------------------------------------
io.on('connection', (socket) => {
  const rol = socket.handshake.query.rol || 'desconocido';
  console.log(`[socket] conexion (${rol}) ${socket.id}`);

  // estado actual al recien llegado
  socket.emit('estado', maquina.snapshot());

  // El control del celular y el sensor mandan acciones aca.
  socket.on('accion', ({ evento, ...payload } = {}) => {
    if (!evento) return;
    console.log(`[accion] ${rol} -> ${evento}`, payload);
    const ok = maquina.enviar(evento, payload);
    if (!ok) {
      socket.emit('accion-rechazada', { evento, estado: maquina.nombre });
    }
  });

  // Reacciones del celular -> flash en la pantalla principal.
  socket.on('feedback-control', ({ texto } = {}) => {
    if (texto) io.emit('feedback', { texto });
  });

  // La pantalla principal avisa cuando la cancion termino.
  socket.on('cancion-fin', () => maquina.enviar('fin'));

  // Puntaje calculado por la pantalla (ml5/performance) al terminar.
  socket.on('puntaje', ({ valor } = {}) =>
    maquina.enviar('fin', { puntaje: valor })
  );

  socket.on('disconnect', () =>
    console.log(`[socket] desconexion (${rol}) ${socket.id}`)
  );
});

// --- Arranque ---------------------------------------------------------
httpServer.listen(PORT, () => {
  const ip = ipLocal();
  console.log('\n  Karaoke interactivo en marcha');
  console.log('  ---------------------------------');
  console.log(`  Pantalla principal : http://localhost:${PORT}/`);
  console.log(`  Control (celular)  : http://${ip}:${PORT}/control`);
  console.log(`  Estado inicial     : ${ESTADOS.ESPERANDO}`);
  console.log(`  Canciones cargadas : ${canciones.length}`);
  console.log('  (celular y compu deben estar en la misma red Wi-Fi)\n');
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
