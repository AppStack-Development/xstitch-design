import { useEffect, useState } from 'react';
import { StitchArt } from '../components/StitchArt';
import { TAGS, communityEnabled, listPosts, myLikes, type Post, type PostBase, type PostSort } from '../lib/community';
import { useCloud } from '../lib/cloud';
import { t } from '../lib/i18n';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { AccountButton } from '../components/AccountButton';
import { PostCard } from '../components/PostCard';
import { PublishDialog } from '../components/PublishDialog';
import { FeedbackLink } from '../components/FeedbackDialog';
import { APP_NAME } from '../lib/brand';

type Filter = 'all' | PostBase;

/** "ลายจากชุมชน": everyone's shared patterns. Browsing needs no account. #/community/<tag> opens one category. */
export function Community({ tag: initialTag }: { tag?: string }) {
  const cloud = useCloud();
  const [filter, setFilter] = useState<Filter>('all');
  const [tag, setTagState] = useState<string>(() => (TAGS.some((x) => x.id === initialTag) ? initialTag! : ''));
  // keep the address in step (so a category can be linked) without a hash change, which would scroll to the top
  const setTag = (id: string) => {
    setTagState(id);
    history.replaceState(history.state, '', `${location.pathname}${location.search}#/community${id ? `/${id}` : ''}`);
  };
  const [sort, setSort] = useState<PostSort>('new');
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);
  const [reload, setReload] = useState(0);

  // first page whenever the filter or order changes
  useEffect(() => {
    if (!communityEnabled) return;
    let live = true;
    setLoading(true);
    setErr('');
    listPosts({ base: filter === 'all' ? undefined : filter, tag: tag || undefined, sort, page: 0 })
      .then((r) => { if (!live) return; setPosts(r.posts); setMore(r.more); setPage(0); })
      .catch((e) => { if (live) setErr((e as Error).message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [filter, tag, sort, reload]);

  // your hearts (after signing in too). Keyed on the ids only: re-fetching after every count change
  // would race the like being saved and un-fill the heart.
  const idKey = posts.map((p) => p.id).join(',');
  useEffect(() => {
    let live = true;
    myLikes(idKey ? idKey.split(',') : []).then((s) => { if (live) setLiked(s); }).catch(() => { /* hearts just show empty */ });
    return () => { live = false; };
  }, [idKey, cloud.user?.id]);

  const loadMore = async () => {
    setLoading(true);
    try {
      const r = await listPosts({ base: filter === 'all' ? undefined : filter, tag: tag || undefined, sort, page: page + 1 });
      // a post can shift pages when new ones arrive; skip ones already shown
      setPosts((cur) => [...cur, ...r.posts.filter((p) => !cur.some((c) => c.id === p.id))]);
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
    setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, likeCount: count } : p)));
  };

  return (
    <div className="community-page">
      <header className="site-head">
        <a className="icon-btn" href="#/" title={t('กลับหน้าแรก', 'Back to home')} aria-label={t('กลับหน้าแรก', 'Back to home')}><Icon name="back" /></a>
        <h2><Icon name="people" size={18} /> {t('ลายจากชุมชน', 'Community patterns')}</h2>
        <div className="spacer" />
        <AccountButton />
        <LangSwitch />
      </header>

      <main className="community-main">
        <section className="community-intro">
          <div>
            <h1>{t('ลายจากชุมชน', 'Community patterns')}</h1>
            <p className="muted">{t(`ลายที่ผู้ใช้ ${APP_NAME} แชร์ไว้ กดลองปักหรือเอาไปแก้เป็นลายของคุณได้เลย ไม่ต้องเข้าสู่ระบบ`,
              `Patterns shared by ${APP_NAME} users. Stitch one or make it your own; no account needed.`)}</p>
          </div>
          {communityEnabled && (
            <button className="btn primary" onClick={() => setSharing(true)}><Icon name="send" size={16} /> {t('แชร์ลายของคุณ', 'Share your pattern')}</button>
          )}
        </section>

        {!communityEnabled ? (
          <p className="muted">{t('พื้นที่แชร์ผลงานยังไม่เปิดในเว็บนี้', 'The community gallery isn’t available on this site.')}</p>
        ) : (
          <>
            <div className="community-filters">
              <div className="seg" role="tablist" aria-label={t('ประเภทลาย', 'Pattern type')}>
                {([['all', t('ทั้งหมด', 'All')], ['aida', t('บนผ้า', 'Fabric')], ['print3d', t('ชิ้นงาน 3D', '3D prints')]] as [Filter, string][]).map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{label}</button>
                ))}
              </div>
              <div className="seg" role="tablist" aria-label={t('เรียงตาม', 'Sort by')}>
                {([['new', t('ล่าสุด', 'Newest')], ['popular', t('หัวใจมากสุด', 'Most liked')]] as [PostSort, string][]).map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={sort === k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{label}</button>
                ))}
              </div>
            </div>
            <div className="tag-row" role="group" aria-label={t('หมวด', 'Category')}>
              <button type="button" className={'chip' + (!tag ? ' on' : '')} aria-pressed={!tag} onClick={() => setTag('')}>{t('ทุกหมวด', 'All categories')}</button>
              {TAGS.map((x) => (
                <button key={x.id} type="button" className={'chip' + (tag === x.id ? ' on' : '')} aria-pressed={tag === x.id} onClick={() => setTag(tag === x.id ? '' : x.id)}>{x.label()}</button>
              ))}
            </div>

            {err && (
              <div className="community-msg">
                <p className="error">{err}</p>
                <button className="btn" onClick={() => setReload((n) => n + 1)}><Icon name="sync" size={16} /> {t('ลองอีกครั้ง', 'Try again')}</button>
              </div>
            )}
            {!err && !loading && !posts.length && (
              <div className="community-msg">
                <StitchArt kind="start" size={72} />
                <p><b>{t('ยังไม่มีลายในหมวดนี้', 'No patterns here yet')}</b></p>
                <p className="muted">{t('เป็นคนแรกที่แชร์ลายของคุณ', 'Be the first to share yours.')}</p>
                <button className="btn primary" onClick={() => setSharing(true)}><Icon name="send" size={16} /> {t('แชร์ลายของคุณ', 'Share your pattern')}</button>
              </div>
            )}

            <div className="sample-grid community-grid" aria-busy={loading}>
              {posts.map((p) => <PostCard key={p.id} post={p} liked={liked.has(p.id)} onLike={onLike(p.id)} />)}
              {loading && !posts.length && Array.from({ length: 4 }, (_, i) => <div key={i} className="sample-card post-skeleton" aria-hidden="true" />)}
            </div>
            {more && (
              <div className="community-more">
                <button className="btn" onClick={loadMore} disabled={loading}>{loading ? t('กำลังโหลด…', 'Loading…') : t('ดูเพิ่ม', 'Show more')}</button>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="site-foot">
        <span>{t('ลายในชุมชนใช้ส่วนตัวและดัดแปลงได้ โปรดให้เครดิตผู้ออกแบบ', 'Community patterns are for personal use and remixing, with credit to the designer.')}</span>
        <span className="spacer" />
        <a href="#/terms">{t('ข้อกำหนดการแชร์', 'Sharing terms')}</a>
        <FeedbackLink />
      </footer>

      {sharing && <PublishDialog onClose={() => setSharing(false)} onPublished={() => setReload((n) => n + 1)} />}
    </div>
  );
}
