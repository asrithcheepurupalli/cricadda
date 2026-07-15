/* =============================================================
   CricAdda App — complete-model web app (client-side)
   a made. product · made. by ac
   Screens: boot → onboarding (phone/OTP/avatar) → home →
   teams / match / stats. Event-sourced match engine, career
   stats + XP + badges persisted in localStorage.
   ============================================================= */
'use strict';

/* ---------------- storage ---------------- */
const DB = {
  load(k, d) { try { return JSON.parse(localStorage.getItem('cricadda_' + k)) ?? d; } catch { return d; } },
  save(k, v) { localStorage.setItem('cricadda_' + k, JSON.stringify(v)); },
};
let profile = DB.load('profile', null);
let accounts = DB.load('accounts', {}); // phone -> profile (multi-account: sign out & back in restores everything)
let teams = DB.load('teams', []);
let history = DB.load('history', []);
let players = DB.load('players', {}); // everyone who ever played: name -> aggregates
let settings = DB.load('settings', { sound: true });
let turfs = DB.load('turfs', ['CricAdda Arena — Madhapur', 'GreenPitch — Gachibowli', 'SkyTurf Rooftop — Kukatpally']);
let bookings = DB.load('bookings', []); // {id, turf, date, slot, at}
let lastMatch = null;                 // final state of the most recent match (for sharing)

function saveProfile() {
  DB.save('profile', profile);
  if (profile && profile.phone) { accounts[profile.phone] = profile; DB.save('accounts', accounts); }
}

/* ---------------- TV mode (BroadcastChannel) ---------------- */
let tvChannel = null;
try {
  tvChannel = new BroadcastChannel('cricadda_tv');
  tvChannel.onmessage = (e) => { if (e.data && e.data.type === 'hello' && room) broadcastTV(); };
} catch (e) {}
function tvView(st) {
  const l = st.inn;
  const striker = l.batters[l.striker] && !l.batters[l.striker].out ? l.batters[l.striker] : null;
  const ns = l.batters[l.nonStriker] && !l.batters[l.nonStriker].out ? l.batters[l.nonStriker] : null;
  const bw = l.currentBowler ? l.bowlers.find((b) => b.name === l.currentBowler) : null;
  return {
    phase: st.phase, batting: st.setup[l.batKey].name, runs: l.runs, wkts: l.wickets,
    overs: st.overs, oversMax: st.setup.overs, inningsNo: st.inningsNo, chase: st.chase,
    striker, ns, bowler: bw, thisOver: l.thisOver, fours: l.fours, sixes: l.sixes,
    teams: [st.setup.A.name, st.setup.B.name], result: st.result, mom: st.mom,
    innings: st.innings.map((i) => ({ team: st.setup[i.batKey].name, runs: i.runs, wkts: i.wickets })),
  };
}
function broadcastTV(st) {
  if (!tvChannel) return;
  st = st || (room ? matchState() : null);
  if (!st) return;
  let fx = null;
  const evs = room ? room.events.filter((e) => e.type === 'ball') : [];
  if (evs.length) {
    const e = evs[evs.length - 1];
    fx = { seq: e.seq,
      kind: e.wicket ? 'wicket' : e.runs === 4 && !e.extra ? 'four' : e.runs === 6 && !e.extra ? 'six' : null };
  }
  try { tvChannel.postMessage({ type: 'state', view: tvView(st), fx }); } catch (e) {}
}
function openTV() {
  window.open('tv.html', 'cricadda_tv', 'noopener');
  toast('Put that window on the TV 📺');
  setTimeout(() => broadcastTV(), 600);
}

