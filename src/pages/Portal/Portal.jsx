// Portal.jsx — student document upload + profile
import { useState, useEffect, useRef, useId, createContext, useContext } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  Plus,
  Trash2,
  FolderOpen,
  Sparkles,
  TriangleAlert,
  ContactRound,
  GraduationCap,
  Landmark,
  ListChecks,
  ShieldCheck,
  UserRound,
  CircleCheck,
  CircleAlert,
  ArrowLeft,
  ArrowRight,
  X,
  Users,
} from "lucide-react";
import { useStudent } from "../../context/StudentContext";
import { saveStudentMeta } from "../../utils/driveApi";
import { generateAndUploadSummaryPDF } from "../../utils/summaryGenerator";
import { DOCUMENT_SCHEMA, CO_APPLICANT_SCHEMA, getTotalRequiredFields, countUploadedFields } from "../../context/schemas";
import { extractPersonalAutoFill, extractCoApplicantAutoFill, getDocSourceLabel } from "../../utils/autoFillMap";
import {
  READER_SOURCE_LABEL,
  applicantFieldsFromReader,
  coApplicantFieldsFromReader,
  mergeReaderFields,
  mergeExtractions,
} from "../../utils/readerAutoFill";
import { buildIdentityReport } from "../../utils/identityCheck";
import { getApplicationId } from "../../utils/applicationId";
import FileUploadBox from "../../components/FileUploadBox/FileUploadBox";
import { docAnchorId } from "../../components/FileUploadBox/docMeta";
import PortalShell from "../../components/StudentPortal/PortalShell";
import ApplicationStepper from "../../components/StudentPortal/ApplicationStepper";
import DocumentSection from "../../components/StudentPortal/DocumentSection";
import ConfirmDialog from "../../components/StudentPortal/ConfirmDialog";
import StudentDashboard from "../../components/StudentPortal/StudentDashboard";
import LoanStatus from "../../components/StudentPortal/LoanStatus";
import HelpCenter from "../../components/StudentPortal/HelpCenter";
import { buildDocGroups, countStatuses } from "../../components/StudentPortal/dashboardData";
import {
  ProgressSummary,
  AIVerificationPanel,
  DocumentGuidelines,
  SaveActions,
  MobileActionBar,
} from "../../components/StudentPortal/PortalRail";
import "./Portal.css";

const CUR_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CUR_YEAR - 1974 }, (_, i) => CUR_YEAR - i);

const MAX_FILE_SIZE = "25 MB";

// The four steps of the document workspace, in page order.
const STEP_IDS = ["sec-personal", "sec-academic", "sec-financial", "sec-review"];

const PROFILE_PAGES = [
  { id: 1, label: "Identity & academics" },
  { id: 2, label: "Destination & address" },
  { id: 3, label: "Family & guarantor" },
  { id: 4, label: "History & assets" },
  { id: 5, label: "References" },
];

