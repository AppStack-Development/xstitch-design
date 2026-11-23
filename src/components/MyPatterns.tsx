import { useEffect, useRef, useState } from 'react';
import type { Pattern } from '../types';
import { deletePattern, listPatterns, savePattern } from '../lib/storage';
import { normalizePattern } from '../lib/pattern';
import { uid } from '../lib/threads';
import { computeStats } from '../lib/stats';
import { computeProgress } from '../lib/progress';
import { templateLabel } from '../lib/templates';
import { PATTERNS_PULLED } from '../lib/sync';
import { useCloud } from '../lib/cloud';
import { APP_NAME } from '../lib/brand';
import { navigate } from '../App';
import { t, locale } from '../lib/i18n';
import { Thumb } from './Thumb';
import { Icon } from './Icon';
import { StitchArt } from './StitchArt';
import { askConfirm } from './ConfirmDialog';

/** a sample or community pattern that was only opened (the old "open = save" behaviour kept it), never started */
function untouchedCopy(p: Pattern): boolean {
  if (p.progress && (p.progress.done.includes('1') || p.progress.seconds > 0)) return false;
  return (!!p.remixOf || !!p.sampleId) && p.updatedAt - p.createdAt < 5000;
}

const colorCount = (n: number) => t(`${n} สี`, `${n} ${n === 1 ? 'color' : 'colors'}`);

/**
 * "ลายของฉัน": the patterns kept in this browser (and in the account when signed in), with stitch, print,
 * duplicate, delete and import. Lives on the "ของฉัน" page (#/account); works signed in or not.
 */
