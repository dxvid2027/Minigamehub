// ==========================================================================
// Abyss Angler — the ocean's inhabitants: depth zones, species, treasures,
// bait, and the painter that draws them.
//
// Every species is drawn from its anatomy rather than as a recoloured blob:
// a body outline of its own proportions, countershading (dark back, pale
// belly), scales, a lateral line and a gill cover, fins with rays, the
// right tail (forked, lunate, rounded, shark-like) and its own markings —
// a mackerel's tiger stripes, a clownfish's bands, a salmon's spots, the
// photophores of the deep. Odd shapes (rays, squid, octopus, flatfish, the
// sunfish, a seahorse, crabs) get bespoke drawings.
//
// Fish face +x and are drawn around (0, 0); L is half the body length.
// ==========================================================================

export const ZONES = [
  { name: "Sunlit Shallows", from: 0,   water: ["#4fc3e8", "#2b8fc4"], mote: "#bff0ff", weed: true },
  { name: "Kelp Forest",     from: 60,  water: ["#2b8fc4", "#1d6b8f"], mote: "#a8e6c8", weed: true },
  { name: "Twilight Reach",  from: 140, water: ["#1d6b8f", "#123f5e"], mote: "#8fd0ff", weed: false },
  { name: "Midnight Drift",  from: 240, water: ["#123f5e", "#0a2138"], mote: "#6bb6ff", weed: false },
  { name: "The Trench",      from: 360, water: ["#0a2138", "#05101f"], mote: "#7c5cff", weed: false },
  { name: "Abyssal Floor",   from: 480, water: ["#05101f", "#02060d"], mote: "#ff4fd8", weed: false },
  { name: "Hadal Gate",      from: 600, water: ["#03040a", "#010104"], mote: "#ff7a3a", weed: false },
];
export const MAX_DEPTH = 720;

