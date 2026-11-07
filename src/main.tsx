import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer; // @solana/web3.js and friends expect it
import { createRoot } from 'react-dom/client';
import './index.css';

// The chain modules parse their keys on load, so App is imported only once every key is there: no blank page.
const root = createRoot(document.getElementById('root')!);
const missing = ['VITE_XRPL_SEED', 'VITE_XRPL_SPARE', 'VITE_EVM_KEY', 'VITE_SOLANA_SECRET', 'VITE_STELLAR_SECRET'].filter((k) => !import.meta.env[k]);
if (missing.length) root.render(<p className="p-6 font-mono text-sm">Missing {missing.join(', ')}. Run <code>npm run wallets</code> first, then restart <code>npm run dev</code>.</p>);
else import('./App').then(({ default: App }) => root.render(<App />));
