import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { setStudentCompany, companyLogoSrc } from "../../utils/company";
import { useBrand } from "../../context/BrandContext";
import { emailProblem, indianMobileProblem, normalizeIndianMobile, normalizeEmail } from "../../utils/validation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  GraduationCap,
  Search,
  ArrowRight,
  ShieldCheck,
  Activity,
  User,
  Mail,
  AlertCircle,
  Loader2,
  Menu,
  X,
  CirclePlay,
  Plane,
  Landmark,
  ScanText,
  UserPlus,
  Upload,
  FileCheck2,
  ListChecks,
  Sparkles,
  FolderLock,
  MonitorCheck,
  Link2,
  History,
  Users,
  LogIn,
  ChevronDown,
  Briefcase,
  KeyRound,
} from "lucide-react";

import BrandLogo from "../../components/BrandLogo/BrandLogo";
import { useStudent } from "../../context/StudentContext";
import {
  registerApplicant,
  lookupApplicant,
  signInApplicant,
  createApplicantPin,
  pinProblem,
} from "../../utils/applicantApi";
import PinInput from "../../components/PinInput/PinInput";
import { deriveApplicationId } from "../../utils/applicationId";
import { BANK_OPTIONS } from "../../utils/bankOptions";
import HeroScene, { HeroSkyline } from "./HeroScene";
import "./Home.css";

const API_URL = import.meta.env.VITE_API_URL ?? "";

/* ──────────────────────────────────────────────────────────────────────────
   Static content lives up here so copy edits never require touching markup.
   ────────────────────────────────────────────────────────────────────────── */

const NAV = [
  { id: "how-it-works", label: "How it works" },
  { id: "for-students", label: "For Students" },
  { id: "for-banks", label: "For Banks" },
  { id: "about", label: "About" },
];

const LENDERS = BANK_OPTIONS.filter((b) => b.value !== "Others");

const STATS = [
  { icon: Landmark, value: String(LENDERS.length), label: "Lending partners" },
  { icon: ScanText, value: "AI", label: "Document reading" },
  { icon: ShieldCheck, value: "Encrypted", label: "Document storage" },
  { icon: Activity, value: "Live", label: "Loan tracking" },
];

// The loan file's real sequence — numbered because the order matters.
const JOURNEY = [
  { icon: UserPlus, title: "Create your file", detail: "Your name, email and mobile number." },
  { icon: Upload, title: "Upload documents", detail: "A guided checklist, sorted into your vault." },
  { icon: Landmark, title: "Lender review", detail: "Track every status change as it happens." },
  { icon: FileCheck2, title: "Sanction letter", detail: "Download, share, and close the loan." },
];

const STUDENT_FEATURES = [
  { icon: ListChecks, tone: "blue", title: "Guided checklist", text: "Every document you and your co-applicant need, grouped and ticked off as you go." },
  { icon: Sparkles, tone: "violet", title: "AI auto-fill", text: "Passport, Aadhaar, PAN and marksheets are read for you and fill your profile." },
  { icon: Activity, tone: "teal", title: "Live tracking", text: "See your loan status the moment your advisor or lender updates it." },
  { icon: FolderLock, tone: "amber", title: "Secure vault", text: "Files are stored encrypted and shared only with your advisor and your lenders." },
];

const BANK_FEATURES = [
  { icon: MonitorCheck, title: "Secure in-app viewer", text: "Officers review documents in a secure viewer and see only the students assigned to them." },
  { icon: Link2, title: "One-time downloads", text: "Every download uses a single-use link that stops working after it is opened." },
  { icon: History, title: "Full audit log", text: "Views, downloads and status changes are recorded against the officer who made them." },
];

const MODES = {
  new: {
    icon: GraduationCap,
    title: "Create your application",
    sub: "Your name, contact details and a PIN. Takes about a minute.",
  },
  returning: {
    icon: KeyRound,
    title: "Sign in to your application",
    sub: "Your registered email or mobile number, then your PIN.",
  },
};

/* Motion — one orchestrated page-load sequence, not scattered effects. */
const rise = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

/* Defined at module scope on purpose — a component declared inside Home()
   would be a new type on every render and would blow away input focus. */
