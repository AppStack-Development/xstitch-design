import type { Pattern } from '../types';
import { onTemplate, type Cell, type Legend } from '../lib/patternArt';

/**
 * Christmas designs for the Stitch Box lids (lib/boxLids.ts): three per lid, shared by the team in the
 * community gallery through dev/teamPatterns.ts. Each design paints the lid's stitch holes from the hole's
 * position: dx/dy from the centre of the stitch area, bw/bh its size, d its depth from the rim.
 */

interface BoxPattern { title: string; description: string; tags: string[]; make: () => Pattern }

// ---------- small geometry helpers (in cells) ----------
const inEllipse = (x: number, y: number, rx: number, ry: number) => (x / rx) ** 2 + (y / ry) ** 2 <= 1;
const inCircle = (x: number, y: number, r: number) => x * x + y * y <= r * r;
const inRect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
function inPoly(x: number, y: number, pts: [number, number][]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const starPts = (cx: number, cy: number, r: number, inner: number, n = 5, rot = -Math.PI / 2): [number, number][] =>
  Array.from({ length: n * 2 }, (_, i) => {
    const rr = i % 2 ? r * inner : r, a = rot + (i * Math.PI) / n;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as [number, number];
  });
const inStar = (x: number, y: number, cx: number, cy: number, r: number, inner = 0.45) => inPoly(x, y, starPts(cx, cy, r, inner));
/** distance from a point to a segment */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - ax - t * vx, py - ay - t * vy);
}
/** a stable pseudo-random value 0..1 per cell, for texture */
const rnd = (x: number, y: number, s = 1) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** a 6-arm snowflake centred at (cx, cy) with arm length r */
function snowflake(x: number, y: number, cx: number, cy: number, r: number) {
  const dx = x - cx, dy = y - cy;
  if (Math.hypot(dx, dy) > r + 0.5) return false;
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3, ex = Math.cos(a) * r, ey = Math.sin(a) * r;
    if (segDist(dx, dy, 0, 0, ex, ey) < 0.55) return true;
    if (r >= 3) { // little branches at 60% of the arm
      const bx = ex * 0.6, by = ey * 0.6;
      for (const s of [-1, 1]) {
        const b = a + s * 0.9;
        if (segDist(dx, dy, bx, by, bx + Math.cos(b) * r * 0.35, by + Math.sin(b) * r * 0.35) < 0.5) return true;
      }
    }
  }
  return false;
}
/** within half a cell: stitch-area centres can fall between cells (dx = ±0.5, ±1.5…), so exact === would miss */
const near = (a: number, b: number) => Math.abs(a - b) <= 0.5;
const plus = (x: number, y: number, cx: number, cy: number) => {
  const rx = Math.round(x - cx), ry = Math.round(y - cy);
  return (rx === 0 && Math.abs(ry) <= 1) || (ry === 0 && Math.abs(rx) <= 1);
};

type Paint = (c: Cell, maxD: number) => string;
const lid = (template: string, cols: number, rows: number) => ({ template, w: cols, h: rows });
const make = (title: string, description: string, tags: string[], at: ReturnType<typeof lid>, difficulty: 'easy' | 'medium' | 'hard', legend: Legend, paint: Paint): BoxPattern => ({
  title, description, tags,
  make: () => onTemplate({ name: title, description, tags, difficulty, template: at.template, w: at.w, h: at.h, legend, paint }),
});

const CIRCLE = lid('box-circle', 36, 36), EGG = lid('box-egg', 30, 40), HEART = lid('box-heart', 40, 36), OVAL = lid('box-oval', 44, 32);
const SQUARE = lid('box-square', 36, 36), STAR = lid('box-star', 40, 38), TRI = lid('box-triangle', 36, 32);

