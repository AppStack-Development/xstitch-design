import { useEffect, useState } from 'react';
import { StitchLoader } from '../components/StitchLoader';
import { askConfirm } from '../components/ConfirmDialog';
import type { Post } from '../lib/community';
import { amModerator, decide, recentlyHandled, reviewQueue, DECISION_LABEL, REASON_LABEL, type Decision, type ReviewItem } from '../lib/moderation';
import { useCloud } from '../lib/cloud';
import { t, locale } from '../lib/i18n';
import { Thumb } from '../components/Thumb';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { AuthorName, usePostPattern } from '../components/PostCard';
import { ordersEnabled } from '../lib/orders';
import { listShopReports, reportReasonLabel, resolveShopReport, setShopSuspended, type ShopReport } from '../lib/shops';

type Tab = 'open' | 'handled' | 'orders' | 'shops';

const when = (iso: string) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * "หน้าทีม" (#/moderation, #/moderation/orders): community reports and production orders, for the team.
 * Everyone else sees a short "not allowed" note.
 */
export function Moderation({ startTab }: { startTab?: Tab } = {}) {
  const cloud = useCloud();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>(startTab ?? 'open');
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (cloud.status === 'loading') return;
    let live = true;
    amModerator().then((ok) => { if (live) setAllowed(ok); });
    return () => { live = false; };
  }, [cloud.status, cloud.user?.id]);

  useEffect(() => {
    if (!allowed || tab === 'orders' || tab === 'shops') return;
    let live = true;
    setItems(null);
    setErr('');
    (tab === 'open' ? reviewQueue() : recentlyHandled())
      .then((x) => {
        if (!live) return;
        setItems(x);
        if (tab === 'open') setOpenCount(x.length);
      })
      .catch((e) => { if (live) setErr((e as Error).message); });
    return () => { live = false; };
  }, [allowed, tab, reload]);

  const onDecided = (postId: string) => {
    // a decided post leaves the open queue
    if (tab === 'open') {
      setItems((xs) => xs && xs.filter((x) => x.post.id !== postId));
      setOpenCount((n) => (n == null ? n : Math.max(0, n - 1)));
    } else {
      setReload((n) => n + 1);
    }
  };

  let body: JSX.Element;
  if (cloud.status === 'loading' || allowed === null) body = <p className="muted">{t('กำลังตรวจสอบสิทธิ์…', 'Checking access…')}</p>;
  else if (!allowed) {
    body = (
      <div className="community-msg">
        <p><b>{t('หน้านี้สำหรับทีมงาน (ดูแลชุมชนและออเดอร์)', 'This page is for the team (community reports and orders)')}</b></p>
        <p className="muted">{cloud.status === 'signed-in'
          ? t('บัญชีนี้ไม่มีสิทธิ์ตรวจการแจ้งปัญหา', 'This account can’t review reports.')
          : t('เข้าสู่ระบบด้วยบัญชีทีมงานก่อน', 'Sign in with a team account first.')}</p>
        <a className="btn" href={cloud.status === 'signed-in' ? '#/community' : '#/account'}>
          {cloud.status === 'signed-in' ? t('ไปหน้าลายจากชุมชน', 'Go to community patterns') : t('ไปหน้าเข้าสู่ระบบ', 'Go to sign in')}
        </a>
      </div>
    );
  } else {
    body = (
      <>
        <div className="community-filters">
          <div className="seg" role="tablist" aria-label={t('รายการ', 'List')}>
            <button role="tab" aria-selected={tab === 'open'} className={tab === 'open' ? 'on' : ''} onClick={() => setTab('open')}>
              {t('รอตรวจ', 'To review')}{openCount != null && ` (${openCount})`}
            </button>
            <button role="tab" aria-selected={tab === 'handled'} className={tab === 'handled' ? 'on' : ''} onClick={() => setTab('handled')}>{t('จัดการแล้ว', 'Handled')}</button>
            {ordersEnabled && <button role="tab" aria-selected={tab === 'shops'} className={tab === 'shops' ? 'on' : ''} onClick={() => setTab('shops')}>{t('แจ้งปัญหาร้าน', 'Shop reports')}</button>}
            {ordersEnabled && <button role="tab" aria-selected={tab === 'orders'} className={tab === 'orders' ? 'on' : ''} onClick={() => setTab('orders')}>{t('ออเดอร์', 'Orders')}</button>}
          </div>
          <button className="btn sm ghost" onClick={() => setReload((n) => n + 1)}><Icon name="sync" size={15} /> {t('โหลดใหม่', 'Refresh')}</button>
        </div>
        {tab === 'orders' ? <OrdersPanel /> : tab === 'shops' ? <ShopReportsPanel reload={reload} /> : <>
        {err && <p className="error">{err}</p>}
        {!err && items === null && <StitchLoader small label={t('กำลังโหลด…', 'Loading…')} />}
        {items && !items.length && (
          <div className="community-msg">
            <p><b>{tab === 'open' ? t('ไม่มีการแจ้งที่รอตรวจ', 'Nothing to review') : t('ยังไม่มีรายการที่จัดการแล้ว', 'Nothing handled yet')}</b></p>
            {tab === 'open' && <p className="muted">{t('ทุกการแจ้งได้รับการจัดการแล้ว', 'Every report has been dealt with.')}</p>}
          </div>
        )}
        {items && items.length > 0 && (
          <div className="review-list">
            {items.map((it) => <ReviewCard key={it.post.id} item={it} handled={tab === 'handled'} onDecided={onDecided} />)}
          </div>
        )}
        </>}
      </>
    );
  }

  return (
    <div className="community-page">
      <header className="site-head">
        <a className="icon-btn" href="#/account" title={t('กลับไปหน้าบัญชี', 'Back to account')} aria-label={t('กลับไปหน้าบัญชี', 'Back to account')}><Icon name="back" /></a>
        <h2><Icon name="flag" size={18} /> {t('หน้าทีม', 'Team')}</h2>
        <div className="spacer" />
        <LangSwitch />
      </header>
      <main className="community-main">
        <section className="community-intro">
          <div>
            {tab === 'shops' ? <>
              <h1>{t('แจ้งปัญหาร้าน', 'Shop reports')}</h1>
              <p className="muted">{t('ดูออเดอร์ที่ถูกแจ้ง ข้อความ และสลิปได้ (ไม่เห็นที่อยู่ลูกค้า) เว็บไม่ได้ถือเงิน จึงคืนเงินแทนร้านไม่ได้ แต่ระงับร้านที่ทำผิดข้อกำหนดได้',
                'You can see a reported order, its messages and slip (not the customer’s address). The site doesn’t hold the money, so it can’t refund for a shop, but it can suspend a shop that broke the terms.')}</p>
            </> : tab === 'orders' ? <>
              <h1>{t('ออเดอร์', 'Orders')}</h1>
              <p className="muted">{t('ตรวจสลิปให้ตรงยอด แล้วเลื่อนสถานะตามงานจริง ลูกค้าเห็นสถานะและข้อความในหน้าออเดอร์ของตัวเอง',
                'Check each slip against the total, then move the status along as the work happens. Customers see the status and messages on their order page.')}</p>
            </> : <>
              <h1>{t('การแจ้งปัญหา', 'Reports')}</h1>
              <p className="muted">{t('ตรวจภายใน 7 วันตามข้อกำหนด ลายที่ถูกแจ้งจากผู้ใช้ 3 คนขึ้นไปจะถูกซ่อนให้อัตโนมัติจนกว่าจะตัดสิน',
                'Review within 7 days, as the terms promise. Patterns reported by 3 or more users are hidden automatically until you decide.')}</p>
            </>}
          </div>
        </section>
        {body}
      </main>
    </div>
  );
}