function Field({ id, label, required, icon: Icon, hint, error, prefix, children }) {
  return (
    <div className={`lp-field${error ? " has-error" : ""}`}>
      <label className="lp-field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="lp-field__req" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className={`lp-field__control${prefix ? " lp-field__control--prefix" : ""}`}>
        {Icon && <Icon size={17} className="lp-field__icon" aria-hidden="true" />}
        {prefix && <span className="lp-field__prefix" aria-hidden="true">{prefix}</span>}
        {children}
      </div>
      {error ? (
        <p className="lp-field__error" id={`${id}-error`} role="alert">{error}</p>
      ) : hint ? (
        <p className="lp-field__hint" id={`${id}-hint`}>{hint}</p>
      ) : null}
    </div>
  );
}

function PinField({ id, label, hint, error, value, onChange, autoComplete }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`lp-field${error ? " has-error" : ""}`}>
      <label className="lp-field__label" htmlFor={id}>
        {label}
        <span className="lp-field__req" aria-hidden="true">*</span>
      </label>
      <PinInput id={id} label={label} value={value} onChange={onChange} autoComplete={autoComplete} invalid={Boolean(error)} describedBy={describedBy} />
      {error ? (
        <p className="lp-field__error" id={`${id}-error`} role="alert">{error}</p>
      ) : hint ? (
        <p className="lp-field__hint" id={`${id}-hint`}>{hint}</p>
      ) : null}
    </div>
  );
}

function SectionHead({ id, eyebrow, icon: Icon, title, text, center }) {
  return (
    <div className={`lp-head${center ? " lp-head--center" : ""}`}>
      <p className="lp-eyebrow">
        <Icon size={14} aria-hidden="true" />
        {eyebrow}
      </p>
      <h2 className="lp-h2" id={id}>{title}</h2>
      {text && <p className="lp-head__text">{text}</p>}
    </div>
  );
}

// Header "Login" menu. Admins, staff and lenders share one sign-in page —
// the server decides the role and where they land — so they get one entry.
const WORKSPACE_LOGIN = { to: "/admin-login", label: "Workspace", text: "Admins, staff & lenders", icon: Briefcase };

