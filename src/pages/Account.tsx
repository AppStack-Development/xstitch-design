import { useEffect, useState, type ReactNode } from 'react';
import { StitchLoader } from '../components/StitchLoader';
import { askConfirm } from '../components/ConfirmDialog';
import { useCloud, signInWithGoogle, getCloud } from '../lib/cloud';
import { syncNow, signOutAndClear, exportMyData, deleteMyAccount, accountCounts } from '../lib/sync';
import { downloadBlob } from '../lib/share';
import { t, locale } from '../lib/i18n';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { Avatar } from '../components/AccountButton';
import { navigate } from '../App';
import { FeedbackLink } from '../components/FeedbackDialog';
import { detectInApp, externalUrl, canOpenExternally, type InAppInfo } from '../lib/inAppBrowser';
import { trackStep } from '../lib/analytics';
import { communityEnabled, getMyCreator, myPosts, saveMyCreator, unpublish, type Post } from '../lib/community';
import { amModerator, openPostCount } from '../lib/moderation';
import { useStash } from '../lib/stash';
import { DMC_LIBRARY } from '../lib/threads';
import { STATUS_LABEL as ORDER_STATUS, baht, isClosed, myOrders, ordersEnabled, type Order } from '../lib/orders';
import { APP_SLUG } from '../lib/brand';
import { listShopReports, shopsIWork, type Shop } from '../lib/shops';

const errText = (e: unknown) => (e as Error)?.message || t('เกิดข้อผิดพลาด ลองอีกครั้ง', 'Something went wrong. Please try again.');

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Google "G" mark. */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Small modal used for the sign-out and delete confirmations. */
function Confirm({ title, icon, onClose, busy, children, actions }: {
  title: string; icon: 'logout' | 'trash'; onClose: () => void; busy: boolean; children: ReactNode; actions: ReactNode;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose, busy]);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal acct-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h3><Icon name={icon} /> {title}</h3>
          <button className="icon-btn" onClick={onClose} disabled={busy} title={t('ปิด (Esc)', 'Close (Esc)')} aria-label={t('ปิด', 'Close')}><Icon name="close" /></button>
        </header>
        <div className="acct-dialog-body">{children}</div>
        <footer className="modal-foot acct-dialog-foot">{actions}</footer>
      </div>
    </div>
  );
}

function SignOutDialog({ onClose }: { onClose: () => void }) {
  const [clear, setClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      await signOutAndClear(clear);
      onClose();
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  };
  return (
    <Confirm title={t('ออกจากระบบ', 'Sign out')} icon="logout" onClose={onClose} busy={busy}
      actions={<>
        <button className="btn" onClick={onClose} disabled={busy}>{t('ยกเลิก', 'Cancel')}</button>
        <button className="btn primary" onClick={go} disabled={busy}>
          <Icon name="logout" size={16} /> {busy ? t('กำลังออก…', 'Signing out…') : t('ออกจากระบบ', 'Sign out')}
        </button>
      </>}>
      <p>{t('ลายที่ซิงก์แล้วยังอยู่ในบัญชี เข้าสู่ระบบอีกครั้งเมื่อไรก็กลับมาได้', 'Your synced patterns stay in your account. Sign in again any time to get them back.')}</p>
      <label className="check">
        <input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} disabled={busy} />
        <span>{t('ลบลายและด้ายของบัญชีนี้ออกจากเครื่องนี้ด้วย (สำหรับเครื่องที่ใช้ร่วมกัน)', "Also remove this account's patterns and threads from this device (for shared devices)")}</span>
      </label>
      {err && <p className="error small">{err}</p>}
    </Confirm>
  );
}

