import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// Fire-and-forget health ping to wake Railway before the user does anything.
// Uses relative path (/health) so it goes through the Vercel proxy — no Railway
// domain needed on mobile. Falls back to direct Railway URL in local dev.
const _apiUrl = import.meta.env.VITE_API_URL ?? '';
fetch(`${_apiUrl}/health`, { signal: AbortSignal.timeout(10000) }).catch(() => {});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
