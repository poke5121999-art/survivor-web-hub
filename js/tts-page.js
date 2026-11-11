// Trang nghe thử giọng đọc chat (tts.html). Mã tổng hợp là tts-core.js, bản sinh đôi của TtsEngine.cs trong game
// (repo-client Tools/tts/tts-core.js, cùng bảng data/tts/rsynth_tables.json = Assets/Resources/Tts/rsynth_tables.json),
// nên tiếng ở đây đúng từng mẫu với tiếng trong game (TtsTests.MatchesJsGolden giữ hai bản khớp nhau).
import { createTts, DEFAULT_RULES, voiceForId, toWav, clampText } from './tts-core.js';

const RATE = 16000;          // Tts.SAMPLE_RATE trong game
const MASTER = 0.8;          // TtsPlayer.MASTER (như SfxSamples)
const LINES = ['Over here!', "Help, I'm down!", "Grab the vase, it's worth a lot", 'Watch out, trap!', "Let's go back to the truck", 'Nice one!'];
const QS = new URLSearchParams(location.search);
const API = QS.get('api') || (((window.SUPABASE_CONFIG || {}).url || '').replace(/\/+$/, '') + '/functions/v1/gs-design');

const $ = (id) => document.getElementById(id);
const el = {
  text: $('tts-text'), count: $('tts-count'), chips: $('tts-chips'), id: $('tts-id'), idHelp: $('tts-id-help'),
  pitch: $('tts-pitch'), speed: $('tts-speed'), flutter: $('tts-flutter'), bright: $('tts-bright'), vol: $('tts-vol'),
  useTable: $('tts-use-table'), src: $('tts-src'), play: $('tts-play'), wav: $('tts-wav'), stat: $('tts-stat'), banner: $('tts-banner'),
};

let tts = null;
let tableRules = null;     // stage_rules.tts trên DEV (null = chưa đọc được)
let tableNote = '';
let pcm = null, buffer = null, ctx = null, playing = null, lastMs = 0;
// cho kiểm tự động (trình duyệt headless): trạng thái buffer hiện tại
window.__tts = { ready: false };

function rules() { return Object.assign({}, DEFAULT_RULES, el.useTable.checked && tableRules ? tableRules : {}); }
function mode() { return document.querySelector('input[name=tts-mode]:checked').value; }
function fmt(x, d) { return Number(x).toFixed(d); }

function showOutputs() {
  $('tts-pitch-o').textContent = fmt(el.pitch.value, 1) + ' Hz';
  $('tts-speed-o').textContent = fmt(el.speed.value, 2) + '×';
  $('tts-flutter-o').textContent = fmt(el.flutter.value, 0);
  $('tts-bright-o').textContent = fmt(el.bright.value, 2);
  $('tts-vol-o').textContent = Math.round(el.vol.value * 100) + '%';
}

// Người chơi / bot: giọng băm từ id y như TtsVoice.ForId; thanh kéo hiện số đó. Kéo tay thì chuyển sang "Chỉnh tay".
function voiceFromId() {
  const m = mode();
  el.id.hidden = m === 'manual';
  el.idHelp.hidden = m === 'manual';
  if (m === 'manual') return;
  const v = voiceForId(el.id.value, rules(), m === 'bot');
  el.pitch.value = v.pitchHz; el.speed.value = v.speed; el.flutter.value = v.flutter; el.bright.value = v.brightness;
}

function currentVoice() {
  if (mode() !== 'manual') return voiceForId(el.id.value, rules(), mode() === 'bot');
  return { pitchHz: +el.pitch.value, speed: +el.speed.value, flutter: +el.flutter.value, brightness: +el.bright.value };
}

function updateCount() {
  const max = rules().maxChars;
  el.text.maxLength = max;
  if (el.text.value.length > max) el.text.value = clampText(el.text.value, max);
  el.count.textContent = el.text.value.length + '/' + max;
  el.count.classList.toggle('is-full', el.text.value.length >= max);
}

// Dựng sẵn buffer mỗi lần đổi chữ / giọng, để bấm ▶ là kêu ngay.
let pending = 0;
function rebuild() {
  clearTimeout(pending);
  pending = setTimeout(build, 120);
}
function build() {
  if (!tts) return;
  updateCount();
  const r = rules();
  const t0 = performance.now();
  pcm = tts.synthesize(el.text.value, currentVoice(), RATE, r.maxChars);
  lastMs = performance.now() - t0;
  buffer = null;
  if (ctx && pcm.length) { buffer = ctx.createBuffer(1, pcm.length, RATE); buffer.copyToChannel(pcm, 0); }
  let s2 = 0, pk = 0;
  for (let i = 0; i < pcm.length; i++) { s2 += pcm[i] * pcm[i]; const a = Math.abs(pcm[i]); if (a > pk) pk = a; }
  const rms = pcm.length ? Math.sqrt(s2 / pcm.length) : 0;
  el.play.disabled = el.wav.disabled = pcm.length === 0;
  el.stat.textContent = pcm.length
    ? 'Tổng hợp ' + fmt(lastMs, 1) + ' ms · ' + fmt(pcm.length / RATE, 2) + ' s tiếng · ' + RATE + ' Hz'
    : 'Không có chữ đọc được.';
  window.__tts = { ready: true, samples: pcm.length, rms, peak: pk, ms: lastMs, buffer: !!buffer };
}

function ensureCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { el.stat.textContent = 'Trình duyệt không hỗ trợ Web Audio.'; return false; }
  if (!ctx) { ctx = new AC(); build(); }
  if (!buffer) build();
  if (ctx.state === 'suspended') ctx.resume();
  return true;
}

function play() {
  if (!ensureCtx() || !buffer) return;
  if (playing) { try { playing.stop(); } catch (e) { /* đã dừng */ } }
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buffer;
  g.gain.value = +el.vol.value * MASTER;   // như game: tts.vol × MASTER (mức người chơi 100%)
  src.connect(g); g.connect(ctx.destination);
  src.start();
  playing = src;
  window.__tts.played = (window.__tts.played || 0) + 1;
  src.onended = () => { if (playing === src) playing = null; };
}

function downloadWav() {
  if (!pcm || !pcm.length) return;
  const k = +el.vol.value * MASTER;
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] * k;
  const blob = new Blob([toWav(out, RATE)], { type: 'audio/wav' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tts-' + el.text.value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40).toLowerCase() + '.wav';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function showSource() {
  const r = rules();
  let s = el.useTable.checked ? (tableRules ? 'Số của bảng DEV' : 'Chưa có số của bảng (' + tableNote + '), đang dùng số gốc trong game') : 'Số gốc trong game';
  s += ': người chơi ' + r.pitchMin + '–' + r.pitchMax + ' Hz, bot ' + r.botPitchMin + '–' + r.botPitchMax + ' Hz, tốc độ ' + r.speed +
    ', tối đa ' + r.maxChars + ' chữ, cách ' + r.gapSec + ' s mỗi người, độ to ' + Math.round(r.vol * 100) + '%.';
  el.src.textContent = s;
  if (el.useTable.checked && tableRules && tableRules.on === 0) {
    const w = document.createElement('strong'); w.className = 'tts-warn'; w.textContent = ' Bảng đang TẮT giọng đọc chat cho mọi người (tts.on = 0).';
    el.src.appendChild(w);
  }
}

function applyRules() {
  el.vol.value = rules().vol;
  voiceFromId(); showOutputs(); showSource(); rebuild();
}

// stage_rules.tts trên DEV, qua proxy gs-design như design.html (cần đăng nhập thành viên hub; không có thì dùng số gốc).
async function loadTable() {
  try {
    const s = window.HubSession && window.HubSession.get();
    const c = window.SUPABASE_CONFIG || {};
    if (!QS.get('api') && !(c.url && s && s.kind === 'member')) { tableNote = 'chưa đăng nhập hub'; return; }
    if (window.HubSession && window.HubSession.isExpired() && window.HubAuth) {
      const r = await window.HubAuth.refresh(s); if (r && r.ok) window.HubSession.set(r.session);
    }
    const s2 = window.HubSession && window.HubSession.get();
    const h = { 'Content-Type': 'application/json' };
    if (c.anonKey) h.apikey = c.anonKey;
    if (s2 && s2.accessToken) h.Authorization = 'Bearer ' + s2.accessToken;
    const res = await fetch(API, { method: 'POST', headers: h, body: JSON.stringify({ action: 'get', table: 'stage_rules' }) });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.ok === false) { tableNote = 'gs-design trả ' + ((j && j.error && j.error.code) || ('HTTP ' + res.status)); return; }
    const doc = (j.docs || [])[0] || {};
    if (!doc.tts || typeof doc.tts !== 'object') { tableNote = 'bảng chưa có nhóm tts'; return; }
    const t = {};
    for (const k of Object.keys(DEFAULT_RULES)) if (typeof doc.tts[k] === 'number') t[k] = doc.tts[k];
    tableRules = t;
  } catch (e) {
    tableNote = 'không kết nối được (' + (e && e.message || e) + ')';
  }
}

async function main() {
  LINES.forEach((line) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn--ghost btn--sm'; b.textContent = line;
    b.addEventListener('click', () => { el.text.value = line; rebuild(); });
    el.chips.appendChild(b);
  });
  try {
    const res = await fetch('data/tts/rsynth_tables.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    tts = createTts(await res.json());
  } catch (e) {
    el.banner.hidden = false;
    el.banner.textContent = 'Không tải được bảng âm data/tts/rsynth_tables.json (' + (e && e.message || e) + ').';
    return;
  }
  el.text.addEventListener('input', rebuild);
  el.id.addEventListener('input', () => { voiceFromId(); showOutputs(); rebuild(); });
  document.querySelectorAll('input[name=tts-mode]').forEach((r) => r.addEventListener('change', () => { voiceFromId(); showOutputs(); rebuild(); }));
  [el.pitch, el.speed, el.flutter, el.bright].forEach((s) => s.addEventListener('input', () => {
    const manual = document.querySelector('input[name=tts-mode][value=manual]');
    if (!manual.checked) { manual.checked = true; el.id.hidden = el.idHelp.hidden = true; }
    showOutputs(); rebuild();
  }));
  el.vol.addEventListener('input', showOutputs);
  el.useTable.addEventListener('change', applyRules);
  el.play.addEventListener('click', play);
  el.wav.addEventListener('click', downloadWav);
  // Bàn phím: Ctrl/Cmd + Enter trong ô chữ là phát.
  el.text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); build(); play(); } });
  // AudioContext dựng sẵn (trạng thái suspended tới cú bấm đầu) để buffer có trước khi bấm ▶.
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) { try { ctx = new AC(); } catch (e) { ctx = null; } }
  applyRules();
  build();
  await loadTable();
  applyRules();
}

main();
