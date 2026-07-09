// app/api/stripe/checkout/route.js — V9 billing (env-gated).
// POST { tier: "basic"|"pro"|"propfirm" } → { url } Stripe Checkout session.
import Stripe from "stripe";
import { getUserFromRequest, serverConfigured } from "../../../../lib/supabaseServer";

const PRICE_ENV = {
  basic: "STRIPE_PRICE_BASIC",
  pro: "STRIPE_PRICE_PRO",
  propfirm: "STRIPE_PRICE_PROPFIRM",
};

export async function POST(request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return Response.json({ error: "Billing is not configured on this server." }, { status: 503 });
  }
  if (!serverConfigured()) {
    return Response.json({ error: "Accounts must be configured before billing." }, { status: 503 });
  }
  const { user, error } = await getUserFromRequest(request);
  if (!user) return Response.json({ error: error || "Unauthorized" }, { status: 401 });

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const tier = String(body.tier || "").toLowerCase();
  const priceId = process.env[PRICE_ENV[tier]];
  if (!priceId) return Response.json({ error: `Unknown or unconfigured tier: ${tier}` }, { status: 400 });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: user.email,
    client_reference_id: user.id,
    metadata: { user_id: user.id, tier },
    subscription_data: { metadata: { user_id: user.id, tier } },
    success_url: `${origin}/?billing=success`,
    cancel_url: `${origin}/?billing=cancelled`,
  });

  return Response.json({ url: session.url });
}
