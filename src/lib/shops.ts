import { client, getCloud } from './cloud';
import { amModerator } from './moderation';
import { t } from './i18n';
import { ORDER_COLS, friendlyOrderError, toOrder, type Order, type OrderStatus } from './orders';

/**
 * Shops (docs/marketplace.md). Every order belongs to a shop, which accepts it, checks the slip, makes and ships it.
 * The team's own production is the official shop, worked by moderators. Tables and permissions:
 * supabase/migrations/0012_shops.sql (tests: supabase/tests/0012_shops_test.sql).
 */

export interface Shop {
  id: number; ownerId: string; name: string; about: string; accepting: boolean; leadTime: string;
  shippingThb: number; official: boolean; suspended: boolean; createdAt: string;
}

const SHOP_COLS = 'id, owner_id, name, about, accepting, lead_time, shipping_thb, official, suspended, created_at';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toShop = (r: any): Shop => ({
  id: r.id, ownerId: r.owner_id, name: r.name, about: r.about, accepting: r.accepting, leadTime: r.lead_time,
  shippingThb: r.shipping_thb, official: r.official, suspended: r.suspended, createdAt: r.created_at,
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

export interface ShopEdit { name: string; about: string; accepting: boolean; leadTime: string; shippingThb: number }

export function shopProblem(s: ShopEdit): string | null {
  if (s.name.trim().length < 2) return t('ชื่อร้านอย่างน้อย 2 ตัวอักษร', 'The shop name needs at least 2 characters');
  if (!Number.isInteger(s.shippingThb) || s.shippingThb < 0 || s.shippingThb > 2000) return t('ค่าส่ง 0–2,000 บาท', 'Shipping is 0–2,000 THB');
  return null;
}

export async function saveShop(id: number, s: ShopEdit): Promise<void> {
  const c = await client();
  const { error } = await c.from('shops').update({
    name: s.name.trim().slice(0, 60), about: s.about.trim().slice(0, 500), accepting: s.accepting,
    lead_time: s.leadTime.trim().slice(0, 30), shipping_thb: s.shippingThb,
  }).eq('id', id);
  if (error) throw new Error(error.message);
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
export type Stage = 'accept' | 'payment' | 'slip' | 'make' | 'shipped' | 'closed';
export const STAGE_OF: Record<OrderStatus, Stage> = {
  awaiting_accept: 'accept', awaiting_payment: 'payment', payment_review: 'slip',
  paid: 'make', in_production: 'make', shipped: 'shipped', done: 'closed', cancelled: 'closed',
};
export const STAGES: { id: Stage; label: () => string }[] = [
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
  return [...(open.data ?? []), ...(closed.data ?? [])].map(toOrder);
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
