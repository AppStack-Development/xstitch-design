import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerServiceWorker } from './lib/pwa';
import { initCloud } from './lib/cloud';
import { initSync } from './lib/sync';
import { initAnalytics } from './lib/analytics';
import { cleanExternalParam } from './lib/inAppBrowser';
import { arriveFromOldDomain, leaveOldDomain } from './lib/domainMove';
import './styles.css';
import './styles/editor-mobile.css';
import './styles/defaults.css';
import './styles/samples.css';
import './styles/threads.css';
import './styles/quick.css';
import './styles/account.css';
import './styles/feedback.css';
import './styles/community.css';
import './styles/season.css';
import './styles/delight.css';
import './styles/resize.css';
import './styles/consistency.css';

// the app moves to xstitch-design.vercel.app: bring data from the old address, or leave it
arriveFromOldDomain();
if (!leaveOldDomain()) start();

function start() {
  // arrived from LINE's "open in browser" link: tidy the address before anything reads it
  cleanExternalParam();
  createRoot(document.getElementById('root')!).render(<App />);
  registerServiceWorker();
  // optional accounts: no-ops unless Supabase is configured at build time
  initSync();
  initCloud();
  // anonymous page-view stats on the live site only
  initAnalytics();
}
