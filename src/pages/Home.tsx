import { useEffect, useMemo, useRef, useState } from 'react';
import { StitchArt } from '../components/StitchArt';
import type { Pattern } from '../types';
import { deletePattern, listPatterns, savePattern } from '../lib/storage';
import { normalizePattern } from '../lib/pattern';
import { uid } from '../lib/threads';
import { computeStats } from '../lib/stats';
import { computeProgress } from '../lib/progress';
import { Thumb } from '../components/Thumb';
import { Icon } from '../components/Icon';
import { LogoMark, Wordmark } from '../components/LogoMark';
import { navigate } from '../App';
import { useInstall } from '../lib/pwa';
import { TEMPLATES, templateLabel } from '../lib/templates';
import { t, locale } from '../lib/i18n';
import { LangSwitch } from '../components/LangSwitch';
import { AccountButton } from '../components/AccountButton';
import { SampleGallery } from '../components/SampleGallery';
import { SeasonBanner } from '../components/SeasonBanner';
import { HeroStitch } from '../components/HeroStitch';
import { askConfirm } from '../components/ConfirmDialog';
import { FeedbackLink } from '../components/FeedbackDialog';
import { PATTERNS_PULLED } from '../lib/sync';
import { communityEnabled, listPosts, myLikes, type Post } from '../lib/community';
import { useCloud } from '../lib/cloud';
import { PostCard } from '../components/PostCard';
import { APP_NAME } from '../lib/brand';
import { SAMPLES } from '../lib/samples';

/** the built-in sample as it ships (built once per sample), to tell whether a copy was ever changed */
const shipped = new Map<string, string>();
const shape = (p: Pattern) => JSON.stringify([p.name, p.cols, p.rows, p.mask, p.cells, p.palette.map((c) => c.code ?? c.hex)]);
function sameAsSample(p: Pattern): boolean {
  const s = SAMPLES.find((x) => x.id === p.sampleId);
  if (!s) return false;
  if (!shipped.has(s.id)) shipped.set(s.id, shape(s.make()));
  return shipped.get(s.id) === shape(p);
}

/** a sample or community pattern that was only opened (the old "open = save" behaviour kept it), never started */
function untouchedCopy(p: Pattern): boolean {
  if (p.progress && (p.progress.done.includes('1') || p.progress.seconds > 0)) return false;
  if (p.sampleId) return sameAsSample(p);
  return !!p.remixOf && p.updatedAt - p.createdAt < 5000;
}

const colorCount = (n: number) => t(`${n} สี`, `${n} ${n === 1 ? 'color' : 'colors'}`);

/**
 * Card art drawn from the real heart-keychain template, so every hole sits exactly
 * where the printable model has one. Holes 2+ cells in from the frame are shown
 * stitched in gold, which traces a smaller heart inside.
 */
function TemplateArt() {
  const { cols, rows, mask, depth } = useMemo(() => {
    const t = TEMPLATES.find((x) => x.id === 'keychain-heart')!;
    const r = t.build(14, Math.round((14 * t.h) / t.w));
    // Chebyshev distance of each hole from the nearest non-hole cell
    const n = r.cols * r.rows;
    const d = new Int32Array(n).fill(1e9);
    const queue: number[] = [];
    for (let i = 0; i < n; i++) if (r.mask[i] !== '2') { d[i] = 0; queue.push(i); }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], x = i % r.cols, y = (i / r.cols) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= r.cols || ny >= r.rows) continue;
        const j = ny * r.cols + nx;
        if (d[j] > d[i] + 1) { d[j] = d[i] + 1; queue.push(j); }
      }
    }
    return { ...r, depth: d };
  }, []);
  const s = 6;
  const cells: JSX.Element[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x, k = mask[i];
      if (k === '0') continue;
      const px = x * s, py = y * s;
      // slight overlap hides hairline seams between frame cells
      cells.push(<rect key={'f' + i} x={px - 0.2} y={py - 0.2} width={s + 0.4} height={s + 0.4} fill="#f4f1ea" />);
      if (k !== '2') continue;
      if (depth[i] >= 2) {
        cells.push(
          <g key={'x' + i} stroke="#e9a92c" strokeWidth={1.7} strokeLinecap="round">
            <line x1={px + 1.3} y1={py + 1.3} x2={px + s - 1.3} y2={py + s - 1.3} />
            <line x1={px + s - 1.3} y1={py + 1.3} x2={px + 1.3} y2={py + s - 1.3} stroke="#f6c35a" />
          </g>,
        );
      } else {
        cells.push(<rect key={'h' + i} x={px + 1.6} y={py + 1.6} width={s - 3.2} height={s - 3.2} rx={0.6} fill="#8a8170" />);
      }
    }
  }
  return <svg viewBox={`-3 -3 ${cols * s + 6} ${rows * s + 6}`}>{cells}</svg>;
}

