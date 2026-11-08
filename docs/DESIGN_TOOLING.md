# Design tooling

- `DESIGN.md` (repository root): the design system. Read it first.
- `docs/WEB_INTERFACE_GUIDELINES.md`: Vercel's Web Interface Guidelines (interactions, animation,
  layout, content, forms, performance). Source: https://vercel.com/design/guidelines
- `docs/design-references/*.DESIGN.md`: reference design systems (Vercel, Stripe, Linear, Wise,
  Airbnb) from https://github.com/VoltAgent/awesome-design-md (MIT).
- Animation: `motion` (Framer Motion), `gsap` + `@gsap/react`, and Motion Primitives
  (https://motion-primitives.com, installed with the shadcn CLI into
  `src/components/motion-primitives`: infinite-slider, progressive-blur, in-view, animated-group,
  text-effect, sliding-number). More components: `npx shadcn@latest add "https://motion-primitives.com/c/<name>.json"`.
  Community components from https://21st.dev install the same way: `npx shadcn@latest add "<21st.dev registry URL>"`.
- Browser automation for UI review: `@playwright/cli` (dev dependency; `npx playwright-cli open <url>`),
  plus the Playwright test runner (`npm run test:e2e`, see docs/TESTING.md).
- Local design skills live in an uncommitted tools folder; reinstall commands are kept with the
  project's private operations notes.
