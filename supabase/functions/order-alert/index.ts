// XStitch.Design: order emails (Supabase Edge Function "order-alert", JWT verification off).
//
// The database pings this after an order changes or a message is posted (migration 0010), with only
// { order_id } or { message_id }. Nothing in the request is trusted: the function reads the order with the
// service role, works out which emails its current state calls for, and claims each one in order_alerts
// before sending, so every email goes out at most once however often this is called. Only events from the
// last 24 hours count, so older orders never get late emails.
//
// Every order belongs to a shop (migration 0012). Shop emails go to the team inbox for the team's own shop and
// to the shop owner's account email for any other shop; customer emails name the shop.
//
// Secrets (Edge Functions → Secrets): RESEND_API_KEY (required). Optional: TEAM_EMAIL, ALERT_FROM, SITE_URL.
// SUPABASE_URL and the server keys (SUPABASE_SECRET_KEYS / SUPABASE_SERVICE_ROLE_KEY) are provided by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = Deno.env.get('SITE_URL') ?? 'https://xstitch-design.vercel.app';
const TEAM = Deno.env.get('TEAM_EMAIL') ?? 'admin@appstack-dev.io';
const FROM = Deno.env.get('ALERT_FROM') ?? 'XStitch.Design <orders@appstack-dev.io>';
const RESEND = Deno.env.get('RESEND_API_KEY') ?? '';
const FRESH_MS = 24 * 3600 * 1000;

