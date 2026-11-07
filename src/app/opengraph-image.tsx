import { ImageResponse } from "next/og";

import { getLogoDataUri } from "@/components/brand/logo-svg";
import { BRAND } from "@/config/site";

/** Default social image for every page without its own CMS image: the brand on navy with route arcs. */
export const alt = `${BRAND.name} — ${BRAND.category}`;
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
          position: "relative",
          background: "linear-gradient(135deg, #091327 0%, #101C35 60%, #0d2a3a 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: "absolute", top: 0, left: 0 }}>
          <circle cx="930" cy="330" r="250" fill="none" stroke="#ffffff" strokeOpacity="0.12" />
          <ellipse cx="930" cy="330" rx="120" ry="250" fill="none" stroke="#ffffff" strokeOpacity="0.1" />
          <ellipse cx="930" cy="330" rx="250" ry="60" fill="none" stroke="#ffffff" strokeOpacity="0.1" />
          <path d="M960 360 Q 860 180 760 250" fill="none" stroke="#4fd1cb" strokeWidth="3" />
          <path d="M960 360 Q 1000 170 1080 210" fill="none" stroke="#d5a64a" strokeWidth="3" />
          <path d="M960 360 Q 880 420 790 430" fill="none" stroke="#4fd1cb" strokeWidth="2" strokeDasharray="6 8" />
          <circle cx="960" cy="360" r="9" fill="#d5a64a" />
          <circle cx="760" cy="250" r="6" fill="#4fd1cb" />
          <circle cx="1080" cy="210" r="6" fill="#4fd1cb" />
          <circle cx="790" cy="430" r="6" fill="#4fd1cb" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={getLogoDataUri({ variant: "onDark", layout: "mark", height: 88 })} width={88} height={88} alt="" />
            <div style={{ display: "flex", fontSize: 44, fontWeight: 800 }}>
              <span>Venkat Sai</span>
              <span style={{ color: "#4fd1cb", marginLeft: 12, fontWeight: 600 }}>Global</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 720 }}>
            <div style={{ fontSize: 26, letterSpacing: 4, textTransform: "uppercase", color: "#e6c27a" }}>{BRAND.category}</div>
            <div style={{ fontSize: 58, fontWeight: 800, lineHeight: 1.1, marginTop: 18 }}>{BRAND.statement}</div>
            <div style={{ fontSize: 28, color: "rgba(255,255,255,0.75)", marginTop: 22 }}>{BRAND.tagline}</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
