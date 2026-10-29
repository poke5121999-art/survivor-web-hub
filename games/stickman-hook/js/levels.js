// Level picker of the current mode (the web's own panel, #levels in index.html), loaded on its first opening so the first
// level does not carry it. `c` is main.js's context: {mode, save, meta, world, game, daily, startLevel, toast, ...}.
// Every level of a finite mode (locked ones greyed), else up to the next new level. Opens and closes with the popup
// transition of uikit.js ('unity', [ĐỀ XUẤT]: the panel is not in the original, it moves like its popups).
import { popOpen, popClose } from './uikit.js';

const $ = (id) => document.getElementById(id);

// Under the picker of a gated mode (events): SeasonalEventsService.GetCanPlayState [asm 0x1180bd0] and the daily limit
function gateNote(c) {
  const { mode, meta, save, daily } = c;
  const t = mode.def.today(meta, save), st = daily.playState(save, mode.id);
  if (t.all) return 'Đã nhận hết quà của sự kiện.';
  if (t.wonToday) return `Đã nhận quà hôm nay. Màn mới sau ${daily.fmtLeft(st.msLeft)}.`;
  const pay = st.state === 'free' ? 'miễn phí' : st.state === 'tickets' ? '1 lượt đã có' : st.tickets ? '1 vé bỏ qua thay quảng cáo' : 'quảng cáo (nhận ngay)';
  return `Hôm nay: màn ${t.level + 1} · lượt này ${pay}`;
}

export function openLevels(c) {
  const { mode, save, meta, world, game } = c;
  const g = $('grid');
  g.innerHTML = '';
  const slot = mode.def.slot(save), best = slot.best || 0;
  const done = (i) => (slot.done ? slot.done.includes(i) : i < best);
  const top = Number.isFinite(mode.count) ? mode.count : Math.max(best + 1, world.index + 1, mode.data.levels.length);
  const go = (i) => { c.overlay('levels', false); c.play('button'); c.startLevel(i); };
  for (let i = 0; i < top; i++) {
    const b = document.createElement('button');
    b.textContent = i + 1;
    if (done(i)) b.className = 'done';
    if (i === world.index) b.className = 'cur';
    b.disabled = !mode.def.open(meta, save, i);
    b.onclick = () => {
      if (mode.def.gate && game.paid !== mode.id + ':' + i) {
        // GameModesService.TryPlaying (daily.js): the day's free game, else the rewarded ad (a skip ticket when owned)
        const how = c.daily.payPlay(save, mode.id);
        if (!how) { c.toast('Hết lượt hôm nay'); return; }
        c.writeSave();
        if (how === 'skip') c.toast('Đã dùng 1 vé bỏ qua thay quảng cáo');
        go(i);
        game.paid = mode.id + ':' + i;
        return;
      }
      go(i);
    };
    g.appendChild(b);
  }
  $('levelsTitle').textContent = mode.def.picker ? c.modeName(mode.id) : 'Chọn màn';
  $('levelsNote').textContent = mode.def.gate ? gateNote(c) : '';
  c.overlay('levels', true);
  popOpen($('levels'), 'unity', { holder: $('levels').querySelector('.panel') });
  g.querySelector('.cur')?.scrollIntoView({ block: 'center' });
}

// The panel's close button: a gated mode's level that was not paid for is not playable, so back to Normal and home.
export async function closeLevels(c) {
  c.play('popup_out');
  await popClose($('levels'), 'unity', { holder: $('levels').querySelector('.panel') });
  c.overlay('levels', false);
  if (c.mode.def.gate && c.game.paid !== c.mode.id + ':' + c.world.index) c.backToNormal();
}
