import { useEffect, useMemo, useRef, useState } from 'react';
import type { Pattern } from '../types';
import { TEMPLATES, freeMask, modelOf, type TemplateDef } from '../lib/templates';
import { createPattern } from '../lib/pattern';
import { DEFAULT_IMPORT, convertImage, loadSourceImage, type SourceImage } from '../lib/imageImport';
import { savePattern } from '../lib/storage';
import { threadNeeds, shoppingListText, useStash, type ThreadNeed } from '../lib/stash';
import { buildPlate, toBinaryStl } from '../lib/plate';
import { downloadBlob } from '../lib/share';
import { contrastText } from '../lib/threads';
import { suggestNeedle } from '../components/needleSuggest';
import { t } from '../lib/i18n';
import { Thumb } from '../components/Thumb';
import { Icon } from '../components/Icon';
import { FeedbackLink } from '../components/FeedbackDialog';
import { trackStep } from '../lib/analytics';
import { AccountButton } from '../components/AccountButton';
import { OrderRequestDialog } from '../components/OrderRequestDialog';
import { materialOf, ordersEnabled } from '../lib/orders';
import { navigate } from '../App';

/** What the pattern goes on. Fabric sizes are the longest side in centimetres at 14 count. */
type Target =
  | { kind: 'aida'; cm: number }
  | { kind: 'template'; tpl: TemplateDef }
  | { kind: 'model'; file: string; cols: number; rows: number; mask: string; pitchMm: number; thicknessMm: number; holeRatio: number };

const AIDA_COUNT = 14;
const FABRIC_SIZES = [
  { cm: 7, label: () => t('เล็ก', 'Small'), hint: () => t('ประมาณ 7 ซม. · ปักเสร็จไว', 'about 7 cm · quick to finish') },
  { cm: 10, label: () => t('กลาง', 'Medium'), hint: () => t('ประมาณ 10 ซม. · ใส่สะดึงได้พอดี', 'about 10 cm · fits a small hoop') },
  { cm: 15, label: () => t('ใหญ่', 'Large'), hint: () => t('ประมาณ 15 ซม. · รายละเอียดมากขึ้น', 'about 15 cm · more detail') },
];
/** Colour budgets tried for each photo; results are then ordered by the colours they really use. */
const BUDGETS = [4, 8, 14];
const LABELS = {
  simple: { label: () => t('ง่าย', 'Simple'), hint: () => t('สีน้อย ปักง่าย', 'few colors, easy') },
  balanced: { label: () => t('สมดุล', 'Balanced'), hint: () => t('แนะนำ', 'recommended') },
  detailed: { label: () => t('ละเอียด', 'Detailed'), hint: () => t('สีมาก ใกล้เคียงรูป', 'more colors, closer to the photo') },
  only: { label: () => t('แบบที่ได้', 'Result'), hint: () => t('รูปนี้ใช้สีไม่มาก', 'this photo needs only a few colors') },
};
/** Name the distinct results by how many there are (a simple photo may give fewer than three). */
const labelsFor = (n: number) => (n >= 3 ? [LABELS.simple, LABELS.balanced, LABELS.detailed] : n === 2 ? [LABELS.simple, LABELS.detailed] : [LABELS.only]);

const importer = () => import('../lib/stlImport');

