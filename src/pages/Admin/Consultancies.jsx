import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Handshake, Search, Plus, Pencil, Trash2, X, Check, CheckCircle, AlertCircle, AlertTriangle,
  Hourglass, Sparkles, Users, RefreshCw, ArrowUpRight, GitMerge, MapPin, Phone, Mail, ListChecks,
} from "lucide-react";
import { callAPI } from "../../utils/adminApi";
import { nameKey, similarity, listedFor, DUPLICATE, SIMILAR } from "../../utils/consultancyMatch";
import "./Consultancies.css";

const isAdminLevel = (role) => role === "superadmin" || role === "admin";
const consultancyOf = (s) => (s.personalInfo?.consultantNameLoc || "").trim();
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const DISMISSED_KEY = "doclocker_consultancy_not_same";
const readDismissed = () => { try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]")); } catch { return new Set(); } };

function timeAgo(ts) {
  const m = Math.round((Date.now() - Date.parse(ts)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

// ── Add / edit ───────────────────────────────────────────────────────────────
function ConsultancyForm({ initial, list, onSave, onCancel, busy, error }) {
  const [form, setForm] = useState(() => ({ name: "", city: "", contactPerson: "", phone: "", email: "", ...initial }));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const others = list.filter((c) => c.id !== initial?.id);
  const exact = form.name.trim() ? listedFor(form.name, others) : null;
  const near = !exact && form.name.trim().length > 2
    ? others.map((c) => ({ c, score: Math.max(...[c.name, ...(c.aliases || [])].map((n) => similarity(form.name, n))) }))
        .filter((x) => x.score >= SIMILAR).sort((a, b) => b.score - a.score)[0]
    : null;
  return (
    <form className="bl-card cs-form" onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
      <header className="bl-form-head">
        <h2>{initial?.id ? `Edit ${initial.name}` : "Add consultancy"}</h2>
        <p>{initial?.id ? "Renaming also updates the students who have it." : "Staff can then pick it for their students without asking."}</p>
      </header>
      <label className="bl-field">
        <span>Name <em className="bl-req">*</em> <small>as it should appear everywhere</small></span>
        <input className="bl-input" value={form.name} onChange={set("name")} placeholder="e.g. ABC Overseas, Hyderabad" autoFocus />
      </label>
      {exact && <p className="cs-check is-dup"><AlertTriangle size={14} aria-hidden="true" /> <span>Already listed as <strong>{exact.name}</strong>.</span></p>}
      {near && <p className="cs-check is-near"><AlertTriangle size={14} aria-hidden="true" /> <span>Looks like <strong>{near.c.name}</strong> ({Math.round(near.score * 100)}% alike). If it&apos;s the same one, merge them in Tidy up instead.</span></p>}
      {!exact && !near && form.name.trim().length > 2 && <p className="cs-check is-new"><Sparkles size={14} aria-hidden="true" /> <span>Not like anything listed.</span></p>}
      <div className="cs-form-grid">
        <label className="bl-field"><span>City</span><input className="bl-input" value={form.city} onChange={set("city")} placeholder="e.g. Hyderabad" /></label>
        <label className="bl-field"><span>Contact person</span><input className="bl-input" value={form.contactPerson} onChange={set("contactPerson")} /></label>
        <label className="bl-field"><span>Phone</span><input className="bl-input" value={form.phone} onChange={set("phone")} inputMode="tel" /></label>
        <label className="bl-field"><span>Email</span><input className="bl-input" type="email" value={form.email} onChange={set("email")} /></label>
      </div>
      {error && <p className="bl-msg bl-msg--err" role="alert">{error}</p>}
      <div className="bl-form-actions">
        <button type="submit" className="adm-btn adm-btn--primary" disabled={busy || !form.name.trim() || Boolean(exact)}>
          {busy ? <><RefreshCw size={15} className="spin" /> Saving…</> : initial?.id ? <><Check size={15} /> Save changes</> : <><Plus size={15} /> Add consultancy</>}
        </button>
        <button type="button" className="adm-btn adm-btn--outline" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────
export default function ConsultanciesSection({ students, adminRole, consultancies, onReload, onStudentsChanged, onOpenStudents, keyOf }) {
  const admin = isAdminLevel(adminRole);
  const [tab, setTab] = useState("list");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null); // null | {} (new) | consultancy
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requests, setRequests] = useState(null);
  const [reqFilter, setReqFilter] = useState("pending");
  const [removing, setRemoving] = useState(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [keepChoice, setKeepChoice] = useState({});
  const [renaming, setRenaming] = useState({});
  const [rejecting, setRejecting] = useState(null);
  const [rejectNote, setRejectNote] = useState("");

  const list = useMemo(() => consultancies || [], [consultancies]);

  const loadRequests = useCallback(async () => {
    const r = await callAPI("GET", `/api/consultancies/requests?status=${admin ? reqFilter : "all"}`).catch(() => ({ success: false }));
    setRequests(r.success ? r.requests : []);
  }, [admin, reqFilter]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the fetch sets state when it resolves
  useEffect(() => { void loadRequests(); }, [loadRequests]);

  // ── Who uses which name ──
  const byKey = useMemo(() => {
    const map = new Map();
    for (const s of students) {
      const name = consultancyOf(s);
      const key = nameKey(name);
      if (!key) continue;
      if (!map.has(key)) map.set(key, { key, spellings: new Map(), students: [] });
      const g = map.get(key);
      g.students.push(s);
      g.spellings.set(name, (g.spellings.get(name) || 0) + 1);
    }
    for (const g of map.values()) g.name = [...g.spellings].sort((a, b) => b[1] - a[1])[0][0];
    return map;
  }, [students]);

  const rows = useMemo(() => list.map((c) => {
    const keys = new Set([nameKey(c.name), ...(c.aliases || []).map(nameKey)]);
    const mine = [...byKey.values()].filter((g) => keys.has(g.key)).flatMap((g) => g.students);
    return {
      ...c, students: mine,
      inprocess: mine.filter((s) => s.loanStatus === "inprocess").length,
      approved: mine.filter((s) => ["sanctioned", "disbursed"].includes(s.loanStatus)).length,
    };
  }).sort((a, b) => b.students.length - a.students.length || a.name.localeCompare(b.name)), [list, byKey]);

  const unlisted = useMemo(() => [...byKey.values()].filter((g) => !listedFor(g.name, list)), [byKey, list]);

  // ── Tidy up: groups that are probably one consultancy ──
  const groups = useMemo(() => {
    const nodes = [
      ...list.map((c) => ({ type: "listed", id: c.id, name: c.name, names: [c.name, ...(c.aliases || [])], students: rows.find((r) => r.id === c.id)?.students || [] })),
      ...unlisted.map((g) => ({ type: "typed", id: `t:${g.key}`, name: g.name, names: [...g.spellings.keys()], students: g.students })),
    ];
    const parent = nodes.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const score = Math.max(...nodes[i].names.flatMap((a) => nodes[j].names.map((b) => similarity(a, b))));
        if (score >= DUPLICATE) parent[find(i)] = find(j);
      }
    }
    const byRoot = new Map();
    nodes.forEach((n, i) => { const r = find(i); if (!byRoot.has(r)) byRoot.set(r, []); byRoot.get(r).push(n); });
    return [...byRoot.values()]
      .map((members) => ({ id: members.map((m) => m.id).sort().join("|"), members: members.sort((a, b) => (a.type === "listed" ? -1 : 1) - (b.type === "listed" ? -1 : 1) || b.students.length - a.students.length) }))
      .filter((g) => (g.members.length > 1 || g.members[0].type === "typed") && !dismissed.has(g.id))
      .sort((a, b) => b.members.length - a.members.length || b.members.reduce((n, m) => n + m.students.length, 0) - a.members.reduce((n, m) => n + m.students.length, 0));
  }, [list, unlisted, rows, dismissed]);
  const dupGroups = groups.filter((g) => g.members.length > 1);
  const singles = groups.filter((g) => g.members.length === 1);

  const pendingCount = (requests || []).filter((r) => r.status === "pending").length;
  const viaListed = rows.reduce((n, r) => n + r.students.length, 0);
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => !q || `${r.name} ${r.city} ${r.contactPerson} ${(r.aliases || []).join(" ")}`.toLowerCase().includes(q));

  const done = async (msg, { students: touched = false } = {}) => {
    setNotice(msg);
    setError("");
    await onReload();
    if (touched) await onStudentsChanged?.();
    void loadRequests();
  };
  const run = async (tag, fn) => {
    setBusy(tag);
    setError("");
    try { await fn(); } catch (e) { setError(e.message || "That didn't work. Try again."); } finally { setBusy(""); }
  };
  const api = async (method, url, body) => {
    const r = await callAPI(method, url, body);
    if (!r.success) throw new Error(r.error || "That didn't work. Try again.");
    return r;
  };

  // ── Actions ──
  const saveForm = (form) => run("form", async () => {
    if (editing?.id) {
      const row = rows.find((r) => r.id === editing.id);
      await api("PUT", `/api/consultancies/${editing.id}`, { ...form, studentKeys: (row?.students || []).map(keyOf) });
      await done(`Saved ${form.name.trim()}.`, { students: nameKey(form.name) !== nameKey(editing.name) });
    } else {
      await api("POST", "/api/consultancies", form);
      await done(`Added ${form.name.trim()}.`);
    }
    setEditing(null);
  });
  const remove = (c) => run(`rm:${c.id}`, async () => {
    await api("DELETE", `/api/consultancies/${c.id}`);
    setRemoving(null);
    await done(`Removed ${c.name}. Its students keep the name they have.`);
  });

  // Keep one member of a group; fold the rest into it
  const mergeGroup = (g) => run(`merge:${g.id}`, async () => {
    const keepId = keepChoice[g.id] || g.members[0].id;
    const keep = g.members.find((m) => m.id === keepId);
    let targetId = keep.type === "listed" ? keep.id : null;
    const name = (renaming[g.id] ?? keep.name).trim();
    if (!targetId) targetId = (await api("POST", "/api/consultancies", { name })).consultancy.id;
    else if (nameKey(name) !== nameKey(keep.name)) await api("PUT", `/api/consultancies/${targetId}`, { name });
    const others = g.members.filter((m) => m.id !== keepId);
    await api("POST", `/api/consultancies/${targetId}/merge`, {
      ids: others.filter((m) => m.type === "listed").map((m) => m.id),
      names: others.flatMap((m) => m.names).concat(keep.type === "typed" ? keep.names : []),
      studentKeys: g.members.flatMap((m) => m.students).map(keyOf),
    });
    const n = g.members.reduce((t, m) => t + m.students.length, 0);
    await done(`Merged ${plural(g.members.length, "spelling")} into ${name}. ${plural(n, "student")} updated.`, { students: true });
  });
  const notSame = (g) => {
    const next = new Set(dismissed).add(g.id);
    setDismissed(next);
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next])); } catch { /* per-browser convenience only */ }
  };
  const addTyped = (g) => run(`add:${g.id}`, async () => {
    const m = g.members[0];
    const r = await api("POST", "/api/consultancies", { name: m.name });
    await api("POST", `/api/consultancies/${r.consultancy.id}/merge`, { names: m.names, studentKeys: m.students.map(keyOf) });
    await done(`Added ${m.name} to the list.`, { students: true });
  });
  const matchTyped = (g, targetId) => run(`match:${g.id}`, async () => {
    const m = g.members[0];
    const target = list.find((c) => c.id === targetId);
    await api("POST", `/api/consultancies/${targetId}/merge`, { names: m.names, studentKeys: m.students.map(keyOf) });
    await done(`${m.name} is now ${target?.name}. ${plural(m.students.length, "student")} updated.`, { students: true });
  });

  const approve = (r) => run(`req:${r.id}`, async () => {
    const res = await api("POST", `/api/consultancies/requests/${r.id}/approve`, { name: (renaming[r.id] ?? r.name).trim() });
    await done(`Added ${res.consultancy.name}${r.studentName ? ` and set it for ${r.studentName}` : ""}.`, { students: Boolean(r.studentKey) });
  });
  const mapTo = (r, m) => run(`req:${r.id}`, async () => {
    await api("POST", `/api/consultancies/requests/${r.id}/map`, { consultancyId: m.id });
    await done(`Used ${m.name}${r.studentName ? ` for ${r.studentName}` : ""}. "${r.name}" is kept as another spelling of it.`, { students: Boolean(r.studentKey) });
  });
  const reject = (r) => run(`req:${r.id}`, async () => {
    await api("POST", `/api/consultancies/requests/${r.id}/reject`, { note: rejectNote });
    setRejecting(null);
    setRejectNote("");
    await done(`Rejected "${r.name}".`);
  });

  const tidyCount = dupGroups.length + singles.length;
  const kpis = [
    { key: "listed", label: "Consultancies", value: list.length, sub: unlisted.length ? `${plural(unlisted.length, "name")} typed but not listed` : "Every name is on the list", tone: "violet", icon: Handshake, open: () => setTab("list") },
    { key: "students", label: "Students through them", value: viaListed, sub: students.length ? `${Math.round((viaListed / students.length) * 100)}% of all students` : "No students yet", tone: "blue", icon: Users, open: () => setTab("list") },
    ...(admin ? [{ key: "tidy", label: "To tidy up", value: tidyCount, sub: dupGroups.length ? `${plural(dupGroups.length, "likely duplicate")}` : tidyCount ? "Names to add or match" : "No duplicates found", tone: tidyCount ? "indigo" : "green", icon: GitMerge, open: () => setTab("tidy") }] : []),
    { key: "requests", label: admin ? "Requests to review" : "Your requests waiting", value: pendingCount, sub: pendingCount ? "New consultancies staff asked for" : "Nothing waiting", tone: pendingCount ? "indigo" : "green", icon: Hourglass, open: () => setTab("requests") },
  ];

  return (
    <div className="bl-page dh cs-page animate-fade-in">
      <section className="dh-kpis bl-kpis" aria-label="Consultancies at a glance">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <button key={k.key} type="button" className={`dh-kpi dh-tone-${k.tone}`} onClick={k.open}>
              <span className="dh-kpi-top">
                <span className="dh-kpi-label">{k.label}</span>
                <span className="dh-kpi-icon" aria-hidden="true"><Icon size={18} /></span>
              </span>
              <span className="dh-kpi-mid"><span className="dh-kpi-value">{k.value}</span></span>
              <span className="dh-kpi-sub">{k.sub}</span>
            </button>
          );
        })}
      </section>

      <div className="bl-bar">
        <div className="bl-tabs" role="tablist" aria-label="Consultancies">
          <button type="button" role="tab" aria-selected={tab === "list"} className={`bl-tab${tab === "list" ? " is-active" : ""}`} onClick={() => setTab("list")}>
            <Handshake size={16} aria-hidden="true" /> Consultancies <span className="bl-tab-count">{list.length}</span>
          </button>
          {admin && (
            <button type="button" role="tab" aria-selected={tab === "tidy"} className={`bl-tab${tab === "tidy" ? " is-active" : ""}`} onClick={() => setTab("tidy")}>
              <GitMerge size={16} aria-hidden="true" /> Tidy up {tidyCount > 0 && <span className="bl-tab-count bl-tab-count--alert">{tidyCount}</span>}
            </button>
          )}
          <button type="button" role="tab" aria-selected={tab === "requests"} className={`bl-tab${tab === "requests" ? " is-active" : ""}`} onClick={() => setTab("requests")}>
            <Hourglass size={16} aria-hidden="true" /> Requests {pendingCount > 0 && <span className="bl-tab-count bl-tab-count--alert">{pendingCount}</span>}
          </button>
        </div>
        {admin && tab === "list" && !editing && (
          <button type="button" className="adm-btn adm-btn--primary bl-add" onClick={() => { setEditing({}); setError(""); }}>
            <Plus size={17} /> <span>Add consultancy</span>
          </button>
        )}
      </div>

      {notice && (
        <p className="cs-notice" role="status">
          <CheckCircle size={16} aria-hidden="true" /> {notice}
          <button type="button" onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button>
        </p>
      )}
      {error && !editing && <p className="bl-error" role="alert"><AlertCircle size={15} /> {error}</p>}

      {/* ── The list ── */}
      {tab === "list" && (
        editing ? (
          <ConsultancyForm initial={editing} list={list} busy={busy === "form"} error={error} onSave={saveForm} onCancel={() => { setEditing(null); setError(""); }} />
        ) : (
          <section className="bl-card cs-list" aria-label="Consultancies">
            <header className="bl-card-head">
              <div>
                <h2 className="bl-card-title">Consultancies</h2>
                <p className="bl-card-sub">{admin ? "The names staff pick from. Most students first." : "Pick from these on a student's profile. Ask an admin to add a new one."}</p>
              </div>
            </header>
            <label className="bl-search">
              <span className="sr-only">Search consultancies</span>
              <Search size={16} aria-hidden="true" />
              <input type="search" placeholder="Search name, city or contact…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            {shown.length === 0 ? (
              <div className="bl-empty">
                <Handshake size={22} aria-hidden="true" />
                <p>{q ? "No consultancy matches your search." : admin ? "Nothing listed yet. Add one, or open Tidy up to turn the names students typed into a clean list." : "No consultancies are listed yet."}</p>
              </div>
            ) : (
              <ul className="cs-rows">
                {shown.map((c) => (
                  <li key={c.id} className="cs-row">
                    <span className="cs-avatar" aria-hidden="true">{c.name.slice(0, 1).toUpperCase()}</span>
                    <span className="cs-row-main">
                      <span className="cs-row-name">{c.name}</span>
                      <span className="cs-row-meta">
                        {c.city && <span><MapPin size={12} aria-hidden="true" /> {c.city}</span>}
                        {c.contactPerson && <span><Users size={12} aria-hidden="true" /> {c.contactPerson}</span>}
                        {c.phone && <span><Phone size={12} aria-hidden="true" /> {c.phone}</span>}
                        {c.email && <span><Mail size={12} aria-hidden="true" /> {c.email}</span>}
                        {(c.aliases || []).length > 0 && <span className="cs-aliases" title={c.aliases.join("\n")}>also written {plural(c.aliases.length, "other way")}</span>}
                      </span>
                    </span>
                    <span className="cs-row-figs">
                      <span><strong>{c.students.length}</strong> students</span>
                      <span><strong>{c.inprocess}</strong> with lenders</span>
                      <span className="is-ok"><strong>{c.approved}</strong> approved</span>
                    </span>
                    <span className="cs-row-actions">
                      {c.students.length > 0 && (
                        <button type="button" className="bl-btn bl-btn--sm" onClick={() => onOpenStudents({ consultancy: c.name })}>
                          Students <ArrowUpRight size={13} aria-hidden="true" />
                        </button>
                      )}
                      {admin && removing === c.id ? (
                        <span className="bl-confirm">
                          <span>Remove {c.name}?</span>
                          <button type="button" className="bl-btn bl-btn--sm bl-btn--danger" disabled={busy === `rm:${c.id}`} onClick={() => remove(c)}>Remove</button>
                          <button type="button" className="bl-btn bl-btn--sm" onClick={() => setRemoving(null)}>Cancel</button>
                        </span>
                      ) : admin && (
                        <>
                          <button type="button" className="bl-btn bl-btn--sm" onClick={() => { setEditing(c); setError(""); }} aria-label={`Edit ${c.name}`}><Pencil size={13} /></button>
                          <button type="button" className="bl-btn bl-btn--sm bl-btn--quiet-danger" onClick={() => setRemoving(c.id)} aria-label={`Remove ${c.name}`}><Trash2 size={13} /></button>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      )}

      {/* ── Tidy up ── */}
      {tab === "tidy" && admin && (
        <div className="cs-tidy">
          <div className="bl-card bl-flow">
            <ol className="bl-flow-steps">
              <li><span>1</span><p><strong>Same consultancy, typed differently?</strong> Pick the name to keep and merge</p></li>
              <li><span>2</span><p><strong>Every student is updated</strong> to that one name</p></li>
              <li><span>3</span><p><strong>Old spellings are remembered,</strong> so they match it from now on</p></li>
            </ol>
          </div>
          {groups.length === 0 && (
            <div className="bl-card bl-blank">
              <span className="bl-blank-icon"><CheckCircle size={26} /></span>
              <h2>Nothing to tidy</h2>
              <p>Every consultancy students use is listed once.</p>
            </div>
          )}
          {dupGroups.length > 0 && <h2 className="bl-requests-title">Likely duplicates <span className="cs-count">{dupGroups.length}</span></h2>}
          {dupGroups.map((g) => {
            const keepId = keepChoice[g.id] || g.members[0].id;
            const keep = g.members.find((m) => m.id === keepId);
            const total = g.members.reduce((n, m) => n + m.students.length, 0);
            return (
              <section key={g.id} className="bl-card cs-group">
                <header className="cs-group-head">
                  <span className="cs-group-icon" aria-hidden="true"><GitMerge size={17} /></span>
                  <div>
                    <h3>These look like one consultancy</h3>
                    <p>{plural(g.members.length, "spelling")} · {plural(total, "student")}. Choose the name to keep.</p>
                  </div>
                </header>
                <ul className="cs-members" role="radiogroup" aria-label="Name to keep">
                  {g.members.map((m) => (
                    <li key={m.id}>
                      <label className={`cs-member${m.id === keepId ? " is-keep" : ""}`}>
                        <input type="radio" name={`keep-${g.id}`} checked={m.id === keepId} onChange={() => setKeepChoice((k) => ({ ...k, [g.id]: m.id }))} />
                        <span className="cs-member-name">{m.name}</span>
                        <span className={`cs-tag${m.type === "listed" ? " is-listed" : ""}`}>{m.type === "listed" ? "Listed" : "Typed on students"}</span>
                        <span className="cs-member-count">{plural(m.students.length, "student")}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="cs-group-foot">
                  <label className="bl-field cs-keep-name">
                    <span>Keep as</span>
                    <input className="bl-input" value={renaming[g.id] ?? keep.name} onChange={(e) => setRenaming((r) => ({ ...r, [g.id]: e.target.value }))} />
                  </label>
                  <button type="button" className="bl-btn bl-btn--success" disabled={busy === `merge:${g.id}` || !(renaming[g.id] ?? keep.name).trim()} onClick={() => mergeGroup(g)}>
                    {busy === `merge:${g.id}` ? <RefreshCw size={14} className="spin" /> : <GitMerge size={14} />} Merge into one
                  </button>
                  <button type="button" className="bl-btn" onClick={() => notSame(g)}>Not the same</button>
                </div>
              </section>
            );
          })}

          {singles.length > 0 && <h2 className="bl-requests-title">Typed but not listed <span className="cs-count">{singles.length}</span></h2>}
          {singles.length > 0 && (
            <section className="bl-card cs-singles">
              <ul className="cs-rows">
                {singles.map((g) => {
                  const m = g.members[0];
                  const near = list.map((c) => ({ c, score: Math.max(...[c.name, ...(c.aliases || [])].map((n) => similarity(m.name, n))) }))
                    .filter((x) => x.score >= SIMILAR).sort((a, b) => b.score - a.score);
                  return (
                    <li key={g.id} className="cs-row">
                      <span className="cs-avatar is-typed" aria-hidden="true">{m.name.slice(0, 1).toUpperCase()}</span>
                      <span className="cs-row-main">
                        <span className="cs-row-name">{m.name}</span>
                        <span className="cs-row-meta">
                          <span>{plural(m.students.length, "student")}</span>
                          {near[0] ? <span className="cs-near">Maybe {near[0].c.name} ({Math.round(near[0].score * 100)}% alike)</span> : <span>Not like anything listed</span>}
                        </span>
                      </span>
                      <span className="cs-row-actions">
                        {near[0] && (
                          <button type="button" className="bl-btn bl-btn--sm" disabled={busy === `match:${g.id}`} onClick={() => matchTyped(g, near[0].c.id)}>
                            Use {near[0].c.name.length > 22 ? `${near[0].c.name.slice(0, 22)}…` : near[0].c.name}
                          </button>
                        )}
                        {list.length > 0 && (
                          <select className="bl-input cs-match" value="" aria-label={`Match ${m.name} to a listed consultancy`} onChange={(e) => e.target.value && matchTyped(g, e.target.value)}>
                            <option value="">Match to…</option>
                            {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        )}
                        <button type="button" className="bl-btn bl-btn--sm bl-btn--primary-soft" disabled={busy === `add:${g.id}`} onClick={() => addTyped(g)}>
                          <Plus size={13} /> Add to list
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* ── Requests ── */}
      {tab === "requests" && (
        <section className="bl-requests" aria-label="Consultancy requests">
          <div className="bl-requests-head">
            <h2 className="bl-requests-title">{admin ? (reqFilter === "pending" ? "New consultancies staff asked for" : "Every request") : "Consultancies you asked for"}</h2>
            {admin && (
              <div className="bl-seg" role="group" aria-label="Filter requests">
                {[["pending", "Pending"], ["all", "All"]].map(([id, label]) => (
                  <button key={id} type="button" className={`bl-seg-btn${reqFilter === id ? " is-active" : ""}`} aria-pressed={reqFilter === id} onClick={() => setReqFilter(id)}>{label}</button>
                ))}
              </div>
            )}
          </div>
          {requests === null ? (
            <div className="bl-state"><div className="loading-dots"><span /><span /><span /></div></div>
          ) : requests.length === 0 ? (
            <div className="bl-card bl-blank">
              <span className="bl-blank-icon"><CheckCircle size={26} /></span>
              <h2>{admin ? "All caught up" : "No requests yet"}</h2>
              <p>{admin ? "When staff type a consultancy that isn't listed, it waits here for you." : "Typing a consultancy that isn't listed on a student's profile sends it here for an admin."}</p>
            </div>
          ) : (
            <ul className="bl-request-list">
              {requests.map((r) => {
                const best = r.matches?.[0];
                const dup = best && best.score >= DUPLICATE;
                return (
                  <li key={r.id} className={`bl-card bl-request cs-request status-${r.status === "mapped" ? "approved" : r.status}`}>
                    <div className="cs-request-main">
                      <p className="cs-request-name">“{r.name}”</p>
                      <p className="bl-request-meta">
                        Asked by <strong>{r.requestedBy}</strong>{r.studentName ? <> for <strong>{r.studentName}</strong></> : null} · {timeAgo(r.createdAt)}
                        {r.status !== "pending" && r.decidedBy && <> · {r.status === "rejected" ? "rejected" : "approved"} by {r.decidedBy}</>}
                      </p>
                      {r.status === "pending" && (
                        best
                          ? <p className={`cs-check ${dup ? "is-dup" : "is-near"}`}><AlertTriangle size={14} aria-hidden="true" /> <span>{dup ? "Probably" : "Maybe"} <strong>{best.name}</strong>, already listed ({Math.round(best.score * 100)}% alike)</span></p>
                          : <p className="cs-check is-new"><Sparkles size={14} aria-hidden="true" /> <span>Looks new: nothing listed is like it</span></p>
                      )}
                      {r.status === "rejected" && r.note && <p className="bl-request-note">“{r.note}”</p>}
                      {admin && r.status === "pending" && rejecting === r.id && (
                        <div className="bl-reject">
                          <input className="bl-input" placeholder="Reason (optional)" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} autoFocus />
                          <button type="button" className="bl-btn bl-btn--danger" disabled={busy === `req:${r.id}`} onClick={() => reject(r)}>Reject</button>
                          <button type="button" className="bl-btn" onClick={() => { setRejecting(null); setRejectNote(""); }}>Cancel</button>
                        </div>
                      )}
                      {admin && r.status === "pending" && rejecting !== r.id && (
                        <label className="bl-field cs-keep-name">
                          <span>Add as</span>
                          <input className="bl-input" value={renaming[r.id] ?? r.name} onChange={(e) => setRenaming((x) => ({ ...x, [r.id]: e.target.value }))} />
                        </label>
                      )}
                    </div>
                    <div className="bl-request-side">
                      {(!admin || r.status !== "pending") && (
                        <span className={`bl-pill bl-pill--${r.status === "mapped" ? "approved" : r.status}`}>
                          {r.status === "pending" ? <><Hourglass size={12} /> Waiting for an admin</> : r.status === "rejected" ? <><X size={12} /> Rejected</> : <><Check size={12} /> {r.status === "mapped" ? "Matched to a listed one" : "Added"}</>}
                        </span>
                      )}
                      {admin && r.status === "pending" && rejecting !== r.id && (
                        <div className="bl-request-actions cs-request-actions">
                          {(r.matches || []).slice(0, 2).map((m) => (
                            <button key={m.id} type="button" className={`bl-btn bl-btn--sm${m === best && dup ? " bl-btn--success" : ""}`} disabled={busy === `req:${r.id}`} onClick={() => mapTo(r, m)}>
                              <ListChecks size={13} /> Use {m.name.length > 24 ? `${m.name.slice(0, 24)}…` : m.name}
                            </button>
                          ))}
                          <button type="button" className={`bl-btn bl-btn--sm${dup ? "" : " bl-btn--success"}`} disabled={busy === `req:${r.id}` || !(renaming[r.id] ?? r.name).trim()} onClick={() => approve(r)}>
                            {busy === `req:${r.id}` ? <RefreshCw size={13} className="spin" /> : <><Plus size={13} /> Add as new</>}
                          </button>
                          <button type="button" className="bl-btn bl-btn--sm" onClick={() => { setRejecting(r.id); setRejectNote(""); }}><X size={13} /> Reject</button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
