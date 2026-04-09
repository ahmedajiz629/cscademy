# Ajiz Tech Challenge

Ajiz Tech Challenge is a track-based programming challenge platform built with Next.js and Convex. It includes student challenge pages, admin management for users and problems, offline LAN-gated tasks, and a backend integration layer for external code evaluation.

## Core Capabilities

- Track-based challenge delivery with per-problem scoring.
- Repository-based software engineering challenges evaluated through Docker runners.
- Admin tools for users, tracks, languages, and problem configuration.
- Offline tasks gated by an offline-room live connection.
- Incident tracking and silent anti-cheat reporting for offline sessions.
- Reactive Convex-powered pages for track and problem availability.

## Development

Run these commands from the project folder:

```bash
pnpm install
pnpm dev
```

For a production build:

```bash
pnpm build
```

To run the offline gateway:

```bash
pnpm run offline-gateway
```

## Environment

The project expects these environment variables:

- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `CONVEX_INTERNAL_URL` for server-side access to the private Convex backend
- `JWT_SECRET`
- `OFFLINE_GATEWAY_SECRET` or `JWT_SECRET`
- `OFFLINE_GATEWAY_PORT` (defaults to `8787`)
- `OFFLINE_ANTI_CHEAT_CANARY_IMAGE_URL` for the probe image

For production, set `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL`
to the same-origin Convex proxy path, for example
`https://tech.ajiz.org/convex`, while keeping `CONVEX_INTERNAL_URL` pointed at
the private backend such as `http://127.0.0.1:3210`.

Docker must also be installed on the server for software engineering track evaluations.

External evaluation account credentials are linked per user from the admin interface.

## Architecture Notes

- App Router handles the web UI and internal API routes.
- Convex stores users, track settings, problems, languages, scores, and offline session state.
- In production, Convex is expected to be reverse-proxied on the same origin under a path such as `/convex`; the proxy should strip that prefix before forwarding to the backend.
- The offline gateway is expected to run on the offline-room host and maintains live presence for offline tasks.
- Offline tasks should be opened from the offline room HTTP entrypoint; the gateway uses the same host as the page and only changes the port.
- The algorithmics track currently uses the external judge integration for run and submit actions.
- The software engineering track evaluates repository branches by running configured Docker images against student submissions.

## Seeding and Tooling

Useful commands:

```bash
pnpm exec convex codegen
node ./scripts/seed.mjs
```

The seed script creates sample users, algorithmics problems, and the software engineering challenge for local development.
