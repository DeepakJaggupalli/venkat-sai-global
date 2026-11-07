import { BRAND } from "@/config/site";

/** Homepage PLACEHOLDER — replaced by the public site module. */
export default function HomePage() {
  return (
    <section className="container-page py-24">
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-strong">{BRAND.category}</p>
      <h1 className="mt-4 text-4xl font-bold text-navy">{BRAND.name}</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{BRAND.statement}</p>
    </section>
  );
}