/** The empty pattern (grid + holes) the image is drawn into. */
function basePattern(target: Target, src: SourceImage, name: string): Pattern {
  if (target.kind === 'aida') {
    const pitch = 25.4 / AIDA_COUNT;
    const long = Math.round((target.cm * 10) / pitch);
    const m = 2; // a little empty fabric around the design
    const aspect = src.crop.w / src.crop.h;
    const w = aspect >= 1 ? long : Math.max(10, Math.round(long * aspect));
    const h = aspect >= 1 ? Math.max(10, Math.round(long / aspect)) : long;
    const cols = w + m * 2, rows = h + m * 2;
    const sug = suggestNeedle(pitch);
    return createPattern({
      name, mode: 'free', cols, rows, mask: freeMask(cols, rows), pitchMm: +pitch.toFixed(3),
      details: { baseType: 'aida', aidaCount: AIDA_COUNT, needleSize: sug.size, strands: sug.strand },
    });
  }
  if (target.kind === 'template') {
    const b = target.tpl.build(target.tpl.w, target.tpl.h);
    // a fixed model (Stitch Box lid) brings its own pitch, thickness and hole size
    const m = target.tpl.model;
    const pitch = m ? m.pitchMm : 3;
    const sug = suggestNeedle(pitch);
    return createPattern({
      name, mode: 'template', templateId: target.tpl.id, templateName: target.tpl.name, cols: b.cols, rows: b.rows, mask: b.mask, pitchMm: pitch,
      details: { baseType: 'print3d', needleSize: sug.size, strands: sug.strand, ...(m ? { thicknessMm: m.thicknessMm, holeRatio: m.holeRatio } : {}) },
    });
  }
  const sug = suggestNeedle(target.pitchMm);
  return createPattern({
    name, mode: 'template', templateId: 'stl', templateName: target.file, cols: target.cols, rows: target.rows, mask: target.mask, pitchMm: target.pitchMm,
    details: { baseType: 'print3d', thicknessMm: target.thicknessMm, holeRatio: target.holeRatio, needleSize: sug.size, strands: sug.strand },
  });
}

function TemplateThumb({ tpl }: { tpl: TemplateDef }) {
  const p = useMemo(() => {
    const b = tpl.build(tpl.w, tpl.h);
    return { ...createPattern({ name: '', mode: 'template', cols: b.cols, rows: b.rows, mask: b.mask, pitchMm: 3 }), palette: [] };
  }, [tpl]);
  return <Thumb pattern={p} max={84} view="stitch" />;
}

function Steps({ step }: { step: number }) {
  const names = [t('ปักบนอะไร', 'Stitch on'), t('เลือกรูป', 'Photo'), t('เลือกแบบ', 'Pick a result')];
  return (
    <ol className="qc-steps" aria-label={t('ขั้นตอน', 'Steps')}>
      {names.map((n, i) => (
        <li key={n} className={i + 1 === step ? 'on' : i + 1 < step ? 'done' : ''}>
          <span>{i + 1 < step ? <Icon name="check" size={13} /> : i + 1}</span>{n}
        </li>
      ))}
    </ol>
  );
}