/* ---------------- utils ---------------- */
const $ = (id) => document.getElementById(id);
const app = $('app');
const esc = (s) => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1800); }
function mulberry(seed) { return function () { let t = (seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---------------- sound ---------------- */
let AC = null;
function tone(f, d, dl = 0, t = 'square', v = 0.09) {
  if (!settings.sound) return;
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = t; o.frequency.value = f;
    g.gain.setValueAtTime(v, AC.currentTime + dl);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dl + d);
    o.connect(g); g.connect(AC.destination);
    o.start(AC.currentTime + dl); o.stop(AC.currentTime + dl + d);
  } catch (e) {}
}
const sfx = {
  tap: () => tone(880, 0.05, 0, 'square', 0.05),
  ok: () => { tone(659, 0.1); tone(880, 0.15, 0.09); },
  four: () => { tone(523, 0.15); tone(659, 0.15, 0.12); tone(784, 0.3, 0.24); },
  six: () => { tone(523, 0.12); tone(659, 0.12, 0.1); tone(784, 0.12, 0.2); tone(1047, 0.5, 0.3); },
  wicket: () => { tone(311, 0.2, 0, 'sawtooth'); tone(233, 0.2, 0.18, 'sawtooth'); tone(155, 0.5, 0.36, 'sawtooth'); },
  levelup: () => { for (let i = 0; i < 5; i++) tone(600 + i * 140, 0.14, i * 0.09, 'triangle', 0.12); },
};

/* ---------------- retro avatar generator ----------------
   Deterministic 16x16 pixel character from a numeric seed. */
const SKIN = ['#f2c29b', '#e0a878', '#c68863', '#a96a45', '#8a5232', '#6b3d22'];
const HAIRC = ['#1b1b1b', '#3a2a1a', '#6b3d22', '#b3541e', '#c0c0c0', '#e0a800', '#2a6fdb', '#ff2d95'];
const SHIRT = ['#39ff14', '#ffe600', '#ff2d95', '#00e5ff', '#ff8c1a', '#b14aff', '#f2f2f2', '#2a6fdb'];
const CAPC = ['#ff2d95', '#00e5ff', '#ffe600', '#39ff14', '#f2f2f2', '#b14aff'];
const STYLES = ['spiky', 'flat', 'cap', 'headband', 'helmet', 'bald', 'curly'];
const TITLES = ['Street Smasher', 'Gully Gladiator', 'Boundary Bandit', 'Yorker King', 'Six Machine', 'The Wall', 'Turf Titan', 'Night Striker', 'Captain Cool', 'Swing Master'];

function avatarConfig(seed) {
  const r = mulberry(seed);
  return {
    skin: SKIN[(r() * SKIN.length) | 0],
    hair: HAIRC[(r() * HAIRC.length) | 0],
    shirt: SHIRT[(r() * SHIRT.length) | 0],
    cap: CAPC[(r() * CAPC.length) | 0],
    style: STYLES[(r() * STYLES.length) | 0],
    eyes: (r() * 3) | 0,      // 0 normal 1 determined 2 shades
    mouth: (r() * 3) | 0,     // 0 smile 1 grin 2 focus
    title: TITLES[(r() * TITLES.length) | 0],
  };
}

function drawAvatar(canvas, seed, px = 8) {
  const c = avatarConfig(seed);
  canvas.width = 16 * px; canvas.height = 16 * px;
  const x = canvas.getContext('2d');
  const P = (col, gx, gy, w = 1, h = 1) => { x.fillStyle = col; x.fillRect(gx * px, gy * px, w * px, h * px); };
  x.fillStyle = '#0d0d0d'; x.fillRect(0, 0, canvas.width, canvas.height);
  // face 5..10 cols, rows 3..9
  P(c.skin, 5, 3, 6, 7);
  P(c.skin, 4, 5, 1, 3); P(c.skin, 11, 5, 1, 3); // ears
  // hair / headgear
  if (c.style === 'spiky') { P(c.hair, 5, 2, 6, 1); P(c.hair, 4, 1, 1, 2); P(c.hair, 6, 1); P(c.hair, 8, 1); P(c.hair, 10, 1, 1, 2); P(c.hair, 4, 3, 1, 1); P(c.hair, 11, 3, 1, 1); }
  else if (c.style === 'flat') { P(c.hair, 4, 2, 8, 1); P(c.hair, 4, 3, 1, 2); P(c.hair, 11, 3, 1, 2); P(c.hair, 5, 3, 6, 1); }
  else if (c.style === 'curly') { P(c.hair, 4, 1, 8, 2); P(c.hair, 3, 2, 1, 3); P(c.hair, 12, 2, 1, 3); P(c.hair, 5, 3, 6, 1); }
  else if (c.style === 'cap') { P(c.cap, 4, 1, 8, 2); P(c.cap, 3, 3, 10, 1); P('#0d0d0d', 3, 4, 10, 0); }
  else if (c.style === 'headband') { P(c.hair, 5, 2, 6, 1); P(c.cap, 4, 3, 8, 1); P(c.skin, 5, 4, 6, 1); }
  else if (c.style === 'helmet') { P('#2a6fdb', 4, 1, 8, 3); P('#2a6fdb', 3, 3, 2, 2); P('#2a6fdb', 11, 3, 2, 2); P('#9aa0a6', 4, 6, 1, 2); P('#9aa0a6', 11, 6, 1, 2); }
  // eyes row 6
  if (c.eyes === 2) { P('#111', 5, 6, 3, 1); P('#111', 9, 6, 3, 1); P('#111', 8, 6, 1, 1); }
  else { P('#fff', 6, 6, 1, 1); P('#fff', 9, 6, 1, 1); P('#111', c.eyes === 1 ? 6 : 6.0, 6); P('#111', 6, 6); P('#111', 9, 6); }
  // mouth row 8-9
  if (c.mouth === 0) { P('#7a3020', 7, 8, 2, 1); }
  else if (c.mouth === 1) { P('#7a3020', 6, 8, 4, 1); P('#fff', 7, 8, 2, 1); }
  else { P('#7a3020', 7, 8, 3, 1); }
  // body rows 10..15
  P(c.shirt, 4, 10, 8, 5);
  P(c.skin, 2, 11, 2, 2); P(c.skin, 12, 11, 2, 2); // hands
  P('#0d0d0d', 7, 10, 2, 1);                       // collar
  // bat in hand
  P('#c68863', 13, 8, 1, 5); P('#8a5232', 13, 7, 1, 1);
}

/* ---------------- XP / levels / badges ---------------- */
const XP_PER_LEVEL = 100;
const lvlOf = (xp) => Math.floor(xp / XP_PER_LEVEL) + 1;
const BADGES = [
  { id: 'first', i: '🏏', t: 'FIRST MATCH', test: (p) => p.stats.matches >= 1 },
  { id: 'sixer', i: '🚀', t: 'BIG HITTER', test: (p) => p.stats.sixes >= 1 },
  { id: 'fifty', i: '⭐', t: '50 CLUB', test: (p) => p.stats.best50 },
  { id: 'wolf', i: '🎯', t: 'WICKET WOLF', test: (p) => p.stats.wickets >= 3 },
  { id: 'vet', i: '🛡️', t: 'VETERAN ×10', test: (p) => p.stats.matches >= 10 },
  { id: 'ton', i: '👑', t: 'CENTURION', test: (p) => p.stats.best100 },
];
function checkBadges() {
  const won = [];
  for (const b of BADGES) if (!profile.badges.includes(b.id) && b.test(profile)) { profile.badges.push(b.id); won.push(b); }
  return won;
}

/* ---------------- match engine (event-sourced) ---------------- */
let room = null; // { setup, events, seq }
function newInnings(batKey, bowlKey, setup, target) {
  return { batKey, bowlKey, target, runs: 0, wickets: 0, balls: 0, fours: 0, sixes: 0,
    batters: setup[batKey].players.map((n) => ({ name: n, runs: 0, balls: 0, fours: 0, sixes: 0, out: false })),
    bowlers: [], striker: 0, nonStriker: 1, nextIn: 2, thisOver: [], currentBowler: null, done: false, endReason: null };
}
function bowlerOf(inn) {
  const n = inn.currentBowler || 'Bowler';
  let b = inn.bowlers.find((x) => x.name === n);
  if (!b) { b = { name: n, balls: 0, runs: 0, wickets: 0 }; inn.bowlers.push(b); }
  return b;
}
function checkDone(inn, setup) {
  if (inn.wickets >= inn.batters.length - 1) { inn.done = true; inn.endReason = 'all out'; }
  else if (inn.balls >= setup.overs * 6) { inn.done = true; inn.endReason = 'overs done'; }
  else if (inn.target && inn.runs >= inn.target) { inn.done = true; inn.endReason = 'chased'; }
}
function applyBall(inn, ev, setup, fx) {
  const st = inn.batters[inn.striker], bw = bowlerOf(inn);
  let display, rotate = false;
  if (ev.extra === 'wd') { inn.runs += 1; bw.runs += 1; display = 'Wd'; }
  else if (ev.extra === 'nb') {
    inn.runs += 1 + ev.runs; bw.runs += 1 + ev.runs; st.runs += ev.runs;
    display = ev.runs ? `Nb+${ev.runs}` : 'Nb'; rotate = ev.runs % 2 === 1;
    if (ev.runs === 4) { inn.fours++; st.fours++; fx.kind = 'four'; }
    if (ev.runs === 6) { inn.sixes++; st.sixes++; fx.kind = 'six'; }
  } else {
    inn.balls++; bw.balls++; st.balls++;
    if (ev.wicket) {
      inn.wickets++; bw.wickets++; st.out = true; display = 'W';
      fx.kind = 'wicket'; fx.batterOut = `${st.name} ${st.runs} (${st.balls})`;
      if (inn.nextIn < inn.batters.length) { inn.striker = inn.nextIn; inn.nextIn++; }
    } else {
      const before = st.runs;
      st.runs += ev.runs; inn.runs += ev.runs; bw.runs += ev.runs;
      display = String(ev.runs); rotate = ev.runs % 2 === 1;
      if (ev.runs === 4) { inn.fours++; st.fours++; fx.kind = 'four'; }
      else if (ev.runs === 6) { inn.sixes++; st.sixes++; fx.kind = 'six'; }
      else fx.kind = ev.runs > 0 ? 'run' : 'dot';
      if (before < 50 && st.runs >= 50) fx.milestone = { player: st.name, mark: 50 };
      if (before < 100 && st.runs >= 100) fx.milestone = { player: st.name, mark: 100 };
    }
    fx.batter = st.name;
  }
  inn.thisOver.push({ d: display });
  if (rotate) [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];
  checkDone(inn, setup);
  if (!inn.done && inn.balls > 0 && inn.balls % 6 === 0 && ev.extra !== 'wd' && ev.extra !== 'nb') {
    [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];
    inn.currentBowler = null; inn.thisOver = [];
  }
}
function matchState() {
  const setup = room.setup;
  const first = setup.firstBatting, second = first === 'A' ? 'B' : 'A';
  const innings = [newInnings(first, second, setup, null)];
  let lastFx = null;
  for (const ev of room.events) {
    let inn = innings[innings.length - 1];
    if (inn.done && innings.length === 1) { innings.push(newInnings(second, first, setup, innings[0].runs + 1)); inn = innings[1]; }
    if (ev.type === 'setBowler') { if (!inn.done) inn.currentBowler = ev.name; }
    else if (ev.type === 'ball') {
      if (inn.done) continue;
      const fx = { seq: ev.seq };
      applyBall(inn, ev, setup, fx);
      lastFx = fx;
    }
  }
  const inn = innings[innings.length - 1];
  let phase = 'live', result = null, mom = null, winner = null;
  if (innings.length === 2 && inn.done) {
    phase = 'result';
    const tn = (k) => setup[k].name;
    if (inn.runs >= inn.target) { const w = inn.batters.length - 1 - inn.wickets; result = `${tn(inn.batKey)} won by ${w} wicket${w === 1 ? '' : 's'}`; winner = inn.batKey; }
    else if (inn.runs === inn.target - 1) result = 'Match tied!';
    else { result = `${tn(innings[0].batKey)} won by ${inn.target - 1 - inn.runs} runs`; winner = innings[0].batKey; }
    const pts = new Map();
    const add = (n, p, l) => { const e = pts.get(n) || { p: 0, l: [] }; e.p += p; if (l) e.l.push(l); pts.set(n, e); };
    for (const i of innings) {
      for (const b of i.batters) if (b.balls > 0 || b.runs > 0) add(b.name, b.runs, `${b.runs} (${b.balls})`);
      for (const b of i.bowlers) if (b.balls > 0) add(b.name, b.wickets * 25, `${b.wickets}/${b.runs}`);
    }
    let best = null;
    for (const [n, e] of pts) if (!best || e.p > best.p) best = { name: n, summary: e.l.join(' & ') };
    mom = best;
  } else if (innings.length === 1 && inn.done) phase = 'break';
  const ov = (b) => `${Math.floor(b / 6)}.${b % 6}`;
  return { phase, innings, inn, result, mom, winner, setup,
    overs: ov(inn.balls), inningsNo: innings.length,
    chase: innings.length === 2 && phase === 'live' ? { need: inn.target - inn.runs, ballsLeft: setup.overs * 6 - inn.balls } : null };
}
function dispatch(ev) {
  room.seq = (room.seq || 0) + 1;
  if (ev.type === 'undo') {
    for (let i = room.events.length - 1; i >= 0; i--) if (room.events[i].type === 'ball') { room.events.splice(i, 1); break; }
  } else room.events.push({ ...ev, seq: room.seq });
  renderMatch();
}

/* ---------------- flash ---------------- */
let flashTimer = null, lastFxSeq = 0;
function flash(cls, big, sub) {
  const f = $('flash');
  f.className = 'flash show ' + cls;
  $('flashBig').textContent = big; $('flashSub').textContent = sub || '';
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { f.className = 'flash'; }, 1800);
}

