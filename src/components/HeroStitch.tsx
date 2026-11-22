import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { COLORS, currentMotif, type MotifFx } from '../lib/heroMotifs';

const C = 15; // one square, in drawing units
const O = 7;  // margin around the chart
const FABRIC = 5; // squares of fabric drawn past the chart, fading out
const SEEN = 'sbs:hero-stitched';

function seen(): boolean {
  try { return sessionStorage.getItem(SEEN) === '1'; } catch { return true; }
}
const lessMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The home page's picture: a little chart for the time of year (lib/heroMotifs.ts) that stitches itself,
 * one cross at a time, row by row and back the way it's worked by hand, then plays its festival effect
 * once (balloons, bats, snow, a floating krathong…). Once per visit, and never when the device asks for
 * less motion; after that it's simply the finished picture.
 */
export function HeroStitch() {
  const motif = useMemo(() => currentMotif(), []);
  const animate = useMemo(() => !seen() && !lessMotion(), []);
  const fxRef = useRef<HTMLDivElement>(null);
  const [floating, setFloating] = useState(false);
  useEffect(() => {
    try { sessionStorage.setItem(SEEN, '1'); } catch { /* plays again next time */ }
  }, []);

  const rows = motif.rows;
  const cols = Math.max(...rows.map((r) => r.length));
  // a square drawing area, with the chart centred in it, so every motif sits in the same box
  const side = Math.max(cols, rows.length);
  const ox = O + ((side - cols) * C) / 2, oy = O + ((side - rows.length) * C) / 2;
  const box = side * C + 2 * O;

  // stitching order: left to right, then right to left on the next row
  const cells = useMemo(() => {
    const out: [number, number, string][] = [];
    rows.forEach((row, y) => {
      const xs = [...row].map((c, x) => (c !== '.' ? x : -1)).filter((x) => x >= 0);
      (y % 2 ? xs.reverse() : xs).forEach((x) => out.push([x, y, row[x]]));
    });
    return out;
  }, [rows]);
  const step = Math.max(8, Math.min(28, 1500 / cells.length));

  // the effect, once the last stitch is in
  useEffect(() => {
    const fx = motif.fx;
    if (!animate || !fx) return;
    const tm = setTimeout(() => {
      if (fx === 'float') setFloating(true);
      else if (fxRef.current) playFx(fxRef.current, fx);
    }, cells.length * step + 250);
    return () => clearTimeout(tm);
  }, [animate, motif, cells.length, step]);

  // the fabric: holes at every square's corner (where a real cross starts and ends), on the chart's grid,
  // running past it and fading out
  const holes: [number, number][] = [];
  for (let y = -FABRIC; y <= side + FABRIC; y++) for (let x = -FABRIC; x <= side + FABRIC; x++) holes.push([O + x * C, O + y * C]);
  const mid = box / 2, far = C * (FABRIC + side / 2 + 2);
  const p = 2.6; // legs run hole to hole, stopping just short so the hole still shows between stitches

  const cross = ([x, y, k]: [number, number, string], i: number) => {
    const [over, under] = COLORS[k] ?? COLORS.R;
    const a = ox + x * C, b = oy + y * C;
    const flame = motif.fx === 'float' && (k === 'Y' || k === 'O');
    return (
      <g key={`${x},${y}`} className={'hs-x' + (flame ? ' hs-flame' : '')} style={{ animationDelay: `${i * step}ms` }}>
        <line x1={a + p} y1={b + p} x2={a + C - p} y2={b + C - p} stroke={under} />
        <line x1={a + C - p} y1={b + p} x2={a + p} y2={b + C - p} stroke={over} />
      </g>
    );
  };
  const indexed = cells.map((c, i) => [c, i] as const);
  const water = motif.fx === 'float' ? indexed.filter(([c]) => c[2] === 'B') : [];
  const rest = motif.fx === 'float' ? indexed.filter(([c]) => c[2] !== 'B') : indexed;

  return (
    <div className="hero-art">
      <svg className={`hero-stitch motif-${motif.id}` + (animate ? ' play' : '') + (floating ? ' floating' : '')} viewBox={`0 0 ${box} ${box}`}
        role="img" aria-label={t(`ภาพปัก${motif.label[0]}`, `${motif.label[1]} in cross stitch`)}>
        <defs>
          <radialGradient id="hs-fade" cx={mid} cy={mid} r={far} gradientUnits="userSpaceOnUse">
            <stop offset="0.45" stopColor="#fff" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="hs-fabric" maskUnits="userSpaceOnUse" x={-far} y={-far} width={box + 2 * far} height={box + 2 * far}>
            <rect x={-far} y={-far} width={box + 2 * far} height={box + 2 * far} fill="url(#hs-fade)" />
          </mask>
        </defs>
        <g className="hs-holes" mask="url(#hs-fabric)">
          {holes.map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r={1.5} />)}
        </g>
        {motif.fx === 'float' ? (
          <>
            <g className="hs-bob">{rest.map(([c, i]) => cross(c, i))}</g>
            <g className="hs-wave">{water.map(([c, i]) => cross(c, i))}</g>
          </>
        ) : rest.map(([c, i]) => cross(c, i))}
      </svg>
      <div className="hero-fx" ref={fxRef} aria-hidden="true" />
    </div>
  );
}

// ---------- the one-time festival effects (small shapes thrown from the picture, then removed) ----------

