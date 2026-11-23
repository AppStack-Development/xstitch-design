import { useEffect, useMemo, useState } from 'react';
import type { Pattern } from '../types';
import { TAGS, cannotShare, getMyCreator, myPostFor, postShareUrl, publishPattern, saveMyCreator, type Post } from '../lib/community';
import { useCloud, signInWithGoogle } from '../lib/cloud';
import { detectInApp } from '../lib/inAppBrowser';
import { listPatterns } from '../lib/storage';
import { computeStats } from '../lib/stats';
import { trackStep } from '../lib/analytics';
import { t } from '../lib/i18n';
import { Thumb } from './Thumb';
import { Icon } from './Icon';

/**
 * "แชร์ในชุมชน": share a pattern to the community gallery.
 * Opened from the editor (with its pattern) or from the gallery (pick one of your patterns first).
 */
export function PublishDialog({ pattern, onClose, onPublished }: {
  pattern?: Pattern; onClose: () => void; onPublished?: (p: Pattern, postId: string) => void;
}) {
  const cloud = useCloud();
  const [picked, setPicked] = useState<Pattern | null>(pattern ?? null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  let body: JSX.Element;
  if (cloud.status === 'loading') body = <div className="fb-body"><p className="muted">{t('กำลังตรวจสอบบัญชี…', 'Checking your account…')}</p></div>;
  else if (cloud.status !== 'signed-in') body = <SignInFirst />;
  else if (done) body = <Done postId={done} onClose={onClose} />;
  else if (!picked) body = <Pick onPick={setPicked} onClose={onClose} />;
  else {
    body = (
      <Form pattern={picked} canGoBack={!pattern} onBack={() => setPicked(null)} onClose={onClose}
        onDone={(p, id) => { setDone(id); onPublished?.(p, id); }} />
    );
  }

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal publish-dialog" role="dialog" aria-modal="true" aria-labelledby="publish-title">
        <header className="modal-head">
          <h3 id="publish-title"><Icon name="people" /> {t('แชร์ในชุมชน', 'Share with the community')}</h3>
          <button className="icon-btn" onClick={onClose} aria-label={t('ปิด', 'Close')} title={t('ปิด', 'Close')}><Icon name="close" /></button>
        </header>
        {body}
      </div>
    </div>
  );
}

