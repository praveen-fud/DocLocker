// Portal.jsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Briefcase,
  Users,
  FileText,
  ChevronDown,
  ChevronUp,
  Save,
  CheckCircle,
  Plus,
  Trash2,
  FolderPlus,
  Sparkles,
} from "lucide-react";
import { useStudent } from "../../context/StudentContext";
import { saveStudentMeta } from "../../utils/driveApi";
import { generateAndUploadSummaryPDF } from "../../utils/summaryGenerator";
import { DOCUMENT_SCHEMA, CO_APPLICANT_SCHEMA, getTotalRequiredFields } from "../../context/schemas";
import { extractPersonalAutoFill, extractCoApplicantAutoFill, getDocSourceLabel } from "../../utils/autoFillMap";
import FileUploadBox from "../../components/FileUploadBox/FileUploadBox";
import ProgressBar from "../../components/ProgressBar/ProgressBar";
import "./Portal.css";

const CUR_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CUR_YEAR - 1974 }, (_, i) => CUR_YEAR - i);

const SECTIONS = [
  { id: "govtId",      label: "Govt ID",                    icon: FileText  },
  { id: "academics",   label: "Academics",                  icon: BookOpen  },
  { id: "loan",        label: "Loan & Co-Applicants",       icon: Briefcase },
  { id: "personalRefs",label: "Personal Info & References", icon: Users     },
  { id: "otherDocs",   label: "Other Documents",            icon: FolderPlus},
];

const CIBIL_HINT = (
  <span className="field-hint">
    Don&apos;t know your score?{" "}
    <a
      href="https://www.paisabazaar.com/cibil-credit-report/"
      target="_blank"
      rel="noopener noreferrer"
      className="field-hint-link"
    >
      Check it here
    </a>
  </span>
);

