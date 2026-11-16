// config.js — every tunable of NEON BREACH: PROTOCOL in one place.
// Teams, weapons, economy, round rules and the map palette. No logic here.

// The two teams. VANGUARD attacks (plants the charge), SENTINEL defends.
export const TEAMS = {
  atk: { id: 'atk', name: 'VANGUARD', color: 0xff7a1a, ui: '#ff8c2e' },
  def: { id: 'def', name: 'SENTINEL', color: 0x19c8e8, ui: '#2fd6f7' },
};
export const TEAM_SIZE = 5; // the player plus four bot team-mates

// Round and match rules.
export const RULES = {
  buySeconds: 15,
  roundSeconds: 105,
  bombSeconds: 40,
  endSeconds: 4.5,
  roundsPerHalf: 8,
  roundsToWin: 9,
  startMoney: 800,
  maxMoney: 16000,
  rewardKill: 300,
  rewardWinElim: 3250,
  rewardWinObjective: 3500,
  rewardLoss: 1400,
  rewardPlantTeam: 800,
  rewardPlanter: 300,
  rewardDefuser: 300,
};

// Weapon table. damage is per bullet at point blank; falloffStart/falloffEnd
// scale it down at range; headMult multiplies a head hit; armourPen is the
// share of damage that ignores armour. spread is in radians at rest.
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 SIDEARM', slot: 'sidearm', price: 0, auto: false,
    damage: 26, headMult: 4, armourPen: 0.5, rpm: 380, mag: 12, reserve: 96,
    reload: 1.6, spread: 0.011, moveSpread: 0.045, range: 70,
    falloffStart: 18, falloffEnd: 55, pellets: 1, kick: 0.011,
  },
  vz6: {
    id: 'vz6', name: 'VZ-6 SMG', slot: 'primary', price: 1500, auto: true,
    damage: 22, headMult: 4, armourPen: 0.45, rpm: 800, mag: 32, reserve: 128,
    reload: 2.1, spread: 0.017, moveSpread: 0.05, range: 60,
    falloffStart: 12, falloffEnd: 40, pellets: 1, kick: 0.008,
  },
  rk9: {
    id: 'rk9', name: 'RK-9 RIFLE', slot: 'primary', price: 2700, auto: true,
    damage: 33, headMult: 4, armourPen: 0.7, rpm: 600, mag: 30, reserve: 120,
    reload: 2.4, spread: 0.009, moveSpread: 0.055, range: 110,
    falloffStart: 25, falloffEnd: 90, pellets: 1, kick: 0.013,
  },
  longshot: {
    id: 'longshot', name: 'LONGSHOT-8', slot: 'primary', price: 4750, auto: false,
    damage: 97, headMult: 3, armourPen: 0.95, rpm: 44, mag: 5, reserve: 30,
    reload: 3.1, spread: 0.0015, moveSpread: 0.09, range: 220,
    falloffStart: 60, falloffEnd: 200, pellets: 1, kick: 0.05,
  },
};

// Purchasables in the buy menu, in display order. Keys are what the player
// presses (and what bot buyers pick from).
export const BUY_MENU = [
  { key: '1', kind: 'weapon', id: 'vz6', label: 'VZ-6 SMG' },
  { key: '2', kind: 'weapon', id: 'rk9', label: 'RK-9 RIFLE' },
  { key: '3', kind: 'weapon', id: 'longshot', label: 'LONGSHOT-8' },
  { key: '4', kind: 'armour', id: 'kevlar', label: 'KEVLAR VEST', price: 650 },
  { key: '5', kind: 'grenade', id: 'frag', label: 'FRAG GRENADE', price: 300 },
  { key: '6', kind: 'grenade', id: 'smoke', label: 'SMOKE GRENADE', price: 300 },
  { key: '7', kind: 'grenade', id: 'flash', label: 'FLASH GRENADE', price: 200 },
];

// Grenade behaviour. Frag wounds in a radius, smoke blinds the bots' sight
// lines for a while, flash whites out anyone looking at the burst.
export const GRENADES = {
  frag: { name: 'FRAG', damage: 92, radius: 6.5, fuse: 1.6 },
  smoke: { name: 'SMOKE', radius: 4.2, fuse: 1.1, duration: 14 },
  flash: { name: 'FLASH', radius: 16, fuse: 1.3, blindMax: 2.6 },
};

// Movement and gunplay physics shared by the player and the bots.
export const PHYS = {
  walkSpeed: 4.6,
  sprintSpeed: 6.3,
  crouchSpeed: 2.1,
  accel: 42,
  friction: 11,
  radius: 0.42,
  standEye: 1.62,
  crouchEye: 1.12,
  headHeight: 1.52, // centre of the head box above the feet
  bodyTop: 1.42,
};

// The Foundry Nine palette: dark slate steel, hot orange against cold cyan,
// bone-white markings. Lighting in render.js follows these choices.
export const PALETTE = {
  sky: 0x0d1420,
  fog: 0x0d1420,
  ground: 0x2e3742,
  groundLine: 0x46545f,
  wall: 0x44546a,
  wallDark: 0x334154,
  crate: 0x5d5142,
  crateAlt: 0x47616e,
  metal: 0x6b7885,
  accentAtk: 0xff7a1a,
  accentDef: 0x19c8e8,
  siteA: 0xffb02e,
  siteB: 0x2effa8,
  lamp: 0xcfe8ff,
};
