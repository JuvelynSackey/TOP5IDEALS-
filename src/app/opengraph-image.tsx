import { ImageResponse } from "next/og";

export const alt = "Top5Ideals — Buy. Sell. Swap. Upgrade.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#0B0D10", color: "#FFFFFF" }}>
        <div style={{ fontSize: 30, letterSpacing: 8, color: "#2EE6CF", fontWeight: 700 }}>TOP5IDEALS</div>
        <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1, marginTop: 24 }}>FIND YOUR NEXT PHONE.</div>
        <div style={{ fontSize: 38, color: "#8B949E", marginTop: 28 }}>Buy it. Sell yours. Or swap it for something better.</div>
        <div style={{ fontSize: 26, color: "#8B949E", marginTop: 48 }}>Ghana · Prices in Ghana cedis (GHS)</div>
      </div>
    ),
    size,
  );
}
