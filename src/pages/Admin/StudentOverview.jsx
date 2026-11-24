// The top of a student's Overview: will they get a loan (at a glance), and
// the lenders they tried before. Rules: utils/loanChance.js.
import { AlertTriangle, CheckCircle, CircleHelp, History, Landmark, XCircle } from "lucide-react";
import { getBankLogo } from "../../utils/bankOptions";
import { priorBanksOf, reasonHint, reasonLabel } from "../../utils/previousLenders";
import "./StudentOverview.css";

const STATUS = {
  good: { Icon: CheckCircle, word: "Good" },
  fair: { Icon: AlertTriangle, word: "Fair" },
  risk: { Icon: XCircle, word: "Risk" },
  unknown: { Icon: CircleHelp, word: "Missing" },
};

export function LoanChanceCard({ chance }) {
  const { level, title, text, factors, next, good } = chance;
  return (
    <section className={`lc lc--${level}`} aria-labelledby="lc-title">
      <div className="lc-head">
        <div className="lc-verdict">
          <span className="lc-eyebrow"><Landmark size={14} aria-hidden="true" /> Loan chance</span>
          <h3 className="lc-title" id="lc-title">{title}</h3>
          <p className="lc-text">{text}</p>
        </div>
        <div className="lc-meter" aria-label={`${good} of ${factors.length} checks good`}>
          <div className="lc-bars" aria-hidden="true">
            {factors.map((f) => <span key={f.key} className={`lc-bar is-${f.status}`} title={`${f.label}: ${STATUS[f.status].word}`} />)}
          </div>
          <span className="lc-count"><strong>{good}</strong> of {factors.length} checks good</span>
        </div>
      </div>

      <ul className="lc-factors">
        {factors.map((f) => {
          const { Icon, word } = STATUS[f.status];
          return (
            <li key={f.key} className={`lc-factor is-${f.status}`}>
              <Icon size={17} className="lc-icon" aria-hidden="true" />
              <div className="lc-factor-body">
                <span className="lc-label">{f.label}<span className="lc-sr"> — {word}</span></span>
                <strong className="lc-value">{f.value}</strong>
                <span className="lc-detail">{f.detail}</span>
              </div>
            </li>
          );
        })}
      </ul>

      {next.length > 0 && (
        <div className="lc-next">
          <strong>What would help most</strong>
          <ol>{next.map((t) => <li key={t}>{t}</li>)}</ol>
        </div>
      )}
      <p className="lc-foot">An indicator from the student’s answers and documents, not a lender’s decision.</p>
    </section>
  );
}

export function PriorLendersCard({ personalInfo = {} }) {
  const answer = personalInfo.priorBankApplied;
  const lenders = priorBanksOf(personalInfo);
  const summary = answer === "Yes"
    ? (lenders.length ? `Yes · ${lenders.length} lender${lenders.length === 1 ? "" : "s"}` : "Yes")
    : answer === "No" ? "No · first application" : "Not answered";
  const tone = answer === "Yes" ? "yes" : answer === "No" ? "no" : "none";
  return (
    <section className="sp-card slp" aria-labelledby="slp-title">
      <h3 className="sp-card-title" id="slp-title"><History size={16} /> Lenders tried before</h3>
      <div className="slp-qa">
        <span className="slp-q">Applied to any bank before?</span>
        <span className={`slp-a is-${tone}`}>{summary}</span>
      </div>
      {answer === "Yes" && lenders.length > 0 && (
        <ul className="slp-list">
          {lenders.map((l) => (
            <li key={l.bank} className="slp-row">
              <img src={getBankLogo(l.bank)} alt="" className="slp-logo" />
              <div className="slp-body">
                <div className="slp-line">
                  <strong className="slp-bank">{l.bank}</strong>
                  {l.reason
                    ? <span className="slp-reason" title={reasonHint(l.reason)}>{reasonLabel(l.reason)}</span>
                    : <span className="slp-reason is-missing">Reason not given</span>}
                </div>
                {/* "Other": the student's note says why; the hint is the student's prompt */}
                {l.reason && l.reason !== "other" && <p className="slp-hint">{reasonHint(l.reason)}</p>}
                {l.note && <p className="slp-note">“{l.note}”</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {answer === "Yes" && lenders.length > 0 && (
        <p className="slp-tip">Don’t share this file with these lenders again until the reason is fixed.</p>
      )}
      {!answer && <p className="slp-empty">The student hasn’t answered this yet. It’s on the Background page of their application.</p>}
    </section>
  );
}
