# Investigación: features nuevas + puntaje + grabación

Notas para decidir qué hacer y cómo. Cada item tiene: **qué es**, **cómo**,
**esfuerzo** (🟢 fácil / 🟡 medio / 🔴 grande) y cómo engancha con lo que ya hay.

---

## 1. Barra de progreso 🟢 — HECHO

Barra abajo de la pantalla en PLAYING que muestra `currentTime / duración`.
Implementada en `web/src/lib/pantalla.js` + `#progreso` en el CSS. Se alimenta del
mismo reloj que la letra (audio real o reloj interno de fallback).

---

## 2. "Ir diciendo qué palabra" (karaoke word-by-word) 🟡 — HECHO (interpolado)

**El problema:** lrclib.net da timestamps **por línea**, no por palabra. El
formato que sí tiene palabra por palabra es **Enhanced LRC / "A2"**
(`<00:14.32>Never <00:14.91>gonna ...`), pero casi ninguna canción lo tiene.

**Lo que hicimos:** interpolar. Dentro de una línea, repartimos el tiempo entre
`tiempo[i]` y `tiempo[i+1]` proporcional a la cantidad de caracteres de cada
palabra. No es perfecto (una palabra larga y lenta se estira mal) pero para
guiar "vas por acá" alcanza. La palabra actual se resalta con el marcador rosa.

**Para mejorar (fase 2):**
- Enhanced LRC a mano para las 5-10 canciones del set (tedioso pero exacto).
- Forced alignment: pasar el `.lrc` + el `.mp3` por un modelo tipo
  **whisperX** o **aeneas** offline → genera word-level. Es lo que hacen las
  apps grosas. Se corre una vez por canción, no en vivo.

