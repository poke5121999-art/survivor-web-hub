// The one switch between offline bots and the online service (js/net/online.js, owned by the net layer).
// Quick play goes online only once Online.available() answered true (asked once at boot, in the background);
// missing module, no answer or ?offline=1: the original offline match vs bots, and the private battle screens
// show an offline state.
const FORCE_OFFLINE = new URLSearchParams(location.search).get('offline') === '1';

export class Net {
  constructor(app) {
    this.app = app;
    this.Online = null;
    this.state = 'checking';
    // only when the stamped import map lists the module: a missing file must not cost a 404 on every page load
    const map = document.querySelector('script[type=importmap]');
    const listed = !map || map.textContent.includes('./js/net/online.js');
    this.ready = (listed && !FORCE_OFFLINE ? import('../net/online.js') : Promise.reject(new Error(FORCE_OFFLINE ? 'offline=1' : 'js/net/online.js not deployed')))
      .then(async (m) => {
        this.Online = m.Online || null;
        const a = this.Online ? await Promise.resolve(this.Online.available()).catch(() => false) : false;
        this.state = a ? 'online' : 'offline';
        return a;
      })
      .catch((e) => { this.error = String(e && e.message || e); this.state = 'offline'; return false; });
  }

  available() { return this.state === 'online'; }

  quickMatch(request) { return this.Online.quickMatch({ profile: this.app.profile, request }); }
  createPrivate(config) { return this.Online.createPrivate({ profile: this.app.profile, config }); }
  joinPrivate(code) { return this.Online.joinPrivate({ profile: this.app.profile, code }); }
}
