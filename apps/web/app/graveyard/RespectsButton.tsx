"use client";

import { useState } from "react";
import { useSession } from "@/components/Providers";

export function RespectsButton({ mint, count }: { mint: string; count: number }) {
  const session = useSession();
  const [n, setN] = useState(count);
  const [msg, setMsg] = useState<string | null>(null);
  async function pay() {
    if (!session.wallet && !(await session.signIn())) return setMsg("connect a wallet to pay respects");
    const r = await fetch("/api/respects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mint }) });
    const j = await r.json();
    if (r.ok) setN(j.respects);
    else setMsg(j.error);
  }
  return (
    <>
      <button className="btn" onClick={() => void pay()}>
        🫡 press F · <span className="num">{n}</span>
      </button>
      {msg && <p className="mt-1 text-xs text-muted">{msg}</p>}
    </>
  );
}
