// app/api/stripe/portal/route.js — V9 customer billing portal (env-gated).
// POST → { url } to Stripe's hosted manage-subscription portal.
import Stripe from "stripe";
import { getAdmin, getUserFromRequest, serverConfigured } from "../../../../lib/supabaseServer";

export async function POST(request) {
  if (!process.env.STRIPE_SECRET_KEY) return Response.json({ error: "Billing not configured" }, { status: 503 });
  if (!serverConfigured()) return Response.json({ error: "Accounts not configured" }, { status: 503 });

  const { user, error } = await getUserFromRequest(request);
  if (!user) return Response.json({ error: error || "Unauthorized" }, { status: 401 });

  const admin = getAdmin();
  const { data: sub } = await admin.from("subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (!sub?.stripe_customer_id) return Response.json({ error: "No billing profile yet — subscribe first." }, { status: 400 });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${origin}/`,
  });
  return Response.json({ url: session.url });
}
