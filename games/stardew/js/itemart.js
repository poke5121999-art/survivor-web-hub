/*
 * itemart.js - one picture per item, from whichever source has one.
 *
 * The game carries 717 items and the atlas carries art for about sixty of
 * them. Neither number is going to change, so the answer is a two-layer
 * lookup rather than a choice between them:
 *
 *   1. a hand-written map, for the items the atlas genuinely has - a real
 *      wedge of cheese for Cheese, a real egg for Egg
 *   2. a CATEGORY fallback, so an unmapped fish still looks like a fish and an
 *      unmapped gem still looks like a gem
 *   3. the procedural generator in sprites.js, which hashes the item's name
 *      into a stable colour and draws a small shape for its category
 *
 * Layer 3 is what makes the whole thing shippable. Every item has SOME picture
 * that is consistent between the bag, the shop, the shipping bin and the
 * ground, and it never changes between sessions because the hash is of the
 * name. What it is not is beautiful, and that is the correct trade: the owner
 * is drawing a real set later, and this file is the one place a real set gets
 * plugged into.
 */
(function (global) {
  'use strict';

  var A = global.ISL_ATLAS;
  var S = global.SDV_SPRITES;

  /* Exact matches. Left side is the item name in data/gamedata.js, right is an
   * atlas frame. Only pairs that genuinely LOOK like the item belong here -
   * a near-miss is worse than the generated icon, because a wrong picture is
   * remembered as the item. */
  var MAP = {
    // produce the atlas has outright
    'Apple': 'Apple', 'Grape': 'Grape', 'Blueberry': 'Blueberry',
    'Tomato': 'Tomato', 'Wheat': 'Wheat', 'Beet': 'SugarBeet',
    'Milk': 'Milk', 'Large Milk': 'Milk', 'Goat Milk': 'Milk',
    'Egg': 'Egg', 'Large Egg': 'Egg', 'Brown Egg': 'Egg',
    'Large Brown Egg': 'Egg', 'Duck Egg': 'Egg',
    'Truffle': 'Truffle', 'Cheese': 'Cheese', 'Goat Cheese': 'Cheese',
    'Wood': 'Wood', 'Hardwood': 'Wood__2', 'Stone': 'Stone',
    'Sugar': 'Sugar', 'Wheat Flour': 'Flour', 'Bread': 'Bread',
    'Caviar': 'Caviar', 'Roe': 'Caviar', 'Pearl': 'Pearl',
    'Diamond': 'Dia', 'Emerald': 'Emerald', 'Sapphire': 'Sapphire',
    'Gold Bar': 'Gold', 'Iridium Bar': 'Mithril', 'Coal': 'Rock_Iron',
    'Copper Ore': 'Rock_Bronze', 'Iron Ore': 'Rock_Iron',
    'Gold Ore': 'Rock_Gold', 'Iridium Ore': 'Rock_Platinum',
    'Fried Egg': 'FriedEgg', 'Omelet': 'CheeseOmelet',
    'Pizza': 'CheesePizza', 'Hashbrowns': 'HamburgerPatty',
    'Ice Cream': 'FruitSherbet', 'Blueberry Tart': 'BlueberryPie',
    'Pink Cake': 'EggTart', 'Chocolate Cake': 'ApplePie',
    'Cookie': 'HoneyBun', 'Pancakes': 'HoneyBun',
    'Fish Taco': 'HotDog', 'Bean Hotpot': 'Soup',
    'Cranberry Sauce': 'MixedFruitSauce', 'Spaghetti': 'TruffleCarbonara',
    'Truffle Oil': 'MixedFruitSauce2',
    'Maple Syrup': 'BerryJam', 'Oak Resin': 'AppleJam', 'Pine Tar': 'BerryJam',
    'Honey': 'AppleJam', 'Jelly': 'BerryJam',
    'Bait': 'FishingBait', 'Bomb': 'Bomb', 'Cherry Bomb': 'Bomb',
    'Basic Fertilizer': 'Fertilizer', 'Quality Fertilizer': 'Fertilizer',
    'Deluxe Fertilizer': 'Fertilizer', 'Speed-Gro': 'Fertilizer',
    'Deluxe Speed-Gro': 'Fertilizer',
    // Pokemon-side items
    'Poké Ball': 'DropBall_0', 'Great Ball': 'DropBall_0', 'Ultra Ball': 'DropBall_0',
    'Net Ball': 'DropBall_0', 'Dusk Ball': 'DropBall_0', 'Quick Ball': 'DropBall_0',
    'Timer Ball': 'DropBall_0', 'Master Ball': 'DropBall_0',
    'Potion': 'EnergyDrink', 'Super Potion': 'EnergyDrink',
    'Hyper Potion': 'EnergyDrink', 'Max Potion': 'EnergyDrink',
    'Revive': 'resurrectionPotion', 'Max Revive': 'resurrectionPotion',
    'Antidote': 'ProProtein', 'Burn Heal': 'ProProtein',
    'Ice Heal': 'ProProtein', 'Awakening': 'ProProtein',
    'Paralyze Heal': 'ProProtein', 'Full Heal': 'ProProtein',
    'Ether': 'EnergyDrink', 'Rare Candy': 'HoneyBun',
    'Fire Stone': 'Rock_Dia', 'Water Stone': 'Sapphire2',
    'Thunder Stone': 'Rock_Gold', 'Leaf Stone': 'Rock_Emerald',
    'Moon Stone': 'Rock_SaPhire',
    // sprinklers and tools
    'Sprinkler': 'Plus_5x5', 'Quality Sprinkler': 'Plus_5x5',
    'Iridium Sprinkler': 'Plus_7x7',
    'Chest': 'Box', 'Furnace': 'OvenEmpty', 'Keg': 'Drum', 'Cask': 'Drum2',
    'Preserves Jar': 'Pot_0', 'Mayonnaise Machine': 'WorkingDesk_0',
    'Cheese Press': 'WorkingDesk_1', 'Loom': 'Desk', 'Tapper': 'Pot_1',
    'Seed Maker': 'DrawMachin', 'Crab Pot': 'Hook'
  };

  /* Category fallback - one representative frame per gamedata category, used
   * when there is no exact match. It is what stops a shop list of forty
   * unmapped fish from being forty identical generated blobs. */
  var BY_CAT = {
    fish: '0_GoldFish', mineral: 'Sapphire__2', artifact: 'MinotaursSkull',
    resource: 'Stone', crafted: 'Hammer', seed: 'CoinSeeds',
    artisan: 'AppleJam', cooked: 'Soup', forage: 'BerryFlower',
    fruit: 'Apple', crop: 'Wheat'
  };

  function frameFor(name, cat) {
    if (MAP[name] && A.has(MAP[name])) return MAP[name];
    /* A crop's own name usually is not in the atlas, but a fish is a fish.
     * Category art only stands in for the categories where one picture is
     * honestly representative - crops and fruit get generated art instead,
     * because "a wheat icon for every one of fifty crops" is worse than fifty
     * distinguishable coloured shapes. */
    if (cat && cat !== 'crop' && cat !== 'fruit' && BY_CAT[cat] && A.has(BY_CAT[cat])) {
      return BY_CAT[cat];
    }
    return null;
  }

  /* name -> category, built once. The obvious version walks SDV_DATA.items
   * looking for a matching `name`, and that is 717 string compares per icon;
   * a bag redraw asks thirty-six times and a shop list forty more, so it was
   * measurably the most expensive thing in opening a panel. */
  var _cat = null;
  function catOf(name) {
    if (!_cat) {
      _cat = {};
      var data = global.SDV_DATA;
      if (data && data.items) {
        for (var k in data.items) _cat[data.items[k].name] = data.items[k].cat;
      }
    }
    return _cat[name] || null;
  }

  /* Cached, because the bag redraws on every change and a shop list is forty
   * rows. The key includes the size so a 24px bag slot and a 48px shop row do
   * not fight over one canvas. */
  var _cache = {};
  function icon(name, size, cat) {
    size = size || 32;
    var key = name + '@' + size;
    if (_cache[key]) return copy(_cache[key]);
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    cat = cat || catOf(name);
    var f = frameFor(name, cat);
    if (f) {
      var w = A.width(f), h = A.height(f);
      var s = Math.min(size / w, size / h);
      if (s > 1) s = Math.max(1, Math.floor(s));
      A.draw(g, f, (size - w * s) / 2, (size - h * s) / 2, { scale: s });
    } else if (S && S.drawIcon) {
      S.drawIcon(g, name, cat || 'resource', 0, 0, size);
    } else {
      g.fillStyle = '#ff00c8'; g.fillRect(0, 0, size, size);
    }
    _cache[key] = c;
    return copy(c);
  }
  function copy(c) {
    var d = document.createElement('canvas');
    d.width = c.width; d.height = c.height;
    d.getContext('2d').drawImage(c, 0, 0);
    return d;
  }

  /* Draw straight onto the world canvas, for dropped items and shop displays.
   * Goes through the same cache so a field littered with forty parsnips is one
   * canvas blitted forty times. */
  function draw(ctx, name, x, y, size, cat) {
    size = size || 16;
    var key = name + '@' + size;
    if (!_cache[key]) icon(name, size, cat);        // populates the cache
    ctx.drawImage(_cache[key], Math.round(x), Math.round(y));
  }

  global.ISL_ITEMART = {
    MAP: MAP, BY_CAT: BY_CAT,
    icon: icon, draw: draw, frameFor: frameFor, catOf: catOf,
    clearCache: function () { _cache = {}; }
  };
})(window);
