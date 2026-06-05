import { CheckCircle, Circle, Clock } from 'lucide-react';
import './ProgressBar.css';

export default function ProgressBar({ sections, currentSection, onSectionClick }) {
  const total = sections.reduce((s, sec) => s + sec.total, 0);
  const uploaded = sections.reduce((s, sec) => s + sec.uploaded, 0);
  const percent = total > 0 ? Math.round((uploaded / total) * 100) : 0;

  return (
    <div className="progress-container">
      <div className="progress-header">
        <div className="progress-title">
          <span>Upload Progress</span>
          <span className="progress-count">{uploaded} / {total} files</span>
        </div>
        <div className="progress-percent">{percent}%</div>
      </div>

      <div className="progress-track">
        <div className="progress-fill-main" style={{ width: `${percent}%` }} />
      </div>

      <div className="progress-sections">
        {sections.map((sec, i) => {
            const isActive = currentSection === i;
          const isDone = sec.uploaded === sec.total && sec.total > 0;
          return (
            <button
              key={sec.id}
              className={`section-pill ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
              onClick={() => onSectionClick?.(i)}
            >
              <span className="section-icon">
                {isDone ? <CheckCircle size={12} /> : isActive ? <Clock size={12} /> : <Circle size={12} />}
              </span>
              <span className="section-name">{sec.label}</span>
              <span className="section-frac">{sec.uploaded}/{sec.total}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
