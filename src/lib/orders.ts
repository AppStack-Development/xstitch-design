import type { Pattern } from '../types';
import { client, cloudEnabled, getCloud } from './cloud';
import { encodeShare } from './share';
import { computeStats } from './stats';
import { lang, t } from './i18n';

/**
 * Ordering a piece, start to finish on the website: a signed-in customer picks options, sees the price,
 * gives a delivery address and places the order with a shop; the shop accepts it (the team's shop does so by
 * itself); the customer pays the shop by PromptPay QR and uploads the slip; the shop checks it, makes and ships
 * the piece and adds the tracking number; the customer marks it received. Both sides talk in a message thread
 * on the order. Tables and permissions: supabase/migrations/0006_orders.sql, 0012_shops.sql; the shop's side
 * is in lib/shops.ts.
 */

export const ordersEnabled = cloudEnabled;

/** Version of the order terms (pages/OrderTerms.tsx) a new order agrees to; stored on every order.
 *  2026-11-22: orders go to shops, which receive the delivery details (required by shops other than the team's).
 *  2026-11-22b: automatic cancellation (3 days unanswered, 2 days unpaid), reviews and reporting a shop.
 *  2026-11-22c: asking a shop for a price (quotes). */
export const ORDER_TERMS_VERSION = '2026-11-22c';

/** 3D-printed pieces and pieces on fabric are made, sized and priced differently. */
export type Material = '3d' | 'fabric';
export type Product = 'blank' | 'kit' | 'stitched' | 'fabric_kit' | 'fabric_stitched' | 'fabric_framed';
export type Size = 'S' | 'M' | 'L';
/** An order's size: XL is larger than the size table, made only on a quote. */
export type OrderSize = Size | 'XL';
export type OrderStatus = 'quote_requested' | 'quoted' | 'awaiting_accept' | 'awaiting_payment' | 'payment_review' | 'paid' | 'in_production' | 'shipped' | 'done' | 'cancelled';

export const PRODUCTS: { id: Product; material: Material; name: () => string; desc: () => string; perStitch?: true }[] = [
  { id: 'kit', material: '3d', name: () => t('ชุดปักเอง', 'Stitch-it-yourself kit'), desc: () => t('ชิ้นงาน + ด้ายครบทุกสีตามลาย + เข็ม + การ์ดแผนผัง', 'The piece + every thread in the pattern + needle + chart card') },
  { id: 'blank', material: '3d', name: () => t('ชิ้นงานเปล่า', 'Printed piece only'), desc: () => t('ชิ้นงานพิมพ์ตามรูปทรงนี้ มีรูสำหรับปักทั้งชิ้น ไม่มีด้าย ดูแผนผังสีได้ในแอป', 'The printed piece in this shape, with stitch holes all over; no threads. Your color chart stays in the app.') },
  { id: 'stitched', material: '3d', perStitch: true, name: () => t('ปักเสร็จพร้อมใช้', 'Fully stitched'), desc: () => t('ร้านปักให้เสร็จ', 'The shop stitches it for you') },
  { id: 'fabric_kit', material: 'fabric', name: () => t('ชุดปักเอง (ผ้า + ด้าย)', 'Kit (fabric + threads)'), desc: () => t('ผ้าตามที่ลายกำหนด ตัดเผื่อขอบ + ด้ายครบทุกสีตามลาย + เข็ม + แผนผังพิมพ์', 'Fabric as the pattern says, cut with margins + every thread + needle + printed chart') },
  { id: 'fabric_stitched', material: 'fabric', perStitch: true, name: () => t('ปักเสร็จ', 'Stitched'), desc: () => t('ร้านปักให้เสร็จบนผ้า ไม่ใส่กรอบ', 'The shop stitches it on fabric, unframed') },
  { id: 'fabric_framed', material: 'fabric', perStitch: true, name: () => t('ปักเสร็จใส่กรอบ', 'Stitched and framed'), desc: () => t('ร้านปักให้เสร็จและใส่กรอบพร้อมแขวน', 'The shop stitches it and frames it, ready to hang') },
];
export const productName = (id: string) => PRODUCTS.find((p) => p.id === id)?.name() ?? id;
export const productMaterial = (id: string): Material => (id.startsWith('fabric_') ? 'fabric' : '3d');

