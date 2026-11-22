import { lazy, Suspense, useEffect, useState } from 'react';
import { StitchArt } from './components/StitchArt';
import { StitchLoader } from './components/StitchLoader';
import { Home } from './pages/Home';
import { ConfirmHost } from './components/ConfirmDialog';
import { openPattern } from './lib/drafts';
import { MergeDialog } from './components/MergeDialog';
import { FeedbackDialog } from './components/FeedbackDialog';
import { loadPattern } from './lib/storage';
import { NEW_ORIGIN, stuckOnOldDomain } from './lib/domainMove';
import { t } from './lib/i18n';
import { SITE_HOST } from './lib/brand';

// Only the home page is in the first download; every other page loads when it's opened (and the service
// worker still caches them all for offline use). The ones people go to next are fetched once the home page
// is idle, so opening them stays instant.
const NewPattern = lazy(() => import('./pages/NewPattern').then((m) => ({ default: m.NewPattern })));
const Editor = lazy(() => import('./pages/Editor').then((m) => ({ default: m.Editor })));
const PrintView = lazy(() => import('./pages/PrintView').then((m) => ({ default: m.PrintView })));
const SharedView = lazy(() => import('./pages/SharedView').then((m) => ({ default: m.SharedView })));
const StitchMode = lazy(() => import('./pages/StitchMode').then((m) => ({ default: m.StitchMode })));
const TransferView = lazy(() => import('./pages/TransferView').then((m) => ({ default: m.TransferView })));
const Guide = lazy(() => import('./pages/Guide').then((m) => ({ default: m.Guide })));
const QuickCreate = lazy(() => import('./pages/QuickCreate').then((m) => ({ default: m.QuickCreate })));
const MyThreads = lazy(() => import('./pages/MyThreads').then((m) => ({ default: m.MyThreads })));
const Account = lazy(() => import('./pages/Account').then((m) => ({ default: m.Account })));
const Privacy = lazy(() => import('./pages/Privacy').then((m) => ({ default: m.Privacy })));
const Community = lazy(() => import('./pages/Community').then((m) => ({ default: m.Community })));
const CommunityPost = lazy(() => import('./pages/CommunityPost').then((m) => ({ default: m.CommunityPost })));
const Terms = lazy(() => import('./pages/Terms').then((m) => ({ default: m.Terms })));
const Moderation = lazy(() => import('./pages/Moderation').then((m) => ({ default: m.Moderation })));
const OrderPage = lazy(() => import('./pages/OrderPage').then((m) => ({ default: m.OrderPage })));
const OrderTerms = lazy(() => import('./pages/OrderTerms').then((m) => ({ default: m.OrderTerms })));
const ShopPage = lazy(() => import('./pages/ShopPage').then((m) => ({ default: m.ShopPage })));

const LIKELY_NEXT = [() => import('./pages/Editor'), () => import('./pages/StitchMode'), () => import('./pages/QuickCreate')];
function prefetchLikelyPages() {
  const go = () => LIKELY_NEXT.forEach((load) => load().catch(() => { /* fetched on demand instead */ }));
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(go); else setTimeout(go, 1500);
}

/** Shown only if a page takes more than a moment to arrive, so fast loads don't flash anything. */
function PageLoading() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const tm = setTimeout(() => setShow(true), 250);
    return () => clearTimeout(tm);
  }, []);
  return <div className="empty-state" aria-busy="true">{show && <StitchLoader label={t('กำลังโหลด…', 'Loading…')} />}</div>;
}

export function navigate(hash: string) {
  location.hash = hash;
}

function useHash() {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const on = () => {
      setHash(location.hash || '#/');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function App() {
  useEffect(() => {
    if (document.readyState === 'complete') prefetchLikelyPages();
    else window.addEventListener('load', prefetchLikelyPages, { once: true });
  }, []);
  // the account merge question can come up on any page right after signing in
  return (
    <>
      {stuckOnOldDomain && <MovedNotice />}
      <Suspense fallback={<PageLoading />}><Routes /></Suspense>
      <MergeDialog /><FeedbackDialog /><ConfirmHost />
    </>
  );
}

/** Only on the old address when this browser has too much data to carry over in a link. */
function MovedNotice() {
  return (
    <div className="moved-notice" role="status">
      {t(<>เราย้ายไปที่ <a href={NEW_ORIGIN}>{SITE_HOST}</a> แล้ว ลายในเครื่องนี้มีมากเกินกว่าจะย้ายให้อัตโนมัติ <a href="#/account">เข้าสู่ระบบ</a> เพื่อเก็บลายไว้ในบัญชี แล้วเข้าสู่ระบบอีกครั้งที่เว็บใหม่</>,
        <>We’ve moved to <a href={NEW_ORIGIN}>{SITE_HOST}</a>. This browser has too many patterns to carry over automatically: <a href="#/account">sign in</a> to keep them in your account, then sign in again on the new site.</>)}
    </div>
  );
}

function Routes() {
  const hash = useHash();
  const parts = hash.replace(/^#\/?/, '').split('/');
  const [route, arg] = parts;

  if (route === 'guide') return <Guide section={arg} />;
  if (route === 'quick') return <QuickCreate />;
  if (route === 'threads') return <MyThreads />;
  if (route === 'account') return <Account />;
  if (route === 'privacy') return <Privacy />;
  if (route === 'terms') return <Terms />;
  if (route === 'order-terms') return <OrderTerms />;
  if (route === 'community') return <Community key={arg ?? ''} tag={arg} />;
  if (route === 'moderation') return <Moderation key={arg ?? ''} startTab={arg === 'orders' ? 'orders' : undefined} />;
  if (route === 'order' && arg) return <OrderPage key={arg} code={arg} />;
  if (route === 'shop') return <ShopPage key={arg ?? ''} view={arg === 'settings' ? 'settings' : 'orders'} />;
  if (route === 'c' && arg) return <CommunityPost key={arg} id={arg} />;
  if (route === 'new') return <NewPattern key={arg} mode={arg === 'template' ? 'template' : 'free'} />;
  if (route === 'edit' && arg) return <Editor key={arg} id={arg} />;
  if (route === 'stitch' && arg) return <StitchMode key={arg} id={arg} />;
  if (route === 'print' && arg) {
    const p = openPattern(arg); // a saved pattern, or one only being tried in this tab
    if (!p) return <div className="empty-state"><StitchArt kind="lost" /><h2>{t('ไม่พบลายนี้', 'Pattern not found')}</h2><p className="muted">{t('ลายอาจถูกลบไปแล้ว บันทึกไว้ในเบราว์เซอร์อื่น หรือเป็นลายที่ลองไว้ในแท็บที่ปิดไปแล้ว', 'It may have been deleted, saved in a different browser, or only tried in a tab that’s now closed.')}</p><a className="btn primary" href="#/">{t('กลับหน้าแรก', 'Back to home')}</a></div>;
    return <PrintView key={arg} pattern={p} backHref={`#/edit/${arg}`} />;
  }
  if (route === 's' && arg) return <SharedView key={arg} data={parts.slice(1).join('/')} />;
  if (route === 't' && arg) return <TransferView key={arg} data={parts.slice(1).join('/')} />;
  return <Home />;
}
