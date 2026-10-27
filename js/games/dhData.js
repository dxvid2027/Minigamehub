// ==========================================================================
// Dragonheart — data: regions, monsters, bosses, gear and skills.
//
// Everything that is a number a designer would tune lives here, so the game
// file is about behaviour rather than balance.
// ==========================================================================

// --- Regions --------------------------------------------------------------
// Each region is one large scrolling map generated from its own seed, so it
// is the same place every time you come back. `lv` is the level it is pitched
// at; `foes` the weighted monster table; `boss` waits in the arena at the
// east end and opens the way to the next region when beaten.
export const REGIONS = [
  {
    id: "greenvale", name: "Greenvale", sub: "The village and its meadows", lv: 1,
    ground: ["#4f9a3f", "#5aa847", "#4a8f3a"], path: "#b89a63", pathEdge: "#9c7f4c",
    water: "liquid", liquid: ["#2f7fc0", "#4aa3e0"], tree: "oak", props: ["flower", "flower", "bush", "rock"],
    foes: { slime: 6, boar: 3 }, boss: "slimeking", tint: null, village: true,
  },
  {
    id: "whisperwood", name: "Whisperwood", sub: "Where the old trees listen", lv: 4,
    ground: ["#2f6b3a", "#367a42", "#2a6033"], path: "#6e5a3c", pathEdge: "#5a4830",
    water: "liquid", liquid: ["#1e5a6a", "#2f7f8f"], tree: "pine", props: ["mushroom", "bush", "fern", "rock"],
    foes: { wolf: 5, shroom: 3, bat: 3 }, boss: "treant", tint: "rgba(10,40,20,0.18)",
  },
  {
    id: "ruins", name: "Sunken Ruins", sub: "A kingdom the marsh swallowed", lv: 8,
    ground: ["#5f6b4a", "#6a7652", "#56613f"], path: "#8d8a7c", pathEdge: "#6f6c60",
    water: "liquid", liquid: ["#3d5a4a", "#55786a"], tree: "dead", props: ["pillar", "rubble", "fern", "skull"],
    foes: { skeleton: 5, archer: 4, ghost: 3 }, boss: "lich", tint: "rgba(30,40,60,0.22)",
  },
  {
    id: "frostpeak", name: "Frostpeak", sub: "Wind, ice and teeth", lv: 12,
    ground: ["#dfe8f2", "#e9f0f8", "#d3dfec"], path: "#a9b8c9", pathEdge: "#8e9db0",
    water: "ice", liquid: ["#8fc9ea", "#bfe3f7"], tree: "snowpine", props: ["iceshard", "rock", "snowbush"],
    foes: { icewolf: 5, yeti: 3, wisp: 3 }, boss: "frostgolem", tint: "rgba(120,160,220,0.12)",
  },
  {
    id: "caldera", name: "Ember Caldera", sub: "The ground is the enemy", lv: 16,
    ground: ["#4a3530", "#553c35", "#40302b"], path: "#7a5a46", pathEdge: "#5e4434",
    water: "lava", liquid: ["#ff6b28", "#ffb347"], tree: "charred", props: ["vent", "rock", "obsidian"],
    foes: { imp: 5, magma: 3, salamander: 3 }, boss: "drake", tint: "rgba(120,30,0,0.16)",
  },
  {
    id: "spire", name: "Dragon's Spire", sub: "Ashvane waits at the top", lv: 20,
    ground: ["#3a3348", "#433b52", "#332d40"], path: "#6b6080", pathEdge: "#544a68",
    water: "lava", liquid: ["#b03cff", "#ff4fd8"], tree: "crystal", props: ["obsidian", "pillar", "iceshard"],
    foes: { knight: 4, imp: 2, wisp: 2, archer: 2 }, boss: "dragon", tint: "rgba(60,0,80,0.2)",
  },
];