export const PLASTIC_COLORS = [
  () => t('ขาว', 'White'), () => t('ครีม', 'Cream'), () => t('ดำ', 'Black'), () => t('ชมพูพาสเทล', 'Pastel pink'),
  () => t('ฟ้าพาสเทล', 'Pastel blue'), () => t('เขียวมินต์', 'Mint'),
];

export const STATUS_LABEL: Record<OrderStatus, () => string> = {
  quote_requested: () => t('รอร้านเสนอราคา', 'Waiting for a quote'),
  quoted: () => t('ร้านเสนอราคาแล้ว', 'Quote received'),
  awaiting_accept: () => t('รอร้านตอบรับ', 'Waiting for the shop'),
  awaiting_payment: () => t('รอชำระเงิน', 'Awaiting payment'),
  payment_review: () => t('รอตรวจสลิป', 'Checking payment'),
  paid: () => t('ชำระแล้ว', 'Paid'),
  in_production: () => t('กำลังผลิต', 'In production'),
  shipped: () => t('จัดส่งแล้ว', 'Shipped'),
  done: () => t('ได้รับแล้ว', 'Received'),
  cancelled: () => t('ยกเลิก', 'Cancelled'),
};
export const ORDER_STATUSES = Object.keys(STATUS_LABEL) as OrderStatus[];
export const isClosed = (s: OrderStatus) => s === 'done' || s === 'cancelled';

// ---------- material and size ----------

/** What a pattern would be made as: 3D (printed pieces, templates, models) or fabric; null = neither. */
export function materialOf(p: Pick<Pattern, 'mode' | 'details'>): Material | null {
  if (p.mode === 'template' || p.details.baseType === 'print3d') return '3d';
  if (p.details.baseType === 'aida') return 'fabric';
  return null;
}

/** Size classes by the longest side in mm. Keep in step with piece_size() in 0013_rate_cards.sql. */
export const SIZE_LIMITS: Record<Material, [Size, number][]> = {
  '3d': [['S', 75], ['M', 120], ['L', 180]],
  fabric: [['S', 100], ['M', 200], ['L', 300]],
};
export const SIZES: Size[] = ['S', 'M', 'L'];
export const sizeLabel = (m: Material, s: OrderSize) => {
  if (s === 'XL') return t(`ใหญ่พิเศษ (เกิน ${SIZE_LIMITS[m][2][1] / 10} ซม. ตามใบเสนอราคา)`, `Extra large (over ${SIZE_LIMITS[m][2][1] / 10} cm, quoted)`);
  const max = SIZE_LIMITS[m].find(([x]) => x === s)![1] / 10;
  return s === 'S' ? t(`เล็ก (ไม่เกิน ${max} ซม.)`, `Small (up to ${max} cm)`)
    : s === 'M' ? t(`กลาง (ไม่เกิน ${max} ซม.)`, `Medium (up to ${max} cm)`)
    : t(`ใหญ่ (ไม่เกิน ${max} ซม.)`, `Large (up to ${max} cm)`);
};

/** Width and height of the piece in mm. */
export const pieceMm = (p: Pick<Pattern, 'cols' | 'rows' | 'pitchMm'>) => ({ w: p.cols * p.pitchMm, h: p.rows * p.pitchMm });
export const cm = (mm: number) => (mm / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });

export function sizeOf(p: Pick<Pattern, 'cols' | 'rows' | 'pitchMm'>, material: Material = '3d'): Size | null {
  const { w, h } = pieceMm(p);
  const longest = Math.max(w, h);
  return SIZE_LIMITS[material].find(([, max]) => longest <= max + 1e-6)?.[0] ?? null;
}

