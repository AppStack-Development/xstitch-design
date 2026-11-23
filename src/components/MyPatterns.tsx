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
import { communityEnabled, myPosts, unpublish, type Post } from '../lib/community';
import { APP_NAME } from '../lib/brand';
import { navigate } from '../App';
import { t, locale } from '../lib/i18n';
import { Thumb } from './Thumb';
import { Icon } from './Icon';
import { StitchArt } from './StitchArt';
import { askConfirm } from './ConfirmDialog';
import { usePostPattern } from './PostCard';

/** a sample or community pattern that was only opened (the old "open = save" behaviour kept it), never started */
function untouchedCopy(p: Pattern): boolean {
  if (p.progress && (p.progress.done.includes('1') || p.progress.seconds > 0)) return false;
  return (!!p.remixOf || !!p.sampleId) && p.updatedAt - p.createdAt < 5000;
}

const colorCount = (n: number) => t(`${n} สี`, `${n} ${n === 1 ? 'color' : 'colors'}`);
const shortDate = (ms: number) => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: '2-digit' });

type Filter = 'all' | 'working' | 'shared';
/** cards shown at first, and added by each "ดูเพิ่ม" */
const PAGE = 12;
/** one card: a pattern in this browser (maybe shared), or a shared post with no copy here */
type Entry = { key: string; at: number; p: Pattern | null; post: Post | null; shared: boolean };

/**
 * "ลายของฉัน": the patterns kept in this browser (and in the account when signed in) together with the ones
 * you shared to the community. Tabs split "ลายที่ทำ" (not shared) from "ลายที่แชร์"; shared cards carry a badge,
 * their hearts and review status, and a way to take them down. Lives on the "ของฉัน" page (#/account).
 */
