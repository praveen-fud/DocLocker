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
import logoMark from "../../assets/logo-mark.webp";
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
  { icon: ScanText,    title: "Documents read for you",       text: "Passport, Aadhaar, PAN and marksheets fill the application automatically." },
  { icon: ShieldCheck, title: "Names checked across every ID", text: "Mismatches are flagged before a bank ever sees the file." },
  { icon: Landmark,    title: "Shared with the right lender",  text: "Bank officers see only the students they're given access to." },
];

const LENDERS = BANK_OPTIONS.filter((b) => b.value !== "Others").slice(0, 6);

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
      {/* ── Brand panel ───────────────────────────────────────────── */}
      <aside className="al-brand" aria-label="About DocLocker">
        <div className="al-brand-inner">
          <div className="al-hero">
            <div className="al-mark-wrap">
              <span className="al-mark-halo" aria-hidden="true" />
              <img src={logoMark} alt="" className="al-mark" width="168" height="168" />
            </div>
            <h2 className="al-wordmark">
              <span className="al-wordmark-doc">Doc</span><span className="al-wordmark-locker">Locker</span>
            </h2>
            <p className="al-tagline">
              Study abroad. <em>Funded</em>, not delayed.
            </p>
          </div>

          <ol className="al-flow">
            {FLOW.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="al-flow-step" style={{ "--i": i }}>
                <span className="al-flow-icon"><Icon size={18} /></span>
                <div>
                  <p className="al-flow-title">{title}</p>
                  <p className="al-flow-text">{text}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="al-lenders">
            <p className="al-lenders-label">Lenders on DocLocker</p>
            <div className="al-lenders-row">
              {LENDERS.map((b) => (
                <span key={b.value} className="al-lender" title={b.label}>
                  <img src={b.logo} alt={b.label} loading="lazy" />
                </span>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Form panel ────────────────────────────────────────────── */}
      <main className="al-main">
        <Link to="/" className="al-back">
          <ArrowLeft size={15} /> Back to home
        </Link>

        <div className="al-form-wrap">
          {/* Compact brand shown only when the brand panel is hidden (mobile) */}
          <div className="al-mobile-brand" aria-hidden="true">
            <img src={logoMark} alt="" />
            <span><span className="al-wordmark-doc-dark">Doc</span><span className="al-wordmark-locker">Locker</span></span>
          </div>

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
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" className="al-submit" disabled={loading}>
                {loading
                  ? <><RefreshCw size={17} className="spin" /> Signing in…</>
                  : <><LogIn size={17} /> Sign in</>}
              </button>

              <p className="al-help">
                Advisors and bank officers only see their own students. Need an account? Ask your super admin.
              </p>
            </form>
          )}

          {view === "setup" && (
            <form onSubmit={handleSetup} className="al-form" noValidate>
              <span className="al-setup-badge"><Sparkles size={14} /> First-time setup</span>
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
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" className="al-submit" disabled={loading}>
                {loading
                  ? <><RefreshCw size={17} className="spin" /> Creating…</>
                  : <><Sparkles size={17} /> Create super admin</>}
              </button>

              <button
                type="button"
                className="al-link-btn"
                onClick={() => { setView("login"); setError(""); }}
              >
                <ArrowLeft size={14} /> Back to sign in
              </button>
            </form>
          )}

          <p className="al-foot">
            <History size={13} /> Every sign-in is recorded in the audit log.
          </p>
        </div>
      </main>
    </div>
  );
}
