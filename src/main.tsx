import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import App from './App.tsx';
import './index.css';

// Mandatory Tier-1 Google Maps Platform Demo Key Quota Defense + error diagnostics
(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  window.dispatchEvent(
    new CustomEvent('gmp-maps-error', { detail: 'auth_failure' }),
  );
};

const origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  origConsoleError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (
    msg.includes('OverQuotaMapError') ||
    msg.includes('QuotaExceededError') ||
    msg.includes('exceeded your request quota')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    window.dispatchEvent(new CustomEvent('gmp-maps-error', { detail: 'quota' }));
  } else if (msg.includes('RefererNotAllowedMapError')) {
    window.dispatchEvent(new CustomEvent('gmp-maps-error', { detail: 'referer' }));
  } else if (
    msg.includes('BillingNotEnabledMapError') ||
    msg.includes('ApiNotActivatedMapError')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-maps-error', { detail: 'billing' }));
  } else if (msg.includes('InvalidKeyMapError')) {
    window.dispatchEvent(
      new CustomEvent('gmp-maps-error', { detail: 'invalid_key' }),
    );
  }
};

createRoot(document.getElementById('root')!).render(<App />);
