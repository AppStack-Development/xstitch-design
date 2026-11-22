import { useMemo, useState } from 'react';
import type { BaseType } from '../types';
import { TEMPLATES, freeMask, type TemplateDef } from '../lib/templates';
import { createPattern } from '../lib/pattern';
import { savePattern } from '../lib/storage';
import type { ModelPart, PartAnalysis, StlAnalysis } from '../lib/stlImport';

// the model importer pulls in three.js + fflate: load it only when a file is chosen
const importer = () => import('../lib/stlImport');
import { needleHint } from '../lib/stats';
import { Thumb } from '../components/Thumb';
import { Icon } from '../components/Icon';
import { DefaultTag, FieldHead, sameValue } from '../components/DefaultTag';
import { navigate } from '../App';
import { t } from '../lib/i18n';
import { suggestNeedle } from '../components/needleSuggest';
import { FabricPicker, type FabricValue } from '../components/FabricPicker';
import { fabricPitch } from '../lib/fabrics';

const blank = (cols: number, rows: number, mask: string, baseType: BaseType = 'print3d') => ({
  cols, rows, mask, cells: new Array(cols * rows).fill(-1), palette: [],
  details: { filamentColor: '#f4f1ea', baseType },
});

export function NewPattern({ mode }: { mode: 'free' | 'template' }) {
  return (
    <div className="newp">
      <header className="site-head">
        <a className="icon-btn" href="#/" title={t('กลับ', 'Back')}><Icon name="back" /></a>
        <h2>{mode === 'free' ? t('ออกแบบอิสระ', 'Free design') : t('เลือกโมเดลแม่แบบ', 'Choose a template')}</h2>
        <div className="spacer" />
        <a className="icon-btn" href={`#/guide/${mode}`} title={t('วิธีใช้', 'Help')}><Icon name="help" /></a>
        <a className="btn ghost hide-xs" href={mode === 'free' ? '#/new/template' : '#/new/free'}>
          {mode === 'free' ? t('ใช้โมเดลแม่แบบแทน', 'Use a template instead') : t('ออกแบบอิสระแทน', 'Free design instead')}
        </a>
      </header>
      {mode === 'free' ? <FreeForm /> : <TemplatePicker />}
    </div>
  );
}

/** starting values of the free-design form */
const FREE_DEF = { cols: 40, rows: 40, base: 'aida' as BaseType, count: 14, pitch: 3 };
/** starting values of the template form (size comes from the chosen template) */
const TPL_DEF = { pitch: 3, holeRatio: 0.55, thick: 2 };
/** a typed number kept inside [lo, hi]; empty, zero or nonsense falls back to the default */
const within = (v: number, lo: number, hi: number, def: number) => (Number.isFinite(v) && v > 0 ? Math.min(hi, Math.max(lo, v)) : def);

