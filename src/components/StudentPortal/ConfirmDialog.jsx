import { useEffect, useId, useRef } from "react";
import { TriangleAlert } from "lucide-react";

// Uses the shared .modal-* styles from index.css.
export default function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel, danger = false }) {
  const cancelRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement;
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-box" role="alertdialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <div className={`modal-icon${danger ? " danger" : ""}`} aria-hidden="true">
          <TriangleAlert size={28} />
        </div>
        <h3 id={titleId}>{title}</h3>
        <p>{children}</p>
        <div className="modal-actions">
          <button ref={cancelRef} type="button" className="rail-btn rail-btn--secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className={`rail-btn ${danger ? "rail-btn--danger" : "rail-btn--primary"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
