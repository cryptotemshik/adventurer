import { ImageResponse } from "next/og";
import { getDetail } from "@/lib/detail";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "bias market";

export default async function OG({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const d = await getDetail(mint);
  const m = d?.market;
  const pnl = m?.lifetimePnlUsd ?? 0;
  const color = (m?.direction ?? "long") === "short" ? "#FF3B5C" : "#00E58F";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0A0B0D", color: "#E8EAED", padding: 64, fontFamily: "monospace", backgroundImage: "linear-gradient(#22262D 1px, transparent 1px), linear-gradient(90deg, #22262D 1px, transparent 1px)", backgroundSize: "60px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: "#8A9099" }}>
          <span>bias · every coin has a bias.</span>
          <span>{m?.status ?? ""}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 120, fontWeight: 700 }}>${m?.ticker ?? "BIAS"}</div>
          <div style={{ display: "flex", fontSize: 48, color, marginTop: 8 }}>{m?.strategyLabel ?? ""}</div>
        </div>
        <div style={{ display: "flex", gap: 64, fontSize: 34 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#8A9099", fontSize: 22 }}>lifetime pnl</span>
            <span style={{ color: pnl >= 0 ? "#00E58F" : "#FF3B5C" }}>{`${pnl >= 0 ? "+" : "-"}$${Math.abs(pnl).toFixed(2)}`}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#8A9099", fontSize: 22 }}>burned</span>
            <span style={{ color: "#FFD23F" }}>{`${(m?.burnedPct ?? 0).toFixed(3)}% · ${(m?.boughtBackSol ?? 0).toFixed(2)} SOL`}</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
