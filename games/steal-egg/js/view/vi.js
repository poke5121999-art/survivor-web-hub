// Vietnamese for every in-game string the original shows (toasts via EventManager.DoFireShowMessage, button labels,
// world labels, tutorial instructions). Keys are the original English strings, typos kept (they are what the sim
// emits); t() falls back to the original text.
const VI = {
  // carry / farm (rules/carry-steal.md, farm-economy.md 11)
  'You can carry only one Egg or Brainrot': 'Bạn chỉ mang được một quả trứng hoặc một Brainrot',
  'Farm is full. Upgrade capacity first': 'Trang trại đã đầy. Hãy nâng cấp sức chứa trước',
  'Place it a little farther away': 'Hãy đặt xa hơn một chút',
  'Your hands are not empty': 'Tay bạn đang bận',
  'Carry an egg or Brainrot first': 'Hãy cầm một quả trứng hoặc Brainrot trước',
  'Egg has no reward data': 'Trứng này không có phần thưởng',
  'Farm capacity upgraded': 'Đã nâng cấp sức chứa trang trại',
  'Farm is already max level': 'Trang trại đã ở cấp tối đa',
  'Not enough coins': 'Không đủ xu',
  'Not enough coins!': 'Không đủ xu!',
  'not evnough coins': 'Không đủ xu',
  'already speeed upgraded': 'Đã nâng cấp tốc độ rồi',
  'Speed upgraded successfuly': 'Nâng cấp tốc độ thành công',
  'Some one is stealing your Brainrot': 'Có kẻ đang trộm Brainrot của bạn',
  // labels
  'PLACE EGG': 'ĐẶT TRỨNG',
  'PLACE BRAINROT': 'ĐẶT BRAINROT',
  'UPGRADE ${0}': 'NÂNG CẤP ${0}',
  'MAX LEVEL': 'CẤP TỐI ĐA',
  'Brainrot Capacity: {0}/{1}': 'Sức chứa Brainrot: {0}/{1}',
  'Upgrade Price: ${0}': 'Giá nâng cấp: ${0}',
  'Upgrade Price: MAX': 'Giá nâng cấp: TỐI ĐA',
  'Ready!': 'Sẵn sàng!',
  'READY': 'SẴN SÀNG',
  'Price $': 'Giá $',
  // tutorial (js/sim/tutorial.js T, rules/tutorial.md)
  'Steal an egg from the animal.': 'Trộm một quả trứng của con vật.',
  'Take the stolen egg to the safe zone.': 'Mang trứng vừa trộm tới vùng an toàn.',
  'Go to your farm and place the egg.': 'Về trang trại của bạn và đặt trứng xuống.',
  'Your egg is READY. Go to it and hatch the Brainrot.': 'Trứng đã SẴN SÀNG. Tới đó để nở Brainrot.',
  'Wait for your egg to hatch.': 'Chờ trứng nở.',
  'Take the Brainrot to your farm and place it.': 'Mang Brainrot về trang trại và đặt xuống.',
  'Go to the Brainrot on your farm and sell it.': 'Tới chỗ Brainrot trên trang trại và bán nó.',
  'The AI gate is open. Steal a Brainrot.': 'Cổng của đối thủ đang mở. Hãy trộm một Brainrot.',
  'Take the stolen Brainrot to your farm and place it.': 'Mang Brainrot vừa trộm về trang trại và đặt xuống.',
  'You have enough coins. Go to the farm upgrade point and upgrade your farm.': 'Bạn đã đủ xu. Tới điểm nâng cấp để nâng cấp trang trại.',
  'Someone stole your Brainrot! Hit the AI and get it back.': 'Có kẻ trộm Brainrot của bạn! Đánh đối thủ để lấy lại.',
  'Steal back your dropped Brainrot.': 'Lấy lại Brainrot bị rơi của bạn.',
  'Take your Brainrot back to your farm and place it.': 'Mang Brainrot về lại trang trại và đặt xuống.',
  'Close your gate to protect the Brainrot.': 'Đóng cổng để bảo vệ Brainrot.',
  'The AI gate is open. You can steal a Brainrot.': 'Cổng của đối thủ đang mở. Bạn có thể trộm một Brainrot.',
  // remake placeholders
  'Shop opens in the next version': 'Cửa hàng mở ở bản sau',
  'Settings open in the next version': 'Cài đặt mở ở bản sau',
};

export const t = s => VI[s] ?? VI[String(s).trim()] ?? s;
// String.Format-style "{0}" fill after translating the pattern.
export const tf = (pattern, ...args) => t(pattern).replace(/\{(\d)\}/g, (m, i) => String(args[+i]));
