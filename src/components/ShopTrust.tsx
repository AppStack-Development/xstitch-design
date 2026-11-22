import { useEffect, useState } from 'react';
import { productName } from '../lib/orders';
import { REPORT_REASONS, replyReview, reportShop, submitReview, type Review, type ReportReason } from '../lib/shops';
import { t, locale } from '../lib/i18n';
import { Icon } from './Icon';

/**
 * Reviews and reports between customers and shops (docs/marketplace.md, phase 4): stars, the review form a
 * customer fills in once an order is received, a review with the shop's one reply, and "report this shop".
 */

const day = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const full = Math.round(value);
  return (
    <span className="stars" style={{ fontSize: size }} role="img" aria-label={t(`${value} จาก 5 ดาว`, `${value} out of 5 stars`)}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= full ? 'on' : ''} aria-hidden="true">★</span>)}
    </span>
  );
}

/** "★ 4.8 (12 รีวิว) · ส่งสำเร็จ 30" — or "ร้านใหม่" before anything is delivered. */
export function ShopScore({ delivered, reviews, rating, official }: { delivered: number; reviews: number; rating: number | null; official?: boolean }) {
  return (
    <span className="shop-score">
      {rating !== null && reviews > 0 && <><Stars value={rating} /> <b>{rating.toFixed(1)}</b> <span className="muted">({t(`${reviews} รีวิว`, `${reviews} review${reviews === 1 ? '' : 's'}`)})</span> · </>}
      {delivered > 0 ? t(`ส่งสำเร็จ ${delivered}`, `${delivered} delivered`) : official ? t('ร้านของทีมผู้สร้างเว็บ', 'The site team’s shop') : t('ร้านใหม่', 'New shop')}
    </span>
  );
}

/** Rate a received order once: 1–5 stars and a few words (optional). */
export function ReviewForm({ orderId, shopName, onDone }: { orderId: number; shopName: string; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = async () => {
    setBusy(true);
    setErr('');
    try { await submitReview(orderId, rating, body); onDone(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div className="review-form">
      <p><b>{t(`ให้คะแนนร้าน ${shopName}`, `Rate ${shopName}`)}</b> <span className="muted small">{t('รีวิวแสดงในหน้าร้านโดยไม่บอกชื่อคุณ', 'Shown on the shop’s page without your name')}</span></p>
      <div className="star-pick" role="radiogroup" aria-label={t('คะแนน', 'Rating')}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={rating === i} className={i <= rating ? 'on' : ''} onClick={() => setRating(i)}
            aria-label={t(`${i} ดาว`, `${i} star${i === 1 ? '' : 's'}`)}>★</button>
        ))}
      </div>
      <textarea value={body} rows={2} maxLength={1000} onChange={(e) => setBody(e.target.value)} aria-label={t('รีวิว', 'Review')}
        placeholder={t('เช่น ด้ายครบทุกสี แพ็คมาดี ส่งไว (ไม่บังคับ)', 'e.g. every colour there, well packed, quick (optional)')} />
      {err && <p className="error small">{err}</p>}
      <div className="btn-row"><button className="btn primary sm" disabled={busy || rating === 0} onClick={send}>{busy ? t('กำลังส่ง…', 'Sending…') : t('ส่งรีวิว', 'Send review')}</button></div>
    </div>
  );
}

