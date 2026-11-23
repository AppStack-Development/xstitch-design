import { useId, useMemo } from 'react';
import { TEMPLATES } from '../lib/templates';
import { t } from '../lib/i18n';

/**
 * Example pictures for the home page's "ทำอะไรได้บ้าง" tiles, drawn in the site's cross-stitch style:
 * each shows the thing its tile describes (a photo turning into stitches, a grid being filled in, a stitched
 * 3D keychain, stitch mode with progress, a printed chart and thread list, community cards).
 */
export type FeatureArtKind = 'photo' | 'design' | 'print3d' | 'stitch' | 'chart' | 'community';

/** two-tone thread colours: [bottom leg, top leg] */
const C: Record<string, [string, string]> = {
  R: ['#c72b3b', '#e0525f'], Y: ['#e9a92c', '#f6c35a'], G: ['#2f7d4f', '#4f9e6c'], g: ['#5aa469', '#7cc08a'],
  B: ['#7a4a2a', '#9a6a48'], b: ['#6fa6de', '#9cc6ee'], N: ['#243b6b', '#3d5a94'],
};
const AIDA = '#f4f1ea';

/** Cross stitches for a little char-grid picture ('.' = empty), at (ox, oy) with cells of size s. */
function stitches(art: string[], ox: number, oy: number, s: number, opts: { rows?: (y: number) => boolean; key?: string } = {}) {
  const out: JSX.Element[] = [];
  art.forEach((row, y) => [...row].forEach((ch, x) => {
    const c = C[ch];
    if (!c || (opts.rows && !opts.rows(y))) return;
    const px = ox + x * s, py = oy + y * s, m = s * 0.2;
    out.push(
      <g key={`${opts.key ?? ''}${x},${y}`} strokeWidth={s * 0.28} strokeLinecap="round">
        <line x1={px + m} y1={py + m} x2={px + s - m} y2={py + s - m} stroke={c[0]} />
        <line x1={px + s - m} y1={py + m} x2={px + m} y2={py + s - m} stroke={c[1]} />
      </g>,
    );
  }));
  return out;
}

/** Faint grid lines over a cols × rows area. */
function grid(ox: number, oy: number, cols: number, rows: number, s: number, color = '#d8cfbe') {
  const out: JSX.Element[] = [];
  for (let x = 0; x <= cols; x++) out.push(<line key={'gx' + x} x1={ox + x * s} y1={oy} x2={ox + x * s} y2={oy + rows * s} stroke={color} strokeWidth={0.6} />);
  for (let y = 0; y <= rows; y++) out.push(<line key={'gy' + y} x1={ox} y1={oy + y * s} x2={ox + cols * s} y2={oy + y * s} stroke={color} strokeWidth={0.6} />);
  return out;
}

const SCENE = [
  'bbbbbbbbbb',
  'bbbbbbYYbb',
  'bbbbbYYYYb',
  'bbbbbYYYYb',
  'bbbbbbYYbb',
  'bbbbbbbbbb',
  'bgggbbbbbb',
  'ggggggbbGG',
  'gggggggGGG',
  'GGGGGGGGGG',
];
const HEART = ['.RR.RR.', 'RRRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'];
const TREE = ['...Y...', '...G...', '..GGG..', '.GGRGG.', '..GGG..', '.GGGGG.', 'GGGRGGG', '...B...'];
const STAR = ['...Y...', '...Y...', 'YYYYYYY', '.YYYYY.', '..YYY..', '.YY.YY.', 'Y.....Y'];
const BIG_HEART = ['.RR...RR.', 'RRRR.RRRR', 'RRRRRRRRR', 'RRRRRRRRR', '.RRRRRRR.', '..RRRRR..', '...RRR...', '....R....'];
const PINE = ['....Y....', '....G....', '...GGG...', '..GGRGG..', '...GGG...', '..GGGGG..', '.GGYGGRG.', '..GGGGG..', '.GGGRGGG.', 'GGGGGGGGG', '....B....'];

function PhotoArt() {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 240 150" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fb2e5" /><stop offset="1" stopColor="#cfe5f8" />
        </linearGradient>
      </defs>
      {/* the photo */}
      <g transform="rotate(-4 60 75)">
        <rect x="12" y="22" width="96" height="108" rx="6" fill="#fff" stroke="#e7e0d3" />
        <rect x="18" y="28" width="84" height="84" rx="3" fill={`url(#${id})`} />
        <circle cx="78" cy="50" r="11" fill="#f6c35a" />
        <path d="M18 92 Q40 74 62 90 T102 84 V112 H18z" fill="#5aa469" />
        <path d="M60 112 Q82 92 102 98 V112z" fill="#2f7d4f" />
      </g>
      {/* becomes */}
      <path d="M116 75h14 M125 69l6 6-6 6" stroke="#243b6b" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* the pattern */}
      <rect x="138" y="27" width="92" height="92" rx="4" fill={AIDA} />
      {stitches(SCENE, 140, 29, 8.8)}
    </svg>
  );
}

