import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Eye, EyeOff, LogIn } from "lucide-react";
import { useStudent } from "../../context/StudentContext";
import "./AdminLogin.css";

// Simple admin password - in production use proper auth
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || "admin@2024";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const { loginAdmin } = useStudent();
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      loginAdmin();
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
        <p>Enter admin password to access the student dashboard</p>

        <form onSubmit={handleLogin} className="admin-login-form card">
          <div className="input-group">
            <label>Admin Password</label>
            <div className="password-wrap">
              <input
                className="input-field"
                type={show ? "text" : "password"}
                placeholder="Enter admin password"
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
          Default password is set in <code>.env</code> as{" "}
          <code>VITE_ADMIN_PASSWORD</code>
        </p>
      </div>
    </div>
  );
}
