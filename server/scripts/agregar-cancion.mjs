// Helper para armar la biblioteca local de canciones (Opcion A de la guia).
//
//   node scripts/agregar-cancion.mjs "<id>" "<url youtube>" "<titulo>" "<artista>" [era]
//
// Requiere yt-dlp y ffmpeg en el PATH:
//   Windows : choco install yt-dlp ffmpeg      (o scoop install yt-dlp ffmpeg)
//   Mac     : brew install yt-dlp ffmpeg
//   pip     : pip install yt-dlp --break-system-packages
//
// Descarga el audio a canciones/<id>/<id>.mp3, intenta bajar la letra
// sincronizada de lrclib.net a canciones/<id>/<id>.lrc, y agrega/actualiza
// la entrada en canciones/canciones.json.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const [, , id, url, titulo, artista, era] = process.argv;

if (!id || !url || !titulo || !artista) {
  console.error(
    'uso: node scripts/agregar-cancion.mjs "<id>" "<url>" "<titulo>" "<artista>" [era]'
  );
  process.exit(1);
}

const dir = join(raiz, 'canciones', id);
mkdirSync(dir, { recursive: true });
const mp3 = join(dir, `${id}.mp3`);
const lrc = join(dir, `${id}.lrc`);

console.log(`\n[1/3] descargando audio -> ${mp3}`);
execFileSync(
  'yt-dlp',
  ['-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', join(dir, `${id}.%(ext)s`), url],
  { stdio: 'inherit' }
);

console.log(`\n[2/3] buscando letra sincronizada en lrclib.net`);
let duracion = 0;
try {
  const q = new URLSearchParams({ track_name: titulo, artist_name: artista });
  const data = await fetch(`https://lrclib.net/api/get?${q}`).then((r) =>
    r.ok ? r.json() : null
  );
  if (data?.syncedLyrics) {
    writeFileSync(lrc, data.syncedLyrics, 'utf8');
    duracion = Math.round(data.duration || 0);
    console.log(`   letra guardada -> ${lrc}`);
  } else {
    console.log('   sin match exacto. Proba el endpoint /api/search o cargala a mano.');
    if (!existsSync(lrc)) writeFileSync(lrc, `[00:00.00]${titulo}\n`, 'utf8');
  }
} catch (err) {
  console.warn('   error consultando lrclib:', err.message);
}

console.log(`\n[3/3] actualizando canciones/canciones.json`);
const jsonPath = join(raiz, 'canciones', 'canciones.json');
const lista = JSON.parse(readFileSync(jsonPath, 'utf8'));
const entrada = {
  id,
  titulo,
  artista,
  era: era || null,
  audio: `/canciones/${id}/${id}.mp3`,
  lrc: `/canciones/${id}/${id}.lrc`,
  duracion: duracion || 210,
};
const i = lista.findIndex((c) => c.id === id);
if (i >= 0) lista[i] = entrada;
else lista.push(entrada);
writeFileSync(jsonPath, JSON.stringify(lista, null, 2) + '\n', 'utf8');

console.log(`\nListo. "${titulo}" agregada. Reinicia el servidor para verla.\n`);
