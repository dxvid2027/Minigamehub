// ==========================================================================
// Dragonheart — quests, cosmetics and the token economy.
//
// Every region has someone with work for you: a camp by the road with a
// quest giver (Greenvale's live in the village). Quests come in a few kinds:
//   collect   — glowing items scattered over the region's map
//   drop      — items monsters in the region sometimes carry
//   kill      — slay N of one monster type (anywhere)
//   elite     — slay N elite monsters in this region
//   boss / nightmare / won — beat the region's boss, its nightmare, or Nyxara
// Rewards are gold, XP, potions and — the point of it all — cosmetics:
// helmets, capes, auras and pets that change how your hero looks.
//
// Dragon Tokens (✪) are the second currency. Grit the scrapper on the market
// turns gear into tokens; Lysa the tailor sells cosmetics for them, and Bram
// reforges equipped gear one rarity higher.
// ==========================================================================

// --- Quest items ------------------------------------------------------------
export const QITEMS = {
  apple:     { name: "Red Apple",       icon: "🍎", color: "#ff5a5a" },
  glowcap:   { name: "Glowcap",         icon: "🍄", color: "#7cf0ff" },
  page:      { name: "Lost Page",       icon: "📜", color: "#ffe9a0" },
  frostbloom:{ name: "Frostbloom",      icon: "❄️", color: "#bfe3f7" },
  opal:      { name: "Fire Opal",       icon: "🔥", color: "#ff7a2a" },
  scale:     { name: "Ashvane's Scale", icon: "🐲", color: "#b03cff" },
  egg:       { name: "Dragon Egg",      icon: "🥚", color: "#ffd76a" },
  pearl:     { name: "Sea Pearl",       icon: "🦪", color: "#ffe0f0" },
  scarab:    { name: "Golden Scarab",   icon: "🪲", color: "#ffd76a" },
  bogroot:   { name: "Bogroot",         icon: "🌿", color: "#8aff7a" },
  cog:       { name: "Brass Cog",       icon: "⚙️", color: "#c9a24a" },
  feather:   { name: "Storm Feather",   icon: "🪶", color: "#ffef6a" },
  rod:       { name: "Lightning Rod",   icon: "⚡", color: "#ffef6a" },
  crystal:   { name: "Cave Crystal",    icon: "💎", color: "#7ad8ff" },
  moonrose:  { name: "Moonrose",        icon: "🌹", color: "#ff3a5a" },
  voidshard: { name: "Void Shard",      icon: "🔮", color: "#b06bff" },
  star:      { name: "Fallen Star",     icon: "⭐", color: "#ffd76a" },
  relic:     { name: "Ancient Relic",   icon: "🏺", color: "#e0b06a" },
};

