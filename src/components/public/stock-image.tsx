import Image from "next/image";

import type { ImageCredit } from "@/content/image-credits";
import { cn } from "@/lib/utils";

/**
 * A credited stock photograph (public/images/stock, optimised by next/image). It fills its positioned parent
 * (`fill` + object-cover), so the parent sets the aspect ratio and the radius. Alt text describes what is
 * visible; it never claims the people or places are Venkat Sai's own.
 */
export function StockImage({
  photo,
  sizes = "(min-width: 1024px) 50vw, 100vw",
  priority = false,
  className,
  decorative = false,
}: {
  photo: ImageCredit;
  sizes?: string;
  priority?: boolean;
  className?: string;
  /** Next to text that already says the same thing (e.g. a card title): empty alt. */
  decorative?: boolean;
}) {
  return (
    <Image
      src={photo.src}
      alt={decorative ? "" : photo.alt}
      fill
      sizes={sizes}
      priority={priority}
      quality={75}
      className={cn("object-cover", className)}
    />
  );
}