function FreeForm() {
  const [name, setName] = useState(t('ลายใหม่', 'New pattern'));
  const [cols, setCols] = useState(FREE_DEF.cols);
  const [rows, setRows] = useState(FREE_DEF.rows);
  const [base, setBase] = useState<BaseType>(FREE_DEF.base);
  const [fab, setFab] = useState<FabricValue>({ fabric: 'aida', count: FREE_DEF.count, over: 1 });
  const [pitch, setPitch] = useState(FREE_DEF.pitch);
  const pitchMm = base === 'aida' ? fabricPitch(fab.count, fab.over) : base === 'plastic-canvas' ? 25.4 / 7 : pitch;
  const sug = base === 'aida' ? suggestNeedle(pitchMm, fab) : suggestNeedle(pitchMm);
  const clamp = (v: number) => Math.max(4, Math.min(200, Math.round(v) || 4));

  const create = () => {
    const p = createPattern({
      name, mode: 'free', cols, rows, mask: freeMask(cols, rows), pitchMm: +pitchMm.toFixed(3),
      details: { baseType: base, ...(base === 'aida' ? { fabric: fab.fabric, aidaCount: fab.count, over: fab.over } : {}), needleSize: sug.size, strands: sug.strand },
    });
    savePattern(p);
    navigate(`#/edit/${p.id}`);
  };

  return (
    <div className="new-layout">
      <div className="form-card">
        <label>{t('ชื่อลาย', 'Pattern name')}<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div className="presets">
          {[[20, 20], [30, 30], [40, 40], [60, 60], [80, 60], [100, 100]].map(([c, r]) => (
            <button key={c + 'x' + r} className={'chip' + (c === cols && r === rows ? ' on' : '')} onClick={() => { setCols(c); setRows(r); }}>{c}×{r}</button>
          ))}
        </div>
        <div className="row2">
          <label><FieldHead label={t('กว้าง (ช่อง)', 'Width (cells)')}><DefaultTag value={cols} def={FREE_DEF.cols} onReset={() => setCols(FREE_DEF.cols)} /></FieldHead><input type="number" value={cols} min={4} max={200} onChange={(e) => setCols(clamp(+e.target.value))} /></label>
          <label><FieldHead label={t('สูง (ช่อง)', 'Height (cells)')}><DefaultTag value={rows} def={FREE_DEF.rows} onReset={() => setRows(FREE_DEF.rows)} /></FieldHead><input type="number" value={rows} min={4} max={200} onChange={(e) => setRows(clamp(+e.target.value))} /></label>
        </div>
        <label><FieldHead label={t('พื้นที่จะใช้ปัก', 'Stitch on')}><DefaultTag value={base} def={FREE_DEF.base} onReset={() => setBase(FREE_DEF.base)} /></FieldHead>
          <select value={base} onChange={(e) => setBase(e.target.value as BaseType)}>
            <option value="aida">{t('ผ้า (Aida, ลินิน และอื่น ๆ)', 'Fabric (Aida, linen and more)')}</option>
            <option value="plastic-canvas">{t('แผ่น Plastic canvas (7 ct)', 'Plastic canvas (7 ct)')}</option>
            <option value="print3d">{t('ชิ้นงานพิมพ์ 3 มิติ', '3D-printed piece')}</option>
            <option value="other">{t('อื่นๆ (กำหนดระยะเอง)', 'Other (custom spacing)')}</option>
          </select>
        </label>
        {base === 'aida' && <FabricPicker value={fab} onChange={setFab} cols={cols} rows={rows} />}
        {(base === 'print3d' || base === 'other') && (
          <label><FieldHead label={t('ระยะห่างระหว่างช่อง (มม.)', 'Cell spacing (mm)')}><DefaultTag value={pitch} def={FREE_DEF.pitch} onReset={() => setPitch(FREE_DEF.pitch)} /></FieldHead><input type="number" step={0.1} min={0.8} max={10} value={pitch} onChange={(e) => setPitch(within(+e.target.value, 0.8, 10, 3))} /></label>
        )}
        {base !== 'aida' && <p className="hint">{t(<>ขนาดชิ้นงานจริง ≈ {(cols * pitchMm).toFixed(0)} × {(rows * pitchMm).toFixed(0)} มม.</>, <>Finished size ≈ {(cols * pitchMm).toFixed(0)} × {(rows * pitchMm).toFixed(0)} mm</>)} · {needleHint(pitchMm)}</p>}
        <button className="btn primary lg" onClick={create}>{t('สร้างลาย', 'Create pattern')} <Icon name="check" size={16} /></button>
      </div>
      <div className="preview-card">
        <Thumb pattern={blank(cols, rows, freeMask(cols, rows), base)} max={420} view="color" grid />
      </div>
    </div>
  );
}

