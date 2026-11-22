import { useEffect, useMemo, useState } from 'react';
import type { Pattern } from '../types';
import {
  PLASTIC_COLORS, PRODUCTS, addressProblem, baht, cannotOrder, cm, emptyAddress, lastAddress, pieceMm, placeOrder,
  sizeLabel, sizeOf, type Address, type Material, type Product,
} from '../lib/orders';
import { postInfo, postQuotes, shopQuotes, type ShopOffer } from '../lib/shops';
import { signInWithGoogle, useCloud } from '../lib/cloud';
import { detectInApp } from '../lib/inAppBrowser';
import { computeStats } from '../lib/stats';
import { trackStep } from '../lib/analytics';
import { t } from '../lib/i18n';
import { templateLabel } from '../lib/templates';
import { fabricLabel } from '../lib/fabrics';
import { navigate } from '../App';
import { Thumb } from './Thumb';
import { Icon } from './Icon';

/**
 * "สั่งผลิต": have this pattern made. The customer picks what they want (kit, stitched…), sees every shop that
 * makes it at this size with its own price, picks a shop, gives a delivery address and places the order; the
 * shop accepts it, and payment and everything after happen on the order page (#/order/<code>).
 * A community pattern (`postId`, or a copy of one: pattern.remixOf) is made by its author's shop, at the post's
 * own prices, and by other shops only if the author allows it.
 */
