import { Fragment, useEffect, useRef, useState } from 'react';
import { StitchLoader } from '../components/StitchLoader';
import { askConfirm } from '../components/ConfirmDialog';
import qrcode from 'qrcode-generator';
import type { Pattern } from '../types';
import {
  SIZE_LABEL, STATUS_LABEL, baht, cancelOrder, cm, confirmReceived, getOrder, pieceMm, productName,
  promptPayPayload, slipUrl, uploadSlip, type Order, type OrderStatus,
} from '../lib/orders';
import { getShop, orderPayment, type Shop, type ShopPayment } from '../lib/shops';
import { useCloud } from '../lib/cloud';
import { decodeShare } from '../lib/share';
import { trackStep } from '../lib/analytics';
import { t, locale } from '../lib/i18n';
import { templateLabel } from '../lib/templates';
import { Thumb } from '../components/Thumb';
import { Icon } from '../components/Icon';
import { AccountButton } from '../components/AccountButton';
import { OrderThread } from '../components/OrderThread';

const day = (iso: string) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** The steps a customer sees, and which one each status sits on. */
const STEPS = [
  () => t('ร้านรับออเดอร์', 'Accepted'), () => t('ชำระเงิน', 'Payment'), () => t('ผลิต', 'Making'),
  () => t('จัดส่ง', 'Shipped'), () => t('ได้รับ', 'Received'),
];
const STEP_OF: Record<OrderStatus, number> = {
  awaiting_accept: 0, awaiting_payment: 1, payment_review: 1, paid: 2, in_production: 2, shipped: 3, done: 5, cancelled: -1,
};

/** "#/order/<code>": one order, for the customer who placed it (the shop works it on #/shop). */
export function OrderPage({ code }: { code: string }) {
  const cloud = useCloud();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (cloud.status !== 'signed-in') return;
    let live = true;
    getOrder(code).then((o) => { if (live) setOrder(o); }).catch((e) => { if (live) setErr((e as Error).message); });
    return () => { live = false; };
  }, [code, cloud.status, cloud.user?.id, reload]);
  useEffect(() => { trackStep('/order/3-page'); }, []);

  let body: JSX.Element;
  if (cloud.status === 'loading') body = <p className="muted">{t('กำลังตรวจสอบบัญชี…', 'Checking your account…')}</p>;
  else if (cloud.status !== 'signed-in') {
    body = (
      <div className="community-msg">
        <p><b>{t('เข้าสู่ระบบเพื่อดูออเดอร์', 'Sign in to see this order')}</b></p>
        <a className="btn primary" href="#/account">{t('ไปหน้าเข้าสู่ระบบ', 'Go to sign in')}</a>
      </div>
    );
  } else if (err) body = <p className="error">{err}</p>;
  else if (order === undefined) body = <StitchLoader label={t('กำลังโหลด…', 'Loading…')} />;
  else if (order === null) {
    body = (
      <div className="community-msg">
        <p><b>{t('ไม่พบออเดอร์นี้', 'Order not found')}</b></p>
        <p className="muted">{t('ออเดอร์จะเห็นได้เฉพาะบัญชีที่สั่ง ลองเข้าสู่ระบบด้วยบัญชีนั้น', 'An order is only visible to the account that placed it.')}</p>
        <a className="btn" href="#/account">{t('ไปหน้าของฉัน', 'Go to My stuff')}</a>
      </div>
    );
  } else body = <OrderView order={order} onChanged={() => setReload((n) => n + 1)} />;

  return (
    <div className="community-page order-page">
      <header className="site-head">
        <a className="icon-btn" href="#/account" title={t('กลับไปหน้าของฉัน', 'Back to My stuff')} aria-label={t('กลับไปหน้าของฉัน', 'Back to My stuff')}><Icon name="back" /></a>
        <h2><Icon name="cube" size={18} /> {t('ออเดอร์', 'Order')} {code}</h2>
        <div className="spacer" />
        <AccountButton />
      </header>
      <main className="community-main order-main">{body}</main>
    </div>
  );
}