/* ================= SCREENS ================= */
function render(html) { app.innerHTML = `<div class="screen">${html}</div>`; }
function head(active) {
  const lvl = lvlOf(profile.xp);
  return `<div class="apphead">
    <a class="logo" href="#" onclick="go('home');return false">CRIC<span>ADDA</span></a>
    <div class="mini" onclick="go('stats')">
      <span class="lvl-chip">LVL ${lvl}</span>
      <canvas id="miniAv" width="32" height="32"></canvas>
    </div></div>`;
}
function mountMini() { const c = $('miniAv'); if (c) drawAvatar(c, profile.avatarSeed, 2); }
const FOOT = `<div class="foot"><span class="made-mark">a <b style="color:var(--text)">made.</b> product</span></div>`;

/* ---------- boot ---------- */
function screenBoot() {
  render(`<div class="center" onclick="go(profile ? 'home' : 'ob1')">
    <div class="made">made. <span class="dim">presents</span></div>
    <div class="boot-logo">CRIC<span>ADDA</span></div>
    <div class="boot-tag">EVERY TURF A STADIUM<br>EVERY PLAYER A STAR</div>
    <div class="press blink">▶ PRESS START</div>
    <div class="dim" style="font-size:15px">insert phone number to begin</div>
  </div>`);
}

/* ---------- onboarding ---------- */
let obPhone = '', obOtp = '', obSeed = (Math.random() * 1e9) | 0, obName = '';
function dots(n) { return `<div class="steps-dots">${[1, 2, 3, 4].map((i) => `<div class="dot ${i <= n ? 'on' : ''}"></div>`).join('')}</div>`; }

