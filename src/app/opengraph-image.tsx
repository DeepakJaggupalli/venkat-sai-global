import { ImageResponse } from "next/og";

import { LOCKUP_WIDTH, MARK_SIZE } from "@/components/brand/logo-geometry";
import { getLogoDataUri } from "@/components/brand/logo-svg";
import { BRAND } from "@/config/site";

/** Default social image for every page without its own CMS image: white, the logo and one large black headline. */
export const alt = `${BRAND.name}: overseas jobs, trade training and manpower supply`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#FFFFFF",
          color: "#0A0A0B",
          fontFamily: "sans-serif",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={getLogoDataUri({ layout: "full", height: 64 })} width={Math.round((LOCKUP_WIDTH * 64) / MARK_SIZE)} height={64} alt="" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, fontWeight: 600, letterSpacing: 3, textTransform: "uppercase", color: "#0369A1" }}>
            <div style={{ width: 12, height: 12, borderRadius: 12, background: "#0EA5E9" }} />
            Overseas jobs · Training · Manpower
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 92, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3, marginTop: 24 }}>
            <span>Skilled trades.</span>
            <span>Global careers.</span>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#5B6170" }}>Visakhapatnam, India · Candidates never pay placement fees</div>
      </div>
    ),
    size,
  );
}