/** Why this pattern can't be ordered, or null when it can. */
export function cannotOrder(p: Pattern): string | null {
  const m = materialOf(p);
  if (!m) return t('ลายแบบนี้ยังสั่งผลิตไม่ได้ สั่งได้เฉพาะชิ้นงาน 3D และลายบนผ้า', 'This kind of pattern can’t be ordered yet: only 3D pieces and fabric patterns.');
  if (computeStats(p).total === 0) return t('ลายนี้ยังว่างอยู่ ลงสีก่อนค่อยสั่งผลิต', 'This pattern is still empty. Add some stitches first.');
  if (!sizeOf(p, m)) {
    const { w, h } = pieceMm(p);
    const max = SIZE_LIMITS[m][2][1] / 10;
    return m === '3d'
      ? t(`ชิ้นนี้ใหญ่ ${cm(w)} × ${cm(h)} ซม. เกินที่พิมพ์ได้ (ด้านยาวสุดไม่เกิน ${max} ซม.)`, `This piece is ${cm(w)} × ${cm(h)} cm, larger than can be printed (${max} cm on the longest side).`)
      : t(`ลายนี้ใหญ่ ${cm(w)} × ${cm(h)} ซม. เกินที่รับผลิต (ด้านยาวสุดไม่เกิน ${max} ซม.)`, `This design is ${cm(w)} × ${cm(h)} cm, larger than shops take (${max} cm on the longest side).`);
  }
  return null;
}

/** Quote requests take pieces up to this long on the longest side (mm). Keep in step with 0016_quotes.sql. */
export const QUOTE_MAX_MM = 1000;

/** Why this pattern can't even be quoted, or null when shops can be asked for a price. */
export function cannotQuote(p: Pattern): string | null {
  const m = materialOf(p);
  if (!m || computeStats(p).total === 0) return cannotOrder(p);
  const { w, h } = pieceMm(p);
  if (Math.max(w, h) > QUOTE_MAX_MM + 1e-6) return t(`ลายนี้ใหญ่ ${cm(w)} × ${cm(h)} ซม. เกินที่ร้านรับ (ด้านยาวสุดไม่เกิน 1 เมตร)`, `This design is ${cm(w)} × ${cm(h)} cm, larger than shops take (1 m on the longest side).`);
  return null;
}

export const baht = (n: number) => t(`${n.toLocaleString()} บาท`, `฿${n.toLocaleString()}`);

// ---------- placing an order ----------

export interface Address { name: string; phone: string; address: string; postcode: string }
export const emptyAddress: Address = { name: '', phone: '', address: '', postcode: '' };

/** What's missing or wrong in a delivery address (same rules as the database), or null when it's fine. */
export function addressProblem(a: Address): string | null {
  if (!a.name.trim()) return t('ใส่ชื่อผู้รับ', 'Enter the recipient’s name');
  if (!/^[0-9+ -]{9,20}$/.test(a.phone.trim())) return t('เบอร์โทรไม่ถูกต้อง', 'Check the phone number');
  if (a.address.trim().length < 10) return t('ใส่ที่อยู่ให้ครบ', 'Enter the full address');
  if (!/^[0-9]{5}$/.test(a.postcode.trim())) return t('รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก', 'The postcode is 5 digits');
  return null;
}

/** Delivery addresses of orders, by code (only yours, or your shop's until 30 days after closing). */
export async function orderAddresses(codes: string[]): Promise<Map<string, Address>> {
  const out = new Map<string, Address>();
  if (!codes.length) return out;
  const c = await client();
  const { data, error } = await c.rpc('order_addresses', { codes });
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as { code: string; ship_name: string; ship_phone: string; ship_address: string; ship_postcode: string }[]) {
    out.set(r.code, { name: r.ship_name, phone: r.ship_phone, address: r.ship_address, postcode: r.ship_postcode });
  }
  return out;
}

/** The address from your latest order, to fill in the next one. */
export async function lastAddress(): Promise<Address | null> {
  const c = await client();
  const { data } = await c.from('orders').select('code')
    .eq('user_id', getCloud().user?.id ?? '').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return (await orderAddresses([data.code])).get(data.code) ?? null;
}

