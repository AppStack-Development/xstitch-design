import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StitchArt } from '../components/StitchArt';
import type { HoleBrush, Pattern, ThreadColor, Tool, ViewMode } from '../types';
import { draftState, openPattern, persist, saveDraft, unkeep, type DraftState } from '../lib/drafts';
import { ActionToast, DraftBar } from '../components/DraftBar';
import { computeStats } from '../lib/stats';
import { exportPng } from '../lib/render';
import { buildPlate, toBinaryStl } from '../lib/plate';
import { modelOf } from '../lib/templates';
import { downloadBlob, safeFilename, shareUrl } from '../lib/share';
import { contrastText } from '../lib/threads';
import { PatternCanvas, type CanvasHandle } from '../components/PatternCanvas';
import { PalettePanel } from '../components/PalettePanel';
import { DetailsPanel } from '../components/DetailsPanel';
import { TransferDialog } from '../components/TransferDialog';
import { TextDialog } from '../components/TextDialog';
import { ResizeDialog } from '../components/ResizeDialog';
import { savePattern } from '../lib/storage';
import { uid } from '../lib/threads';
import { ToolSheet, type SheetSection } from '../components/ToolSheet';
import { EditorTip, type CoachTarget } from '../components/EditorTip';
import { StlImportNote } from '../components/StlImportNote';

// three.js is large: load the 3D preview only when its tab is opened
const Preview3D = lazy(() => import('../components/Preview3D').then((m) => ({ default: m.Preview3D })));
import { Icon, type IconName } from '../components/Icon';
import { ImageImportDialog } from '../components/ImageImportDialog';
import { PublishDialog } from '../components/PublishDialog';
import { communityEnabled } from '../lib/community';
import { OrderRequestDialog } from '../components/OrderRequestDialog';
import { materialOf, ordersEnabled } from '../lib/orders';
import { computeProgress, reconcileProgress } from '../lib/progress';
import { navigate } from '../App';
import { t } from '../lib/i18n';

// an undo step: the stitches and the grid they sit on (only a resize changes the grid, so it is safe to
// restore). A resize step ("full") also remembers spacing, details and progress; ordinary steps leave those
// alone, so undoing a stitch never reverts a description or fabric choice made in between.
type Snap = Pick<Pattern, 'cells' | 'mask' | 'palette' | 'cols' | 'rows' | 'mode' | 'templateId' | 'templateName'>
  & Partial<Pick<Pattern, 'pitchMm' | 'details' | 'progress'>> & { full?: true };
const snap = (p: Pattern, full = false): Snap => ({
  cells: p.cells, mask: p.mask, palette: p.palette, cols: p.cols, rows: p.rows,
  mode: p.mode, templateId: p.templateId, templateName: p.templateName,
  ...(full ? { full: true as const, pitchMm: p.pitchMm, details: p.details, progress: p.progress } : {}),
});

/**
 * `short` is the visible name (phone tool bar / "More" sheet). `phone` tools stay in the phone's
 * bottom bar; the rest move into the "More" sheet there. Pan is in the bar because the editor canvas
 * has no two-finger pan on touch screens.
 */
const TOOLS: { id: Tool; icon: IconName; label: string; short: string; key: string; phone?: boolean }[] = [
  { id: 'pencil', icon: 'pencil', label: t('ดินสอ', 'Pencil'), short: t('ดินสอ', 'Pencil'), key: 'B', phone: true },
  { id: 'eraser', icon: 'eraser', label: t('ยางลบ', 'Eraser'), short: t('ยางลบ', 'Eraser'), key: 'E', phone: true },
  { id: 'fill', icon: 'fill', label: t('เทสี', 'Fill'), short: t('เทสี', 'Fill'), key: 'G', phone: true },
  { id: 'picker', icon: 'picker', label: t('ดูดสี', 'Eyedropper'), short: t('ดูดสี', 'Eyedropper'), key: 'I' },
  { id: 'line', icon: 'line', label: t('เส้นตรง', 'Line'), short: t('เส้นตรง', 'Line'), key: 'L' },
  { id: 'rect', icon: 'rect', label: t('กรอบสี่เหลี่ยม', 'Rectangle'), short: t('กรอบสี่เหลี่ยม', 'Rectangle'), key: 'R' },
  { id: 'pan', icon: 'pan', label: t('เลื่อนมุมมอง (กด Space ค้าง)', 'Pan (hold Space)'), short: t('เลื่อนมุมมอง', 'Pan'), key: 'H', phone: true },
  { id: 'hole', icon: 'hole', label: t('แก้ไขช่องปัก/โครง', 'Edit cells/frame'), short: t('แก้ไขช่องปัก/โครง', 'Edit cells/frame'), key: 'K' },
];

