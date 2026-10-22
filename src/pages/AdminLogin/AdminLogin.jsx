import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Eye,
  EyeOff,
  LogIn,
  Sparkles,
  RefreshCw,
  User,
  Lock,
  AlertCircle,
  ArrowLeft,
  ScanText,
  ShieldCheck,
  Landmark,
  History,
} from "lucide-react";
import BrandLogo from "../../components/BrandLogo/BrandLogo";
import { BANK_OPTIONS } from "../../utils/bankOptions";
import { useStudent } from "../../context/StudentContext";
import "./AdminLogin.css";

const API_URL = import.meta.env.VITE_API_URL ?? '';

async function apiPost(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// What DocLocker actually does, in the order a student's file moves through
// it — shown on the brand panel instead of generic marketing copy.
const FLOW = [
  { icon: ScanText,    tone: "blue",  title: "Documents read for you",       text: "Passport, Aadhaar, PAN and marksheets fill the application automatically." },
  { icon: ShieldCheck, tone: "teal",  title: "Names checked across every ID", text: "Mismatches are flagged before a bank ever sees the file." },
  { icon: Landmark,    tone: "amber", title: "Shared with the right lender",  text: "Bank officers see only the students they're given access to." },
];

const ALL_LENDERS = BANK_OPTIONS.filter((b) => b.value !== "Others");
const LENDERS = ALL_LENDERS.slice(0, 6);
const MORE_LENDERS = ALL_LENDERS.length - LENDERS.length;

// Rendered in the brand panel on wide screens and under the card on phones.
function LenderStrip({ className = "" }) {
  return (
    <div className={`al-lenders ${className}`.trim()}>
      <p className="al-lenders-label">Lenders on DocLocker</p>
      <ul className="al-lenders-row">
        {LENDERS.map((b) => (
          <li key={b.value} className="al-lender" title={b.label}>
            <img src={b.logo} alt={b.label} />
          </li>
        ))}
      </ul>
      {MORE_LENDERS > 0 && <p className="al-lenders-more">and {MORE_LENDERS} more lending partners</p>}
    </div>
  );
}

function Field({ id, label, icon: Icon, type = "text", value, onChange, placeholder, autoComplete, autoFocus, trailing }) {
  return (
    <div className="al-field">
      <label htmlFor={id}>{label}</label>
      <div className="al-input-wrap">
        <Icon size={17} className="al-input-icon" aria-hidden="true" />
        <input
          id={id}
          className="al-input"
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
        />
        {trailing}
      </div>
    </div>
  );
}

function PasswordToggle({ shown, onToggle }) {
  return (
    <button
      type="button"
      className="al-reveal"
      onClick={onToggle}
      aria-label={shown ? "Hide password" : "Show password"}
    >
      {shown ? <EyeOff size={17} /> : <Eye size={17} />}
    </button>
  );
}

export default function AdminLogin() {
  // "login" | "setup"
  const [view, setView] = useState("login");

  // Login form
  const [loginName, setLoginName] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [showLoginPass, setShowLoginPass] = useState(false);

  // First-time setup form
  const [setupName, setSetupName] = useState("");
  const [setupPass, setSetupPass] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [showSetupPass, setShowSetupPass] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { loginAdmin } = useStudent();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginName.trim()) { setError("Please enter your name."); return; }
    if (!loginPass) { setError("Please enter your password."); return; }
    setLoading(true);
    setError("");
    try {
      const result = await apiPost("/api/auth/login", {
        name: loginName.trim(),
        password: loginPass,
      });
      if (result.notInitialized) {
        setView("setup");
        setLoading(false);
        return;
      }
      if (result.success) {
        loginAdmin(result.role, result.advisorName, result.name, result.token, result.bank || "");
        navigate(result.role === "banker" ? "/banker-portal" : "/admin");
      } else {
        setError(result.error || "Invalid name or password. Please try again.");
      }
    } catch {
      setError("Could not connect. Check your network and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e) => {
    e.preventDefault();
    if (!setupName.trim()) { setError("Please enter an admin name."); return; }
    if (setupPass.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (setupPass !== setupConfirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    setError("");
    try {
      const result = await apiPost("/api/auth/init", {
        name: setupName.trim(),
        password: setupPass,
      });
      if (result.success) {
        loginAdmin(result.role, result.advisorName, result.name, result.token);
        navigate("/admin");
      } else {
        setError(result.error || "Setup failed. Please try again.");
        if (result.error && result.error.includes("already initialized")) {
          setView("login");
        }
      }
    } catch {
      setError("Could not connect. Check your network and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="al-page">
      <header className="al-topbar">
        {/* The brand panel carries the full lockup on wide screens */}
        <BrandLogo size="sm" className="al-topbar-logo" />
        <Link to="/" className="al-back">
          <ArrowLeft size={16} aria-hidden="true" /> Back to home
        </Link>
      </header>

      <div className="al-layout">
        {/* ── Brand panel ───────────────────────────────────────────── */}
        <aside className="al-brand" aria-label="About DocLocker">
          <BrandLogo size="lg" tagline />

          <div className="al-hero">
            <p className="al-eyebrow"><ShieldCheck size={14} aria-hidden="true" /> Staff &amp; lender access</p>
            <h2 className="al-headline">
              Education loan files, <span>simplified</span>
            </h2>
            <p className="al-lede">
              Review student documents, track every application and share verified files with lenders, all in one secure place.
            </p>
          </div>

          <ul className="al-flow">
            {FLOW.map(({ icon: Icon, tone, title, text }, i) => (
              <li key={title} className="al-flow-card" style={{ "--i": i }}>
                <span className={`al-flow-icon al-flow-icon--${tone}`}><Icon size={20} aria-hidden="true" /></span>
                <div>
                  <p className="al-flow-title">{title}</p>
                  <p className="al-flow-text">{text}</p>
                </div>
              </li>
            ))}
          </ul>

          <LenderStrip />
        </aside>

        {/* ── Form panel ────────────────────────────────────────────── */}
        <main className="al-main">
          <div className="al-card">
            {view === "login" && (
              <form onSubmit={handleLogin} className="al-form" noValidate>
                <h1 className="al-title">Welcome back</h1>
                <p className="al-sub">Sign in to manage students, documents and loan applications.</p>

                <Field
                  id="al-name"
                  label="Name"
                  icon={User}
                  value={loginName}
                  onChange={setLoginName}
                  placeholder="Your account name"
                  autoComplete="username"
                  autoFocus
                />
                <Field
                  id="al-password"
                  label="Password"
                  icon={Lock}
                  type={showLoginPass ? "text" : "password"}
                  value={loginPass}
                  onChange={setLoginPass}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  trailing={<PasswordToggle shown={showLoginPass} onToggle={() => setShowLoginPass((s) => !s)} />}
                />

                {error && (
                  <div className="al-error" role="alert">
                    <AlertCircle size={16} aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}

                <button type="submit" className="al-submit" disabled={loading}>
                  {loading
                    ? <><RefreshCw size={17} className="spin" aria-hidden="true" /> Signing in…</>
                    : <><LogIn size={17} aria-hidden="true" /> Sign in</>}
                </button>

                <p className="al-help">
                  Advisors and bank officers only see their own students. Need an account? Ask your super admin.
                </p>
              </form>
            )}

            {view === "setup" && (
              <form onSubmit={handleSetup} className="al-form" noValidate>
                <span className="al-setup-badge"><Sparkles size={14} aria-hidden="true" /> First-time setup</span>
                <h1 className="al-title">Set up DocLocker</h1>
                <p className="al-sub">No accounts exist yet. Create the super admin account — you can add advisors and bank officers from Settings afterwards.</p>

                <Field
                  id="al-setup-name"
                  label="Super admin name"
                  icon={User}
                  value={setupName}
                  onChange={setSetupName}
                  placeholder="e.g. Admin"
                  autoComplete="username"
                  autoFocus
                />
                <Field
                  id="al-setup-password"
                  label="Password"
                  icon={Lock}
                  type={showSetupPass ? "text" : "password"}
                  value={setupPass}
                  onChange={setSetupPass}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  trailing={<PasswordToggle shown={showSetupPass} onToggle={() => setShowSetupPass((s) => !s)} />}
                />
                <Field
                  id="al-setup-confirm"
                  label="Confirm password"
                  icon={Lock}
                  type={showSetupPass ? "text" : "password"}
                  value={setupConfirm}
                  onChange={setSetupConfirm}
                  placeholder="Repeat the password"
                  autoComplete="new-password"
                />

                {error && (
                  <div className="al-error" role="alert">
                    <AlertCircle size={16} aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}

                <button type="submit" className="al-submit" disabled={loading}>
                  {loading
                    ? <><RefreshCw size={17} className="spin" aria-hidden="true" /> Creating…</>
                    : <><Sparkles size={17} aria-hidden="true" /> Create super admin</>}
                </button>

                <button
                  type="button"
                  className="al-link-btn"
                  onClick={() => { setView("login"); setError(""); }}
                >
                  <ArrowLeft size={14} aria-hidden="true" /> Back to sign in
                </button>
              </form>
            )}

            <p className="al-foot">
              <History size={14} aria-hidden="true" /> Every sign-in is recorded in the audit log.
            </p>
          </div>

          <LenderStrip className="al-lenders--compact" />
        </main>
      </div>
    </div>
  );
}
