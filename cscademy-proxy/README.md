# Ajiz Tech Challenge

Ajiz Tech Challenge is a track-based programming challenge platform built with Next.js and Convex. It includes student challenge pages, admin management for users and problems, offline LAN-gated tasks, and a backend integration layer for external code evaluation.

## Core Capabilities

- Track-based challenge delivery with per-problem scoring.
- Repository-based software engineering challenges evaluated through Docker runners.
- Admin tools for users, tracks, languages, and problem configuration.
- Offline tasks gated by a local WebSocket gateway.
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
- `JWT_SECRET`
- `OFFLINE_GATEWAY_SECRET` or `JWT_SECRET`
- `OFFLINE_GATEWAY_URL` or `OFFLINE_GATEWAY_PORT` (defaults to `ws://127.0.0.1:8787`)
- `OFFLINE_ANTI_CHEAT_CANARY_IMAGE_URL` for the probe image

Docker must also be installed on the server for software engineering track evaluations.

External evaluation account credentials are linked per user from the admin interface.

## Architecture Notes

- App Router handles the web UI and internal API routes.
- Convex stores users, track settings, problems, languages, scores, and offline session state.
- The offline gateway is expected to run locally for offline tasks and maintains their live presence.
- The algorithmics track currently uses the external judge integration for run and submit actions.
- The software engineering track evaluates repository branches by running configured Docker images against student submissions.

## Seeding and Tooling

Useful commands:

```bash
pnpm exec convex codegen
node ./scripts/seed.mjs
```

The seed script creates sample users, algorithmics problems, and the software engineering challenge for local development.
