// Kuchi shōga: the spoken drum words, and how to turn text into words.
// Pure module: no DOM, so it runs in the browser and in Node tests.

const R = (t, where, vol, ring) => ({ t, hand: "R", where, vol, ring });
const L = (t, where, vol, ring) => ({ t, hand: "L", where, vol, ring });

const SHOUT_TIP = "Shout from the belly, during a rest. Shouts keep the group together and show your energy.";

/**
 * Every word. `beats` is how long the word lasts; each hit sits at
 * `t` beats from the start of the word.
 */
export const WORDS = {
  don: { kana: "ドン", ro: "Don", group: "head", beats: 1, hits: [R(0, "center", "big", "long")],
    mean: "Big hit in the middle. Let it ring.", size: "Big: swing the whole arm", len: "1 beat, let it ring", say: "“dohn”",
    tip: "Lift the stick high, drop it with the whole arm and let it bounce off. Pressing into the skin kills the sound." },
  kon: { kana: "コン", ro: "Kon", group: "head", beats: 1, hits: [L(0, "center", "big", "long")],
    mean: "Don with the left hand.", size: "Big: swing the whole arm", len: "1 beat, let it ring", say: "“kohn”",
    tip: "The left hand should sound as strong as the right. Practice Don Kon Don Kon until both sound the same." },
  do: { kana: "ド", ro: "Do", group: "head", beats: 0.5, hits: [R(0, "center", "medium", "short")],
    mean: "A short hit in the middle. The next note comes right away.", size: "Medium: from the elbow", len: "½ beat, short", say: "“doh”",
    tip: "Do is cut short because something follows it. Compare ド Do with ドン Don." },
  ko: { kana: "コ", ro: "Ko", group: "head", beats: 0.5, hits: [L(0, "center", "medium", "short")],
    mean: "A short left-hand hit, usually right after Do.", size: "Medium: from the elbow", len: "½ beat, short", say: "“koh”",
    tip: "Do and Ko together make Doko." },
  doko: { kana: "ドコ", ro: "Doko", group: "head", beats: 1, also: "Doro, Dogo", alias: ["doro", "dogo", "ドロ", "ドゴ"],
    hits: [R(0, "center", "medium", "short"), L(0.5, "center", "medium", "short")],
    mean: "Two quick, even hits: right, then left.", size: "Medium: from the elbow", len: "1 beat, two hits", say: "“doh-koh”",
    tip: "Both hits should sound the same. If Ko comes out weaker, slow down and listen." },
  tsu: { kana: "ツ", ro: "Tsu", group: "head", beats: 0.5, hits: [R(0, "center", "small", "short")],
    mean: "A tiny tap with the right hand.", size: "Small: just the wrist", len: "½ beat", say: "“tsu”, like the end of “cats” plus “oo”",
    tip: "Hold the stick just above the skin and let it fall. Gravity does the work." },
  ku: { kana: "ク", ro: "Ku", group: "head", beats: 0.5, hits: [L(0, "center", "small", "short")],
    mean: "A tiny tap with the left hand.", size: "Small: just the wrist", len: "½ beat", say: "“koo”",
    tip: "Tsu and Ku together make Tsuku." },
  tsuku: { kana: "ツク", ro: "Tsuku", group: "head", beats: 1,
    hits: [R(0, "center", "small", "short"), L(0.5, "center", "small", "short")],
    mean: "Two tiny taps: right, then left.", size: "Small: just the wrist", len: "1 beat, two taps", say: "“tsoo-koo”",
    tip: "Wiggle the wrists and keep it quiet, so the big hits stand out." },
  ka: { kana: "カ", ro: "Ka", group: "rim", beats: 1, also: "Kat (カッ)", alias: ["kat", "katsu", "カッ"],
    hits: [R(0, "rim", "big", "short")],
    mean: "A click on the rim with the right hand.", size: "Sharp click", len: "1 beat", say: "“kah”",
    tip: "Hit the wooden edge, not the skin. The small ッ in カッ means: stop the sound short." },
  ra: { kana: "ラ", ro: "Ra", group: "rim", beats: 0.5, hits: [L(0, "rim", "big", "short")],
    mean: "A click on the rim with the left hand, usually right after Ka.", size: "Sharp click", len: "½ beat", say: "“rah”, quick and light",
    tip: "Ka and Ra together make Kara." },
  kara: { kana: "カラ", ro: "Kara", group: "rim", beats: 1,
    hits: [R(0, "rim", "big", "short"), L(0.5, "rim", "big", "short")],
    mean: "Two quick rim clicks: right, then left.", size: "Sharp clicks", len: "1 beat, two clicks", say: "“kah-rah”",
    tip: "Keep the two clicks even, like a clock ticking." },
  su: { kana: "ス", ro: "Su", group: "silence", beats: 1, hits: [],
    mean: "Silence for one beat.", size: "No hit", len: "1 beat of silence", say: "a quiet “sss”, or just think it",
    tip: "Count it. A rest is part of the rhythm, so keep your sticks ready for the next hit." },
  sa: { kana: "サ", ro: "Sa", group: "silence", beats: 1, hits: [],
    mean: "Another rest word. Some groups say Sa where others say Su.", size: "No hit", len: "1 beat of silence", say: "“sah”",
    tip: "Ask your teacher which rest word your group uses." },
  sore: { kana: "ソレ", ro: "Sore!", group: "shout", beats: 1, hits: [], mean: "Roughly “That’s it!” Cheers the players on.", say: "“soh-reh!”" },
  yoisho: { kana: "ヨイショ", ro: "Yoisho!", group: "shout", beats: 1, hits: [], mean: "A heave-ho shout, like lifting something heavy.", say: "“yoy-shoh!”" },
  ha: { kana: "ハッ", ro: "Ha!", group: "shout", beats: 1, hits: [], mean: "A short, sharp shout.", say: "“hah!”" },
  yo: { kana: "ヨッ", ro: "Yo!", group: "shout", beats: 1, hits: [], mean: "A quick call that lifts the energy.", say: "“yoh!”" },
  ho: { kana: "ホッ", ro: "Ho!", group: "shout", beats: 1, hits: [], mean: "Another short shout. Each group has its favorites.", say: "“hoh!”" },
  iya: { kana: "イヤー", ro: "Iyaa!", group: "shout", beats: 1, alias: ["iya", "イヤ"], hits: [], mean: "A long, rising call.", say: "“ee-yaaa!”" },
  ten: { kana: "テン", ro: "Ten", group: "shime", drum: "shime", beats: 1, hits: [R(0, "center", "big", "long")],
    mean: "The small drum’s Don: one sharp, ringing hit.", size: "Strong and crisp", len: "1 beat", say: "“ten”",
    tip: "The small drum is tight and high, so its hits sound like “ten”, not “don”." },
  teke: { kana: "テケ", ro: "Teke", group: "shime", drum: "shime", beats: 1, also: "Tere", alias: ["tere", "テレ"],
    hits: [R(0, "center", "medium", "short"), L(0.5, "center", "medium", "short")],
    mean: "Two quick hits on the small drum: right, then left.", size: "Medium", len: "1 beat, two hits", say: "“teh-keh”",
    tip: "Teke on the small drum works like Doko on the big one." },
};

