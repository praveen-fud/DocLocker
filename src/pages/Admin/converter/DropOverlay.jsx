// While files are dragged over the workspace: a small "hold Shift" hint at
// the cursor, and with Shift held, a glowing target saying what a drop does.
import { ArrowRightLeft } from "lucide-react";

export default function DropOverlay({ shift, x, y }) {
  if (!shift) {
    return (
      <div className="cv-drag-hint" style={{ left: x + 18, top: y + 18 }} aria-hidden="true">
        Hold <kbd>⇧ Shift</kbd> to convert
      </div>
    );
  }
  return (
    <div className="cv-drag" aria-hidden="true">
      <div className="cv-drag__target" style={{ left: x, top: y }}>
        <span className="cv-drag__orbit" />
        <span className="cv-drag__core"><ArrowRightLeft size={26} /></span>
        <span className="cv-drag__text">Release to convert</span>
      </div>
    </div>
  );
}
