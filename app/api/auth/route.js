// app/api/auth/route.js
// Validates access codes against ACCESS_CODES env variable

const VALID_CODES = (process.env.ACCESS_CODES || "")
  .split(",")
  .map(c => c.trim().toUpperCase())
  .filter(Boolean);

export async function POST(request) {
  try {
    const { code } = await request.json();
    if (!code) return Response.json({ valid: false }, { status: 400 });
    const isValid = VALID_CODES.includes(code.trim().toUpperCase());
    if (isValid) return Response.json({ valid: true });
    return Response.json({ valid: false }, { status: 401 });
  } catch {
    return Response.json({ valid: false, error: "Server error" }, { status: 500 });
  }
}