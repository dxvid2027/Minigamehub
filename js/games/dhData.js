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
// east end and opens the way to the next region when beaten. `dark` is how
// much ambient light is missing (0 = full day) — lamps, lava, crystals and
// spells push it back. `weather` picks the drifting particles.
export const REGIONS = [
  {
    id: "greenvale", name: "Greenvale", sub: "The village and its meadows", lv: 1,
    ground: ["#4f9a3f", "#5aa847", "#4a8f3a"], path: "#b89a63", pathEdge: "#9c7f4c",
    water: "liquid", liquid: ["#2f7fc0", "#4aa3e0"], tree: "oak", props: ["flower", "flower", "bush", "rock"],
    foes: { slime: 6, boar: 3 }, boss: "slimeking", tint: null, village: true, dark: 0, weather: "petal",
  },
  {
    id: "whisperwood", name: "Whisperwood", sub: "Where the old trees listen", lv: 4,
    ground: ["#2f6b3a", "#367a42", "#2a6033"], path: "#6e5a3c", pathEdge: "#5a4830",
    water: "liquid", liquid: ["#1e5a6a", "#2f7f8f"], tree: "pine", props: ["mushroom", "bush", "fern", "rock"],
    foes: { wolf: 5, shroom: 3, bat: 3 }, boss: "treant", tint: "rgba(10,40,20,0.18)", dark: 0.35, weather: "fly",
  },
  {
    id: "ruins", name: "Sunken Ruins", sub: "A kingdom the marsh swallowed", lv: 8,
    ground: ["#5f6b4a", "#6a7652", "#56613f"], path: "#8d8a7c", pathEdge: "#6f6c60",
    water: "liquid", liquid: ["#3d5a4a", "#55786a"], tree: "dead", props: ["pillar", "rubble", "fern", "skull"],
    foes: { skeleton: 5, archer: 4, ghost: 3 }, boss: "lich", tint: "rgba(30,40,60,0.22)", dark: 0.45, weather: "fly",
  },
  {
    id: "frostpeak", name: "Frostpeak", sub: "Wind, ice and teeth", lv: 12,
    ground: ["#dfe8f2", "#e9f0f8", "#d3dfec"], path: "#a9b8c9", pathEdge: "#8e9db0",
    water: "ice", liquid: ["#8fc9ea", "#bfe3f7"], tree: "snowpine", props: ["iceshard", "rock", "snowbush"],
    foes: { icewolf: 5, yeti: 3, wisp: 3 }, boss: "frostgolem", tint: "rgba(120,160,220,0.12)", dark: 0.1, weather: "snow",
  },
  {
    id: "caldera", name: "Ember Caldera", sub: "The ground is the enemy", lv: 16,
    ground: ["#4a3530", "#553c35", "#40302b"], path: "#7a5a46", pathEdge: "#5e4434",
    water: "lava", liquid: ["#ff6b28", "#ffb347"], tree: "charred", props: ["vent", "rock", "obsidian"],
    foes: { imp: 5, magma: 3, salamander: 3 }, boss: "drake", tint: "rgba(120,30,0,0.16)", dark: 0.5, weather: "ember",
  },
  {
    id: "spire", name: "Dragon's Spire", sub: "Ashvane's roost", lv: 20,
    ground: ["#3a3348", "#433b52", "#332d40"], path: "#6b6080", pathEdge: "#544a68",
    water: "lava", liquid: ["#b03cff", "#ff4fd8"], tree: "crystal", props: ["obsidian", "pillar", "iceshard"],
    foes: { knight: 4, imp: 2, wisp: 2, archer: 2 }, boss: "dragon", tint: "rgba(60,0,80,0.2)", dark: 0.55, weather: "ember",
  },
  // --- Beyond the Spire ----------------------------------------------------
  {
    id: "coast", name: "Coral Coast", sub: "Something vast moves under the reef", lv: 24,
    ground: ["#e6d3a3", "#efdeb0", "#d9c492"], path: "#c9b07a", pathEdge: "#b0975f",
    water: "liquid", liquid: ["#1fa3b8", "#5ce0e6"], tree: "palm", props: ["coral", "kelp", "rock", "shell"],
    foes: { crab: 5, siren: 3, eel: 3 }, boss: "leviathan", tint: "rgba(0,80,120,0.08)", dark: 0.05, weather: "bubble",
  },
  {
    id: "desert", name: "Mirage Desert", sub: "The sand has teeth", lv: 28,
    ground: ["#e0b06a", "#e8bd7a", "#d6a35c"], path: "#c9944a", pathEdge: "#b07e38",
    water: "liquid", liquid: ["#3fb0a8", "#7fe0d0"], tree: "cactus", props: ["dune", "bones", "rock", "cactus"],
    foes: { scorpion: 5, mummy: 4, sandwisp: 2 }, boss: "wyrm", tint: "rgba(255,170,60,0.08)", dark: 0, weather: "sand",
  },
  {
    id: "shadowfen", name: "Shadowfen", sub: "The marsh remembers every name", lv: 32,
    ground: ["#3a4a2e", "#435536", "#334227"], path: "#5a5038", pathEdge: "#463e2a",
    water: "liquid", liquid: ["#2a3a1e", "#4a6a2a"], tree: "willow", props: ["reed", "lily", "gravestone", "mushroom"],
    foes: { bogman: 5, wraith: 3, toad: 3 }, boss: "witch", tint: "rgba(30,60,20,0.22)", dark: 0.55, weather: "spore",
  },
  {
    id: "clockwork", name: "Clockwork Citadel", sub: "Ten thousand gears, one heart", lv: 36,
    ground: ["#5a5048", "#655a50", "#4e453e"], path: "#8a7a62", pathEdge: "#6e6050",
    water: "lava", liquid: ["#2a2a2a", "#4a4a3a"], tree: "chimney", props: ["gear", "pipe", "rubble"],
    foes: { construct: 5, drone: 4, sentinel: 2 }, boss: "titan", tint: "rgba(80,60,20,0.12)", dark: 0.35, weather: "spark",
  },
  {
    id: "stormspire", name: "Stormspire Peaks", sub: "The sky fights back", lv: 40,
    ground: ["#5a6a7a", "#647584", "#50606e"], path: "#8a98a6", pathEdge: "#6e7c8a",
    water: "liquid", liquid: ["#3a5a8a", "#6a9ad0"], tree: "stormpine", props: ["rock", "stormrock", "iceshard"],
    foes: { harpy: 5, golemstorm: 3, stormwisp: 3 }, boss: "thunderbird", tint: "rgba(30,40,80,0.2)", dark: 0.45, weather: "rain",
  },
  {
    id: "caverns", name: "Crystal Caverns", sub: "Light that cuts", lv: 44,
    ground: ["#2a3048", "#323a56", "#262b40"], path: "#4a5478", pathEdge: "#3a4262",
    water: "liquid", liquid: ["#3ad0ff", "#a6f0ff"], tree: "crystal", props: ["crystalcluster", "rock", "iceshard"],
    foes: { spider: 5, shardling: 4, prism: 2 }, boss: "crystalqueen", tint: "rgba(40,80,160,0.12)", dark: 0.7, weather: "glint",
  },
  {
    id: "bloodmoon", name: "Blood Moon Vale", sub: "Night that does not end", lv: 48,
    ground: ["#3a2028", "#44262f", "#311a21"], path: "#5a3a3e", pathEdge: "#462c30",
    water: "liquid", liquid: ["#6a0a1a", "#a01a2a"], tree: "dead", props: ["gravestone", "bones", "rose"],
    foes: { vampire: 4, ghoul: 5, batswarm: 3 }, boss: "vampirelord", tint: "rgba(120,0,20,0.22)", dark: 0.65, weather: "petal",
  },
  {
    id: "abyss", name: "Abyssal Rift", sub: "Where the world runs out", lv: 52,
    ground: ["#1c1830", "#221d3a", "#171428"], path: "#3a3260", pathEdge: "#2c264a",
    water: "void", liquid: ["#0a0618", "#2a1a5a"], tree: "voidspire", props: ["voidcrystal", "obsidian", "rubble"],
    foes: { voideye: 4, tendril: 4, voidknight: 3 }, boss: "kraken", tint: "rgba(30,0,80,0.25)", dark: 0.75, weather: "void",
  },
  {
    id: "celestial", name: "Celestial Gardens", sub: "Beautiful, and watching", lv: 56,
    ground: ["#e8eaf6", "#f2f3fb", "#dcdff0"], path: "#d8c890", pathEdge: "#c0b078",
    water: "cloud", liquid: ["#c8d8ff", "#ffffff"], tree: "goldtree", props: ["flower", "pillar", "starstone"],
    foes: { angel: 4, guardian: 3, starling: 4 }, boss: "seraph", tint: "rgba(255,230,160,0.08)", dark: 0, weather: "light",
  },
  {
    id: "throne", name: "Throne of Eternity", sub: "The end of every road", lv: 60,
    ground: ["#14101e", "#1a1528", "#100c18"], path: "#4a3a6a", pathEdge: "#3a2c56",
    water: "void", liquid: ["#05030c", "#3a1a6a"], tree: "obelisk", props: ["voidcrystal", "starstone", "obsidian"],
    foes: { voidknight: 4, angel: 2, voideye: 2, tendril: 2 }, boss: "eternal", tint: "rgba(40,0,60,0.25)", dark: 0.8, weather: "star",
  },
];

