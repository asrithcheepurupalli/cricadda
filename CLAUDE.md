# CLAUDE.md — CricAdda

Guide for working in this repo. CricAdda is a smart cricket turf platform: a big LED
screen at the turf shows live scores, phones are the remotes, sensors/AI cameras
auto-detect boundaries. **Website-first**: the complete product ships as a website; a
Play Store app (TWA wrapper around the same URL) comes later only if needed.
Branding: every surface carries **"a made. product"** — keep it.

## Repo layout

| Path | What it is |
|---|---|
| `website/` | **The deployable product** (Vercel, Root Directory = `website`). Pure static — no build step, no framework, no dependencies. |
| `website/index.html` | Retro-arcade marketing/pitch site (attract mode, player journey, gallery, process) |
| `website/demo.html` | Playable demo: turf screen + phone side by side, client-side engine |
| `website/app/` | **The app**: onboarding (phone+OTP, avatar select), matches, career/XP/badges, leaderboard, bookings, settings, TV mode. PWA (sw.js + manifest). |
| `website/app/tv.html` | Big-screen scoreboard, mirrors live matches via `BroadcastChannel('cricadda_tv')` |
| `prototype/` | Multi-device demo: zero-dependency Node server (`node prototype/server.js`) with real cross-device pairing over LAN — screen.html / controller.html / spectator.html / sensor.html. This is the Turf-Hub architecture in miniature. |
| `docs/` | 00 beginner guide → 07 hardware & sync. 06 is the client proposal. |
| `docs/images/` | Real screenshots (re-capture after visual changes — see below) |

## Commands

```bash
# multi-device prototype (real pairing over LAN)
node prototype/server.js                      # → http://localhost:3000

# the product website (any static server)
cd website && python3 -m http.server 8080     # → / (site), /demo.html, /app/

# syntax check the app
node --check website/app/app.js
```

No package.json, no build, no test framework — testing is done by driving real browsers
(Playwright with executablePath `/opt/pw-browsers/chromium` in CI-like environments).

## Architecture (the important bits)

- **Event-sourced match engine**: every ball is an event; state = replay of the log.
  This makes undo/corrections trivial and scores dispute-proof. The engine exists in
  THREE places (intentionally, all plain JS): `prototype/server.js` (authoritative
  server version), `website/demo.html`, `website/app/app.js`. **If you change scoring
  rules, change all three.** Core functions: `newInnings`, `applyBall`, `computeState`/
  `matchState`, `dispatch`.
- **App state** (`website/app/app.js`) lives in localStorage under `cricadda_*` keys:
  `profile`, `accounts` (phone → profile, enables sign-out/sign-in restore), `teams`,
  `history`, `players` (leaderboard aggregates), `bookings`, `turfs`, `settings`.
  `saveProfile()` writes both `profile` and `accounts` — use it, not raw `DB.save`.
- **Auth**: phone + OTP. OTP is currently simulated (on-screen SMS toast in
  `obSendOtp`) — the real SMS provider (MSG91/Firebase) drops into that one function.
  Phone number is the identity; career follows it.
- **Avatars**: procedurally generated 16×16 pixel characters from a numeric seed
  (`avatarConfig`/`drawAvatar`). Deterministic — the seed IS the avatar.
- **TV mode**: app broadcasts `tvView(state)` over `BroadcastChannel('cricadda_tv')`;
  `tv.html` renders it. Same-device/browser only; cross-device needs the backend.
- **Prototype sync**: hub-and-spoke — server holds rooms keyed by 4-digit codes, SSE
  fan-out to screen/controller/spectator, POST events in. Mirrors the real Turf Hub
  design in `docs/07-hardware-and-sync.md`.

## Design system (retro arcade)

- Palette via CSS vars in `website/style.css` + `website/app/app.css` (keep both in sync):
  black `#000` bg, text `#f2f2f2`, dim `#9aa0a6`, neon green `#39ff14` (FOUR/primary),
  yellow `#ffe600` (SIX/highlight), magenta `#ff2d95` (OUT/danger), cyan `#00e5ff` (info/auto).
- Fonts: **Press Start 2P** (headings, scores, buttons — runs ~2× wide, size down
  accordingly) and **VT323** (body, min ~16px). Bundled in `website/fonts/` (OFL) — never
  use a CDN; artifacts/pages must work offline.
- Pixel aesthetic: `border-radius: 0`, 3px borders, hard `box-shadow` offsets, CRT
  scanlines via `repeating-linear-gradient`, `.blink` for arcade blinking.
- Cricket color semantics are fixed: green=4, gold=6, red/magenta=W. Sensor-scored balls
  get a cyan ring (`.ball-chip.sensor`).
- **Mobile is the primary target**: every page has `@media (max-width: 700px)` rules;
  celebrations go full-viewport on mobile. Test at 390×844 before shipping.

## Release checklist

1. `node --check website/app/app.js`
2. Drive the app in a browser at 390×844: onboard → book → match → result → stats;
   check zero console errors and no horizontal overflow.
3. **Bump the service-worker cache version** in `website/app/sw.js` (`cricadda-vN`) —
   without this, installed users keep the old app.
4. If visuals changed, re-capture screenshots into `docs/images/` and `website/img/`
   (they must match the live theme).
5. Commit to the feature branch, push, then merge to `main` — **Vercel deploys `main`**
   with Root Directory `website`.
6. Canonical domain is `https://cricadda.com` in metas/sitemap — sed-replace if the real
   domain differs.

## Conventions

- Plain JS/HTML/CSS only in `website/` — no frameworks, no build step. Keep it that way
  unless a deliberate migration is decided.
- Escape all user-supplied strings with the local `esc()` before injecting into HTML.
- Sounds are WebAudio-synthesized (no assets) and must respect `settings.sound`.
- Default squad names: Asrith, Tarun, Chandesh, Vamsi (Team A) / Partha, Rohit, Suresh,
  Deepak (Team B) — the founding crew; keep names unique across teams (stats key by name).
- Docs end with `*CricAdda — a **made.** product*`.

## Known gaps (next milestones)

- **Backend**: real OTP SMS, cloud-synced careers, cross-device pairing over the
  internet, real booking availability + UPI payments. Architecture is spec'd in
  `docs/03-system-architecture.md`; Supabase/Firebase fits cleanly behind the existing
  seams (`obSendOtp`, `saveProfile`, `bookSlot`, prototype server API).
- **Play Store**: TWA wrapper around `/app/` when wanted — no rebuild needed.
- **Turf Hub hardware**: `docs/07-hardware-and-sync.md` is the build plan; the prototype
  server is the reference implementation of the hub's sync behavior.
