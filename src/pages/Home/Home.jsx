import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  GraduationCap,
  Search,
  ArrowRight,
  FileCheck,
  FolderOpen,
  Shield,
  Sparkles,
} from "lucide-react";
import { useStudent } from "../../context/StudentContext";
import {
  saveStudentMeta,
  searchStudentByIdentifier,
} from "../../utils/driveApi";

import "./Home.css";

export default function Home() {
  const [mode, setMode] = useState("welcome");
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [lookup, setLookup] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setStudent } = useStudent();
  const navigate = useNavigate();

  const handleNewStudent = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Please enter your full name");
    if (!form.email.trim() && !form.phone.trim())
      return setError("Please enter email or phone number");
    setLoading(true);
    const studentData = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      createdAt: new Date().toISOString(),
      coApplicants: 1,
      uploads: {},
      personalInfo: {},
    };
    try {
      await saveStudentMeta(form.name.trim(), studentData);
    } catch (err) {
      console.warn("Could not pre-save student meta:", err?.message);
    }
    setStudent(studentData);
    navigate("/portal");
    setLoading(false);
  };

  const handleReturning = async (e) => {
    e.preventDefault();
    if (!lookup.trim()) return setError("Enter your email or phone number");
    setLoading(true);
    setError("");
    try {
      const found = await searchStudentByIdentifier(lookup.trim());
      if (found) {
        setStudent(found);
        navigate("/portal");
      } else {
        setError(
          "No active file found. Please double check or create a new application.",
        );
      }
    } catch {
      setError("Unable to connect. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="home-page dashboard-viewport">
      {/* Dynamic Ambient Background Canvas */}
      <div className="ambient-glow-network">
        <div className="glow-cluster core-teal-glow" />
        <div className="glow-cluster core-blue-glow" />
      </div>

      <div className="home-split-layout">
        {/* Left Column: Premium Brand Identity Statement */}
        <div className="brand-hero-column animate-fade-in">
          <div className="brand-wrapper">
            <h1 className="main-display-headline">
              Your Abroad Journey
              <span className="gradient-text-block">Starts Here</span>
            </h1>

            <p className="editorial-sub-headline">
              Streamline your Master's application process. Upload,
              automatically structure, and organize your files securely in a
              single, high-fidelity deployment platform.
            </p>

            {/* Asymmetric Feature Matrix */}
            <div className="asymmetric-feature-matrix">
              {[
                {
                  icon: <FileCheck size={20} />,
                  title: "Smart Context Redirection",
                  desc: "Files parse and automatically append standard operational schemas perfectly.",
                  badge: "Automated",
                },
                {
                  icon: <FolderOpen size={20} />,
                  title: "Asymmetric Directory Tree",
                  desc: "Documents partition dynamically across standard Visa, Applicant, and Co-Applicant trees.",
                  badge: "Structured",
                },
                {
                  icon: <Shield size={20} />,
                  title: "Encrypted Cloud Handshake",
                  desc: "Secure end-to-end processing pipeline pushing nodes directly to your Google Drive ecosystem.",
                  badge: "Protected",
                },
              ].map((feature, idx) => (
                <div key={idx} className="matrix-item">
                  <div className="matrix-icon-wrapper">{feature.icon}</div>
                  <div className="matrix-body">
                    <div className="matrix-header-row">
                      <h4>{feature.title}</h4>
                      <span className="matrix-micro-badge">
                        {feature.badge}
                      </span>
                    </div>
                    <p>{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Processing Panel Container */}
        <div className="interactive-panel-column animate-fade-in">
          <div className="glass-workspace-card">
            {/* Logo integrated right inside the workspace wrapper to sit above content */}

            {mode === "welcome" && (
              <div className="workspace-welcome-view">
                <div className="workspace-header text-center">
                  <div className="spark-icon-container">
                    <Sparkles size={18} className="accent-color-icon" />
                  </div>
                  <h2>Get Started</h2>
                  <p>
                    Select your deployment profile to manage application assets
                  </p>
                </div>

                <div className="action-card-deck">
                  <button
                    className="premium-interactive-card new-node"
                    onClick={() => setMode("new")}
                  >
                    <div className="card-glint-overlay" />
                    <div className="card-icon-frame">
                      <GraduationCap size={24} />
                    </div>
                    <div className="card-seo-content">
                      <h3>New Portal Registration</h3>
                      <p>
                        Initialize a secure folder path and clear file structure
                        tags
                      </p>
                    </div>
                    <div className="card-action-indicator">
                      <ArrowRight size={16} />
                    </div>
                  </button>

                  <button
                    className="premium-interactive-card returning-node"
                    onClick={() => setMode("returning")}
                  >
                    <div className="card-glint-overlay" />
                    <div className="card-icon-frame">
                      <Search size={24} />
                    </div>
                    <div className="card-seo-content">
                      <h3>Resume Submission File</h3>
                      <p>
                        Synchronize background progress states via verification
                        tracking
                      </p>
                    </div>
                    <div className="card-action-indicator">
                      <ArrowRight size={16} />
                    </div>
                  </button>
                </div>
              </div>
            )}

            {mode === "new" && (
              <div className="workspace-form-view">
                <div className="workspace-form-header">
                  <button
                    className="minimal-back-action"
                    onClick={() => {
                      setMode("welcome");
                      setError("");
                    }}
                  >
                    ← Back to selection
                  </button>
                  <h2>Create Application</h2>
                  <p>
                    Register your configuration specs to open the file transfer
                    portal
                  </p>
                </div>

                <form
                  onSubmit={handleNewStudent}
                  className="modular-form-layout"
                >
                  <div className="interactive-input-block">
                    <label>
                      Full Name <span className="required-accent">*</span>
                    </label>
                    <input
                      className="premium-styled-input"
                      placeholder="e.g. Rahul Sharma"
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                    />
                    <div className="input-focus-border-line" />
                  </div>

                  <div className="interactive-input-block">
                    <label>Email Address</label>
                    <input
                      className="premium-styled-input"
                      type="email"
                      placeholder="name@example.com"
                      value={form.email}
                      onChange={(e) =>
                        setForm({ ...form, email: e.target.value })
                      }
                    />
                    <div className="input-focus-border-line" />
                  </div>

                  <div className="interactive-input-block">
                    <label>Phone Number</label>
                    <input
                      className="premium-styled-input"
                      placeholder="+91 98765 43210"
                      value={form.phone}
                      onChange={(e) =>
                        setForm({ ...form, phone: e.target.value })
                      }
                    />
                    <div className="input-focus-border-line" />
                  </div>

                  {error && <div className="panel-error-alert">{error}</div>}

                  <button
                    type="submit"
                    className="action-submit-button call-to-action"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="loading-dots">Provisioning Node</span>
                    ) : (
                      <>
                        <span>Initialize Storage Workspace</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}

            {mode === "returning" && (
              <div className="workspace-form-view">
                <div className="workspace-form-header">
                  <button
                    className="minimal-back-action"
                    onClick={() => {
                      setMode("welcome");
                      setError("");
                    }}
                  >
                    ← Back to selection
                  </button>
                  <h2>Resume Progress</h2>
                  <p>
                    Provide verified identification keys to pull remote files
                    states
                  </p>
                </div>

                <form
                  onSubmit={handleReturning}
                  className="modular-form-layout"
                >
                  <div className="interactive-input-block">
                    <label>
                      Email or Verified Phone{" "}
                      <span className="required-accent">*</span>
                    </label>
                    <input
                      className="premium-styled-input"
                      placeholder="Enter submission identifier string"
                      value={lookup}
                      onChange={(e) => setLookup(e.target.value)}
                    />
                    <div className="input-focus-border-line" />
                  </div>

                  {error && <div className="panel-error-alert">{error}</div>}

                  <button
                    type="submit"
                    className="action-submit-button lookup-action"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="loading-dots">Fetching Schema</span>
                    ) : (
                      <>
                        <Search size={16} />
                        <span>Re-load Portal Session</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
