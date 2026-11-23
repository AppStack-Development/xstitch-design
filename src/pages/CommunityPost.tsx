import { useEffect, useState } from 'react';
import { StitchArt } from '../components/StitchArt';
import { StitchLoader } from '../components/StitchLoader';
import { findDraft, putDraft } from '../lib/drafts';
import { buildCopy, getPost, localCopyOf, myLikes, postShareUrl, reportPost, takeCopy, tagLabel, communityEnabled, type Post, type ReportReason } from '../lib/community';
import { useCloud } from '../lib/cloud';
import { useStash } from '../lib/stash';
import { computeStats } from '../lib/stats';
import { contrastText } from '../lib/threads';
import { DIFFICULTY_LABEL } from '../lib/pattern';
import { buildPlate, toBinaryStl } from '../lib/plate';
import { downloadBlob, safeFilename } from '../lib/share';
import { trackStep } from '../lib/analytics';
import { t, locale } from '../lib/i18n';
import { modelOf, templateLabel } from '../lib/templates';
import { navigate } from '../App';
import { Thumb } from '../components/Thumb';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { AccountButton } from '../components/AccountButton';
import { AuthorName, LikeButton, usePostPattern } from '../components/PostCard';
import { PrintView } from './PrintView';
import { OrderRequestDialog } from '../components/OrderRequestDialog';
import { baht, ordersEnabled } from '../lib/orders';
import { postQuotes } from '../lib/shops';
import { SellPostPanel } from '../components/SellPostPanel';
import { fabricLabel } from '../lib/fabrics';

const REPORTED_KEY = 'sbs:reported';
const reported = (): string[] => { try { return JSON.parse(localStorage.getItem(REPORTED_KEY) || '[]'); } catch { return []; } };

