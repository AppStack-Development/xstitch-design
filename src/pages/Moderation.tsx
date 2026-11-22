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
import { TeamBadge, usePostPattern } from '../components/PostCard';
import { PRODUCTS, SIZE_LIMITS, loadPricing, ordersEnabled, saveConfig } from '../lib/orders';

type Tab = 'open' | 'handled' | 'orders';

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
    if (!allowed || tab === 'orders') return;
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
            {ordersEnabled && <button role="tab" aria-selected={tab === 'orders'} className={tab === 'orders' ? 'on' : ''} onClick={() => setTab('orders')}>{t('ออเดอร์', 'Orders')}</button>}
          </div>
          <button className="btn sm ghost" onClick={() => setReload((n) => n + 1)}><Icon name="sync" size={15} /> {t('โหลดใหม่', 'Refresh')}</button>
        </div>
        {tab === 'orders' ? <OrdersPanel /> : <>
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
            {tab === 'orders' ? <>
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
        <div className="post-by">{t('โดย', 'by')} <b>{item.post.author.name}</b>{item.post.author.official && <TeamBadge />}
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

/** The team's side of orders: the team shop's prices here; the orders themselves on the shop page (#/shop). */
function OrdersPanel() {
  return (
    <>
      <div className="community-msg shop-handoff">
        <p><b>{t('ออเดอร์ย้ายไปที่หน้าร้านแล้ว', 'Orders now live on the shop page')}</b></p>
        <p className="muted">{t('ทุกออเดอร์เป็นของร้าน ร้านของทีมคือ XStitch.Design ทำออเดอร์ ตั้งค่าส่ง และพร้อมเพย์ได้ที่หน้าร้าน',
          'Every order belongs to a shop; the team’s is XStitch.Design. Work its orders and set its shipping and PromptPay on the shop page.')}</p>
        <a className="btn primary" href="#/shop"><Icon name="cube" size={16} /> {t('ไปที่ออเดอร์ของร้านทีม', 'Go to the team shop’s orders')}</a>
      </div>
      <PricingEditor />
    </>
  );
}

/** The team shop's prices per piece by size, and the per-stitch rate for fully stitched pieces. */
function PricingEditor() {
  const [vals, setVals] = useState<Record<string, string> | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    let live = true;
    loadPricing().then((p) => {
      if (!live) return;
      const v: Record<string, string> = { stitch_rate: Number.isFinite(p.stitchRateSatang) ? (p.stitchRateSatang / 100).toFixed(2) : '' };
      for (const pr of PRODUCTS) for (const [s] of SIZE_LIMITS) v[`price:${pr.id}:${s}`] = String(p.prices[`${pr.id}:${s}`] ?? '');
      setVals(v);
      setSaved(v);
    }).catch((e) => setMsg((e as Error).message));
    return () => { live = false; };
  }, []);
  if (!vals) return msg ? <p className="error small">{msg}</p> : null;
  const changed = Object.keys(vals).filter((k) => vals[k] !== saved[k]);
  const badNumber = Object.keys(vals).some((k) => k.startsWith('price:') && !/^[0-9]{1,6}$/.test(vals[k].trim()));
  const badRate = !/^[0-9]{1,2}(\.[0-9]{1,2})?$/.test(vals.stitch_rate.trim());
  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      await saveConfig(Object.fromEntries(changed.map((k) => [k, vals[k]])));
      setSaved({ ...vals });
      setMsg(t('บันทึกแล้ว ใช้กับออเดอร์ใหม่ตั้งแต่ตอนนี้', 'Saved; applies to new orders from now on.'));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setVals({ ...vals, [k]: e.target.value });
  return (
    <details className="order-pricing" open>
      <summary><Icon name="edit" size={15} /> {t('ราคาของร้านทีม', 'The team shop’s prices')}<span className="order-pricing-edit">{t('แก้ไข', 'Edit')}</span></summary>
      <table className="order-price-table">
        <thead><tr><th>{t('บาท/ชิ้น', 'THB per piece')}</th>{SIZE_LIMITS.map(([s, mm]) => <th key={s}>{s} <small>≤{mm / 10} {t('ซม.', 'cm')}</small></th>)}</tr></thead>
        <tbody>
          {PRODUCTS.map((pr) => (
            <tr key={pr.id}><th>{pr.name()}{pr.id === 'stitched' && <small> {t('(ราคาตั้งต้น)', '(starting price)')}</small>}</th>
              {SIZE_LIMITS.map(([s]) => <td key={s}><input inputMode="numeric" value={vals[`price:${pr.id}:${s}`]} onChange={set(`price:${pr.id}:${s}`)} aria-label={`${pr.name()} ${s}`} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="order-pay-fields">
        <label className="fb-field"><span>{t('ปักเสร็จ: ค่าปักต่อฝีเข็ม (บาท)', 'Fully stitched: per stitch (THB)')}</span><input inputMode="decimal" value={vals.stitch_rate} onChange={set('stitch_rate')} /></label>
      </div>
      <p className="hint">{t('ปักเสร็จคิดราคา = ราคาตั้งต้นตามขนาด + ค่าปักต่อฝีเข็ม × จำนวนฝีเข็มของลาย แล้วปัดขึ้นให้ลงท้ายด้วย 9 เช่น 159 + 0.30 × 214 = 223.2 → 229 บาท',
        'Fully stitched = the starting price for the size + the per-stitch rate × the pattern’s stitches, rounded up to end in 9, e.g. 159 + 0.30 × 214 = 223.2 → 229.')}</p>
      <p className="hint">{t('ราคาใหม่ใช้กับออเดอร์ที่สั่งหลังบันทึก ออเดอร์เดิมคงราคาเดิม ค่าส่งและพร้อมเพย์อยู่ในหน้าตั้งค่าร้าน',
        'New prices apply to orders placed after saving; existing orders keep theirs. Shipping and PromptPay are in the shop settings.')}</p>
      {badNumber && <p className="error small">{t('ราคาต้องเป็นตัวเลขเต็ม', 'Prices must be whole numbers')}</p>}
      {badRate && <p className="error small">{t('ค่าปักต่อฝีเข็มต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง เช่น 0.30', 'The per-stitch rate must be a number with up to 2 decimals, e.g. 0.30')}</p>}
      <div className="btn-row">
        <button className="btn primary sm" onClick={save} disabled={busy || !changed.length || badNumber || badRate}>{busy ? t('กำลังบันทึก…', 'Saving…') : t('บันทึกราคา', 'Save')}</button>
        {msg && <span className="hint">{msg}</span>}
      </div>
    </details>
  );
}
