"use client";
// /admin — owner-only registration code management (V9).
// Requires Supabase auth + the signed-in email being listed in OWNER_EMAILS.
import { useState, useEffect, useCallback } from "react";
import { getSupabase, supabaseConfigured, getAccessToken } from "../../lib/supabase";

const FM = "'JetBrains Mono',monospace";
const FD = "'Fraunces',serif";
const C = { bg: "#05080F", panel: "#0A1018", surface: "#0D1520", border: "#1A2535", text: "#E2EDF8", dim: "#9DB4CC", accent: "#00d4aa", red: "#ff4d6d", gold: "#f7c948" };

const statusColor = (s) => (s === "unused" ? C.accent : s === "used" ? C.gold : C.red);

export default function AdminCodesPage() {
  const [adminTab, setAdminTab] = useState("codes"); // "codes" | "brain"
  const [authed, setAuthed] = useState(null); // null=checking, false=no, user obj=yes
  const [codes, setCodes] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [genCount, setGenCount] = useState(10);
  const [genLabel, setGenLabel] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const pageSize = 50;

  useEffect(() => {
    if (!supabaseConfigured()) { setAuthed(false); return; }
    getSupabase().auth.getSession().then(({ data }) => setAuthed(data?.session?.user || false));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status !== "all") params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const r = await fetch(`/api/admin/codes?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Failed to load"); return; }
      setCodes(d.codes || []); setTotal(d.total || 0);
    } catch { setError("Connection error"); }
    finally { setLoading(false); }
  }, [page, status, q]);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  const generate = async () => {
    setGenBusy(true); setError("");
    try {
      const token = await getAccessToken();
      const r = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ count: genCount, batchLabel: genLabel || undefined }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Generate failed"); return; }
      setGenLabel(""); load();
    } catch { setError("Connection error"); }
    finally { setGenBusy(false); }
  };

  const revoke = async (code) => {
    if (!confirm(`Revoke unused code ${code}?`)) return;
    const token = await getAccessToken();
    const r = await fetch("/api/admin/codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code, action: "revoke" }),
    });
    if (r.ok) load(); else setError((await r.json()).error || "Revoke failed");
  };

  const exportCSV = () => {
    const rows = [["code", "status", "redeemed_email", "redeemed_at", "batch", "created_at"]];
    codes.forEach((c) => rows.push([c.code, c.status, c.redeemed_email || "", c.redeemed_at || "", c.batch_label || "", c.created_at]));
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "kronos-registration-codes.csv";
    a.click();
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (authed === null) return <div style={{ minHeight: "100vh", background: C.bg }} />;
  if (authed === false) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FM, color: C.dim, flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 12, letterSpacing: 2 }}>ADMIN — SIGN IN REQUIRED</div>
        <a href="/" style={{ color: C.accent, fontSize: 10, letterSpacing: 1 }}>← back to terminal (sign in there first)</a>
      </div>
    );
  }

  return (
    // V13.6: globals.css sets html,body{overflow:hidden} (the terminal manages its
    // own internal scrolling), which killed document scroll on this route — the
    // brain panel's content below the fold was unreachable. This route owns its
    // scroll instead: full-viewport height + its own overflow-y:auto.
    <div style={{ height: "100vh", overflowY: "auto", background: C.bg, padding: "26px 30px", fontFamily: FM }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@700;800&family=JetBrains+Mono:wght@400;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;} button{cursor:pointer;} input,select{outline:none;}`}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: FD, fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: 1 }}>
            {adminTab === "brain" ? "DEVELOPER BRAIN ACCESS" : "REGISTRATION CODES"}
          </div>
          <div style={{ fontSize: 8, color: C.dim, letterSpacing: 2, marginTop: 3 }}>
            {adminTab === "brain" ? "OWNER ADMIN · V13" : `OWNER ADMIN · ${total} CODES TOTAL`}
          </div>
        </div>
        <a href="/" style={{ color: C.dim, fontSize: 10, letterSpacing: 1, textDecoration: "none" }}>← TERMINAL</a>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {[["codes", "REGISTRATION CODES"], ["brain", "BRAIN ACCESS"]].map(([id, label]) => (
          <button key={id} onClick={() => setAdminTab(id)} style={{
            padding: "7px 14px", borderRadius: 7, fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
            color: adminTab === id ? C.accent : C.dim, background: adminTab === id ? "rgba(0,212,170,0.08)" : "transparent",
            border: `1px solid ${adminTab === id ? "rgba(0,212,170,0.3)" : C.border}`,
          }}>{label}</button>
        ))}
      </div>

      {adminTab === "brain" && <BrainPanel C={C} FM={FM} />}

      {adminTab === "codes" && (<>
      {/* Generate batch */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 8, color: C.dim, letterSpacing: 2, marginBottom: 5 }}>GENERATE BATCH</div>
          <input type="number" min={1} max={500} value={genCount} onChange={(e) => setGenCount(Number(e.target.value))}
            style={{ width: 80, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 10px", color: C.text, fontFamily: FM, fontSize: 12 }} />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 8, color: C.dim, letterSpacing: 2, marginBottom: 5 }}>BATCH LABEL (OPTIONAL)</div>
          <input value={genLabel} onChange={(e) => setGenLabel(e.target.value)} placeholder="e.g. discord-wave-2"
            style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 10px", color: C.text, fontFamily: FM, fontSize: 12 }} />
        </div>
        <button onClick={generate} disabled={genBusy} style={{ padding: "9px 18px", background: "rgba(0,212,170,0.1)", border: "1px solid rgba(0,212,170,0.35)", borderRadius: 8, color: C.accent, fontFamily: FM, fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>
          {genBusy ? "GENERATING..." : "+ GENERATE"}
        </button>
        <button onClick={exportCSV} style={{ padding: "9px 14px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, color: C.dim, fontFamily: FM, fontSize: 10, letterSpacing: 1 }}>
          EXPORT PAGE CSV
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        {["all", "unused", "used", "revoked"].map((s) => (
          <button key={s} onClick={() => { setStatus(s); setPage(1); }} style={{
            padding: "6px 14px", borderRadius: 6, fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
            color: status === s ? C.accent : C.dim, background: status === s ? "rgba(0,212,170,0.08)" : "transparent",
            border: `1px solid ${status === s ? "rgba(0,212,170,0.3)" : C.border}`,
          }}>{s}</button>
        ))}
        <input value={q} onChange={(e) => { setQ(e.target.value.toUpperCase()); setPage(1); }} placeholder="SEARCH CODE..."
          style={{ marginLeft: "auto", width: 200, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 11px", color: C.text, fontFamily: FM, fontSize: 11, letterSpacing: 1 }} />
      </div>

      {error && <div style={{ color: C.red, fontSize: 10, marginBottom: 10 }}>⚠ {error}</div>}

      {/* Table */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "130px 90px 1fr 170px 140px 80px", padding: "10px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 8, color: C.dim, letterSpacing: 2 }}>
          <span>CODE</span><span>STATUS</span><span>REDEEMED BY</span><span>REDEEMED AT</span><span>BATCH</span><span></span>
        </div>
        {loading && <div style={{ padding: 20, fontSize: 10, color: C.dim, textAlign: "center" }}>LOADING...</div>}
        {!loading && codes.length === 0 && <div style={{ padding: 20, fontSize: 10, color: C.dim, textAlign: "center" }}>No codes match.</div>}
        {!loading && codes.map((c) => (
          <div key={c.code} style={{ display: "grid", gridTemplateColumns: "130px 90px 1fr 170px 140px 80px", padding: "9px 16px", borderBottom: `1px solid ${C.border}55`, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.text, letterSpacing: 1 }}>{c.code}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: statusColor(c.status), letterSpacing: 1 }}>{c.status.toUpperCase()}</span>
            <span style={{ fontSize: 10, color: c.redeemed_email ? C.text : C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.redeemed_email || "—"}</span>
            <span style={{ fontSize: 9, color: C.dim }}>{c.redeemed_at ? new Date(c.redeemed_at).toLocaleString() : "—"}</span>
            <span style={{ fontSize: 9, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.batch_label || "—"}</span>
            {c.status === "unused"
              ? <button onClick={() => revoke(c.code)} style={{ fontSize: 8, color: C.red, background: "none", border: "1px solid rgba(255,77,109,0.3)", borderRadius: 5, padding: "3px 8px", fontFamily: FM, letterSpacing: 1 }}>REVOKE</button>
              : <span />}
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 14, alignItems: "center" }}>
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={{ padding: "6px 14px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: page <= 1 ? C.border : C.dim, fontFamily: FM, fontSize: 10 }}>← PREV</button>
        <span style={{ fontSize: 9, color: C.dim, letterSpacing: 1 }}>PAGE {page} / {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} style={{ padding: "6px 14px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: page >= totalPages ? C.border : C.dim, fontFamily: FM, fontSize: 10 }}>NEXT →</button>
      </div>
      </>)}
    </div>
  );
}

// ── V13: BRAIN ACCESS — system-prompt addendum + feature flags + V13 popup dev controls ──
function BrainPanel({ C, FM }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [addendum, setAddendum] = useState("");
  const [flags, setFlags] = useState({});
  const [popup, setPopup] = useState({ title: "", bullets: [], links: [] });
  const [bulletsText, setBulletsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [lossLog, setLossLog] = useState(null); // V13.5 self-teaching loss log

  const FEATURE_FLAGS = [
    ["prioritizeIndices", "Prioritize SPX/major index options (always-scan slot)"],
    ["futuresAfterHoursBadge", "Show the Globex 24/5 session badge in Futures mode"],
  ];

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const token = await getAccessToken();
      const r = await fetch("/api/admin/brain", { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Failed to load"); return; }
      setAddendum(d.systemPromptAddendum || "");
      setFlags(d.featureFlags || {});
      const p = d.popupContent || { title: "", bullets: [], links: [] };
      setPopup(p);
      setBulletsText((p.bullets || []).join("\n"));
      // Load the loss log alongside (best-effort — the panel renders without it).
      try {
        const lr = await fetch("/api/admin/brain?view=losslog", { headers: { Authorization: `Bearer ${token}` } });
        if (lr.ok) setLossLog(await lr.json());
      } catch { /* loss log optional */ }
    } catch { setError("Connection error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const put = async (key, value) => {
    const token = await getAccessToken();
    const r = await fetch("/api/admin/brain", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key, value }),
    });
    if (!r.ok) throw new Error((await r.json()).error || "Save failed");
  };

  const saveAddendum = async () => {
    setSaving(true); setError(""); setNotice("");
    try { await put("system_prompt_addendum", addendum); setNotice("System-prompt addendum saved."); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const toggleFlag = async (key) => {
    const next = { ...flags, [key]: !flags[key] };
    setFlags(next);
    try { await put("feature_flags", next); }
    catch (e) { setError(e.message); setFlags(flags); }
  };

  const savePopup = async () => {
    setSaving(true); setError(""); setNotice("");
    const value = { ...popup, bullets: bulletsText.split("\n").map((s) => s.trim()).filter(Boolean) };
    try { await put("v13_popup_content", value); setPopup(value); setNotice("V13 popup content saved."); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const resetAll = async () => {
    if (!confirm("Reset the V13 popup for ALL users? They'll see it again on next login.")) return;
    setResetBusy(true); setError(""); setNotice("");
    try {
      const token = await getAccessToken();
      const r = await fetch("/api/admin/brain", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "reset_popup_all" }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Reset failed"); return; }
      setNotice(`Popup reset for ${d.updated} user(s).`);
    } catch { setError("Connection error"); }
    finally { setResetBusy(false); }
  };

  const resetUser = async () => {
    if (!resetEmail.trim()) return;
    setResetBusy(true); setError(""); setNotice("");
    try {
      const token = await getAccessToken();
      const r = await fetch("/api/admin/brain", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "reset_popup_user", email: resetEmail.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Reset failed"); return; }
      setNotice(`Popup reset for ${resetEmail.trim()}.`);
      setResetEmail("");
    } catch { setError("Connection error"); }
    finally { setResetBusy(false); }
  };

  if (loading) return <div style={{ padding: 20, fontSize: 10, color: C.dim, textAlign: "center" }}>LOADING...</div>;

  const boxSx = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 };
  const labelSx = { fontSize: 8, color: C.dim, letterSpacing: 2, marginBottom: 7, fontWeight: 700 };
  const inputSx = { width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "9px 10px", color: C.text, fontFamily: FM, fontSize: 11 };
  const btnSx = { padding: "9px 18px", background: "rgba(0,212,170,0.1)", border: "1px solid rgba(0,212,170,0.35)", borderRadius: 8, color: C.accent, fontFamily: FM, fontSize: 10, fontWeight: 700, letterSpacing: 2 };

  return (
    <div>
      {error && <div style={{ color: C.red, fontSize: 10, marginBottom: 10 }}>⚠ {error}</div>}
      {notice && <div style={{ color: C.accent, fontSize: 10, marginBottom: 10 }}>✓ {notice}</div>}

      <div style={boxSx}>
        <div style={labelSx}>SYSTEM-PROMPT ADDENDUM · APPLIES TO EVERY USER'S AI CHAT</div>
        <textarea value={addendum} onChange={(e) => setAddendum(e.target.value)} rows={6} maxLength={8000}
          placeholder="Extra instructions appended to KRONOS's system prompt (behavior changes, new ideas to try, temporary corrections)..."
          style={{ ...inputSx, resize: "vertical", lineHeight: 1.5, marginBottom: 10 }} />
        <button onClick={saveAddendum} disabled={saving} style={btnSx}>{saving ? "SAVING..." : "SAVE ADDENDUM"}</button>
      </div>

      {/* V13.5: SELF-TEACHING LOSS LOG — admin-only. The aggregate win/loss the
          bot↔terminal brain sync learns from (worst setups drag conviction down). */}
      <div style={boxSx}>
        <div style={labelSx}>SELF-TEACHING LOSS LOG · ADMIN ONLY</div>
        {!lossLog ? (
          <div style={{ fontSize: 10, color: C.dim }}>Loading…</div>
        ) : !lossLog.available ? (
          <div style={{ fontSize: 10.5, color: C.dim, lineHeight: 1.6 }}>
            No graded signal history yet. Once the cron grades won/lost signals (needs migration 006), aggregate stats appear here and the bot starts down-weighting losing setups automatically.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
              <div><span style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{lossLog.overall?.winRate != null ? `${lossLog.overall.winRate}%` : "—"}</span>
                <div style={{ fontSize: 7.5, color: C.dim, letterSpacing: 1 }}>OVERALL WIN RATE</div></div>
              <div><span style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{lossLog.sampleSize}</span>
                <div style={{ fontSize: 7.5, color: C.dim, letterSpacing: 1 }}>GRADED (45D)</div></div>
            </div>
            {lossLog.worstSetups?.length > 0 && (
              <>
                <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1, marginBottom: 6 }}>WORST SETUP SIGNATURES (down-weighted automatically)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                  {lossLog.worstSetups.map((s) => (
                    <div key={s.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "5px 8px", borderRadius: 6, background: C.surface }}>
                      <span style={{ color: C.text, fontFamily: FM }}>{s.key}</span>
                      <span style={{ color: s.winRate < 45 ? C.red : s.winRate < 55 ? C.gold : C.accent, fontWeight: 700 }}>{s.winRate}% · {s.wins}/{s.n}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {lossLog.recentLosers?.length > 0 && (
              <>
                <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1, marginBottom: 6 }}>RECENT LOSSES ({lossLog.recentLosers.length})</div>
                <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                  {lossLog.recentLosers.map((l, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,77,109,0.06)" }}>
                      <span style={{ color: C.text, fontFamily: FM }}>{l.direction} {l.symbol} · {l.asset_class}/{l.interval}</span>
                      <span style={{ color: C.dim }}>{l.conviction}% · {l.resolved_at ? new Date(l.resolved_at).toLocaleDateString() : ""}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div style={boxSx}>
        <div style={labelSx}>FEATURE FLAGS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {FEATURE_FLAGS.map(([key, desc]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
              <input type="checkbox" checked={flags[key] !== false} onChange={() => toggleFlag(key)} />
              <span style={{ fontSize: 10.5, color: C.text }}>{desc}</span>
            </label>
          ))}
        </div>
      </div>

      <div style={boxSx}>
        <div style={labelSx}>V13 BETA POPUP CONTENT</div>
        <input value={popup.title} onChange={(e) => setPopup((p) => ({ ...p, title: e.target.value }))}
          placeholder="Popup title, e.g. What's New in V13" style={{ ...inputSx, marginBottom: 8 }} />
        <textarea value={bulletsText} onChange={(e) => setBulletsText(e.target.value)} rows={5}
          placeholder={"One bullet per line, e.g.\nMode selector: Chatty AI vs Command Palette\nSPX/major index options now prioritized"}
          style={{ ...inputSx, resize: "vertical", lineHeight: 1.5, marginBottom: 10 }} />
        <button onClick={savePopup} disabled={saving} style={btnSx}>{saving ? "SAVING..." : "SAVE POPUP CONTENT"}</button>
      </div>

      <div style={boxSx}>
        <div style={labelSx}>V13 POPUP — DEV CONTROLS</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <button onClick={resetAll} disabled={resetBusy} style={{ ...btnSx, background: "rgba(255,77,109,0.08)", border: "1px solid rgba(255,77,109,0.3)", color: C.red }}>
            RESET FOR ALL USERS
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="user@email.com"
            style={{ ...inputSx, flex: 1 }} />
          <button onClick={resetUser} disabled={resetBusy || !resetEmail.trim()} style={btnSx}>RESET FOR USER</button>
        </div>
      </div>

      {/* V13.6: dev tools — jump to the bot and fire a Comet so the effect can be
          verified on a live signal (or a demo if the feed is quiet). */}
      <div style={boxSx}>
        <div style={labelSx}>DEV TOOLS</div>
        <button onClick={() => { try { localStorage.setItem("kronos_dev_comet_test", "1"); } catch {} window.location.href = "/"; }}
          style={{ ...btnSx, width: "100%" }}>
          ☄ OPEN BOT & FIRE TEST COMET
        </button>
        <div style={{ fontSize: 8.5, color: C.dim, marginTop: 8, lineHeight: 1.5 }}>
          Opens the KRONOS bot and launches a Comet on the latest live signal (or a demo if none is live), so you can confirm the effect end-to-end.
        </div>
      </div>
    </div>
  );
}