function DeleteDialog({ onClose }: { onClose: () => void }) {
  const word = t('ลบ', 'DELETE');
  const [typed, setTyped] = useState('');
  const [clear, setClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ok = typed.trim().toUpperCase() === word.toUpperCase();
  const go = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setErr('');
    try {
      await deleteMyAccount(clear);
      navigate('#/');
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  };
  return (
    <Confirm title={t('ลบบัญชี', 'Delete account')} icon="trash" onClose={onClose} busy={busy}
      actions={<>
        <button className="btn" onClick={onClose} disabled={busy}>{t('ยกเลิก', 'Cancel')}</button>
        <button className="btn danger-solid" onClick={go} disabled={!ok || busy}>
          <Icon name="trash" size={16} /> {busy ? t('กำลังลบ…', 'Deleting…') : t('ลบบัญชีถาวร', 'Delete permanently')}
        </button>
      </>}>
      <p>{t('บัญชีและข้อมูลที่เก็บไว้ในระบบ (ลาย ความคืบหน้าการปัก และรายการด้าย) จะถูกลบถาวร กู้คืนไม่ได้',
        'Your account and what’s stored with it (patterns, stitching progress and thread list) will be permanently deleted. This can’t be undone.')}</p>
      <p className="muted">{t('ถ้าเคยสั่งผลิต ข้อมูลออเดอร์จะเก็บไว้ไม่เกิน 2 ปีเพื่อดูแลหลังการขายและทำบัญชี แต่จะไม่ผูกกับบัญชีอีกต่อไป ตามนโยบายความเป็นส่วนตัว',
        'If you’ve ordered a piece, the order is kept for up to 2 years for after-sales care and accounting, no longer linked to you, as the privacy notice explains.')}</p>
      <p className="muted">{t('ลายที่อยู่ในเครื่องนี้จะยังอยู่ตามเดิม เว้นแต่จะติ๊กช่องด้านล่าง ถ้าอยากเก็บสำเนาไว้ ให้กด “ดาวน์โหลดข้อมูลของฉัน” ก่อน',
        'Copies on this device stay unless you tick the box below. To keep a copy, use “Download my data” first.')}</p>
      <label className="check">
        <input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} disabled={busy} />
        <span>{t('ลบลายและด้ายของบัญชีนี้ออกจากเครื่องนี้ด้วย', "Also remove this account's patterns and threads from this device")}</span>
      </label>
      <label className="acct-confirm-word">
        <span>{t(<>พิมพ์ <b>{word}</b> เพื่อยืนยัน</>, <>Type <b>{word}</b> to confirm</>)}</span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy} autoComplete="off" autoCapitalize="characters" spellCheck={false}
          onKeyDown={(e) => { if (e.key === 'Enter') go(); }} />
      </label>
      {err && <p className="error small">{err}</p>}
    </Confirm>
  );
}

/**
 * Google blocks sign-in inside LINE/Facebook/Instagram browsers, so instead of the Google button we explain
 * that and offer a way out to Safari or Chrome (LINE and Android can be opened directly; otherwise copy the link).
 */
