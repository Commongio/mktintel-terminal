"use client";
// /legal — Terms of Service, Privacy Policy, Risk Disclaimer (V10.5).
//
// IMPORTANT: this is a strong starting DRAFT written to match how the product
// actually behaves (standardized/impersonal signals — see PLAN_V9.md's
// COMPLIANCE section on the CTA 4.14(a)(9) exemption and the Advisers Act
// publisher exclusion). It is NOT a substitute for a real lawyer's review
// before charging money or going fully public. Treat it as the scaffold that
// review starts from, not the finished document.
import { useState } from "react";

const FM = "'JetBrains Mono',monospace";
const FC = "'Inter',sans-serif";
const C = { bg: "#05080F", panel: "#0A1018", surface: "#0D1520", border: "#1A2535", text: "#E2EDF8", dim: "#7A9AB5", accent: "#00d4aa", gold: "#f7c948" };

const DOCS = [
  { id: "terms", label: "Terms of Service" },
  { id: "privacy", label: "Privacy Policy" },
  { id: "disclaimer", label: "Risk Disclaimer" },
];

function H({ children }) {
  return <div style={{ fontFamily: FM, fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color: C.accent, marginTop: 20, marginBottom: 8 }}>{children}</div>;
}
function P({ children }) {
  return <p style={{ fontFamily: FC, fontSize: 13, color: C.text, lineHeight: 1.7, marginBottom: 10 }}>{children}</p>;
}
function Li({ children }) {
  return <li style={{ fontFamily: FC, fontSize: 13, color: C.text, lineHeight: 1.7, marginBottom: 6 }}>{children}</li>;
}

function Terms() {
  return (
    <>
      <P><b>Last updated:</b> draft — set this date when finalized.</P>
      <P>These Terms of Service ("Terms") govern access to and use of this trading-intelligence terminal
      (the "Service"). By creating an account or using the Service, you agree to these Terms.</P>

      <H>1. What the Service is</H>
      <P>The Service provides market data, technical/structural analysis, and standardized trade setups
      ("Signals"), plus tools to track your own watchlists, layouts, and paper/shadow trading activity.
      The Service does not place trades, hold funds, or connect to your brokerage account — any live
      trading you do happens entirely in your own separate broker account, at your own discretion.</P>

      <H>2. Not personalized investment advice</H>
      <P>Signals are generated the same way for every subscriber — the same setup, at the same time, to
      everyone who sees it. Nothing in the Service is tailored to your individual financial situation,
      and nothing here creates an advisory relationship between you and the Service. You are the trader
      of record for every decision you make. See the Risk Disclaimer for more.</P>

      <H>3. Accounts</H>
      <ul style={{ paddingLeft: 20 }}>
        <Li>You must provide accurate information and keep your login credentials confidential.</Li>
        <Li>You're responsible for all activity under your account.</Li>
        <Li>Accounts are for one individual's personal use; reselling or sublicensing access is not
        permitted without written agreement.</Li>
      </ul>

      <H>4. Subscriptions &amp; billing</H>
      <P>Paid tiers, when active, are billed through Stripe on a recurring basis until canceled. Fees are
      non-refundable except where required by law. Prices and tier features may change with notice.</P>

      <H>5. Acceptable use</H>
      <P>No reverse-engineering, scraping, reselling Signals as your own product, or using the Service to
      build a competing product. No automated abuse of the API or data feeds beyond normal in-app use.</P>

      <H>6. No warranty / limitation of liability</H>
      <P>The Service is provided "as is." Market data comes from third-party providers and can be
      delayed, incomplete, or wrong. To the maximum extent permitted by law, the Service and its
      operators are not liable for trading losses, lost profits, or any indirect or consequential
      damages arising from your use of the Service.</P>

      <H>7. Termination</H>
      <P>Either side may terminate at any time. We may suspend or terminate accounts for abuse, non-payment,
      or violation of these Terms.</P>

      <H>8. Changes</H>
      <P>These Terms may be updated as the Service evolves; material changes will be flagged in-app.</P>

      <H>9. Governing law</H>
      <P>[Placeholder — set the governing jurisdiction and dispute-resolution process before public launch.]</P>
    </>
  );
}