/** XSD- + 6 characters that are easy to read aloud and type (no 0/O, 1/I). */
function newCode(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rnd = crypto.getRandomValues(new Uint8Array(6));
  return 'XSD-' + Array.from(rnd, (b) => abc[b % abc.length]).join('');
}

/** Turns the database's own error words into something a customer (or shop) can act on. */
export function friendlyOrderError(message: string): string {
  if (/too many orders/.test(message)) return t('สั่งหลายครั้งแล้วในชั่วโมงนี้ ลองใหม่อีกสักครู่', 'You’ve placed several orders this hour. Try again later.');
  if (/too many messages/.test(message)) return t('ส่งข้อความหลายครั้งแล้วในชั่วโมงนี้ ลองใหม่อีกสักครู่', 'You’ve sent many messages this hour. Try again later.');
  if (/piece too large/.test(message)) return t('ชิ้นนี้ใหญ่เกินที่เราพิมพ์ได้', 'This piece is larger than we can print.');
  if (/no price set/.test(message)) return t('ยังไม่ได้ตั้งราคาสำหรับแบบนี้ ลองเลือกแบบอื่น', 'This option has no price yet. Try another one.');
  if (/terms not accepted/.test(message)) return t('ต้องยอมรับเงื่อนไขการสั่งซื้อก่อน', 'Please accept the order terms first.');
  if (/seller terms not accepted/.test(message)) return t('ต้องยอมรับข้อกำหนดผู้ขายก่อนเปิดร้าน', 'Accept the seller terms to open a shop.');
  if (/design not allowed/.test(message)) return t('เจ้าของลายยังไม่อนุญาตให้ร้านอื่นผลิตลายนี้', 'The pattern’s author doesn’t let other shops make it.');
  if (/design not available/.test(message)) return t('ลายนี้ไม่ได้เปิดให้เห็นในแกลเลอรีแล้ว', 'This pattern is no longer shown in the gallery.');
  if (/wrong product/.test(message)) return t('สินค้านี้ไม่ตรงกับชนิดของลาย', 'That product doesn’t fit this kind of pattern.');
  if (/rights not confirmed/.test(message)) return t('ยืนยันก่อนว่าคุณมีสิทธิ์ให้ผลิตลายนี้', 'Confirm you may have this design made first.');
  if (/set up PromptPay first/.test(message)) return t('ตั้งพร้อมเพย์ในตั้งค่าร้านก่อนรับออเดอร์', 'Set up PromptPay in the shop settings before accepting orders.');
  if (/cannot be cancelled/.test(message)) return t('ยกเลิกได้เฉพาะออเดอร์ที่ยังไม่ได้ชำระเงิน', 'Only unpaid orders can be cancelled.');
  if (/shop not taking quotes/.test(message)) return t('ร้านนี้ไม่รับขอราคาสำหรับงานแบบนี้', 'This shop doesn’t take quote requests for this kind of piece.');
  if (/price changed/.test(message)) return t('ร้านเพิ่งแก้ราคา ดูราคาใหม่แล้วกดยอมรับอีกครั้ง', 'The shop has just changed the price. Check the new price and accept again.');
  if (/no quote to accept|not a quote request/.test(message)) return t('สถานะออเดอร์เปลี่ยนไปแล้ว รีเฟรชหน้าแล้วลองใหม่', 'The order has moved on; refresh and try again.');
  if (/price 1 to 100000/.test(message)) return t('ราคาต่อชิ้น 1–100,000 บาท', 'The price per piece is 1–100,000 THB');
  if (/shipping 0 to 10000/.test(message)) return t('ค่าส่ง 0–10,000 บาท', 'Shipping is 0–10,000 THB');
  if (/shop not taking orders/.test(message)) return t('ร้านนี้ปิดรับออเดอร์อยู่', 'This shop isn’t taking orders right now.');
  if (/shop is busy/.test(message)) return t('ร้านนี้มีออเดอร์เต็มแล้ว ลองใหม่ภายหลัง', 'This shop is full for now. Try again later.');
  if (/reason needed/.test(message)) return t('ใส่เหตุผลให้ลูกค้าทราบด้วย', 'Add a reason for the customer.');
  if (/refund not confirmed/.test(message)) return t('ออเดอร์นี้ชำระแล้ว ต้องคืนเงินลูกค้าก่อนยกเลิก', 'This order is paid; refund the customer before cancelling.');
  if (/tracking number needed/.test(message)) return t('ใส่เลขพัสดุก่อน', 'Enter the tracking number first.');
  if (/order not found/.test(message)) return t('ไม่พบออเดอร์นี้ หรือคุณไม่ได้ดูแลร้านของออเดอร์นี้', 'Order not found, or it isn’t your shop’s.');
  if (/not waiting for the shop|no slip to check|is not paid|not being made|is closed/.test(message))
    return t('สถานะออเดอร์เปลี่ยนไปแล้ว รีเฟรชหน้าแล้วลองใหม่', 'The order has moved on; refresh and try again.');
  if (navigator.onLine === false) return t('ไม่มีอินเทอร์เน็ต ลองใหม่เมื่อออนไลน์', 'You’re offline. Try again when you’re online.');
  return message;
}