function screenOb1() {
  render(`${dots(1)}<div class="center">
    <div class="ob-title">INSERT PHONE<br>NUMBER TO PLAY</div>
    <div class="ob-sub">This is your identity — no passwords, ever.<br>One number, one lifetime cricket career.</div>
    <div style="width:100%;max-width:330px">
      <label>Phone number</label>
      <input id="obPhone" inputmode="tel" maxlength="10" placeholder="98765 43210" value="${esc(obPhone)}"
        style="font-size:26px;text-align:center;letter-spacing:0.15em">
      <button class="primary wide" style="margin-top:16px" onclick="obSendOtp()">SEND SECRET CODE ▶</button>
      <div class="dim" id="obErr" style="margin-top:10px;font-size:15px;text-align:center"></div>
    </div></div>${FOOT}`);
}
let obCode = '';
function obSendOtp() {
  const v = $('obPhone').value.replace(/\D/g, '');
  if (v.length < 10) { $('obErr').textContent = 'Enter a 10-digit number, champ.'; return; }
  obPhone = v; sfx.ok();
  obCode = String((Math.random() * 9000 + 1000) | 0);
  go('ob2');
  setTimeout(() => {
    $('smsBody').innerHTML = `Your CricAdda secret code is <b class="gold" style="font-size:24px;letter-spacing:0.2em"> ${obCode} </b>`;
    $('sms').classList.add('show');
    setTimeout(() => $('sms').classList.remove('show'), 6000);
  }, 900);
}
function screenOb2() {
  render(`${dots(2)}<div class="center">
    <div class="ob-title">ENTER THE<br>SECRET CODE</div>
    <div class="ob-sub">Sent by SMS to ${esc(obPhone)}.<br><span class="dim">(demo mode — watch the top of the screen 👀)</span></div>
    <div class="otp-row">
      ${[0, 1, 2, 3].map((i) => `<input id="otp${i}" inputmode="numeric" maxlength="1" onkeyup="otpKey(${i}, event)">`).join('')}
    </div>
    <button class="primary" style="min-width:220px" onclick="obVerify()">VERIFY ▶</button>
    <div class="dim" id="obErr" style="font-size:15px"></div>
  </div>${FOOT}`);
  setTimeout(() => $('otp0') && $('otp0').focus(), 300);
}
function otpKey(i, e) {
  const el = $('otp' + i);
  if (el.value && i < 3) $('otp' + (i + 1)).focus();
  if (e.key === 'Backspace' && !el.value && i > 0) $('otp' + (i - 1)).focus();
}
function obVerify() {
  const code = [0, 1, 2, 3].map((i) => $('otp' + i).value).join('');
  if (code !== obCode) { $('obErr').textContent = 'Wrong code — check the SMS at the top!'; sfx.wicket(); return; }
  sfx.ok();
  // returning player? phone number is the identity — restore the whole career
  if (accounts[obPhone]) {
    profile = accounts[obPhone];
    DB.save('profile', profile);
    toast(`Welcome back, ${profile.name}! 🏏`);
    go('home');
    return;
  }
  go('ob3');
}
function screenOb3() {
  render(`${dots(3)}<div class="center">
    <div class="ob-title">CREATE YOUR<br>PLAYER</div>
    <div class="av-stage">
      <button class="arrow" onclick="obCycle(-1)">◄</button>
      <div class="av-frame"><canvas id="obAv"></canvas></div>
      <button class="arrow" onclick="obCycle(1)">►</button>
    </div>
    <div class="av-name" id="obTitle"></div>
    <button class="ghost" onclick="obRandom()" style="font-size:9px">🎲 SURPRISE ME</button>
    <div style="width:100%;max-width:330px">
      <label>Your name</label>
      <input id="obName" maxlength="20" placeholder="e.g. Asrith" value="${esc(obName)}" style="text-align:center;font-size:22px">
      <button class="primary wide" style="margin-top:16px" onclick="obFinish()">LOCK IT IN ▶</button>
      <div class="dim" id="obErr" style="margin-top:8px;font-size:15px;text-align:center"></div>
    </div></div>${FOOT}`);
  obDraw();
}
function obDraw() { drawAvatar($('obAv'), obSeed, 9); $('obTitle').textContent = '« ' + avatarConfig(obSeed).title + ' »'; }
function obCycle(d) { obSeed = (obSeed + d + 1e9) % 1e9; sfx.tap(); obDraw(); }
function obRandom() { obSeed = (Math.random() * 1e9) | 0; sfx.tap(); obDraw(); }
function obFinish() {
  const n = $('obName').value.trim();
  if (!n) { $('obErr').textContent = 'Every legend needs a name.'; return; }
  obName = n; sfx.ok(); go('ob4');
}
function screenOb4() {
  render(`${dots(4)}<div class="center">
    <div class="ob-title">READY<br>PLAYER ONE</div>
    <div class="card player-card" style="width:100%;max-width:330px">
      <canvas id="obAv2"></canvas>
      <div class="pc-name">${esc(obName).toUpperCase()}</div>
      <div class="pc-title">« ${esc(avatarConfig(obSeed).title)} »</div>
      <div class="pc-title dim">📞 ${esc(obPhone)}</div>
    </div>
    <button class="gold" style="min-width:240px" onclick="obCreate()">🏏 START MY CAREER</button>
  </div>${FOOT}`);
  drawAvatar($('obAv2'), obSeed, 8);
}
function obCreate() {
  profile = { phone: obPhone, name: obName, avatarSeed: obSeed, xp: 0, badges: [],
    stats: { matches: 0, runs: 0, ballsFaced: 0, fours: 0, sixes: 0, outs: 0, wickets: 0, ballsBowled: 0, runsConceded: 0, hs: 0, bestBowl: '', best50: false, best100: false, mom: 0 } };
  saveProfile();
  sfx.levelup();
  go('home');
}

/* ---------- home ---------- */
function screenHome() {
  const s = profile.stats, lvl = lvlOf(profile.xp);
  const pct = (profile.xp % XP_PER_LEVEL);
  const sr = s.ballsFaced ? Math.round((s.runs / s.ballsFaced) * 100) : 0;
  render(`${head()}
    <div class="card player-card">
      <canvas id="homeAv"></canvas>
      <div class="pc-name">${esc(profile.name).toUpperCase()}</div>
      <div class="pc-title">« ${esc(avatarConfig(profile.avatarSeed).title)} » · LVL ${lvl}</div>
      <div class="xpbar"><div class="fill" style="width:${pct}%"></div></div>
      <span class="lbl" style="font-family:'Press Start 2P',monospace;font-size:7px;color:var(--dim);margin-top:6px;display:block">XP ${profile.xp} · ${XP_PER_LEVEL - pct} TO LVL ${lvl + 1}</span>
      <div class="statrow">
        <div class="stat"><div class="n">${s.matches}</div><div class="l">matches</div></div>
        <div class="stat"><div class="n">${s.runs}</div><div class="l">runs</div></div>
        <div class="stat"><div class="n">${s.wickets}</div><div class="l">wickets</div></div>
        <div class="stat"><div class="n">${sr}</div><div class="l">strike rt</div></div>
      </div>
    </div>
    <div class="menu">
      <button class="primary" onclick="go('setup')"><span class="em">▶</span> QUICK MATCH</button>
      <button onclick="go('teams')"><span class="em">🛡️</span> MY TEAMS</button>
      <button onclick="go('stats')"><span class="em">📊</span> CAREER &amp; BADGES</button>
      <button onclick="go('leaders')"><span class="em">🏆</span> LEADERBOARD</button>
      <button onclick="go('book')"><span class="em">📅</span> BOOK A TURF</button>
      <button onclick="go('pair')"><span class="em">🖥️</span> PAIR WITH TURF SCREEN</button>
      <button onclick="go('settings')"><span class="em">⚙️</span> SETTINGS</button>
      <button id="installBtn" class="gold" style="display:none" onclick="installApp()"><span class="em">📲</span> INSTALL ON HOME SCREEN</button>
    </div>${FOOT}`);
  if (installPrompt) { const b = $('installBtn'); if (b) b.style.display = 'flex'; }
  drawAvatar($('homeAv'), profile.avatarSeed, 7);
  mountMini();
}

/* ---------- pair info ---------- */
function screenPair() {
  render(`${head()}<div class="backrow"><button onclick="go('home')">◄ BACK</button></div>
    <div class="card">
      <div class="ob-title" style="font-size:12px;text-align:left">PAIR WITH A TURF SCREEN</div>
      <p class="dim" style="margin-top:12px">At a CricAdda turf, the big LED screen shows a
      <b class="gold">4-digit code</b>. Enter it here and this phone becomes the remote —
      teams, toss, scoring, celebrations, everything.</p>
      <label>Pairing code</label>
      <input inputmode="numeric" maxlength="4" placeholder="0000" style="font-family:'Press Start 2P',monospace;font-size:24px;text-align:center;letter-spacing:0.25em">
      <button class="primary wide" style="margin-top:14px" onclick="toast('No turf screen nearby — visit a CricAdda turf! 🏟️')">CONNECT ▶</button>
      <p class="dim" style="margin-top:14px;font-size:16px">This demo build has no turf nearby.
      Matches you score in <b>QUICK MATCH</b> count toward your career either way.</p>
    </div>${FOOT}`);
  mountMini();
}