const BAT = '<svg width="30" height="15" viewBox="0 0 24 12"><path d="M0 5C2 2 5 2 6 4C7 1.5 9 1.5 10 3L10.6 1.2L11.6 2.6H12.4L13.4 1.2L14 3C15 1.5 17 1.5 18 4C19 2 22 2 24 5C21.5 4.5 19.5 6.5 18.5 8.5C16.8 7 14.8 7.8 12 10.5C9.2 7.8 7.2 7 5.5 8.5C4.5 6.5 2.5 4.5 0 5Z" fill="#3a3550"/><circle cx="11" cy="4.6" r=".8" fill="#fff"/><circle cx="13" cy="4.6" r=".8" fill="#fff"/></svg>';
const cross = (color: string, size = 12) => `<span style="color:${color};font-size:${size}px;font-weight:700">✕</span>`;
const balloon = (color: string) => `<svg width="16" height="34" viewBox="0 0 16 34"><ellipse cx="8" cy="8" rx="7" ry="8" fill="${color}"/><ellipse cx="5.5" cy="5" rx="1.6" ry="2.4" fill="#fff" opacity=".55"/><path d="M8 16l-1.5 2h3z" fill="${color}"/><path d="M8 18c-2 4 2 8 0 15" stroke="#8b93a3" fill="none" stroke-width="1"/></svg>`;

function playFx(layer: HTMLElement, kind: Exclude<MotifFx, 'float'>) {
  const W = layer.clientWidth, H = layer.clientHeight;
  const add = (html: string, x: number, y: number, frames: Keyframe[], duration: number, delay: number, easing = 'cubic-bezier(.2,.7,.3,1)') => {
    const el = document.createElement('span');
    el.className = 'hs-p';
    el.innerHTML = html;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    layer.appendChild(el);
    const a = el.animate(frames, { duration, delay, easing, fill: 'both' });
    a.onfinish = () => el.remove();
    return el;
  };
  if (kind === 'fire') {
    const colors = ['#c72b3b', '#e0a526', '#3a7bd5', '#2f7d4f', '#f08aa8'];
    [[0.2, 0.15], [0.8, 0.2], [0.5, -0.05]].forEach(([fx, fy], k) => {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, d = 30 + Math.random() * 14;
        add(cross(colors[(i + k) % 5]), W * fx, H * fy, [{ transform: 'translate(0,0) scale(.4)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) scale(1)`, opacity: 0 }], 1100, k * 380);
      }
    });
  }
  if (kind === 'balloons') {
    const colors = ['#f08aa8', '#9cc3ea', '#e0a526', '#6fb27f', '#c72b3b'];
    colors.forEach((c, i) => {
      const sway = (i % 2 ? 1 : -1) * 8;
      add(balloon(c), W * (0.05 + i * 0.22), H * 0.9, [{ transform: 'translate(0,0)', opacity: 0 }, { opacity: 1, offset: 0.1 }, { transform: `translate(${sway}px,${-H * 0.6}px)`, offset: 0.6 }, { transform: `translate(${-sway}px,${-H * 1.2}px)`, opacity: 0 }], 3000, i * 260, 'ease-in-out');
    });
  }
  if (kind === 'spray') {
    // the gun points left; on phones it's mirrored (styles: .motif-songkran) to aim at open space instead
    const dir = matchMedia('(max-width: 600px)').matches ? 1 : -1;
    const nozzle = dir < 0 ? W * 0.08 : W * 0.92;
    for (let i = 0; i < 18; i++) {
      const d = (40 + Math.random() * 30) * dir;
      add(cross(i % 2 ? '#3a7bd5' : '#9cc3ea', 10), nozzle, H * 0.45, [{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${d}px,${-6 + Math.random() * 6}px)`, opacity: 1, offset: 0.5 }, { transform: `translate(${d + 12 * dir}px,${30 + Math.random() * 20}px)`, opacity: 0 }], 900, i * 60, 'linear');
    }
  }
  if (kind === 'rain') {
    for (let i = 0; i < 26; i++) {
      add('<span style="display:block;width:2px;height:8px;border-radius:2px;background:#6f9fce"></span>', Math.random() * W * 1.4 - W * 0.2, -H * 0.3,
        [{ transform: 'translateY(0)', opacity: 0 }, { opacity: 0.9, offset: 0.1 }, { transform: `translateY(${H * 1.3}px)`, opacity: 0 }], 900 + Math.random() * 400, i * 110, 'linear');
    }
  }
  if (kind === 'bats') {
    for (let i = 0; i < 4; i++) {
      const dir = i % 2 ? 1 : -1, dx = dir * (45 + i * 10), dy = -(45 + i * 8);
      const el = add(BAT, W / 2 - 15, H * 0.4, [{ transform: 'translate(0,0) scale(.3)', opacity: 0 }, { opacity: 1, offset: 0.12 }, { transform: `translate(${dx * 0.5}px,${dy * 0.6}px) scale(1)`, offset: 0.5 }, { transform: `translate(${dx}px,${dy}px) scale(1)`, opacity: 0 }], 2000, i * 260, 'ease-out');
      (el.firstChild as HTMLElement).animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(.35)' }], { duration: 150, iterations: 14, direction: 'alternate', delay: i * 260 });
    }
  }
  if (kind === 'snow') {
    for (let i = 0; i < 16; i++) {
      add(cross(i % 2 ? '#9cc3ea' : '#c9dff3', 11), Math.random() * W * 1.4 - W * 0.2, -H * 0.25,
        [{ transform: 'translateY(0) rotate(0)', opacity: 0 }, { opacity: 1, offset: 0.1 }, { transform: `translateY(${H * 1.2}px) rotate(${Math.random() * 180}deg)`, opacity: 0 }], 2600 + Math.random() * 900, i * 140);
    }
  }
}