for (const w of Object.values(WORDS)) {
  if (w.group === "shout") { w.size = "Loud, from the belly"; w.len = "1 beat"; w.tip = SHOUT_TIP; }
}

export const GROUPS = [
  { id: "head", mark: "", title: "On the skin", jp: "皮 · kawa", desc: "The booming sounds. Hit the middle of the drum head." },
  { id: "rim", mark: "rim", title: "On the rim", jp: "縁 · fuchi", desc: "The clicking sounds. Hit the wooden edge of the drum." },
  { id: "silence", mark: "rest", title: "Silence", jp: "間 · ma", desc: "Rests count as much as hits. Japanese musicians call the space between sounds ma." },
  { id: "shout", mark: "shout", title: "Shouts", jp: "掛け声 · kakegoe", desc: "Players shout during rests to stay together and share energy. Most shouts aren’t real words." },
  { id: "shime", mark: "", title: "Small drum", jp: "締太鼓 · shime-daiko", desc: "The small, tightly tied drum sounds high and sharp. It has its own words, and uses Tsu and Tsuku too." },
];

/** Which hand, how big: the grid most words fit into. */
export const HAND_GRID = [
  { label: "Big hit", sub: "whole arm", R: "don", L: "kon", pair: null },
  { label: "Medium hit", sub: "from the elbow", R: "do", L: "ko", pair: "doko" },
  { label: "Small tap", sub: "just the wrist", R: "tsu", L: "ku", pair: "tsuku" },
  { label: "Rim click", sub: "on the edge", R: "ka", L: "ra", pair: "kara" },
];

/** Order of the word buttons in editors, with "|" as a line break. */
export const PALETTE = ["don", "kon", "do", "ko", "doko", "tsu", "ku", "tsuku", "|", "ka", "ra", "kara", "su", "sa", "|", "sore", "yoisho", "ha", "yo", "ho", "iya", "|", "ten", "teke"];

const ALIAS = new Map();
for (const [id, w] of Object.entries(WORDS)) {
  ALIAS.set(id, id);
  ALIAS.set(w.kana, id);
  ALIAS.set(w.ro.toLowerCase().replace(/!/g, ""), id);
  for (const a of w.alias || []) ALIAS.set(a.toLowerCase(), id);
}

/** The word id for one typed word, or null. */
export function lookup(word) {
  return ALIAS.get(String(word).toLowerCase()) || null;
}

/**
 * Turn typed text ("Don Doko | Ka Kat Su!") into word ids.
 * Spaces, commas, hyphens and bar lines separate words; "!" is ignored.
 */
export function parseWords(text) {
  const parts = String(text || "")
    .toLowerCase()
    .replace(/[!！?？。、,.;:]/g, " ")
    .split(/[\s|｜/\-–—·]+/)
    .filter(Boolean);
  const ids = [];
  const unknown = [];
  for (const p of parts) {
    const id = lookup(p);
    if (id) ids.push(id);
    else if (!unknown.includes(p)) unknown.push(p);
  }
  return { ids, unknown };
}

export function beatsOf(ids) {
  return ids.reduce((sum, id) => sum + WORDS[id].beats, 0);
}

/** Write word ids back as text, with a bar line after every 4 beats. */
export function formatWords(ids) {
  const out = [];
  let b = 0;
  ids.forEach((id, i) => {
    const prev = b;
    b += WORDS[id].beats;
    out.push(WORDS[id].ro);
    if (crossesBar(prev, b) && i < ids.length - 1) out.push("|");
  });
  return out.join(" ");
}

/** True when going from beat `prev` to beat `next` completes a 4-beat bar. */
export function crossesBar(prev, next) {
  return Math.floor(next / 4 + 1e-9) > Math.floor(prev / 4 + 1e-9);
}

/** 6.5 → "6½" */
export function fmtBeats(b) {
  const whole = Math.floor(b + 1e-9);
  const half = b - whole > 0.25;
  if (!whole && !half) return "0";
  return (whole ? String(whole) : "") + (half ? "½" : "");
}
