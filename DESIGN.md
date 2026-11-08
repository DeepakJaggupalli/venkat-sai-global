# DESIGN.md — Venkat Sai Global

The visual design system for the public website and the portals. Read this before building or
restyling any UI. Companion documents: `docs/WEB_INTERFACE_GUIDELINES.md` (interaction, forms,
accessibility and performance rules) and `docs/design-references/*.DESIGN.md` (reference systems
that share our spirit: Vercel, Stripe, Linear, Wise, Airbnb).

## 1. Visual Theme & Atmosphere

Calm, confident, white. A designer-made company site, not a template: generous whitespace, one
idea per section, very large black headlines, short grey copy, real photographs of real trades
(welders, pipe fitters, electricians, scaffolders, riggers, Gulf sites, airports, training bays).
One accent colour, used sparingly. Motion is quiet and purposeful. The feeling is "a serious,
modern recruitment and training company from Visakhapatnam that sends skilled people abroad".

Never: dark navy bands, yellow/red poster colours, hazard stripes, rotating globes, glowing
pulses, drawn clip-art illustrations, gradients everywhere, emoji flags (Windows cannot render
them), stock photos captioned as our own staff or premises, invented statistics or testimonials.

## 2. Color Palette & Roles

| Role | Token (CSS variable) | Value | Use |
|---|---|---|---|
| Background | `--background` | `#FFFFFF` | Every page |
| Surface subtle | `--surface-subtle` | `#F7F8FA` | Alternating bands, chip rails |
| Foreground | `--foreground` | `#0A0A0B` | Headlines, body, primary buttons |
| Muted text | `--muted-foreground` | `#5B6170` | Subcopy, captions |
| Border | `--border` | `#E9EBEF` | Cards, chips, inputs, dividers |
| Accent (fill) | `--accent-fill` | `#0EA5E9` | Dots, check icons, small highlights, focus glow |
| Accent partner | — | `#06B6D4` | Only in tiny gradient touches with the accent |
| Accent text | `--accent-text` | `#0369A1` | Links and accent words on white (AA 5.9:1) |
| Accent soft | — | `#E0F2FE` | Selected chip, badge background |
| Success / Danger | existing tokens | — | Status UI only, never decoration |

Older token names (`navy`, `teal`, `gold`, `primary`, `royal` …) are kept for the portals and
are mapped onto this palette in `src/app/globals.css`. White text only on the near-black or on
`#0369A1`; never on `#0EA5E9`.

## 3. Typography Rules

- Display/headlines: a heavy geometric sans (`font-display`, loaded with `next/font/google`),
  weight 800, tracking `-0.03em`, line-height 1.02–1.1. Hero 72–96px desktop / 44–52px mobile;
  section H2 44–56px / 32–36px; card titles 20–24px.
- Body: Inter 400/500, 16–18px, line-height 1.6, muted colour for long copy, max ~65ch.
- Labels: 12–13px, uppercase, letter-spacing 0.08em, accent dot `●` before the text.
- Numbers in tables and prices: tabular figures. One h1 per page.

## 4. Component Stylings

- Primary button: black (`#0A0A0B`) rounded-full pill, white text, 14–16px semibold, right arrow
  that nudges 2px on hover. Secondary: white pill, 1px border, black text.
- WhatsApp actions: same pill shapes; WhatsApp icon in the accent or WhatsApp green on a white
  pill. The floating WhatsApp button is a small static round button (no wave, no pulse).
- Cards: white, 1px `#E9EBEF` border, radius 20–28px, shadow `0 1px 2px rgba(10,10,11,.04),
  0 8px 24px rgba(10,10,11,.06)`; hover lifts 2px. Photo cards: image on top with 16:10 crop and
  rounded top corners, text below — never text over busy photos.
- Chips (countries, trades): white rounded-full pill, 1px border, real SVG flag (from
  `public/flags/<iso2>.svg`) or small icon + label, 40–44px tall. Rails of chips scroll slowly in
  opposite directions with faded edges and pause on hover/focus.
- Section label + H2 + one paragraph, centred for intro sections, left-aligned for content.
- Forms: one column, labels above inputs, 44px controls, errors under the field in plain words.

## 5. Layout Principles

- Container ~1200px with 24px gutters (16px on phones). Sections 96–128px vertical rhythm
  desktop, 64–80px mobile. One section = one idea per screen.
- Hero: left column copy (label, headline, subline, two pills, row of three checks), right column
  one clean product-style card (e.g. the latest requirement poster: flag, trade, salary, Apply).
- Grids: 3 columns for services, 4 for trades, 2 for split content. Equal card heights.

## 6. Depth & Elevation

Mostly flat. Elevation only on cards (soft shadow above), sticky header (hairline border on
scroll) and dialogs. No heavy drop shadows, no glassmorphism, no neon glows.

## 7. Do's and Don'ts

Do: white space, one accent, real photos with credits (`/legal/image-credits`), short human copy
("Send your CV", "Explore jobs"), WhatsApp first then call then email, honest empty states.
Don't: more than one accent colour, decorative gradients behind text, auto-playing carousels,
parallax, bouncing or spinning elements, marketing numbers that are not approved metrics,
"Explore opportunities", fees charged to candidates for placement.

## 8. Responsive Behavior

Design phone-first at 390px: hero stacks (copy then card), pills full-width, chip rails keep
scrolling, grids collapse 3→1 / 4→2, tables become cards. No horizontal page scroll. Touch
targets ≥44px. Test at 390, 768 and 1440px.

## 9. Agent Prompt Guide

- Motion: `motion` (Framer Motion) and the Motion Primitives in `src/components/motion-primitives`
  (InfiniteSlider + ProgressiveBlur for chip rails, InView/AnimatedGroup for gentle fade-up,
  TextEffect for at most one hero line, SlidingNumber for approved metrics). GSAP (`gsap`,
  `@gsap/react`) only for a deliberate scroll moment, never for basic reveals. Every animation
  respects `prefers-reduced-motion` and animates only opacity/transform.
- Images: Openverse (CC0/PDM preferred, CC BY with credit), optimised with `sharp` into
  `public/images/stock/`, rendered with `next/image`. CMS media from the business always wins.
- Before shipping UI: screenshot at 390/768/1440, compare against this file and
  `docs/WEB_INTERFACE_GUIDELINES.md`, fix, repeat.
