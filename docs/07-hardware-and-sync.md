# CricAdda — Hardware & Sync Guide

*How we physically put the screen in a turf, wire up the automation, and keep everything
in sync. This is the make-it-real document.*

---

## 1. The Big Picture

```
   [Boundary sensors]──┐
   [IR triplines]──────┤ Wi-Fi/wired
   [Cameras ×3]────────┤                     HDMI/LAN        ┌──────────────┐
                       ▼                                     │  LED SCREEN  │
                 ┌───────────┐  video out  ┌──────────────┐  │  (bowler end)│
                 │  TURF HUB │────────────▶│ LED sending  │─▶│              │
                 │ (mini PC) │             │ card/control │  └──────────────┘
                 └─────┬─────┘             └──────────────┘
        local Wi-Fi ▲  │  ▲ speakers (3.5mm/BT)
   ┌───────────┐    │  │
   │ Phones    │────┘  │ internet (4G/5G fallback)
   │ (players) │       ▼
   └───────────┘   ☁ CLOUD (accounts, stats, highlights, spectators)
```

**Golden rule: the match never depends on the internet.** Everything at the turf talks to
the Turf Hub over local Wi-Fi. The cloud syncs when it can.

## 2. The Screen

| Decision | Recommendation | Why |
|---|---|---|
| Type | **Outdoor LED panel wall (P4–P6 pixel pitch)** | Sunlight-readable, modular, survives outdoors. Commercial TVs die in heat/sun and are too dim. |
| Size | **8 × 5 ft** starting size (P5) | Readable from 60–100 ft; scales by adding cabinets |
| Brightness | ≥ 4500 nits outdoor / ≥ 1200 nits shaded | Daylight visibility |
| Rating | IP65 front / IP54 rear minimum | Rain + dust |
| Placement | Behind the bowler's-end net, centered, bottom edge ~6–7 ft above ground | Batsman and spectators see it naturally; above head height |
| Ball protection | **10 mm clear polycarbonate sheet** mounted 4–6 in. in front of the panel on its own steel frame, plus the turf net in front of that | Straight drives at 100+ km/h are guaranteed; polycarbonate is what cricket sight-screens use |
| Power | Dedicated 16 A circuit + MCB + surge protector; screen draws ~300–600 W avg for 8×5 P5 | LED walls spike on bright frames |
| Control | LED **sending card** (NovaStar/Colorlight class) fed by the hub's HDMI out | Industry standard for LED walls |

**Budget alternative for a covered/indoor turf:** a 65–75″ high-brightness commercial
display (≥ 700 nits) in a ball-proof polycarbonate enclosure. Cheaper entry, smaller wow.

## 3. The Turf Hub

The one computer that runs the whole turf.

| Tier | Hardware | Runs |
|---|---|---|
| Screen-only | **Mini PC** (N100-class, fanless) or Raspberry Pi 5 | Screen client + local match server + Wi-Fi sync |
| With AI cameras | **NVIDIA Jetson Orin Nano** (or mini PC + USB Coral TPU) | Everything above + vision pipeline (ball tracking, boundary detection, replay buffer) |

- Boots straight into CricAdda (kiosk mode), auto-recovers on power loss.
- Stores every ball locally (append-only event log); syncs to cloud opportunistically.
- Hosts the pairing service: generates the 4-digit code the screen displays; phones on
  the turf Wi-Fi connect directly to the hub — that's why scoring feels instant (<300 ms)
  and why internet outages change nothing.

## 4. Networking

- **Dedicated dual-band router** at the turf, mounted centrally & weather-protected.
  Turf SSID (e.g. `CricAdda-Turf`) with guest isolation off for hub reachability.
- **4G/5G fallback**: router with SIM slot (or USB dongle on the hub). Used only for
  cloud sync, spectator live view and highlight uploads — never required for the match.
- Cameras and the sending card on **wired Ethernet (PoE switch)**; sensors on Wi-Fi.
- Everything static-IP'd on one VLAN; the hub is the only thing that talks to the internet.

## 5. Automation Hardware

### Boundary sensors (detect FOURs)
- **ESP32 nodes + piezo/accelerometer** clamped to boundary wall panels & net poles —
  a ball strike is an unmistakable vibration signature.
- **IR break-beam pairs** along the boundary rope line for grounded fours.
- Powered by PoE where wiring exists, else 18650 battery packs (~3 months, app warns when low).
- Report over MQTT to the hub in <50 ms; the hub debounces and fuses duplicates.

### Cameras (detect SIXes, runs, replays)
| Camera | Position | Job |
|---|---|---|
| Wide-angle 60 fps IP cam | Center overhead / high side pole | Ball over the net line (SIX), 4-vs-6 call, wagon wheel, replay source |
| Crease cam ×2 | Square of the wicket, both ends | Run counting (crease crossing), run-out replays |
| (Later) front-foot cam | Side-on at bowling crease | No-ball detection |