/* ---------- teams ---------- */
function screenTeams() {
  render(`${head()}<div class="backrow"><button onclick="go('home')">◄ BACK</button></div>
    <div class="sec-t">MY SQUADS</div>
    <div class="teamlist">
      ${teams.length ? teams.map((t, i) => `<div class="team-item"><div><div class="n">${esc(t.name)}</div>
        <div class="p">${t.players.map(esc).join(' · ')}</div></div>
        <button class="danger" style="font-size:8px;padding:8px" onclick="delTeam(${i})">✕</button></div>`).join('')
      : '<p class="dim">No squads yet. Build one — save it forever, reuse every weekend.</p>'}
    </div>
    <div class="card" style="margin-top:18px">
      <div class="sec-t" style="margin-top:0">NEW SQUAD</div>
      <label>Squad name</label><input id="tName" maxlength="24" placeholder="Royal Strikers">
      <label>Players (one per line)</label><textarea id="tPlayers" rows="5" placeholder="${esc(profile.name)}\nTarun\nChandesh\nVamsi"></textarea>
      <button class="primary wide" style="margin-top:14px" onclick="addTeam()">SAVE SQUAD</button>
    </div>${FOOT}`);
  mountMini();
}
function addTeam() {
  const name = $('tName').value.trim();
  const players = $('tPlayers').value.split('\n').map((s) => s.trim()).filter(Boolean);
  if (!name || players.length < 2) { toast('Name + at least 2 players'); return; }
  teams.push({ name, players: players.slice(0, 11) });
  DB.save('teams', teams); sfx.ok(); screenTeams();
}
function delTeam(i) { teams.splice(i, 1); DB.save('teams', teams); screenTeams(); }

/* ---------- match setup ---------- */
function teamOptions(sel) {
  return `<option value="">— type players manually —</option>` +
    teams.map((t, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
}
function screenSetup() {
  render(`${head()}<div class="backrow"><button onclick="go('home')">◄ BACK</button></div>
    <div class="card">
      <div class="sec-t" style="margin-top:0">MATCH SETUP</div>
      <label>Your team (bats first)</label>
      <select id="selA" onchange="fillTeam('A')">${teamOptions()}</select>
      <input id="nameA" placeholder="Team A name" value="Team ${esc(profile.name)}" style="margin-top:8px">
      <textarea id="playersA" rows="4" style="margin-top:8px" placeholder="players, one per line">${esc(profile.name)}\nTarun\nChandesh\nVamsi</textarea>
      <label>Opponents</label>
      <select id="selB" onchange="fillTeam('B')">${teamOptions()}</select>
      <input id="nameB" placeholder="Team B name" value="Turf Titans" style="margin-top:8px">
      <textarea id="playersB" rows="4" style="margin-top:8px" placeholder="players, one per line">Partha\nRohit\nSuresh\nDeepak</textarea>
      <label>Overs per side</label>
      <select id="overs"><option>1</option><option selected>2</option><option>4</option><option>6</option><option>8</option></select>
      <button class="primary wide" style="margin-top:16px" onclick="startMatch()">🏏 PLAY BALL</button>
    </div>${FOOT}`);
  mountMini();
}
function fillTeam(k) {
  const i = $('sel' + k).value;
  if (i === '') return;
  const t = teams[+i];
  $('name' + k).value = t.name;
  $('players' + k).value = t.players.join('\n');
}
function startMatch() {
  const parse = (id, fb) => { const l = $(id).value.split('\n').map((s) => s.trim()).filter(Boolean); return l.length >= 2 ? l.slice(0, 11) : fb; };
  room = {
    seq: 0, events: [],
    setup: {
      A: { name: $('nameA').value.trim() || 'Team A', players: parse('playersA', [profile.name, 'Tarun', 'Chandesh', 'Vamsi']) },
      B: { name: $('nameB').value.trim() || 'Team B', players: parse('playersB', ['Partha', 'Rohit', 'Suresh', 'Deepak']) },
      overs: parseInt($('overs').value, 10) || 2, firstBatting: 'A',
    },
  };
  sfx.ok(); go('match');
}

/* ---------- match ---------- */
function chip(b) {
  const cls = b.d === 'W' ? 'bw' : b.d === '4' ? 'b4' : b.d === '6' || b.d.startsWith('Nb+6') ? 'b6' : '';
  return `<span class="ball-chip ${cls}">${esc(b.d)}</span>`;
}
function screenMatch() { renderMatch(); }
function renderMatch() {
  if (!room) return go('home');
  const st = matchState();
  const l = st.inn;
  const bats = l.batters;
  const striker = bats[l.striker] && !bats[l.striker].out ? bats[l.striker] : null;
  const ns = bats[l.nonStriker] && !bats[l.nonStriker].out ? bats[l.nonStriker] : null;
  const bw = l.currentBowler ? l.bowlers.find((b) => b.name === l.currentBowler) : null;

  let body = `<div class="card">
    <div class="mini-score">
      <div class="t">${esc(st.setup[l.batKey].name)} batting · inn ${st.inningsNo}/2</div>
      <div class="r">${l.runs}/${l.wickets} <span style="font-size:13px;color:var(--dim)">(${st.overs})</span></div>
      ${st.chase ? `<div class="chase">NEED ${st.chase.need} OFF ${st.chase.ballsLeft}</div>` : ''}
    </div>
    <div class="bats">
      ${striker ? `<span><b>${esc(striker.name)}*</b> ${striker.runs}(${striker.balls})</span>` : ''}
      ${ns ? `<span>${esc(ns.name)} ${ns.runs}(${ns.balls})</span>` : ''}
      ${bw ? `<span>🎳 ${esc(bw.name)} ${bw.wickets}/${bw.runs}</span>` : ''}
    </div>
    <div class="balls">${l.thisOver.map(chip).join('')}</div>
  </div>`;

  if (st.phase === 'live' && l.currentBowler === null) {
    body += `<div class="card" style="margin-top:12px"><div class="sec-t" style="margin-top:0">SELECT BOWLER</div>
      <div class="bowler-pick">${st.setup[l.bowlKey].players.map((n) =>
        `<button onclick="dispatch({type:'setBowler',name:'${esc(n).replace(/'/g, "\\'")}'})">🎳 ${esc(n)}</button>`).join('')}</div></div>`;
  } else if (st.phase === 'live') {
    body += `<div class="pad">
      <button onclick="ball(0)">0</button><button onclick="ball(1)">1</button>
      <button onclick="ball(2)">2</button><button onclick="ball(3)">3</button>
      <button class="b4" onclick="ball(4)">4</button><button class="b6" onclick="ball(6)">6</button>
      <button class="sm" onclick="dispatch({type:'ball',runs:0,extra:'wd'})">WIDE</button>
      <button class="sm" onclick="dispatch({type:'ball',runs:0,extra:'nb'})">NO BALL</button>
      <button class="bw" onclick="dispatch({type:'ball',runs:0,wicket:true})">WICKET</button>
      <button class="sm" onclick="ball(5)">5</button>
      <button class="sm" onclick="dispatch({type:'undo'})">↩ UNDO</button>
    </div>`;
  }
  if (st.phase === 'break') {
    body += `<div class="card" style="margin-top:12px"><div class="sec-t" style="margin-top:0">
      INNINGS OVER — ${esc(st.setup[st.innings[0].bowlKey].name).toUpperCase()} NEED ${st.innings[0].runs + 1}</div>
      <div class="bowler-pick">${st.setup[st.inn.done && st.innings.length === 1 ? st.innings[0].batKey : st.inn.bowlKey].players.map((n) =>
        `<button onclick="dispatch({type:'setBowler',name:'${esc(n).replace(/'/g, "\\'")}'})">🎳 ${esc(n)}</button>`).join('')}</div></div>`;
  }
  if (st.phase === 'result') { finishMatch(st); return; }

  render(`${head()}<div class="backrow" style="display:flex;gap:8px;justify-content:space-between">
    <button onclick="quitMatch()">◄ QUIT</button>
    <button onclick="openTV()">📺 TV MODE</button>
  </div>${body}`);
  mountMini();
  handleFx(st);
  broadcastTV(st);
}
function ball(r) { dispatch({ type: 'ball', runs: r }); }
function quitMatch() { if (confirm('Abandon this match? Nothing will be saved.')) { room = null; go('home'); } }
function handleFx(st) {
  const evs = room.events.filter((e) => e.type === 'ball');
  if (!evs.length) return;
  const lastSeq = evs[evs.length - 1].seq;
  if (lastSeq <= lastFxSeq) return;
  lastFxSeq = lastSeq;
  // derive what happened on the last ball
  const e = evs[evs.length - 1];
  if (e.wicket) { flash('fw', 'OUT!', ''); sfx.wicket(); }
  else if (e.runs === 4 && !e.extra) { flash('f4', 'FOUR!', ''); sfx.four(); }
  else if (e.runs === 6 && !e.extra) { flash('f6', 'SIX!', ''); sfx.six(); }
}