function Privacy() {
  return (
    <>
      <P><b>Last updated:</b> draft — set this date when finalized.</P>
      <P>This Privacy Policy explains what data the Service collects, why, and what you can do about it.</P>

      <H>1. What we collect</H>
      <ul style={{ paddingLeft: 20 }}>
        <Li><b>Account:</b> email address and authentication data (via Supabase Auth).</Li>
        <Li><b>Settings &amp; personalization:</b> theme, layout, watchlist, font/panel preferences.</Li>
        <Li><b>Activity:</b> chat messages you send to the AI desk, paper-trading/shadow-account history,
        signal-feed preferences (conviction threshold, cadence).</Li>
        <Li><b>Billing:</b> handled by Stripe directly — we do not store your card number.</Li>
        <Li>We do <b>not</b> store live broker API credentials server-side; if you paste one in for the
        side-by-side broker window, it stays in your browser only.</Li>
      </ul>

      <H>2. Why we collect it</H>
      <P>To run your account (auth, sync across your devices), to operate the Service (serving Signals,
      running your AI desk conversations), and to bill subscriptions. We do not sell your data.</P>

      <H>3. Who else sees it</H>
      <P>Sub-processors that necessarily touch your data to run the Service: Supabase (database/auth),
      Anthropic (AI desk chat completions), Stripe (billing), and market-data providers (Yahoo Finance,
      Finnhub, Twelve Data — these receive ticker/symbol queries, not your personal identity).</P>

      <H>4. Data retention &amp; your rights</H>
      <P>You can delete your account at any time from Settings, which removes your account row and
      associated data. Some data may persist briefly in backups before rotating out. Contact us to
      request an export or deletion outside the app.</P>

      <H>5. Cookies &amp; local storage</H>
      <P>The Service uses browser local storage for session state and offline caching of your
      preferences, and cookies for authentication. No third-party ad-tracking.</P>

      <H>6. Children</H>
      <P>The Service is not directed to anyone under 18 and is not intended for use in opening or
      managing brokerage/trading accounts by minors.</P>

      <H>7. Contact</H>
      <P>[Placeholder — add a support/privacy contact email before public launch.]</P>
    </>
  );
}

function Disclaimer() {
  return (
    <>
      <P><b>Last updated:</b> draft — set this date when finalized.</P>
      <P style={{ color: C.gold, fontWeight: 700 }}>This terminal is a proprietary research and analysis
      tool. Nothing in it is financial, investment, legal, or tax advice.</P>

      <H>1. Standardized, not personalized</H>
      <P>Every Signal is generated identically for every subscriber at the same time — the same setup,
      the same conviction score, the same trade plan. No Signal is customized to your account size, risk
      tolerance, tax situation, or goals. Any risk numbers shown (position sizing, daily-loss limits) are
      a local calculator applied to inputs you provide yourself — they are not personalized recommendations.</P>

      <H>2. You are the trader of record</H>
      <P>The Service does not execute trades, hold custody of funds, or connect to your brokerage account.
      Every order you place happens in your own separate broker or prop-firm account, entirely at your own
      decision and risk. The Service is not a broker-dealer, investment adviser, or commodity trading
      advisor, and using it does not create any such relationship.</P>

      <H>3. Trading involves substantial risk</H>
      <P>Futures, options, and equities trading can result in the loss of your entire investment, and in
      the case of some instruments, losses can exceed your initial deposit. Past performance of any
      Signal, strategy, or the Service's historical track record is not indicative of future results.</P>

      <H>4. Data can be wrong, late, or unavailable</H>
      <P>Market data is sourced from multiple third-party providers with automatic failover. Even so, data
      can be delayed, incomplete, or incorrect, especially during high volatility or provider outages.
      Verify anything critical against your broker's own live data before acting.</P>

      <H>5. Paper trading / shadow accounts</H>
      <P>Paper-trading results are simulated and do not reflect real fills, slippage, fees, or the
      psychological pressure of trading real capital. They are for tracking and learning purposes only.</P>

      <H>6. Prop-firm evaluations</H>
      <P>Any prop-firm rules, daily-loss limits, or evaluation criteria shown are estimates based on
      publicly available program terms and are not affiliated with or endorsed by any prop firm. Always
      confirm current rules directly with your prop firm.</P>
    </>
  );
}

export default function LegalPage() {
  const [active, setActive] = useState(() => {
    if (typeof window === "undefined") return "terms";
    const h = window.location.hash.replace("#", "");
    return DOCS.some((d) => d.id === h) ? h : "terms";
  });
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: "40px 20px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 760 }}>
        <div style={{ fontFamily: FM, fontSize: 10, fontWeight: 800, letterSpacing: 3, color: C.accent, marginBottom: 6 }}>KRONOS TERMINAL</div>
        <div style={{ fontFamily: FC, fontSize: 22, fontWeight: 700, marginBottom: 18 }}>Legal</div>

        <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 12, flexWrap: "wrap" }}>
          {DOCS.map((d) => (
            <button key={d.id} onClick={() => setActive(d.id)} style={{
              fontFamily: FM, fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: "8px 14px", borderRadius: 7, cursor: "pointer",
              color: active === d.id ? C.accent : C.dim,
              background: active === d.id ? `${C.accent}12` : "transparent",
              border: `1px solid ${active === d.id ? `${C.accent}35` : C.border}`,
            }}>{d.label}</button>
          ))}
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 24px" }}>
          {active === "terms" && <Terms />}
          {active === "privacy" && <Privacy />}
          {active === "disclaimer" && <Disclaimer />}
        </div>

        <div style={{ fontFamily: FM, fontSize: 8.5, color: C.dim, marginTop: 18, lineHeight: 1.6, opacity: 0.8 }}>
          Draft documents — written to match how this product actually works, not a substitute for review
          by a licensed attorney before public launch or charging customers.
        </div>
      </div>
    </div>
  );
}