export function MyPatterns() {
  const cloud = useCloud();
  const [items, setItems] = useState<Pattern[]>(() => listPatterns());
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => setItems(listPatterns());
  // patterns that arrive from the account (another device) show up without a reload
  useEffect(() => {
    const on = () => setItems(listPatterns());
    window.addEventListener(PATTERNS_PULLED, on);
    return () => window.removeEventListener(PATTERNS_PULLED, on);
  }, []);

  const importFile = async (f: File) => {
    try {
      let raw: unknown;
      try {
        raw = JSON.parse(await f.text());
      } catch {
        throw new Error(t(`ไฟล์นี้ไม่ใช่ไฟล์ลาย (.json) ที่ส่งออกจาก ${APP_NAME}`, `This is not a pattern file (.json) exported from ${APP_NAME}`));
      }
      const p = normalizePattern(raw);
      const copy = { ...p, id: uid(), postId: undefined, updatedAt: Date.now() };
      savePattern(copy);
      navigate(`#/edit/${copy.id}`);
    } catch (e) {
      alert(t('นำเข้าไม่สำเร็จ: ', 'Import failed: ') + (e as Error).message);
    }
  };

  const duplicate = async (p: Pattern) => {
    const name = p.name + t(' (สำเนา)', ' (copy)');
    const pr = computeProgress(p);
    const ok = await askConfirm({
      title: t('ทำสำเนาลายนี้?', 'Duplicate this pattern?'),
      message: <>
        <p>{t(<>จะได้ลายใหม่ชื่อ <b>“{name}”</b> ในรายการลายของฉัน ลายเดิมไม่เปลี่ยน</>, <>You’ll get a new pattern, <b>“{name}”</b>, in My patterns. The original stays as it is.</>)}</p>
        {pr.done > 0 && <p>{t(`ความคืบหน้าการปัก (${Math.round(pr.pct)}%) คัดลอกไปด้วย`, `Its stitching progress (${Math.round(pr.pct)}%) is copied too.`)}</p>}
      </>,
      ok: t('ทำสำเนา', 'Duplicate'),
      icon: 'copy',
    });
    if (!ok) return;
    // a copy is not the shared post itself
    savePattern({ ...p, id: uid(), postId: undefined, name, createdAt: Date.now(), updatedAt: Date.now() });
    refresh();
  };

  const remove = async (p: Pattern) => {
    const ok = await askConfirm({
      title: t('ลบลายนี้?', 'Delete this pattern?'),
      message: <p>{t(<><b>“{p.name}”</b> จะถูกลบจากเครื่องนี้ และจากบัญชีของคุณถ้าเข้าสู่ระบบอยู่ กู้คืนไม่ได้</>,
        <><b>“{p.name}”</b> will be deleted from this device, and from your account if you’re signed in. This can’t be undone.</>)}</p>,
      ok: t('ลบลาย', 'Delete pattern'),
      tone: 'danger',
    });
    if (!ok) return;
    deletePattern(p.id);
    refresh();
  };

  const where = cloud.status === 'signed-in' ? t('ซิงก์กับบัญชีแล้ว', 'synced to your account') : t('บันทึกไว้ในเบราว์เซอร์นี้', 'saved in this browser');
  return (
    <section className="my-patterns">
      <div className="section-head">
        <h2>{t('ลายของฉัน', 'My patterns')} <small>{items.length ? t(`${items.length} ลาย · ${where}`, `${items.length} pattern${items.length === 1 ? '' : 's'} · ${where}`) : ''}</small></h2>
        <div className="my-patterns-actions">
          <button className="btn sm ghost" onClick={() => fileRef.current?.click()} title={t('นำเข้าไฟล์ลาย (.json)', 'Import a pattern file (.json)')}><Icon name="upload" size={15} /> {t('นำเข้าไฟล์ลาย', 'Import pattern')}</button>
          {items.length > 0 && <a className="btn sm" href="#/quick"><Icon name="plus" size={15} /> {t('ลายใหม่', 'New pattern')}</a>}
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
      </div>
      {!items.length && (
        <div className="empty-invite">
          <StitchArt kind="start" />
          <div>
            <h3>{t('เริ่มลายแรกของคุณ', 'Start your first pattern')}</h3>
            <p className="muted">{t('สร้างลายจากรูปที่ชอบ หรือเลือกลายจากชุมชนมาลองปัก ลายที่ปักหรือแก้จะเก็บไว้ที่นี่',
              'Make one from a photo you like, or pick a community pattern to stitch. Patterns you stitch or edit are kept here.')}</p>
            <div className="btn-row">
              <a className="btn primary" href="#/quick"><Icon name="image" size={16} /> {t('สร้างลายจากรูป', 'Pattern from a photo')}</a>
              <a className="btn" href="#/community"><Icon name="people" size={16} /> {t('ดูลายจากชุมชน', 'Browse the community')}</a>
            </div>
          </div>
        </div>
      )}
      <div className="gallery">
        {items.map((p) => {
          const st = computeStats(p);
          const pr = p.progress ? computeProgress(p) : null;
          const untouched = untouchedCopy(p);
          return (
            <article key={p.id} className="card">
              <a className="card-thumb" href={`#/edit/${p.id}`} tabIndex={-1} aria-hidden="true"><Thumb pattern={p} max={150} view="stitch" /></a>
              <div className="card-body">
                <a className="card-title" href={`#/edit/${p.id}`}>{p.name}</a>
                <div className="card-meta">
                  {templateLabel(p.templateName) ?? t('ออกแบบอิสระ', 'Free design')} · {p.cols}×{p.rows} · {colorCount(st.colors.filter((c) => c.count).length)}
                </div>
                {pr && pr.total > 0 && (
                  <div className="card-progress" title={t(`ปักแล้ว ${pr.done}/${pr.total} ฝีเข็ม`, `${pr.done}/${pr.total} stitches done`)}>
                    <div className="bar"><i style={{ width: `${pr.pct}%` }} /></div>
                    <span>{pr.done === pr.total ? t('ปักเสร็จแล้ว ✓', 'Finished ✓') : t(`ปักแล้ว ${Math.floor(pr.pct)}%`, `${Math.floor(pr.pct)}% stitched`)}</span>
                  </div>
                )}
                <div className="card-meta">
                  {untouched && <span className="untouched-tag" title={t('เปิดดูไว้ ยังไม่ได้ปักหรือแก้ไข ลบได้ถ้าไม่ต้องการ', 'Opened but not stitched or changed yet. Delete it if you don’t want it.')}>{t('ยังไม่ได้เริ่ม', 'Not started')}</span>}
                  {untouched ? t('เปิดดู', 'Opened') : t('แก้ไข', 'Edited')} {new Date(p.updatedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: '2-digit' })}
                </div>
              </div>
              <div className="card-actions">
                <a className="btn sm stitch-btn" href={`#/stitch/${p.id}`} title={t('โหมดปัก', 'Stitch mode')}><Icon name="needle" size={15} /> {pr && pr.done > 0 ? t('ปักต่อ', 'Continue') : t('เริ่มปัก', 'Stitch')}</a>
                <span className="spacer" />
                <a className="icon-btn sm" href={`#/print/${p.id}`} title={t('พิมพ์', 'Print')}><Icon name="print" size={16} /></a>
                <button className="icon-btn sm" onClick={() => duplicate(p)} title={t('ทำสำเนา', 'Duplicate')}><Icon name="copy" size={16} /></button>
                <button className="icon-btn sm" title={t('ลบ', 'Delete')} onClick={() => remove(p)}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
