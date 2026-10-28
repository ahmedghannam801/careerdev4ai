import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { startNativeBridge } from './lib/nativeBridge';

// On the web this does nothing. On Android it wires the back button, the
// external links and the OAuth deep link into the native shell.
startNativeBridge();

createRoot(document.getElementById('root')!).render(<App />);
