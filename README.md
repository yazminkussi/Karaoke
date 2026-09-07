# Karaoke interactivo

Proyecto de **Redes y Tecnología** — Iara Churba, Yazmin Kussi, Rocío Prieto Valdez.

> Sentite un cantante profesional, viví tu era popstar.

Instalación de karaoke: la persona se ve a sí misma en un escenario pop 3D y
**controla todo desde la cámara** — gestos con la mano (MediaPipe) y comandos de
voz. No hay control por celular. Un servidor Node + Socket.IO mantiene la máquina
de estados (y más adelante recibe el sensor ultrasónico del Arduino).

## Arquitectura

```
web/     -> frontend Astro + Vite + Three.js + MediaPipe + Web Speech API
server/  -> "el cerebro": Express + Socket.IO + maquina de estados + catalogo
```

Dos procesos. En dev el frontend corre con `astro dev` (:4321) y habla con el
cerebro (:3000) por WebSocket. `npm start` compila el frontend y lo sirve todo
desde el :3000.

```
                 gestos (MediaPipe Hands) + voz (Web Speech)
[ camara de la pantalla ] ──acciones──► [ server :3000 ] ──estado──► [ pantalla (Three.js) ]
[ sensor ultrasonico Arduino ] ──WS/Serial──►   (maquina de estados)
```

## Arranque

```bash
npm install       # instala y baja los modelos de MediaPipe (postinstall)
npm run dev
```

Abrí http://localhost:4321/ en la compu (Chrome/Edge para la voz). La primera
vez pide permiso de **cámara** y **micrófono**.

`npm start` = build + todo en el :3000 (lo que usarías en el evento).

## Máquina de estados

`ESPERANDO → SELECCIONANDO → CONFIRMADA → COUNTDOWN → PLAYING → RESULTADO → ESPERANDO`

La autoridad es el servidor ([server/stateMachine.js](server/stateMachine.js)).
La pantalla solo manda **acciones** y renderiza el `estado`.

## Control por cámara

### Manos — MediaPipe Tasks Vision (`HandLandmarker`)

[web/src/lib/vision.js](web/src/lib/vision.js) corre el modelo sobre el video y
[web/src/lib/manos.js](web/src/lib/manos.js) traduce:

| Gesto | Acción |
|---|---|
| mano visible (ESPERANDO) | `presencia` |
| mano arriba / abajo (SELECCIONANDO) | `scroll` |
| pellizco (pulgar + índice) sostenido ~1s | `confirmar` |
| **gesto de corazón** (dos manos) | efecto: flash 💖 + pulso del escenario |

Además: **filtro de color** de toda la pantalla según cuántas manos hay
(0 = nada, 1 = azul, 2 = verde, corazón = rosa) — adaptado del `pc.html` del
equipo. Los 21 puntos de cada mano se dibujan como **esqueleto neón 3D**
([web/src/three/manosNeon.js](web/src/three/manosNeon.js)) con el color ciclando.

### Voz — Web Speech API (es-ES, solo Chrome/Edge)

[web/src/lib/voz.js](web/src/lib/voz.js):

| Decís | Acción |
|---|---|
| "cantar" / "empezar" / "listo" | `presencia` |
| el **nombre de una canción** de la lista | `seleccionar` |
| "siguiente" / "anterior" | `scroll` |
| "confirmar" / "dale" / "esa" | `confirmar` |
| "salir" / "cancelar" / "basta" | `reset` (o cortar la canción) |

Si el navegador no soporta voz, quedan las manos.

## MediaPipe: assets offline

`npm install` corre [web/scripts/preparar-mediapipe.mjs](web/scripts/preparar-mediapipe.mjs):
copia los `.wasm` a `web/public/mediapipe/wasm` y baja `hand_landmarker.task` a
`web/public/models/` (ambos gitignored). Para forzarlo: `npm -w web run prep:mediapipe`.

## Three.js (pantalla principal)

| Módulo | Qué hace |
|---|---|
| [three/escena.js](web/src/three/escena.js) | renderer + cámara + loop + helpers |
| [three/escenarioPop.js](web/src/three/escenarioPop.js) | fondo 3D: cielo, piso, reflectores, anillos, partículas |
| [three/catalogo3D.js](web/src/three/catalogo3D.js) | lista de canciones flotante |
| [three/letra3D.js](web/src/three/letra3D.js) | letra karaoke 3D (troika-three-text) |
| [three/visualizerAudio.js](web/src/three/visualizerAudio.js) | analizador de audio + aro de barras |
| [three/manosNeon.js](web/src/three/manosNeon.js) | esqueleto neón de hasta 2 manos |

## Agregar canciones

Requiere `yt-dlp` y `ffmpeg`.

```bash
node server/scripts/agregar-cancion.mjs "blank_space" "https://youtu.be/XXXX" "Blank Space" "Taylor Swift" "1989"
```

## Roadmap

1. ✅ Cámara + audio local + letra sincronizada.
2. ✅ Máquina de estados por WebSocket.
3. ✅ Astro + Vite + Three.js (escenario, letra, visualizer, catálogo 3D).
4. ✅ Control **solo por cámara**: manos (MediaPipe) + voz + filtro de color + corazón.
5. ⬜ Biblioteca de 5–10 canciones descargadas y procesadas.
6. ⬜ `ImageSegmenter` de MediaPipe: recortar a la persona y meterla en el escenario.
7. ⬜ `PoseLandmarker`: cuerpo neón estilo Just Dance + puntaje real de performance.
8. ⬜ Sensor ultrasónico (Arduino → serial/HTTP → `accion`).
9. ⬜ Grabación del video + descarga por QR con id único de sesión.
10. ⬜ Efectos de audio (Pedalboard) y mezcla de voz.
