# Karaoke interactivo

Proyecto de **Redes y Tecnología** — Iara Churba, Yazmin Kussi, Rocío Prieto Valdez.

> Sentite un cantante profesional, viví tu era popstar.

Instalación de karaoke: la persona se ve a sí misma en un escenario pop 3D, canta
sobre una pista local con la letra sincronizada, y **selecciona con la mano** (o
con el celular / un sensor). Un servidor Node + Socket.IO coordina la máquina de
estados entre el control, los sensores y la pantalla principal.

## Arquitectura

```
web/     -> frontend Astro + Vite + Three.js (pantalla principal y control del celular)
server/  -> "el cerebro": Express + Socket.IO + maquina de estados + catalogo
```

Son **dos procesos**. En dev el frontend corre con `astro dev` (:4321) y se
conecta al cerebro (:3000) por WebSocket. En producción el cerebro también sirve
el build (`web/dist`) y queda todo en el :3000.

```
[Control celular]  --WS-->                        --WS--> [Pantalla principal]
[Gestos con la mano] --acciones-->  [server :3000]  ---->  (Three.js: escenario,
[Sensor ultrasonico Arduino] --->                          catalogo, letra, manos neon)
```

## Arranque

```bash
npm install
npm run dev
```

- Pantalla principal: http://localhost:4321/
- Control (celular, misma Wi-Fi): `http://TU-IP:4321/control` (la IP la imprime el server; hay QR en la pantalla de inicio)

Para el modo "todo junto" en un solo puerto (lo que usarías en el evento):

```bash
npm start        # build del frontend + server sirviendo todo en :3000
```

Viene con una **canción demo** (sin audio real, usa un reloj interno) para probar
la sincronización de letra de punta a punta sin descargar nada.

## Máquina de estados

`ESPERANDO → SELECCIONANDO → CONFIRMADA → COUNTDOWN → PLAYING → RESULTADO → ESPERANDO`

La autoridad es el servidor ([server/stateMachine.js](server/stateMachine.js)). Los
clientes solo mandan **acciones** y renderizan el `estado` que reciben.

| Acción | Desde | Efecto |
|---|---|---|
| `presencia` | sensor / mano visible / botón | ESPERANDO → SELECCIONANDO |
| `scroll` (`direccion`) | mano arriba/abajo / botón | mueve el índice del catálogo |
| `seleccionar` (`indice`) | control | fija la canción |
| `confirmar` | pellizco sostenido / botón | → CONFIRMADA → (auto) COUNTDOWN → PLAYING |
| `interrupcion` | control | PLAYING → RESULTADO |
| `reset` | control / timeout | vuelve a ESPERANDO |

## Control por manos (ml5.js / MediaPipe Hands)

[web/src/lib/manos.js](web/src/lib/manos.js) corre `handPose` sobre la cámara y traduce:

- **mano visible** en ESPERANDO → `presencia`
- **mano arriba / abajo** en SELECCIONANDO → `scroll`
- **pellizco** (pulgar + índice) sostenido ~1s → `confirmar`

Los 21 puntos de la mano se dibujan como **esqueleto neón en 3D**
([web/src/three/manosNeon.js](web/src/three/manosNeon.js)), con el color
cambiando todo el tiempo y a dorado al confirmar. Necesita internet la primera
vez (baja el modelo). Si ml5 no carga, el control por celular sigue andando.

## Three.js (pantalla principal)

| Módulo | Qué hace |
|---|---|
| [three/escena.js](web/src/three/escena.js) | renderer + cámara + loop + helpers de coordenadas |
| [three/escenarioPop.js](web/src/three/escenarioPop.js) | fondo 3D: cielo, piso con grilla, reflectores, anillos, partículas |
| [three/catalogo3D.js](web/src/three/catalogo3D.js) | lista de canciones flotante que sigue el índice activo |
| [three/letra3D.js](web/src/three/letra3D.js) | letra karaoke en 3D (troika-three-text) |
| [three/visualizerAudio.js](web/src/three/visualizerAudio.js) | analizador de audio + aro de barras + `energia()` para el resto |
| [three/manosNeon.js](web/src/three/manosNeon.js) | esqueleto neón de la mano |

## Agregar canciones (biblioteca local)

Requiere `yt-dlp` y `ffmpeg` en el PATH.

```bash
node server/scripts/agregar-cancion.mjs "blank_space" "https://www.youtube.com/watch?v=XXXX" "Blank Space" "Taylor Swift" "1989"
```

Baja el audio a `server/canciones/blank_space/blank_space.mp3`, la letra
sincronizada de [lrclib.net](https://lrclib.net), y actualiza `canciones.json`.
Reiniciá el server para verla.

## Roadmap

1. ✅ Cámara + audio local + letra sincronizada.
2. ✅ Máquina de estados por WebSocket + control del celular.
3. ✅ Migración a Astro + Vite + Three.js (escenario 3D, letra 3D, visualizer, catálogo 3D).
4. ✅ Control por manos (ml5 handPose) + esqueleto neón 3D.
5. ⬜ Biblioteca de 5–10 canciones descargadas y procesadas.
6. ⬜ Reemplazo real del fondo con MediaPipe Image Segmenter (recortar a la persona).
7. ⬜ Sensor ultrasónico (Arduino → serial/HTTP → `accion`).
8. ⬜ Pose completa (cuerpo neón estilo Just Dance) + puntaje real de performance.
9. ⬜ Grabación del video + descarga por QR con id único de sesión.
10. ⬜ Efectos de audio (Pedalboard) y mezcla de voz.