function DesignArt() {
  const s = 10, ox = 20, oy = 18;
  // the heart filled in reading order, about two thirds done; the pencil sits on the next cell
  const cells: { x: number; y: number }[] = [];
  BIG_HEART.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') cells.push({ x: x + 2, y: y + 1 }); }));
  const done = Math.round(cells.length * 0.66);
  const next = cells[done];
  return (
    <svg viewBox="0 0 240 150" aria-hidden="true">
      <rect x={ox} y={oy} width={13 * s} height={10 * s} fill="#fff" />
      {cells.map((c, i) => (
        <rect key={i} x={ox + c.x * s} y={oy + c.y * s} width={s} height={s} fill={i < done ? '#c72b3b' : 'none'}
          stroke={i < done ? 'none' : '#e0525f'} strokeDasharray={i < done ? undefined : '2 2'} strokeWidth={0.8} />
      ))}
      {grid(ox, oy, 13, 10, s)}
      {/* pencil on the next cell */}
      <g transform={`translate(${ox + next.x * s + 3} ${oy + next.y * s - 17}) scale(1.05)`}>
        <path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" fill="#f6c35a" stroke="#243b6b" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M14 7l3 3" stroke="#243b6b" strokeWidth="1.6" />
      </g>
      {/* DMC colours */}
      {([['#c72b3b', '321'], ['#f6c35a', '725'], ['#2f7d4f', '910'], ['#243b6b', '336']] as const).map(([c, code], i) => (
        <g key={code} transform={`translate(172 ${30 + i * 25})`}>
          {i === 0 && <circle r="11.5" fill="none" stroke="#243b6b" strokeWidth="2" />}
          <circle r="8" fill={c} />
          <text x="16" y="4" fontSize="10" fill="#5b6478" fontWeight="600">DMC {code}</text>
        </g>
      ))}
    </svg>
  );
}

/** The real heart-keychain template, stitched two cells in from the frame. */
function Print3dArt() {
  const { cols, rows, mask, depth } = useMemo(() => {
    const tpl = TEMPLATES.find((x) => x.id === 'keychain-heart')!;
    const r = tpl.build(14, Math.round((14 * tpl.h) / tpl.w));
    // Chebyshev distance of each hole from the nearest non-hole cell
    const n = r.cols * r.rows;
    const d = new Int32Array(n).fill(1e9);
    const queue: number[] = [];
    for (let i = 0; i < n; i++) if (r.mask[i] !== '2') { d[i] = 0; queue.push(i); }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], x = i % r.cols, y = (i / r.cols) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= r.cols || ny >= r.rows) continue;
        const j = ny * r.cols + nx;
        if (d[j] > d[i] + 1) { d[j] = d[i] + 1; queue.push(j); }
      }
    }
    return { ...r, depth: d };
  }, []);
  const s = 6;
  const cells: JSX.Element[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x, k = mask[i];
      if (k === '0') continue;
      const px = x * s, py = y * s;
      // slight overlap hides hairline seams between frame cells
      cells.push(<rect key={'f' + i} x={px - 0.2} y={py - 0.2} width={s + 0.4} height={s + 0.4} fill="#fff" />);
      if (k !== '2') continue;
      if (depth[i] >= 2) {
        cells.push(
          <g key={'x' + i} stroke="#c72b3b" strokeWidth={1.7} strokeLinecap="round">
            <line x1={px + 1.3} y1={py + 1.3} x2={px + s - 1.3} y2={py + s - 1.3} />
            <line x1={px + s - 1.3} y1={py + 1.3} x2={px + 1.3} y2={py + s - 1.3} stroke="#e0525f" />
          </g>,
        );
      } else {
        cells.push(<rect key={'h' + i} x={px + 1.6} y={py + 1.6} width={s - 3.2} height={s - 3.2} rx={0.6} fill="#b9ae9a" />);
      }
    }
  }
  const w = cols * s, h = rows * s;
  return <svg viewBox={`${-w * 0.35} -8 ${w * 1.7} ${h + 16}`} aria-hidden="true">{cells}</svg>;
}