// --- Species ----------------------------------------------------------------
// body: fusiform | deep | slim | puffer | eel | ray | manta | squid | octopus |
//       sword | shark | flat | mola | seahorse | angler | lion | crab | blob |
//       barreleye | isopod
// back/belly: countershading; fin: fins; pat: markings; tail: fork | moon |
//   round | square | point | shark; dorsal: soft | spiny | sail | double | long
const F = (id, name, min, max, value, fight, size, rarity, look, extra = {}) => ({ id, name, min, max, value, fight, size, rarity, ...look, ...extra });
export const FISH = [
  // Sunlit and kelp water
  F("sardine", "Sardine", 0, 90, 12, 0.5, 0.55, 1, { body: "slim", back: "#3a6a8a", belly: "#e8f2f6", fin: "#9fbccc", pat: "spotsRow", tail: "fork", dorsal: "soft" }, { fact: "Travels in shoals of millions." }),
  F("herring", "Herring", 0, 100, 16, 0.55, 0.6, 1, { body: "slim", back: "#3a6a6a", belly: "#eef4f2", fin: "#a8c4c0", pat: "shine", tail: "fork", dorsal: "soft" }, { fact: "Herring talk to each other by bubbling." }),
  F("perch", "Sea Perch", 0, 110, 20, 0.7, 0.7, 1, { body: "deep", back: "#5f7a3a", belly: "#e8e0b0", fin: "#d86a3a", pat: "barsV", patCol: "#2a3a1a", tail: "square", dorsal: "spiny" }, { fact: "Its spiny fin keeps bigger fish from swallowing it." }),
  F("mackerel", "Mackerel", 10, 130, 34, 0.9, 0.75, 1, { body: "fusiform", back: "#1f6a6a", belly: "#f2f6f6", fin: "#7aa0a8", pat: "tiger", patCol: "#0a2a30", tail: "fork", dorsal: "double", finlets: "#9ab0b8" }, { fact: "Never stops swimming — it has no swim bladder." }),
  F("clown", "Clownfish", 0, 100, 48, 0.6, 0.55, 2, { body: "deep", back: "#ff7a1a", belly: "#ffab4a", fin: "#ff8a2a", pat: "clown", tail: "round", dorsal: "soft", finEdge: "#111" }, { fact: "Lives safely among the stinging tentacles of anemones." }),
  F("butterfly", "Butterflyfish", 0, 110, 52, 0.6, 0.55, 2, { body: "disc", back: "#ffd21a", belly: "#fff2a0", fin: "#ffd21a", pat: "eyeband", tail: "square", dorsal: "soft" }, { fact: "A fake eye-spot near its tail fools predators." }),
  F("snapper", "Red Snapper", 20, 150, 55, 1.1, 0.85, 2, { body: "deep", back: "#d83a3a", belly: "#ffb0a0", fin: "#e8574a", pat: "scales", tail: "fork", dorsal: "spiny" }, { fact: "Can live for more than fifty years." }),
  F("puffer", "Pufferfish", 25, 160, 70, 0.8, 0.8, 2, { body: "puffer", back: "#c9a03a", belly: "#fff2c0", fin: "#e0b84a", pat: "spots", patCol: "#5a3a1a", tail: "round" }, { fact: "Swallows water to swell into a spiky ball." }),
  F("parrot", "Parrotfish", 20, 140, 80, 1.0, 0.9, 2, { body: "deep", back: "#1ab0a0", belly: "#7ae8c8", fin: "#ff7ab0", pat: "parrot", tail: "moon", dorsal: "soft", beak: true }, { fact: "Crunches coral — its poop is white sand!" }),
  F("seahorse", "Seahorse", 0, 90, 90, 0.4, 0.5, 3, { body: "seahorse", back: "#ff9a3a", belly: "#ffd08a", fin: "#ffe0a0" }, { fact: "The father carries the babies." }),
  F("flounder", "Flounder", 30, 170, 85, 1.0, 0.9, 2, { body: "flat", back: "#8a7a5a", belly: "#c8b890", fin: "#a08a60", pat: "spots", patCol: "#5a4a30" }, { fact: "Both its eyes end up on one side of its head." }),
  F("lion", "Lionfish", 30, 160, 110, 0.9, 0.8, 3, { body: "lion", back: "#e8e0d0", belly: "#f8f0e8", fin: "#c0302a", pat: "zebra", patCol: "#a8201a", tail: "round" }, { fact: "Its frilly spines are venomous." }),
  F("rockcod", "Rock Cod", 40, 200, 88, 1.3, 0.95, 2, { body: "fusiform", back: "#6a5a3a", belly: "#d8c8a0", fin: "#8a7a5a", pat: "mottle", patCol: "#3a2e1a", tail: "round", dorsal: "spiny", barbel: true }, { fact: "Hides in rock cracks and ambushes prey." }),
  F("seabass", "Sea Bass", 50, 220, 120, 1.5, 1.05, 2, { body: "fusiform", back: "#4a5870", belly: "#e8ecf0", fin: "#7c8ea8", pat: "lines", patCol: "#2a3448", tail: "fork", dorsal: "double" }, { fact: "Starts life as a female and may become male." }),
  F("salmon", "Atlantic Salmon", 30, 180, 140, 1.6, 1.1, 3, { body: "fusiform", back: "#3a5a6a", belly: "#f4e8e0", fin: "#6a8a9a", pat: "salmon", patCol: "#1a2a30", tail: "square", dorsal: "soft", adipose: true }, { fact: "Swims back to the river where it hatched." }),
  F("barracuda", "Barracuda", 60, 220, 150, 1.8, 1.2, 3, { body: "slim", back: "#4a5a6a", belly: "#e8eef2", fin: "#5a6a7a", pat: "barsV", patCol: "#2a3440", tail: "fork", dorsal: "double", jaw: true }, { fact: "Rockets after prey at nearly 60 km/h." }),
  F("octopus", "Reef Octopus", 40, 200, 175, 1.3, 0.9, 3, { body: "octopus", back: "#c0503a", belly: "#ff9a7a", fin: "#e87a5a" }, { fact: "Three hearts, blue blood, and it can change colour." }),
  F("ray", "Sting Ray", 60, 240, 165, 1.6, 1.2, 3, { body: "ray", back: "#8a7858", belly: "#f0e8d8", fin: "#6a5a40", pat: "spots", patCol: "#5a4a30" }, { fact: "Buries itself in sand with only its eyes showing." }),
  F("squid", "Reef Squid", 70, 260, 190, 1.4, 0.9, 3, { body: "squid", back: "#ff8fb4", belly: "#ffd0e0", fin: "#c95f84" }, { fact: "Jets backwards by squirting water." }),
  F("eel", "Moray Eel", 80, 280, 230, 1.9, 1.1, 3, { body: "eel", back: "#4a7a3a", belly: "#8aaa5a", fin: "#5a8a3a", pat: "mottle", patCol: "#2a4a1a" }, { fact: "Has a second set of jaws in its throat." }),
  F("mahi", "Mahi-Mahi", 60, 200, 240, 2.0, 1.2, 3, { body: "mahi", back: "#2aa05a", belly: "#ffe04a", fin: "#2a8ad0", pat: "spots", patCol: "#1a5a8a", tail: "fork", dorsal: "long" }, { fact: "Flashes gold, green and blue when hooked." }),
  F("grouper", "Giant Grouper", 90, 260, 260, 2.2, 1.4, 3, { body: "deep", back: "#5a5a3a", belly: "#c8c098", fin: "#6a6a4a", pat: "mottle", patCol: "#2a2a1a", tail: "round", dorsal: "spiny", bigmouth: true }, { fact: "Can grow as big as a small car." }),
  F("tuna", "Bluefin Tuna", 100, 300, 320, 2.3, 1.35, 3, { body: "fusiform", back: "#1a2a6a", belly: "#e8eef6", fin: "#3a4a7a", pat: "shine", tail: "moon", dorsal: "double", finlets: "#ffd24a" }, { fact: "Keeps its body warmer than the sea around it." }),
  F("halibut", "Halibut", 110, 300, 300, 2.0, 1.4, 3, { body: "flat", back: "#5a5a48", belly: "#e8e8e0", fin: "#6a6a58", pat: "mottle", patCol: "#3a3a2a" }, { fact: "The biggest flatfish, as heavy as a grand piano." }),
  F("swordfish", "Swordfish", 120, 320, 430, 2.7, 1.45, 3, { body: "sword", back: "#3a4a5a", belly: "#c8d0d8", fin: "#4a5a6a", pat: "shine", tail: "moon", dorsal: "soft" }, { fact: "Heats its eyes so it can see in cold water." }),
  F("sunfish", "Ocean Sunfish", 100, 300, 560, 1.8, 1.6, 4, { body: "mola", back: "#8a94a0", belly: "#d8dee4", fin: "#7a8490", pat: "mottle", patCol: "#a8b0b8" }, { fact: "The world's heaviest bony fish — over 2 tonnes." }),
  F("hammer", "Hammerhead", 120, 320, 520, 2.8, 1.7, 4, { body: "shark", back: "#6a7884", belly: "#e8ecf0", fin: "#5a6874", tail: "shark", hammer: true }, { fact: "Its wide head works like a metal detector." }),
  F("marlin", "Blue Marlin", 130, 330, 650, 3.0, 1.7, 4, { body: "sword", back: "#1a3a8a", belly: "#e0e8f4", fin: "#2a5ad0", pat: "barsV", patCol: "#6ab0ff", tail: "moon", dorsal: "sail" }, { fact: "Raises its sail fin to herd fish." }),
  F("manta", "Manta Ray", 140, 340, 700, 2.6, 1.9, 4, { body: "manta", back: "#1a1a24", belly: "#f0f0f4", fin: "#2a2a34" }, { fact: "Wingspan up to 7 metres, and very clever." }),
  // Twilight and midnight
  F("lantern", "Lanternfish", 150, 380, 380, 1.2, 0.7, 3, { body: "slim", back: "#2a3a5a", belly: "#5a6a8a", fin: "#7cf0d0", pat: "photo", tail: "fork", dorsal: "soft" }, { glow: "#7cf0d0", fact: "Rows of glowing dots light its belly." }),
  F("hatchet", "Hatchetfish", 160, 390, 420, 1.3, 0.65, 3, { body: "hatchet", back: "#8a9ab8", belly: "#e8f0ff", fin: "#c9d4e8", pat: "photo", tail: "fork" }, { glow: "#c9d4e8", fact: "Silver mirrors on its sides make it vanish." }),
  F("barreleye", "Barreleye", 200, 450, 700, 1.6, 0.8, 4, { body: "barreleye", back: "#3a3a4a", belly: "#6a6a7a", fin: "#8a8aa0", tail: "fork" }, { glow: "#7affa0", fact: "Looks up through a see-through head." }),
  F("viper", "Viperfish", 200, 430, 620, 2.5, 1.0, 4, { body: "fang", back: "#1a2a4a", belly: "#2a4a6a", fin: "#5ce6ff", pat: "photo", tail: "fork" }, { glow: "#5ce6ff", fact: "Teeth so long they don't fit in its mouth." }),
  F("gulper", "Gulper Eel", 220, 460, 760, 2.8, 1.3, 4, { body: "eel", back: "#1a1a2a", belly: "#2a2a3a", fin: "#a86bff", gulper: true }, { glow: "#a86bff", fact: "A mouth like a pelican's pouch." }),
  F("anglerf", "Anglerfish", 250, 500, 950, 3.1, 1.2, 4, { body: "angler", back: "#2a2430", belly: "#3a3440", fin: "#ffd76a" }, { glow: "#ffd76a", fact: "Fishes with its own glowing lure." }),
  F("oarfish", "Oarfish", 260, 520, 1100, 2.6, 1.6, 4, { body: "eel", back: "#c9ccd8", belly: "#e8eaf0", fin: "#ff5470", pat: "spots", patCol: "#5a6a8a", crest: true }, { glow: "#ff5470", fact: "The longest bony fish — longer than a bus." }),
  F("vampsquid", "Vampire Squid", 300, 540, 1350, 2.9, 1.15, 4, { body: "squid", back: "#5c1a34", belly: "#8a2a4a", fin: "#ff4fd8", cloak: true }, { glow: "#ff4fd8", fact: "Turns its cloak inside out when scared." }),
  F("dumbo", "Dumbo Octopus", 320, 560, 1500, 2.2, 1.1, 4, { body: "octopus", back: "#e88fa8", belly: "#ffd0dd", fin: "#ffd0dd", dumbo: true }, { glow: "#ffd0dd", fact: "Flaps ear-like fins to swim." }),
  F("blobfish", "Blobfish", 300, 560, 1250, 1.4, 1.0, 4, { body: "blob", back: "#e8a8b0", belly: "#f4c8cc", fin: "#d08890" }, { fact: "Firm in the deep, floppy at the surface." }),
  F("kingcrab", "Golden King Crab", 300, 560, 1400, 2.4, 1.0, 4, { body: "crab", back: "#d8902a", belly: "#ffd08a", fin: "#b06a1a" }, { fact: "Walks sideways across the abyss on ten legs." }),
  F("chimaera", "Ghost Shark", 340, 580, 1900, 3.4, 1.5, 4, { body: "shark", back: "#8fa8c9", belly: "#d8e4f0", fin: "#c9e0ff", tail: "point", ghost: true }, { glow: "#c9e0ff", fact: "Older than the dinosaurs." }),
  F("isopod", "Giant Isopod", 350, 600, 1700, 2.6, 1.1, 4, { body: "isopod", back: "#c8b8a8", belly: "#e8dcd0", fin: "#a89888" }, { fact: "A woodlouse the size of a cat." }),
  F("coelacanth", "Coelacanth", 350, 600, 2800, 3.6, 1.6, 5, { body: "fusiform", back: "#2a3a5a", belly: "#4a5a7a", fin: "#3a4a6a", pat: "spots", patCol: "#c8d4e8", tail: "round", dorsal: "soft", lobed: true }, { fact: "Thought extinct for 66 million years." }),
  F("frilled", "Frilled Shark", 360, 600, 2400, 3.8, 1.7, 5, { body: "eel", back: "#5c5040", belly: "#7a6e5c", fin: "#8f7f60", frills: true }, { fact: "Wears six frilly gill slits like a collar." }),
  F("goblin", "Goblin Shark", 380, 600, 3000, 4.2, 1.8, 5, { body: "shark", back: "#e8a8b4", belly: "#f4ccd4", fin: "#c88894", tail: "shark", goblin: true }, { fact: "Shoots its jaws out to grab prey." }),
  // The hadal gate
  F("grenadier", "Abyssal Grenadier", 560, 720, 3200, 3.4, 1.3, 5, { body: "eel", back: "#4a4a5a", belly: "#7a7a8a", fin: "#9a9ab0", rattail: true }, { fact: "A rat-tailed fish that has lost its tail fin." }),
  F("snailfish", "Hadal Snailfish", 600, 720, 3800, 2.8, 1.0, 5, { body: "blob", back: "#f0d8e0", belly: "#fff0f4", fin: "#e0c0cc", ghostly: true }, { glow: "#ffd0e0", fact: "Lives deeper than any other fish — 8 km down." }),
  // --- Abyssal giants: only on the right bait, at the right depth ------------
  F("colossal", "Colossal Squid", 400, 600, 6000, 5.5, 2.4, 6, { body: "squid", back: "#a83a5c", belly: "#ff8fb4", fin: "#ff8fb4" }, { boss: true, bait: "chum", glow: "#ff8fb4", fact: "Has the largest eyes in the animal kingdom." }),
  F("megamouth", "Megamouth", 420, 600, 7500, 5.8, 2.6, 6, { body: "shark", back: "#3a4a5c", belly: "#7fb6d8", fin: "#2a3a4c", tail: "shark", mega: true }, { boss: true, bait: "krill", glow: "#7fb6d8", fact: "A gentle giant that filters krill." }),
  F("leviathan", "Pale Leviathan", 450, 600, 9500, 6.4, 2.9, 6, { body: "eel", back: "#d8dce8", belly: "#ffffff", fin: "#ffffff", crest: true }, { boss: true, bait: "lure", glow: "#ffffff", fact: "Sailors' legends were true after all." }),
  F("kraken", "Deep Kraken", 480, 600, 12000, 7.0, 3.1, 6, { body: "octopus", back: "#2a1a44", belly: "#5a3a7a", fin: "#a86bff" }, { boss: true, bait: "chum", glow: "#a86bff", fact: "Ships' logs mention it. Nobody believed them." }),
  F("seraph", "Abyss Seraph", 500, 600, 15000, 7.6, 2.7, 6, { body: "angler", back: "#1a2a4c", belly: "#2a3a5c", fin: "#5ce6ff" }, { boss: true, bait: "lure", glow: "#5ce6ff", fact: "Its lure shines like a falling star." }),
  F("titanray", "Titan Ray", 520, 600, 20000, 8.2, 3.4, 6, { body: "manta", back: "#3a2a1a", belly: "#ffd76a", fin: "#2a1a0a" }, { boss: true, bait: "krill", glow: "#ffd76a", fact: "Its wings could cover a tennis court." }),
  F("megalodon", "Megalodon", 620, 720, 30000, 9.0, 4.0, 6, { body: "shark", back: "#4a5058", belly: "#d8dce0", fin: "#3a4048", tail: "shark" }, { boss: true, bait: "pearl", glow: "#ff7a3a", fact: "It never went extinct. It just went deeper." }),
  F("abyssking", "The Abyss King", 650, 720, 40000, 9.6, 3.4, 6, { body: "angler", back: "#2a0a10", belly: "#4a1a20", fin: "#ff3a2a" }, { boss: true, bait: "pearl", glow: "#ff3a2a", fact: "The light at the bottom of the world." }),
];

// Things that are not fish, but still come up on a hook.
export const TREASURES = [
  { id: "boot",   name: "Old Boot",           value: 2,    weight: 30, min: 0,   fact: "Someone, somewhere, is still looking for it." },
  { id: "can",    name: "Rusty Can",          value: 1,    weight: 26, min: 0,   fact: "Please don't throw these in the sea." },
  { id: "bottle", name: "Message in a Bottle", value: 120, weight: 10, min: 20,  fact: "\"If you find this… keep fishing deeper.\"" },
  { id: "pearl",  name: "Giant Pearl",        value: 450,  weight: 6,  min: 80,  fact: "Took an oyster twenty years to make." },
  { id: "chest",  name: "Sunken Chest",       value: 1200, weight: 4,  min: 160, fact: "Gold coins from a ship nobody remembers." },
  { id: "idol",   name: "Abyssal Idol",       value: 3500, weight: 1.5, min: 400, fact: "It hums when you hold it." },
];

export const BAITS = [
  { id: "worm",  name: "Worm",       cost: 0,   bias: 1, tint: "#c98f6a", desc: "Free and endless. Common fish, shallow water." },
  { id: "krill", name: "Krill",      cost: 40,  bias: 2, tint: "#ff9f9f", desc: "Mid-water shoals — and two filter-feeding giants." },
  { id: "chum",  name: "Chum",       cost: 120, bias: 3, tint: "#c94a4a", desc: "Blood in the water. Big, angry things." },
  { id: "lure",  name: "Glow Lure",  cost: 260, bias: 4, tint: "#7cf0d0", desc: "Only the deep answers a light." },
  { id: "pearl", name: "Abyss Pearl", cost: 650, bias: 5, tint: "#ffb07a", desc: "Wakes the oldest things at the Hadal Gate." },
];

