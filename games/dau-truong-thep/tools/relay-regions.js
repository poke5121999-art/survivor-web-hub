// Which Unity Relay region does a room land in, and how far is each one from this machine?
// For every region: allocate, open the relay WebSocket, and time BIND -> BIND_RECEIVED (one round trip to the relay).
// The first row is what `allocate` picks when no region is asked for.
//   node tools/relay-regions.js
'use strict';
const { session, open } = require('./lib.js');

session(async (br, base) => {
  const g = await open(br, base, 'noaudio&q=low');
  const rows = await g.page.evaluate(async () => {
    const { Ugs } = await import('./js/net/ugs.js');
    const { RelayLink } = await import('./js/net/relay.js');
    const ugs = await new Ugs({ keepSession: false }).signIn();
    const regions = await ugs.regions();
    const rtt = async (region) => {
      const alloc = await ugs.allocate(1, region);
      let sentAt = 0, gotAt = 0;
      class Timed extends WebSocket {
        constructor(u) { super(u); this.addEventListener('message', () => { if (!gotAt) gotAt = performance.now(); }); }
        send(d) { if (!sentAt) sentAt = performance.now(); super.send(d); }
      }
      const link = await new RelayLink(alloc, { role: 'host', WebSocketImpl: Timed }).open();
      link.close();
      return { region: alloc.region, ms: Math.round(gotAt - sentAt) };
    };
    const out = [];
    try { out.push({ asked: '(none)', ...(await rtt(undefined)) }); } catch (e) { out.push({ asked: '(none)', error: String(e.message || e) }); }
    for (const r of regions) {
      try { const a = await rtt(r.id), b = await rtt(r.id); out.push({ asked: r.id, region: a.region, ms: Math.min(a.ms, b.ms), desc: r.description }); } catch (e) { out.push({ asked: r.id, error: String(e.message || e).slice(0, 120) }); }
    }
    return out;
  });
  for (const r of rows) console.log(String(r.asked).padEnd(26), r.error ? 'ERROR ' + r.error : `-> ${String(r.region).padEnd(24)} ${String(r.ms).padStart(4)} ms  ${r.desc || ''}`);
  await g.close();
});
