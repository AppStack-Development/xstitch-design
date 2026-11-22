import { useEffect, useMemo, useState } from 'react';
import { StitchLoader } from '../components/StitchLoader';
import { ShopOrderCard } from '../components/ShopOrderCard';
import { AccountButton } from '../components/AccountButton';
import { Icon } from '../components/Icon';
import { useCloud } from '../lib/cloud';
import { t } from '../lib/i18n';
import { PRODUCTS, SIZES, SIZE_LIMITS, promptPayPayload, type Material, type Order } from '../lib/orders';
import {
  STAGES, STAGE_OF, getRates, getShopPayment, openShop, rateKey, saveRates, saveShop, saveShopPayment, shopOrders, shopProblem, shopsIWork,
  type Rates, type Shop, type ShopEdit, type ShopPayment, type Stage,
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
    body = <OpenShop onOpened={() => { setReload((n) => n + 1); location.hash = '#/shop/settings'; }} />;
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
        <p className="hint shop-public-link"><a className="acct-link" href={`#/shops/${shop.id}`}>{t('ดูหน้าร้านที่ลูกค้าเห็น (ราคา ลายที่ขาย รีวิว)', 'See your public shop page (prices, patterns for sale, reviews)')}</a></p>
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
  const current = stage ?? (['quote', 'accept', 'slip', 'make'] as Stage[]).find((s) => counts[s] > 0) ?? 'payment';
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
  const [v, setV] = useState<ShopEdit>({
    name: shop.name, about: shop.about, accepting: shop.accepting, leadTime: shop.leadTime, shippingThb: shop.shippingThb,
    stitchRate: shop.stitchRate, kitNote: shop.kitNote, quoteMaterials: shop.quoteMaterials,
  });
  const toggleQuote = (m: Material, on: boolean) =>
    setV({ ...v, quoteMaterials: on ? [...v.quoteMaterials.filter((x) => x !== m), m] : v.quoteMaterials.filter((x) => x !== m) });
  const [rateText, setRateText] = useState<Record<string, string> | null>(null);
  const [rateStr, setRateStr] = useState(shop.stitchRate ? shop.stitchRate.toFixed(2) : '0');
  const [pay, setPay] = useState<ShopPayment | null>(null);
  const [savedPay, setSavedPay] = useState<ShopPayment | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    getShopPayment(shop.id).then((p) => { if (live) { setPay(p); setSavedPay(p); } }).catch((e) => { if (live) setErr((e as Error).message); });
    getRates(shop.id).then((r) => { if (live) setRateText(Object.fromEntries(Object.entries(r).map(([k, n]) => [k, String(n)]))); })
      .catch((e) => { if (live) setErr((e as Error).message); });
    return () => { live = false; };
  }, [shop.id]);
  const rates: Rates = Object.fromEntries(Object.entries(rateText ?? {}).filter(([, x]) => x.trim() !== '').map(([k, x]) => [k, Number(x)]));
  const badRate = Object.values(rates).some((n) => !Number.isInteger(n) || n < 1 || n > 100000);
  const problem = shopProblem(v)
    ?? (badRate ? t('ราคาต้องเป็นตัวเลขเต็ม 1–100,000 บาท (เว้นว่าง = ไม่รับ)', 'Prices are whole numbers, 1–100,000 THB (blank = not offered)') : null)
    ?? (pay?.promptpayId.trim() && !promptPayPayload(pay.promptpayId, 1) ? t('พร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลข 13 หลัก', 'PromptPay must be a 10-digit mobile number or a 13-digit id') : null);
  const save = async () => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await saveShop(shop.id, v);
      if (rateText) await saveRates(shop.id, rates);
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
      <h4>{t('ราคารับผลิต', 'Your prices')}</h4>
      <p className="hint">{t('ใส่ราคาเฉพาะสินค้าและขนาดที่ร้านทำได้ ช่องที่เว้นว่างลูกค้าจะสั่งไม่ได้ ราคานี้ใช้ทั้งลายที่ลูกค้าออกแบบเองและส่งมาให้ผลิต',
        'Fill in only what your shop makes; blank = not offered. These prices apply to designs customers bring you.')}</p>
      {rateText === null ? <p className="muted small">{t('กำลังโหลด…', 'Loading…')}</p> : (['3d', 'fabric'] as Material[]).map((m) => (
        <RateCard key={m} material={m} text={rateText} onChange={(k, x) => setRateText({ ...rateText, [k]: x.replace(/[^0-9]/g, '') })} />
      ))}
      <div className="order-pay-fields">
        <label className="fb-field"><span>{t('งานปักเสร็จ: บวกค่าปักต่อฝีเข็ม (บาท)', 'Stitched pieces: add per stitch (THB)')}</span>
          <input inputMode="decimal" value={rateStr} onChange={(e) => { setRateStr(e.target.value); setV({ ...v, stitchRate: Number(e.target.value) || 0 }); }} /></label>
        <label className="fb-field"><span>{t('ในชุดปักของร้านมีอะไรบ้าง (ไม่บังคับ)', 'What your kits include (optional)')}</span>
          <input value={v.kitNote} maxLength={300} placeholder={t('เช่น ผ้า ด้าย DMC เข็ม สะดึง 6 นิ้ว', 'e.g. fabric, DMC threads, needle, 6" hoop')} onChange={(e) => setV({ ...v, kitNote: e.target.value })} /></label>
      </div>
      <p className="hint">{t('งานปักเสร็จคิดราคา = ราคาตั้งต้นตามขนาด + ค่าปักต่อฝีเข็ม × จำนวนฝีเข็มของลาย แล้วปัดขึ้นให้ลงท้ายด้วย 9 เช่น 159 + 0.30 × 214 = 223.2 → 229 บาท',
        'Stitched pieces = the price for the size + the per-stitch rate × the pattern’s stitches, rounded up to end in 9, e.g. 159 + 0.30 × 214 = 223.2 → 229.')}</p>

      <h4>{t('รับขอใบเสนอราคา', 'Quote requests')}</h4>
      <p className="hint">{t('ลูกค้าขอราคาได้สำหรับงานที่ไม่มีในตารางราคา เช่น ลายใหญ่กว่าขนาด L (สูงสุด 1 เมตร) หรือสินค้าที่ร้านไม่ได้ตั้งราคาไว้ ร้านมี 3 วันเสนอราคาหรือปฏิเสธ',
        'Customers can ask for a price on what your table doesn’t list, like designs larger than L (up to 1 m) or products you haven’t priced. You have 3 days to quote or decline.')}</p>
      <div className="shop-quote-pick">
        {(['3d', 'fabric'] as Material[]).map((m) => (
          <label key={m} className="check"><input type="checkbox" checked={v.quoteMaterials.includes(m)} onChange={(e) => toggleQuote(m, e.target.checked)} />
            <span>{m === '3d' ? t('ชิ้นงานพิมพ์ 3D', '3D-printed pieces') : t('ลายบนผ้า', 'On fabric')}</span></label>
        ))}
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
      {problem && <p className="error small">{problem}</p>}
      {err && <p className="error small">{err}</p>}
      <div className="btn-row">
        <button className="btn primary" disabled={busy || !!problem} onClick={save}>{busy ? t('กำลังบันทึก…', 'Saving…') : t('บันทึก', 'Save')}</button>
        {msg && <span className="hint">{msg}</span>}
      </div>
    </section>
  );
}

