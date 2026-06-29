"use client";
import { useState, useEffect } from "react";

const FM = "'JetBrains Mono',monospace";
const FD = "'Fraunces',serif";

const MAX_ATTEMPTS  = 3;
const LOCKOUT_MS    = 10 * 60 * 1000; // 10 minutes

export default function AccessGate({ onAccess }) {
  const [code,       setCode]       = useState("");
  const [error,      setError]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [attempts,   setAttempts]   = useState(0);
  const [lockedUntil,setLockedUntil]= useState(null);
  const [countdown,  setCountdown]  = useState(0);
  const [shake,      setShake]      = useState(false);
  const [focused,    setFocused]    = useState(false);

  // Restore lockout from sessionStorage on mount
  useEffect(() => {
    const lu = sessionStorage.getItem("kronos_locked_until");
    const at = sessionStorage.getItem("kronos_attempts");
    if (lu) setLockedUntil(Number(lu));
    if (at) setAttempts(Number(at));
  }, []);

  // Countdown ticker
  useEffect(() => {
    if (!lockedUntil) return;
    const t = setInterval(() => {
      const rem = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setCountdown(rem);
      if (rem <= 0) {
        setLockedUntil(null);
        setAttempts(0);
        setError("");
        sessionStorage.removeItem("kronos_locked_until");
        sessionStorage.removeItem("kronos_attempts");
      }
    }, 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const isLocked = lockedUntil && Date.now() < lockedUntil;

  const handleSubmit = async () => {
    if (!code.trim() || loading || isLocked) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/auth", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      const d = await r.json();
      if (d.valid) {
        sessionStorage.setItem("kronos_access", code.trim().toUpperCase());
        sessionStorage.removeItem("kronos_locked_until");
        sessionStorage.removeItem("kronos_attempts");
        onAccess();
      } else {
        const na = attempts + 1;
        setAttempts(na);
        sessionStorage.setItem("kronos_attempts", String(na));
        setShake(true);
        setTimeout(() => setShake(false), 500);
        if (na >= MAX_ATTEMPTS) {
          const lu = Date.now() + LOCKOUT_MS;
          setLockedUntil(lu);
          sessionStorage.setItem("kronos_locked_until", String(lu));
          setError("Too many failed attempts. Terminal locked for 10 minutes.");
        } else {
          setError(`Invalid access code. ${MAX_ATTEMPTS - na} attempt${MAX_ATTEMPTS - na !== 1 ? "s" : ""} remaining.`);
        }
        setCode("");
      }
    } catch {
      setError("Connection error. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === "Enter") handleSubmit(); };

  const mins = String(Math.floor(countdown / 60)).padStart(2, "0");
  const secs = String(countdown % 60).padStart(2, "0");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#060910",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FM, zIndex: 9999, overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@700;800&family=JetBrains+Mono:wght@400;600;700;800&display=swap');
        @keyframes ag-spinF  { from{transform:rotate(0deg);}   to{transform:rotate(360deg);} }
        @keyframes ag-spinR  { from{transform:rotate(360deg);} to{transform:rotate(0deg);}  }
        @keyframes ag-pulse  { 0%,100%{opacity:0.55;} 50%{opacity:1;} }
        @keyframes ag-shake  { 0%,100%{transform:translateX(0);} 20%,60%{transform:translateX(-9px);} 40%,80%{transform:translateX(9px);} }
        @keyframes ag-blink  { 0%,100%{opacity:1;} 50%{opacity:0;} }
        @keyframes ag-scan   { 0%,100%{opacity:0.2;} 50%{opacity:0.7;} }
        @keyframes ag-lock   { 0%,100%{box-shadow:0 0 20px rgba(255,77,109,0.25),0 0 40px rgba(255,77,109,0.10);} 50%{box-shadow:0 0 30px rgba(255,77,109,0.45),0 0 60px rgba(255,77,109,0.20);} }
        @keyframes ag-appear { from{opacity:0;transform:translateY(12px);} to{opacity:1;transform:translateY(0);} }
      `}</style>

      {/* Background grid */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(0,212,170,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,170,0.03) 1px,transparent 1px)",
        backgroundSize: "44px 44px",
      }}/>

      {/* Corner brackets */}
      {[[0,0],[0,1],[1,0],[1,1]].map(([r,c],i)=>(
        <div key={i} style={{
          position:"absolute",
          top:r===0?16:"auto", bottom:r===1?16:"auto",
          left:c===0?16:"auto", right:c===1?16:"auto",
          width:28, height:28, opacity:0.3,
        }}>
          <div style={{position:"absolute",width:18,height:2,background:"#00d4aa",top:r===0?0:"auto",bottom:r===1?0:"auto",left:c===0?0:"auto",right:c===1?0:"auto"}}/>
          <div style={{position:"absolute",height:18,width:2,background:"#00d4aa",top:r===0?0:"auto",bottom:r===1?0:"auto",left:c===0?0:"auto",right:c===1?0:"auto"}}/>
        </div>
      ))}

      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:24, width:"100%", maxWidth:420, padding:"0 24px", animation:"ag-appear 0.5s ease" }}>

        {/* Orb */}
        <div style={{ position:"relative", width:110, height:110, display:"flex", alignItems:"center", justifyContent:"center" }}>
          {[118,106,94].map((s,i)=>(
            <div key={s} style={{
              position:"absolute", width:s, height:s, borderRadius:"50%",
              border:`1px solid #00d4aa${["07","11","1c"][i]}`,
              animation:`ag-pulse ${2.2+i*0.55}s ease-in-out infinite`,
              animationDelay:`${i*0.2}s`,
            }}/>
          ))}
          <div style={{
            position:"absolute", width:90, height:90, borderRadius:"50%",
            border:"1px solid #00d4aa1e", animation:"ag-spinF 18s linear infinite",
          }}>
            {[...Array(8)].map((_,i)=>(
              <div key={i} style={{
                position:"absolute", width:"100%", height:1, top:"50%",
                background:"linear-gradient(90deg,transparent,#00d4aa14,#00d4aa24,#00d4aa14,transparent)",
                transform:`rotate(${i*22.5}deg)`, transformOrigin:"center",
              }}/>
            ))}
          </div>
          <div style={{
            position:"absolute", width:72, height:72, borderRadius:"50%",
            border:"1px solid rgba(255,77,109,0.14)",
            animation:"ag-spinR 30s linear infinite",
          }}/>
          <div style={{
            position:"absolute", width:50, height:50, borderRadius:"50%",
            background:"radial-gradient(circle at 36% 32%,#00d4aa55,#00d4aa1a 55%,transparent 78%)",
            animation:"ag-pulse 2.8s ease-in-out infinite",
          }}/>
          <div style={{
            width:26, height:26, borderRadius:"50%",
            background:"radial-gradient(circle at 34% 30%,#ffffff,#00d4aaee 42%,#00d4aa88 68%,transparent)",
            boxShadow:"0 0 16px #00d4aa70,0 0 32px #00d4aa35",
          }}/>
        </div>

        {/* Title */}
        <div style={{ textAlign:"center" }}>
          <div style={{ fontFamily:FD, fontSize:34, fontWeight:800, color:"#c8d8e8", letterSpacing:2, marginBottom:5 }}>
            KRONOS
          </div>
          <div style={{ fontFamily:FM, fontSize:8, color:"#2a3a4a", letterSpacing:4, fontWeight:700 }}>
            TRADING INTELLIGENCE TERMINAL
          </div>
          <div style={{ width:60, height:1, background:"linear-gradient(90deg,transparent,#00d4aa40,transparent)", margin:"10px auto 0" }}/>
        </div>

        {/* Card */}
        <div style={{
          width:"100%", padding:"26px 26px 22px",
          background:"rgba(10,18,30,0.97)",
          border:`1px solid ${isLocked?"rgba(255,77,109,0.28)":"#16253a"}`,
          borderRadius:14,
          boxShadow: isLocked ? "0 0 50px rgba(255,77,109,0.08)" : "none",
          animation: shake ? "ag-shake 0.42s ease" : (isLocked ? "ag-lock 2.5s ease-in-out infinite" : "none"),
          transition:"border-color 0.3s",
        }}>
          <div style={{ fontFamily:FM, fontSize:8, letterSpacing:3, marginBottom:18, textAlign:"center",
            color: isLocked ? "#ff4d6d80" : "#2a3a4a", fontWeight:700 }}>
            {isLocked ? "TERMINAL LOCKED — UNAUTHORIZED ACCESS DETECTED" : "ENTER ACCESS CODE"}
          </div>

          {isLocked ? (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontFamily:FM, fontSize:44, fontWeight:800, color:"#ff4d6d",
                letterSpacing:4, marginBottom:6, fontVariantNumeric:"tabular-nums" }}>
                {mins}:{secs}
              </div>
              <div style={{ fontFamily:FM, fontSize:8, color:"rgba(255,77,109,0.5)", letterSpacing:3 }}>
                MINUTES REMAINING UNTIL UNLOCK
              </div>
            </div>
          ) : (
            <>
              {/* Input */}
              <div style={{
                display:"flex", alignItems:"center", gap:10,
                background:"#060910",
                border:`1px solid ${error?"rgba(255,77,109,0.4)":focused?"rgba(0,212,170,0.3)":"#16253a"}`,
                borderRadius:9, padding:"12px 14px", marginBottom:10,
                transition:"border-color 0.15s",
              }}>
                <span style={{ color:"#00d4aa", fontSize:13, animation:"ag-blink 1.2s infinite", flexShrink:0 }}>▸</span>
                <input
                  value={code}
                  onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,""))}
                  onKeyDown={handleKey}
                  onFocus={()=>setFocused(true)}
                  onBlur={()=>setFocused(false)}
                  placeholder="KRN-XXXXXX"
                  maxLength={10}
                  autoFocus
                  style={{
                    flex:1, background:"transparent", border:"none",
                    color:"#c8d8e8", fontFamily:FM, fontSize:16,
                    fontWeight:700, letterSpacing:4, width:"100%",
                  }}
                />
              </div>

              {/* Error */}
              {error && (
                <div style={{ fontFamily:FM, fontSize:9, color:"#ff4d6d", letterSpacing:1,
                  marginBottom:10, textAlign:"center", lineHeight:1.5 }}>
                  ⚠ {error}
                </div>
              )}

              {/* Attempts remaining dots */}
              {attempts > 0 && !error && (
                <div style={{ display:"flex", gap:5, justifyContent:"center", marginBottom:10 }}>
                  {[...Array(MAX_ATTEMPTS)].map((_,i)=>(
                    <div key={i} style={{
                      width:6, height:6, borderRadius:"50%",
                      background: i < (MAX_ATTEMPTS - attempts) ? "#00d4aa" : "#ff4d6d30",
                      transition:"background 0.3s",
                    }}/>
                  ))}
                </div>
              )}

              {/* Submit */}
              <button onClick={handleSubmit} disabled={!code.trim()||loading} style={{
                width:"100%", padding:"13px 0",
                background: code.trim()&&!loading
                  ? "linear-gradient(135deg,rgba(0,212,170,0.16),rgba(0,212,170,0.07))"
                  : "transparent",
                border:`1px solid ${code.trim()&&!loading?"rgba(0,212,170,0.38)":"#16253a"}`,
                borderRadius:8,
                color: code.trim()&&!loading ? "#00d4aa" : "#2a3a4a",
                fontFamily:FM, fontSize:11, fontWeight:700, letterSpacing:3,
                cursor: code.trim()&&!loading ? "pointer" : "default",
                transition:"all 0.15s",
              }}>
                {loading ? "VERIFYING..." : "AUTHORIZE ACCESS"}
              </button>
            </>
          )}
        </div>

        <div style={{ fontFamily:FM, fontSize:7, color:"#141e2a", letterSpacing:3, textAlign:"center" }}>
          UNAUTHORIZED ACCESS IS MONITORED AND PROHIBITED
        </div>
      </div>
    </div>
  );
}