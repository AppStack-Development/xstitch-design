import type { Pattern, PatternDetails } from '../types';
import { defaultPalette, uid } from './threads';
import { t } from './i18n';

export function defaultDetails(over: Partial<PatternDetails> = {}): PatternDetails {
  return {
    description: '',
    author: '',
    tags: [],
    difficulty: 'easy',
    estHours: '',
    stitchType: 'cross',
    threadBrand: 'DMC',
    strands: 2,
    needleType: t('เข็มปลายมน (Tapestry)', 'Tapestry (blunt tip)'),
    needleSize: '#24',
    baseType: 'print3d',
    aidaCount: 14,
    fabric: 'aida',
    over: 1,
    filament: 'PLA',
    filamentColor: '#f4f1ea',
    thicknessMm: 2,
    holeRatio: 0.55,
    notes: '',
    ...over,
  };
}

export function createPattern(init: {
  name: string;
  mode: Pattern['mode'];
  cols: number;
  rows: number;
  mask: string;
  pitchMm: number;
  templateId?: string;
  templateName?: string;
  details?: Partial<PatternDetails>;
}): Pattern {
  const now = Date.now();
  return {
    id: uid(),
    version: 1,
    name: init.name,
    mode: init.mode,
    templateId: init.templateId,
    templateName: init.templateName,
    cols: init.cols,
    rows: init.rows,
    pitchMm: init.pitchMm,
    mask: init.mask,
    cells: new Array(init.cols * init.rows).fill(-1),
    palette: defaultPalette(),
    details: defaultDetails(init.details),
    createdAt: now,
    updatedAt: now,
  };
}

/** Fill in fields that may be missing in older / imported data. */
export function normalizePattern(raw: any): Pattern {
  const p = raw as Pattern;
  const n = p.cols * p.rows;
  if (!Array.isArray(p.cells) || p.cells.length !== n) throw new Error(t('ข้อมูลลายไม่ถูกต้อง', 'Invalid pattern data'));
  if (typeof p.mask !== 'string' || p.mask.length !== n) throw new Error(t('ข้อมูลช่องปักไม่ถูกต้อง', 'Invalid stitch-cell data'));
  return {
    ...p,
    version: 1,
    id: p.id || uid(),
    name: p.name || t('ลายไม่มีชื่อ', 'Untitled pattern'),
    palette: Array.isArray(p.palette) ? p.palette : [],
    details: defaultDetails(p.details ?? {}),
    createdAt: p.createdAt || Date.now(),
    updatedAt: p.updatedAt || Date.now(),
    progress: p.progress && typeof p.progress.done === 'string' && p.progress.done.length === n
      ? {
          done: p.progress.done,
          seconds: p.progress.seconds || 0,
          daily: p.progress.daily ?? {},
          updatedAt: p.progress.updatedAt || Date.now(),
        }
      : undefined,
  };
}

export const STITCH_LABEL: Record<PatternDetails['stitchType'], string> = {
  cross: t('ครอสติช (Cross stitch)', 'Cross stitch'),
  half: t('ครึ่งฝีเข็ม (Half stitch)', 'Half stitch'),
  tent: t('เต็นท์สติช (Tent stitch)', 'Tent stitch'),
  fill: t('ปักเติมเต็มช่อง (Fill)', 'Fill (solid cells)'),
};

export const BASE_LABEL: Record<PatternDetails['baseType'], string> = {
  print3d: t('ชิ้นงานพิมพ์ 3 มิติ', '3D-printed piece'),
  aida: t('ผ้า (Aida, ลินิน และอื่น ๆ)', 'Fabric (Aida, linen and more)'),
  'plastic-canvas': t('แผ่น Plastic canvas', 'Plastic canvas'),
  other: t('อื่นๆ', 'Other'),
};

export const DIFFICULTY_LABEL: Record<PatternDetails['difficulty'], string> = {
  easy: t('ง่าย', 'Easy'),
  medium: t('ปานกลาง', 'Medium'),
  hard: t('ยาก', 'Hard'),
};
