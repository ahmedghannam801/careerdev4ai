import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { startNativeBridge } from './lib/nativeBridge';
import { initializeAnalytics } from './lib/analytics';

// On the web this does nothing. On Android it wires the back button, the
// external links and the OAuth deep link into the native shell.
startNativeBridge();

// Google Analytics 4 starts as soon as the application loads. The tag itself
// is requested by the module, and the page views are reported when the route
// is known — see `src/lib/analytics.ts`.
initializeAnalytics();

createRoot(document.getElementById('root')!).render(<App />);