export default function Portal() {
  const { student, setStudent } = useStudent();
  const navigate = useNavigate();
  const [activeSection, setActiveSection]   = useState(0);
  const [uploads, setUploads]               = useState(student?.uploads || {});
  const [personalInfo, setPersonalInfo]     = useState(() => {
    const saved = student?.personalInfo || {};
    return {
      email: student?.email || "",
      phone: student?.phone || "",
      ...saved,
    };
  });
  const [coCount, setCoCount]               = useState(student?.coApplicants || 1);
  const [uploadedDocuments, setUploadedDocuments] = useState(student?.uploadedDocuments || []);
  const [autoFilledFields, setAutoFilledFields]   = useState(student?.autoFilledFields || {});
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [saveError, setSaveError] = useState("");

  const studentIdentifier = student?.email || student?.phone || "";

  const uploadsRef      = useRef(uploads);
  const personalRef     = useRef(personalInfo);
  const coCountRef      = useRef(coCount);
  const docsRef         = useRef(uploadedDocuments);
  const autoFilledRef   = useRef(autoFilledFields);

  useEffect(() => { uploadsRef.current    = uploads;           }, [uploads]);
  useEffect(() => { personalRef.current   = personalInfo;      }, [personalInfo]);
  useEffect(() => { coCountRef.current    = coCount;           }, [coCount]);
  useEffect(() => { docsRef.current       = uploadedDocuments; }, [uploadedDocuments]);
  useEffect(() => { autoFilledRef.current = autoFilledFields;  }, [autoFilledFields]);

  useEffect(() => {
    if (!student) navigate("/");
  }, [student, navigate]);

  if (!student) return null;

  const handleUploaded = (sectionKey, fieldId, result) => {
    const newUploads = {
      ...uploadsRef.current,
      [sectionKey]: {
        ...(uploadsRef.current[sectionKey] || {}),
        [fieldId]: result,
      },
    };
    setUploads(newUploads);

    let newDocs = docsRef.current;
    if (result.parsedData) {
      const key = `${result.parsedData.subFolder}__${result.parsedData.sourceFile}`;
      newDocs = [
        ...docsRef.current.filter((d) => `${d.subFolder}__${d.sourceFile}` !== key),
        result.parsedData,
      ];
      setUploadedDocuments(newDocs);

      const mapped = extractPersonalAutoFill(
        result.parsedData.type,
        result.parsedData.fields || {},
      );

      if (Object.keys(mapped).length > 0) {
        const sourceLabel = getDocSourceLabel(result.parsedData.type);
        setAutoFilledFields((prev) => {
          const updated = { ...prev };
          for (const k of Object.keys(mapped)) {
            if (!updated[k]) updated[k] = sourceLabel;
          }
          return updated;
        });
        setPersonalInfo((prev) => {
          const updated = { ...prev };
          for (const [k, v] of Object.entries(mapped)) {
            if (!prev[k]) updated[k] = String(v);
          }
          return updated;
        });
      }

      // Co-applicant auto-fill (name + address from Aadhar)
      if (sectionKey.startsWith("co_")) {
        const coIdx = parseInt(sectionKey.split("_")[1], 10);
        if (!isNaN(coIdx)) {
          const coAF = extractCoApplicantAutoFill(
            result.parsedData.type,
            result.parsedData.fields || {},
          );
          if (coAF.name || coAF.currentAddress) {
            const infoKey = `co_info_${coIdx}`;
            setPersonalInfo((prev) => {
              const existing = prev[infoKey] || {};
              const patch = { ...existing };
              if (coAF.name && !existing.name)                       patch.name             = coAF.name;
              if (coAF.currentAddress && !existing.currentAddress)   patch.currentAddress   = coAF.currentAddress;
              if (coAF.permanentAddress && !existing.permanentAddress) patch.permanentAddress = coAF.permanentAddress;
              return { ...prev, [infoKey]: patch };
            });
          }
        }
      }
    }

    const updated = {
      ...student,
      uploads: newUploads,
      personalInfo: personalRef.current,
      coApplicants: coCountRef.current,
      uploadedDocuments: newDocs,
      autoFilledFields: autoFilledRef.current,
    };
    setStudent(updated);
    saveStudentMeta(student.name, updated, studentIdentifier);
  };

  const updatePersonal = (key, value) => {
    setAutoFilledFields((prev) => {
      if (!prev[key]) return prev;
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
    setPersonalInfo((prev) => ({ ...prev, [key]: value }));
  };

  const handleCoCountChange = (newCount) => {
    const prev = coCountRef.current;
    setCoCount(newCount);
    if (newCount < prev) {
      setPersonalInfo((pi) => {
        const cleaned = { ...pi };
        for (let i = newCount; i < prev; i++) delete cleaned[`co_info_${i}`];
        return cleaned;
      });
      setUploads((u) => {
        const cleaned = { ...u };
        for (let i = newCount; i < prev; i++) delete cleaned[`co_${i}`];
        return cleaned;
      });
    }
  };

  const handleSave = () => {
    setSaving(true);
    setSaveError("");
    const updated = {
      ...student,
      uploads: uploadsRef.current,
      personalInfo: personalRef.current,
      coApplicants: coCountRef.current,
      uploadedDocuments: docsRef.current,
      autoFilledFields: autoFilledRef.current,
    };
    setStudent(updated);
    saveStudentMeta(student.name, updated, studentIdentifier);
    generateAndUploadSummaryPDF(student.name, updated, studentIdentifier, docsRef.current);
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2500);
  };

  const getUploadsFor = (key) => uploads[key] || {};

  const dynamicTotal = getTotalRequiredFields(coCount, personalInfo);

  const progressSections = [
    {
      id: "govtId",
      label: "Govt ID",
      total: DOCUMENT_SCHEMA.applicant.fields.filter((f) => !f.optional).length,
      uploaded: Object.keys(getUploadsFor("applicant")).length,
    },
    {
      id: "academics",
      label: "Academics",
      total: DOCUMENT_SCHEMA.academics.fields.filter((f) => !f.optional).length,
      uploaded: Object.keys(getUploadsFor("academics")).length,
    },
    {
      id: "loan",
      label: "Loan",
      total: Array.from({ length: coCount }, (_, i) => {
        const coInfo = personalInfo[`co_info_${i}`] || {};
        if (coInfo.financialStatus === "non-financial") return 3;
        const empType = coInfo.empType || "salaried";
        return (CO_APPLICANT_SCHEMA[empType] || CO_APPLICANT_SCHEMA.other).length;
      }).reduce((a, b) => a + b, 0),
      uploaded: Array.from(
        { length: coCount },
        (_, i) => Object.keys(getUploadsFor(`co_${i}`)).length,
      ).reduce((a, b) => a + b, 0),
    },
    {
      id: "personalRefs",
      label: "Personal",
      total: 54,
      uploaded: Object.keys(personalInfo).filter(
        (k) => !k.startsWith("co_info_") && personalInfo[k],
      ).length,
    },
    {
      id: "otherDocs",
      label: "Other Docs",
      total: Object.keys(getUploadsFor("otherDocs")).length,
      uploaded: Object.keys(getUploadsFor("otherDocs")).length,
    },
  ];

  return (
    <div className="portal-page page-bg">
      <div className="portal-container">
        <div className="portal-header animate-fade-in">
          <div>
            <h1 className="portal-title">Hello, {student.name.split(" ")[0]} 👋</h1>
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
              <><CheckCircle size={14} /> Saved!</>
            ) : saving ? (
              "Saving..."
            ) : (
              <><Save size={14} /> Save Progress</>
            )}
          </button>
        </div>

        {saveError && <div className="save-error-toast">{saveError}</div>}

        <div className="portal-progress-info">
          <span className="progress-total-note">
            {Object.values(uploads).reduce((acc, s) => acc + Object.keys(s).length, 0)}{" "}
            / {dynamicTotal} required fields completed
          </span>
        </div>

        <ProgressBar
          sections={progressSections}
          currentSection={activeSection}
          onSectionClick={setActiveSection}
        />

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

        <div className="portal-content animate-fade-in" key={activeSection}>
          {activeSection === 0 && (
            <DocsSection
              title="Government ID Documents"
              subtitle="Upload your identity documents. Aadhar, PAN, and Passport data will auto-fill your personal profile."
              fields={DOCUMENT_SCHEMA.applicant.fields}
              studentName={student.name}
              studentIdentifier={studentIdentifier}
              subFolder="GOVT ID"
              uploads={getUploadsFor("applicant")}
              onUploaded={(fieldId, result) => handleUploaded("applicant", fieldId, result)}
            />
          )}
          {activeSection === 1 && (
            <DocsSection
              title="Academic Certificates"
              subtitle="Upload marksheets and score reports. Scores, years, and test results will be auto-filled in your personal profile."
              fields={DOCUMENT_SCHEMA.academics.fields}
              studentName={student.name}
              studentIdentifier={studentIdentifier}
              subFolder="Academics"
              uploads={getUploadsFor("academics")}
              onUploaded={(fieldId, result) => handleUploaded("academics", fieldId, result)}
            />
          )}
          {activeSection === 2 && (
            <LoanSection
              studentName={student.name}
              studentIdentifier={studentIdentifier}
              coCount={coCount}
              setCoCount={handleCoCountChange}
              uploads={uploads}
              onUploaded={handleUploaded}
              personalInfo={personalInfo}
              onInfoChange={updatePersonal}
            />
          )}
          {activeSection === 3 && (
            <PersonalAndRefsSection
              info={personalInfo}
              onChange={updatePersonal}
              autoFilledFields={autoFilledFields}
            />
          )}
          {activeSection === 4 && (
            <OtherDocumentsSection
              studentName={student.name}
              studentIdentifier={studentIdentifier}
              uploads={getUploadsFor("otherDocs")}
              onUploaded={(fieldId, result) => handleUploaded("otherDocs", fieldId, result)}
              onRemoved={(fieldId) => {
                const updated = { ...uploadsRef.current };
                if (updated.otherDocs) {
                  const section = { ...updated.otherDocs };
                  delete section[fieldId];
                  updated.otherDocs = section;
                }
                setUploads(updated);
                const updatedStudent = {
                  ...student,
                  uploads: updated,
                  personalInfo: personalRef.current,
                  coApplicants: coCountRef.current,
                };
                setStudent(updatedStudent);
                saveStudentMeta(student.name, updatedStudent, studentIdentifier);
              }}
            />
          )}
        </div>

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

// ─── Field Helpers ─────────────────────────────────────────────────────────────

function PersonalField({
  label,
  k,
  type = "text",
  placeholder = "",
  info,
  onChange,
  hint,
  numericOnly = false,
  integerOnly = false,
  maxVal,
  autoFilledFields = {},
}) {
  const handleChange = (e) => {
    let val = e.target.value;
    if (integerOnly) {
      val = val.replace(/[^0-9]/g, "");
    } else if (numericOnly) {
      val = val.replace(/[^0-9.]/g, "");
      const parts = val.split(".");
      if (parts.length > 2) val = parts[0] + "." + parts.slice(1).join("");
    }
    if (maxVal !== undefined && val !== "" && !isNaN(parseFloat(val)) && parseFloat(val) > maxVal) {
      val = String(maxVal);
    }
    onChange(k, val);
  };

  const source = autoFilledFields[k];

  return (
    <div className={`input-group${source ? " autofill-group" : ""}`}>
      <label>
        {label}
        {source && (
          <span className="autofill-badge">
            <Sparkles size={10} /> From {source}
          </span>
        )}
      </label>
      <input
        className={`input-field${source ? " autofill-input" : ""}`}
        type={type}
        inputMode={integerOnly ? "numeric" : numericOnly ? "decimal" : undefined}
        placeholder={placeholder}
        value={info[k] || ""}
        onChange={handleChange}
      />
      {hint && hint}
    </div>
  );
}

function YearSelect({ label, k, info, onChange, placeholder = "Select Year", autoFilledFields = {} }) {
  const source = autoFilledFields[k];
  return (
    <div className={`input-group${source ? " autofill-group" : ""}`}>
      {label && (
        <label>
          {label}
          {source && (
            <span className="autofill-badge">
              <Sparkles size={10} /> From {source}
            </span>
          )}
        </label>
      )}
      <select
        className={`input-field${source ? " autofill-input" : ""}`}
        value={info[k] || ""}
        onChange={(e) => onChange(k, e.target.value)}
      >
        <option value="">{placeholder}</option>
        {YEARS.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Personal Info + References (combined section) ─────────────────────────────

function PersonalAndRefsSection({ info, onChange, autoFilledFields }) {
  const [subStep, setSubStep] = useState(1);
  const af = autoFilledFields || {};
  const afCount = Object.keys(af).length;

  const STEP_LABELS = ["Page 1", "Page 2", "Page 3", "Page 4", "References"];

  return (
    <div className="section-panel">
      <div className="section-intro">
        <h2>Personal Profile &amp; References</h2>
        <p>
          Fill in your details across the pages below.
          {afCount > 0
            ? " Fields highlighted in green were auto-filled from your uploaded documents — verify and update as needed."
            : " Upload documents in earlier sections to auto-fill fields here."}
        </p>
        {afCount > 0 && (
          <div className="autofill-summary">
            <Sparkles size={13} />
            <span>{afCount} field{afCount !== 1 ? "s" : ""} auto-filled from uploaded documents</span>
          </div>
        )}
      </div>

      <div className="sub-step-navigator" style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {STEP_LABELS.map((lbl, idx) => {
          const stepNum = idx + 1;
          return (
            <button
              key={stepNum}
              type="button"
              className={`btn btn-sm ${subStep === stepNum ? "btn-primary" : "btn-secondary"}`}
              style={{ flex: 1 }}
              onClick={() => setSubStep(stepNum)}
            >
              {lbl}
            </button>
          );
        })}
      </div>

      {/* ── Page 1: Identity & Academic Parameters ── */}
      {subStep === 1 && (
        <div className="animate-fade-in">
          <h3 className="sub-heading">Identity &amp; Academic Parameters</h3>
          <div className="grid-2">
            <PersonalField label="Student Full Name" k="fullName" placeholder="As per passport" info={info} onChange={onChange} autoFilledFields={af} />
            <PersonalField label="Mobile &amp; WhatsApp Number" k="phone" placeholder="+91 XXXXX XXXXX" info={info} onChange={onChange} />
            <PersonalField label="Email Identity Address" k="email" type="email" placeholder="name@example.com" info={info} onChange={onChange} />
            <PersonalField label="Required Loan Amount (₹)" k="loanAmount" placeholder="e.g. 5000000" info={info} onChange={onChange} integerOnly />
            <PersonalField label="Student CIBIL Score" k="studentCibil" placeholder="300 – 900" info={info} onChange={onChange} integerOnly maxVal={900} hint={CIBIL_HINT} autoFilledFields={af} />

            <div className={`input-group${af.marital ? " autofill-group" : ""}`}>
              <label>Marital Status</label>
              <select className="input-field" value={info.marital || ""} onChange={(e) => onChange("marital", e.target.value)}>
                <option value="">Select</option>
                <option value="Single">Single</option>
                <option value="Married">Married</option>
              </select>
            </div>

            <PersonalField label="Highest Qualification (e.g. B.Tech, MCA)" k="qualName" placeholder="e.g. B.Tech, MCA, MBA" info={info} onChange={onChange} autoFilledFields={af} />
            <YearSelect label="Qualification Passed Out Year" k="qualYear" info={info} onChange={onChange} autoFilledFields={af} />
            <PersonalField label="10th Percentage (%)" k="pct10Score" placeholder="e.g. 85.4" info={info} onChange={onChange} numericOnly maxVal={100} autoFilledFields={af} />
            <YearSelect label="10th Passed Out Year" k="pct10Year" info={info} onChange={onChange} autoFilledFields={af} />
            <PersonalField label="Inter / 12th Percentage (%)" k="pct12Score" placeholder="e.g. 82.0" info={info} onChange={onChange} numericOnly maxVal={100} autoFilledFields={af} />
            <YearSelect label="12th Passed Out Year" k="pct12Year" info={info} onChange={onChange} autoFilledFields={af} />

            <div className={`input-group${af.pctGradType ? " autofill-group" : ""}`}>
              <label>
                Graduation Score Type
                {af.pctGradType && <span className="autofill-badge"><Sparkles size={10} /> From {af.pctGradType}</span>}
              </label>
              <select
                className={`input-field${af.pctGradType ? " autofill-input" : ""}`}
                value={info.pctGradType || "percentage"}
                onChange={(e) => onChange("pctGradType", e.target.value)}
              >
                <option value="percentage">Percentage (%)</option>
                <option value="cgpa">CGPA (0 – 10)</option>
              </select>
            </div>

            <PersonalField
              label={info.pctGradType === "cgpa" ? "Graduation CGPA" : "Graduation Percentage (%)"}
              k="pctGradScore"
              placeholder={info.pctGradType === "cgpa" ? "e.g. 8.2" : "e.g. 74.5"}
              info={info}
              onChange={onChange}
              numericOnly
              maxVal={info.pctGradType === "cgpa" ? 10 : 100}
              autoFilledFields={af}
            />
            <YearSelect label="Graduation Passed Out Year" k="pctGradYear" info={info} onChange={onChange} autoFilledFields={af} />

            <div className="input-group">
              <label>Any Active/Past Backlogs?</label>
              <select className="input-field" value={info.hasBacklogs || ""} onChange={(e) => onChange("hasBacklogs", e.target.value)}>
                <option value="">Select</option>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            {info.hasBacklogs === "Yes" && (
              <PersonalField label="Number of Backlogs" k="backlogCount" placeholder="e.g. 2" info={info} onChange={onChange} integerOnly maxVal={50} />
            )}
          </div>

          <div className="divider" />
          <h3 className="sub-heading">Standardized Test Metrics</h3>
          <div className="grid-2">
            <PersonalField label="GRE Score (260 – 340)" k="greScore" placeholder="e.g. 312" info={info} onChange={onChange} integerOnly maxVal={340} autoFilledFields={af} />
            <PersonalField label="IELTS Score (0 – 9)" k="ieltsScore" placeholder="e.g. 7.0" info={info} onChange={onChange} numericOnly maxVal={9} autoFilledFields={af} />
            <PersonalField label="Duolingo Score (10 – 160)" k="duolingoScore" placeholder="e.g. 120" info={info} onChange={onChange} integerOnly maxVal={160} autoFilledFields={af} />
            <PersonalField label="TOEFL Score (0 – 120)" k="toeflScore" placeholder="e.g. 98" info={info} onChange={onChange} integerOnly maxVal={120} autoFilledFields={af} />
          </div>
        </div>
      )}

      {/* ── Page 2: Destination & Application Context ── */}
      {subStep === 2 && (
        <div className="animate-fade-in">
          <h3 className="sub-heading">Destination &amp; Application Context</h3>
          <div className="grid-2">
            <div className="input-group">
              <label>Loan Application Track For</label>
              <select className="input-field" value={info.loanTrack || ""} onChange={(e) => onChange("loanTrack", e.target.value)}>
                <option value="">Select Option</option>
                <option value="MS">Master of Science (MS)</option>
                <option value="Under Graduation">Under Graduation (UG)</option>
              </select>
            </div>

            <PersonalField label="Traveling Country &amp; University" k="targetUniversity" placeholder="e.g. USA - UT Dallas" info={info} onChange={onChange} autoFilledFields={af} />
            <PersonalField label="Course Name &amp; University" k="courseNameUniversity" placeholder="e.g. Computer Science - UTD" info={info} onChange={onChange} autoFilledFields={af} />

            <div className={`input-group${af.i20Received ? " autofill-group" : ""}`}>
              <label>
                I20 Document Received?
                {af.i20Received && <span className="autofill-badge"><Sparkles size={10} /> From {af.i20Received}</span>}
              </label>
              <select
                className={`input-field${af.i20Received ? " autofill-input" : ""}`}
                value={info.i20Received || ""}
                onChange={(e) => onChange("i20Received", e.target.value)}
              >
                <option value="">Select Option</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>

            <div className={`input-group${af.visaBooked ? " autofill-group" : ""}`}>
              <label>
                Visa Slot Booked Or Not?
                {af.visaBooked && <span className="autofill-badge"><Sparkles size={10} /> From {af.visaBooked}</span>}
              </label>
              <select
                className={`input-field${af.visaBooked ? " autofill-input" : ""}`}
                value={info.visaBooked || ""}
                onChange={(e) => onChange("visaBooked", e.target.value)}
              >
                <option value="">Select Status</option>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            {info.visaBooked === "Yes" && (
              <PersonalField label="Visa Slot Booked Date" k="visaSlotDate" type="date" info={info} onChange={onChange} autoFilledFields={af} />
            )}
          </div>

          <div className="divider" />
          <h3 className="sub-heading">Residential Tracking Matrices</h3>
          <div className={`input-group${af.currentAddress ? " autofill-group" : ""}`}>
            <label>
              Present Address (With Landmark)
              {af.currentAddress && <span className="autofill-badge"><Sparkles size={10} /> From {af.currentAddress}</span>}
            </label>
            <textarea
              className={`input-field${af.currentAddress ? " autofill-input" : ""}`}
              rows={2}
              placeholder="Door no, Street, Landmark, PIN Code"
              value={info.currentAddress || ""}
              onChange={(e) => onChange("currentAddress", e.target.value)}
            />
          </div>
          <div className={`input-group${af.permanentAddress ? " autofill-group" : ""}`}>
            <label>
              Permanent Address (With Landmark)
              {af.permanentAddress && <span className="autofill-badge"><Sparkles size={10} /> From {af.permanentAddress}</span>}
            </label>
            <textarea
              className={`input-field${af.permanentAddress ? " autofill-input" : ""}`}
              rows={2}
              placeholder="Same as above or structural fallback layout"
              value={info.permanentAddress || ""}
              onChange={(e) => onChange("permanentAddress", e.target.value)}
            />
          </div>
        </div>
      )}

      {/* ── Page 3: Paternal & Maternal Baselines ── */}
      {subStep === 3 && (
        <div className="animate-fade-in">
          <h3 className="sub-heading">Paternal &amp; Maternal Baselines</h3>
          <div className="grid-2">
            <PersonalField label="Father Name" k="fatherName" info={info} onChange={onChange} autoFilledFields={af} />
            <PersonalField label="Father Mobile No. &amp; Mail Id" k="fatherContact" placeholder="Phone / Email info" info={info} onChange={onChange} />
            <PersonalField label="Father CIBIL Score (300 – 900)" k="fatherCibil" placeholder="e.g. 780" info={info} onChange={onChange} integerOnly maxVal={900} hint={CIBIL_HINT} />
            <PersonalField label="Mother Name" k="motherName" info={info} onChange={onChange} />
            <PersonalField label="Mother Mobile No. &amp; Mail Id" k="motherContact" info={info} onChange={onChange} />
            <PersonalField label="Mother CIBIL Score (300 – 900)" k="motherCibil" placeholder="e.g. 760" info={info} onChange={onChange} integerOnly maxVal={900} hint={CIBIL_HINT} />
          </div>

          <div className="divider" />
          <h3 className="sub-heading">Financial Guarantor Setup</h3>
          <div className="grid-2">
            <PersonalField label="Financial Guarantee Name" k="guarantorName" info={info} onChange={onChange} />
            <PersonalField label="Financial Guarantee Relationship" k="guarantorRelation" placeholder="e.g. Uncle" info={info} onChange={onChange} />
            <PersonalField label="Financial Guarantee Mobile No." k="guarantorMobile" info={info} onChange={onChange} />
            <PersonalField label="Financial Guarantee CIBIL Score (300 – 900)" k="guarantorCibil" placeholder="e.g. 800" info={info} onChange={onChange} integerOnly maxVal={900} hint={CIBIL_HINT} />
            <PersonalField label="Financial Guarantee Sector (Job / Business)" k="guarantorSector" placeholder="e.g. Software Business" info={info} onChange={onChange} />

            <div className="input-group">
              <label>Income Documents Available?</label>
              <select className="input-field" value={info.guarantorDocsAvailable || ""} onChange={(e) => onChange("guarantorDocsAvailable", e.target.value)}>
                <option value="">Select Option</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
          </div>

          <div className="divider" />
          <h3 className="sub-heading">Extended Lineage References</h3>
          <div className="grid-2">
            <PersonalField label="Maternal Grandmother Name" k="maternalGrandma" info={info} onChange={onChange} />
            <PersonalField label="Paternal Grandmother Name" k="paternalGrandma" info={info} onChange={onChange} />
          </div>
        </div>
      )}

      {/* ── Page 4: Prior History & Assets ── */}
      {subStep === 4 && (
        <div className="animate-fade-in">
          <h3 className="sub-heading">Prior History &amp; Assets</h3>
          <div className="grid-2">
            <div className="input-group">
              <label>Applied Any Bank Before?</label>
              <select className="input-field" value={info.priorBankApplied || ""} onChange={(e) => onChange("priorBankApplied", e.target.value)}>
                <option value="">Select Option</option>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            {info.priorBankApplied === "Yes" && (
              <div className="input-group">
                <label>Which Bank Was Applied?</label>
                <select className="input-field" value={info.priorBankName || ""} onChange={(e) => onChange("priorBankName", e.target.value)}>
                  <option value="">Select Bank</option>
                  <option value="HDFC Bank">HDFC Bank</option>
                  <option value="HDFC Credila Financial Services">HDFC Credila Financial Services</option>
                  <option value="Avanse Financial Services">Avanse Financial Services</option>
                  <option value="Auxilo Finserve">Auxilo Finserve</option>
                  <option value="InCred Finance">InCred Finance</option>
                  <option value="Tata Capital">Tata Capital</option>
                  <option value="Poonawalla Fincorp">Poonawalla Fincorp</option>
                  <option value="IDFC FIRST Bank">IDFC FIRST Bank</option>
                  <option value="ICICI Bank">ICICI Bank</option>
                  <option value="Axis Bank">Axis Bank</option>
                  <option value="YES Bank">YES Bank</option>
                  <option value="Others">Others</option>
                </select>
              </div>
            )}
            {info.priorBankApplied === "Yes" && info.priorBankName === "Others" && (
              <PersonalField label="Enter Bank Name" k="priorBankNameCustom" placeholder="Type bank name here" info={info} onChange={onChange} />
            )}

            <div className="input-group">
              <label>Family Own House Available Or Not?</label>
              <select className="input-field" value={info.ownHouseStatus || ""} onChange={(e) => onChange("ownHouseStatus", e.target.value)}>
                <option value="">Select Status</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
          </div>

          <div className="divider" />
          <h3 className="sub-heading">Applicant Professional Status</h3>
          <div className="grid-2">
            <div className="input-group">
              <label>If Any Job Details (Yes/No)</label>
              <select className="input-field" value={info.hasJobDetails || ""} onChange={(e) => onChange("hasJobDetails", e.target.value)}>
                <option value="">Select</option>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            {info.hasJobDetails === "Yes" && (
              <PersonalField label="Salary per Month &amp; Total Experience" k="jobSpecs" placeholder="e.g. ₹45,000 - 2 Years" info={info} onChange={onChange} />
            )}
          </div>

          <div className="divider" />
          <h3 className="sub-heading">Overseas Consultants Reference Mapping</h3>
          <div className="grid-2">
            <PersonalField label="Overseas Consultants Name, Location" k="consultantNameLoc" placeholder="Name and city branch" info={info} onChange={onChange} />
            <PersonalField label="Consultant Phone No. &amp; Mail ID" k="consultantContact" placeholder="Contact details string" info={info} onChange={onChange} />
          </div>
        </div>
      )}

      {/* ── Page 5: References ── */}
      {subStep === 5 && <ReferencesContent info={info} onChange={onChange} />}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
        <button type="button" className="btn btn-secondary" disabled={subStep === 1} onClick={() => setSubStep((p) => p - 1)}>
          ← Prev Page
        </button>
        <button type="button" className="btn btn-secondary" disabled={subStep === 5} onClick={() => setSubStep((p) => p + 1)}>
          Next Page →
        </button>
      </div>
    </div>
  );
}

// ─── References sub-content ────────────────────────────────────────────────────

function ReferencesContent({ info, onChange }) {
  const REFERENCE_RELATIONS = [
    "Uncle", "Aunt", "Family Friend", "Neighbor",
    "Colleague", "Professor / Teacher", "Cousin", "Other",
  ];

  return (
    <div className="animate-fade-in">
      <h3 className="sub-heading">Applicant References</h3>
      <p style={{ fontSize: 13, color: "var(--gray-400)", marginBottom: 16 }}>
        Provide details of 2 references who can vouch for the student
      </p>
      {[1, 2].map((n) => {
        const relationKey       = `ref${n}_relation`;
        const customRelationKey = `ref${n}_custom_relation`;
        const currentRelation   = info[relationKey] || "";

        return (
          <div key={n} className="ref-card">
            <h3 className="sub-heading">Reference {n}</h3>
            <div className="grid-2">
              <div className="input-group">
                <label>Name</label>
                <input className="input-field" value={info[`ref${n}_name`] || ""} onChange={(e) => onChange(`ref${n}_name`, e.target.value)} />
              </div>
              <div className="input-group">
                <label>Mobile</label>
                <input className="input-field" value={info[`ref${n}_mobile`] || ""} onChange={(e) => onChange(`ref${n}_mobile`, e.target.value)} />
              </div>
              <div className="input-group">
                <label>Occupation</label>
                <input className="input-field" value={info[`ref${n}_occupation`] || ""} onChange={(e) => onChange(`ref${n}_occupation`, e.target.value)} />
              </div>
              <div className="input-group">
                <label>Relation to Student</label>
                <select
                  className="input-field"
                  value={currentRelation}
                  onChange={(e) => {
                    onChange(relationKey, e.target.value);
                    if (e.target.value !== "Other") onChange(customRelationKey, "");
                  }}
                >
                  <option value="">Select Relation</option>
                  {REFERENCE_RELATIONS.map((rel) => (
                    <option key={rel} value={rel}>{rel}</option>
                  ))}
                </select>
              </div>
              {currentRelation === "Other" && (
                <div className="input-group" style={{ gridColumn: "1 / -1" }}>
                  <label>Specify Custom Relation</label>
                  <input
                    className="input-field animate-fade-in"
                    placeholder="e.g. Mother's Distant Cousin"
                    value={info[customRelationKey] || ""}
                    onChange={(e) => onChange(customRelationKey, e.target.value)}
                  />
                </div>
              )}
              <div className="input-group" style={{ gridColumn: "1 / -1" }}>
                <label>Address</label>
                <textarea className="input-field" rows={2} value={info[`ref${n}_address`] || ""} onChange={(e) => onChange(`ref${n}_address`, e.target.value)} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Docs Section ──────────────────────────────────────────────────────────────

function DocsSection({ title, subtitle, fields, studentName, studentIdentifier, subFolder, uploads, onUploaded }) {
  const uploaded = Object.keys(uploads).length;
  return (
    <div className="section-panel">
      <div className="section-intro">
        <h2>{title}</h2>
        <p>{subtitle}</p>
        <div className="section-stats">
          <span className="badge badge-info">{uploaded}/{fields.length} uploaded</span>
        </div>
      </div>
      <div className="upload-grid">
        {fields.map((field) => (
          <FileUploadBox
            key={field.id}
            field={field}
            studentName={studentName}
            studentIdentifier={studentIdentifier}
            subFolder={subFolder}
            uploadedFiles={uploads}
            onUploaded={(fieldId, result) => onUploaded(fieldId, result)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Loan Section ──────────────────────────────────────────────────────────────

function LoanSection({ studentName, studentIdentifier, coCount, setCoCount, uploads, onUploaded, personalInfo, onInfoChange }) {
  const [expandedCo, setExpandedCo] = useState(0);
  const coRelations = ["Father", "Mother", "Sibling", "Spouse", "Other"];

  return (
    <div className="section-panel">
      <div className="section-intro">
        <h2>Loan &amp; Co-Applicants</h2>
        <p>Select the number of co-applicants, set their type, upload documents, then fill in their details below.</p>
      </div>

      <div className="input-group" style={{ maxWidth: 220 }}>
        <label>Number of Co-Applicants</label>
        <select
          className="input-field"
          value={coCount}
          onChange={(e) => setCoCount(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      {Array.from({ length: coCount }, (_, i) => {
        const key      = `co_${i}`;
        const infoKey  = `co_info_${i}`;
        const coInfo   = personalInfo[infoKey] || {};
        const empType         = coInfo.empType || "salaried";
        const financialStatus = coInfo.financialStatus || "financial";
        const isOpen   = expandedCo === i;

        let fields;
        if (financialStatus === "non-financial") {
          fields = CO_APPLICANT_SCHEMA.other.filter((f) => ["aadhar", "pan", "photo"].includes(f.id));
        } else {
          fields = CO_APPLICANT_SCHEMA[empType] || CO_APPLICANT_SCHEMA.other;
        }

        const coUploads = uploads[key] || {};

        return (
          <div key={i} className="co-card">
            <button
              className="co-card-header"
              type="button"
              onClick={() => setExpandedCo(isOpen ? -1 : i)}
            >
              <div className="co-info">
                <span className="co-number">Co-Applicant {i + 1}</span>
                <span className="co-label">
                  ({financialStatus === "financial" ? "Financial" : "Non-Financial"})
                </span>
                {coInfo.name && <span className="co-name">{coInfo.name}</span>}
              </div>
              <div className="co-header-right">
                <span className="badge badge-info">{Object.keys(coUploads).length}/{fields.length} files</span>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            {isOpen && (
              <div className="co-body animate-fade-in">

                {/* ── Step A: Applicant type ── */}
                <div className="grid-2" style={{ marginBottom: 16 }}>
                  <div className="input-group">
                    <label>Applicant Responsibility</label>
                    <select
                      className="input-field"
                      value={financialStatus}
                      onChange={(e) => onInfoChange(infoKey, { ...coInfo, financialStatus: e.target.value })}
                    >
                      <option value="financial">Financial Applicant</option>
                      <option value="non-financial">Non-Financial Applicant</option>
                    </select>
                  </div>

                  {financialStatus !== "non-financial" && (
                    <div className="input-group">
                      <label>Employment Type</label>
                      <select
                        className="input-field"
                        value={empType}
                        onChange={(e) => onInfoChange(infoKey, { ...coInfo, empType: e.target.value })}
                      >
                        <option value="salaried">Salaried</option>
                        <option value="selfEmployed">Self-Employed / Business</option>
                        <option value="other">Other / Retired</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* ── Step B: Documents ── */}
                <h4 className="sub-heading" style={{ marginBottom: 12 }}>
                  Documents —{" "}
                  {financialStatus === "non-financial"
                    ? "Non-Financial (Aadhar, PAN, Photo)"
                    : `${empType === "salaried" ? "Salaried" : empType === "selfEmployed" ? "Self-Employed" : "Basic"} Financial`}
                </h4>
                <div className="upload-grid" style={{ marginBottom: 20 }}>
                  {fields.map((field) => {
                    const statusSlug = financialStatus === "financial" ? "Financial" : "NonFinancial";
                    return (
                      <FileUploadBox
                        key={field.id}
                        field={{
                          ...field,
                          rename: `Co${i + 1}_${coInfo.name?.replace(/\s+/g, "_") || `Applicant${i + 1}`}_${statusSlug}_${field.rename}`,
                        }}
                        studentName={studentName}
                        studentIdentifier={studentIdentifier}
                        subFolder={`Loan/Co_Applicant_${i + 1}`}
                        uploadedFiles={coUploads}
                        onUploaded={(fieldId, result) => onUploaded(key, fieldId, result)}
                      />
                    );
                  })}
                </div>

                {/* ── Step C: Input fields ── */}
                <h4 className="sub-heading" style={{ marginBottom: 12 }}>Co-Applicant Details</h4>
                <div className="grid-2">
                  <div className="input-group">
                    <label>Full Name</label>
                    <input
                      className="input-field"
                      placeholder="Co-applicant name"
                      value={coInfo.name || ""}
                      onChange={(e) => onInfoChange(infoKey, { ...coInfo, name: e.target.value })}
                    />
                  </div>
                  <div className="input-group">
                    <label>Relation to Student</label>
                    <select
                      className="input-field"
                      value={coInfo.relation || ""}
                      onChange={(e) => onInfoChange(infoKey, { ...coInfo, relation: e.target.value })}
                    >
                      <option value="">Select</option>
                      {coRelations.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Mobile Number</label>
                    <input
                      className="input-field"
                      inputMode="numeric"
                      placeholder="10-digit mobile number"
                      value={coInfo.mobile || ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 10);
                        onInfoChange(infoKey, { ...coInfo, mobile: val });
                      }}
                    />
                  </div>
                  <div className="input-group">
                    <label>Email Address</label>
                    <input
                      className="input-field"
                      type="email"
                      placeholder="email@example.com"
                      value={coInfo.email || ""}
                      onChange={(e) => onInfoChange(infoKey, { ...coInfo, email: e.target.value })}
                    />
                  </div>
                  <div className="input-group">
                    <label>Qualifications</label>
                    <input
                      className="input-field"
                      placeholder="e.g. B.Com, MBA"
                      value={coInfo.qualifications || ""}
                      onChange={(e) => onInfoChange(infoKey, { ...coInfo, qualifications: e.target.value })}
                    />
                  </div>
                  <div className="input-group">
                    <label>Number of Dependants</label>
                    <input
                      className="input-field"
                      inputMode="numeric"
                      placeholder="e.g. 3"
                      value={coInfo.dependants || ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "");
                        onInfoChange(infoKey, { ...coInfo, dependants: val });
                      }}
                    />
                  </div>
                  <div className="input-group">
                    <label>Years at Current Address</label>
                    <input
                      className="input-field"
                      inputMode="numeric"
                      placeholder="e.g. 10"
                      value={coInfo.yearsAddress || ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "");
                        onInfoChange(infoKey, { ...coInfo, yearsAddress: val });
                      }}
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label>Current Address</label>
                  <textarea className="input-field" rows={2} value={coInfo.currentAddress || ""} onChange={(e) => onInfoChange(infoKey, { ...coInfo, currentAddress: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>Permanent Address</label>
                  <textarea className="input-field" rows={2} value={coInfo.permanentAddress || ""} onChange={(e) => onInfoChange(infoKey, { ...coInfo, permanentAddress: e.target.value })} />
                </div>
                {financialStatus !== "non-financial" && (
                  <div className="input-group">
                    <label>Business / Office Address</label>
                    <textarea className="input-field" rows={2} value={coInfo.officeAddress || ""} onChange={(e) => onInfoChange(infoKey, { ...coInfo, officeAddress: e.target.value })} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Other Documents Section ───────────────────────────────────────────────────

function OtherDocumentsSection({ studentName, studentIdentifier, uploads, onUploaded, onRemoved }) {
  const [items, setItems] = useState(() => {
    const existingIds = Object.keys(uploads);
    if (existingIds.length === 0) return [];
    return existingIds.map((id) => ({ id, fileName: uploads[id]?.customName || "" }));
  });

  const addNewItem = () => {
    const newId = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    setItems((prev) => [...prev, { id: newId, fileName: "" }]);
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (onRemoved) onRemoved(id);
  };

  const updateFileName = (id, newName) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, fileName: newName } : item)));
  };

  const getFieldForItem = (item) => ({
    id: item.id,
    label: item.fileName ? `Document: ${item.fileName}` : "New Document (enter name above)",
    rename: item.fileName ? item.fileName.replace(/\s+/g, "_") : "custom_document",
    accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    optional: false,
  });

  return (
    <div className="section-panel">
      <div className="section-intro">
        <h2>Other Documents</h2>
        <p>Add any extra documents — each with a custom name.</p>
      </div>
      <div className="other-docs-list">
        {items.map((item) => (
          <div key={item.id} className="custom-doc-card" style={{ marginBottom: 24, padding: 16, border: "1px solid #e2e8f0", borderRadius: 12 }}>
            <div className="custom-doc-header" style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 12 }}>
              <div className="input-group" style={{ flex: 1 }}>
                <label>Document name (without extension)</label>
                <input
                  className="input-field"
                  placeholder="e.g. Scholarship_Letter"
                  value={item.fileName}
                  onChange={(e) => updateFileName(item.id, e.target.value)}
                />
              </div>
              <button className="icon-btn del-btn" type="button" onClick={() => removeItem(item.id)} title="Remove this document">
                <Trash2 size={16} />
              </button>
            </div>
            <FileUploadBox
              field={getFieldForItem(item)}
              studentName={studentName}
              studentIdentifier={studentIdentifier}
              subFolder="Other_Documents"
              uploadedFiles={uploads}
              onUploaded={(fieldId, result) => {
                if (result) result.customName = item.fileName;
                onUploaded(fieldId, result);
              }}
            />
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" type="button" onClick={addNewItem} style={{ marginTop: 8 }}>
          <Plus size={14} /> Add another document
        </button>
      </div>
    </div>
  );
}
