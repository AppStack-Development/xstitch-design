import { useEffect, useMemo, useState } from 'react';
import { StitchLoader } from '../components/StitchLoader';
import { ShopOrderCard } from '../components/ShopOrderCard';
import { AccountButton } from '../components/AccountButton';
import { Icon } from '../components/Icon';
import { useCloud } from '../lib/cloud';
import { t } from '../lib/i18n';
import { promptPayPayload, type Order } from '../lib/orders';
import {
  STAGES, STAGE_OF, getShopPayment, saveShop, saveShopPayment, shopOrders, shopProblem, shopsIWork,
  type Shop, type ShopEdit, type ShopPayment, type Stage,
} from '../lib/shops';

/**
 * "#/shop": the orders placed with your shop, grouped by what the shop does next, and "#/shop/settings":
 * the shop's name, lead time, shipping fee, PromptPay and "closed for now". Moderators also work the team's
 * shop here (and switch between it and their own).
 */
export function ShopPage({ view }: { view: 'orders' | 'settings' }) {
  const cloud = useCloud();
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [shopId, setShopId] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (cloud.status !== 'signed-in') return;
    let live = true;
    shopsIWork().then((list) => {
      if (!live) return;
      setShops(list);
      setShopId((cur) => (cur && list.some((s) => s.id === cur) ? cur : list[0]?.id ?? null));
    }).catch((e) => { if (live) setErr((e as Error).message); });
    return () => { live = false; };
  }, [cloud.status, cloud.user?.id, reload]);
  const shop = shops?.find((s) => s.id === shopId) ?? null;

  let body: JSX.Element;
  if (cloud.status === 'loading') body = <p className="muted">{t('กำลังตรวจสอบบัญชี…', 'Checking your account…')}</p>;
  else if (cloud.status !== 'signed-in') {
    body = (
      <div className="community-msg">
        <p><b>{t('เข้าสู่ระบบเพื่อดูร้านของคุณ', 'Sign in to see your shop')}</b></p>
        <a className="btn primary" href="#/account">{t('ไปหน้าเข้าสู่ระบบ', 'Go to sign in')}</a>
      </div>
    );
  } else if (err) body = <p className="error">{err}</p>;
  else if (shops === null) body = <StitchLoader label={t('กำลังโหลด…', 'Loading…')} />;
  else if (!shop) {
    body = (
      <div className="community-msg">
        <p><b>{t('คุณยังไม่มีร้าน', 'You don’t have a shop yet')}</b></p>
        <p className="muted">{t('การเปิดร้านรับผลิตกำลังจะเปิดให้ทุกคนเร็ว ๆ นี้', 'Opening a shop will be open to everyone soon.')}</p>
        <a className="btn" href="#/account">{t('กลับไปหน้าของฉัน', 'Back to My stuff')}</a>
      </div>
    );
  } else {
    body = (
      <>
        {shops.length > 1 && (
          <div className="rz-chips shop-switch" role="group" aria-label={t('เลือกร้าน', 'Choose a shop')}>
            {shops.map((s) => <button key={s.id} className={'chip' + (s.id === shop.id ? ' on' : '')} onClick={() => setShopId(s.id)}>{s.name}</button>)}
          </div>
        )}
        <nav className="tabs shop-tabs">
          <a className={view === 'orders' ? 'on' : ''} href="#/shop">{t('ออเดอร์', 'Orders')}</a>
          <a className={view === 'settings' ? 'on' : ''} href="#/shop/settings">{t('ตั้งค่าร้าน', 'Shop settings')}</a>
        </nav>
        {shop.suspended && <p className="error">{t('ร้านนี้ถูกระงับโดยทีม ไม่รับออเดอร์ใหม่ แต่ยังทำออเดอร์ที่ค้างอยู่ให้เสร็จได้', 'This shop is suspended by the team: no new orders, but you can finish the ones you have.')}</p>}
        {!shop.accepting && !shop.suspended && <p className="hint shop-closed">{t('ร้านปิดรับออเดอร์ชั่วคราวอยู่', 'The shop is closed for new orders for now.')} <a className="acct-link" href="#/shop/settings">{t('เปิดรับอีกครั้ง', 'Open again')}</a></p>}
        {view === 'orders'
          ? <ShopOrders key={shop.id} shop={shop} />
          : <ShopSettings key={shop.id} shop={shop} onSaved={() => setReload((n) => n + 1)} />}
      </>
    );
  }

  return (
    <div className="community-page shop-page">
      <header className="site-head">
        <a className="icon-btn" href="#/account" title={t('กลับไปหน้าของฉัน', 'Back to My stuff')} aria-label={t('กลับไปหน้าของฉัน', 'Back to My stuff')}><Icon name="back" /></a>
        <h2><Icon name="cube" size={18} /> {shop ? shop.name : t('ร้านของฉัน', 'My shop')}</h2>
        <div className="spacer" />
        <AccountButton />
      </header>
      <main className="community-main shop-main">{body}</main>
    </div>
  );
}

