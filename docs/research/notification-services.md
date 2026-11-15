# Hosted notification services for Cadence's in-app Notifications

Research for [issue #10](https://github.com/f-zick-hundegger-com/cohort-005-florianck/issues/10), part of the wayfinder map in [issue #9](https://github.com/f-zick-hundegger-com/cohort-005-florianck/issues/9). All sources were read on **2026-11-15**. This is a comparison and a shortlist, not the choice.

## How to read this document

Every fact carries one of three labels:

- **[docs]**: read in the vendor's own documentation source or SDK source on GitHub, or in the vendor's package metadata on the npm registry. These are first-party, but they are the repositories behind the docs sites, not the rendered sites.
- **[search]**: seen only in web search result summaries of third-party pages. Not verified against a vendor page. Treat as a lead.
- **[inferred]**: my own conclusion from the facts above or from Cadence's code.

### What was blocked

The sandbox firewall returned `HTTP 403 Approval required for <host>:443` for every vendor website, so **no live pricing page and no rendered docs site was read**:

| Blocked host | What could not be verified there |
| --- | --- |
| `knock.app`, `docs.knock.app` | Knock free-plan volume, "no card required" |
| `novu.co`, `docs.novu.co` | Novu pricing page, "no card required" |
| `www.magicbell.com` | MagicBell pricing, free-plan limits, how the User JWT is signed, feed retention, styling docs |
| `www.courier.com` | Courier pricing, free-plan limits, inbox docs (auth scopes, theming, retention) |
| `www.suprsend.com` | SuprSend pricing, free-plan limits, branding on the free plan |
| `engagespot.co` | Everything about Engagespot beyond its public repositories |

Reachable and used instead: `github.com` / `raw.githubusercontent.com` (docs and SDK repositories) and `registry.npmjs.org`.

Consequence: **"no credit card required" is unverified for every vendor**, and the free-tier volume is verified first-party only for Novu (from its source code).

## Cadence's side: how the current user is known

Read in this repository:

- `app/lib/session.ts`: a cookie session (`cadence_session`, `httpOnly`, signed with a dev secret) holds a numeric `userId`. `getCurrentUserId(request)` returns `number | null`. The id is only readable on the server.
- `app/routes/api.switch-user.ts`: the DevUI posts a `userId`; the action writes it to the session and **redirects**, so loaders re-run and the page re-renders as the new user.
- `app/components/dev-ui.tsx`: lists the seeded users and posts to `/api/switch-user`. The session may also hold **no user** ("No user selected").

What follows for every vendor **[inferred]**:

1. The recipient id each vendor needs is the Cadence user id as a string (`String(userId)`). It is available in the root loader on every request.
2. Anything that must be signed (JWT or HMAC) can be produced in that loader from the session's `userId` and passed to the client as loader data. No real login is needed; the vendors only see an id and a signature, not how Cadence decided who the user is.
3. A user switch re-runs the loader, so the client provider receives a new user id (and a new token). The provider must reconnect as the new user. Keying the provider on the user id (`key={userId}`) forces a clean remount and is the safe pattern for all vendors.
4. The "no user selected" state must render no provider at all.
5. Every seeded user must exist as a recipient at the vendor before or at the moment of the first send. Knock and Novu can create the recipient inline in the send call; the others need checking.

## Comparison

| Criterion | Knock | Novu | MagicBell | Courier | SuprSend |
| --- | --- | --- | --- | --- | --- |
| Free tier | Free plan exists [docs]. 10,000 messages/month [search]. Card: unverified | Free plan, 10,000 events/month, 20 workflows, 2 environments [docs]. Card: unverified | Free "Builder" plan, 1,000 deliveries/month [search]. Card: unverified | Free "Developer" plan, 10,000 sends/month [search]. Card: unverified | Free plan, 10,000 notifications/month, no card [search] |
| Branding on free tier | Not found | "Inbox by Novu" on the prebuilt Inbox; removable only on paid plans [docs] | Unverified | Unverified | Feed carries SuprSend branding on free [search] |
| Persistent feed, unread count, read state | Yes: `unread_count`, `unseen_count`, read/seen/archived [docs] | Yes: read/seen/archived/snoozed, `useCounts` [docs] | Yes: read/seen/archived, unread count endpoint [docs] | Inbox exists [docs]; details unverified | Inbox exists [docs]; details unverified |
| Live arrival | Websocket, managed by the SDK [docs] | Websocket (`wss://…socket.novu.co`) [docs] | Websocket (`wss://ws.magicbell.com`) [docs] | Websocket [docs] | Socket [docs] |
| React 19 | Peer range includes `^19` [docs] | Peer range includes `^19` [docs] | `@magicbell/react` declares no peer range; older packages `>= 18.3.1` [docs] | `>=18.0.0` [docs] | `>= 16.8.0` [docs] |
| Prebuilt UI and headless | Both: components plus `useNotifications` hooks [docs] | Both: `<Inbox />` plus `useNotifications`/`useCounts` [docs] | Prebuilt components; custom item component; headless package last published 2026-03 [docs] | Prebuilt; headless unverified | Both [docs] |
| Restyling | CSS variables (`--rnf-*`), replace the CSS, `renderItem` [docs] | `appearance` prop: variables, per-element style objects or CSS classes [docs] | Unverified beyond `ItemComponent` | Unverified | Theme object of CSS properties [docs] |
| What the server signs | Nothing by default. Optional RS256 JWT with `sub` = user id, signed locally [docs] | Nothing by default. Optional HMAC-SHA256 of the subscriber id, computed locally [docs] | A User JWT, always required [docs]; signing recipe unverified | A JWT, always required, minted by a network call to Courier (`POST /auth/issue-token`) [docs] | Nothing by default. Optional ES256 JWT, signed locally [docs] |
| Sending | `POST` workflow trigger by key; up to 1,000 recipients; inline recipient creation; `Idempotency-Key` [docs] | `POST /v1/events/trigger`; up to 100 recipients; bulk up to 100 events; `transactionId` dedupes [docs] | `createBroadcast` with a recipients list [docs] | Send API [docs]; details unverified | Workflow trigger [docs]; details unverified |
| Works from localhost | Yes [inferred] | Yes [inferred] | Yes [inferred] | Yes; the vendor's own quickstart runs on `localhost:5173` [docs] | Yes [inferred] |
| Vendor stores the feed | Yes, in-app feed items kept indefinitely [docs] | Yes, but **30 days** on Free [docs] | Yes [docs]; retention unverified | Yes [inferred]; retention unverified | Yes [inferred]; retention unverified |
| Server can read it back | Yes, feed endpoint per user [docs] | Yes, subscriber notifications endpoints [docs] | Yes, with a per-user token [docs] | Unverified | Unverified |

## Per vendor

### Knock

Sources: `knocklabs/docs` at commit `4b74447f72` (repository last pushed 2026-11-13), `@knocklabs/react` 0.15.1 on npm (published 2026-11-06).

- **Free.** "Knock offers a Free plan (formerly known as our Developer plan) and two paid plans, Starter and Enterprise." [docs: [knock-plans.mdx](https://github.com/knocklabs/docs/blob/main/content/manage-your-account/knock-plans.mdx)]. The docs defer volumes to the pricing page, which was blocked. Search summaries agree on 10,000 messages/month; the only "no credit card" statement found is on a competitor's site [search]. A message is one notification delivered to one user on one channel; usage accrues in every environment, and messages on a channel in sandbox mode do not count [docs: same file].
- **Feed.** Feed items expose `read_at`; the store metadata exposes `unread_count` and `unseen_count`; the badge can count unread instead of unseen (`badgeCountType="unread"`) [docs: [react/feed.mdx](https://github.com/knocklabs/docs/blob/main/content/in-app-ui/react/feed.mdx), [headless/feed.mdx](https://github.com/knocklabs/docs/blob/main/content/in-app-ui/react/headless/feed.mdx)].
- **Live.** "a managed service that provides a websocket connection to your application"; the SDK handles reconnects [docs: [socket-behavior.mdx](https://github.com/knocklabs/docs/blob/main/content/in-app-ui/feeds/socket-behavior.mdx)].
- **Stack.** Peer dependencies: `react` and `react-dom` `^17 || ^18 || ^19`; `next` and `@tanstack/react-router` are optional peers [docs: [npm](https://registry.npmjs.org/@knocklabs/react/latest)]. No React Router or SSR guidance was found in the docs; the feed is client state over a websocket, so it has to render on the client only [inferred].
- **Styling.** CSS variables prefixed `--rnf-`, full CSS replacement (classes prefixed `rnf-`), `renderItem` for the cell, light/dark `colorMode`; or headless hooks (`useNotifications`, `useNotificationStore`) with fully own markup [docs: [styling.mdx](https://github.com/knocklabs/docs/blob/main/content/in-app-ui/feeds/styling.mdx)]. Headless plus Cadence's shadcn components is the closest match to Cadence's look [inferred].
- **Identity.** "Enhanced security mode is off by default, so you can build and test your in-app integration with only your public key." Then the client needs only the public key and `user={{ id }}`. With it on, the server signs an RS256 JWT with `sub` = user id using a private signing key (`signUserToken` from `@knocklabs/node`, no network call) and passes it as `userToken`. "At any time your application can call the `authenticate` method again with an updated user token and the connection to the Knock real-time service will be restarted." [docs: [security-and-authentication.mdx](https://github.com/knocklabs/docs/blob/main/content/in-app-ui/security-and-authentication.mdx)]. DevUI switching works either way: pass the new id (and a freshly signed token) from the loader [inferred].
- **Sending.** Trigger a workflow by key with `recipients` (user ids, or full recipient objects created inline) and `data`. Returns a `workflow_run_id`; "up to 1000 recipients at a time"; optional `Idempotency-Key` header [docs: [triggering-workflows/api.mdx](https://github.com/knocklabs/docs/blob/main/content/send-notifications/triggering-workflows/api.mdx)]. The response confirms the run was accepted, not that the Notification was delivered [inferred]. A workflow with an in-app step must first exist in the dashboard [inferred].
- **Store.** Message logs are kept 30 days on non-Enterprise plans, but "In-app feed notifications are available indefinitely" through the feed endpoint, which the server can also call [docs: [data-retention.mdx](https://github.com/knocklabs/docs/blob/main/content/manage-your-account/data-retention.mdx)].

### Novu

Sources: `novuhq/docs` at commit `1e4b29abaf` (last pushed 2026-10-13), `novuhq/novu` `feature-tiers-constants.ts` (last changed 2026-11-10), `@novu/react` 3.19.2 on npm (published 2026-09-07).

- **Free.** 10,000 events/month included on Free [docs: [feature-tiers-constants.ts](https://github.com/novuhq/novu/blob/next/packages/shared/src/consts/feature-tiers-constants.ts)]. Free limits: 20 workflows, 2 environments, 3 team members, **inbox feed retention 30 days**, activity feed retention 1 day [docs: [limits.mdx](https://github.com/novuhq/docs/blob/main/content/docs/platform/developer/limits.mdx)]. The source constants are what the product enforces, but they are not the pricing page; card requirement unverified.
- **Branding.** "Users on a paid plan can remove the 'Inbox by Novu' branding from the Inbox UI." [docs: [prepare-for-production.mdx](https://github.com/novuhq/docs/blob/main/content/docs/platform/inbox/prepare-for-production.mdx)]. So the prebuilt Inbox shows vendor branding on Free. Whether a headless build avoids it is not stated; it should, since the branding is part of the prebuilt UI [inferred].
- **Feed and live.** `useNotifications` and `useCounts` "automatically listen for real-time events"; counts update "when new notifications arrive"; websocket event `notifications.notification_received` [docs: [headless-mode.mdx](https://github.com/novuhq/docs/blob/main/content/docs/platform/inbox/headless-mode.mdx)].
- **Stack.** Peers `react` `^18 || ^19` [docs: [npm](https://registry.npmjs.org/@novu/react/latest)]. Quickstarts exist for React (with React Router) and Remix, not for React Router framework mode [docs: `platform/quickstart/`].
- **Styling.** `appearance` prop with `variables` (colours, radius, fonts) and `elements`, where each element takes "either a style object or a set of CSS classes", which suits Tailwind classes [docs: [styling.mdx](https://github.com/novuhq/docs/blob/main/content/docs/platform/inbox/configuration/styling.mdx)].
- **Identity.** The client passes `applicationIdentifier` (public) and `subscriber`. Without more, anyone who guesses a subscriber id can read that feed. Optional HMAC: the server computes `createHmac('sha256', NOVU_SECRET_KEY).update(subscriberId).digest('hex')` and passes it as `subscriberHash`; it is switched on per environment in the dashboard [docs: prepare-for-production.mdx]. No network call, so signing in the loader per request is trivial and switching works [inferred].
- **Sending.** `POST /v1/events/trigger`: "the main (and only) way to send notifications to subscribers… Maximum number of recipients can be 100"; a repeated `transactionId` is ignored; bulk endpoint "limited to 100 events per request" [docs: [trigger-event.mdx](https://github.com/novuhq/docs/blob/main/content/docs/api-reference/events/trigger-event.mdx)].
- **Store.** Server endpoints exist to retrieve a subscriber's notifications and counts and to mark them read [docs: `api-reference/subscribers/`]. Because the feed is kept only 30 days on Free, Novu alone cannot be a long-lived store of record [inferred].

### MagicBell

Sources: `magicbell/magicbell-js` (commit `e4ee9c54`, 2026-08-03), `@magicbell/react` 1.14.0 on npm (published 2026-07-29).

- **Free.** Not verified. Search summaries report a free "Builder" plan with 1,000 deliveries/month and one project [search].
- **Feed.** User client: list notifications, mark read/unread/seen, archive, mark all read, fetch unread count [docs: [NotificationsService.md](https://github.com/magicbell/magicbell-js/blob/main/packages/magicbell-js/docs/user-client/services/NotificationsService.md)].
- **Live.** Websocket to `wss://ws.magicbell.com`, up to 5 reconnect attempts [docs: [realtime.ts](https://github.com/magicbell/magicbell-js/blob/main/packages/magicbell-js/src/realtime.ts)].
- **Stack.** `@magicbell/react` ships `Provider`, `Inbox`, `FloatingInbox`; `Inbox` accepts an `ItemComponent`. It declares no React peer range. The older `@magicbell/magicbell-react` and `@magicbell/react-headless` were last published 2026-03-20 [docs: npm]. Theming of the new package is unverified.
- **Identity.** "You'll need a User JWT to use the SDK. You can generate these on your own server." It is the only prop the provider requires [docs: [npm README](https://www.npmjs.com/package/@magicbell/react)]. There is no unsigned development mode in what I could read. How the JWT is built (algorithm, claims, which secret) is on the blocked docs site. Switching would work by minting a JWT per user in the loader [inferred].
- **Sending.** `createBroadcast` with `recipients` and `title`; the broadcast reports a summary of recipients and failures [docs: [Broadcast.md](https://github.com/magicbell/magicbell-js/blob/main/packages/magicbell-js/docs/project-client/models/Broadcast.md)].
- **Store.** The server can list a user's notifications with that user's token; retention unverified.

### Courier

Sources: [trycourier/courier-react-quickstart README](https://github.com/trycourier/courier-react-quickstart) (commit `a55ba212`, 2026-11-03), `@trycourier/courier-react` 9.3.5 on npm (published 2026-11-09).

- **Free.** Not verified. Search summaries report a free Developer plan with 10,000 sends/month [search].
- **Live.** The quickstart shows a websocket after `signIn({ userId, jwt })`: "The message arrives in the open page without a refresh." It runs on `localhost:5173` [docs].
- **Identity.** The server calls Courier (`POST /auth/issue-token`) to mint a JWT scoped to one user, with inbox scopes and an expiry. "The SDKs do not refresh tokens." "A second `signIn` signs the first user out again." "An expired or mis-scoped JWT signs in silently and returns no messages." [docs]. This is the heaviest identity model of the five: each DevUI switch costs a network call to Courier from the loader, and a wrong token fails silently [inferred].
- **Stack.** Peers `react >= 18`. "Every Courier environment ships with the Courier Inbox provider already configured" [docs]. Theming and headless use are on the blocked docs site.

### SuprSend

Sources: `suprsend/documentation` (commit `31f1cdf4`, 2026-11-09), `@suprsend/react` 1.5.0 on npm (published 2026-10-22).

- **Free.** Not verified. Search summaries report 10,000 notifications/month, no card, and SuprSend branding on the free feed [search].
- **Live.** "The inbox updates without a refresh, because the feed holds an open socket connection." [docs: `docs/add-a-channel.mdx`].
- **Stack.** Drop-in `Inbox` and a headless option; theme object of CSS properties per part [docs: `docs/react-inbox-integration.mdx`, `docs/react-customising-feed.mdx`]. Peer `react >= 16.8.0`.
- **Identity.** Public key only by default. Optional "enhanced security mode" requires an ES256 JWT with `entity_type: "subscriber"` and `entity_id` = the user's distinct id, signed locally with a signing key [docs: [client-authentication.mdx](https://github.com/suprsend/documentation/blob/main/docs/client-authentication.mdx)]. Same shape as Knock; switching works [inferred].

### Engagespot

Public repositories were last pushed in January 2025 and `@engagespot/react-component` 3.0.1 was published 2025-05-09 [docs: GitHub, npm]. The website was blocked. Nothing else could be read. The stale SDK is a reason for caution by itself.

## Shortlist

Kept:

- **Knock.** Best-documented fit: websocket feed, React 19 peer range, headless hooks, no signing needed in development with a local-signing upgrade path, 1,000 recipients per trigger, feed kept indefinitely and readable by the server. Open: free volume and card requirement.
- **Novu.** Only vendor whose free limits are verified first-party (10,000 events/month). Tailwind-friendly `appearance` prop, simple local HMAC, server read-back. Costs: "Inbox by Novu" branding on the prebuilt Inbox, 30-day feed retention on Free, 100 recipients per trigger.

Kept as a reserve:

- **SuprSend.** Same identity model as Knock and a headless option, but free tier, branding, sending and retention are all unverified.

Dropped:

- **MagicBell.** A signed User JWT is always required, the free tier reported is the smallest (1,000/month), and the signing recipe, retention and styling could not be read.
- **Courier.** Token minting needs a network call to Courier on each user switch, tokens are not refreshed by the SDK, and a bad token fails silently; inbox details unverified.
- **Engagespot.** SDK and repositories look unmaintained since early 2025.

## Open items for whoever makes the choice

1. Read the live pricing pages for Knock and Novu (and SuprSend if it stays in play) from a machine that can reach them: free volume, card requirement, branding.
2. Decide whether a 30-day feed (Novu Free) is acceptable; this feeds the map's "where a Notification's record lives" question.
3. None of the docs covers React Router framework mode with SSR. The provider and feed must render client-only; a short prototype should confirm this with the chosen SDK, including remounting on a DevUI user switch.
