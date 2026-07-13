# CricAdda — Client Website (Vercel-ready)

Pure static site: the full retro-arcade pitch page plus a **playable in-browser demo**
(`demo.html`) where the turf screen and the phone run side by side — pairing code,
scoring, sensor auto-detection, celebrations, result with Player of the Match. No
server, no build step, no dependencies.

## Deploy to Vercel

**Option A — Vercel dashboard (easiest):**
1. Push this repo to GitHub (already done) and import it at [vercel.com/new](https://vercel.com/new)
2. Set **Root Directory** to `website`
3. Framework preset: **Other** (it's plain static files) → Deploy
4. Add your domain under Project → Settings → Domains

**Option B — Vercel CLI:**
```bash
cd website
npx vercel          # preview deploy
npx vercel --prod   # production deploy
```

## Files

| File | What it is |
|---|---|
| `index.html` | The full pitch site (story → journey → demo → packages → process) |
| `demo.html` | Playable demo: screen + phone in one page, engine runs client-side |
| `style.css` | Retro design system (pixel borders, CRT scanlines, arcade buttons) |
| `fonts/` | Press Start 2P + VT323 (bundled locally, OFL-licensed — no CDN needed) |
| `img/` | Real screenshots from the working prototype |
| `vercel.json` | Clean URLs + cache headers (optional but nice) |

## Local preview

Any static server works:
```bash
cd website && python3 -m http.server 8080
# → http://localhost:8080
```

Note: the multi-device demo (real phone pairing with a real screen over Wi-Fi) lives in
`../prototype/` and needs its Node server — that's the version you run in person at a
turf. This website is the shareable, hosted version with the single-page demo.