// prefer the new secret key (SUPABASE_SECRET_KEYS is a JSON object of name → key); fall back to the legacy one.
// keyKind says which was used (never the key itself), for error replies.
let keyKind = 'legacy service_role';
function serverKey(): string {
  try {
    const keys = Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'));
    const k = keys.find((v): v is string => typeof v === 'string' && v.startsWith('sb_secret_'));
    if (k) { keyKind = 'sb_secret'; return k; }
  } catch { /* use the legacy key */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}
const db = createClient(Deno.env.get('SUPABASE_URL')!, serverKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Lang = 'th' | 'en';
interface Order {
  id: number; code: string; title: string; product: string; quantity: number; total_thb: number; status: string;
  created_at: string; updated_at: string; slip_at: string | null; paid_at: string | null; shipped_at: string | null;
  tracking_carrier: string; tracking_no: string; lang: Lang | null; user_id: string | null;
  shop_id: number | null; accepted_at: string | null; cancel_reason: string; cancelled_by: string | null;
}
interface Shop { id: number; name: string; official: boolean; owner_id: string; lead_time: string }
interface Message { id: number; order_id: number; created_at: string; from_team: boolean; body: string }
interface Mail { key: string; to: 'shop' | 'customer'; at: string | null; subject: string; lines: string[]; link: string; cta: string }

const PRODUCT: Record<string, [string, string]> = {
  kit: ['ชุดปักเอง', 'Stitch-it-yourself kit'],
  blank: ['ชิ้นงานเปล่า', 'Printed piece only'],
  stitched: ['ปักเสร็จพร้อมใช้', 'Fully stitched'],
  fabric_kit: ['ชุดปักเอง (ผ้า + ด้าย)', 'Kit (fabric + threads)'],
  fabric_stitched: ['ปักเสร็จ', 'Stitched'],
  fabric_framed: ['ปักเสร็จใส่กรอบ', 'Stitched and framed'],
};
const baht = (n: number, l: Lang) => (l === 'th' ? `${n.toLocaleString('th-TH')} บาท` : `฿${n.toLocaleString('en-US')}`);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const clip = (s: string, n = 600) => (s.length > n ? s.slice(0, n) + '…' : s);

/**
 * Every email the order's current state calls for. Shop emails are in Thai; customer emails follow the order's
 * language and name the shop.
 */
function dueMails(o: Order, shop: Shop | null, msg: Message | null): Mail[] {
  const l: Lang = o.lang === 'en' ? 'en' : 'th';
  const tr = (th: string, en: string) => (l === 'th' ? th : en);
  const orderLink = `${SITE}/#/order/${o.code}`;
  const shopLink = `${SITE}/#/shop`;
  const name = shop?.name ?? 'XStitch.Design';
  const byShop = tr(`ร้าน ${name}`, name);
  const what = `${o.title} · ${PRODUCT[o.product]?.[0] ?? o.product} × ${o.quantity}`;
  const out: Mail[] = [];
  // the key suffix stays ":team" so emails already sent before shops existed aren't sent again
  const toShop = (key: string, at: string | null, subject: string, lines: string[]) =>
    out.push({ key: `${key}:team`, to: 'shop', at, subject, lines, link: shopLink, cta: 'เปิดหน้าร้าน' });
  const customer = (key: string, at: string | null, subject: string, lines: string[]) =>
    out.push({ key: `${key}:customer`, to: 'customer', at, subject, lines, link: orderLink, cta: tr('เปิดหน้าออเดอร์', 'Open your order') });
  const waitingForShop = !o.accepted_at && (o.status === 'awaiting_accept' || o.cancelled_by === 'shop');

  // placed
  toShop('new', o.created_at, `ออเดอร์ใหม่ ${o.code} · ${baht(o.total_thb, 'th')}`,
    [what, waitingForShop ? `ยอด ${baht(o.total_thb, 'th')} · รอร้านกดรับหรือปฏิเสธในหน้าร้าน` : `ยอด ${baht(o.total_thb, 'th')} · รอลูกค้าชำระและแนบสลิป`]);
  customer('new', o.created_at, tr(`ได้รับออเดอร์ ${o.code} แล้ว`, `We've got your order ${o.code}`), waitingForShop ? [
    tr(`ส่งคำสั่งซื้อ “${o.title}” ให้${byShop} แล้ว`, `Your order for “${o.title}” has gone to ${byShop}.`),
    tr('รอร้านตอบรับภายใน 3 วัน (ถ้าไม่ตอบ ออเดอร์จะถูกยกเลิกอัตโนมัติ) ร้านรับแล้วจะมีอีเมลแจ้ง และเห็นช่องทางชำระเงินในหน้าออเดอร์ ยังไม่ต้องโอนเงินตอนนี้',
      'The shop has 3 days to accept (otherwise the order is cancelled automatically). You’ll get an email and the payment details on your order page then. Don’t pay yet.'),
  ] : [
    tr(`ขอบคุณที่สั่ง “${o.title}” กับ${byShop}`, `Thanks for ordering “${o.title}” from ${byShop}.`),
    tr(`ชำระ ${baht(o.total_thb, l)} ผ่านพร้อมเพย์ได้ในหน้าออเดอร์ แล้วแนบสลิปในหน้าเดียวกัน ร้านจะเริ่มผลิตหลังตรวจสลิปแล้ว`,
      `Pay ${baht(o.total_thb, l)} by PromptPay on your order page and attach the slip there. The shop starts making it once the payment is checked.`),
    tr('ออเดอร์ที่ไม่ชำระภายใน 2 วันจะถูกยกเลิกอัตโนมัติ', 'Orders not paid within 2 days are cancelled automatically.'),
  ]);

  // accepted by the shop (not for shops that accept by themselves)
  if (o.accepted_at && Date.parse(o.accepted_at) - Date.parse(o.created_at) > 5000) {
    customer('accepted', o.accepted_at, tr(`${byShop} รับออเดอร์ ${o.code} แล้ว`, `${name} accepted your order ${o.code}`), [
      tr(`ชำระ ${baht(o.total_thb, l)} ผ่านพร้อมเพย์ของร้านได้ในหน้าออเดอร์ แล้วแนบสลิปในหน้าเดียวกัน`,
        `Pay ${baht(o.total_thb, l)} to the shop by PromptPay on your order page and attach the slip there.`),
      tr('เงินโอนเข้าบัญชีของร้านโดยตรง ชำระภายใน 2 วัน ไม่อย่างนั้นออเดอร์จะถูกยกเลิกอัตโนมัติ', 'The money goes straight to the shop. Pay within 2 days, or the order is cancelled automatically.'),
    ]);
  }

  // slip sent / slip not accepted
  if (o.slip_at && o.status === 'payment_review') {
    toShop(`slip:${o.slip_at}`, o.slip_at, `สลิปใหม่ ${o.code} รอตรวจ`, [what, `ตรวจสลิปให้ได้ ${baht(o.total_thb, 'th')}`]);
  }
  if (o.slip_at && o.status === 'awaiting_payment') {
    customer(`reslip:${o.slip_at}`, o.updated_at, tr(`ขอสลิปใหม่สำหรับออเดอร์ ${o.code}`, `Please send a new slip for ${o.code}`), [
      tr('ร้านตรวจสลิปแล้วยังไม่ผ่าน ดูเหตุผลในข้อความจากร้าน แล้วแนบสลิปใหม่ในหน้าออเดอร์', 'The shop couldn’t match your slip. See its message on your order page and attach a new slip there.'),
    ]);
  }

  // paid
  if (o.paid_at && ['paid', 'in_production', 'shipped', 'done'].includes(o.status)) {
    const lead = shop?.lead_time ? tr(` ปกติเสร็จภายใน ${shop.lead_time}`, ` It’s usually ready in ${shop.lead_time}.`) : '';
    customer('paid', o.paid_at, tr(`ยืนยันการชำระเงินออเดอร์ ${o.code} แล้ว`, `Payment confirmed for ${o.code}`), [
      tr(`${byShop} ได้รับเงิน ${baht(o.total_thb, l)} แล้ว และจะเริ่มผลิต “${o.title}”${lead}`,
        `${name} has received ${baht(o.total_thb, l)} and will start making “${o.title}”.${lead}`),
    ]);
  }

  // shipped (again if the tracking number is changed)
  if (o.status === 'shipped') {
    const track = [o.tracking_carrier, o.tracking_no].filter(Boolean).join(' ');
    customer(`shipped:${o.tracking_no}`, o.updated_at, tr(`ส่งออเดอร์ ${o.code} แล้ว`, `Your order ${o.code} is on its way`), [
      tr(`“${o.title}” ส่งออกไปแล้ว`, `“${o.title}” has been sent.`),
      ...(track ? [tr(`เลขพัสดุ: ${track}`, `Tracking: ${track}`)] : []),
      tr('ได้รับของแล้วกด “ได้รับของแล้ว” ในหน้าออเดอร์ ถ้าชิ้นงานมีปัญหา แจ้งร้านในหน้าออเดอร์ภายใน 7 วัน',
        'When it arrives, tap “Received” on your order page. If anything’s wrong, tell the shop there within 7 days.'),
    ]);
  }

  // cancelled (or declined)
  if (o.status === 'cancelled') {
    const why = o.cancel_reason ? [tr(`เหตุผล: ${o.cancel_reason}`, `Reason: ${o.cancel_reason}`)] : [];
    if (o.cancelled_by !== 'shop') {
      toShop('cancelled', o.updated_at, `ออเดอร์ ${o.code} ถูกยกเลิก`, [what,
        o.cancelled_by === 'customer' ? 'ลูกค้ายกเลิกเอง' : o.cancelled_by === 'system' ? `ยกเลิกอัตโนมัติ: ${o.cancel_reason}` : 'ยกเลิกแล้ว',
        o.paid_at ? 'ออเดอร์นี้ชำระแล้ว ต้องคืนเงินลูกค้า' : 'ยังไม่ได้ชำระเงิน']);
    }
    customer('cancelled', o.updated_at, o.cancelled_by === 'shop' && !o.accepted_at
      ? tr(`${byShop} ไม่ได้รับออเดอร์ ${o.code}`, `${name} couldn’t take your order ${o.code}`)
      : tr(`ออเดอร์ ${o.code} ถูกยกเลิกแล้ว`, `Order ${o.code} has been cancelled`), [
      tr(`ออเดอร์ “${o.title}” ถูกยกเลิกแล้ว`, `Your order for “${o.title}” has been cancelled.`),
      ...why,
      ...(o.paid_at ? [tr('คุณชำระเงินแล้ว ร้านต้องคืนเงินให้คุณ ดูรายละเอียดในข้อความในหน้าออเดอร์', 'You had paid, so the shop owes you a refund; see the messages on your order page.')] : []),
    ]);
  }

  // a new message goes to the other side
  if (msg) {
    if (msg.from_team) {
      customer(`msg:${msg.id}`, msg.created_at, tr(`${byShop} ตอบข้อความในออเดอร์ ${o.code}`, `New message from ${name} about ${o.code}`), [clip(msg.body)]);
    } else {
      toShop(`msg:${msg.id}`, msg.created_at, `ข้อความจากลูกค้า ${o.code}`, [what, clip(msg.body)]);
    }
  }
  return out;
}

function html(m: Mail): string {
  const body = m.lines.map((s) => `<p style="margin:0 0 12px;line-height:1.6">${esc(s).replace(/\n/g, '<br>')}</p>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#f6f3ee;font-family:-apple-system,'Segoe UI','Noto Sans Thai',sans-serif;color:#1f2a44">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
<p style="margin:0 0 16px;font-weight:700;color:#243b6b">XStitch<span style="color:#c72b3b">.</span>Design</p>
<div style="background:#fff;border-radius:12px;padding:20px">
<h1 style="font-size:18px;margin:0 0 14px">${esc(m.subject)}</h1>${body}
<p style="margin:18px 0 0"><a href="${esc(m.link)}" style="display:inline-block;background:#243b6b;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">${esc(m.cta)}</a></p>
</div></div></body></html>`;
}

/** replyToTeam: only the team's own shop takes replies by email; other shops talk on the order page */
async function send(to: string, m: Mail, replyToTeam: boolean): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM, to: [to], ...(replyToTeam ? { reply_to: TEAM } : {}), subject: m.subject, html: html(m),
      text: [...m.lines, '', `${m.cta}: ${m.link}`].join('\n\n'),
    }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  if (!RESEND) return reply(503, { error: 'RESEND_API_KEY is not set' });
  let input: { order_id?: unknown; message_id?: unknown };
  try { input = await req.json(); } catch { return reply(400, { error: 'bad json' }); }

  let msg: Message | null = null;
  let orderId = Number(input.order_id);
  if (input.message_id != null) {
    const { data } = await db.from('order_messages').select('id, order_id, created_at, from_team, body')
      .eq('id', Number(input.message_id)).maybeSingle();
    if (!data) return reply(404, { error: 'no such message' });
    msg = data as Message;
    orderId = msg.order_id;
  }
  if (!Number.isSafeInteger(orderId) || orderId <= 0) return reply(400, { error: 'order_id or message_id needed' });

  const { data: order, error: readErr } = await db.from('orders')
    .select('id, code, title, product, quantity, total_thb, status, created_at, updated_at, slip_at, paid_at, shipped_at, tracking_carrier, tracking_no, lang, user_id, shop_id, accepted_at, cancel_reason, cancelled_by')
    .eq('id', orderId).maybeSingle();
  if (readErr) return reply(500, { error: `read order: ${readErr.message}`, key: keyKind });
  if (!order) return reply(404, { error: 'no such order', key: keyKind });
  const o = order as Order;
  let shop: Shop | null = null;
  if (o.shop_id) {
    const { data } = await db.from('shops').select('id, name, official, owner_id, lead_time').eq('id', o.shop_id).maybeSingle();
    shop = (data as Shop | null) ?? null;
  }
  const official = !shop || shop.official;

  const emailOf = async (uid: string | null) => (uid ? (await db.auth.admin.getUserById(uid)).data.user?.email ?? null : null);
  let customerEmail: string | null | undefined;
  let shopEmail: string | null | undefined;
  const sent: string[] = [];
  const failed: string[] = [];
  for (const m of dueMails(o, shop, msg)) {
    if (!m.at || Date.now() - Date.parse(m.at) > FRESH_MS) continue;
    let to: string | null;
    if (m.to === 'customer') {
      if (customerEmail === undefined) customerEmail = await emailOf(o.user_id);
      to = customerEmail;
    } else {
      // the team's shop → the team inbox; any other shop → its owner
      if (shopEmail === undefined) shopEmail = official ? TEAM : await emailOf(shop!.owner_id);
      to = shopEmail;
    }
    if (!to) continue;
    // claim it first: if the row is already there, this email has gone out (or is going out) already
    const { error: claim } = await db.from('order_alerts').insert({ order_id: o.id, key: m.key });
    if (claim) continue;
    try {
      await send(to, m, official);
      sent.push(m.key);
    } catch (e) {
      console.error(o.code, m.key, (e as Error).message);
      await db.from('order_alerts').delete().eq('order_id', o.id).eq('key', m.key);
      failed.push(m.key);
    }
  }
  return reply(failed.length ? 502 : 200, { order: o.code, sent, failed });
});