function InAppNotice({ info, onTryHere }: { info: InAppInfo; onTryHere: () => void }) {
  const [copied, setCopied] = useState<'no' | 'yes' | 'failed'>('no');
  const browser = info.os === 'ios' ? 'Safari' : info.os === 'android' ? 'Chrome' : t('เบราว์เซอร์', 'your browser');
  const inApp = info.label ? t(`แอป ${info.label}`, info.label) : t('แอปนี้', 'this app');
  const link = location.origin + location.pathname + '#/account';
  useEffect(() => { trackStep(`/account/in-app/${info.app}`); }, [info.app]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied('yes');
    } catch {
      setCopied('failed'); // some in-app browsers block the clipboard: show the link to copy by hand
    }
  };
  // only shown where we can't open the browser ourselves (iPhone apps other than LINE)
  const menuTip = t(`หรือกดเมนู ⋯ ของ${inApp} แล้วเลือก “เปิดในเบราว์เซอร์” (Open in browser)`,
    `Or tap ${info.label ? `${info.label}’s` : 'the app’s'} ⋯ menu and choose “Open in browser”.`);

  return (
    <div className="acct-inapp" role="note">
      <p className="acct-inapp-title"><Icon name="info" size={18} /> {t(`เข้าสู่ระบบด้วย Google ใน${inApp} ไม่ได้`, `Google sign-in doesn’t work inside ${inApp}`)}</p>
      <p>{t(`Google ไม่อนุญาตให้เข้าสู่ระบบในเบราว์เซอร์ที่อยู่ในแอป เปิดหน้านี้ใน ${browser} แล้วเข้าสู่ระบบได้ตามปกติ`,
        `Google doesn’t allow signing in from browsers inside apps. Open this page in ${browser} and sign in there.`)}</p>
      <div className="btn-row">
        {canOpenExternally(info) ? (
          <a className="btn lg primary" href={externalUrl(info)}><Icon name="globe" size={18} /> {t(`เปิดใน ${browser}`, `Open in ${browser}`)}</a>
        ) : (
          <button className="btn lg primary" onClick={copy}>
            <Icon name={copied === 'yes' ? 'check' : 'copy'} size={18} /> {copied === 'yes' ? t('คัดลอกลิงก์แล้ว', 'Link copied') : t('คัดลอกลิงก์', 'Copy link')}
          </button>
        )}
      </div>
      {copied === 'yes' && <p className="hint">{t(`เปิด ${browser} แล้ววางลิงก์ในช่องที่อยู่`, `Open ${browser} and paste the link into the address bar.`)}</p>}
      {copied === 'failed' && (
        <input className="acct-inapp-link" readOnly value={link} aria-label={t('ลิงก์ของหน้านี้', 'Link to this page')}
          onFocus={(e) => e.currentTarget.select()} />
      )}
      {!canOpenExternally(info) && copied !== 'yes' && <p className="hint">{menuTip}</p>}
      <p className="hint">{t('ลายที่ทำไว้ในเบราว์เซอร์นี้จะไม่ตามไปเอง ใช้ “ส่งไปมือถือ / อีกเครื่อง” ในหน้าแก้ไขลายเพื่อย้ายไป',
        'Patterns you made in this browser won’t move by themselves. Use “Send to phone / another device” in the editor to bring them along.')}</p>
      <button type="button" className="link-btn acct-inapp-try" onClick={onTryHere}>{t('ลองเข้าสู่ระบบที่นี่ต่อ', 'Try signing in here anyway')}</button>
    </div>
  );
}

function SignedOut({ error }: { error: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      await signInWithGoogle(); // leaves the page on success
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  };
  const shown = err || error;
  const [inApp] = useState(() => detectInApp());
  const [tryHere, setTryHere] = useState(false);
  return (
    <section className="acct-card acct-signin">
      <h3><Icon name="cloud" size={20} /> {t('เก็บงานไว้ในบัญชี', 'Keep your work in an account')}</h3>
      <ul className="acct-benefits">
        <li><Icon name="sync" size={18} /><span>{t('ซิงก์ลายระหว่างมือถือและคอมพิวเตอร์ ปักต่อได้ทุกเครื่อง', 'Sync patterns between your phone and computer, and pick up stitching on any device')}</span></li>
        <li><Icon name="shield" size={18} /><span>{t('มีสำรองไว้ ถ้าเบราว์เซอร์ถูกล้างข้อมูลหรือเปลี่ยนเครื่อง งานก็ไม่หาย', 'A backup, so nothing is lost if the browser is cleared or you change devices')}</span></li>
        <li><Icon name="palette" size={18} /><span>{t('รายการ “ด้ายของฉัน” ตามไปทุกเครื่อง', 'Your “My threads” list goes with you everywhere')}</span></li>
      </ul>
      <p className="muted">{t('ไม่บังคับ ใช้งานได้ครบทุกอย่างโดยไม่ต้องเข้าสู่ระบบ ลายจะเก็บไว้ในเครื่องนี้เท่านั้น',
        'It’s optional. Everything works without signing in; your patterns are then kept on this device only.')}</p>
      {inApp && !tryHere ? (
        <InAppNotice info={inApp} onTryHere={() => setTryHere(true)} />
      ) : (
        <button className="btn lg google-btn" onClick={go} disabled={busy}>
          <GoogleG /> {busy ? t('กำลังไปที่ Google…', 'Opening Google…') : t('เข้าสู่ระบบด้วย Google', 'Continue with Google')}
        </button>
      )}
      {shown && <p className="error small" role="alert">{shown}</p>}
      <p className="hint">{t(<>เมื่อเข้าสู่ระบบ เราจะเก็บข้อมูลตามที่อธิบายไว้ใน<a className="acct-link" href="#/privacy">นโยบายความเป็นส่วนตัว</a></>,
        <>When you sign in, we store data as described in our <a className="acct-link" href="#/privacy">privacy notice</a>.</>)}</p>
    </section>
  );
}

