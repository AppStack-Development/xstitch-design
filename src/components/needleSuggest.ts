import { needleHint } from '../lib/stats';
import { t } from '../lib/i18n';

/**
 * Needle size / strand count the app suggests for a hole pitch, as concrete values.
 * Mirrors the ranges written out by `needleHint()` in lib/stats.ts.
 */
export interface NeedleSuggestion {
  /** needle sizes that count as "suggested" */
  sizes: string[];
  /** the one to fill in when the user asks for the suggested value */
  size: string;
  /** inclusive strand range that counts as "suggested" */
  strands: [number, number];
  /** the strand count to fill in */
  strand: number;
  /** human-readable reason (the hint text) */
  reason: string;
}

export function suggestNeedle(pitchMm: number, fabric?: { count: number; over: number }): NeedleSuggestion {
  // over two (evenweave, linen): strands follow the stitch size, but the needle has to pass between fine
  // threads, so it goes by the fabric's own count
  if (fabric && fabric.over === 2) {
    const base = suggestNeedle(pitchMm);
    const size = fabric.count >= 32 ? '#28' : fabric.count >= 25 ? '#26' : '#24';
    const sizes = size === '#28' ? ['#26', '#28'] : [size];
    const s = base.strands[0] === base.strands[1] ? `${base.strand}` : `${base.strands[0]}–${base.strands[1]}`;
    return {
      ...base, size, sizes,
      reason: t(`แนะนำ: เข็ม Tapestry ${sizes.join('–')}, ด้าย ${s} เส้น · ผ้า ${fabric.count} ct รูเล็กกว่าขนาดฝีเข็ม เลยใช้เข็มเล็กลง`,
        `Suggested: Tapestry needle ${sizes.join('–')}, ${s} strands · ${fabric.count} ct fabric has small holes for the stitch size, so a finer needle`),
    };
  }
  const reason = needleHint(pitchMm);
  if (pitchMm >= 3.2) return { sizes: ['#18', '#20'], size: '#20', strands: [6, 6], strand: 6, reason };
  if (pitchMm >= 2.4) return { sizes: ['#22'], size: '#22', strands: [4, 6], strand: 4, reason };
  if (pitchMm >= 1.75) return { sizes: ['#24'], size: '#24', strands: [2, 3], strand: 2, reason };
  if (pitchMm >= 1.5) return { sizes: ['#26'], size: '#26', strands: [2, 2], strand: 2, reason };
  return { sizes: ['#26', '#28'], size: '#26', strands: [1, 2], strand: 2, reason };
}

/** "24", "#24", " #24 " all mean the same needle */
export function sameNeedleSize(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/^#?\s*/, '#');
  return norm(a) === norm(b);
}