/* ---------- result & career update ---------- */
function finishMatch(st) {
  // credit career stats for the player whose name matches the profile
  const me = profile.name.toLowerCase();
  let batted = null, bowled = { balls: 0, runs: 0, wickets: 0 };
  for (const i of st.innings) {
    for (const b of i.batters) if (b.name.toLowerCase() === me && (b.balls || b.runs)) batted = b;
    for (const b of i.bowlers) if (b.name.toLowerCase() === me && b.balls) { bowled.balls += b.balls; bowled.runs += b.runs; bowled.wickets += b.wickets; }
  }
  const s = profile.stats;
  s.matches += 1;
  let xpGain = 10; // participation
  if (batted) {
    s.runs += batted.runs; s.ballsFaced += batted.balls; s.fours += batted.fours; s.sixes += batted.sixes;
    if (batted.out) s.outs += 1;
    if (batted.runs > s.hs) s.hs = batted.runs;
    if (batted.runs >= 50) s.best50 = true;
    if (batted.runs >= 100) s.best100 = true;
    xpGain += batted.runs;
  }
  if (bowled.balls) { s.wickets += bowled.wickets; s.ballsBowled += bowled.balls; s.runsConceded += bowled.runs; xpGain += bowled.wickets * 25; }
  const isMom = st.mom && st.mom.name.toLowerCase() === me;
  if (isMom) { s.mom += 1; xpGain += 30; }
  const beforeLvl = lvlOf(profile.xp);
  profile.xp += xpGain;
  const newBadges = checkBadges();
  const leveled = lvlOf(profile.xp) > beforeLvl;
  saveProfile();
  history.unshift({ date: Date.now(), a: st.setup.A.name, b: st.setup.B.name, result: st.result, mom: st.mom ? st.mom.name : null, my: batted ? `${batted.runs}(${batted.balls})` : '—' });
  history = history.slice(0, 50);
  DB.save('history', history);
  // aggregate EVERY player into the local leaderboard
  for (const i of st.innings) {
    for (const b of i.batters) {
      if (!b.balls && !b.runs && !b.out) continue;
      const p = players[b.name] || { matches: 0, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, mom: 0, hs: 0 };
      p.matches += 1; p.runs += b.runs; p.balls += b.balls; p.fours += b.fours; p.sixes += b.sixes;
      if (b.runs > p.hs) p.hs = b.runs;
      players[b.name] = p;
    }
    for (const b of i.bowlers) {
      if (!b.balls) continue;
      const p = players[b.name] || { matches: 0, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, mom: 0, hs: 0 };
      p.wickets += b.wickets;
      players[b.name] = p;
    }
  }
  if (st.mom && players[st.mom.name]) players[st.mom.name].mom += 1;
  DB.save('players', players);
  lastMatch = st;
  broadcastTV(st);
  room = null;
  if (leveled) sfx.levelup(); else sfx.ok();

  render(`${head()}
    <div class="card result-hero">
      <div class="r">🏆 ${esc(st.result)}</div>
      ${st.mom ? `<div class="mom">⭐ Player of the Match: ${esc(st.mom.name)} — ${esc(st.mom.summary)}</div>` : ''}
      <div class="xp-gain">+${xpGain} XP${leveled ? ` · LEVEL UP! LVL ${lvlOf(profile.xp)} 🎉` : ''}</div>
      ${newBadges.map((b) => `<div class="badge-pop"><div style="font-size:26px">${b.i}</div><div class="b">BADGE UNLOCKED: ${b.t}</div></div>`).join('')}
    </div>
    <div class="menu">
      <button class="gold" onclick="shareScorecard()">📤 SHARE SCORECARD</button>
      <button class="primary" onclick="go('setup')">🔁 PLAY AGAIN</button>
      <button onclick="go('stats')">📊 SEE CAREER</button>
      <button onclick="go('home')">🏠 HOME</button>
    </div>${FOOT}`);
  mountMini();
  if (isMom) setTimeout(() => flash('fm', '⭐ M.O.M!', `${profile.name} — take a bow`), 400);
}

/* ---------- stats ---------- */
function screenStats() {
  const s = profile.stats;
  const avg = s.outs ? (s.runs / s.outs).toFixed(1) : s.runs ? '∞' : '0';
  const sr = s.ballsFaced ? Math.round((s.runs / s.ballsFaced) * 100) : 0;
  const eco = s.ballsBowled ? (s.runsConceded / (s.ballsBowled / 6)).toFixed(1) : '—';
  render(`${head()}<div class="backrow"><button onclick="go('home')">◄ BACK</button></div>
    <div class="card player-card" style="padding:16px">
      <canvas id="stAv"></canvas>
      <div class="pc-name">${esc(profile.name).toUpperCase()}</div>
      <div class="pc-title">« ${esc(avatarConfig(profile.avatarSeed).title)} » · LVL ${lvlOf(profile.xp)} · ${profile.xp} XP</div>
    </div>
    <div class="sec-t">BATTING</div>
    <div class="card" style="padding:8px 14px"><table class="stats">
      <tr><td>Matches</td><td>${s.matches}</td></tr>
      <tr><td>Runs</td><td>${s.runs}</td></tr>
      <tr><td>High score</td><td>${s.hs}</td></tr>
      <tr><td>Average</td><td>${avg}</td></tr>
      <tr><td>Strike rate</td><td>${sr}</td></tr>
      <tr><td>Fours / Sixes</td><td>${s.fours} / ${s.sixes}</td></tr>
    </table></div>
    <div class="sec-t">BOWLING</div>
    <div class="card" style="padding:8px 14px"><table class="stats">
      <tr><td>Wickets</td><td>${s.wickets}</td></tr>
      <tr><td>Overs bowled</td><td>${Math.floor(s.ballsBowled / 6)}.${s.ballsBowled % 6}</td></tr>
      <tr><td>Economy</td><td>${eco}</td></tr>
      <tr><td>Player of the Match</td><td>${s.mom}×</td></tr>
    </table></div>
    <div class="sec-t">BADGES</div>
    <div class="badges">${BADGES.map((b) => `<div class="bdg ${profile.badges.includes(b.id) ? 'won' : ''}">
      <div class="i">${b.i}</div><div class="t">${b.t}</div></div>`).join('')}</div>
    <div class="sec-t">MATCH HISTORY</div>
    <div class="history">${history.length ? history.map((h) =>
      `<div class="hist"><div>${esc(h.a)} vs ${esc(h.b)}<br><span class="dim" style="font-size:14px">you: ${esc(h.my)}${h.mom ? ' · MoM: ' + esc(h.mom) : ''}</span></div>
       <div class="res">${esc(h.result)}</div></div>`).join('')
      : '<p class="dim">No matches yet — play your first!</p>'}</div>
    ${FOOT}`);
  drawAvatar($('stAv'), profile.avatarSeed, 5);
  mountMini();
}

