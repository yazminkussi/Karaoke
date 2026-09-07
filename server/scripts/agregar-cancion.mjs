// Agrega una canción a la biblioteca local, con la letra YA SINCRONIZADA a la
// pista de karaoke.
//
//   node server/scripts/agregar-cancion.mjs "<id>" "<url karaoke youtube>" "<titulo>" "<artista>" [era]
//
// Qué hace:
//   1. baja el audio de karaoke (m4a, no necesita ffmpeg para esto)
//   2. baja la letra sincronizada de lrclib.net (está timeada a la versión ORIGINAL)
//   3. baja la versión original (con voz) buscándola en YouTube
//   4. alinea audio-a-audio (DTW) y reescribe la letra con los tiempos de la
//      pista de karaoke  -> server/scripts/alinear.py
//   5. actualiza canciones/canciones.json
//
// Necesita: yt-dlp (`pip install yt-dlp`), y para el paso 3-4: ffmpeg en el PATH
// + `pip install librosa soundfile`. Si el paso 4 falla, deja la letra sin
// alinear y hay que ajustar "offsetLetra" a mano (o con [ y ] en vivo).

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const [, , id, url, titulo, artista, era] = process.argv;

if (!id || !url || !titulo || !artista) {
  console.error('uso: node server/scripts/agregar-cancion.mjs "<id>" "<url>" "<titulo>" "<artista>" [era]');
  process.exit(1);
}

const yt = spawnSync('yt-dlp', ['--version'], { stdio: 'ignore' }).status === 0
  ? (args) => execFileSync('yt-dlp', args, { stdio: 'inherit' })
  : (args) => execFileSync('python', ['-m', 'yt_dlp', ...args], { stdio: 'inherit' });
const ytJSON = (args) => {
  const bin = spawnSync('yt-dlp', ['--version'], { stdio: 'ignore' }).status === 0
    ? ['yt-dlp', args] : ['python', ['-m', 'yt_dlp', ...args]];
  return execFileSync(bin[0], bin[1], { encoding: 'utf8' });
};
const hayFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

const dir = join(raiz, 'canciones', id);
mkdirSync(dir, { recursive: true });
const lrc = join(dir, `${id}.lrc`);

// --- 1. audio de karaoke -----------------------------------------
console.log(`\n[1/5] audio de karaoke -> ${dir}`);
const salida = join(dir, `${id}.%(ext)s`);
yt(['--no-playlist', '-f', 'bestaudio[ext=m4a]/bestaudio/best', '-o', salida, url]);
const archivo = readdirSync(dir).find((f) => f.startsWith(`${id}.`) && !f.endsWith('.lrc'));
const ext = archivo ? archivo.split('.').pop() : 'm4a';
const audioKaraoke = join(dir, `${id}.${ext}`);

// --- 2. letra de lrclib ----------------------------------------
console.log(`\n[2/5] letra sincronizada de lrclib.net`);
let duracionOrig = 0;
try {
  const q = new URLSearchParams({ track_name: titulo, artist_name: artista });
  const data = await fetch(`https://lrclib.net/api/get?${q}`).then((r) => (r.ok ? r.json() : null));
  if (data?.syncedLyrics) {
    writeFileSync(lrc, data.syncedLyrics, 'utf8');
    duracionOrig = Math.round(data.duration || 0);
    console.log(`   ok (${duracionOrig}s en el original)`);
  } else {
    console.log('   sin match. Cargala a mano en', lrc);
    if (!existsSync(lrc)) writeFileSync(lrc, `[00:00.00]${titulo}\n`, 'utf8');
  }
} catch (err) {
  console.warn('   error lrclib:', err.message);
}

// --- 3. version original (con voz) para alinear ------------------
let alineado = false;
if (hayFfmpeg && duracionOrig > 0) {
  const tmpOrig = join(tmpdir(), `karaoke-orig-${id}.m4a`);
  try {
    console.log(`\n[3/5] buscando la versión original (~${duracionOrig}s)`);
    const lista = ytJSON([
      '--no-playlist', '--flat-playlist', '--print', '%(id)s|%(duration)s',
      `ytsearch8:${artista} ${titulo} audio`,
    ])
      .trim()
      .split('\n')
      .map((l) => l.split('|'))
      .filter((p) => p[1] && p[1] !== 'NA')
      .map(([vid, d]) => ({ vid, d: Number(d), diff: Math.abs(Number(d) - duracionOrig) }))
      .sort((a, b) => a.diff - b.diff);
    const elegido = lista.find((x) => x.diff <= 8) || lista[0];
    if (!elegido) throw new Error('no encontré candidatos');
    console.log(`   ${elegido.vid} (${elegido.d}s, dif ${elegido.diff}s)`);
    yt(['--no-playlist', '-f', 'bestaudio[ext=m4a]/bestaudio/best', '-o', tmpOrig,
      `https://www.youtube.com/watch?v=${elegido.vid}`]);

    console.log(`\n[4/5] alineando letra a la pista de karaoke (DTW)`);
    execFileSync('python', [join(raiz, 'scripts', 'alinear.py'), tmpOrig, audioKaraoke, lrc, lrc], {
      stdio: 'inherit',
    });
    alineado = true;
  } catch (err) {
    console.warn(`\n[3-4/5] no pude alinear (${err.message}). La letra queda sin ajustar.`);
  } finally {
    try { rmSync(tmpOrig, { force: true }); } catch {}
  }
} else {
  console.log(`\n[3-4/5] sin ffmpeg o sin letra -> salto la alineación`);
}

// --- 5. canciones.json ---------------------------------------
console.log(`\n[5/5] canciones/canciones.json`);
const jsonPath = join(raiz, 'canciones', 'canciones.json');
const lista = JSON.parse(readFileSync(jsonPath, 'utf8'));
const entrada = {
  id, titulo, artista,
  era: era || null,
  audio: `/canciones/${id}/${id}.${ext}`,
  lrc: `/canciones/${id}/${id}.lrc`,
  duracion: mediaDuracion(audioKaraoke) || duracionOrig || 210,
  offsetLetra: 0,
};
const i = lista.findIndex((c) => c.id === id);
if (i >= 0) lista[i] = { ...lista[i], ...entrada };
else lista.push(entrada);
writeFileSync(jsonPath, JSON.stringify(lista, null, 2) + '\n', 'utf8');

console.log(
  `\nListo. "${titulo}" agregada${alineado ? ' y alineada' : ' (SIN alinear)'}. ` +
    `Reiniciá el server.\nSi la letra sigue corrida, ajustala en vivo con [ y ] durante PLAYING.\n`
);

function mediaDuracion(path) {
  if (!hayFfmpeg) return 0;
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { encoding: 'utf8' });
  return Math.round(Number(r.stdout?.trim())) || 0;
}
