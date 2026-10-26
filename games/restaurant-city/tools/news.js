/*
 * Vẽ lại 3 ảnh tờ báo trong game (assets/news0..2.png). Game nạp từng ảnh vào một ô của tờ
 * "The Restaurant City Times" và chỉ hiện góc phải dưới: news0 là ô 290x350 ở (290,350) trên nền 580x700,
 * news1/news2 là ô 270x190 ở (270,190) trên nền 540x380. Phần còn lại phải trong suốt.
 *
 *   node games/restaurant-city/tools/news.js
 */
'use strict';
const path = require('path');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const OUT = path.resolve(__dirname, '..', 'assets');
const DATE = '26 THÁNG 10, 2026';

const PAGES = [
  {
    file: 'news0.png', w: 580, h: 700, box: [290, 350, 290, 350], size: 12.5,
    html: `<h1>Chào bếp trưởng!</h1><hr><p class="date">${DATE}</p>
      <h2>Restaurant City mở lại trên Survivor Hub</h2>
      <p>Quán của bạn gắn với tài khoản hub. Nhà hàng, kho nguyên liệu, vườn rau và thư đều lưu online, mở máy khác vẫn còn nguyên.</p>
      <p>Bấm <b>Hire Friends</b> để thuê người chơi khác làm nhân viên. Người được thuê sẽ hiện trên phố của bạn, ghé thăm và đổi nguyên liệu với nhau được.</p>
      <p class="sign">Survivor Hub</p>`
  },
  {
    file: 'news1.png', w: 540, h: 380, box: [270, 190, 270, 190], size: 11.5,
    html: `<h2>Khác bản gốc ở đâu?</h2>
      <p>Không còn Facebook: nút tặng snack, chia sẻ và mời bạn giờ tạo ra một đường link. Copy gửi bạn bè, họ mở trên hub là nhận. Không có nạp tiền thật.</p>
      <p>Thư, đổi nguyên liệu, tưới vườn giúp bạn và chấm điểm quán vẫn chơi với người thật.</p>
      <p class="sign">Survivor Hub</p>`
  },
  {
    file: 'news2.png', w: 540, h: 380, box: [270, 190, 270, 190], size: 11.5,
    html: `<h2>Lời cảm ơn</h2>
      <p>Game gốc của Playfish (2009). Bản này dựng từ mã nguồn công khai của nhóm Restaurant City Reborn: client và server của họ trên GitHub.</p>
      <p>Muốn chơi cùng cộng đồng gốc, ghé rc-reborn.uk.</p>
      <p class="sign">Survivor Hub</p>`
  }
];

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;700;800&display=block');
  html, body { margin: 0; background: transparent; }
  .box { position: absolute; box-sizing: border-box; background: #f6f1e4; padding: 12px 14px 8px; color: #2b2622;
         font-family: 'Baloo 2', sans-serif; font-size: 10.5px; line-height: 1.32; display: flex; flex-direction: column; }
  h1 { font-size: 21px; font-weight: 800; text-align: center; margin: 4px 0 6px; }
  h2 { font-size: 1.3em; font-weight: 800; margin: 2px 0 4px; line-height: 1.15; }
  hr { border: 0; border-top: 2px solid #2b2622; margin: 4px 0 6px; }
  p { margin: 0 0 6px; font-weight: 500; }
  .date { font-size: 7.5px; letter-spacing: .08em; color: #6b625a; margin-bottom: 4px; }
  .sign { margin-top: auto; border-top: 1px solid #b9b0a3; padding-top: 3px; font-size: 7.5px; color: #6b625a; }
`;

(async () => {
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  try {
    for (const p of PAGES) {
      const page = await browser.newPage({ viewport: { width: p.w, height: p.h } });
      const [x, y, w, h] = p.box;
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>
        <div class="box" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;font-size:${p.size}px">${p.html}</div>`);
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => { const b = document.querySelector('.box'); return b.scrollHeight - b.clientHeight; });
      if (overflow > 0) throw new Error(p.file + ': text overflows its box by ' + overflow + 'px');
      await page.screenshot({ path: path.join(OUT, p.file), omitBackground: true });
      await page.close();
      console.log('wrote', p.file);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