export const BOX_CHRISTMAS: BoxPattern[] = [
  // ---------- round box ----------
  make('กล่องกลม พวงหรีดคริสต์มาส', 'พวงหรีดใบสนเขียวประดับผลเบอร์รี่แดงและโบว์ใหญ่ บนฝากล่องกลม', ['festival'], CIRCLE, 'medium',
    { g: '699', G: '701', k: '986', r: '321', R: '498', w: 'B5200' },
    (c) => {
      const r = Math.hypot(c.dx, c.dy), a = Math.atan2(c.dy, c.dx);
      const bx = c.dx, by = c.dy - 11; // bow at the bottom
      if (inPoly(bx, by, [[0, 0], [-6, -3], [-6, 3]]) || inPoly(bx, by, [[0, 0], [6, -3], [6, 3]])) return 'r';
      if (inRect(bx, by, -1, -1, 1, 1)) return 'R';
      if (inPoly(bx, by, [[-1, 1], [1, 1], [-3, 6], [-5, 5]]) || inPoly(bx, by, [[-1, 1], [1, 1], [5, 5], [3, 6]])) return 'R';
      if (r < 7.5 || r > 13.6) return '.';
      for (let k = 0; k < 6; k++) { // berries in threes around the ring, leaving the bottom for the bow
        if (k === 1 || k === 2) continue;
        const ba = -Math.PI / 2 + (k * Math.PI) / 3 + 0.3, ex = Math.cos(ba) * 10.5, ey = Math.sin(ba) * 10.5;
        if (inCircle(c.dx - ex, c.dy - ey, 1.1) || inCircle(c.dx - ex - 1.6, c.dy - ey + 1, 1.1) || inCircle(c.dx - ex + 0.4, c.dy - ey + 1.9, 1.1)) {
          return inCircle(c.dx - ex + 0.3, c.dy - ey + 0.3, 0.6) ? 'w' : 'r';
        }
      }
      const band = Math.sin(a * 9 + r * 0.8);
      return band > 0.45 ? 'G' : band < -0.5 || rnd(c.x, c.y) < 0.15 ? 'k' : 'g';
    }),
  make('กล่องกลม เกล็ดหิมะคืนฟ้า', 'เกล็ดหิมะขาวกลางท้องฟ้าสีกรมท่า ล้อมด้วยเกล็ดหิมะเล็ก ๆ', ['festival', 'geometric'], CIRCLE, 'medium',
    { n: '336', N: '823', w: 'B5200', b: '3755' },
    (c) => {
      if (snowflake(c.dx, c.dy, 0, 0, 11)) return 'w';
      if (inCircle(c.dx, c.dy, 1.5)) return 'b';
      for (const [sx, sy] of [[-10, -9], [10, -9], [-11, 8], [11, 8], [0, -13], [0, 13]] as [number, number][]) if (plus(c.dx, c.dy, sx, sy)) return 'b';
      return c.d <= 1 ? 'N' : 'n';
    }),
  make('กล่องกลม ลูกบอลคริสต์มาส', 'ลูกบอลคริสต์มาสสีแดงคาดลายทองซิกแซก พร้อมตะขอแขวน', ['festival'], CIRCLE, 'easy',
    { r: '321', R: '498', h: '3801', y: '783', Y: '725', s: '415' },
    (c) => {
      const x = c.dx, y = c.dy - 1.5;
      if (inRect(x, y, -2.5, -13, 2.5, -10.5)) return 'y'; // cap
      if (Math.abs(Math.hypot(x, y + 14.2) - 1.6) < 0.6 && y < -13) return 's'; // hook
      if (!inCircle(x, y, 10.5)) return '.';
      const zig = Math.abs(((x + 40) % 4) - 2) - 1;
      if (Math.abs(y - zig * 1.2) < 1.2) return 'y';
      if (Math.abs(y - 5.5 - zig) < 0.8 || Math.abs(y + 5.5 - zig) < 0.8) return 'Y';
      if (inEllipse(x + 4.5, y + 5.5, 2.2, 1.5)) return 'h';
      return Math.hypot(x - 2, y - 2) > 9.2 ? 'R' : 'r';
    }),

  // ---------- egg box ----------
  make('กล่องรูปไข่ ต้นคริสต์มาส', 'ต้นคริสต์มาสสามชั้นประดับลูกบอลสีแดงทอง ดาวบนยอด บนฝากล่องรูปไข่', ['festival', 'flowers'], EGG, 'easy',
    { g: '699', G: '701', t: '433', y: '725', r: '321', o: '783', w: 'B5200' },
    (c) => {
      const x = c.dx, y = c.dy;
      if (inStar(x, y, 0, -12, 4.2, 0.5)) return 'y';
      if (inRect(x, y, -1.5, 11, 1.5, 14)) return 't';
      const tiers: [number, number, number][] = [[-10, -2, 5], [-5, 4, 8], [0, 11, 10.5]];
      for (const [top, bot, half] of tiers) {
        if (y >= top && y <= bot) {
          const w = ((y - top) / (bot - top)) * half;
          if (Math.abs(x) <= w) {
            if ((c.x * 3 + c.y * 5) % 11 === 0) return rnd(c.x, c.y) < 0.5 ? 'r' : 'o';
            return Math.abs(x) > w - 1.2 && y > top + 1 ? 'G' : 'g';
          }
        }
      }
      if ((c.x * 7 + c.y * 3) % 23 === 0 && c.d > 1) return 'w';
      return '.';
    }),
  make('กล่องรูปไข่ ตุ๊กตาหิมะ', 'ตุ๊กตาหิมะสวมหมวกและผ้าพันคอแดง บนพื้นฟ้าอ่อน ทรงไข่พอดีตัว', ['festival', 'cute'], EGG, 'medium',
    { s: '3325', w: 'B5200', W: '762', k: '310', o: '740', r: '321' },
    (c) => {
      const x = c.dx, y = c.dy;
      if (inRect(x, y, -4, -15, 4, -10) || inRect(x, y, -6, -10, 6, -9)) return 'k'; // hat
      if (inRect(x, y, -4, -11, 4, -11)) return 'r';
      const head = inCircle(x, y + 5, 5.2), body = inCircle(x, y - 6.5, 7.8);
      if (inRect(x, y, -6, -1, 6, 0.5) && (head || body || Math.abs(x) < 6)) return 'r'; // scarf
      if (inRect(x, y, 3, 0, 5, 5)) return 'r';
      if (head) {
        if (near(Math.abs(x), 2) && near(y, -6)) return 'k';
        if (near(y, -4) && x >= -0.5 && x <= 3) return 'o';
        if (near(y, -2) && Math.abs(x) <= 2.5 && Math.abs(x) > 0.6) return 'k';
        return x > 3 ? 'W' : 'w';
      }
      if (body) {
        if (near(x, 0) && (near(y, 3) || near(y, 6) || near(y, 9))) return 'k';
        return x > 5.5 ? 'W' : 'w';
      }
      if (y > 12) return 'w'; // snow ground
      return (c.x * 5 + c.y * 7) % 19 === 0 ? 'w' : 's';
    }),
  make('กล่องรูปไข่ เพนกวินผ้าพันคอ', 'เพนกวินตัวกลมสวมผ้าพันคอลายทาง ทรงไข่เหมือนตัวเพนกวินพอดี', ['festival', 'animals', 'cute'], EGG, 'medium',
    { k: '310', K: '413', w: 'B5200', o: '740', O: '947', r: '321' },
    (c) => {
      const x = c.dx, y = c.dy;
      if (y >= 13.5 && (inEllipse(x + 4, y - 15, 3, 1.6) || inEllipse(x - 4, y - 15, 3, 1.6))) return 'o';
      if (inRect(x, y, -9, -2, 9, 0)) return (c.x + c.y) % 4 < 2 ? 'r' : 'w'; // striped scarf
      if (inRect(x, y, 4, 0, 7, 6)) return c.y % 3 === 0 ? 'w' : 'r';
      if (inEllipse(x, y - 6, 7.5, 9)) return 'w'; // belly
      if (inEllipse(x, y + 7.5, 6, 5.5)) { // face
        if (inCircle(x + 2.5, y + 8, 1.2) || inCircle(x - 2.5, y + 8, 1.2)) return 'k';
        if (inPoly(x, y, [[-1.5, -5.5], [1.5, -5.5], [0, -3.5]])) return 'O';
        return 'w';
      }
      return x > 8 ? 'K' : 'k';
    }),

  // ---------- heart box ----------
  make('กล่องหัวใจ ใบฮอลลี่', 'ใบฮอลลี่เขียวสามใบกับผลเบอร์รี่แดง บนหัวใจสีครีม', ['festival', 'flowers'], HEART, 'easy',
    { c: '3865', g: '699', G: '702', v: '890', r: '321', R: '498', w: 'B5200' },
    (c) => {
      const x = c.dx, y = c.dy;
      const leaf = (lx: number, ly: number, ang: number) => {
        const ca = Math.cos(ang), sa = Math.sin(ang), u = (x - lx) * ca + (y - ly) * sa, v = -(x - lx) * sa + (y - ly) * ca;
        if (!inEllipse(u, v, 8.5, 3.6)) return '';
        if (Math.abs(v) > 3.6 - 0.9 * (0.5 + 0.5 * Math.cos(u * 1.3))) return 'c'; // wavy holly edge
        return Math.abs(v) < 0.6 ? 'v' : v < 0 ? 'G' : 'g';
      };
      for (const [cx, cy] of [[0, 4], [2.2, 5.6], [-2.2, 5.6]] as [number, number][]) { // berries
        if (inCircle(x - cx, y - cy, 1.7)) return inCircle(x - cx + 0.5, y - cy + 0.5, 0.6) ? 'w' : 'r';
      }
      const l = leaf(-6.5, -1, 0.62) || leaf(6.5, -1, -0.62); // two leaves angled up from the berries
      if (l) return l;
      return c.d <= 1 ? 'R' : 'c';
    }),
  make('กล่องหัวใจ ลายสก็อตคริสต์มาส', 'หัวใจลายผ้าสก็อตแดงเขียวแบบเสื้อหน้าหนาว', ['festival', 'geometric'], HEART, 'medium',
    { r: '321', R: '498', g: '699', y: '783', k: '310' },
    (c) => {
      const px = ((c.x % 8) + 8) % 8, py = ((c.y % 8) + 8) % 8;
      const vx = px < 2, vy = py < 2;
      if (px === 5 || py === 5) return (c.x + c.y) % 2 === 0 ? 'y' : vx || vy ? 'g' : 'r';
      if (vx && vy) return 'k';
      if (vx || vy) return (c.x + c.y) % 2 === 0 ? 'g' : 'R';
      return 'r';
    }),
  make('กล่องหัวใจ หิมะตก', 'หัวใจสีแดงสดมีเกล็ดหิมะขาวโปรยลงมา', ['festival'], HEART, 'easy',
    { r: '321', R: '498', w: 'B5200', p: '3713' },
    (c) => {
      const x = c.dx, y = c.dy;
      if (snowflake(x, y, 0, -1, 9)) return 'w';
      for (const [sx, sy] of [[-11, -9], [9, -9], [-13, 2], [12, 2], [-6, 8], [6, 9], [0, 13], [-4, -11]] as [number, number][]) if (plus(c.dx, c.dy, sx, sy)) return 'w';
      for (const [sx, sy] of [[-8, -3], [8, -3], [-2, 6], [4, 4], [-14, -4], [14, -4]] as [number, number][]) if (c.dx === sx && c.dy === sy) return 'p';
      return c.d <= 1 ? 'R' : 'r';
    }),

  // ---------- oval box ----------
  make('กล่องวงรี หมู่บ้านหิมะ', 'หมู่บ้านเล็ก ๆ หลังคาสีแดงกลางหิมะ ต้นสนและดาวเต็มฟ้า บนฝากล่องวงรี', ['festival'], OVAL, 'hard',
    { n: '336', w: 'B5200', W: '3756', r: '321', b: '433', B: '801', y: '725', g: '699', G: '890' },
    (c) => {
      const x = c.dx, y = c.dy;
      const ground = 4 + Math.sin(x / 4) * 1.2;
      const houses: [number, number, number, number][] = [[-15, -8, -1, -5], [-4, 4, -3, -8], [8, 14, 0, -4]]; // left, right, wall top, roof top
      for (const [l, r, wt, rt] of houses) {
        const mid = (l + r) / 2, half = (r - l) / 2 + 1, edge = half * ((y - rt) / (wt - rt));
        if (y >= rt && y < wt && Math.abs(x - mid) <= edge) return y === rt + 1 || Math.abs(x - mid) > edge - 1 ? 'w' : 'r';
        if (inRect(x, y, l, wt, r, ground)) {
          if (Math.abs(x - mid) <= 1 && y >= ground - 3) return 'B'; // door
          if ((inRect(x, y, l + 1, wt + 1, l + 2, wt + 2) || inRect(x, y, r - 2, wt + 1, r - 1, wt + 2)) && r - l > 6) return 'y'; // windows
          return 'b';
        }
      }
      for (const tx of [-19, -11, 6, 18]) { // pines
        if (y <= ground && y >= ground - 7 && Math.abs(x - tx) <= (y - (ground - 7)) * 0.5) return c.y % 2 ? 'g' : 'G';
      }
      if (y > ground) return (c.x * 3 + c.y) % 13 === 0 ? 'W' : 'w';
      if ((c.x * 7 + c.y * 11) % 17 === 0) return 'y';
      if ((c.x * 5 + c.y * 3) % 29 === 0) return 'w';
      return 'n';
    }),
  make('กล่องวงรี เรนเดียร์จมูกแดง', 'หน้าเรนเดียร์น่ารักจมูกแดง เขากิ่งก้านสาขา บนฝากล่องวงรี', ['festival', 'animals', 'cute'], OVAL, 'medium',
    { b: '433', B: '801', t: '436', k: '310', w: 'B5200', r: '321', c: '3865' },
    (c) => {
      const x = c.dx, y = c.dy + 1;
      const antler = (s: number) => {
        const ax = x * s;
        return segDist(ax, y, 4, -6, 10, -12) < 0.8 || segDist(ax, y, 8, -10, 14, -10) < 0.8 || segDist(ax, y, 7, -9, 8, -14) < 0.7 || segDist(ax, y, 11, -11, 12, -14.5) < 0.7;
      };
      if (antler(1) || antler(-1)) return 't';
      if (inEllipse(x - 8.5, y + 3, 3, 1.6) || inEllipse(x + 8.5, y + 3, 3, 1.6)) return 'B'; // ears
      if (inEllipse(x, y - 1, 7.5, 9)) {
        if (inCircle(x, y - 7, 2.4)) return inCircle(x + 0.8, y - 7.8, 0.7) ? 'w' : 'r';
        if (inCircle(x + 3, y + 2, 1.2) || inCircle(x - 3, y + 2, 1.2)) return inCircle(x + 3.4, y + 1.6, 0.4) || inCircle(x - 2.6, y + 1.6, 0.4) ? 'w' : 'k';
        if (inEllipse(x, y - 5.5, 4.5, 3.5)) return 't';
        return x > 5 ? 'B' : 'b';
      }
      if ((c.x * 5 + c.y * 7) % 23 === 0 && c.d > 1) return 'c';
      return '.';
    }),
  make('กล่องวงรี ลายเสื้อไหมพรม', 'ลายแฟร์ไอส์ลแบบเสื้อไหมพรมคริสต์มาส: ฟันปลา ต้นสน เกล็ดหิมะ และตาหมากรุก', ['festival', 'geometric'], OVAL, 'medium',
    { r: '321', w: 'B5200', g: '699', R: '498' },
    (c) => {
      const y = c.by, x = c.bx;
      const band = Math.floor(y / 4) % 4;
      if (y % 4 === 0) return 'w'; // thin white lines between bands
      const tx = x % 6, ty = y % 4;
      if (band === 0) return Math.abs(tx - 3) + (ty - 2) === 1 ? 'w' : 'r'; // zigzag
      if (band === 1) return (ty === 1 && tx === 3) || (ty === 2 && tx >= 2 && tx <= 4) || (ty === 3 && tx >= 1 && tx <= 5) ? 'g' : 'w'; // tiny trees
      if (band === 2) return (tx === 3 && ty >= 1) || (ty === 2 && tx >= 2 && tx <= 4) ? 'w' : 'R'; // snowflake crosses
      return (x + y) % 2 === 0 ? 'w' : 'r'; // checks
    }),

  // ---------- square box ----------
  make('กล่องสี่เหลี่ยม กล่องของขวัญ', 'กล่องของขวัญสีแดงผูกริบบิ้นเขียวทองและโบว์ใหญ่ บนฝากล่องสี่เหลี่ยม', ['festival'], SQUARE, 'easy',
    { r: '321', R: '498', g: '699', G: '890', y: '783', w: 'B5200' },
    (c) => {
      const x = c.dx, y = c.dy;
      if (inEllipse(x + 4.5, y + 11, 4.5, 3) || inEllipse(x - 4.5, y + 11, 4.5, 3)) return inEllipse(x + 4.5, y + 11, 2.2, 1) || inEllipse(x - 4.5, y + 11, 2.2, 1) ? 'G' : 'g'; // bow
      if (inRect(x, y, -1.5, -13, 1.5, -9)) return 'y';
      if (Math.abs(x) <= 2) return Math.abs(x) === 2 ? 'y' : 'g';
      if (Math.abs(y + 1) <= 2) return Math.abs(y + 1) === 2 ? 'y' : 'g';
      if (y < -8) return '.';
      if ((c.x + c.y * 3) % 9 === 0) return 'w';
      return x > 10 || y > 10 ? 'R' : 'r';
    }),
  make('กล่องสี่เหลี่ยม บ้านขนมปังขิง', 'บ้านขนมปังขิงหลังคาเคลือบน้ำตาลไอซิ่ง ประตูลูกกวาด หน้าต่างไฟเหลือง', ['festival', 'food', 'cute'], SQUARE, 'medium',
    { b: '434', B: '801', w: 'B5200', r: '321', y: '725', g: '699', p: '3326', s: '3756' },
    (c) => {
      const x = c.dx, y = c.dy;
      if (y >= -14 && y <= -3 && Math.abs(x) <= (y + 14) * 1.3 + 1) { // roof
        if (Math.abs(x) >= (y + 14) * 1.3 - 0.4) return 'w'; // icing edge
        return c.y % 3 === 0 ? 'w' : 'B';
      }
      if (inRect(x, y, -11, -3, 11, 12)) {
        if (inRect(x, y, -2.5, 4, 2.5, 12)) return c.y % 2 ? 'r' : 'w'; // candy door
        if (inRect(x, y, -9, -1, -4, 3) || inRect(x, y, 4, -1, 9, 3)) return x === -6.5 || x === 6.5 || y === 1 ? 'w' : 'y';
        if (y === -2 || y === 12) return 'w';
        if ((c.x * 2 + c.y) % 7 === 0) return ['r', 'g', 'p'][(c.x + c.y) % 3];
        return 'b';
      }
      if (y > 12) return 'w';
      return (c.x * 5 + c.y * 3) % 13 === 0 ? 'w' : 's';
    }),
  make('กล่องสี่เหลี่ยม ซานตาคลอส', 'หน้าซานตาคลอสยิ้มแก้มแดง หมวกขนฟู เคราขาวยาว', ['festival', 'characters', 'cute'], SQUARE, 'medium',
    { r: '321', R: '498', w: 'B5200', W: '762', f: '951', p: '3326', k: '310', n: '3354' },
    (c) => {
      const x = c.dx, y = c.dy;
      if (inCircle(x - 9, y + 12, 2.6)) return 'w'; // pompom
      if (y < -6 && inPoly(x, y, [[-11, -6], [11, -6], [8, -10], [-1, -15], [9, -12.5]])) return x > 6 ? 'R' : 'r';
      if (inRect(x, y, -12, -7, 12, -4)) return (c.x + c.y) % 3 ? 'w' : 'W'; // fur band
      if (inEllipse(x, y - 1, 7, 6) && y <= 2) { // face
        if (near(Math.abs(x), 3) && near(y, -1)) return 'k';
        if (inCircle(x + 5, y - 1.5, 1.2) || inCircle(x - 5, y - 1.5, 1.2)) return 'p';
        if (inCircle(x, y - 1, 1.3)) return 'n';
        return 'f';
      }
      if ((inEllipse(x, y - 6, 11, 9) && y > 0) || inEllipse(x, y - 3, 11, 6)) { // beard
        if (near(y, 3) && Math.abs(x) <= 2.5) return 'R';
        return (c.x * 3 + c.y) % 5 === 0 ? 'W' : 'w';
      }
      return '.';
    }),

  // ---------- star box ----------
  make('กล่องดาว ดาวทองประกาย', 'ดาวไล่สีทองจากขอบเข้ากลาง ประกายขาวตรงกลาง บนฝากล่องดาว', ['festival', 'geometric'], STAR, 'easy',
    { a: '782', b: '783', c: '725', d: '726', e: '727', w: 'B5200' },
    (c, maxD) => {
      if (plus(c.dx, c.dy, 0, 1) || (Math.abs(c.dx) === Math.abs(c.dy - 1) && Math.abs(c.dx) <= 2 && c.dx !== 0)) return 'w';
      const f = c.d / Math.max(1, maxD);
      return f < 0.2 ? 'a' : f < 0.4 ? 'b' : f < 0.6 ? 'c' : f < 0.8 ? 'd' : 'e';
    }),
  make('กล่องดาว ลายลูกกวาด', 'ดาวลายเฉียงแดงขาวแบบไม้เท้าลูกกวาด ขอบเขียว', ['festival', 'food'], STAR, 'easy',
    { r: '321', w: 'B5200', g: '699' },
    (c) => (c.d <= 1 ? 'g' : (((c.x + c.y) % 6) + 6) % 6 < 3 ? 'r' : 'w')),
  make('กล่องดาว คืนคริสต์มาส', 'ท้องฟ้าคืนคริสต์มาส จันทร์เสี้ยว ดาวระยิบ และต้นสนบนเนินหิมะ', ['festival'], STAR, 'medium',
    { n: '336', N: '823', w: 'B5200', y: '725', g: '699', G: '890', s: '3756' },
    (c) => {
      const x = c.dx, y = c.dy;
      if (y > 7 + Math.cos(x / 3) * 0.8) return (c.x + c.y) % 7 === 0 ? 's' : 'w';
      if (y <= 7 && y >= -3 && Math.abs(x) <= (y + 3) * 0.55) return c.y % 2 ? 'g' : 'G';
      if (inCircle(x - 6, y + 3, 3.4) && !inCircle(x - 7.6, y + 4.2, 3)) return 'y';
      if ((c.x * 7 + c.y * 5) % 19 === 0) return 'y';
      if ((c.x * 3 + c.y * 11) % 31 === 0) return 'w';
      return c.d <= 1 ? 'N' : 'n';
    }),

  // ---------- triangle box ----------
  make('กล่องสามเหลี่ยม ต้นสนประดับไฟ', 'ต้นคริสต์มาสเต็มฝากล่องสามเหลี่ยม พันสายไฟเหลืองและลูกบอลหลากสี ดาวบนยอด', ['festival', 'flowers'], TRI, 'easy',
    { g: '699', G: '701', y: '725', r: '321', b: '820', o: '783', w: 'B5200' },
    (c) => {
      const x = c.dx, y = c.dy;
      if (inStar(x, y, 0, -c.bh / 2 + 3, 2.6)) return 'y';
      const garland = (((y * 2 - x * 0.9) % 8) + 8) % 8;
      if (garland < 0.9 && c.d > 1) return c.x % 2 ? 'y' : 'w';
      if ((c.x * 5 + c.y * 3) % 13 === 0 && c.d > 1) return ['r', 'b', 'o'][(c.x + c.y) % 3];
      return c.d <= 1 ? 'G' : 'g';
    }),
  make('กล่องสามเหลี่ยม หมวกซานต้า', 'หมวกซานต้าสีแดงขอบขนฟูสีขาว พู่กลมบนยอด', ['festival'], TRI, 'easy',
    { r: '321', R: '498', w: 'B5200', W: '762' },
    (c) => {
      const y = c.by, x = c.dx;
      if (y <= 3 && Math.abs(x) <= 3) return (c.x + c.y) % 3 ? 'w' : 'W'; // pompom at the tip
      if (y >= c.bh - 5) return (c.x + c.y) % 3 ? 'w' : 'W'; // fur band
      if (c.d <= 2 && x > 0) return 'R';
      return Math.sin((x - y * 0.4) / 2.2) > 0.85 ? 'R' : 'r';
    }),
  make('กล่องสามเหลี่ยม ภูเขาหิมะ', 'ภูเขายอดหิมะ ต้นสนเรียงแถวที่เชิงเขา และหิมะปกคลุมพื้น', ['festival'], TRI, 'medium',
    { s: '3325', m: '414', M: '318', w: 'B5200', W: '762', g: '699', G: '890' },
    (c) => {
      const x = c.dx, y = c.by;
      if (y > c.bh - 4) return (c.x + c.y) % 5 ? 'w' : 's'; // snow ground
      for (const tx of [-10, -5, 0, 5, 10]) { // pines along the foot
        const top = c.bh - 11;
        if (y >= top && y <= c.bh - 4 && Math.abs(x - tx) <= (y - top) * 0.4) return c.y % 2 ? 'g' : 'G';
      }
      const snowline = c.bh * 0.38 + Math.sin(x * 1.3) * 1.3;
      if (y < snowline) return x > 1 ? 'W' : 'w'; // snow cap, shaded on the right
      if (y < snowline + 2.5 && (c.x + c.y) % 3 === 0) return 'w'; // snow streaks
      return x > 0 ? 'M' : 'm'; // rock, lit from the left
    }),
];