/** One material's prices: products down the side, sizes across; blank = not offered. */
function RateCard({ material, text, onChange }: { material: Material; text: Record<string, string>; onChange: (key: string, value: string) => void }) {
  const products = PRODUCTS.filter((p) => p.material === material);
  return (
    <div className="rate-card">
      <b>{material === '3d' ? t('ชิ้นงานพิมพ์ 3D', '3D-printed pieces') : t('ลายบนผ้า', 'On fabric')}</b>
      <table className="order-price-table">
        <thead><tr><th>{t('บาท/ชิ้น', 'THB per piece')}</th>{SIZES.map((s) => <th key={s}>{s} <small>≤{SIZE_LIMITS[material].find(([x]) => x === s)![1] / 10} {t('ซม.', 'cm')}</small></th>)}</tr></thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <th>{p.name()}{p.perStitch && <small> {t('(ราคาตั้งต้น)', '(base price)')}</small>}</th>
              {SIZES.map((s) => {
                const k = rateKey(p.id, s);
                return <td key={s}><input inputMode="numeric" placeholder="–" value={text[k] ?? ''} onChange={(e) => onChange(k, e.target.value)} aria-label={`${p.name()} ${s}`} /></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Open a shop: a name, PromptPay (can come later) and the seller terms; prices are set next. */
function OpenShop({ onOpened }: { onOpened: () => void }) {
  const [name, setName] = useState('');
  const [pay, setPay] = useState<ShopPayment>({ promptpayId: '', promptpayName: '' });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const badPP = !!pay.promptpayId.trim() && !promptPayPayload(pay.promptpayId, 1);
  const go = async () => {
    setBusy(true);
    setErr('');
    try { await openShop(name, pay); onOpened(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <section className="order-card-box shop-settings">
      <h3><Icon name="cube" size={18} /> {t('เปิดร้านรับผลิต', 'Open a shop')}</h3>
      <p className="muted">{t('รับผลิตลายที่ลูกค้าออกแบบเองเป็นชิ้นงาน 3D หรือลายบนผ้า ตั้งราคาเอง ลูกค้าโอนเข้าพร้อมเพย์ของร้านโดยตรง เว็บไม่ได้ถือเงินแทนและไม่เก็บค่าธรรมเนียม',
        'Make customers’ own designs as 3D pieces or on fabric, at your own prices. Customers pay your PromptPay directly; the site never holds the money and takes no fee.')}</p>
      <label className="fb-field"><span>{t('ชื่อร้าน', 'Shop name')}</span><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t('เช่น ปักเพลิน Studio', 'e.g. Little Cross Studio')} /></label>
      <div className="order-pay-fields">
        <label className="fb-field"><span>{t('พร้อมเพย์ (ใส่ภายหลังได้)', 'PromptPay (can add later)')}</span><input inputMode="numeric" autoComplete="off" value={pay.promptpayId} onChange={(e) => setPay({ ...pay, promptpayId: e.target.value })} /></label>
        <label className="fb-field"><span>{t('ชื่อบัญชีที่ลูกค้าจะเห็น', 'Account name customers see')}</span><input value={pay.promptpayName} maxLength={100} onChange={(e) => setPay({ ...pay, promptpayName: e.target.value })} /></label>
      </div>
      <ul className="shop-open-notes small">
        <li>{t('ร้านจะเริ่มแสดงให้ลูกค้าเห็นเมื่อใส่ราคาและพร้อมเพย์แล้ว', 'Your shop shows to customers once it has prices and PromptPay.')}</li>
        <li>{t('ร้านใหม่รับออเดอร์ที่ยังไม่ปิดได้ครั้งละ 3 ออเดอร์ จนส่งสำเร็จครบ 3 ออเดอร์แรก', 'A new shop holds up to 3 open orders at a time until it has delivered 3.')}</li>
        <li>{t('ร้านเห็นชื่อ เบอร์โทร และที่อยู่ลูกค้าเฉพาะออเดอร์ของร้าน ใช้ได้เพื่อผลิตและจัดส่งออเดอร์นั้นเท่านั้น', 'You see a customer’s name, phone and address only on your orders, to make and send that order only.')}</li>
      </ul>
      <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>{t(<>ฉันอ่านและยอมรับ <a href="#/seller-terms" target="_blank" rel="noopener">ข้อกำหนดผู้ขาย</a> แล้ว</>, <>I’ve read and accept the <a href="#/seller-terms" target="_blank" rel="noopener">seller terms</a></>)}</span></label>
      {badPP && <p className="error small">{t('พร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลข 13 หลัก', 'PromptPay must be a 10-digit mobile number or a 13-digit id')}</p>}
      {err && <p className="error small">{err}</p>}
      <div className="btn-row">
        <button className="btn primary" disabled={busy || name.trim().length < 2 || !agree || badPP} onClick={go}>{busy ? t('กำลังเปิดร้าน…', 'Opening…') : t('เปิดร้าน', 'Open shop')}</button>
        <a className="btn" href="#/account">{t('ไว้ทีหลัง', 'Not now')}</a>
      </div>
    </section>
  );
}
