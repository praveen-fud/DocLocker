import { Link, useNavigate, useLocation } from "react-router-dom";
import { LogOut, LayoutDashboard, GraduationCap, Shield } from "lucide-react";
import { useStudent } from "../../context/StudentContext";
import logoImg from "../../assets/logo.jpeg";
import "./Navbar.css";

export default function Navbar() {
  const { student, clearStudent, isAdmin, logoutAdmin } = useStudent();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    clearStudent();
    logoutAdmin();
    navigate("/");
  };

  return (
    <nav className="premium-navbar-blur">
      <div className="navbar-container-core">
        {/* Brand Lockup System */}
        <Link to="/" className="navbar-brand-anchor">
          <div className="navbar-logo-lens-capsule">
            <div className="navbar-lens-flare" />
            <img
              src={logoImg}
              alt="FlyUrDream Premium Branding Logo"
              className="navbar-lens-image"
            />
          </div>
          <div className="navbar-brand-typography">
            <span className="navbar-brand-name">AbroadDocs</span>
            <span className="navbar-brand-tagline">by FlyUrDream</span>
          </div>
        </Link>

        {/* Dynamic Action Controls Deck */}
        <div className="navbar-actions-deck">
          {isAdmin && (
            <Link
              to="/admin"
              className={`navbar-deck-link ${location.pathname === "/admin" ? "active" : ""}`}
            >
              <LayoutDashboard size={15} />
              <span>Admin Dashboard</span>
              <div className="navbar-link-active-indicator" />
            </Link>
          )}

          {student && (
            <Link
              to="/portal"
              className={`navbar-deck-link ${location.pathname.startsWith("/portal") ? "active" : ""}`}
            >
              <GraduationCap size={16} />
              <span>{student.name?.split(" ")[0] || "My Portal"}</span>
              <div className="navbar-link-active-indicator" />
            </Link>
          )}

          {(student || isAdmin) && (
            <button className="navbar-exit-trigger" onClick={handleLogout}>
              <LogOut size={14} />
              <span>Exit Portal</span>
            </button>
          )}

          {!isAdmin && !student && (
            <Link
              to="/admin-login"
              className="navbar-deck-link admin-secure-trigger"
            >
              <Shield size={14} />
              <span>Admin Gateway</span>
              <div className="navbar-link-active-indicator" />
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
