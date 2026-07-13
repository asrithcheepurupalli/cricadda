#!/usr/bin/env node
/**
 * CricAdda working prototype server.
 *
 * Zero dependencies — plain Node.js. Serves the static pages and provides:
 *   - room creation (the "turf screen" gets a pairing code)
 *   - pairing (phone enters the code)
 *   - scoring events (manual from phone, simulated auto from sensors)
 *   - live state fan-out to every connected device via Server-Sent Events
 *
 * Match state is event-sourced: every ball is an event, state is recomputed
 * by replaying the log (this is what makes undo/corrections trivial — the
 * same principle as the production architecture in docs/03).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------
const rooms = new Map(); // code -> { setup, events, pendingAuto, clients:Set<res>, seq }

function newCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function createRoom() {
  const code = newCode();
  rooms.set(code, { setup: null, events: [], pendingAuto: null, clients: new Set(), seq: 0 });
  return code;
}

// ---------------------------------------------------------------------------
// Match engine — replay the event log into a view model
// ---------------------------------------------------------------------------
function newInnings(batKey, bowlKey, setup, target) {
  return {
    batKey, bowlKey, target,
    runs: 0, wickets: 0, balls: 0, fours: 0, sixes: 0,
    batters: setup[batKey].players.map((name) => ({ name, runs: 0, balls: 0, out: false })),
    bowlers: [], // { name, balls, runs, wickets }
    striker: 0, nonStriker: 1, nextIn: 2,
    thisOver: [], currentBowler: null, usedBowlers: [],
    done: false, endReason: null,
  };
}

function bowlerOf(inn) {
  const name = inn.currentBowler || 'Bowler';
  let b = inn.bowlers.find((x) => x.name === name);
  if (!b) { b = { name, balls: 0, runs: 0, wickets: 0 }; inn.bowlers.push(b); }
  return b;
}

function checkDone(inn, setup) {
  if (inn.wickets >= inn.batters.length - 1) { inn.done = true; inn.endReason = 'all out'; }
  else if (inn.balls >= setup.overs * 6) { inn.done = true; inn.endReason = 'overs completed'; }
  else if (inn.target && inn.runs >= inn.target) { inn.done = true; inn.endReason = 'target chased'; }
}

function applyBall(inn, ev, setup, fx) {
  const striker = inn.batters[inn.striker];
  const bw = bowlerOf(inn);
  let display;
  let rotate = false;

  if (ev.extra === 'wd') {
    inn.runs += 1; bw.runs += 1;
    display = 'Wd';
  } else if (ev.extra === 'nb') {
    inn.runs += 1 + ev.runs; bw.runs += 1 + ev.runs;
    striker.runs += ev.runs;
    display = ev.runs ? `Nb+${ev.runs}` : 'Nb';
    rotate = ev.runs % 2 === 1;
    if (ev.runs === 4) { inn.fours++; fx.kind = 'four'; }
    if (ev.runs === 6) { inn.sixes++; fx.kind = 'six'; }
  } else {
    // legal delivery
    inn.balls += 1; bw.balls += 1; striker.balls += 1;
    if (ev.wicket) {
      inn.wickets += 1; bw.wickets += 1; striker.out = true;
      display = 'W';
      fx.kind = 'wicket';
      fx.batterOut = `${striker.name} ${striker.runs} (${striker.balls})`;
      if (inn.nextIn < inn.batters.length) { inn.striker = inn.nextIn; inn.nextIn += 1; }
    } else {
      const before = striker.runs;
      striker.runs += ev.runs; inn.runs += ev.runs; bw.runs += ev.runs;
      display = String(ev.runs);
      rotate = ev.runs % 2 === 1;
      if (ev.runs === 4) { inn.fours++; fx.kind = 'four'; }
      else if (ev.runs === 6) { inn.sixes++; fx.kind = 'six'; }
      else if (ev.runs > 0) fx.kind = 'run';
      else fx.kind = 'dot';
      if (before < 50 && striker.runs >= 50) fx.milestone = { player: striker.name, mark: 50 };
      if (before < 100 && striker.runs >= 100) fx.milestone = { player: striker.name, mark: 100 };
    }
    fx.batter = striker.name;
  }

  inn.thisOver.push({ d: display, src: ev.source || 'manual' });
  if (rotate) [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];
  checkDone(inn, setup);

  // over completed on a legal ball
  if (!inn.done && inn.balls > 0 && inn.balls % 6 === 0 && ev.extra !== 'wd' && ev.extra !== 'nb') {
    [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];
    if (!inn.usedBowlers.includes(bw.name)) inn.usedBowlers.push(bw.name);
    inn.currentBowler = null; // controller must pick the next bowler
    inn.thisOver = [];
    fx.overEnd = true;
  }
}

function computeState(room) {
  if (!room.setup) return { phase: 'waiting', seq: room.seq };
  const setup = room.setup;
  const firstBat = setup.firstBatting;                 // 'A' | 'B'
  const secondBat = firstBat === 'A' ? 'B' : 'A';
  const innings = [newInnings(firstBat, secondBat, setup, null)];
  let lastFx = null;

  for (const ev of room.events) {
    let inn = innings[innings.length - 1];
    if (inn.done && innings.length === 1) {
      innings.push(newInnings(secondBat, firstBat, setup, innings[0].runs + 1));
      inn = innings[1];
    }
    if (ev.type === 'setBowler') {
      if (!inn.done) inn.currentBowler = ev.name;
    } else if (ev.type === 'ball') {
      if (inn.done) continue;
      const fx = { seq: ev.seq, source: ev.source || 'manual' };
      applyBall(inn, ev, setup, fx);
      lastFx = fx;
    }
  }

  let inn = innings[innings.length - 1];
  let phase = 'live';
  let result = null;
  if (innings.length === 2 && inn.done) {
    phase = 'result';
    const chase = inn;
    const first = innings[0];
    const teamName = (k) => setup[k].name;
    if (chase.runs >= chase.target) {
      result = `${teamName(chase.batKey)} won by ${chase.batters.length - 1 - chase.wickets} wicket${chase.batters.length - 1 - chase.wickets === 1 ? '' : 's'}`;
    } else if (chase.runs === chase.target - 1) {
      result = 'Match tied!';
    } else {
      result = `${teamName(first.batKey)} won by ${chase.target - 1 - chase.runs} runs`;
    }
  } else if (innings.length === 1 && inn.done) {
    phase = 'innings_break';
  }

  const oversText = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;
  const innView = (i) => ({
    battingTeam: setup[i.batKey].name,
    bowlingTeam: setup[i.bowlKey].name,
    runs: i.runs, wickets: i.wickets, overs: oversText(i.balls),
    fours: i.fours, sixes: i.sixes,
    striker: i.batters[i.striker] && !i.batters[i.striker].out ? i.batters[i.striker] : null,
    nonStriker: i.batters[i.nonStriker] && !i.batters[i.nonStriker].out ? i.batters[i.nonStriker] : null,
    bowler: i.currentBowler
      ? { ...i.bowlers.find((b) => b.name === i.currentBowler), overs: oversText((i.bowlers.find((b) => b.name === i.currentBowler) || { balls: 0 }).balls) }
      : null,
    thisOver: i.thisOver,
    target: i.target,
    needsBowler: !i.done && i.currentBowler === null,
    ballsLeft: setup.overs * 6 - i.balls,
    batters: i.batters, bowlers: i.bowlers,
    endReason: i.endReason,
  });

  const view = {
    phase, seq: room.seq,
    setup: { teamA: setup.A.name, teamB: setup.B.name, overs: setup.overs },
    innings: innings.map(innView),
    inningsNo: innings.length,
    live: innView(inn),
    lastFx, result,
    pendingAuto: room.pendingAuto,
    bowlingTeamPlayers: setup[inn.bowlKey].players,
  };
  if (phase === 'live' && innings.length === 2) {
    const need = inn.target - inn.runs;
    view.chase = {
      need, ballsLeft: setup.overs * 6 - inn.balls,
      rrr: inn.balls < setup.overs * 6 ? (need / ((setup.overs * 6 - inn.balls) / 6)).toFixed(2) : '—',
    };
  }
  return view;
}

// ---------------------------------------------------------------------------
// SSE broadcast
// ---------------------------------------------------------------------------
function broadcast(code) {
  const room = rooms.get(code);
  if (!room) return;
  const payload = `data: ${JSON.stringify(computeState(room))}\n\n`;
  for (const res of room.clients) {
    try { res.write(payload); } catch { room.clients.delete(res); }
  }
}

setInterval(() => { // keep-alive
  for (const room of rooms.values()) {
    for (const res of room.clients) {
      try { res.write(': ping\n\n'); } catch { room.clients.delete(res); }
    }
  }
}, 25000);

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean);

  // --- API ---
  if (parts[0] === 'api') {
    if (req.method === 'POST' && parts[1] === 'screen') {
      return json(res, 200, { code: createRoom() });
    }
    const code = parts[2];
    const room = rooms.get(code);

    if (parts[1] === 'room' && !room) return json(res, 404, { error: 'No turf screen with that code. Check the code on the big screen.' });

    if (parts[1] === 'room' && parts[3] === 'stream' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      room.clients.add(res);
      res.write(`data: ${JSON.stringify(computeState(room))}\n\n`);
      req.on('close', () => room.clients.delete(res));
      return;
    }

    if (parts[1] === 'room' && parts[3] === 'pair' && req.method === 'POST') {
      return json(res, 200, { ok: true, hasSetup: !!room.setup });
    }

    if (parts[1] === 'room' && parts[3] === 'setup' && req.method === 'POST') {
      const b = await readBody(req);
      const clean = (arr, fallback) => {
        const list = (arr || []).map((s) => String(s).trim()).filter(Boolean);
        return list.length >= 2 ? list : fallback;
      };
      room.setup = {
        A: { name: (b.teamA || 'Team A').trim() || 'Team A', players: clean(b.playersA, ['Player A1', 'Player A2', 'Player A3', 'Player A4', 'Player A5', 'Player A6']) },
        B: { name: (b.teamB || 'Team B').trim() || 'Team B', players: clean(b.playersB, ['Player B1', 'Player B2', 'Player B3', 'Player B4', 'Player B5', 'Player B6']) },
        overs: Math.min(50, Math.max(1, parseInt(b.overs, 10) || 6)),
        firstBatting: b.firstBatting === 'B' ? 'B' : 'A',
      };
      room.events = [];
      room.pendingAuto = null;
      room.seq += 1;
      broadcast(code);
      return json(res, 200, { ok: true });
    }

    if (parts[1] === 'room' && parts[3] === 'event' && req.method === 'POST') {
      const b = await readBody(req);
      room.seq += 1;
      if (b.type === 'ball') {
        room.events.push({ type: 'ball', seq: room.seq, runs: Math.max(0, Math.min(7, parseInt(b.runs, 10) || 0)), extra: ['wd', 'nb'].includes(b.extra) ? b.extra : null, wicket: !!b.wicket, source: b.source === 'sensor' ? 'sensor' : 'manual' });
        room.pendingAuto = null;
      } else if (b.type === 'setBowler') {
        room.events.push({ type: 'setBowler', seq: room.seq, name: String(b.name || 'Bowler').slice(0, 40) });
      } else if (b.type === 'undo') {
        for (let i = room.events.length - 1; i >= 0; i--) {
          if (room.events[i].type === 'ball') { room.events.splice(i, 1); break; }
        }
      } else if (b.type === 'auto') {
        // Simulated sensor/camera detection → becomes a pending suggestion for the scorer
        const kind = b.kind === 'six' ? 'six' : 'four';
        room.pendingAuto = { kind, runs: kind === 'six' ? 6 : 4, device: b.device || (kind === 'six' ? 'Overhead camera' : 'Boundary sensor #2'), at: Date.now() };
      } else if (b.type === 'dismissAuto') {
        room.pendingAuto = null;
      } else if (b.type === 'rematch') {
        room.events = []; room.pendingAuto = null;
      } else if (b.type === 'reset') {
        room.setup = null; room.events = []; room.pendingAuto = null;
      }
      broadcast(code);
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: 'Unknown API route' });
  }

  // --- static files ---
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(nets)) {
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
  }
  console.log('');
  console.log('  🏏 CricAdda prototype is running!');
  console.log('');
  console.log(`  Big screen (open on laptop/TV):  http://localhost:${PORT}/screen.html`);
  for (const ip of ips) {
    console.log(`  Phone (same Wi-Fi):              http://${ip}:${PORT}`);
  }
  if (!ips.length) console.log(`  Phone:                           http://<this-machine-ip>:${PORT}`);
  console.log('');
  console.log('  1. Open the big screen page — it shows a 4-digit pairing code.');
  console.log('  2. On the phone, open the URL above, tap "Score a match", enter the code.');
  console.log('  3. Optional: open /sensor.html on another device to simulate auto-detection.');
  console.log('');
});