export function MyPatterns() {
  const cloud = useCloud();
  const signedIn = cloud.status === 'signed-in';
  const [items, setItems] = useState<Pattern[]>(() => listPatterns());
  /** your posts; null while loading or when signed out */
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => setItems(listPatterns());
  // patterns that arrive from the account (another device) show up without a reload
  useEffect(() => {
    const on = () => setItems(listPatterns());
    window.addEventListener(PATTERNS_PULLED, on);
    return () => window.removeEventListener(PATTERNS_PULLED, on);
  }, []);
  useEffect(() => {
    if (!signedIn || !communityEnabled) { setPosts(null); return; }
    let live = true;
    myPosts().then((ps) => { if (live) setPosts(ps); }).catch((e) => { if (live) { setErr((e as Error).message); setPosts([]); } });
    return () => { live = false; };
  }, [signedIn]);

  // put the two lists together: each pattern once, shared posts without a copy here at the end of their date
  const byId = new Map((posts ?? []).map((x) => [x.id, x]));
  const linked = new Set<string>();
  const entries: Entry[] = items.map((p) => {
    const post = p.postId ? byId.get(p.postId) ?? null : null;
    if (post) linked.add(post.id);
    // before the posts load (or signed out) the link on the pattern is the best guess
    const shared = !!post || (posts === null && !!p.postId);
    return { key: p.id, at: p.updatedAt, p, post, shared };
  });
  for (const post of posts ?? []) {
    if (!linked.has(post.id)) entries.push({ key: 'post:' + post.id, at: Date.parse(post.updatedAt), p: null, post, shared: true });
  }
  entries.sort((a, b) => b.at - a.at);
  const sharedCount = entries.filter((e) => e.shared).length;
  const shown = sharedCount === 0 ? entries
    : entries.filter((e) => filter === 'all' || (filter === 'shared') === e.shared);

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

  const remove = async (p: Pattern, shared: boolean) => {
    const ok = await askConfirm({
      title: t('ลบลายนี้?', 'Delete this pattern?'),
      message: <>
        <p>{t(<><b>“{p.name}”</b> จะถูกลบจากเครื่องนี้ และจากบัญชีของคุณถ้าเข้าสู่ระบบอยู่ กู้คืนไม่ได้</>,
          <><b>“{p.name}”</b> will be deleted from this device, and from your account if you’re signed in. This can’t be undone.</>)}</p>
        {shared && <p>{t('ลายที่แชร์ไว้ในชุมชนยังอยู่ ถ้าจะเอาออกจากชุมชนด้วย กด “ถอนออก” ก่อน',
          'The copy shared in the community stays. To take that down too, use “Take down” first.')}</p>}
      </>,
      ok: t('ลบลาย', 'Delete pattern'),
      tone: 'danger',
    });
    if (!ok) return;
    deletePattern(p.id);
    refresh();
  };

  const takeDown = async (post: Post) => {
    if (!(await askConfirm({
      title: t('ถอนลายออกจากชุมชน?', 'Take it down?'),
      message: <p>{t(<><b>“{post.title}”</b> จะไม่แสดงในชุมชนอีก ลายในเครื่องของคุณยังอยู่ แต่หัวใจทั้งหมดจะหายไป</>,
        <><b>“{post.title}”</b> leaves the community. Your own copy stays, but its likes are lost.</>)}</p>,
      ok: t('ถอนออก', 'Take down'),
      tone: 'danger',
      icon: 'people',
    }))) return;
    setBusy(post.id);
    setErr('');
    try {
      await unpublish(post.id);
      setPosts((ps) => ps && ps.filter((x) => x.id !== post.id));
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const where = signedIn ? t('ซิงก์กับบัญชีแล้ว', 'synced to your account') : t('บันทึกไว้ในเบราว์เซอร์นี้', 'saved in this browser');
  const working = entries.length - sharedCount;
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

      {sharedCount > 0 && (
        <div className="my-patterns-tabs">
          <div className="seg" role="tablist" aria-label={t('แสดงลาย', 'Show')}>
            {([['all', t(`ทั้งหมด ${entries.length}`, `All ${entries.length}`)], ['working', t(`ลายที่ทำ ${working}`, `Working on ${working}`)], ['shared', t(`ลายที่แชร์ ${sharedCount}`, `Shared ${sharedCount}`)]] as [Filter, string][]).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => { setFilter(k); setLimit(PAGE); }}>{label}</button>
            ))}
          </div>
          {filter === 'shared' && <p className="hint">{t('อัปเดตลายที่แชร์ได้จากหน้าแก้ไขลาย ด้วยเมนู ส่งออก / แชร์ → แชร์ในชุมชน', 'To update a shared pattern, open it in the editor and use Export / share → Share with the community.')}</p>}
        </div>
      )}
      {err && <p className="error small">{err}</p>}

      {!items.length && !sharedCount && (
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
      {sharedCount > 0 && !shown.length && (
        <p className="muted">{filter === 'working'
          ? t('ทุกลายของคุณแชร์ไว้แล้ว', 'All your patterns are shared.')
          : t('ยังไม่ได้แชร์ลาย', 'Nothing shared yet.')}</p>
      )}

      <div className="gallery">
        {shown.slice(0, limit).map((e) => e.p
          ? <PatternCard key={e.key} p={e.p} post={e.post} shared={e.shared} signedIn={signedIn} busy={busy === e.post?.id}
              onDuplicate={duplicate} onRemove={remove} onTakeDown={takeDown} />
          : <SharedOnlyCard key={e.key} post={e.post!} busy={busy === e.post!.id} onTakeDown={takeDown} />)}
      </div>
      {shown.length > limit && (
        <div className="community-more my-patterns-more">
          <button className="btn" onClick={() => setLimit((n) => n + PAGE)}>
            {t(`ดูเพิ่ม (อีก ${shown.length - limit} ลาย)`, `Show more (${shown.length - limit} more)`)}
          </button>
        </div>
      )}
    </section>
  );
}

/** "แชร์แล้ว · ♥ 12 · ดูในชุมชน · ถอนออก" under a shared pattern. */
function SharedLine({ post, postId, canTakeDown, busy, onTakeDown }: {
  post: Post | null; postId: string; canTakeDown: boolean; busy: boolean; onTakeDown: (post: Post) => void;
}) {
  return (
    <div className="card-shared">
      {post && <span className="card-likes"><Icon name="heart" size={13} /> {post.likeCount.toLocaleString()}</span>}
      {post?.status === 'hidden' && <span className="shared-hidden">{t('ซ่อนไว้ รอตรวจสอบ', 'Hidden for review')}</span>}
      {post?.status === 'removed' && <span className="shared-hidden">{t('ทีมงานนำออกแล้ว', 'Removed by the team')}</span>}
      <a href={`#/c/${postId}`}>{t('ดูในชุมชน', 'View')}</a>
      {post && canTakeDown && (
        <button type="button" className="link-btn" onClick={() => onTakeDown(post)} disabled={busy}>{busy ? t('กำลังถอน…', 'Removing…') : t('ถอนออก', 'Take down')}</button>
      )}
    </div>
  );
}