function SignInFirst() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const inApp = useMemo(() => detectInApp(), []);
  const go = async () => {
    setBusy(true);
    setErr('');
    try { await signInWithGoogle(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <>
      <div className="fb-body">
        <p><b>{t('เข้าสู่ระบบก่อนแชร์', 'Sign in to share')}</b></p>
        <p className="muted">{t('ลายที่แชร์จะผูกกับบัญชีของคุณ เพื่อให้แก้ไขหรือถอนออกได้ภายหลัง ดูลายของคนอื่นได้โดยไม่ต้องเข้าสู่ระบบ',
          'Shared patterns belong to your account so you can edit or take them down later. Browsing needs no account.')}</p>
        {err && <p className="error small">{err}</p>}
      </div>
      <footer className="modal-foot fb-foot">
        {inApp ? (
          <a className="btn primary" href="#/account">{t('ไปหน้าเข้าสู่ระบบ', 'Go to sign in')}</a>
        ) : (
          <button className="btn primary" onClick={go} disabled={busy}>{busy ? t('กำลังไปที่ Google…', 'Opening Google…') : t('เข้าสู่ระบบด้วย Google', 'Continue with Google')}</button>
        )}
      </footer>
    </>
  );
}

function Pick({ onPick, onClose }: { onPick: (p: Pattern) => void; onClose: () => void }) {
  const items = useMemo(() => listPatterns().filter((p) => computeStats(p).total > 0), []);
  return (
    <>
      <div className="fb-body publish-pick">
        <p>{t('เลือกลายที่จะแชร์', 'Choose a pattern to share')}</p>
        {!items.length && (
          <p className="muted">{t('ยังไม่มีลายในเครื่องนี้ ลองสร้างลายจากรูปก่อน แล้วค่อยกลับมาแชร์', 'There are no patterns on this device yet. Make one from a photo first, then come back to share it.')}</p>
        )}
        <div className="pick-list">
          {items.map((p) => (
            <button key={p.id} className="pick-item" onClick={() => onPick(p)}>
              <span className="pick-thumb"><Thumb pattern={p} max={56} view="stitch" /></span>
              <span className="pick-name">{p.name}</span>
              {p.postId && <span className="pick-tag">{t('แชร์แล้ว', 'Shared')}</span>}
            </button>
          ))}
        </div>
      </div>
      <footer className="modal-foot fb-foot">
        {!items.length ? <a className="btn primary" href="#/quick" onClick={onClose}>{t('สร้างลายจากรูป', 'Pattern from a photo')}</a> : <button className="btn" onClick={onClose}>{t('ยกเลิก', 'Cancel')}</button>}
      </footer>
    </>
  );
}

function Form({ pattern, canGoBack, onBack, onClose, onDone }: {
  pattern: Pattern; canGoBack: boolean; onBack: () => void; onClose: () => void; onDone: (p: Pattern, postId: string) => void;
}) {
  const cloud = useCloud();
  const [ready, setReady] = useState(false);
  /** the saved public name ('' = none yet) */
  const [savedName, setSavedName] = useState('');
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [existing, setExisting] = useState<Post | null>(null);
  const [replace, setReplace] = useState(true);
  const [title, setTitle] = useState(pattern.name);
  const [desc, setDesc] = useState(pattern.details.description ?? '');
  const [tags, setTags] = useState<string[]>([]);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const blocked = cannotShare(pattern);

  useEffect(() => {
    trackStep('/community/publish/1-form');
    let live = true;
    Promise.all([getMyCreator(), myPostFor(pattern)])
      .then(([creator, post]) => {
        if (!live) return;
        setSavedName(creator?.name ?? '');
        setHandle(creator?.username ?? '');
        // suggest a first name only; people can change it to a nickname
        setName(creator?.name ?? (cloud.user?.name ?? '').split(/\s+/)[0] ?? '');
        if (post) {
          setExisting(post);
          setTitle(post.title);
          setDesc(post.description);
          setTags(post.tags);
        }
        setReady(true);
      })
      .catch((e) => { if (live) { setErr((e as Error).message); setReady(true); } });
    return () => { live = false; };
  }, [pattern.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTag = (id: string) => setTags((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 3 ? [...cur, id] : cur));
  const canSend = ready && !blocked && agree && !busy && !!title.trim() && !!name.trim();

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    setErr('');
    try {
      if (name.trim() !== savedName) await saveMyCreator(name);
      const r = await publishPattern(pattern, { title, description: desc, tags }, !!existing && replace);
      trackStep('/community/publish/2-done');
      onDone(r.pattern, r.postId);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fb-body publish-form">
        <div className="publish-head">
          <span className="pick-thumb"><Thumb pattern={pattern} max={64} view="stitch" /></span>
          <div>
            <b>{pattern.name}</b>
            {canGoBack && <button type="button" className="link-btn inline" onClick={onBack}>{t('เปลี่ยนลาย', 'Change')}</button>}
          </div>
        </div>
        {blocked && <p className="error small">{blocked}</p>}
        {existing && (
          <div className="publish-mode" role="radiogroup" aria-label={t('การแชร์', 'Sharing')}>
            <label className="check"><input type="radio" checked={replace} onChange={() => setReplace(true)} />
              <span>{t('อัปเดตลายที่แชร์ไว้แล้ว', 'Update the pattern you already shared')} <small>{t(`หัวใจ ${existing.likeCount} ดวงยังอยู่`, `keeps its ${existing.likeCount} likes`)}</small></span></label>
            <label className="check"><input type="radio" checked={!replace} onChange={() => setReplace(false)} />
              <span>{t('แชร์เป็นลายใหม่อีกลาย', 'Share it as a new pattern')}</span></label>
          </div>
        )}
        <label className="fb-field">
          <span>{t('ชื่อที่แสดง', 'Display name')} <small>{t('คนอื่นจะเห็นชื่อนี้ ใช้ชื่อเล่นหรือนามแฝงได้', 'Others see this; a nickname is fine')}</small></span>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} disabled={!ready} placeholder={t('เช่น ป้าแดงปักผ้า', 'e.g. Stitchy Sam')} />
          {ready && <small className="publish-handle">{handle
            ? t(<>โปรไฟล์ของคุณ <b>@{handle}</b> · เปลี่ยนชื่อผู้ใช้ได้ใน<a href="#/account">หน้าบัญชี</a></>, <>Your profile: <b>@{handle}</b> · change your username on the <a href="#/account">account page</a></>)
            : t(<>ระบบจะตั้งชื่อผู้ใช้ให้ เปลี่ยนเป็นของคุณได้ใน<a href="#/account">หน้าบัญชี</a></>, <>You’ll get a username; choose your own on the <a href="#/account">account page</a></>)}</small>}
        </label>
        <label className="fb-field">
          <span>{t('ชื่อลาย', 'Pattern title')}</span>
          <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} disabled={!ready} />
        </label>
        <label className="fb-field">
          <span>{t('คำอธิบาย (ไม่บังคับ)', 'Description (optional)')}</span>
          <textarea value={desc} maxLength={1000} rows={3} onChange={(e) => setDesc(e.target.value)} disabled={!ready}
            placeholder={t('เช่น ปักบนผ้า 14 ct ใช้เวลาประมาณ 3 ชั่วโมง', 'e.g. Stitched on 14 ct Aida in about 3 hours')} />
        </label>
        <div className="fb-field">
          <span>{t('หมวด (เลือกได้ไม่เกิน 3)', 'Categories (up to 3)')}</span>
          <div className="publish-tags">
            {TAGS.map((x) => (
              <button key={x.id} type="button" className={'chip' + (tags.includes(x.id) ? ' on' : '')} aria-pressed={tags.includes(x.id)} onClick={() => toggleTag(x.id)}>{x.label()}</button>
            ))}
          </div>
        </div>
        <label className="check publish-agree">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>{t('ฉันออกแบบลายนี้เอง หรือได้รับอนุญาตให้แชร์ และยอมรับ', 'I designed this pattern or have permission to share it, and I accept the')}{' '}
            <a className="acct-link" href="#/terms" target="_blank" rel="noopener">{t('ข้อกำหนดการแชร์', 'sharing terms')}</a></span>
        </label>
        <p className="hint">{t('คนอื่นใช้ส่วนตัวและดัดแปลงได้ โดยให้เครดิตคุณ ห้ามนำไปขาย · ความคืบหน้าการปักและรายการด้ายของคุณจะไม่ถูกแชร์',
          'Others may use it personally and remix it with credit to you, but not sell it · your stitching progress and thread list are not shared')}</p>
        {err && <p className="error small">{err}</p>}
      </div>
      <footer className="modal-foot fb-foot">
        <button className="btn" onClick={onClose}>{t('ยกเลิก', 'Cancel')}</button>
        <button className="btn primary" onClick={send} disabled={!canSend}>
          <Icon name="send" size={16} /> {busy ? t('กำลังแชร์…', 'Sharing…') : existing && replace ? t('อัปเดต', 'Update') : t('แชร์', 'Share')}
        </button>
      </footer>
    </>
  );
}

function Done({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = postShareUrl(postId);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { prompt(t('คัดลอกลิงก์นี้', 'Copy this link'), url); }
  };
  return (
    <>
      <div className="fb-body fb-done">
        <Icon name="check" size={28} />
        <p><b>{t('แชร์แล้ว! คนอื่นเห็นลายของคุณในชุมชนแล้ว', 'Shared! Your pattern is now in the community gallery.')}</b></p>
        <p className="muted">{t('แก้ไขหรือถอนลายได้ทุกเมื่อที่หน้าบัญชี', 'You can edit or take it down any time from your Account page.')}</p>
        <button className="btn sm ghost" onClick={copy}><Icon name={copied ? 'check' : 'link'} size={15} /> {copied ? t('คัดลอกแล้ว', 'Copied') : t('คัดลอกลิงก์', 'Copy link')}</button>
      </div>
      <footer className="modal-foot fb-foot">
        <button className="btn" onClick={onClose}>{t('ปิด', 'Close')}</button>
        <a className="btn primary" href={`#/c/${postId}`} onClick={onClose}>{t('ดูลายในชุมชน', 'View in gallery')}</a>
      </footer>
    </>
  );
}