// --- Monsters -------------------------------------------------------------
// `ai`: melee (walk up and swing), lunge (wind up, then dash), ranged (keep
// distance and shoot), float (drift through walls, swoop), tank (slow, hits
// hard, shrugs off knockback).
export const FOES = {
  slime:     { name: "Slime",        hp: 22, atk: 7,  spd: 55,  r: 11, ai: "lunge",  color: "#6ad16a", xp: 6,  gold: 3 },
  boar:      { name: "Wild Boar",    hp: 34, atk: 10, spd: 80,  r: 13, ai: "lunge",  color: "#8a5a3a", xp: 10, gold: 5 },
  wolf:      { name: "Grey Wolf",    hp: 46, atk: 13, spd: 120, r: 12, ai: "lunge",  color: "#8b90a0", xp: 16, gold: 7 },
  shroom:    { name: "Sporecap",     hp: 50, atk: 11, spd: 40,  r: 13, ai: "ranged", color: "#d96a8a", xp: 18, gold: 8, shot: "spore" },
  bat:       { name: "Cave Bat",     hp: 26, atk: 10, spd: 150, r: 9,  ai: "float",  color: "#5a4a6a", xp: 12, gold: 5 },
  skeleton:  { name: "Skeleton",     hp: 80, atk: 18, spd: 85,  r: 12, ai: "melee",  color: "#e8e2d0", xp: 28, gold: 12 },
  archer:    { name: "Bone Archer",  hp: 60, atk: 16, spd: 70,  r: 12, ai: "ranged", color: "#d8cfb8", xp: 30, gold: 13, shot: "arrow" },
  ghost:     { name: "Wraith",       hp: 70, atk: 17, spd: 95,  r: 12, ai: "float",  color: "#9fd8ff", xp: 32, gold: 14 },
  icewolf:   { name: "Frost Wolf",   hp: 120, atk: 25, spd: 140, r: 13, ai: "lunge", color: "#cfe8ff", xp: 48, gold: 20 },
  yeti:      { name: "Yeti",         hp: 220, atk: 34, spd: 70,  r: 18, ai: "tank",  color: "#f2f6fb", xp: 70, gold: 30 },
  wisp:      { name: "Frost Wisp",   hp: 90, atk: 22, spd: 100, r: 10, ai: "ranged", color: "#7fe0ff", xp: 46, gold: 18, shot: "ice" },
  imp:       { name: "Fire Imp",     hp: 150, atk: 32, spd: 110, r: 11, ai: "ranged", color: "#ff7a2a", xp: 70, gold: 28, shot: "fire" },
  magma:     { name: "Magma Golem",  hp: 340, atk: 46, spd: 60,  r: 19, ai: "tank",  color: "#7a3a2a", xp: 110, gold: 45 },
  salamander:{ name: "Salamander",   hp: 180, atk: 38, spd: 135, r: 13, ai: "lunge", color: "#ff5a3a", xp: 80, gold: 32 },
  knight:    { name: "Dragon Knight",hp: 420, atk: 55, spd: 90,  r: 15, ai: "melee", color: "#6a5a8a", xp: 150, gold: 60 },
};

