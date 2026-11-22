import { client, getCloud } from './cloud';
import { amModerator } from './moderation';
import { t } from './i18n';
import { computeStats } from './stats';
import type { Pattern } from '../types';
import {
  ORDER_COLS, friendlyOrderError, materialOf, orderAddresses, toOrder,
  type Material, type Order, type OrderStatus, type Product, type Size,
} from './orders';

/** Version of the seller terms (pages/SellerTerms.tsx) a shop accepts when it opens; stored on the shop. */
export const SELLER_TERMS_VERSION = '2026-11-22c';

/**
 * Shops (docs/marketplace.md). Every order belongs to a shop, which accepts it, checks the slip, makes and ships it.
 * The team's own production is the official shop, worked by moderators. Tables and permissions:
 * supabase/migrations/0012_shops.sql (tests: supabase/tests/0012_shops_test.sql).
 */

export interface Shop {
  id: number; ownerId: string; name: string; about: string; accepting: boolean; leadTime: string;
  shippingThb: number; official: boolean; suspended: boolean; createdAt: string;
  /** baht added per stitch on stitched pieces */
  stitchRate: number;
  /** what the shop's kits include */
  kitNote: string;
  /** what it takes quote requests for (0016) */
  quoteMaterials: Material[];
}

const SHOP_COLS = 'id, owner_id, name, about, accepting, lead_time, shipping_thb, official, suspended, created_at, stitch_rate, kit_note, quote_materials';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toShop = (r: any): Shop => ({
  id: r.id, ownerId: r.owner_id, name: r.name, about: r.about, accepting: r.accepting, leadTime: r.lead_time,
  shippingThb: r.shipping_thb, official: r.official, suspended: r.suspended, createdAt: r.created_at,
  stitchRate: Number(r.stitch_rate ?? 0), kitNote: r.kit_note ?? '', quoteMaterials: r.quote_materials ?? [],
});

export async function getShop(id: number): Promise<Shop | null> {
  const c = await client();
  const { data, error } = await c.from('shops').select(SHOP_COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toShop(data) : null;
}

/** The team's shop (where orders from the editor go until other shops have prices). */
export async function officialShop(): Promise<Shop | null> {
  const c = await client();
  const { data, error } = await c.from('shops').select(SHOP_COLS).eq('official', true).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toShop(data) : null;
}

/** Shops the signed-in user works: their own, and the team's for moderators. Own shop first. */
export async function shopsIWork(): Promise<Shop[]> {
  const uid = getCloud().user?.id;
  if (!uid) return [];
  const c = await client();
  const mod = await amModerator();
  const { data, error } = await c.from('shops').select(SHOP_COLS)
    .or(mod ? `owner_id.eq.${uid},official.eq.true` : `owner_id.eq.${uid}`);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toShop).sort((a, b) => Number(b.ownerId === uid) - Number(a.ownerId === uid));
}

export interface ShopEdit {
  name: string; about: string; accepting: boolean; leadTime: string; shippingThb: number; stitchRate: number; kitNote: string;
  quoteMaterials: Material[];
}

export function shopProblem(s: ShopEdit): string | null {
  if (s.name.trim().length < 2) return t('ชื่อร้านอย่างน้อย 2 ตัวอักษร', 'The shop name needs at least 2 characters');
  if (!Number.isInteger(s.shippingThb) || s.shippingThb < 0 || s.shippingThb > 2000) return t('ค่าส่ง 0–2,000 บาท', 'Shipping is 0–2,000 THB');
  if (!(s.stitchRate >= 0 && s.stitchRate <= 99.99) || Math.abs(Math.round(s.stitchRate * 100) - s.stitchRate * 100) > 1e-6) return t('ค่าปักต่อฝีเข็ม 0–99.99 บาท ทศนิยมไม่เกิน 2 ตำแหน่ง', 'The per-stitch rate is 0–99.99 THB, up to 2 decimals');
  return null;
}