export function OrderRequestDialog({ pattern, onClose, postId }: { pattern: Pattern; onClose: () => void; postId?: string }) {
  const cloud = useCloud();
  useEffect(() => { trackStep('/order/1-form'); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal order-dialog" role="dialog" aria-modal="true" aria-labelledby="order-title">
        <header className="modal-head">
          <h3 id="order-title"><Icon name="cube" /> {t('สั่งผลิตลายนี้', 'Have this made')}</h3>
          <button className="icon-btn" onClick={onClose} aria-label={t('ปิด', 'Close')} title={t('ปิด', 'Close')}><Icon name="close" /></button>
        </header>
        {cloud.status === 'loading'
          ? <div className="fb-body"><p className="muted">{t('กำลังตรวจสอบบัญชี…', 'Checking your account…')}</p></div>
          : cloud.status !== 'signed-in' ? <SignInFirst /> : <OrderForm pattern={pattern} onClose={onClose} postId={postId ?? pattern.remixOf?.id ?? null} />}
      </div>
    </div>
  );
}

function SignInFirst() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const inApp = useMemo(() => detectInApp(), []);
  const go = async () => {
    setBusy(true);
    setErr('');
    try { await signInWithGoogle(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <>
      <div className="fb-body">
        <p><b>{t('เข้าสู่ระบบก่อนสั่งผลิต', 'Sign in to order')}</b></p>
        <p className="muted">{t('ออเดอร์จะผูกกับบัญชีของคุณ เพื่อให้ชำระเงิน ติดตามสถานะ และคุยกับร้านได้ในเว็บนี้ ดูได้ที่หน้า “ของฉัน”',
          'Orders belong to your account, so you can pay, follow the status and talk to the shop right here, under “My stuff”.')}</p>
        {err && <p className="error small">{err}</p>}
      </div>
      <footer className="modal-foot fb-foot">
        {inApp ? (
          <a className="btn primary" href="#/account">{t('ไปหน้าเข้าสู่ระบบ', 'Go to sign in')}</a>
        ) : (
          <button className="btn primary" onClick={go} disabled={busy}>{busy ? t('กำลังไปที่ Google…', 'Opening Google…') : t('เข้าสู่ระบบด้วย Google', 'Continue with Google')}</button>
        )}
      </footer>
    </>
  );
}

/** cheapest delivered first; the team and busier shops win a tie */
const sortOffers = (product: Product) => (a: ShopOffer, b: ShopOffer) =>
  (a.prices[product]! + a.shippingThb) - (b.prices[product]! + b.shippingThb) || Number(b.official) - Number(a.official) || b.delivered - a.delivered;
const offering = (offers: ShopOffer[] | null, p: Product) => (offers ?? []).filter((o) => o.prices[p] !== undefined);

function OrderForm({ pattern, onClose, postId }: { pattern: Pattern; onClose: () => void; postId: string | null }) {
  const [offers, setOffers] = useState<ShopOffer[] | null>(null);
  const [material, setMaterial] = useState<Material | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [shopId, setShopId] = useState<number | null>(null);
  const [color, setColor] = useState(() => PLASTIC_COLORS[0]());
  const [otherColor, setOtherColor] = useState('');
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [addr, setAddr] = useState<Address>(emptyAddress);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tried, setTried] = useState(false);
  const [agree, setAgree] = useState(false);
  const [rights, setRights] = useState(false);
  // the community post this design comes from (null when it's the customer's own, or the post is gone)
  const [source, setSource] = useState<{ id: string; authorShopId: number | null; allowMaking: boolean } | null>(null);

  const blocked = cannotOrder(pattern);
  const { w, h } = pieceMm(pattern);
  const stats = computeStats(pattern);
  const used = stats.colors.filter((c) => c.count > 0).length;
  const size = material ? sizeOf(pattern, material) : null;

  useEffect(() => {
    let live = true;
    if (!blocked) {
      Promise.all([
        shopQuotes(pattern),
        postId ? postInfo(postId).catch(() => null) : Promise.resolve(null),
        postId ? postQuotes(postId).catch(() => []) : Promise.resolve([] as ShopOffer[]),
      ]).then(([{ material: m, offers: list }, info, authorOffers]) => {
        if (!live) return;
        let mine = list;
        if (info && postId) {
          // other shops only with the author's leave; the author's shop sells at the post's own prices
          if (!info.allowMaking) mine = mine.filter((o) => o.shopId === info.authorShopId);
          for (const a of authorOffers) {
            const same = mine.find((o) => o.shopId === a.shopId);
            if (same) same.prices = { ...same.prices, ...a.prices }; else mine = [a, ...mine];
          }
          setSource({ id: postId, authorShopId: info.authorShopId, allowMaking: info.allowMaking });
        }
        setMaterial(m);
        setOffers(mine);
        // start on the first product some shop makes, at its cheapest shop
        const first = PRODUCTS.find((p) => p.material === m && offering(mine, p.id).length > 0);
        if (first) {
          setProduct(first.id);
          setShopId(offering(mine, first.id).sort(sortOffers(first.id))[0]?.shopId ?? null);
        }
      }).catch((e) => { if (live) { setErr((e as Error).message); setOffers([]); } });
    }
    lastAddress().then((a) => { if (live && a) setAddr((cur) => (cur.name || cur.address ? cur : a)); }).catch(() => { /* fill in by hand */ });
    return () => { live = false; };
  }, [pattern, blocked, postId]);

  const products = PRODUCTS.filter((p) => p.material === material && offering(offers, p.id).length > 0);
  const forProduct = product ? offering(offers, product).sort(sortOffers(product)) : [];
  const shop = forProduct.find((o) => o.shopId === shopId) ?? null;
  const unit = shop && product ? shop.prices[product]! : null;
  const total = unit !== null && shop ? unit * qty + shop.shippingThb : null;
  const pickProduct = (p: Product) => {
    setProduct(p);
    // keep the chosen shop if it makes this too, else take the cheapest
    if (offers?.find((o) => o.shopId === shopId)?.prices[p] === undefined) setShopId(offering(offers, p).sort(sortOffers(p))[0]?.shopId ?? null);
  };

  const plastic = color === 'other' ? otherColor : color;
  const addrErr = addressProblem(addr);
  const colorErr = material === '3d' && color === 'other' && !otherColor.trim() ? t('บอกสีที่ต้องการ', 'Say which color you want') : null;
  const canOrder = !blocked && !!shop && !!product && !busy;
  // the author selling their own design needs no word on its rights
  const byAuthor = !!source && !!shop && shop.shopId === source.authorShopId;
  const needRights = !byAuthor;

  const order = async () => {
    setTried(true);
    if (!canOrder || !shop || !product || addrErr || colorErr || !agree || (needRights && !rights)) return;
    setBusy(true);
    setErr('');
    try {
      const code = await placeOrder(pattern, {
        shopId: shop.shopId, product, plasticColor: material === '3d' ? plastic : '', quantity: qty, note, address: addr, rightsConfirmed: needRights ? rights : true,
        postId: source?.id ?? null,
      });
      trackStep('/order/2-placed');
      onClose();
      navigate(`#/order/${code}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  const field = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setAddr({ ...addr, [k]: e.target.value });
  const kind = pattern.details.baseType === 'aida' && pattern.mode === 'free' ? fabricLabel(pattern.details) : templateLabel(pattern.templateName) ?? t('ชิ้นงาน 3D', '3D piece');
  const remixed = !!source && !byAuthor;

  return (
    <>
      <div className="fb-body order-form">
        <div className="publish-head">
          <span className="pick-thumb"><Thumb pattern={pattern} max={64} view="stitch" /></span>
          <div>
            <b>{pattern.name}</b>
            <span className="muted small">{kind} · {cm(w)} × {cm(h)} {t('ซม.', 'cm')} · {t(`${used} สี`, `${used} ${used === 1 ? 'color' : 'colors'}`)}</span>
            {material && size && <span className="muted small">{sizeLabel(material, size)}</span>}
          </div>
        </div>
        {blocked && <p className="error small">{blocked}</p>}
        {!blocked && offers === null && <p className="muted small">{t('กำลังหาร้านที่รับผลิต…', 'Finding shops that make this…')}</p>}
        {!blocked && offers && offers.length === 0 && !err && (
          <div className="order-none">
            <p><b>{t('ยังไม่มีร้านที่รับผลิตลายนี้', 'No shop makes this design yet')}</b></p>
            <p className="muted small">{source && !source.allowMaking
              ? t('ลายนี้เป็นของสมาชิกในชุมชน เจ้าของลายยังไม่เปิดขาย และยังไม่อนุญาตให้ร้านอื่นผลิต', 'This is a community member’s pattern. Its author isn’t selling it yet and doesn’t let other shops make it.')
              : t(`ร้านที่เปิดอยู่ยังไม่รับ${material === 'fabric' ? 'ลายบนผ้า' : 'ชิ้นงาน 3D'}ขนาดนี้ ลองปรับขนาดลาย หรือกลับมาดูใหม่เมื่อมีร้านเพิ่ม`,
                `No open shop takes ${material === 'fabric' ? 'fabric pieces' : '3D pieces'} this size yet. Try another size, or check back as more shops open.`)}</p>
          </div>
        )}

        {products.length > 0 && (
          <div className="fb-field">
            <span>{t('อยากได้แบบไหน', 'What would you like?')}</span>
            <div className="order-products" role="radiogroup" aria-label={t('แบบสินค้า', 'Product')}>
              {products.map((p) => {
                const shops = offering(offers, p.id);
                const from = Math.min(...shops.map((o) => o.prices[p.id]!));
                return (
                  <label key={p.id} className={'order-product' + (product === p.id ? ' on' : '')}>
                    <input type="radio" name="product" checked={product === p.id} onChange={() => pickProduct(p.id)} />
                    <span>
                      <b>{p.name()}<em className="order-each">{shops.length > 1 ? t(`จาก ${baht(from)}`, `from ${baht(from)}`) : baht(from)}</em></b>
                      <small>{p.desc()}{p.perStitch && ` ${t(`ราคาตามจำนวนฝีเข็ม (ลายนี้ ${stats.total.toLocaleString()} ฝีเข็ม)`, `Priced by stitch count (${stats.total.toLocaleString()} stitches in this pattern)`)}`}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {product && forProduct.length > 0 && (
          <div className="fb-field">
            <span>{forProduct.length > 1 ? t(`เลือกร้าน · ${forProduct.length} ร้านทำได้`, `Choose a shop · ${forProduct.length} can make it`) : t('ร้านที่ผลิต', 'Made by')}</span>
            <div className="order-shops" role="radiogroup" aria-label={t('ร้าน', 'Shop')}>
              {forProduct.map((o) => (
                <label key={o.shopId} className={'order-shop' + (o.shopId === shopId ? ' on' : '')}>
                  <input type="radio" name="shop" checked={o.shopId === shopId} onChange={() => setShopId(o.shopId)} />
                  <span>
                    <b className="order-shop-head"><span>{o.shopName}{o.official && <span className="order-team">{t('ทีม', 'Team')}</span>}{!o.official && source && o.shopId === source.authorShopId && <span className="order-team">{t('เจ้าของลาย', 'The designer')}</span>}</span><em className="order-each">{baht(o.prices[product]!)}</em></b>
                    <small>
                      {o.delivered > 0 ? t(`ส่งสำเร็จ ${o.delivered} ออเดอร์`, `${o.delivered} delivered`) : o.official ? t('ร้านของทีมผู้สร้างเว็บ', 'The site team’s shop') : t('ร้านใหม่', 'New shop')}
                      {o.leadTime && <> · {t(`ผลิต ${o.leadTime}`, `ready in ${o.leadTime}`)}</>}
                      {' · '}{t(`ค่าส่ง ${baht(o.shippingThb)}`, `shipping ${baht(o.shippingThb)}`)}
                    </small>
                    {o.kitNote && (product === 'kit' || product === 'fabric_kit') && <small className="order-kit-note">{t('ในชุดมี', 'The kit has')}: {o.kitNote}</small>}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {shop && material === '3d' && (
          <div className="fb-field">
            <span>{t('สีพลาสติกของชิ้นงาน', 'Plastic color')}</span>
            <div className="publish-tags">
              {PLASTIC_COLORS.map((c) => {
                const name = c();
                return <button key={name} type="button" className={'chip' + (color === name ? ' on' : '')} aria-pressed={color === name} onClick={() => setColor(name)}>{name}</button>;
              })}
              <button type="button" className={'chip' + (color === 'other' ? ' on' : '')} aria-pressed={color === 'other'} onClick={() => setColor('other')}>{t('สีอื่น', 'Other')}</button>
            </div>
            {color === 'other' && (
              <input id="order-other-color" value={otherColor} maxLength={40} onChange={(e) => setOtherColor(e.target.value)} placeholder={t('เช่น เหลืองพาสเทล', 'e.g. pastel yellow')} aria-label={t('สีที่ต้องการ', 'Color you want')} />
            )}
            {tried && colorErr && <p className="error small">{colorErr}</p>}
          </div>
        )}

        {shop && (
          <>
            <div className="fb-field">
              <span>{t('จำนวน', 'Quantity')}</span>
              <div className="qty">
                <button type="button" className="icon-btn" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label={t('ลด', 'Less')}>−</button>
                <output aria-live="polite">{qty}</output>
                <button type="button" className="icon-btn" onClick={() => setQty((q) => Math.min(20, q + 1))} disabled={qty >= 20} aria-label={t('เพิ่ม', 'More')}><Icon name="plus" size={16} /></button>
                <span className="hint">{t('สูงสุด 20 ชิ้นต่อออเดอร์', 'Up to 20 per order')}</span>
              </div>
            </div>

            <fieldset className="order-address">
              <legend>{t('ที่อยู่จัดส่ง', 'Delivery address')}</legend>
              <div className="order-address-row">
                <label className="fb-field"><span>{t('ชื่อผู้รับ', 'Recipient')}</span>
                  <input value={addr.name} maxLength={100} autoComplete="name" onChange={field('name')} /></label>
                <label className="fb-field"><span>{t('เบอร์โทร', 'Phone')}</span>
                  <input value={addr.phone} maxLength={20} inputMode="tel" autoComplete="tel" onChange={field('phone')} placeholder="08x-xxx-xxxx" /></label>
              </div>
              <label className="fb-field"><span>{t('ที่อยู่', 'Address')}</span>
                <textarea value={addr.address} rows={2} maxLength={500} autoComplete="street-address" onChange={field('address')}
                  placeholder={t('บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด', 'House no., street, sub-district, district, province')} /></label>
              <label className="fb-field order-postcode"><span>{t('รหัสไปรษณีย์', 'Postcode')}</span>
                <input value={addr.postcode} maxLength={5} inputMode="numeric" autoComplete="postal-code" onChange={field('postcode')} /></label>
              {tried && addrErr && <p className="error small">{addrErr}</p>}
            </fieldset>

            <label className="fb-field">
              <span>{t(`ข้อความถึงร้าน ${shop.shopName} (ไม่บังคับ)`, `Note to ${shop.shopName} (optional)`)}</span>
              <textarea id="order-note" value={note} maxLength={1000} rows={2} onChange={(e) => setNote(e.target.value)}
                placeholder={t('เช่น อยากได้ภายในวันที่ 20 ธ.ค. เป็นของขวัญ', 'e.g. needed by 20 Dec as a gift')} />
            </label>

            {total !== null && unit !== null && (
              <dl className="order-sum" aria-label={t('สรุปราคา', 'Price')}>
                <div><dt>{t(`ชิ้นงาน ${baht(unit)} × ${qty}`, `Piece ${baht(unit)} × ${qty}`)}</dt><dd>{baht(unit * qty)}</dd></div>
                <div><dt>{t('ค่าจัดส่ง', 'Shipping')}</dt><dd>{baht(shop.shippingThb)}</dd></div>
                <div className="order-total"><dt>{t('รวม', 'Total')}</dt><dd>{baht(total)}</dd></div>
              </dl>
            )}
            <p className="hint">{shop.official
              ? t('กดสั่งแล้วจะไปที่หน้าออเดอร์ เพื่อชำระเงินผ่านพร้อมเพย์และแนบสลิป ทีมเริ่มผลิตหลังตรวจสลิปแล้ว', 'After ordering you’ll go to the order page to pay by PromptPay and attach the slip; the team starts once the payment is checked.')
              : t(`กดสั่งแล้ว ร้าน ${shop.shopName} จะตอบรับภายใน 3 วัน จากนั้นจึงชำระเงินผ่านพร้อมเพย์ของร้านในหน้าออเดอร์ ยังไม่ต้องโอนตอนนี้`,
                `${shop.shopName} answers within 3 days; then you pay the shop by PromptPay on the order page. Don’t pay now.`)}</p>

            {needRights && (
              <label className="check order-agree">
                <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />
                <span>{t('ลายนี้ฉันออกแบบเอง หรือได้รับอนุญาตจากเจ้าของให้ผลิตได้ และไม่ใช้ตัวการ์ตูน โลโก้ หรือแบรนด์ของคนอื่นโดยไม่ได้รับอนุญาต',
                  'I designed this pattern, or its owner allows it to be made, and it doesn’t use other people’s characters, logos or brands without permission')}</span>
              </label>
            )}
            {remixed && <p className="hint">{t('เจ้าของลายในชุมชนอนุญาตให้ร้านอื่นผลิตลายนี้ได้', 'The community author lets other shops make this pattern.')}</p>}
            {tried && needRights && !rights && <p className="error small">{t('ยืนยันสิทธิ์ในลายก่อน', 'Confirm the rights in this design first')}</p>}
            <label className="check order-agree">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>{t(<>ฉันอ่านและยอมรับ <a href="#/order-terms" target="_blank" rel="noopener">เงื่อนไขการสั่งซื้อ</a> และยินยอมให้ส่งชื่อ เบอร์โทร และที่อยู่จัดส่งให้ร้านที่เลือก เพื่อผลิตและจัดส่งออเดอร์นี้</>,
                <>I’ve read and accept the <a href="#/order-terms" target="_blank" rel="noopener">order terms</a>, and agree to my name, phone and delivery address going to the chosen shop to make and send this order</>)}</span>
            </label>
            {tried && !agree && <p className="error small">{t('ติ๊กยอมรับเงื่อนไขการสั่งซื้อก่อน', 'Tick to accept the order terms first')}</p>}
          </>
        )}
        {err && <p className="error small">{err}</p>}
      </div>
      <footer className="modal-foot fb-foot">
        <button className="btn" onClick={onClose}>{t('ยกเลิก', 'Cancel')}</button>
        <button className="btn primary" onClick={order} disabled={!canOrder}>
          <Icon name="check" size={16} /> {busy ? t('กำลังสั่ง…', 'Ordering…') : total !== null ? t(`สั่งเลย · ${baht(total)}`, `Place order · ${baht(total)}`) : t('สั่งเลย', 'Place order')}
        </button>
      </footer>
    </>
  );
}
