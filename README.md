# Taiko Trainer

Practice Japanese taiko drumming with **kuchi shōga** (口唱歌), the spoken drum
words taiko players use to learn rhythms: *Don, Doko, Ka, Su…*

- **Play along** with common patterns and songs at any tempo. A drum on screen
  shows which hand hits where, and the current word lights up as it plays.
- **Video lessons:** add a video (a file or a YouTube link), mark when every
  strike happens, then play the video with the drum, the words and a timeline
  following along. Slow it down and loop one part to practice.
- **Make your own** patterns, songs and video lessons.
- **Share** anything with a link, or move it with a file.
- **Look up** all 21 drum words: hand, position, size, length and how to say them.

In **English or German** (Deutsch): it follows the browser's language, and the
EN / DE switch in the top bar changes it.

It runs entirely in the browser: no server, no accounts, nothing uploaded.
It works on phones and tablets, and can be added to the home screen to open
without internet.

## Put it online

The app is a folder of static files, so any static web host works. This
repository has a GitHub Pages workflow (`.github/workflows/pages.yml`): it runs
the tests and publishes on every push to `main`. To enable it, go to
**Settings → Pages** and choose **GitHub Actions** as the source. The app will
be at `https://<user>.github.io/taiko-trainer/`.

To work on it, run `npm run dev` and open <http://localhost:8000>. Open pages
update as you save: style changes apply in place, other changes reload the
page. `PORT=3000` picks another port, and `HOST=0.0.0.0` makes it reachable
from a phone on the same network. Any other static file server works too, for
example `python3 -m http.server`, just without the live reload. Opening `index.html` straight from disk does not work,
because browsers block JavaScript modules on `file://`.

### On a phone or tablet

Open the address in the browser, then use **Add to Home Screen** (Safari:
Share button; Chrome: menu). It then opens full screen and works without
internet, except for YouTube videos.

- iPhone and iPad: sound from the app (the guide drum and click) is muted while
  the ring/silent switch is on silent. Video sound is not.
- Videos you add are stored in the browser on that device. The app asks the
  browser to keep them, but a phone that runs low on space may still clear
  them; keep your own copy of important videos.

## Using it

### Play

1. Pick something under **What to play**: one of your patterns, a common
   pattern, a song, or a video lesson.
2. Set the **tempo** in bpm (beats per minute): type a number, use − / +, or
   drag the slider. Picking an item sets its own tempo, and **Reset** goes back
   to it.
3. Press **Play** (or the space bar).

| Option | What it does |
| --- | --- |
| Count in 1-2-3-4 | Four clicks before the rhythm starts |
| Repeat | Loops the pattern, song or video part until you press Stop |
| Guide drum sound | Plays the rhythm. Turn it off once the rhythm is learned and drum along with only the click |
| Metronome click | A click on every beat, louder on beat 1 |
| Say the shouts | Speaks shouts like *Sore!* with the device’s voice |

Everywhere in the app, **red is the right hand and blue is the left hand**;
round marks are hits on the skin, square ones on the rim.

Tap the drum, or press **D F J K** on a keyboard, to try single hits:
D = left rim (Ra), F = left middle (Kon), J = right middle (Don), K = right rim (Ka).

### Video lessons

A video lesson is a video plus a list of **strikes**: each strike is one hit
(hand, skin or rim, and size) or a shout, at a time in the video.

**Make one:** Patterns & songs → **New video lesson** → choose a video file
(on a phone you can also record one) or paste a YouTube link or a direct link
to a video file. Then add strikes in the **strike editor**:

- **Tap along.** Play the video and tap the four pads (or press D F J K) as the
  player in the video hits. Each tap adds a strike at the video’s time. Pick
  Big, Medium or Small first. Slow the video to 0.5× or 0.25× for fast parts.
- **Place exactly.** Pause, step with −0.1 / +0.1, and tap a pad.
- **Add a whole pattern.** For a steady part, pick a pattern, its start time and
  tempo, and how many times it repeats.
- **Fix.** Tap a strike on the timeline to change its time (±10 ms), hand,
  place or size, or delete it. With a strike selected, ← and → move it by
  10 ms (Shift: 100 ms). **Move all strikes** shifts everything if your taps
  were consistently late or early. **Undo** and **Redo** (Ctrl/⌘+Z) cover every
  change.

Changes save automatically. Turn on **Hear strikes** to hear a drum on each
strike while the video plays, to check that they line up.

**Play it:** pick the lesson on the Play screen. The drum, the words and the
timeline follow the video. **Speed** slows the video (0.25× to 1.25×);
**Practice one part** with **Repeat** loops just that part. The **Guide drum
sound** is off by default, because the video has its own sound.

### Patterns

A pattern is a short rhythm written in drum words, for example:

```
Don Doko Don Su | Ka Kara Don Sore!
```

- Separate words with spaces. The bar lines `|` are optional; the editor adds
  them every 4 beats.