/** "ด้ายของฉัน": how many threads you own, a peek at them, and the way to the full list (#/threads). */
function ThreadsCard() {
  const cloud = useCloud();
  const stash = useStash();
  const owned = [...stash.codes];
  const peek = owned.slice(0, 14).map((code) => DMC_LIBRARY.find((d) => d.code === code)).filter(Boolean);
  const signedIn = cloud.status === 'signed-in';
  return (
    <section className="acct-card acct-threads">
      <h3><Icon name="palette" size={18} /> {t('ด้ายของฉัน', 'My threads')}</h3>
      {owned.length > 0 ? (
        <>
          <p className="acct-threads-count"><b>{t(`มี ${owned.length} สี`, `${owned.length} owned`)}</b></p>
          <div className="acct-swatches" aria-hidden="true">
            {peek.map((d) => <i key={d!.code} style={{ background: d!.hex }} title={`DMC ${d!.code}`} />)}
            {owned.length > peek.length && <span>+{owned.length - peek.length}</span>}
          </div>
        </>
      ) : (
        <p className="muted">{t('บันทึกด้าย DMC ที่คุณมี เพื่อสร้างลายจากด้ายเดิมและรู้ว่าต้องซื้อสีไหนเพิ่ม',
          'Record the DMC threads you own, to make patterns from what you have and see which colors to buy.')}</p>
      )}
      <p className="hint">{signedIn
        ? t('ซิงก์ไปทุกเครื่องที่เข้าสู่ระบบบัญชีนี้', 'Synced to every device signed in to this account.')
        : t('เก็บไว้ในเครื่องนี้ · เข้าสู่ระบบเพื่อให้ตามไปทุกเครื่อง (ไม่บังคับ)', 'Kept on this device · sign in to have them on every device (optional).')}</p>
      <div className="btn-row">
        <a className={'btn' + (owned.length ? '' : ' primary')} href="#/threads">
          <Icon name={owned.length ? 'edit' : 'plus'} size={16} /> {owned.length ? t('จัดการด้าย', 'Manage threads') : t('เพิ่มด้ายของฉัน', 'Add my threads')}
        </a>
      </div>
    </section>
  );
}

/** "ออเดอร์ของฉัน": the orders this account has placed, newest first. Hidden until there is one. */
function OrdersCard() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  useEffect(() => {
    let live = true;
    myOrders().then((x) => { if (live) setOrders(x); }).catch(() => { if (live) setOrders([]); });
    return () => { live = false; };
  }, []);
  if (!orders || !orders.length) return null;
  const open = orders.filter((o) => !isClosed(o.status));
  const shown = [...open, ...orders.filter((o) => isClosed(o.status))].slice(0, 6);
  return (
    <section className="acct-card acct-orders">
      <h3><Icon name="cube" size={18} /> {t('ออเดอร์ของฉัน', 'My orders')}</h3>
      <ul className="acct-order-list">
        {shown.map((o) => (
          <li key={o.code}>
            <a href={`#/order/${o.code}`}>
              <span className="acct-order-main"><b>{o.title}</b><span className="muted small">{o.code} · {baht(o.total)}</span></span>
              <span className={'status-chip ' + (o.status === 'cancelled' ? 'removed' : o.status === 'done' ? 'published' : 'hidden')}>{ORDER_STATUS[o.status]()}</span>
            </a>
          </li>
        ))}
      </ul>
      {orders.length > shown.length && <p className="hint">{t(`และอีก ${orders.length - shown.length} ออเดอร์ที่ปิดแล้ว`, `and ${orders.length - shown.length} more closed orders`)}</p>}
    </section>
  );
}

