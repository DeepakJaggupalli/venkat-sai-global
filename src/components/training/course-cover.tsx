import Image from "next/image";

import { StockImage } from "@/components/public/stock-image";
import { stockPhotoForCourse } from "@/content/stock-photos";
import { cn } from "@/lib/utils";

type CoverCourse = { slug: string; title: string; category: string; cover: { url: string } | null };

/**
 * A course's picture: the cover uploaded for it always wins; without one, a fitting credited stock photograph
 * of the trade (src/content/stock-photos.ts). Fills its positioned parent, which sets the aspect ratio.
 */
export function CourseCover({ course, sizes, priority = false, className }: { course: CoverCourse; sizes: string; priority?: boolean; className?: string }) {
  if (course.cover) {
    return <Image src={course.cover.url} alt={course.title} fill unoptimized priority={priority} sizes={sizes} className={cn("object-cover", className)} />;
  }
  return <StockImage photo={stockPhotoForCourse(course)} sizes={sizes} priority={priority} className={className} />;
}