export async function saveShop(id: number, s: ShopEdit): Promise<void> {
  const c = await client();
  const { error } = await c.from('shops').update({
    name: s.name.trim().slice(0, 60), about: s.about.trim().slice(0, 500), accepting: s.accepting,
    lead_time: s.leadTime.trim().slice(0, 30), shipping_thb: s.shippingThb,
    stitch_rate: s.stitchRate, kit_note: s.kitNote.trim().slice(0, 300),
    quote_materials: (['3d', 'fabric'] as Material[]).filter((m) => s.quoteMaterials.includes(m)),
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Open your own shop (one per account). Prices and PromptPay come next, in the shop settings. */
export async function openShop(name: string, payment: ShopPayment): Promise<void> {
  const c = await client();
  const { data, error } = await c.from('shops')
    .insert({ name: name.trim().slice(0, 60), seller_terms: SELLER_TERMS_VERSION, lead_time: t('5–7 วัน', '5–7 days') })
    .select('id').single();
  if (error) throw new Error(/duplicate/.test(error.message) ? t('บัญชีนี้มีร้านอยู่แล้ว', 'This account already has a shop') : friendlyOrderError(error.message));
  if (payment.promptpayId.trim()) await saveShopPayment(data.id, payment);
}

// ---------- rate cards ----------

/** 'kit:M' -> baht; a missing key means the shop doesn't offer it */
export type Rates = Record<string, number>;
export const rateKey = (p: Product, s: Size) => `${p}:${s}`;

export async function getRates(shopId: number): Promise<Rates> {
  const c = await client();
  const { data, error } = await c.from('shop_rates').select('product, size, price_thb').eq('shop_id', shopId);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r) => [`${r.product}:${r.size}`, r.price_thb]));
}

/** Replace the shop's rate card with these prices (anything left out is no longer offered). */
export async function saveRates(shopId: number, rates: Rates): Promise<void> {
  const c = await client();
  const rows = Object.entries(rates).map(([k, price]) => { const [product, size] = k.split(':'); return { shop_id: shopId, product, size, price_thb: price }; });
  const keep = new Set(Object.keys(rates));
  const current = await getRates(shopId);
  const gone = Object.keys(current).filter((k) => !keep.has(k));
  if (rows.length) {
    const { error } = await c.from('shop_rates').upsert(rows);
    if (error) throw new Error(error.message);
  }
  for (const k of gone) {
    const [product, size] = k.split(':');
    const { error } = await c.from('shop_rates').delete().eq('shop_id', shopId).eq('product', product).eq('size', size);
    if (error) throw new Error(error.message);
  }
}

// ---------- selling your own community posts (0014) ----------

/** A post's own prices (product -> baht), whether other shops may make it, and its author's shop, if any. */
export async function postInfo(postId: string): Promise<{ prices: Partial<Record<Product, number>>; allowMaking: boolean; authorShopId: number | null } | null> {
  const c = await client();
  const { data: post } = await c.from('posts').select('author, allow_making').eq('id', postId).maybeSingle();
  if (!post) return null;
  const [{ data: rows }, { data: shop }] = await Promise.all([
    c.from('post_prices').select('product, price_thb').eq('post_id', postId),
    c.from('shops').select('id').eq('owner_id', post.author).maybeSingle(),
  ]);
  return {
    prices: Object.fromEntries((rows ?? []).map((r) => [r.product, r.price_thb])),
    allowMaking: !!post.allow_making,
    authorShopId: shop?.id ?? null,
  };
}

/** Set your post's prices (anything left out is no longer sold) and whether other shops may make it. */
export async function savePostSale(postId: string, prices: Partial<Record<Product, number>>, allowMaking: boolean): Promise<void> {
  const c = await client();
  const current = await postInfo(postId);
  const rows = Object.entries(prices).map(([product, price]) => ({ post_id: postId, product, price_thb: price }));
  if (rows.length) {
    const { error } = await c.from('post_prices').upsert(rows);
    if (error) throw new Error(error.message);
  }
  for (const product of Object.keys(current?.prices ?? {}).filter((p) => !(p in prices))) {
    const { error } = await c.from('post_prices').delete().eq('post_id', postId).eq('product', product);
    if (error) throw new Error(error.message);
  }
  const { error } = await c.from('posts').update({ allow_making: allowMaking }).eq('id', postId);
  if (error) throw new Error(error.message);
}

// ---------- quotes: who can make this piece, for how much ----------

