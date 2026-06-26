import { Unlock, ExternalLink } from "lucide-react";
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
      <div className="pdf-unlock-track">
        <div className="pdf-unlock-marquee">
          {Array.from({ length: 2 }).map((_, i) => (
            <span className="pdf-unlock-msg" key={i}>
              <Unlock size={14} />
              Got a password-protected PDF? Unlock it free before uploading — click here to unlock your PDF instantly
              <ExternalLink size={12} />
            </span>
          ))}
        </div>
      </div>
    </a>
  );
}
