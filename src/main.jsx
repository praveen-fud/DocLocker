import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import App from './App.jsx'

// Vercel Web Analytics counts page views only. Query strings and #fragments
// are dropped first, so nothing a page was opened with is sent along.
const pageOnly = (event) => {
  const url = new URL(event.url)
  url.search = ''
  url.hash = ''
  return { ...event, url: url.toString() }
}

// Fire-and-forget health ping to wake Railway before the user does anything.
// Uses relative path (/health) so it goes through the Vercel proxy — no Railway
// domain needed on mobile. Falls back to direct Railway URL in local dev.
const _apiUrl = import.meta.env.VITE_API_URL ?? '';
fetch(`${_apiUrl}/health`, { signal: AbortSignal.timeout(10000) }).catch(() => {});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Analytics beforeSend={pageOnly} />
    <SpeedInsights />
  </StrictMode>,
)
