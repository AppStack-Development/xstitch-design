import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import type { Pattern, PatternDetails } from '../types';
import { BASE_LABEL, DIFFICULTY_LABEL, STITCH_LABEL, defaultDetails } from '../lib/pattern';
import { computeStats, fmtInch, fmtMm, needleHint } from '../lib/stats';
import { t } from '../lib/i18n';
import { DefaultTag, FieldHead } from './DefaultTag';
import { sameNeedleSize, suggestNeedle } from './needleSuggest';

/** starting values every new pattern gets (see defaultDetails in lib/pattern.ts) */
const DEF = defaultDetails();

interface Props {
  pattern: Pattern;
  onChange: (patch: Partial<Pattern>) => void;
  /** opens "Size and model" */
  onResize?: () => void;
}

export function DetailsPanel({ pattern: p, onChange, onResize }: Props) {
  const d = p.details;
  const stats = useMemo(() => computeStats(p), [p]);
  const [tagText, setTagText] = useState(d.tags.join(', '));
  const set = (patch: Partial<PatternDetails>) => onChange({ details: { ...d, ...patch } });
  const used = stats.colors.filter((c) => c.count > 0);
  const skeins = used.reduce((a, c) => a + Math.max(0.1, c.skeins), 0);
  const is3d = d.baseType === 'print3d';
  const sug = suggestNeedle(p.pitchMm);
  // plate thickness / hole size of an imported model were measured from the file, not set by us
  const fromModel = p.templateId === 'stl';
  const setBase = (baseType: PatternDetails['baseType']) => {
    const patch: Partial<Pattern> = { details: { ...d, baseType } };
    if (baseType === 'aida') patch.pitchMm = +(25.4 / d.aidaCount).toFixed(3);
    if (baseType === 'plastic-canvas') patch.pitchMm = +(25.4 / 7).toFixed(3);
    onChange(patch);
  };
  const setAida = (aidaCount: number) => onChange({ details: { ...d, aidaCount }, pitchMm: +(25.4 / aidaCount).toFixed(3) });

  return (
    <div className="panel-body details">
      <section className="stat-grid">
        <div><b>{stats.widthMm.toFixed(1)}×{stats.heightMm.toFixed(1)}</b><span>{t('มม.', 'mm')} ({fmtInch(stats.widthMm)}×{fmtInch(stats.heightMm)})</span></div>
        <div><b>{p.cols}×{p.rows}</b><span>{t('ช่องตาราง', 'Grid cells')}</span></div>
        <div><b>{stats.total.toLocaleString()}</b><span>{t(<>ฝีเข็ม / {stats.holes.toLocaleString()} ช่องปักได้</>, <>stitches / {stats.holes.toLocaleString()} stitchable cells</>)}</span></div>
        <div><b>{used.length}</b><span>{t(<>สี · ~{skeins.toFixed(1)} ไจ</>, <>{used.length === 1 ? 'color' : 'colors'} · ~{skeins.toFixed(1)} skeins</>)}</span></div>
      </section>
      {onResize && (
        <button className="btn sm resize-btn" onClick={onResize}><Icon name="resize" size={15} /> {t('ปรับขนาด / เปลี่ยนแบบ', 'Resize / change model')}</button>
      )}

      <h4>{t('ข้อมูลลาย', 'Pattern info')}</h4>
      <label>{t('ชื่อลาย', 'Pattern name')}<input value={p.name} onChange={(e) => onChange({ name: e.target.value })} /></label>
      <label>{t('คำอธิบาย', 'Description')}<textarea rows={2} value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder={t('แรงบันดาลใจ, ใช้ทำอะไร', 'Inspiration, what it’s for')} /></label>
      <div className="row2">
        <label>{t('ผู้ออกแบบ', 'Designer')}<input value={d.author} onChange={(e) => set({ author: e.target.value })} /></label>
        <label><FieldHead label={t('ระดับความยาก', 'Difficulty')}><DefaultTag value={d.difficulty} def={DEF.difficulty} onReset={() => set({ difficulty: DEF.difficulty })} /></FieldHead>
          <select value={d.difficulty} onChange={(e) => set({ difficulty: e.target.value as PatternDetails['difficulty'] })}>
            {Object.entries(DIFFICULTY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <div className="row2">
        <label>{t('แท็ก (คั่นด้วย ,)', 'Tags (comma-separated)')}
          <input value={tagText} onChange={(e) => setTagText(e.target.value)}
            onBlur={() => set({ tags: tagText.split(',').map((t) => t.trim()).filter(Boolean) })} placeholder={t('ดอกไม้, ของขวัญ', 'flowers, gift')} />
        </label>
        <label>{t('เวลาที่ใช้โดยประมาณ', 'Estimated time')}<input value={d.estHours} onChange={(e) => set({ estHours: e.target.value })} placeholder={t('เช่น 3 ชม.', 'e.g. 3 hrs')} /></label>
      </div>

      <h4>{t('วัสดุพื้น', 'Base material')}</h4>
      <label><FieldHead label={t('ประเภทพื้นที่ใช้ปัก', 'Stitching base')} />
        <select value={d.baseType} onChange={(e) => setBase(e.target.value as PatternDetails['baseType'])}>
          {Object.entries(BASE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      {d.baseType === 'aida' ? (
        <label><FieldHead label={t('ความถี่ผ้า (count ต่อนิ้ว)', 'Fabric count (per inch)')}><DefaultTag value={d.aidaCount} def={DEF.aidaCount} onReset={() => setAida(DEF.aidaCount)} /></FieldHead>
          <select value={d.aidaCount} onChange={(e) => setAida(+e.target.value)}>
            {[11, 14, 16, 18, 20, 22].map((c) => <option key={c} value={c}>{c} ct ({(25.4 / c).toFixed(2)} {t('มม./ช่อง', 'mm/cell')})</option>)}
          </select>
        </label>
      ) : (
        <label>{t('ระยะห่างระหว่างรู (มม.)', 'Hole pitch (mm)')}
          <input type="number" step={0.05} min={0.8} max={10} value={p.pitchMm}
            onChange={(e) => onChange({ pitchMm: Math.min(10, Math.max(0.8, +e.target.value || p.pitchMm)) })} />
        </label>
      )}
      {is3d && (
        <>
          <div className="row2">
            <label><FieldHead label={t('เส้นพลาสติก', 'Filament')}><DefaultTag value={d.filament} def={DEF.filament} onReset={() => set({ filament: DEF.filament })} /></FieldHead><input value={d.filament} onChange={(e) => set({ filament: e.target.value })} list="filaments" /></label>
            <label><FieldHead label={t('สีชิ้นงาน', 'Filament color')}><DefaultTag value={d.filamentColor.toLowerCase()} def={DEF.filamentColor} onReset={() => set({ filamentColor: DEF.filamentColor })} /></FieldHead><input type="color" value={d.filamentColor} onChange={(e) => set({ filamentColor: e.target.value })} /></label>
          </div>
          <datalist id="filaments">{['PLA', 'PETG', 'TPU', 'PLA Matte', 'PLA Silk'].map((f) => <option key={f} value={f} />)}</datalist>
          <div className="row2">
            <label><FieldHead label={t('ความหนาแผ่น (มม.)', 'Plate thickness (mm)')}>{!fromModel && <DefaultTag value={d.thicknessMm} def={DEF.thicknessMm} onReset={() => set({ thicknessMm: DEF.thicknessMm })} />}</FieldHead><input type="number" step={0.2} min={0.6} max={8} value={d.thicknessMm} onChange={(e) => set({ thicknessMm: Math.min(8, Math.max(0.6, +e.target.value || 2)) })} /></label>
            <label><FieldHead label={t(<>ขนาดรู ({Math.round(d.holeRatio * 100)}% ของช่อง)</>, <>Hole size ({Math.round(d.holeRatio * 100)}% of cell)</>)}>{!fromModel && <DefaultTag value={d.holeRatio} def={DEF.holeRatio} onReset={() => set({ holeRatio: DEF.holeRatio })} />}</FieldHead>
              <input type="range" min={0.3} max={0.8} step={0.05} value={d.holeRatio} onChange={(e) => set({ holeRatio: +e.target.value })} />
            </label>
          </div>
          <p className="hint">{t(<>รูกว้าง ≈ {(p.pitchMm * d.holeRatio).toFixed(2)} มม., ขอบระหว่างรู ≈ {(p.pitchMm * (1 - d.holeRatio)).toFixed(2)} มม. {p.pitchMm * (1 - d.holeRatio) < 0.8 && '⚠️ บางเกินไปสำหรับหัวพิมพ์ 0.4 มม.'}</>, <>Hole ≈ {(p.pitchMm * d.holeRatio).toFixed(2)} mm, wall between holes ≈ {(p.pitchMm * (1 - d.holeRatio)).toFixed(2)} mm {p.pitchMm * (1 - d.holeRatio) < 0.8 && '⚠️ Too thin for a 0.4 mm nozzle'}</>)}</p>
        </>
      )}

      <h4>{t('ด้ายและเข็ม', 'Thread and needle')}</h4>
      <label><FieldHead label={t('รูปแบบการปัก', 'Stitch type')}><DefaultTag value={d.stitchType} def={DEF.stitchType} onReset={() => set({ stitchType: DEF.stitchType })} /></FieldHead>
        <select value={d.stitchType} onChange={(e) => set({ stitchType: e.target.value as PatternDetails['stitchType'] })}>
          {Object.entries(STITCH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <div className="row2">
        <label><FieldHead label={t('ยี่ห้อด้าย', 'Thread brand')}><DefaultTag value={d.threadBrand} def={DEF.threadBrand} onReset={() => set({ threadBrand: DEF.threadBrand })} /></FieldHead><input value={d.threadBrand} onChange={(e) => set({ threadBrand: e.target.value })} list="brands" /></label>
        <label><FieldHead label={t('จำนวนเส้นด้าย', 'Strands')}>
          <DefaultTag kind="suggested" reason={sug.reason} value={d.strands} def={sug.strand} equals={(v) => v >= sug.strands[0] && v <= sug.strands[1]} onReset={() => set({ strands: sug.strand })} />
        </FieldHead><input type="number" min={1} max={12} value={d.strands} onChange={(e) => set({ strands: Math.min(12, Math.max(1, Math.round(+e.target.value) || 1)) })} /></label>
      </div>
      <datalist id="brands">{['DMC', 'Anchor', 'Cosmo', 'Madeira', t('ไหมพรม', 'Yarn'), t('ด้ายทั่วไป', 'Generic thread')].map((f) => <option key={f} value={f} />)}</datalist>
      <div className="row2">
        <label><FieldHead label={t('ชนิดเข็ม', 'Needle type')}><DefaultTag value={d.needleType} def={DEF.needleType} onReset={() => set({ needleType: DEF.needleType })} /></FieldHead><input value={d.needleType} onChange={(e) => set({ needleType: e.target.value })} list="needles" /></label>
        <label><FieldHead label={t('เบอร์เข็ม', 'Needle size')}>
          <DefaultTag kind="suggested" reason={sug.reason} value={d.needleSize} def={sug.size} equals={(v) => sug.sizes.some((s) => sameNeedleSize(v, s))} onReset={() => set({ needleSize: sug.size })} />
        </FieldHead><input value={d.needleSize} onChange={(e) => set({ needleSize: e.target.value })} list="needleSizes" /></label>
      </div>
      <datalist id="needles">{[t('เข็มปลายมน (Tapestry)', 'Tapestry (blunt tip)'), t('เข็มปลายแหลม (Embroidery)', 'Embroidery (sharp tip)'), t('เข็มพลาสติก', 'Plastic needle'), t('เข็มร้อยไหมพรม', 'Yarn needle')].map((f) => <option key={f} value={f} />)}</datalist>
      <datalist id="needleSizes">{['#18', '#20', '#22', '#24', '#26', '#28'].map((f) => <option key={f} value={f} />)}</datalist>
      <p className="hint">{needleHint(p.pitchMm)}</p>

      <h4>{t('บันทึก / ขั้นตอน', 'Notes / steps')}</h4>
      <textarea rows={4} value={d.notes} onChange={(e) => set({ notes: e.target.value })} aria-label={t('บันทึก / ขั้นตอน', 'Notes / steps')}
        placeholder={t('เช่น\n1. เริ่มปักจากจุดกึ่งกลาง (ลูกศรแดง)\n2. ปักสีเข้มก่อน\n3. เก็บปลายด้ายด้านหลัง', 'e.g.\n1. Start from the center (red arrows)\n2. Stitch dark colors first\n3. Weave in thread ends at the back')} />

      {used.length > 0 && (
        <>
          <h4>{t('ปริมาณด้ายโดยประมาณ', 'Estimated thread')}</h4>
          <table className="mini-table">
            <thead><tr><th></th><th>{t('สี', 'Color')}</th><th>{t('ฝีเข็ม', 'Stitches')}</th><th>{t('ความยาว*', 'Length*')}</th><th>{t('ไจ', 'Skeins')}</th></tr></thead>
            <tbody>
              {used.map((c) => {
                const tc = p.palette[c.index];
                return (
                  <tr key={tc.id}>
                    <td><span className="dot" style={{ background: tc.hex }} /></td>
                    <td>{[tc.brand, tc.code].filter(Boolean).join(' ') || tc.name}</td>
                    <td>{c.count}</td>
                    <td>{c.strandM.toFixed(1)} {t('ม.', 'm')}</td>
                    <td>{Math.max(0.1, c.skeins).toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="hint">{t(<>*ความยาวรวมของด้ายเส้นเดี่ยว ({d.strands} เส้น) รวมเผื่อเก็บปลาย 20% · 1 ไจ = 8 ม. × 6 เส้น · ขนาดชิ้นงาน {fmtMm(stats.widthMm)} × {fmtMm(stats.heightMm)}</>, <>*Total single-strand length ({d.strands} {d.strands === 1 ? 'strand' : 'strands'}), incl. 20% extra for ends · 1 skein = 8 m × 6 strands · piece size {fmtMm(stats.widthMm)} × {fmtMm(stats.heightMm)}</>)}</p>
        </>
      )}
    </div>
  );
}