// --- Bosses ---------------------------------------------------------------
// Each boss is a set of attack patterns cycled with telegraphs. `reward` is
// what beating it hands you, on top of the next region opening.
export const BOSSES = {
  slimeking:  { name: "The Slime King",       hp: 420,  atk: 14, r: 34, color: "#5ad15a", xp: 120,  gold: 120,  moves: ["slam", "summon", "lunge"], reward: { skill: "fireball" } },
  treant:     { name: "Elder Treant",         hp: 1100, atk: 22, r: 38, color: "#5a7a3a", xp: 320,  gold: 260,  moves: ["roots", "ring", "summon"], reward: { gear: "runeblade" } },
  lich:       { name: "The Drowned Lich",     hp: 2200, atk: 30, r: 30, color: "#9fd8ff", xp: 700,  gold: 520,  moves: ["spiral", "blink", "summon", "ring"], reward: { skill: "whirlwind" } },
  frostgolem: { name: "Frost Colossus",       hp: 4200, atk: 44, r: 42, color: "#bfe3f7", xp: 1300, gold: 900,  moves: ["slam", "ring", "lunge", "roots"], reward: { gear: "frostbrand" } },
  drake:      { name: "Cinder Drake",         hp: 7000, atk: 58, r: 40, color: "#ff6b28", xp: 2400, gold: 1500, moves: ["breath", "ring", "lunge", "spiral"], reward: { skill: "heal" } },
  dragon:     { name: "Ashvane, the Elder Dragon", hp: 14000, atk: 72, r: 52, color: "#b03cff", xp: 6000, gold: 5000, moves: ["breath", "spiral", "slam", "summon", "ring", "lunge"], reward: { win: true } },
};

// --- Gear -----------------------------------------------------------------
export const RARITY = {
  common:    { name: "Common",    color: "#c9ccd8", mult: 1 },
  rare:      { name: "Rare",      color: "#4aa3ff", mult: 1.25 },
  epic:      { name: "Epic",      color: "#b06bff", mult: 1.55 },
  legendary: { name: "Legendary", color: "#ffb347", mult: 1.95 },
};

// Weapons add attack; armour adds defence and health.
export const WEAPONS = [
  { id: "stick",      name: "Hazel Stick",     atk: 2,   tier: 0, color: "#a27a4a" },
  { id: "shortsword", name: "Shortsword",      atk: 6,   tier: 1, color: "#c9ccd8" },
  { id: "broadsword", name: "Broadsword",      atk: 13,  tier: 2, color: "#d8dce8" },
  { id: "runeblade",  name: "Runeblade",       atk: 24,  tier: 3, color: "#7cf0ff" },
  { id: "frostbrand", name: "Frostbrand",      atk: 40,  tier: 4, color: "#bfe3f7" },
  { id: "emberfang",  name: "Emberfang",       atk: 62,  tier: 5, color: "#ff8a3a" },
  { id: "dragonfang", name: "Dragonfang",      atk: 95,  tier: 6, color: "#d77bff" },
];
export const ARMORS = [
  { id: "tunic",      name: "Linen Tunic",     def: 1,   hp: 0,   tier: 0, color: "#8a6a4a" },
  { id: "leather",    name: "Leather Armour",  def: 4,   hp: 20,  tier: 1, color: "#9a6a3a" },
  { id: "chain",      name: "Chainmail",       def: 9,   hp: 45,  tier: 2, color: "#9aa0b4" },
  { id: "plate",      name: "Knight's Plate",  def: 16,  hp: 85,  tier: 3, color: "#c9ccd8" },
  { id: "frostmail",  name: "Frostmail",       def: 26,  hp: 140, tier: 4, color: "#9fd8ff" },
  { id: "drakescale", name: "Drakescale",      def: 40,  hp: 220, tier: 5, color: "#ff6b28" },
  { id: "dragonplate",name: "Dragonplate",     def: 60,  hp: 340, tier: 6, color: "#b03cff" },
];

// --- Skills ---------------------------------------------------------------
export const SKILLS = {
  fireball:  { name: "Fireball",  key: "L", mana: 22, cd: 0.6, desc: "Hurl a fireball that bursts on impact.", color: "#ff7a2a" },
  whirlwind: { name: "Whirlwind", key: "L", mana: 35, cd: 2.2, desc: "Spin with your blade, striking everything around you.", color: "#7cf0ff" },
  heal:      { name: "Renewal",   key: "L", mana: 50, cd: 8,   desc: "Restore 40% of your health.", color: "#2ee6a6" },
};

// --- Shop -----------------------------------------------------------------
export const POTION_COST = 25;

/** XP needed to go from level n to n+1. */
export const xpFor = (lv) => Math.round(40 * Math.pow(lv, 1.55));
