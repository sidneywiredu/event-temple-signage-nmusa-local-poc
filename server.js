const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const root = __dirname;
const publicDir = path.join(root, 'public');
loadEnv(path.join(root, '.env'));

const PORT = Number(process.env.PORT || 3000);
const USE_MOCK_DATA = String(process.env.USE_MOCK_DATA || 'true').toLowerCase() !== 'false';
const API_BASE = process.env.EVENT_TEMPLE_API_BASE || 'https://api.eventtemple.com';

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

function json(res, code, value) {
  const body = JSON.stringify(value);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateAt(base, h, m) {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

function mockEvents(dateStr) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const requested = new Date(`${dateStr}T00:00:00`);
  const delta = Math.round((requested - today) / 86400000);
  const rows = delta === 1 ? [
    ['Morning Command Brief', 'Conference Room 307', '307', 14, 8, 30, 9, 15],
    ['Public Affairs Planning Session', 'Conference Room 101', '101', 11, 10, 0, 11, 0],
    ['Programs & Education Workshop', 'Conference Room 203', '203', 22, 13, 30, 15, 0],
    ['Operations Coordination', 'Conference Room 101', '101', 9, 15, 30, 16, 15]
  ] : [
    ['IT Operations Meeting', 'Conference Room 101', '101', 12, 9, 0, 10, 0],
    ['Education Programs Planning', 'Conference Room 203', '203', 24, 10, 30, 12, 0],
    ['Exhibits Coordination Meeting', 'Conference Room 101', '101', 16, 12, 0, 13, 0],
    ['Leadership Sync Meeting', 'Conference Room 307', '307', 18, 14, 0, 15, 0],
    ['Visitor Services Coordination Meeting', 'Conference Room 307', '307', 10, 15, 0, 16, 0],
    ['Facilities Project Review', 'Conference Room 203', '203', 8, 16, 0, 17, 0]
  ];
  return rows.map((r, i) => ({
    id: `mock-${dateStr}-${i + 1}`,
    name: r[0], room: r[1], roomId: r[2], attendees: r[3],
    startAt: dateAt(requested, r[4], r[5]).toISOString(),
    endAt: dateAt(requested, r[6], r[7]).toISOString()
  }));
}

function pick(obj, keys, fallback = null) {
  for (const key of keys) {
    if (obj && obj[key] != null && obj[key] !== '') return obj[key];
  }
  return fallback;
}

function normalizeEventTemplePayload(payload) {
  const included = new Map();
  for (const item of payload.included || []) included.set(`${item.type}:${item.id}`, item);
  const rows = [];
  for (const item of payload.data || []) {
    const a = item.attributes || {};
    const rel = item.relationships || {};
    const spaceRel = rel.space?.data || rel.spaces?.data?.[0] || null;
    const spaceItem = spaceRel ? included.get(`${spaceRel.type}:${spaceRel.id}`) : null;
    const sa = spaceItem?.attributes || {};
    const startRaw = pick(a, ['start_at','start_time','starts_at','start_datetime','start_date_time']);
    const endRaw = pick(a, ['end_at','end_time','ends_at','end_datetime','end_date_time']);
    if (!startRaw || !endRaw) continue;
    rows.push({
      id: String(item.id),
      name: pick(a, ['name','title','event_name'], 'Untitled Event'),
      room: pick(sa, ['name','title'], pick(a, ['space_name','location'], 'Conference Room')),
      roomId: spaceRel?.id ? String(spaceRel.id) : String(pick(a, ['space_id'], '')),
      attendees: Number(pick(a, ['attendees','attendee_count','guest_count','expected_attendance','people_count'], 0)) || 0,
      startAt: new Date(startRaw).toISOString(),
      endAt: new Date(endRaw).toISOString()
    });
  }
  return rows.sort((a,b) => new Date(a.startAt) - new Date(b.startAt));
}

async function getEventTempleEvents(dateStr, room) {
  const key = process.env.EVENT_TEMPLE_API_KEY;
  const org = process.env.EVENT_TEMPLE_ORG_ID;
  if (!key || !org) throw new Error('Missing EVENT_TEMPLE_API_KEY or EVENT_TEMPLE_ORG_ID in .env');
  const u = new URL('/v2/events', API_BASE);
  u.searchParams.set('filter[start_date][eq]', dateStr);
  u.searchParams.set('include', 'space,event_type');
  if (room) u.searchParams.set('filter[space_id][eq]', room);
  const r = await fetch(u, {
    headers: {
      'X-API-KEY': key,
      'X-API-ORG': org,
      'Accept': 'application/vnd.api+json'
    }
  });
  if (!r.ok) throw new Error(`Event Temple request failed: ${r.status} ${await r.text()}`);
  return normalizeEventTemplePayload(await r.json());
}

function serveStatic(reqPath, res) {
  let relative = reqPath === '/' ? '/index.html' : reqPath;
  try { relative = decodeURIComponent(relative); } catch {}
  const file = path.normalize(path.join(publicDir, relative));
  if (!file.startsWith(publicDir)) return false;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
  res.writeHead(200, {'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600'});
  fs.createReadStream(file).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (u.pathname === '/api/health') return json(res, 200, {ok:true, mode: USE_MOCK_DATA ? 'mock' : 'event-temple'});
  if (u.pathname === '/api/events') {
    const date = u.searchParams.get('date') || localDateString();
    const room = u.searchParams.get('room') || '';
    try {
      let events = USE_MOCK_DATA ? mockEvents(date) : await getEventTempleEvents(date, room);
      if (room && USE_MOCK_DATA) events = events.filter(e => e.roomId === room);
      return json(res, 200, {mode: USE_MOCK_DATA ? 'mock' : 'event-temple', date, events});
    } catch (err) {
      console.error(err);
      return json(res, 502, {error: err.message});
    }
  }
  if (!serveStatic(u.pathname, res)) {
    res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`NMUSA Event Temple Signage POC running at http://localhost:${PORT}`);
  console.log(`Data mode: ${USE_MOCK_DATA ? 'MOCK' : 'EVENT TEMPLE'}`);
});
