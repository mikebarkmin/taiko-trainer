#!/usr/bin/env python3
"""Regenerate the spoken word clips in sounds/voice/ with edge-tts.

Uses the neural voices of Microsoft Edge (free, no account): ja-JP-NanamiNeural
for the drum words, ja-JP-KeitaNeural for the shouts, which are rendered
higher and faster so they come out as calls. Each clip is normalized and
trimmed with sox. Run from the repo root:

    python3 scripts/make_voice_clips.py

Requires: pip install edge-tts, and sox + ffmpeg in PATH.
"""

import asyncio
import json
import shutil
import subprocess
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "sounds" / "voice"

WORD_VOICE = "ja-JP-NanamiNeural"   # all words: one voice everywhere
SHOUT_VOICE = "ja-JP-NanamiNeural"
SHOUT_PITCH = "+0Hz"
SHOUT_RATE = "+10%"

# id -> (text, is_shout). Drum words use the kana; ka/ha/yo/ho end in a
# small tsu so the voice says them short and clipped, like the app's speak().
CLIPS = {
    "don":    ("ドン", False),
    "kon":    ("コン", False),
    "do":     ("ド", False),
    "ko":     ("コ", False),
    "doko":   ("ドコ", False),
    "tsu":    ("ツ", False),
    "ku":     ("ク", False),
    "tsuku":  ("ツク", False),
    "ka":     ("カッ", False),
    "ra":     ("ラ", False),
    "kara":   ("カラ", False),
    "su":     ("ス", False),
    "sa":     ("サ", False),
    "sore":   ("それっ", True),
    "yoisho": ("よいしょっ", True),
    "ha":     ("はっ", True),
    "yo":     ("よっ", True),
    "ho":     ("ほっ", True),
    "iya":    ("いやーっ", True),
    "ten":    ("テン", False),
    "teke":   ("テケ", False),
    # syllables for the halves of Teke, said one per hit: not words,
    # only voice clips (see PARTS in src/core/words.js)
    "te":     ("テ", False),
    "ke":     ("ケ", False),
}


async def synthesize(voice, text, pitch, rate, mp3):
    com = edge_tts.Communicate(text, voice, pitch=pitch, rate=rate)
    await com.save(mp3)


def polish(mp3):
    """Normalize, drop rumble, trim leading silence and the silent tail.
    The word's natural decay is kept; only quiet after the decay is cut."""
    raw = mp3.with_suffix(".raw.mp3")
    mp3.rename(raw)
    wav = mp3.with_suffix(".wav")
    subprocess.run([
        "sox", str(raw), str(wav),
        "highpass", "90",                     # remove rumble and plosive thump
        "gain", "-n", "-1.5",                 # normalize all clips to one level
        "silence", "1", "0.01", "0.5%",       # trim the silence at the start
        "1", "0.25", "0.1%",                  # cut 0.25s after the sound ends
    ], check=True)
    raw.unlink()
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-i", str(wav),
        "-codec:a", "libmp3lame", "-qscale:a", "4", str(mp3),
    ], check=True)
    wav.unlink()


async def main():
    if not shutil.which("sox") or not shutil.which("ffmpeg"):
        sys.exit("sox and ffmpeg must be installed")
    OUT.mkdir(parents=True, exist_ok=True)

    for i, (wid, (text, shout)) in enumerate(CLIPS.items(), 1):
        mp3 = OUT / f"{wid}.mp3"
        voice = SHOUT_VOICE if shout else WORD_VOICE
        pitch = SHOUT_PITCH if shout else "+0Hz"
        rate = SHOUT_RATE if shout else "+5%"
        print(f"[{i}/{len(CLIPS)}] {wid}: {text} ({voice})")
        await synthesize(voice, text, pitch, rate, mp3)
        polish(mp3)

    index = {"clips": {w: {"voice": SHOUT_VOICE if s else WORD_VOICE, "text": t}
                       for w, (t, s) in CLIPS.items()}}
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {OUT}/index.json")


if __name__ == "__main__":
    asyncio.run(main())