- All feeds recorded to a rolling 60-second buffer on the hub — instant replay and
  auto-highlight clipping come from this buffer, nothing is uploaded raw.
- Night matches: cameras need the floodlights on; we calibrate exposure per turf at install.

### Smart extras (later phases)
- BLE smart stumps with impact sensing + LED flash.
- Speed measurement derived from the overhead camera's ball track (no radar needed).

## 6. Audio

- Two powered PA speakers (100 W+) mounted high at opposite corners, fed from the hub.
- Plays celebration stingers, milestone announcements, walk-in music, and TTS commentary.
- Hard volume cap + quiet hours configurable per turf (neighbors matter).

## 7. How Sync Actually Works

1. **Pairing:** the hub generates a 4-digit code, shows it on the screen. A phone on the
   turf Wi-Fi enters the code → the hub issues it a *controller token* scoped to that
   match slot. (Exactly what the prototype in this repo does — same architecture.)
2. **Scoring events:** phone → hub over local WebSocket → hub appends to the event log →
   pushes the new state to every subscriber (screen, other phones, spectator page) in
   one hop. Sensors and cameras publish into the same log with a confidence score.
3. **Conflict rule:** manual events always outrank auto events; a correction appends a
   `supersedes` event — nothing is ever deleted, so the log settles every argument.
4. **Cloud sync:** whenever internet is up, the hub streams new events + highlight clips
   to the cloud. Career stats, leaderboards and remote spectators read from the cloud.
   If the internet was down all match, everything syncs the moment it returns.
5. **Screen client:** dumb renderer of hub state. Reboot it mid-match and it comes back
   showing the right score in seconds.

## 8. Bill of Materials (indicative, INR)

| Item | Spec | Qty | Est. cost |
|---|---|---|---|
| LED wall 8×5 ft | P5 outdoor, incl. sending card & PSUs | 1 | ₹2.2–3.5 L |
| Polycarbonate shield + frame | 10 mm, steel frame | 1 | ₹25–40 k |
| Turf Hub | N100 mini PC (screen-only tier) | 1 | ₹15–25 k |
| Turf Hub (AI tier) | Jetson Orin Nano kit | 1 | ₹45–60 k |
| Router + 4G SIM | Dual-band, SIM slot | 1 | ₹8–15 k |
| PoE switch | 8-port | 1 | ₹6–10 k |
| Boundary sensor nodes | ESP32 + piezo, weatherproofed | 6–10 | ₹1.5–2.5 k each |
| IR break-beam pairs | Outdoor rated | 4–6 | ₹1–2 k each |
| Overhead camera | 60 fps, 4 MP, IP67 | 1 | ₹12–20 k |
| Crease cameras | 4 MP IP | 2 | ₹6–10 k each |
| Speakers + amp | 2×100 W PA | 1 set | ₹15–25 k |
| Mounting, cabling, install | poles, conduit, labor | — | ₹30–60 k |

*Screen-only tier lands roughly ₹3–4.5 L installed; full automation adds ₹1–1.5 L.
Real quotes come from the turf survey — sizes, distances and existing infrastructure
move these numbers.*

## 9. Installation Checklist

**Survey (before anything):**
- [ ] Sight lines from batting crease & spectator areas → screen position
- [ ] Net/pole structure can carry screen + shield load (else ground-mounted frame)
- [ ] Power: spare 16 A capacity at the bowler's end; earthing verified
- [ ] Wi-Fi dead-zone map of the turf; router position chosen
- [ ] Sun path — screen shouldn't face the setting sun (washout + glare on batsman)

**Install day(s):**
- [ ] Frame + screen + polycarbonate shield mounted, torque-checked
- [ ] Hub in ventilated, lockable enclosure; UPS for hub + router (screen can drop, brain shouldn't)
- [ ] Sensors placed & calibrated (test hits on every wall panel)
- [ ] Cameras aimed, focused, night-calibrated under floodlights
- [ ] End-to-end test: phone pairing, scoring latency, sensor 4, camera 6, replay, audio
- [ ] Fire a full demo match with the turf staff before sign-off

**Safety non-negotiables:** RCD/earth-leakage breaker on the screen circuit, all
low-mounted cabling in conduit, shield frame grounded, no exposed edges below 8 ft.

## 10. Maintenance

- Hub self-reports health (temps, disk, sensor battery, camera up/down) to our dashboard.
- Monthly: shield clean (dust kills visibility), sensor battery check, camera lens wipe.
- LED walls are modular — a dead cabinet swaps in minutes, we stock spares per city.

---

*CricAdda — a **made.** product*
