import type { Pattern, PatternDetails } from '../types';
import { createPattern } from './pattern';
import { TEMPLATES, freeMask } from './templates';
import { DMC_LIBRARY, makeThread } from './threads';
import { APP_NAME } from './brand';

/**
 * Builders for hand-made patterns (used by the dev scripts that make the team's community patterns):
 * fabric() takes pixel art ('.' = no stitch, other chars map to DMC codes); onTemplate() paints a
 * template's stitch holes procedurally so the design always fits its shape.
 */
export type Legend = Record<string, string>; // char -> DMC code

function palette(legend: Legend) {
  const pal: Pattern['palette'] = [];
  const index: Record<string, number> = {};
  for (const [ch, code] of Object.entries(legend)) {
    const d = DMC_LIBRARY.find((x) => x.code === code)!;
    index[ch] = pal.length;
    pal.push(makeThread({ hex: d.hex, name: d.name, code: d.code, brand: 'DMC' }, pal));
  }
  return { pal, index };
}

const AUTHOR = APP_NAME;

export function fabric(o: { name: string; description: string; tags: string[]; difficulty: PatternDetails['difficulty']; art: string[]; legend: Legend }): Pattern {
  const m = 3; // empty fabric around the design
  const cols = o.art[0].length + m * 2, rows = o.art.length + m * 2;
  const p = createPattern({
    name: o.name, mode: 'free', cols, rows, mask: freeMask(cols, rows), pitchMm: +(25.4 / 14).toFixed(3),
    details: { baseType: 'aida', aidaCount: 14, needleSize: '#24', strands: 2, author: AUTHOR, description: o.description, tags: o.tags, difficulty: o.difficulty },
  });
  const { pal, index } = palette(o.legend);
  p.palette = pal;
  o.art.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '.') p.cells[(y + m) * cols + x + m] = index[ch];
  }));
  return p;
}

/** A stitch hole: its depth from the frame (1 = next to it), offset from the stitch area's centre, and position inside the area's bounding box. */
export interface Cell { x: number; y: number; d: number; dx: number; dy: number; bx: number; by: number; bw: number; bh: number }

/** Paint a template's stitch holes; `paint` returns a legend char or '.' for no stitch. */
export function onTemplate(o: { name: string; description: string; tags: string[]; difficulty: PatternDetails['difficulty']; template: string; w: number; h: number; legend: Legend; paint: (c: Cell, maxD: number) => string }): Pattern {
  const tpl = TEMPLATES.find((x) => x.id === o.template)!;
  const b = tpl.build(o.w, o.h);
  // a fixed model (Stitch Box lid) brings its own pitch, thickness and hole size
  const m = tpl.model;
  const pitch = m ? m.pitchMm : 3;
  const p = createPattern({
    name: o.name, mode: 'template', templateId: tpl.id, templateName: tpl.name, cols: b.cols, rows: b.rows, mask: b.mask, pitchMm: pitch,
    details: {
      baseType: 'print3d', strands: 4, needleSize: '#22', author: AUTHOR, description: o.description, tags: o.tags, difficulty: o.difficulty,
      ...(m ? { thicknessMm: m.thicknessMm, holeRatio: m.holeRatio } : {}),
    },
  });
  const { pal, index } = palette(o.legend);
  p.palette = pal;
  const n = b.cols * b.rows;
  const depth = new Int32Array(n).fill(1e9);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (b.mask[i] !== '2') { depth[i] = 0; queue.push(i); }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % b.cols, y = (i / b.cols) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= b.cols || ny >= b.rows) continue;
      const j = ny * b.cols + nx;
      if (depth[j] > depth[i] + 1) { depth[j] = depth[i] + 1; queue.push(j); }
    }
  }
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, maxD = 0;
  for (let i = 0; i < n; i++) if (b.mask[i] === '2') {
    const x = i % b.cols, y = (i / b.cols) | 0;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    maxD = Math.max(maxD, depth[i]);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (let i = 0; i < n; i++) {
    if (b.mask[i] !== '2') continue;
    const x = i % b.cols, y = (i / b.cols) | 0;
    const ch = o.paint({ x, y, d: depth[i], dx: x - cx, dy: y - cy, bx: x - x0, by: y - y0, bw: x1 - x0 + 1, bh: y1 - y0 + 1 }, maxD);
    if (ch !== '.') p.cells[i] = index[ch];
  }
  return p;
}
