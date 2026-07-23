// app/api/market-state/route.js — V13.6 public market-tradability read.
//
// Returns the broad-market chop verdict the terminal uses to show the "market
// unstable — stand down" banner. Public (no auth): it's non-sensitive market
// context, and every client needs it. Best-effort — never 500s so the banner
// logic degrades to "tradeable" on a hiccup rather than showing a false alarm.
import { marketRegime } from "../../../lib/chop";

export const revalidate = 0;

export async function GET() {
  try {
    const r = await marketRegime();
    return Response.json(r);
  } catch (e) {
    return Response.json({ choppy: false, ci: null, label: "unknown", error: String(e.message) });
  }
}