// --- Monsters -------------------------------------------------------------
// `ai`: melee (walk up and swing), lunge (wind up, then dash), ranged (keep
// distance and shoot), float (drift through walls, swoop), tank (slow, hits
// hard, shrugs off knockback). `art` reuses another monster's drawing in a
// new colour where the shape fits.
export const FOES = {
  slime:     { name: "Slime",        hp: 22, atk: 7,  spd: 55,  r: 11, ai: "lunge",  color: "#6ad16a", xp: 6,  gold: 3 },
  boar:      { name: "Wild Boar",    hp: 34, atk: 10, spd: 80,  r: 13, ai: "lunge",  color: "#8a5a3a", xp: 10, gold: 5 },
  wolf:      { name: "Grey Wolf",    hp: 46, atk: 13, spd: 120, r: 12, ai: "lunge",  color: "#8b90a0", xp: 16, gold: 7 },
  shroom:    { name: "Sporecap",     hp: 50, atk: 11, spd: 40,  r: 13, ai: "ranged", color: "#d96a8a", xp: 18, gold: 8, shot: "spore" },
  bat:       { name: "Cave Bat",     hp: 26, atk: 10, spd: 150, r: 9,  ai: "float",  color: "#5a4a6a", xp: 12, gold: 5 },
  skeleton:  { name: "Skeleton",     hp: 80, atk: 18, spd: 85,  r: 12, ai: "melee",  color: "#e8e2d0", xp: 28, gold: 12 },
  archer:    { name: "Bone Archer",  hp: 60, atk: 16, spd: 70,  r: 12, ai: "ranged", color: "#d8cfb8", xp: 30, gold: 13, shot: "arrow" },
  ghost:     { name: "Wraith",       hp: 70, atk: 17, spd: 95,  r: 12, ai: "float",  color: "#9fd8ff", xp: 32, gold: 14 },
  icewolf:   { name: "Frost Wolf",   hp: 120, atk: 25, spd: 140, r: 13, ai: "lunge", color: "#cfe8ff", xp: 48, gold: 20, art: "wolf" },
  yeti:      { name: "Yeti",         hp: 220, atk: 34, spd: 70,  r: 18, ai: "tank",  color: "#f2f6fb", xp: 70, gold: 30 },
  wisp:      { name: "Frost Wisp",   hp: 90, atk: 22, spd: 100, r: 10, ai: "ranged", color: "#7fe0ff", xp: 46, gold: 18, shot: "ice" },
  imp:       { name: "Fire Imp",     hp: 150, atk: 32, spd: 110, r: 11, ai: "ranged", color: "#ff7a2a", xp: 70, gold: 28, shot: "fire" },
  magma:     { name: "Magma Golem",  hp: 340, atk: 46, spd: 60,  r: 19, ai: "tank",  color: "#7a3a2a", xp: 110, gold: 45 },
  salamander:{ name: "Salamander",   hp: 180, atk: 38, spd: 135, r: 13, ai: "lunge", color: "#ff5a3a", xp: 80, gold: 32, art: "boar" },
  knight:    { name: "Dragon Knight",hp: 420, atk: 55, spd: 90,  r: 15, ai: "melee", color: "#6a5a8a", xp: 150, gold: 60 },
  // Coral Coast
  crab:      { name: "Reef Crab",    hp: 700,  atk: 70,  spd: 95,  r: 14, ai: "lunge",  color: "#ff6a4a", xp: 210, gold: 70 },
  siren:     { name: "Siren",        hp: 520,  atk: 64,  spd: 90,  r: 12, ai: "ranged", color: "#5ce0e6", xp: 220, gold: 72, shot: "ice", art: "ghost" },
  eel:       { name: "Storm Eel",    hp: 480,  atk: 60,  spd: 160, r: 11, ai: "float",  color: "#3ad0a0", xp: 200, gold: 66, art: "serpentling" },
  // Mirage Desert
  scorpion:  { name: "Dune Scorpion",hp: 820,  atk: 82,  spd: 120, r: 14, ai: "lunge",  color: "#c98a3a", xp: 260, gold: 85 },
  mummy:     { name: "Mummy",        hp: 1100, atk: 90,  spd: 70,  r: 13, ai: "melee",  color: "#e8dcb8", xp: 280, gold: 90, art: "skeleton" },
  sandwisp:  { name: "Sand Djinn",   hp: 640,  atk: 78,  spd: 110, r: 11, ai: "ranged", color: "#ffd76a", xp: 270, gold: 88, shot: "fire", art: "imp" },
  // Shadowfen
  bogman:    { name: "Bog Brute",    hp: 1600, atk: 110, spd: 65,  r: 18, ai: "tank",   color: "#4a5a2a", xp: 340, gold: 110, art: "yeti" },
  wraith:    { name: "Fen Wraith",   hp: 900,  atk: 95,  spd: 120, r: 12, ai: "float",  color: "#a6e0a0", xp: 320, gold: 100, art: "ghost" },
  toad:      { name: "Hex Toad",     hp: 1000, atk: 92,  spd: 60,  r: 14, ai: "ranged", color: "#6a8a2a", xp: 330, gold: 104, shot: "spore", art: "slime" },
  // Clockwork Citadel
  construct: { name: "Brass Construct", hp: 1900, atk: 125, spd: 80, r: 16, ai: "melee", color: "#c9a24a", xp: 400, gold: 130 },
  drone:     { name: "Spark Drone",  hp: 1000, atk: 110, spd: 140, r: 10, ai: "ranged", color: "#ffcf4a", xp: 380, gold: 124, shot: "bolt", art: "eye" },
  sentinel:  { name: "Sentinel",     hp: 3200, atk: 150, spd: 55,  r: 20, ai: "tank",   color: "#8a7a5a", xp: 480, gold: 160, art: "construct" },
  // Stormspire
  harpy:     { name: "Storm Harpy",  hp: 1300, atk: 135, spd: 170, r: 12, ai: "float",  color: "#8aa0c8", xp: 460, gold: 150, art: "bat" },
  golemstorm:{ name: "Thunder Golem",hp: 3600, atk: 170, spd: 60,  r: 20, ai: "tank",   color: "#5a6a8a", xp: 560, gold: 180, art: "magma" },
  stormwisp: { name: "Storm Wisp",   hp: 1200, atk: 140, spd: 120, r: 10, ai: "ranged", color: "#ffef6a", xp: 470, gold: 152, shot: "bolt", art: "wisp" },
  // Crystal Caverns
  spider:    { name: "Crystal Spider",hp: 1700, atk: 160, spd: 150, r: 14, ai: "lunge",  color: "#7ad8ff", xp: 560, gold: 180 },
  shardling: { name: "Shardling",    hp: 1500, atk: 150, spd: 95,  r: 12, ai: "ranged", color: "#a6f0ff", xp: 540, gold: 175, shot: "ice", art: "wisp" },
  prism:     { name: "Prism Golem",  hp: 4600, atk: 200, spd: 55,  r: 20, ai: "tank",   color: "#9ad0ff", xp: 700, gold: 220, art: "yeti" },
  // Blood Moon Vale
  vampire:   { name: "Vampire",      hp: 2600, atk: 190, spd: 130, r: 13, ai: "melee",  color: "#a01a3a", xp: 680, gold: 230, art: "knight" },
  ghoul:     { name: "Ghoul",        hp: 2100, atk: 175, spd: 120, r: 13, ai: "lunge",  color: "#7a8a6a", xp: 640, gold: 210, art: "skeleton" },
  batswarm:  { name: "Blood Bats",   hp: 1500, atk: 165, spd: 190, r: 10, ai: "float",  color: "#6a0a1a", xp: 600, gold: 200, art: "bat" },
  // Abyssal Rift
  voideye:   { name: "Void Eye",     hp: 2600, atk: 210, spd: 110, r: 13, ai: "ranged", color: "#b06bff", xp: 800, gold: 260, shot: "void", art: "eye" },
  tendril:   { name: "Rift Tendril", hp: 3200, atk: 230, spd: 150, r: 13, ai: "lunge",  color: "#6a2aaa", xp: 820, gold: 270, art: "serpentling" },
  voidknight:{ name: "Void Knight",  hp: 5200, atk: 260, spd: 95,  r: 15, ai: "melee",  color: "#2a1a4a", xp: 980, gold: 320, art: "knight" },
  // Celestial Gardens
  angel:     { name: "Fallen Angel", hp: 4200, atk: 260, spd: 130, r: 13, ai: "float",  color: "#fff3c0", xp: 1000, gold: 340, art: "ghost" },
  guardian:  { name: "Gilded Guardian", hp: 7800, atk: 300, spd: 60, r: 20, ai: "tank",  color: "#ffd76a", xp: 1200, gold: 400, art: "construct" },
  starling:  { name: "Starling",     hp: 3400, atk: 250, spd: 120, r: 11, ai: "ranged", color: "#ffffff", xp: 960, gold: 320, shot: "orb", art: "wisp" },
};

