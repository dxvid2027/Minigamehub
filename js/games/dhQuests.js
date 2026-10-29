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
  tablet:    { name: "Atlantean Tablet", icon: "🗿", color: "#5ce0e6" },
  emberlily: { name: "Ember Lily",      icon: "🌺", color: "#ff7a2a" },
  moonpetal: { name: "Moonpetal",       icon: "🌸", color: "#ff8af0" },
  royalbone: { name: "Royal Bones",     icon: "🦴", color: "#e8e2d0" },
  soul:      { name: "Bound Soul",      icon: "👻", color: "#c8d8ff" },
  skycrystal:{ name: "Sky Crystal",     icon: "💠", color: "#8ac8ff" },
  sporepod:  { name: "Spore Pod",       icon: "🌱", color: "#9ad04a" },
  ancientice:{ name: "Ancient Ice",     icon: "🧊", color: "#bfe3f7" },
  loot:      { name: "Stolen Loot",     icon: "💰", color: "#ffd76a" },
  brimstone: { name: "Brimstone",       icon: "🪨", color: "#ff5a2a" },
  hoard:     { name: "Dragon Gold",     icon: "🥇", color: "#ffd24a" },
  emberore:  { name: "Ember Ore",       icon: "⛏", color: "#ff9a3a" },
  starmetal: { name: "Star Metal",      icon: "✨", color: "#fff3c0" },
  stormessence:{ name: "Storm Essence", icon: "🌩", color: "#ffef6a" },
  venomsac:  { name: "Venom Sac",       icon: "🧪", color: "#8aff5a" },
  spice:     { name: "Desert Spice",    icon: "🌶", color: "#ff5a3a" },
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
  // Greenvale's new faces.
  orla:    { name: "Captain Orla",        color: "#8a90a4", hair: "#c0503a", hat: "greathelm", hello: "Bandits on every road, and they've started eyeing Greenvale. I need a sword arm." },
  finn:    { name: "Postmaster Finn",     color: "#2c4f9a", hair: "#c08a3a", hat: "piratehat", hello: "Letters for half the world and no one brave enough to carry them. You look brave!" },
  tam:     { name: "Apprentice Tam",      color: "#8a5a2a", hair: "#ff9a3a", hello: "Master Bram says I can forge something great — if I ever get proper metal." },
  vela:    { name: "Enchantress Vela",    color: "#6a2aaa", hair: "#e8e8ff", hat: "witchhat", hello: "Fire, frost, lightning… tell me what your blade should sing, and I will teach it." },
  maelis:  { name: "Old Sage Maelis",     color: "#3a4a8a", hair: "#e8e8e8", hat: "wizard", hello: "Beyond the Throne of Eternity lie lands older than the map. Will you walk them?" },
  // Camps beyond Eternity.
  coralia: { name: "Diver Coralia",       color: "#1a7aa0", hair: "#5ce0e6", hat: "goggles", hello: "An empire under the waves, and its guards still on duty. Rude, honestly." },
  ignis:   { name: "Ashwalker Ignis",     color: "#5a4a40", hair: "#ff7a2a", hat: "hood", hello: "Walk softly. The ash remembers fire." },
  puck:    { name: "Puck the Trickster",  color: "#3ad0a0", hair: "#ff8af0", hat: "antlers", hello: "Oh, a visitor! Nothing here will hurt you. Probably. Hee." },
  morrow:  { name: "Gravekeeper Morrow",  color: "#4a4438", hair: "#c9ccd8", hat: "skullhelm", hello: "The king's bones walk at night. And at noon. Mostly always, really." },
  aeolus:  { name: "Windrider Aeolus",    color: "#6a9ad0", hair: "#ffffff", hat: "wingedhelm", hello: "Don't look down. Actually, do — it's lovely." },
  spora:   { name: "Herbalist Spora",     color: "#6a3a7a", hair: "#9ad04a", hat: "witchhat", hello: "Breathe through your nose. Or don't breathe. Your choice." },
  bjorn:   { name: "Bjorn Frostbeard",    color: "#6a8ab0", hair: "#f4f8fc", hat: "horned", hello: "Giants! Ha! I eat giants for breakfast. Well. I would." },
  ruth:    { name: "Sheriff Ruth",        color: "#8a5a2a", hair: "#3a2a1a", hat: "tophat", hello: "This is Krag's country now. I aim to change that." },
  seth:    { name: "Exorcist Seth",       color: "#2a1a1a", hair: "#ff3a1a", hat: "hood", hello: "Do not listen to the whispers from the Gate. They lie." },
  drakon:  { name: "Elder Drakon",        color: "#c9a24a", hair: "#ffd24a", hat: "dhcrown", hello: "You carry the Dragonheart. Aurelith has been waiting a long time for you." },
};
// Which giver keeps camp in which region (Greenvale's live in the village).
export const CAMP_GIVER = [null, "fen", "ines", "hilde", "brokk", "kael", "mara", "zahir", "moira", "pip", "aeris", "gus", "vlad", "yll", "sera", "knight",
  "coralia", "ignis", "puck", "morrow", "aeolus", "spora", "bjorn", "ruth", "seth", "drakon"];

