import { useEffect, useState, type CSSProperties } from 'react';
import type { Pattern } from '../types';
import { postPattern, profileHref, setLike, type Author, type Post } from '../lib/community';
import { useCloud } from '../lib/cloud';
import { DIFFICULTY_LABEL } from '../lib/pattern';
import { t } from '../lib/i18n';
import { navigate } from '../App';
import { Thumb } from './Thumb';
import { Icon } from './Icon';
import { askConfirm } from './ConfirmDialog';

/** Decodes a post's pattern for previews; null until ready (or if the data is broken). */
export function usePostPattern(post: Post | null): Pattern | null {
  const [p, setP] = useState<Pattern | null>(null);
  useEffect(() => {
    if (!post) return;
    let live = true;
    postPattern(post).then((x) => { if (live) setP(x); }).catch(() => { /* a broken post just shows no preview */ });
    return () => { live = false; };
  }, [post?.id, post?.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return p;
}

/** "จากทีม" badge for the official XStitch.Design account. */
export function TeamBadge() {
  return <span className="team-badge">{t('จากทีม', 'Team')}</span>;
}

/** The verified badge after a name: the team has checked this person (0017). */
export function VerifiedBadge({ size = 15 }: { size?: number }) {
  const label = t('ยืนยันตัวตนแล้ว', 'Verified');
  return (
    <svg className="verified-badge" width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={label}>
      <title>{label}</title>
      <path fill="currentColor" d="M8 .8l1.7 1.3 2.1-.2.7 2 1.9 1-.5 2.1 1 1.9-1.5 1.5-.2 2.1-2.1.5-1.3 1.7-1.9-.9-1.9.9-1.3-1.7-2.1-.5-.2-2.1L.6 8.9l1-1.9-.5-2.1 1.9-1 .7-2 2.1.2z" />
      <path fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" d="M5.2 8.2l1.9 1.9 3.8-4" />
    </svg>
  );
}

/** "โดย ชื่อ ✓ จากทีม": the author's name links to their profile, badges follow it. */
export function AuthorName({ author, at }: { author: Author; at?: boolean }) {
  const name = <b>{author.name}</b>;
  return (
    <>
      {author.username ? <a className="author-link" href={profileHref(author.username)}>{name}</a> : name}
      {author.verified && <VerifiedBadge />}
      {author.official && <TeamBadge />}
      {at && author.username && <span className="author-at">@{author.username}</span>}
    </>
  );
}

/**
 * Heart button with count. Signed out, it explains that liking needs an account. The change shows
 * at once and is rolled back if saving fails.
 */
export function LikeButton({ post, liked, onChange, size = 'sm' }: {
  post: Post; liked: boolean; onChange: (liked: boolean, count: number) => void; size?: 'sm' | 'md';
}) {
  const cloud = useCloud();
  const [busy, setBusy] = useState(false);
  /** bumps on each like so the heart's pop (and its little burst of crosses) plays again */
  const [pop, setPop] = useState(0);
  const toggle = async () => {
    if (cloud.status !== 'signed-in') {
      const go = await askConfirm({
        title: t('เข้าสู่ระบบเพื่อกดหัวใจ', 'Sign in to like patterns'),
        message: <p>{t('กดหัวใจเก็บลายที่ชอบได้เมื่อเข้าสู่ระบบ ไปหน้าเข้าสู่ระบบไหม?', 'You can like patterns once you’re signed in. Go to the sign-in page?')}</p>,
        ok: t('ไปหน้าเข้าสู่ระบบ', 'Go to sign in'),
        icon: 'heart',
      });
      if (go) navigate('#/account');
      return;
    }
    if (busy) return;
    const next = !liked;
    const count = Math.max(0, post.likeCount + (next ? 1 : -1));
    if (next) setPop((n) => n + 1);
    onChange(next, count);
    setBusy(true);
    try {
      await setLike(post.id, next);
    } catch (e) {
      onChange(liked, post.likeCount);
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={`like-btn ${size}` + (liked ? ' on' : '')} onClick={toggle} aria-pressed={liked}
      title={liked ? t('เลิกกดหัวใจ', 'Unlike') : t('กดหัวใจ', 'Like')}
      aria-label={t(`หัวใจ ${post.likeCount}`, `${post.likeCount} likes`)}>
      <span key={pop} className={'like-heart' + (pop && liked ? ' pop' : '')}>
        <Icon name="heart" size={size === 'md' ? 18 : 16} />
        {pop > 0 && liked && (
          <span className="like-burst" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
              return <i key={i} style={{ '--dx': `${Math.round(Math.cos(a) * 17)}px`, '--dy': `${Math.round(Math.sin(a) * 17)}px`, '--r': `${i * 40}deg` } as CSSProperties}>✕</i>;
            })}
          </span>
        )}
      </span>
      <span className="like-count">{post.likeCount.toLocaleString()}</span>
    </button>
  );
}

export function PostCard({ post, liked, onLike }: { post: Post; liked: boolean; onLike: (liked: boolean, count: number) => void }) {
  const p = usePostPattern(post);
  const href = `#/c/${post.id}`;
  return (
    <article className="sample-card post-card">
      <a className="sample-thumb" href={href} aria-label={post.title}>
        {p ? <Thumb pattern={p} max={150} view="stitch" /> : <span className="post-wait" aria-hidden="true" />}
        <span className={`sample-kind ${post.base}`}>{post.base === 'aida' ? t('บนผ้า', 'Fabric') : '3D'}</span>
        {post.forSaleFrom !== null && <span className="sale-badge">{t(`สั่งผลิตได้ · จาก ${post.forSaleFrom.toLocaleString()} บาท`, `Made to order · from ฿${post.forSaleFrom.toLocaleString()}`)}</span>}
      </a>
      <div className="sample-body">
        <h3><a href={href}>{post.title}</a></h3>
        <div className="post-by">{t('โดย', 'by')} <AuthorName author={post.author} /></div>
        <div className="sample-meta">
          <span className={`diff ${post.difficulty}`}>{DIFFICULTY_LABEL[post.difficulty]}</span>
          <span>{t(`${post.colors} สี`, `${post.colors} colors`)}</span>
          <span>{t(`${post.stitches.toLocaleString()} ฝีเข็ม`, `${post.stitches.toLocaleString()} stitches`)}</span>
        </div>
      </div>
      <div className="post-foot">
        <LikeButton post={post} liked={liked} onChange={onLike} />
        <a className="btn sm ghost" href={href}>{t('ดูลาย', 'View')}</a>
      </div>
    </article>
  );
}
