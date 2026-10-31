"use client";

import { useState } from "react";
import { useSession } from "@/components/Providers";

export function RespectsButton({ mint, count }: { mint: string; count: number }) {
  const session = useSession();
  const [n, setN] = useState(count);
  const [msg, setMsg] = useState<string | null>(null);
  async function pay() {
    if (!session.wallet && !(await session.signIn())) return setMsg("Connect a wallet first.");
    const r = await fetch("/api/respects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mint }) });
    const j = await r.json();
    if (r.ok) setN(j.respects);
    else setMsg(j.error);
  }
  return (
    <>
      <button className="btn px-2 py-0.5 text-xs" onClick={() => void pay()}>
        Pay respects <span className="num text-muted">{n}</span>
      </button>
      {msg && <p className="mt-1 text-xs text-muted">{msg}</p>}
    </>
  );
}
