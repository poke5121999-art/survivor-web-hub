// Small feedback that makes actions land: coins flying into the counter, a flash in the hero's colour on a skill,
// a bigger one with a ring sweep on an ultimate, an edge pulse when the ultimate is ready, a pop on a bought upgrade.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;
  BZ.makePolish = (G) => {
    const layer = document.createElement('div'); layer.id = 'flyfx'; document.body.appendChild(layer);
    const cast = document.createElement('div'); cast.id = 'castfx'; document.body.appendChild(cast);
    const css = (c) => '#' + c.toString(16).padStart(6, '0');
    const v = new THREE.Vector3();
    const coinsEl = () => document.getElementById('coins');
    let flying = 0;

    // coins: one to five little coins jump from the body and arc into the counter
    function coinFly(world, n) {
      const box = coinsEl(); if (!box || flying > 24) return;
      v.copy(world).project(G.camera); if (v.z > 1) return;
      const sx = (v.x * 0.5 + 0.5) * innerWidth; const sy = (-v.y * 0.5 + 0.5) * innerHeight;
      const r = box.getBoundingClientRect(); const tx = r.left + 22; const ty = r.top + r.height / 2;
      for (let i = 0; i < n; i++) {
        const c = document.createElement('i'); c.className = 'flycoin'; layer.appendChild(c); flying++;
        const jx = (Math.random() - 0.5) * 60; const jy = -30 - Math.random() * 40; const dur = 520 + i * 70 + Math.random() * 120;
        c.animate([
          { transform: `translate(${sx}px, ${sy}px) scale(.6)`, opacity: 0 },
          { transform: `translate(${sx + jx}px, ${sy + jy}px) scale(1.15)`, opacity: 1, offset: 0.28 },
          { transform: `translate(${tx}px, ${ty}px) scale(.7)`, opacity: 1 },
        ], { duration: dur, easing: 'cubic-bezier(.3,.1,.5,1)' }).onfinish = () => {
          c.remove(); flying--;
          box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
        };
      }
    }
    G.events.on('zombie:killed', ({ z, credit }) => {
      if (credit === false || !G.player) return;
      const n = z.T.boss ? 5 : z.elite ? 3 : z.T.coin >= 30 ? 2 : 1;
      coinFly(new THREE.Vector3(z.pos.x, z.pos.y + 1.4 * z.T.scale, z.pos.z), n);
    });

    // a skill: the hand dips, the screen flashes in the hero's colour; an ultimate also sweeps a ring and slows time a beat
    G.events.on('skill', ({ ult }) => {
      const h = G.hero.def; cast.style.setProperty('--hc', css(h.color));
      cast.className = ''; void cast.offsetWidth; cast.className = ult ? 'ult' : 'skill';
      G.weapons.S.castT = 0.32;
      if (ult) { G.hitStop = Math.max(G.hitStop || 0, 0.12); G.player.shake.v += 3; }
    });

    // the ultimate fills: the screen edge pulses once in the hero's colour
    let wasReady = false;
    function update() {
      const ready = G.hero.ult >= 1;
      if (ready && !wasReady && G.state === 'playing') { cast.style.setProperty('--hc', css(G.hero.def.color)); cast.className = ''; void cast.offsetWidth; cast.className = 'ready'; }
      wasReady = ready;
    }

    // a bought upgrade: its card pops and throws a few sparks
    G.events.on('build:changed', (e) => {
      const id = e && e.id; if (!id) return;
      requestAnimationFrame(() => {
        const card = document.querySelector(`[data-up="${id}"]`); if (!card) return;
        card.classList.add('bought');
        const r = card.getBoundingClientRect();
        for (let i = 0; i < 10; i++) {
          const s = document.createElement('i'); s.className = 'spark'; layer.appendChild(s);
          const a = Math.random() * Math.PI * 2; const d = 30 + Math.random() * 50; const x = r.left + r.width / 2; const y = r.top + r.height / 2;
          s.animate([{ transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1 }, { transform: `translate(${x + Math.cos(a) * d}px, ${y + Math.sin(a) * d}px) scale(.3)`, opacity: 0 }], { duration: 420 + Math.random() * 200, easing: 'ease-out' }).onfinish = () => s.remove();
        }
      });
    });
    return { update, coinFly };
  };
})();
