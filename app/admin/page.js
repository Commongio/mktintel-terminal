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
    <div style={{ minHeight: "100vh", background: C.bg, padding: "26px 30px", fontFamily: FM }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@700;800&family=JetBrains+Mono:wght@400;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;} button{cursor:pointer;} input,select{outline:none;}`}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: FD, fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: 1 }}>REGISTRATION CODES</div>
          <div style={{ fontSize: 8, color: C.dim, letterSpacing: 2, marginTop: 3 }}>OWNER ADMIN · {total} CODES TOTAL</div>
        </div>
        <a href="/" style={{ color: C.dim, fontSize: 10, letterSpacing: 1, textDecoration: "none" }}>← TERMINAL</a>
      </div>

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
    </div>
  );
}