// Fields the document reader filled but wasn't sure about: { formKey: reason }.
// Provided around the profile form so every input can show "Please check"
// without threading another prop through each call site.
const ReviewContext = createContext({});

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

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function Portal() {
  const { student, setStudent, clearStudent, logoutAdmin } = useStudent();
  const navigate = useNavigate();
  // home | documents | profile | loan | help
  const [view, setView]                     = useState("home");
  const [currentStep, setCurrentStep]       = useState(STEP_IDS[0]);
  const [profilePage, setProfilePage]       = useState(1);
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
  // What our document model read, per upload slot ("applicant.passport",
  // "co_0.aadhar", ...), and which auto-filled fields it flagged as uncertain.
  const [extractions, setExtractions]             = useState(student?.extractions || {});
  const [reviewFields, setReviewFields]           = useState(student?.reviewFields || {});
  const [saving, setSaving] = useState(false);
  // Header save indicator: idle | saving | saved | dirty | error — only ever
  // set from the real outcome of a save request.
  const [saveStatus, setSaveStatus] = useState("idle");
  const [savedAt, setSavedAt]       = useState(null);
  const [notice, setNotice]         = useState(null);
  const [confirmCo, setConfirmCo]   = useState(null);

  const studentIdentifier = student?.email || student?.phone || "";

  const uploadsRef      = useRef(uploads);
  const personalRef     = useRef(personalInfo);
  const coCountRef      = useRef(coCount);
  const docsRef         = useRef(uploadedDocuments);
  const autoFilledRef   = useRef(autoFilledFields);
  const extractionsRef  = useRef(extractions);
  const reviewRef       = useRef(reviewFields);
  const saveSeq         = useRef(0);
  const editVersion     = useRef(0);

  useEffect(() => { uploadsRef.current    = uploads;           }, [uploads]);
  useEffect(() => { personalRef.current   = personalInfo;      }, [personalInfo]);
  useEffect(() => { coCountRef.current    = coCount;           }, [coCount]);
  useEffect(() => { docsRef.current       = uploadedDocuments; }, [uploadedDocuments]);
  useEffect(() => { autoFilledRef.current = autoFilledFields;  }, [autoFilledFields]);
  useEffect(() => { extractionsRef.current = extractions;      }, [extractions]);
  useEffect(() => { reviewRef.current     = reviewFields;      }, [reviewFields]);

  useEffect(() => {
    if (!student) navigate("/");
  }, [student, navigate]);

  // Highlight the stepper step for the section currently in view.
  useEffect(() => {
    if (view !== "documents") return undefined;
    const els = STEP_IDS.map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length || typeof IntersectionObserver === "undefined") return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrentStep(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [view]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(t);
  }, [notice]);

  if (!student) return null;

  // Everything persisted to student_meta.json, built from the refs so a save
  // triggered mid-update never writes a half-applied state.
  const buildStudentRecord = () => ({
    ...student,
    // Stored the first time it's computed, so it never changes afterwards.
    applicationId: getApplicationId(student),
    uploads: uploadsRef.current,
    personalInfo: personalRef.current,
    coApplicants: coCountRef.current,
    uploadedDocuments: docsRef.current,
    autoFilledFields: autoFilledRef.current,
    extractions: extractionsRef.current,
    reviewFields: reviewRef.current,
    identityCheck: buildIdentityReport({
      extractions: extractionsRef.current,
      personalInfo: personalRef.current,
      coCount: coCountRef.current,
      legacyDocs: docsRef.current,
    }),
  });

  // Saves the record and reports the real result to the header indicator.
  // Resolves true/false; never throws.
  const persist = (record) => {
    const seq = ++saveSeq.current;
    const version = editVersion.current;
    setSaveStatus("saving");
    return saveStudentMeta(student.name, record, studentIdentifier, { throwOnError: true })
      .then(() => {
        if (seq === saveSeq.current) {
          setSaveStatus(version === editVersion.current ? "saved" : "dirty");
          setSavedAt(Date.now());
        }
        return true;
      })
      .catch(() => {
        if (seq === saveSeq.current) setSaveStatus("error");
        return false;
      });
  };

  const markDirty = () => {
    editVersion.current += 1;
    setSaveStatus("dirty");
  };

  const handleUploaded = (sectionKey, fieldId, result) => {
    // result === null means a page was removed from a multi-file slot —
    // drop the key so it stops counting as uploaded.
    const sectionUploads = { ...(uploadsRef.current[sectionKey] || {}) };
    if (result) sectionUploads[fieldId] = result;
    else delete sectionUploads[fieldId];
    const newUploads = { ...uploadsRef.current, [sectionKey]: sectionUploads };
    uploadsRef.current = newUploads;
    setUploads(newUploads);

    let newDocs = docsRef.current;
    if (result?.parsedData) {
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
          if (coAF.firstName || coAF.lastName || coAF.currentAddress) {
            const infoKey = `co_info_${coIdx}`;
            setPersonalInfo((prev) => {
              const existing = prev[infoKey] || {};
              const patch = { ...existing };
              if (coAF.firstName && !existing.firstName)             patch.firstName        = coAF.firstName;
              if (coAF.lastName && !existing.lastName)               patch.lastName         = coAF.lastName;
              if (coAF.currentAddress && !existing.currentAddress)   patch.currentAddress   = coAF.currentAddress;
              if (coAF.permanentAddress && !existing.permanentAddress) patch.permanentAddress = coAF.permanentAddress;
              return { ...prev, [infoKey]: patch };
            });
          }
        }
      }
    }

    docsRef.current = newDocs;
    const updated = buildStudentRecord();
    setStudent(updated);
    persist(updated);
  };

  // Called when our document model finishes reading a passport / Aadhaar /
  // PAN / 10th or 12th certificate. Stores what it read, feeds the eligibility
  // report, auto-fills the profile and re-runs the identity check.
  const handleExtracted = (sectionKey, fieldId, { extraction, parsedData }) => {
    const extKey = `${sectionKey}.${fieldId}`;
    const merged = mergeExtractions(extractionsRef.current[extKey], extraction);
    const newExtractions = { ...extractionsRef.current, [extKey]: merged };
    extractionsRef.current = newExtractions;
    setExtractions(newExtractions);

    // A 10th/12th certificate from a board the model doesn't know keeps
    // whatever the old parser found instead.
    const usable = !(["certificate", "ssc"].includes(merged.docType) && merged.checks?.supported === false);

    if (usable && parsedData && Object.keys(parsedData.fields || {}).length) {
      const sameDoc = (d) => d.subFolder === parsedData.subFolder && d.type === parsedData.type;
      const prev = docsRef.current.find(sameDoc);
      const doc = {
        ...parsedData,
        fields: { ...(prev?.source === "reader" ? prev.fields : {}), ...parsedData.fields },
      };
      const newDocs = [...docsRef.current.filter((d) => !sameDoc(d)), doc];
      docsRef.current = newDocs;
      setUploadedDocuments(newDocs);
    }

    if (usable) {
      const sourceLabel = READER_SOURCE_LABEL[merged.docType];
      const flagged = merged.review?.fieldsRequiringReview || [];
      const reasons = merged.review?.reasons || {};

      if (sectionKey === "applicant" || sectionKey === "academics") {
        const { values, from } = applicantFieldsFromReader(merged.docType, merged.flat, merged.checks);
        const r = mergeReaderFields({
          info: personalRef.current,
          autoFilled: autoFilledRef.current,
          review: reviewRef.current,
          values, from, sourceLabel, flagged, reasons,
        });
        personalRef.current = r.info;
        autoFilledRef.current = r.autoFilled;
        reviewRef.current = r.review;
        setPersonalInfo(r.info);
        setAutoFilledFields(r.autoFilled);
        setReviewFields(r.review);
      } else if (sectionKey.startsWith("co_")) {
        // Co-applicant inputs don't track which values were typed, so only
        // blanks are filled — the first document read wins.
        const infoKey = `co_info_${sectionKey.split("_")[1]}`;
        const existing = personalRef.current[infoKey] || {};
        const { values } = coApplicantFieldsFromReader(merged.docType, merged.flat);
        const patch = { ...existing };
        for (const [k, v] of Object.entries(values)) if (!existing[k]) patch[k] = v;
        const newInfo = { ...personalRef.current, [infoKey]: patch };
        personalRef.current = newInfo;
        setPersonalInfo(newInfo);
      }
    }

    const updated = buildStudentRecord();
    setStudent(updated);
    persist(updated);
  };

  const updatePersonal = (key, value) => {
    setAutoFilledFields((prev) => {
      if (!prev[key]) return prev;
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
    setReviewFields((prev) => {
      if (!prev[key]) return prev;
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
    setPersonalInfo((prev) => ({ ...prev, [key]: value }));
    markDirty();
  };

  const handleCoCountChange = (newCount) => {
    const prev = coCountRef.current;
    setCoCount(newCount);
    coCountRef.current = newCount;
    markDirty();
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

  // Lowering the count deletes the removed co-applicants' details and
  // document records, so ask first when there's anything to lose.
  const requestCoCount = (n) => {
    if (n >= coCountRef.current) { handleCoCountChange(n); return; }
    const losing = [];
    for (let i = n; i < coCountRef.current; i++) {
      const hasData = Object.keys(uploads[`co_${i}`] || {}).length || Object.keys(personalInfo[`co_info_${i}`] || {}).length;
      if (hasData) losing.push(i);
    }
    if (!losing.length) { handleCoCountChange(n); return; }
    setConfirmCo({ count: n, losing });
  };

  const handleOtherRemoved = (fieldId) => {
    const updated = { ...uploadsRef.current };
    if (updated.otherDocs) {
      const section = { ...updated.otherDocs };
      delete section[fieldId];
      updated.otherDocs = section;
    }
    uploadsRef.current = updated;
    setUploads(updated);
    const updatedStudent = buildStudentRecord();
    setStudent(updatedStudent);
    persist(updatedStudent);
  };

  const handleSave = async () => {
    if (saving) return false;
    setSaving(true);
    const updated = buildStudentRecord();
    setStudent(updated);
    const saved = persist(updated);
    generateAndUploadSummaryPDF(student.name, updated, studentIdentifier, docsRef.current);
    const ok = await saved;
    setSaving(false);
    return ok;
  };

  const getUploadsFor = (key) => uploads[key] || {};

  const dynamicTotal = getTotalRequiredFields(coCount, personalInfo);

  const coFieldsFor = (i) => {
    const coInfo = personalInfo[`co_info_${i}`] || {};
    if (coInfo.financialStatus === "non-financial") {
      return CO_APPLICANT_SCHEMA.other.filter((f) => ["aadhar", "pan", "photo"].includes(f.id));
    }
    return CO_APPLICANT_SCHEMA[coInfo.empType || "salaried"] || CO_APPLICANT_SCHEMA.other;
  };
  const required = (fields) => fields.filter((f) => !f.optional);

  // Counted per document, not per file — a two-page Aadhaar is one document.
  const personalReq = required(DOCUMENT_SCHEMA.applicant.fields);
  const academicReq = required(DOCUMENT_SCHEMA.academics.fields);
  const personalDone = countUploadedFields(getUploadsFor("applicant"), personalReq);
  const academicDone = countUploadedFields(getUploadsFor("academics"), academicReq);
  const coIdx = Array.from({ length: coCount }, (_, i) => i);
  const financialTotal = coIdx.reduce((a, i) => a + required(coFieldsFor(i)).length, 0);
  const financialDone = coIdx.reduce((a, i) => a + countUploadedFields(getUploadsFor(`co_${i}`), required(coFieldsFor(i))), 0);
  const requiredDone = personalDone + academicDone + financialDone;
  const missingCount = Math.max(dynamicTotal - requiredDone, 0);
  const otherCount = Object.keys(getUploadsFor("otherDocs")).filter((k) => getUploadsFor("otherDocs")[k]).length;

  const coName = (i) => {
    const c = personalInfo[`co_info_${i}`] || {};
    return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.name || `Co-applicant ${i + 1}`;
  };
  const missingList = [
    ...personalReq.filter((f) => !countUploadedFields(getUploadsFor("applicant"), [f])).map((f) => ({ key: `a-${f.id}`, target: "sec-personal", label: f.label, group: "Personal" })),
    ...academicReq.filter((f) => !countUploadedFields(getUploadsFor("academics"), [f])).map((f) => ({ key: `ac-${f.id}`, target: "sec-academic", label: f.label, group: "Academic" })),
    ...coIdx.flatMap((i) => required(coFieldsFor(i))
      .filter((f) => !countUploadedFields(getUploadsFor(`co_${i}`), [f]))
      .map((f) => ({ key: `co${i}-${f.id}`, target: "sec-financial", label: f.label, group: coName(i) }))),
  ];

  const identity = buildIdentityReport({ extractions, personalInfo, coCount, legacyDocs: uploadedDocuments });
  const reviewCount = Object.keys(reviewFields).length;
  const applicationId = getApplicationId(student);

  // Dashboard tiles: every required document plus anything optional already
  // uploaded, grouped as the student's own and each co-applicant's.
  const docGroups = buildDocGroups({
    sections: [
      { key: "applicant", sectionId: "sec-personal", fields: DOCUMENT_SCHEMA.applicant.fields },
      { key: "academics", sectionId: "sec-academic", fields: DOCUMENT_SCHEMA.academics.fields },
    ],
    co: coIdx.map((i) => ({ key: `co_${i}`, title: `Co-applicant ${i + 1} · ${coName(i)}`, fields: coFieldsFor(i) })),
    uploads,
    extractions,
    otherDocs: getUploadsFor("otherDocs"),
  });
  const docCounts = countStatuses(docGroups);

  const steps = [
    { id: "sec-personal",  label: "Personal Documents",  icon: ContactRound,  done: personalDone,  total: personalReq.length },
    { id: "sec-academic",  label: "Academic Documents",  icon: GraduationCap, done: academicDone,  total: academicReq.length },
    { id: "sec-financial", label: "Financial Documents", icon: Landmark,      done: financialDone, total: financialTotal },
    {
      id: "sec-review",
      label: "Review & Save",
      icon: ListChecks,
      done: requiredDone,
      total: dynamicTotal,
      summary: missingCount ? `${plural(missingCount, "item")} left` : "Ready to save",
    },
  ];

  const scrollToId = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReducedMotion() ? "instant" : "smooth", block: "start" });
  };

  const jumpTo = (id) => {
    setCurrentStep(id);
    if (view !== "documents") {
      setView("documents");
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToId(id)));
    } else {
      scrollToId(id);
    }
  };

  // Dashboard tile → its upload card, briefly highlighted. Falls back to the
  // section when the card is collapsed away.
  const openDoc = (doc) => {
    setView("documents");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const card = document.getElementById(doc.anchorId);
      if (!card?.offsetParent) { scrollToId(doc.sectionId); return; }
      card.scrollIntoView({ behavior: prefersReducedMotion() ? "instant" : "smooth", block: "center" });
      card.focus({ preventScroll: true });
      card.classList.remove("is-spotlight");
      void card.offsetWidth; // restart the animation on a repeat click
      card.classList.add("is-spotlight");
      card.addEventListener("animationend", () => card.classList.remove("is-spotlight"), { once: true });
    }));
  };

  const changeView = (next) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  // A full page load to the home page: it gets past this route's guard
  // (which would otherwise bounce to the sign-in page) and drops every
  // piece of student data still held in memory.
  const handleSignOut = () => {
    clearStudent();
    logoutAdmin();
    window.location.replace("/");
  };

  const saveProgress = async () => {
    const ok = await handleSave();
    setNotice(ok
      ? { tone: "success", text: "Your progress has been saved." }
      : { tone: "error", text: "We couldn't save just now. Check your connection and try again." });
  };

  // Save, then move the student to the next part of the workflow. Missing
  // documents never block — they're listed so the student knows what's left.
  const saveAndContinue = async () => {
    const ok = await handleSave();
    if (!ok) {
      setNotice({ tone: "error", text: "We couldn't save just now. Check your connection and try again." });
      return;
    }
    if (view === "documents") {
      changeView("profile");
      setNotice(missingCount
        ? { tone: "warning", text: `Saved. ${plural(missingCount, "required document")} still to upload — you can add ${missingCount === 1 ? "it" : "them"} any time.` }
        : { tone: "success", text: "Saved. All required documents are in — now check your profile details." });
    } else if (profilePage < PROFILE_PAGES.length) {
      setProfilePage(profilePage + 1);
      window.scrollTo({ top: 0, behavior: "instant" });
      setNotice({ tone: "success", text: "Saved." });
    } else {
      changeView("documents");
      setNotice({ tone: "success", text: "Your profile has been saved." });
    }
  };

  const primaryLabel = view === "documents" || profilePage < PROFILE_PAGES.length ? "Save & Continue" : "Save & Finish";

  const inWorkspace = view === "documents" || view === "profile";

  const railNote = view === "documents"
    ? (missingCount ? `${plural(missingCount, "required document")} still to upload.` : "All required documents are uploaded.")
    : null;

  return (
    <PortalShell
      view={view}
      onViewChange={changeView}
      reviewCount={reviewCount}
      student={student}
      saveStatus={saveStatus}
      savedAt={savedAt}
      onRetrySave={saveProgress}
      onSignOut={handleSignOut}
    >
      {view === "home" && (
        <StudentDashboard
          student={student}
          applicationId={applicationId}
          done={requiredDone}
          total={dynamicTotal}
          counts={docCounts}
          groups={docGroups}
          reviewCount={reviewCount}
          onOpenDoc={openDoc}
          onViewAll={() => changeView("documents")}
          onLoanDetails={() => changeView("loan")}
          onOpenProfile={() => changeView("profile")}
        />
      )}
      {view === "loan" && (
        <LoanStatus student={student} applicationId={applicationId} onOpenHelp={() => changeView("help")} />
      )}
      {view === "help" && (
        <HelpCenter student={student} maxSize={MAX_FILE_SIZE} onOpenDocuments={() => changeView("documents")} />
      )}

      {/* Stays mounted on every view so uploads in progress keep running
          and keep their on-screen state. */}
      <div className="sp-page" hidden={!inWorkspace}>
        <div className="sp-main">
          <div className="sp-stack" hidden={view !== "documents"}>
              <div className="sp-heading">
                <div className="sp-heading__text">
                  <p className="sp-eyebrow">Application ID · <strong>{applicationId}</strong></p>
                  <h1 className="sp-title">Upload Your Documents</h1>
                  <p className="sp-lede">
                    Upload all required documents for your education loan. Our AI will automatically verify and fill your profile details.
                  </p>
                </div>
                <div className="sp-secure">
                  <span className="sp-secure__icon" aria-hidden="true"><ShieldCheck size={22} /></span>
                  <div>
                    <p className="sp-secure__title">Your documents are secure and encrypted</p>
                    <p className="sp-secure__text">Your documents are handled securely throughout the application process.</p>
                  </div>
                </div>
              </div>

              <ApplicationStepper steps={steps} currentId={currentStep} onSelect={jumpTo} />

              <DocumentSection
                id="sec-personal"
                icon={ContactRound}
                title="Personal Documents"
                description="These documents help us verify your identity. Start with your Passport, Aadhaar and PAN — we read them and fill in your details."
                done={personalDone}
                total={personalReq.length}
              >
                <DocGrid
                  sectionKey="applicant"
                  fields={DOCUMENT_SCHEMA.applicant.fields}
                  studentName={student.name}
                  studentIdentifier={studentIdentifier}
                  subFolder="GOVT ID"
                  uploads={getUploadsFor("applicant")}
                  onUploaded={(fieldId, result) => handleUploaded("applicant", fieldId, result)}
                  extractionsFor={(fieldId) => extractions[`applicant.${fieldId}`]}
                  onExtracted={(fieldId, payload) => handleExtracted("applicant", fieldId, payload)}
                />
              </DocumentSection>

              <DocumentSection
                id="sec-academic"
                icon={GraduationCap}
                title="Academic Documents"
                description="Upload your academic records, certificates and test scores. Scores and years are filled into your profile."
                done={academicDone}
                total={academicReq.length}
              >
                <DocGrid
                  sectionKey="academics"
                  fields={DOCUMENT_SCHEMA.academics.fields}
                  studentName={student.name}
                  studentIdentifier={studentIdentifier}
                  subFolder="Academics"
                  uploads={getUploadsFor("academics")}
                  onUploaded={(fieldId, result) => handleUploaded("academics", fieldId, result)}
                  extractionsFor={(fieldId) => extractions[`academics.${fieldId}`]}
                  onExtracted={(fieldId, payload) => handleExtracted("academics", fieldId, payload)}
                />
              </DocumentSection>

              <DocumentSection
                id="sec-financial"
                icon={Landmark}
                title="Financial Documents"
                description="Upload the financial records of each co-applicant. The checklist adapts to their employment type."
                done={financialDone}
                total={financialTotal}
              >
                <LoanSection
                  studentName={student.name}
                  studentIdentifier={studentIdentifier}
                  coCount={coCount}
                  setCoCount={requestCoCount}
                  uploads={uploads}
                  onUploaded={handleUploaded}
                  extractions={extractions}
                  onExtracted={handleExtracted}
                  personalInfo={personalInfo}
                  onInfoChange={updatePersonal}
                  coFieldsFor={coFieldsFor}
                />
              </DocumentSection>

              <DocumentSection
                id="sec-review"
                icon={ListChecks}
                title="Review & Save"
                description="Add any other documents, check what's still missing, then save."
                done={requiredDone}
                total={dynamicTotal}
              >
                <ReviewPanel
                  missing={missingList}
                  onJump={jumpTo}
                  reviewCount={reviewCount}
                  onOpenProfile={() => changeView("profile")}
                />
                <OtherDocumentsSection
                  studentName={student.name}
                  studentIdentifier={studentIdentifier}
                  uploads={getUploadsFor("otherDocs")}
                  count={otherCount}
                  onUploaded={(fieldId, result) => handleUploaded("otherDocs", fieldId, result)}
                  onRemoved={handleOtherRemoved}
                />
              </DocumentSection>
          </div>
          {view === "profile" && (
            <ReviewContext.Provider value={reviewFields}>
              <PersonalAndRefsSection
                info={personalInfo}
                onChange={updatePersonal}
                autoFilledFields={autoFilledFields}
                reviewCount={reviewCount}
                subStep={profilePage}
                setSubStep={(p) => { setProfilePage(p); window.scrollTo({ top: 0, behavior: "instant" }); }}
                onBack={() => changeView("documents")}
              />
            </ReviewContext.Provider>
          )}
        </div>

        <aside className="sp-rail" aria-label="Application progress">
          <ProgressSummary
            done={requiredDone}
            total={dynamicTotal}
            categories={steps.slice(0, 3).map((s) => ({ id: s.id, label: s.label, done: s.done, total: s.total }))}
            onJump={jumpTo}
          />
          <AIVerificationPanel
            info={personalInfo}
            autoFilled={autoFilledFields}
            review={reviewFields}
            identity={identity}
            onEditProfile={view === "documents" ? () => changeView("profile") : null}
          />
          <DocumentGuidelines maxSize={MAX_FILE_SIZE} />
          <SaveActions
            primaryLabel={primaryLabel}
            onPrimary={saveAndContinue}
            onSave={saveProgress}
            saving={saving}
            note={railNote}
          />
        </aside>
      </div>

      {inWorkspace && (
        <MobileActionBar
          done={requiredDone}
          total={dynamicTotal}
          primaryLabel={primaryLabel}
          onPrimary={saveAndContinue}
          saving={saving}
        />
      )}

      {notice && (
        <div className={`sp-toast is-${notice.tone}`} role="status">
          {notice.tone === "success" ? <CircleCheck size={18} aria-hidden="true" /> : notice.tone === "error" ? <CircleAlert size={18} aria-hidden="true" /> : <TriangleAlert size={18} aria-hidden="true" />}
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {confirmCo && (
        <ConfirmDialog
          title="Remove co-applicants?"
          confirmLabel="Remove"
          danger
          onCancel={() => setConfirmCo(null)}
          onConfirm={() => { handleCoCountChange(confirmCo.count); setConfirmCo(null); }}
        >
          This removes the details and document records entered for{" "}
          <strong>{confirmCo.losing.map((i) => coName(i)).join(", ")}</strong>. You&apos;d need to upload their documents again.
        </ConfirmDialog>
      )}
    </PortalShell>
  );
}

// ─── Field Helpers ─────────────────────────────────────────────────────────────

function FieldBadges({ source, reviewReason }) {
  return (
    <>
      {source && (
        <span className="autofill-badge">
          <Sparkles size={11} aria-hidden="true" /> From {source}
        </span>
      )}
      {reviewReason && (
        <span className="review-badge" title={reviewReason}>
          <TriangleAlert size={11} aria-hidden="true" /> Please check
        </span>
      )}
    </>
  );
}

function FieldShell({ id, label, source, reviewReason, hint, full, children }) {
  return (
    <div className={`input-group${source ? " autofill-group" : ""}${reviewReason ? " review-group" : ""}${full ? " is-full" : ""}`}>
      <label htmlFor={id}>
        <span className="input-label-text">{label}</span>
        <FieldBadges source={source} reviewReason={reviewReason} />
      </label>
      {children}
      {reviewReason && <span className="field-hint field-hint-warn">{reviewReason}</span>}
      {hint && hint}
    </div>
  );
}

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
  const id = useId();
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
  const reviewReason = useContext(ReviewContext)[k];

  return (
    <FieldShell id={id} label={label} source={source} reviewReason={reviewReason} hint={hint}>
      <input
        id={id}
        className={`input-field${source ? " autofill-input" : ""}`}
        type={type}
        inputMode={integerOnly ? "numeric" : numericOnly ? "decimal" : undefined}
        placeholder={placeholder}
        value={info[k] || ""}
        onChange={handleChange}
      />
    </FieldShell>
  );
}

