// app/api/admin/brain/route.js — V13 owner-only "developer brain access".
// GET   -> { systemPromptAddendum, featureFlags, popupContent }
// PUT   -> { key: "system_prompt_addendum"|"feature_flags"|"v13_popup_content", value }
// POST  -> { action: "reset_popup_all" } | { action: "reset_popup_user", email }
//
// Scope (deliberately, per Gio's V13 spec answer): this is a system-prompt
// addendum + feature-flag toggle panel, NOT literal model retraining or
// self-modifying code. See lib/supabaseServer.js's isOwner() for the gate —
// same OWNER_EMAILS allowlist that already powers /admin/codes.
import { getAdmin, getUserFromRequest, isOwner, serverConfigured } from "../../../../lib/supabaseServer";
import { buildSignalStats } from "../../../../lib/signalStats";
import { buildLessons, summarizeLessons } from "../../../../lib/lessons";

async function requireOwner(request) {
  if (!serverConfigured()) {
    return { fail: Response.json({ error: "Auth not configured" }, { status: 503 }) };
  }
  const { user, error } = await getUserFromRequest(request);
  if (!user) return { fail: Response.json({ error: error || "Unauthorized" }, { status: 401 }) };
  if (!isOwner(user)) return { fail: Response.json({ error: "Owner access required" }, { status: 403 }) };
  return { user };
}

const KEYS = ["system_prompt_addendum", "feature_flags", "v13_popup_content"];

// V14: must stay in lockstep with RELEASE_POPUP_VERSION in app/page.js. Bumping
// the release there means bumping it here, or "reset popup" clears a stale flag
// that nothing reads any more.
const RELEASE_POPUP_SETTINGS_KEY = "hasSeenV14Popup";

export async function GET(request) {
  const gate = await requireOwner(request);
  if (gate.fail) return gate.fail;
  const admin = getAdmin();

  // V13.5: admin-only self-teaching LOSS LOG — the aggregate win/loss stats +
  // recent losers the bot↔terminal brain sync learns from. Owner-gated above.
  const { searchParams } = new URL(request.url);
  if (searchParams.get("view") === "losslog") {
    try {
      const stats = await buildSignalStats(admin, { lookbackDays: 45 });
      // Rank setup signatures by worst win-rate (the ones dragging the bot down).
      const worstSetups = Object.entries(stats.byKey || {})
        .filter(([, v]) => v.status === "ready")
        .sort((a, b) => a[1].winRate - b[1].winRate)
        .slice(0, 12)
        .map(([key, v]) => ({ key, ...v }));
      return Response.json({
        available: stats.available,
        sampleSize: stats.sampleSize || 0,
        overall: stats.overall,
        byAssetClass: stats.byAssetClass || {},
        worstSetups,
        recentLosers: (stats.recentLosers || []).map((r) => ({
          symbol: r.symbol, asset_class: r.asset_class, interval: r.interval,
          direction: r.direction, conviction: r.conviction,
          created_at: r.created_at, resolved_at: r.resolved_at,
        })),
        // V14: the loop learns from WINS too (dev can now grade a deletion as
        // "closed with profit"), so the panel shows both sides of the ledger
        // instead of only what went wrong.
        bestSetups: Object.entries(stats.byKey || {})
          .filter(([, v]) => v.status === "ready")
          .sort((a, b) => b[1].winRate - a[1].winRate)
          .slice(0, 12)
          .map(([key, v]) => ({ key, ...v })),
      });
    } catch (e) {
      return Response.json({ available: false, error: String(e.message) });
    }
  }

  // V14: LESSONS LEARNED ledger — what the engine taught itself and what it
  // changed as a result, plus an on-demand deterministic summary.
  if (searchParams.get("view") === "lessons") {
    try {
      const stats = await buildSignalStats(admin, { lookbackDays: 90 });
      const ledger = buildLessons(stats);
      return Response.json({ ...ledger, summary: summarizeLessons(ledger) });
    } catch (e) {
      return Response.json({ available: false, error: String(e.message) });
    }
  }

  const { data, error } = await admin.from("brain_config").select("key,value").in("key", KEYS);
  // Missing table (migration not run yet) degrades to empty defaults rather than a 500.
  if (error) return Response.json({ systemPromptAddendum: "", featureFlags: {}, popupContent: null, degraded: true });

  const byKey = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  return Response.json({
    systemPromptAddendum: byKey.system_prompt_addendum || "",
    featureFlags: byKey.feature_flags || {},
    popupContent: byKey.v13_popup_content || null,
  });
}

