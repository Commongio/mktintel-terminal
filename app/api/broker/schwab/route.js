// app/api/broker/schwab/route.js
// Official Schwab API (post-TD Ameritrade merger)
// Docs: https://developer.schwab.com
// Register at developer.schwab.com → get client_id + client_secret
// OAuth2 Authorization Code flow

const SCHWAB_BASE  = "https://api.schwabapi.com";
const SCHWAB_TOKEN = "https://api.schwabapi.com/v1/oauth/token";

// ── STEP 1: Get authorization URL (send user here to log in)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  const clientId    = process.env.SCHWAB_CLIENT_ID;
  const redirectUri = process.env.SCHWAB_REDIRECT_URI || "http://localhost:3000/api/broker/schwab/callback";

  if (!clientId) {
    return Response.json({ error: "SCHWAB_CLIENT_ID not set in .env.local" }, { status: 500 });
  }

  // Return the authorization URL the user must visit
  if (action === "auth-url") {
    const authUrl = new URL("https://api.schwabapi.com/v1/oauth/authorize");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", "readonly");
    return Response.json({ authUrl: authUrl.toString() });
  }

  return Response.json({ error: "Use action=auth-url or POST with access_token" }, { status: 400 });
}

// ── STEP 2: Exchange code for token + get account data
export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const clientId     = process.env.SCHWAB_CLIENT_ID;
  const clientSecret = process.env.SCHWAB_CLIENT_SECRET;
  const redirectUri  = process.env.SCHWAB_REDIRECT_URI || "http://localhost:3000/api/broker/schwab/callback";

  if (!clientId || !clientSecret) {
    return Response.json({ error: "SCHWAB_CLIENT_ID and SCHWAB_CLIENT_SECRET required in .env.local" }, { status: 500 });
  }

  const { code, access_token, account_number } = body;
  let token = access_token;

  // Exchange authorization code for access token if we have a code
  if (code && !token) {
    const tokenRes = await fetch(SCHWAB_TOKEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type:   "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      const e = await tokenRes.text();
      return Response.json({ error: `Token exchange failed: ${e}` }, { status: 502 });
    }
    const tokenData = await tokenRes.json();
    token = tokenData.access_token;
  }

  if (!token) {
    return Response.json({ error: "No access_token or code provided" }, { status: 400 });
  }

  const authHeader = `Bearer ${token}`;

  try {
    // Get accounts list
    const accRes = await fetch(`${SCHWAB_BASE}/trader/v1/accounts/accountNumbers`, {
      headers: { Authorization: authHeader },
    });
    if (!accRes.ok) throw new Error(`Accounts error ${accRes.status}`);
    const accounts = await accRes.json();
    const acctHash = account_number || accounts?.[0]?.hashValue;
    if (!acctHash) throw new Error("No account found");

    // Get account details (balance, positions)
    const detailRes = await fetch(`${SCHWAB_BASE}/trader/v1/accounts/${acctHash}?fields=positions`, {
      headers: { Authorization: authHeader },
    });
    if (!detailRes.ok) throw new Error(`Account detail error ${detailRes.status}`);
    const detail = await detailRes.json();

    const bal = detail?.securitiesAccount?.currentBalances ?? {};
    const pos = detail?.securitiesAccount?.positions ?? [];

    const positions = pos.map(p => ({
      symbol:    p.instrument?.symbol ?? "?",
      quantity:  p.longQuantity ?? p.shortQuantity ?? 0,
      costBasis: p.averagePrice ? Number(p.averagePrice).toFixed(2) : null,
      mktValue:  p.marketValue ? Number(p.marketValue).toFixed(2) : null,
    }));

    return Response.json({
      balance:   bal.liquidationValue ?? bal.totalCash ?? null,
      dayPnl:    bal.dayTradingBuyingPower != null ? null : null, // Schwab doesn't expose daily P&L directly
      margin:    bal.maintenanceRequirement ?? null,
      optionsBP: bal.optionBuyingPower ?? null,
      cashBP:    bal.cashBalance ?? null,
      positions,
      access_token: token, // return so client can store for refresh
      fetchedAt: Date.now(),
      source: "schwab-official",
    });

  } catch (err) {
    return Response.json({
      error: `Schwab API error: ${err.message}`,
      note: "Make sure your Schwab Developer App is approved and the token is valid",
    }, { status: 502 });
  }
}