/** One review; the shop gets a reply box when it hasn't answered yet. */
export function ReviewItem({ review: r, shopName, canReply, onChanged }: { review: Review; shopName?: string; canReply?: boolean; onChanged?: () => void }) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = async () => {
    if (r.orderId === undefined) return;
    setBusy(true);
    setErr('');
    try { await replyReview(r.orderId, reply); onChanged?.(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="review-item">
      <div className="review-item-head">
        <Stars value={r.rating} />
        <span className="muted small">{t('ลูกค้า', 'A customer')}{r.product && <> · {productName(r.product)}</>} · {day(r.createdAt)}</span>
        {r.hidden && <span className="status-chip removed">{t('ทีมซ่อนรีวิวนี้', 'Hidden by the team')}</span>}
      </div>
      {r.body && <p>{r.body}</p>}
      {r.reply && <p className="review-reply"><b>{shopName ? t(`ร้าน ${shopName}`, shopName) : t('ร้าน', 'The shop')}:</b> {r.reply}</p>}
      {canReply && !r.reply && (
        <div className="review-reply-box">
          <textarea value={reply} rows={2} maxLength={500} onChange={(e) => setReply(e.target.value)} aria-label={t('ตอบรีวิว', 'Reply')}
            placeholder={t('ตอบรีวิวนี้ได้ครั้งเดียว ลูกค้าและทุกคนจะเห็นคำตอบ', 'You can reply once; everyone sees it')} />
          {err && <p className="error small">{err}</p>}
          <button className="btn sm" disabled={busy || !reply.trim()} onClick={send}>{t('ตอบรีวิว', 'Reply')}</button>
        </div>
      )}
    </div>
  );
}

/** "แจ้งปัญหาร้านนี้": a reason, a few words, and (from an order page) that order. */
export function ReportShopDialog({ shopId, shopName, orderId, onClose }: { shopId: number; shopName: string; orderId?: number | null; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setErr('');
    try { await reportShop(shopId, reason, note, orderId); setDone(true); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal report-dialog" role="dialog" aria-modal="true" aria-labelledby="shop-report-title">
        <header className="modal-head">
          <h3 id="shop-report-title"><Icon name="flag" /> {t(`แจ้งปัญหาร้าน ${shopName}`, `Report ${shopName}`)}</h3>
          <button className="icon-btn" onClick={onClose} aria-label={t('ปิด', 'Close')}><Icon name="close" /></button>
        </header>
        {done ? (
          <div className="fb-body fb-done">
            <p><b>{t('ได้รับเรื่องแล้ว', 'Thanks, we’ve got it')}</b></p>
            <p className="muted">{t(`ทีมจะดูประวัติ${orderId ? 'ออเดอร์และข้อความ' : 'ร้าน'} และอาจระงับร้านที่ทำผิดข้อกำหนด เว็บไม่ได้ถือเงินของออเดอร์ จึงคืนเงินแทนร้านไม่ได้ ถ้ามีอะไรเพิ่ม อีเมล admin@appstack-dev.io`,
              `The team will look at the ${orderId ? 'order and its messages' : 'shop'} and may suspend a shop that broke the terms. The site doesn’t hold order money, so it can’t refund on the shop’s behalf. To add anything, email admin@appstack-dev.io.`)}</p>
          </div>
        ) : (
          <div className="fb-body">
            <div className="fb-kinds" role="radiogroup">
              {REPORT_REASONS.map((r) => (
                <label key={r.id} className="check"><input type="radio" name="shop-report" checked={reason === r.id} onChange={() => setReason(r.id)} /><span>{r.label()}</span></label>
              ))}
            </div>
            <label className="fb-field"><span>{t('เล่าเพิ่มเติม (ไม่บังคับ)', 'More detail (optional)')}</span>
              <textarea value={note} rows={3} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></label>
            {orderId ? <p className="hint">{t('ทีมจะเห็นออเดอร์นี้ ข้อความ และสลิป เพื่อดูเรื่องนี้ แต่ไม่เห็นที่อยู่ของคุณ', 'The team will see this order, its messages and slip to look into it, but not your address.')}</p> : null}
            {err && <p className="error small">{err}</p>}
          </div>
        )}
        <footer className="modal-foot fb-foot">
          <button className="btn" onClick={onClose}>{done ? t('ปิด', 'Close') : t('ยกเลิก', 'Cancel')}</button>
          {!done && <button className="btn primary" disabled={busy || !reason} onClick={send}>{busy ? t('กำลังส่ง…', 'Sending…') : t('ส่งเรื่อง', 'Send report')}</button>}
        </footer>
      </div>
    </div>
  );
}
