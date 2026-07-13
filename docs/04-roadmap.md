# CricAdda — Roadmap & Delivery Phases

Each phase is independently shippable and sellable. A turf can stop at any tier and still
have a complete product.

---

## Phase 1 — MVP: "The Screen Works" (8–10 weeks)

**Goal:** one pilot turf running live-scored matches on the big screen, controlled from phones.

- Phone OTP login, player profiles, create/save teams
- Match setup with flexible box-cricket rules (custom overs, players, wides/no-ball rules)
- Screen pairing via code + QR
- Ball-by-ball manual scoring pad with undo/edit
- Live scoreboard on the turf screen (<300 ms update on local network)
- Controller handoff between phones
- Offline-first local sync (internet drop never stops a match)
- Post-match digital scorecard shared to all players
- Anti-tamper scoring log

**Exit criteria:** 50+ real matches scored at the pilot turf; scorers need no training
beyond a 2-minute demo.

## Phase 2 — Experience & Community (8–12 weeks)

**Goal:** matches feel like broadcasts; players come back for their stats.

- Screen themes, team colors/logos, celebration animations + stadium sounds
- Milestone graphics (fifties, hat-tricks), last-over hype mode, post-match awards (MoM)
- Career stats, turf & city leaderboards
- Tournament mode: fixtures, points tables, playoffs on the big screen
- Spectator live view via QR (web, no app install)
- Idle-mode screen content: leaderboards, upcoming slots, turf branding, sponsor ads
- Booking/slot integration; multi-language UI

**Exit criteria:** repeat-booking rate measurably up at pilot turfs; first sponsor ad sold.

## Phase 3 — Automation: "It Scores Itself" (12–16 weeks)

**Goal:** the hybrid scoring promise — sensors and cameras detect boundaries and runs.

- Boundary sensor kit (vibration + IR) → automatic FOUR detection
- Overhead camera + vision pipeline → SIX detection, 4-vs-6 disambiguation
- Crease cameras → automatic run counting
- Hybrid confirm mode (one-tap accept) and full-auto mode with manual override
- Instant replay to big screen; auto-clipped highlights delivered post-match
- Ball speed display; live streaming with score overlay
- Turf-owner dashboard (occupancy, ads, engagement)

**Exit criteria:** ≥95% precision on boundary auto-detection at the pilot turf; scorer
taps per match reduced by ~70%.

## Phase 4 — Scale & Ecosystem (ongoing)

**Goal:** the network effect — CricAdda as the cricket graph of a city.

- Multi-turf federation: city-wide leaderboards, team Elo rankings, challenge matches
- Fantasy/MVP points, badges, season passes
- Smart stumps, run-out DRS-lite, no-ball detection, pitch maps & wagon wheels
- Auto TTS commentary, walk-in music, smartwatch & voice scoring
- Franchise/licensing model for new turfs; sponsor ad marketplace

---

## Suggested Pilot Plan

| Week | Milestone |
|---|---|
| 0 | Finalize pilot turf, screen size & placement survey, network audit |
| 2 | Screen + hub installed; display app running with dummy data |
| 6 | App beta: login, teams, pairing, manual scoring end-to-end |
| 8–10 | Public pilot launch; every weekend match scored on CricAdda |
| 14 | Phase 2 experience features live; first tournament hosted |
| 20+ | Sensor/camera kit installed; hybrid scoring pilot |

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Outdoor screen visibility/durability | Outdoor-grade LED (≥2500 nits), weatherproof enclosure; ball-impact protection (polycarbonate shield / net) |
| Ball hitting the screen | Mount outside the net behind the sight-screen, or protective mesh; screen placement survey per turf |
| Vision accuracy in floodlights/night | Train on night-match footage; sensors (not cameras) are primary for 4s; hybrid confirm mode as safety net |
| Turf internet unreliability | Offline-first hub architecture (Phase 1, not an afterthought) |
| Scorer adoption friction | Manual mode as fast as any scoring app; pairing in <30 seconds; zero-training UI |
| Hardware cost for small turfs | Tiered kits — screen-only entry tier; sensors/cameras as upgrades |