// --- Quest givers -----------------------------------------------------------
// `hat` is drawn with the same art as the hero's cosmetic helmets.
export const GIVERS = {
  granny:  { name: "Granny Wen",          color: "#c0503a", hair: "#e8e8e8", hat: "strawhat", hello: "Oh, a strong young thing! My old knees can't fetch what I need any more." },
  farmer:  { name: "Farmer Tom",          color: "#6a8a3a", hair: "#8a5a2a", hat: "strawhat", hello: "Slimes! In my turnips! Every single morning!" },
  elder:   { name: "Elder Rowan",         color: "#8a6ac0", hair: "#e8e8e8", hello: null },
  fen:     { name: "Ranger Fen",          color: "#2f6b3a", hair: "#3a2a1a", hat: "hood", hello: "Quiet now. The wood is listening — and so are the wolves." },
  ines:    { name: "Scholar Ines",        color: "#5a4aa0", hair: "#2a1a3a", hat: "wizard", hello: "These ruins were a library once. The marsh ate it, page by page." },
  hilde:   { name: "Old Hilde",           color: "#6a8ab0", hair: "#f4f8fc", hat: "horned", hello: "Cold enough for you? Ha! You'll want a proper helmet up here." },
  brokk:   { name: "Brokk the Dwarf",     color: "#8a3a1a", hair: "#c0501a", hat: "goggles", hello: "Mind the floor. The floor bites." },
  kael:    { name: "Sir Kael",            color: "#5a2a7a", hair: "#c9ccd8", hat: "dragonhelm", hello: "I hunted Ashvane for forty years. Take my helm's secret, if you can earn it." },
  mara:    { name: "Captain Mara",        color: "#1a5a8a", hair: "#6a2a1a", hat: "piratehat", hello: "Ahoy! Lost my ship, my crew and my pearls. In that order." },
  zahir:   { name: "Nomad Zahir",         color: "#c98a3a", hair: "#2a1a10", hat: "pharaoh", hello: "Water is life, friend. Gold is nice too." },
  moira:   { name: "Moira the Hedge Witch", color: "#3a5a2a", hair: "#8aaa5a", hat: "witchhat", hello: "Hee hee. Don't mind the cauldron. Or the smell." },
  pip:     { name: "Tinker Pip",          color: "#8a6a2a", hair: "#ff9a3a", hat: "goggles", hello: "Gears! Springs! Explosions! Mostly the third one." },
  aeris:   { name: "Skyherald Aeris",     color: "#4a6aa0", hair: "#f4f8fc", hat: "wingedhelm", hello: "The storm speaks in feathers and fire. Can you hear it?" },
  gus:     { name: "Miner Gus",           color: "#6a5a4a", hair: "#4a3a2a", hat: "goggles", hello: "Shiny down here, ain't it? Shiny and full of spiders." },
  vlad:    { name: "Hunter Vlad",         color: "#4a0a1a", hair: "#1a1a1a", hat: "skullhelm", hello: "Garlic, stakes, a good blade. And patience." },
  yll:     { name: "Void Seer Yll",       color: "#2a1a4a", hair: "#b06bff", hat: "voidmask", hello: "I have seen the end of the world. It is rather close." },
  sera:    { name: "Seraphine",           color: "#fff3c0", hair: "#ffd76a", hat: "halo", hello: "The gardens are beautiful. And they are watching you, little hero." },
  knight:  { name: "The Last Knight",     color: "#3a2a5a", hair: "#c9ccd8", hat: "crown", hello: "Every road ends here. Mine did. Yours need not." },
};
// Which giver keeps camp in which region (Greenvale's live in the village).
export const CAMP_GIVER = [null, "fen", "ines", "hilde", "brokk", "kael", "mara", "zahir", "moira", "pip", "aeris", "gus", "vlad", "yll", "sera", "knight"];

