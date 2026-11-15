# Notifications are delivered through Knock

Cadence's Notification Service is Knock. Its free plan needs no credit card and covers 10,000 messages a month, and it keeps the feed with no time limit. That matches what a Notification is: something that stays in the app until the user has dealt with it. Two other things suit Cadence. Knock can identify a recipient by user id alone, with no signing in development, so switching users in the DevUI panel needs nothing extra. Its headless React hooks also let the feed be drawn in Cadence's own shadcn/Tailwind look.

## Considered Options

- **Novu**: the only free plan we could verify from the vendor's own docs during research. It lost on three counts. Its free plan keeps the feed for only 30 days, which would quietly drop Notifications nobody has dealt with. It caps a send at 100 recipients, where Knock allows 1,000. And it shows its own branding in the prebuilt Inbox.
- **SuprSend**: identifies recipients the same way Knock does, but its sending and retention details could not be verified.
- **MagicBell, Courier, Engagespot**: dropped during research. MagicBell and Courier always need a signed token per user, and Courier fetches it with a network call every time the user switches. Engagespot looks unmaintained.

## Consequences

- Knock's free plan shows Knock branding on its prebuilt components, so Cadence builds its feed on the headless hooks.
- Knock's free plan sets the monthly volume Cadence can send, which matters for any Notification addressed to many users at once.
- Knock is the only record of a Notification and of whether it has been read or dismissed. Cadence keeps no copy in its own database, because the feed is loaded in the browser straight from Knock and nothing in Cadence would read a copy. A Notification's wording is fixed when it is sent. If Knock is unreachable the feed shows that it is unavailable, and if Knock's plan ever limited how long it keeps the feed, Notifications nobody had dealt with would be lost.

Sources: research in `docs/research/notification-services.md` on branch `research/notification-services`. Knock's pricing page was read on 2026-11-15.
