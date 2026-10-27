import { LockKeyhole, ExternalLink } from "lucide-react";
import { PDF_UNLOCK_URL } from "../../utils/pdfUnlock";
import "./PdfUnlockBanner.css";

export default function PdfUnlockBanner() {
  return (
    <a
      className="pdf-unlock-banner"
      href={PDF_UNLOCK_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Unlock a password-protected PDF before uploading, opens Nexfile in a new tab"
    >
      <span className="pdf-unlock-icon" aria-hidden="true">
        <LockKeyhole size={16} />
      </span>
      <span className="pdf-unlock-text">
        <strong>Password-protected PDF?</strong>
        <span>Unlock it before uploading. Bank statements, payslips and ITRs often have one.</span>
        <span className="pdf-unlock-link">
          Unlock on Nexfile <ExternalLink size={12} aria-hidden="true" />
        </span>
      </span>
    </a>
  );
}