export async function PUT(request) {
  const gate = await requireOwner(request);
  if (gate.fail) return gate.fail;
  const admin = getAdmin();

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { key, value } = body || {};
  if (!KEYS.includes(key)) return Response.json({ error: `key must be one of ${KEYS.join(", ")}` }, { status: 400 });
  if (JSON.stringify(value ?? "").length > 200_000) return Response.json({ error: "Value too large" }, { status: 413 });

  const { error } = await admin.from("brain_config")
    .upsert({ key, value: value ?? null, updated_at: new Date().toISOString() });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function POST(request) {
  const gate = await requireOwner(request);
  if (gate.fail) return gate.fail;
  const admin = getAdmin();

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  // V13 dev controls: reset the beta popup's "seen" flag so it shows again.
  if (body?.action === "reset_popup_all") {
    // user_settings.settings is a jsonb blob per user — clear just the one key
    // across every row rather than truncating the whole table.
    const { data: rows, error: selErr } = await admin.from("user_settings").select("user_id,settings");
    if (selErr) return Response.json({ error: selErr.message }, { status: 500 });
    let updated = 0;
    for (const row of rows || []) {
      if (!row.settings?.[RELEASE_POPUP_SETTINGS_KEY]) continue;
      const settings = { ...row.settings, [RELEASE_POPUP_SETTINGS_KEY]: false };
      const { error } = await admin.from("user_settings").update({ settings }).eq("user_id", row.user_id);
      if (!error) updated++;
    }
    return Response.json({ ok: true, updated });
  }

  if (body?.action === "reset_popup_user") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return Response.json({ error: "email required" }, { status: 400 });
    // Supabase admin has no "get user by email" list filter server-side here, so
    // page through admin.listUsers (fine at this app's scale) to find the id.
    let userId = null;
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return Response.json({ error: error.message }, { status: 500 });
      const hit = (data?.users || []).find((u) => u.email?.toLowerCase() === email);
      if (hit) userId = hit.id;
      if (!data?.users?.length || data.users.length < 200) break;
    }
    if (!userId) return Response.json({ error: "No user with that email" }, { status: 404 });

    const { data: existing } = await admin.from("user_settings").select("settings").eq("user_id", userId).maybeSingle();
    const settings = { ...(existing?.settings || {}), [RELEASE_POPUP_SETTINGS_KEY]: false };
    const { error } = await admin.from("user_settings").upsert({ user_id: userId, settings, updated_at: new Date().toISOString() });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  // ── V14.5: PURGE SIGNALS WRITTEN BY A BUGGY ENGINE VERSION ─────────────────
  // Distinct from the per-signal delete-reason tags: those record a TRADING
  // outcome and feed the self-teaching loop. These rows are DATA ERRORS (e.g.
  // the pre-V14 bug that filed equity signals under futures) and must be erased
  // WITHOUT being learned from — training on them would teach the engine from
  // its own misclassification.
  //
  // Destructive, so: dryRun is the default, the caller must pass an explicit
  // filter, and confirm:true is required to actually delete.
  if (body?.action === "purge_bad_signals") {
    const filters = body.filters || {};
    const assetClass = ["futures", "options", "equity"].includes(filters.assetClass) ? filters.assetClass : null;
    const before = filters.before ? new Date(filters.before) : null;
    const engineVersion = typeof filters.engineVersion === "string" && filters.engineVersion.trim()
      ? filters.engineVersion.trim() : null;
    // The specific known bug: equity-interval rows filed as futures.
    const misrouted = filters.misroutedOnly === true;

    if (!assetClass && !before && !engineVersion && !misrouted) {
      return Response.json({ error: "Refusing to purge with no filter — pass at least one." }, { status: 400 });
    }
    if (before && Number.isNaN(before.getTime())) {
      return Response.json({ error: "Invalid `before` date" }, { status: 400 });
    }

    let q = admin.from("signals").select("id,asset_class,symbol,interval,status,engine_version,created_at");
    if (assetClass) q = q.eq("asset_class", assetClass);
    if (before) q = q.lt("created_at", before.toISOString());
    if (engineVersion) q = q.eq("engine_version", engineVersion);
    // The misrouted set: futures rows at intervals futures can never legally
    // hold (1d/1w/1mo) — i.e. equity/options signals written to the wrong side.
    if (misrouted) q = q.eq("asset_class", "futures").in("interval", ["1d", "1w", "1mo"]);

    const { data: matches, error: selErr } = await q.limit(5000);
    if (selErr) return Response.json({ error: selErr.message }, { status: 500 });
    const ids = (matches || []).map((r) => r.id);

    // Preview by default. Nothing is deleted unless confirm is explicitly true.
    if (body.confirm !== true) {
      return Response.json({
        ok: true, dryRun: true, matched: ids.length,
        sample: (matches || []).slice(0, 20),
      });
    }
    if (!ids.length) return Response.json({ ok: true, deleted: 0 });

    const { error: delErr } = await admin.from("signals").delete().in("id", ids);
    if (delErr) return Response.json({ error: delErr.message }, { status: 500 });
    return Response.json({ ok: true, deleted: ids.length });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