// --- Quests -----------------------------------------------------------------
// `r` is the region index the quest belongs to. `slot` picks which of the
// region's scattered quest spots a collect quest uses, so two quests in the
// same region never share a spot.
export const QUESTS = [
  // Greenvale
  { id: "g_apples", r: 0, giver: "granny", name: "Apple Harvest", desc: "Granny Wen's apples rolled all over Greenvale. Find six.", type: "collect", item: "apple", n: 6, reward: { gold: 60, potions: 1, cos: ["flowercrown"] } },
  { id: "g_slimes", r: 0, giver: "farmer", name: "Slime Trouble", desc: "Squash twelve slimes before they eat the turnips.", type: "kill", foe: "slime", n: 12, reward: { gold: 90, cos: ["petslime"] } },
  { id: "g_first",  r: 0, giver: "elder",  name: "First Steps", desc: "Defeat the Slime King in the stone circle east of the village.", type: "boss", reward: { gold: 150, cos: ["capehero"] } },
  { id: "g_heart",  r: 0, giver: "elder",  name: "The Dragonheart", desc: "Defeat Aurelith, the First Dragon, at the end of every road.", type: "won", reward: { gold: 250000, tokens: 300, cos: ["dhcrown", "petphoenix"] } },
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
  // Greenvale: jobs that take you across the world.
  { id: "gv_bounty", r: 0, giver: "orla", name: "Bandit Bounty", desc: "Defeat 15 bandits — they ambush travellers on every road.", type: "kill", foe: "bandit", n: 15, reward: { gold: 3000, tokens: 10, cos: ["greathelm"] } },
  { id: "gv_raid",   r: 0, giver: "orla", name: "Defend Greenvale", desc: "When the bell rings and raiders storm the village, drive them all out.", type: "raid", n: 1, reward: { gold: 2500, tokens: 10, cos: ["capeknight"] } },
  { id: "gv_letter", r: 1, giver: "finn", name: "Letter for the Ranger", desc: "Carry Finn's letter to Ranger Fen at his camp in Whisperwood.", type: "deliver", to: "fen", reward: { gold: 300, cos: ["petpigeon"] } },
  { id: "gv_parcel", r: 6, giver: "finn", name: "Parcel for the Captain", desc: "A very wet parcel for Captain Mara on the Coral Coast.", type: "deliver", to: "mara", reward: { gold: 4000, tokens: 8, cos: ["catears"] } },
  { id: "gv_orders", r: 15, giver: "finn", name: "Sealed Orders", desc: "Deliver the king's sealed orders to the Last Knight on the Throne of Eternity.", type: "deliver", to: "knight", reward: { gold: 30000, tokens: 40 } },
  { id: "gv_ore",    r: 4, giver: "tam", name: "Fire for the Forge", desc: "Dig up 5 lumps of Ember Ore in the Ember Caldera.", type: "collect", item: "emberore", n: 5, reward: { gold: 1500, tokens: 15 } },
  { id: "gv_star",   r: 14, giver: "tam", name: "Star Metal", desc: "Bring 5 pieces of Star Metal from the Celestial Gardens.", type: "collect", item: "starmetal", n: 5, reward: { gold: 20000, tokens: 50 } },
  { id: "gv_storm",  r: 10, giver: "vela", name: "Essence of Storms", desc: "Gather 6 Storm Essences on Stormspire Peaks. Vela will teach your weapon the Tempest.", type: "collect", item: "stormessence", n: 6, reward: { gold: 6000, enchant: "storm" } },
  { id: "gv_venom",  r: 11, giver: "vela", name: "Venom Sacs", desc: "Crystal spiders carry venom sacs. Bring 6 and learn the Venom enchantment.", type: "drop", item: "venomsac", foe: "spider", n: 6, chance: 0.4, reward: { gold: 8000, enchant: "poison" } },
  { id: "gv_spice",  r: 7, giver: "granny", name: "Desert Spices", desc: "Granny's stew needs 5 spices from the Mirage Desert.", type: "collect", item: "spice", n: 5, reward: { gold: 4500, potions: 3, cos: ["auranotes"] } },
  { id: "gv_champ",  r: 0, giver: "maelis", name: "Champion of the Realms", desc: "Banish three Nightmare bosses at their altars.", type: "nightmares", n: 3, reward: { gold: 20000, tokens: 30, cos: ["wingsphoenix"] } },
  { id: "gv_beyond", r: 0, giver: "maelis", name: "Beyond the Throne", desc: "Defeat Nyxara and set foot in Sunken Atlantis.", type: "reach", reach: 16, reward: { gold: 40000, tokens: 40, cos: ["phoenixcrown"] } },
  // Beyond Eternity.
  { id: "at_tab",  r: 16, giver: "coralia", name: "Drowned Words", desc: "Seven Atlantean tablets lie in the ruins.", type: "collect", item: "tablet", n: 7, reward: { gold: 30000, cos: ["aurabubbles"] } },
  { id: "at_tri",  r: 16, giver: "coralia", name: "Off Duty", desc: "Relieve 12 Triton Guards of their posts.", type: "kill", foe: "triton", n: 12, reward: { gold: 32000, tokens: 30, cos: ["petkraken"] } },
  { id: "as_lily", r: 17, giver: "ignis", name: "Flowers in the Ash", desc: "Seven Ember Lilies bloom in the Ashen Wastes.", type: "collect", item: "emberlily", n: 7, reward: { gold: 36000, cos: ["capelava"] } },
  { id: "as_hound",r: 17, giver: "ignis", name: "Cinder Hounds", desc: "Defeat 12 Cinder Hounds.", type: "kill", foe: "cinderhound", n: 12, reward: { gold: 38000, tokens: 30, cos: ["petwolf"] } },
  { id: "fe_petal",r: 18, giver: "puck", name: "Moonpetals", desc: "Pick eight Moonpetals. Don't eat them.", type: "collect", item: "moonpetal", n: 8, reward: { gold: 42000, cos: ["wingsfairy"] } },
  { id: "fe_elite",r: 18, giver: "puck", name: "Court of Thorns", desc: "Defeat five elite monsters in the Feywild.", type: "elite", n: 5, reward: { gold: 44000, tokens: 35, cos: ["antlers"] } },
  { id: "bo_bones",r: 19, giver: "morrow", name: "The King's Bones", desc: "Seven of the old king's bones went walkabout.", type: "collect", item: "royalbone", n: 7, reward: { gold: 48000, cos: ["bonecrown"] } },
  { id: "bo_souls",r: 19, giver: "morrow", name: "Bound Souls", desc: "Bone Mages carry bound souls. Free six.", type: "drop", item: "soul", foe: "bonemage", n: 6, chance: 0.4, reward: { gold: 50000, tokens: 35, cos: ["aurasouls"] } },
  { id: "sk_cryst",r: 20, giver: "aeolus", name: "Sky Crystals", desc: "Seven Sky Crystals hold the islands up.", type: "collect", item: "skycrystal", n: 7, reward: { gold: 55000, cos: ["capeaurora"] } },
  { id: "sk_harpy",r: 20, giver: "aeolus", name: "Harpy Season", desc: "Defeat 12 Sky Harpies.", type: "kill", foe: "skyharpy", n: 12, reward: { gold: 57000, tokens: 40, cos: ["petfairy"] } },
  { id: "my_pods", r: 21, giver: "spora", name: "Spore Pods", desc: "Eight Spore Pods for Spora's cures.", type: "collect", item: "sporepod", n: 8, reward: { gold: 62000, cos: ["auraleaves"] } },
  { id: "my_beast",r: 21, giver: "spora", name: "Overgrowth", desc: "Defeat 6 Spore Beasts.", type: "kill", foe: "sporebeast", n: 6, reward: { gold: 64000, tokens: 45, cos: ["petgolem"] } },
  { id: "gl_ice",  r: 22, giver: "bjorn", name: "Ancient Ice", desc: "Seven blocks of ice older than the world.", type: "collect", item: "ancientice", n: 7, reward: { gold: 70000, cos: ["petpenguin"] } },
  { id: "gl_giant",r: 22, giver: "bjorn", name: "Giant Slayer", desc: "Defeat 6 Frost Giants.", type: "kill", foe: "frostgiant", n: 6, reward: { gold: 72000, tokens: 45, cos: ["kabuto"] } },
  { id: "bl_loot", r: 23, giver: "ruth", name: "Stolen Goods", desc: "Recover 8 bags of stolen loot from the bandits' stashes.", type: "collect", item: "loot", n: 8, reward: { gold: 78000, cos: ["jester"] } },
  { id: "bl_gang", r: 23, giver: "ruth", name: "Clean Up the Badlands", desc: "Defeat 20 bandits.", type: "kill", foe: "bandit", n: 20, reward: { gold: 80000, tokens: 50, cos: ["bandana"] } },
  { id: "in_brim", r: 24, giver: "seth", name: "Brimstone", desc: "Seven chunks of brimstone to seal the Gate.", type: "collect", item: "brimstone", n: 7, reward: { gold: 88000, cos: ["auraaurora"] } },
  { id: "in_elite",r: 24, giver: "seth", name: "Hellspawn", desc: "Defeat six elite monsters at the Infernal Gate.", type: "elite", n: 6, reward: { gold: 90000, tokens: 55, cos: ["wingsdemon"] } },
  { id: "dr_hoard",r: 25, giver: "drakon", name: "The First Hoard", desc: "Eight coins from the oldest dragon hoard of all.", type: "collect", item: "hoard", n: 8, reward: { gold: 100000, cos: ["dragonking"] } },
  { id: "dr_night",r: 25, giver: "drakon", name: "Dream of the First Dragon", desc: "Summon and banish Aurelith's Nightmare.", type: "nightmare", reward: { gold: 300000, tokens: 200, cos: ["wingsgold"] } },
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
  greathelm:    { slot: "helm", name: "Knight's Greathelm", color: "#c9ccd8", from: "Quest: Bandit Bounty" },
  kabuto:       { slot: "helm", name: "Kabuto",            color: "#8a1a1a", from: "Quest: Giant Slayer" },
  jester:       { slot: "helm", name: "Jester's Cap",      color: "#ff3a5a", from: "Quest: Stolen Goods" },
  catears:      { slot: "helm", name: "Cat Ears",          color: "#ff9a3a", from: "Quest: Parcel for the Captain" },
  phoenixcrown: { slot: "helm", name: "Phoenix Crown",     color: "#ff7a2a", from: "Quest: Beyond the Throne" },
  antlers:      { slot: "helm", name: "Fey Antlers",       color: "#8a5a2a", from: "Quest: Court of Thorns" },
  bonecrown:    { slot: "helm", name: "Bone Crown",        color: "#e8e2d0", from: "Quest: The King's Bones" },
  bandana:      { slot: "helm", name: "Outlaw's Bandana",  color: "#c0203a", from: "Quest: Clean Up the Badlands" },
  dragonking:   { slot: "helm", name: "Dragon King's Helm", color: "#ffd24a", from: "Quest: The First Hoard" },
  wizardgold:   { slot: "helm", name: "Archmage Hat",      color: "#2a1a6a", price: 70 },
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
  capeknight:   { slot: "cape", name: "Knight's Tabard",   color: "#f4f4f6", trim: "#c0203a", pattern: "cross", from: "Quest: Defend Greenvale" },
  capeaurora:   { slot: "cape", name: "Aurora Cape",       color: "#1a6a6a", trim: "#b06bff", pattern: "aurora", from: "Quest: Sky Crystals" },
  capelava:     { slot: "cape", name: "Magma Cape",        color: "#2a1210", trim: "#ff7a2a", pattern: "lava", from: "Quest: Flowers in the Ash" },
  wingsphoenix: { slot: "cape", name: "Phoenix Wings",     color: "#ff7a2a", trim: "#ffd76a", wings: "angel", fire: true, from: "Quest: Champion of the Realms" },
  wingsfairy:   { slot: "cape", name: "Fairy Wings",       color: "#9affe8", trim: "#ff8af0", wings: "fairy", from: "Quest: Moonpetals" },
  wingsdemon:   { slot: "cape", name: "Demon Wings",       color: "#5a0a0a", trim: "#ff3a1a", wings: "dragon", from: "Quest: Hellspawn" },
  wingsgold:    { slot: "cape", name: "Wings of the First Dragon", color: "#d8a020", trim: "#fff3a0", wings: "dragon", from: "Quest: Dream of the First Dragon" },
  capegalaxy:   { slot: "cape", name: "Galaxy Cape",       color: "#0a0a2a", trim: "#7cf0ff", pattern: "stars", price: 55 },
  // Auras
  aurahearts:   { slot: "aura", name: "Hearts",            color: "#ff7fa8", price: 15 },
  auraflame:    { slot: "aura", name: "Flame Aura",        color: "#ff7a2a", price: 40 },
  aurafrost:    { slot: "aura", name: "Frost Aura",        color: "#9fe8ff", price: 40 },
  aurastorm:    { slot: "aura", name: "Storm Aura",        color: "#ffef6a", from: "Quest: Lightning Rods" },
  aurasparkle:  { slot: "aura", name: "Sparkles",          color: "#ffffff", from: "Quest: Spider Nests" },
  auravoid:     { slot: "aura", name: "Void Aura",         color: "#b06bff", price: 80 },
  auragold:     { slot: "aura", name: "Golden Radiance",   color: "#ffd76a", from: "Quest: Relics of Eternity" },
  aurabubbles:  { slot: "aura", name: "Bubbles",           color: "#9fe8ff", from: "Quest: Drowned Words" },
  auraleaves:   { slot: "aura", name: "Falling Leaves",    color: "#8acb4a", from: "Quest: Spore Pods" },
  auranotes:    { slot: "aura", name: "Music Notes",       color: "#ff8af0", from: "Quest: Desert Spices" },
  auraaurora:   { slot: "aura", name: "Aurora",            color: "#7cf0ff", from: "Quest: Brimstone" },
  aurasouls:    { slot: "aura", name: "Wandering Souls",   color: "#c8d8ff", from: "Quest: Bound Souls" },
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
  petwolf:      { slot: "pet", name: "Wolf Pup",           color: "#8b90a0", from: "Quest: Cinder Hounds" },
  petpenguin:   { slot: "pet", name: "Penguin",            color: "#1a1a24", from: "Quest: Ancient Ice" },
  petfairy:     { slot: "pet", name: "Fairy",              color: "#ff8af0", from: "Quest: Harpy Season" },
  petgolem:     { slot: "pet", name: "Pebble Golem",       color: "#8a8a92", from: "Quest: Overgrowth" },
  petkraken:    { slot: "pet", name: "Baby Kraken",        color: "#8a3aca", from: "Quest: Off Duty" },
  petpigeon:    { slot: "pet", name: "Post Pigeon",        color: "#9aa0b4", from: "Quest: Letter for the Ranger" },
  petunicorn:   { slot: "pet", name: "Tiny Unicorn",       color: "#ffffff", price: 90 },
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

/** Plain-language names for the enchantment picker. */
export const ENCHANT_NAMES = { burn: "Fire", shock: "Lightning", chill: "Ice", poison: "Venom", leech: "Vampire", crit: "Keen", holy: "Holy", storm: "Tempest" };
