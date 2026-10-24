/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useStudent } from "./StudentContext";
import { getStudentCompany, companyLogoSrc } from "../utils/company";
import { BRAND } from "../config/brand";

// Which brand the current page wears.
//   /c/<slug> landing, the student portal → the company the student came through
//   partner staff / lender pages           → that partner company
//   main site, sign-in, Flyurdream staff   → DocLocker
// A company page never shows DocLocker: while its details load the logo
// slot stays empty ("pending") instead of flashing the DocLocker mark.

const DOCLOCKER = { kind: "doclocker", name: BRAND.name, tagline: BRAND.tagline };
const PENDING = { kind: "pending", name: "" };
const STAFF_ROUTE = /^\/(admin|banker-portal)(\/|$)/;
const COMPANY_ROUTE = /^\/c\/([^/]+)/;

const BrandContext = createContext(DOCLOCKER);

function companyBrand(company) {
  if (!company) return null;
  return {
    kind: "company",
    slug: company.slug,
    name: company.branding?.displayName || company.name,
    tagline: company.branding?.tagline || "",
    accent: company.branding?.accent || "",
    logoSrc: companyLogoSrc(company.logoUrl),
  };
}

const initialsOf = (name) => {
  const w = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || "?") + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
};

// Tab icon for a company without a logo: its initials on its colour.
function initialsIcon(name, accent) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${accent || "#2563eb"}"/><text x="32" y="41" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" font-weight="700" fill="#fff">${initialsOf(name).replace(/[<&>]/g, "")}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
const BLANK_ICON = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

function useDocumentBrand(brand) {
  useEffect(() => {
    document.title = brand.kind === "company" ? brand.name : brand.kind === "pending" ? "Loading…" : BRAND.name;
    const icon = brand.kind === "company"
      ? brand.logoSrc || initialsIcon(brand.name, brand.accent)
      : brand.kind === "pending" ? BLANK_ICON : null;
    document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach((link) => {
      if (link.dataset.defaultHref === undefined) {
        link.dataset.defaultHref = link.getAttribute("href") || "";
        link.dataset.defaultType = link.getAttribute("type") || "";
      }
      if (icon) {
        link.setAttribute("href", icon);
        link.removeAttribute("type"); // the logo may be JPEG / WebP / SVG
      } else {
        link.setAttribute("href", link.dataset.defaultHref);
        if (link.dataset.defaultType) link.setAttribute("type", link.dataset.defaultType);
      }
    });
  }, [brand]);
}

export function BrandProvider({ children }) {
  const { pathname } = useLocation();
  const { isAdmin, adminAccount } = useStudent();
  const [studentCompany, setStudentCompanyState] = useState(getStudentCompany);

  // utils/company.js announces changes (and other tabs change localStorage)
  useEffect(() => {
    const sync = () => setStudentCompanyState(getStudentCompany());
    window.addEventListener("doclocker:company", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("doclocker:company", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const brand = useMemo(() => {
    if (STAFF_ROUTE.test(pathname)) {
      const co = isAdmin && adminAccount?.company?.kind === "partner" ? adminAccount.company : null;
      return companyBrand(co) || DOCLOCKER;
    }
    const m = COMPANY_ROUTE.exec(pathname);
    if (m) {
      const slug = decodeURIComponent(m[1]).toLowerCase();
      return studentCompany?.slug === slug ? companyBrand(studentCompany) : PENDING;
    }
    if (pathname.startsWith("/portal")) return companyBrand(studentCompany) || DOCLOCKER;
    return DOCLOCKER;
  }, [pathname, isAdmin, adminAccount, studentCompany]);

  useDocumentBrand(brand);
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export const useBrand = () => useContext(BrandContext);