- Romaji and katakana both work (`Don` or `ドン`), and so do common
  alternative spellings: *Kat* → Ka, *Doro*/*Dogo* → Doko, *Tere* → Teke.
- **Swing** plays every off-beat late (long-short), as in *Matsuri ji*.
- **Small drum** plays the skin hits with a high shime-daiko sound.

| Word | Hands | Where | Length |
| --- | --- | --- | --- |
| Don / Kon | right / left | middle, big hit, let it ring | 1 beat |
| Do / Ko | right / left | middle, medium hit | ½ beat |
| Doko | right, left | middle | 1 beat |
| Tsu / Ku | right / left | middle, small tap | ½ beat |
| Tsuku | right, left | middle, small taps | 1 beat |
| Ka | right | rim | 1 beat |
| Ra | left | rim | ½ beat |
| Kara | right, left | rim | 1 beat |
| Su, Sa | – | rest | 1 beat |
| Sore!, Yoisho!, Ha!, Yo!, Ho!, Iyaa! | – | shout | 1 beat |
| Ten / Teke | right / right, left | small drum | 1 beat |

Groups differ a little in how they write and play these, so follow the
teacher where they differ.

### Songs

A song is a list of **sections**. Each section plays one pattern a number of
times. A section can have its own tempo (for a part that speeds up), or leave it
empty to use the song tempo. The Play screen’s tempo scales the whole song: a
song written at 100 bpm played at 80 bpm runs every section at 80% speed.

## Saving and sharing

**Storage.** Patterns, songs, video lessons and settings are saved in the
browser’s `localStorage`. Video files are saved in the browser’s `IndexedDB`.
Nothing leaves the device unless you share it.

**Share links.** **Share** on a pattern, song or video lesson makes a link that
contains the item itself, compressed with [pako](https://github.com/nodeca/pako)
(zlib deflate) and written in the part after `#share=`. Opening the link offers
to add the item. A song’s link includes the patterns it uses. A video lesson’s
link includes all its strikes and the video’s YouTube or web link; a video
*file* is too big for a link, so the other device attaches its own copy of the
same file (the app asks for it).

**Files.**

- **Export everything** saves all your patterns, songs and video lessons as one
  `.json` file (without the video files).
- **Download** on a video lesson saves one `.taiko` file containing the lesson
  *and* its video file, so it can be moved completely.
- **Import a file** adds either kind. Items you already have are skipped.

The `.json` format:

```json
{
  "app": "taiko-trainer",
  "version": 1,
  "patterns": [
    { "id": "p-1", "name": "Warm-up", "words": "Don Doko Don Su", "bpm": 90,
      "swing": false, "drum": "nagado", "notes": "" }
  ],
  "songs": [
    { "id": "s-1", "name": "Festival", "bpm": 100, "notes": "",
      "sections": [ { "patternId": "p-1", "repeats": 4, "bpm": null } ] }
  ],
  "lessons": [
    { "id": "v-1", "name": "Teacher’s solo", "notes": "",
      "video": { "type": "file", "name": "solo.mp4", "size": 18234112, "mime": "video/mp4", "duration": 95.4 },
      "strikes": [
        { "t": 1.25, "hand": "R", "where": "center", "vol": "big" },
        { "t": 1.5, "hand": "L", "where": "rim", "vol": "big" },
        { "t": 2.0, "shout": "sore" }
      ] }
  ]
}
```

`video` can also be `{ "type": "youtube", "videoId": "…" }` or
`{ "type": "url", "url": "https://…" }`. Strike times `t` are seconds in the video.

A `.taiko` file is: the 8 bytes `TAIKOTR1`, the length of the JSON part as a
4-byte little-endian number, that JSON (the format above, with one lesson), then
the video file’s bytes.

## Development

No build step: the browser loads the files as they are.

```
index.html, styles.css     the page
manifest.webmanifest, sw.js, icons/   home screen and offline support
vendor/pako.esm.mjs        pako 2.1.0 (MIT and Zlib licenses, see vendor/pako.LICENSE)
src/core/                  pure logic, tested in Node
  words.js                 the drum words and the text parser
  timeline.js              patterns and songs → timed events (swing, tempo)
  lessons.js               video lessons: strikes, links, compact encoding, .taiko header
  library.js               built-in items, validation, import and export
  share.js                 share links (pako)
  util.js                  small helpers
src/audio.js               drum sounds made with the Web Audio API
src/player.js              plays patterns and songs on the audio clock
src/videosync.js           fires strikes in time with a playing video
src/media.js               one interface for <video> and the YouTube player
src/videostore.js          video files in IndexedDB
src/store.js               everything else in localStorage
src/drum.js                the SVG drum and stick animation
src/ui/                    the screens and the timeline
test/                      node:test tests
```

Run the tests with Node.js 20 or newer:

```sh
npm test
```

When you change which files the app loads, update the list in `sw.js` (a test
checks it) and bump its `CACHE` name.

## License

MIT. pako is © Vitaly Puzrin and Andrei Tuputcyn (MIT and Zlib).

## Translations

All text lives in `src/lang/`: `en.js` is the source, `de.js` the German
version with the same keys (plus `CONTENT`: the drum words and built-in
patterns). `npm test` checks that both files have the same keys and
placeholders. To add a language, copy `de.js`, translate it, and register it
in `src/i18n.js` and `sw.js`.

## Voice

The drum words and shouts are spoken with the device's own speech voice
(Japanese if one is installed). Recorded clips can replace it: put
`sounds/voice/<word id>.mp3` files (ids as in `src/core/words.js`, such as
`don` or `sore`) and a `sounds/voice/index.json` listing them,
`{ "clips": { "don": {}, "sore": {} } }`. Recorded shouts are played exactly
on the beat; words without a clip keep using the device voice.
