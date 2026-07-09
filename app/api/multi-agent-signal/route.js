// app/api/multi-agent-signal/route.js — V9
// Thin HTTP wrapper around the shared engine core (lib/signalEngine).
// New in V9: ?assetClass=futures|options runs genuinely different agent
// stacks (options mode = underlying candles + options-flow agent).
import { runSignalEngine } from "../../../lib/signalEngine";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const assetClass = searchParams.get("assetClass") === "options" ? "options" : "futures";
  const symbol = (searchParams.get("symbol") || (assetClass === "options" ? "SPY" : "NQ")).toUpperCase();
  const interval = searchParams.get("interval") || undefined;
  const minConviction = searchParams.get("minConviction");
  const dailyLossUsed = searchParams.get("dailyLossUsed");
  const dailyLossLimit = searchParams.get("dailyLossLimit");

  try {
    const result = await runSignalEngine({
      assetClass, symbol, interval,
      propRules: {
        minConviction,
        dailyLossUsed: dailyLossUsed ? Number(dailyLossUsed) : null,
        dailyLossLimit: dailyLossLimit ? Number(dailyLossLimit) : null,
      },
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: String(err.message), symbol, assetClass }, { status: 502 });
  }
}