export interface OrderOptions {
  shopId: number; product: Product; plasticColor: string; quantity: number; note: string; address: Address;
  /** the customer's word that they may have this design made */
  rightsConfirmed: boolean;
  /** the community post this design comes from (its own, or a copy of it), if any */
  postId?: string | null;
  /** ask the shop for a price instead of ordering at a listed one */
  quote?: boolean;
}

/** Place an order; returns its code. Size and price are worked out again by the database. */
export async function placeOrder(p: Pattern, o: OrderOptions): Promise<string> {
  const c = await client();
  const st = computeStats(p);
  const row = {
    title: (p.name || t('ลายไม่มีชื่อ', 'Untitled pattern')).slice(0, 80),
    template_name: p.templateName ?? null,
    cols: p.cols, rows: p.rows, pitch_mm: Math.round(p.pitchMm * 100) / 100,
    colors: st.colors.filter((x) => x.count > 0).length, stitches: st.total,
    data: await encodeShare(p),
    product: o.product, plastic_color: o.plasticColor.trim().slice(0, 40),
    quantity: Math.min(20, Math.max(1, Math.round(o.quantity))), note: o.note.trim().slice(0, 1000), lang,
    ship_name: o.address.name.trim().slice(0, 100), ship_phone: o.address.phone.trim(),
    ship_address: o.address.address.trim().slice(0, 500), ship_postcode: o.address.postcode.trim(),
    terms_version: ORDER_TERMS_VERSION, shop_id: o.shopId, rights_confirmed: o.rightsConfirmed, post_id: o.postId ?? null,
    is_quote: !!o.quote,
  };
  // a clash of two random codes is very unlikely; try once more if it happens
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = newCode();
    const { error } = await c.from('orders').insert({ ...row, code });
    if (!error) return code;
    if (!/duplicate|unique/i.test(error.message)) throw new Error(friendlyOrderError(error.message));
  }
  throw new Error(t('สั่งไม่สำเร็จ ลองอีกครั้ง', 'Couldn’t place the order. Please try again.'));
}

// ---------- reading orders (the customer's own; the team sees all) ----------

export interface Order {
  id: number; code: string; createdAt: string; updatedAt: string; mine: boolean;
  title: string; templateName: string | null; cols: number; rows: number; pitchMm: number; size: OrderSize;
  colors: number; stitches: number; data: string;
  product: Product; plasticColor: string; quantity: number; note: string;
  address: Address;
  unit: number; shipping: number; total: number;
  status: OrderStatus; slipPath: string | null; slipAt: string | null; paidAt: string | null;
  trackingCarrier: string; trackingNo: string; shippedAt: string | null; closedAt: string | null;
  /** version of the order terms agreed to when ordering */
  termsVersion: string;
  shopId: number | null; acceptedAt: string | null;
  cancelReason: string; cancelledBy: 'customer' | 'shop' | 'system' | null; refundConfirmed: boolean;
  postId: string | null;
  /** started as a quote request; quotedAt and quoteNote are the shop's latest quote */
  isQuote: boolean; quotedAt: string | null; quoteNote: string;
}

