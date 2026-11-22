import { useEffect, useMemo, useState } from 'react';
import type { Pattern } from '../types';
import { computeStats, fmtInch, fmtMm } from '../lib/stats';
import { BASE_LABEL, DIFFICULTY_LABEL, STITCH_LABEL } from '../lib/pattern';
import { contrastText } from '../lib/threads';
import { ChartSVG, type ChartMode } from '../components/ChartSVG';
import { Thumb } from '../components/Thumb';
import { Icon } from '../components/Icon';
import { ownsThread, shoppingListText, threadNeeds, useStash } from '../lib/stash';
import { t, locale } from '../lib/i18n';
import { templateLabel } from '../lib/templates';
import { fabricDef, fabricLabel } from '../lib/fabrics';
import { APP_NAME } from '../lib/brand';
import { Wordmark } from '../components/LogoMark';

interface Props {
  pattern: Pattern;
  backHref?: string;
  onBack?: () => void;
}

export function PrintView({ pattern: p, backHref = '#/', onBack }: Props) {
  const [mode, setMode] = useState<ChartMode>('both');
  const [perPage, setPerPage] = useState(40);
  const stats = useMemo(() => computeStats(p), [p]);
  const { codes } = useStash();
  // "To buy" only means something once the user has recorded some threads
  const buy = useMemo(() => (codes.size ? threadNeeds(p, codes).buy : []), [p, codes]);
  const [copied, setCopied] = useState(false);
  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(shoppingListText(p.name, buy, t('ด้ายที่ต้องซื้อ', 'Threads to buy')));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked: nothing to do */ }
  };

  // A4 is 210 mm (~794 px) wide: scale the on-screen sheets down on narrow screens
  useEffect(() => {
    // clientWidth is the layout viewport; on phones innerWidth grows with wide content
    const fit = () => document.documentElement.style.setProperty('--sheet-zoom', String(Math.min(1, (document.documentElement.clientWidth - 16) / 794)));
    fit();
    window.addEventListener('resize', fit);
    return () => {
      window.removeEventListener('resize', fit);
      document.documentElement.style.removeProperty('--sheet-zoom');
    };
  }, []);
  const d = p.details;
  const used = stats.colors.filter((c) => c.count > 0);
  const area = stats.piece ?? { x0: 0, y0: 0, x1: p.cols - 1, y1: p.rows - 1 };

  // split the chart into A4-sized pages
  const pageCols = perPage, pageRows = Math.round(perPage * 1.35);
  const pages: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (let y = area.y0; y <= area.y1; y += pageRows) {
    for (let x = area.x0; x <= area.x1; x += pageCols) {
      pages.push({ x0: x, y0: y, x1: Math.min(area.x1 + 1, x + pageCols), y1: Math.min(area.y1 + 1, y + pageRows) });
    }
  }
  const spanW = Math.min(pageCols, area.x1 - area.x0 + 1), spanH = Math.min(pageRows, area.y1 - area.y0 + 1);
  const cellMm = Math.min(7, 178 / (spanW + 3), 240 / (spanH + 3));

  const rows: [string, string][] = [
    [t('ขนาดชิ้นงาน', 'Finished size'), `${fmtMm(stats.widthMm)} × ${fmtMm(stats.heightMm)} (${fmtInch(stats.widthMm)} × ${fmtInch(stats.heightMm)})`],
    [t('ตาราง', 'Grid'), t(`${p.cols} × ${p.rows} ช่อง · ระยะห่าง ${p.pitchMm.toFixed(2)} มม.`, `${p.cols} × ${p.rows} cells · ${p.pitchMm.toFixed(2)} mm pitch`)],
    [t('จำนวนฝีเข็ม', 'Stitches'), t(`${stats.total.toLocaleString()} ฝีเข็ม · ${used.length} สี`, `${stats.total.toLocaleString()} stitches · ${used.length} ${used.length === 1 ? 'color' : 'colors'}`)],
    [t('พื้นที่ปัก', 'Stitched on'), d.baseType === 'aida' ? fabricLabel(d) : BASE_LABEL[d.baseType] + (p.templateName ? ` — ${templateLabel(p.templateName)}` : '')],
    ...(d.baseType === 'aida' ? [(() => {
      const m = fabricDef(d.fabric).marginCm, cut = (mm: number) => Math.ceil(mm / 10 + 2 * m);
      return [t('ผ้าที่ต้องเตรียม', 'Fabric to cut'), t(`${cut(stats.widthMm)} × ${cut(stats.heightMm)} ซม. (เผื่อขอบข้างละ ${m} ซม.)`, `${cut(stats.widthMm)} × ${cut(stats.heightMm)} cm (${m} cm extra all round)`)] as [string, string];
    })()] : []),
    ...(d.baseType === 'print3d' ? [[t('ชิ้นงาน 3D', '3D piece'), t(`${d.filament}, หนา ${d.thicknessMm} มม., รู ${(p.pitchMm * d.holeRatio).toFixed(2)} มม.`, `${d.filament}, ${d.thicknessMm} mm thick, ${(p.pitchMm * d.holeRatio).toFixed(2)} mm holes`)] as [string, string]] : []),
    [t('รูปแบบการปัก', 'Stitch type'), STITCH_LABEL[d.stitchType]],
    [t('ด้าย', 'Thread'), t(`${d.threadBrand || '-'} · ใช้ ${d.strands} เส้น`, `${d.threadBrand || '-'} · ${d.strands} ${d.strands === 1 ? 'strand' : 'strands'}`)],
    [t('เข็ม', 'Needle'), `${d.needleType} ${d.needleSize}`],
    [t('ระดับความยาก', 'Difficulty'), DIFFICULTY_LABEL[d.difficulty] + (d.estHours ? t(` · ประมาณ ${d.estHours}`, ` · about ${d.estHours}`) : '')],
  ];

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        {onBack
          ? <button className="btn ghost" onClick={onBack}><Icon name="back" size={16} /> {t('กลับ', 'Back')}</button>
          : <a className="btn ghost" href={backHref}><Icon name="back" size={16} /> {t('กลับ', 'Back')}</a>}
        <div className="seg">
          {([['both', t('สี + สัญลักษณ์', 'Color + symbol')], ['symbol', t('สัญลักษณ์ (ขาวดำ)', 'Symbols (B&W)')], ['color', t('สีอย่างเดียว', 'Color only')]] as const).map(([v, l]) => (
            <button key={v} className={mode === v ? 'on' : ''} onClick={() => setMode(v)}>{l}</button>
          ))}
        </div>
        <label className="inline">{t('ช่องต่อหน้า', 'Cells per page')}
          <select value={perPage} onChange={(e) => setPerPage(+e.target.value)}>
            {[25, 30, 40, 50, 60].map((n) => <option key={n} value={n}>{t(`${n} คอลัมน์`, `${n} columns`)}</option>)}
          </select>
        </label>
        <span className="muted">{t(`${pages.length + 1} หน้า (A4)`, `${pages.length + 1} pages (A4)`)}</span>
        {buy.length > 0 && (
          <button className="btn sm ghost" onClick={copyList} title={t('คัดลอกรายการด้ายที่ต้องซื้อ ไปวางใน LINE หรือโน้ต', 'Copy the threads to buy, to paste into a chat or notes')}>
            <Icon name={copied ? 'check' : 'copy'} size={15} /> {copied ? t('คัดลอกแล้ว', 'Copied') : t(`รายการต้องซื้อ (${buy.length})`, `To buy (${buy.length})`)}
          </button>
        )}
        <div className="spacer" />
        <button className="btn primary" onClick={() => window.print()}><Icon name="print" size={16} /> {t('พิมพ์ / บันทึก PDF', 'Print / save PDF')}</button>
      </div>

      <div className="sheet">
        <header className="sheet-head">
          <div>
            <h1>{p.name}</h1>
            <p className="muted">
              {d.author && <>{t('ออกแบบโดย', 'Designed by')} {d.author} · </>}
              {new Date(p.updatedAt).toLocaleDateString(locale, { dateStyle: 'long' })}
              {d.tags.length > 0 && <> · {d.tags.map((tag) => '#' + tag).join(' ')}</>}
            </p>
          </div>
          <Wordmark className="sheet-brand" />
        </header>
        <div className="sheet-cover">
          <div className="sheet-thumb"><Thumb pattern={p} max={260} view="stitch" /></div>
          <table className="info-table"><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
        </div>
        {d.description && <p className="sheet-desc">{d.description}</p>}
        <h3>{t('รายการด้าย', 'Thread list')}</h3>
        <table className="legend-table">
          <thead><tr><th>{t('สัญลักษณ์', 'Symbol')}</th><th>{t('ยี่ห้อ / รหัส', 'Brand / code')}</th><th>{t('ชื่อสี', 'Color name')}</th><th>{t('ฝีเข็ม', 'Stitches')}</th><th>{t('ความยาว*', 'Length*')}</th><th>{t('ไจ', 'Skeins')}</th><th>✓</th></tr></thead>
          <tbody>
            {used.map((c) => {
              const thr = p.palette[c.index];
              return (
                <tr key={thr.id}>
                  <td><span className="sym" style={{ background: mode === 'symbol' ? '#fff' : thr.hex, color: mode === 'symbol' ? '#111' : contrastText(thr.hex) }}>{thr.symbol}</span></td>
                  <td>{[thr.brand, thr.code].filter(Boolean).join(' ') || '-'}{codes.size > 0 && ownsThread(codes, thr) && <b className="own-mark" title={t('มีแล้ว', 'Have')}> ✓</b>}</td>
                  <td>{thr.name}</td>
                  <td>{c.count.toLocaleString()}</td>
                  <td>{c.strandM.toFixed(1)} {t('ม.', 'm')}</td>
                  <td>{Math.max(0.1, c.skeins).toFixed(1)}</td>
                  <td><span className="checkbox" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {buy.length > 0 && (
          <p className="to-buy">
            <b>{t(`ต้องซื้อ ${buy.length} สี:`, `To buy (${buy.length}):`)}</b>{' '}
            {buy.map((n, i) => (
              <span key={n.thread.id}>
                {i > 0 && ', '}
                {[n.thread.brand, n.thread.code].filter(Boolean).join(' ') || n.thread.name} × {Math.max(1, Math.ceil(n.skeins))}
              </span>
            ))}
            {' '}<small>{t('(ไจ)', '(skeins)')}</small>
          </p>
        )}
        {codes.size > 0 && used.length > 0 && buy.length === 0 && (
          <p className="to-buy all">✓ {t('มีด้ายครบทุกสีแล้ว ไม่ต้องซื้อเพิ่ม', 'You have every thread for this pattern')}</p>
        )}
        <p className="hint">{t(<>{codes.size > 0 && <>✓ หลังรหัส = มีด้ายนี้แล้ว · </>}*ความยาวด้ายเส้นเดี่ยวรวม ({d.strands} เส้น) โดยประมาณ เผื่อเก็บปลาย 20% · 1 ไจ = 8 ม. × 6 เส้น · ▲ สีแดง = จุดกึ่งกลาง · ช่องลายเฉียง = โครงทึบ</>, <>{codes.size > 0 && <>✓ after the code = you have this thread · </>}*Approx. total single-strand length ({d.strands} strands), plus 20% for finishing ends · 1 skein = 8 m × 6 strands · red ▲ = center · hatched cells = solid frame</>)}</p>
        {d.notes && (
          <>
            <h3>{t('บันทึก / ขั้นตอน', 'Notes / steps')}</h3>
            <p className="sheet-notes">{d.notes}</p>
          </>
        )}
      </div>

      {pages.map((pg, i) => (
        <div className="sheet chart-sheet" key={i}>
          <header className="sheet-head small">
            <b>{p.name}</b>
            <span className="muted">{t(<>แผนผังหน้า {i + 1}/{pages.length} · คอลัมน์ {pg.x0 + 1}–{pg.x1} · แถว {pg.y0 + 1}–{pg.y1}</>, <>Chart page {i + 1}/{pages.length} · columns {pg.x0 + 1}–{pg.x1} · rows {pg.y0 + 1}–{pg.y1}</>)}</span>
          </header>
          <ChartSVG pattern={p} {...pg} cellMm={cellMm} mode={mode} />
          <div className="chart-legend">
            {used.map((c) => {
              const thr = p.palette[c.index];
              return (
                <span key={thr.id}>
                  <span className="sym sm" style={{ background: mode === 'symbol' ? '#fff' : thr.hex, color: mode === 'symbol' ? '#111' : contrastText(thr.hex) }}>{thr.symbol}</span>
                  {thr.code || thr.name}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
