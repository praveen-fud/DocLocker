import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
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
} from "lucide-react";
import { useStudent } from "../../context/StudentContext";
import { saveStudentMeta } from "../../utils/driveApi";
import { DOCUMENT_SCHEMA, getTotalRequiredFields } from "../../context/schemas";
import FileUploadBox from "../../components/FileUploadBox/FileUploadBox";
import ProgressBar from "../../components/ProgressBar/ProgressBar";
import "./Portal.css";

const SECTIONS = [
  { id: "personal", label: "Personal Info", icon: User },
  { id: "student", label: "Student Documents", icon: FileText },
  { id: "academics", label: "Academics", icon: BookOpen },
  { id: "loan", label: "Loan & Co-Applicants", icon: Briefcase },
  { id: "references", label: "References", icon: Users },
  { id: "otherDocs", label: "Other Documents", icon: FolderPlus },
];

const LOCAL_CO_APPLICANT_SCHEMA = {
  salaried: [
    {
      id: "aadhar",
      label: "Aadhar Card",
      rename: "Aadhar",
      accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    },
    {
      id: "pan",
      label: "PAN Card",
      rename: "PAN",
      accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    },
    {
      id: "photo",
      label: "Passport Size Photo",
      rename: "Photo",
      accept: ".jpg,.jpeg,.png,.doc,.docx,.pdf",
    },
    {
      id: "salary_slip_3m",
      label: "Last 3 Month Salary Slip",
      rename: "Salary_Slip_3Months",
      accept: ".pdf,.zip,.jpg,.jpeg,.png,.doc,.docx",
    },
    {
      id: "bank_stmt_6m",
      label: "Last 6 Month Bank Statement (salary a/c)",
      rename: "Bank_Statement_6Months",
      accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    },
    {
      id: "form16_itr_y1",
      label: "Form 16 / ITR - Year 1 (Latest)",
      rename: "Form16_ITR_Year1",
      accept: ".pdf,.doc,.docx",
    },
    {
      id: "form16_itr_y2",
      label: "Form 16 / ITR - Year 2",
      rename: "Form16_ITR_Year2",
      accept: ".pdf,.doc,.docx",
    },
    {
      id: "form16_itr_y3",
      label: "Form 16 / ITR - Year 3",
      rename: "Form16_ITR_Year3",
      accept: ".pdf,.doc,.docx",
    },
  ],
  selfEmployed: [
    {
      id: "aadhar",
      label: "Aadhar Card",
      rename: "Aadhar",
      accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    },
    {
      id: "pan",
      label: "PAN Card",
      rename: "PAN",
      accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    },
    {
      id: "photo",
      label: "Passport Size Photo",
      rename: "Photo",
      accept: ".jpg,.jpeg,.png,.doc,.docx,.pdf",
    },
    {
      id: "bank_stmt_6m",
      label: "Last 6 Month Bank Statement",
      rename: "Bank_Statement_6Months",
      accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    },
    {
      id: "itr_y1",
      label: "ITR Acknowledgement - Year 1 (Latest)",
      rename: "ITR_Year1",
      accept: ".pdf,.doc,.docx,.jpg,.jpeg,.png",
    },
    {
      id: "itr_y2",
      label: "ITR Acknowledgement - Year 2",
      rename: "ITR_Year2",
      accept: ".pdf,.doc,.docx,.jpg,.jpeg,.png",
    },
    {
      id: "itr_y3",
      label: "ITR Acknowledgement - Year 3",
      rename: "ITR_Year3",
      accept: ".pdf,.doc,.docx,.jpg,.jpeg,.png",
    },
    {
      id: "business_proof",
      label: "Business Proof / GST Certificate",
      rename: "Business_Proof_GST",
      accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    },
  ],
  other: [
    {
      id: "aadhar",
      label: "Aadhar Card",
      rename: "Aadhar",
      accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    },
    {
      id: "pan",
      label: "PAN Card",
      rename: "PAN",
      accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    },
    {
      id: "photo",
      label: "Passport Size Photo",
      rename: "Photo",
      accept: ".jpg,.jpeg,.png,.doc,.docx,.pdf",
    },
  ],
};

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

  const studentIdentifier = student?.email || student?.phone || "";

  const uploadsRef = useRef(uploads);
  const personalRef = useRef(personalInfo);
  const coCountRef = useRef(coCount);

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

  const handleUploaded = (sectionKey, fieldId, result) => {
    const newUploads = {
      ...uploadsRef.current,
      [sectionKey]: {
        ...(uploadsRef.current[sectionKey] || {}),
        [fieldId]: result,
      },
    };
    setUploads(newUploads);
    const updated = {
      ...student,
      uploads: newUploads,
      personalInfo: personalRef.current,
      coApplicants: coCountRef.current,
    };
    setStudent(updated);
    saveStudentMeta(student.name, updated, studentIdentifier);
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
    saveStudentMeta(student.name, updated, studentIdentifier);
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2500);
  };

  const getUploadsFor = (key) => uploads[key] || {};
  const applicantDocs = DOCUMENT_SCHEMA.applicant.fields;
  const academicDocs = DOCUMENT_SCHEMA.academics.fields;

  const otherDocsCount = Object.keys(getUploadsFor("otherDocs")).length;
  const refFieldsCount = Object.keys(personalInfo).filter(
    (k) => k.startsWith("ref") && personalInfo[k],
  ).length;

  const dynamicTotal = getTotalRequiredFields(coCount, personalInfo);

  const progressSections = [
    {
      id: "personal",
      label: "Personal",
      total: 44, // Adjusted for comprehensive tracking form inputs
      uploaded: Object.keys(personalInfo).filter(
        (k) =>
          !k.startsWith("ref") && !k.startsWith("co_info_") && personalInfo[k],
      ).length,
    },
    {
      id: "student",
      label: "Student Docs",
      total: applicantDocs.filter((f) => !f.optional).length,
      uploaded: Object.keys(getUploadsFor("applicant")).length,
    },
    {
      id: "academics",
      label: "Academics",
      total: academicDocs.filter((f) => !f.optional).length,
      uploaded: Object.keys(getUploadsFor("academics")).length,
    },
    {
      id: "loan",
      label: "Loan",
      total: Array.from({ length: coCount }, (_, i) => {
        const coInfo = personalInfo[`co_info_${i}`] || {};
        const financialStatus = coInfo.financialStatus || "financial";
        if (financialStatus === "non-financial") return 3;
        const empType = coInfo.empType || "salaried";
        return (
          LOCAL_CO_APPLICANT_SCHEMA[empType] || LOCAL_CO_APPLICANT_SCHEMA.other
        ).length;
      }).reduce((a, b) => a + b, 0),
      uploaded: Array.from(
        { length: coCount },
        (_, i) => Object.keys(getUploadsFor(`co_${i}`)).length,
      ).reduce((a, b) => a + b, 0),
    },
    {
      id: "references",
      label: "Refs",
      total: 10,
      uploaded: refFieldsCount,
    },
    {
      id: "otherDocs",
      label: "Other Docs",
      total: otherDocsCount,
      uploaded: otherDocsCount,
    },
  ];

  return (
    <div className="portal-page page-bg">
      <div className="portal-container">
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

        <div className="portal-progress-info">
          <span className="progress-total-note">
            {Object.values(uploads).reduce(
              (acc, s) => acc + Object.keys(s).length,
              0,
            )}{" "}
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
            <PersonalSection info={personalInfo} onChange={updatePersonal} />
          )}
          {activeSection === 1 && (
            <DocsSection
              title="Student Documents"
              subtitle="Upload personal identification documents"
              fields={DOCUMENT_SCHEMA.applicant.fields}
              studentName={student.name}
              studentIdentifier={studentIdentifier}
              subFolder="GOVT ID"
              uploads={getUploadsFor("applicant")}
              onUploaded={(fieldId, result) =>
                handleUploaded("applicant", fieldId, result)
              }
            />
          )}
          {activeSection === 2 && (
            <DocsSection
              title="Academic Certificates"
              subtitle="Upload degree certificates, marksheets, etc."
              fields={DOCUMENT_SCHEMA.academics.fields}
              studentName={student.name}
              studentIdentifier={studentIdentifier}
              subFolder="Academics"
              uploads={getUploadsFor("academics")}
              onUploaded={(fieldId, result) =>
                handleUploaded("academics", fieldId, result)
              }
            />
          )}
          {activeSection === 3 && (
            <LoanSection
              studentName={student.name}
              studentIdentifier={studentIdentifier}
              coCount={coCount}
              setCoCount={setCoCount}
              uploads={uploads}
              onUploaded={handleUploaded}
              personalInfo={personalInfo}
              onInfoChange={updatePersonal}
            />
          )}
          {activeSection === 4 && (
            <ReferencesSection info={personalInfo} onChange={updatePersonal} />
          )}
          {activeSection === 5 && (
            <OtherDocumentsSection
              studentName={student.name}
              studentIdentifier={studentIdentifier}
              uploads={getUploadsFor("otherDocs")}
              onUploaded={(fieldId, result) =>
                handleUploaded("otherDocs", fieldId, result)
              }
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
                saveStudentMeta(
                  student.name,
                  updatedStudent,
                  studentIdentifier,
                );
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

// ─── Personal Field Helper ──────────────────────────────────────────────────
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

// ─── Personal Section (UPDATED: Segmented into Step Sub-navigation) ──────────────
function PersonalSection({ info, onChange }) {
  const [subStep, setSubStep] = useState(1);

  return (
    <div className="section-panel">
      <div className="section-intro">
        <h2>Personal Profile Configuration</h2>
        <p>Complete your registration info profiles using the wizard below</p>
      </div>

      {/* Internal Sub-wizard progress line bar */}
      <div
        className="sub-step-navigator"
        style={{ display: "flex", gap: 8, marginBottom: 24 }}
      >
        {[1, 2, 3, 4].map((stepNum) => (
          <button
            key={stepNum}
            type="button"
            className={`btn btn-sm ${subStep === stepNum ? "btn-primary" : "btn-secondary"}`}
            style={{ flex: 1 }}
            onClick={() => setSubStep(stepNum)}
          >
            Page {stepNum}
          </button>
        ))}
      </div>

      {/* PAGE 1: Base Identity, Scores, & Academic Details */}
      {subStep === 1 && (
        <div className="animate-fade-in">
          <h3 className="sub-heading">Identity & Academic Parameters</h3>
          <div className="grid-2">
            <PersonalField
              label="Student Full Name"
              k="fullName"
              placeholder="As per passport"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="Mobile & WhatsApp Number"
              k="phone"
              placeholder="+91 XXXXX XXXXX"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="Email Identity Address"
              k="email"
              type="email"
              placeholder="name@example.com"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="Required Loan Amount"
              k="loanAmount"
              placeholder="e.g. ₹50,00,000"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="Student CIBIL Score"
              k="studentCibil"
              placeholder="e.g. 750"
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
              label="Qualification & Passed Year"
              k="qualPassedYear"
              placeholder="e.g. B.Tech 2024"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="10th Percentage & Year"
              k="pct10"
              placeholder="e.g. 85.4% - 2018"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="Inter/12th Percentage & Year"
              k="pct12"
              placeholder="e.g. 82.0% - 2020"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="Graduation CGPA / % & Year"
              k="pctGrad"
              placeholder="e.g. 8.2 CGPA - 2024"
              info={info}
              onChange={onChange}
            />

            <div className="input-group">
              <label>Any Active/Past Backlogs?</label>
              <select
                className="input-field"
                value={info.hasBacklogs || ""}
                onChange={(e) => onChange("hasBacklogs", e.target.value)}
              >
                <option value="">Select</option>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            {info.hasBacklogs === "Yes" && (
              <PersonalField
                label="Number of Backlogs"
                k="backlogCount"
                placeholder="e.g. 2"
                info={info}
                onChange={onChange}
              />
            )}
          </div>

          <div className="divider" />
          <h3 className="sub-heading">Standardized Test Metrics</h3>
          <div className="grid-2">
            <PersonalField
              label="GRE Score"
              k="greScore"
              placeholder="e.g. 312"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="IELTS Score"
              k="ieltsScore"
              placeholder="e.g. 7.0"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="Duolingo Score"
              k="duolingoScore"
              placeholder="e.g. 120"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="TOEFL Score"
              k="toeflScore"
              placeholder="e.g. 98"
              info={info}
              onChange={onChange}
            />
          </div>
        </div>
      )}

      {/* PAGE 2: Target Profiles, Visa Metrics, & Residence */}
      {subStep === 2 && (
        <div className="animate-fade-in">
          <h3 className="sub-heading">Destination & Application Context</h3>
          <div className="grid-2">
            <div className="input-group">
              <label>Loan Application Track For</label>
              <select
                className="input-field"
                value={info.loanTrack || ""}
                onChange={(e) => onChange("loanTrack", e.target.value)}
              >
                <option value="">Select Option</option>
                <option value="MS">Master of Science (MS)</option>
                <option value="Under Graduation">Under Graduation (UG)</option>
              </select>
            </div>

            <PersonalField
              label="Traveling Country & University"
              k="targetUniversity"
              placeholder="e.g. USA - UT Dallas"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="Course Name & University"
              k="courseNameUniversity"
              placeholder="e.g. Computer Science - UTD"
              info={info}
              onChange={onChange}
            />

            <div className="input-group">
              <label>I20 Document Received?</label>
              <select
                className="input-field"
                value={info.i20Received || ""}
                onChange={(e) => onChange("i20Received", e.target.value)}
              >
                <option value="">Select Option</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>

            <div className="input-group">
              <label>Visa Slot Booked Or Not?</label>
              <select
                className="input-field"
                value={info.visaBooked || ""}
                onChange={(e) => onChange("visaBooked", e.target.value)}
              >
                <option value="">Select Status</option>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            {info.visaBooked === "Yes" && (
              <PersonalField
                label="Visa Slot Booked Date"
                k="visaSlotDate"
                type="date"
                info={info}
                onChange={onChange}
              />
            )}
          </div>

          <div className="divider" />
          <h3 className="sub-heading">Residential Tracking Matrices</h3>
          <div className="input-group">
            <label>Present Address (With Landmark)</label>
            <textarea
              className="input-field"
              rows={2}
              placeholder="Door no, Street, Landmark, PIN Code"
              value={info.currentAddress || ""}
              onChange={(e) => onChange("currentAddress", e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>Permanent Address (With Landmark)</label>
            <textarea
              className="input-field"
              rows={2}
              placeholder="Same as above or structural fallback layout"
              value={info.permanentAddress || ""}
              onChange={(e) => onChange("permanentAddress", e.target.value)}
            />
          </div>
        </div>
      )}

      {/* PAGE 3: Parents Information, Credit Values, & Guarantors */}
      {subStep === 3 && (
        <div className="animate-fade-in">
          <h3 className="sub-heading">Paternal & Maternal Baselines</h3>
          <div className="grid-2">
            <PersonalField
              label="Father Name"
              k="fatherName"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="Father Mobile No. & Mail Id"
              k="fatherContact"
              placeholder="Phone / Email info"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="Father CIBIL Score"
              k="fatherCibil"
              placeholder="e.g. 780"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="Mother Name"
              k="motherName"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="Mother Mobile No. & Mail Id"
              k="motherContact"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="Mother CIBIL Score"
              k="motherCibil"
              info={info}
              onChange={onChange}
            />
          </div>

          <div className="divider" />
          <h3 className="sub-heading">Financial Guarantor Setup</h3>
          <div className="grid-2">
            <PersonalField
              label="Financial Guarantee Name"
              k="guarantorName"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="Financial Guarantee Relationship"
              k="guarantorRelation"
              placeholder="e.g. Uncle"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="Financial Guarantee Mobile No."
              k="guarantorMobile"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="Financial Guarantee CIBIL Score"
              k="guarantorCibil"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="Financial Guarantee Sector (Job / Business)"
              k="guarantorSector"
              placeholder="e.g. Software Business"
              info={info}
              onChange={onChange}
            />

            <div className="input-group">
              <label>Income Documents Available?</label>
              <select
                className="input-field"
                value={info.guarantorDocsAvailable || ""}
                onChange={(e) =>
                  onChange("guarantorDocsAvailable", e.target.value)
                }
              >
                <option value="">Select Option</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
          </div>

          <div className="divider" />
          <h3 className="sub-heading">Extended Lineage References</h3>
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
      )}

      {/* PAGE 4: Pre-applied Actions, Employment, & Agency Context */}
      {subStep === 4 && (
        <div className="animate-fade-in">
          <h3 className="sub-heading">Prior History & Assets</h3>
          <div className="grid-2">
            <div className="input-group">
              <label>Applied Any Bank Before?</label>
              <select
                className="input-field"
                value={info.priorBankApplied || ""}
                onChange={(e) => onChange("priorBankApplied", e.target.value)}
              >
                <option value="">Select Option</option>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            {info.priorBankApplied === "Yes" && (
              <PersonalField
                label="If applied, rejection reason"
                k="priorBankRejectionReason"
                placeholder="Describe reason"
                info={info}
                onChange={onChange}
              />
            )}

            <div className="input-group">
              <label>Family Own House Available Or Not?</label>
              <select
                className="input-field"
                value={info.ownHouseStatus || ""}
                onChange={(e) => onChange("ownHouseStatus", e.target.value)}
              >
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
              <select
                className="input-field"
                value={info.hasJobDetails || ""}
                onChange={(e) => onChange("hasJobDetails", e.target.value)}
              >
                <option value="">Select</option>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            {info.hasJobDetails === "Yes" && (
              <PersonalField
                label="Salary per Month & Total Experience"
                k="jobSpecs"
                placeholder="e.g. ₹45,000 - 2 Years"
                info={info}
                onChange={onChange}
              />
            )}
          </div>

          <div className="divider" />
          <h3 className="sub-heading">
            Overseas Consultants Reference Mapping
          </h3>
          <div className="grid-2">
            <PersonalField
              label="Overseas Consultants Name, Location"
              k="consultantNameLoc"
              placeholder="Name and city branch"
              info={info}
              onChange={onChange}
            />
            <PersonalField
              label="Consultant Phone No. & Mail ID"
              k="consultantContact"
              placeholder="Contact details string"
              info={info}
              onChange={onChange}
            />
          </div>
        </div>
      )}

      {/* Simple navigation button clusters to toggle between wizard pages */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 24,
        }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          disabled={subStep === 1}
          onClick={() => setSubStep((p) => p - 1)}
        >
          ← Prev Form Page
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={subStep === 4}
          onClick={() => setSubStep((p) => p + 1)}
        >
          Next Form Page →
        </button>
      </div>
    </div>
  );
}

// ─── Docs Section ─────────────────────────────────────────────────────────────
function DocsSection({
  title,
  subtitle,
  fields,
  studentName,
  studentIdentifier,
  subFolder,
  uploads,
  onUploaded,
}) {
  const uploaded = Object.keys(uploads).length;
  return (
    <div className="section-panel">
      <div className="section-intro">
        <h2>{title}</h2>
        <p>{subtitle}</p>
        <div className="section-stats">
          <span className="badge badge-info">
            {uploaded}/{fields.length} uploaded
          </span>
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

// ─── Loan Section ─────────────────────────────────────────────────────────────
function LoanSection({
  studentName,
  studentIdentifier,
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
        const financialStatus = coInfo.financialStatus || "financial";

        let fields;
        if (financialStatus === "non-financial") {
          fields = LOCAL_CO_APPLICANT_SCHEMA.other.filter((f) =>
            ["aadhar", "pan", "photo"].includes(f.id),
          );
        } else {
          fields =
            LOCAL_CO_APPLICANT_SCHEMA[empType] ||
            LOCAL_CO_APPLICANT_SCHEMA.other;
        }

        const coUploads = uploads[key] || {};
        const isOpen = expandedCo === i;

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
                  {coLabels[i]} (
                  {financialStatus === "financial"
                    ? "Financial"
                    : "Non-Financial"}
                  )
                </span>
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
                    <label>Applicant Responsibility</label>
                    <select
                      className="input-field"
                      value={financialStatus}
                      onChange={(e) =>
                        onInfoChange(infoKey, {
                          ...coInfo,
                          financialStatus: e.target.value,
                        })
                      }
                    >
                      <option value="financial">Financial Applicant</option>
                      <option value="non-financial">
                        Non-Financial Applicant
                      </option>
                    </select>
                  </div>
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
                  {financialStatus !== "non-financial" && (
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
                  )}
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
                {financialStatus !== "non-financial" && (
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
                )}
                <div className="divider" />
                <h4 className="sub-heading" style={{ marginBottom: 14 }}>
                  Documents —{" "}
                  {financialStatus === "non-financial"
                    ? "Non-Financial Minimal Layout (Aadhar, PAN, Photo)"
                    : `${empType === "salaried" ? "Salaried" : empType === "selfEmployed" ? "Self-Employed" : "Basic"} (Financial)`}
                </h4>
                <div className="upload-grid">
                  {fields.map((field) => {
                    const statusSlug =
                      financialStatus === "financial"
                        ? "Financial"
                        : "NonFinancial";
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
                        onUploaded={(fieldId, result) =>
                          onUploaded(key, fieldId, result)
                        }
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── References Section ───────────────────────────────────────────────────────
function ReferencesSection({ info, onChange }) {
  const REFERENCE_RELATIONS = [
    "Uncle",
    "Aunt",
    "Family Friend",
    "Neighbor",
    "Colleague",
    "Professor / Teacher",
    "Cousin",
    "Other",
  ];

  return (
    <div className="section-panel">
      <div className="section-intro">
        <h2>Applicant References</h2>
        <p>Provide details of 2 references who can vouch for the student</p>
      </div>
      {[1, 2].map((n) => {
        const relationKey = `ref${n}_relation`;
        const customRelationKey = `ref${n}_custom_relation`;
        const currentRelationValue = info[relationKey] || "";
        const isCustomVisible = currentRelationValue === "Other";

        return (
          <div key={n} className="ref-card">
            <h3 className="sub-heading">Reference {n}</h3>
            <div className="grid-2">
              <div className="input-group">
                <label>Name</label>
                <input
                  className="input-field"
                  value={info[`ref${n}_name`] || ""}
                  onChange={(e) => onChange(`ref${n}_name`, e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>Mobile</label>
                <input
                  className="input-field"
                  value={info[`ref${n}_mobile`] || ""}
                  onChange={(e) => onChange(`ref${n}_mobile`, e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>Occupation</label>
                <input
                  className="input-field"
                  value={info[`ref${n}_occupation`] || ""}
                  onChange={(e) =>
                    onChange(`ref${n}_occupation`, e.target.value)
                  }
                />
              </div>
              <div className="input-group">
                <label>Relation to Student</label>
                <select
                  className="input-field"
                  value={currentRelationValue}
                  onChange={(e) => {
                    onChange(relationKey, e.target.value);
                    if (e.target.value !== "Other")
                      onChange(customRelationKey, "");
                  }}
                >
                  <option value="">Select Relation</option>
                  {REFERENCE_RELATIONS.map((rel) => (
                    <option key={rel} value={rel}>
                      {rel}
                    </option>
                  ))}
                </select>
              </div>
              {isCustomVisible && (
                <div className="input-group" style={{ gridColumn: "1 / -1" }}>
                  <label>Specify Custom Relation</label>
                  <input
                    className="input-field animate-fade-in"
                    placeholder="e.g. Mother's Distant Cousin"
                    value={info[customRelationKey] || ""}
                    onChange={(e) =>
                      onChange(customRelationKey, e.target.value)
                    }
                  />
                </div>
              )}
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
        );
      })}
    </div>
  );
}

// ─── Other Documents Section ──────────────────────────────────────────────────
function OtherDocumentsSection({
  studentName,
  studentIdentifier,
  uploads,
  onUploaded,
  onRemoved,
}) {
  const [items, setItems] = useState(() => {
    const existingIds = Object.keys(uploads);
    if (existingIds.length === 0) return [];
    return existingIds.map((id) => ({
      id,
      fileName: uploads[id]?.customName || "",
    }));
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
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, fileName: newName } : item,
      ),
    );
  };

  const getFieldForItem = (item) => ({
    id: item.id,
    label: item.fileName
      ? `Document: ${item.fileName}`
      : "New Document (enter name above)",
    rename: item.fileName
      ? item.fileName.replace(/\s+/g, "_")
      : "custom_document",
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
          <div
            key={item.id}
            className="custom-doc-card"
            style={{
              marginBottom: 24,
              padding: 16,
              border: "1px solid #e2e8f0",
              borderRadius: 12,
            }}
          >
            <div
              className="custom-doc-header"
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-end",
                marginBottom: 12,
              }}
            >
              <div className="input-group" style={{ flex: 1 }}>
                <label>Document name (without extension)</label>
                <input
                  className="input-field"
                  placeholder="e.g. Scholarship_Letter"
                  value={item.fileName}
                  onChange={(e) => updateFileName(item.id, e.target.value)}
                />
              </div>
              <button
                className="icon-btn del-btn"
                type="button"
                onClick={() => removeItem(item.id)}
                title="Remove this document"
              >
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
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          onClick={addNewItem}
          style={{ marginTop: 8 }}
        >
          <Plus size={14} /> Add another document
        </button>
      </div>
    </div>
  );
}
