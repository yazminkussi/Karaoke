// Helper para armar la biblioteca local de canciones.
//
//   node scripts/agregar-cancion.mjs "<id>" "<url youtube>" "<titulo>" "<artista>" [era]
//
// Necesita yt-dlp (pip install yt-dlp). Si tenes ffmpeg, baja mp3; si no,
// baja m4a directo (lo reproducen Chrome/Edge sin problema).
//
// Descarga el audio a canciones/<id>/<id>.<ext>, baja la letra sincronizada
// de lrclib.net a canciones/<id>/<id>.lrc, y agrega/actualiza la entrada en
// canciones/canciones.json. Reinicia el servidor para verla.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const [, , id, url, titulo, artista, era] = process.argv;

if (!id || !url || !titulo || !artista) {
  console.error('uso: node scripts/agregar-cancion.mjs "<id>" "<url>" "<titulo>" "<artista>" [era]');
  process.exit(1);
}

// yt-dlp: binario en PATH o `python -m yt_dlp`
function ytdlp(args) {
  const directo = spawnSync('yt-dlp', ['--version'], { stdio: 'ignore' });
  if (directo.status === 0) return execFileSync('yt-dlp', args, { stdio: 'inherit' });
  return execFileSync('python', ['-m', 'yt_dlp', ...args], { stdio: 'inherit' });
}
const hayFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

const dir = join(raiz, 'canciones', id);
mkdirSync(dir, { recursive: true });
const lrc = join(dir, `${id}.lrc`);

console.log(`\n[1/3] descargando audio (${hayFfmpeg ? 'mp3' : 'm4a'}) -> ${dir}`);
const salida = join(dir, `${id}.%(ext)s`);
ytdlp(
  hayFfmpeg
    ? ['--no-playlist', '-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', salida, url]
    : ['--no-playlist', '-f', 'bestaudio[ext=m4a]/bestaudio/best', '-o', salida, url]
);

// que archivo quedo
const archivo = readdirSync(dir).find((f) => f.startsWith(`${id}.`) && !f.endsWith('.lrc'));
const ext = archivo ? archivo.split('.').pop() : hayFfmpeg ? 'mp3' : 'm4a';

console.log(`\n[2/3] letra sincronizada de lrclib.net`);
let duracion = 0;
try {
  const q = new URLSearchParams({ track_name: titulo, artist_name: artista });
  const data = await fetch(`https://lrclib.net/api/get?${q}`).then((r) => (r.ok ? r.json() : null));
  if (data?.syncedLyrics) {
    writeFileSync(lrc, data.syncedLyrics, 'utf8');
    duracion = Math.round(data.duration || 0);
    console.log(`   letra guardada -> ${lrc}`);
  } else {
    console.log('   sin match exacto. Proba /api/search o cargala a mano.');
    if (!existsSync(lrc)) writeFileSync(lrc, `[00:00.00]${titulo}\n`, 'utf8');
  }
} catch (err) {
  console.warn('   error consultando lrclib:', err.message);
}

console.log(`\n[3/3] canciones/canciones.json`);
const jsonPath = join(raiz, 'canciones', 'canciones.json');
const lista = JSON.parse(readFileSync(jsonPath, 'utf8'));
const entrada = {
  id,
  titulo,
  artista,
  era: era || null,
  audio: `/canciones/${id}/${id}.${ext}`,
  lrc: `/canciones/${id}/${id}.lrc`,
  duracion: duracion || 210,
  offsetLetra: 0,
};
const i = lista.findIndex((c) => c.id === id);
if (i >= 0) lista[i] = { ...lista[i], ...entrada };
else lista.push(entrada);
writeFileSync(jsonPath, JSON.stringify(lista, null, 2) + '\n', 'utf8');

console.log(
  `\nListo. "${titulo}" agregada. Si la letra va adelantada/atrasada, ajustala\n` +
    `en vivo con [ y ] durante PLAYING y guarda el valor en "offsetLetra".\n`
);
