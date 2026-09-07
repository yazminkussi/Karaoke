"""Re-sincroniza un .lrc a un audio distinto (p. ej. una pista de karaoke que fue
regrabada) usando alineamiento audio-a-audio (DTW sobre chroma).

    python alinear.py <audio_referencia> <audio_destino> <lrc_in> <lrc_out>

- audio_referencia : la grabacion para la que fueron hechos los timestamps del
  .lrc (normalmente la version original, con voz).
- audio_destino    : la pista que realmente se va a reproducir (karaoke).
- Escribe <lrc_out> con los tiempos corridos/estirados para que coincidan con
  <audio_destino>. Deja los tags de metadata igual.

Necesita: ffmpeg en el PATH, y `pip install librosa soundfile`.
"""
import sys
import re
import subprocess
import tempfile
import os
import numpy as np
import librosa

SR = 22050
HOP = 2048  # ~10.7 fps @ 22050 -> DTW liviano para canciones de 3-5 min


def cargar(path):
    """Carga cualquier formato via ffmpeg -> wav mono 22050 -> numpy."""
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    try:
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", path, "-ac", "1", "-ar", str(SR), tmp.name],
            check=True,
        )
        y, _ = librosa.load(tmp.name, sr=SR, mono=True)
        return y
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def features(path):
    y = cargar(path)
    # CENS: robusto a diferencias de timbre (voz vs instrumental)
    c = librosa.feature.chroma_cens(y=y, sr=SR, hop_length=HOP)
    # normaliza cada frame a norma 1 y evita frames todo-cero (silencio) que
    # rompen la distancia coseno del DTW
    norm = np.linalg.norm(c, axis=0, keepdims=True)
    c = c / np.maximum(norm, 1e-6)
    c[:, norm[0] < 1e-6] = 1.0 / np.sqrt(c.shape[0])
    return c, librosa.get_duration(y=y, sr=SR)


def warp_fn(ref_path, dst_path):
    cref, dref = features(ref_path)
    cdst, ddst = features(dst_path)
    _, wp = librosa.sequence.dtw(
        X=cref, Y=cdst, metric="euclidean",
        global_constraints=True, band_rad=0.2,
    )
    wp = wp[::-1]  # ascendente
    t_ref = librosa.frames_to_time(wp[:, 0], sr=SR, hop_length=HOP)
    t_dst = librosa.frames_to_time(wp[:, 1], sr=SR, hop_length=HOP)
    # colapsar duplicados de t_ref para np.interp (necesita x creciente)
    t_ref_u, idx = np.unique(t_ref, return_index=True)
    t_dst_u = t_dst[idx]

    def warp(t):
        return float(np.interp(t, t_ref_u, t_dst_u,
                               left=t_dst_u[0], right=t_dst_u[-1]))

    return warp, dref, ddst


TS = re.compile(r"\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]")


def fmt(seg):
    seg = max(0.0, seg)
    m = int(seg // 60)
    s = seg - m * 60
    return f"[{m:02d}:{s:05.2f}]"


def main():
    ref_path, dst_path, lrc_in, lrc_out = sys.argv[1:5]
    warp, dref, ddst = warp_fn(ref_path, dst_path)

    salida = []
    for linea in open(lrc_in, encoding="utf-8").read().splitlines():
        marcas = list(TS.finditer(linea))
        if not marcas:
            salida.append(linea)
            continue
        texto = TS.sub("", linea)
        nuevas = []
        for mm in marcas:
            t = int(mm[1]) * 60 + int(mm[2]) + (int(mm[3].ljust(3, "0")) / 1000 if mm[3] else 0)
            nuevas.append(fmt(warp(t)))
        salida.append("".join(nuevas) + texto)

    open(lrc_out, "w", encoding="utf-8", newline="\n").write("\n".join(salida) + "\n")
    print(f"[alinear] ref {dref:.1f}s -> dst {ddst:.1f}s | {lrc_out}")


if __name__ == "__main__":
    main()
