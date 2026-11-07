import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Developer tools",
  robots: { index: false, follow: false },
};

/**
 * Development-only area (component showcase for visual QA). Every route under /dev 404s in
 * production; pages also check individually because layouts do not protect everything.
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main id="main-content" className="min-h-dvh bg-surface-subtle">
      {children}
    </main>
  );
}
