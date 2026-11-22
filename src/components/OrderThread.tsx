import { useCallback, useEffect, useRef, useState } from 'react';
import { listMessages, sendMessage, type OrderMessage } from '../lib/orders';
import { t, locale } from '../lib/i18n';
import { Icon } from './Icon';
import { APP_NAME } from '../lib/brand';

const when = (iso: string) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Messages between the customer and the team on one order. `asTeam` flips whose messages sit on the right.
 * Reloads when the tab comes back into view, so a reply shows up without a refresh.
 */
export function OrderThread({ orderId, asTeam, shopName, onMessages }: {
  orderId: number; asTeam: boolean;
  /** the shop the order went to; its messages carry this name (the team's shop by default) */
  shopName?: string;
  /** called with the messages every time they (re)load, e.g. so the team card can show a count */
  onMessages?: (items: OrderMessage[]) => void;
}) {
  const shop = shopName ? t(`ร้าน ${shopName}`, shopName) : t(`ทีม ${APP_NAME}`, `the ${APP_NAME} team`);
  const [items, setItemsState] = useState<OrderMessage[] | null>(null);
  const report = useRef(onMessages);
  report.current = onMessages;
  const setItems = useCallback((list: OrderMessage[]) => { setItemsState(list); report.current?.(list); }, []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    listMessages(orderId).then(setItems).catch((e) => setErr((e as Error).message));
  }, [orderId, setItems]);
  useEffect(() => {
    load();
    const back = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [load]);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      await sendMessage(orderId, text);
      setText('');
      setItems(await listMessages(orderId));
      endRef.current?.scrollIntoView({ block: 'nearest' });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="order-thread">
      {items === null && !err && <p className="muted small">{t('กำลังโหลดข้อความ…', 'Loading messages…')}</p>}
      {items && items.length === 0 && (
        <p className="muted small">{asTeam
          ? t('ยังไม่มีข้อความ', 'No messages yet')
          : t(`มีคำถามเรื่องออเดอร์นี้? พิมพ์ถึง${shop} ได้ที่นี่`, `Questions about this order? Write to ${shop} here.`)}</p>
      )}
      {items && items.length > 0 && (
        <ol className="order-msgs">
          {items.map((m) => {
            const own = m.fromTeam === asTeam;
            return (
              <li key={m.id} className={own ? 'own' : ''}>
                <span className="order-msg-who">{m.fromTeam ? shop : asTeam ? t('ลูกค้า', 'Customer') : t('คุณ', 'You')} · {when(m.createdAt)}</span>
                <p>{m.body}</p>
              </li>
            );
          })}
        </ol>
      )}
      <div ref={endRef} />
      <div className="order-reply">
        <textarea value={text} rows={2} maxLength={1000} onChange={(e) => setText(e.target.value)}
          aria-label={asTeam ? t('ตอบลูกค้า', 'Reply to the customer') : t(`ข้อความถึง${shop}`, `Message to ${shop}`)}
          placeholder={asTeam ? t('ตอบลูกค้า…', 'Reply to the customer…') : t(`พิมพ์ถึง${shop}…`, `Write to ${shop}…`)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} />
        <button className="btn primary" onClick={send} disabled={busy || !text.trim()}>
          <Icon name="send" size={16} /> {busy ? t('กำลังส่ง…', 'Sending…') : t('ส่ง', 'Send')}
        </button>
      </div>
      {err && <p className="error small">{err}</p>}
    </div>
  );
}