function LoginMenu({ onStudent }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    wrapRef.current?.querySelector("[role='menuitem']")?.focus();
    const onKey = (e) => {
      const items = [...(wrapRef.current?.querySelectorAll("[role='menuitem']") || [])];
      const at = items.indexOf(document.activeElement);
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        items[(at + step + items.length) % items.length]?.focus();
      } else if (e.key === "Tab") {
        setOpen(false);
      }
    };
    const onPointer = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div className="lp-login" ref={wrapRef}>
      <button
        type="button"
        ref={buttonRef}
        className="lp-btn lp-btn--ghost lp-login__toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Login
        <ChevronDown size={16} aria-hidden="true" className="lp-login__chevron" />
      </button>
      {open && (
        <div className="lp-login__menu" role="menu" aria-label="Login as">
          <button
            type="button"
            role="menuitem"
            className="lp-login__item"
            onClick={() => { setOpen(false); onStudent(); }}
          >
            <span className="lp-login__icon"><GraduationCap size={18} aria-hidden="true" /></span>
            <span className="lp-login__copy">
              <span className="lp-login__label">Applicant</span>
              <span className="lp-login__text">Resume your loan application</span>
            </span>
          </button>
          <Link to={WORKSPACE_LOGIN.to} role="menuitem" className="lp-login__item" onClick={() => setOpen(false)}>
            <span className="lp-login__icon lp-login__icon--workspace"><WORKSPACE_LOGIN.icon size={18} aria-hidden="true" /></span>
            <span className="lp-login__copy">
              <span className="lp-login__label">{WORKSPACE_LOGIN.label}</span>
              <span className="lp-login__text">{WORKSPACE_LOGIN.text}</span>
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  // null = closed, "new" = create application, "returning" = resume
  const [mode, setMode] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    pin: "",
    pinConfirm: "",
  });
  // Per-field messages, shown once a field has been left or the form submitted
  const [fieldErrors, setFieldErrors] = useState({});
  const [lookup, setLookup] = useState("");
  // Sign-in: "identify" (email / mobile) → "pin", or "create" when the
  // application has no PIN yet (older applications, or reset by staff).
  const [signInStep, setSignInStep] = useState("identify");
  const [signInPin, setSignInPin] = useState({ pin: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setStudent } = useStudent();
  const navigate = useNavigate();
  // /c/<slug>: applying through a partner company's signup link.
  // company: undefined = loading, null = Flyurdream (main site), false = link not active
  const { companySlug } = useParams();
  const [company, setCompany] = useState(companySlug ? undefined : null);
  // The company's name everywhere this page would otherwise say DocLocker
  const brand = useBrand();
  const brandName = companySlug ? brand.name || "" : "DocLocker";
  const reduceMotion = useReducedMotion();

  const dialogRef = useRef(null);
  const menuRef = useRef(null);
  const menuToggleRef = useRef(null);
  const returnFocusRef = useRef(null);

  // Pick up the company first, so the new record belongs to it.
  useEffect(() => {
    let cancelled = false;
    if (!companySlug) {
      setStudentCompany(null);
      return undefined;
    }
    fetch(`${API_URL}/api/companies/public/${encodeURIComponent(companySlug)}`, { signal: AbortSignal.timeout(12000) })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.success && d.company.kind !== "owner") {
          setStudentCompany(d.company);
          setCompany(d.company);
        } else {
          setStudentCompany(null);
          setCompany(false);
        }
      })
      .catch(() => { if (!cancelled) setCompany(false); });
    return () => { cancelled = true; };
  }, [companySlug]);

  // A dead link wears no brand at all (BrandContext keeps it blank)
  useEffect(() => {
    if (company === false) document.title = "Link not active";
  }, [company]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const resetSignIn = () => {
    setSignInStep("identify");
    setSignInPin({ pin: "", confirm: "" });
  };

  const openDialog = (next) => {
    returnFocusRef.current = document.activeElement;
    setMenuOpen(false);
    setError("");
    resetSignIn();
    setMode(next);
  };

  const switchMode = (next) => {
    setMode(next);
    setError("");
    resetSignIn();
  };

  const closeDialog = useCallback(() => {
    setMode(null);
    setError("");
    // The opener may have been inside the mobile menu, which is gone now.
    const target = returnFocusRef.current?.isConnected ? returnFocusRef.current : menuToggleRef.current;
    target?.focus?.();
  }, []);

  const isOpen = mode !== null;

  // Dialog: lock page scroll, focus the first field, trap Tab, close on Escape.
  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => {
      dialogRef.current?.querySelector("input, select")?.focus();
    });
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDialog();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      // Focus can fall to <body> when the focused submit button is disabled
      // while a request runs; pull it back in either direction.
      const outside = !dialogRef.current.contains(document.activeElement);
      if (e.shiftKey && (outside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (outside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, closeDialog]);

  // Mobile menu: Escape and outside clicks close it.
  useEffect(() => {
    if (!menuOpen) return undefined;
    menuRef.current?.querySelector("a, button")?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuToggleRef.current?.focus();
      }
    };
    const onPointer = (e) => {
      if (!menuRef.current?.contains(e.target) && !menuToggleRef.current?.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  const scrollToSection = (e, id) => {
    e.preventDefault();
    setMenuOpen(false);
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  };

  const scrollToTop = (e) => {
    e.preventDefault();
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  // ── New registration with duplicate check ─────────────────────────────────
  const validateField = (field, value) => {
    if (field === "name") {
      const v = value.trim();
      if (!v) return "Enter your full name";
      if (v.length < 2) return "Name is too short";
      if (!/^[\p{L} .'-]+$/u.test(v)) return "Use letters only";
      return null;
    }
    if (field === "email") return emailProblem(value);
    if (field === "phone") return indianMobileProblem(value);
    if (field === "pin") return pinProblem(value);
    if (field === "pinConfirm") return value === form.pin ? null : "The two PINs don’t match";
    return null;
  };

  const touchField = (field) => {
    setFieldErrors((prev) => ({ ...prev, [field]: validateField(field, form[field]) }));
  };

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Once a message is showing, re-check as they type so it clears itself.
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: validateField(field, value) } : prev));
  };

  const handleNewStudent = async (e) => {
    e.preventDefault();

    const FIELDS = ["name", "email", "phone", "pin", "pinConfirm"];
    const errors = Object.fromEntries(FIELDS.map((f) => [f, validateField(f, form[f])]));
    setFieldErrors(errors);
    const firstBad = FIELDS.find((f) => errors[f]);
    if (firstBad) {
      setError("");
      document.getElementById(`lp-${firstBad}`)?.focus();
      return;
    }

    const email = normalizeEmail(form.email);
    const phone = normalizeIndianMobile(form.phone);
    setLoading(true);
    setError("");
    try {
      const student = await registerApplicant({
        name: form.name.trim().replace(/\s+/g, " "),
        email,
        phone,
        pin: form.pin,
        applicationId: deriveApplicationId({ email, phone }),
      });
      setStudent(student);
      navigate("/portal");
    } catch (err) {
      console.error("New student creation error:", err);
      if (err.exists) {
        setError("An application already exists with this email or mobile number. Sign in to continue it.");
      } else {
        setError(err.status ? err.message : "We couldn’t reach the server. Please check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Sign in to an existing application ────────────────────────────────────
  // Email or an Indian mobile number; shape only for emails — an older
  // application may use one today's signup rules would question.
  const lookupIdentifier = () => {
    const text = lookup.trim();
    if (!text) return { problem: "Enter your registered email or mobile number." };
    if (text.includes("@")) {
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)
        ? { id: normalizeEmail(text) }
        : { problem: "Enter a valid email, like name@example.com." };
    }
    const problem = indianMobileProblem(text);
    return problem ? { problem: `${problem}.` } : { id: normalizeIndianMobile(text) };
  };

  const finishSignIn = (student) => {
    setStudent(student);
    navigate("/portal");
  };

  const handleReturning = async (e) => {
    e.preventDefault();
    const { id, problem } = lookupIdentifier();
    if (problem) { setError(problem); return; }

    if (signInStep !== "identify") {
      const pinError = pinProblem(signInPin.pin);
      if (signInStep === "pin" && !/^\d{6}$/.test(signInPin.pin)) { setError("Enter your 6-digit PIN."); return; }
      if (signInStep === "create" && pinError) { setError(`${pinError}.`); return; }
      if (signInStep === "create" && signInPin.pin !== signInPin.confirm) { setError("The two PINs don’t match."); return; }
    }

    setLoading(true);
    setError("");
    try {
      if (signInStep === "identify") {
        const found = await lookupApplicant(id);
        if (!found.found) {
          setError("We couldn’t find an application with this email or mobile number. Check it, or start a new application.");
        } else {
          setSignInStep(found.hasPin ? "pin" : "create");
          requestAnimationFrame(() => document.getElementById("lp-signin-pin")?.focus());
        }
      } else if (signInStep === "pin") {
        finishSignIn(await signInApplicant(id, signInPin.pin));
      } else {
        finishSignIn(await createApplicantPin(id, signInPin.pin));
      }
    } catch (err) {
      // A wrong PIN or unknown email is an answer, not a failure.
      if (!err.status || err.status >= 500) console.error("Sign-in error:", err);
      if (err.needsPin) setSignInStep("create");
      else if (err.hasPin) setSignInStep("pin");
      setSignInPin({ pin: "", confirm: "" });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const ModeIcon = mode ? MODES[mode].icon : null;

  if (company === false) {
    return (
      <div className="lp-page lp-page--message theme-orbit">
        <div className="lp-message">
          <h1>This signup link isn’t active</h1>
          <p>Please check the link with the company that shared it with you.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lp-page theme-orbit" id="top">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className={`lp-header${scrolled || menuOpen ? " lp-header--raised" : ""}`}>
        <div className="lp-header__inner">
          <a href="#top" className="lp-header__brand" onClick={scrollToTop} aria-label={`${brandName || "Home"}, back to top`}>
            <BrandLogo size="md" />
          </a>

          <nav className="lp-nav" aria-label="Main">
            {NAV.map(({ id, label }) => (
              <a key={id} href={`#${id}`} className="lp-nav__link" onClick={(e) => scrollToSection(e, id)}>
                {label}
              </a>
            ))}
          </nav>

          <div className="lp-header__actions">
            <LoginMenu onStudent={() => openDialog("returning")} />
            <button type="button" className="lp-btn lp-btn--primary" onClick={() => openDialog("new")}>
              Get Started
            </button>
          </div>

          <button
            type="button"
            ref={menuToggleRef}
            className="lp-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="lp-mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              id="lp-mobile-menu"
              ref={menuRef}
              className="lp-menu"
              initial={reduceMotion ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <nav aria-label="Main menu">
                <ul className="lp-menu__links">
                  {NAV.map(({ id, label }) => (
                    <li key={id}>
                      <a href={`#${id}`} className="lp-menu__link" onClick={(e) => scrollToSection(e, id)}>
                        {label}
                        <ArrowRight size={16} aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="lp-menu__login">
                <p className="lp-menu__group">Login as</p>
                <div className="lp-menu__login-grid">
                  <button type="button" className="lp-menu__login-btn" onClick={() => openDialog("returning")}>
                    <GraduationCap size={17} aria-hidden="true" /> Applicant
                  </button>
                  <Link to={WORKSPACE_LOGIN.to} className="lp-menu__login-btn" onClick={() => setMenuOpen(false)}>
                    <WORKSPACE_LOGIN.icon size={17} aria-hidden="true" /> {WORKSPACE_LOGIN.label}
                  </Link>
                </div>
              </div>
              <div className="lp-menu__actions">
                <button type="button" className="lp-btn lp-btn--primary lp-btn--block" onClick={() => openDialog("new")}>
                  Get Started
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="lp-hero" aria-labelledby="lp-hero-title">
          <div className="lp-hero__bg" aria-hidden="true">
            <span className="lp-hero__glow lp-hero__glow--a" />
            <span className="lp-hero__glow lp-hero__glow--b" />
            <HeroSkyline />
          </div>

          <div className="lp-hero__inner">
            <motion.div
              className="lp-hero__copy"
              variants={stagger}
              initial={reduceMotion ? false : "hidden"}
              animate="show"
            >
              {company ? (
                <motion.p className="lp-pill lp-pill--company" variants={rise} style={company.branding?.accent ? { "--lp-company": company.branding.accent } : undefined}>
                  {company.logoUrl
                    ? <img className="lp-pill__logo" src={companyLogoSrc(company.logoUrl)} alt="" />
                    : <span className="lp-pill__icon"><Landmark size={14} aria-hidden="true" /></span>}
                  Applying with <strong>{company.branding?.displayName || company.name}</strong>
                </motion.p>
              ) : (
                <motion.p className="lp-pill" variants={rise}>
                  <span className="lp-pill__icon"><Plane size={14} aria-hidden="true" /></span>
                  Built for Indian students going abroad
                </motion.p>
              )}

              <motion.h1 className="lp-title" id="lp-hero-title" variants={rise}>
                Your Education Loan Documents, <span className="lp-title__accent">Simplified</span>
              </motion.h1>

              <motion.p className="lp-lede" variants={rise}>
                Upload, verify and manage all your education loan documents in one secure place.
                Our AI reads your documents and auto-fills your profile, so you can focus on your future.
              </motion.p>

              <motion.div className="lp-hero__ctas" variants={rise}>
                <button type="button" className="lp-btn lp-btn--primary lp-btn--lg" onClick={() => openDialog("new")}>
                  Get Started
                </button>
                <a
                  href="#how-it-works"
                  className="lp-btn lp-btn--soft lp-btn--lg"
                  onClick={(e) => scrollToSection(e, "how-it-works")}
                >
                  <span className="lp-btn__play"><CirclePlay size={20} aria-hidden="true" /></span>
                  See How It Works
                </a>
              </motion.div>

              <motion.p className="lp-hero__resume" variants={rise}>
                Already started?{" "}
                <button type="button" className="lp-textlink" onClick={() => openDialog("returning")}>
                  Resume your application
                </button>
              </motion.p>
            </motion.div>

            <motion.div
              className="lp-hero__visual"
              initial={reduceMotion ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              <HeroScene />
            </motion.div>
          </div>
        </section>

        {/* ── Stats strip ───────────────────────────────────────────────── */}
        <section className="lp-stats-wrap" aria-label="At a glance">
          <ul className="lp-stats">
            {STATS.map(({ icon: Icon, value, label }) => (
              <li key={label} className="lp-stat">
                <span className="lp-stat__icon"><Icon size={26} aria-hidden="true" /></span>
                <span className="lp-stat__body">
                  <span className="lp-stat__value">{value}</span>
                  <span className="lp-stat__label">{label}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <section className="lp-section" id="how-it-works" tabIndex={-1} aria-labelledby="lp-how-title">
          <div className="lp-container">
            <SectionHead
              id="lp-how-title"
              eyebrow="How it works"
              icon={ListChecks}
              title="From sign-up to sanction letter in four steps"
              text="Your loan file moves through the same sequence every time, so you always know what comes next."
              center
            />
            <ol className="lp-steps">
              {JOURNEY.map(({ icon: Icon, title, detail }, i) => (
                <li key={title} className="lp-step">
                  <span className="lp-step__top">
                    <span className="lp-step__num">{String(i + 1).padStart(2, "0")}</span>
                    <span className="lp-step__icon"><Icon size={22} aria-hidden="true" /></span>
                  </span>
                  <h3 className="lp-step__title">{title}</h3>
                  <p className="lp-step__detail">{detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── For students ──────────────────────────────────────────────── */}
        <section className="lp-section lp-section--tint" id="for-students" tabIndex={-1} aria-labelledby="lp-students-title">
          <div className="lp-container lp-split">
            <div className="lp-split__copy">
              <SectionHead
                id="lp-students-title"
                eyebrow="For Students"
                icon={GraduationCap}
                title="Everything your loan file needs, in one place"
                text={`No more chasing papers over email. Upload once, let ${companySlug ? "us" : "DocLocker"} read and organise your documents, and follow your application until the sanction letter arrives.`}
              />
              <div className="lp-split__ctas">
                <button type="button" className="lp-btn lp-btn--primary lp-btn--lg" onClick={() => openDialog("new")}>
                  Start your application <ArrowRight size={18} aria-hidden="true" />
                </button>
                <button type="button" className="lp-btn lp-btn--ghost lp-btn--lg" onClick={() => openDialog("returning")}>
                  Resume application
                </button>
              </div>
            </div>
            <ul className="lp-features">
              {STUDENT_FEATURES.map(({ icon: Icon, tone, title, text }) => (
                <li key={title} className="lp-feature">
                  <span className={`lp-feature__icon lp-tone--${tone}`}><Icon size={22} aria-hidden="true" /></span>
                  <h3 className="lp-feature__title">{title}</h3>
                  <p className="lp-feature__text">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── For banks ─────────────────────────────────────────────────── */}
        <section className="lp-section" id="for-banks" tabIndex={-1} aria-labelledby="lp-banks-title">
          <div className="lp-container">
            <div className="lp-banks">
              <div className="lp-banks__copy">
                <SectionHead
                  id="lp-banks-title"
                  eyebrow="For Banks"
                  icon={Landmark}
                  title="A secure review desk for lending partners"
                  text="Bank officers get complete, organised student files without documents leaving the platform by email."
                />
                <ul className="lp-bankfeats">
                  {BANK_FEATURES.map(({ icon: Icon, title, text }) => (
                    <li key={title} className="lp-bankfeat">
                      <span className="lp-bankfeat__icon"><Icon size={20} aria-hidden="true" /></span>
                      <div>
                        <h3 className="lp-bankfeat__title">{title}</h3>
                        <p className="lp-bankfeat__text">{text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <Link to="/admin-login" className="lp-btn lp-btn--navy lp-btn--lg">
                  <LogIn size={18} aria-hidden="true" /> Staff &amp; lender sign in
                </Link>
              </div>

              <div className="lp-lenders">
                <p className="lp-lenders__label">{companySlug ? "Our lending partners" : "Lending partners on DocLocker"}</p>
                <ul className="lp-lenders__grid">
                  {LENDERS.map((b) => (
                    <li key={b.value} className="lp-lender">
                      <span className="lp-lender__logo">
                        <img src={b.logo} alt="" />
                      </span>
                      <span className="lp-lender__name">{b.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── About ─────────────────────────────────────────────────────── */}
        <section className="lp-section lp-section--about" id="about" tabIndex={-1} aria-labelledby="lp-about-title">
          <div className="lp-container">
            <div className="lp-about">
              <div className="lp-about__copy">
                <SectionHead
                  id="lp-about-title"
                  eyebrow="About"
                  icon={Users}
                  title={`About ${brandName}`}
                />
                <p className="lp-about__text">
                  {companySlug
                    ? `${brandName} handles your education loan from start to finish. Upload your papers once, your advisor keeps the file complete, and our lending partners review it securely, so everyone works from the same up-to-date file.`
                    : "DocLocker is the document workspace behind an education loan. Students upload their papers once, their finance advisor keeps the file complete, and lending partners review it securely, so everyone works from the same up-to-date file."}
                </p>
              </div>
              <div className="lp-cta">
                <h3 className="lp-cta__title">Ready to start your loan file?</h3>
                <p className="lp-cta__text">It takes about a minute to open your application.</p>
                <div className="lp-cta__actions">
                  <button type="button" className="lp-btn lp-btn--white lp-btn--lg" onClick={() => openDialog("new")}>
                    Get Started
                  </button>
                  <button type="button" className="lp-btn lp-btn--outline-light lp-btn--lg" onClick={() => openDialog("returning")}>
                    Login
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-container lp-footer__inner">
          <BrandLogo size="md" tagline />
          <nav className="lp-footer__nav" aria-label="Footer">
            {NAV.map(({ id, label }) => (
              <a key={id} href={`#${id}`} onClick={(e) => scrollToSection(e, id)}>
                {label}
              </a>
            ))}
            <Link to="/admin-login" className="lp-footer__staff">
              <LogIn size={15} aria-hidden="true" /> Staff sign in
            </Link>
          </nav>
        </div>
        <p className="lp-container lp-footer__copy">© {new Date().getFullYear()} {brandName}</p>
      </footer>

      {/* ── Application dialog ─────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="lp-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeDialog();
            }}
          >
            <motion.div
              ref={dialogRef}
              className="lp-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="lp-dialog-title"
              aria-describedby="lp-dialog-sub"
              initial={reduceMotion ? false : { opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <button type="button" className="lp-dialog__close" onClick={closeDialog} aria-label="Close">
                <X size={20} aria-hidden="true" />
              </button>

              <div className="lp-dialog__head">
                <span className="lp-dialog__icon"><ModeIcon size={22} aria-hidden="true" /></span>
                <h2 id="lp-dialog-title" className="lp-dialog__title">{MODES[mode].title}</h2>
                <p id="lp-dialog-sub" className="lp-dialog__sub">{MODES[mode].sub}</p>
              </div>

              <div className="lp-seg" role="group" aria-label="Application type">
                <button type="button" className="lp-seg__btn" aria-pressed={mode === "new"} onClick={() => switchMode("new")}>
                  New application
                </button>
                <button type="button" className="lp-seg__btn" aria-pressed={mode === "returning"} onClick={() => switchMode("returning")}>
                  Resume application
                </button>
              </div>

              {mode === "new" && (
                <form onSubmit={handleNewStudent} className="lp-form" noValidate>
                  <Field id="lp-name" label="Full name" required icon={User} error={fieldErrors.name}>
                    <input
                      id="lp-name"
                      className="lp-input"
                      placeholder="e.g. Rahul Sharma"
                      autoComplete="name"
                      maxLength={80}
                      required
                      aria-invalid={Boolean(fieldErrors.name)}
                      aria-describedby={fieldErrors.name ? "lp-name-error" : undefined}
                      value={form.name}
                      onChange={(e) => updateField("name", e.target.value)}
                      onBlur={() => touchField("name")}
                    />
                  </Field>

                  <Field id="lp-email" label="Email address" required icon={Mail} error={fieldErrors.email} hint="We’ll use it to find your file later">
                    <input
                      id="lp-email"
                      className="lp-input"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      maxLength={254}
                      required
                      placeholder="name@example.com"
                      aria-invalid={Boolean(fieldErrors.email)}
                      aria-describedby={fieldErrors.email ? "lp-email-error" : "lp-email-hint"}
                      value={form.email}
                      onChange={(e) => updateField("email", e.target.value.replace(/\s/g, ""))}
                      onBlur={() => touchField("email")}
                    />
                  </Field>

                  <Field id="lp-phone" label="Mobile number" required prefix="+91" error={fieldErrors.phone} hint="10-digit Indian mobile number">
                    <input
                      id="lp-phone"
                      className="lp-input"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={10}
                      required
                      placeholder="98765 43210"
                      aria-invalid={Boolean(fieldErrors.phone)}
                      aria-describedby={fieldErrors.phone ? "lp-phone-error" : "lp-phone-hint"}
                      value={form.phone}
                      onChange={(e) => updateField("phone", normalizeIndianMobile(e.target.value).replace(/\D/g, "").slice(0, 10))}
                      onBlur={() => touchField("phone")}
                    />
                  </Field>

                  <PinField
                    id="lp-pin"
                    label="Create a 6-digit PIN"
                    hint="You’ll use it to open your application. Keep it to yourself."
                    error={fieldErrors.pin}
                    value={form.pin}
                    autoComplete="new-password"
                    onChange={(v) => updateField("pin", v)}
                  />
                  <PinField
                    id="lp-pinConfirm"
                    label="Confirm your PIN"
                    error={fieldErrors.pinConfirm}
                    value={form.pinConfirm}
                    autoComplete="new-password"
                    onChange={(v) => updateField("pinConfirm", v)}
                  />

                  {error && (
                    <div className="lp-alert" role="alert">
                      <AlertCircle size={17} className="lp-alert__icon" aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button type="submit" className="lp-btn lp-btn--primary lp-btn--lg lp-btn--block" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 size={18} className="lp-spin" aria-hidden="true" />
                        <span>Creating your file…</span>
                      </>
                    ) : (
                      <>
                        <span>Create my application</span>
                        <ArrowRight size={18} aria-hidden="true" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {mode === "returning" && (
                <form onSubmit={handleReturning} className="lp-form" noValidate>
                  <Field
                    id="lp-lookup"
                    label="Registered email or mobile number"
                    required
                    icon={Search}
                    hint={signInStep === "identify" ? "The one you used when you started your application." : undefined}
                  >
                    <input
                      id="lp-lookup"
                      className="lp-input"
                      placeholder="name@example.com or 9876543210"
                      autoComplete="username"
                      readOnly={signInStep !== "identify"}
                      value={lookup}
                      onChange={(e) => setLookup(e.target.value)}
                    />
                    {signInStep !== "identify" && (
                      <button type="button" className="lp-field__change" onClick={() => { resetSignIn(); setError(""); }}>
                        Change
                      </button>
                    )}
                  </Field>

                  {signInStep === "pin" && (
                    <PinField
                      id="lp-signin-pin"
                      label="Your PIN"
                      value={signInPin.pin}
                      onChange={(v) => setSignInPin((p) => ({ ...p, pin: v }))}
                      hint="Forgot it? Ask your advisor to reset it, then come back and create a new one."
                    />
                  )}
                  {signInStep === "create" && (
                    <>
                      <p className="lp-signin-note">
                        <ShieldCheck size={16} aria-hidden="true" />
                        <span>Create a PIN to keep your documents private. You’ll use it every time you sign in.</span>
                      </p>
                      <PinField
                        id="lp-signin-pin"
                        label="Create a 6-digit PIN"
                        autoComplete="new-password"
                        value={signInPin.pin}
                        onChange={(v) => setSignInPin((p) => ({ ...p, pin: v }))}
                      />
                      <PinField
                        id="lp-signin-confirm"
                        label="Confirm your PIN"
                        autoComplete="new-password"
                        value={signInPin.confirm}
                        onChange={(v) => setSignInPin((p) => ({ ...p, confirm: v }))}
                      />
                    </>
                  )}

                  {error && (
                    <div className="lp-alert" role="alert">
                      <AlertCircle size={17} className="lp-alert__icon" aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button type="submit" className="lp-btn lp-btn--primary lp-btn--lg lp-btn--block" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 size={18} className="lp-spin" aria-hidden="true" />
                        <span>{signInStep === "identify" ? "Finding your application…" : "Signing you in…"}</span>
                      </>
                    ) : (
                      <>
                        <span>{signInStep === "identify" ? "Continue" : signInStep === "pin" ? "Sign in" : "Create PIN & sign in"}</span>
                        <ArrowRight size={18} aria-hidden="true" />
                      </>
                    )}
                  </button>
                </form>
              )}

              <p className="lp-dialog__foot">
                <ShieldCheck size={15} aria-hidden="true" />
                Your details stay with your advisor and the lenders you apply to.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