/* ---------- leaderboard ---------- */
function screenLeaders() {
  const rows = Object.entries(players).map(([name, p]) => ({ name, ...p }));
  const bat = [...rows].sort((a, b) => b.runs - a.runs).slice(0, 10);
  const bowl = [...rows].filter((r) => r.wickets).sort((a, b) => b.wickets - a.wickets).slice(0, 10);
  const medal = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`);
  const me = profile.name.toLowerCase();
  const row = (r, i, val) => `<div class="hist" ${r.name.toLowerCase() === me ? 'style="border-color:var(--green)"' : ''}>
      <div>${medal(i)} <b>${esc(r.name)}</b><br><span class="dim" style="font-size:14px">${r.matches} match${r.matches === 1 ? '' : 'es'}${r.mom ? ' · ' + r.mom + '× MoM' : ''}</span></div>
      <div class="res">${val}</div></div>`;
  render(`${head()}<div class="backrow"><button onclick="go('home')">◄ BACK</button></div>
    <div class="sec-t">🏏 MOST RUNS</div>
    <div class="history">${bat.length ? bat.map((r, i) => row(r, i, `${r.runs} RUNS`)).join('') : '<p class="dim">Play matches to build the leaderboard — every player who ever plays with you gets ranked.</p>'}</div>
    <div class="sec-t">🎯 MOST WICKETS</div>
    <div class="history">${bowl.length ? bowl.map((r, i) => row(r, i, `${r.wickets} WKTS`)).join('') : '<p class="dim">No wickets recorded yet.</p>'}</div>
    ${FOOT}`);
  mountMini();
}

/* ---------- share scorecard as image ---------- */
async function shareScorecard() {
  const st = lastMatch;
  if (!st) { toast('No finished match to share yet'); return; }
  try { await document.fonts.ready; } catch (e) {}
  const W = 800, pad = 46;
  const lines1 = scLines(st, 0), lines2 = st.innings[1] ? scLines(st, 1) : [];
  const H = 300 + (lines1.length + lines2.length) * 34 + (st.innings[1] ? 70 : 0) + 130;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  // scanlines
  x.fillStyle = 'rgba(255,255,255,0.03)';
  for (let y = 0; y < H; y += 4) x.fillRect(0, y, W, 1);
  x.textBaseline = 'top';
  x.fillStyle = '#f2f2f2'; x.font = "26px 'Press Start 2P'";
  x.fillText('CRIC', pad, pad);
  x.fillStyle = '#39ff14'; x.fillText('ADDA', pad + 118, pad);
  x.fillStyle = '#9aa0a6'; x.font = "20px 'VT323'";
  x.fillText(new Date().toLocaleDateString(), W - pad - 110, pad + 8);
  x.fillStyle = '#ffe600'; x.font = "16px 'Press Start 2P'";
  wrapText(x, '🏆 ' + st.result, pad, pad + 60, W - pad * 2, 30);
  let y = pad + 120;
  if (st.mom) { x.fillStyle = '#00e5ff'; x.font = "12px 'Press Start 2P'"; x.fillText(`★ PLAYER OF THE MATCH: ${st.mom.name.toUpperCase()} — ${st.mom.summary}`, pad, y); y += 44; }
  y = drawInnings(x, st, 0, pad, y, W); if (st.innings[1]) y = drawInnings(x, st, 1, pad, y + 26, W);
  x.fillStyle = '#9aa0a6'; x.font = "11px 'Press Start 2P'";
  x.fillText('every ball logged · zero disputes', pad, H - 74);
  x.fillText('a made. product', W - pad - 200, H - 74);
  cv.toBlob(async (blob) => {
    const file = new File([blob], 'cricadda-scorecard.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'CricAdda scorecard' }); return; } catch (e) {}
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'cricadda-scorecard.png'; a.click();
    toast('Scorecard image downloaded 📥');
  });
}
function scLines(st, i) {
  const inn = st.innings[i];
  return [...inn.batters.filter((b) => b.balls || b.runs || b.out), ...inn.bowlers.filter((b) => b.balls)];
}
function drawInnings(x, st, i, pad, y, W) {
  const inn = st.innings[i];
  x.fillStyle = '#39ff14'; x.font = "13px 'Press Start 2P'";
  x.fillText(`${st.setup[inn.batKey].name.toUpperCase()} — ${inn.runs}/${inn.wickets}`, pad, y); y += 36;
  x.font = "22px 'VT323'";
  for (const b of inn.batters.filter((b) => b.balls || b.runs || b.out)) {
    x.fillStyle = '#f2f2f2'; x.fillText(b.name + (b.out ? ' †' : ''), pad, y);
    x.fillStyle = '#ffe600'; x.fillText(`${b.runs} (${b.balls})`, W - pad - 120, y); y += 34;
  }
  for (const b of inn.bowlers.filter((b) => b.balls)) {
    x.fillStyle = '#9aa0a6'; x.fillText('🎳 ' + b.name, pad, y);
    x.fillStyle = '#00e5ff'; x.fillText(`${b.wickets}/${b.runs}`, W - pad - 120, y); y += 34;
  }
  return y;
}
function wrapText(x, text, px, py, maxW, lh) {
  const words = text.split(' ');
  let line = '', y = py;
  for (const w of words) {
    if (x.measureText(line + w).width > maxW && line) { x.fillText(line, px, y); line = w + ' '; y += lh; }
    else line += w + ' ';
  }
  x.fillText(line.trim(), px, y);
}

/* ---------- bookings ---------- */
let bkTurf = 0, bkDate = null;
function dateKey(d) { return d.toISOString().slice(0, 10); }
function screenBook() {
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
  if (!bkDate) bkDate = dateKey(days[0]);
  const slots = [...Array(18)].map((_, i) => `${String(6 + i).padStart(2, '0')}:00`);
  const taken = new Set(bookings.filter((b) => b.turf === turfs[bkTurf] && b.date === bkDate).map((b) => b.slot));
  const mine = bookings.filter((b) => b.phone === profile.phone).sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot));
  const dayLbl = (d) => ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()] + ' ' + d.getDate();
  render(`${head()}<div class="backrow"><button onclick="go('home')">◄ BACK</button></div>
    <div class="card">
      <div class="sec-t" style="margin-top:0">BOOK A TURF SLOT</div>
      <label>Turf</label>
      <select id="bkTurf" onchange="bkSetTurf()">${turfs.map((t, i) => `<option value="${i}" ${i === bkTurf ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <div style="display:flex;gap:8px;margin-top:8px">
        <input id="newTurf" placeholder="add your own turf name…">
        <button style="font-size:9px;padding:12px" onclick="addTurf()">＋ ADD</button>
      </div>
      <label>Day</label>
      <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px">
        ${days.map((d) => `<button style="font-size:8px;padding:12px 10px;white-space:nowrap;${dateKey(d) === bkDate ? 'background:var(--green);border-color:var(--green);color:#041a00' : ''}"
          onclick="bkSetDate('${dateKey(d)}')">${dayLbl(d)}</button>`).join('')}
      </div>
      <label>Slot (1 hour)</label>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        ${slots.map((sl) => taken.has(sl)
          ? `<button disabled style="opacity:0.35;font-size:9px;padding:12px 4px">${sl}<br>BOOKED</button>`
          : `<button style="font-size:10px;padding:14px 4px" onclick="bookSlot('${sl}')">${sl}</button>`).join('')}
      </div>
    </div>
    <div class="sec-t">MY BOOKINGS</div>
    <div class="history">${mine.length ? mine.map((b) => `
      <div class="hist"><div><b>${esc(b.turf)}</b><br><span class="dim" style="font-size:14px">${b.date} · ${b.slot} · code ${b.id}</span></div>
        <button class="danger" style="font-size:8px;padding:8px" onclick="cancelBooking('${b.id}')">✕</button></div>`).join('')
      : '<p class="dim">No bookings yet. Grab a slot — the screen greets your squad by name when you arrive.</p>'}</div>
    <p class="dim" style="margin-top:14px;font-size:16px">Demo build: bookings live on this device.
    The launch backend adds real availability + UPI payment at this exact screen.</p>
    ${FOOT}`);
  mountMini();
}
function bkSetTurf() { bkTurf = +$('bkTurf').value; screenBook(); }
function bkSetDate(d) { bkDate = d; sfx.tap(); screenBook(); }
function addTurf() {
  const v = $('newTurf').value.trim();
  if (!v) return;
  turfs.push(v); DB.save('turfs', turfs);
  bkTurf = turfs.length - 1; sfx.ok(); screenBook();
}
function bookSlot(slot) {
  const id = 'BK' + String((Math.random() * 9000 + 1000) | 0);
  bookings.push({ id, phone: profile.phone, turf: turfs[bkTurf], date: bkDate, slot, at: Date.now() });
  DB.save('bookings', bookings);
  sfx.levelup();
  flash('fm', '📅 BOOKED!', `${turfs[bkTurf]} · ${bkDate} · ${slot} · code ${id}`);
  screenBook();
}
function cancelBooking(id) {
  if (!confirm('Cancel this booking?')) return;
  bookings = bookings.filter((b) => b.id !== id);
  DB.save('bookings', bookings);
  screenBook();
}

/* ---------- settings ---------- */
function screenSettings() {
  render(`${head()}<div class="backrow"><button onclick="go('home')">◄ BACK</button></div>
    <div class="card" style="text-align:center">
      <div class="sec-t" style="margin-top:0">YOUR PLAYER</div>
      <div class="av-stage">
        <button class="arrow" onclick="setAv(-1)">◄</button>
        <div class="av-frame"><canvas id="setAvC"></canvas></div>
        <button class="arrow" onclick="setAv(1)">►</button>
      </div>
      <div class="av-name">« ${esc(avatarConfig(profile.avatarSeed).title)} »</div>
      <label style="text-align:left">Display name</label>
      <input id="setName" maxlength="20" value="${esc(profile.name)}" style="text-align:center;font-size:22px">
      <button class="primary wide" style="margin-top:14px" onclick="saveSettings()">SAVE CHANGES</button>
      <p class="dim" style="font-size:15px;margin-top:10px">Career stats follow your name in match scoring — keep it consistent.</p>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="sec-t" style="margin-top:0">GAME</div>
      <button class="wide" onclick="toggleSound()">${settings.sound ? '🔊 SOUND: ON' : '🔇 SOUND: OFF'}</button>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="sec-t" style="margin-top:0">ACCOUNT</div>
      <p class="dim" style="font-size:16px;margin-bottom:12px">📞 ${esc(profile.phone)} — your career is saved to this number. Sign out anytime; signing back in restores everything.</p>
      <button class="danger wide" onclick="signOut()">SIGN OUT</button>
    </div>${FOOT}`);
  drawAvatar($('setAvC'), profile.avatarSeed, 7);
  mountMini();
}
function setAv(d) { profile.avatarSeed = (profile.avatarSeed + d + 1e9) % 1e9; sfx.tap(); drawAvatar($('setAvC'), profile.avatarSeed, 7); }
function saveSettings() {
  const n = $('setName').value.trim();
  if (n) profile.name = n;
  saveProfile(); sfx.ok(); toast('Saved ✓'); go('home');
}
function toggleSound() { settings.sound = !settings.sound; DB.save('settings', settings); sfx.ok(); screenSettings(); }
function signOut() {
  if (!confirm('Sign out? Your career stays saved to your phone number.')) return;
  saveProfile();
  profile = null; DB.save('profile', null);
  go('boot');
}

/* ---------- PWA: the website IS the app ---------- */
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); installPrompt = e;
  const b = $('installBtn'); if (b) b.style.display = 'flex';
});
async function installApp() {
  if (!installPrompt) { toast('Open in Chrome and use “Add to Home screen”'); return; }
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  const b = $('installBtn'); if (b) b.style.display = 'none';
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ---------------- router ---------------- */
const SCREENS = { boot: screenBoot, ob1: screenOb1, ob2: screenOb2, ob3: screenOb3, ob4: screenOb4, home: screenHome, teams: screenTeams, setup: screenSetup, match: screenMatch, stats: screenStats, pair: screenPair, leaders: screenLeaders, book: screenBook, settings: screenSettings };
function go(name) {
  if (!profile && !['boot', 'ob1', 'ob2', 'ob3', 'ob4'].includes(name)) name = 'boot';
  (SCREENS[name] || screenBoot)();
  window.scrollTo(0, 0);
}
// expose for inline handlers
Object.assign(window, { go, obSendOtp, obVerify, otpKey, obCycle, obRandom, obFinish, obCreate, addTeam, delTeam, fillTeam, startMatch, ball, dispatch, quitMatch, openTV, shareScorecard, installApp, bkSetTurf, bkSetDate, addTurf, bookSlot, cancelBooking, setAv, saveSettings, toggleSound, signOut });

go(profile ? 'home' : 'boot');
