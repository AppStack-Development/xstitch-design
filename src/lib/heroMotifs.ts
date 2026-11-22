/**
 * The home page's stitched picture changes with the Thai calendar (components/HeroStitch.tsx draws it).
 * Each motif is a little cross-stitch chart: one character per square, '.' for bare fabric, and a key
 * into COLORS for the thread. Festivals win over the rainy season; outside them it's a smiling face.
 *
 * Preview any motif with ?motif=<id> in the address (e.g. ?motif=halloween#/).
 */
export type MotifFx = 'fire' | 'balloons' | 'spray' | 'rain' | 'bats' | 'float' | 'snow';

export interface Motif {
  id: string;
  label: [th: string, en: string];
  rows: string[];
  fx?: MotifFx;
}

/** thread colours: [top leg, under leg] (the under leg a shade darker, like a real stitch) */
export const COLORS: Record<string, [string, string]> = {
  R: ['#c72b3b', '#a3202f'], Y: ['#e9b82e', '#c4951a'], y: ['#d99a1a', '#b47c10'], G: ['#2f7d4f', '#225c3a'],
  g: ['#6fb27f', '#4f9160'], B: ['#3a7bd5', '#2b5fa8'], L: ['#9cc3ea', '#6f9fce'], l: ['#a9cdee', '#86b2dc'],
  W: ['#ffffff', '#c9c1ae'], w: ['#ddd5c4', '#b4a98f'], K: ['#8b93a3', '#6b7383'], P: ['#f08aa8', '#d26a8b'],
  p: ['#f9c3d2', '#e9a2b6'], O: ['#ec8a2c', '#c26a17'], D: ['#2b2420', '#171310'], N: ['#c08a5a', '#9c6a3e'],
  T: ['#f1d3ad', '#d9b386'], U: ['#7a4a2b', '#5c3620'], J: ['#e6d27a', '#c4ad50'], j: ['#a8c46a', '#86a24a'],
};

// ---------- motifs built in code ----------

const FONT: Record<string, string[]> = {
  H: ['X.X', 'X.X', 'XXX', 'X.X', 'X.X'], N: ['X..X', 'XX.X', 'X.XX', 'X..X', 'X..X'], Y: ['X.X', 'X.X', '.X.', '.X.', '.X.'],
  0: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'], 1: ['.X.', 'XX.', '.X.', '.X.', 'XXX'], 2: ['XXX', '..X', 'XXX', 'X..', 'XXX'],
  3: ['XXX', '..X', 'XXX', '..X', 'XXX'], 4: ['X.X', 'X.X', 'XXX', '..X', '..X'], 5: ['XXX', 'X..', 'XXX', '..X', 'XXX'],
  6: ['XXX', 'X..', 'XXX', 'X.X', 'XXX'], 7: ['XXX', '..X', '..X', '.X.', '.X.'], 8: ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'],
  9: ['XXX', 'X.X', 'XXX', '..X', 'XXX'],
};
function word(text: string, key: string): string[] {
  const rows = ['', '', '', '', ''];
  [...text].forEach((ch, i) => FONT[ch].forEach((r, y) => { rows[y] += (i ? '.' : '') + r.replace(/X/g, key); }));
  return rows;
}
/** "HNY" over the year, centred */
function happyNewYear(year: number): string[] {
  const a = word('HNY', 'R'), b = word(String(year), 'Y');
  const w = Math.max(a[0].length, b[0].length);
  const pad = (r: string) => { const l = Math.floor((w - r.length) / 2); return '.'.repeat(l) + r + '.'.repeat(w - r.length - l); };
  return [...a.map(pad), '.'.repeat(w), ...b.map(pad)];
}

