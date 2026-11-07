# Privacy components (`src/components/privacy`)

Cookie consent UI. Full contract (categories, cookie format, receipts, GPC) in `src/modules/analytics/README.md` → "Consent".

| File | Export | Notes |
|---|---|---|
| `consent-banner.tsx` | `ConsentBanner` (server) | Mounted once in the root layout. Reads the consent version, the visitor's cookie, enabled services and locale. |
| `consent-banner-client.tsx` | `ConsentBannerClient` | Non-blocking bottom region (`role="region"`, labelled), Accept all / Reject non-essential (equal weight) / Customise (dialog). Hidden on `/cookie-preferences`. Links to `/legal/cookie-policy` and `/cookie-preferences`. |
| `consent-preferences.tsx` | `ConsentPreferences` (server) | `<ConsentPreferences />` for `/cookie-preferences`; `<ConsentPreferences source="account_privacy" />` for `/account/privacy`. |
| `consent-preferences-form.tsx` | `ConsentPreferencesForm` (client) | Props `{ version?, services?, locale?, source?, onSaved?, className? }`. Never pre-ticked; shows the current choice; live status message. |
| `use-consent.ts` | `useConsent(version?)` | `{ ready, version, stored, categories, needsPrompt, gpc, save, acceptAll, rejectAll, openPreferences }` |
| `consent-store.ts` | `openCookiePreferences()`, `saveConsent()`, `readStoredConsent()`, `hasGpcSignal()`, `subscribeConsent()` | Browser store (cookie + window event), no provider needed. |
| `messages.ts` | `consentMessages(locale)` | English, Hindi, Telugu copy (Hindi / Telugu need native review before launch). |

A footer "Cookie settings" button can call `openCookiePreferences()` (client) or simply link to `/cookie-preferences`.
