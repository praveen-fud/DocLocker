// Which company a student is applying through. Set by the company signup
// link (/c/<slug>), cleared on the main site; sent with every student API
// call so the record is created in, and looked up from, that company.
const KEY = 'doclocker_company';

export function getStudentCompany() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); }
  catch { return null; }
}

export function setStudentCompany(company) {
  try {
    if (company?.slug) localStorage.setItem(KEY, JSON.stringify({ slug: company.slug, name: company.name, branding: company.branding || {}, logoUrl: company.logoUrl || null }));
    else localStorage.removeItem(KEY);
  } catch { /* storage blocked: falls back to Flyurdream */ }
  // context/BrandContext.jsx re-brands the page from this
  window.dispatchEvent(new Event('doclocker:company'));
}

export function companyHeaders() {
  const slug = getStudentCompany()?.slug;
  return slug ? { 'X-DocLocker-Company': slug } : {};
}

const API_URL = import.meta.env.VITE_API_URL ?? '';

// Company logos are served by the API (a versioned, public path).
export function companyLogoSrc(logoUrl) {
  return logoUrl ? `${API_URL}${logoUrl}` : '';
}
