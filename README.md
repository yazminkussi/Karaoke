# Karaoke interactivo

Proyecto de **Redes y Tecnología** — Iara Churba, Yazmin Kussi, Rocío Prieto Valdez.

> Sentite un cantante profesional, viví tu era popstar.

Instalación interactiva de karaoke: la persona se ve a sí misma en pantalla (self-view
espejado), canta sobre una pista local con la letra sincronizada tipo karaoke, y controla
todo desde el celular (o por gestos / sensor de proximidad). Un servidor Node + Socket.IO
coordina la máquina de estados entre el control, el/los sensores y la pantalla principal.

## Arranque rápido

```bash
npm install
npm run dev
```

- Pantalla principal (el "escenario"): http://localhost:3000/
- Control (celular, misma red Wi-Fi): http://TU-IP-LOCAL:3000/control
  (la IP la imprime el servidor al arrancar; también hay un QR en la pantalla de inicio)

La primera vez el navegador va a pedir permiso de **cámara** en la pantalla principal.
Viene con una **canción demo** (sin audio real, usa un reloj interno) para probar la
sincronización de letra de punta a punta sin descargar nada.

## Máquina de estados

`ESPERANDO → SELECCIONANDO → CONFIRMADA → COUNTDOWN → PLAYING → RESULTADO → ESPERANDO`

La autoridad es el servidor ([src/stateMachine.js](src/stateMachine.js)). Los clientes
solo mandan **acciones** y renderizan el `estado` que reciben por Socket.IO.

| Acción (evento) | Desde | Efecto |
|---|---|---|
| `presencia` | sensor / botón control | ESPERANDO → SELECCIONANDO |
| `scroll` (`direccion: arriba\|abajo`) | gesto / control | mueve el índice del catálogo |
| `seleccionar` (`indice`) | control | fija la canción |
| `confirmar` | hold gesto / control | SELECCIONANDO → CONFIRMADA → (auto) COUNTDOWN → PLAYING |
| `interrupcion` | control | PLAYING → RESULTADO |
| `reset` | control / timeout | vuelve a ESPERANDO |

`cancion-fin` lo emite la pantalla principal cuando termina el audio.

## Estructura

```
server.js                 servidor Express + Socket.IO + QR
src/stateMachine.js       máquina de estados (servidor = autoridad)
public/pantalla/          "el escenario": cámara + audio + letra karaoke
public/control/           webapp del celular
public/shared/lrc.js      parser de archivos .lrc
canciones/canciones.json  catálogo
canciones/<id>/<id>.mp3   pista de audio (no versionada)
canciones/<id>/<id>.lrc   letra sincronizada
scripts/agregar-cancion.mjs   descarga audio (yt-dlp) + letra (lrclib.net)
```

## Agregar canciones (biblioteca local)

Requiere `yt-dlp` y `ffmpeg` en el PATH.

```bash
node scripts/agregar-cancion.mjs "blank_space" "https://www.youtube.com/watch?v=XXXX" "Blank Space" "Taylor Swift" "1989"
```

Baja el audio a `canciones/blank_space/blank_space.mp3`, intenta traer la letra
sincronizada de [lrclib.net](https://lrclib.net), y actualiza `canciones.json`.
Reiniciá el servidor para verla en el catálogo.

## Roadmap (orden sugerido)

1. ✅ Cámara espejada + audio local + letra sincronizada (una canción).
2. ✅ Máquina de estados por WebSocket + control del celular.
3. ⬜ Biblioteca de 5–10 canciones descargadas y procesadas.
4. ⬜ Gestos con `ml5.js` / `handpose` para scroll y confirmar sin tocar el celular.
5. ⬜ Sensor ultrasónico (Arduino → serial/HTTP → `accion: presencia` / `scroll`).
6. ⬜ Fondo "escenario pop" con MediaPipe Image Segmenter.
7. ⬜ Grabación del video + descarga por QR con id único de sesión.
8. ⬜ Efectos de audio (Pedalboard) y mezcla de voz.
```
