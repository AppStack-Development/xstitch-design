import type { FabricKind, PatternDetails } from '../types';
import { t } from './i18n';

/**
 * Fabrics people cross stitch on. All of them are "baseType: 'aida'" patterns (counted fabric); `fabric`
 * says which one, `aidaCount` is its count and `over` how many fabric threads one stitch crosses.
 *
 * Aida, waste canvas and perforated paper are counted in squares (one stitch per square). Evenweave and
 * linen are counted in threads and are usually stitched over two, so 28 ct over two = 14 stitches per inch,
 * the same size as Aida 14. Hardanger is woven in pairs like Aida, fine enough to stitch over one or two.
 */
export interface FabricDef {
  id: FabricKind;
  name: () => string;
  /** counts sold, smallest stitch last */
  counts: number[];
  /** the count picked when switching to this fabric */
  count: number;
  /** stitch over 1 or 2 threads; the first is the usual one. A single entry = no choice */
  overs: (1 | 2)[];
  /** counted in squares (Aida-like) or in threads */
  unit: 'squares' | 'threads';
  /** cm of fabric to leave around the design */
  marginCm: number;
  tip: () => string;
}

export const FABRICS: FabricDef[] = [
  {
    id: 'aida', name: () => 'Aida', counts: [11, 14, 16, 18, 20, 22], count: 14, overs: [1], unit: 'squares', marginCm: 5,
    tip: () => t('ช่องเห็นชัด ปักข้ามทีละ 1 ช่อง เหมาะกับมือใหม่', 'Clear squares, one stitch per square: the easiest to start on'),
  },
  {
    id: 'evenweave', name: () => 'Evenweave', counts: [25, 28, 32], count: 28, overs: [2, 1], unit: 'threads', marginCm: 5,
    tip: () => t('นับเป็นเส้นด้าย ปกติปักข้ามทีละ 2 เส้น ผิวผ้าเรียบ ทำฝีเข็มครึ่งช่องหรือ ¾ ได้ง่าย', 'Counted in threads and usually stitched over two; a smooth finish, and fractional stitches are easy'),
  },
  {
    id: 'linen', name: () => t('ลินิน', 'Linen'), counts: [28, 32, 36, 40], count: 32, overs: [2, 1], unit: 'threads', marginCm: 5,
    tip: () => t('เส้นด้ายหนาบางไม่เท่ากัน ปักข้าม 2 เส้น เริ่มฝีเข็มแรกจากเส้นตั้ง ใช้สะดึงช่วยให้นับง่ายขึ้น', 'Threads vary in thickness. Stitch over two, starting each stitch beside a vertical thread; a hoop makes counting easier'),
  },
  {
    id: 'hardanger', name: () => 'Hardanger', counts: [22], count: 22, overs: [1, 2], unit: 'squares', marginCm: 5,
    tip: () => t('ทอเป็นคู่เหมือน Aida แต่ละเอียดกว่า ปักข้าม 1 ได้ลายจิ๋ว ข้าม 2 ได้ขนาดเท่า Aida 11', 'Woven in pairs like Aida but finer: over one for tiny work, over two for the size of Aida 11'),
  },
  {
    id: 'waste', name: () => 'Waste canvas', counts: [8.5, 10, 14], count: 14, overs: [1], unit: 'squares', marginCm: 2.5,
    tip: () => t('วางทาบบนเสื้อหรือถุงผ้าแล้วเนาให้แน่น ใช้เข็มปลายแหลม (Embroidery) เพราะต้องแทงผ่านเนื้อผ้า ปักเสร็จพรมน้ำให้ชุ่ม แล้วดึงเส้นตารางออกทีละเส้น', 'Tack it onto the shirt or bag and use a sharp (embroidery) needle to go through the cloth; when done, dampen it and pull the canvas threads out one by one'),
  },
  {
    id: 'paper', name: () => t('กระดาษเจาะรู', 'Perforated paper'), counts: [14], count: 14, overs: [1], unit: 'squares', marginCm: 1,
    tip: () => t('ทำการ์ด ที่คั่นหนังสือ ของประดับ ดึงด้ายเบามือเพราะกระดาษขาดง่าย ปักเสร็จตัดตามขอบลายได้', 'For cards, bookmarks and ornaments. Pull gently, the paper tears easily; trim around the design when done'),
  },
];

export const fabricDef = (id?: FabricKind): FabricDef => FABRICS.find((f) => f.id === id) ?? FABRICS[0];

/** the fabric, count and stitch-over of a pattern's details, filled in for patterns made before fabrics */
export function fabricOf(d: Pick<PatternDetails, 'fabric' | 'over' | 'aidaCount'>) {
  const def = fabricDef(d.fabric);
  const over = def.overs.includes(d.over ?? 1) ? (d.over ?? 1) : def.overs[0];
  return { def, count: d.aidaCount || def.count, over };
}

/** mm from one stitch to the next */
export const fabricPitch = (count: number, over: number) => +((25.4 * over) / count).toFixed(3);
/** stitches per inch */
export const perInch = (count: number, over: number) => count / over;

/** the details (and pitch) for a fabric; switching fabric picks its usual count and stitch-over */
export function fabricPatch(fabric: FabricKind, count?: number, over?: 1 | 2) {
  const def = fabricDef(fabric);
  const c = count ?? def.count;
  const o = over && def.overs.includes(over) ? over : def.overs[0];
  return { details: { baseType: 'aida' as const, fabric, aidaCount: c, over: o }, pitchMm: fabricPitch(c, o) };
}

/** "Linen 32 ct · over 2" */
export function fabricLabel(d: Pick<PatternDetails, 'fabric' | 'over' | 'aidaCount'>): string {
  const { def, count, over } = fabricOf(d);
  return `${def.name()} ${count} ct` + (def.overs.length > 1 ? t(` · ปักข้าม ${over} เส้น`, ` · over ${over}`) : '');
}

/** the Aida count a fabric works out the same size as ("= Aida 14"), or the nearest one */
export function aidaEquivalent(count: number, over: number): string {
  const v = perInch(count, over);
  if (v > 22.5) return t('ละเอียดกว่า Aida ทุกเบอร์', 'finer than any Aida');
  if (v < 10.5) return t('ช่องใหญ่กว่า Aida 11', 'bigger than Aida 11');
  const best = [11, 14, 16, 18, 20, 22].reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  return Math.abs(best - v) < 0.3 ? t(`ขนาดเท่ากับ Aida ${best}`, `same size as Aida ${best}`) : t(`ใกล้เคียง Aida ${best}`, `close to Aida ${best}`);
}
