import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CSPProvider } from '@base-ui/react/csp-provider';
import { App } from './app';
import './styles.css';

const nonce = document.querySelector<HTMLMetaElement>('meta[name="hoso-style-nonce"]')?.content;
createRoot(document.getElementById('root')!).render(<StrictMode><CSPProvider nonce={nonce}><App /></CSPProvider></StrictMode>);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