function YearSelect({ label, k, info, onChange, placeholder = "Select year", autoFilledFields = {} }) {
  const id = useId();
  const source = autoFilledFields[k];
  const reviewReason = useContext(ReviewContext)[k];
  return (
    <FieldShell id={id} label={label} source={source} reviewReason={reviewReason}>
      <select
        id={id}
        className={`input-field${source ? " autofill-input" : ""}`}
        value={info[k] || ""}
        onChange={(e) => onChange(k, e.target.value)}
      >
        <option value="">{placeholder}</option>
        {YEARS.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </FieldShell>
  );
}

// options: ["A", "B"] or [{ value, label }]. `fallback` is the value shown
// (and assumed) when nothing has been chosen yet; with it there's no blank option.
function SelectField({ label, k, options, info, onChange, placeholder = "Select", fallback, autoFilledFields = {} }) {
  const id = useId();
  const source = autoFilledFields[k];
  const reviewReason = useContext(ReviewContext)[k];
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <FieldShell id={id} label={label} source={source} reviewReason={reviewReason}>
      <select
        id={id}
        className={`input-field${source ? " autofill-input" : ""}`}
        value={info[k] || fallback || ""}
        onChange={(e) => onChange(k, e.target.value)}
      >
        {fallback === undefined && <option value="">{placeholder}</option>}
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </FieldShell>
  );
}