const STATUS_LABEL = {
  published: () => t('แสดงอยู่', 'Visible'),
  hidden: () => t('ซ่อนอยู่', 'Hidden'),
  removed: () => t('นำออกแล้ว', 'Removed'),
};

function ReviewCard({ item, handled, onDecided }: { item: ReviewItem; handled: boolean; onDecided: (postId: string) => void }) {
  const p = usePostPattern(item.post as unknown as Post);
  const [status, setStatus] = useState(item.post.status);
  const [busy, setBusy] = useState<Decision | null>(null);
  const [err, setErr] = useState('');
  const days = Math.floor((Date.now() - new Date(item.reports[0].createdAt).getTime()) / 86400000);

  const act = async (d: Decision) => {
    if (d === 'removed' && !(await askConfirm({
      title: t('นำลายออกจากชุมชน?', 'Remove from the community?'),
      message: <p>{t(<><b>“{item.post.title}”</b> จะไม่แสดงให้คนอื่นเห็นอีก ผู้ออกแบบยังเห็นในหน้าบัญชีว่าถูกนำออก</>,
        <>Nobody else will see <b>“{item.post.title}”</b>. The designer sees it marked as removed on their account page.</>)}</p>,
      ok: t('นำออก', 'Remove'),
      tone: 'danger',
      icon: 'flag',
    }))) return;
    setBusy(d);
    setErr('');
    try {
      await decide(item.post.id, d);
      setStatus(d === 'kept' ? 'published' : d);
      onDecided(item.post.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="review-card">
      <a className="review-thumb" href={`#/c/${item.post.id}`} title={t('เปิดลาย', 'Open pattern')}>
        {p ? <Thumb pattern={p} max={96} view="stitch" /> : <span className="post-wait" aria-hidden="true" />}
      </a>
      <div className="review-main">
        <div className="review-head">
          <a className="review-title" href={`#/c/${item.post.id}`}>{item.post.title}</a>
          <span className={`status-chip ${status}`}>{STATUS_LABEL[status]()}</span>
        </div>
        <div className="post-by">{t('โดย', 'by')} <AuthorName author={item.post.author} at />
          <span className="muted">· {t(`แจ้งทั้งหมด ${item.post.reportCount} ครั้ง`, `${item.post.reportCount} reports in total`)}</span>
          {!handled && days >= 5 && <span className="review-late">{t(`รอมา ${days} วัน`, `waiting ${days} days`)}</span>}
        </div>
        <ul className="review-reports">
          {item.reports.map((r) => (
            <li key={r.id}>
              <span className="chip sm">{REASON_LABEL[r.reason]()}</span>
              <span className="review-when">{when(r.createdAt)} · {r.signedIn ? t('สมาชิก', 'member') : t('ไม่ได้เข้าสู่ระบบ', 'signed out')}</span>
              {r.note && <p className="review-note">{r.note}</p>}
              {handled && r.resolution && <span className="review-done">→ {DECISION_LABEL[r.resolution]()}</span>}
            </li>
          ))}
        </ul>
        <div className="review-actions">
          <button className="btn sm" onClick={() => act('kept')} disabled={!!busy || (handled && status === 'published')}>
            <Icon name="check" size={15} /> {busy === 'kept' ? t('กำลังบันทึก…', 'Saving…') : handled ? t('แสดงอีกครั้ง', 'Show again') : t('ไม่มีปัญหา', 'No problem')}
          </button>
          <button className="btn sm" onClick={() => act('hidden')} disabled={!!busy || (handled && status === 'hidden')}>
            {busy === 'hidden' ? t('กำลังบันทึก…', 'Saving…') : t('ซ่อนไว้', 'Hide')}
          </button>
          <button className="btn sm danger" onClick={() => act('removed')} disabled={!!busy || status === 'removed'}>
            <Icon name="trash" size={15} /> {busy === 'removed' ? t('กำลังบันทึก…', 'Saving…') : t('นำออก', 'Remove')}
          </button>
        </div>
        {err && <p className="error small">{err}</p>}
      </div>
    </article>
  );
}

// ---------- orders ----------

/** The team's side of orders lives on its shop page (#/shop): orders, prices, shipping and PromptPay. */
function OrdersPanel() {
  return (
    <div className="community-msg shop-handoff">
      <p><b>{t('ออเดอร์และราคาอยู่ที่หน้าร้านแล้ว', 'Orders and prices now live on the shop page')}</b></p>
      <p className="muted">{t('ร้านของทีมคือ XStitch.Design ทำออเดอร์ได้ที่แท็บออเดอร์ ตั้งราคา ค่าส่ง และพร้อมเพย์ได้ที่แท็บตั้งค่าร้าน',
        'The team’s shop is XStitch.Design. Work its orders on the Orders tab; set prices, shipping and PromptPay under Shop settings.')}</p>
      <div className="btn-row">
        <a className="btn primary" href="#/shop"><Icon name="cube" size={16} /> {t('ออเดอร์ของร้านทีม', 'Team shop orders')}</a>
        <a className="btn" href="#/shop/settings">{t('ราคาและตั้งค่าร้าน', 'Prices and shop settings')}</a>
      </div>
    </div>
  );
}

// ---------- shop reports ----------

const RESOLUTION_LABEL: Record<string, () => string> = {
  dismissed: () => t('ไม่มีปัญหา', 'No problem found'),
  warned: () => t('เตือนร้านแล้ว', 'Shop warned'),
  suspended: () => t('ระงับร้านแล้ว', 'Shop suspended'),
};

/** Reports about shops: open ones oldest first; handle each by dismissing, warning (by message) or suspending. */
function ShopReportsPanel({ reload }: { reload: number }) {
  const [closed, setClosed] = useState(false);
  const [items, setItems] = useState<ShopReport[] | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    setItems(null);
    listShopReports(!closed).then((x) => { if (live) setItems(x); }).catch((e) => { if (live) setErr((e as Error).message); });
    return () => { live = false; };
  }, [closed, reload, tick]);
  const act = async (r: ShopReport, fn: () => Promise<void>, ask?: Parameters<typeof askConfirm>[0]) => {
    if (ask && !(await askConfirm(ask))) return;
    setBusy(r.id);
    setErr('');
    try { await fn(); setTick((n) => n + 1); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <>
      <label className="check orders-closed">
        <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
        <span>{t('แสดงเฉพาะที่จัดการแล้ว', 'Show handled only')}</span>
      </label>
      {err && <p className="error">{err}</p>}
      {!err && items === null && <StitchLoader small label={t('กำลังโหลด…', 'Loading…')} />}
      {items && !items.length && <div className="community-msg"><p><b>{closed ? t('ยังไม่มีเรื่องที่จัดการแล้ว', 'Nothing handled yet') : t('ไม่มีเรื่องที่รอดู', 'Nothing to look at')}</b></p></div>}
      {items && items.length > 0 && (
        <div className="review-list">
          {items.map((r) => (
            <article key={r.id} className="review-card shop-report-card">
              <div className="review-main">
                <div className="review-head">
                  <b>{r.shopName}</b>
                  <span className="status-chip hidden">{reportReasonLabel(r.reason)}</span>
                  <span className="review-when">{when(r.createdAt)}</span>
                </div>
                {r.note && <p className="review-note">{r.note}</p>}
                {r.resolution && <p className="muted small">{RESOLUTION_LABEL[r.resolution]?.() ?? r.resolution}</p>}
                <div className="review-actions">
                  {r.orderCode && <a className="btn sm" href={`#/order/${r.orderCode}`}><Icon name="cube" size={15} /> {t(`ดูออเดอร์ ${r.orderCode}`, `Open order ${r.orderCode}`)}</a>}
                  <a className="btn sm" href={`#/shops/${r.shopId}`}>{t('ดูหน้าร้าน', 'View shop')}</a>
                  {!r.resolvedAt && <>
                    <button className="btn sm" disabled={busy === r.id} onClick={() => act(r, () => resolveShopReport(r, 'dismissed'))}>{t('ไม่มีปัญหา', 'No problem')}</button>
                    <button className="btn sm" disabled={busy === r.id} onClick={() => act(r, () => resolveShopReport(r, 'warned'))}>{t('เตือนแล้ว', 'Warned')}</button>
                    <button className="btn sm danger" disabled={busy === r.id} onClick={() => act(r, () => resolveShopReport(r, 'suspended'), {
                      title: t(`ระงับร้าน ${r.shopName}?`, `Suspend ${r.shopName}?`),
                      message: <p>{t('ร้านจะไม่ได้รับออเดอร์ใหม่และหายจากรายชื่อ แต่ยังต้องทำออเดอร์ที่ค้างอยู่ให้เสร็จหรือคืนเงิน ยกเลิกการระงับได้ภายหลัง',
                        'The shop gets no new orders and leaves the listings, but must still finish or refund its open orders. You can lift it later.')}</p>,
                      ok: t('ระงับร้าน', 'Suspend shop'), tone: 'danger',
                    })}>{t('ระงับร้าน', 'Suspend shop')}</button>
                  </>}
                  {r.resolution === 'suspended' && (
                    <button className="btn sm ghost" disabled={busy === r.id} onClick={() => act(r, () => setShopSuspended(r.shopId, false))}>{t('ยกเลิกการระงับร้าน', 'Lift the suspension')}</button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
