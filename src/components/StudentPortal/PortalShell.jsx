import { useEffect, useId, useRef, useState } from "react";
import {
  House,
  FileText,
  UserRound,
  BadgeIndianRupee,
  CircleHelp,
  LogOut,
  ChevronDown,
  Check,
  LoaderCircle,
  CircleAlert,
  CircleDot,
} from "lucide-react";
import BrandLogo from "../BrandLogo/BrandLogo";
import { getApplicationId } from "../../utils/applicationId";
import { initials } from "./studentRecord";
import "./PortalShell.css";

// "Saved just now" / "Saving changes…" — reflects real save results only.
export function SaveIndicator({ status, savedAt, onRetry }) {
  // Clock for the "x min ago" label — only advanced by the timer, so render stays pure.
  const [now, setNow] = useState(savedAt || 0);
  useEffect(() => {
    if (status !== "saved") return undefined;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [status, savedAt]);

  if (status === "saving") {
    return (
      <span className="ps-save is-saving" role="status">
        <LoaderCircle size={14} className="ps-spin" aria-hidden="true" /> Saving changes…
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="ps-save is-error" role="status">
        <CircleAlert size={14} aria-hidden="true" /> Couldn&apos;t save
        {onRetry && (
          <button type="button" className="ps-save__retry" onClick={onRetry}>Retry</button>
        )}
      </span>
    );
  }
  if (status === "dirty") {
    return (
      <span className="ps-save is-dirty" role="status">
        <CircleDot size={14} aria-hidden="true" /> Unsaved changes
      </span>
    );
  }
  if (status === "saved" && savedAt) {
    const mins = Math.max(0, Math.floor((now - savedAt) / 60000));
    const when = mins < 1 ? "just now" : mins === 1 ? "1 min ago" : mins < 60 ? `${mins} min ago` : "earlier";
    return (
      <span className="ps-save is-saved" role="status">
        <Check size={14} aria-hidden="true" /> Saved {when}
      </span>
    );
  }
  return null;
}

const TABS = [
  { id: "home",      label: "My Application", short: "Home",        icon: House },
  { id: "documents", label: "Documents",      short: "Documents",   icon: FileText },
  { id: "profile",   label: "Profile",        short: "Profile",     icon: UserRound },
  { id: "loan",      label: "Loan Status",    short: "Loan Status", icon: BadgeIndianRupee },
  { id: "help",      label: "Help",           short: "Help",        icon: CircleHelp },
];
// Phones: Help moves into the account menu.
const BOTTOM_TABS = ["home", "documents", "loan", "profile"].map((id) => TABS.find((t) => t.id === id));

function UserMenu({ student, onHelp, onSignOut }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const menuId = useId();

  // Escape / outside click close; Escape hands focus back to the button.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); }
    };
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const pick = (fn) => () => { setOpen(false); fn(); };

  return (
    <div className="ps-user" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="ps-user__btn"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account menu for ${student.name}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ps-avatar" aria-hidden="true">{initials(student.name)}</span>
        <span className="ps-user__text" aria-hidden="true">
          <span className="ps-user__name">{student.name}</span>
          <span className="ps-user__role">Student</span>
        </span>
        <ChevronDown size={16} className="ps-user__chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="ps-menu" id={menuId}>
          <div className="ps-menu__head">
            <span className="ps-menu__name">{student.name}</span>
            {(student.email || student.phone) && <span className="ps-menu__mail">{student.email || student.phone}</span>}
            <span className="ps-menu__id">Application ID <strong>{getApplicationId(student)}</strong></span>
          </div>
          <button type="button" className="ps-menu__item" onClick={pick(onHelp)}>
            <CircleHelp size={17} aria-hidden="true" /> Help &amp; support
          </button>
          <button type="button" className="ps-menu__item is-danger" onClick={pick(onSignOut)}>
            <LogOut size={17} aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// Student portal chrome: top navigation (bottom tab bar on phones).
export default function PortalShell({
  view,
  onViewChange,
  reviewCount,
  student,
  saveStatus,
  savedAt,
  onRetrySave,
  onSignOut,
  children,
}) {
  const badgeFor = (id) => (id === "profile" && reviewCount > 0 ? reviewCount : null);
  const badgeLabel = `${reviewCount} detail${reviewCount === 1 ? "" : "s"} to check`;

  return (
    <div className="ps-app">
      <a href="#ps-main" className="ps-skip">Skip to content</a>

      <header className="ps-top">
        <div className="ps-top__inner">
          <button type="button" className="ps-top__brand" onClick={() => onViewChange("home")} aria-label="DocLocker — My Application">
            <BrandLogo size="md" />
          </button>

          <nav className="ps-tabs" aria-label="Portal">
            {TABS.map((t) => {
              const active = view === t.id;
              const badge = badgeFor(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`ps-tab${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onViewChange(t.id)}
                >
                  {t.label}
                  {badge && <span className="ps-tab__badge" aria-hidden="true">{badge}</span>}
                  {badge && <span className="sr-only">, {badgeLabel}</span>}
                </button>
              );
            })}
          </nav>

          <div className="ps-top__right">
            <SaveIndicator status={saveStatus} savedAt={savedAt} onRetry={onRetrySave} />
            <UserMenu student={student} onHelp={() => onViewChange("help")} onSignOut={onSignOut} />
          </div>
        </div>
      </header>

      <main id="ps-main" className="ps-content" tabIndex={-1}>
        {children}
      </main>

      <nav className="ps-bottom" aria-label="Portal">
        {BOTTOM_TABS.map((t) => {
          const Icon = t.icon;
          const active = view === t.id;
          const badge = badgeFor(t.id);
          return (
            <button
              key={t.id}
              type="button"
              className={`ps-bottom__item${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => onViewChange(t.id)}
            >
              <span className="ps-bottom__icon">
                <Icon size={22} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                {badge && <span className="ps-bottom__badge" aria-hidden="true">{badge}</span>}
              </span>
              <span className="ps-bottom__label">{t.short}</span>
              {badge && <span className="sr-only">, {badgeLabel}</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