// --- Bosses ---------------------------------------------------------------
// Each boss is a set of attack patterns cycled with telegraphs, and every
// one of them has a third phase below a quarter of its health. `art` reuses
// another boss's body in a new colour where the shape fits.
export const BOSSES = {
  slimeking:  { name: "The Slime King",        hp: 650,    atk: 18,  r: 34, color: "#5ad15a", xp: 150,   gold: 150,   moves: ["slam", "summon", "lunge", "walls"], reward: { skill: "fireball" } },
  treant:     { name: "Elder Treant",          hp: 1700,   atk: 28,  r: 38, color: "#5a7a3a", xp: 400,   gold: 320,   moves: ["roots", "ring", "summon", "meteor"], reward: { gear: "runeblade" } },
  lich:       { name: "The Drowned Lich",      hp: 3400,   atk: 38,  r: 30, color: "#9fd8ff", xp: 850,   gold: 640,   moves: ["spiral", "blink", "summon", "ring", "homing"], reward: { skill: "whirlwind" } },
  frostgolem: { name: "Frost Colossus",        hp: 6400,   atk: 56,  r: 42, color: "#bfe3f7", xp: 1600,  gold: 1100,  moves: ["slam", "ring", "lunge", "roots", "walls"], reward: { gear: "frostbrand" } },
  drake:      { name: "Cinder Drake",          hp: 10500,  atk: 74,  r: 40, color: "#ff6b28", xp: 2900,  gold: 1800,  moves: ["breath", "ring", "lunge", "spiral", "meteor"], reward: { skill: "heal" } },
  dragon:     { name: "Ashvane, the Elder Dragon", hp: 21000, atk: 92, r: 52, color: "#b03cff", xp: 7000, gold: 6000, moves: ["breath", "spiral", "slam", "summon", "ring", "lunge", "meteor"], reward: { skill: "chain", gear: "dragonfang" } },
  leviathan:  { name: "Leviathan of the Reef", hp: 34000,  atk: 170, r: 46, color: "#1fa3b8", xp: 9000,  gold: 7500,  moves: ["walls", "spiral", "lunge", "summon", "homing"], art: "serpent", reward: { skill: "frost" } },
  wyrm:       { name: "The Sand Wyrm",         hp: 46000,  atk: 200, r: 48, color: "#c98a3a", xp: 11500, gold: 9000,  moves: ["lunge", "meteor", "ring", "walls", "roots"], art: "serpent", reward: { gear: "sunspear" } },
  witch:      { name: "Morwen, the Bog Witch", hp: 60000,  atk: 230, r: 32, color: "#6aaa3a", xp: 14500, gold: 11000, moves: ["blink", "homing", "summon", "spiral", "laser"], art: "lich", reward: { skill: "dash" } },
  titan:      { name: "The Iron Titan",        hp: 78000,  atk: 270, r: 50, color: "#c9a24a", xp: 18000, gold: 13500, moves: ["slam", "laser", "walls", "lunge", "meteor"], art: "frostgolem", reward: { gear: "gearsplitter" } },
  thunderbird:{ name: "The Thunderbird",       hp: 98000,  atk: 310, r: 46, color: "#ffe14a", xp: 22000, gold: 16500, moves: ["breath", "meteor", "homing", "lunge", "laser", "ring"], art: "drake", reward: { skill: "meteor" } },
  crystalqueen:{ name: "The Crystal Queen",    hp: 122000, atk: 350, r: 34, color: "#7ad8ff", xp: 27000, gold: 20000, moves: ["laser", "walls", "blink", "spiral", "summon", "homing"], art: "lich", reward: { gear: "prismedge" } },
  vampirelord:{ name: "Lord Vesper",           hp: 150000, atk: 395, r: 34, color: "#a01a3a", xp: 33000, gold: 24000, moves: ["blink", "homing", "lunge", "summon", "spiral", "walls"], art: "lich", reward: { skill: "aegis" } },
  kraken:     { name: "The Void Kraken",       hp: 185000, atk: 450, r: 54, color: "#6a2aaa", xp: 40000, gold: 29000, moves: ["roots", "laser", "walls", "homing", "spiral", "summon"], art: "kraken", reward: { gear: "voidreaver" } },
  seraph:     { name: "Seraph Aurelion",       hp: 230000, atk: 510, r: 40, color: "#ffd76a", xp: 50000, gold: 35000, moves: ["laser", "meteor", "ring", "blink", "walls", "homing", "spiral"], art: "seraph", reward: { skill: "storm" } },
  eternal:    { name: "Nyxara, the World Eater", hp: 320000, atk: 600, r: 60, color: "#d77bff", xp: 80000, gold: 60000, moves: ["breath", "laser", "meteor", "walls", "spiral", "summon", "homing", "lunge", "ring"], art: "eternal", reward: { win: true } },
};

