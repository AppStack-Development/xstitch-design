import { useEffect, useState } from 'react';
import { StitchLoader } from '../components/StitchLoader';
import { AccountButton } from '../components/AccountButton';
import { Icon } from '../components/Icon';
import { PostCard, TeamBadge, VerifiedBadge } from '../components/PostCard';
import { askConfirm } from '../components/ConfirmDialog';
import { useCloud } from '../lib/cloud';
import { amModerator } from '../lib/moderation';
import { getProfile, listPosts, myLikes, setVerified, type Post, type Profile } from '../lib/community';
import { t, locale } from '../lib/i18n';

/**
 * "#/@username": someone's public page, like MakerWorld's: display name with badges, @username, their shop,
 * and the patterns they shared. Moderators give or take back the verified badge here.
 */
export function CreatorProfile({ username }: { username: string }) {
  const cloud = useCloud();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [mod, setMod] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    getProfile(username)
      .then(async (p) => {
        if (!live) return;
        setProfile(p);
        if (!p) return;
        const r = await listPosts({ author: p.id, page: 0 });
        if (live) { setPosts(r.posts); setMore(r.more); }
      })
      .catch((e) => { if (live) { setErr((e as Error).message); setProfile((p) => p ?? null); setPosts((ps) => ps ?? []); } });
    return () => { live = false; };
  }, [username]);

  const idKey = posts?.map((p) => p.id).join(',') ?? '';
  useEffect(() => {
    if (cloud.status !== 'signed-in' || !idKey) return;
    let live = true;
    myLikes(idKey.split(',')).then((s) => { if (live) setLiked(s); }).catch(() => { /* hearts just show empty */ });
    return () => { live = false; };
  }, [idKey, cloud.status]);

  useEffect(() => {
    if (cloud.status !== 'signed-in') return;
    let live = true;
    amModerator().then((ok) => { if (live) setMod(ok); }).catch(() => { /* not a moderator */ });
    return () => { live = false; };
  }, [cloud.status]);

  const loadMore = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const r = await listPosts({ author: profile.id, page: page + 1 });
      setPosts((ps) => [...(ps ?? []), ...r.posts]);
      setMore(r.more);
      setPage(page + 1);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const onLike = (id: string) => (on: boolean, count: number) => {
    setLiked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
    setPosts((ps) => ps && ps.map((p) => (p.id === id ? { ...p, likeCount: count } : p)));
  };
  const toggleVerified = async () => {
    if (!profile) return;
    const on = !profile.verified;
    if (!(await askConfirm({
      title: on ? t('ให้เครื่องหมายยืนยันตัวตน?', 'Give the verified badge?') : t('ถอนเครื่องหมายยืนยันตัวตน?', 'Take back the verified badge?'),
      message: <p>{on
        ? t(<><b>{profile.name}</b> (@{profile.username}) จะมีเครื่องหมาย <VerifiedBadge /> ต่อท้ายชื่อทุกที่ในแกลเลอรี ให้เฉพาะคนที่ทีมตรวจแล้วว่าเป็นตัวจริง หรือเป็นเจ้าของลายจริง</>,
          <><b>{profile.name}</b> (@{profile.username}) gets the <VerifiedBadge /> badge after their name across the gallery. Give it only to people the team has checked are who they say, or own their designs.</>)
        : t(<>เครื่องหมายหลังชื่อ <b>{profile.name}</b> จะหายไปทุกที่</>, <>The badge after <b>{profile.name}</b>’s name disappears everywhere.</>)}</p>,
      ok: on ? t('ให้เครื่องหมาย', 'Give badge') : t('ถอนเครื่องหมาย', 'Take it back'),
      tone: on ? undefined : 'danger',
      icon: 'people',
    }))) return;
    setBusy(true);
    setErr('');
    try {
      await setVerified(profile.username, on);
      setProfile({ ...profile, verified: on });
      setPosts((ps) => ps && ps.map((p) => ({ ...p, author: { ...p.author, verified: on } })));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  let body: JSX.Element;
  if (profile === undefined) body = <StitchLoader label={t('กำลังโหลด…', 'Loading…')} />;
  else if (!profile) {
    body = (
      <div className="community-msg">
        <p><b>{t('ไม่พบผู้ใช้นี้', 'User not found')}</b></p>
        <p className="muted">{err || t(`ไม่มีใครใช้ชื่อ @${username} หรือเจ้าของอาจเปลี่ยนชื่อผู้ใช้ไปแล้ว`, `Nobody is called @${username}, or they changed their username.`)}</p>
        <a className="btn" href="#/community">{t('ไปแกลเลอรีลายปัก', 'Go to the gallery')}</a>
      </div>
    );
  } else {
    const since = new Date(profile.since).toLocaleDateString(locale, { month: 'short', year: 'numeric' });
    const mine = cloud.user?.id === profile.id;
    body = (
      <>
        <section className="order-card-box shop-hero creator-hero">
          <div className="shop-hero-head">
            <span className="shop-avatar" aria-hidden="true">{profile.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <h1><span>{profile.name}</span>{profile.verified && <VerifiedBadge size={20} />}{profile.official && <TeamBadge />}</h1>
              <p className="creator-at">@{profile.username}</p>
              <p className="muted">
                {t(`เข้าร่วมเมื่อ ${since}`, `Joined ${since}`)}
                {posts && <> · {t(`แชร์ ${posts.length}${more ? '+' : ''} ลาย`, `${posts.length}${more ? '+' : ''} shared patterns`)}</>}
              </p>
              {profile.verified && (
                <p className="creator-verified-note"><VerifiedBadge size={13} /> {profile.official
                  ? t('บัญชีทางการของทีมผู้สร้างเว็บ', 'The site team’s official account')
                  : t('ทีมงานยืนยันตัวตนแล้ว', 'Verified by the team')}</p>
              )}
            </div>
          </div>
          {(profile.shop || mine || mod) && (
            <div className="btn-row creator-actions">
              {profile.shop && <a className="btn sm" href={`#/shops/${profile.shop.id}`}><Icon name="cube" size={15} /> {t(`ร้าน ${profile.shop.name}`, `Shop: ${profile.shop.name}`)}</a>}
              {mine && <a className="btn sm ghost" href="#/account">{t('แก้ไขโปรไฟล์', 'Edit profile')}</a>}
              {mod && (
                <button className="btn sm ghost" onClick={toggleVerified} disabled={busy}>
                  {busy ? t('กำลังบันทึก…', 'Saving…') : profile.verified ? t('ถอนเครื่องหมายยืนยัน', 'Remove verified badge') : t('ให้เครื่องหมายยืนยัน', 'Give verified badge')}
                </button>
              )}
            </div>
          )}
          {err && <p className="error small">{err}</p>}
        </section>

        <section className="creator-posts">
          <h3>{t('ลายที่แชร์', 'Shared patterns')}</h3>
          {posts === null && <StitchLoader small label={t('กำลังโหลด…', 'Loading…')} />}
          {posts && !posts.length && <p className="muted">{t('ยังไม่ได้แชร์ลาย', 'No shared patterns yet')}</p>}
          {posts && posts.length > 0 && (
            <div className="sample-grid community-grid">
              {posts.map((p) => <PostCard key={p.id} post={p} liked={liked.has(p.id)} onLike={onLike(p.id)} />)}
            </div>
          )}
          {more && (
            <div className="community-more">
              <button className="btn" onClick={loadMore} disabled={loading}>{loading ? t('กำลังโหลด…', 'Loading…') : t('ดูเพิ่ม', 'Show more')}</button>
            </div>
          )}
        </section>
      </>
    );
  }

  return (
    <div className="community-page shop-profile creator-profile">
      <header className="site-head">
        <a className="icon-btn" href="#/community" title={t('ไปแกลเลอรีลายปัก', 'To the gallery')} aria-label={t('ไปแกลเลอรีลายปัก', 'To the gallery')}><Icon name="back" /></a>
        <h2><Icon name="people" size={18} /> {profile ? profile.name : t('โปรไฟล์', 'Profile')}</h2>
        <div className="spacer" />
        <AccountButton />
      </header>
      <main className="community-main shop-main">{body}</main>
    </div>
  );
}
