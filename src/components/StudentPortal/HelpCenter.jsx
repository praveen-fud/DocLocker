import { ChevronDown, Headset, FileText } from "lucide-react";
import { DocumentGuidelines } from "./PortalRail";
import { initials } from "./studentRecord";
import "./StudentDashboard.css";
import "./PortalViews.css";

const FAQ = [
  {
    q: "I forgot my PIN. What do I do?",
    a: "Ask your advisor to reset it. Then open your application again with your email or mobile number and choose a new PIN. After five wrong tries your application locks for 15 minutes to keep it safe.",
  },
  {
    q: "Which file types can I upload?",
    a: "Most documents accept PDF, JPG or PNG (many also take DOC or DOCX). If a file isn’t accepted, the card tells you which types it takes. To scan a paper document, tap Camera on the card — line the document up in the frame and we crop it for you.",
  },
  {
    q: "Is there a file size limit?",
    a: (max) => `Each file can be up to ${max}. Large photos are resized before they are uploaded.`,
  },
  {
    q: "My PDF is password-protected. What do I do?",
    a: "Unlock it before uploading: bank statements, payslips and ITRs often have a password. Use the \"Unlock on Nexfile\" link on the document's card or under Document guidelines, then upload the unlocked file.",
  },
  {
    q: "How does auto-fill work?",
    a: "When you upload your Passport, Aadhaar, PAN card, 10th or 12th marksheet, or a score report such as GRE or IELTS, we read the details and fill them into your profile. Fields filled this way are marked “From …” so you can check them, and anything you type yourself is never overwritten.",
  },
  {
    q: "What do Verified, Uploaded and Needs attention mean?",
    a: "Verified means our reader confirmed the document matches its slot and read its details cleanly. Uploaded means the file is saved but wasn't checked automatically. Needs attention means a page is missing or some details should be checked.",
  },
  {
    q: "What is the Application Form?",
    a: "Each time you save your progress, we prepare an Application Form (PDF) from your profile and documents for your advisor, so there is nothing extra for you to fill in.",
  },
];

export default function HelpCenter({ student, maxSize, onOpenDocuments }) {
  return (
    <div className="sd-page sd-view">
      <div className="sd-view__head">
        <h1 className="sd-view__title">Help &amp; Support</h1>
        <p className="sd-view__lede">Answers to common questions, and who to ask when you are stuck.</p>
      </div>

      <div className="sd-view__grid">
        <div className="sd-view__main">
          <section className="sd-card" aria-labelledby="sd-faq-title">
            <h2 className="sd-card__title" id="sd-faq-title">Frequently asked questions</h2>
            <div className="sd-faq">
              {FAQ.map((f) => (
                <details key={f.q} className="sd-faq__item">
                  <summary>
                    <span>{f.q}</span>
                    <ChevronDown size={18} aria-hidden="true" />
                  </summary>
                  <p>{typeof f.a === "function" ? f.a(maxSize) : f.a}</p>
                </details>
              ))}
            </div>
          </section>

          <button type="button" className="sd-card sd-linkcard" onClick={onOpenDocuments}>
            <span className="sd-linkcard__icon" aria-hidden="true"><FileText size={20} /></span>
            <span className="sd-linkcard__text">
              <strong>Go to your documents</strong>
              <span>Upload, replace or check each document.</span>
            </span>
          </button>
        </div>

        <div className="sd-view__side">
          <section className="sd-card sd-advisor" aria-labelledby="sd-advisor-title">
            <h2 className="sd-card__title" id="sd-advisor-title">Your finance advisor</h2>
            {student.advisor ? (
              <div className="sd-advisor__who">
                <span className="sd-advisor__avatar" aria-hidden="true">{initials(student.advisor)}</span>
                <span>
                  <strong>{student.advisor}</strong>
                  <span>Your point of contact for this application</span>
                </span>
              </div>
            ) : (
              <p className="sd-muted">No advisor is assigned to your application yet.</p>
            )}
            <p className="sd-callout">
              <Headset size={16} aria-hidden="true" />
              <span>Not sure which document to upload or what a status means? Ask your advisor.</span>
            </p>
          </section>

          <DocumentGuidelines maxSize={maxSize} />
        </div>
      </div>
    </div>
  );
}