function TemplatePicker() {
  const [sel, setSel] = useState<TemplateDef | 'stl'>(TEMPLATES[0]);
  const [w, setW] = useState(TEMPLATES[0].w);
  const [h, setH] = useState(TEMPLATES[0].h);
  const [pitch, setPitch] = useState(TPL_DEF.pitch);
  const [holeRatio, setHoleRatio] = useState(TPL_DEF.holeRatio);
  const [thick, setThick] = useState(TPL_DEF.thick);
  const [name, setName] = useState('');
  /** imported model: every part analysed, one selected */
  const [stl, setStl] = useState<{ file: string; parts: ModelPart[]; analyses: PartAnalysis[]; sel: number; err: string; auto: number[] } | null>(null);
  const [stlPitch, setStlPitch] = useState('');
  const [busy, setBusy] = useState(false);
  const stlRes: StlAnalysis | null = stl && stl.sel >= 0 ? stl.analyses[stl.sel].result : null;
  /** hole pitch measured from the selected part before any manual override */
  const autoPitch = stl && stl.sel >= 0 ? stl.auto[stl.sel] : 0;

  // on narrow screens the settings card sits below all the template cards: bring it into view
  const revealForm = () => {
    if (window.matchMedia('(max-width: 900px)').matches) {
      setTimeout(() => document.querySelector('.new-layout.tpl .form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  };
  const pick = (tp: TemplateDef) => {
    setSel(tp);
    setW(tp.w);
    setH(tp.h);
    revealForm();
  };
  const setWidth = (v: number) => {
    if (sel === 'stl') return;
    const nw = Math.max(sel.min, Math.min(sel.max, Math.round(v)));
    setW(nw);
    if (sel.lockAspect) setH(Math.round((nw * sel.h) / sel.w));
  };

  const built = useMemo(() => {
    if (sel === 'stl') return stlRes ? { cols: stlRes.cols, rows: stlRes.rows, mask: stlRes.mask } : null;
    return sel.build(w, h);
  }, [sel, w, h, stlRes]);

  const applyResult = (res: StlAnalysis, partName: string) => {
    setPitch(res.pitchMm);
    setHoleRatio(res.holeRatio);
    setThick(res.thicknessMm);
    setStlPitch(String(res.pitchMm));
    setName((n) => n || partName);
  };

  const loadStl = async (f: File) => {
    setBusy(true);
    const buf = await f.arrayBuffer();
    const { readModelFile, analyzeParts, bestPart } = await importer();
    // let the "analysing" state paint before the (synchronous) work
    setTimeout(() => {
      try {
        const parts = readModelFile(f.name, buf);
        const analyses = analyzeParts(parts);
        const best = bestPart(analyses);
        setStl({
          // a single part that failed stays selected, so its pitch can be set by hand and analysed again
          file: f.name, parts, analyses, sel: best >= 0 ? best : parts.length === 1 ? 0 : -1, auto: analyses.map((a) => a.result?.pitchMm ?? 0),
          err: best < 0 ? (parts.length > 1 ? t(`ไม่พบรูสำหรับปักในทั้ง ${parts.length} ชิ้นของไฟล์นี้`, `No stitch holes found in any of the ${parts.length} parts in this file`) : analyses[0].error) : '',
        });
        setName('');
        if (best >= 0) applyResult(analyses[best].result!, analyses[best].part.name);
        revealForm();
      } catch (e) {
        setStl({ file: f.name, parts: [], analyses: [], sel: -1, err: (e as Error).message, auto: [] });
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  const choosePart = (i: number) => {
    if (!stl || !stl.analyses[i].result) return;
    setStl({ ...stl, sel: i });
    setName('');
    applyResult(stl.analyses[i].result!, stl.analyses[i].part.name);
  };

  const reanalyse = async (override?: number) => {
    if (!stl || stl.sel < 0) return;
    const { analyzeParts } = await importer();
    const [a] = analyzeParts([stl.parts[stl.sel]], override);
    setStl({ ...stl, analyses: stl.analyses.map((x, i) => (i === stl.sel ? a : x)), err: a.result ? '' : a.error });
    if (a.result) applyResult(a.result, a.part.name);
  };

  /** back to the measured pitch (re-analyses only if an override is in effect) */
  const resetStlPitch = () => {
    setStlPitch(String(autoPitch));
    if (stlRes && !sameValue(stlRes.pitchMm, autoPitch)) reanalyse();
  };
  const resetWidth = () => {
    if (sel === 'stl') return;
    setW(sel.w);
    setH(sel.h);
  };

  const create = () => {
    if (!built) return;
    const part = stl && stl.sel >= 0 ? stl.parts[stl.sel] : null;
    const tname = sel === 'stl'
      ? `${stl?.file ?? ''}${part && stl!.parts.length > 1 ? ` · ${part.name}` : ''}`
      : sel.name;
    const p = createPattern({
      name: name || (sel === 'stl' ? t('ลายจากโมเดล', 'Pattern from model') : t(`ลาย${sel.name}`, `${sel.name} pattern`)),
      mode: 'template',
      templateId: sel === 'stl' ? 'stl' : sel.id,
      templateName: tname,
      cols: built.cols, rows: built.rows, mask: built.mask, pitchMm: model ? model.pitchMm : pitch,
      details: {
        baseType: 'print3d', holeRatio: model ? model.holeRatio : holeRatio, thicknessMm: model ? model.thicknessMm : thick,
        needleSize: suggestNeedle(model ? model.pitchMm : pitch).size, strands: suggestNeedle(model ? model.pitchMm : pitch).strand,
      },
    });
    savePattern(p);
    navigate(`#/edit/${p.id}`);
  };

  // a fixed model (Stitch Box lid) brings its own pitch, thickness and hole size
  const model = sel !== 'stl' ? sel.model : undefined;
  const ePitch = model ? model.pitchMm : pitch;
  const holes = built ? built.mask.split('').filter((c) => c === '2').length : 0;

  return (
    <div className="new-layout tpl">
      <div className="tpl-grid">
        {TEMPLATES.map((tp) => {
          const r = tp.build(tp.w, tp.h);
          return (
            <button key={tp.id} className={'tpl-card' + (sel !== 'stl' && sel.id === tp.id ? ' on' : '')} onClick={() => pick(tp)}>
              <div className="tpl-thumb"><Thumb pattern={blank(r.cols, r.rows, r.mask)} max={96} view="stitch" /></div>
              <b>{tp.name}</b>
              <small>{tp.description}</small>
            </button>
          );
        })}
        <label className={'tpl-card stl' + (sel === 'stl' ? ' on' : '')} onClick={() => setSel('stl')}>
          <div className="tpl-thumb"><Icon name="upload" size={34} /></div>
          <b>{t('นำเข้าไฟล์ STL / 3MF', 'Import STL / 3MF file')}</b>
          <small>{t('ตรวจหารูปักจากโมเดลของคุณอัตโนมัติ (รองรับไฟล์จาก MakerWorld)', 'Finds the stitch holes in your model automatically (works with MakerWorld files)')}</small>
          <input type="file" accept=".stl,.3mf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSel('stl'); loadStl(f); } e.target.value = ''; }} />
        </label>
      </div>

      <div className="form-card">
        {sel === 'stl' ? (
          <>
            <h3>{t('นำเข้าโมเดล STL / 3MF', 'Import STL / 3MF model')}</h3>
            {!stl && !busy && <p className="muted">{t('เลือกไฟล์ .stl หรือ .3mf ของชิ้นงานที่มีรูเรียงเป็นตาราง เช่น ฝากล่อง ที่คั่นหนังสือ พวงกุญแจ ระบบจะหาชิ้นที่มีรูและแปลงเป็นช่องสำหรับเติมสี', 'Choose an .stl or .3mf file of a piece with holes in a grid, like a box lid, bookmark or keychain. We’ll find the part with holes and turn them into cells you can color.')}</p>}
            {busy && <p className="muted">{t('กำลังวิเคราะห์โมเดล…', 'Analyzing model…')}</p>}
            {stl && stl.parts.length > 1 && (
              <div className="part-pick">
                <span className="muted">{t(<>ไฟล์นี้มี {stl.parts.length} ชิ้น เลือกชิ้นที่จะปัก:</>, <>This file has {stl.parts.length} parts. Choose one to stitch:</>)}</span>
                {stl.analyses.map((a, i) => (
                  <button key={i} className={'part-chip' + (i === stl.sel ? ' on' : '')} disabled={!a.result} onClick={() => choosePart(i)}
                    title={`${a.part.name} · ${a.result ? t(`${a.result.holeCount} รู`, `${a.result.holeCount} ${a.result.holeCount === 1 ? 'hole' : 'holes'}`) : t('ไม่พบรูสำหรับปัก', 'No stitch holes found')}`}>
                    <b>{a.part.name}</b>
                    <small>{a.result ? t(`${a.result.holeCount.toLocaleString()} รู`, `${a.result.holeCount.toLocaleString()} ${a.result.holeCount === 1 ? 'hole' : 'holes'}`) : t('ไม่มีรู', 'No holes')}</small>
                  </button>
                ))}
              </div>
            )}
            {stl?.err && <p className="error">{stl.err}</p>}
            {stlRes && (
              <p className="ok">{t(<>พบ {stlRes.holeCount.toLocaleString()} รู · ตาราง {stlRes.cols}×{stlRes.rows} · ชิ้นงาน {stlRes.widthMm.toFixed(1)}×{stlRes.heightMm.toFixed(1)} มม. · แผ่นหนา {stlRes.thicknessMm} มม.</>, <>Found {stlRes.holeCount.toLocaleString()} holes · grid {stlRes.cols}×{stlRes.rows} · piece {stlRes.widthMm.toFixed(1)}×{stlRes.heightMm.toFixed(1)} mm · {stlRes.thicknessMm} mm thick</>)}</p>
            )}
            {/* shown even when the analysis failed, so a pitch can be typed in (the error asks for exactly that) */}
            {stl && stl.sel >= 0 && (
              <div className="row2 end">
                <label><FieldHead label={t('ระยะห่างรู (มม.)', 'Hole pitch (mm)')}>
                  {autoPitch > 0 && <DefaultTag kind="suggested" reason={t(`วัดจากโมเดลได้ ${autoPitch} มม.`, `measured from the model: ${autoPitch} mm`)}
                    value={+stlPitch} def={autoPitch} onReset={resetStlPitch} />}
                </FieldHead><input value={stlPitch} onChange={(e) => setStlPitch(e.target.value)} /></label>
                <button className="btn" onClick={() => reanalyse(+stlPitch || undefined)}>{t('วิเคราะห์ใหม่', 'Re-analyze')}</button>
              </div>
            )}
            <label className="btn ghost file-btn">
              <Icon name="upload" size={16} /> {stl ? t('เลือกไฟล์อื่น', 'Choose another file') : t('เลือกไฟล์ STL / 3MF', 'Choose STL / 3MF file')}
              <input type="file" accept=".stl,.3mf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) loadStl(f); e.target.value = ''; }} />
            </label>
          </>
        ) : (
          <>
            <h3>{sel.name}</h3>
            {sel.model ? (
              <p className="hint">{t(`โมเดลกล่องจริง ขนาดคงที่ · ระยะห่างรู ${sel.model.pitchMm} มม. ปักลายบนฝากล่อง สั่งผลิตได้จากหน้าออกแบบ`,
                `A real box model with a fixed size · ${sel.model.pitchMm} mm hole pitch. Stitch on the lid; order it from the editor.`)}</p>
            ) : (<>
            <label><FieldHead label={t(<>ความกว้าง: {w} ช่อง</>, <>Width: {w} cells</>)}>
              <DefaultTag value={w} def={sel.w} reason={t('ขนาดมาตรฐานของแม่แบบนี้', 'this template’s standard size')} onReset={resetWidth} />
            </FieldHead>
              <input type="range" min={sel.min} max={sel.max} value={w} onChange={(e) => setWidth(+e.target.value)} />
            </label>
            {!sel.lockAspect && (
              <label><FieldHead label={t(<>ความสูง: {h} ช่อง</>, <>Height: {h} cells</>)}>
                <DefaultTag value={h} def={sel.h} reason={t('ขนาดมาตรฐานของแม่แบบนี้', 'this template’s standard size')} onReset={() => setH(sel.h)} />
              </FieldHead>
                <input type="range" min={sel.min} max={sel.max * 2} value={h} onChange={(e) => setH(+e.target.value)} />
              </label>
            )}
            <div className="row2">
              <label><FieldHead label={t('ระยะห่างรู (มม.)', 'Hole pitch (mm)')}><DefaultTag value={pitch} def={TPL_DEF.pitch} onReset={() => setPitch(TPL_DEF.pitch)} /></FieldHead><input type="number" step={0.1} min={1} max={8} value={pitch} onChange={(e) => setPitch(within(+e.target.value, 1, 8, 3))} /></label>
              <label><FieldHead label={t('ความหนา (มม.)', 'Thickness (mm)')}><DefaultTag value={thick} def={TPL_DEF.thick} onReset={() => setThick(TPL_DEF.thick)} /></FieldHead><input type="number" step={0.2} min={0.6} max={8} value={thick} onChange={(e) => setThick(within(+e.target.value, 0.6, 8, 2))} /></label>
            </div>
            </>)}
          </>
        )}
        <label>{t('ชื่อลาย', 'Pattern name')}<input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('ตั้งชื่อภายหลังได้', 'You can name it later')} /></label>
        {built && (
          <p className="hint">
            {t(<>ขนาด ≈ {(built.cols * ePitch).toFixed(1)} × {(built.rows * ePitch).toFixed(1)} มม. · {holes} ช่องปัก</>, <>Size ≈ {(built.cols * ePitch).toFixed(1)} × {(built.rows * ePitch).toFixed(1)} mm · {holes} stitch cells</>)} · {needleHint(ePitch)}
          </p>
        )}
        <button className="btn primary lg" disabled={!built} onClick={create}>{t('เริ่มออกแบบบนแม่แบบนี้', 'Use this template')} <Icon name="check" size={16} /></button>
      </div>

      <div className="preview-card">
        {built ? <Thumb pattern={blank(built.cols, built.rows, built.mask)} max={360} view="stitch" grid /> : <p className="muted">{t('ยังไม่มีตัวอย่าง', 'No preview yet')}</p>}
        <div className="legend-mini">
          <span><i className="k2" /> {t('ช่องปัก', 'Stitch cell')}</span><span><i className="k1" /> {t('โครงทึบ', 'Solid frame')}</span><span><i className="k0" /> {t('นอกชิ้นงาน', 'Outside piece')}</span>
        </div>
      </div>
    </div>
  );
}