Ref: [Enhanced LRC / A2](https://www.quicklrc.com/subtitle-formats/enhanced-lrc),
[ejemplos](https://easylrc.com/blog/enhanced-lrc-format-examples).

---

## 3. Dúo / canciones de a dos 🟡🔴

**Diseño propuesto (no implementado):**

- Campo `voces` en `canciones.json`: `"solo"` | `"duo"`. Para dúo, marcar en el
  `.lrc` a quién le toca cada línea (`[00:12.66] P1: ...` / `[00:20.71] P2: ...`
  o un `.json` de reparto aparte).
- La cámara ya detecta **2 caras** (MediaPipe `FaceDetector`). Se puede asignar
  "izquierda / derecha" por la posición X de cada cara y mostrar la línea que le
  toca de cada lado (o resaltar quién canta ahora).
- El puntaje: uno por persona + uno de "juntos" (las líneas compartidas).
- Los gestos de a dos ya funcionan (el corazón necesita las dos manos).

**Lo mínimo para una demo de dúo:** una canción con reparto P1/P2, la letra
partida en dos columnas (izq/der) y el resaltado marcando de quién es el turno.
Sin puntaje separado todavía.

---

## 4. Que reconozca si lo que canto coincide con la letra 🟡 (dos caminos)

### Camino A — barato y local: Web Speech API (ya lo tenemos)

`web/src/lib/voz.js` ya usa `webkitSpeechRecognition`. Se puede reusar en PLAYING:
transcribe lo que se canta y comparamos contra la línea esperada con
`solapamiento()` (fracción de palabras que aparecen). Suma puntos por línea.
- **Gratis, sin backend, sin API key.**
- Contras: el reconocimiento de **canto** (con música de fondo, vocales
  alargadas) es flojo. Chrome/Edge only. Corta y reinicia.

### Camino B — mejor: Groq Whisper (STT en la nube)

Grabamos el audio del micrófono en trozos de ~5-8s y los mandamos a
**Groq `whisper-large-v3-turbo`**:
- **$0.04 / hora** de audio (~US$0.0007 por minuto), factura mínimo 10s por
  request. **Plan free: 2000 requests/día.** Para un evento entra sobrado.
- Latencia bestial: 1h de audio en ~15s → un trozo de 8s vuelve casi instantáneo.
- Devuelve texto (y con `timestamp_granularities` hasta palabras). Comparamos
  contra la línea con la misma lógica de solapamiento, o con distancia de
  Levenshtein normalizada para un puntaje más fino.
- Necesita: cuenta en console.groq.com, API key, y **un endpoint en `server/`**
  que reciba el audio y le pegue a Groq (la key NO va en el frontend).

Ref: [Groq Whisper docs](https://console.groq.com/docs/model/whisper-large-v3-turbo),
[pricing 2026](https://tokenmix.ai/blog/whisper-api-pricing).

### Camino C — el que usan SingStar / Smule: pitch (afinación), no palabras

Las apps serias **no** chequean las palabras, chequean la **nota**. Tienen un
"note track" hecho a mano por canción y comparan la frecuencia de tu voz (FFT /
autocorrelación / YIN) contra esa referencia, ignorando la octava. Los sistemas
japoneses (DAM, Joysound) puntúan 3 cosas: **afinación + ritmo + expresión
(dinámica)**.

En el navegador: `AnalyserNode` + librería **pitchy** (McLeod) o **pitchfinder**
(YIN). Detectás la nota que cantás en tiempo real. El problema es la
**referencia**: hay que tener la melodía de cada canción (MIDI o un track de
notas). Eso es lo caro. Para el MVP no vale la pena; es fase 3.

Refs: [pitchy](https://www.npmjs.com/package/pitchy),
[autocorrelación vs YIN](https://pitchdetector.com/autocorrelation-vs-yin-algorithm-for-pitch-detection/),
[cómo puntúa SingStar](https://akitaonrails.com/en/2026/04/05/turning-youtube-into-a-karaoke-app-frank-karaoke/),
[patente de scoring de karaoke](https://patents.google.com/patent/US5889224A).

### Recomendación

MVP: **Camino A** (Web Speech, ya está, gratis) para un puntaje "cantaste las
palabras". Si querés que quede mejor para la entrega: **Camino B (Groq)** — poco
código, barato, y suena a "usamos IA". Pitch (C) queda para más adelante.

---

## 5. "Que te aparezcan cosas para hacer y según eso el puntaje" 🟡

Alternativa/complemento al puntaje por voz: **retos en pantalla** que se detectan
con MediaPipe (que ya corre).

Ejemplos de retos, cada uno vale X puntos:
- "Hacé un corazón 💖" → ya lo detectamos (`esCorazon`, dos manos).
- "Levantá las dos manos" → landmarks de muñeca por encima de la nariz.
- "Aplaudí" → dos manos que se juntan y separan rápido.
- "Señalá a la cámara" → índice extendido hacia el centro.
- (con `PoseLandmarker`) "Saltá", "girá", "brazos en cruz".

Diseño: un `retos.js` con una lista `{ texto, chequear(datos) -> bool, puntos }`.
En PLAYING, cada ~15-20s aparece un reto (cartel arriba), si lo cumplís antes de
que se acabe el tiempo suma. El puntaje final = puntaje de voz + puntaje de retos.

Esto es **más divertido y más confiable** que el reconocimiento de voz, y usa lo
que ya tenemos. **Recomiendo hacer esto sí o sí** aunque no hagamos el de voz.

También se puede entrenar poses puntuales con **Teachable Machine** (está en la
investigación del PDF) y exportar a TensorFlow.js.

---

## 6. Competencia + cómo puntúan

| App | Cómo puntúa | Se lleva video |
|---|---|---|
| **SingStar** (PS) | note track a mano por canción, FFT vs pitch, ignora octava | no |
| **Smule** | melodía score-coded + autotune en tiempo real; "score" mezcla pitch + timing | sí, clips |
| **Sing King** (YouTube) | no puntúa, solo letra word-by-word bien hecha | no |
| **Musixmatch** | letra word-by-word (referencia de UI) | no |
| **StarMaker / Smule** | pitch + engagement | sí |
| **DAM / Joysound** (Japón) | pitch + ritmo + expresión (dinámica), muy detallado | a veces |
| **Consolas modernas / apps AI** ("ANYSING") | modelos de scoring por IA | sí |

**Conclusión para nosotros:** nadie chequea "dijiste bien las palabras" excepto
apps chiquitas. El estándar es **pitch + timing**. Como pitch es caro (necesita
referencia por canción), nuestra jugada realista es:
**retos MediaPipe (5) + opcional voz (4A/4B)**, y venderlo como "karaoke
interactivo" más que "karaoke de precisión".

Refs: [guía de juegos de karaoke 2026](https://www.mykaraoke.video/blog/games-karaoke-online),
[foro sobre el score de Smule](https://sing.salon/forums/topic/783-smule-score-what-is-it-and-how-do-they-arrive-at-this-score/).

---

## 7. Llevarte el video / grabar mientras cantás 🟡 — SCAFFOLD HECHO

**Cómo funciona la grabación en el navegador:**

1. `canvas.captureStream(30)` te da un `MediaStream` de video del canvas (mudo).
2. El audio se **mezcla con Web Audio**: `AudioContext` +
   `createMediaStreamDestination()`, le conectás el micrófono y la pista de la
   canción → un solo track de audio. (Chrome sólo toma el primer track de audio
   si los agregás sueltos, por eso hay que mezclarlos.)
3. `new MediaStream([videoTrack, audioTrack])` → `new MediaRecorder(stream,
   { mimeType: 'video/webm;codecs=vp9,opus' })`.
4. `recorder.start()` en PLAYING, `recorder.stop()` en RESULTADO,
   juntás los `dataavailable` en un `Blob`, `URL.createObjectURL(blob)`.

**El tema del canvas:** hoy el poster es DOM (texto, SVG, video). Para grabar
"lo que se ve" hay que dibujar todo en UN canvas: cámara espejada + esqueleto de
manos + una línea de letra + una marca de agua. No hace falta clonar el poster
entero — alcanza una "vista de grabación" más simple. Eso está scaffoldeado en
`web/src/lib/grabacion.js` (graba cámara + audio; el compositor con overlays es
el TODO).

**Entregar el video (dos opciones):**
- **Local:** botón "descargar" en RESULTADO → baja el `.webm`. Simple, ya se
  puede. Lo malo: si la pantalla es un proyector, no hay dónde bajarlo.
- **Por QR (lo que queremos):** el `server/` guarda el blob (POST a
  `/api/video/:sesion`) y el QR de RESULTADO apunta a
  `http://IP:PUERTO/video/:sesion` → una página con el `<video>` y un botón de
  descarga. `:sesion` es el id único que ya genera la máquina de estados
  (`estado.sesionId`). Falta: el endpoint de subida + la página de descarga.

"En paralelo": sí, `MediaRecorder` graba en background sin frenar nada; el blob
se arma solo cuando parás.

Refs: [mixing screen+webcam+audio](https://commerce.nearform.com/blog/2022/screen-webcam-mixing-recording/),
[guía MediaRecorder (Mux)](https://www.mux.com/blog/how-to-use-mediarecorder),
[MediaStream API para grabar](https://dev.to/antopiras89/using-the-mediastream-web-api-to-record-screen-camera-and-audio-1c4n).

---

## 8. "¿Con qué hicimos las animaciones?"

Sin librería de animación (nada de GSAP / anime.js / Framer Motion). Todo con
lo del navegador:

- **CSS `@keyframes` + `transition`**: el latido del countdown, el subrayado
  rosa de la letra que "entra", el flash del corazón, el pill de voz que
  parpadea, la estrella que gira (`animation: girar 44s linear infinite`).
- **SVG**: la estrella (path generado en JS) + su copia negra corrida.
- **`requestAnimationFrame`**: el loop que hace latir la estrella con el audio
  (`escenario.latir(energia)`), y antes el dibujo del esqueleto de manos.
- **MediaPipe Tasks Vision**: tracking de manos y detección de cara.
- **Web Audio `AnalyserNode`**: la "energía" 0..1 que mueve la estrella.
- **Canvas 2D**: el esqueleto de la mano (líneas de tinta).

Si en algún momento queremos transiciones más ricas entre estados, ahí sí
metería **Motion One** (chiquita, API de Web Animations) o GSAP.

---

## Orden sugerido

1. ✅ Barra de progreso.
2. ✅ Palabra por palabra (interpolado).
3. ✅ Scaffold de grabación (cámara + audio).
4. **Retos MediaPipe + puntaje** (item 5) — el mejor costo/beneficio.
5. **Entrega del video por QR** (endpoint + página de descarga) — item 7.
6. Voz → puntaje con Groq (item 4B) — si queremos el "usamos IA".
7. Dúo (item 3).
8. Compositor de la grabación con overlays (item 7, el TODO).
9. Pitch / afinación (item 4C) — sólo si sobra tiempo.
