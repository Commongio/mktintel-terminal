// app/api/broker/ibkr/route.js
// Real IBKR integration via Client Portal Web API
// REQUIRES: IBKR Client Portal Gateway running locally (download from IBKR website)
// User must log in via the gateway's web login page (https://localhost:5000) BEFORE this will work
// Docs: https://www.interactivebrokers.com/api/doc.html

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { gatewayUrl = "https://localhost:5000/v1/api" } = body;

  try {
    // Step 1: check auth status
    const authR = await fetch(`${gatewayUrl}/iserver/auth/status`, { method: "POST" });
    if (!authR.ok) throw new Error(`Gateway not reachable (${authR.status})`);
    const authData = await authR.json();
    if (!authData.authenticated) {
      return Response.json(
        { error: "Not authenticated. Open the Gateway login page in your browser and log in first." },
        { status: 401 }
      );
    }

    // Step 2: get accounts
    const accR = await fetch(`${gatewayUrl}/iserver/accounts`);
    const accData = await accR.json();
    const accountId = accData?.accounts?.[0];
    if (!accountId) throw new Error("No account found");

    // Step 3: get summary (balance, margin, buying power)
    const summaryR = await fetch(`${gatewayUrl}/iserver/account/${accountId}/summary`);
    const summary  = summaryR.ok ? await summaryR.json() : {};

    // Step 4: get positions
    const posR = await fetch(`${gatewayUrl}/portfolio/${accountId}/positions/0`);
    const posData = posR.ok ? await posR.json() : [];

    const positions = (Array.isArray(posData) ? posData : []).map(p => ({
      symbol:    p.contractDesc || p.ticker,
      quantity:  p.position,
      costBasis: p.avgCost ? Number(p.avgCost).toFixed(2) : null,
    }));

    return Response.json({
      balance:    summary?.netliquidation?.amount ?? summary?.equitywithloanvalue?.amount ?? null,
      dayPnl:     summary?.dailypnl?.amount ?? null,
      margin:     summary?.maintmarginreq?.amount ?? null,
      optionsBP:  summary?.buyingpower?.amount ?? null,
      positions,
      fetchedAt: Date.now(),
      source: "ibkr-gateway",
    });
  } catch (err) {
    return Response.json(
      { error: `IBKR Gateway connection failed: ${err.message}. Make sure the Gateway is running and you're logged in.` },
      { status: 502 }
    );
  }
}