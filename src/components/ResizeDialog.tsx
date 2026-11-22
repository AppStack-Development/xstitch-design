import { useEffect, useMemo, useRef, useState } from 'react';
import type { Pattern } from '../types';
import { TEMPLATES, freeMask, templateLabel, type TemplateDef } from '../lib/templates';
import { anchorAt, applyFit, canCarry, clampPlace, droppedColors, planFit, templateDims, type FitMode, type Place, type Target } from '../lib/resize';
import { suggestNeedle } from './needleSuggest';
import { Thumb } from './Thumb';
import { Icon } from './Icon';
import { t } from '../lib/i18n';

/**
 * "Size and model": resize the pattern, or move it onto another model, and choose what happens to the
 * design (scale it, keep it at its size and cut what falls off, or start fresh). Fabric patterns can also
 * change fabric count, which changes the finished size without touching a single stitch.
 */
type Kind = { kind: 'free' } | { kind: 'tpl'; def: TemplateDef } | { kind: 'fixed' };

const COUNTS = [11, 14, 16, 18];
const TPL = { pitch: 3, holeRatio: 0.55, thick: 2 }; // the same defaults as a new template pattern
const FREE_MIN = 4, FREE_MAX = 200;
const ones = (s?: string) => (s ? s.split('').reduce((n, c) => n + (c === '1' ? 1 : 0), 0) : 0);
const blank = (cols: number, rows: number, mask: string) => ({
  cols, rows, mask, cells: new Array(cols * rows).fill(-1), palette: [], details: { filamentColor: '#f4f1ea', baseType: 'print3d' as const },
});

function startKind(p: Pattern): Kind {
  if (p.mode === 'free') return { kind: 'free' };
  const def = TEMPLATES.find((d) => d.id === p.templateId);
  return def ? { kind: 'tpl', def } : { kind: 'fixed' };
}

