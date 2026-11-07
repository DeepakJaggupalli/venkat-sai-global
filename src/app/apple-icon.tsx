import { ImageResponse } from "next/og";

import { getLogoDataUri } from "@/components/brand/logo-svg";

/** Apple touch icon: the brand mark centred on navy (iOS adds its own rounded mask). */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#101C35" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={getLogoDataUri({ layout: "mark", height: 150 })} width={150} height={150} alt="" />
      </div>
    ),
    size,
  );
}