const VIEWS = [['stitch', t('ฝีเข็ม', 'Stitches')], ['color', t('สี', 'Color')], ['symbol', t('สัญลักษณ์', 'Symbol')]] as const;

export function Editor({ id }: { id: string }) {
  const [pattern, setPattern] = useState<Pattern | null>(() => openPattern(id));
  /** only trying it (lib/drafts.ts): saved into My patterns on the first edit */
  const [dstate, setDstate] = useState<DraftState>(() => draftState(id));
  const [savedNote, setSavedNote] = useState(false);
  const closeSavedNote = useCallback(() => setSavedNote(false), []);
  /** store after an action; intent = the action shows they want this pattern */
  const keep = (p: Pattern, intent: boolean) => {
    const r = persist({ ...p, updatedAt: Date.now() }, intent);
    if (r === 'saved-now') { setDstate('saved'); setSavedNote(true); }
    return r;
  };
  const [tool, setTool] = useState<Tool>('pencil');
  const [active, setActive] = useState(0);
  const [holeBrush, setHoleBrush] = useState<HoleBrush>('2');
  const [view, setView] = useState<ViewMode>('stitch');
  const [grid, setGrid] = useState(true);
  const [mirrorX, setMirrorX] = useState(false);
  const [mirrorY, setMirrorY] = useState(false);
  const [tab, setTab] = useState<'palette' | 'details' | '3d'>('palette');
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState('');
  /** image import dialog: closed (null), open empty, or open with a file */
  const [imgImport, setImgImport] = useState<{ file: File | null } | null>(null);
  const [transfer, setTransfer] = useState(false);
  const [publish, setPublish] = useState(false);
  const [order, setOrder] = useState(false);
  const [textDlg, setTextDlg] = useState(false);
  /** "Size and model" dialog */
  const [resizing, setResizing] = useState(false);
  /** phone "More" tools sheet */
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  /** element the first-run tip is pointing at */
  const [coach, setCoach] = useState<CoachTarget | null>(null);
  const undo = useRef<Snap[]>([]);
  const redo = useRef<Snap[]>([]);
  const [, force] = useState(0);
  const canvas = useRef<CanvasHandle>(null);
  const first = useRef(true);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  };

  // autosave
  useEffect(() => {
    if (!pattern) return;
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveState('saving');
    const t = setTimeout(() => {
      setSaveState(keep(pattern, true) === 'error' ? 'error' : 'saved');
    }, 500);
    return () => clearTimeout(t);
  }, [pattern]);

  const current = useRef(pattern);
  current.current = pattern;

  const pushUndo = useCallback((full: boolean) => {
    const p = current.current;
    if (!p) return;
    undo.current.push(snap(p, full));
    if (undo.current.length > 150) undo.current.shift();
    redo.current = [];
    force((n) => n + 1);
  }, []);
  // no arguments on purpose: it's handed straight to the canvas as onStrokeStart
  const snapshot = useCallback(() => pushUndo(false), [pushUndo]);
  /** before a resize or model change: remembers spacing, details and progress too */
  const snapshotFull = useCallback(() => pushUndo(true), [pushUndo]);

  const restore = useCallback((from: React.MutableRefObject<Snap[]>, to: React.MutableRefObject<Snap[]>) => {
    const p = current.current;
    const s = from.current.pop();
    if (!p || !s) return;
    to.current.push(snap(p, !!s.full));
    const { full: _full, ...fields } = s;
    const next = { ...p, ...fields };
    current.current = next;
    setPattern(next);
  }, []);
  // a touch stroke that became a pinch: put the pattern back and forget that undo step entirely
  const cancelStroke = useCallback(() => {
    const p = current.current;
    const s = undo.current.pop();
    if (!p || !s) return;
    const next = { ...p, ...s };
    current.current = next;
    setPattern(next);
    force((n) => n + 1);
  }, []);
  const doUndo = useCallback(() => restore(undo, redo), [restore]);
  const doRedo = useCallback(() => restore(redo, undo), [restore]);

  const onPalette = useCallback((palette: ThreadColor[], remap?: (i: number) => number) => {
    snapshot();
    setPattern((p) => (p ? { ...p, palette, cells: remap ? p.cells.map((c) => (c < 0 ? c : remap(c))) : p.cells } : p));
  }, [snapshot]);

  // close the export menu on any tap/click outside it (touch screens never fire mouseleave)
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.('.menu-wrap')) setMenu(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);

  // paste an image anywhere in the editor -> open the import dialog
  useEffect(() => {
    if (imgImport) return;
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (f) { e.preventDefault(); setImgImport({ file: f }); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [imgImport]);

  // keyboard shortcuts
  useEffect(() => {
    if (imgImport || textDlg) return;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? doRedo() : doUndo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
      if (mod) return;
      if (e.key.toLowerCase() === 't') { setTextDlg(true); return; }
      const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (t) { setTool(t.id); return; }
      if (/^[1-9]$/.test(e.key) && pattern && +e.key <= pattern.palette.length) { setActive(+e.key - 1); return; }
      if (e.key === '+' || e.key === '=') canvas.current?.zoomBy(1.25);
      if (e.key === '-') canvas.current?.zoomBy(0.8);
      if (e.key === '0') canvas.current?.fit();
      if (e.key.toLowerCase() === 'x') setMirrorX((v) => !v);
      if (e.key.toLowerCase() === 'y') setMirrorY((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUndo, doRedo, pattern, imgImport, textDlg]);

  const stats = useMemo(() => (pattern ? computeStats(pattern) : null), [pattern]);

  if (!pattern || !stats) {
    return (
      <div className="empty-state">
        <StitchArt kind="lost" />
        <h2>{t('ไม่พบลายนี้', 'Pattern not found')}</h2>
        <p className="muted">{t('ลายอาจถูกลบไปแล้ว บันทึกไว้ในเบราว์เซอร์อื่น หรือเป็นลายที่ลองไว้ในแท็บที่ปิดไปแล้ว', 'It may have been deleted, saved in a different browser, or only tried in a tab that’s now closed.')}</p>
        <a className="btn primary" href="#/">{t('กลับหน้าแรก', 'Back to home')}</a>
      </div>
    );
  }

  const p = pattern;
  const activeColor = p.palette[active];
  const hoverKind = hover ? p.mask[hover.y * p.cols + hover.x] : null;
  const hoverColor = hover ? p.palette[p.cells[hover.y * p.cols + hover.x]] : undefined;

  // phone "More" sheet: every tool and toggle that is not in the phone's bottom bar
  const sheetTool = TOOLS.find((x) => x.id === tool && !x.phone);
  const moreTitle = t('เครื่องมือเพิ่มเติม', 'More tools')
    + (sheetTool ? ` · ${t('กำลังใช้', 'using')}: ${sheetTool.short}` : '')
    + (mirrorX || mirrorY ? ` · ${t('เปิดสมมาตรอยู่', 'mirror on')}` : '');
  const sheetSections: SheetSection[] = [
    {
      title: t('เครื่องมือ', 'Tools'),
      items: [
        ...TOOLS.filter((x) => !x.phone).map((x) => ({
          key: x.id, icon: x.icon, label: x.short, title: `${x.label} (${x.key})`, on: tool === x.id, onSelect: () => setTool(x.id),
        })),
        { key: 'text', icon: 'text', label: t('ใส่ชื่อ / ข้อความ', 'Name / text'), title: t('ใส่ชื่อ / ข้อความ (T)', 'Name / text (T)'), onSelect: () => setTextDlg(true) },
        // on phones the header button is hidden to give the pattern name room; it lives here instead
        { key: 'image', icon: 'image', label: t('รูปภาพ → ลาย', 'Image → pattern'), title: t('แปลงรูปภาพเป็นลายปัก', 'Turn an image into a pattern'), onSelect: () => setImgImport({ file: null }) },
        { key: 'resize', icon: 'resize', label: t('ขนาดและแบบ', 'Size & model'), title: t('ปรับขนาด หรือเปลี่ยนแบบชิ้นงาน', 'Resize, or move to another model'), onSelect: () => setResizing(true) },
      ],
    },
    {
      title: t('สมมาตรและเส้นตาราง', 'Mirror & grid'),
      items: [
        { key: 'mx', icon: 'mirrorX', label: t('สมมาตรซ้าย-ขวา', 'Mirror left-right'), title: t('สมมาตรซ้าย-ขวา (X)', 'Mirror left-right (X)'), toggle: true, on: mirrorX, onSelect: () => setMirrorX((v) => !v) },
        { key: 'my', icon: 'mirrorY', label: t('สมมาตรบน-ล่าง', 'Mirror top-bottom'), title: t('สมมาตรบน-ล่าง (Y)', 'Mirror top-bottom (Y)'), toggle: true, on: mirrorY, onSelect: () => setMirrorY((v) => !v) },
        { key: 'grid', icon: 'grid', label: t('เส้นตาราง', 'Grid lines'), toggle: true, on: grid, onSelect: () => setGrid((v) => !v) },
      ],
    },
  ];

  const doExport = async (kind: 'print' | 'png' | 'json' | 'stl' | 'share' | 'transfer') => {
    setMenu(false);
    keep(p, false); // printing or sharing a pattern you're only looking at doesn't save it
    const fname = safeFilename(p.name);
    if (kind === 'print') navigate(`#/print/${p.id}`);
    if (kind === 'transfer') setTransfer(true);
    if (kind === 'png') downloadBlob(await exportPng(p, view === 'symbol' ? 'symbol' : 'color'), `${fname}.png`);
    if (kind === 'json') downloadBlob(new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' }), `${fname}.stitch.json`);
    if (kind === 'stl') {
      const thick = p.details.thicknessMm;
      downloadBlob(toBinaryStl(buildPlate(p, thick, p.details.holeRatio), p.name), `${fname}.stl`);
      flash(t('ดาวน์โหลดไฟล์ STL แล้ว นำไปเปิดในโปรแกรม slicer ได้เลย', 'STL downloaded. Open it in your slicer.'));
    }
    if (kind === 'share') {
      const url = await shareUrl(p);
      try {
        await navigator.clipboard.writeText(url);
        flash(t(`คัดลอกลิงก์แชร์แล้ว (${(url.length / 1024).toFixed(1)} KB)`, `Share link copied (${(url.length / 1024).toFixed(1)} KB)`));
      } catch {
        prompt(t('คัดลอกลิงก์นี้เพื่อแชร์', 'Copy this link to share'), url);
      }
    }
  };

  return (
    <div className="editor">
      <header className="editor-top">
        {/* a pattern in My patterns goes back to that list; one only being tried goes home */}
        <a className="icon-btn" href={dstate === 'saved' ? '#/account' : '#/'} title={dstate === 'saved' ? t('กลับไปลายของฉัน', 'Back to My patterns') : t('กลับหน้าแรก', 'Back to home')}><Icon name="back" /></a>
        <input className="name-input" value={p.name} onChange={(e) => setPattern({ ...p, name: e.target.value })} aria-label={t('ชื่อลาย', 'Pattern name')} />
        <span className={'save-state ' + saveState}>
          {dstate !== 'saved' ? t('ยังไม่บันทึก', 'Not saved') : saveState === 'saved' ? t('บันทึกแล้ว', 'Saved') : saveState === 'saving' ? t('กำลังบันทึก…', 'Saving…') : t('บันทึกไม่สำเร็จ (พื้นที่เต็ม?)', 'Save failed (storage full?)')}
        </span>
        <div className="spacer" />
        <button className="btn ghost sm img-btn" onClick={() => setImgImport({ file: null })} title={t('แปลงรูปภาพเป็นลายปัก (หรือลากรูปมาวาง / Ctrl+V)', 'Turn an image into a pattern (or drag one in / Ctrl+V)')}>
          <Icon name="image" size={16} /> <span>{t('รูปภาพ → ลาย', 'Image → pattern')}</span>
        </button>
        <div className="seg" role="group" aria-label={t('มุมมอง', 'View')}>
          {VIEWS.map(([v, l]) => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
        <a className="icon-btn" href="#/guide/editor" title={t('คู่มือการใช้งาน', 'Guide')}><Icon name="help" /></a>
        <button className="icon-btn" onClick={doUndo} disabled={!undo.current.length} title={t('เลิกทำ (Ctrl/⌘+Z)', 'Undo (Ctrl/⌘+Z)')}><Icon name="undo" /></button>
        <button className="icon-btn" onClick={doRedo} disabled={!redo.current.length} title={t('ทำซ้ำ (Shift+Ctrl/⌘+Z)', 'Redo (Shift+Ctrl/⌘+Z)')}><Icon name="redo" /></button>
        <a className="btn sm stitch-btn" href={`#/stitch/${p.id}`} onClick={() => keep(p, false)}
          title={t('เปิดโหมดปัก: ติ๊กช่องที่ปักแล้ว ดูความคืบหน้าแต่ละสี', 'Open Stitch mode: tick off stitched cells and see progress per color')}>
          <Icon name="needle" size={16} /> <span>{t('โหมดปัก', 'Stitch mode')}{p.progress ? ` · ${Math.floor(computeProgress(p).pct)}%` : ''}</span>
        </a>
        <div className="menu-wrap">
          <button className={'btn primary' + (coach === 'export' ? ' coach-glow' : '')} onClick={() => setMenu(!menu)} title={t('ส่งออก / แชร์', 'Export / share')}><Icon name="download" size={16} /> <span className="hide-xs">{t('ส่งออก / แชร์', 'Export / share')}</span></button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              <button onClick={() => doExport('print')}><Icon name="print" /> <span><b>{t('พิมพ์ / บันทึกเป็น PDF', 'Print / save as PDF')}</b><small>{t('แผนผัง + รายการด้าย + รายละเอียด', 'Chart + thread list + details')}</small></span></button>
              <button onClick={() => doExport('png')}><Icon name="image" /> <span><b>{t('รูปภาพ PNG', 'PNG image')}</b><small>{t('สำหรับส่งให้เพื่อนทาง LINE / โซเชียล', 'To send to friends on LINE / social media')}</small></span></button>
              <button onClick={() => doExport('transfer')}><Icon name="sendOut" /> <span><b>{t('ส่งไปมือถือ / อีกเครื่อง', 'Send to phone / another device')}</b><small>{t('สแกน QR เพื่อปักต่อในมือถือ (รวมความคืบหน้า)', 'Scan the QR to continue stitching on your phone (progress included)')}</small></span></button>
              <button onClick={() => doExport('share')}><Icon name="link" /> <span><b>{t('คัดลอกลิงก์แชร์', 'Copy share link')}</b><small>{t('เพื่อนเปิดดูและบันทึกต่อได้', 'Friends can open it and save a copy')}</small></span></button>
              {ordersEnabled && materialOf(p) && (
                <button onClick={() => { setMenu(false); keep(p, true); setOrder(true); }}>
                  <Icon name="cube" /> <span><b>{t('สั่งผลิต', 'Have it made')}</b><small>{t('เลือกร้านที่รับผลิตลายนี้ เป็นชุดปักเองหรือปักเสร็จ ดูราคาได้ทันที', 'Pick a shop to make it as a kit or finished piece; see prices right away')}</small></span>
                </button>
              )}
              {communityEnabled && (
                <button onClick={() => { setMenu(false); keep(p, true); setPublish(true); }}>
                  <Icon name="people" /> <span><b>{p.postId ? t('อัปเดตในชุมชน', 'Update in the community') : t('แชร์ในชุมชน', 'Share with the community')}</b><small>{t('ให้ทุกคนเห็นและลองปักลายนี้ได้', 'Let everyone see and stitch this pattern')}</small></span>
                </button>
              )}
              <button onClick={() => doExport('json')}><Icon name="file" /> <span><b>{t('ไฟล์ลาย (.json)', 'Pattern file (.json)')}</b><small>{t('สำรองข้อมูล / นำเข้าเครื่องอื่น', 'Backup / import on another device')}</small></span></button>
              {!modelOf(p.templateId) && (
                <button onClick={() => doExport('stl')}><Icon name="cube" /> <span><b>{t('โมเดล 3D (.stl)', '3D model (.stl)')}</b><small>{t('แผ่นเจาะรูตามรูปทรงนี้ สำหรับพิมพ์', 'A plate with holes in this shape, ready to 3D print')}</small></span></button>
              )}
            </div>
          )}
        </div>
      </header>
      {dstate !== 'saved' && <DraftBar state={dstate} kind="edit" onSave={() => {
        const cur = current.current;
        if (cur && saveDraft({ ...cur, updatedAt: Date.now() })) { setDstate('saved'); setSavedNote(true); }
      }} />}
      {savedNote && <ActionToast text={t('บันทึกไว้ในลายของฉันแล้ว', 'Saved to My patterns')} action={t('ไม่เก็บ', 'Don’t keep')}
        onAction={() => { const cur = current.current; if (cur) unkeep({ ...cur, updatedAt: Date.now() }); setDstate('declined'); setSavedNote(false); }}
        onClose={closeSavedNote} />}

      <div className="editor-main ed-main">
        {/* desktop/tablet: the full vertical rail. Phones (editor-mobile.css): a bottom bar with the
            `phone` tools + "More"; everything marked tool-x lives in the More sheet instead. */}
        <aside className={'toolbar' + (coach === 'tools' ? ' coach-glow' : '')}>
          {TOOLS.map((x) => (
            <button key={x.id}
              className={'tool' + (x.phone ? '' : ' tool-x') + (tool === x.id ? ' on' : '') + (x.id === 'pencil' && coach === 'pencil' ? ' coach-glow' : '')}
              onClick={() => setTool(x.id)} title={`${x.label} (${x.key})`} aria-label={x.short} aria-pressed={tool === x.id}>
              <Icon name={x.icon} size={20} />
              {x.phone && <span className="tool-label">{x.short}</span>}
            </button>
          ))}
          <button className="tool tool-x" onClick={() => setTextDlg(true)} title={t('ใส่ชื่อ / ข้อความ (T)', 'Name / text (T)')}><Icon name="text" size={20} /></button>
          <button className="tool tool-x" onClick={() => setResizing(true)} title={t('ขนาดและแบบ', 'Size and model')} aria-label={t('ขนาดและแบบ', 'Size and model')}><Icon name="resize" size={20} /></button>
          <div className="tool-sep" />
          <button className={'tool tool-x' + (mirrorX ? ' on' : '')} aria-pressed={mirrorX} onClick={() => setMirrorX(!mirrorX)} title={t('สมมาตรซ้าย-ขวา (X)', 'Mirror left-right (X)')}><Icon name="mirrorX" size={20} /></button>
          <button className={'tool tool-x' + (mirrorY ? ' on' : '')} aria-pressed={mirrorY} onClick={() => setMirrorY(!mirrorY)} title={t('สมมาตรบน-ล่าง (Y)', 'Mirror top-bottom (Y)')}><Icon name="mirrorY" size={20} /></button>
          <button className={'tool tool-x' + (grid ? ' on' : '')} aria-pressed={grid} onClick={() => setGrid(!grid)} title={t('เส้นตาราง', 'Grid lines')}><Icon name="grid" size={20} /></button>
          <div className="tool-sep" />
          <button className="tool tool-x" onClick={() => canvas.current?.zoomBy(1.25)} title={t('ซูมเข้า (+)', 'Zoom in (+)')}><Icon name="zoomIn" size={20} /></button>
          <button className="tool tool-x" onClick={() => canvas.current?.zoomBy(0.8)} title={t('ซูมออก (−)', 'Zoom out (−)')}><Icon name="zoomOut" size={20} /></button>
          <button className="tool tool-x" onClick={() => canvas.current?.fit()} title={t('พอดีจอ (0)', 'Fit to screen (0)')}><Icon name="fit" size={20} /></button>
          {/* phones only: opens the sheet; shows the active tool when that tool lives in the sheet */}
          <button className={'tool tool-more' + (sheetTool ? ' on' : '') + (moreOpen ? ' open' : '') + (coach === 'more' ? ' coach-glow' : '')}
            onClick={() => setMoreOpen(!moreOpen)} aria-haspopup="dialog" aria-expanded={moreOpen}
            title={moreTitle} aria-label={moreTitle}>
            <Icon name={sheetTool ? sheetTool.icon : 'more'} size={20} />
            <span className="tool-label">{sheetTool ? sheetTool.short : t('เพิ่มเติม', 'More')}</span>
            {(mirrorX || mirrorY) && <span className="more-badge" aria-hidden="true"><Icon name={mirrorX ? 'mirrorX' : 'mirrorY'} size={11} /></span>}
          </button>
        </aside>

        <section className="stage"
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
          onDrop={(e) => {
            const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
            if (f) { e.preventDefault(); setImgImport({ file: f }); }
          }}>
          {tool === 'hole' && (
            <div className="hole-bar">
              <span>{t('แก้ไขรูปทรงชิ้นงาน:', 'Edit piece shape:')}</span>
              {([['2', t('ช่องปัก', 'Stitch cell')], ['1', t('โครงทึบ', 'Solid frame')], ['0', t('ตัดออก', 'Cut out')]] as const).map(([k, l]) => (
                <button key={k} className={'chip k' + k + (holeBrush === k ? ' on' : '')} onClick={() => setHoleBrush(k)}>{l}</button>
              ))}
            </div>
          )}
          <PatternCanvas
            ref={canvas}
            pattern={p}
            view={view}
            grid={grid}
            tool={tool}
            active={active}
            holeBrush={holeBrush}
            mirrorX={mirrorX}
            mirrorY={mirrorY}
            onStrokeStart={snapshot}
            onStrokeCancel={cancelStroke}
            onChange={(cells, mask) => setPattern((cur) => (cur ? reconcileProgress({ ...cur, cells, mask }, cur.cells) : cur))}
            onPick={(i) => { setActive(i); setTool('pencil'); }}
            onHover={setHover}
          />
          {/* phones only: zoom buttons on the canvas (there is no pinch zoom in the editor) */}
          <div className="zoom-float">
            <div>
              <button className="icon-btn bg" onClick={() => canvas.current?.zoomBy(1.25)} title={t('ซูมเข้า', 'Zoom in')} aria-label={t('ซูมเข้า', 'Zoom in')}><Icon name="zoomIn" size={20} /></button>
              <button className="icon-btn bg" onClick={() => canvas.current?.zoomBy(0.8)} title={t('ซูมออก', 'Zoom out')} aria-label={t('ซูมออก', 'Zoom out')}><Icon name="zoomOut" size={20} /></button>
              <button className="icon-btn bg" onClick={() => canvas.current?.fit()} title={t('พอดีจอ', 'Fit to screen')} aria-label={t('พอดีจอ', 'Fit to screen')}><Icon name="fit" size={20} /></button>
            </div>
          </div>
          <footer className="status">
            {activeColor && (
              <span className="status-color">
                <span className="dot lg" style={{ background: activeColor.hex, color: contrastText(activeColor.hex) }}>{activeColor.symbol}</span>
                {[activeColor.brand, activeColor.code].filter(Boolean).join(' ')} {activeColor.name}
              </span>
            )}
            <span>{hover ? t(`คอลัมน์ ${hover.x + 1}, แถว ${hover.y + 1}`, `Col ${hover.x + 1}, row ${hover.y + 1}`) : '—'}</span>
            {hover && <span>{hoverKind === '2' ? (hoverColor ? t(`ปักแล้ว: ${hoverColor.code || hoverColor.name}`, `Stitch: ${hoverColor.code || hoverColor.name}`) : t('ช่องว่าง', 'Empty cell')) : hoverKind === '1' ? t('โครงทึบ', 'Solid frame') : t('นอกชิ้นงาน', 'Outside the piece')}</span>}
            <span className="spacer" />
            <span>{stats.total.toLocaleString()} / {stats.holes.toLocaleString()} {t('ช่อง', 'cells')}</span>
            <span>{stats.widthMm.toFixed(0)}×{stats.heightMm.toFixed(0)} {t('มม.', 'mm')}</span>
            <span className="kbd-hint">{t('คลิกขวา = ลบ', 'Right-click = erase')}</span>
          </footer>
          {toast && <div className="toast">{toast}</div>}
          <EditorTip onTarget={setCoach} />
          {!coach && <StlImportNote pattern={p} />}
        </section>

        <aside className="side">
          <nav className="tabs">
            <button className={(tab === 'palette' ? 'on' : '') + (coach === 'colors' ? ' coach-glow' : '')} onClick={() => setTab('palette')}><Icon name="palette" size={16} /> {t('สีด้าย', 'Colors')}</button>
            <button className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}><Icon name="info" size={16} /> {t('รายละเอียด', 'Details')}</button>
            <button className={tab === '3d' ? 'on' : ''} onClick={() => setTab('3d')}><Icon name="cube" size={16} /> 3D</button>
          </nav>
          {tab === 'palette' && <PalettePanel pattern={p} active={active} setActive={setActive} onPalette={onPalette} />}
          {tab === 'details' && <DetailsPanel pattern={p} onChange={(patch) => setPattern({ ...p, ...patch })} onResize={() => setResizing(true)} />}
          {tab === '3d' && (
            <Suspense fallback={<div className="preview3d"><p className="muted">{t('กำลังโหลดภาพ 3 มิติ…', 'Loading 3D view…')}</p></div>}>
              <Preview3D pattern={p} />
            </Suspense>
          )}
        </aside>
      </div>
      {moreOpen && (
        <ToolSheet
          title={t('เครื่องมือเพิ่มเติม', 'More tools')}
          sections={sheetSections}
          onClose={closeMore}
          footer={
            <section>
              <h5>{t('มุมมอง', 'View')}</h5>
              <div className="seg full" role="group" aria-label={t('มุมมอง', 'View')}>
                {VIEWS.map(([v, l]) => (
                  <button key={v} className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>{l}</button>
                ))}
              </div>
            </section>
          }
        />
      )}
      {transfer && <TransferDialog pattern={p} onClose={() => setTransfer(false)} />}
      {order && <OrderRequestDialog pattern={p} onClose={() => setOrder(false)} />}
      {publish && (
        <PublishDialog pattern={p} onClose={() => setPublish(false)}
          // keep the link in the editor's copy too, or the next autosave would drop it
          onPublished={(_, postId) => setPattern((cur) => (cur ? { ...cur, postId } : cur))} />
      )}
      {resizing && (
        <ResizeDialog pattern={p} onClose={() => setResizing(false)} onApply={(next, keepCopy) => {
          if (keepCopy) {
            const now = Date.now();
            savePattern({ ...p, id: uid(), postId: undefined, name: p.name + t(' (ขนาดเดิม)', ' (original size)'), createdAt: now, updatedAt: now });
          }
          snapshotFull();
          current.current = next;
          setPattern(next);
          setResizing(false);
          setTimeout(() => canvas.current?.fit(), 0);
          flash(keepCopy ? t('เปลี่ยนแล้ว · เก็บลายเดิมไว้ในลายของฉัน', 'Done · the original is in My patterns')
            : t('เปลี่ยนแล้ว · กดเลิกทำเพื่อย้อนกลับได้', 'Done · undo to go back'));
        }} />
      )}
      {textDlg && (
        <TextDialog
          pattern={p}
          initialColor={active}
          onClose={() => setTextDlg(false)}
          onApply={(cells, summary) => {
            snapshot();
            setPattern(reconcileProgress({ ...p, cells }, p.cells));
            setTextDlg(false);
            flash(summary);
          }}
        />
      )}
      {imgImport && (
        <ImageImportDialog
          pattern={p}
          initialFile={imgImport.file}
          onClose={() => setImgImport(null)}
          onApply={(cells, palette, summary) => {
            snapshot();
            setPattern(reconcileProgress({ ...p, cells, palette }, p.cells));
            setActive(0);
            setTab('palette');
            setImgImport(null);
            flash(summary);
          }}
        />
      )}
    </div>
  );
}
