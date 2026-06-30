// app/api/broker/tradier/route.js
// Real Tradier integration — free sandbox available at developer.tradier.com
// Sandbox base: https://sandbox.tradier.com/v1
// Production base: https://api.tradier.com/v1

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { token, accountId, sandbox = true } = body;
  if (!token || !accountId) {
    return Response.json({ error: "Missing token or accountId" }, { status: 400 });
  }

  const BASE = sandbox ? "https://sandbox.tradier.com/v1" : "https://api.tradier.com/v1";
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  try {
    const [balR, posR] = await Promise.all([
      fetch(`${BASE}/accounts/${accountId}/balances`, { headers }),
      fetch(`${BASE}/accounts/${accountId}/positions`, { headers }),
    ]);

    if (!balR.ok) {
      const t = await balR.text();
      return Response.json({ error: `Tradier auth/balance error (${balR.status})`, detail: t }, { status: 502 });
    }

    const balData = await balR.json();
    const posData = posR.ok ? await posR.json() : { positions: "null" };

    const bal = balData?.balances ?? {};
    const marginBal = bal.margin ?? {};
    const cashBal   = bal.cash   ?? {};

    let positions = [];
    const rawPos = posData?.positions?.position;
    if (rawPos) {
      const arr = Array.isArray(rawPos) ? rawPos : [rawPos];
      positions = arr.map(p => ({
        symbol:     p.symbol,
        quantity:   p.quantity,
        costBasis:  p.cost_basis ? (p.cost_basis / p.quantity).toFixed(2) : null,
      }));
    }

    return Response.json({
      balance:    bal.total_equity ?? bal.account_value ?? null,
      dayPnl:     bal.close_pl != null ? bal.close_pl : (bal.open_pl ?? null),
      margin:     marginBal.maintenance ?? cashBal.cash_available ?? null,
      optionsBP:  bal.option_buying_power ?? marginBal.option_buying_power ?? null,
      positions,
      raw: { balances: bal },
      fetchedAt: Date.now(),
      source: sandbox ? "tradier-sandbox" : "tradier-live",
    });
  } catch (err) {
    return Response.json({ error: "Failed to reach Tradier API", detail: String(err) }, { status: 502 });
  }
}