function TextAreaField({ label, k, info, onChange, placeholder = "", autoFilledFields = {} }) {
  const id = useId();
  const source = autoFilledFields[k];
  const reviewReason = useContext(ReviewContext)[k];
  return (
    <FieldShell id={id} label={label} source={source} reviewReason={reviewReason} full>
      <textarea
        id={id}
        className={`input-field${source ? " autofill-input" : ""}`}
        rows={2}
        placeholder={placeholder}
        value={info[k] || ""}
        onChange={(e) => onChange(k, e.target.value)}
      />
    </FieldShell>
  );
}

// Plain controlled inputs for co-applicant and reference details.
function TextInput({ label, value, onChange, full, ...rest }) {
  const id = useId();
  return (
    <div className={`input-group${full ? " is-full" : ""}`}>
      <label htmlFor={id}><span className="input-label-text">{label}</span></label>
      <input id={id} className="input-field" value={value || ""} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}

function TextArea({ label, value, onChange }) {
  const id = useId();
  return (
    <div className="input-group is-full">
      <label htmlFor={id}><span className="input-label-text">{label}</span></label>
      <textarea id={id} className="input-field" rows={2} value={value || ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function PlainSelect({ label, value, onChange, options, placeholder }) {
  const id = useId();
  return (
    <div className="input-group">
      <label htmlFor={id}><span className="input-label-text">{label}</span></label>
      <select id={id} className="input-field" value={value} onChange={(e) => onChange(e.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const opt = typeof o === "string" ? { value: o, label: o } : o;
          return <option key={opt.value} value={opt.value}>{opt.label}</option>;
        })}
      </select>
    </div>
  );
}

const SCORE_TYPES_SCHOOL = [
  { value: "percentage", label: "Percentage (%)" },
  { value: "marks", label: "Marks" },
  { value: "points", label: "Points (0 – 10)" },
];
const YES_NO = ["Yes", "No"];
const NO_YES = ["No", "Yes"];

// Banks and universities generally want a passport valid well past the
// course start, so warn a year ahead instead of only once it has expired.
function passportExpiryHint(expiry) {
  if (!expiry) return null;
  const d = new Date(expiry);
  if (Number.isNaN(d.getTime())) return null;
  const inAYear = new Date();
  inAYear.setFullYear(inAYear.getFullYear() + 1);
  if (d > inAYear) return null;
  const expired = d < new Date();
  return (
    <span className="field-hint field-hint-warn">
      {expired
        ? "This passport has expired — you'll need to renew it before applying."
        : "This passport expires within a year — consider renewing it before your course starts."}
    </span>
  );
}

function FormGroup({ title, note, children }) {
  return (
    <fieldset className="sp-fieldset">
      <legend className="sp-fieldset__title">{title}</legend>
      {note && <p className="sp-fieldset__note">{note}</p>}
      <div className="sp-form-grid">{children}</div>
    </fieldset>
  );
}

// ─── Personal Info + References (the "My Profile" view) ────────────────────────

function PersonalAndRefsSection({ info, onChange, autoFilledFields, reviewCount, subStep, setSubStep, onBack }) {
  const af = autoFilledFields || {};
  const afCount = Object.keys(af).length;

  return (
    <div className="sp-profile">
      <div className="sp-heading sp-heading--profile">
        <div className="sp-heading__text">
          <button type="button" className="sp-back" onClick={onBack}>
            <ArrowLeft size={15} aria-hidden="true" /> Back to documents
          </button>
          <h1 className="sp-title">My Profile</h1>
          <p className="sp-lede">
            {afCount > 0
              ? "Fields marked “From …” were filled in from your documents. Check them and correct anything that looks wrong — what you type is never overwritten."
              : "Fill in your details across the pages below. Uploading your Passport, Aadhaar and PAN fills many of them in for you."}
          </p>
        </div>
        {(afCount > 0 || reviewCount > 0) && (
          <div className="sp-profile-stats">
            {afCount > 0 && (
              <span className="sp-stat is-ai"><Sparkles size={14} aria-hidden="true" /> {plural(afCount, "field")} filled from documents</span>
            )}
            {reviewCount > 0 && (
              <span className="sp-stat is-warning"><TriangleAlert size={14} aria-hidden="true" /> {plural(reviewCount, "detail")} to check</span>
            )}
          </div>
        )}
      </div>

      <div className="sp-card">
        <div className="sp-tabs" role="tablist" aria-label="Profile pages">
          {PROFILE_PAGES.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              id={`profile-tab-${p.id}`}
              aria-selected={subStep === p.id}
              aria-controls="profile-panel"
              className={`sp-tab${subStep === p.id ? " is-active" : ""}`}
              onClick={() => setSubStep(p.id)}
            >
              <span className="sp-tab__num">{p.id}</span>
              <span className="sp-tab__label">{p.label}</span>
            </button>
          ))}
        </div>

        <div className="sp-tabpanel" role="tabpanel" id="profile-panel" aria-labelledby={`profile-tab-${subStep}`}>
          {/* ── Page 1: Identity & Academic Parameters ── */}
          {subStep === 1 && (
            <>
              <FormGroup title="Identity & academic details">
                <PersonalField label="First name" k="firstName" placeholder="As per passport" info={info} onChange={onChange} autoFilledFields={af} />
                <PersonalField label="Last name" k="lastName" placeholder="As per passport" info={info} onChange={onChange} autoFilledFields={af} />
                <PersonalField label="Mobile & WhatsApp number" k="phone" placeholder="+91 XXXXX XXXXX" info={info} onChange={onChange} />
                <PersonalField label="Email address" k="email" type="email" placeholder="name@example.com" info={info} onChange={onChange} />
                <PersonalField label="Required loan amount (₹)" k="loanAmount" placeholder="e.g. 5000000" info={info} onChange={onChange} integerOnly />
                <PersonalField label="Student CIBIL score" k="studentCibil" placeholder="300 – 900" info={info} onChange={onChange} integerOnly maxVal={900} hint={CIBIL_HINT} autoFilledFields={af} />
                <SelectField label="Marital status — married?" k="marital" options={YES_NO} info={info} onChange={onChange} autoFilledFields={af} />
                <PersonalField label="Highest qualification" k="qualName" placeholder="e.g. B.Tech, MCA, MBA" info={info} onChange={onChange} autoFilledFields={af} />
                <YearSelect label="Qualification passed-out year" k="qualYear" info={info} onChange={onChange} autoFilledFields={af} />
                <PersonalField label="Graduation institution" k="qualInstitution" placeholder="e.g. Anna University" info={info} onChange={onChange} autoFilledFields={af} />
              </FormGroup>

              <FormGroup title="School & graduation scores">
                <SelectField label="10th score type" k="pct10Type" options={SCORE_TYPES_SCHOOL} fallback="percentage" info={info} onChange={onChange} autoFilledFields={af} />
                <PersonalField
                  label={info.pct10Type === "marks" ? "10th marks" : info.pct10Type === "points" ? "10th points (0 – 10)" : "10th percentage (%)"}
                  k="pct10Score"
                  placeholder={info.pct10Type === "marks" ? "e.g. 450" : info.pct10Type === "points" ? "e.g. 8.5" : "e.g. 85.4"}
                  info={info}
                  onChange={onChange}
                  numericOnly
                  maxVal={info.pct10Type === "marks" ? undefined : info.pct10Type === "points" ? 10 : 100}
                  autoFilledFields={af}
                />
                <YearSelect label="10th passed-out year" k="pct10Year" info={info} onChange={onChange} autoFilledFields={af} />

                <SelectField label="12th score type" k="pct12Type" options={SCORE_TYPES_SCHOOL} fallback="percentage" info={info} onChange={onChange} autoFilledFields={af} />
                <PersonalField
                  label={info.pct12Type === "marks" ? "12th / Inter marks" : info.pct12Type === "points" ? "12th / Inter points (0 – 10)" : "Inter / 12th percentage (%)"}
                  k="pct12Score"
                  placeholder={info.pct12Type === "marks" ? "e.g. 480" : info.pct12Type === "points" ? "e.g. 8.0" : "e.g. 82.0"}
                  info={info}
                  onChange={onChange}
                  numericOnly
                  maxVal={info.pct12Type === "marks" ? undefined : info.pct12Type === "points" ? 10 : 100}
                  autoFilledFields={af}
                />
                <YearSelect label="12th passed-out year" k="pct12Year" info={info} onChange={onChange} autoFilledFields={af} />

                <SelectField
                  label="Graduation score type"
                  k="pctGradType"
                  options={[{ value: "percentage", label: "Percentage (%)" }, { value: "cgpa", label: "CGPA (0 – 10)" }]}
                  fallback="percentage"
                  info={info}
                  onChange={onChange}
                  autoFilledFields={af}
                />
                <PersonalField
                  label={info.pctGradType === "cgpa" ? "Graduation CGPA" : "Graduation percentage (%)"}
                  k="pctGradScore"
                  placeholder={info.pctGradType === "cgpa" ? "e.g. 8.2" : "e.g. 74.5"}
                  info={info}
                  onChange={onChange}
                  numericOnly
                  maxVal={info.pctGradType === "cgpa" ? 10 : 100}
                  autoFilledFields={af}
                />
                <YearSelect label="Graduation passed-out year" k="pctGradYear" info={info} onChange={onChange} autoFilledFields={af} />

                <SelectField label="Any active or past backlogs?" k="hasBacklogs" options={NO_YES} info={info} onChange={onChange} autoFilledFields={af} />
                {info.hasBacklogs === "Yes" && (
                  <PersonalField label="Number of backlogs" k="backlogCount" placeholder="e.g. 2" info={info} onChange={onChange} integerOnly maxVal={50} />
                )}
              </FormGroup>

              <FormGroup title="Identity details" note="Read from your Passport, Aadhaar and PAN — check them and correct anything that looks wrong.">
                <PersonalField label="Date of birth" k="dob" type="date" info={info} onChange={onChange} autoFilledFields={af} />
                <SelectField label="Gender" k="gender" options={["Male", "Female", "Other"]} info={info} onChange={onChange} autoFilledFields={af} />
                <PersonalField label="Nationality" k="nationality" placeholder="e.g. Indian" info={info} onChange={onChange} autoFilledFields={af} />
                <PersonalField label="Place of birth" k="placeOfBirth" placeholder="e.g. Hyderabad, Telangana" info={info} onChange={onChange} autoFilledFields={af} />
                <PersonalField label="Passport number" k="passportNumber" placeholder="e.g. Z1234567" info={info} onChange={onChange} autoFilledFields={af} />
                <PersonalField label="Passport date of issue" k="passportIssueDate" type="date" info={info} onChange={onChange} autoFilledFields={af} />
                <PersonalField label="Passport date of expiry" k="passportExpiry" type="date" info={info} onChange={onChange} autoFilledFields={af} hint={passportExpiryHint(info.passportExpiry)} />
                <PersonalField label="Aadhaar number" k="aadhaarNumber" placeholder="XXXX XXXX 1234" info={info} onChange={onChange} autoFilledFields={af} />
                <PersonalField label="PAN number" k="panNumber" placeholder="e.g. ABCPR1234K" info={info} onChange={onChange} autoFilledFields={af} />
              </FormGroup>

              <FormGroup title="Standardised test scores">
                <PersonalField label="GRE score (260 – 340)" k="greScore" placeholder="e.g. 312" info={info} onChange={onChange} integerOnly maxVal={340} autoFilledFields={af} />
                <PersonalField label="IELTS score (0 – 9)" k="ieltsScore" placeholder="e.g. 7.0" info={info} onChange={onChange} numericOnly maxVal={9} autoFilledFields={af} />
                <PersonalField label="Duolingo score (10 – 160)" k="duolingoScore" placeholder="e.g. 120" info={info} onChange={onChange} integerOnly maxVal={160} autoFilledFields={af} />
                <PersonalField label="TOEFL score (0 – 120)" k="toeflScore" placeholder="e.g. 98" info={info} onChange={onChange} integerOnly maxVal={120} autoFilledFields={af} />
                <PersonalField label="GMAT score (200 – 800)" k="gmatScore" placeholder="e.g. 650" info={info} onChange={onChange} integerOnly maxVal={800} autoFilledFields={af} />
                <PersonalField label="PTE score (10 – 90)" k="pteScore" placeholder="e.g. 65" info={info} onChange={onChange} integerOnly maxVal={90} autoFilledFields={af} />
              </FormGroup>
            </>
          )}

          {/* ── Page 2: Destination & Application Context ── */}
          {subStep === 2 && (
            <>
              <FormGroup title="Destination & application">
                <SelectField
                  label="Loan application track"
                  k="loanTrack"
                  options={[{ value: "MS", label: "Master of Science (MS)" }, { value: "Under Graduation", label: "Under Graduation (UG)" }]}
                  placeholder="Select option"
                  info={info}
                  onChange={onChange}
                  autoFilledFields={af}
                />
                <PersonalField label="Destination country" k="destinationCountry" placeholder="e.g. USA" info={info} onChange={onChange} autoFilledFields={af} />
                <PersonalField label="Travelling country & university" k="targetUniversity" placeholder="e.g. USA - UT Dallas" info={info} onChange={onChange} autoFilledFields={af} />
                <PersonalField label="Course name & university" k="courseNameUniversity" placeholder="e.g. Computer Science - UTD" info={info} onChange={onChange} autoFilledFields={af} />
                <SelectField label="I-20 document received?" k="i20Received" options={YES_NO} placeholder="Select option" info={info} onChange={onChange} autoFilledFields={af} />
                <SelectField label="Visa slot booked?" k="visaBooked" options={NO_YES} placeholder="Select status" info={info} onChange={onChange} autoFilledFields={af} />
                {info.visaBooked === "Yes" && (
                  <PersonalField label="Visa slot date" k="visaSlotDate" type="date" info={info} onChange={onChange} autoFilledFields={af} />
                )}
              </FormGroup>

              <FormGroup title="Address">
                <TextAreaField label="Present address (with landmark)" k="currentAddress" placeholder="Door no, street, landmark, PIN code" info={info} onChange={onChange} autoFilledFields={af} />
                <TextAreaField label="Permanent address (with landmark)" k="permanentAddress" placeholder="Same as above, or your permanent address" info={info} onChange={onChange} autoFilledFields={af} />
              </FormGroup>
            </>
          )}

          {/* ── Page 3: Paternal & Maternal Baselines ── */}
          {subStep === 3 && (
            <>
              <FormGroup title="Parents">
                <PersonalField label="Father's name" k="fatherName" info={info} onChange={onChange} autoFilledFields={af} />
                <PersonalField label="Father's mobile & email" k="fatherContact" placeholder="Phone / email" info={info} onChange={onChange} />
                <PersonalField label="Father's CIBIL score (300 – 900)" k="fatherCibil" placeholder="e.g. 780" info={info} onChange={onChange} integerOnly maxVal={900} hint={CIBIL_HINT} />
                <PersonalField label="Mother's name" k="motherName" info={info} onChange={onChange} autoFilledFields={af} />
                <PersonalField label="Mother's mobile & email" k="motherContact" info={info} onChange={onChange} />
                <PersonalField label="Mother's CIBIL score (300 – 900)" k="motherCibil" placeholder="e.g. 760" info={info} onChange={onChange} integerOnly maxVal={900} hint={CIBIL_HINT} />
              </FormGroup>

              <FormGroup title="Financial guarantor">
                <PersonalField label="Guarantor's name" k="guarantorName" info={info} onChange={onChange} />
                <PersonalField label="Relationship to you" k="guarantorRelation" placeholder="e.g. Uncle" info={info} onChange={onChange} />
                <PersonalField label="Guarantor's mobile number" k="guarantorMobile" info={info} onChange={onChange} />
                <PersonalField label="Guarantor's CIBIL score (300 – 900)" k="guarantorCibil" placeholder="e.g. 800" info={info} onChange={onChange} integerOnly maxVal={900} hint={CIBIL_HINT} />
                <PersonalField label="Guarantor's sector (job / business)" k="guarantorSector" placeholder="e.g. Software business" info={info} onChange={onChange} />
                <SelectField label="Income documents available?" k="guarantorDocsAvailable" options={YES_NO} placeholder="Select option" info={info} onChange={onChange} />
              </FormGroup>

              <FormGroup title="Extended family">
                <PersonalField label="Maternal grandmother's name" k="maternalGrandma" info={info} onChange={onChange} />
                <PersonalField label="Paternal grandmother's name" k="paternalGrandma" info={info} onChange={onChange} />
              </FormGroup>
            </>
          )}

          {/* ── Page 4: Prior History & Assets ── */}
          {subStep === 4 && (
            <>
              <FormGroup title="Prior loan history & assets">
                <SelectField label="Applied to any bank before?" k="priorBankApplied" options={NO_YES} placeholder="Select option" info={info} onChange={onChange} />
                {info.priorBankApplied === "Yes" && (
                  <SelectField
                    label="Which bank?"
                    k="priorBankName"
                    placeholder="Select bank"
                    options={[
                      "HDFC Bank",
                      "HDFC Credila Financial Services",
                      "Avanse Financial Services",
                      "Auxilo Finserve",
                      "InCred Finance",
                      "Tata Capital",
                      "Poonawalla Fincorp",
                      "IDFC FIRST Bank",
                      "ICICI Bank",
                      "Axis Bank",
                      "YES Bank",
                      "Others",
                    ]}
                    info={info}
                    onChange={onChange}
                  />
                )}
                {info.priorBankApplied === "Yes" && info.priorBankName === "Others" && (
                  <PersonalField label="Bank name" k="priorBankNameCustom" placeholder="Type bank name here" info={info} onChange={onChange} />
                )}
                <SelectField label="Family owns a house?" k="ownHouseStatus" options={YES_NO} placeholder="Select status" info={info} onChange={onChange} />
              </FormGroup>

              <FormGroup title="Your work experience">
                <SelectField label="Do you have a job?" k="hasJobDetails" options={NO_YES} info={info} onChange={onChange} />
                {info.hasJobDetails === "Yes" && (
                  <PersonalField label="Salary per month & total experience" k="jobSpecs" placeholder="e.g. ₹45,000 - 2 years" info={info} onChange={onChange} />
                )}
              </FormGroup>

              <FormGroup title="Overseas education consultant">
                <PersonalField label="Consultant name & location" k="consultantNameLoc" placeholder="Name and city branch" info={info} onChange={onChange} />
                <PersonalField label="Consultant phone & email" k="consultantContact" placeholder="Contact details" info={info} onChange={onChange} />
              </FormGroup>
            </>
          )}

          {/* ── Page 5: References ── */}
          {subStep === 5 && <ReferencesContent info={info} onChange={onChange} />}

          <div className="sp-pager">
            <button type="button" className="rail-btn rail-btn--secondary" disabled={subStep === 1} onClick={() => setSubStep(subStep - 1)}>
              <ArrowLeft size={15} aria-hidden="true" /> Previous page
            </button>
            <span className="sp-pager__pos">Page {subStep} of {PROFILE_PAGES.length}</span>
            <button type="button" className="rail-btn rail-btn--secondary" disabled={subStep === PROFILE_PAGES.length} onClick={() => setSubStep(subStep + 1)}>
              Next page <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
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
    <>
      <p className="sp-fieldset__note">Provide details of 2 references who can vouch for the student.</p>
      {[1, 2].map((n) => {
        const relationKey       = `ref${n}_relation`;
        const customRelationKey = `ref${n}_custom_relation`;
        const currentRelation   = info[relationKey] || "";
        const set = (suffix) => (v) => onChange(`ref${n}_${suffix}`, v);

        return (
          <FormGroup key={n} title={`Reference ${n}`}>
            <TextInput label="Name" value={info[`ref${n}_name`]} onChange={set("name")} />
            <TextInput label="Mobile" value={info[`ref${n}_mobile`]} onChange={set("mobile")} inputMode="tel" />
            <TextInput label="Occupation" value={info[`ref${n}_occupation`]} onChange={set("occupation")} />
            <PlainSelect
              label="Relation to student"
              value={currentRelation}
              placeholder="Select relation"
              options={REFERENCE_RELATIONS}
              onChange={(v) => {
                onChange(relationKey, v);
                if (v !== "Other") onChange(customRelationKey, "");
              }}
            />
            {currentRelation === "Other" && (
              <TextInput
                label="Specify relation"
                placeholder="e.g. Mother's distant cousin"
                value={info[customRelationKey]}
                onChange={(v) => onChange(customRelationKey, v)}
                full
              />
            )}
            <TextInput label="House number" value={info[`ref${n}_house_number`]} onChange={set("house_number")} />
            <TextInput label="Street name" value={info[`ref${n}_street_name`]} onChange={set("street_name")} />
            <TextInput label="City" value={info[`ref${n}_city`]} onChange={set("city")} />
            <TextInput label="State" value={info[`ref${n}_state`]} onChange={set("state")} />
            <TextInput
              label="Pincode"
              inputMode="numeric"
              value={info[`ref${n}_pincode`]}
              onChange={(v) => onChange(`ref${n}_pincode`, v.replace(/[^0-9]/g, "").slice(0, 6))}
            />
          </FormGroup>
        );
      })}
    </>
  );
}

// ─── Document grid ─────────────────────────────────────────────────────────────

// Required documents first, optional ones under their own heading.
function DocGrid({ sectionKey, fields, studentName, studentIdentifier, subFolder, uploads, onUploaded, extractionsFor, onExtracted }) {
  const card = (field) => (
    <FileUploadBox
      key={field.id}
      anchorId={docAnchorId(sectionKey, field.id)}
      field={field}
      studentName={studentName}
      studentIdentifier={studentIdentifier}
      subFolder={subFolder}
      uploadedFiles={uploads}
      onUploaded={(fieldId, result) => onUploaded(fieldId, result)}
      extraction={extractionsFor?.(field.id)}
      onExtracted={onExtracted}
    />
  );
  const req = fields.filter((f) => !f.optional);
  const opt = fields.filter((f) => f.optional);
  return (
    <>
      {req.length > 0 && <div className="doc-grid">{req.map(card)}</div>}
      {opt.length > 0 && (
        <div className={req.length ? "doc-subgroup" : undefined}>
          <h3 className="doc-subgroup__title">
            Optional documents <span>— add them if you have them</span>
          </h3>
          <div className="doc-grid">{opt.map(card)}</div>
        </div>
      )}
    </>
  );
}

// ─── Loan Section (co-applicants) ──────────────────────────────────────────────

const EMP_LABEL = { salaried: "Salaried", selfEmployed: "Self-employed", other: "Other / retired" };

function LoanSection({ studentName, studentIdentifier, coCount, setCoCount, uploads, onUploaded, extractions = {}, onExtracted, personalInfo, onInfoChange, coFieldsFor }) {
  const [expandedCo, setExpandedCo] = useState(0);
  const coRelations = ["Father", "Mother", "Sibling", "Spouse", "Other"];
  const countLabelId = useId();

  return (
    <div className="co-wrap">
      <div className="co-count">
        <div>
          <p className="co-count__label" id={countLabelId}>Number of co-applicants</p>
          <p className="co-count__hint">Usually a parent. Add up to 5.</p>
        </div>
        <div className="co-count__seg" role="radiogroup" aria-labelledby={countLabelId}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={coCount === n}
              className={`co-count__opt${coCount === n ? " is-active" : ""}`}
              onClick={() => setCoCount(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {Array.from({ length: coCount }, (_, i) => {
        const key      = `co_${i}`;
        const infoKey  = `co_info_${i}`;
        const coInfo   = personalInfo[infoKey] || {};
        const empType         = coInfo.empType || "salaried";
        const financialStatus = coInfo.financialStatus || "financial";
        const isOpen   = expandedCo === i;
        const fields   = coFieldsFor(i);
        const reqFields = fields.filter((f) => !f.optional);

        const coUploads = uploads[key] || {};
        const coDisplayName = [coInfo.firstName, coInfo.lastName].filter(Boolean).join(" ") || coInfo.name || "";
        const done = countUploadedFields(coUploads, reqFields);
        const complete = reqFields.length > 0 && done >= reqFields.length;
        const typeLabel = financialStatus === "non-financial" ? "Non-financial" : `Financial · ${EMP_LABEL[empType] || "Salaried"}`;
        const set = (field) => (v) => onInfoChange(infoKey, { ...coInfo, [field]: v });
        const bodyId = `co-body-${i}`;

        return (
          <div key={i} className={`co-card${isOpen ? " is-open" : ""}`}>
            <button
              className="co-card__head"
              type="button"
              onClick={() => setExpandedCo(isOpen ? -1 : i)}
              aria-expanded={isOpen}
              aria-controls={bodyId}
            >
              <span className={`co-avatar${complete ? " is-complete" : ""}`} aria-hidden="true">
                {complete ? <CircleCheck size={18} /> : <Users size={18} />}
              </span>
              <span className="co-card__titles">
                <span className="co-card__title">
                  {coDisplayName || `Co-applicant ${i + 1}`}
                  {coInfo.relation && <span className="co-card__rel"> · {coInfo.relation}</span>}
                </span>
                <span className="co-card__meta">
                  {coDisplayName ? `Co-applicant ${i + 1} · ` : ""}{typeLabel}
                </span>
              </span>
              <span className={`co-card__count${complete ? " is-complete" : ""}`}>
                {done}/{reqFields.length}<span className="co-card__count-word"> required</span>
              </span>
              <ChevronDown size={18} className="co-card__chev" aria-hidden="true" />
            </button>

            <div className="co-card__body" id={bodyId} hidden={!isOpen}>
              <div className="sp-form-grid co-type">
                <PlainSelect
                  label="Applicant responsibility"
                  value={financialStatus}
                  options={[{ value: "financial", label: "Financial applicant" }, { value: "non-financial", label: "Non-financial applicant" }]}
                  onChange={set("financialStatus")}
                />
                {financialStatus !== "non-financial" && (
                  <PlainSelect
                    label="Employment type"
                    value={empType}
                    options={[
                      { value: "salaried", label: "Salaried" },
                      { value: "selfEmployed", label: "Self-employed / business" },
                      { value: "other", label: "Other / retired" },
                    ]}
                    onChange={set("empType")}
                  />
                )}
              </div>

              <h3 className="co-subhead">
                {financialStatus === "non-financial"
                  ? "Documents — non-financial co-applicant (Aadhaar, PAN, photo)"
                  : `Documents — ${empType === "salaried" ? "salaried" : empType === "selfEmployed" ? "self-employed" : "basic"} financial co-applicant`}
              </h3>
              <div className="doc-grid">
                {fields.map((field) => {
                  const statusSlug = financialStatus === "financial" ? "Financial" : "NonFinancial";
                  return (
                    <FileUploadBox
                      key={field.id}
                      anchorId={docAnchorId(key, field.id)}
                      field={{
                        ...field,
                        rename: `Co${i + 1}_${coDisplayName.replace(/\s+/g, "_") || `Applicant${i + 1}`}_${statusSlug}_${field.rename}`,
                      }}
                      studentName={studentName}
                      studentIdentifier={studentIdentifier}
                      subFolder={`Loan/Co_Applicant_${i + 1}`}
                      uploadedFiles={coUploads}
                      onUploaded={(fieldId, result) => onUploaded(key, fieldId, result)}
                      extraction={extractions[`${key}.${field.id}`]}
                      onExtracted={(fieldId, payload) => onExtracted?.(key, fieldId, payload)}
                    />
                  );
                })}
              </div>

              <h3 className="co-subhead">Co-applicant details</h3>
              <div className="sp-form-grid">
                <TextInput label="First name" placeholder="Co-applicant first name" value={coInfo.firstName} onChange={set("firstName")} />
                <TextInput label="Last name" placeholder="Co-applicant last name" value={coInfo.lastName} onChange={set("lastName")} />
                <TextInput label="Date of birth" type="date" value={coInfo.dob} onChange={set("dob")} />
                <TextInput label="PAN number" placeholder="e.g. ABCPR1234K" value={coInfo.panNumber} onChange={(v) => onInfoChange(infoKey, { ...coInfo, panNumber: v.toUpperCase() })} />
                <TextInput label="Aadhaar number" placeholder="XXXX XXXX 1234" value={coInfo.aadhaarNumber} onChange={set("aadhaarNumber")} />
                <TextInput label="Occupation" placeholder="e.g. Software Engineer" value={coInfo.occupation} onChange={set("occupation")} />
                {financialStatus !== "non-financial" && (
                  <TextInput
                    label="Annual income (₹)"
                    inputMode="numeric"
                    placeholder="e.g. 600000"
                    value={coInfo.annualIncome}
                    onChange={(v) => onInfoChange(infoKey, { ...coInfo, annualIncome: v.replace(/[^0-9]/g, "") })}
                  />
                )}
                <PlainSelect label="Relation to student" value={coInfo.relation || ""} placeholder="Select" options={coRelations} onChange={set("relation")} />
                <TextInput
                  label="Mobile number"
                  inputMode="numeric"
                  placeholder="10-digit mobile number"
                  value={coInfo.mobile}
                  onChange={(v) => onInfoChange(infoKey, { ...coInfo, mobile: v.replace(/[^0-9]/g, "").slice(0, 10) })}
                />
                <TextInput label="Email address" type="email" placeholder="email@example.com" value={coInfo.email} onChange={set("email")} />
                <TextInput label="Qualifications" placeholder="e.g. B.Com, MBA" value={coInfo.qualifications} onChange={set("qualifications")} />
                <TextInput
                  label="Number of dependants"
                  inputMode="numeric"
                  placeholder="e.g. 3"
                  value={coInfo.dependants}
                  onChange={(v) => onInfoChange(infoKey, { ...coInfo, dependants: v.replace(/[^0-9]/g, "") })}
                />
                <TextInput
                  label="Years at current address"
                  inputMode="numeric"
                  placeholder="e.g. 10"
                  value={coInfo.yearsAddress}
                  onChange={(v) => onInfoChange(infoKey, { ...coInfo, yearsAddress: v.replace(/[^0-9]/g, "") })}
                />
                <TextArea label="Current address" value={coInfo.currentAddress} onChange={set("currentAddress")} />
                <TextArea label="Permanent address" value={coInfo.permanentAddress} onChange={set("permanentAddress")} />
                {financialStatus !== "non-financial" && (
                  <TextArea label="Business / office address" value={coInfo.officeAddress} onChange={set("officeAddress")} />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Review checklist ──────────────────────────────────────────────────────────

function ReviewPanel({ missing, onJump, reviewCount, onOpenProfile }) {
  return (
    <div className="review">
      {missing.length === 0 ? (
        <p className="review__ok">
          <CircleCheck size={18} aria-hidden="true" /> All required documents are uploaded.
        </p>
      ) : (
        <div className="review__list-wrap">
          <p className="review__title">
            <TriangleAlert size={16} aria-hidden="true" /> Still needed ({missing.length})
          </p>
          <ul className="review__list">
            {missing.map((m) => (
              <li key={m.key}>
                <button type="button" className="review__item" onClick={() => onJump(m.target)}>
                  <span className="review__group">{m.group}</span>
                  <span className="review__label">{m.label}</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" className="review__profile" onClick={onOpenProfile}>
        <UserRound size={18} aria-hidden="true" />
        <span>
          <strong>Check your profile</strong>
          <span>{reviewCount > 0 ? `${plural(reviewCount, "detail")} read from your documents need a quick check.` : "Confirm the details we filled in and add the rest."}</span>
        </span>
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

// ─── Other Documents Section ───────────────────────────────────────────────────

function OtherDocumentsSection({ studentName, studentIdentifier, uploads, count, onUploaded, onRemoved }) {
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
    label: item.fileName ? `Document: ${item.fileName}` : "New document (enter a name first)",
    rename: item.fileName ? item.fileName.replace(/\s+/g, "_") : "custom_document",
    accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    optional: true,
  });

  return (
    <div className="other-docs">
      <div className="other-docs__head">
        <span className="other-docs__icon" aria-hidden="true"><FolderOpen size={18} /></span>
        <div>
          <h3 className="other-docs__title">Other documents</h3>
          <p className="other-docs__desc">
            Anything else your advisor asked for — scholarship letters, affidavits, and so on. Each one gets its own name.
            {count > 0 ? ` ${plural(count, "document")} added.` : ""}
          </p>
        </div>
      </div>
      {items.length > 0 && (
        <div className="doc-grid">
          {items.map((item) => (
            <div key={item.id} className="custom-doc">
              <div className="custom-doc__head">
                <TextInput
                  label="Document name"
                  placeholder="e.g. Scholarship_Letter"
                  value={item.fileName}
                  onChange={(v) => updateFileName(item.id, v)}
                />
                <button className="doc-icon-btn doc-icon-btn--danger" type="button" onClick={() => removeItem(item.id)} aria-label="Remove this document slot" title="Remove">
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
              <FileUploadBox
                anchorId={docAnchorId("otherDocs", item.id)}
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
        </div>
      )}
      <button className="rail-btn rail-btn--secondary other-docs__add" type="button" onClick={addNewItem}>
        <Plus size={16} aria-hidden="true" /> Add a document
      </button>
    </div>
  );
}