function OrderView({ order: o, onChanged }: { order: Order; onChanged: () => void }) {
  const [p, setP] = useState<Pattern | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  useEffect(() => {
    let live = true;
    decodeShare(o.data).then((x) => { if (live) setP({ ...x, name: o.title }); }).catch(() => { /* no preview */ });
    if (o.shopId) getShop(o.shopId).then((x) => { if (live) setShop(x); }).catch(() => { /* named "the shop" */ });
    return () => { live = false; };
  }, [o.data, o.title, o.shopId]);
  const shopName = shop?.name ?? t('ร้าน', 'the shop');
  const step = STEP_OF[o.status];
  const { w, h } = pieceMm(o);

  return (
    <>
      <section className="order-card-box order-status">
        <div className="order-status-head">
          <span className={'status-chip ' + (o.status === 'cancelled' ? 'removed' : o.status === 'done' ? 'published' : 'hidden')}>{STATUS_LABEL[o.status]()}</span>
          <span className="muted small">{t('สั่งเมื่อ', 'Ordered')} {day(o.createdAt)}{shop && <> · {t(`ร้าน ${shop.name}`, shop.name)}</>}</span>
        </div>
        {step >= 0 && (
          <ol className="order-steps" aria-label={t('ขั้นตอน', 'Progress')}>
            {STEPS.map((s, i) => (
              <li key={i} className={i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}>
                <i>{i < step ? <Icon name="check" size={14} /> : i + 1}</i><span>{s()}</span>
              </li>
            ))}
          </ol>
        )}
        <NextStep order={o} shop={shop} onChanged={onChanged} />
      </section>

      <section className="order-card-box">
        <h3>{t('รายละเอียด', 'Details')}</h3>
        <div className="order-detail">
          <a className="review-thumb" href={`#/s/${o.data}`} title={t('ดูลาย', 'View pattern')}>
            {p ? <Thumb pattern={p} max={96} view="stitch" /> : <span className="post-wait" aria-hidden="true" />}
          </a>
          <div>
            <b>{o.title}</b>
            <p className="muted small">
              {/* each part stays whole, so a narrow screen wraps between parts, never inside one */}
              {[templateLabel(o.templateName) ?? '3D', `${cm(w)} × ${cm(h)} ${t('ซม.', 'cm')}`, SIZE_LABEL[o.size]()].map((x, i, all) => (
                <Fragment key={i}><span className="nowrap">{x}{i < all.length - 1 && ' ·'}</span>{i < all.length - 1 && ' '}</Fragment>
              ))}
            </p>
            <ul className="order-facts">
              <li><span>{t('แบบ', 'Product')}</span><b>{productName(o.product)}</b></li>
              <li><span>{t('สีพลาสติก', 'Plastic')}</span><b>{o.plasticColor || '–'}</b></li>
              <li><span>{t('จำนวน', 'Qty')}</span><b>{o.quantity}</b></li>
            </ul>
          </div>
        </div>
        <dl className="order-sum">
          <div><dt>{t(`ชิ้นงาน ${baht(o.unit)} × ${o.quantity}`, `Piece ${baht(o.unit)} × ${o.quantity}`)}</dt><dd>{baht(o.unit * o.quantity)}</dd></div>
          <div><dt>{t('ค่าจัดส่ง', 'Shipping')}</dt><dd>{baht(o.shipping)}</dd></div>
          <div className="order-total"><dt>{t('รวม', 'Total')}</dt><dd>{baht(o.total)}</dd></div>
        </dl>
        <h4>{t('จัดส่งถึง', 'Deliver to')}</h4>
        <p className="order-addr">{o.address.name}{'\u00a0· '}{o.address.phone}<br />{o.address.address} {o.address.postcode}</p>
        {o.note && <><h4>{t('ข้อความตอนสั่ง', 'Your note')}</h4><p className="review-note">{o.note}</p></>}
        <p className="hint"><a className="acct-link" href="#/order-terms">{t('เงื่อนไขการสั่งซื้อ', 'Order terms')}</a>{o.termsVersion && t(` · ยอมรับฉบับ ${o.termsVersion}`, ` · accepted version ${o.termsVersion}`)}</p>
      </section>

      <section className="order-card-box">
        <h3><Icon name="chat" size={18} /> {t(`คุยกับร้าน ${shopName}`, `Talk to ${shopName}`)}</h3>
        <OrderThread orderId={o.id} asTeam={false} shopName={shop?.name} />
      </section>
    </>
  );
}

