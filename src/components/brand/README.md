# Brand (`src/components/brand`)

Original Venkat Sai Global logo, drawn in code so it stays crisp at every size and never needs an image request.

## The mark

A path that dips and then rises past a horizon arc to an aqua spark:

- **Path (white)** — *Discover. Learn. Qualify. Work. Grow.*: the journey goes down to its foundation and rises
  beyond where it started. Its shape is also a **V** — for Venkat Sai, and for the single-V weld joint at the
  heart of the company's welding and testing heritage.
- **Horizon arc (teal)** — global reach. It is drawn in segments that stop short of the path, so the arc reads as
  passing *behind* the V on any background (no masks, no knockout strokes, no SVG ids).
- **Spark (aqua)** — the weld spark and the opportunity it opens; the accent's aqua partner.

The wordmark sets "Venkat Sai" in Figtree ExtraBold with "Global" in Figtree SemiBold, in the accent text colour.

## Components

```tsx
import { Logo, LogoMark, LogoWordmark } from "@/components/brand/logo";

<Logo className="h-8 w-auto" />                          // full lockup, light backgrounds (default)
<Logo variant="onDark" className="h-10 w-auto" />        // dark surfaces (glass tile, white type)
<Logo layout="mark" className="size-8" />                // mark only
<LogoMark variant="onDark" className="size-6" />
<LogoWordmark className="h-6 w-auto" />                  // type only
<Link href="/" aria-label="Venkat Sai Global home"><Logo decorative className="h-8 w-auto" /></Link>
```

| Prop | Values | Notes |
|---|---|---|
| `variant` | `"onLight"` (default) · `"onDark"` | onLight: solid near-black tile, near-black type with "Global" in accent blue. onDark: translucent white tile, white/light-blue type. The glyph colours never change. |
| `layout` (`Logo`) | `"full"` (default) · `"mark"` | |
| `title` | string | Accessible name (default "Venkat Sai Global"). |
| `decorative` | boolean | `aria-hidden` — use inside links/headings that already name the brand. |
| …`svg` props | | `className` for sizing (height + `w-auto`), `style`, etc. |

Server-component safe (no hooks, no client JS). Size by height: the full lockup is 268 × 48 units
(≈ 5.6 : 1); the mark is square.

### Outside React

```ts
import { getLogoSvg, getLogoDataUri } from "@/components/brand/logo-svg";

getLogoSvg({ variant: "onLight", layout: "full", height: 48 });   // complete <svg> string
getLogoDataUri({ layout: "mark" });                               // data:image/svg+xml,… (e-mails, ImageResponse)
```

`logo-geometry.ts` holds the shared geometry, wordmark metrics and palette (`BRAND_COLORS`) so the React
components and the string generator can never drift apart.

## Usage rules

- Minimum size: mark 20 px; full lockup 24 px tall. Keep clear space of at least half the mark's width around it.
- Use `onDark` on near-black or photography with a dark overlay; `onLight` on white and light greys.
- Do not recolour, stretch, rotate, outline or add effects; do not rebuild the wordmark in another font.
- Partner and employer logos appear *under* the Venkat Sai Global brand, never locked up with it.

## Tests

`logo-svg.test.ts` — lockup/mark output, palettes, accessible name, geometry invariants.
