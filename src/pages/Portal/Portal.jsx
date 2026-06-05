import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  BookOpen,
  Briefcase,
  Plane,
  Users,
  Shield,
  FileText,
  ChevronDown,
  ChevronUp,
  Save,
  CheckCircle,
  Info,
} from "lucide-react";
import { useStudent } from "../../context/StudentContext";
import { saveStudentMeta } from "../../utils/driveApi";
import { DOCUMENT_SCHEMA, CO_APPLICANT_SCHEMA } from "../../context/schemas";
import FileUploadBox from "../../components/FileUploadBox/FileUploadBox";
import ProgressBar from "../../components/ProgressBar/ProgressBar";
import "./Portal.css";

const SECTIONS = [
  { id: "personal", label: "Personal Info", icon: User },
  { id: "applicant", label: "Applicant Docs", icon: FileText },
  { id: "academics", label: "Academics", icon: BookOpen },
  { id: "loan", label: "Loan & Co-Applicants", icon: Briefcase },
  { id: "visa", label: "Visa Documents", icon: Plane },
  { id: "references", label: "References", icon: Users },
  { id: "guarantor", label: "Guarantor Details", icon: Shield },
];

export default function Portal() {
  const { student, setStudent } = useStudent();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState(0);
  const [uploads, setUploads] = useState(student?.uploads || {});
  const [personalInfo, setPersonalInfo] = useState(student?.personalInfo || {});
  const [coCount, setCoCount] = useState(student?.coApplicants || 1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Refs to always have latest values without stale closures
  const uploadsRef = useRef(uploads);
  const personalRef = useRef(personalInfo);
  const coCountRef = useRef(coCount);

  // Keep refs in sync with state – moved to effect to avoid render‑time mutation
  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  useEffect(() => {
    personalRef.current = personalInfo;
  }, [personalInfo]);

  useEffect(() => {
    coCountRef.current = coCount;
  }, [coCount]);

  useEffect(() => {
    if (!student) navigate("/");
  }, [student, navigate]);

  if (!student) return null;

  // ── Immediately update local state + context + localStorage.
  //    Then fire Drive save in background — failure never blocks UI.
  const handleUploaded = (sectionKey, fieldId, result) => {
    const newUploads = {
      ...uploadsRef.current,
      [sectionKey]: {
        ...(uploadsRef.current[sectionKey] || {}),
        [fieldId]: result,
      },
    };

    // 1. Update local state immediately — UI reflects upload right away
    setUploads(newUploads);

    // 2. Persist to context + localStorage immediately (synchronous)
    const updated = {
      ...student,
      uploads: newUploads,
      personalInfo: personalRef.current,
      coApplicants: coCountRef.current,
    };
    setStudent(updated); // writes to localStorage inside context

    // 3. Fire Drive save — synchronous local save + background Drive sync
    //    saveStudentMeta never throws, never needs await
    saveStudentMeta(student.name, updated);
  };

  const updatePersonal = (key, value) => {
    setPersonalInfo((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    setSaving(true);
    setSaveError("");
    const updated = {
      ...student,
      uploads: uploadsRef.current,
      personalInfo: personalRef.current,
      coApplicants: coCountRef.current,
    };
    setStudent(updated);
    // saveStudentMeta: saves locally immediately, syncs Drive in background
    // Never throws, no try/catch needed
    saveStudentMeta(student.name, updated);
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2500);
  };

  // Build progress sections
  const getUploadsFor = (key) => uploads[key] || {};
  const applicantDocs = DOCUMENT_SCHEMA.applicant.fields;
  const academicDocs = DOCUMENT_SCHEMA.academics.fields;
  const visaDocs = DOCUMENT_SCHEMA.visa.fields;

  const progressSections = [
    {
      id: "personal",
      label: "Personal",
      total: 8,
      uploaded: Object.keys(personalInfo).filter((k) => personalInfo[k]).length,
    },
    {
      id: "applicant",
      label: "Applicant",
      total: applicantDocs.length,
      uploaded: Object.keys(getUploadsFor("applicant")).length,
    },
    {
      id: "academics",
      label: "Academics",
      total: academicDocs.length,
      uploaded: Object.keys(getUploadsFor("academics")).length,
    },
    {
      id: "loan",
      label: "Loan",
      total: coCount * 3,
      uploaded: Array.from(
        { length: coCount },
        (_, i) => Object.keys(getUploadsFor(`co_${i}`)).length,
      ).reduce((a, b) => a + b, 0),
    },
    {
      id: "visa",
      label: "Visa",
      total: visaDocs.length,
      uploaded: Object.keys(getUploadsFor("visa")).length,
    },
    {
      id: "references",
      label: "Refs",
      total: 4,
      uploaded: Object.keys(personalInfo).filter(
        (k) => k.startsWith("ref") && personalInfo[k],
      ).length,
    },
    {
      id: "guarantor",
      label: "Guarantor",
      total: 2,
      uploaded: Object.keys(personalInfo).filter(
        (k) => k.startsWith("guar") && personalInfo[k],
      ).length,
    },
  ];

  return (
    <div className="portal-page page-bg">
      <div className="portal-container">
        {/* Header */}
        <div className="portal-header animate-fade-in">
          <div>
            <h1 className="portal-title">
              Hello, {student.name.split(" ")[0]} 👋
            </h1>
            <p className="portal-sub">
              {student.email || student.phone} · Upload your documents below
            </p>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saved ? (
              <>
                <CheckCircle size={14} /> Saved!
              </>
            ) : saving ? (
              "Saving..."
            ) : (
              <>
                <Save size={14} /> Save Progress
              </>
            )}
          </button>
        </div>

        {saveError && <div className="save-error-toast">{saveError}</div>}

        {/* Progress */}
        <ProgressBar
          sections={progressSections}
          currentSection={activeSection}
          onSectionClick={setActiveSection}
        />

        {/* Tab navigation */}
        <div className="portal-tabs">
          {SECTIONS.map((sec, i) => {
            const Icon = sec.icon;
            return (
              <button
                key={sec.id}
                className={`portal-tab ${activeSection === i ? "active" : ""}`}
                onClick={() => setActiveSection(i)}
              >
                <Icon size={15} />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>

        {/* Section content */}
        <div className="portal-content animate-fade-in" key={activeSection}>
          {/* Personal Info */}
          {activeSection === 0 && (
            <PersonalSection info={personalInfo} onChange={updatePersonal} />
          )}

          {/* Applicant Docs */}
          {activeSection === 1 && (
            <DocsSection
              title="Applicant Documents"
              subtitle="Upload all your personal identification and academic documents"
              fields={DOCUMENT_SCHEMA.applicant.fields}
              studentName={student.name}
              subFolder="Applicant"
              uploads={getUploadsFor("applicant")}
              onUploaded={(fieldId, result) =>
                handleUploaded("applicant", fieldId, result)
              }
            />
          )}

          {/* Academics */}
          {activeSection === 2 && (
            <DocsSection
              title="Academic Certificates"
              subtitle="Upload your degree certificates and migration/transfer documents"
              fields={DOCUMENT_SCHEMA.academics.fields}
              studentName={student.name}
              subFolder="Academics"
              uploads={getUploadsFor("academics")}
              onUploaded={(fieldId, result) =>
                handleUploaded("academics", fieldId, result)
              }
            />
          )}

          {/* Loan & Co-Applicants */}
          {activeSection === 3 && (
            <LoanSection
              studentName={student.name}
              coCount={coCount}
              setCoCount={setCoCount}
              uploads={uploads}
              onUploaded={handleUploaded}
              personalInfo={personalInfo}
              onInfoChange={updatePersonal}
            />
          )}

          {/* Visa */}
          {activeSection === 4 && (
            <DocsSection
              title="Visa Related Documents"
              subtitle="Upload your visa application documents (upload as available)"
              fields={DOCUMENT_SCHEMA.visa.fields}
              studentName={student.name}
              subFolder="Visa"
              uploads={getUploadsFor("visa")}
              onUploaded={(fieldId, result) =>
                handleUploaded("visa", fieldId, result)
              }
            />
          )}

          {/* References */}
          {activeSection === 5 && (
            <ReferencesSection info={personalInfo} onChange={updatePersonal} />
          )}

          {/* Guarantor */}
          {activeSection === 6 && (
            <GuarantorSection info={personalInfo} onChange={updatePersonal} />
          )}
        </div>

        {/* Nav buttons */}
        <div className="portal-nav-btns">
          {activeSection > 0 && (
            <button
              className="btn btn-secondary"
              onClick={() => setActiveSection(activeSection - 1)}
            >
              ← Previous
            </button>
          )}
          {activeSection < SECTIONS.length - 1 && (
            <button
              className="btn btn-primary"
              style={{ marginLeft: "auto" }}
              onClick={() => setActiveSection(activeSection + 1)}
            >
              Next Section →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Sub-sections ----
// (All sub-section components remain exactly as in your original file)

function PersonalField({
  label,
  k,
  type = "text",
  placeholder = "",
  info,
  onChange,
}) {
  return (
    <div className="input-group">
      <label>{label}</label>
      <input
        className="input-field"
        type={type}
        placeholder={placeholder}
        value={info[k] || ""}
        onChange={(e) => onChange(k, e.target.value)}
      />
    </div>
  );
}

function PersonalSection({ info, onChange }) {
  return (
    <div className="section-panel">
      <div className="section-intro">
        <h2>Personal Information</h2>
        <p>This information will be used to identify your folder and profile</p>
      </div>
      <div className="grid-2">
        <PersonalField
          label="Full Name"
          k="fullName"
          placeholder="As per passport"
          info={info}
          onChange={onChange}
        />
        <PersonalField
          label="Email Address"
          k="email"
          type="email"
          placeholder="rahul@example.com"
          info={info}
          onChange={onChange}
        />
        <PersonalField
          label="Contact Number"
          k="phone"
          placeholder="+91 98765 43210"
          info={info}
          onChange={onChange}
        />
        <div className="input-group">
          <label>Marital Status</label>
          <select
            className="input-field"
            value={info.marital || ""}
            onChange={(e) => onChange("marital", e.target.value)}
          >
            <option value="">Select</option>
            <option value="Single">Single</option>
            <option value="Married">Married</option>
          </select>
        </div>
        <PersonalField
          label="Loan Amount Required"
          k="loanAmount"
          placeholder="e.g. ₹50,00,000"
          info={info}
          onChange={onChange}
        />
        <div className="input-group">
          <label>10th Percentage</label>
          <input
            className="input-field"
            placeholder="e.g. 85.4"
            value={info.pct10 || ""}
            onChange={(e) => onChange("pct10", e.target.value)}
          />
        </div>
        <div className="input-group">
          <label>12th Percentage</label>
          <input
            className="input-field"
            placeholder="e.g. 82.0"
            value={info.pct12 || ""}
            onChange={(e) => onChange("pct12", e.target.value)}
          />
        </div>
        <div className="input-group">
          <label>Graduation Percentage / CGPA</label>
          <input
            className="input-field"
            placeholder="e.g. 8.2 CGPA"
            value={info.pctGrad || ""}
            onChange={(e) => onChange("pctGrad", e.target.value)}
          />
        </div>
      </div>
      <div className="divider" />
      <h3 className="sub-heading">Address Details</h3>
      <div className="input-group">
        <label>Current Address</label>
        <textarea
          className="input-field"
          rows={2}
          placeholder="Door no, Street, City, State, PIN"
          value={info.currentAddress || ""}
          onChange={(e) => onChange("currentAddress", e.target.value)}
        />
      </div>
      <div className="input-group">
        <label>Permanent Address</label>
        <textarea
          className="input-field"
          rows={2}
          placeholder="Door no, Street, City, State, PIN"
          value={info.permanentAddress || ""}
          onChange={(e) => onChange("permanentAddress", e.target.value)}
        />
      </div>
      <div className="divider" />
      <h3 className="sub-heading">Family Details</h3>
      <div className="grid-2">
        <PersonalField
          label="Maternal Grandmother Name"
          k="maternalGrandma"
          info={info}
          onChange={onChange}
        />
        <PersonalField
          label="Paternal Grandmother Name"
          k="paternalGrandma"
          info={info}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

function DocsSection({
  title,
  subtitle,
  fields,
  studentName,
  subFolder,
  uploads,
  onUploaded,
}) {
  const uploaded = Object.keys(uploads).length;
  const required = fields.filter((f) => !f.optional).length;
  return (
    <div className="section-panel">
      <div className="section-intro">
        <h2>{title}</h2>
        <p>{subtitle}</p>
        <div className="section-stats">
          <span className="badge badge-info">
            {uploaded}/{fields.length} uploaded
          </span>
          <span className="badge badge-warning">{required} required</span>
        </div>
      </div>
      <div className="upload-grid">
        {fields.map((field) => (
          <FileUploadBox
            key={field.id}
            field={field}
            studentName={studentName}
            subFolder={subFolder}
            uploadedFiles={uploads}
            onUploaded={(fieldId, result) => onUploaded(fieldId, result)}
          />
        ))}
      </div>
    </div>
  );
}

function LoanSection({
  studentName,
  coCount,
  setCoCount,
  uploads,
  onUploaded,
  personalInfo,
  onInfoChange,
}) {
  const [expandedCo, setExpandedCo] = useState(0);
  const coLabels = [
    "Financial (e.g. Father)",
    "Non-Financial (e.g. Mother)",
    "Co-Applicant 3",
    "Co-Applicant 4",
    "Co-Applicant 5",
  ];
  const coRelations = ["Father", "Mother", "Sibling", "Spouse", "Other"];

  return (
    <div className="section-panel">
      <div className="section-intro">
        <h2>Loan & Co-Applicants</h2>
        <p>
          Add co-applicants (up to 5) and upload their documents. Select
          employment type to show relevant documents.
        </p>
      </div>
      <div className="input-group" style={{ maxWidth: 220 }}>
        <label>Number of Co-Applicants</label>
        <select
          className="input-field"
          value={coCount}
          onChange={(e) => setCoCount(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      {Array.from({ length: coCount }, (_, i) => {
        const key = `co_${i}`;
        const infoKey = `co_info_${i}`;
        const coInfo = personalInfo[infoKey] || {};
        const empType = coInfo.empType || "salaried";
        const fields =
          CO_APPLICANT_SCHEMA[empType] || CO_APPLICANT_SCHEMA.other;
        const coUploads = uploads[key] || {};
        const isOpen = expandedCo === i;
        return (
          <div key={i} className="co-card">
            <button
              className="co-card-header"
              onClick={() => setExpandedCo(isOpen ? -1 : i)}
            >
              <div className="co-info">
                <span className="co-number">Co-Applicant {i + 1}</span>
                <span className="co-label">{coLabels[i]}</span>
                {coInfo.name && <span className="co-name">{coInfo.name}</span>}
              </div>
              <div className="co-header-right">
                <span className="badge badge-info">
                  {Object.keys(coUploads).length}/{fields.length} files
                </span>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>
            {isOpen && (
              <div className="co-body animate-fade-in">
                <div className="grid-2">
                  <div className="input-group">
                    <label>Full Name</label>
                    <input
                      className="input-field"
                      placeholder="Co-applicant name"
                      value={coInfo.name || ""}
                      onChange={(e) =>
                        onInfoChange(infoKey, {
                          ...coInfo,
                          name: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="input-group">
                    <label>Relation to Student</label>
                    <select
                      className="input-field"
                      value={coInfo.relation || ""}
                      onChange={(e) =>
                        onInfoChange(infoKey, {
                          ...coInfo,
                          relation: e.target.value,
                        })
                      }
                    >
                      <option value="">Select</option>
                      {coRelations.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Mobile Number</label>
                    <input
                      className="input-field"
                      placeholder="+91 98765 43210"
                      value={coInfo.mobile || ""}
                      onChange={(e) =>
                        onInfoChange(infoKey, {
                          ...coInfo,
                          mobile: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="input-group">
                    <label>Email Address</label>
                    <input
                      className="input-field"
                      type="email"
                      placeholder="email@example.com"
                      value={coInfo.email || ""}
                      onChange={(e) =>
                        onInfoChange(infoKey, {
                          ...coInfo,
                          email: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="input-group">
                    <label>Qualifications</label>
                    <input
                      className="input-field"
                      placeholder="e.g. B.Com, MBA"
                      value={coInfo.qualifications || ""}
                      onChange={(e) =>
                        onInfoChange(infoKey, {
                          ...coInfo,
                          qualifications: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="input-group">
                    <label>Number of Dependants</label>
                    <input
                      className="input-field"
                      type="number"
                      placeholder="e.g. 3"
                      value={coInfo.dependants || ""}
                      onChange={(e) =>
                        onInfoChange(infoKey, {
                          ...coInfo,
                          dependants: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="input-group">
                    <label>Years at Current Address</label>
                    <input
                      className="input-field"
                      type="number"
                      placeholder="e.g. 10"
                      value={coInfo.yearsAddress || ""}
                      onChange={(e) =>
                        onInfoChange(infoKey, {
                          ...coInfo,
                          yearsAddress: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="input-group">
                    <label>Employment Type</label>
                    <select
                      className="input-field"
                      value={empType}
                      onChange={(e) =>
                        onInfoChange(infoKey, {
                          ...coInfo,
                          empType: e.target.value,
                        })
                      }
                    >
                      <option value="salaried">Salaried</option>
                      <option value="selfEmployed">
                        Self-Employed / Business
                      </option>
                      <option value="other">Other / Retired</option>
                    </select>
                  </div>
                </div>
                <div className="input-group">
                  <label>Current Address</label>
                  <textarea
                    className="input-field"
                    rows={2}
                    value={coInfo.currentAddress || ""}
                    onChange={(e) =>
                      onInfoChange(infoKey, {
                        ...coInfo,
                        currentAddress: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="input-group">
                  <label>Permanent Address</label>
                  <textarea
                    className="input-field"
                    rows={2}
                    value={coInfo.permanentAddress || ""}
                    onChange={(e) =>
                      onInfoChange(infoKey, {
                        ...coInfo,
                        permanentAddress: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="input-group">
                  <label>Business / Office Address</label>
                  <textarea
                    className="input-field"
                    rows={2}
                    value={coInfo.officeAddress || ""}
                    onChange={(e) =>
                      onInfoChange(infoKey, {
                        ...coInfo,
                        officeAddress: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="divider" />
                <h4 className="sub-heading" style={{ marginBottom: 14 }}>
                  Documents —{" "}
                  {empType === "salaried"
                    ? "Salaried"
                    : empType === "selfEmployed"
                      ? "Self-Employed"
                      : "Basic"}
                </h4>
                <div className="upload-grid">
                  {fields.map((field) => (
                    <FileUploadBox
                      key={field.id}
                      field={{
                        ...field,
                        rename: `Co${i + 1}_${coInfo.name?.replace(/\s+/g, "_") || `Applicant${i + 1}`}_${field.rename}`,
                      }}
                      studentName={studentName}
                      subFolder={`Loan/Co_Applicant_${i + 1}`}
                      uploadedFiles={coUploads}
                      onUploaded={(fieldId, result) =>
                        onUploaded(key, fieldId, result)
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReferencesSection({ info, onChange }) {
  return (
    <div className="section-panel">
      <div className="section-intro">
        <h2>Applicant References</h2>
        <p>Provide details of 2 references who can vouch for the student</p>
      </div>
      {[1, 2].map((n) => (
        <div key={n} className="ref-card">
          <h3 className="sub-heading">Reference {n}</h3>
          <div className="grid-2">
            {[
              ["Name", `ref${n}_name`],
              ["Mobile", `ref${n}_mobile`],
              ["Occupation", `ref${n}_occupation`],
            ].map(([label, k]) => (
              <div key={k} className="input-group">
                <label>{label}</label>
                <input
                  className="input-field"
                  value={info[k] || ""}
                  onChange={(e) => onChange(k, e.target.value)}
                />
              </div>
            ))}
            <div className="input-group" style={{ gridColumn: "1 / -1" }}>
              <label>Address</label>
              <textarea
                className="input-field"
                rows={2}
                value={info[`ref${n}_address`] || ""}
                onChange={(e) => onChange(`ref${n}_address`, e.target.value)}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function GuarantorSection({ info, onChange }) {
  return (
    <div className="section-panel">
      <div className="section-intro">
        <h2>Guarantor / Security Person Details</h2>
        <p>
          Details of the person acting as guarantor or security for the loan
        </p>
      </div>
      <div className="grid-2">
        {[
          ["Full Name", "guar_name"],
          ["Mobile Number", "guar_mobile"],
          ["Email Address", "guar_email"],
          ["Occupation", "guar_occupation"],
          ["Annual Income", "guar_income"],
          ["Relation to Student", "guar_relation"],
        ].map(([label, k]) => (
          <div key={k} className="input-group">
            <label>{label}</label>
            <input
              className="input-field"
              value={info[k] || ""}
              onChange={(e) => onChange(k, e.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="input-group">
        <label>Address</label>
        <textarea
          className="input-field"
          rows={2}
          value={info.guar_address || ""}
          onChange={(e) => onChange("guar_address", e.target.value)}
        />
      </div>
      <div className="info-note">
        <Info size={14} />
        <span>
          The guarantor details are required for loan processing. Please ensure
          accuracy.
        </span>
      </div>
    </div>
  );
}