/** a double jasmine (มะลิลา) seen from above, on a pale blue disc so the white petals stand out */
function jasmine(): string[] {
  const N = 19, c = 9;
  const g = [...Array(N)].map(() => Array<string>(N).fill('.'));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x - c) ** 2 + (y - c) ** 2 <= 9.3 ** 2) g[y][x] = 'l';
  const ring = (n: number, twist: number, dist: number, major: number, minor: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + twist, u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]];
      const px = c + u[0] * dist, py = c + u[1] * dist;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = x - px, dy = y - py;
        const s = ((dx * u[0] + dy * u[1]) / major) ** 2 + ((dx * v[0] + dy * v[1]) / minor) ** 2;
        if (s <= 1) g[y][x] = s > 0.55 ? 'w' : 'W'; // a cream edge so each petal reads on its own
      }
    }
  };
  ring(6, 0.2, 4.6, 3.8, 2.1);
  ring(6, 0.2 + Math.PI / 6, 2.6, 2.6, 1.6);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - c, y - c);
    if (d <= 0.6) g[y][x] = 'j'; else if (d <= 1.5) g[y][x] = 'J';
  }
  return g.map((r) => r.join(''));
}

/** a round smiling face with rosy cheeks */
function smiley(): string[] {
  const N = 13, c = 6;
  const g = [...Array(N)].map(() => Array<string>(N).fill('.'));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - c, y - c);
    if (d <= 6.2) g[y][x] = d > 5.3 ? 'y' : 'Y';
  }
  for (const [x, y] of [[4, 4], [4, 5], [8, 4], [8, 5], [4, 8], [5, 9], [6, 9], [7, 9], [8, 8]]) g[y][x] = 'D';
  for (const [x, y] of [[2, 7], [3, 7], [9, 7], [10, 7]]) g[y][x] = 'p';
  return g.map((r) => r.join(''));
}

// ---------- the year's motifs ----------

const M = {
  smile: { id: 'smile', label: ['หน้ายิ้ม', 'Smiling face'], rows: smiley() },
  childrens: {
    id: 'childrens', label: ['วันเด็ก', "Children's Day"], fx: 'balloons',
    rows: ['.NN.......NN.', 'NTTN.....NTTN', 'NTTNNNNNNNTTN', '.NNNNNNNNNNN.', 'NNNNNNNNNNNNN', 'NNNDNNNNNDNNN', 'NNNNNNNNNNNNN',
      'NppNNTTTNNppN', 'NNNNTTDTTNNNN', '.NNNTDTDTNNN.', '..NNNTTTNNN..', '...NNNNNNN...'],
  },
  cny: {
    id: 'cny', label: ['ตรุษจีน', 'Chinese New Year'],
    rows: ['.....K.....', '....YYY....', '..RRRRRRR..', '.RRRRRRRRR.', 'RRRRYYYRRRR', 'RRRYRRRYRRR', 'RRRYRYRYRRR', 'RRRYRRRYRRR',
      'RRRRYYYRRRR', '.RRRRRRRRR.', '..RRRRRRR..', '....YYY....', '....Y.Y....', '...Y.Y.Y...'],
  },
  valentine: {
    id: 'valentine', label: ['วาเลนไทน์', "Valentine's Day"],
    rows: ['.RR...RR.', 'RRRR.RRRR', 'RRRRRRRRR', 'RRRRRRRRR', '.RRRRRRR.', '..RRRRR..', '...RRR...', '....R....'],
  },
  songkran: {
    id: 'songkran', label: ['สงกรานต์', 'Songkran'], fx: 'spray',
    rows: ['.......BBBB...', '......BLLLLB..', '......BLLLLB..', '..OOOOOOOOOOO.', 'OOOOOOOOOOOOOO', '..OOOOOOOOOOO.',
      '......Y..OOOO.', '......YY.OOOO.', '.........OOOO.', '..........OOO.'],
  },
  rain: {
    id: 'rain', label: ['หน้าฝน', 'Rainy season'], fx: 'rain',
    rows: ['.....R.....', '...RRRRR...', '..RRYRRYR..', '.RRYRRYRRR.', 'RRRRRRRRRRR', '.....K.....', '.....K.....', '.....K.....',
      '...K.K.....', '....K......'],
  },
  mothers: { id: 'mothers', label: ['วันแม่', "Mother's Day"], rows: jasmine() },
  halloween: {
    id: 'halloween', label: ['ฮาโลวีน', 'Halloween'], fx: 'bats',
    rows: ['......G......', '.....GGg.....', '..OOOOOOOOO..', '.OOOOOOOOOOO.', 'OOOOOOOOOOOOO', 'OOODOOOOODOOO', 'OOODOOOOODOOO',
      'OppOOOOOOOppO', 'OOOODOOODOOOO', '.OOOODDDOOOO.', '..OOOOOOOOO..'],
  },
  loykrathong: {
    id: 'loykrathong', label: ['ลอยกระทง', 'Loy Krathong'], fx: 'float',
    rows: ['.......Y.......', '.......O.......', '...P...T...P...', '..PpP..T..PpP..', '...P...T...P...', 'G.G.G.GTG.G.G.G',
      'GGGGGGGGGGGGGGG', '.GgGgGgGgGgGgG.', '..GGGGGGGGGGG..', 'BBBBBBBBBBBBBBB', '.B..B..B..B..B.'],
  },
  christmas: {
    id: 'christmas', label: ['คริสต์มาส', 'Christmas'], fx: 'snow',
    rows: ['.....Y.....', '....YYY....', '.....G.....', '....GGG....', '...GGRGG...', '....GGG....', '...GGGGG...', '..GGYGGLG..',
      '...GGGGG...', '..GGGGGGG..', '.GRGGGGYGG.', 'GGGGGGGGGGG', '....UUU....'],
  },
} satisfies Record<string, Motif>;