// ============================================================ painting ====
const TAU = Math.PI * 2;

function hexToRgb(h) { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
export function hexA(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function shade(hex, k) { const [r, g, b] = hexToRgb(hex); const f = (c) => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k); return `rgb(${f(r)},${f(g)},${f(b)})`; }

/**
 * Draws a species. opts: { alpha, golden, puffed (0..1), struggle (0..1) }.
 * t drives the swimming motion.
 */
export function paintFish(ctx, spec, t, scale = 1, opts = {}) {
  const L = 26 * spec.size * scale;
  ctx.save();
  ctx.globalAlpha *= opts.alpha ?? 1;
  const look = opts.golden ? goldenLook(spec) : spec;
  if (spec.glow) {
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, L * 1.7);
    g.addColorStop(0, hexA(spec.glow, 0.32)); g.addColorStop(1, hexA(spec.glow, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, L * 1.7, 0, TAU); ctx.fill();
  }
  if (opts.golden) {
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, L * 1.9);
    g.addColorStop(0, "rgba(255,220,110,0.4)"); g.addColorStop(1, "rgba(255,220,110,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, L * 1.9, 0, TAU); ctx.fill();
  }
  const fn = BODY[spec.body] || BODY.fusiform;
  fn(ctx, look, L, t, opts);
  if (opts.golden) sparkle(ctx, L, t);
  ctx.restore();
}

function goldenLook(spec) {
  return { ...spec, back: "#c9921a", belly: "#fff2b0", fin: "#ffd24a", patCol: "#a8701a" };
}

function sparkle(ctx, L, t) {
  for (let i = 0; i < 5; i++) {
    const a = t * 1.3 + i * 1.26, r = L * (0.6 + (i % 3) * 0.3);
    const x = Math.cos(a) * r, y = Math.sin(a * 1.3) * r * 0.5, s = L * 0.07 * (0.6 + Math.abs(Math.sin(t * 4 + i)));
    ctx.fillStyle = "rgba(255,248,210,0.95)";
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.3, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.3, y); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x, y + s * 0.3); ctx.lineTo(x + s, y); ctx.lineTo(x, y - s * 0.3); ctx.closePath(); ctx.fill();
  }
}

/** Countershaded fill for the current path, from the back (top) to the belly. */
function bodyFill(ctx, s, H) {
  const g = ctx.createLinearGradient(0, -H, 0, H);
  g.addColorStop(0, shade(s.back, -0.2)); g.addColorStop(0.38, s.back); g.addColorStop(0.62, s.belly); g.addColorStop(1, shade(s.belly, -0.08));
  ctx.fillStyle = g;
}

/** A fish-shaped outline: snout at +L, tail stalk at -L. */
function fishPath(ctx, L, H, o = {}) {
  const hump = o.hump ?? 1, belly = o.belly ?? 1, stalk = o.stalk ?? 0.2, snout = o.snout ?? 0.5, peak = o.peak ?? 0.15;
  ctx.beginPath();
  ctx.moveTo(L, H * 0.06);
  ctx.bezierCurveTo(L, -H * snout * 0.8, L * (peak + 0.45), -H * hump, L * peak, -H * hump);
  ctx.bezierCurveTo(-L * 0.35, -H * hump, -L * 0.72, -H * stalk * 1.6, -L, -H * stalk);
  ctx.lineTo(-L, H * stalk);
  ctx.bezierCurveTo(-L * 0.72, H * stalk * 1.6, -L * 0.35, H * belly, L * peak, H * belly);
  ctx.bezierCurveTo(L * (peak + 0.45), H * belly, L, H * snout * 0.6, L, H * 0.06);
  ctx.closePath();
}

function tailFin(ctx, s, L, H, t, kind) {
  const wag = Math.sin(t * 4) * 0.25;
  ctx.save();
  ctx.translate(-L, 0); ctx.rotate(wag);
  const g = ctx.createLinearGradient(0, 0, -L * 0.5, 0);
  g.addColorStop(0, shade(s.fin, -0.1)); g.addColorStop(1, hexA(s.fin.startsWith("#") ? s.fin : "#888888", 0.85));
  ctx.fillStyle = g;
  ctx.beginPath();
  const h = H * 1.05;
  if (kind === "moon") {
    ctx.moveTo(0, 0); ctx.quadraticCurveTo(-L * 0.25, -h * 0.4, -L * 0.42, -h * 1.15); ctx.quadraticCurveTo(-L * 0.22, -h * 0.25, -L * 0.2, 0);
    ctx.quadraticCurveTo(-L * 0.22, h * 0.25, -L * 0.42, h * 1.15); ctx.quadraticCurveTo(-L * 0.25, h * 0.4, 0, 0);
  } else if (kind === "round") {
    ctx.moveTo(0, -h * 0.25); ctx.quadraticCurveTo(-L * 0.55, -h * 0.9, -L * 0.42, 0); ctx.quadraticCurveTo(-L * 0.55, h * 0.9, 0, h * 0.25);
  } else if (kind === "square") {
    ctx.moveTo(0, -h * 0.2); ctx.lineTo(-L * 0.38, -h * 0.8); ctx.quadraticCurveTo(-L * 0.32, 0, -L * 0.38, h * 0.8); ctx.lineTo(0, h * 0.2);
  } else if (kind === "shark") {
    ctx.moveTo(0, -h * 0.1); ctx.quadraticCurveTo(-L * 0.3, -h * 0.6, -L * 0.55, -h * 1.4); ctx.quadraticCurveTo(-L * 0.35, -h * 0.3, -L * 0.3, 0.05 * h);
    ctx.quadraticCurveTo(-L * 0.28, h * 0.4, -L * 0.18, h * 0.7); ctx.lineTo(0, h * 0.1);
  } else if (kind === "point") {
    ctx.moveTo(0, -h * 0.15); ctx.quadraticCurveTo(-L * 0.4, -h * 0.1, -L * 0.6, 0); ctx.quadraticCurveTo(-L * 0.4, h * 0.1, 0, h * 0.15);
  } else {
    // Forked.
    ctx.moveTo(0, -h * 0.15); ctx.quadraticCurveTo(-L * 0.25, -h * 0.5, -L * 0.45, -h); ctx.quadraticCurveTo(-L * 0.28, -h * 0.25, -L * 0.24, 0);
    ctx.quadraticCurveTo(-L * 0.28, h * 0.25, -L * 0.45, h); ctx.quadraticCurveTo(-L * 0.25, h * 0.5, 0, h * 0.15);
  }
  ctx.closePath(); ctx.fill();
  // Rays.
  ctx.strokeStyle = "rgba(0,0,0,0.16)"; ctx.lineWidth = Math.max(0.5, L * 0.018);
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(0, i * h * 0.08); ctx.lineTo(-L * 0.36, i * h * 0.38); ctx.stroke(); }
  ctx.restore();
}

function dorsalFin(ctx, s, L, H, kind, t) {
  const wave = Math.sin(t * 3) * 0.05;
  ctx.fillStyle = hexA(s.fin, 0.9);
  ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = Math.max(0.5, L * 0.015);
  if (kind === "spiny") {
    ctx.beginPath(); ctx.moveTo(L * 0.35, -H * 0.85);
    for (let i = 0; i <= 8; i++) { const x = L * (0.35 - i * 0.09); ctx.lineTo(x + L * 0.02, -H * (1.35 + (i % 2 ? -0.12 : 0.05) - i * 0.02)); ctx.lineTo(x - L * 0.03, -H * 1.0); }
    ctx.lineTo(-L * 0.45, -H * 0.62); ctx.closePath(); ctx.fill();
    ctx.beginPath(); for (let i = 0; i <= 8; i++) { const x = L * (0.35 - i * 0.09); ctx.moveTo(x, -H * 0.9); ctx.lineTo(x + L * 0.02, -H * (1.3 - i * 0.02)); } ctx.stroke();
  } else if (kind === "sail") {
    ctx.beginPath(); ctx.moveTo(L * 0.55, -H * 0.8); ctx.quadraticCurveTo(L * 0.3, -H * 3.2, -L * 0.2, -H * 2.4 + wave * H); ctx.quadraticCurveTo(-L * 0.4, -H * 1.4, -L * 0.5, -H * 0.55); ctx.closePath(); ctx.fill();
    ctx.beginPath(); for (let i = 0; i < 7; i++) { const x = L * (0.5 - i * 0.13); ctx.moveTo(x, -H * 0.8); ctx.lineTo(x - L * 0.06, -H * (2.8 - i * 0.28)); } ctx.stroke();
  } else if (kind === "double") {
    ctx.beginPath(); ctx.moveTo(L * 0.3, -H * 0.88); ctx.lineTo(L * 0.12, -H * 1.55); ctx.lineTo(-L * 0.05, -H * 0.92); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-L * 0.22, -H * 0.72); ctx.lineTo(-L * 0.32, -H * 1.18); ctx.lineTo(-L * 0.45, -H * 0.6); ctx.closePath(); ctx.fill();
  } else if (kind === "long") {
    ctx.beginPath(); ctx.moveTo(L * 0.62, -H * 0.9); ctx.quadraticCurveTo(L * 0.1, -H * 1.5, -L * 0.85, -H * 0.4); ctx.lineTo(-L * 0.7, -H * 0.3); ctx.quadraticCurveTo(L * 0.1, -H * 1.0, L * 0.62, -H * 0.82); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(L * 0.25, -H * 0.9); ctx.quadraticCurveTo(L * 0.05, -H * 1.6, -L * 0.2, -H * 1.42); ctx.lineTo(-L * 0.35, -H * 0.72); ctx.closePath(); ctx.fill();
    ctx.beginPath(); for (let i = 0; i < 4; i++) { const x = L * (0.2 - i * 0.12); ctx.moveTo(x, -H * 0.88); ctx.lineTo(x - L * 0.05, -H * 1.42); } ctx.stroke();
  }
}