/** One shared pattern: preview, threads, stitch it / make it your own, like, report. */
export function CommunityPost({ id }: { id: string }) {
  const cloud = useCloud();
  const stash = useStash();
  const [post, setPost] = useState<Post | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [err, setErr] = useState('');
  const [liked, setLiked] = useState(false);
  const [origin, setOrigin] = useState<Post | null>(null);
  const [busy, setBusy] = useState<'stitch' | 'copy' | null>(null);
  const [printing, setPrinting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ordering, setOrdering] = useState(false);
  // the cheapest price the author's shop sells this pattern for (null = not sold by its author)
  const [authorFrom, setAuthorFrom] = useState<number | null>(null);
  const p = usePostPattern(post);

  useEffect(() => {
    if (!communityEnabled) { setState('missing'); return; }
    let live = true;
    getPost(id)
      .then((x) => { if (!live) return; setPost(x); setState(x ? 'ready' : 'missing'); })
      .catch((e) => { if (!live) return; setErr((e as Error).message); setState('error'); });
    return () => { live = false; };
  }, [id]);

  useEffect(() => {
    if (!post || !ordersEnabled) return;
    let live = true;
    postQuotes(post.id).then((offers) => {
      if (!live) return;
      const all = offers.flatMap((o) => Object.values(o.prices) as number[]);
      setAuthorFrom(all.length ? Math.min(...all) : null);
    }).catch(() => { /* no price shown */ });
    return () => { live = false; };
  }, [post?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!post) return;
    let live = true;
    myLikes([post.id]).then((s) => { if (live) setLiked(s.has(post.id)); }).catch(() => { /* shows not liked */ });
    return () => { live = false; };
  }, [post?.id, cloud.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // "adapted from …" credit
  useEffect(() => {
    if (!post?.remixOf) { setOrigin(null); return; }
    let live = true;
    getPost(post.remixOf).then((o) => { if (live) setOrigin(o); }).catch(() => { /* credit is optional */ });
    return () => { live = false; };
  }, [post?.remixOf]);

  if (state === 'loading') return <div className="empty-state"><StitchLoader label={t('กำลังเปิดลาย…', 'Opening pattern…')} /></div>;
  if (state === 'error') {
    return (
      <div className="empty-state">
        <h2>{t('เปิดลายไม่สำเร็จ', 'Couldn’t open this pattern')}</h2>
        <p className="muted">{err}</p>
        <button className="btn primary" onClick={() => location.reload()}><Icon name="sync" size={16} /> {t('ลองอีกครั้ง', 'Try again')}</button>
      </div>
    );
  }
  if (state === 'missing' || !post) {
    return (
      <div className="empty-state">
        <StitchArt kind="lost" />
        <h2>{t('ไม่พบลายนี้', 'Pattern not found')}</h2>
        <p className="muted">{t('ผู้ออกแบบอาจถอนลายออกแล้ว', 'The designer may have taken it down.')}</p>
        <a className="btn primary" href="#/community">{t('ดูลายอื่นในชุมชน', 'Browse community patterns')}</a>
      </div>
    );
  }
  if (printing && p) return <PrintView pattern={p} onBack={() => setPrinting(false)} />;

  const mine = cloud.user?.id === post.author.id;
  const existing = localCopyOf(post.id);
  const stats = p ? computeStats(p) : null;
  const used = stats ? stats.colors.filter((c) => c.count > 0) : [];
  const have = used.filter((c) => p && stash.codes.has(p.palette[c.index].code ?? '')).length;

  const stitch = async () => {
    setBusy('stitch');
    try {
      // "Stitch it" tries the pattern as a draft; it joins My patterns at the first stitch (lib/drafts.ts)
      let copy = existing ?? findDraft((x) => x.remixOf?.id === post.id);
      if (!copy) { copy = await buildCopy(post); putDraft(copy); }
      trackStep('/c/stitch');
      navigate(`#/stitch/${copy.id}`);
    } catch (e) {
      alert((e as Error).message);
      setBusy(null);
    }
  };
  const remix = async () => {
    setBusy('copy');
    try {
      const copy = await takeCopy(post);
      trackStep('/c/remix');
      navigate(`#/edit/${copy.id}`);
    } catch (e) {
      alert((e as Error).message);
      setBusy(null);
    }
  };
  const copyLink = async () => {
    const url = postShareUrl(post.id);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt(t('คัดลอกลิงก์นี้', 'Copy this link'), url);
    }
  };
  // 3D pieces: the printable plate straight from the shared pattern (same as the editor's STL export)
  const downloadStl = () => {
    if (!p) return;
    downloadBlob(toBinaryStl(buildPlate(p, p.details.thicknessMm, p.details.holeRatio), post.title), `${safeFilename(post.title)}.stl`);
    trackStep('/c/stl');
  };
  const shared = new Date(post.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="shared post-page">
      <header className="site-head">
        <a className="icon-btn" href="#/community" title={t('กลับไปลายจากชุมชน', 'Back to community patterns')} aria-label={t('กลับไปลายจากชุมชน', 'Back to community patterns')}><Icon name="back" /></a>
        <h2><Icon name="people" size={18} /> {t('ลายจากชุมชน', 'Community patterns')}</h2>
        <div className="spacer" />
        <AccountButton />
        <LangSwitch />
      </header>
      <div className="shared-body">
        <div className="preview-card">{p ? <Thumb pattern={p} max={420} view="stitch" /> : <span className="post-wait lg" aria-hidden="true" />}</div>
        <div className="form-card post-info">
          {mine && (
            <p className="post-mine">
              {post.status === 'published'
                ? t('นี่คือลายที่คุณแชร์ · แก้ไขหรือถอนได้ที่หน้าบัญชี', 'You shared this pattern · edit or take it down on your Account page')
                : t('ลายนี้ถูกซ่อนไว้ระหว่างรอทีมงานตรวจสอบ คนอื่นจะยังไม่เห็น', 'This pattern is hidden while the team reviews it. Others can’t see it for now.')}
              {' '}<a className="acct-link" href="#/account">{t('ไปหน้าบัญชี', 'Account')}</a>
            </p>
          )}
          <h1>{post.title}</h1>
          <p className="post-by">{t('โดย', 'by')} <AuthorName author={post.author} at /> <span className="muted">· {shared}</span></p>
          {origin && (
            <p className="post-credit">{t('ดัดแปลงจาก', 'Adapted from')} <a className="acct-link" href={`#/c/${origin.id}`}>{origin.title}</a> {t('โดย', 'by')} {origin.author.name}</p>
          )}
          {post.description && <p className="post-desc">{post.description}</p>}
          {post.tags.length > 0 && (
            <div className="post-tags">
              {post.tags.map((x) => <a key={x} className="chip" href={`#/community/${x}`} title={t('ดูลายในหมวดนี้', 'See patterns in this category')}>{tagLabel(x)}</a>)}
            </div>
          )}
          <p className="hint">
            {templateLabel(post.templateName) ?? (post.base === 'aida' ? (p?.details.baseType === 'aida' ? fabricLabel(p.details) : t('บนผ้า', 'Fabric')) : t('ชิ้นงาน 3D', '3D print'))}
            {' · '}<span className={`diff-text ${post.difficulty}`}>{DIFFICULTY_LABEL[post.difficulty]}</span>
            {' · '}{post.cols}×{post.rows} {t('ช่อง', 'cells')}
            {stats && <> · {stats.widthMm.toFixed(0)}×{stats.heightMm.toFixed(0)} {t('มม.', 'mm')}</>}
            {' · '}{post.stitches.toLocaleString()} {t('ฝีเข็ม', 'stitches')}
          </p>

          <div className="btn-row post-actions">
            <button className="btn primary" onClick={stitch} disabled={!p || !!busy}>
              <Icon name="needle" size={16} /> {busy === 'stitch' ? t('กำลังเปิด…', 'Opening…') : existing ? t('ปักต่อ', 'Continue stitching') : t('ลองปัก', 'Stitch it')}
            </button>
            <button className="btn" onClick={remix} disabled={!p || !!busy}>
              <Icon name="edit" size={16} /> {busy === 'copy' ? t('กำลังเปิด…', 'Opening…') : t('แก้ไขเป็นสำเนาของฉัน', 'Edit as my copy')}
            </button>
          </div>
          {/* orderable when its author's shop sells it, the author lets other shops make it, or it's the team's 3D pattern */}
          {ordersEnabled && p && (authorFrom !== null || post.allowMaking || (post.author.official && post.base === 'print3d')) && (
            <button className="btn order-cta" onClick={() => setOrdering(true)}>
              <Icon name="send" size={16} /> {authorFrom !== null
                ? t(`สั่งผลิตลายนี้ · จาก ${baht(authorFrom)}`, `Have it made · from ${baht(authorFrom)}`)
                : t('สั่งผลิตลายนี้', 'Have it made')}
            </button>
          )}
          {ordersEnabled && cloud.user?.id === post.author.id && (
            <SellPostPanel post={post} onSaved={(allowMaking) => {
              setPost({ ...post, allowMaking });
              postQuotes(post.id).then((offers) => {
                const all = offers.flatMap((o) => Object.values(o.prices) as number[]);
                setAuthorFrom(all.length ? Math.min(...all) : null);
              }).catch(() => { /* keep */ });
            }} />
          )}
          <div className="post-tools">
            <LikeButton post={post} liked={liked} onChange={(on, count) => { setLiked(on); setPost({ ...post, likeCount: count }); }} />
            <button className="btn sm ghost" onClick={copyLink}><Icon name={copied ? 'check' : 'link'} size={15} /> {copied ? t('คัดลอกแล้ว', 'Copied') : t('คัดลอกลิงก์', 'Copy link')}</button>
            <button className="btn sm ghost" onClick={() => setPrinting(true)} disabled={!p}><Icon name="print" size={15} /> {t('แผนผัง / พิมพ์', 'Chart / print')}</button>
            {/* Stitch Box lids are made to order from the team's own files, so no STL for them */}
            {post.base === 'print3d' && !modelOf(p?.templateId) && (
              <button className="btn sm ghost" onClick={downloadStl} disabled={!p}><Icon name="cube" size={15} /> {t('ดาวน์โหลด STL', 'Download STL')}</button>
            )}
          </div>

          {used.length > 0 && p && (
            <section className="post-threads">
              <h3>{t('ด้ายที่ใช้', 'Threads used')} <small>{t(`${used.length} สี`, `${used.length} colors`)}{stash.codes.size > 0 && t(` · มีแล้ว ${have}`, ` · you have ${have}`)}</small></h3>
              <div className="chips">
                {used.map((c) => {
                  const thr = p.palette[c.index];
                  const own = !!thr.code && stash.codes.has(thr.code);
                  return (
                    <span key={thr.id} className={'sym-chip' + (own ? ' own' : '')} title={own ? t('มีแล้ว', 'You have this') : undefined}>
                      <span className="sym sm" style={{ background: thr.hex, color: contrastText(thr.hex) }}>{thr.symbol}</span>{thr.code || thr.name}{own && ' ✓'}
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          <p className="hint post-license">
            {t('ใช้ส่วนตัวและดัดแปลงได้ โปรดให้เครดิตผู้ออกแบบ ห้ามนำไปขาย', 'Free for personal use and remixing, with credit to the designer. Not for sale.')}
            {' · '}<a className="acct-link" href="#/terms">{t('ข้อกำหนด', 'Terms')}</a>
            {!mine && <>{' · '}<button type="button" className="link-btn inline" onClick={() => setReporting(true)}><Icon name="flag" size={14} /> {t('แจ้งปัญหา', 'Report')}</button></>}
          </p>
        </div>
      </div>
      {reporting && <ReportDialog postId={post.id} onClose={() => setReporting(false)} />}
      {ordering && p && <OrderRequestDialog pattern={p} postId={post.id} onClose={() => setOrdering(false)} />}
    </div>
  );
}

const REASONS: { id: ReportReason; label: () => string }[] = [
  { id: 'copyright', label: () => t('ละเมิดลิขสิทธิ์ (เช่น เป็นงานของคนอื่น)', 'Copyright (e.g. someone else’s work)') },
  { id: 'inappropriate', label: () => t('เนื้อหาไม่เหมาะสม', 'Inappropriate content') },
  { id: 'spam', label: () => t('สแปม หรือโฆษณา', 'Spam or advertising') },
  { id: 'other', label: () => t('อื่น ๆ', 'Something else') },
];

function ReportDialog({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>(() => (reported().includes(postId) ? 'sent' : 'idle'));
  const [err, setErr] = useState('');

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const send = async () => {
    if (!reason) return;
    setState('sending');
    setErr('');
    try {
      await reportPost(postId, reason, note);
      try { localStorage.setItem(REPORTED_KEY, JSON.stringify([...reported(), postId].slice(-200))); } catch { /* not critical */ }
      setState('sent');
    } catch (e) {
      setErr((e as Error).message);
      setState('idle');
    }
  };

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <header className="modal-head">
          <h3 id="report-title"><Icon name="flag" /> {t('แจ้งปัญหาลายนี้', 'Report this pattern')}</h3>
          <button className="icon-btn" onClick={onClose} aria-label={t('ปิด', 'Close')} title={t('ปิด', 'Close')}><Icon name="close" /></button>
        </header>
        {state === 'sent' ? (
          <div className="fb-body fb-done">
            <Icon name="check" size={28} />
            <p><b>{t('ได้รับการแจ้งแล้ว ขอบคุณที่ช่วยดูแลชุมชน', 'Thanks — we got your report.')}</b></p>
            <p className="muted">{t('ทีมงานจะตรวจสอบภายใน 7 วัน', 'The team will review it within 7 days.')}</p>
          </div>
        ) : (
          <div className="fb-body">
            <div className="report-reasons" role="radiogroup" aria-label={t('เหตุผล', 'Reason')}>
              {REASONS.map((r) => (
                <label key={r.id} className="check">
                  <input type="radio" name="reason" checked={reason === r.id} onChange={() => setReason(r.id)} />
                  <span>{r.label()}</span>
                </label>
              ))}
            </div>
            <label className="fb-field">
              <span>{t('รายละเอียดเพิ่มเติม (ไม่บังคับ)', 'More details (optional)')}</span>
              <textarea value={note} maxLength={1000} rows={3} onChange={(e) => setNote(e.target.value)}
                placeholder={t('เช่น ลิงก์ไปยังงานต้นฉบับ', 'e.g. a link to the original work')} />
            </label>
            {err && <p className="error small">{err}</p>}
          </div>
        )}
        <footer className="modal-foot fb-foot">
          {state === 'sent' ? (
            <button className="btn primary" onClick={onClose}>{t('ปิด', 'Close')}</button>
          ) : (
            <>
              <button className="btn" onClick={onClose}>{t('ยกเลิก', 'Cancel')}</button>
              <button className="btn primary" onClick={send} disabled={!reason || state === 'sending'}>
                <Icon name="send" size={16} /> {state === 'sending' ? t('กำลังส่ง…', 'Sending…') : t('ส่ง', 'Send')}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