export interface ShopOffer {
  shopId: number; shopName: string; about: string; leadTime: string; shippingThb: number; official: boolean;
  kitNote: string; delivered: number; openedAt: string;
  /** product -> baht per piece, for the products this shop makes at this size */
  prices: Partial<Record<Product, number>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toOffers(data: any[] | null): ShopOffer[] {
  const byShop = new Map<number, ShopOffer>();
  for (const r of data ?? []) {
    const o: ShopOffer = byShop.get(r.shop_id) ?? {
      shopId: r.shop_id, shopName: r.shop_name, about: r.about ?? '', leadTime: r.lead_time ?? '', shippingThb: r.shipping_thb,
      official: r.official, kitNote: r.kit_note ?? '', delivered: Number(r.delivered ?? 0), openedAt: r.opened_at, prices: {},
    };
    if (r.unit_thb != null) o.prices[r.product as Product] = r.unit_thb;
    byShop.set(r.shop_id, o);
  }
  return [...byShop.values()];
}

/** The post's author's shop, if it's taking orders, with the post's own prices. */
export async function postQuotes(postId: string): Promise<ShopOffer[]> {
  const c = await client();
  const { data, error } = await c.rpc('post_quotes', { pid: postId });
  if (error) throw new Error(error.message);
  return toOffers(data);
}

/** Shops taking orders that can be asked for a price on this material (no prices: they quote). */
export async function quoteShops(material: Material): Promise<ShopOffer[]> {
  const c = await client();
  const { data, error } = await c.rpc('quote_shops', { p_material: material });
  if (error) throw new Error(error.message);
  return toOffers(data);
}

/** The shop quotes a price per piece, shipping and a note (or revises its quote before the customer answers). */
export async function sendQuote(code: string, unit: number, shipping: number, note: string): Promise<void> {
  const c = await client();
  const { error } = await c.rpc('shop_quote', { order_code: code, p_unit: unit, p_shipping: shipping, p_note: note.trim().slice(0, 500) });
  if (error) throw new Error(friendlyOrderError(error.message));
}

/** Every shop taking orders that makes this pattern at its size, priced by the database. */
export async function shopQuotes(p: Pattern): Promise<{ material: Material | null; offers: ShopOffer[] }> {
  const material = materialOf(p);
  if (!material) return { material, offers: [] };
  const c = await client();
  const { data, error } = await c.rpc('shop_quotes', {
    p_material: material, p_cols: p.cols, p_rows: p.rows, p_pitch: Math.round(p.pitchMm * 100) / 100, p_stitches: computeStats(p).total,
  });
  if (error) throw new Error(error.message);
  return { material, offers: toOffers(data) };
}

// ---------- payment details (only the shop's workers read them) ----------

export interface ShopPayment { promptpayId: string; promptpayName: string }

export async function getShopPayment(shopId: number): Promise<ShopPayment> {
  const c = await client();
  const { data, error } = await c.from('shop_payment').select('promptpay_id, promptpay_name').eq('shop_id', shopId).maybeSingle();
  if (error) throw new Error(error.message);
  return { promptpayId: data?.promptpay_id ?? '', promptpayName: data?.promptpay_name ?? '' };
}

export async function saveShopPayment(shopId: number, p: ShopPayment): Promise<void> {
  const c = await client();
  const { error } = await c.from('shop_payment').upsert({
    shop_id: shopId, promptpay_id: p.promptpayId.replace(/[^0-9]/g, ''), promptpay_name: p.promptpayName.trim().slice(0, 100),
  });
  if (error) throw new Error(error.message);
}

/** The shop's PromptPay for one of your orders; the database only gives it while the order waits for payment. */
export async function orderPayment(code: string): Promise<ShopPayment | null> {
  const c = await client();
  const { data, error } = await c.rpc('order_payment', { order_code: code });
  if (error) throw new Error(error.message);
  const row = (data as { promptpay_id: string; promptpay_name: string }[] | null)?.[0];
  return row?.promptpay_id ? { promptpayId: row.promptpay_id, promptpayName: row.promptpay_name } : null;
}

// ---------- the shop's orders ----------

/** Where an order sits for the shop: what it has to do next. */
export type Stage = 'quote' | 'accept' | 'payment' | 'slip' | 'make' | 'shipped' | 'closed';
export const STAGE_OF: Record<OrderStatus, Stage> = {
  quote_requested: 'quote', quoted: 'quote', awaiting_accept: 'accept', awaiting_payment: 'payment', payment_review: 'slip',
  paid: 'make', in_production: 'make', shipped: 'shipped', done: 'closed', cancelled: 'closed',
};
export const STAGES: { id: Stage; label: () => string }[] = [
  { id: 'quote', label: () => t('ขอราคา', 'Quotes') },
  { id: 'accept', label: () => t('รอรับงาน', 'To accept') },
  { id: 'slip', label: () => t('ตรวจสลิป', 'Check slip') },
  { id: 'make', label: () => t('ต้องผลิต', 'To make') },
  { id: 'payment', label: () => t('รอลูกค้าโอน', 'Awaiting payment') },
  { id: 'shipped', label: () => t('ส่งแล้ว', 'Shipped') },
  { id: 'closed', label: () => t('ปิดแล้ว', 'Closed') },
];

/** Open orders (all of them) and the latest closed ones, oldest first among the open. */
export async function shopOrders(shopId: number): Promise<Order[]> {
  const c = await client();
  const [open, closed] = await Promise.all([
    c.from('orders').select(ORDER_COLS).eq('shop_id', shopId).not('status', 'in', '(done,cancelled)').order('created_at', { ascending: true }).limit(300),
    c.from('orders').select(ORDER_COLS).eq('shop_id', shopId).in('status', ['done', 'cancelled']).order('updated_at', { ascending: false }).limit(100),
  ]);
  if (open.error) throw new Error(open.error.message);
  if (closed.error) throw new Error(closed.error.message);
  const orders = [...(open.data ?? []), ...(closed.data ?? [])].map(toOrder);
  // addresses come separately: the shop sees them until 30 days after an order closes
  const addrs = await orderAddresses(orders.map((o) => o.code)).catch(() => new Map());
  return orders.map((o) => ({ ...o, address: addrs.get(o.code) ?? o.address }));
}

export type ShopAction = 'accept' | 'decline' | 'slip_ok' | 'slip_bad' | 'start' | 'ship' | 'cancel' | 'set_status';

export async function shopAction(code: string, action: ShopAction, opts: {
  reason?: string; carrier?: string; tracking?: string; refunded?: boolean; status?: OrderStatus;
} = {}): Promise<void> {
  const c = await client();
  const { error } = await c.rpc('shop_order_action', {
    order_code: code, action, reason: opts.reason ?? '', carrier: opts.carrier ?? '', tracking: opts.tracking ?? '',
    refunded: !!opts.refunded, new_status: opts.status ?? null,
  });
  if (error) throw new Error(friendlyOrderError(error.message));
}

// ---------- reviews (0015) ----------

export interface Review { orderId?: number; rating: number; body: string; reply: string | null; repliedAt: string | null; createdAt: string; product?: Product; hidden?: boolean }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toReview = (r: any): Review => ({
  orderId: r.order_id, rating: r.rating, body: r.body ?? '', reply: r.reply ?? null, repliedAt: r.replied_at ?? null,
  createdAt: r.created_at, product: r.product, hidden: r.hidden,
});

/** The review of one order (yours, or your shop's), or null. */
export async function orderReview(orderId: number): Promise<Review | null> {
  const c = await client();
  const { data, error } = await c.from('order_reviews').select('order_id, rating, body, reply, replied_at, hidden, created_at').eq('order_id', orderId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toReview(data) : null;
}

/** Reviews of a shop's orders, for the shop's own list (visible or hidden). */
export async function reviewsFor(orderIds: number[]): Promise<Map<number, Review>> {
  const out = new Map<number, Review>();
  if (!orderIds.length) return out;
  const c = await client();
  const { data, error } = await c.from('order_reviews').select('order_id, rating, body, reply, replied_at, hidden, created_at').in('order_id', orderIds);
  if (error) throw new Error(error.message);
  for (const r of data ?? []) out.set(r.order_id, toReview(r));
  return out;
}

export async function submitReview(orderId: number, rating: number, body: string): Promise<void> {
  const c = await client();
  const { error } = await c.from('order_reviews').insert({ order_id: orderId, rating, body: body.trim().slice(0, 1000) });
  if (error) throw new Error(/duplicate/.test(error.message) ? t('รีวิวออเดอร์นี้ไปแล้ว', 'You’ve already reviewed this order') : friendlyOrderError(error.message));
}

export async function replyReview(orderId: number, reply: string): Promise<void> {
  const c = await client();
  const { error } = await c.rpc('review_reply', { p_order_id: orderId, p_reply: reply.trim().slice(0, 500) });
  if (error) throw new Error(error.message);
}

/** Moderators: hide a review from the public (or show it again). */
export async function hideReview(orderId: number, hidden: boolean): Promise<void> {
  const c = await client();
  const { error } = await c.rpc('review_hide', { p_order_id: orderId, p_hidden: hidden });
  if (error) throw new Error(error.message);
}

/** A shop's visible reviews (newest first), without who wrote them. */
export async function shopReviews(shopId: number): Promise<Review[]> {
  const c = await client();
  const { data, error } = await c.rpc('shop_reviews', { sid: shopId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).map(toReview);
}

export interface ShopStats { delivered: number; reviews: number; rating: number | null }

/** Delivered orders, visible reviews and the average rating for some shops. */
export async function shopStats(ids: number[]): Promise<Map<number, ShopStats>> {
  const out = new Map<number, ShopStats>();
  if (!ids.length) return out;
  const c = await client();
  const { data, error } = await c.rpc('shop_stats', { ids });
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as { shop_id: number; delivered: number; reviews: number; rating: number | null }[]) {
    out.set(r.shop_id, { delivered: Number(r.delivered), reviews: Number(r.reviews), rating: r.rating == null ? null : Number(r.rating) });
  }
  return out;
}

// ---------- a shop's public page ----------

export interface ShopForSale { id: string; title: string; data: string; base: 'aida' | 'print3d'; from: number }

/** What the public shop page shows: the shop, its rates, its own community patterns for sale, its reviews. */
export async function shopProfileData(shopId: number) {
  const c = await client();
  const shop = await getShop(shopId);
  if (!shop) return null;
  const [rates, stats, reviews, posts] = await Promise.all([
    getRates(shopId),
    shopStats([shopId]),
    shopReviews(shopId),
    c.from('posts').select('id, title, data, base, post_prices!inner(price_thb)').eq('author', shop.ownerId).eq('status', 'published').limit(60),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const forSale: ShopForSale[] = ((posts.data ?? []) as any[]).map((p) => ({
    id: p.id, title: p.title, data: p.data, base: p.base, from: Math.min(...(p.post_prices ?? []).map((x: { price_thb: number }) => x.price_thb)),
  }));
  return { shop, rates, stats: stats.get(shopId) ?? { delivered: 0, reviews: 0, rating: null }, reviews, forSale };
}

// ---------- reports ----------

export type ReportReason = 'not_shipped' | 'no_refund' | 'wrong_item' | 'off_site_payment' | 'rude' | 'other';
export const REPORT_REASONS: { id: ReportReason; label: () => string }[] = [
  { id: 'not_shipped', label: () => t('ชำระแล้วแต่ไม่ได้ของ', 'Paid but never received') },
  { id: 'no_refund', label: () => t('ยกเลิกแล้วแต่ไม่คืนเงิน', 'Cancelled but not refunded') },
  { id: 'wrong_item', label: () => t('ได้ของไม่ตรงกับที่สั่ง', 'Got something different from the order') },
  { id: 'off_site_payment', label: () => t('ขอให้โอนนอกระบบหรือเก็บเงินเพิ่ม', 'Asked to pay another way or more') },
  { id: 'rude', label: () => t('พูดจาไม่สุภาพหรือคุกคาม', 'Rude or harassing') },
  { id: 'other', label: () => t('อื่น ๆ', 'Something else') },
];
export const reportReasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label() ?? id;

export async function reportShop(shopId: number, reason: ReportReason, note: string, orderId?: number | null): Promise<void> {
  const c = await client();
  const { error } = await c.from('shop_reports').insert({ shop_id: shopId, order_id: orderId ?? null, reason, note: note.trim().slice(0, 1000) });
  if (error) throw new Error(/too many reports/.test(error.message) ? t('แจ้งปัญหาหลายครั้งแล้ววันนี้ ลองใหม่พรุ่งนี้', 'You’ve sent several reports today. Try again tomorrow.') : friendlyOrderError(error.message));
}

export interface ShopReport {
  id: number; shopId: number; shopName: string; orderId: number | null; orderCode: string | null;
  reason: ReportReason; note: string; createdAt: string; resolvedAt: string | null; resolution: string | null;
}

/** Moderators: reports, open ones first. */
export async function listShopReports(open: boolean): Promise<ShopReport[]> {
  const c = await client();
  let q = c.from('shop_reports').select('id, shop_id, order_id, reason, note, created_at, resolved_at, resolution, shops(name), orders(code)');
  q = open ? q.is('resolved_at', null) : q.not('resolved_at', 'is', null);
  const { data, error } = await q.order('created_at', { ascending: open }).limit(200);
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id, shopId: r.shop_id, shopName: r.shops?.name ?? '?', orderId: r.order_id, orderCode: r.orders?.code ?? null,
    reason: r.reason, note: r.note, createdAt: r.created_at, resolvedAt: r.resolved_at, resolution: r.resolution,
  }));
}

/** Moderators: close a report; 'suspended' also suspends the shop. */
export async function resolveShopReport(r: ShopReport, resolution: 'dismissed' | 'warned' | 'suspended'): Promise<void> {
  const c = await client();
  if (resolution === 'suspended') {
    const { error } = await c.from('shops').update({ suspended: true }).eq('id', r.shopId);
    if (error) throw new Error(error.message);
  }
  const { error } = await c.from('shop_reports').update({ resolution, resolved_at: new Date().toISOString() }).eq('id', r.id);
  if (error) throw new Error(error.message);
}

/** Moderators: restore a suspended shop. */
export async function setShopSuspended(shopId: number, suspended: boolean): Promise<void> {
  const c = await client();
  const { error } = await c.from('shops').update({ suspended }).eq('id', shopId);
  if (error) throw new Error(error.message);
}
