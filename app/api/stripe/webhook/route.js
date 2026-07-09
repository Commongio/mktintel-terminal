// app/api/stripe/webhook/route.js — V9 billing webhook (env-gated).
// Keeps public.subscriptions in sync with Stripe subscription state.
// Configure the endpoint in Stripe Dashboard → Developers → Webhooks:
//   URL:    https://<your-domain>/api/stripe/webhook
//   Events: checkout.session.completed, customer.subscription.updated,
//           customer.subscription.deleted
import Stripe from "stripe";
import { getAdmin, serverConfigured } from "../../../../lib/supabaseServer";

export async function POST(request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: "Billing not configured" }, { status: 503 });
  }
  if (!serverConfigured()) return Response.json({ error: "Supabase not configured" }, { status: 503 });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = request.headers.get("stripe-signature");
  const raw = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return Response.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
  }

  const admin = getAdmin();

  async function upsertSub({ userId, customerId, subId, tier, status, periodEnd }) {
    if (!userId) return;
    await admin.from("subscriptions").upsert({
      user_id: userId,
      stripe_customer_id: customerId || null,
      stripe_sub_id: subId || null,
      tier: tier || "free",
      status: status || "none",
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      await upsertSub({
        userId: s.client_reference_id || s.metadata?.user_id,
        customerId: s.customer,
        subId: s.subscription,
        tier: s.metadata?.tier,
        status: "active",
      });
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      await upsertSub({
        userId: sub.metadata?.user_id,
        customerId: sub.customer,
        subId: sub.id,
        tier: event.type.endsWith("deleted") ? "free" : sub.metadata?.tier,
        status: event.type.endsWith("deleted") ? "cancelled" : sub.status,
        periodEnd: sub.current_period_end,
      });
      break;
    }
    default:
      break;
  }

  return Response.json({ received: true });
}