function StitchModeArt() {
  const s = 10, ox = 26, oy = 12, doneRows = 7;
  return (
    <svg viewBox="0 0 240 150" aria-hidden="true">
      <rect x={ox - 2} y={oy - 2} width={9 * s + 4} height={11 * s + 4} rx="3" fill={AIDA} />
      {/* the row you're on */}
      <rect x={ox - 2} y={oy + doneRows * s} width={9 * s + 4} height={s} fill="#f2b33d55" />
      {stitches(PINE, ox, oy, s, { rows: (y) => y < doneRows })}
      {/* still to stitch: the chart's colour squares */}
      {PINE.map((row, y) => y < doneRows ? null : [...row].map((ch, x) => C[ch] && (
        <rect key={`p${x},${y}`} x={ox + x * s + 2} y={oy + y * s + 2} width={s - 4} height={s - 4} rx="1" fill={C[ch][0]} opacity=".28" />
      )))}
      <text x="140" y="62" fontSize="30" fontWeight="700" fill="#243b6b">62%</text>
      <rect x="140" y="72" width="78" height="8" rx="4" fill="#1f2a4414" />
      <rect x="140" y="72" width="48" height="8" rx="4" fill="#2f7d4f" />
      <text x="140" y="98" fontSize="11" fill="#5b6478">{t('ปักแล้ว 312 / 503', '312 / 503 stitched')}</text>
      <g transform="translate(140 108)">
        <circle cx="8" cy="8" r="8" fill="#2f7d4f" />
        <path d="M4.5 8.2l2.4 2.4 4.6-4.8" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x="22" y="12" fontSize="11" fill="#2f7d4f" fontWeight="600">{t('จำที่ค้างไว้', 'Saved')}</text>
      </g>
    </svg>
  );
}

function ChartArt() {
  const sym: Record<string, [string, string]> = { R: ['●', '#c72b3b'], G: ['▲', '#2f7d4f'], Y: ['★', '#c98a12'], B: ['■', '#7a4a2a'] };
  const s = 10.5, ox = 30, oy = 30;
  return (
    <svg viewBox="0 0 240 150" aria-hidden="true">
      <g transform="rotate(-3 80 80)">
        <rect x="18" y="12" width="112" height="128" rx="3" fill="#fff" stroke="#e7e0d3" />
        <rect x="30" y="19" width="50" height="5" rx="2.5" fill="#d8cfbe" />
        {grid(ox, oy, 8, 9, s, '#e7e0d3')}
        {TREE.map((row, y) => [...row].map((ch, x) => sym[ch] && (
          <text key={`${x},${y}`} x={ox + 0.5 * s + (x + 0.5) * s} y={oy + (y + 1) * s - 2.4} fontSize="8" textAnchor="middle" fill={sym[ch][1]}>{sym[ch][0]}</text>
        )))}
      </g>
      {/* thread list */}
      <rect x="142" y="30" width="86" height="96" rx="6" fill="#fff" stroke="#e7e0d3" />
      {([['#2f7d4f', '▲', '910'], ['#c72b3b', '●', '321'], ['#e9a92c', '★', '725'], ['#7a4a2a', '■', '433']] as const).map(([c, mark, code], i) => (
        <g key={code} transform={`translate(152 ${48 + i * 21})`}>
          <circle r="6" fill={c} />
          <text x="0" y="3" fontSize="7" textAnchor="middle" fill="#fff">{mark}</text>
          <text x="12" y="4" fontSize="10" fill="#1f2a44" fontWeight="600">DMC {code}</text>
        </g>
      ))}
    </svg>
  );
}

function CommunityArt() {
  const cards: { art: string[]; x: number; r: number; likes: number; sale?: boolean }[] = [
    { art: HEART, x: 14, r: -5, likes: 24 },
    { art: TREE, x: 88, r: 0, likes: 41, sale: true },
    { art: STAR, x: 162, r: 5, likes: 17 },
  ];
  return (
    <svg viewBox="0 0 240 150" aria-hidden="true">
      {cards.map((c, i) => {
        const s = 6.4, w = 64, cols = c.art[0].length, rows = c.art.length;
        return (
          <g key={i} transform={`rotate(${c.r} ${c.x + w / 2} 80)`}>
            <rect x={c.x} y="22" width={w} height="104" rx="7" fill="#fff" stroke="#e7e0d3" />
            <rect x={c.x + 4} y="26" width={w - 8} height="58" rx="4" fill={AIDA} />
            {stitches(c.art, c.x + (w - cols * s) / 2, 26 + (58 - rows * s) / 2, s, { key: String(i) })}
            {c.sale && <><rect x={c.x + 7} y="72" width="50" height="10" rx="5" fill="#2f7d4f" /><text x={c.x + 32} y="79.5" fontSize="6.5" fill="#fff" textAnchor="middle" fontWeight="600">{t('สั่งผลิตได้', 'Made to order')}</text></>}
            <rect x={c.x + 7} y="91" width="40" height="5" rx="2.5" fill="#1f2a44" opacity=".75" />
            <rect x={c.x + 7} y="100" width="28" height="4" rx="2" fill="#9aa0ad" opacity=".6" />
            <path d={`M${c.x + 10} 116.5l-3.2-3.1a2 2 0 0 1 3.2-2.3 2 2 0 0 1 3.2 2.3z`} fill="#c72b3b" />
            <text x={c.x + 17} y="117" fontSize="7.5" fill="#5b6478">{c.likes}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function FeatureArt({ kind }: { kind: FeatureArtKind }) {
  switch (kind) {
    case 'photo': return <PhotoArt />;
    case 'design': return <DesignArt />;
    case 'print3d': return <Print3dArt />;
    case 'stitch': return <StitchModeArt />;
    case 'chart': return <ChartArt />;
    case 'community': return <CommunityArt />;
  }
}
