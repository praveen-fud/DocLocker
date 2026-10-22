import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  GraduationCap,
  Search,
  ArrowRight,
  ShieldCheck,
  Activity,
  User,
  Mail,
  Phone,
  UserCheck,
  AlertCircle,
  RefreshCw,
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
} from "lucide-react";

import BrandLogo from "../../components/BrandLogo/BrandLogo";
import { useStudent } from "../../context/StudentContext";
import {
  saveStudentMeta,
  searchStudentByIdentifier,
  checkIdentifierExists,
  isValidPhone,
  isValidEmail,
} from "../../utils/driveApi";
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
  { icon: UserPlus, title: "Create your file", detail: "Name, contact, and your finance advisor." },
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
  { icon: MonitorCheck, title: "Secure in-app viewer", text: "Officers review documents inside DocLocker and see only the students assigned to them." },
  { icon: Link2, title: "One-time downloads", text: "Every download uses a single-use link that stops working after it is opened." },
  { icon: History, title: "Full audit log", text: "Views, downloads and status changes are recorded against the officer who made them." },
];

const MODES = {
  new: {
    icon: GraduationCap,
    title: "Create your application",
    sub: "Three details and your file is open. Takes about a minute.",
  },
  returning: {
    icon: Search,
    title: "Resume your application",
    sub: "We'll pull up the file you already started.",
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
function Field({ id, label, required, icon: Icon, hint, children }) {
  return (
    <div className="lp-field">
      <label className="lp-field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="lp-field__req" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className="lp-field__control">
        {Icon && <Icon size={17} className="lp-field__icon" aria-hidden="true" />}
        {children}
      </div>
      {hint && <p className="lp-field__hint">{hint}</p>}
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

export default function Home() {
  // null = closed, "new" = create application, "returning" = resume
  const [mode, setMode] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    advisor: "",
  });
  const [lookup, setLookup] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [advisors, setAdvisors] = useState(null); // null = loading, [] = error/empty
  const [advisorError, setAdvisorError] = useState(false);
  const { setStudent } = useStudent();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const dialogRef = useRef(null);
  const menuRef = useRef(null);
  const menuToggleRef = useRef(null);
  const returnFocusRef = useRef(null);

  // Wrapped in useCallback so it's stable to include as a dependency in useEffect
  const loadAdvisors = useCallback(() => {
    fetch(`${API_URL}/api/advisors`, { signal: AbortSignal.timeout(12000) })
      .then((r) => r.json())
      .then((d) => setAdvisors(d.success ? d.advisors || [] : []))
      .catch(() => {
        setAdvisors([]);
        setAdvisorError(true);
      });
  }, []);

  // Reset + reload — called from the retry button
  const retryAdvisors = () => {
    setAdvisors(null);
    setAdvisorError(false);
    loadAdvisors();
  };

  useEffect(() => {
    loadAdvisors();
  }, [loadAdvisors]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const openDialog = (next) => {
    returnFocusRef.current = document.activeElement;
    setMenuOpen(false);
    setError("");
    setMode(next);
  };

  const switchMode = (next) => {
    setMode(next);
    setError("");
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
  const handleNewStudent = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!form.email.trim() && !form.phone.trim()) {
      setError("Please enter at least one of email or phone number.");
      return;
    }
    if (!form.advisor) {
      setError("Please select your Finance Advisor.");
      return;
    }

    // Validate formats before hitting the network
    if (form.email.trim() && !isValidEmail(form.email.trim())) {
      setError("Please enter a valid email address (e.g. name@example.com).");
      return;
    }

    // Clean and validate phone number
    const cleanedPhone = form.phone.trim().replace(/\s+/g, "");
    if (form.phone.trim() && !isValidPhone(cleanedPhone)) {
      setError("Please enter a valid 10-digit mobile number (e.g. 9876543210).");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Prioritize email as primary tracking key if both are given, else use cleaned phone
      const identifier = form.email.trim() || cleanedPhone;
      const exists = await checkIdentifierExists(identifier);

      if (exists) {
        setError(
          "An application already exists with this email/phone. Use 'Resume my application' to continue.",
        );
        setLoading(false);
        return;
      }

      const studentData = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: cleanedPhone,
        advisor: form.advisor,
        createdAt: new Date().toISOString(),
        applicationId: deriveApplicationId({ email: form.email.trim(), phone: cleanedPhone }),
        coApplicants: 1,
        uploads: {},
        personalInfo: {},
      };

      // Await meta save so the Drive folder exists before the student reaches
      // the portal and tries to upload. Failures are logged but non-blocking.
      await saveStudentMeta(studentData.name, studentData, identifier);

      setStudent(studentData);
      navigate("/portal");
    } catch (err) {
      console.error("New student creation error:", err);
      setError("Could not create application. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Resume existing application ───────────────────────────────────────────
  const handleReturning = async (e) => {
    e.preventDefault();

    const cleanLookup = lookup.trim();
    if (!cleanLookup) {
      setError("Enter your registered email or phone number.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      let finalIdentifier = cleanLookup;

      // 1. Check if it's an email
      if (cleanLookup.includes("@")) {
        if (!isValidEmail(cleanLookup)) {
          setError("Please enter a valid email format.");
          setLoading(false);
          return;
        }
      } else {
        // 2. Treat as phone number
        finalIdentifier = cleanLookup.replace(/[^0-9+]/g, "");
        if (!isValidPhone(finalIdentifier)) {
          setError("Please enter a valid registered 10-digit mobile number.");
          setLoading(false);
          return;
        }
      }

      // 3. Request search from file backend utils
      const found = await searchStudentByIdentifier(finalIdentifier);
      if (found) {
        // found now contains the full meta. Ensure the typed identifier is set
        // so uploads work even if meta was saved without it.
        const isEmail = finalIdentifier.includes("@");
        setStudent({
          ...found,
          email: isEmail ? finalIdentifier : found.email || "",
          phone: isEmail ? found.phone || "" : finalIdentifier,
        });
        navigate("/portal");
      } else {
        setError(
          "No active file found matching this detail. Please verify your entry or create a new application.",
        );
      }
    } catch (err) {
      console.error("Resume lookup error:", err);
      setError(
        "Unable to connect to service. Please check your network and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const ModeIcon = mode ? MODES[mode].icon : null;

  return (
    <div className="lp-page" id="top">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className={`lp-header${scrolled || menuOpen ? " lp-header--raised" : ""}`}>
        <div className="lp-header__inner">
          <a href="#top" className="lp-header__brand" onClick={scrollToTop} aria-label="DocLocker, back to top">
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
            <button type="button" className="lp-btn lp-btn--ghost" onClick={() => openDialog("returning")}>
              Login
            </button>
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
              <div className="lp-menu__actions">
                <button type="button" className="lp-btn lp-btn--ghost lp-btn--block" onClick={() => openDialog("returning")}>
                  Login
                </button>
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
              <motion.p className="lp-pill" variants={rise}>
                <span className="lp-pill__icon"><Plane size={14} aria-hidden="true" /></span>
                Built for Indian students going abroad
              </motion.p>

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
        <section className="lp-stats-wrap" aria-label="DocLocker at a glance">
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
                text="No more chasing papers over email. Upload once, let DocLocker read and organise your documents, and follow your application until the sanction letter arrives."
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
                <p className="lp-lenders__label">Lending partners on DocLocker</p>
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
                  title="About DocLocker"
                />
                <p className="lp-about__text">
                  DocLocker is the document workspace behind an education loan. Students upload their
                  papers once, their finance advisor keeps the file complete, and lending partners review
                  it securely, so everyone works from the same up-to-date file.
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
        <p className="lp-container lp-footer__copy">© {new Date().getFullYear()} DocLocker</p>
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
                  <Field id="lp-name" label="Full name" required icon={User}>
                    <input
                      id="lp-name"
                      className="lp-input"
                      placeholder="e.g. Rahul Sharma"
                      autoComplete="name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </Field>

                  <div className="lp-form__row">
                    <Field id="lp-email" label="Email address" icon={Mail}>
                      <input
                        id="lp-email"
                        className="lp-input"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="name@example.com"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                    </Field>

                    <Field id="lp-phone" label="Phone number" icon={Phone}>
                      <input
                        id="lp-phone"
                        className="lp-input"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="9876543210"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      />
                    </Field>
                  </div>
                  <p className="lp-form__note">
                    Give us at least one — we use it to find your file later.
                  </p>

                  <Field id="lp-advisor" label="Finance advisor" required icon={UserCheck}>
                    <select
                      id="lp-advisor"
                      className="lp-input lp-input--select"
                      value={form.advisor}
                      onChange={(e) => setForm({ ...form, advisor: e.target.value })}
                      disabled={advisors === null}
                    >
                      {advisors === null ? (
                        <option value="">Loading advisors…</option>
                      ) : advisors.length === 0 ? (
                        <option value="">No advisors available</option>
                      ) : (
                        <>
                          <option value="">Select your advisor</option>
                          {advisors.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </Field>

                  {advisorError && (
                    <button type="button" className="lp-retry" onClick={retryAdvisors}>
                      <RefreshCw size={14} aria-hidden="true" />
                      The advisor list didn&apos;t load. Try again
                    </button>
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
                    label="Registered email or phone"
                    required
                    icon={Search}
                    hint="Use the same detail you registered with."
                  >
                    <input
                      id="lp-lookup"
                      className="lp-input"
                      placeholder="name@example.com or 9876543210"
                      autoComplete="username"
                      value={lookup}
                      onChange={(e) => setLookup(e.target.value)}
                    />
                  </Field>

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
                        <span>Looking up your file…</span>
                      </>
                    ) : (
                      <>
                        <Search size={18} aria-hidden="true" />
                        <span>Find my application</span>
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