// --- Quests -----------------------------------------------------------------
// `r` is the region index the quest belongs to. `slot` picks which of the
// region's scattered quest spots a collect quest uses, so two quests in the
// same region never share a spot.
export const QUESTS = [
  // Greenvale
  { id: "g_apples", r: 0, giver: "granny", name: "Apple Harvest", desc: "Granny Wen's apples rolled all over Greenvale. Find six.", type: "collect", item: "apple", n: 6, reward: { gold: 60, potions: 1, cos: ["flowercrown"] } },
  { id: "g_slimes", r: 0, giver: "farmer", name: "Slime Trouble", desc: "Squash twelve slimes before they eat the turnips.", type: "kill", foe: "slime", n: 12, reward: { gold: 90, cos: ["petslime"] } },
  { id: "g_first",  r: 0, giver: "elder",  name: "First Steps", desc: "Defeat the Slime King in the stone circle east of the village.", type: "boss", reward: { gold: 150, cos: ["capehero"] } },
  { id: "g_heart",  r: 0, giver: "elder",  name: "The Dragonheart", desc: "Defeat Nyxara, the World Eater, on the Throne of Eternity.", type: "won", reward: { gold: 50000, tokens: 200, cos: ["dhcrown", "petphoenix"] } },
  // Whisperwood
  { id: "w_caps",   r: 1, giver: "fen", name: "Glowcaps", desc: "Pick seven glowing mushrooms. Owls love them.", type: "collect", item: "glowcap", n: 7, reward: { gold: 200, cos: ["petowl"] } },
  { id: "w_wolves", r: 1, giver: "fen", name: "The Wolf Pack", desc: "Thin the pack: defeat ten wolves.", type: "kill", foe: "wolf", n: 10, reward: { gold: 250, potions: 2, cos: ["hood"] } },
  // Sunken Ruins
  { id: "r_pages",  r: 2, giver: "ines", name: "Lost Pages", desc: "Six pages of the old library are still out there.", type: "collect", item: "page", n: 6, reward: { gold: 450, cos: ["wizard"] } },
  { id: "r_elites", r: 2, giver: "ines", name: "Restless Champions", desc: "Lay three elite monsters of the Ruins to rest.", type: "elite", n: 3, reward: { gold: 500, tokens: 5, cos: ["petghost"] } },
  // Frostpeak
  { id: "f_bloom",  r: 3, giver: "hilde", name: "Frostblooms", desc: "Six frostblooms grow where nothing should.", type: "collect", item: "frostbloom", n: 6, reward: { gold: 700, cos: ["capefrost"] } },
  { id: "f_yeti",   r: 3, giver: "hilde", name: "Yeti Hunt", desc: "Prove your worth: defeat six yetis.", type: "kill", foe: "yeti", n: 6, reward: { gold: 800, potions: 2, cos: ["horned"] } },
  // Ember Caldera
  { id: "c_opals",  r: 4, giver: "brokk", name: "Fire Opals", desc: "Six fire opals glitter among the cinders.", type: "collect", item: "opal", n: 6, reward: { gold: 1100, cos: ["flamecrown"] } },
  { id: "c_imps",   r: 4, giver: "brokk", name: "Imp Smashing", desc: "Fifteen imps. Smash them all.", type: "kill", foe: "imp", n: 15, reward: { gold: 1200, tokens: 8, cos: ["capeflame"] } },
  // Dragon's Spire — the Dragon Helm lives here.
  { id: "s_scales", r: 5, giver: "kael", name: "Scales of Ashvane", desc: "Ashvane's creatures carry its shed scales. Bring Sir Kael eight, and he will forge you a Dragon Helm.", type: "drop", item: "scale", n: 8, chance: 0.35, reward: { gold: 2000, cos: ["dragonhelm"] } },
  { id: "s_egg",    r: 5, giver: "kael", name: "The Last Egg", desc: "Somewhere on the Spire lies a dragon egg that never hatched. Or has it…?", type: "collect", item: "egg", n: 1, reward: { gold: 1500, cos: ["petdragon"] } },
  { id: "s_night",  r: 5, giver: "kael", name: "Ashvane's Nightmare", desc: "Summon Ashvane's Nightmare at the altar and banish it.", type: "nightmare", reward: { gold: 8000, tokens: 40, cos: ["wingsdragon"] } },
  // Coral Coast
  { id: "co_pearls",r: 6, giver: "mara", name: "Pearls Ahoy", desc: "Seven pearls washed up along the coast.", type: "collect", item: "pearl", n: 7, reward: { gold: 3000, cos: ["piratehat"] } },
  { id: "co_crabs", r: 6, giver: "mara", name: "Crab Cull", desc: "Twelve crabs took my last ship apart. Return the favour.", type: "kill", foe: "crab", n: 12, reward: { gold: 3200, cos: ["petcrab"] } },
  // Mirage Desert
  { id: "d_scarabs",r: 7, giver: "zahir", name: "Golden Scarabs", desc: "Six golden scarabs bury themselves in the dunes.", type: "collect", item: "scarab", n: 6, reward: { gold: 4000, cos: ["pharaoh"] } },
  { id: "d_scorp",  r: 7, giver: "zahir", name: "Scorpion Sting", desc: "Defeat ten scorpions.", type: "kill", foe: "scorpion", n: 10, reward: { gold: 4200, tokens: 12, cos: ["capesand"] } },
  // Shadowfen
  { id: "sh_roots", r: 8, giver: "moira", name: "Witch's Brew", desc: "Six bogroots for Moira's cauldron.", type: "collect", item: "bogroot", n: 6, reward: { gold: 5200, cos: ["witchhat"] } },
  { id: "sh_elite", r: 8, giver: "moira", name: "Things in the Mire", desc: "Defeat four elite monsters in the Shadowfen.", type: "elite", n: 4, reward: { gold: 5500, cos: ["petbat"] } },
  // Clockwork Citadel
  { id: "cl_cogs",  r: 9, giver: "pip", name: "Spare Parts", desc: "Eight brass cogs fell off the Citadel.", type: "collect", item: "cog", n: 8, reward: { gold: 6500, cos: ["goggles"] } },
  { id: "cl_drones",r: 9, giver: "pip", name: "Drone Recall", desc: "Ten drones went rogue. Switch them off — permanently.", type: "kill", foe: "drone", n: 10, reward: { gold: 7000, tokens: 15, cos: ["petrobot"] } },
  // Stormspire Peaks
  { id: "st_feath", r: 10, giver: "aeris", name: "Storm Feathers", desc: "Harpies carry storm feathers. Collect six.", type: "drop", item: "feather", foe: "harpy", n: 6, chance: 0.45, reward: { gold: 8000, cos: ["wingedhelm"] } },
  { id: "st_rods",  r: 10, giver: "aeris", name: "Lightning Rods", desc: "Five lightning rods are stuck in the peaks.", type: "collect", item: "rod", n: 5, reward: { gold: 8500, cos: ["aurastorm"] } },
  // Crystal Caverns
  { id: "cv_cryst", r: 11, giver: "gus", name: "Shiny!", desc: "Eight cave crystals. The shiny ones.", type: "collect", item: "crystal", n: 8, reward: { gold: 10000, cos: ["crystalcrown"] } },
  { id: "cv_spid",  r: 11, giver: "gus", name: "Spider Nests", desc: "Defeat twelve cave spiders.", type: "kill", foe: "spider", n: 12, reward: { gold: 10500, tokens: 20, cos: ["aurasparkle"] } },
  // Blood Moon Vale
  { id: "b_roses",  r: 12, giver: "vlad", name: "Moonroses", desc: "Six moonroses bloom only under the red moon.", type: "collect", item: "moonrose", n: 6, reward: { gold: 12000, cos: ["capeblood"] } },
  { id: "b_vamps",  r: 12, giver: "vlad", name: "Vampire Hunt", desc: "Defeat eight vampires.", type: "kill", foe: "vampire", n: 8, reward: { gold: 13000, cos: ["skullhelm"] } },
  // Abyssal Rift
  { id: "a_shards", r: 13, giver: "yll", name: "Shards of Nothing", desc: "Seven void shards float at the edge of the world.", type: "collect", item: "voidshard", n: 7, reward: { gold: 15000, cos: ["voidmask"] } },
  { id: "a_eyes",   r: 13, giver: "yll", name: "Eyes in the Dark", desc: "Close ten Void Eyes.", type: "kill", foe: "voideye", n: 10, reward: { gold: 16000, tokens: 25, cos: ["capevoid"] } },
  // Celestial Gardens
  { id: "ce_stars", r: 14, giver: "sera", name: "Fallen Stars", desc: "Seven stars fell into the gardens.", type: "collect", item: "star", n: 7, reward: { gold: 19000, cos: ["halo"] } },
  { id: "ce_trial", r: 14, giver: "sera", name: "Trial of Light", desc: "Defeat five elite monsters in the gardens.", type: "elite", n: 5, reward: { gold: 20000, cos: ["wingsangel"] } },
  // Throne of Eternity
  { id: "th_relic", r: 15, giver: "knight", name: "Relics of Eternity", desc: "Eight relics of the old kings lie about the Throne.", type: "collect", item: "relic", n: 8, reward: { gold: 24000, cos: ["auragold"] } },
  { id: "th_night", r: 15, giver: "knight", name: "Beyond the End", desc: "Banish the Nightmare of Nyxara.", type: "nightmare", reward: { gold: 60000, tokens: 100, cos: ["caperainbow"] } },
];
// Collect quests take their spots in order of appearance within a region.
{
  const used = {};
  for (const q of QUESTS) if (q.type === "collect") { q.slot = used[q.r] || 0; used[q.r] = q.slot + q.n; }
}

