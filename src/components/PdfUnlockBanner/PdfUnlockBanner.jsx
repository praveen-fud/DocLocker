import { LockKeyhole, ExternalLink } from "lucide-react";
import "./PdfUnlockBanner.css";

export default function PdfUnlockBanner() {
  return (
    <a
      className="pdf-unlock-banner"
      href="https://www.ilovepdf.com/unlock_pdf"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Unlock a password-protected PDF before uploading, opens ilovepdf.com in a new tab"
    >
      <span className="pdf-unlock-icon" aria-hidden="true">
        <LockKeyhole size={16} />
      </span>
      <span className="pdf-unlock-text">
        <strong>Password-protected PDF?</strong>
        <span>Unlock it for free before uploading — bank statements often are.</span>
        <span className="pdf-unlock-link">
          Unlock on ilovepdf.com <ExternalLink size={12} aria-hidden="true" />
        </span>
      </span>
    </a>
  );
}
