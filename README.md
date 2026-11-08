# Taiko Trainer

Practice Japanese taiko drumming with **kuchi shōga** (口唱歌), the spoken drum
words taiko players use to learn rhythms: *Don, Doko, Ka, Su…*

- **Play along** with common patterns at any tempo. A drum on screen shows
  which hand hits where, and the current word lights up as it plays.
- **Make your own** patterns and songs, and save them in the browser.
- **Look up** all 20 drum words: hand, position, size, length and how to say them.

It is a plain static web app: no build step, no server-side code and no
accounts.

## Run it

```sh
npm start
```

Then open <http://localhost:8080>. Nothing needs installing besides Node.js 20
or newer. Any static file server works too, but opening `index.html` straight
from disk does not, because browsers block JavaScript modules on `file://`.

### Put it online with GitHub Pages

In the repository on GitHub, go to **Settings → Pages**, choose **Deploy from a
branch**, pick `main` and `/ (root)`, and save. The app will be at
`https://<user>.github.io/taiko-trainer/`.

## Using it

### Play

1. Pick something under **What to play**: one of your patterns, a common
   pattern, or a song.
2. Set the **tempo** in bpm (beats per minute): type a number, use − / +, or
   drag the slider. Picking an item sets its own tempo, and **Reset** goes back
   to it.
3. Press **Play** (or the space bar).

Options:

| Option | What it does |
| --- | --- |
| Count in 1-2-3-4 | Four clicks before the rhythm starts |
| Repeat | Loops the pattern or song until you press Stop |
| Guide drum sound | Plays the rhythm. Turn it off once the rhythm is learned and drum along with only the click |
| Metronome click | A click on every beat, louder on beat 1 |
| Say the shouts | Speaks shouts like *Sore!* with the device’s voice |

Tap the drum, or press **D F J K** on a keyboard, to try single hits:
D = left rim (Ra), F = left middle (Kon), J = right middle (Don), K = right rim (Ka).

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

The words, and how long each lasts:

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
empty to use the song tempo.

When a song plays, the Play screen’s tempo scales the whole song: a song written
at 100 bpm played at 80 bpm runs every section at 80% speed.

### Moving patterns and songs between devices

Everything is saved in the browser on the device you use. To move it:

- **Share** on a pattern or song makes a link. Opening the link on another
  device (or sending it to someone) offers to add it there. A song’s link
  includes the patterns it uses.
- **Export to a file** saves all your patterns and songs as a `.json` file;
  **Import a file** adds them on another device. Items you already have are
  skipped.

The file format:

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
  ]
}
```

## Development

```
index.html, styles.css   the page
src/core/                pure logic, tested in Node
  words.js               the drum words and the text parser
  timeline.js            turns patterns and songs into timed events (swing, tempo)
  library.js             built-in patterns and songs, validation, import, share links
src/audio.js             drum sounds made with the Web Audio API
src/player.js            schedules sounds ahead of time on the audio clock
src/drum.js              the SVG drum and stick animation
src/store.js             saving to localStorage
src/ui/                  the Play, Patterns & songs and Words screens
test/                    node:test tests
```

```sh
npm test
```

## License

MIT
