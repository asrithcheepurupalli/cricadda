# CricAdda — System Architecture

## High-Level Diagram

```
                                ┌─────────────────────────┐
                                │        CLOUD            │
                                │  Auth (phone OTP)       │
                                │  Realtime match sync    │
                                │  Stats & profiles DB    │
                                │  Media store (clips)    │
                                │  Tournament engine      │
                                └───────────▲─────────────┘
                                            │ internet (with offline fallback)
        ┌───────────────────────────────────┼───────────────────────────────────┐
        │                          TURF LOCAL NETWORK (Wi-Fi)                   │
        │                                                                       │
  ┌─────┴─────┐      ┌──────────────┐      ┌──────────────┐      ┌───────────┐  │
  │ Phone app │◄────►│ Turf Hub     │◄────►│ Screen client│      │ Speakers  │  │
  │ (scorer / │ pair │ (edge server │      │ (LED screen  │      │ (audio    │  │
  │  players) │ code │  + AI vision)│      │  behind      │      │  cues)    │  │
  └───────────┘      └──────▲───────┘      │  bowler/bat) │      └───────────┘  │
                            │              └──────────────┘                     │
             ┌──────────────┼──────────────────┐                                │
             │              │                  │                                │
       ┌─────┴────┐   ┌─────┴─────┐    ┌───────┴───────┐                        │
       │ Boundary │   │ Cameras   │    │ Smart stumps  │                        │
       │ sensors  │   │ (overhead │    │ (BLE, later   │                        │
       │ (IR/vib) │   │  + crease)│    │  phase)       │                        │
       └──────────┘   └───────────┘    └───────────────┘                        │
        └───────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Mobile App (players & scorers)

- **Stack:** cross-platform (Flutter or React Native) — one codebase, Android-first
  (dominant among turf players), iOS supported.
- **Auth:** phone number + OTP (Firebase Auth, MSG91, or Twilio Verify).
- **Key screens:** home/teams, match setup, ball-by-ball scoring pad, screen-control
  panel (themes, replays, announcements), stats/profile, tournaments.
- **Pairing:** enters the code shown on the turf screen → app is granted a *controller
  session* for that match slot, scoped to that turf and time window.
- **Latency path:** scoring events publish to the realtime channel; on the same Wi-Fi as
  the turf, events also go peer-to-local (direct to the Turf Hub) so the screen updates in
  <300 ms even if internet is slow.

### 2. Turf Hub (edge device)

The brain installed at the turf. One small device (Android box class for screen-only
turfs; Jetson/NUC class when AI cameras are installed).

- Hosts the **local realtime relay** — phones, screen, sensors all talk through it on
  the turf Wi-Fi; it syncs with the cloud opportunistically. Internet outage never stops
  a match.
- Runs the **vision pipeline** (when cameras installed): ball detection & tracking,
  boundary-line crossing (4 vs 6), crease-crossing run counter, rolling replay buffer,
  highlight clipping.
- Ingests **sensor events** (boundary vibration/IR triggers) over the local network
  (ESP32-class sensor nodes → MQTT/WebSocket).
- **Event fusion:** merges sensor + vision + manual inputs into a single authoritative
  ball-event stream. Confidence-scored auto events go to the scorer's phone as one-tap
  confirmations (hybrid mode) or straight to the scoreboard (auto mode). Manual events
  always take precedence and can overwrite any auto event.

### 3. Screen Client

- Runs on the display's compute unit (Android/Chromium kiosk app).
- Renders the scoreboard, themes, animations, replays, pairing code, and idle-mode
  content. Pure consumer of the event stream — it holds no authority, so a screen reboot
  never loses match state.
- Supports 1–N screens per turf, all synchronized (bowler's end, batsman's end, lobby TV).

### 4. Cloud Backend

- **Auth service:** OTP issuance & verification, session tokens.
- **Realtime sync:** WebSocket fan-out (or managed: Firebase RTDB / Supabase Realtime /
  Ably). Single source of truth once events sync up from the hub.
- **Core data:** users, teams, matches, ball-by-ball events, tournaments, turf registry.
  Ball events are stored append-only with author + mode (manual/auto) — the anti-tamper
  scoring log.
- **Stats engine:** derives career stats, leaderboards, MVP/fantasy points from the ball
  event log (recompute-safe: an edited ball just replays the derivation).
- **Media pipeline:** highlight clips uploaded from the hub, transcoded, and delivered as
  shareable links / WhatsApp messages.
- **Owner dashboard:** web app for turf owners (occupancy, ads, tournaments).

### 5. Automation Hardware Kit

| Hardware | Purpose | Notes |
|---|---|---|
| Boundary vibration/impact sensors | Detect ball hitting boundary wall/net → FOUR | ESP32 + accelerometer nodes, battery/PoE, weatherproof |
| IR/laser triplines | Detect ball crossing the ground boundary line | Backup/companion to vibration sensors |
| Overhead wide-angle camera | Full-ground view: 6 detection (ball over the net line), wagon wheel, replay source | 60 fps min for ball tracking |
| Crease cameras (both ends) | Run counting, run-out replay, no-ball detection | Standard IP cameras |
| Smart stumps (later phase) | Impact detection + LED flash + timestamps | BLE to hub |
| Speakers | Sound effects, auto-commentary, music | Any powered PA via hub audio out |

### 6. Event Model (simplified)

Every ball is an event:

```json
{
  "matchId": "m_8f3k",
  "inning": 1, "over": 4, "ball": 3,
  "batsmanId": "u_991", "bowlerId": "u_412",
  "outcome": { "runs": 6, "boundary": "six", "extras": null, "wicket": null },
  "source": "vision",          // manual | vision | sensor | fused
  "confidence": 0.94,           // for auto sources
  "confirmedBy": "u_105",      // scorer confirmation in hybrid mode
  "supersedes": null,           // set when a correction overwrites an auto event
  "ts": "2026-07-13T18:42:11Z"
}
```

Append-only + `supersedes` gives full auditability: the screen, stats and highlights all
derive from the same stream, and every correction is traceable.

## Key Design Principles

1. **Manual first, automation as enhancement.** The product is fully useful with zero
   sensors — a turf can start with just screen + app and add hardware later. Automation
   raises delight; it is never a dependency.
2. **Offline never stops a match.** The Turf Hub is authoritative locally; cloud is for
   sync, stats and sharing.
3. **The phone is the remote.** No keyboards, no turf-side PC operation, no training —
   if you can use WhatsApp, you can run a match.
4. **One event stream, many surfaces.** Screen, app, spectator web view, highlights and
   stats all render from the same ball-event log.
5. **Modular hardware tiers.** Screen-only kit → + boundary sensors → + cameras →
   + smart stumps. Each tier is a sellable package (see the client proposal).

---

*CricAdda — a **made.** product*
