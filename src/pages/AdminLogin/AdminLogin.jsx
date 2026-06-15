import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Eye, EyeOff, LogIn, Sparkles, RefreshCw } from "lucide-react";
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
        loginAdmin(result.role, result.advisorName, result.name, result.token);
        navigate("/admin");
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
    <div className="admin-login-page page-bg">
      <div className="admin-login-container animate-fade-in">

        {view === "login" && (
          <>
            <div className="admin-login-icon">
              <Shield size={32} />
            </div>
            <h1>Admin Access</h1>
            <p>
              Enter your name and password to access the dashboard.
              <br />
              Advisors see only their own students.
            </p>

            <form onSubmit={handleLogin} className="admin-login-form card">
              <div className="input-group">
                <label>Name</label>
                <input
                  className="input-field"
                  type="text"
                  placeholder="Your admin name"
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  autoFocus
                  autoComplete="username"
                />
              </div>

              <div className="input-group">
                <label>Password</label>
                <div className="password-wrap">
                  <input
                    className="input-field"
                    type={showLoginPass ? "text" : "password"}
                    placeholder="Enter your password"
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="show-pass"
                    onClick={() => setShowLoginPass(!showLoginPass)}
                  >
                    {showLoginPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="form-error" style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: "100%" }}
                disabled={loading}
              >
                {loading
                  ? <><RefreshCw size={15} className="spin" /> Verifying…</>
                  : <><LogIn size={16} /> Access Dashboard</>
                }
              </button>
            </form>

            <p className="admin-hint">
              Credentials are managed securely in Google Drive.
              Contact your super admin if you need access.
            </p>
          </>
        )}

        {view === "setup" && (
          <>
            <div className="admin-login-icon" style={{ background: "linear-gradient(135deg, #059669, #065f46)" }}>
              <Sparkles size={32} />
            </div>
            <h1>First-time Setup</h1>
            <p>
              No admin accounts exist yet. Create your super admin account to get started.
            </p>

            <form onSubmit={handleSetup} className="admin-login-form card">
              <div className="input-group">
                <label>Super Admin Name</label>
                <input
                  className="input-field"
                  type="text"
                  placeholder="e.g. Admin"
                  value={setupName}
                  onChange={(e) => setSetupName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="input-group">
                <label>Password</label>
                <div className="password-wrap">
                  <input
                    className="input-field"
                    type={showSetupPass ? "text" : "password"}
                    placeholder="Min. 6 characters"
                    value={setupPass}
                    onChange={(e) => setSetupPass(e.target.value)}
                  />
                  <button
                    type="button"
                    className="show-pass"
                    onClick={() => setShowSetupPass(!showSetupPass)}
                  >
                    {showSetupPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="input-group">
                <label>Confirm Password</label>
                <div className="password-wrap">
                  <input
                    className="input-field"
                    type={showSetupPass ? "text" : "password"}
                    placeholder="Repeat password"
                    value={setupConfirm}
                    onChange={(e) => setSetupConfirm(e.target.value)}
                  />
                </div>
              </div>

              {error && (
                <p className="form-error" style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: "100%" }}
                disabled={loading}
              >
                {loading
                  ? <><RefreshCw size={15} className="spin" /> Creating…</>
                  : <><Sparkles size={16} /> Create Super Admin</>
                }
              </button>
            </form>

            <button
              className="admin-hint"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", marginTop: 8 }}
              onClick={() => { setView("login"); setError(""); }}
            >
              ← Back to login
            </button>
          </>
        )}

      </div>
    </div>
  );
}