// the delivery address isn't a readable column (0013): it comes from orderAddresses()
export const ORDER_COLS = 'id, code, created_at, updated_at, user_id, title, template_name, cols, rows, pitch_mm, size, colors, stitches, data, product, plastic_color, quantity, note, unit_thb, shipping_thb, total_thb, status, slip_path, slip_at, paid_at, tracking_carrier, tracking_no, shipped_at, closed_at, terms_version, shop_id, accepted_at, cancel_reason, cancelled_by, refund_confirmed, post_id, is_quote, quoted_at, quote_note';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toOrder(r: any): Order {
  return {
    id: r.id, code: r.code, createdAt: r.created_at, updatedAt: r.updated_at, mine: r.user_id === getCloud().user?.id,
    title: r.title, templateName: r.template_name, cols: r.cols, rows: r.rows, pitchMm: Number(r.pitch_mm), size: r.size,
    colors: r.colors, stitches: r.stitches, data: r.data,
    product: r.product, plasticColor: r.plastic_color, quantity: r.quantity, note: r.note,
    address: emptyAddress,
    unit: r.unit_thb, shipping: r.shipping_thb, total: r.total_thb,
    status: r.status, slipPath: r.slip_path, slipAt: r.slip_at, paidAt: r.paid_at,
    trackingCarrier: r.tracking_carrier, trackingNo: r.tracking_no, shippedAt: r.shipped_at, closedAt: r.closed_at,
    termsVersion: r.terms_version ?? '',
    shopId: r.shop_id ?? null, acceptedAt: r.accepted_at ?? null,
    cancelReason: r.cancel_reason ?? '', cancelledBy: r.cancelled_by ?? null, refundConfirmed: !!r.refund_confirmed,
    postId: r.post_id ?? null,
    isQuote: !!r.is_quote, quotedAt: r.quoted_at ?? null, quoteNote: r.quote_note ?? '',
  };
}