// --- Gear -----------------------------------------------------------------
export const RARITY = {
  common:    { name: "Common",    color: "#c9ccd8", mult: 1 },
  rare:      { name: "Rare",      color: "#4aa3ff", mult: 1.25 },
  epic:      { name: "Epic",      color: "#b06bff", mult: 1.55 },
  legendary: { name: "Legendary", color: "#ffb347", mult: 1.95 },
};

// Weapons add attack, and the named ones carry an effect on every hit:
//   burn  — sets the target alight          chill — slows it
//   shock — may arc to two more enemies      leech — heals you for some of the damage
//   crit  — more critical hits               storm — burn and shock together
export const WEAPON_FX = {
  burn:  { name: "Burning",   desc: "Sets enemies alight",        color: "#ff7a2a" },
  chill: { name: "Freezing",  desc: "Slows enemies",              color: "#9fe8ff" },
  shock: { name: "Shocking",  desc: "Can arc to 2 more enemies",  color: "#ffef6a" },
  leech: { name: "Vampiric",  desc: "Heals you for 6% of damage", color: "#ff5470" },
  crit:  { name: "Keen",      desc: "+15% critical chance",       color: "#ffffff" },
  storm: { name: "Tempest",   desc: "Burns and arcs lightning",   color: "#d77bff" },
};
export const WEAPONS = [
  { id: "stick",        name: "Hazel Stick",      atk: 2,   tier: 0,  color: "#a27a4a" },
  { id: "shortsword",   name: "Shortsword",       atk: 6,   tier: 1,  color: "#c9ccd8" },
  { id: "broadsword",   name: "Broadsword",       atk: 13,  tier: 2,  color: "#d8dce8" },
  { id: "runeblade",    name: "Runeblade",        atk: 24,  tier: 3,  color: "#7cf0ff", fx: "shock" },
  { id: "frostbrand",   name: "Frostbrand",       atk: 40,  tier: 4,  color: "#bfe3f7", fx: "chill" },
  { id: "emberfang",    name: "Emberfang",        atk: 62,  tier: 5,  color: "#ff8a3a", fx: "burn" },
  { id: "dragonfang",   name: "Dragonfang",       atk: 95,  tier: 6,  color: "#d77bff", fx: "burn" },
  { id: "tidecaller",   name: "Tidecaller",       atk: 125, tier: 7,  color: "#5ce0e6", fx: "chill" },
  { id: "sunspear",     name: "Sunspear",         atk: 160, tier: 8,  color: "#ffd76a", fx: "burn" },
  { id: "witchbane",    name: "Witchbane",        atk: 200, tier: 9,  color: "#8aff7a", fx: "leech" },
  { id: "gearsplitter", name: "Gearsplitter",     atk: 250, tier: 10, color: "#c9a24a", fx: "crit" },
  { id: "stormcaller",  name: "Stormcaller",      atk: 310, tier: 11, color: "#ffef6a", fx: "shock" },
  { id: "prismedge",    name: "Prismedge",        atk: 380, tier: 12, color: "#a6f0ff", fx: "crit" },
  { id: "bloodthirster",name: "Bloodthirster",    atk: 460, tier: 13, color: "#ff3a5a", fx: "leech" },
  { id: "voidreaver",   name: "Voidreaver",       atk: 550, tier: 14, color: "#b06bff", fx: "shock" },
  { id: "seraphgrace",  name: "Seraph's Grace",   atk: 650, tier: 15, color: "#fff3c0", fx: "leech" },
  { id: "eternity",     name: "Eternity",         atk: 770, tier: 16, color: "#ff8af0", fx: "storm" },
];
export const ARMORS = [
  { id: "tunic",      name: "Linen Tunic",     def: 1,   hp: 0,    tier: 0,  color: "#8a6a4a" },
  { id: "leather",    name: "Leather Armour",  def: 4,   hp: 20,   tier: 1,  color: "#9a6a3a" },
  { id: "chain",      name: "Chainmail",       def: 9,   hp: 45,   tier: 2,  color: "#9aa0b4" },
  { id: "plate",      name: "Knight's Plate",  def: 16,  hp: 85,   tier: 3,  color: "#c9ccd8" },
  { id: "frostmail",  name: "Frostmail",       def: 26,  hp: 140,  tier: 4,  color: "#9fd8ff" },
  { id: "drakescale", name: "Drakescale",      def: 40,  hp: 220,  tier: 5,  color: "#ff6b28" },
  { id: "dragonplate",name: "Dragonplate",     def: 60,  hp: 340,  tier: 6,  color: "#b03cff" },
  { id: "reefguard",  name: "Reefguard",       def: 80,  hp: 400,  tier: 7,  color: "#1fa3b8" },
  { id: "sandwrap",   name: "Sunforged Wraps", def: 100, hp: 480,  tier: 8,  color: "#e0b06a" },
  { id: "bogleather", name: "Hexhide",         def: 125, hp: 560,  tier: 9,  color: "#5a7a2a" },
  { id: "brassplate", name: "Brass Bulwark",   def: 150, hp: 650,  tier: 10, color: "#c9a24a" },
  { id: "stormmail",  name: "Stormmail",       def: 180, hp: 750, tier: 11, color: "#6a9ad0" },
  { id: "prismplate", name: "Prism Plate",     def: 215, hp: 860, tier: 12, color: "#a6f0ff" },
  { id: "nightcloak", name: "Nightweave",      def: 255, hp: 980, tier: 13, color: "#6a0a2a" },
  { id: "voidplate",  name: "Voidplate",       def: 300, hp: 1100, tier: 14, color: "#2a1a5a" },
  { id: "halo",       name: "Haloed Raiment",  def: 350, hp: 1250, tier: 15, color: "#fff3c0" },
  { id: "eternalaegis",name: "Eternal Aegis",  def: 410, hp: 1400, tier: 16, color: "#ff8af0" },
];
export const MAX_TIER = 16;