/** Orders by what the shop has to do next; the busiest stage that needs the shop opens first. */
function ShopOrders({ shop }: { shop: Shop }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [err, setErr] = useState('');
  const [stage, setStage] = useState<Stage | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    shopOrders(shop.id).then((list) => { if (live) setOrders(list); }).catch((e) => { if (live) setErr((e as Error).message); });
    return () => { live = false; };
  }, [shop.id, reload]);
  // a refresh when the tab comes back, so new orders and slips show up
  useEffect(() => {
    const back = () => { if (document.visibilityState === 'visible') setReload((n) => n + 1); };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, []);
  const counts = useMemo(() => {
    const c = Object.fromEntries(STAGES.map((s) => [s.id, 0])) as Record<Stage, number>;
    for (const o of orders ?? []) c[STAGE_OF[o.status]]++;
    return c;
  }, [orders]);
  if (err) return <p className="error">{err}</p>;
  if (!orders) return <StitchLoader small label={t('กำลังโหลด…', 'Loading…')} />;
  const current = stage ?? (['accept', 'slip', 'make'] as Stage[]).find((s) => counts[s] > 0) ?? 'payment';
  const list = orders.filter((o) => STAGE_OF[o.status] === current);
  return (
    <>
      <div className="rz-chips shop-stages" role="tablist">
        {STAGES.map((s) => (
          <button key={s.id} role="tab" aria-selected={s.id === current} className={'chip' + (s.id === current ? ' on' : '')} onClick={() => setStage(s.id)}>
            {s.label()}{s.id !== 'closed' && counts[s.id] > 0 && <b className="shop-count">{counts[s.id]}</b>}
          </button>
        ))}
      </div>
      {list.length === 0
        ? <div className="community-msg"><p className="muted">{t('ไม่มีออเดอร์ในขั้นนี้', 'No orders at this step')}</p></div>
        : <div className="review-list">{list.map((o) => <ShopOrderCard key={`${o.id}:${o.updatedAt}`} order={o} shop={shop} onChanged={() => setReload((n) => n + 1)} />)}</div>}
    </>
  );
}