// --- Cosmetics --------------------------------------------------------------
// slot: helm | cape | aura | pet. `from` says where it comes from; `price`
// (in Dragon Tokens) marks the ones Lysa sells.
export const COSMETICS = {
  // Helmets
  flowercrown:  { slot: "helm", name: "Flower Crown",      color: "#ff7fa8", from: "Quest: Apple Harvest" },
  strawhat:     { slot: "helm", name: "Straw Hat",         color: "#e8c46a", price: 6 },
  hood:         { slot: "helm", name: "Ranger's Hood",     color: "#2f6b3a", from: "Quest: The Wolf Pack" },
  wizard:       { slot: "helm", name: "Wizard Hat",        color: "#5a4aa0", from: "Quest: Lost Pages" },
  horned:       { slot: "helm", name: "Viking Helm",       color: "#c9ccd8", from: "Quest: Yeti Hunt" },
  flamecrown:   { slot: "helm", name: "Crown of Flames",   color: "#ff7a2a", from: "Quest: Fire Opals" },
  dragonhelm:   { slot: "helm", name: "Dragon Helm",       color: "#c0203a", from: "Quest: Scales of Ashvane" },
  piratehat:    { slot: "helm", name: "Pirate Hat",        color: "#2a2a3a", from: "Quest: Pearls Ahoy" },
  pharaoh:      { slot: "helm", name: "Pharaoh's Nemes",   color: "#ffd76a", from: "Quest: Golden Scarabs" },
  witchhat:     { slot: "helm", name: "Witch Hat",         color: "#3a2a4a", from: "Quest: Witch's Brew" },
  goggles:      { slot: "helm", name: "Tinker Goggles",    color: "#c9a24a", from: "Quest: Spare Parts" },
  wingedhelm:   { slot: "helm", name: "Winged Helm",       color: "#dfe8f2", from: "Quest: Storm Feathers" },
  crystalcrown: { slot: "helm", name: "Crystal Crown",     color: "#7ad8ff", from: "Quest: Shiny!" },
  skullhelm:    { slot: "helm", name: "Skull Helm",        color: "#e8e2d0", from: "Quest: Vampire Hunt" },
  voidmask:     { slot: "helm", name: "Void Mask",         color: "#6a2aaa", from: "Quest: Shards of Nothing" },
  halo:         { slot: "helm", name: "Halo",              color: "#ffd76a", from: "Quest: Fallen Stars" },
  crown:        { slot: "helm", name: "Golden Crown",      color: "#ffd76a", price: 60 },
  tophat:       { slot: "helm", name: "Top Hat",           color: "#1a1a24", price: 18 },
  dhcrown:      { slot: "helm", name: "Dragonheart Crown", color: "#ff3a5a", from: "Quest: The Dragonheart" },
  // Capes and wings
  capehero:     { slot: "cape", name: "Hero's Cape",       color: "#2c4f9a", trim: "#ffd76a", from: "Quest: First Steps" },
  capecrimson:  { slot: "cape", name: "Crimson Cape",      color: "#a01a2a", trim: "#c9a24a", price: 5 },
  capeforest:   { slot: "cape", name: "Forest Cape",       color: "#2a6a32", trim: "#a6d86a", price: 5 },
  capeshadow:   { slot: "cape", name: "Shadow Cape",       color: "#1a1424", trim: "#6a5a8a", price: 10 },
  caperoyal:    { slot: "cape", name: "Royal Cape",        color: "#5a1a8a", trim: "#ffd76a", ermine: true, price: 35 },
  capefrost:    { slot: "cape", name: "Frost Cape",        color: "#8fc9ea", trim: "#ffffff", pattern: "snow", from: "Quest: Frostblooms" },
  capeflame:    { slot: "cape", name: "Flame Cape",        color: "#c8301a", trim: "#ffb347", pattern: "flame", from: "Quest: Imp Smashing" },
  capesand:     { slot: "cape", name: "Desert Cape",       color: "#e0b06a", trim: "#8a5a2a", from: "Quest: Scorpion Sting" },
  capeblood:    { slot: "cape", name: "Bloodmoon Cape",    color: "#5a0a1a", trim: "#ff3a5a", pattern: "moon", from: "Quest: Moonroses" },
  capevoid:     { slot: "cape", name: "Starfield Cape",    color: "#1a0a3a", trim: "#b06bff", pattern: "stars", from: "Quest: Eyes in the Dark" },
  caperainbow:  { slot: "cape", name: "Rainbow Cape",      color: "#ff5a8a", trim: "#ffffff", pattern: "rainbow", from: "Quest: Beyond the End" },
  wingsdragon:  { slot: "cape", name: "Dragon Wings",      color: "#8a1a2a", trim: "#ffb347", wings: "dragon", from: "Quest: Ashvane's Nightmare" },
  wingsangel:   { slot: "cape", name: "Angel Wings",       color: "#ffffff", trim: "#ffd76a", wings: "angel", from: "Quest: Trial of Light" },
  wingsbat:     { slot: "cape", name: "Bat Wings",         color: "#2a1a2a", trim: "#6a4a6a", wings: "bat", price: 45 },
  // Auras
  aurahearts:   { slot: "aura", name: "Hearts",            color: "#ff7fa8", price: 15 },
  auraflame:    { slot: "aura", name: "Flame Aura",        color: "#ff7a2a", price: 40 },
  aurafrost:    { slot: "aura", name: "Frost Aura",        color: "#9fe8ff", price: 40 },
  aurastorm:    { slot: "aura", name: "Storm Aura",        color: "#ffef6a", from: "Quest: Lightning Rods" },
  aurasparkle:  { slot: "aura", name: "Sparkles",          color: "#ffffff", from: "Quest: Spider Nests" },
  auravoid:     { slot: "aura", name: "Void Aura",         color: "#b06bff", price: 80 },
  auragold:     { slot: "aura", name: "Golden Radiance",   color: "#ffd76a", from: "Quest: Relics of Eternity" },
  // Pets — they follow you everywhere.
  petslime:     { slot: "pet", name: "Pet Slime",          color: "#5ad15a", from: "Quest: Slime Trouble" },
  petowl:       { slot: "pet", name: "Owl",                color: "#a07a4a", from: "Quest: Glowcaps" },
  petghost:     { slot: "pet", name: "Little Ghost",       color: "#e8f0ff", from: "Quest: Restless Champions" },
  petdragon:    { slot: "pet", name: "Baby Dragon",        color: "#d03a3a", from: "Quest: The Last Egg" },
  petcrab:      { slot: "pet", name: "Crab",               color: "#ff6a4a", from: "Quest: Crab Cull" },
  petbat:       { slot: "pet", name: "Bat",                color: "#4a2a4a", from: "Quest: Things in the Mire" },
  petrobot:     { slot: "pet", name: "Clockwork Bot",      color: "#c9a24a", from: "Quest: Drone Recall" },
  petcat:       { slot: "pet", name: "Kitten",             color: "#ff9a3a", price: 12 },
  petfox:       { slot: "pet", name: "Fox",                color: "#ff7a2a", price: 25 },
  petphoenix:   { slot: "pet", name: "Phoenix",            color: "#ff7a2a", from: "Quest: The Dragonheart" },
};
export const COS_SLOTS = [
  { id: "helm", name: "Helmet", icon: "⛑" },
  { id: "cape", name: "Cape & Wings", icon: "🧣" },
  { id: "aura", name: "Aura", icon: "✨" },
  { id: "pet", name: "Pet", icon: "🐾" },
];

// --- Tokens -----------------------------------------------------------------
/** Dragon Tokens Grit pays for a piece of gear. */
export function tokenValue(rarity, tier) {
  const base = { common: 1, rare: 3, epic: 7, legendary: 16 }[rarity] || 1;
  return base + Math.floor(Math.max(0, tier) / 3);
}
/** Tokens (and gold) Bram asks to reforge gear one rarity higher. */
export const REFORGE = {
  common:    { to: "rare",      tokens: 6,  gold: 60 },
  rare:      { to: "epic",      tokens: 18, gold: 250 },
  epic:      { to: "legendary", tokens: 45, gold: 900 },
};
// Other things Lysa sells for tokens.
export const TOKEN_GOODS = [
  { id: "potions3", name: "Three Health Potions", desc: "Straight into your belt.", icon: "⚗", price: 2 },
  { id: "elixir",   name: "Hero's Elixir",        desc: "A whole level's worth of XP.", icon: "✦", price: 14 },
  { id: "chest",    name: "Mystery Gear Chest",   desc: "Epic or better, for your region.", icon: "🎁", price: 20 },
];
