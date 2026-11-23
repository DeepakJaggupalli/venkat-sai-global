# push (Web Push phone alerts)

Free browser notifications for new requirement posters. Off unless `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` are set (the UI hides itself).

- `schemas.ts` (client-safe): `pushSubscribeSchema`, `pushUnsubscribeSchema`, `isAllowedPushEndpoint` (known push services only, no SSRF).
- `alerts.ts` (pure): `requirementAlert(poster)`, `posterMatchesFilters(poster, { trades, countryCodes })`.
- `service.ts`: `pushPublicKey()`, `savePushSubscription(input, userId)`, `removePushSubscription(endpoint)`, `sendRequirementAlert(entryId)`.
- `queue.ts`: `queueRequirementAlert(entryId, tx)`, called by `publishVersionInTx` (content) on the first publication of a `requirement_posts` entry. Queued in a savepoint (never blocks publishing) on queue `push`, then run right after the response with `after()`; the task queue retries.
- `tasks.ts`: `push.requirement_published`.

Routes: `GET|POST /api/v1/push/subscribe`, `POST /api/v1/push/unsubscribe`. Service worker: `public/sw.js` (push + notificationclick, no caching). UI: `src/components/public/push/*`.