/** The newest community patterns, with a way into the full gallery. */
function CommunityPreview() {
  const cloud = useCloud();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!communityEnabled) return;
    let live = true;
    listPosts({ limit: 4 }).then((r) => { if (live) setPosts(r.posts); }).catch(() => { if (live) setPosts([]); });
    return () => { live = false; };
  }, []);
  // keyed on ids only, so a like being saved isn't overwritten by a re-fetch
  const idKey = (posts ?? []).map((p) => p.id).join(',');
  useEffect(() => {
    if (!idKey) return;
    let live = true;
    myLikes(idKey.split(',')).then((s) => { if (live) setLiked(s); }).catch(() => { /* hearts just show empty */ });
    return () => { live = false; };
  }, [idKey, cloud.user?.id]);
  if (!communityEnabled) return null;
  const onLike = (id: string) => (on: boolean, count: number) => {
    setLiked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
    setPosts((ps) => ps && ps.map((p) => (p.id === id ? { ...p, likeCount: count } : p)));
  };
  return (
    <section className="samples community-strip">
      <div className="section-head">
        <h2>{t('ลายจากชุมชน', 'Community patterns')} <small>{t('ลายที่ผู้ใช้แชร์ · ลองปักหรือแก้เป็นลายของคุณได้', 'Shared by users · stitch them or make them yours')}</small></h2>
        <a className="btn sm ghost" href="#/community"><Icon name="people" size={15} /> {t('ดูทั้งหมด', 'See all')}</a>
      </div>
      {posts && !posts.length ? (
        <a className="community-empty" href="#/community">
          <b>{t('ยังไม่มีลายจากชุมชน', 'No community patterns yet')}</b>
          <span>{t('แชร์ลายของคุณเป็นคนแรก →', 'Be the first to share yours →')}</span>
        </a>
      ) : (
        <div className="sample-grid">
          {(posts ?? []).map((p) => <PostCard key={p.id} post={p} liked={liked.has(p.id)} onLike={onLike(p.id)} />)}
        </div>
      )}
    </section>
  );
}

