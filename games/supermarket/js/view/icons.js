// Original look for products: an emoji glyph and a colour per product (no art from the APK).
const BY_NAME = [
  ['Noodles', '🍜', '#e9a23b'], ['Bread', '🍞', '#d9a066'], ['Kopi', '☕', '#6b4226'], ['Coffee Beans', '🫘', '#5a3a22'],
  ['Coffee', '☕', '#7b4b2a'], ['Chips', '🥔', '#f2c94c'], ['Mineral Water', '💧', '#56ccf2'], ['Sparkling Water', '🫧', '#7fd8f5'],
  ['Soda Water', '🥤', '#9be3f7'], ['Glass of wate', '🥛', '#c9eefc'], ['Cereal', '🥣', '#f2994a'], ['Corn Flakes', '🌽', '#f2c94c'],
  ['Decorations', '🎀', '#eb5757'], ['Hamburger', '🍔', '#c0763a'], ['Phone', '📱', '#4f4f4f'], ['Apple', '🍎', '#e0383e'],
  ['Banana', '🍌', '#f5d547'], ['Soap', '🧼', '#bb6bd9'], ['Carving', '🗿', '#9b8b7a'], ['Milk', '🥛', '#f4f4f4'],
  ['Cake', '🍰', '#f7b2c4'], ['Rice Ball', '🍙', '#eeeeee'], ['Melon', '🍈', '#a8e063'], ['Eggs', '🥚', '#f6e7c8'],
  ['Tea Leaves', '🍵', '#6fcf97'], ['Black Tea', '🫖', '#8d5524'], ['Hot Pot', '🍲', '#d63031'], ['Sauce', '🥫', '#c0392b'],
  ['Cookies', '🍪', '#c48a4a'], ['Chili', '🌶️', '#e74c3c'], ['Taco', '🌮', '#f39c12'], ['Motor Oil', '🛢️', '#2d3436'],
  ['Abalone', '🐚', '#c7a17a'], ['Orange Juice', '🍊', '#f39c12'], ['Juice', '🧃', '#ff9f43'], ['Kangaroo', '🦘', '#c08552'],
  ['Wool', '🧶', '#e84393'], ['Football', '⚽', '#ffffff'], ['Cashews', '🥜', '#e1b382'], ['Candy', '🍬', '#ff7aa2'],
  ['Steak', '🥩', '#b33939'], ['Kiwi', '🥝', '#78b13f'], ['Laundry', '🧺', '#74b9ff'], ['Lanolin', '🧴', '#ffeaa7'],
  ['Lamb', '🍖', '#a0522d'], ['Honey', '🍯', '#f6b93b'], ['Car Model', '🚗', '#d63031'], ['Sausage', '🌭', '#c0392b'],
  ['Camera', '📷', '#2d3436'], ['Umbrella', '☂️', '#6c5ce7'], ['Olive Oil', '🫒', '#9aa33b'], ['Pasta', '🍝', '#f8c471'],
  ['Leather Bag', '👜', '#8e5b3a'], ['Durian', '🍈', '#b5a642'], ["Bird's Nest", '🪺', '#e6d3a3'], ['Toothbrush', '🪥', '#00b894'],
  ['Silverware', '🍴', '#b2bec3'], ['Cup', '☕', '#dfe6e9'], ['Cranberries', '🫐', '#a4133c'], ['Maple', '🍁', '#d35400'],
  ['Salmon', '🐟', '#fa8072'], ['Face Mask', '😷', '#81ecec'], ['Facial Mask', '🧖', '#fab1a0'], ['Kimchi', '🥬', '#e17055'],
  ['Ginseng', '🌿', '#a3cb38'], ['K-pop', '💿', '#fd79a8'], ['Slippers', '🩴', '#0984e3'], ['Thai Spices', '🧂', '#e67e22'],
  ['Chewing Gum', '🫧', '#ff9ff3'], ['Mango', '🥭', '#ffb142'], ['Basmati', '🍚', '#f5f6fa'], ['Curry', '🍛', '#e1a32a'],
  ['Beef Broth', '🥣', '#8b4513'], ['Pen', '🖊️', '#0652dd'], ['Cheese', '🧀', '#f9ca24'], ['Chocolate', '🍫', '#6d4c41'],
  ['Perfume', '🌸', '#e056fd'], ['Notebook', '📓', '#30336b'], ['Matryoshka', '🪆', '#c0392b'], ['Caviar', '🥄', '#2f3640'],
  ['Fur Hat', '🎩', '#7f8c8d'], ['Saffron', '🌼', '#f0932b'], ['Nuts', '🌰', '#a0522d'], ['Preservation', '🛍️', '#00cec9'],
  ['Pharaoh', '🏺', '#d4ac0d'], ['Date Palm', '🌴', '#a86b32'], ['Crystal Ball', '🔮', '#8e44ad'], ['Tissue', '🧻', '#ecf0f1'],
  ['Ghost CD', '👻', '#dcdde1'], ['Goblin', '👺', '#c23616'], ['Black cat', '🐈‍⬛', '#2f3640'], ['Baked pie', '🥧', '#e1b12c'],
  ['Skull', '💀', '#f5f6fa'], ['Kerosene', '🏮', '#e84118'], ['Pumpkin', '🎃', '#e67e22'], ['Cookie jar', '🫙', '#c8d6e5'],
  ['Tarot', '🃏', '#6c5ce7'], ['Helmet', '⛑️', '#e84118'], ['Halloween choc', '🍫', '#4b2c20'], ['Witch', '🧙', '#2d3436'],
  ['Clown', '🤡', '#ff6b6b'], ['Spider', '🕷️', '#2f3640'], ['Candlestick', '🕯️', '#fbc531'], ['Whisky', '🥃', '#b9770e'],
  ['Tequila', '🍸', '#f9e79f'], ['Alcohol', '🍷', '#7d3c98'], ['Cigar', '🚬', '#6e2c00'],
];

export function iconOf(p) {
  for (const [k, e, c] of BY_NAME) if (p.name.toLowerCase().includes(k.toLowerCase())) return { emoji: e, color: c };
  return { emoji: '📦', color: '#95a5a6' };
}
export const money = c => (c < 0 ? '-$' : '$') + (Math.abs(c) / 100).toFixed(2);