/** a number box that only commits on blur or Enter, so typing "7.5" isn't fought by rounding */
function SizeBox({ value, step, onCommit, label }: { value: number; step: number; onCommit: (v: number) => void; label: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => { const v = parseFloat(draft); if (Number.isFinite(v) && v > 0) onCommit(v); else setDraft(String(value)); };
  return (
    <input className="rz-num" type="number" inputMode="decimal" step={step} value={draft} aria-label={label}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
  );
}

export function ResizeDialog({ pattern: p, onApply, onClose }: {
  pattern: Pattern; onApply: (next: Pattern, keepCopy: boolean) => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<'size' | 'model'>('size');
  const [kind, setKind] = useState<Kind>(() => startKind(p));
  const [dims, setDims] = useState(() => {
    const k = startKind(p);
    return k.kind === 'tpl' && !k.def.model ? templateDims(k.def, p) : { w: p.cols, h: p.rows };
  });
  const [unit, setUnit] = useState<'cells' | 'cm'>('cells');
  const [ct, setCt] = useState(p.details.aidaCount || 14);
  const [lock, setLock] = useState(true);
  const [mode, setMode] = useState<FitMode>('scale');
  // keep mode: one of the 9 anchors, or (null) a position set by dragging / the arrows
  const [anchor, setAnchor] = useState<number | null>(4);
  const [free, setFree] = useState<Place>({ x: 0, y: 0 });
  const [carry, setCarry] = useState(true);
  const [keepCopy, setKeepCopy] = useState(false);
  const [dropColors, setDropColors] = useState(true);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const fabric = kind.kind === 'free' && (p.mode !== 'free' || p.details.baseType === 'aida');
  const fixed = kind.kind === 'fixed' || (kind.kind === 'tpl' && !!kind.def.model);
  const min = kind.kind === 'tpl' ? kind.def.min : FREE_MIN;
  const max = kind.kind === 'tpl' ? kind.def.max : FREE_MAX;
  const aspectLocked = kind.kind === 'tpl' ? kind.def.lockAspect : lock;

  // the grid, outline and spacing the pattern would end up with
  const target: Target = useMemo(() => {
    const needle = (pitch: number) => (Math.abs(pitch - p.pitchMm) > 0.01
      ? { needleSize: suggestNeedle(pitch).size, strands: suggestNeedle(pitch).strand } : {});
    if (kind.kind === 'free') {
      const pitch = fabric ? +(25.4 / ct).toFixed(3) : p.pitchMm;
      return {
        cols: dims.w, rows: dims.h, mask: freeMask(dims.w, dims.h), pitchMm: pitch, mode: 'free',
        details: { ...(fabric ? { baseType: 'aida' as const, aidaCount: ct } : {}), ...needle(pitch) },
      };
    }
    if (kind.kind === 'tpl') {
      const def = kind.def;
      const b = def.model ? def.build(def.w, def.h) : def.build(dims.w, dims.h);
      const wasPlate = p.mode === 'template' && p.templateId !== 'stl' && !TEMPLATES.find((d) => d.id === p.templateId)?.model;
      const pitch = def.model ? def.model.pitchMm : wasPlate ? p.pitchMm : TPL.pitch;
      const plate = def.model
        ? { thicknessMm: def.model.thicknessMm, holeRatio: def.model.holeRatio }
        : wasPlate ? {} : { thicknessMm: TPL.thick, holeRatio: TPL.holeRatio };
      return {
        cols: b.cols, rows: b.rows, mask: b.mask, pitchMm: pitch, mode: 'template', templateId: def.id, templateName: def.name,
        details: { baseType: 'print3d' as const, ...plate, ...needle(pitch) },
      };
    }
    return { cols: p.cols, rows: p.rows, mask: p.mask, pitchMm: p.pitchMm, mode: p.mode, templateId: p.templateId, templateName: p.templateName };
  }, [kind, dims, ct, fabric, p]);

  const sameGrid = target.cols === p.cols && target.rows === p.rows && target.mask === p.mask && target.templateId === p.templateId;
  const at = useMemo(() => (anchor !== null ? anchorAt(anchor, p, target) : clampPlace(free, p, target)), [anchor, free, p, target]);
  const plan = useMemo(() => (sameGrid ? null : planFit(p, target, mode, at, carry)), [sameGrid, p, target, mode, at, carry]);
  const carryable = !!plan && canCarry(p, target, mode);
  const dropped = plan ? droppedColors(p, plan) : 0;
  const next: Pattern = plan
    ? applyFit(p, target, plan, dropColors)
    : { ...p, pitchMm: target.pitchMm, details: { ...p.details, ...target.details }, updatedAt: Date.now() };
  const changed = !sameGrid || Math.abs(target.pitchMm - p.pitchMm) > 0.001;

  const cm = (cells: number, pitch = target.pitchMm) => (cells * pitch) / 10;
  const setW = (w: number) => {
    const nw = Math.max(min, Math.min(max, Math.round(w)));
    setDims((d) => ({ w: nw, h: aspectLocked ? Math.max(min, Math.round((nw * d.h) / d.w)) : d.h }));
  };
  const setH = (h: number) => {
    const nh = Math.max(min, Math.min(kind.kind === 'tpl' ? max * 2 : max, Math.round(h)));
    setDims((d) => ({ h: nh, w: aspectLocked ? Math.max(min, Math.min(max, Math.round((nh * d.w) / d.h))) : d.w }));
  };
  const toCells = (v: number) => (unit === 'cells' ? v : (v * 10) / target.pitchMm);
  const pickModel = (k: Kind) => {
    setKind(k);
    setMode('scale');
    setAnchor(4);
    if (k.kind === 'tpl') setDims({ w: k.def.w, h: k.def.h });
    else if (k.kind === 'free') setDims({ w: p.cols, h: p.rows });
  };

  // keep mode: drag the "after" picture (or tap the arrows) to move the design a cell at a time
  const placing = !!plan && mode === 'keep';
  const setPlace = (pl: Place) => {
    const c = clampPlace(pl, p, target);
    if (anchor === null && c.x === free.x && c.y === free.y) return;
    setAnchor(null);
    setFree(c);
  };
  const nudge = (dx: number, dy: number) => (e: React.MouseEvent) => { e.preventDefault(); setPlace({ x: at.x + dx, y: at.y + dy }); };
  const drag = useRef<{ x: number; y: number; at: Place; cell: number } | null>(null);
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const c = e.currentTarget.querySelector('canvas');
    if (!placing || !c) return;
    drag.current = { x: e.clientX, y: e.clientY, at, cell: c.getBoundingClientRect().width / target.cols };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) setPlace({ x: d.at.x + Math.round((e.clientX - d.x) / d.cell), y: d.at.y + Math.round((e.clientY - d.y) / d.cell) });
  };
  const onUp = () => { drag.current = null; };
  const onAnchor = placing ? Array.from({ length: 9 }, (_, i) => anchorAt(i, p, target)).findIndex((a) => a.x === at.x && a.y === at.y) : -1;

  const done = ones(p.progress?.done);
  const carried = ones(plan?.progress?.done);
  const pct = (n: number) => Math.round((n / Math.max(1, plan?.total ?? 1)) * 100);
  const shrunk = plan && mode === 'scale' && (target.cols < p.cols * 0.7 || target.rows < p.rows * 0.7);
  const modelName = kind.kind === 'free' ? t('ผ้า (ออกแบบอิสระ)', 'Fabric (free design)')
    : kind.kind === 'tpl' ? templateLabel(kind.def.name) ?? kind.def.name : templateLabel(p.templateName) ?? p.templateName ?? '';

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal rz-dialog" role="dialog" aria-modal="true" aria-label={t('ขนาดและแบบ', 'Size and model')}>
        <header className="modal-head">
          <h3><Icon name="resize" /> {t('ขนาดและแบบ', 'Size and model')}</h3>
          <button className="icon-btn" onClick={onClose} title={t('ปิด (Esc)', 'Close (Esc)')} aria-label={t('ปิด', 'Close')}><Icon name="close" /></button>
        </header>
        <nav className="tabs rz-tabs">
          <button className={tab === 'size' ? 'on' : ''} onClick={() => setTab('size')}>{t('ปรับขนาด', 'Resize')}</button>
          <button className={tab === 'model' ? 'on' : ''} onClick={() => setTab('model')}>{t('เปลี่ยนแบบ', 'Change model')}</button>
        </nav>

        <div className="rz-body">
          <div className="rz-controls">
            {tab === 'size' && (fixed ? (
              <div className="rz-note">
                <p>{t(`${modelName} มีขนาดคงที่ตามโมเดล ปรับขนาดไม่ได้ ถ้าอยากได้ขนาดอื่น เปลี่ยนไปใช้แบบอื่น`, `${modelName} has a fixed size. To get another size, move to a different model.`)}</p>
                <button className="btn sm" onClick={() => setTab('model')}>{t('เปลี่ยนแบบ', 'Change model')}</button>
              </div>
            ) : (
              <>
                {fabric && (
                  <>
                    <h4>{t('เปลี่ยนเบอร์ผ้า · ลายเหมือนเดิมทุกช่อง', 'Change fabric count · same design')}</h4>
                    <div className="rz-fabric">
                      <div className="rz-chips">
                        {COUNTS.map((c) => <button key={c} className={'chip' + (c === ct ? ' on' : '')} onClick={() => { setCt(c); setDims({ w: p.cols, h: p.rows }); }}>{c} ct</button>)}
                      </div>
                      <p className="hint">{t(`${p.cols} ช่องบนผ้า ${ct} ct ≈ ${cm(p.cols, 25.4 / ct).toFixed(1)} ซม. · เบอร์น้อย ช่องใหญ่ ชิ้นงานใหญ่`, `${p.cols} cells on ${ct} ct ≈ ${cm(p.cols, 25.4 / ct).toFixed(1)} cm · lower count, bigger cells, bigger piece`)}</p>
                    </div>
                    <div className="rz-or">{t('หรือปรับจำนวนช่อง', 'or change the number of cells')}</div>
                  </>
                )}
                <div className="rz-sizehead">
                  <h4>{t('ขนาด', 'Size')}</h4>
                  <div className="seg" role="group" aria-label={t('หน่วย', 'Unit')}>
                    <button className={unit === 'cells' ? 'on' : ''} onClick={() => setUnit('cells')}>{t('ช่อง', 'cells')}</button>
                    <button className={unit === 'cm' ? 'on' : ''} onClick={() => setUnit('cm')}>{t('ซม.', 'cm')}</button>
                  </div>
                </div>
                <div className="rz-size">
                  <SizeBox label={t('กว้าง', 'Width')} step={unit === 'cells' ? 1 : 0.1} value={unit === 'cells' ? dims.w : +cm(target.cols).toFixed(1)} onCommit={(v) => setW(toCells(v))} />
                  <span>×</span>
                  <SizeBox label={t('สูง', 'Height')} step={unit === 'cells' ? 1 : 0.1} value={unit === 'cells' ? dims.h : +cm(target.rows).toFixed(1)} onCommit={(v) => setH(toCells(v))} />
                  <span className="muted">{unit === 'cells' ? t('ช่อง', 'cells') : t('ซม.', 'cm')}</span>
                  {kind.kind === 'free' && (
                    <button className={'chip' + (lock ? ' on' : '')} aria-pressed={lock} onClick={() => setLock(!lock)}>{t('ล็อกสัดส่วน', 'Lock ratio')}</button>
                  )}
                </div>
                <div className="rz-chips">
                  {unit === 'cells'
                    ? [0.5, 2, 3].map((k) => <button key={k} className="chip" onClick={() => setW(p.cols * k)}>{k === 0.5 ? '½×' : `${k}×`}</button>)
                    : [5, 7, 10, 15].map((c) => <button key={c} className="chip" onClick={() => setW((c * 10) / target.pitchMm)}>{c} {t('ซม.', 'cm')}</button>)}
                </div>
                <p className="hint">
                  {unit === 'cells'
                    ? t(`≈ ${cm(target.cols).toFixed(1)} × ${cm(target.rows).toFixed(1)} ซม.`, `≈ ${cm(target.cols).toFixed(1)} × ${cm(target.rows).toFixed(1)} cm`)
                    : t(`= ${target.cols} × ${target.rows} ช่อง`, `= ${target.cols} × ${target.rows} cells`)}
                  {kind.kind === 'tpl' && t(` · แบบนี้ปรับได้ ${min}–${max} ช่อง${kind.def.lockAspect ? ' สัดส่วนคงที่' : ''}`, ` · this model takes ${min}–${max} cells${kind.def.lockAspect ? ', fixed ratio' : ''}`)}
                </p>
              </>
            ))}

            {tab === 'model' && (
              <div className="rz-models">
                <button className={'rz-model' + (kind.kind === 'free' ? ' on' : '')} onClick={() => pickModel({ kind: 'free' })}>
                  <Thumb pattern={blank(12, 12, freeMask(12, 12))} max={44} view="stitch" />
                  <span><b>{t('ผ้า (ออกแบบอิสระ)', 'Fabric (free design)')}</b><small>{t('ปรับขนาดได้ทุกแบบ', 'any size')}</small></span>
                </button>
                {TEMPLATES.map((d) => {
                  const b = d.build(d.w, d.h);
                  return (
                    <button key={d.id} className={'rz-model' + (kind.kind === 'tpl' && kind.def.id === d.id ? ' on' : '')} onClick={() => pickModel({ kind: 'tpl', def: d })}>
                      <Thumb pattern={blank(b.cols, b.rows, b.mask)} max={44} view="stitch" />
                      <span><b>{templateLabel(d.name) ?? d.name}</b><small>{d.model ? t('ขนาดคงที่', 'fixed size') : t(`${d.min}–${d.max} ช่อง`, `${d.min}–${d.max} cells`)}</small></span>
                    </button>
                  );
                })}
              </div>
            )}

            {plan ? (
              <>
                <h4>{t('ลายที่ทำไว้', 'Your design')}</h4>
                <div className="rz-modes" role="radiogroup">
                  {([
                    ['scale', t('ย่อ/ขยายลายตาม', 'Scale to fit'), t('ลายปรับสัดส่วนให้พอดีพื้นที่ใหม่', 'The design is resized to the new grid')],
                    ['keep', t('คงขนาดเดิม', 'Keep its size'), t('ฝีเข็มเท่าเดิม เลือกตำแหน่งวาง ส่วนที่เกินขอบถูกตัด', 'Same stitches, placed where you choose; anything past the edge is cut')],
                    ['clear', t('เริ่มใหม่', 'Start fresh'), t('ตารางว่าง เก็บชุดสีด้ายเดิมไว้', 'An empty grid; your thread colours stay')],
                  ] as [FitMode, string, string][]).map(([m, title, sub]) => (
                    <label key={m} className={'rz-mode' + (mode === m ? ' on' : '')}>
                      <input type="radio" name="rz-mode" checked={mode === m} onChange={() => setMode(m)} />
                      <span>
                        <b>{title}</b><small>{sub}</small>
                        {m === 'keep' && mode === 'keep' && (
                          <span className="rz-place">
                            <span className="rz-anchor" role="group" aria-label={t('ตำแหน่งวาง', 'Position')}>
                              {Array.from({ length: 9 }, (_, i) => (
                                <button key={i} className={i === onAnchor ? 'on' : ''} onClick={(e) => { e.preventDefault(); setAnchor(i); }}
                                  aria-label={t(`ตำแหน่ง ${i + 1}`, `Position ${i + 1}`)} aria-pressed={i === onAnchor} />
                              ))}
                            </span>
                            <span className="rz-nudge" role="group" aria-label={t('เลื่อนทีละช่อง', 'Move one cell')}>
                              <button className="up" onClick={nudge(0, -1)} aria-label={t('ขึ้น 1 ช่อง', 'Up one cell')}>↑</button>
                              <button className="left" onClick={nudge(-1, 0)} aria-label={t('ซ้าย 1 ช่อง', 'Left one cell')}>←</button>
                              <button className="right" onClick={nudge(1, 0)} aria-label={t('ขวา 1 ช่อง', 'Right one cell')}>→</button>
                              <button className="down" onClick={nudge(0, 1)} aria-label={t('ลง 1 ช่อง', 'Down one cell')}>↓</button>
                            </span>
                            <small className="rz-at">
                              {t(
                                `${at.x >= 0 ? `ห่างขอบซ้าย ${at.x}` : `เลยขอบซ้าย ${-at.x}`} · ${at.y >= 0 ? `ห่างขอบบน ${at.y}` : `เลยขอบบน ${-at.y}`} ช่อง`,
                                `${at.x >= 0 ? `${at.x} from the left` : `${-at.x} past the left edge`} · ${at.y >= 0 ? `${at.y} from the top` : `${-at.y} past the top`}`,
                              )}
                              <br />{t('หรือลากภาพ “หลัง” เพื่อเลื่อน', 'or drag the “After” picture')}
                            </small>
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </>
            ) : changed && (
              <p className="rz-ok">{t('ลายเหมือนเดิมทุกช่อง ไม่ต้องย่อหรือขยาย ขนาดเปลี่ยนตามเบอร์ผ้า', 'Every stitch stays the same; only the finished size changes with the fabric.')}</p>
            )}
          </div>

          <div className="rz-preview">
            <div className="rz-pair">
              <figure><Thumb pattern={p} max={150} view="stitch" /><figcaption>{t('ก่อน', 'Before')} · {cm(p.cols, p.pitchMm).toFixed(1)} {t('ซม.', 'cm')}</figcaption></figure>
              <span className="rz-arrow" aria-hidden="true">→</span>
              <figure>
                <div className={'rz-after' + (placing ? ' drag' : '')} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                  title={placing ? t('ลากเพื่อเลื่อนลาย', 'Drag to move the design') : undefined}>
                  <Thumb pattern={next} max={150} view="stitch" />
                </div>
                <figcaption>{t('หลัง', 'After')} · {cm(next.cols).toFixed(1)} {t('ซม.', 'cm')}</figcaption>
              </figure>
            </div>
            <div className="rz-stats">
              <div>{t('แบบ', 'Model')}: <b>{modelName}</b></div>
              <div>{t('ขนาดจริง', 'Finished size')} <b>{cm(next.cols).toFixed(1)} × {cm(next.rows).toFixed(1)} {t('ซม.', 'cm')}</b> ({t('เดิม', 'was')} {cm(p.cols, p.pitchMm).toFixed(1)} × {cm(p.rows, p.pitchMm).toFixed(1)})</div>
              <div>{t('ฝีเข็ม', 'Stitches')} <b>{(plan ? plan.kept : p.cells.filter((c) => c >= 0).length).toLocaleString()}</b>{plan && <> ({t('เดิม', 'was')} {plan.total.toLocaleString()})</>}</div>
              {plan && plan.lost > 0 && mode !== 'clear' && <div className="warn">{t(`ฝีเข็มที่จะหายไป ${plan.lost.toLocaleString()} ช่อง (ตกนอกขอบหรือนอกรูปทรง)`, `${plan.lost.toLocaleString()} stitches will be lost (off the edge or outside the shape)`)}</div>}
              {shrunk && <div className="warn">{t('ย่อเล็กลงมาก รายละเอียดเล็กๆ อาจหาย', 'Shrunk a lot: small details may be lost')}</div>}
              {done > 0 && (!plan
                ? <div className="ok">{t('ความคืบหน้าการปักเก็บไว้ครบ', 'Your stitching progress is kept')}</div>
                : carryable
                  ? (
                    <label className="check rz-drop"><input type="checkbox" checked={carry} onChange={(e) => setCarry(e.target.checked)} />
                      <span>
                        {t(`นับช่องที่ปักแล้วต่อ (${done.toLocaleString()} ช่อง)`, `Carry over your ${done.toLocaleString()} stitched cells`)}
                        <small>{!carry ? t('ปิดอยู่: ลายใหม่เริ่มนับจากศูนย์', 'Off: the new design starts from zero')
                          : mode === 'scale'
                            ? t(`ขยายแล้ว 1 ช่องที่ปักไว้กลายเป็นหลายช่อง → ${carried.toLocaleString()} ช่องในลายใหม่ · ปิดไว้ถ้าจะเริ่มปักใหม่บนผ้าผืนใหม่`, `Each stitched cell becomes several → ${carried.toLocaleString()} in the new design · turn off if you'll start again on new fabric`)
                            : carried < done
                              ? t(`ย้ายตามตำแหน่ง ${carried.toLocaleString()} ช่อง · อีก ${(done - carried).toLocaleString()} ช่องตกนอกขอบ`, `${carried.toLocaleString()} move with the design · ${(done - carried).toLocaleString()} fall off the edge`)
                              : t('ย้ายตามตำแหน่งใหม่ครบทุกช่อง', 'All of them move with the design')}</small>
                      </span>
                    </label>
                  )
                  : <div className="warn">{mode === 'clear'
                    ? t(`ความคืบหน้าการปัก ${done.toLocaleString()} ช่อง (${pct(done)}%) จะถูกล้าง`, `Your stitching progress (${done.toLocaleString()} cells, ${pct(done)}%) will be cleared`)
                    : t(`ย่อลายแล้วหลายช่องรวมเป็นช่องเดียว นับช่องที่ปักแล้วต่อไม่ได้ ความคืบหน้า ${done.toLocaleString()} ช่อง (${pct(done)}%) จะถูกล้าง`, `Shrinking merges cells, so stitched cells can't carry over: your progress (${done.toLocaleString()} cells, ${pct(done)}%) will be cleared`)}</div>)}
              {Math.abs(target.pitchMm - p.pitchMm) > 0.01 && <div>{t('ระยะรู', 'Hole pitch')} {target.pitchMm.toFixed(2)} {t('มม.', 'mm')} · {t('เข็ม', 'needle')} {suggestNeedle(target.pitchMm).size} · {suggestNeedle(target.pitchMm).strand} {t('เส้น', 'strands')}</div>}
              {dropped > 0 && (
                <label className="check rz-drop"><input type="checkbox" checked={dropColors} onChange={(e) => setDropColors(e.target.checked)} />
                  <span>{t(`ลบสีที่ไม่ได้ใช้แล้ว (${dropped} สี) ออกจากชุดสี`, `Remove the ${dropped} colour${dropped === 1 ? '' : 's'} no longer used`)}</span></label>
              )}
            </div>
          </div>
        </div>

        <footer className="modal-foot rz-foot">
          <label className="check"><input type="checkbox" checked={keepCopy} onChange={(e) => setKeepCopy(e.target.checked)} /><span>{t('เก็บลายเดิมไว้เป็นสำเนา', 'Keep the original as a copy')}</span></label>
          <button className="btn" onClick={onClose}>{t('ยกเลิก', 'Cancel')}</button>
          <button className="btn primary" disabled={!changed} onClick={() => onApply(next, keepCopy)}>
            {!plan && changed ? t('ใช้ผ้าเบอร์นี้', 'Use this fabric') : tab === 'model' ? t('ใช้แบบนี้', 'Use this model') : t('ใช้ขนาดนี้', 'Use this size')}
          </button>
        </footer>
      </div>
    </div>
  );
}
