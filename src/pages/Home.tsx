import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { LogoMark, Wordmark } from '../components/LogoMark';
import { useInstall } from '../lib/pwa';
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

/** What the site does, in plain words: each tile says one thing you can do and takes you there. */
const FEATURES: { icon: string; title: () => string; text: () => string; href: string; go: () => string; tag?: () => string }[] = [
  {
    icon: 'image', href: '#/quick',
    title: () => t('สร้างลายจากรูป', 'Turn a photo into a pattern'),
    text: () => t('ใส่รูปที่ชอบ เลือกผ้าหรือชิ้นงาน แล้วเลือกแบบที่ชอบ ได้ลายพร้อมปักใน 3 ขั้นตอน', 'Add a photo, pick fabric or a piece, choose the result you like: ready to stitch in 3 steps.'),
    go: () => t('เริ่มเลย', 'Start'),
    tag: () => t('แนะนำสำหรับมือใหม่', 'Best for beginners'),
  },
  {
    icon: 'grid', href: '#/new/free',
    title: () => t('ออกแบบลายเองทีละช่อง', 'Design your own, cell by cell'),
    text: () => t('วาดลายบนตาราง เลือกสีด้าย DMC กำหนดขนาดเอง เหมาะกับผ้า Aida', 'Draw on a grid with DMC thread colors at the size you want. Great for Aida fabric.'),
    go: () => t('เริ่มออกแบบ', 'Start designing'),
  },
  {
    icon: 'cube', href: '#/new/template',
    title: () => t('ปักบนชิ้นงานพิมพ์ 3D', 'Stitch on 3D-printed pieces'),
    text: () => t('เลือกแม่แบบที่มีรูให้ปัก เช่น พวงกุญแจ ที่คั่นหนังสือ ฝากล่อง หรือนำเข้าไฟล์ STL ของคุณ', 'Pick a piece with stitch holes, like a keychain, bookmark or box lid, or import your own STL file.'),
    go: () => t('เลือกแม่แบบ', 'Choose a template'),
  },
  {
    icon: 'needle', href: '#/guide/stitch',
    title: () => t('ปักตามลาย ไม่หลง', 'Stitch along without losing your place'),
    text: () => t('โหมดปักให้ติ๊กช่องที่ปักแล้ว จำว่าค้างไว้ตรงไหน เปิดบนมือถือวางข้างงานปักได้', 'Stitch mode ticks off what you’ve stitched and remembers where you stopped. Prop your phone next to your work.'),
    go: () => t('ดูวิธีใช้', 'How it works'),
  },
  {
    icon: 'print', href: '#/guide/export',
    title: () => t('พิมพ์แผนผังและรายการด้าย', 'Print the chart and thread list'),
    text: () => t('พิมพ์ลายพร้อมสัญลักษณ์สี และรู้ว่าต้องใช้ด้ายสีไหน กี่ช่อง', 'Print the chart with color symbols and see which threads you need, and how much.'),
    go: () => t('ดูวิธีใช้', 'How it works'),
  },
  {
    icon: 'people', href: '#/community',
    title: () => t('ลายจากชุมชน และสั่งทำ', 'Community patterns, and having one made'),
    text: () => t('เลือกลายที่คนอื่นแชร์มาปัก แชร์ลายของคุณ หรือสั่งร้านทำชิ้นงานให้', 'Stitch a pattern someone shared, share your own, or order a shop to make it for you.'),
    go: () => t('ดูลายจากชุมชน', 'Browse patterns'),
  },
];

function Features() {
  return (
    <section className="features" aria-labelledby="features-title">
      <h2 id="features-title">{t('ทำอะไรได้บ้าง', 'What you can do here')}</h2>
      <div className="feature-grid">
        {FEATURES.map((f) => (
          <a key={f.href} className="feature-card" href={f.href}>
            <span className="feature-ico" aria-hidden="true"><Icon name={f.icon} size={22} /></span>
            <span className="feature-text">
              {f.tag && <span className="feature-tag">{f.tag()}</span>}
              <b>{f.title()}</b>
              <span>{f.text()}</span>
              <span className="feature-go">{f.go()} →</span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
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
          <h1>{t(<>ทำลายปักครอสติช<br />ของคุณเอง</>, <>Make your own<br />cross-stitch patterns</>)}</h1>
          <p>{t('เปลี่ยนรูปเป็นลายปัก ออกแบบเองทีละช่อง หรือเลือกลายที่คนอื่นแชร์ แล้วปักบนผ้าหรือชิ้นงานพิมพ์ 3D ได้เลย ใช้ฟรี ไม่ต้องสมัคร',
            'Turn a photo into a pattern, design one cell by cell, or pick one someone shared, then stitch it on fabric or a 3D-printed piece. Free, no sign-up.')}</p>
          <div className="btn-row hero-actions">
            <a className="btn primary" href="#/quick"><Icon name="image" size={16} /> {t('สร้างลายจากรูป', 'Pattern from a photo')}</a>
            <a className="btn" href="#/community"><Icon name="people" size={16} /> {t('ดูลายจากชุมชน', 'Browse patterns')}</a>
          </div>
        </div>
        <HeroStitch />
      </section>

      <Features />

      <SeasonBanner />



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
