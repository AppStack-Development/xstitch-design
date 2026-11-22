import type { FabricKind } from '../types';
import { FABRICS, aidaEquivalent, fabricDef, fabricPitch, perInch } from '../lib/fabrics';
import { suggestNeedle } from './needleSuggest';
import { t } from '../lib/i18n';

export interface FabricValue { fabric: FabricKind; count: number; over: 1 | 2 }

/**
 * Choose the counted fabric: its kind (with a little weave swatch), count, and whether a stitch crosses one
 * or two threads, then see what that means for this design: stitches per inch, finished size, the needle
 * and strands to use, and how much fabric to cut. Used by the details panel and the new-pattern form.
 */
export function FabricPicker({ value, onChange, cols, rows }: {
  value: FabricValue; onChange: (v: FabricValue) => void; cols: number; rows: number;
}) {
  const def = fabricDef(value.fabric);
  const pitch = fabricPitch(value.count, value.over);
  const spi = perInch(value.count, value.over);
  const sug = suggestNeedle(pitch, value);
  const w = (cols * pitch) / 10, h = (rows * pitch) / 10;
  const cut = (v: number) => Math.ceil(v + 2 * def.marginCm);
  const pick = (fabric: FabricKind) => { const d = fabricDef(fabric); onChange({ fabric, count: d.count, over: d.overs[0] }); };

  return (
    <div className="fabric-pick">
      <div className="fab-types" role="radiogroup" aria-label={t('ชนิดผ้า', 'Fabric')}>
        {FABRICS.map((f) => (
          <button key={f.id} type="button" role="radio" aria-checked={f.id === value.fabric}
            className={'fab-type' + (f.id === value.fabric ? ' on' : '')} onClick={() => pick(f.id)}>
            <span className={`fab-sw fab-${f.id}`} aria-hidden="true" />
            <span>{f.name()}</span>
          </button>
        ))}
      </div>

      <div className="fab-row">
        <span className="fab-label">{def.unit === 'threads' ? t('เบอร์ (เส้นด้ายต่อนิ้ว)', 'Count (threads per inch)') : t('เบอร์ (ช่องต่อนิ้ว)', 'Count (squares per inch)')}</span>
        <div className="rz-chips">
          {(def.counts.includes(value.count) ? def.counts : [...def.counts, value.count].sort((a, b) => a - b)).map((c) => (
            <button key={c} type="button" className={'chip' + (c === value.count ? ' on' : '')} onClick={() => onChange({ ...value, count: c })}>{c} ct</button>
          ))}
        </div>
      </div>

      {def.overs.length > 1 && (
        <div className="fab-row">
          <span className="fab-label">{t('ปักข้ามทีละ', 'Stitch over')}</span>
          <div className="rz-chips">
            {[1, 2].map((o) => (
              <button key={o} type="button" className={'chip' + (o === value.over ? ' on' : '')} onClick={() => onChange({ ...value, over: o as 1 | 2 })}>
                {t(`${o} เส้น`, `${o} thread${o === 1 ? '' : 's'}`)}{o === def.overs[0] && t(' (นิยม)', ' (usual)')}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="fab-sum">
        <div>
          <b>{t(`${+spi.toFixed(1)} ฝีเข็มต่อนิ้ว`, `${+spi.toFixed(1)} stitches per inch`)}</b>
          {' · '}{value.fabric === 'aida' ? t(`ช่องละ ${pitch.toFixed(2)} มม.`, `${pitch.toFixed(2)} mm per square`) : aidaEquivalent(value.count, value.over)}
        </div>
        <div>{t('ขนาดงาน', 'Design')} {cols} × {rows} {t('ช่อง', 'cells')} = <b>{w.toFixed(1)} × {h.toFixed(1)} {t('ซม.', 'cm')}</b></div>
        <div>{t('เข็ม', 'Needle')} {sug.sizes.join('–')} · {t('ด้าย', 'thread')} {sug.strands[0] === sug.strands[1] ? sug.strand : `${sug.strands[0]}–${sug.strands[1]}`} {t('เส้น', 'strands')}</div>
        <div className="muted">
          {value.fabric === 'waste'
            ? t(`ตัด waste canvas ใหญ่กว่าลายข้างละ ${def.marginCm} ซม. ≈ ${cut(w)} × ${cut(h)} ซม.`, `Cut the waste canvas ${def.marginCm} cm bigger all round ≈ ${cut(w)} × ${cut(h)} cm`)
            : t(`เตรียม${value.fabric === 'paper' ? 'กระดาษ' : 'ผ้า'} เผื่อขอบข้างละ ${def.marginCm} ซม. ≈ ${cut(w)} × ${cut(h)} ซม.`, `Cut ${def.marginCm} cm extra all round ≈ ${cut(w)} × ${cut(h)} cm`)}
        </div>
      </div>
      <p className="fab-tip">{def.tip()}</p>
    </div>
  );
}
