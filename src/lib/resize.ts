import type { Pattern, PatternDetails, Progress } from '../types';
import type { TemplateDef } from './templates';

/**
 * Putting an existing design onto a new grid: a new size, or a different model (another template, a box
 * lid, plain fabric). Used by components/ResizeDialog.tsx; the editor applies the result as one undo step.
 *
 *   scale — the design is resampled to fill the new grid (shrinking keeps thin dark lines)
 *   keep  — stitches stay the same size, placed anywhere (a cell offset); whatever falls off the edge is cut
 *   clear — an empty grid; the thread palette stays
 *
 * Stitches that land outside the new piece's shape (mask not '2') are dropped and counted as lost.
 */
export type FitMode = 'scale' | 'keep' | 'clear';

export interface Target {
  cols: number;
  rows: number;
  mask: string;
  pitchMm: number;
  mode: Pattern['mode'];
  templateId?: string;
  templateName?: string;
  details?: Partial<PatternDetails>;
}

export interface Plan {
  cells: number[];
  /** stitches in the design before / after */
  total: number;
  kept: number;
  /** stitches that fell outside the new grid or shape */
  lost: number;
  /** stitched cells carried over (keep mode, or scaling up; see canCarry); undefined = cleared */
  progress?: Progress;
}

const lum = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};

/** where the old grid's top-left cell lands on the new grid (keep mode); may be negative */
export interface Place { x: number; y: number }

/** anchor 0..8: row-major over top/middle/bottom × left/centre/right */
function offset(anchor: number, from: number, to: number, axis: 0 | 1) {
  const a = axis === 0 ? anchor % 3 : Math.floor(anchor / 3);
  return a === 0 ? 0 : a === 1 ? Math.floor((to - from) / 2) : to - from;
}

export function anchorAt(anchor: number, p: Pattern, t: Target): Place {
  return { x: offset(anchor, p.cols, t.cols, 0), y: offset(anchor, p.rows, t.rows, 1) };
}

/** keeps at least one row and column of the design on the new grid */
export function clampPlace(at: Place, p: Pattern, t: Target): Place {
  return {
    x: Math.max(1 - p.cols, Math.min(t.cols - 1, at.x)),
    y: Math.max(1 - p.rows, Math.min(t.rows - 1, at.y)),
  };
}

/**
 * Whether stitched cells can follow the design: in keep mode every stitch keeps its own cell, and when
 * scaling up (or to the same size) every new cell comes from exactly one old cell. Shrinking merges cells,
 * so there's no telling which new ones were stitched.
 */
export function canCarry(p: Pattern, t: Target, mode: FitMode): boolean {
  return mode === 'keep' || (mode === 'scale' && t.cols >= p.cols && t.rows >= p.rows);
}