function lowerFins(ctx, s, L, H, t) {
  ctx.fillStyle = hexA(s.fin, 0.85);
  // Anal fin.
  ctx.beginPath(); ctx.moveTo(-L * 0.15, H * 0.82); ctx.lineTo(-L * 0.32, H * 1.32); ctx.lineTo(-L * 0.5, H * 0.6); ctx.closePath(); ctx.fill();
  // Pelvic fin.
  ctx.beginPath(); ctx.moveTo(L * 0.3, H * 0.92); ctx.lineTo(L * 0.16, H * 1.36); ctx.lineTo(L * 0.08, H * 0.9); ctx.closePath(); ctx.fill();
  // Pectoral fin, semi-transparent and beating.
  ctx.save(); ctx.translate(L * 0.42, H * 0.18); ctx.rotate(0.5 + Math.sin(t * 6) * 0.25);
  ctx.fillStyle = hexA(s.fin, 0.55);
  ctx.beginPath(); ctx.ellipse(-L * 0.16, 0, L * 0.2, H * 0.24, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

function finlets(ctx, s, L, H) {
  if (!s.finlets) return;
  ctx.fillStyle = s.finlets;
  for (let i = 0; i < 5; i++) {
    const x = -L * (0.5 + i * 0.1);
    ctx.beginPath(); ctx.moveTo(x, -H * 0.38 + i * H * 0.04); ctx.lineTo(x - L * 0.05, -H * 0.62 + i * H * 0.06); ctx.lineTo(x - L * 0.07, -H * 0.34 + i * H * 0.04); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, H * 0.38 - i * H * 0.04); ctx.lineTo(x - L * 0.05, H * 0.62 - i * H * 0.06); ctx.lineTo(x - L * 0.07, H * 0.34 - i * H * 0.04); ctx.fill();
  }
}

/** Markings, scales, lateral line — drawn clipped inside the body path. */
function markings(ctx, s, L, H, t) {
  const c = s.patCol || shade(s.back, -0.4);
  const p = s.pat;
  if (p === "barsV") { ctx.fillStyle = hexA(c, 0.55); for (let i = 0; i < 6; i++) ctx.fillRect(L * (0.5 - i * 0.24) - L * 0.05, -H * 1.2, L * 0.1, H * 1.4); }
  else if (p === "tiger") {
    ctx.strokeStyle = hexA(c, 0.85); ctx.lineWidth = Math.max(1, L * 0.05);
    for (let i = 0; i < 9; i++) { const x = L * (0.55 - i * 0.17); ctx.beginPath(); ctx.moveTo(x, -H * 1.1); ctx.bezierCurveTo(x - L * 0.08, -H * 0.7, x + L * 0.08, -H * 0.45, x - L * 0.04, -H * 0.15); ctx.stroke(); }
  } else if (p === "clown") {
    for (const bx of [0.5, 0.0, -0.55]) {
      ctx.fillStyle = "#1a1a1a"; ctx.fillRect(L * bx - L * 0.12, -H * 1.3, L * 0.24, H * 2.6);
      ctx.fillStyle = "#fffaf0"; ctx.fillRect(L * bx - L * 0.09, -H * 1.3, L * 0.18, H * 2.6);
    }
  } else if (p === "eyeband") {
    ctx.fillStyle = "#1a1a1a"; ctx.fillRect(L * 0.58, -H * 1.2, L * 0.13, H * 2.4);
    ctx.fillStyle = "#1a1a2a"; ctx.beginPath(); ctx.arc(-L * 0.55, -H * 0.35, L * 0.12, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(0.6, L * 0.025); ctx.stroke();
    ctx.strokeStyle = hexA("#ff9a1a", 0.5); ctx.lineWidth = Math.max(0.6, L * 0.02);
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(L * 0.5 - i * L * 0.2, -H); ctx.lineTo(L * 0.2 - i * L * 0.2, H); ctx.stroke(); }
  } else if (p === "spots" || p === "salmon") {
    ctx.fillStyle = hexA(c, 0.75);
    for (let i = 0; i < 26; i++) {
      const x = L * (0.7 - ((i * 37) % 100) / 60), y = -H * 0.95 + ((i * 53) % 100) / 100 * H * (p === "salmon" ? 0.9 : 1.9);
      ctx.beginPath(); ctx.arc(x, y, Math.max(0.6, L * (0.025 + (i % 3) * 0.008)), 0, TAU); ctx.fill();
    }
  } else if (p === "spotsRow") {
    ctx.fillStyle = hexA("#1a2a3a", 0.6);
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(L * (0.4 - i * 0.18), -H * 0.18, Math.max(0.6, L * 0.035), 0, TAU); ctx.fill(); }
  } else if (p === "mottle") {
    for (let i = 0; i < 14; i++) {
      const x = L * (0.7 - ((i * 41) % 100) / 60), y = -H * 0.9 + ((i * 29) % 100) / 100 * H * 1.6;
      ctx.fillStyle = hexA(c, 0.28 + (i % 3) * 0.08);
      ctx.beginPath(); ctx.ellipse(x, y, L * (0.08 + (i % 4) * 0.03), H * (0.12 + (i % 3) * 0.05), i, 0, TAU); ctx.fill();
    }
  } else if (p === "lines") {
    ctx.strokeStyle = hexA(c, 0.5); ctx.lineWidth = Math.max(0.6, L * 0.025);
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(L * 0.7, -H * (0.7 - i * 0.22)); ctx.quadraticCurveTo(0, -H * (0.78 - i * 0.22), -L, -H * (0.2 - i * 0.06)); ctx.stroke(); }
  } else if (p === "parrot") {
    for (let i = 0; i < 30; i++) {
      const x = L * (0.7 - (i % 10) * 0.18), y = -H * 0.8 + Math.floor(i / 10) * H * 0.55;
      ctx.strokeStyle = hexA(i % 2 ? "#ff7ab0" : "#2ad0f0", 0.45); ctx.lineWidth = Math.max(0.6, L * 0.02);
      ctx.beginPath(); ctx.arc(x, y, L * 0.07, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
    }
  } else if (p === "zebra") {
    ctx.strokeStyle = hexA(c, 0.85); ctx.lineWidth = Math.max(1, L * 0.06);
    for (let i = 0; i < 8; i++) { const x = L * (0.7 - i * 0.22); ctx.beginPath(); ctx.moveTo(x, -H * 1.2); ctx.quadraticCurveTo(x - L * 0.1, 0, x + L * 0.02, H * 1.2); ctx.stroke(); }
  } else if (p === "shine") {
    const g = ctx.createLinearGradient(0, -H, 0, H);
    g.addColorStop(0.35, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,0.35)"); g.addColorStop(0.62, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(-L, -H, L * 2, H * 2);
  }
  // Scales: a soft grid of arcs.
  if (L > 14) {
    ctx.strokeStyle = "rgba(255,255,255,0.09)"; ctx.lineWidth = Math.max(0.5, L * 0.012);
    const sz = Math.max(3, L * 0.09);
    for (let y = -H; y < H; y += sz * 0.8) for (let x = L * 0.45; x > -L; x -= sz) {
      ctx.beginPath(); ctx.arc(x + ((y / sz) % 2 ? sz / 2 : 0), y, sz * 0.55, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
    }
  }
  // Lateral line.
  ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = Math.max(0.6, L * 0.02);
  ctx.beginPath(); ctx.moveTo(L * 0.5, -H * 0.3); ctx.quadraticCurveTo(0, -H * 0.38, -L * 0.95, -H * 0.04); ctx.stroke();
  // Photophores: glowing dots along the belly.
  if (p === "photo" && s.glow) {
    for (let i = 0; i < 9; i++) {
      const a = 0.55 + 0.45 * Math.sin(t * 3 + i);
      ctx.fillStyle = hexA(s.glow, a);
      ctx.beginPath(); ctx.arc(L * (0.55 - i * 0.17), H * 0.62 - Math.abs(i - 4) * H * 0.03, Math.max(0.8, L * 0.035), 0, TAU); ctx.fill();
    }
  }
}

function head(ctx, s, L, H, opts = {}) {
  // Gill cover.
  ctx.strokeStyle = "rgba(0,0,0,0.22)"; ctx.lineWidth = Math.max(0.7, L * 0.025);
  ctx.beginPath(); ctx.arc(L * 0.75, 0, H * 0.82, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
  // Mouth.
  ctx.strokeStyle = "rgba(20,10,10,0.55)"; ctx.lineWidth = Math.max(0.7, L * 0.022);
  ctx.beginPath(); ctx.moveTo(L * 1.0, H * 0.12); ctx.quadraticCurveTo(L * 0.9, H * 0.24, L * 0.8, H * (opts.bigmouth ? 0.32 : 0.22)); ctx.stroke();
  if (opts.beak) { ctx.fillStyle = "#f4f0e8"; ctx.beginPath(); ctx.moveTo(L * 1.02, H * 0.02); ctx.quadraticCurveTo(L * 0.98, H * 0.3, L * 0.86, H * 0.24); ctx.lineTo(L * 0.9, 0); ctx.fill(); }
  // Eye: sclera, iris, pupil and a highlight.
  const er = Math.max(1.6, L * (opts.eyeK || 0.1));
  const ex = L * 0.74, ey = -H * 0.22;
  ctx.fillStyle = opts.eyeCol || "#f0e8c8"; ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fill();
  ctx.fillStyle = "#c08a2a"; ctx.beginPath(); ctx.arc(ex + er * 0.12, ey, er * 0.72, 0, TAU); ctx.fill();
  ctx.fillStyle = "#0b0a12"; ctx.beginPath(); ctx.arc(ex + er * 0.18, ey, er * 0.48, 0, TAU); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.arc(ex - er * 0.15, ey - er * 0.32, er * 0.24, 0, TAU); ctx.fill();
}

function standardFish(ctx, s, L, t, o, H, shape) {
  const swim = Math.sin(t * 4) * L * 0.02;
  ctx.translate(0, swim);
  tailFin(ctx, s, L, H, t, s.tail || "fork");
  if (s.dorsal !== "none") dorsalFin(ctx, s, L, H, s.dorsal || "soft", t);
  lowerFins(ctx, s, L, H, t);
  fishPath(ctx, L, H, shape);
  bodyFill(ctx, s, H); ctx.fill();
  ctx.save(); fishPath(ctx, L, H, shape); ctx.clip(); markings(ctx, s, L, H, t);
  // A soft highlight along the back.
  const hg = ctx.createLinearGradient(0, -H, 0, 0); hg.addColorStop(0, "rgba(255,255,255,0.16)"); hg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hg; ctx.fillRect(-L, -H, L * 2, H);
  ctx.restore();
  ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = Math.max(0.6, L * 0.02); fishPath(ctx, L, H, shape); ctx.stroke();
  finlets(ctx, s, L, H);
  if (s.adipose) { ctx.fillStyle = s.fin; ctx.beginPath(); ctx.ellipse(-L * 0.62, -H * 0.42, L * 0.06, H * 0.12, -0.3, 0, TAU); ctx.fill(); }
  if (s.barbel) { ctx.strokeStyle = s.fin; ctx.lineWidth = Math.max(0.6, L * 0.02); ctx.beginPath(); ctx.moveTo(L * 0.92, H * 0.28); ctx.quadraticCurveTo(L * 0.95, H * 0.6, L * 0.88, H * 0.7); ctx.stroke(); }
  if (s.lobed) { ctx.fillStyle = hexA(s.fin, 0.9); for (const [x, y] of [[0.3, 0.9], [-0.3, 0.75], [0.1, -0.9]]) { ctx.beginPath(); ctx.ellipse(L * x, H * y, L * 0.14, H * 0.22, y > 0 ? 0.6 : -0.6, 0, TAU); ctx.fill(); } }
  if (s.jaw) { ctx.fillStyle = "#fff"; for (let i = 0; i < 4; i++) { const x = L * (0.82 + i * 0.04); ctx.beginPath(); ctx.moveTo(x, H * 0.1); ctx.lineTo(x + L * 0.015, H * 0.24); ctx.lineTo(x + L * 0.03, H * 0.1); ctx.fill(); } }
  head(ctx, s, L, H, { beak: s.beak, bigmouth: s.bigmouth });
}

// --------------------------------------------------------------- bodies ---
const BODY = {
  fusiform(ctx, s, L, t, o) { standardFish(ctx, s, L, t, o, L * 0.32, { hump: 1, belly: 0.95, stalk: 0.16, snout: 0.45 }); },
  slim(ctx, s, L, t, o) { standardFish(ctx, s, L, t, o, L * 0.22, { hump: 1, belly: 1, stalk: 0.22, snout: 0.35, peak: 0.1 }); },
  deep(ctx, s, L, t, o) { standardFish(ctx, s, L, t, o, L * 0.48, { hump: 1, belly: 0.9, stalk: 0.22, snout: 0.55, peak: 0.2 }); },
  disc(ctx, s, L, t, o) { standardFish(ctx, s, L, t, o, L * 0.66, { hump: 1, belly: 1, stalk: 0.18, snout: 0.3, peak: 0.1 }); },
  hatchet(ctx, s, L, t, o) { standardFish(ctx, s, L * 0.8, t, o, L * 0.62, { hump: 0.6, belly: 1.1, stalk: 0.15, snout: 0.5, peak: 0.4 }); },
  mahi(ctx, s, L, t, o) { standardFish(ctx, s, L, t, o, L * 0.36, { hump: 1.05, belly: 0.85, stalk: 0.14, snout: 1.3, peak: 0.5 }); },
  lion(ctx, s, L, t, o) {
    // Feathery pectoral fans and long venomous spines.
    ctx.save();
    for (const sg of [-1, 1]) {
      ctx.fillStyle = hexA(s.fin, 0.45); ctx.strokeStyle = hexA(s.fin, 0.9); ctx.lineWidth = Math.max(0.6, L * 0.025);
      ctx.beginPath(); ctx.moveTo(L * 0.3, H(L) * 0.2 * sg);
      for (let i = 0; i < 7; i++) { const a = (0.6 + i * 0.2) * sg + Math.sin(t * 2 + i) * 0.05; ctx.lineTo(L * 0.3 - Math.cos(a) * L * 0.9, H(L) * 0.2 * sg + Math.sin(a) * L * 0.7 * sg); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = s.fin; ctx.lineWidth = Math.max(0.6, L * 0.022);
    for (let i = 0; i < 10; i++) { const x = L * (0.5 - i * 0.1); ctx.beginPath(); ctx.moveTo(x, -L * 0.2); ctx.lineTo(x - L * 0.05, -L * (0.9 + (i % 2) * 0.2 - i * 0.03)); ctx.stroke(); }
    standardFish(ctx, s, L, t, o, L * 0.36, { hump: 1, belly: 0.9, stalk: 0.2, snout: 0.5, peak: 0.2, dorsal: "none" });
    function H(l) { return l * 0.36; }
  },
  puffer(ctx, s, L, t, o) {
    const p = o.puffed ?? (0.3 + 0.2 * Math.sin(t * 1.5));
    const R = L * (0.55 + p * 0.35);
    tailFin(ctx, s, L * 0.7, R * 0.6, t, "round");
    const g = ctx.createRadialGradient(-R * 0.3, -R * 0.4, R * 0.1, 0, 0, R);
    g.addColorStop(0, shade(s.belly, 0.2)); g.addColorStop(0.5, s.back); g.addColorStop(1, shade(s.back, -0.3));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    ctx.fillStyle = s.belly; ctx.beginPath(); ctx.ellipse(0, R * 0.35, R * 0.75, R * 0.55, 0, 0, Math.PI); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip(); markings(ctx, { ...s, pat: "spots" }, R, R, t); ctx.restore();
    ctx.strokeStyle = shade(s.back, -0.3); ctx.lineWidth = Math.max(0.6, L * 0.025);
    for (let i = 0; i < 22; i++) { const a = i / 22 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92); ctx.lineTo(Math.cos(a) * R * (1.05 + p * 0.18), Math.sin(a) * R * (1.05 + p * 0.18)); ctx.stroke(); }
    head(ctx, s, R * 1.05, R * 0.9, { eyeK: 0.16 });
  },
  eel(ctx, s, L, t, o) {
    const len = L * 1.6, th = L * (s.gulper ? 0.12 : 0.15);
    const pts = [];
    for (let i = 0; i <= 18; i++) { const p = i / 18; pts.push([len - p * len * 2, Math.sin(t * 3 + p * 6) * L * 0.18 * p]); }
    const W = (p) => th * (p < 0.15 ? 0.7 + p * 2 : 1 - (p - 0.15) * 0.85);
    // Continuous fin along the back.
    ctx.fillStyle = hexA(s.fin, 0.8);
    ctx.beginPath(); pts.forEach(([x, y], i) => { const p = i / 18; const w = W(p) + th * (s.crest ? 0.9 : 0.45); i ? ctx.lineTo(x, y - w) : ctx.moveTo(x, y - w); });
    for (let i = 18; i >= 0; i--) { const [x, y] = pts[i]; ctx.lineTo(x, y); } ctx.fill();
    if (s.crest) { ctx.fillStyle = s.fin; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(len * 0.8 - k * L * 0.12, -th); ctx.quadraticCurveTo(len * 0.9 - k * L * 0.1, -th * 4 - k * th, len * 0.6 - k * L * 0.14, -th * 3.5 - Math.sin(t * 3 + k) * th); ctx.lineTo(len * 0.7 - k * L * 0.12, -th); ctx.fill(); } }
    const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => { const w = W(i / 18); i ? ctx.lineTo(x, y - w) : ctx.moveTo(x, y - w); }); for (let i = 18; i >= 0; i--) { const [x, y] = pts[i]; ctx.lineTo(x, y + W(i / 18)); } ctx.closePath(); };
    path(); bodyFill(ctx, s, th); ctx.fill();
    ctx.save(); path(); ctx.clip(); markings(ctx, { ...s, pat: s.pat || "none" }, L, th, t); ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = Math.max(0.6, L * 0.02); path(); ctx.stroke();
    if (s.frills) { ctx.strokeStyle = shade(s.back, -0.3); for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(len - th * (2.4 + k * 0.6), 0, th * 1.1, -1.2, 1.2); ctx.stroke(); } }
    if (s.gulper) { ctx.fillStyle = shade(s.back, -0.2); ctx.beginPath(); ctx.moveTo(len, 0); ctx.quadraticCurveTo(len + L * 0.4, -L * 0.45, len + L * 0.55, -L * 0.1); ctx.quadraticCurveTo(len + L * 0.3, L * 0.5, len - th, th); ctx.fill(); }
    if (s.rattail) { ctx.strokeStyle = s.fin; ctx.lineWidth = Math.max(0.6, L * 0.02); ctx.beginPath(); ctx.moveTo(pts[18][0], pts[18][1]); ctx.lineTo(pts[18][0] - L * 0.3, pts[18][1] + Math.sin(t * 3) * L * 0.05); ctx.stroke(); }
    head(ctx, s, len, th * 1.4, { eyeK: 0.05, eyeCol: s.glow ? s.glow : "#f0e8c8" });
  },
  ray(ctx, s, L, t, o) {
    const fl = Math.sin(t * 2.5) * 0.12;
    ctx.strokeStyle = s.fin; ctx.lineWidth = Math.max(1, L * 0.05); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-L * 0.6, 0); ctx.quadraticCurveTo(-L * 1.4, Math.sin(t * 2) * L * 0.2, -L * 2, Math.sin(t * 2 + 1) * L * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L * 0.8, 0); ctx.quadraticCurveTo(L * 0.2, -L * (0.9 + fl), -L * 0.6, 0); ctx.quadraticCurveTo(L * 0.2, L * (0.9 + fl), L * 0.8, 0); ctx.closePath();
    const g = ctx.createRadialGradient(L * 0.1, 0, 2, 0, 0, L); g.addColorStop(0, shade(s.back, 0.15)); g.addColorStop(1, shade(s.back, -0.25));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip(); markings(ctx, s, L, L * 0.8, t); ctx.restore();
    ctx.fillStyle = "#1a1a1a"; ctx.beginPath(); ctx.arc(L * 0.35, -L * 0.12, L * 0.05, 0, TAU); ctx.arc(L * 0.35, L * 0.12, L * 0.05, 0, TAU); ctx.fill();
  },
  manta(ctx, s, L, t, o) {
    const fl = Math.sin(t * 1.8) * 0.25;
    ctx.strokeStyle = shade(s.back, -0.2); ctx.lineWidth = Math.max(1, L * 0.03);
    ctx.beginPath(); ctx.moveTo(-L * 0.6, 0); ctx.lineTo(-L * 1.3, Math.sin(t * 2) * L * 0.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L * 0.6, -L * 0.15); ctx.bezierCurveTo(L * 0.2, -L * (1.4 + fl), -L * 0.3, -L * (1.3 + fl), -L * 0.6, 0);
    ctx.bezierCurveTo(-L * 0.3, L * (1.3 + fl), L * 0.2, L * (1.4 + fl), L * 0.6, L * 0.15); ctx.closePath();
    const g = ctx.createLinearGradient(0, -L, 0, L); g.addColorStop(0, s.back); g.addColorStop(0.5, shade(s.back, 0.15)); g.addColorStop(1, s.back);
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = hexA(s.belly, 0.6); ctx.beginPath(); ctx.ellipse(L * 0.1, 0, L * 0.35, L * 0.22, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = s.back; for (const sg of [-1, 1]) { ctx.beginPath(); ctx.ellipse(L * 0.7, L * 0.18 * sg, L * 0.18, L * 0.06, 0.3 * sg, 0, TAU); ctx.fill(); }
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(L * 0.55, -L * 0.2, L * 0.03, 0, TAU); ctx.arc(L * 0.55, L * 0.2, L * 0.03, 0, TAU); ctx.fill();
  },
  squid(ctx, s, L, t, o) {
    // Arms trail behind the mantle; two long tentacles reach further.
    ctx.lineCap = "round";
    for (let i = -3; i <= 3; i++) {
      ctx.strokeStyle = shade(s.fin, -0.1); ctx.lineWidth = Math.max(1, L * 0.07);
      ctx.beginPath(); ctx.moveTo(-L * 0.35, i * L * 0.06);
      ctx.quadraticCurveTo(-L * 0.8, i * L * 0.1 + Math.sin(t * 3 + i) * L * 0.08, -L * 1.25, i * L * 0.16 + Math.sin(t * 3 + i + 1) * L * 0.12); ctx.stroke();
    }
    for (const sg of [-1, 1]) {
      ctx.strokeStyle = s.fin; ctx.lineWidth = Math.max(0.8, L * 0.035);
      ctx.beginPath(); ctx.moveTo(-L * 0.35, sg * L * 0.05); ctx.bezierCurveTo(-L * 1.0, sg * L * 0.3, -L * 1.6, sg * L * 0.1 + Math.sin(t * 2) * L * 0.2, -L * 1.9, sg * L * 0.25);
      ctx.stroke(); ctx.fillStyle = s.fin; ctx.beginPath(); ctx.ellipse(-L * 1.9, sg * L * 0.25, L * 0.1, L * 0.05, 0, 0, TAU); ctx.fill();
    }
    if (s.cloak) { ctx.fillStyle = hexA(s.back, 0.8); ctx.beginPath(); ctx.moveTo(-L * 0.3, -L * 0.3); ctx.quadraticCurveTo(-L * 1.2, 0, -L * 0.3, L * 0.3); ctx.fill(); }
    // Mantle with fins at the tip.
    ctx.fillStyle = hexA(s.fin, 0.85);
    ctx.beginPath(); ctx.moveTo(L * 0.85, 0); ctx.lineTo(L * 0.55, -L * 0.42); ctx.lineTo(L * 0.4, 0); ctx.lineTo(L * 0.55, L * 0.42); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(L * 0.95, 0); ctx.quadraticCurveTo(L * 0.4, -L * 0.3, -L * 0.35, -L * 0.18); ctx.lineTo(-L * 0.35, L * 0.18); ctx.quadraticCurveTo(L * 0.4, L * 0.3, L * 0.95, 0);
    const g = ctx.createLinearGradient(0, -L * 0.3, 0, L * 0.3); g.addColorStop(0, shade(s.back, -0.15)); g.addColorStop(0.5, s.back); g.addColorStop(1, s.belly);
    ctx.fillStyle = g; ctx.fill();
    // Chromatophore speckles.
    ctx.fillStyle = hexA(shade(s.back, -0.35), 0.5);
    for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.arc(L * (0.8 - (i * 37 % 100) / 100), L * (-0.15 + (i * 53 % 100) / 340), Math.max(0.6, L * 0.025), 0, TAU); ctx.fill(); }
    ctx.fillStyle = "#f8f0d8"; ctx.beginPath(); ctx.arc(-L * 0.25, -L * 0.08, L * 0.09, 0, TAU); ctx.fill();
    ctx.fillStyle = "#101018"; ctx.beginPath(); ctx.arc(-L * 0.24, -L * 0.08, L * 0.055, 0, TAU); ctx.fill();
  },
  octopus(ctx, s, L, t, o) {
    // Eight curling arms with suckers, then the head.
    for (let i = 0; i < 8; i++) {
      const base = -0.9 + i * 0.26, sw = Math.sin(t * 2 + i) * 0.4;
      ctx.strokeStyle = shade(s.back, -0.05); ctx.lineWidth = Math.max(1.2, L * 0.1); ctx.lineCap = "round";
      const x0 = -L * 0.1, y0 = L * 0.2;
      const x1 = x0 - Math.cos(base) * L * 0.6, y1 = y0 + Math.sin(base + 1.6) * L * 0.6;
      const x2 = x1 - L * 0.5 + Math.sin(t + i) * L * 0.2, y2 = y1 + L * (0.3 + sw * 0.3);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x1, y1, x2, y2); ctx.stroke();
      ctx.fillStyle = hexA(s.belly, 0.9);
      for (let k = 1; k < 4; k++) { const q = k / 4; const sx = (1 - q) * (1 - q) * x0 + 2 * (1 - q) * q * x1 + q * q * x2, sy = (1 - q) * (1 - q) * y0 + 2 * (1 - q) * q * y1 + q * q * y2; ctx.beginPath(); ctx.arc(sx, sy + L * 0.03, Math.max(0.5, L * 0.025), 0, TAU); ctx.fill(); }
    }
    const g = ctx.createRadialGradient(L * 0.1, -L * 0.4, 1, 0, -L * 0.2, L * 0.7);
    g.addColorStop(0, shade(s.back, 0.25)); g.addColorStop(1, s.back);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -L * 0.25, L * 0.5, L * 0.6, 0.2, 0, TAU); ctx.fill();
    if (s.dumbo) { ctx.fillStyle = s.fin; for (const sg of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sg * L * 0.45, -L * 0.6 + Math.sin(t * 3) * L * 0.05, L * 0.25, L * 0.14, sg * 0.6, 0, TAU); ctx.fill(); } }
    ctx.fillStyle = hexA(shade(s.back, -0.3), 0.4); for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(-L * 0.25 + (i % 3) * L * 0.2, -L * 0.6 + Math.floor(i / 3) * L * 0.2, L * 0.04, 0, TAU); ctx.fill(); }
    for (const ex of [-L * 0.2, L * 0.2]) { ctx.fillStyle = "#f8f0d8"; ctx.beginPath(); ctx.arc(ex, -L * 0.05, L * 0.09, 0, TAU); ctx.fill(); ctx.fillStyle = "#101018"; ctx.fillRect(ex - L * 0.06, -L * 0.07, L * 0.12, L * 0.035); }
  },
  sword(ctx, s, L, t, o) {
    // Bill first, then a tuna-like body.
    ctx.fillStyle = shade(s.back, -0.1);
    ctx.beginPath(); ctx.moveTo(L * 0.95, -L * 0.04); ctx.lineTo(L * 1.85, -L * 0.005); ctx.lineTo(L * 0.95, L * 0.06); ctx.closePath(); ctx.fill();
    standardFish(ctx, s, L, t, o, L * 0.28, { hump: 1, belly: 0.95, stalk: 0.12, snout: 0.35, peak: 0.25 });
  },
  shark(ctx, s, L, t, o) {
    const H = L * 0.3;
    const swim = Math.sin(t * 3) * L * 0.02;
    ctx.translate(0, swim);
    tailFin(ctx, s, L, H, t, s.tail || "shark");
    // Dorsal, pectorals, pelvic.
    ctx.fillStyle = s.fin;
    ctx.beginPath(); ctx.moveTo(L * 0.25, -H * 0.85); ctx.quadraticCurveTo(L * 0.05, -H * 2.0, -L * 0.15, -H * 2.1); ctx.quadraticCurveTo(-L * 0.08, -H * 1.3, -L * 0.2, -H * 0.8); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(L * 0.35, H * 0.6); ctx.quadraticCurveTo(L * 0.1, H * 1.6, -L * 0.15, H * 1.9); ctx.quadraticCurveTo(L * 0.05, H * 1.0, L * 0.05, H * 0.7); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-L * 0.55, -H * 0.5); ctx.lineTo(-L * 0.62, -H * 0.95); ctx.lineTo(-L * 0.7, -H * 0.4); ctx.fill();
    const shape = { hump: 1, belly: 0.9, stalk: 0.12, snout: s.goblin ? 0.25 : 0.55, peak: 0.25 };
    fishPath(ctx, L, H, shape); bodyFill(ctx, s, H); ctx.fill();
    ctx.save(); fishPath(ctx, L, H, shape); ctx.clip();
    const hg = ctx.createLinearGradient(0, -H, 0, 0); hg.addColorStop(0, "rgba(255,255,255,0.14)"); hg.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = hg; ctx.fillRect(-L, -H, L * 2, H);
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,0.28)"; ctx.lineWidth = Math.max(0.6, L * 0.018); fishPath(ctx, L, H, shape); ctx.stroke();
    // Gill slits.
    ctx.strokeStyle = "rgba(0,0,0,0.3)"; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(L * (0.55 - i * 0.05), -H * 0.3); ctx.lineTo(L * (0.53 - i * 0.05), H * 0.3); ctx.stroke(); }
    if (s.hammer) { ctx.fillStyle = s.back; ctx.beginPath(); ctx.ellipse(L * 0.95, 0, L * 0.12, H * 1.6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = "#101018"; ctx.beginPath(); ctx.arc(L * 0.95, -H * 1.45, Math.max(1, L * 0.035), 0, TAU); ctx.fill(); }
    else if (s.goblin) { ctx.fillStyle = shade(s.back, -0.05); ctx.beginPath(); ctx.moveTo(L * 0.9, -H * 0.3); ctx.lineTo(L * 1.45, -H * 0.15); ctx.lineTo(L * 0.95, H * 0.05); ctx.fill(); ctx.fillStyle = "#fff"; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(L * (0.78 + i * 0.03), H * 0.25); ctx.lineTo(L * (0.79 + i * 0.03), H * 0.5); ctx.lineTo(L * (0.8 + i * 0.03), H * 0.25); ctx.fill(); } }
    else if (s.mega) { ctx.fillStyle = "#1a1a24"; ctx.beginPath(); ctx.ellipse(L * 0.85, H * 0.25, L * 0.18, H * 0.3, 0, 0, TAU); ctx.fill(); }
    else if (s.ghost) { ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.beginPath(); ctx.moveTo(L * 0.6, -H * 0.2); ctx.quadraticCurveTo(0, -H * 0.4, -L * 0.9, 0); ctx.stroke(); }
    else { ctx.strokeStyle = "rgba(20,10,10,0.6)"; ctx.lineWidth = Math.max(0.7, L * 0.02); ctx.beginPath(); ctx.moveTo(L * 0.92, H * 0.3); ctx.quadraticCurveTo(L * 0.8, H * 0.45, L * 0.66, H * 0.38); ctx.stroke(); ctx.fillStyle = "#fff"; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(L * (0.7 + i * 0.05), H * 0.36); ctx.lineTo(L * (0.72 + i * 0.05), H * 0.48); ctx.lineTo(L * (0.74 + i * 0.05), H * 0.36); ctx.fill(); } }
    if (!s.hammer) { ctx.fillStyle = "#0b0a12"; ctx.beginPath(); ctx.arc(L * 0.78, -H * 0.18, Math.max(1.2, L * 0.045), 0, TAU); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.arc(L * 0.77, -H * 0.22, Math.max(0.4, L * 0.015), 0, TAU); ctx.fill(); }
  },
  flat(ctx, s, L, t, o) {
    // Seen from above: an oval fringed with fin all round, both eyes on top.
    const ripple = (a) => 1 + Math.sin(a * 10 + t * 4) * 0.04;
    ctx.fillStyle = hexA(s.fin, 0.85);
    ctx.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU; const r = ripple(a); ctx.lineTo(Math.cos(a) * L * 0.92 * r, Math.sin(a) * L * 0.62 * r); } ctx.closePath(); ctx.fill();
    tailFin(ctx, s, L * 0.95, L * 0.3, t, "round");
    ctx.beginPath(); ctx.ellipse(0, 0, L * 0.8, L * 0.5, 0, 0, TAU);
    const g = ctx.createRadialGradient(L * 0.1, -L * 0.1, 2, 0, 0, L * 0.8); g.addColorStop(0, shade(s.back, 0.15)); g.addColorStop(1, s.back);
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip(); markings(ctx, s, L * 0.8, L * 0.5, t); ctx.restore();
    for (const [ex, ey] of [[L * 0.55, -L * 0.18], [L * 0.62, L * 0.02]]) { ctx.fillStyle = "#f0e8c8"; ctx.beginPath(); ctx.arc(ex, ey, Math.max(1, L * 0.07), 0, TAU); ctx.fill(); ctx.fillStyle = "#101018"; ctx.beginPath(); ctx.arc(ex + L * 0.01, ey, Math.max(0.6, L * 0.04), 0, TAU); ctx.fill(); }
  },
  mola(ctx, s, L, t, o) {
    const fl = Math.sin(t * 2) * 0.2;
    ctx.fillStyle = s.fin;
    ctx.beginPath(); ctx.moveTo(-L * 0.2, -L * 0.6); ctx.quadraticCurveTo(-L * (0.35 + fl * 0.2), -L * 1.6, -L * 0.6, -L * 1.55); ctx.lineTo(-L * 0.5, -L * 0.5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-L * 0.2, L * 0.6); ctx.quadraticCurveTo(-L * (0.35 - fl * 0.2), L * 1.6, -L * 0.6, L * 1.55); ctx.lineTo(-L * 0.5, L * 0.5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-L * 0.55, -L * 0.6); ctx.quadraticCurveTo(-L * 0.85, 0, -L * 0.55, L * 0.6); ctx.lineTo(-L * 0.45, 0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, L * 0.65, L * 0.7, 0, 0, TAU);
    const g = ctx.createLinearGradient(0, -L * 0.7, 0, L * 0.7); g.addColorStop(0, shade(s.back, -0.1)); g.addColorStop(1, s.belly);
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip(); markings(ctx, s, L * 0.65, L * 0.7, t); ctx.restore();
    head(ctx, s, L * 0.65, L * 0.6, { eyeK: 0.12 });
  },
  seahorse(ctx, s, L, t, o) {
    ctx.save(); ctx.rotate(-0.15 + Math.sin(t * 1.5) * 0.05);
    const g = ctx.createLinearGradient(-L * 0.3, 0, L * 0.3, 0); g.addColorStop(0, shade(s.back, -0.2)); g.addColorStop(1, s.belly);
    ctx.strokeStyle = g; ctx.lineCap = "round";
    // Curled tail, belly, neck and snout.
    ctx.lineWidth = L * 0.16; ctx.beginPath(); ctx.moveTo(0, L * 0.2); ctx.quadraticCurveTo(-L * 0.1, L * 0.8, L * 0.15, L * 0.95); ctx.quadraticCurveTo(L * 0.35, L * 0.9, L * 0.2, L * 0.75); ctx.stroke();
    ctx.lineWidth = L * 0.4; ctx.beginPath(); ctx.moveTo(0, -L * 0.25); ctx.quadraticCurveTo(L * 0.12, 0, 0, L * 0.25); ctx.stroke();
    ctx.lineWidth = L * 0.22; ctx.beginPath(); ctx.moveTo(-L * 0.02, -L * 0.3); ctx.quadraticCurveTo(-L * 0.05, -L * 0.6, L * 0.12, -L * 0.7); ctx.stroke();
    ctx.lineWidth = L * 0.09; ctx.beginPath(); ctx.moveTo(L * 0.15, -L * 0.7); ctx.lineTo(L * 0.5, -L * 0.62); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = Math.max(0.5, L * 0.02);
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(-L * 0.2, -L * 0.2 + i * L * 0.12); ctx.lineTo(L * 0.18, -L * 0.18 + i * L * 0.12); ctx.stroke(); }
    ctx.fillStyle = hexA(s.fin, 0.7); ctx.beginPath(); ctx.ellipse(-L * 0.18, 0, L * 0.08, L * 0.16 + Math.sin(t * 8) * L * 0.03, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = s.back; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-L * 0.02 + i * L * 0.05, -L * 0.8); ctx.lineTo(i * L * 0.05, -L * 0.95); ctx.lineTo(L * 0.03 + i * L * 0.05, -L * 0.8); ctx.fill(); }
    ctx.fillStyle = "#101018"; ctx.beginPath(); ctx.arc(L * 0.12, -L * 0.72, Math.max(0.8, L * 0.05), 0, TAU); ctx.fill();
    ctx.restore();
  },
  angler(ctx, s, L, t, o) {
    const H = L * 0.6;
    tailFin(ctx, s, L * 0.75, H * 0.6, t, "round");
    ctx.beginPath(); ctx.ellipse(0, 0, L * 0.8, H, 0, 0, TAU);
    const g = ctx.createRadialGradient(L * 0.2, -H * 0.4, 2, 0, 0, L); g.addColorStop(0, shade(s.back, 0.2)); g.addColorStop(1, shade(s.back, -0.3));
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = hexA(shade(s.back, -0.4), 0.5); for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc(-L * 0.5 + (i % 4) * L * 0.25, -H * 0.5 + Math.floor(i / 4) * H * 0.45, L * 0.04, 0, TAU); ctx.fill(); }
    // Huge mouth with needle teeth.
    ctx.fillStyle = "#0a0408"; ctx.beginPath(); ctx.moveTo(L * 0.82, -H * 0.05); ctx.quadraticCurveTo(L * 0.5, H * 0.35, L * 0.1, H * 0.25); ctx.quadraticCurveTo(L * 0.55, H * 0.65, L * 0.85, H * 0.35); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f4f0e8";
    for (let i = 0; i < 7; i++) { const x = L * (0.2 + i * 0.09); ctx.beginPath(); ctx.moveTo(x, H * 0.2 + i * H * 0.01); ctx.lineTo(x + L * 0.025, H * 0.45); ctx.lineTo(x + L * 0.05, H * 0.22 + i * H * 0.01); ctx.fill(); }
    // The lure.
    ctx.strokeStyle = shade(s.back, 0.2); ctx.lineWidth = Math.max(1, L * 0.04);
    ctx.beginPath(); ctx.moveTo(L * 0.3, -H * 0.9); ctx.quadraticCurveTo(L * 0.9, -H * 2.0 + Math.sin(t * 2) * H * 0.1, L * 1.1, -H * 1.3); ctx.stroke();
    const lg = ctx.createRadialGradient(L * 1.1, -H * 1.3, 0, L * 1.1, -H * 1.3, L * 0.35);
    lg.addColorStop(0, "#ffffff"); lg.addColorStop(0.3, s.fin); lg.addColorStop(1, hexA(s.fin, 0));
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(L * 1.1, -H * 1.3, L * 0.35, 0, TAU); ctx.fill();
    ctx.fillStyle = "#f0e8c8"; ctx.beginPath(); ctx.arc(L * 0.45, -H * 0.4, Math.max(1.2, L * 0.07), 0, TAU); ctx.fill();
    ctx.fillStyle = "#101018"; ctx.beginPath(); ctx.arc(L * 0.47, -H * 0.4, Math.max(0.7, L * 0.04), 0, TAU); ctx.fill();
  },
  fang(ctx, s, L, t, o) {
    standardFish(ctx, s, L, t, o, L * 0.3, { hump: 1, belly: 1, stalk: 0.14, snout: 0.6, peak: 0.25 });
    ctx.fillStyle = "#f4f0e8";
    for (let i = 0; i < 4; i++) { const x = L * (0.7 + i * 0.08); ctx.beginPath(); ctx.moveTo(x, L * 0.02); ctx.lineTo(x + L * 0.02, L * (0.24 + (i % 2) * 0.12)); ctx.lineTo(x + L * 0.04, L * 0.02); ctx.fill(); }
  },
  barreleye(ctx, s, L, t, o) {
    standardFish(ctx, s, L, t, o, L * 0.3, { hump: 0.9, belly: 1, stalk: 0.18, snout: 0.5, peak: 0.25 });
    // A transparent dome over tube eyes.
    ctx.fillStyle = "rgba(200,240,255,0.18)"; ctx.strokeStyle = "rgba(220,250,255,0.5)"; ctx.lineWidth = Math.max(0.6, L * 0.02);
    ctx.beginPath(); ctx.ellipse(L * 0.55, -L * 0.25, L * 0.42, L * 0.3, 0, Math.PI, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#7affa0"; ctx.beginPath(); ctx.arc(L * 0.5, -L * 0.33, L * 0.08, 0, TAU); ctx.arc(L * 0.7, -L * 0.33, L * 0.08, 0, TAU); ctx.fill();
  },
  blob(ctx, s, L, t, o) {
    const sag = Math.sin(t * 1.2) * 0.03;
    tailFin(ctx, s, L * 0.8, L * 0.25, t, "round");
    ctx.beginPath(); ctx.moveTo(L * 0.7, -L * 0.1); ctx.bezierCurveTo(L * 0.7, -L * 0.7, -L * 0.6, -L * 0.6, -L * 0.75, 0); ctx.bezierCurveTo(-L * 0.6, L * (0.55 + sag), L * 0.8, L * (0.65 + sag), L * 0.7, -L * 0.1);
    const g = ctx.createRadialGradient(0, -L * 0.2, 2, 0, 0, L * 0.8); g.addColorStop(0, shade(s.back, 0.2)); g.addColorStop(1, s.back);
    ctx.globalAlpha *= s.ghostly ? 0.8 : 1; ctx.fillStyle = g; ctx.fill(); ctx.globalAlpha /= s.ghostly ? 0.8 : 1;
    // The famous nose and frown.
    ctx.fillStyle = shade(s.back, 0.1); ctx.beginPath(); ctx.ellipse(L * 0.72, L * 0.05, L * 0.16, L * 0.22, 0.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = shade(s.back, -0.35); ctx.lineWidth = Math.max(0.8, L * 0.03);
    ctx.beginPath(); ctx.arc(L * 0.45, L * 0.42, L * 0.15, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.fillStyle = "#101018"; ctx.beginPath(); ctx.arc(L * 0.42, -L * 0.15, Math.max(1, L * 0.045), 0, TAU); ctx.fill();
  },
  crab(ctx, s, L, t, o) {
    ctx.strokeStyle = shade(s.back, -0.2); ctx.lineWidth = Math.max(1, L * 0.06); ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) for (const sg of [-1, 1]) {
      const a = Math.sin(t * 6 + i + sg) * 0.15;
      ctx.beginPath(); ctx.moveTo(sg * L * 0.3, L * (0.05 + i * 0.08)); ctx.lineTo(sg * L * (0.8 + i * 0.05), L * (0.0 + i * 0.12) - L * 0.2 + a * L); ctx.lineTo(sg * L * (1.0 + i * 0.05), L * (0.35 + i * 0.1)); ctx.stroke();
    }
    for (const sg of [-1, 1]) { ctx.fillStyle = s.back; ctx.beginPath(); ctx.ellipse(sg * L * 0.6, -L * 0.45, L * 0.2, L * 0.12, sg * 0.5, 0, TAU); ctx.fill(); ctx.strokeStyle = shade(s.back, -0.3); ctx.stroke(); }
    const g = ctx.createRadialGradient(0, -L * 0.15, 2, 0, 0, L * 0.6); g.addColorStop(0, shade(s.back, 0.25)); g.addColorStop(1, shade(s.back, -0.2));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, L * 0.5, L * 0.38, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = shade(s.back, -0.35); for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(-L * 0.3 + i * L * 0.08, -L * 0.2); ctx.lineTo(-L * 0.28 + i * L * 0.08, -L * 0.3); ctx.lineTo(-L * 0.26 + i * L * 0.08, -L * 0.2); ctx.fill(); }
    ctx.fillStyle = "#101018"; ctx.beginPath(); ctx.arc(-L * 0.1, -L * 0.36, L * 0.04, 0, TAU); ctx.arc(L * 0.1, -L * 0.36, L * 0.04, 0, TAU); ctx.fill();
  },
  isopod(ctx, s, L, t, o) {
    ctx.strokeStyle = shade(s.back, -0.25); ctx.lineWidth = Math.max(0.8, L * 0.04); ctx.lineCap = "round";
    for (let i = 0; i < 7; i++) { const x = L * (0.5 - i * 0.15), a = Math.sin(t * 5 + i) * L * 0.04; ctx.beginPath(); ctx.moveTo(x, L * 0.25); ctx.lineTo(x - L * 0.05 + a, L * 0.45); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(L * 0.75, -L * 0.1); ctx.quadraticCurveTo(L * 1.1, -L * 0.3, L * 1.2, -L * 0.1); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const x = L * (0.6 - i * 0.17), w = L * 0.17, h = L * (0.42 - Math.abs(i - 3) * 0.02);
      const g = ctx.createLinearGradient(0, -h, 0, h * 0.6); g.addColorStop(0, shade(s.back, 0.2)); g.addColorStop(1, shade(s.back, -0.25));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, 0, w * 0.6, h * 0.6, 0, Math.PI, TAU); ctx.lineTo(x + w * 0.6, h * 0.25); ctx.lineTo(x - w * 0.6, h * 0.25); ctx.fill();
      ctx.strokeStyle = shade(s.back, -0.35); ctx.lineWidth = Math.max(0.5, L * 0.015); ctx.stroke();
    }
    ctx.fillStyle = "#101018"; ctx.beginPath(); ctx.ellipse(L * 0.62, -L * 0.12, L * 0.05, L * 0.08, 0.4, 0, TAU); ctx.fill();
  },
};

