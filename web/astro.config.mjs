import { defineConfig } from 'astro/config';

// Sitio 100% estatico (SSG). El "cerebro" (Socket.IO + API) es un proceso
// Node aparte en el puerto 3000; el frontend se conecta por su URL absoluta
// (ver src/lib/socket.js y la variable PUBLIC_SOCKET_URL).
export default defineConfig({
  server: { host: true, port: 4321 },
  vite: {
    server: {
      // proxy opcional para /api y /canciones durante el dev
      proxy: {
        '/api': 'http://localhost:3000',
        '/canciones': 'http://localhost:3000',
      },
    },
  },
});
