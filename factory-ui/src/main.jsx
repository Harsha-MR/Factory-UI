import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// Dev-only: if a service worker was previously registered (e.g. from a past PWA experiment),
// it can keep serving cached HTML that references missing PWA dev entrypoints.
// Unregister to avoid persistent 404s like /@vite-plugin-pwa/pwa-entry-point-loaded.
if (import.meta?.env?.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const r of regs) r.unregister()
  }).catch(() => {})
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