/** Treasures and junk. Same conventions as fish, sized by `scale`. */
export function paintTreasure(ctx, id, t, scale = 1) {
  const L = 24 * scale;
  ctx.save();
  if (id === "boot") {
    ctx.fillStyle = "#5a3a1e"; ctx.beginPath(); ctx.moveTo(-L * 0.3, -L * 0.8); ctx.lineTo(L * 0.2, -L * 0.8); ctx.lineTo(L * 0.25, L * 0.1); ctx.lineTo(L * 0.8, L * 0.2); ctx.quadraticCurveTo(L * 0.95, L * 0.5, L * 0.8, L * 0.55); ctx.lineTo(-L * 0.35, L * 0.55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#2a1a0a"; ctx.fillRect(-L * 0.4, L * 0.48, L * 1.25, L * 0.12);
    ctx.strokeStyle = "#c9a04a"; ctx.lineWidth = Math.max(0.8, L * 0.04); for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-L * 0.1, -L * 0.6 + i * L * 0.2); ctx.lineTo(L * 0.12, -L * 0.55 + i * L * 0.2); ctx.stroke(); }
    ctx.fillStyle = "#3a8a3a"; ctx.beginPath(); ctx.ellipse(-L * 0.25, -L * 0.85, L * 0.25, L * 0.08, -0.3, 0, TAU); ctx.fill();
  } else if (id === "can") {
    const g = ctx.createLinearGradient(-L * 0.35, 0, L * 0.35, 0); g.addColorStop(0, "#6a3a1a"); g.addColorStop(0.5, "#c0703a"); g.addColorStop(1, "#5a2a10");
    ctx.fillStyle = g; ctx.fillRect(-L * 0.35, -L * 0.5, L * 0.7, L);
    ctx.fillStyle = "#c0303a"; ctx.fillRect(-L * 0.35, -L * 0.2, L * 0.7, L * 0.35);
    ctx.fillStyle = "#8a8a92"; ctx.beginPath(); ctx.ellipse(0, -L * 0.5, L * 0.35, L * 0.1, 0, 0, TAU); ctx.fill();
  } else if (id === "bottle") {
    const g = ctx.createLinearGradient(-L * 0.3, 0, L * 0.3, 0); g.addColorStop(0, "rgba(60,140,90,0.85)"); g.addColorStop(0.5, "rgba(140,220,170,0.75)"); g.addColorStop(1, "rgba(40,110,70,0.85)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-L * 0.3, L * 0.7); ctx.lineTo(-L * 0.3, -L * 0.2); ctx.quadraticCurveTo(-L * 0.3, -L * 0.45, -L * 0.1, -L * 0.55); ctx.lineTo(-L * 0.1, -L * 0.85); ctx.lineTo(L * 0.1, -L * 0.85); ctx.lineTo(L * 0.1, -L * 0.55); ctx.quadraticCurveTo(L * 0.3, -L * 0.45, L * 0.3, -L * 0.2); ctx.lineTo(L * 0.3, L * 0.7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#a07040"; ctx.fillRect(-L * 0.11, -L * 0.98, L * 0.22, L * 0.16);
    ctx.fillStyle = "#f4e8c8"; ctx.save(); ctx.rotate(0.1); ctx.fillRect(-L * 0.12, -L * 0.1, L * 0.24, L * 0.6); ctx.restore();
  } else if (id === "pearl") {
    ctx.fillStyle = "#c9a0b0"; ctx.beginPath(); ctx.ellipse(0, L * 0.3, L * 0.8, L * 0.35, 0, 0, Math.PI); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, L * 0.1, L * 0.8, L * 0.3, 0, Math.PI, TAU); ctx.fill();
    const g = ctx.createRadialGradient(-L * 0.12, -L * 0.15, 1, 0, 0, L * 0.4); g.addColorStop(0, "#ffffff"); g.addColorStop(0.6, "#f4e8f0"); g.addColorStop(1, "#c8b0c8");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, L * 0.38, 0, TAU); ctx.fill();
  } else if (id === "chest" || id === "idol") {
    if (id === "chest") {
      ctx.fillStyle = "#6a4422"; ctx.fillRect(-L * 0.8, -L * 0.2, L * 1.6, L * 0.8);
      ctx.fillStyle = "#8a5a2a"; ctx.beginPath(); ctx.moveTo(-L * 0.8, -L * 0.2); ctx.quadraticCurveTo(0, -L * 0.85, L * 0.8, -L * 0.2); ctx.fill();
      ctx.fillStyle = "#c9a24a"; ctx.fillRect(-L * 0.8, -L * 0.25, L * 1.6, L * 0.1); ctx.fillRect(-L * 0.1, -L * 0.25, L * 0.2, L * 0.4);
      ctx.fillStyle = "#ffd76a"; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-L * 0.4 + i * L * 0.2, -L * 0.3 - (i % 2) * L * 0.1, L * 0.1, 0, TAU); ctx.fill(); }
    } else {
      const g = ctx.createLinearGradient(0, -L, 0, L); g.addColorStop(0, "#5a4a8a"); g.addColorStop(1, "#1a1030");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -L); ctx.lineTo(L * 0.4, -L * 0.4); ctx.lineTo(L * 0.3, L * 0.8); ctx.lineTo(-L * 0.3, L * 0.8); ctx.lineTo(-L * 0.4, -L * 0.4); ctx.closePath(); ctx.fill();
      const a = 0.6 + Math.sin(t * 3) * 0.3; ctx.fillStyle = `rgba(255,79,216,${a})`; ctx.beginPath(); ctx.arc(-L * 0.12, -L * 0.35, L * 0.07, 0, TAU); ctx.arc(L * 0.12, -L * 0.35, L * 0.07, 0, TAU); ctx.fill();
    }
    const g2 = ctx.createRadialGradient(0, 0, 1, 0, 0, L * 1.3); g2.addColorStop(0, "rgba(255,220,120,0.25)"); g2.addColorStop(1, "rgba(255,220,120,0)");
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(0, 0, L * 1.3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
