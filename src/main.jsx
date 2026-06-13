import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// Fire-and-forget health ping to wake Railway before the user does anything.
// Railway instances sleep between requests; this warm-up means the first real
// API call (advisor fetch, student lookup) hits a warm server instead of waiting
// 20-60 s for a cold boot — which causes mobile browsers to show "could not connect".
const _apiUrl = import.meta.env.VITE_API_URL;
if (_apiUrl) {
  fetch(`${_apiUrl}/health`, { signal: AbortSignal.timeout(10000) }).catch(() => {});
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
