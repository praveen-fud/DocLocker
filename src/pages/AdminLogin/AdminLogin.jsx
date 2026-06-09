import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Eye, EyeOff, LogIn } from "lucide-react";
import { useStudent } from "../../context/StudentContext";
import "./AdminLogin.css";

const SUPER_ADMIN_PASSWORD =
  import.meta.env.VITE_SUPER_ADMIN_PASSWORD ||
  import.meta.env.VITE_ADMIN_PASSWORD ||
  "admin@2024";

const ADVISOR_PASSWORDS = {
  Sainath: import.meta.env.VITE_ADVISOR_SAINATH_PASSWORD || "Sainath@123",
  Shravan: import.meta.env.VITE_ADVISOR_SHRAVAN_PASSWORD || "Shravan@123",
};

function resolveLogin(password) {
  if (password === SUPER_ADMIN_PASSWORD) {
    return { role: "superadmin", advisorName: "" };
  }
  for (const [name, pwd] of Object.entries(ADVISOR_PASSWORDS)) {
    if (password === pwd) {
      return { role: "advisor", advisorName: name };
    }
  }
  return null;
}

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const { loginAdmin } = useStudent();
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    const result = resolveLogin(password);
    if (result) {
      loginAdmin(result.role, result.advisorName);
      navigate("/admin");
    } else {
      setError("Incorrect password. Please try again.");
    }
  };

  return (
    <div className="admin-login-page page-bg">
      <div className="admin-login-container animate-fade-in">
        <div className="admin-login-icon">
          <Shield size={32} />
        </div>
        <h1>Admin Access</h1>
        <p>
          Enter your password to access the dashboard.
          <br />
          Advisors see only their own students.
        </p>

        <form onSubmit={handleLogin} className="admin-login-form card">
          <div className="input-group">
            <label>Password</label>
            <div className="password-wrap">
              <input
                className="input-field"
                type={show ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                className="show-pass"
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {error && (
            <p
              className="form-error"
              style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%" }}
          >
            <LogIn size={16} /> Access Dashboard
          </button>
        </form>

        <p className="admin-hint">
          Advisor passwords are set in <code>.env</code> as{" "}
          <code>VITE_ADVISOR_SAINATH_PASSWORD</code> and{" "}
          <code>VITE_ADVISOR_SHRAVAN_PASSWORD</code>.
          Super admin uses <code>VITE_SUPER_ADMIN_PASSWORD</code>.
        </p>
      </div>
    </div>
  );
}
