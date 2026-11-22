import { useCallback, useEffect, useRef, useState } from 'react';
import type { Pattern } from '../types';
import {
  ORDER_STATUSES, STATUS_LABEL, baht, cm, getTeamNote, pieceMm, productMaterial, productName, saveTeamNote, sizeOf,
  type Order, type OrderMessage, type OrderStatus,
} from '../lib/orders';
import { shopAction, type Shop, type ShopAction } from '../lib/shops';
import { decodeShare, downloadBlob, safeFilename } from '../lib/share';
import { buildPlate, toBinaryStl } from '../lib/plate';
import { computeStats } from '../lib/stats';
import { modelOf } from '../lib/templates';
import { t, locale } from '../lib/i18n';
import { askConfirm } from './ConfirmDialog';
import { OrderThread } from './OrderThread';
import { SlipPeek, kindLabel } from '../pages/OrderPage';
import { Thumb } from './Thumb';
import { Icon } from './Icon';

const when = (iso: string) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * One order, as the shop works it (#/shop): accept or decline, check the slip, start, ship with tracking, or
 * cancel with a reason (a paid order only once the customer is refunded). The team's own shop also keeps a
 * "set status" escape hatch for fixing mistakes. Every step goes through shop_order_action() in the database.
 */
export function ShopOrderCard({ order, shop, onChanged }: { order: Order; shop: Shop; onChanged: () => void }) {
  const o = order;
  const [p, setP] = useState<Pattern | null>(null);
  const [note, setNote] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [carrier, setCarrier] = useState(order.trackingCarrier);
  const [tracking, setTracking] = useState(order.trackingNo);
  // declining or cancelling: a reason for the customer (and, once paid, the refund confirmed)
  const [ending, setEnding] = useState<null | 'decline' | 'cancel'>(null);
  const [reason, setReason] = useState('');
  const [refunded, setRefunded] = useState(false);
  // messages: count on the summary; opens by itself (once) when the customer wrote last and nobody has replied
  const [threadOpen, setThreadOpen] = useState(false);
  const [msgCount, setMsgCount] = useState(0);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const autoOpened = useRef(false);
  const onMessages = useCallback((list: OrderMessage[]) => {
    const waiting = list.length > 0 && !list[list.length - 1].fromTeam;
    setMsgCount(list.length);
    setAwaitingReply(waiting);
    if (waiting && !autoOpened.current) { autoOpened.current = true; setThreadOpen(true); }
  }, []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    decodeShare(o.data).then((x) => { if (live) setP({ ...x, name: o.title }); }).catch(() => { /* no preview */ });
    getTeamNote(o.id).then((n) => { if (live) { setNote(n); setSavedNote(n); } }).catch(() => { /* empty */ });
    return () => { live = false; };
  }, [o.id, o.data, o.title]);

  const run = async (fn: () => Promise<void>, refresh = true) => {
    setBusy(true);
    setErr('');
    try { await fn(); if (refresh) onChanged(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const act = (action: ShopAction, opts: Parameters<typeof shopAction>[2] = {}) => run(() => shopAction(o.code, action, opts));
  const end = () => run(async () => {
    await shopAction(o.code, ending!, { reason, refunded });
    setEnding(null);
  });
  const stl = () => {
    if (!p) return;
    downloadBlob(toBinaryStl(buildPlate(p, p.details.thicknessMm, p.details.holeRatio), o.code), `${o.code}-${safeFilename(o.title)}.stl`);
  };
  // the size the customer paid for, and the stitch count the price was based on, checked against the pattern itself
  const material = productMaterial(o.product);
  const real = p ? sizeOf(p, material) : null;
  const realStitches = p ? computeStats(p).total : null;
  const { w, h } = p ? pieceMm(p) : pieceMm(o);
  const open = o.status !== 'done' && o.status !== 'cancelled';
  const paid = !!o.paidAt;

  return (
    <article className="review-card order-card">
      <a className="review-thumb" href={`#/s/${o.data}`} title={t('เปิดลาย', 'Open pattern')}>
        {p ? <Thumb pattern={p} max={96} view="stitch" /> : <span className="post-wait" aria-hidden="true" />}
      </a>
      <div className="review-main">
        <div className="review-head">
          <b className="order-code-sm">{o.code}</b>
          <span className={`status-chip ${o.status === 'cancelled' ? 'removed' : o.status === 'done' ? 'published' : 'hidden'}`}>{STATUS_LABEL[o.status]()}</span>
          <span className="review-when">{when(o.createdAt)}</span>
        </div>
        <div className="post-by"><b>{o.title}</b> <span className="muted">· {kindLabel(o, p)} · {cm(w)} × {cm(h)} {t('ซม.', 'cm')} · {t(`${o.colors} สี`, `${o.colors} ${o.colors === 1 ? 'color' : 'colors'}`)}</span></div>
        {real && real !== o.size && <p className="error small">{t(`ขนาดในลายเป็น ${real} แต่ออเดอร์คิดราคาเป็น ${o.size}`, `The pattern is size ${real} but the order was priced as ${o.size}`)}</p>}
        {realStitches !== null && realStitches !== o.stitches && <p className="error small">{t(`ลายนี้มี ${realStitches.toLocaleString()} ฝีเข็ม แต่ออเดอร์บันทึกไว้ ${o.stitches.toLocaleString()} ฝีเข็ม ตรวจราคาก่อนยืนยันรับเงิน`, `The pattern has ${realStitches.toLocaleString()} stitches but the order says ${o.stitches.toLocaleString()}; check the price before confirming payment`)}</p>}
        <ul className="order-facts">
          <li><span>{t('แบบ', 'Product')}</span><b>{productName(o.product)}</b></li>
          {productMaterial(o.product) === '3d' && <li><span>{t('สีพลาสติก', 'Plastic')}</span><b>{o.plasticColor || '–'}</b></li>}
          <li><span>{t('จำนวน', 'Qty')}</span><b>{o.quantity}</b></li>
          <li><span>{t('ยอด', 'Total')}</span><b>{baht(o.total)}</b></li>
        </ul>
        <p className="order-addr small">{o.address.name} · {o.address.phone}<br />{o.address.address} {o.address.postcode}</p>
        {o.note && <p className="review-note">{o.note}</p>}

        <div className="order-next">
          {o.status === 'awaiting_accept' && !ending && (
            <>
              <p className="small"><b>{t('ลูกค้ารอให้ร้านตอบรับ', 'The customer is waiting for your answer')}</b> {t('รับแล้วลูกค้าจะเห็นพร้อมเพย์ของร้านและโอนได้', 'Once accepted, they see your PromptPay and can pay.')}</p>
              <div className="review-actions">
                <button className="btn primary sm" disabled={busy} onClick={() => act('accept')}><Icon name="check" size={15} /> {t('รับออเดอร์', 'Accept')}</button>
                <button className="btn sm" disabled={busy} onClick={() => { setEnding('decline'); setReason(''); }}>{t('ปฏิเสธ', 'Decline')}</button>
              </div>
            </>
          )}
          {o.status === 'awaiting_payment' && <p className="muted small">{t('รอลูกค้าโอนและแนบสลิป', 'Waiting for the customer to pay and attach a slip')}</p>}
          {o.status === 'payment_review' && (
            <>
              <p className="small"><b>{t(`ตรวจสลิป: ต้องได้ ${baht(o.total)}`, `Check the slip: should be ${baht(o.total)}`)}</b></p>
              <SlipPeek path={o.slipPath} />
              <div className="review-actions">
                <button className="btn primary sm" disabled={busy} onClick={() => act('slip_ok')}><Icon name="check" size={15} /> {t('ยืนยันรับเงิน', 'Confirm payment')}</button>
                <button className="btn sm" disabled={busy} onClick={() => act('slip_bad')}>{t('สลิปไม่ถูกต้อง ให้ส่งใหม่', 'Slip not right, ask again')}</button>
              </div>
              <p className="hint">{t('ถ้าสลิปไม่ถูกต้อง พิมพ์บอกเหตุผลลูกค้าในข้อความด้านล่างด้วย', 'If the slip is wrong, tell the customer why in the messages below.')}</p>
            </>
          )}
          {o.status === 'paid' && (
            <div className="review-actions">
              <button className="btn primary sm" disabled={busy} onClick={() => act('start')}>{t('เริ่มผลิต', 'Start making')}</button>
            </div>
          )}
          {(o.status === 'in_production' || o.status === 'shipped') && (
            <div className="order-ship">
              <label className="fb-field"><span>{t('ขนส่ง', 'Carrier')}</span><input value={carrier} maxLength={40} onChange={(e) => setCarrier(e.target.value)} placeholder={t('เช่น ไปรษณีย์ไทย', 'e.g. Thailand Post')} /></label>
              <label className="fb-field"><span>{t('เลขพัสดุ', 'Tracking no.')}</span><input value={tracking} maxLength={60} onChange={(e) => setTracking(e.target.value)} /></label>
              <button className="btn primary sm" disabled={busy || !tracking.trim()} onClick={() => act('ship', { carrier, tracking })}>
                {o.status === 'shipped' ? t('แก้เลขพัสดุ', 'Update tracking') : t('แจ้งจัดส่งแล้ว', 'Mark shipped')}
              </button>
            </div>
          )}
          {o.status === 'cancelled' && (
            <p className="muted small">
              {o.cancelledBy === 'customer' ? t('ลูกค้ายกเลิกเอง', 'Cancelled by the customer')
                : o.cancelledBy === 'shop' ? t('ร้านยกเลิก', 'Cancelled by the shop')
                : o.cancelledBy === 'system' ? t('ยกเลิกอัตโนมัติ', 'Cancelled automatically') : t('ยกเลิกแล้ว', 'Cancelled')}
              {o.cancelReason && <>: “{o.cancelReason}”</>}
              {o.refundConfirmed && t(' · คืนเงินแล้ว', ' · refunded')}
            </p>
          )}

          {ending && (
            <div className="order-end">
              <label className="fb-field">
                <span>{ending === 'decline' ? t('เหตุผลที่ปฏิเสธ (ลูกค้าเห็น)', 'Why you’re declining (the customer sees this)') : t('เหตุผลที่ยกเลิก (ลูกค้าเห็น)', 'Why you’re cancelling (the customer sees this)')}</span>
                <textarea value={reason} rows={2} maxLength={300} onChange={(e) => setReason(e.target.value)}
                  placeholder={t('เช่น ช่วงนี้คิวเต็ม / ไม่มีสีพลาสติกที่เลือก', 'e.g. fully booked right now / that plastic colour is out')} />
              </label>
              {ending === 'cancel' && paid && (
                <label className="check small"><input type="checkbox" checked={refunded} onChange={(e) => setRefunded(e.target.checked)} />
                  <span>{t(`คืนเงิน ${baht(o.total)} ให้ลูกค้าแล้ว`, `I’ve refunded ${baht(o.total)} to the customer`)}</span></label>
              )}
              <div className="review-actions">
                <button className="btn danger sm" disabled={busy || !reason.trim() || (ending === 'cancel' && paid && !refunded)} onClick={end}>
                  {ending === 'decline' ? t('ปฏิเสธออเดอร์', 'Decline order') : t('ยกเลิกออเดอร์', 'Cancel order')}
                </button>
                <button className="btn sm" disabled={busy} onClick={() => setEnding(null)}>{t('ไม่ใช่ตอนนี้', 'Not now')}</button>
              </div>
            </div>
          )}
        </div>

        <div className="order-team">
          {shop.official && (
            <label className="fb-field">
              <span>{t('เปลี่ยนสถานะเอง (ทีม)', 'Set status (team)')}</span>
              <select value={o.status} disabled={busy} onChange={async (e) => {
                const status = e.target.value as OrderStatus;
                if (await askConfirm({
                  title: t('เปลี่ยนสถานะเอง?', 'Set the status by hand?'),
                  message: <p>{t(`จาก “${STATUS_LABEL[o.status]()}” เป็น “${STATUS_LABEL[status]()}” ใช้แก้ความผิดพลาดเท่านั้น ลูกค้าจะได้อีเมลตามสถานะใหม่`, `From “${STATUS_LABEL[o.status]()}” to “${STATUS_LABEL[status]()}”. Only for fixing mistakes; the customer gets the email for the new status.`)}</p>,
                  ok: t('เปลี่ยนสถานะ', 'Set status'),
                })) act('set_status', { status });
              }}>
                {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]()}</option>)}
              </select>
            </label>
          )}
          <label className="fb-field order-team-note">
            <span>{t('บันทึกของร้าน (ลูกค้าไม่เห็น)', 'Shop note (not shown to the customer)')}</span>
            <textarea value={note} rows={2} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder={t('เช่น พิมพ์บนเครื่อง 2 ใช้ PLA ครีม', 'e.g. printer 2, cream PLA')} />
          </label>
        </div>
        <div className="review-actions">
          <button className="btn sm" onClick={() => run(async () => { await saveTeamNote(o.id, note); setSavedNote(note); }, false)} disabled={busy || note === savedNote}>{t('บันทึกโน้ต', 'Save note')}</button>
          <a className="btn sm" href={`#/s/${o.data}`}><Icon name="edit" size={15} /> {t('เปิดลาย', 'Open pattern')}</a>
          {material === 'fabric' ? null : p && modelOf(p.templateId)
            ? <span className="hint">{t('กล่องปักลาย: พิมพ์จากไฟล์ต้นฉบับของทีม', 'Stitch box: print from the team’s original files')}</span>
            : <button className="btn sm" onClick={stl} disabled={!p}><Icon name="cube" size={15} /> {t('ดาวน์โหลด STL', 'Download STL')}</button>}
          {open && o.status !== 'awaiting_accept' && !ending && (
            <button className="btn ghost sm" disabled={busy} onClick={() => { setEnding('cancel'); setReason(''); setRefunded(false); }}>{t('ยกเลิกออเดอร์', 'Cancel order')}</button>
          )}
        </div>
        {err && <p className="error small">{err}</p>}
        <details className="order-team-thread" open={threadOpen} onToggle={(e) => setThreadOpen(e.currentTarget.open)}>
          <summary>
            <Icon name="chat" size={15} /> {t('ข้อความกับลูกค้า', 'Messages with the customer')}
            {msgCount > 0 && <span className="muted"> ({msgCount})</span>}
            {awaitingReply && <span className="status-chip hidden">{t('รอร้านตอบ', 'Needs a reply')}</span>}
          </summary>
          <OrderThread orderId={o.id} asTeam shopName={shop.name} onMessages={onMessages} />
        </details>
      </div>
    </article>
  );
}
