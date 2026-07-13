# CricAdda — Project Overview

## Vision

Box cricket and turf cricket are exploding across India and beyond. Thousands of matches
happen every day on rented turfs — but the experience is still stuck in the notebook era:
someone keeps score on paper or a basic app, arguments break out over the score, players
have no record of their performances, and the turf itself offers nothing beyond the ground
and floodlights.

**CricAdda turns every turf match into a broadcast-quality experience.** A giant screen
shows the live score and player names like a real stadium. Sixes trigger animations.
Boundaries are detected automatically by sensors and cameras. Every player builds a career
profile — runs, wickets, strike rates — across every match they ever play on a CricAdda
turf.

For players, it's the closest thing to playing on TV.
For turf owners, it's a differentiator that fills slots, drives repeat bookings, and opens
new revenue (sponsorships, tournaments, premium slots).

## The Concept

### 1. The Turf Screen

A large outdoor-grade LED screen installed at the turf:

- **Primary position:** behind the bowler's end (opposite the batsman) so the batsman and
  most spectators see it naturally — like a stadium scoreboard.
- **Optional second screen:** behind the batsman (sight-screen side) for the bowling team
  and spectators at that end.
- Displays: live score, current batsmen (with strike indicator), bowler, current over
  ball-by-ball, target/required rate, last-ball result, animations, replays, and sponsor
  content between overs.

The screen is driven by a small compute unit (Android box / mini PC / Raspberry Pi class
device) running the CricAdda display app, connected to the internet (and resilient to
internet drops via local-network mode).

### 2. Phone-First Everything

- **Login:** phone number + OTP. No passwords, no friction — the same way every Indian
  app from WhatsApp onwards onboards users.
- **Teams:** create a team once, add players by phone number (they get invited), save it
  forever. Reuse the same team every weekend.
- **Profiles:** every player has a profile with photo, batting/bowling style, and stats
  that accumulate across all matches.

### 3. Pairing — "Enter the Code"

When a match slot starts, the turf screen shows a short pairing code (e.g. `TURF-4821`)
and a QR code. Anyone in the booking party opens the app, enters the code (or scans), and
their phone becomes the **match controller**:

- Set up the match: teams, overs, players, toss.
- Choose the screen theme, team colors, and what the big screen shows.
- Score the match ball-by-ball with big, fast buttons (0/1/2/3/4/6/W/wd/nb/bye).
- Hand off scoring to another phone anytime (umpire, next batting team, dedicated scorer).

Everything the phone does reflects on the big screen in under a second.

### 4. Manual + Automatic Scoring (Hybrid)

This is the revolutionary part. Scoring works in three modes:

| Mode | How it works | Best for |
|---|---|---|
| **Manual** | Scorer taps every ball on the phone | Day 1, any turf, zero hardware beyond the screen |
| **Assisted (hybrid)** | Sensors/cameras detect boundaries & runs and *suggest* the entry; scorer confirms with one tap | Most matches — fast and accurate |
| **Auto** | System scores 4s, 6s and completed runs automatically; scorer only enters wickets/extras and corrects mistakes | Premium turfs with full sensor kit |

Automation hardware:

- **Boundary sensors:** vibration/impact sensors on boundary walls & nets, IR/laser
  triplines along the boundary line — instant, reliable 4 detection.
- **Overhead & side cameras:** AI vision (ball tracking) to detect 6s (ball clearing the
  net/roof line), differentiate 4 vs 6, and count completed runs by tracking batsmen
  crossing the crease.
- **Manual override always wins.** Any auto event can be corrected in two taps, and the
  correction propagates to the screen and stats instantly.

### 5. Beyond Scoring — The Experience Layer

- **Celebrations:** a six triggers a full-screen animation + stadium sound; fifties and
  hat-tricks get milestone graphics with the player's name and photo.
- **Replays:** cameras keep a rolling buffer; the controller phone can push the last
  10 seconds to the big screen — instant replay for that huge six or tight run-out.
- **Highlights:** after the match, auto-generated highlight clips (every 4, 6, and wicket)
  are shared to all players via the app/WhatsApp.
- **Stats & leaderboards:** turf-level and city-level leaderboards; most runs this month,
  best strike rate, most wickets.
- **Tournaments:** create a tournament, auto-generate fixtures and points tables, and run
  the whole thing on the big screen.

## Who It's For

| Audience | What they get |
|---|---|
| **Players** | Stadium experience, personal stats, highlights, bragging rights |
| **Turf owners** | Differentiation, higher occupancy, repeat customers, sponsor/ad revenue, tournament hosting |
| **Sponsors/local brands** | Screen ad slots in front of a captive, engaged audience |
| **Tournament organizers** | Turnkey digital tournament management with broadcast-style presentation |

## Why Now

- Box cricket / turf culture is at an all-time high; turfs compete on amenities.
- Phone-number-based auth and UPI-style simple UX are universally understood.
- Edge AI (cheap cameras + on-device models) makes auto-detection affordable — what needed
  broadcast infrastructure five years ago now runs on a device costing a few thousand rupees.
- No incumbent owns this space: scoring apps exist (paper replacements) and stadium tech
  exists (unaffordable) — nothing in between. CricAdda is the in-between.

---

*CricAdda — a **made.** product*