// --- Skills ---------------------------------------------------------------
// One skill is active at a time (L / ✦); Q or the number keys switch.
export const SKILLS = {
  fireball:  { name: "Fireball",       mana: 22, cd: 0.6, desc: "Hurl a fireball that bursts on impact.", color: "#ff7a2a", icon: "🔥" },
  whirlwind: { name: "Whirlwind",      mana: 35, cd: 2.2, desc: "Spin with your blade, striking everything around you.", color: "#7cf0ff", icon: "🌀" },
  heal:      { name: "Renewal",        mana: 50, cd: 8,   desc: "Restore 40% of your health.", color: "#2ee6a6", icon: "✚" },
  chain:     { name: "Chain Lightning",mana: 40, cd: 1.6, desc: "Lightning leaps between up to five enemies.", color: "#ffef6a", icon: "⚡" },
  frost:     { name: "Frost Nova",     mana: 45, cd: 5,   desc: "Freeze everything close for two seconds.", color: "#9fe8ff", icon: "❄" },
  dash:      { name: "Shadow Step",    mana: 30, cd: 2.5, desc: "Blink forward through enemies, cutting them as you pass.", color: "#b06bff", icon: "➶" },
  meteor:    { name: "Meteor",         mana: 70, cd: 7,   desc: "Call down a meteor on the nearest enemy.", color: "#ff5a2a", icon: "☄" },
  aegis:     { name: "Aegis",          mana: 60, cd: 12,  desc: "A shield that soaks a third of your health in damage.", color: "#ffd76a", icon: "⛨" },
  storm:     { name: "Blade Storm",    mana: 65, cd: 4,   desc: "Twelve spectral blades fly out in a ring.", color: "#fff3c0", icon: "✷" },
};

// --- Shop -----------------------------------------------------------------
export const POTION_COST = 25;

/** XP needed to go from level n to n+1. */
export const xpFor = (lv) => Math.round(40 * Math.pow(lv, 1.55));
