import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus, Search, X, RefreshCw, AlertCircle, AlertTriangle, MoreVertical, Pencil, KeyRound, Ban,
  CheckCircle, Trash2, Eye, EyeOff, Wand2, Copy, Check, Building2, Link2, Users, Landmark, ShieldCheck, UserRound,
  ImagePlus,
} from "lucide-react";
import { BANK_OPTIONS } from "../../utils/bankOptions";
import { callAPI, uploadAPI, ROLE_LABELS, passwordProblem, generatePassword } from "../../utils/adminApi";
import { companyLogoSrc } from "../../utils/company";
import "./TeamCompanies.css";

// Team: every sign-in account the caller manages (superadmin: all
// companies; company admin: their own). Companies: superadmin only.

const ROLE_ORDER = ["superadmin", "admin", "advisor", "banker"];
const ROLE_PLURALS = { superadmin: "Super admins", admin: "Admins", advisor: "Staff", banker: "Lenders" };
// Roles each caller may give — mirrors services/accounts.js manageableRoles
const GRANTABLE = {
  superadmin: ["superadmin", "admin", "advisor", "banker"],
  admin: ["admin", "advisor", "banker"],
};

function initials(name = "") {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || "?") + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
}

function timeAgo(ts) {
  if (!ts) return "Never";
  const min = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function signupLink(slug) {
  return `${window.location.origin}/c/${slug}`;
}

/* ── Shared bits ─────────────────────────────────────────────────── */

function Drawer({ title, sub, onClose, children, footer }) {
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);
  return createPortal(
    <div className="tm-backdrop" onClick={onClose}>
      <aside className="tm-drawer" role="dialog" aria-modal="true" aria-labelledby="tm-drawer-title" onClick={(e) => e.stopPropagation()}>
        <header className="tm-drawer-head">
          <div>
            <h2 id="tm-drawer-title">{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" ref={closeRef} className="tm-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="tm-drawer-body">{children}</div>
        {footer && <footer className="tm-drawer-foot">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}

function Field({ label, hint, error, children, as: Tag = "label" }) {
  return (
    <Tag className={`tm-field${error ? " has-error" : ""}`}>
      <span className="tm-label">{label}{hint && <small>{hint}</small>}</span>
      {children}
      {error && <span className="tm-field-error">{error}</span>}
    </Tag>
  );
}

function PasswordInput({ value, onChange, autoFocus, placeholder = "At least 10 characters, with a number" }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const problem = value ? passwordProblem(value) : null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <>
      <span className="tm-pw">
        <input
          className="tm-input"
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
          autoFocus={autoFocus}
        />
        <button type="button" className="tm-pw-btn" onClick={() => setShown((s) => !s)} aria-label={shown ? "Hide password" : "Show password"}>
          {shown ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
      <span className="tm-pw-tools">
        <button type="button" className="tm-link" onClick={() => { onChange(generatePassword()); setShown(true); }}>
          <Wand2 size={14} /> Generate
        </button>
        {value && (
          <button type="button" className="tm-link" onClick={copy}>
            {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
          </button>
        )}
        <span className={`tm-pw-hint${problem ? " is-bad" : value ? " is-ok" : ""}`}>
          {problem || (value ? "Strong enough" : "Share it with them privately")}
        </span>
      </span>
    </>
  );
}

function RowMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const visible = items.filter(Boolean);
  if (!visible.length) return <span className="tm-menu-spacer" />;
  return (
    <div className="tm-menu" ref={ref}>
      <button type="button" className="tm-icon-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Actions" onClick={() => setOpen((o) => !o)}>
        <MoreVertical size={17} />
      </button>
      {open && (
        <div className="tm-menu-list" role="menu">
          {visible.map(({ label, icon: Icon, onSelect, danger }) => (
            <button key={label} type="button" role="menuitem" className={`tm-menu-item${danger ? " is-danger" : ""}`} onClick={() => { setOpen(false); onSelect(); }}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Team ───────────────────────────────────────────────────────── */

export function TeamSection({ adminRole, adminId, onTeamChanged }) {
  const isSuper = adminRole === "superadmin";
  const [accounts, setAccounts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [onlyNoEmail, setOnlyNoEmail] = useState(false);
  const [editing, setEditing] = useState(null); // account | "new"
  const [resetting, setResetting] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [a, c] = await Promise.all([
      callAPI("GET", "/api/admins"),
      isSuper ? callAPI("GET", "/api/companies") : Promise.resolve(null),
    ]);
    if (a.success) setAccounts(a.admins || []); else setError(a.error || "Could not load the team.");
    if (c?.success) setCompanies(c.companies || []);
    setLoading(false);
  }, [isSuper]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
  useEffect(() => { void load(); }, [load]);

  const flash = (text) => { setNotice(text); setTimeout(() => setNotice(""), 3500); };
  const changed = () => { void load(); onTeamChanged?.(); };

  const setStatus = async (a, status) => {
    const r = await callAPI("PUT", `/api/admins/${a.id}`, { status });
    if (r.success) { flash(status === "disabled" ? `${a.name} can no longer sign in.` : `${a.name} can sign in again.`); changed(); }
    else setError(r.error || "Could not update the account.");
  };

  const noEmail = accounts.filter((a) => !a.email);
  const q = query.trim().toLowerCase();
  const visible = accounts.filter((a) =>
    (roleFilter === "all" || a.role === roleFilter) &&
    (companyFilter === "all" || a.company.id === companyFilter) &&
    (!onlyNoEmail || !a.email) &&
    (!q || `${a.name} ${a.email} ${a.bank} ${a.company.name}`.toLowerCase().includes(q)),
  );
  const counts = useMemo(() => {
    const c = { all: accounts.length };
    for (const r of ROLE_ORDER) c[r] = accounts.filter((a) => a.role === r).length;
    return c;
  }, [accounts]);

  return (
    <div className="tm-page animate-fade-in">
      <div className="tm-toolbar">
        <div className="tm-seg" role="group" aria-label="Filter by role">
          {["all", ...ROLE_ORDER].filter((r) => r !== "superadmin" || isSuper).map((r) => (
            <button key={r} type="button" aria-pressed={roleFilter === r} className={`tm-seg-btn${roleFilter === r ? " is-active" : ""}`} onClick={() => setRoleFilter(r)}>
              {r === "all" ? "Everyone" : ROLE_PLURALS[r]} <span>{counts[r] || 0}</span>
            </button>
          ))}
        </div>
        <div className="tm-tools">
          <label className="tm-search">
            <span className="sr-only">Search team</span>
            <Search size={16} aria-hidden="true" />
            <input type="search" placeholder="Search name or email…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {isSuper && companies.length > 1 && (
            <select className="tm-input tm-select" aria-label="Company" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
              <option value="all">All companies</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button type="button" className="tm-btn tm-btn--primary" onClick={() => setEditing("new")}>
            <Plus size={17} /> Add member
          </button>
        </div>
      </div>

      {noEmail.length > 0 && (
        <div className="tm-banner" role="status">
          <AlertTriangle size={18} />
          <p><strong>{noEmail.length} account{noEmail.length === 1 ? "" : "s"} can’t sign in yet.</strong> Sign-in is by email now — add an email to each.</p>
          <button type="button" className="tm-btn tm-btn--sm" aria-pressed={onlyNoEmail} onClick={() => setOnlyNoEmail((v) => !v)}>
            {onlyNoEmail ? "Show everyone" : "Show them"}
          </button>
        </div>
      )}
      {notice && <p className="tm-notice" role="status"><CheckCircle size={16} /> {notice}</p>}
      {error && <p className="tm-error" role="alert"><AlertCircle size={16} /> {error}<button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={14} /></button></p>}

      {loading ? (
        <div className="tm-state"><div className="loading-dots"><span /><span /><span /></div></div>
      ) : visible.length === 0 ? (
        <div className="tm-state"><Users size={26} /><p>{q || roleFilter !== "all" || onlyNoEmail ? "No one matches these filters." : "No team members yet."}</p></div>
      ) : (
        <div className="tm-table" role="table" aria-label="Team">
          <div className={`tm-row tm-row--head${isSuper ? " tm-row--company" : ""}`} role="row">
            <span role="columnheader">Member</span>
            <span role="columnheader">Role</span>
            {isSuper && <span role="columnheader">Company</span>}
            <span role="columnheader">Status</span>
            <span role="columnheader">Last sign-in</span>
            <span role="columnheader" className="sr-only">Actions</span>
          </div>
          {visible.map((a) => {
            const self = a.id === adminId;
            return (
              <div key={a.id} role="row" className={`tm-row${isSuper ? " tm-row--company" : ""}${a.status !== "active" ? " is-disabled" : ""}`}>
                <span role="cell" className="tm-person">
                  <span className={`tm-avatar tm-avatar--${a.role}`} aria-hidden="true">{initials(a.name)}</span>
                  <span className="tm-person-text">
                    <span className="tm-person-name">{a.name}{self && <em className="tm-you">You</em>}</span>
                    {a.email
                      ? <span className="tm-person-sub">{a.email}</span>
                      : <span className="tm-person-sub is-warn"><AlertTriangle size={12} /> No email — can’t sign in</span>}
                  </span>
                </span>
                <span role="cell"><span className={`tm-role tm-role--${a.role}`}>{ROLE_LABELS[a.role]}</span>{a.bank && <span className="tm-bank">{a.bank}</span>}</span>
                {isSuper && <span role="cell" className="tm-company-cell">{a.company.name}</span>}
                <span role="cell">
                  <span className={`tm-status tm-status--${a.status}`}>{a.status === "active" ? "Active" : "Disabled"}</span>
                </span>
                <span role="cell" className="tm-muted">{timeAgo(a.lastLoginAt)}</span>
                <span role="cell" className="tm-actions">
                  <RowMenu items={[
                    { label: a.email ? "Edit" : "Add email", icon: Pencil, onSelect: () => setEditing(a) },
                    !self && { label: "Reset password", icon: KeyRound, onSelect: () => setResetting(a) },
                    !self && a.status === "active" && { label: "Disable sign-in", icon: Ban, onSelect: () => setStatus(a, "disabled") },
                    !self && a.status !== "active" && { label: "Enable sign-in", icon: CheckCircle, onSelect: () => setStatus(a, "active") },
                    !self && { label: "Remove", icon: Trash2, danger: true, onSelect: () => setRemoving(a) },
                  ]} />
                </span>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <MemberForm
          account={editing === "new" ? null : editing}
          adminRole={adminRole}
          companies={companies}
          defaultCompany={companyFilter !== "all" ? companyFilter : ""}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); flash(msg); changed(); }}
        />
      )}
      {resetting && (
        <ResetPassword account={resetting} onClose={() => setResetting(null)} onDone={(msg) => { setResetting(null); flash(msg); }} />
      )}
      {removing && (
        <ConfirmRemove account={removing} onClose={() => setRemoving(null)} onDone={(msg) => { setRemoving(null); flash(msg); changed(); }} />
      )}
    </div>
  );
}

function MemberForm({ account, adminRole, companies, defaultCompany, onClose, onSaved }) {
  const isNew = !account;
  const isSuper = adminRole === "superadmin";
  const grantable = GRANTABLE[adminRole] || [];
  const [name, setName] = useState(account?.name || "");
  const [email, setEmail] = useState(account?.email || "");
  const [role, setRole] = useState(account?.role || "advisor");
  const [bank, setBank] = useState(account?.bank || "");
  const [companyId, setCompanyId] = useState(account?.company.id || defaultCompany || companies.find((c) => c.kind === "owner")?.id || "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const company = companies.find((c) => c.id === companyId);
  const roleOptions = grantable.filter((r) => r !== "superadmin" || !isSuper || !company || company.kind === "owner");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (isNew && name.trim().length < 2) return setError("Enter their full name.");
    if (!/^\S+@\S+\.\S{2,}$/.test(email.trim())) return setError("Enter a valid email address.");
    if (role === "banker" && !bank) return setError("Select the lender’s bank.");
    if (isNew && passwordProblem(password)) return setError(`Password: ${passwordProblem(password)}.`);
    setSaving(true);
    const r = isNew
      ? await callAPI("POST", "/api/admins", { name: name.trim(), email: email.trim(), role, bank, password, ...(isSuper && companyId ? { companyId } : {}) })
      : await callAPI("PUT", `/api/admins/${account.id}`, {
          email: email.trim(),
          ...(role !== account.role ? { role } : {}),
          ...(role === "banker" ? { bank } : {}),
        });
    setSaving(false);
    if (r.success) onSaved(isNew ? `${name.trim()} was added. Share their email and password with them.` : `${account.name} was updated.`);
    else setError(r.error || "Could not save.");
  };

  return (
    <Drawer
      title={isNew ? "Add team member" : account.email ? `Edit ${account.name}` : `Add an email for ${account.name}`}
      sub={isNew ? "They sign in with this email and password." : account.email ? "Changing the role signs them out of every device." : "Sign-in is by email now; they can’t sign in until this is set."}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="tm-btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="tm-member-form" className="tm-btn tm-btn--primary" disabled={saving}>
            {saving ? <RefreshCw size={15} className="spin" /> : <Check size={15} />} {isNew ? "Add member" : "Save"}
          </button>
        </>
      )}
    >
      <form id="tm-member-form" className="tm-form" onSubmit={submit} noValidate>
        {isNew ? (
          <Field label="Full name" hint="Shown to students and on records">
            <input className="tm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ravi Kumar" autoFocus autoComplete="off" />
          </Field>
        ) : (
          <div className="tm-readonly">
            <span className={`tm-avatar tm-avatar--${account.role}`} aria-hidden="true">{initials(account.name)}</span>
            <div><strong>{account.name}</strong><span>{account.company.name}</span></div>
          </div>
        )}
        <Field label="Email" hint="Used to sign in">
          <input className="tm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" autoComplete="off" autoFocus={!isNew} />
        </Field>
        {isNew && isSuper && companies.length > 0 && (
          <Field label="Company">
            <select className="tm-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}{c.kind === "owner" ? " (owner)" : ""}</option>)}
            </select>
          </Field>
        )}
        <Field label="Role">
          <div className="tm-roles" role="radiogroup" aria-label="Role">
            {roleOptions.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={role === r} className={`tm-role-card${role === r ? " is-active" : ""}`} onClick={() => setRole(r)}>
                {r === "superadmin" ? <ShieldCheck size={18} /> : r === "admin" ? <Building2 size={18} /> : r === "banker" ? <Landmark size={18} /> : <UserRound size={18} />}
                <span className="tm-role-card-name">{ROLE_LABELS[r]}</span>
                <span className="tm-role-card-desc">
                  {r === "superadmin" ? "Everything, every company" : r === "admin" ? "Runs this company" : r === "banker" ? "Sees shared students" : "Sees assigned students"}
                </span>
              </button>
            ))}
          </div>
        </Field>
        {role === "banker" && (
          <Field label="Bank">
            <select className="tm-input" value={bank} onChange={(e) => setBank(e.target.value)}>
              <option value="">Select a bank</option>
              {BANK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        )}
        {isNew && (
          <Field label="Password">
            <PasswordInput value={password} onChange={setPassword} />
          </Field>
        )}
        {error && <p className="tm-error" role="alert"><AlertCircle size={16} /> {error}</p>}
      </form>
    </Drawer>
  );
}

function ResetPassword({ account, onClose, onDone }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    const problem = passwordProblem(password);
    if (problem) return setError(`${problem}.`);
    setSaving(true);
    const r = await callAPI("PUT", `/api/admins/${account.id}/reset-password`, { newPassword: password });
    setSaving(false);
    if (r.success) onDone(`New password set for ${account.name}. They’ve been signed out everywhere.`);
    else setError(r.error || "Could not reset the password.");
  };
  return (
    <Drawer
      title={`Reset password for ${account.name}`}
      sub="They’ll be signed out of every device and need the new password."
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="tm-btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="tm-reset-form" className="tm-btn tm-btn--primary" disabled={saving}>
            {saving ? <RefreshCw size={15} className="spin" /> : <KeyRound size={15} />} Set password
          </button>
        </>
      )}
    >
      <form id="tm-reset-form" className="tm-form" onSubmit={submit} noValidate>
        <Field label="New password"><PasswordInput value={password} onChange={setPassword} autoFocus /></Field>
        {error && <p className="tm-error" role="alert"><AlertCircle size={16} /> {error}</p>}
      </form>
    </Drawer>
  );
}

function ConfirmRemove({ account, onClose, onDone }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const remove = async () => {
    setSaving(true);
    const r = await callAPI("DELETE", `/api/admins/${account.id}`);
    setSaving(false);
    if (r.success) onDone(`${account.name} was removed.`);
    else setError(r.error || "Could not remove the account.");
  };
  return (
    <Drawer
      title={`Remove ${account.name}?`}
      sub="Their sign-in is deleted. Students and history stay as they are."
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="tm-btn" onClick={onClose}>Keep</button>
          <button type="button" className="tm-btn tm-btn--danger" onClick={remove} disabled={saving}>
            {saving ? <RefreshCw size={15} className="spin" /> : <Trash2 size={15} />} Remove
          </button>
        </>
      )}
    >
      <p className="tm-text">If they may come back later, <strong>disable sign-in</strong> instead — it keeps the account and can be undone.</p>
      {error && <p className="tm-error" role="alert"><AlertCircle size={16} /> {error}</p>}
    </Drawer>
  );
}

/* ── Company logo ───────────────────────────────────────────────── */

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_LOGO_BYTES = 1024 * 1024;

function CompanyLogo({ company, size = "md" }) {
  const src = companyLogoSrc(company.logoUrl);
  return src
    ? <img className={`tm-company-logo tm-company-logo--${size} has-image`} src={src} alt={`${company.name} logo`} />
    : <span className={`tm-company-logo tm-company-logo--${size}`} aria-hidden="true">{initials(company.name)}</span>;
}

// value: { file?, preview?, remove? } — what to do with the logo on save.
function LogoPicker({ current, value, onChange, error, onError }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const shown = value.remove ? "" : value.preview || companyLogoSrc(current);

  const take = (file) => {
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) return onError("Use a PNG, JPG or WebP image.");
    if (file.size > MAX_LOGO_BYTES) return onError("The logo must be 1 MB or smaller.");
    onError("");
    if (value.preview) URL.revokeObjectURL(value.preview);
    onChange({ file, preview: URL.createObjectURL(file) });
  };

  return (
    <div className={`tm-logo${dragging ? " is-dragging" : ""}${error ? " has-error" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); take(e.dataTransfer.files?.[0]); }}
    >
      <span className="tm-logo-preview">
        {shown ? <img src={shown} alt="Logo preview" /> : <ImagePlus size={24} aria-hidden="true" />}
      </span>
      <span className="tm-logo-text">
        <strong>{shown ? "Company logo" : "Add a logo"}</strong>
        <span>PNG, JPG or WebP, up to 1 MB. A square or wide logo on a light background works best.</span>
        <span className="tm-logo-actions">
          <button type="button" className="tm-btn tm-btn--sm" onClick={() => inputRef.current?.click()}>
            {shown ? "Replace" : "Choose image"}
          </button>
          {shown && (
            <button type="button" className="tm-link tm-link--danger" onClick={() => onChange(current ? { remove: true } : {})}>
              Remove
            </button>
          )}
        </span>
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }}
      />
    </div>
  );
}

// Applies a LogoPicker value to a saved company → { company, error }
async function saveLogo(companyId, logo) {
  if (logo.file) {
    const r = await uploadAPI(`/api/companies/${companyId}/logo`, "logo", logo.file);
    return r.success ? { company: r.company } : { error: r.error || "The logo couldn’t be uploaded." };
  }
  if (logo.remove) {
    const r = await callAPI("DELETE", `/api/companies/${companyId}/logo`);
    return r.success ? { company: r.company } : { error: r.error || "The logo couldn’t be removed." };
  }
  return {};
}

/* ── Companies (superadmin; a company admin sees only their own) ─────── */

// students: the dashboard's loaded list, so Flyurdream's count includes the
// older Google Drive students the database doesn't hold.
export function CompaniesSection({ students = [], adminRole = "superadmin", onChanged }) {
  const isSuper = adminRole === "superadmin";
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // company | "new"
  const [copied, setCopied] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await callAPI("GET", isSuper ? "/api/companies" : "/api/companies/mine");
    if (r.success) setCompanies(isSuper ? r.companies || [] : [r.company]); else setError(r.error || "Could not load companies.");
    setLoading(false);
  }, [isSuper]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
  useEffect(() => { void load(); }, [load]);

  const copy = async (slug) => {
    try { await navigator.clipboard.writeText(signupLink(slug)); setCopied(slug); setTimeout(() => setCopied(""), 1500); } catch { /* blocked */ }
  };
  const setStatus = async (c, status) => {
    const r = await callAPI("PUT", `/api/companies/${c.id}`, { status });
    if (r.success) { setNotice(status === "suspended" ? `${c.name} is suspended: its team is signed out and its signup link is off.` : `${c.name} is active again.`); void load(); }
    else setError(r.error || "Could not update the company.");
  };

  const studentCount = (c) => {
    const listed = students.filter((s) => s.company?.id === c.id).length;
    return Math.max(listed, c.counts?.students ?? 0);
  };
  const partners = companies.filter((c) => c.kind !== "owner");
  const owner = companies.find((c) => c.kind === "owner");

  return (
    <div className="tm-page animate-fade-in">
      <div className="tm-toolbar">
        {isSuper ? (
          <>
            <p className="tm-summary"><strong>{partners.length}</strong> partner compan{partners.length === 1 ? "y" : "ies"} · each with its own team, lenders, students and signup link</p>
            <button type="button" className="tm-btn tm-btn--primary" onClick={() => setEditing("new")}><Plus size={17} /> Add company</button>
          </>
        ) : (
          <p className="tm-summary">Your company’s name, logo and colour appear on its signup link and in your team’s dashboard.</p>
        )}
      </div>
      {notice && <p className="tm-notice" role="status"><CheckCircle size={16} /> {notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></p>}
      {error && <p className="tm-error" role="alert"><AlertCircle size={16} /> {error}<button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={14} /></button></p>}

      {loading ? (
        <div className="tm-state"><div className="loading-dots"><span /><span /><span /></div></div>
      ) : (
        <div className="tm-companies">
          {[owner, ...partners].filter(Boolean).map((c) => (
            <article key={c.id} className={`tm-company${c.status !== "active" ? " is-suspended" : ""}`} style={c.branding?.accent ? { "--tm-accent": c.branding.accent } : undefined}>
              <header className="tm-company-head">
                <CompanyLogo company={c} />
                <div className="tm-company-title">
                  <h3>{c.name}</h3>
                  <p>
                    <span className={`tm-pill ${c.kind === "owner" ? "tm-pill--owner" : ""}`}>{c.kind === "owner" ? "Owner" : "Partner"}</span>
                    {c.status !== "active" && <span className="tm-pill tm-pill--off">Suspended</span>}
                  </p>
                </div>
                <RowMenu items={[
                  { label: "Edit details & logo", icon: Pencil, onSelect: () => setEditing(c) },
                  isSuper && c.kind !== "owner" && (c.status === "active"
                    ? { label: "Suspend", icon: Ban, danger: true, onSelect: () => setStatus(c, "suspended") }
                    : { label: "Reactivate", icon: CheckCircle, onSelect: () => setStatus(c, "active") }),
                ]} />
              </header>
              <dl className="tm-company-stats">
                <div><dt>Students</dt><dd>{studentCount(c)}</dd></div>
                <div><dt>Admins</dt><dd>{c.counts?.admins ?? 0}</dd></div>
                <div><dt>Staff</dt><dd>{c.counts?.staff ?? 0}</dd></div>
                <div><dt>Lenders</dt><dd>{c.counts?.lenders ?? 0}</dd></div>
              </dl>
              <div className="tm-company-link">
                <Link2 size={15} aria-hidden="true" />
                <span title={c.kind === "owner" ? window.location.origin : signupLink(c.slug)}>
                  {c.kind === "owner" ? window.location.host : `${window.location.host}/c/${c.slug}`}
                </span>
                {c.kind !== "owner" && (
                  <button type="button" className="tm-link" onClick={() => copy(c.slug)} disabled={c.status !== "active"}>
                    {copied === c.slug ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy link</>}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <CompanyForm
          company={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); setNotice(msg); void load(); onChanged?.(); }}
        />
      )}
    </div>
  );
}

const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

function CompanyForm({ company, onClose, onSaved }) {
  const isNew = !company;
  const [name, setName] = useState(company?.name || "");
  const [slug, setSlug] = useState(company?.slug || "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [contactEmail, setContactEmail] = useState(company?.contactEmail || "");
  const [accent, setAccent] = useState(company?.branding?.accent || "#2563eb");
  const [logo, setLogo] = useState({});
  const [logoError, setLogoError] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const effectiveSlug = isNew ? (slugTouched ? slug : slugify(name)) : company.slug;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (name.trim().length < 2) return setError("Enter the company name.");
    if (isNew) {
      if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(effectiveSlug)) return setError("Link name: lowercase letters, numbers and dashes.");
      if (adminName.trim().length < 2) return setError("Enter the company admin’s name.");
      if (!/^\S+@\S+\.\S{2,}$/.test(adminEmail.trim())) return setError("Enter the company admin’s email.");
      if (passwordProblem(adminPassword)) return setError(`Admin password: ${passwordProblem(adminPassword)}.`);
    }
    setSaving(true);
    const body = { name: name.trim(), contactEmail: contactEmail.trim(), branding: { ...(company?.branding || {}), accent } };
    const r = isNew
      ? await callAPI("POST", "/api/companies", { ...body, slug: effectiveSlug, admin: { name: adminName.trim(), email: adminEmail.trim(), password: adminPassword } })
      : await callAPI("PUT", `/api/companies/${company.id}`, body);
    if (!r.success) {
      setSaving(false);
      return setError(r.error || "Could not save the company.");
    }
    const logoResult = await saveLogo(r.company.id, logo);
    setSaving(false);
    if (logoResult.error) {
      // The company itself is saved; say so plainly and keep the form open.
      return setError(`${isNew ? "Company created" : "Details saved"}, but ${logoResult.error.charAt(0).toLowerCase()}${logoResult.error.slice(1)}`);
    }
    if (logo.preview) URL.revokeObjectURL(logo.preview);
    onSaved(isNew ? `${r.company.name} is ready. Send ${adminEmail.trim()} their password and the signup link.` : `${r.company.name} was updated.`);
  };

  return (
    <Drawer
      title={isNew ? "Add a partner company" : `Edit ${company.name}`}
      sub={isNew ? "The company gets its own team, lenders, students and signup link." : "Name, logo, contact and colour shown on its signup link and dashboard."}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="tm-btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="tm-company-form" className="tm-btn tm-btn--primary" disabled={saving}>
            {saving ? <RefreshCw size={15} className="spin" /> : <Check size={15} />} {isNew ? "Create company" : "Save"}
          </button>
        </>
      )}
    >
      <form id="tm-company-form" className="tm-form" onSubmit={submit} noValidate>
        <p className="tm-form-section">Company</p>
        <Field label="Company name">
          <input className="tm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bright Future Consultancy" autoFocus autoComplete="off" />
        </Field>
        {isNew && (
          <Field label="Signup link" hint="Students who sign up here belong to this company">
            <span className="tm-slug">
              <span className="tm-slug-prefix">{window.location.host}/c/</span>
              <input className="tm-input" value={effectiveSlug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }} placeholder="bright-future" autoComplete="off" />
            </span>
          </Field>
        )}
        <Field as="div" label="Logo" hint="Optional" error={logoError}>
          <LogoPicker current={company?.logoUrl} value={logo} onChange={setLogo} error={logoError} onError={setLogoError} />
        </Field>
        <Field label="Contact email" hint="Optional">
          <input className="tm-input" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="hello@company.com" autoComplete="off" />
        </Field>
        <Field label="Brand colour" hint="Used on their signup page">
          <span className="tm-color">
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} aria-label="Brand colour" />
            <code>{accent}</code>
          </span>
        </Field>
        {isNew && (
          <>
            <p className="tm-form-section">First admin</p>
            <Field label="Admin’s full name">
              <input className="tm-input" value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="e.g. Priya Sharma" autoComplete="off" />
            </Field>
            <Field label="Admin’s email" hint="They sign in with this">
              <input className="tm-input" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="priya@company.com" autoComplete="off" />
            </Field>
            <Field label="Admin’s password"><PasswordInput value={adminPassword} onChange={setAdminPassword} /></Field>
          </>
        )}
        {error && <p className="tm-error" role="alert"><AlertCircle size={16} /> {error}</p>}
      </form>
    </Drawer>
  );
}
