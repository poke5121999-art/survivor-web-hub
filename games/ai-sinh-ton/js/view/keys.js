// Sim skill fx key (js/data/heroes.js) -> Blockade Z cast animation key (BZ.CAST_ANIM). A key missing here plays no cast pose.
export const CAST_KEY = {
  gold_shield: 'invuln', charge: 'charge', quake: 'quake', overdrive: 'storm', cluster: 'cluster', drones: 'drones',
  heal: 'heal', dart: 'dart', revive: 'revive', dash: 'dash', gust: 'gust', blades: 'blades', airstrike: 'strike',
  mines: 'mine', artillery: 'barrage', blink: 'blink', pierce_star: 'shuriken', vanish: 'vanish', ice_wave: 'freeze',
  ice_spike: 'lance', blizzard: 'blizzard', molotov: 'molotov', rocket_jump: 'rocketjump', dragon_breath: 'dragon',
  poison_cloud: 'cloud', drain: 'drain', plague: 'plague', turret: 'turret', armor_up: 'repair', fortress: 'artillery',
  ball_lightning: 'orb', smite: 'smite', thunder: 'thunder', pounce: 'lunge', howl: 'howl', werewolf: 'werewolf',
  swing: 'swing', web_pull: 'yank', web_net: 'webnet',
};

// holds that swing a weapon (progress 0..1) versus holds that shoot (a recoil kick)
export const SWING_HOLDS = new Set(['melee', 'sword2', 'spear', 'glaive', 'fists', 'throw', 'claws']);

// Blockade Z zombie type of each sim enemy kind: the strings are identical for the 13 kinds and the 11 bosses
export const ENEMY_TYPE = (kind) => kind;

// how high a flying enemy cruises (metres at model scale 1)
export const FLY_Y = { flyer: 3.0, queen: 4.2, ufo: 4.6, dragon: 4.4 };
