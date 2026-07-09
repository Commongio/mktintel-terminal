// app/api/admin/codes/route.js — V9 owner-only registration code management.
// GET    ?status=&q=&page=&pageSize=   list codes (paginated, searchable)
// POST   { count, batchLabel }         generate a batch
// PATCH  { code, action:"revoke" }     revoke an unused code
import crypto from "crypto";
import { getAdmin, getUserFromRequest, isOwner, serverConfigured } from "../../../../lib/supabaseServer";

async function requireOwner(request) {
  if (!serverConfigured()) {
    return { fail: Response.json({ error: "Auth not configured" }, { status: 503 }) };
  }
  const { user, error } = await getUserFromRequest(request);
  if (!user) return { fail: Response.json({ error: error || "Unauthorized" }, { status: 401 }) };
  if (!isOwner(user)) return { fail: Response.json({ error: "Owner access required" }, { status: 403 }) };
  return { user };
}

function genCode() {
  // KRN-XXXXXX, unambiguous alphabet (no 0/O/1/I), crypto-random.
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) s += alphabet[bytes[i] % alphabet.length];
  return `KRN-${s}`;
}

export async function GET(request) {
  const gate = await requireOwner(request);
  if (gate.fail) return gate.fail;
  const admin = getAdmin();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const q = (searchParams.get("q") || "").trim().toUpperCase();
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || 50)));

  let query = admin.from("registration_codes")
    .select("code,status,redeemed_by,redeemed_at,batch_label,note,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (status && status !== "all") query = query.eq("status", status);
  if (q) query = query.ilike("code", `%${q}%`);

  const { data, count, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Resolve redeemer emails (single batched lookup).
  const ids = [...new Set((data || []).map((r) => r.redeemed_by).filter(Boolean))];
  const emails = {};
  await Promise.all(ids.map(async (id) => {
    const { data: u } = await admin.auth.admin.getUserById(id).catch(() => ({ data: null }));
    if (u?.user?.email) emails[id] = u.user.email;
  }));

  return Response.json({
    codes: (data || []).map((r) => ({ ...r, redeemed_email: r.redeemed_by ? emails[r.redeemed_by] || r.redeemed_by : null })),
    total: count ?? 0, page, pageSize,
  });
}

export async function POST(request) {
  const gate = await requireOwner(request);
  if (gate.fail) return gate.fail;
  const admin = getAdmin();

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const count = Math.min(500, Math.max(1, Number(body.count || 10)));
  const batchLabel = String(body.batchLabel || `batch-${new Date().toISOString().slice(0, 10)}`).slice(0, 60);

  const rows = [];
  const seen = new Set();
  while (rows.length < count) {
    const code = genCode();
    if (seen.has(code)) continue;
    seen.add(code);
    rows.push({ code, batch_label: batchLabel });
  }

  const { error } = await admin.from("registration_codes").insert(rows);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, generated: rows.map((r) => r.code), batchLabel });
}

export async function PATCH(request) {
  const gate = await requireOwner(request);
  if (gate.fail) return gate.fail;
  const admin = getAdmin();

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (body.action !== "revoke" || !body.code) {
    return Response.json({ error: "Expected { code, action: 'revoke' }" }, { status: 400 });
  }
  const { data, error } = await admin.from("registration_codes")
    .update({ status: "revoked" })
    .eq("code", String(body.code).toUpperCase())
    .eq("status", "unused")
    .select("code");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data?.length) return Response.json({ error: "Code not found or not revocable (already used?)" }, { status: 400 });
  return Response.json({ ok: true });
}
