import { useEffect, useState } from 'react';
import type { Post } from '../lib/community';
import { PRODUCTS, baht, type Material, type Product } from '../lib/orders';
import { postInfo, savePostSale, shopsIWork, type Shop } from '../lib/shops';
import { getCloud } from '../lib/cloud';
import { t } from '../lib/i18n';
import { Icon } from './Icon';

/**
 * "ขายลายนี้": on your own community post, set what your shop sells it for (blank = not sold) and whether other
 * shops may make it. Needs a shop of your own; the post's material decides which products can be priced.
 */
export function SellPostPanel({ post, onSaved }: { post: Post; onSaved: (allowMaking: boolean) => void }) {
  const material: Material = post.base === 'aida' ? 'fabric' : '3d';
  const [shop, setShop] = useState<Shop | null | undefined>(undefined);
  const [text, setText] = useState<Record<string, string> | null>(null);
  const [allow, setAllow] = useState(post.allowMaking);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    const uid = getCloud().user?.id;
    shopsIWork().then((list) => { if (live) setShop(list.find((s) => s.ownerId === uid) ?? null); }).catch(() => { if (live) setShop(null); });
    postInfo(post.id).then((info) => {
      if (!live || !info) return;
      setText(Object.fromEntries(Object.entries(info.prices).map(([k, v]) => [k, String(v)])));
      setAllow(info.allowMaking);
    }).catch((e) => { if (live) setErr((e as Error).message); });
    return () => { live = false; };
  }, [post.id]);

  const products = PRODUCTS.filter((p) => p.material === material);
  const prices = Object.fromEntries(Object.entries(text ?? {}).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, Number(v)])) as Partial<Record<Product, number>>;
  const bad = Object.values(prices).some((n) => !Number.isInteger(n) || n! < 1 || n! > 100000);
  const save = async () => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await savePostSale(post.id, prices, allow);
      setMsg(t('บันทึกแล้ว', 'Saved'));
      onSaved(allow);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="order-card-box sell-post">
      <summary><Icon name="cube" size={16} /> {t('ขายลายนี้', 'Sell this pattern')}</summary>
      {shop === undefined || text === null ? <p className="muted small">{t('กำลังโหลด…', 'Loading…')}</p> : !shop ? (
        <>
          <p className="muted">{t('เปิดร้านก่อนแล้วจึงตั้งราคาขายลายนี้ได้ ลูกค้าจะสั่งได้จากหน้านี้ และร้านของคุณเป็นคนผลิต', 'Open a shop first to price this pattern. Customers order it from this page and your shop makes it.')}</p>
          <div className="btn-row"><a className="btn" href="#/shop">{t('เปิดร้าน', 'Open a shop')}</a></div>
        </>
      ) : (
        <>
          <p className="hint">{t(`ราคาที่ร้าน ${shop.name} ขายลายนี้ (ไม่รวมค่าส่ง ${baht(shop.shippingThb)}) เว้นว่าง = ใช้ราคาจากตั้งค่าร้านแทน ถ้ามี`,
            `What ${shop.name} sells this pattern for (shipping ${baht(shop.shippingThb)} extra). Blank = your shop’s usual price, if it has one.`)}</p>
          <table className="order-price-table">
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <th>{p.name()}<small> {p.desc()}</small></th>
                  <td><input inputMode="numeric" placeholder="–" value={text[p.id] ?? ''} aria-label={p.name()}
                    onChange={(e) => setText({ ...text, [p.id]: e.target.value.replace(/[^0-9]/g, '') })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <label className="check"><input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} />
            <span>{t('อนุญาตให้ร้านอื่นรับผลิตลายนี้', 'Let other shops make this pattern')}
              <small> {t('ลูกค้าเลือกร้านอื่นได้ด้วย ร้านนั้นคิดราคาของร้านเอง ปิดไว้ = ผลิตได้เฉพาะร้านของคุณ', 'Customers can pick other shops too, at their own prices. Off = only your shop makes it.')}</small></span></label>
          {!shop.accepting && <p className="hint">{t('ร้านของคุณปิดรับออเดอร์อยู่ ลูกค้าจะยังสั่งจากร้านคุณไม่ได้', 'Your shop is closed for orders, so customers can’t order from you yet.')}</p>}
          {bad && <p className="error small">{t('ราคาต้องเป็นตัวเลขเต็ม 1–100,000 บาท', 'Prices are whole numbers, 1–100,000 THB')}</p>}
          {err && <p className="error small">{err}</p>}
          <div className="btn-row">
            <button className="btn primary sm" disabled={busy || bad} onClick={save}>{busy ? t('กำลังบันทึก…', 'Saving…') : t('บันทึก', 'Save')}</button>
            {msg && <span className="hint">{msg}</span>}
          </div>
        </>
      )}
    </details>
  );
}