function PatternCard({ p, post, shared, signedIn, busy, onDuplicate, onRemove, onTakeDown }: {
  p: Pattern; post: Post | null; shared: boolean; signedIn: boolean; busy: boolean;
  onDuplicate: (p: Pattern) => void; onRemove: (p: Pattern, shared: boolean) => void; onTakeDown: (post: Post) => void;
}) {
  const st = computeStats(p);
  const pr = p.progress ? computeProgress(p) : null;
  const untouched = untouchedCopy(p);
  return (
    <article className={'card' + (shared ? ' is-shared' : '')}>
      <a className="card-thumb" href={`#/edit/${p.id}`} tabIndex={-1} aria-hidden="true">
        <Thumb pattern={p} max={150} view="stitch" />
        {shared && <span className="shared-badge"><Icon name="people" size={12} /> {t('แชร์แล้ว', 'Shared')}</span>}
      </a>
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
        {shared && p.postId && <SharedLine post={post} postId={p.postId} canTakeDown={signedIn} busy={busy} onTakeDown={onTakeDown} />}
        <div className="card-meta">
          {untouched && <span className="untouched-tag" title={t('เปิดดูไว้ ยังไม่ได้ปักหรือแก้ไข ลบได้ถ้าไม่ต้องการ', 'Opened but not stitched or changed yet. Delete it if you don’t want it.')}>{t('ยังไม่ได้เริ่ม', 'Not started')}</span>}
          {untouched ? t('เปิดดู', 'Opened') : t('แก้ไข', 'Edited')} {shortDate(p.updatedAt)}
        </div>
      </div>
      <div className="card-actions">
        <a className="btn sm stitch-btn" href={`#/stitch/${p.id}`} title={t('โหมดปัก', 'Stitch mode')}><Icon name="needle" size={15} /> {pr && pr.done > 0 ? t('ปักต่อ', 'Continue') : t('เริ่มปัก', 'Stitch')}</a>
        <span className="spacer" />
        <a className="icon-btn sm" href={`#/print/${p.id}`} title={t('พิมพ์', 'Print')}><Icon name="print" size={16} /></a>
        <button className="icon-btn sm" onClick={() => onDuplicate(p)} title={t('ทำสำเนา', 'Duplicate')}><Icon name="copy" size={16} /></button>
        <button className="icon-btn sm" title={t('ลบ', 'Delete')} onClick={() => onRemove(p, shared)}>
          <Icon name="trash" size={16} />
        </button>
      </div>
    </article>
  );
}

/** A post you shared that has no copy in this browser (e.g. the copy was deleted): opens the post. */
function SharedOnlyCard({ post, busy, onTakeDown }: { post: Post; busy: boolean; onTakeDown: (post: Post) => void }) {
  const p = usePostPattern(post);
  const href = `#/c/${post.id}`;
  return (
    <article className="card is-shared">
      <a className="card-thumb" href={href} tabIndex={-1} aria-hidden="true">
        {p ? <Thumb pattern={p} max={150} view="stitch" /> : <span className="post-wait" />}
        <span className="shared-badge"><Icon name="people" size={12} /> {t('แชร์แล้ว', 'Shared')}</span>
      </a>
      <div className="card-body">
        <a className="card-title" href={href}>{post.title}</a>
        <div className="card-meta">
          {post.base === 'aida' ? t('บนผ้า', 'Fabric') : t('ชิ้นงาน 3D', '3D print')} · {post.cols}×{post.rows} · {colorCount(post.colors)}
        </div>
        <SharedLine post={post} postId={post.id} canTakeDown busy={busy} onTakeDown={onTakeDown} />
        <div className="card-meta">{t(`แชร์ ${shortDate(Date.parse(post.createdAt))} · ไม่มีในเครื่องนี้`, `Shared ${shortDate(Date.parse(post.createdAt))} · not on this device`)}</div>
      </div>
      <div className="card-actions">
        <a className="btn sm" href={href}><Icon name="people" size={15} /> {t('เปิดในชุมชน', 'Open')}</a>
        <span className="spacer" />
      </div>
    </article>
  );
}