function ShopSettings({ shop, onSaved }: { shop: Shop; onSaved: () => void }) {
  const [v, setV] = useState<ShopEdit>({ name: shop.name, about: shop.about, accepting: shop.accepting, leadTime: shop.leadTime, shippingThb: shop.shippingThb });
  const [pay, setPay] = useState<ShopPayment | null>(null);
  const [savedPay, setSavedPay] = useState<ShopPayment | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    getShopPayment(shop.id).then((p) => { if (live) { setPay(p); setSavedPay(p); } }).catch((e) => { if (live) setErr((e as Error).message); });
    return () => { live = false; };
  }, [shop.id]);
  const problem = shopProblem(v)
    ?? (pay?.promptpayId.trim() && !promptPayPayload(pay.promptpayId, 1) ? t('พร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลข 13 หลัก', 'PromptPay must be a 10-digit mobile number or a 13-digit id') : null);
  const save = async () => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await saveShop(shop.id, v);
      if (pay && (pay.promptpayId !== savedPay?.promptpayId || pay.promptpayName !== savedPay?.promptpayName)) {
        await saveShopPayment(shop.id, pay);
        setSavedPay(pay);
      }
      setMsg(t('บันทึกแล้ว', 'Saved'));
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="order-card-box shop-settings">
      <label className="fb-field"><span>{t('ชื่อร้าน', 'Shop name')}</span><input value={v.name} maxLength={60} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
      <label className="fb-field"><span>{t('แนะนำร้าน (ไม่บังคับ)', 'About the shop (optional)')}</span><textarea value={v.about} rows={2} maxLength={500} onChange={(e) => setV({ ...v, about: e.target.value })} /></label>
      <div className="order-pay-fields">
        <label className="fb-field"><span>{t('ผลิตเสร็จใน', 'Ready in')}</span><input value={v.leadTime} maxLength={30} placeholder={t('เช่น 5–7 วัน', 'e.g. 5–7 days')} onChange={(e) => setV({ ...v, leadTime: e.target.value })} /></label>
        <label className="fb-field"><span>{t('ค่าส่ง (บาท/ออเดอร์)', 'Shipping (THB per order)')}</span><input inputMode="numeric" value={String(v.shippingThb)} onChange={(e) => setV({ ...v, shippingThb: Number(e.target.value.replace(/[^0-9]/g, '') || 0) })} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={v.accepting} onChange={(e) => setV({ ...v, accepting: e.target.checked })} />
        <span>{t('เปิดรับออเดอร์', 'Taking orders')} <small>{t('ปิดไว้ถ้าคิวเต็มหรือไม่อยู่ ออเดอร์ที่ค้างอยู่ยังทำต่อได้', 'Turn off when you’re full or away; open orders carry on.')}</small></span></label>

      <h4>{t('รับเงินผ่านพร้อมเพย์', 'Payment by PromptPay')}</h4>
      {pay === null ? <p className="muted small">{t('กำลังโหลด…', 'Loading…')}</p> : (
        <div className="order-pay-fields">
          <label className="fb-field"><span>{t('พร้อมเพย์ (เบอร์มือถือหรือเลขผู้เสียภาษี)', 'PromptPay (mobile or tax id)')}</span><input inputMode="numeric" autoComplete="off" value={pay.promptpayId} onChange={(e) => setPay({ ...pay, promptpayId: e.target.value })} /></label>
          <label className="fb-field"><span>{t('ชื่อบัญชีที่ลูกค้าจะเห็น', 'Account name customers see')}</span><input value={pay.promptpayName} maxLength={100} onChange={(e) => setPay({ ...pay, promptpayName: e.target.value })} /></label>
        </div>
      )}
      <p className="hint">{t('ลูกค้าเห็นพร้อมเพย์เฉพาะออเดอร์ที่ร้านรับแล้วและยังรอชำระเงิน เงินโอนเข้าบัญชีร้านโดยตรง เว็บไม่ได้ถือเงินแทน',
        'Customers see your PromptPay only on orders you’ve accepted that are waiting for payment. Money goes straight to you; the site never holds it.')}</p>
      {shop.official && <p className="hint">{t('ราคาของร้านทีมตั้งในหน้าทีม', 'The team shop’s prices are set on the team page.')} <a className="acct-link" href="#/moderation/orders">{t('ไปหน้าราคา', 'Go to prices')}</a></p>}
      {problem && <p className="error small">{problem}</p>}
      {err && <p className="error small">{err}</p>}
      <div className="btn-row">
        <button className="btn primary" disabled={busy || !!problem} onClick={save}>{busy ? t('กำลังบันทึก…', 'Saving…') : t('บันทึก', 'Save')}</button>
        {msg && <span className="hint">{msg}</span>}
      </div>
    </section>
  );
}