/** Team accounts only: how many reports wait for review, and the way to the review page. */
function ModeratorCard() {
  const [count, setCount] = useState<number | null>(null);
  const [shopCount, setShopCount] = useState(0);
  const [mod, setMod] = useState(false);
  useEffect(() => {
    let live = true;
    amModerator().then(async (ok) => {
      if (!live || !ok) return;
      setMod(true);
      const n = await openPostCount().catch(() => null);
      if (live) setCount(n);
      if (ordersEnabled) listShopReports(true).then((x) => { if (live) setShopCount(x.length); }).catch(() => { /* no count */ });
    });
    return () => { live = false; };
  }, []);
  if (!mod) return null;
  return (
    <section className="acct-card acct-mod">
      <h3><Icon name="flag" size={18} /> {t('หน้าทีม', 'Team')}</h3>
      <p className="muted">
        {count === null ? t('กำลังนับการแจ้ง…', 'Counting reports…')
          : count === 0 ? t('ไม่มีการแจ้งปัญหาที่รอตรวจ', 'No reports waiting for review.')
            : t(`มีลายที่ถูกแจ้งรอตรวจ ${count} ลาย ควรตรวจภายใน 7 วัน`, `${count} reported pattern${count === 1 ? '' : 's'} waiting for review (within 7 days).`)}
      </p>
      <div className="btn-row">
        <a className={'btn' + (count ? ' primary' : '')} href="#/moderation"><Icon name="flag" size={16} /> {t('ตรวจการแจ้งปัญหา', 'Review reports')}{count ? ` (${count})` : ''}</a>
        {ordersEnabled && <a className={'btn' + (shopCount ? ' primary' : '')} href="#/moderation/shops"><Icon name="flag" size={16} /> {t('แจ้งปัญหาร้าน', 'Shop reports')}{shopCount ? ` (${shopCount})` : ''}</a>}
        <a className="btn" href="#/shop"><Icon name="cube" size={16} /> {t('ออเดอร์ร้านทีม', 'Team shop orders')}</a>
        <a className="btn" href="#/shop/settings">{t('ราคาและตั้งค่าร้านทีม', 'Team shop prices and settings')}</a>
      </div>
    </section>
  );
}

/** Your own shop, if you have one (the team shop is reached from the team card). */
function MyShopCard() {
  // undefined while loading (no card yet), null = no shop of your own
  const [shop, setShop] = useState<Shop | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const uid = getCloud().user?.id;
    shopsIWork().then((list) => { if (live) setShop(list.find((x) => x.ownerId === uid) ?? null); }).catch(() => { /* no card */ });
    return () => { live = false; };
  }, []);
  if (shop === undefined) return null;
  if (!shop) {
    return (
      <section className="acct-card">
        <h3><Icon name="cube" size={18} /> {t('เปิดร้านรับผลิต', 'Open a shop')}</h3>
        <p className="muted">{t('รับผลิตลายที่ลูกค้าออกแบบเองเป็นชิ้นงาน 3D หรือลายบนผ้า ตั้งราคาเอง ลูกค้าโอนเข้าพร้อมเพย์ของคุณโดยตรง ไม่มีค่าธรรมเนียม',
          'Make customers’ own designs as 3D pieces or on fabric, at your own prices. Customers pay your PromptPay directly; no fee.')}</p>
        <div className="btn-row"><a className="btn" href="#/shop">{t('เปิดร้าน', 'Open a shop')}</a></div>
      </section>
    );
  }
  return (
    <section className="acct-card">
      <h3><Icon name="cube" size={18} /> {t('ร้านของฉัน', 'My shop')}: {shop.name}</h3>
      <p className="muted">{shop.suspended ? t('ร้านถูกระงับโดยทีม', 'Suspended by the team')
        : shop.accepting ? t('เปิดรับออเดอร์อยู่', 'Taking orders') : t('ปิดรับออเดอร์ชั่วคราว', 'Closed for now')}</p>
      <div className="btn-row">
        <a className="btn primary" href="#/shop"><Icon name="cube" size={16} /> {t('ออเดอร์ของร้าน', 'Shop orders')}</a>
        <a className="btn" href="#/shop/settings">{t('ตั้งค่าร้าน', 'Shop settings')}</a>
      </div>
    </section>
  );
}

