import { useEffect, useState } from 'react';
import type { Pattern } from '../types';
import { StitchLoader } from '../components/StitchLoader';
import { AccountButton } from '../components/AccountButton';
import { Thumb } from '../components/Thumb';
import { Icon } from '../components/Icon';
import { ReportShopDialog, ReviewItem, ShopScore } from '../components/ShopTrust';
import { useCloud, client } from '../lib/cloud';
import { amModerator } from '../lib/moderation';
import { decodeShare } from '../lib/share';
import { PRODUCTS, SIZES, SIZE_LIMITS, baht, type Material } from '../lib/orders';
import { hideReview, rateKey, shopProfileData, type Review, type ShopForSale } from '../lib/shops';
import { t, locale } from '../lib/i18n';

type Profile = NonNullable<Awaited<ReturnType<typeof shopProfileData>>>;

/**
 * "#/shops/<id>": a shop's public page: who they are, what they make and from how much, the community patterns
 * they sell, and their reviews (with replies). Signed-in visitors can report the shop; moderators can hide reviews.
 */
export function ShopProfile({ id }: { id: number }) {
  const cloud = useCloud();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const [reporting, setReporting] = useState(false);
  const [mod, setMod] = useState(false);
  const [modReviews, setModReviews] = useState<Review[] | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    shopProfileData(id).then((p) => { if (live) setProfile(p); }).catch((e) => { if (live) { setErr((e as Error).message); setProfile(null); } });
    return () => { live = false; };
  }, [id, reload]);
  useEffect(() => {
    if (cloud.status !== 'signed-in') return;
    let live = true;
    amModerator().then(async (ok) => {
      if (!live || !ok) return;
      setMod(true);
      // the team sees every review of the shop, hidden ones too, to hide or show them
      const c = await client();
      const { data } = await c.from('order_reviews').select('order_id, rating, body, reply, replied_at, hidden, created_at').eq('shop_id', id).order('created_at', { ascending: false }).limit(100);
      if (live) setModReviews((data ?? []).map((r) => ({ orderId: r.order_id, rating: r.rating, body: r.body, reply: r.reply, repliedAt: r.replied_at, createdAt: r.created_at, hidden: r.hidden })));
    }).catch(() => { /* not a moderator */ });
    return () => { live = false; };
  }, [id, cloud.status, reload]);

  let body: JSX.Element;
  if (profile === undefined) body = <StitchLoader label={t('กำลังโหลด…', 'Loading…')} />;
  else if (!profile) {
    body = (
      <div className="community-msg">
        <p><b>{t('ไม่พบร้านนี้', 'Shop not found')}</b></p>
        <p className="muted">{err || t('ร้านอาจปิดไปแล้ว หรือถูกระงับ', 'It may have closed or been suspended.')}</p>
        <a className="btn" href="#/community">{t('ไปแกลเลอรีลายปัก', 'Go to the gallery')}</a>
      </div>
    );
  } else {
    const { shop, rates, stats, reviews, forSale } = profile;
    const opened = new Date(shop.createdAt).toLocaleDateString(locale, { month: 'short', year: 'numeric' });
    body = (
      <>
        <section className="order-card-box shop-hero">
          <div className="shop-hero-head">
            <span className="shop-avatar" aria-hidden="true">{shop.name.slice(0, 1)}</span>
            <div>
              <h1>{shop.name} {shop.official && <span className="order-team">{t('ทีม', 'Team')}</span>}</h1>
              <ShopScore {...stats} official={shop.official} />
              <p className="muted small">{t(`เปิดร้านเมื่อ ${opened}`, `Open since ${opened}`)}{shop.leadTime && <> · {t(`ผลิต ${shop.leadTime}`, `ready in ${shop.leadTime}`)}</>} · {t(`ค่าส่ง ${baht(shop.shippingThb)}`, `shipping ${baht(shop.shippingThb)}`)}</p>
            </div>
          </div>
          {shop.suspended && <p className="error">{t('ร้านนี้ถูกระงับโดยทีม', 'This shop is suspended by the team')}</p>}
          {!shop.accepting && !shop.suspended && <p className="hint shop-closed">{t('ร้านปิดรับออเดอร์ชั่วคราว', 'Closed for new orders for now')}</p>}
          {shop.about && <p>{shop.about}</p>}
        </section>

        {Object.keys(rates).length > 0 && (
          <section className="order-card-box">
            <h3>{t('รับผลิตลายของคุณ', 'Makes your own designs')}</h3>
            <p className="hint">{t('สั่งได้จากหน้าแก้ไขลายของคุณ → ส่งออก → สั่งผลิต ร้านนี้จะขึ้นในรายชื่อเมื่อรับลายขนาดนั้น', 'Order from your pattern: Export → Have it made. This shop is listed when it makes that size.')}</p>
            {(['3d', 'fabric'] as Material[]).map((m) => {
              const rows = PRODUCTS.filter((p) => p.material === m && SIZES.some((s) => rates[rateKey(p.id, s)]));
              if (!rows.length) return null;
              return (
                <div key={m} className="rate-card">
                  <b>{m === '3d' ? t('ชิ้นงานพิมพ์ 3D', '3D-printed pieces') : t('ลายบนผ้า', 'On fabric')}</b>
                  <table className="order-price-table">
                    <thead><tr><th />{SIZES.map((s) => <th key={s}>{s} <small>≤{SIZE_LIMITS[m].find(([x]) => x === s)![1] / 10} {t('ซม.', 'cm')}</small></th>)}</tr></thead>
                    <tbody>
                      {rows.map((p) => (
                        <tr key={p.id}><th>{p.name()}{p.perStitch && <small> {t('+ ค่าปักตามฝีเข็ม', '+ per stitch')}</small>}</th>
                          {SIZES.map((s) => <td key={s}>{rates[rateKey(p.id, s)] ? baht(rates[rateKey(p.id, s)]) : '–'}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </section>
        )}

        {forSale.length > 0 && (
          <section className="order-card-box">
            <h3>{t('ลายที่ร้านขาย', 'Patterns this shop sells')}</h3>
            <div className="shop-for-sale">{forSale.map((p) => <ForSaleCard key={p.id} post={p} />)}</div>
          </section>
        )}

        <section className="order-card-box">
          <h3>{t('รีวิว', 'Reviews')} {stats.reviews > 0 && <span className="muted">({stats.reviews})</span>}</h3>
          {mod && modReviews ? (
            modReviews.length === 0 ? <p className="muted">{t('ยังไม่มีรีวิว', 'No reviews yet')}</p> : modReviews.map((r) => (
              <div key={r.orderId} className="mod-review">
                <ReviewItem review={r} shopName={shop.name} />
                <button className="btn sm ghost" onClick={() => hideReview(r.orderId!, !r.hidden).then(() => setReload((n) => n + 1))}>
                  {r.hidden ? t('แสดงรีวิวนี้', 'Show this review') : t('ซ่อนรีวิวนี้', 'Hide this review')}
                </button>
              </div>
            ))
          ) : reviews.length === 0 ? <p className="muted">{t('ยังไม่มีรีวิว', 'No reviews yet')}</p>
            : reviews.map((r, i) => <ReviewItem key={i} review={r} shopName={shop.name} />)}
        </section>

        {cloud.status === 'signed-in' && cloud.user?.id !== shop.ownerId && (
          <p className="hint"><button className="link-btn" onClick={() => setReporting(true)}><Icon name="flag" size={14} /> {t('แจ้งปัญหาร้านนี้', 'Report this shop')}</button></p>
        )}
        {reporting && <ReportShopDialog shopId={shop.id} shopName={shop.name} onClose={() => setReporting(false)} />}
      </>
    );
  }

  return (
    <div className="community-page shop-profile">
      <header className="site-head">
        <a className="icon-btn" href="#/community" title={t('ไปแกลเลอรีลายปัก', 'To the gallery')} aria-label={t('ไปแกลเลอรีลายปัก', 'To the gallery')}><Icon name="back" /></a>
        <h2><Icon name="cube" size={18} /> {profile ? profile.shop.name : t('ร้าน', 'Shop')}</h2>
        <div className="spacer" />
        <AccountButton />
      </header>
      <main className="community-main shop-main">{body}</main>
    </div>
  );
}

function ForSaleCard({ post }: { post: ShopForSale }) {
  const [p, setP] = useState<Pattern | null>(null);
  useEffect(() => {
    let live = true;
    decodeShare(post.data).then((x) => { if (live) setP(x); }).catch(() => { /* no picture */ });
    return () => { live = false; };
  }, [post.data]);
  return (
    <a className="shop-sale-card" href={`#/c/${post.id}`}>
      <span className="shop-sale-thumb">{p ? <Thumb pattern={p} max={88} view="stitch" /> : <span className="post-wait" aria-hidden="true" />}</span>
      <b>{post.title}</b>
      <span className="muted small">{t(`จาก ${baht(post.from)}`, `from ${baht(post.from)}`)}</span>
    </a>
  );
}