/** Your own orders, newest first. */
export async function myOrders(): Promise<Order[]> {
  const c = await client();
  const { data, error } = await c.from('orders').select(ORDER_COLS)
    .eq('user_id', getCloud().user?.id ?? '').order('created_at', { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toOrder);
}

/**
 * Every order of yours with its messages, for "Download my data" (PDPA right to a copy). Rows as stored,
 * minus internal ids; slip images stay in private storage and are listed by upload time only.
 */
export async function myOrderData(): Promise<unknown[]> {
  const uid = getCloud().user?.id;
  if (!uid) return [];
  const c = await client();
  const { data, error } = await c.from('orders').select(ORDER_COLS).eq('user_id', uid).order('created_at', { ascending: true }).limit(1000);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (!rows.length) return [];
  const { data: msgs, error: mErr } = await c.from('order_messages').select('order_id, created_at, from_team, body')
    .in('order_id', rows.map((r) => r.id)).order('created_at', { ascending: true }).limit(5000);
  if (mErr) throw new Error(mErr.message);
  // your delivery addresses too (PDPA: a copy of everything about you)
  const addrs = await orderAddresses(rows.map((r) => r.code as string));
  return rows.map(({ id, user_id: _u, slip_path: slip, ...r }) => ({
    ...r,
    delivery: addrs.get(r.code as string) ?? null,
    slip_uploaded: !!slip,
    messages: (msgs ?? []).filter((m) => m.order_id === id).map(({ order_id: _o, ...m }) => m),
  }));
}

/** One order by code: yours, or one placed with a shop you work. Null when not found or not yours. */
export async function getOrder(code: string): Promise<Order | null> {
  const c = await client();
  const { data, error } = await c.from('orders').select(ORDER_COLS).eq('code', code).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const o = toOrder(data);
  return { ...o, address: (await orderAddresses([code]).catch(() => new Map<string, Address>())).get(code) ?? emptyAddress };
}

// ---------- the customer's actions ----------

/** Upload a payment slip and send it to the team for checking. */
export async function uploadSlip(o: Order, file: File): Promise<void> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(t('ใช้ไฟล์รูป JPG, PNG หรือ WebP', 'Use a JPG, PNG or WebP image'));
  if (file.size > 5 * 1024 * 1024) throw new Error(t('ไฟล์ใหญ่เกิน 5 MB', 'The file is over 5 MB'));
  const c = await client();
  const uid = getCloud().user?.id;
  if (!uid) throw new Error(t('เข้าสู่ระบบก่อน', 'Sign in first'));
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${uid}/${o.code}/${Date.now()}.${ext}`;
  const up = await c.storage.from('payment-slips').upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw new Error(friendlyOrderError(up.error.message));
  const { error } = await c.rpc('order_submit_slip', { order_code: o.code, slip: path });
  if (error) throw new Error(friendlyOrderError(error.message));
}

/** A short-lived link to look at a slip (the files are private). */
export async function slipUrl(path: string): Promise<string> {
  const c = await client();
  const { data, error } = await c.storage.from('payment-slips').createSignedUrl(path, 600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function cancelOrder(code: string): Promise<void> {
  const c = await client();
  const { error } = await c.rpc('order_cancel', { order_code: code });
  if (error) throw new Error(friendlyOrderError(error.message));
}

/** Accept the shop's quote at the total you were shown (fails if the shop has changed it since). */
export async function acceptQuote(code: string, total: number): Promise<void> {
  const c = await client();
  const { error } = await c.rpc('order_accept_quote', { order_code: code, p_total: total });
  if (error) throw new Error(friendlyOrderError(error.message));
}

export async function confirmReceived(code: string): Promise<void> {
  const c = await client();
  const { error } = await c.rpc('order_received', { order_code: code });
  if (error) throw new Error(friendlyOrderError(error.message));
}

// ---------- messages on an order ----------

export interface OrderMessage { id: number; createdAt: string; fromTeam: boolean; body: string }

export async function listMessages(orderId: number): Promise<OrderMessage[]> {
  const c = await client();
  const { data, error } = await c.from('order_messages').select('id, created_at, from_team, body')
    .eq('order_id', orderId).order('created_at', { ascending: true }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({ id: m.id, createdAt: m.created_at, fromTeam: m.from_team, body: m.body }));
}

export async function sendMessage(orderId: number, body: string): Promise<void> {
  const c = await client();
  const { error } = await c.from('order_messages').insert({ order_id: orderId, body: body.trim().slice(0, 1000) });
  if (error) throw new Error(friendlyOrderError(error.message));
}

// ---------- PromptPay QR (Thai QR payment, EMVCo) ----------

const tlv = (id: string, value: string) => id + String(value.length).padStart(2, '0') + value;

function crc16(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * The text inside a PromptPay QR for a fixed amount. `id` is a mobile number (10 digits),
 * a national/tax id (13 digits) or an e-wallet id (15 digits). Null when the id doesn't look like any of them.
 */
export function promptPayPayload(id: string, amount: number): string | null {
  const digits = id.replace(/[^0-9]/g, '');
  let account: string;
  if (digits.length === 10 && digits.startsWith('0')) account = tlv('01', ('66' + digits.slice(1)).padStart(13, '0'));
  else if (digits.length === 13) account = tlv('02', digits);
  else if (digits.length === 15) account = tlv('03', digits);
  else return null;
  const body = tlv('00', '01') + tlv('01', '12') + tlv('29', tlv('00', 'A000000677010111') + account)
    + tlv('53', '764') + tlv('54', amount.toFixed(2)) + tlv('58', 'TH') + '6304';
  return body + crc16(body);
}

// ---------- the shop's private notes (lib/shops.ts has the rest of the shop's side) ----------

export async function getTeamNote(orderId: number): Promise<string> {
  const c = await client();
  const { data } = await c.from('order_notes').select('note').eq('order_id', orderId).maybeSingle();
  return data?.note ?? '';
}

export async function saveTeamNote(orderId: number, note: string): Promise<void> {
  const c = await client();
  const { error } = await c.from('order_notes').upsert({ order_id: orderId, note: note.slice(0, 2000) });
  if (error) throw new Error(error.message);
}