export function planFit(p: Pattern, t: Target, mode: FitMode, at: Place = anchorAt(4, p, t), carry = true): Plan {
  const total = p.cells.reduce((n, c, i) => n + (c >= 0 && p.mask[i] === '2' ? 1 : 0), 0);
  const cells = new Array<number>(t.cols * t.rows).fill(-1);
  let lost = 0;
  const done = carry && canCarry(p, t, mode) ? p.progress?.done : undefined;
  const nd = done ? new Array<string>(t.cols * t.rows).fill('0') : null;
  if (mode === 'scale') {
    const sx = p.cols / t.cols, sy = p.rows / t.rows;
    const dark = p.palette.map((c) => lum(c.hex));
    for (let y = 0; y < t.rows; y++) for (let x = 0; x < t.cols; x++) {
      // the block of old cells this new cell covers (at least the one under its centre)
      const x0 = Math.floor(x * sx), y0 = Math.floor(y * sy);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx)), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      const count = new Map<number, number>();
      let n = 0, filled = 0;
      for (let yy = y0; yy < Math.min(y1, p.rows); yy++) for (let xx = x0; xx < Math.min(x1, p.cols); xx++) {
        n++;
        const i = yy * p.cols + xx, c = p.cells[i];
        if (c >= 0 && p.mask[i] === '2') { filled++; count.set(c, (count.get(c) ?? 0) + 1); }
      }
      if (!filled) continue;
      let best = -1, most = 0, darkest = -1;
      for (const [c, k] of count) {
        if (k > most) { most = k; best = c; }
        if (darkest < 0 || dark[c] < dark[darkest]) darkest = c;
      }
      // keep outlines: a dark thread covering a third of the block wins, even if the block is mostly empty
      const outline = darkest >= 0 && (count.get(darkest) ?? 0) * 3 >= n && dark[darkest] < 90;
      if (outline) best = darkest;
      else if (filled * 2 < n) continue;
      const j = y * t.cols + x;
      if (t.mask[j] !== '2') { lost++; continue; }
      cells[j] = best;
      // scaling up: this cell is a copy of the single old cell (x0, y0), stitched if that one was
      if (nd && done && done.charCodeAt(y0 * p.cols + x0) === 49) nd[j] = '1';
    }
  } else if (mode === 'keep') {
    const { x: ox, y: oy } = at;
    for (let y = 0; y < p.rows; y++) for (let x = 0; x < p.cols; x++) {
      const i = y * p.cols + x, c = p.cells[i];
      if (c < 0 || p.mask[i] !== '2') continue;
      const tx = x + ox, ty = y + oy, j = ty * t.cols + tx;
      if (tx < 0 || ty < 0 || tx >= t.cols || ty >= t.rows || t.mask[j] !== '2') { lost++; continue; }
      cells[j] = c;
      if (nd && done && done.charCodeAt(i) === 49) nd[j] = '1';
    }
  }
  const progress: Progress | undefined = p.progress && nd ? { ...p.progress, done: nd.join(''), updatedAt: Date.now() } : undefined;
  const kept = cells.reduce((n, c) => n + (c >= 0 ? 1 : 0), 0);
  return { cells, total, kept, lost: mode === 'clear' ? total : lost, progress };
}

export function applyFit(p: Pattern, t: Target, plan: Plan, dropUnused = false): Pattern {
  let { cells } = plan;
  let palette = p.palette;
  if (dropUnused) {
    // only colours the resize took out; spare colours the person added on purpose stay
    const before = new Set(p.cells.filter((c) => c >= 0));
    const after = new Set(cells.filter((c) => c >= 0));
    const keep = (i: number) => after.has(i) || !before.has(i);
    const map = new Map<number, number>();
    palette = p.palette.filter((_, i) => keep(i));
    p.palette.forEach((_, i) => { if (keep(i)) map.set(i, map.size); });
    cells = cells.map((c) => (c < 0 ? c : map.get(c)!));
  }
  return {
    ...p,
    cols: t.cols, rows: t.rows, mask: t.mask, cells, palette, pitchMm: t.pitchMm,
    mode: t.mode, templateId: t.templateId, templateName: t.templateName,
    details: { ...p.details, ...t.details },
    progress: plan.progress,
    updatedAt: Date.now(),
  };
}

/** colours the design used before that the plan no longer uses */
export function droppedColors(p: Pattern, plan: Plan): number {
  const before = new Set(p.cells.filter((c) => c >= 0));
  const after = new Set(plan.cells.filter((c) => c >= 0));
  return [...before].filter((c) => !after.has(c)).length;
}

/**
 * The width/height a template was built from, worked out from the pattern's grid (some templates add
 * rows, e.g. a keyring tab, so the grid isn't always the input).
 */
export function templateDims(def: TemplateDef, p: Pattern): { w: number; h: number } {
  const w = Math.max(def.min, Math.min(def.max, p.cols));
  if (def.lockAspect) return { w, h: Math.round((w * def.h) / def.w) };
  for (let h = def.min; h <= def.max * 2; h++) if (def.build(w, h).rows === p.rows) return { w, h };
  return { w, h: Math.max(def.min, p.rows) };
}