/** What the customer does (or waits for) now. */
function NextStep({ order: o, shop, onChanged }: { order: Order; shop: Shop | null; onChanged: () => void }) {
  const name = shop ? t(`ร้าน ${shop.name}`, shop.name) : t('ร้าน', 'the shop');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const act = async (fn: () => Promise<void>, ask?: Parameters<typeof askConfirm>[0]) => {
    if (ask && !(await askConfirm(ask))) return;
    setBusy(true);
    setErr('');
    try { await fn(); onChanged(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const cancelButton = (
    <div className="btn-row">
      <button className="btn ghost sm" disabled={busy} onClick={() => act(() => cancelOrder(o.code), {
        title: t('ยกเลิกออเดอร์นี้?', 'Cancel this order?'),
        message: <p>{t(`${name} จะไม่ผลิตออเดอร์นี้ ถ้าอยากได้อีกต้องสั่งใหม่`, `${name} won’t make this order. To get it later, you’ll need to order again.`)}</p>,
        ok: t('ยกเลิกออเดอร์', 'Cancel order'),
        cancel: t('ไม่ยกเลิก', 'Keep order'),
        tone: 'danger',
        icon: 'close',
      })}>{t('ยกเลิกออเดอร์', 'Cancel order')}</button>
    </div>
  );

  switch (o.status) {
    case 'awaiting_accept':
      return (
        <>
          <p><b>{t(`ส่งคำสั่งซื้อให้${name} แล้ว`, `Sent to ${name}`)}</b> {t('รอร้านตอบรับ ปกติภายใน 3 วัน ร้านรับแล้วจะเห็นช่องทางชำระเงินที่นี่ ยังไม่ต้องโอนเงินตอนนี้',
            'Waiting for the shop to accept, usually within 3 days. Once it does, the payment details appear here. Don’t pay yet.')}</p>
          {cancelButton}
          {err && <p className="error small">{err}</p>}
        </>
      );
    case 'awaiting_payment':
      return (
        <>
          <Payment order={o} shopName={name} onChanged={onChanged} />
          {cancelButton}
          {err && <p className="error small">{err}</p>}
        </>
      );
    case 'payment_review':
      return (
        <>
          <p><b>{t('ส่งสลิปแล้ว', 'Slip sent')}</b> {t(`${name} กำลังตรวจยอด ถ้าแนบผิด ส่งสลิปใหม่ได้`, `${name} is checking the payment. Sent the wrong one? Upload it again.`)}</p>
          <SlipPeek path={o.slipPath} />
          <Payment order={o} shopName={name} onChanged={onChanged} again />
        </>
      );
    case 'paid':
    case 'in_production':
      return <p><b>{t('ชำระเงินเรียบร้อย', 'Payment received')}</b> {t(`${name} กำลังเตรียมชิ้นงานของคุณ`, `${name} is preparing your piece`)}{shop?.leadTime && t(` ปกติเสร็จภายใน ${shop.leadTime}`, `; it’s usually ready in ${shop.leadTime}`)}</p>;
    case 'shipped':
      return (
        <>
          <p><b>{t('จัดส่งแล้ว', 'On its way')}</b> {o.trackingCarrier || o.trackingNo
            ? <>{o.trackingCarrier} <span className="order-code-sm">{o.trackingNo}</span></>
            : t(`${name} จะแจ้งเลขพัสดุในข้อความด้านล่าง`, `${name} will post the tracking number below.`)}</p>
          <div className="btn-row">
            <button className="btn primary" disabled={busy} onClick={() => act(() => confirmReceived(o.code))}><Icon name="check" size={16} /> {t('ได้รับของแล้ว', 'I’ve received it')}</button>
          </div>
          {err && <p className="error small">{err}</p>}
        </>
      );
    case 'done':
      return <p><b>{t('ได้รับของแล้ว', 'Received')}</b> {t(`ถ้ามีปัญหากับชิ้นงาน บอก${name} ได้ในข้อความด้านล่าง`, `If anything’s wrong with the piece, tell ${name} below.`)}</p>;
    case 'cancelled':
      return (
        <p className="muted">
          {o.cancelledBy === 'customer' ? t('คุณยกเลิกออเดอร์นี้แล้ว', 'You cancelled this order.')
            : o.cancelledBy === 'shop' ? (o.acceptedAt ? t(`${name} ยกเลิกออเดอร์นี้`, `${name} cancelled this order`) : t(`${name} ไม่ได้รับออเดอร์นี้`, `${name} couldn’t take this order`))
            : o.cancelledBy === 'system' ? t('ออเดอร์นี้ถูกยกเลิกอัตโนมัติเพราะไม่มีการตอบภายในเวลา', 'This order was cancelled automatically after no reply in time.')
            : t('ออเดอร์นี้ถูกยกเลิกแล้ว', 'This order was cancelled.')}
          {o.cancelReason && <> {t('เหตุผล', 'Reason')}: “{o.cancelReason}”</>}
          {o.refundConfirmed && <> · {t('ร้านแจ้งว่าคืนเงินแล้ว', 'the shop says it has refunded you')}</>}
        </p>
      );
  }
}

/** The shop's PromptPay QR for the exact amount, and the slip upload. */
function Payment({ order: o, shopName, onChanged, again }: { order: Order; shopName: string; onChanged: () => void; again?: boolean }) {
  const [pay, setPay] = useState<ShopPayment | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (again) return;
    let live = true;
    orderPayment(o.code).then((x) => { if (live) setPay(x); }).catch(() => { if (live) setPay(null); });
    return () => { live = false; };
  }, [again, o.code]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      await uploadSlip(o, file);
      trackStep('/order/4-slip');
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const picker = (
    <>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
      <button className={'btn' + (again ? ' sm' : ' primary')} disabled={busy} onClick={() => fileRef.current?.click()}>
        <Icon name="upload" size={16} /> {busy ? t('กำลังส่ง…', 'Uploading…') : again ? t('ส่งสลิปใหม่', 'Upload another slip') : t('แนบสลิป', 'Attach slip')}
      </button>
    </>
  );
  if (again) return <div className="btn-row">{picker}{err && <p className="error small">{err}</p>}</div>;

  const payload = pay?.promptpayId ? promptPayPayload(pay.promptpayId, o.total) : null;
  return (
    <div className="order-pay">
      <p><b>{t(`ชำระ ${baht(o.total)} ผ่านพร้อมเพย์`, `Pay ${baht(o.total)} by PromptPay`)}</b></p>
      {pay === undefined ? <p className="muted small">{t('กำลังโหลด…', 'Loading…')}</p> : payload ? (
        <div className="order-qr">
          <QrCanvas text={payload} />
          <p className="small">{t('สแกนด้วยแอปธนาคาร ยอดเงินจะขึ้นให้อัตโนมัติ', 'Scan with your banking app; the amount fills in by itself.')}
            {pay?.promptpayName && <><br />{t('ชื่อบัญชี', 'Account name')}: <b>{pay.promptpayName}</b></>}</p>
        </div>
      ) : (
        <p className="muted small">{t(`${shopName} ยังไม่ได้ตั้งช่องทางชำระเงิน ถามในข้อความด้านล่างได้`, `${shopName} hasn’t set up payment details yet; ask below.`)}</p>
      )}
      <p className="small">{t(`เงินโอนเข้าบัญชีของ${shopName} โดยตรง โอนแล้วแนบสลิปที่นี่ ร้านจะตรวจและเริ่มผลิตให้`, `The money goes straight to ${shopName}. After paying, attach the slip here; the shop checks it and starts making your piece.`)}</p>
      <div className="btn-row">{picker}</div>
      {err && <p className="error small">{err}</p>}
    </div>
  );
}

function QrCanvas({ text }: { text: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const qr = qrcode(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    const quiet = 4;
    const scale = Math.max(2, Math.floor(200 / (n + quiet * 2)));
    const size = (n + quiet * 2) * scale;
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#111111';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
  }, [text]);
  return <canvas ref={ref} className="order-qr-canvas" role="img" aria-label={t('คิวอาร์พร้อมเพย์', 'PromptPay QR code')} />;
}

/** Shows a private slip image on request (the link lasts 10 minutes). */
export function SlipPeek({ path }: { path: string | null }) {
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  if (!path) return null;
  if (url) return <a href={url} target="_blank" rel="noopener"><img className="order-slip" src={url} alt={t('สลิปการโอน', 'Payment slip')} /></a>;
  return (
    <>
      <button className="btn sm" onClick={() => slipUrl(path).then(setUrl).catch((e) => setErr((e as Error).message))}><Icon name="image" size={15} /> {t('ดูสลิป', 'View slip')}</button>
      {err && <p className="error small">{err}</p>}
    </>
  );
}