export function Home() {
  const [items, setItems] = useState<Pattern[]>(() => listPatterns());
  const fileRef = useRef<HTMLInputElement>(null);
  const inst = useInstall();
  const [iosHelp, setIosHelp] = useState(false);
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

  return (
    <div className="home">
      <header className="site-head">
        <a className="brand" href="#/" aria-label={t(`${APP_NAME} หน้าแรก`, `${APP_NAME} home`)}><LogoMark size={34} className="logo-mark" tight /><Wordmark /></a>
        <div className="spacer" />
        {(inst.canPrompt || inst.iosManual) && (
          <button className="btn install-btn" onClick={() => (inst.canPrompt ? inst.install() : setIosHelp(!iosHelp))} title={t('ติดตั้งเป็นแอปบนหน้าจอโฮม ใช้งานได้แม้ออฟไลน์', 'Install as an app on your home screen; works offline')}>
            <Icon name="install" size={16} /> <span className="hide-xs">{t('ติดตั้งแอป', 'Install app')}</span>
          </button>
        )}
        <a className="btn ghost" href="#/guide" title={t('คู่มือการใช้งาน', 'User guide')} aria-label={t('คู่มือการใช้งาน', 'User guide')}><Icon name="book" size={16} /> <span className="hide-sm">{t('คู่มือ', 'Guide')}</span></a>
        <AccountButton />
        <LangSwitch />
      </header>

      {iosHelp && (
        <div className="ios-help">
          <span>{t(<>บน iPhone/iPad: กดปุ่ม <b>แชร์</b> (สี่เหลี่ยมมีลูกศรชี้ขึ้น) ใน Safari แล้วเลือก <b>“เพิ่มไปยังหน้าจอโฮม”</b></>, <>On iPhone/iPad: tap <b>Share</b> (the square with an up arrow) in Safari, then choose <b>“Add to Home Screen”</b></>)}</span>
          <button className="icon-btn sm" onClick={() => setIosHelp(false)} title={t('ปิด', 'Close')}><Icon name="close" size={16} /></button>
        </div>
      )}
      <section className="hero">
        <div className="hero-text">
          <h1>{t(<>ออกแบบลายปัก<br />สำหรับผ้าและชิ้นงานพิมพ์&nbsp;3&nbsp;มิติ</>, <>Design stitch patterns<br />for fabric and 3D prints</>)}</h1>
          <p>{t('เติมสีลงในช่อง วางแผนด้าย เข็ม และขนาดชิ้นงาน แล้วพิมพ์แผนผังหรือแชร์ให้เพื่อนได้ในคลิกเดียว', 'Fill in the cells, plan your threads, needle and finished size, then print the chart or share it with a friend in one click.')}</p>
        </div>
        <HeroStitch />
      </section>

      <SeasonBanner />

      <section className="quick-start">
        <a className="quick-card" href="#/quick">
          <div className="quick-art" aria-hidden="true">
            <span className="qa-photo"><Icon name="image" size={30} /></span>
            <span className="qa-arrow">→</span>
            <span className="qa-grid">{Array.from({ length: 25 }, (_, i) => <i key={i} style={{ background: [6, 7, 8, 11, 12, 13, 16, 17, 18, 2, 22].includes(i) ? (i === 12 ? '#f2b33d' : '#c72b3b') : undefined }} />)}</span>
          </div>
          <div className="quick-text">
            <span className="quick-badge">{t('แนะนำสำหรับมือใหม่', 'Best for beginners')}</span>
            <h3>{t('สร้างลายจากรูป', 'Pattern from a photo')}</h3>
            <p>{t('เลือกผ้าหรือโมเดล ใส่รูป แล้วเลือกแบบที่ชอบ ได้ลายพร้อมปักใน 3 ขั้นตอน', 'Pick fabric or a model, add a photo, choose the result you like: a ready-to-stitch pattern in 3 steps.')}</p>
            <span className="btn primary">{t('เริ่มเลย →', 'Start →')}</span>
          </div>
        </a>
      </section>

      <h2 className="advanced-head">{t('โหมดขั้นสูง', 'Advanced')} <small>{t('ออกแบบเองทุกช่อง', 'design every cell yourself')}</small></h2>
      <section className="mode-cards">
        <a className="mode-card" href="#/new/free">
          <div className="mode-art free" aria-hidden="true">
            {Array.from({ length: 48 }, (_, i) => <i key={i} style={{ background: [3, 4, 10, 11, 12, 13, 17, 18, 19, 20, 21, 22, 25, 26, 27, 28, 29, 30, 34, 35, 36, 37, 43, 44].includes(i) ? '#c72b3b' : undefined }} />)}
          </div>
          <h3>{t('ออกแบบอิสระ', 'Free design')}</h3>
          <p>{t('กำหนดขนาดตารางเอง เหมาะกับผ้า Aida หรือวางแผนลายก่อนเลือกชิ้นงาน', 'Set your own grid size. Great for Aida fabric, or for planning a pattern before you pick a piece.')}</p>
          <span className="go">{t('เริ่มออกแบบ →', 'Start designing →')}</span>
        </a>
        <a className="mode-card" href="#/new/template">
          <div className="mode-art tpl" aria-hidden="true">
            <TemplateArt />
          </div>
          <h3>{t('ใช้โมเดลแม่แบบ', 'Use a template')}</h3>
          <p>{t('เลือกชิ้นงานพิมพ์ 3D ที่มีรูให้ปัก (พวงกุญแจ ที่คั่นหนังสือ ที่รองแก้ว) หรือนำเข้าไฟล์ STL ของคุณ', 'Pick a 3D-printed piece with stitch holes (keychain, bookmark, coaster) or import your own STL file.')}</p>
          <span className="go">{t('เลือกแม่แบบ →', 'Choose a template →')}</span>
        </a>
      </section>

      <SampleGallery />
      <CommunityPreview />

      <section className="my-patterns">
        <div className="section-head">
          <h2>{t('ลายของฉัน', 'My patterns')} <small>{items.length ? t(`${items.length} ลาย · บันทึกไว้ในเบราว์เซอร์นี้`, `${items.length} pattern${items.length === 1 ? '' : 's'} · saved in this browser`) : ''}</small></h2>
          <button className="btn sm ghost" onClick={() => fileRef.current?.click()} title={t('นำเข้าไฟล์ลาย (.json)', 'Import a pattern file (.json)')}><Icon name="upload" size={15} /> {t('นำเข้าไฟล์ลาย', 'Import pattern')}</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
        </div>
        {!items.length && (
          <div className="empty-invite">
            <StitchArt kind="start" />
            <div>
              <h3>{t('เริ่มลายแรกของคุณ', 'Start your first pattern')}</h3>
              <p className="muted">{t('สร้างลายจากรูปที่ชอบ หรือกด “ลองปัก” ลายตัวอย่างด้านบนได้เลย ลายที่ปักหรือแก้จะเก็บไว้ที่นี่', 'Make one from a photo you like, or tap “Stitch it” on a sample above. Patterns you stitch or edit are kept here.')}</p>
              <a className="btn primary" href="#/quick"><Icon name="image" size={16} /> {t('สร้างลายจากรูป', 'Pattern from a photo')}</a>
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

      <footer className="site-foot">
        <span>{APP_NAME} · AppStack Development</span>
        <span className="spacer" />
        <a href="#/guide">{t('คู่มือ', 'Guide')}</a>
        <a href="#/privacy">{t('นโยบายความเป็นส่วนตัว', 'Privacy')}</a>
        <FeedbackLink />
      </footer>
    </div>
  );
}