/** "ลายที่ฉันแชร์": your public name and the patterns you shared to the community. */
function MyShared() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameState, setNameState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    Promise.all([myPosts(), getMyCreator()])
      .then(([ps, creator]) => {
        if (!live) return;
        setPosts(ps);
        setSavedName(creator?.name ?? null);
        setName(creator?.name ?? '');
      })
      .catch((e) => { if (live) { setErr(errText(e)); setPosts([]); } });
    return () => { live = false; };
  }, []);

  const saveName = async () => {
    setNameState('saving');
    setErr('');
    try {
      await saveMyCreator(name);
      setSavedName(name.trim());
      setNameState('saved');
    } catch (e) {
      setErr(errText(e));
      setNameState('idle');
    }
  };
  const takeDown = async (post: Post) => {
    if (!(await askConfirm({
      title: t('ถอนลายออกจากชุมชน?', 'Take it down?'),
      message: <p>{t(<><b>“{post.title}”</b> จะไม่แสดงในชุมชนอีก ลายในเครื่องของคุณยังอยู่ แต่หัวใจทั้งหมดจะหายไป</>,
        <><b>“{post.title}”</b> leaves the community. Your own copy stays, but its likes are lost.</>)}</p>,
      ok: t('ถอนออก', 'Take down'),
      tone: 'danger',
      icon: 'people',
    }))) return;
    setBusy(post.id);
    setErr('');
    try {
      await unpublish(post.id);
      setPosts((ps) => ps && ps.filter((p) => p.id !== post.id));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="acct-card acct-shared">
      <h3><Icon name="people" size={18} /> {t('ลายที่ฉันแชร์', 'Patterns I’ve shared')}</h3>
      {savedName !== null && (
        <div className="acct-name-row">
          <label className="fb-field">
            <span>{t('ชื่อที่แสดงในชุมชน', 'Display name in the community')}</span>
            <input value={name} maxLength={40} onChange={(e) => { setName(e.target.value); setNameState('idle'); }} />
          </label>
          <button className="btn" onClick={saveName} disabled={!name.trim() || name.trim() === savedName || nameState === 'saving'}>
            {nameState === 'saving' ? t('กำลังบันทึก…', 'Saving…') : nameState === 'saved' ? t('บันทึกแล้ว', 'Saved') : t('บันทึกชื่อ', 'Save name')}
          </button>
        </div>
      )}
      {posts === null && <StitchLoader small label={t('กำลังโหลด…', 'Loading…')} />}
      {posts && !posts.length && (
        <p className="muted">{t(<>ยังไม่ได้แชร์ลาย เปิดลายในหน้าแก้ไข แล้วกด <b>ส่งออก / แชร์ → แชร์ในชุมชน</b> · <a className="acct-link" href="#/community">ดูลายจากชุมชน</a></>,
          <>You haven’t shared any patterns. Open one in the editor and choose <b>Export / share → Share with the community</b> · <a className="acct-link" href="#/community">Browse community patterns</a></>)}</p>
      )}
      {posts && posts.length > 0 && (
        <ul className="shared-list">
          {posts.map((p) => (
            <li key={p.id}>
              <div className="shared-text">
                <a className="shared-title" href={`#/c/${p.id}`}>{p.title}</a>
                <span className="shared-meta">
                  <Icon name="heart" size={14} /> {p.likeCount.toLocaleString()}
                  {' · '}{new Date(p.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: '2-digit' })}
                  {p.status === 'hidden' && <span className="shared-hidden">{t('ซ่อนไว้ รอตรวจสอบ', 'Hidden for review')}</span>}
                  {p.status === 'removed' && <span className="shared-hidden">{t('ทีมงานนำออกแล้ว', 'Removed by the team')}</span>}
                </span>
              </div>
              <button className="btn sm ghost" onClick={() => takeDown(p)} disabled={busy === p.id}>
                {busy === p.id ? t('กำลังถอน…', 'Removing…') : t('ถอนออก', 'Take down')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {err && <p className="error small">{err}</p>}
      <p className="hint">{t('อัปเดตลายที่แชร์ได้จากหน้าแก้ไขลาย ด้วยเมนูเดิม', 'To update a shared pattern, use the same menu in the editor.')}</p>
    </section>
  );
}

function SyncLine({ sync, lastSync, error }: { sync: string; lastSync: number | null; error: string }) {
  if (sync === 'syncing') return <span><i className="sync-dot syncing" /> {t('กำลังซิงก์…', 'Syncing…')}</span>;
  if (sync === 'error') return <span className="error"><i className="sync-dot error" /> {t('ซิงก์ไม่สำเร็จ', 'Sync failed')}{error ? `: ${error}` : ''}</span>;
  if (sync === 'offline') return <span><i className="sync-dot offline" /> {t('ออฟไลน์อยู่ จะซิงก์ให้เมื่อกลับมาออนไลน์', 'You’re offline. We’ll sync when you’re back online.')}</span>;
  if (!lastSync) return <span><i className="sync-dot idle" /> {t('ยังไม่ได้ซิงก์', 'Not synced yet')}</span>;
  const when = new Date(lastSync).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  return <span><i className="sync-dot idle" /> {t(`ซิงก์ล่าสุด ${when}`, `Last synced ${when}`)}</span>;
}

function SignedIn() {
  const cloud = useCloud();
  const user = cloud.user!;
  const [counts, setCounts] = useState<{ patterns: number; threads: number } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState('');
  const [dialog, setDialog] = useState<'signout' | 'delete' | null>(null);

  useEffect(() => {
    let live = true;
    accountCounts().then((c) => { if (live) setCounts(c); }).catch(() => { /* counts are informational */ });
    return () => { live = false; };
  }, [cloud.lastSync, user.id]);

  const sync = async () => {
    setSyncing(true);
    setErr('');
    try { await syncNow(); } catch (e) { setErr(errText(e)); } finally { setSyncing(false); }
  };
  const download = async () => {
    setExporting(true);
    setErr('');
    try {
      downloadBlob(await exportMyData(), `${APP_SLUG}-data-${today()}.json`);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setExporting(false);
    }
  };
  const busySync = syncing || cloud.sync === 'syncing';

  return (
    <>
      <section className="acct-card acct-profile">
        <Avatar user={user} size={56} />
        <div className="acct-who">
          <b>{user.name}</b>
          <span className="muted">{user.email}</span>
        </div>
        <button className="btn" onClick={() => setDialog('signout')}><Icon name="logout" size={16} /> {t('ออกจากระบบ', 'Sign out')}</button>
      </section>

      <ThreadsCard />
      {ordersEnabled && <OrdersCard />}

      <section className="acct-card">
        <h3><Icon name="sync" size={18} /> {t('การซิงก์', 'Sync')}</h3>
        <p className="acct-sync-line" aria-live="polite"><SyncLine sync={cloud.sync} lastSync={cloud.lastSync} error={cloud.error} /></p>
        <p className="acct-counts">
          {counts
            ? t(`ในบัญชี: ลาย ${counts.patterns} ลาย · ด้าย ${counts.threads} สี`,
              `In your account: ${counts.patterns} ${counts.patterns === 1 ? 'pattern' : 'patterns'} · ${counts.threads} ${counts.threads === 1 ? 'thread' : 'threads'}`)
            : t('ในบัญชี: …', 'In your account: …')}
        </p>
        <div className="btn-row">
          <button className={'btn' + (cloud.sync === 'error' ? ' primary' : '')} onClick={sync} disabled={busySync}>
            <span className={'acct-ico' + (busySync ? ' spin' : '')}><Icon name="sync" size={16} /></span>
            {busySync ? t('กำลังซิงก์…', 'Syncing…') : cloud.sync === 'error' ? t('ลองอีกครั้ง', 'Try again') : t('ซิงก์ตอนนี้', 'Sync now')}
          </button>
        </div>
        <p className="hint">{t('ลายและรายการด้ายจะซิงก์ให้อัตโนมัติเมื่อมีการเปลี่ยนแปลง', 'Patterns and your thread list sync automatically when they change.')}</p>
      </section>

      {communityEnabled && <ModeratorCard />}
      {ordersEnabled && <MyShopCard />}
      {communityEnabled && <MyShared />}

      <section className="acct-card">
        <h3><Icon name="file" size={18} /> {t('ข้อมูลของคุณ', 'Your data')}</h3>
        <p className="muted">{t('ดาวน์โหลดข้อมูลทั้งหมดในบัญชี (โปรไฟล์ ลาย รายการด้าย ลายที่แชร์ และออเดอร์) เป็นไฟล์ JSON', 'Download everything in your account (profile, patterns, thread list, shared patterns and orders) as a JSON file.')}</p>
        <div className="btn-row">
          <button className="btn" onClick={download} disabled={exporting}>
            <Icon name="download" size={16} /> {exporting ? t('กำลังเตรียมไฟล์…', 'Preparing…') : t('ดาวน์โหลดข้อมูลของฉัน', 'Download my data')}
          </button>
        </div>
      </section>

      {err && <p className="error small acct-error" role="alert">{err}</p>}

      <section className="acct-card acct-danger">
        <h3>{t('พื้นที่อันตราย', 'Danger zone')}</h3>
        <p className="muted">{t('ลบบัญชีและข้อมูลทั้งหมดในระบบอย่างถาวร', 'Permanently delete your account and all of its cloud data.')}</p>
        <div className="btn-row">
          <button className="btn danger" onClick={() => setDialog('delete')}><Icon name="trash" size={16} /> {t('ลบบัญชี', 'Delete account')}</button>
        </div>
      </section>

      {dialog === 'signout' && <SignOutDialog onClose={() => setDialog(null)} />}
      {dialog === 'delete' && <DeleteDialog onClose={() => setDialog(null)} />}
    </>
  );
}

export function Account() {
  const cloud = useCloud();
  return (
    <div className="account-page">
      <header className="site-head">
        <a className="icon-btn" href="#/" title={t('กลับหน้าแรก', 'Back to home')} aria-label={t('กลับหน้าแรก', 'Back to home')}><Icon name="back" /></a>
        <h2><Icon name="user" size={18} /> {t('ของฉัน', 'My stuff')}</h2>
        <div className="spacer" />
        <LangSwitch />
      </header>
      <main className="account-main">
        <div className="acct-col">
          {/* My threads works without an account, so it comes first for everyone who isn't signed in */}
          {cloud.status !== 'signed-in' && <ThreadsCard />}
          {cloud.status === 'off' && (
            <section className="acct-card">
              <h3><Icon name="info" size={18} /> {t('ยังไม่เปิดใช้บัญชี', 'Accounts aren’t available yet')}</h3>
              <p className="muted">{t('ตอนนี้ยังเข้าสู่ระบบไม่ได้ ใช้งานได้ตามปกติ ลายและด้ายทั้งหมดเก็บไว้ในเครื่องนี้', 'Signing in isn’t available yet. Everything works as usual, and your patterns and threads are kept on this device.')}</p>
            </section>
          )}
          {cloud.status === 'loading' && <p className="muted acct-loading">{t('กำลังตรวจสอบการเข้าสู่ระบบ…', 'Checking your sign-in…')}</p>}
          {cloud.status === 'signed-out' && <SignedOut error={cloud.error} />}
          {cloud.status === 'signed-in' && cloud.user && <SignedIn />}
          {cloud.status !== 'off' && (
            <p className="hint acct-foot"><a className="acct-link" href="#/privacy">{t('นโยบายความเป็นส่วนตัว', 'Privacy notice')}</a> · <FeedbackLink /></p>
          )}
        </div>
      </main>
    </div>
  );
}
