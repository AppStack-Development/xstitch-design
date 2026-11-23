import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { LogoMark, Wordmark } from '../components/LogoMark';
import { useInstall } from '../lib/pwa';
import { TEMPLATES } from '../lib/templates';
import { t } from '../lib/i18n';
import { LangSwitch } from '../components/LangSwitch';
import { AccountButton } from '../components/AccountButton';
import { SeasonBanner } from '../components/SeasonBanner';
import { HeroStitch } from '../components/HeroStitch';
import { FeedbackLink } from '../components/FeedbackDialog';
import { communityEnabled, listPosts, myLikes, type Post } from '../lib/community';
import { useCloud } from '../lib/cloud';
import { PostCard } from '../components/PostCard';
import { APP_NAME } from '../lib/brand';
import { Thumb } from '../components/Thumb';
import { listPatterns } from '../lib/storage';
import { computeProgress } from '../lib/progress';
import { PATTERNS_PULLED } from '../lib/sync';
import type { Pattern } from '../types';

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

/** Patterns with stitching started but not finished, most recently touched first. */
function inProgress(): { p: Pattern; pct: number }[] {
  return listPatterns()
    .filter((p) => p.progress && p.progress.done.includes('1'))
    .map((p) => {
      const pr = computeProgress(p);
      return { p, pct: pr.total ? pr.pct : 0, open: pr.done > 0 && pr.done < pr.total };
    })
    .filter((x) => x.open);
}

/**
 * "ปักต่อ": the pattern you were last stitching, one tap back into stitch mode. Only shown when there is one;
 * the rest of your patterns are on the "ของฉัน" page.
 */
function ContinueStitching() {
  const [items, setItems] = useState(inProgress);
  useEffect(() => {
    const on = () => setItems(inProgress());
    window.addEventListener(PATTERNS_PULLED, on);
    return () => window.removeEventListener(PATTERNS_PULLED, on);
  }, []);
  if (!items.length) return null;
  const { p, pct } = items[0];
  const href = `#/stitch/${p.id}`;
  const pctLabel = pct < 1 ? '<1%' : `${Math.floor(pct)}%`;
  return (
    <section className="continue-strip" aria-label={t('ปักต่อ', 'Keep stitching')}>
      <div className="continue-card">
        <a className="continue-thumb" href={href} tabIndex={-1} aria-hidden="true"><Thumb pattern={p} max={64} view="stitch" /></a>
        <div className="continue-text">
          <span className="continue-label">{t('ปักต่อจากที่ค้างไว้', 'Pick up where you left off')}</span>
          <a className="continue-name" href={href}>{p.name}</a>
          <div className="card-progress">
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
            <span>{t(`ปักแล้ว ${pctLabel}`, `${pctLabel} stitched`)}</span>
          </div>
        </div>
        <a className="btn primary continue-go" href={href}><Icon name="needle" size={16} /> {t('ปักต่อ', 'Keep stitching')}</a>
      </div>
      <a className="continue-more" href="#/account">
        {items.length > 1
          ? t(`และอีก ${items.length - 1} ลายที่ปักค้างไว้ · ดูลายของฉัน →`, `${items.length - 1} more in progress · see My patterns →`)
          : t('ดูลายของฉันทั้งหมด →', 'See all my patterns →')}
      </a>
    </section>
  );
}

/** The newest community patterns, with a way into the full gallery. */
function CommunityPreview() {
  const cloud = useCloud();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!communityEnabled) return;
    let live = true;
    listPosts({ limit: 8 }).then((r) => { if (live) setPosts(r.posts); }).catch(() => { if (live) setPosts([]); });
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
  const inst = useInstall();
  const [iosHelp, setIosHelp] = useState(false);

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
      <ContinueStitching />

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

      <CommunityPreview />

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