function NeedList({ list, empty }: { list: ThreadNeed[]; empty: string }) {
  if (!list.length) return <p className="hint">{empty}</p>;
  return (
    <ul className="qc-needs">
      {list.map((n) => (
        <li key={n.thread.id}>
          <span className="sw" style={{ background: n.thread.hex, color: contrastText(n.thread.hex) }}>{n.thread.symbol}</span>
          <b>{[n.thread.brand, n.thread.code].filter(Boolean).join(' ')}</b>
          <span className="nm">{n.thread.name}</span>
          <span className="ct">{t(`${Math.max(1, Math.ceil(n.skeins))} ไจ`, `${Math.max(1, Math.ceil(n.skeins))} skein${Math.ceil(n.skeins) > 1 ? 's' : ''}`)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Beginner flow: choose fabric or a model → add a photo → pick one of three generated patterns. */
export function QuickCreate() {
  const stash = useStash();
  const [step, setStep] = useState(1);
  const [target, setTarget] = useState<Target | null>(null);
  const [modelBusy, setModelBusy] = useState(false);
  const [modelErr, setModelErr] = useState('');
  const [src, setSrc] = useState<{ img: SourceImage; file: string; url: string } | null>(null);
  const [imgErr, setImgErr] = useState('');
  const [useOwn, setUseOwn] = useState(() => stash.codes.size > 0);
  const [extra, setExtra] = useState(0);
  const [scale, setScale] = useState(1);
  const [variants, setVariants] = useState<{ p: Pattern; poor: number; used: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Pattern | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [copied, setCopied] = useState(false);
  const imgInput = useRef<HTMLInputElement>(null);
  const modelInput = useRef<HTMLInputElement>(null);
  const own = useOwn && stash.codes.size > 0;

  // funnel: which step people reach (virtual pages; no photo or pattern data is sent)
  useEffect(() => {
    const names = ['', '1-target', '2-photo', '3-results', '4-done'];
    const kind = target?.kind === 'aida' ? 'fabric' : target ? '3d' : '';
    trackStep(step === 4 ? `/quick/4-done/${kind}${own ? '-own' : ''}` : `/quick/${names[step]}`);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const baseName = src ? src.file.replace(/\.[^.]+$/, '') : '';

  const loadImage = async (f: Blob, file: string) => {
    setImgErr('');
    try {
      const img = await loadSourceImage(f);
      if (src) URL.revokeObjectURL(src.url);
      setSrc({ img, file, url: URL.createObjectURL(f) });
      setVariants(null);
      setSaved(null);
      setStep(3);
    } catch (e) {
      setImgErr((e as Error).message);
    }
  };

  // paste an image on step 2
  useEffect(() => {
    if (step !== 2) return;
    const paste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      const f = item?.getAsFile();
      if (f) loadImage(f, t('รูปที่วาง', 'Pasted image'));
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  });

  const loadModel = async (f: File) => {
    setModelBusy(true);
    setModelErr('');
    const buf = await f.arrayBuffer();
    const { readModelFile, analyzeParts, bestPart } = await importer();
    setTimeout(() => {
      try {
        const parts = readModelFile(f.name, buf);
        const list = analyzeParts(parts);
        const best = bestPart(list);
        if (best < 0) throw new Error(list[0]?.error || t('ไม่พบรูสำหรับปักในโมเดลนี้', 'No stitch holes found in this model'));
        const r = list[best].result!;
        setTarget({ kind: 'model', file: f.name, cols: r.cols, rows: r.rows, mask: r.mask, pitchMm: r.pitchMm, thicknessMm: r.thicknessMm, holeRatio: r.holeRatio });
        setStep(2);
      } catch (e) {
        setModelErr((e as Error).message);
      } finally {
        setModelBusy(false);
      }
    }, 30);
  };

  // build the three variants whenever the inputs change
  useEffect(() => {
    if (step !== 3 || !src || !target) return;
    setBusy(true);
    const id = setTimeout(() => {
      const all = BUDGETS.map((colors) => {
        const p = basePattern(target, src.img, baseName);
        const r = convertImage(src.img, p, {
          ...DEFAULT_IMPORT, colors, scale,
          paletteMode: own ? 'stash' : 'dmc', stash: [...stash.codes], stashExtra: extra,
        });
        return { p: { ...p, cells: r.cells, palette: r.palette }, poor: r.poorMatches ?? 0, used: r.colorsUsed };
      });
      // fewest colours first; drop results that came out with the same number of colours
      all.sort((a, b) => a.used - b.used);
      setVariants(all.filter((v, i) => i === 0 || v.used !== all[i - 1].used));
      setBusy(false);
    }, 30);
    return () => clearTimeout(id);
  }, [step, src, target, own, extra, scale, stash.codes, baseName]);

  const choose = (p: Pattern) => {
    const name = baseName ? t(`ลายจากรูป ${baseName}`, `${baseName} pattern`) : t('ลายจากรูป', 'Photo pattern');
    const final: Pattern = { ...p, id: saved?.id ?? p.id, name: saved?.name ?? name, updatedAt: Date.now() };
    if (!savePattern(final)) {
      alert(t('บันทึกไม่สำเร็จ พื้นที่ในเบราว์เซอร์อาจเต็ม', 'Could not save. Browser storage may be full.'));
      return;
    }
    setSaved(final);
    setStep(4);
    window.scrollTo(0, 0);
  };

  const rename = (name: string) => {
    if (!saved) return;
    const next = { ...saved, name, updatedAt: Date.now() };
    setSaved(next);
    savePattern(next);
  };

  const needs = saved ? threadNeeds(saved, stash.codes) : null;
  const is3d = saved?.details.baseType === 'print3d';

  const copyList = async () => {
    if (!saved || !needs) return;
    const text = shoppingListText(saved.name, needs.buy, t('ด้ายที่ต้องซื้อ', 'Threads to buy'));
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt(t('คัดลอกรายการนี้', 'Copy this list'), text);
    }
  };

  const back = () => {
    if (step === 1) navigate('#/');
    else setStep(step === 4 ? 3 : step - 1);
  };

  return (
    <div className="quick">
      <header className="site-head">
        <button className="icon-btn" onClick={back} title={t('ย้อนกลับ', 'Back')} aria-label={t('ย้อนกลับ', 'Back')}><Icon name="back" /></button>
        <h2>{step === 4 ? t('ลายพร้อมแล้ว!', 'Your pattern is ready!') : t('สร้างลายจากรูป', 'Pattern from a photo')}</h2>
        <div className="spacer" />
        <a className="btn ghost sm hide-xs" href="#/new/free">{t('โหมดขั้นสูง', 'Advanced')}</a>
        <AccountButton />
      </header>

      {step < 4 && <Steps step={step} />}

      <main className="qc-body">
        {step === 1 && (
          <>
            <h3 className="qc-q">{t('จะปักลงบนอะไร?', 'What will you stitch on?')}</h3>
            <p className="qc-sub">{t('ผ้า Aida', 'Aida fabric')} <span className="hint">· 14 ct</span></p>
            <div className="qc-options fabric">
              {FABRIC_SIZES.map((s) => (
                <button key={s.cm} className="qc-option" onClick={() => { setTarget({ kind: 'aida', cm: s.cm }); setStep(2); }}>
                  <span className={`qc-fabric s${s.cm}`} aria-hidden="true" />
                  <b>{t(`ผ้า ${s.label()}`, `${s.label()} fabric`)}</b>
                  <small>{s.hint()}</small>
                </button>
              ))}
            </div>
            <p className="qc-sub">{t('ชิ้นงานพิมพ์ 3 มิติ', '3D-printed piece')}</p>
            <div className="qc-options">
              {TEMPLATES.map((tpl) => (
                <button key={tpl.id} className="qc-option" onClick={() => { setTarget({ kind: 'template', tpl }); setStep(2); }}>
                  <TemplateThumb tpl={tpl} />
                  <b>{tpl.name}</b>
                  <small>{tpl.description}</small>
                </button>
              ))}
              <button className="qc-option" onClick={() => modelInput.current?.click()} disabled={modelBusy}>
                <span className="qc-upload" aria-hidden="true"><Icon name="cube" size={28} /></span>
                <b>{modelBusy ? t('กำลังวิเคราะห์…', 'Analyzing…') : t('โมเดลของฉัน', 'My own model')}</b>
                <small>{t('ไฟล์ STL / 3MF ที่มีรูสำหรับปัก', 'An STL / 3MF with stitch holes')}</small>
              </button>
            </div>
            {modelErr && <p className="error">{modelErr} <a className="guide-link" href="#/new/template">{t('ลองในโหมดขั้นสูง', 'Try the advanced mode')}</a></p>}
            <input ref={modelInput} type="file" accept=".stl,.3mf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) loadModel(f); e.target.value = ''; }} />
          </>
        )}

        {step === 2 && (
          <>
            <h3 className="qc-q">{t('อยากปักรูปอะไร?', 'Which picture do you want to stitch?')}</h3>
            <button className="qc-drop" onClick={() => imgInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadImage(f, f.name); }}>
              <Icon name="image" size={34} />
              <b>{t('เลือกรูป หรือถ่ายรูป', 'Choose or take a photo')}</b>
              <small>{t('ลากรูปมาวาง หรือกด Ctrl/⌘ + V ก็ได้ · รูปการ์ตูน โลโก้ หรือพื้นหลังเรียบจะได้ผลดีที่สุด', 'You can also drop or paste one · cartoons, logos and plain backgrounds work best')}</small>
            </button>
            {imgErr && <p className="error">{imgErr}</p>}
            <input ref={imgInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) loadImage(f, f.name); e.target.value = ''; }} />
          </>
        )}

        {step === 3 && src && (
          <>
            <div className="qc-source">
              <img src={src.url} alt="" />
              <div>
                <b>{t('เลือกแบบที่ชอบ', 'Pick the one you like')}</b>
                <small>{t('ทุกแบบใช้รูปเดียวกัน ต่างกันที่จำนวนสี', 'Each one uses your photo with a different number of colors')}</small>
                <button className="btn sm ghost" onClick={() => setStep(2)}><Icon name="upload" size={15} /> {t('เปลี่ยนรูป', 'Change photo')}</button>
              </div>
            </div>

            <div className="qc-controls">
              <label className="qc-toggle">
                <input type="checkbox" checked={own} disabled={!stash.codes.size} onChange={(e) => setUseOwn(e.target.checked)} />
                <span>
                  <b>{t('ใช้เฉพาะด้ายที่ฉันมี', 'Use only threads I have')}</b>
                  <small>
                    {stash.codes.size
                      ? t(`มีด้ายในคลัง ${stash.codes.size} สี`, `${stash.codes.size} threads in your stash`)
                      : t(<>ยังไม่ได้บันทึกด้ายที่มี · <a href="#/threads">เพิ่มด้ายของฉัน</a></>, <>You haven't added your threads yet · <a href="#/threads">Add my threads</a></>)}
                  </small>
                </span>
              </label>
              {own && (
                <label className="qc-inline">
                  {t('ซื้อเพิ่มได้ไม่เกิน', 'Allow buying up to')}
                  <select value={extra} onChange={(e) => setExtra(+e.target.value)}>
                    {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{t(`${n} สี`, `${n} ${n === 1 ? 'color' : 'colors'}`)}</option>)}
                  </select>
                </label>
              )}
              <label className="qc-inline">
                {t('ขนาดรูป', 'Picture size')} <b>{Math.round(scale * 100)}%</b>
                <input type="range" min={0.6} max={1.3} step={0.05} value={scale} onChange={(e) => setScale(+e.target.value)} />
              </label>
            </div>

            <div className={'qc-variants' + (busy ? ' busy' : '')} aria-busy={busy}>
              {(variants ?? BUDGETS.map(() => null)).map((it, i, list) => {
                const v = labelsFor(list.length)[i];
                const rec = list.length === 1 || i === 1;
                const n = it ? threadNeeds(it.p, stash.codes) : null;
                const colors = n ? n.have.length + n.buy.length : 0;
                const stitches = n ? [...n.have, ...n.buy].reduce((a, x) => a + x.stitches, 0) : 0;
                return (
                  <article key={i} className={'qc-variant' + (rec ? ' rec' : '')}>
                    <button className="qc-variant-thumb" disabled={!it} onClick={() => it && choose(it.p)}>
                      {it ? <Thumb pattern={it.p} max={220} view="stitch" /> : <span className="qc-wait">{t('กำลังสร้าง…', 'Creating…')}</span>}
                    </button>
                    <div className="qc-variant-body">
                      <b>{v.label()} <small>{v.hint()}</small></b>
                      {n && (
                        <span className="meta">
                          {t(`${colors} สี · ${stitches.toLocaleString()} ฝีเข็ม`, `${colors} colors · ${stitches.toLocaleString()} stitches`)}
                        </span>
                      )}
                      {n && stash.codes.size > 0 && (
                        <span className="meta own">
                          <span className="ok">{t(`มีแล้ว ${n.have.length}`, `${n.have.length} owned`)}</span>
                          {n.buy.length > 0 && <span className="buy">{t(`ต้องซื้อ ${n.buy.length}`, `${n.buy.length} to buy`)}</span>}
                        </span>
                      )}
                      {it && it.poor > 0 && <span className="meta warn">{t('บางสีในรูปไม่มีด้ายที่ใกล้เคียงในคลัง', 'Some photo colors have no close match in your stash')}</span>}
                    </div>
                    <button className={'btn ' + (rec ? 'primary' : '')} disabled={!it} onClick={() => it && choose(it.p)}>{t('ใช้แบบนี้', 'Use this')}</button>
                  </article>
                );
              })}
            </div>
          </>
        )}

        {step === 4 && saved && needs && (
          <div className="qc-result">
            <div className="qc-result-preview"><Thumb pattern={saved} max={420} view="stitch" /></div>
            <div className="qc-result-side">
              <label className="qc-name">{t('ชื่อลาย', 'Pattern name')}
                <input value={saved.name} onChange={(e) => rename(e.target.value)} />
              </label>
              <div className="qc-actions">
                <a className="btn primary" href={`#/stitch/${saved.id}`}><Icon name="needle" size={16} /> {t('เริ่มปัก', 'Start stitching')}</a>
                <a className="btn" href={`#/print/${saved.id}`}><Icon name="print" size={16} /> {t('พิมพ์แผนผัง', 'Print chart')}</a>
                {is3d && !modelOf(saved.templateId) && (
                  <button className="btn" onClick={() => downloadBlob(toBinaryStl(buildPlate(saved, saved.details.thicknessMm, saved.details.holeRatio), saved.name), `${saved.name || 'pattern'}.stl`)}>
                    <Icon name="cube" size={16} /> {t('ดาวน์โหลด STL ไปพิมพ์', 'Download STL to print')}
                  </button>
                )}
                {saved && materialOf(saved) && ordersEnabled && (
                  <button className="btn" onClick={() => setOrdering(true)}>
                    <Icon name="send" size={16} /> {is3d ? t('ไม่มีเครื่องพิมพ์? ให้ร้านผลิตให้', 'No printer? Have a shop make it') : t('ให้ร้านผลิตเป็นชุดปักหรือปักเสร็จ', 'Have a shop make it as a kit or finished piece')}
                  </button>
                )}
                <a className="btn ghost" href={`#/edit/${saved.id}`}><Icon name="edit" size={16} /> {t('ปรับละเอียดในโหมดขั้นสูง', 'Fine-tune in the editor')}</a>
              </div>
              <p className="hint qc-feedback">{t('ลายออกมาไม่ถูกใจ หรือมีอะไรอยากให้ปรับ?', 'Not quite what you wanted, or something to improve?')} <FeedbackLink kind="idea">{t('บอกเรา', 'Tell us')}</FeedbackLink></p>

              <h4>{t('ด้ายที่ต้องซื้อ', 'Threads to buy')} <small>{needs.buy.length}</small></h4>
              <NeedList list={needs.buy} empty={t('ไม่ต้องซื้อเพิ่ม ใช้ด้ายที่มีได้ครบ 🎉', 'Nothing to buy — you have every thread 🎉')} />
              {needs.buy.length > 0 && (
                <button className="btn sm ghost" onClick={copyList}><Icon name="copy" size={15} /> {copied ? t('คัดลอกแล้ว', 'Copied') : t('คัดลอกรายการซื้อ', 'Copy shopping list')}</button>
              )}
              {needs.have.length > 0 && (
                <>
                  <h4>{t('มีแล้ว', 'Already have')} <small>{needs.have.length}</small></h4>
                  <NeedList list={needs.have} empty="" />
                </>
              )}
              {!stash.codes.size && (
                <p className="hint">{t(<>บันทึกด้ายที่คุณมีไว้ใน <a href="#/threads">ด้ายของฉัน</a> ครั้งหน้าระบบจะเลือกใช้ด้ายที่มีให้ก่อน</>, <>Add the threads you own in <a href="#/threads">My threads</a> and next time the app will use them first.</>)}</p>
              )}
            </div>
          </div>
        )}
      </main>
      {ordering && saved && <OrderRequestDialog pattern={saved} onClose={() => setOrdering(false)} />}
    </div>
  );
}
