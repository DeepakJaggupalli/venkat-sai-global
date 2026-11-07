import { ImageResponse } from "next/og";

import { getLogoDataUri } from "@/components/brand/logo-svg";

/** App icon generated from the brand mark (the mark's own navy tile, so it reads on any tab or home screen). */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={getLogoDataUri({ layout: "mark", height: 512 })} width={512} height={512} alt="" />
    ),
    size,
  );
}