// ---------- when each one shows ----------

/** Chinese New Year's day, by year (lunar) */
const CNY: Record<number, [number, number]> = { 2026: [2, 17], 2027: [2, 6], 2028: [1, 26], 2029: [2, 13], 2030: [2, 3] };
/** Loy Krathong, the full moon of the 12th Thai lunar month, by year */
const LOY: Record<number, [number, number]> = { 2026: [11, 24], 2027: [11, 13], 2028: [11, 2], 2029: [11, 21], 2030: [11, 10] };

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();
const DAY = 86400000;

/** the motif for this date, or one named in ?motif= */
export function currentMotif(now = new Date()): Motif {
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('motif') : null;
  if (forced === 'newyear') return { id: 'newyear', label: ['ปีใหม่', 'New Year'], rows: happyNewYear(now.getFullYear()), fx: 'fire' };
  if (forced && forced in M) return M[forced as keyof typeof M];

  const y = now.getFullYear(), m = now.getMonth() + 1, t = day(y, m, now.getDate());
  const within = (from: number, to: number) => t >= from && t <= to;
  // second Saturday of January, and the days leading up to it
  const jan1 = new Date(y, 0, 1).getDay();
  const kidsDay = 1 + ((6 - jan1 + 7) % 7) + 7;

  if (within(day(y, 1, 1), day(y, 1, 7))) return { id: 'newyear', label: ['ปีใหม่', 'New Year'], rows: happyNewYear(y), fx: 'fire' };
  if (within(day(y, 1, kidsDay - 5), day(y, 1, kidsDay))) return M.childrens;
  if (within(day(y, 2, 10), day(y, 2, 14))) return M.valentine;
  if (CNY[y] && within(day(y, ...CNY[y]) - 2 * DAY, day(y, ...CNY[y]) + 3 * DAY)) return M.cny;
  if (within(day(y, 4, 10), day(y, 4, 16))) return M.songkran;
  if (within(day(y, 8, 5), day(y, 8, 12))) return M.mothers;
  if (within(day(y, 10, 25), day(y, 10, 31))) return M.halloween;
  if (LOY[y] && within(day(y, ...LOY[y]) - 3 * DAY, day(y, ...LOY[y]))) return M.loykrathong;
  if (within(day(y, 12, 15), day(y, 12, 31))) return M.christmas;
  if (within(day(y, 6, 1), day(y, 9, 30))) return M.rain;
  return M.smile;
}
