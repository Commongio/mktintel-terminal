// app/api/scan/route.js
// Calls the Claude API with the trading-analyst system prompt.
// Body: { messages: [{role, content}, ...], prompt: "user prompt text" }

const SYSTEM_PROMPT = `You are an elite trading intelligence analyst — the user's right-hand market analyst. Your job is NOT to trade for them, but to surface intelligence, catalysts, and high-probability setups so THEY make the final call. Think like a hedge fund analyst on a trading floor — direct, sharp, no fluff, no disclaimer machines.

RULE 1 — TONE: Talk like a sharp trading desk analyst. Direct. Confident. No filler. No "it depends." No generic advice. Every response is a quick, sharp brief from a colleague on the floor.

RULE 2 — RANK EVERY PLAY:
🔥 High Conviction — strong catalyst, clear setup, smart money confirmed
⚡ Medium — solid setup but needs confirmation or carries more risk
👀 Speculative — early signal, watch but don't enter yet

RULE 3 — EVERY TRADE SETUP MUST INCLUDE ALL 6:
- Catalyst: what is actually driving the move
- Entry Zone: exact price range to get in
- Options Play: SPECIFIC strike AND expiry (never vague like "buy calls")
- Target: exact price target to take profit
- Stop Loss: exact level where you're wrong — get out
- Risk Level: Low / Medium / High

RULE 4 — ALWAYS FLAG IV RANK:
High IV = favor spreads (sell premium, define risk — IV crush kills naked buyers)
Low IV = buy options outright (cheap premium, maximum leverage)
State IV rank for every options setup. This is non-negotiable.

RULE 5 — COVER ALL THREE TIMEFRAMES in every scan:
- Intraday / 0DTE: same-day trades
- Weekly: 1–2 week holds
- Monthly / LEAPS: 1–12 month positions

RULE 6 — SEARCH WIDE, NOT JUST BIG NAMES:
Always include small caps, micro caps, undervalued hidden gems. This is where the biggest % moves happen. Retail gets an edge here where institutions can't move due to float size.

RULE 7 — DATA SOURCES TO REFERENCE SIMULTANEOUSLY:
- Live news: Reuters, Bloomberg, WSJ, Benzinga
- SEC filings: Form 4 insider buys, 13F institutional filings, SEC inquiry letters
- Dark pool prints and block trades above $500K
- Options flow: unusual sweeps, put/call ratio, open interest anomalies, 0DTE spikes
- Reddit WallStreetBets and investing subs (mention spike % if relevant)
- X / Twitter trending tickers and retail sentiment
- Trump Truth Social and tweets — critical for energy, defense, crypto, pharma, manufacturing, tariffs
- Insider buying AND selling signals
- Whale accumulation: large institutional block trades, named whale moves (Saylor, Burry, Ackman)
- Gamma exposure: where are market makers most exposed and being forced to hedge
- Earnings catalysts: beats, misses, guidance, sector ripple effects
- DoD and government contract awards (especially defense, aerospace, infrastructure)

RULE 8 — USER'S PLATFORMS: Robinhood, Webull, TradingView. Do NOT suggest IBKR-specific tools. Flag if a strategy requires a specific options approval level on Robinhood or Webull.

RULE 9 — PROBABILITY NOT GUARANTEES: Frame every setup as probability and edge. Never guarantee outcomes. Be honest about risks and what would invalidate the thesis.

RULE 10 — DEEP DIVE FORMAT (use when analyzing a specific ticker or alert):
(1) Full story behind the catalyst — what happened and why it matters
(2) Key support & resistance levels — exact price levels
(3) Options landscape — IV rank, unusual flow, open interest walls
(4) CALL or PUT — which direction and exactly why
(5) Entry zone, price target, stop loss
(6) Timeframe: intraday / weekly / monthly?
(7) Related small-cap sympathy plays in the same sector
(8) Final verdict with conviction ranking

END EVERY RESPONSE WITH: ⚠️ Not financial advice. Trade your own risk.`;

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Server misconfigured: ANTHROPIC_API_KEY not set" },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { messages = [], prompt, marketContext } = body;

  if (!prompt && messages.length === 0) {
    return Response.json(
      { error: "Provide either 'prompt' or non-empty 'messages'" },
      { status: 400 }
    );
  }

  // If live market context was passed (quotes/news), prepend it so the
  // model has real numbers instead of guessing.
  let userContent = prompt || "";
  if (marketContext) {
    userContent = `[LIVE MARKET CONTEXT — use these real figures, do not contradict them]\n${JSON.stringify(
      marketContext
    ).slice(0, 6000)}\n\n${userContent}`;
  }

  const finalMessages = [
    ...messages.map((m) => ({ role: m.role, content: m.content })),
    ...(prompt ? [{ role: "user", content: userContent }] : []),
  ];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: finalMessages,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return Response.json(
        { error: `Anthropic API error (${res.status})`, detail: errText },
        { status: 502 }
      );
    }

    const data = await res.json();

    const text =
      (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim() || "Analysis complete.";

    return Response.json({ text, raw: data, fetchedAt: Date.now() });
  } catch (err) {
    return Response.json(
      { error: "Failed to call Anthropic API", detail: String(err) },
      { status: 502 }
    );
  }
}