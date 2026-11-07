# Analytics components (`src/components/analytics`)

Browser side of first-party analytics. Contract and privacy rules: `src/modules/analytics/README.md`.

| File | Export | Notes |
|---|---|---|
| `analytics-tracker.tsx` | `AnalyticsTracker` (server) | Mounted once in the root layout; computes `AnalyticsClientConfig` (flags, settings, CSP nonce, staff/minor exclusion). |
| `analytics-tracker-client.tsx` | `AnalyticsTrackerClient` | Starts the runtime only with analytics consent; page views on route changes; GA4 / Clarity loaders behind their own consent. |
| `runtime.ts` | `AnalyticsRuntime`, `clearAnalyticsIdentifiers()` | Session (sessionStorage, 30-minute rotation, `vsg_sid` cookie), visitor id (localStorage), track() queue, heatmap clicks (rage / dead), scroll milestones, form start / submit, CTA / outbound / download clicks, batching via sendBeacon. |
| `third-party.ts` | `loadGa4`, `ga4PageView`, `revokeGa4`, `loadClarity`, `applyClarityMasking`, `revokeClarity` | Consent Mode v2 defaults denied; nonce on injected scripts. |

Page authors only need the HTML attributes: `data-analytics-cta`, `data-analytics-location`, `data-analytics-form`,
`data-analytics-id`, `data-analytics-ignore` (see the module README).
