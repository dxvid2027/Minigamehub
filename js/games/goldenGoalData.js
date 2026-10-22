// ==========================================================================
// Golden Goal — teams, kits, flags and crests.
//
// Every nation and club is data: a strength rating, a home and an away kit,
// and a flag (or crest) described in a tiny drawing language so the same
// picture can be painted onto the scoreboard canvas and turned into an image
// for the menus. Nothing is a bitmap; it all scales.
//
// Kits: `shirt` is the base colour, `pattern` one of solid | stripes | hoops |
// halves | sash | band | sleeves, drawn in `trim`. Ratings run roughly 70–90
// and decide how fast, sharp and composed a side plays.
// ==========================================================================

const k = (shirt, trim, shorts, socks, pattern = "solid") => ({ shirt, trim, shorts, socks, pattern });

// --- Flags ----------------------------------------------------------------
// A flag is [base, ...overlays]. Base: ["h"|"v", colours, weights?] or
// ["solid", colour]. Overlays use fractions of the flag's width/height.
const STRIPES_USA = Array.from({ length: 13 }, (_, i) => (i % 2 ? "#ffffff" : "#B22234"));
const STRIPES_URU = Array.from({ length: 9 }, (_, i) => (i % 2 ? "#0038A8" : "#ffffff"));

export const NATIONS = [
  // UEFA
  { id: "ENG", name: "England", r: 87, home: k("#ffffff", "#1a2a6c", "#1a2a6c", "#ffffff"), away: k("#c8102e", "#ffffff", "#c8102e", "#c8102e"), flag: [["solid", "#ffffff"], ["cross", "#CE1124", 0.2]] },
  { id: "FRA", name: "France", r: 88, home: k("#1d3a8a", "#ffffff", "#ffffff", "#c8102e"), away: k("#f4f4f4", "#1d3a8a", "#f4f4f4", "#f4f4f4"), flag: [["v", ["#002395", "#ffffff", "#ED2939"]]] },
  { id: "ESP", name: "Spain", r: 88, home: k("#c60b1e", "#ffc400", "#1a2a6c", "#1a2a6c"), away: k("#f2e6c9", "#c60b1e", "#f2e6c9", "#f2e6c9"), flag: [["h", ["#AA151B", "#F1BF00", "#AA151B"], [1, 2, 1]], ["rect", 0.24, 0.38, 0.1, 0.24, "#AA151B"]] },
  { id: "GER", name: "Germany", r: 85, home: k("#ffffff", "#111111", "#111111", "#ffffff"), away: k("#2b2b6e", "#e8336d", "#2b2b6e", "#2b2b6e"), flag: [["h", ["#000000", "#DD0000", "#FFCE00"]]] },
  { id: "POR", name: "Portugal", r: 85, home: k("#b0102b", "#0f6b3a", "#0f6b3a", "#b0102b"), away: k("#f3f0e6", "#0f6b3a", "#f3f0e6", "#f3f0e6"), flag: [["v", ["#006600", "#FF0000"], [2, 3]], ["disc", 0.4, 0.5, 0.22, "#FFDF00"], ["disc", 0.4, 0.5, 0.15, "#FF0000"], ["disc", 0.4, 0.5, 0.09, "#ffffff"]] },
  { id: "NED", name: "Netherlands", r: 84, home: k("#f36c21", "#111111", "#f36c21", "#f36c21"), away: k("#1b2a5c", "#f36c21", "#1b2a5c", "#1b2a5c"), flag: [["h", ["#AE1C28", "#ffffff", "#21468B"]]] },
  { id: "BEL", name: "Belgium", r: 82, home: k("#c8102e", "#f2c500", "#c8102e", "#c8102e"), away: k("#7fc5ee", "#ffffff", "#7fc5ee", "#7fc5ee"), flag: [["v", ["#000000", "#FDDA24", "#EF3340"]]] },
  { id: "CRO", name: "Croatia", r: 81, home: k("#ffffff", "#d7141a", "#ffffff", "#1c3f94", "checks"), away: k("#1c3f94", "#0b1e4f", "#1c3f94", "#1c3f94"), flag: [["h", ["#FF0000", "#ffffff", "#171796"]], ["checker", 0.5, 0.52, 0.32, "#FF0000", "#ffffff"]] },
  { id: "ITA", name: "Italy", r: 83, home: k("#1c5bb8", "#ffffff", "#ffffff", "#1c5bb8"), away: k("#ffffff", "#1c5bb8", "#ffffff", "#ffffff"), flag: [["v", ["#009246", "#ffffff", "#CE2B37"]]] },
  { id: "NOR", name: "Norway", r: 80, home: k("#c8102e", "#ffffff", "#ffffff", "#1a2a6c"), away: k("#ffffff", "#1a2a6c", "#1a2a6c", "#ffffff"), flag: [["solid", "#BA0C2F"], ["nordic", "#ffffff", 0.26, 0.36], ["nordic", "#00205B", 0.13, 0.36]] },
  { id: "SUI", name: "Switzerland", r: 79, home: k("#d52b1e", "#ffffff", "#d52b1e", "#d52b1e"), away: k("#ffffff", "#d52b1e", "#ffffff", "#ffffff"), flag: [["solid", "#DA291C"], ["pcross", "#ffffff", 0.56, 0.17]] },
  { id: "AUT", name: "Austria", r: 78, home: k("#ed2939", "#ffffff", "#ffffff", "#ed2939"), away: k("#1b1b1b", "#ed2939", "#1b1b1b", "#1b1b1b"), flag: [["h", ["#ED2939", "#ffffff", "#ED2939"]]] },
  { id: "DEN", name: "Denmark", r: 78, home: k("#c8102e", "#ffffff", "#ffffff", "#c8102e"), away: k("#ffffff", "#c8102e", "#ffffff", "#ffffff"), flag: [["solid", "#C8102E"], ["nordic", "#ffffff", 0.16, 0.36]] },
  { id: "SCO", name: "Scotland", r: 75, home: k("#1b2c5c", "#ffffff", "#ffffff", "#1b2c5c"), away: k("#f2d6dc", "#1b2c5c", "#1b2c5c", "#f2d6dc"), flag: [["solid", "#005EB8"], ["saltire", "#ffffff", 0.16]] },
  { id: "TUR", name: "Türkiye", r: 77, home: k("#ffffff", "#e30a17", "#ffffff", "#ffffff"), away: k("#e30a17", "#ffffff", "#e30a17", "#e30a17"), flag: [["solid", "#E30A17"], ["crescent", 0.38, 0.5, 0.25, "#ffffff", "#E30A17"], ["star", 0.55, 0.5, 0.11, "#ffffff"]] },
  { id: "CZE", name: "Czechia", r: 75, home: k("#d7141a", "#11457e", "#ffffff", "#d7141a"), away: k("#ffffff", "#11457e", "#11457e", "#ffffff"), flag: [["h", ["#ffffff", "#D7141A"]], ["tri", "#11457E", 0.5]] },
  // CONMEBOL
  { id: "ARG", name: "Argentina", r: 88, home: k("#ffffff", "#75aadb", "#111111", "#ffffff", "stripes"), away: k("#1b1b4b", "#75aadb", "#1b1b4b", "#1b1b4b"), flag: [["h", ["#75AADB", "#ffffff", "#75AADB"]], ["sun", 0.5, 0.5, 0.1, "#F6B40E"]] },
  { id: "BRA", name: "Brazil", r: 86, home: k("#ffdc02", "#0b8a3e", "#1c3f94", "#ffffff"), away: k("#1c3f94", "#ffdc02", "#ffffff", "#1c3f94"), flag: [["solid", "#009C3B"], ["diamond", "#FFDF00", 0.1], ["disc", 0.5, 0.5, 0.21, "#002776"]] },
  { id: "URU", name: "Uruguay", r: 81, home: k("#5cb8e6", "#111111", "#111111", "#111111"), away: k("#ffffff", "#5cb8e6", "#ffffff", "#ffffff"), flag: [["h", STRIPES_URU], ["rect", 0, 0, 0.36, 0.555, "#ffffff"], ["sun", 0.18, 0.28, 0.1, "#FCD116"]] },
  { id: "COL", name: "Colombia", r: 81, home: k("#fcd116", "#003893", "#003893", "#ffffff"), away: k("#1a2a4a", "#fcd116", "#1a2a4a", "#1a2a4a"), flag: [["h", ["#FCD116", "#003893", "#CE1126"], [2, 1, 1]]] },
  { id: "ECU", name: "Ecuador", r: 78, home: k("#ffd100", "#0072ce", "#0072ce", "#ef3340"), away: k("#0b2a5a", "#ffd100", "#0b2a5a", "#0b2a5a"), flag: [["h", ["#FFD100", "#0072CE", "#EF3340"], [2, 1, 1]], ["disc", 0.5, 0.5, 0.12, "#8a6d3b"]] },
  { id: "PAR", name: "Paraguay", r: 75, home: k("#ffffff", "#d52b1e", "#0038a8", "#0038a8", "stripes"), away: k("#0038a8", "#ffffff", "#0038a8", "#0038a8"), flag: [["h", ["#D52B1E", "#ffffff", "#0038A8"]], ["disc", 0.5, 0.5, 0.1, "#ffffff"], ["disc", 0.5, 0.5, 0.06, "#2a7a3a"]] },
  // CONCACAF
  { id: "USA", name: "USA", r: 79, home: k("#ffffff", "#1a2a6c", "#1a2a6c", "#ffffff"), away: k("#1a2a6c", "#c8102e", "#1a2a6c", "#1a2a6c", "hoops"), flag: [["h", STRIPES_USA], ["canton", 0.4, 0.54, "#3C3B6E"], ["dots", 0.02, 0.04, 0.38, 0.5, 6, 5, "#ffffff"]] },
  { id: "MEX", name: "Mexico", r: 79, home: k("#0b6b3a", "#c8102e", "#ffffff", "#c8102e"), away: k("#f1ece0", "#0b6b3a", "#f1ece0", "#f1ece0"), flag: [["v", ["#006847", "#ffffff", "#CE1126"]], ["disc", 0.5, 0.5, 0.13, "#8C6239"], ["disc", 0.5, 0.52, 0.07, "#4a7a2a"]] },
  { id: "CAN", name: "Canada", r: 75, home: k("#d80621", "#ffffff", "#d80621", "#d80621"), away: k("#ffffff", "#d80621", "#ffffff", "#ffffff"), flag: [["v", ["#FF0000", "#ffffff", "#FF0000"], [1, 2, 1]], ["star", 0.5, 0.5, 0.24, "#FF0000", 11, 0.55]] },
  { id: "PAN", name: "Panama", r: 72, home: k("#d21034", "#ffffff", "#d21034", "#d21034"), away: k("#ffffff", "#072357", "#ffffff", "#ffffff"), flag: [["solid", "#ffffff"], ["rect", 0.5, 0, 0.5, 0.5, "#DA121A"], ["rect", 0, 0.5, 0.5, 0.5, "#072357"], ["star", 0.25, 0.25, 0.12, "#072357"], ["star", 0.75, 0.75, 0.12, "#DA121A"]] },
  { id: "HAI", name: "Haiti", r: 69, home: k("#00209f", "#d21034", "#d21034", "#00209f"), away: k("#ffffff", "#00209f", "#ffffff", "#ffffff"), flag: [["h", ["#00209F", "#D21034"]], ["rect", 0.38, 0.33, 0.24, 0.34, "#ffffff"], ["disc", 0.5, 0.5, 0.08, "#2a7a3a"]] },
  { id: "CUW", name: "Curaçao", r: 68, home: k("#0033a0", "#f9e814", "#0033a0", "#0033a0"), away: k("#f9e814", "#0033a0", "#f9e814", "#f9e814"), flag: [["solid", "#002B7F"], ["rect", 0, 0.62, 1, 0.13, "#F9E814"], ["star", 0.14, 0.18, 0.07, "#ffffff"], ["star", 0.26, 0.32, 0.09, "#ffffff"]] },
  // CAF
  { id: "MAR", name: "Morocco", r: 81, home: k("#c1272d", "#006233", "#006233", "#c1272d"), away: k("#ffffff", "#c1272d", "#ffffff", "#ffffff"), flag: [["solid", "#C1272D"], ["star", 0.5, 0.5, 0.24, "#006233", 5, 0.38]] },
  { id: "SEN", name: "Senegal", r: 78, home: k("#ffffff", "#00853f", "#ffffff", "#ffffff"), away: k("#00853f", "#fdef42", "#00853f", "#00853f"), flag: [["v", ["#00853F", "#FDEF42", "#E31B23"]], ["star", 0.5, 0.5, 0.15, "#00853F"]] },
  { id: "EGY", name: "Egypt", r: 76, home: k("#c8102e", "#ffffff", "#ffffff", "#c8102e"), away: k("#ffffff", "#111111", "#111111", "#ffffff"), flag: [["h", ["#CE1126", "#ffffff", "#000000"]], ["disc", 0.5, 0.5, 0.09, "#C09300"]] },
  { id: "ALG", name: "Algeria", r: 76, home: k("#ffffff", "#006233", "#ffffff", "#ffffff"), away: k("#006233", "#ffffff", "#006233", "#006233"), flag: [["v", ["#006233", "#ffffff"]], ["crescent", 0.5, 0.5, 0.25, "#D21034", null], ["star", 0.57, 0.5, 0.1, "#D21034"]] },
  { id: "TUN", name: "Tunisia", r: 74, home: k("#e70013", "#ffffff", "#e70013", "#e70013"), away: k("#ffffff", "#e70013", "#ffffff", "#ffffff"), flag: [["solid", "#E70013"], ["disc", 0.5, 0.5, 0.26, "#ffffff"], ["crescent", 0.5, 0.5, 0.19, "#E70013", "#ffffff"], ["star", 0.53, 0.5, 0.09, "#E70013"]] },
  { id: "CIV", name: "Ivory Coast", r: 77, home: k("#f77f00", "#009e60", "#ffffff", "#009e60"), away: k("#ffffff", "#f77f00", "#ffffff", "#f77f00"), flag: [["v", ["#F77F00", "#ffffff", "#009E60"]]] },
  { id: "GHA", name: "Ghana", r: 74, home: k("#ffffff", "#111111", "#ffffff", "#ffffff"), away: k("#ce1126", "#fcd116", "#ce1126", "#ce1126"), flag: [["h", ["#CE1126", "#FCD116", "#006B3F"]], ["star", 0.5, 0.5, 0.15, "#000000"]] },
  { id: "CPV", name: "Cape Verde", r: 71, home: k("#003893", "#cf2027", "#003893", "#003893"), away: k("#ffffff", "#003893", "#ffffff", "#ffffff"), flag: [["solid", "#003893"], ["rect", 0, 0.5, 1, 0.083, "#ffffff"], ["rect", 0, 0.583, 1, 0.083, "#CF2027"], ["rect", 0, 0.666, 1, 0.083, "#ffffff"], ["star", 0.36, 0.6, 0.07, "#F7D116"]] },
  { id: "RSA", name: "South Africa", r: 72, home: k("#ffb81c", "#007749", "#007749", "#ffb81c"), away: k("#007749", "#ffb81c", "#ffffff", "#007749"), flag: [["h", ["#E03C31", "#001489"]], ["rect", 0, 0.38, 1, 0.24, "#ffffff"], ["rect", 0, 0.42, 1, 0.16, "#007749"], ["tri", "#FFB81C", 0.42], ["tri", "#000000", 0.33]] },
  { id: "COD", name: "DR Congo", r: 72, home: k("#007fff", "#ce1021", "#007fff", "#007fff"), away: k("#ce1021", "#f7d618", "#ce1021", "#ce1021"), flag: [["solid", "#007FFF"], ["diag", "#F7D618", 0.34], ["diag", "#CE1021", 0.22], ["star", 0.17, 0.24, 0.13, "#F7D618"]] },
  // AFC
  { id: "JPN", name: "Japan", r: 80, home: k("#1b2f86", "#ffffff", "#1b2f86", "#1b2f86"), away: k("#ffffff", "#1b2f86", "#ffffff", "#ffffff"), flag: [["solid", "#ffffff"], ["disc", 0.5, 0.5, 0.3, "#BC002D"]] },
  { id: "KOR", name: "South Korea", r: 77, home: k("#d5202b", "#111111", "#111111", "#d5202b"), away: k("#ffffff", "#d5202b", "#ffffff", "#ffffff"), flag: [["solid", "#ffffff"], ["taeguk", 0.5, 0.5, 0.25]] },
  { id: "IRN", name: "Iran", r: 75, home: k("#ffffff", "#da0000", "#ffffff", "#ffffff"), away: k("#da0000", "#ffffff", "#da0000", "#da0000"), flag: [["h", ["#239F40", "#ffffff", "#DA0000"]], ["disc", 0.5, 0.5, 0.09, "#DA0000"]] },
  { id: "AUS", name: "Australia", r: 75, home: k("#ffcd00", "#00843d", "#00843d", "#ffcd00"), away: k("#00843d", "#ffcd00", "#00843d", "#00843d"), flag: [["solid", "#012169"], ["canton", 0.5, 0.5, "#012169"], ["saltire", "#ffffff", 0.1, 0.5, 0.5], ["star", 0.25, 0.75, 0.13, "#ffffff", 7], ["star", 0.75, 0.3, 0.07, "#ffffff", 7], ["star", 0.65, 0.55, 0.07, "#ffffff", 7], ["star", 0.85, 0.5, 0.06, "#ffffff", 7], ["star", 0.75, 0.82, 0.07, "#ffffff", 7]] },
  { id: "KSA", name: "Saudi Arabia", r: 72, home: k("#ffffff", "#006c35", "#ffffff", "#ffffff"), away: k("#006c35", "#ffffff", "#006c35", "#006c35"), flag: [["solid", "#006C35"], ["rect", 0.22, 0.32, 0.56, 0.14, "#ffffff"], ["rect", 0.24, 0.62, 0.52, 0.05, "#ffffff"]] },
  { id: "QAT", name: "Qatar", r: 71, home: k("#8a1538", "#ffffff", "#ffffff", "#8a1538"), away: k("#ffffff", "#8a1538", "#ffffff", "#ffffff"), flag: [["v", ["#ffffff", "#8A1538"], [1, 2.6]], ["zigzag", 0.28, "#ffffff", 9]] },
  { id: "UZB", name: "Uzbekistan", r: 72, home: k("#ffffff", "#0099b5", "#ffffff", "#ffffff"), away: k("#0099b5", "#ffffff", "#0099b5", "#0099b5"), flag: [["h", ["#0099B5", "#ffffff", "#1EB53A"]], ["rect", 0, 0.32, 1, 0.025, "#CE1126"], ["rect", 0, 0.655, 1, 0.025, "#CE1126"], ["crescent", 0.15, 0.17, 0.12, "#ffffff", "#0099B5"]] },
  { id: "JOR", name: "Jordan", r: 70, home: k("#ffffff", "#ce1126", "#ffffff", "#ffffff"), away: k("#ce1126", "#ffffff", "#ce1126", "#ce1126"), flag: [["h", ["#000000", "#ffffff", "#007A3D"]], ["tri", "#CE1126", 0.5], ["star", 0.17, 0.5, 0.07, "#ffffff", 7]] },
  { id: "IRQ", name: "Iraq", r: 70, home: k("#007a3d", "#ffffff", "#007a3d", "#007a3d"), away: k("#ffffff", "#007a3d", "#ffffff", "#ffffff"), flag: [["h", ["#CE1126", "#ffffff", "#000000"]], ["rect", 0.3, 0.44, 0.4, 0.12, "#007A3D"]] },
  // OFC
  { id: "NZL", name: "New Zealand", r: 68, home: k("#ffffff", "#111111", "#111111", "#ffffff"), away: k("#111111", "#ffffff", "#111111", "#111111"), flag: [["solid", "#012169"], ["canton", 0.5, 0.5, "#012169"], ["saltire", "#ffffff", 0.1, 0.5, 0.5], ["star", 0.75, 0.25, 0.07, "#CC142B"], ["star", 0.66, 0.5, 0.07, "#CC142B"], ["star", 0.84, 0.45, 0.06, "#CC142B"], ["star", 0.75, 0.78, 0.08, "#CC142B"]] },
].map(t => ({ ...t, kind: "nation" }));

// --- Clubs ----------------------------------------------------------------
// A crest is a shield in the club colours with its initials. No real club
// badges are reproduced.
const club = (id, name, r, home, away, crest) => ({ id, name, r, home, away, crest, kind: "club" });

export const CLUBS = [
  club("RMA", "Real Madrid", 88, k("#ffffff", "#febe10", "#ffffff", "#ffffff"), k("#1a2a5c", "#febe10", "#1a2a5c", "#1a2a5c"), ["#ffffff", "#febe10", "#1a2a5c"]),
  club("MCI", "Manchester City", 88, k("#6cabdd", "#ffffff", "#ffffff", "#6cabdd"), k("#1c2c5b", "#6cabdd", "#1c2c5b", "#1c2c5b"), ["#6cabdd", "#ffffff", "#1c2c5b"]),
  club("BAY", "Bayern München", 87, k("#dc052d", "#ffffff", "#dc052d", "#dc052d"), k("#ffffff", "#dc052d", "#ffffff", "#ffffff"), ["#dc052d", "#0066b2", "#ffffff"]),
  club("LIV", "Liverpool", 87, k("#c8102e", "#f6eb61", "#c8102e", "#c8102e"), k("#f2f2f2", "#c8102e", "#f2f2f2", "#f2f2f2"), ["#c8102e", "#00b2a9", "#f6eb61"]),
  club("ARS", "Arsenal", 87, k("#ef0107", "#ffffff", "#ffffff", "#ef0107", "sleeves"), k("#1b2a4a", "#e8c26a", "#1b2a4a", "#1b2a4a"), ["#ef0107", "#ffffff", "#063672"]),
  club("BAR", "Barcelona", 86, k("#a50044", "#004d98", "#004d98", "#a50044", "stripes"), k("#f7c600", "#a50044", "#f7c600", "#f7c600"), ["#a50044", "#004d98", "#edbb00"]),
  club("PSG", "Paris Saint-Germain", 86, k("#004170", "#da291c", "#004170", "#004170", "band"), k("#ffffff", "#004170", "#ffffff", "#ffffff"), ["#004170", "#da291c", "#ffffff"]),
  club("INT", "Inter", 85, k("#0068a8", "#111111", "#111111", "#111111", "stripes"), k("#ffffff", "#0068a8", "#ffffff", "#ffffff"), ["#0068a8", "#111111", "#d4af37"]),
  club("LEV", "Bayer Leverkusen", 84, k("#e32221", "#111111", "#111111", "#e32221"), k("#ffffff", "#e32221", "#ffffff", "#ffffff"), ["#e32221", "#111111", "#ffffff"]),
  club("ATM", "Atlético Madrid", 83, k("#cb3524", "#ffffff", "#262e62", "#cb3524", "stripes"), k("#262e62", "#cb3524", "#262e62", "#262e62"), ["#cb3524", "#ffffff", "#262e62"]),
  club("CHE", "Chelsea", 83, k("#034694", "#ffffff", "#034694", "#ffffff"), k("#f2f2f2", "#034694", "#f2f2f2", "#f2f2f2"), ["#034694", "#dba111", "#ffffff"]),
  club("BVB", "Borussia Dortmund", 82, k("#fde100", "#111111", "#111111", "#fde100"), k("#111111", "#fde100", "#111111", "#111111"), ["#fde100", "#111111", "#ffffff"]),
  club("NAP", "Napoli", 82, k("#12a0d7", "#ffffff", "#ffffff", "#12a0d7"), k("#ffffff", "#12a0d7", "#ffffff", "#ffffff"), ["#12a0d7", "#ffffff", "#0b3c5d"]),
  club("MIL", "AC Milan", 82, k("#fb090b", "#111111", "#ffffff", "#111111", "stripes"), k("#ffffff", "#fb090b", "#ffffff", "#ffffff"), ["#fb090b", "#111111", "#ffffff"]),
  club("JUV", "Juventus", 82, k("#ffffff", "#111111", "#111111", "#ffffff", "stripes"), k("#f2b21b", "#111111", "#f2b21b", "#f2b21b"), ["#111111", "#ffffff", "#d4af37"]),
  club("ATA", "Atalanta", 81, k("#1e71b8", "#111111", "#111111", "#1e71b8", "stripes"), k("#ffffff", "#1e71b8", "#ffffff", "#ffffff"), ["#1e71b8", "#111111", "#ffffff"]),
  club("AVL", "Aston Villa", 81, k("#670e36", "#95bfe5", "#ffffff", "#95bfe5", "sleeves"), k("#f2f2f2", "#670e36", "#f2f2f2", "#f2f2f2"), ["#670e36", "#95bfe5", "#fee505"]),
  club("BEN", "Benfica", 81, k("#e83030", "#ffffff", "#ffffff", "#e83030"), k("#111111", "#e83030", "#111111", "#111111"), ["#e83030", "#ffffff", "#f7c600"]),
  club("TOT", "Tottenham", 80, k("#ffffff", "#132257", "#132257", "#ffffff"), k("#132257", "#ffffff", "#132257", "#132257"), ["#ffffff", "#132257", "#132257"]),
  club("NEW", "Newcastle", 80, k("#ffffff", "#111111", "#111111", "#111111", "stripes"), k("#2f6f5e", "#ffffff", "#2f6f5e", "#2f6f5e"), ["#111111", "#ffffff", "#41b6e6"]),
  club("SCP", "Sporting CP", 80, k("#008057", "#ffffff", "#111111", "#008057", "hoops"), k("#111111", "#008057", "#111111", "#111111"), ["#008057", "#ffffff", "#d4af37"]),
  club("POR", "Porto", 80, k("#ffffff", "#003a8c", "#003a8c", "#ffffff", "stripes"), k("#f28c28", "#111111", "#f28c28", "#f28c28"), ["#003a8c", "#ffffff", "#d4af37"]),
  club("LEI", "RB Leipzig", 79, k("#ffffff", "#dd0741", "#ffffff", "#dd0741"), k("#0c2043", "#dd0741", "#0c2043", "#0c2043"), ["#ffffff", "#dd0741", "#0c2043"]),
  club("PSV", "PSV", 79, k("#ed1c24", "#ffffff", "#111111", "#ed1c24", "stripes"), k("#111111", "#ed1c24", "#111111", "#111111"), ["#ed1c24", "#ffffff", "#111111"]),
  club("GAL", "Galatasaray", 79, k("#a90432", "#fdb912", "#ffffff", "#a90432", "halves"), k("#fdb912", "#a90432", "#fdb912", "#fdb912"), ["#a90432", "#fdb912", "#ffffff"]),
  club("VIL", "Villarreal", 79, k("#ffe667", "#005187", "#ffe667", "#ffe667"), k("#005187", "#ffe667", "#005187", "#005187"), ["#ffe667", "#005187", "#ffffff"]),
  club("ASM", "Monaco", 78, k("#ffffff", "#e51b22", "#ffffff", "#ffffff", "sash"), k("#111111", "#e51b22", "#111111", "#111111"), ["#e51b22", "#ffffff", "#d4af37"]),
  club("OLM", "Marseille", 78, k("#ffffff", "#2faee0", "#ffffff", "#ffffff"), k("#2faee0", "#ffffff", "#2faee0", "#2faee0"), ["#2faee0", "#ffffff", "#d4af37"]),
  club("LIL", "Lille", 78, k("#e01e13", "#20325f", "#20325f", "#e01e13"), k("#ffffff", "#e01e13", "#ffffff", "#ffffff"), ["#e01e13", "#20325f", "#ffffff"]),
  club("FEY", "Feyenoord", 78, k("#ffffff", "#e3001b", "#111111", "#111111", "halves"), k("#111111", "#e3001b", "#111111", "#111111"), ["#e3001b", "#ffffff", "#111111"]),
  club("AJA", "Ajax", 78, k("#ffffff", "#d2122e", "#ffffff", "#ffffff", "band"), k("#0b2b4f", "#d2122e", "#0b2b4f", "#0b2b4f"), ["#ffffff", "#d2122e", "#0b2b4f"]),
  club("SGE", "Eintracht Frankfurt", 78, k("#111111", "#e1000f", "#111111", "#111111"), k("#ffffff", "#e1000f", "#ffffff", "#ffffff"), ["#e1000f", "#111111", "#ffffff"]),
  club("BRU", "Club Brugge", 77, k("#0a3d91", "#111111", "#111111", "#0a3d91", "stripes"), k("#ffffff", "#0a3d91", "#ffffff", "#ffffff"), ["#0a3d91", "#111111", "#ffffff"]),
  club("CEL", "Celtic", 76, k("#018749", "#ffffff", "#ffffff", "#ffffff", "hoops"), k("#111111", "#f7c600", "#111111", "#111111"), ["#018749", "#ffffff", "#d4af37"]),
  club("OLY", "Olympiacos", 76, k("#e2001a", "#ffffff", "#e2001a", "#e2001a", "stripes"), k("#ffffff", "#e2001a", "#ffffff", "#ffffff"), ["#e2001a", "#ffffff", "#d4af37"]),
  club("SAL", "RB Salzburg", 75, k("#ffffff", "#e30613", "#ffffff", "#ffffff"), k("#e30613", "#ffffff", "#e30613", "#e30613"), ["#ffffff", "#e30613", "#0c2043"]),
];

export const TEAMS = Object.fromEntries([...NATIONS, ...CLUBS].map(t => [t.kind + ":" + t.id, t]));
export const teamKey = (t) => t.kind + ":" + t.id;
export const getTeam = (key) => TEAMS[key];

/** Goalkeepers wear something nobody else on the pitch does. */
export const GK_KITS = [
  k("#2ee66b", "#0c3d1e", "#111111", "#2ee66b"),
  k("#ffd400", "#111111", "#111111", "#ffd400"),
  k("#ff6ec7", "#3b0a2a", "#3b0a2a", "#ff6ec7"),
  k("#7a4dff", "#1c0f4a", "#1c0f4a", "#7a4dff"),
  k("#ff7a1a", "#3a1600", "#3a1600", "#ff7a1a"),
];

// --- Colour helpers -------------------------------------------------------
function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function colorDist(a, b) {
  const [r1, g1, b1] = hexRgb(a), [r2, g2, b2] = hexRgb(b);
  return Math.sqrt((r1 - r2) ** 2 * 0.3 + (g1 - g2) ** 2 * 0.59 + (b1 - b2) ** 2 * 0.11);
}
export function shade(hex, amt) {
  const [r, g, b] = hexRgb(hex);
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/** Home side keeps its kit; the away side changes if the shirts would clash. */
export function pickKits(home, away) {
  const a = home.home;
  let b = away.home;
  if (colorDist(a.shirt, b.shirt) < 70 || colorDist(a.shirt, b.trim) < 40 && b.pattern !== "solid") b = away.away;
  if (colorDist(a.shirt, b.shirt) < 70) b = { ...away.away, shirt: a.shirt === "#ffffff" ? "#1b1b2e" : "#ffffff", pattern: "solid" };
  return [a, b];
}

// --- Flag & crest painting ------------------------------------------------
function starPath(ctx, cx, cy, r, points = 5, inner = 0.42, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = rot + (i * Math.PI) / points;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
}

/** Paints a flag into the rectangle (x, y, w, h). */
export function paintFlag(ctx, spec, x, y, w, h) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  for (const item of spec) {
    const [type, ...a] = item;
    switch (type) {
      case "solid": ctx.fillStyle = a[0]; ctx.fillRect(x, y, w, h); break;
      case "h": case "v": {
        const cols = a[0], wts = a[1] || cols.map(() => 1);
        const total = wts.reduce((s, v) => s + v, 0);
        let off = 0;
        cols.forEach((c, i) => {
          const f = wts[i] / total;
          ctx.fillStyle = c;
          if (type === "h") ctx.fillRect(x, y + off * h, w, f * h + 0.6);
          else ctx.fillRect(x + off * w, y, f * w + 0.6, h);
          off += f;
        });
        break;
      }
      case "rect": ctx.fillStyle = a[4]; ctx.fillRect(x + a[0] * w, y + a[1] * h, a[2] * w, a[3] * h); break;
      case "canton": ctx.fillStyle = a[2]; ctx.fillRect(x, y, a[0] * w, a[1] * h); break;
      case "disc": ctx.fillStyle = a[3]; ctx.beginPath(); ctx.arc(x + a[0] * w, y + a[1] * h, a[2] * h, 0, Math.PI * 2); ctx.fill(); break;
      case "star": ctx.fillStyle = a[3]; starPath(ctx, x + a[0] * w, y + a[1] * h, a[2] * h, a[4] || 5, a[5] || 0.42); ctx.fill(); break;
      case "sun": {
        const cx = x + a[0] * w, cy = y + a[1] * h, r = a[2] * h;
        ctx.fillStyle = a[3];
        starPath(ctx, cx, cy, r * 1.7, 16, 0.6); ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "cross": { const t = a[1] * h; ctx.fillStyle = a[0]; ctx.fillRect(x, y + h / 2 - t / 2, w, t); ctx.fillRect(x + w / 2 - t / 2, y, t, h); break; }
      case "pcross": {
        const len = a[1] * h, t = a[2] * h; ctx.fillStyle = a[0];
        ctx.fillRect(x + w / 2 - len / 2, y + h / 2 - t / 2, len, t);
        ctx.fillRect(x + w / 2 - t / 2, y + h / 2 - len / 2, t, len);
        break;
      }
      case "nordic": { const t = a[1] * h, cx = x + a[2] * w; ctx.fillStyle = a[0]; ctx.fillRect(x, y + h / 2 - t / 2, w, t); ctx.fillRect(cx - t / 2, y, t, h); break; }
      case "saltire": {
        const sw = a[2] ?? 1, sh = a[3] ?? 1;
        ctx.strokeStyle = a[0]; ctx.lineWidth = a[1] * h;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sw * w, y + sh * h); ctx.moveTo(x + sw * w, y); ctx.lineTo(x, y + sh * h); ctx.stroke();
        break;
      }
      case "diag": ctx.strokeStyle = a[0]; ctx.lineWidth = a[1] * h; ctx.beginPath(); ctx.moveTo(x - 2, y + h + 2); ctx.lineTo(x + w + 2, y - 2); ctx.stroke(); break;
      case "diamond": {
        const ix = a[1] * h; ctx.fillStyle = a[0];
        ctx.beginPath(); ctx.moveTo(x + w / 2, y + ix); ctx.lineTo(x + w - ix, y + h / 2); ctx.lineTo(x + w / 2, y + h - ix); ctx.lineTo(x + ix, y + h / 2); ctx.closePath(); ctx.fill();
        break;
      }
      case "tri": ctx.fillStyle = a[0]; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + a[1] * w, y + h / 2); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill(); break;
      case "crescent": {
        const cx = x + a[0] * w, cy = y + a[1] * h, r = a[2] * h;
        // Drawn as a ring cut by an offset disc in the background colour; an
        // omitted background means "cut against the flag", done with a clip.
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.28, cy, r * 0.8, 0, Math.PI * 2, true);
        ctx.fillStyle = a[3]; ctx.fill("evenodd");
        ctx.restore();
        break;
      }
      case "checker": {
        const s = a[2] * h, n = 5, c = s / n, ox = x + a[0] * w - s / 2, oy = y + a[1] * h - s / 2;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { ctx.fillStyle = (i + j) % 2 ? a[4] : a[3]; ctx.fillRect(ox + i * c, oy + j * c, c + 0.3, c + 0.3); }
        break;
      }
      case "taeguk": {
        const cx = x + a[0] * w, cy = y + a[1] * h, r = a[2] * h;
        ctx.fillStyle = "#CD2E3A"; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#0047A0"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI); ctx.fill();
        ctx.fillStyle = "#CD2E3A"; ctx.beginPath(); ctx.arc(cx - r / 2, cy, r / 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#0047A0"; ctx.beginPath(); ctx.arc(cx + r / 2, cy, r / 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#111"; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
          ctx.save(); ctx.translate(cx + sx * r * 1.55, cy + sy * r * 1.25); ctx.rotate(sx * sy * 0.98);
          for (let i = -1; i <= 1; i++) ctx.fillRect(-r * 0.35, i * r * 0.14 - r * 0.04, r * 0.7, r * 0.08);
          ctx.restore();
        });
        break;
      }
      case "dots": {
        const [x0, y0, x1, y1, cols, rows, col] = a; ctx.fillStyle = col;
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          const px = x + (x0 + (i + 0.5 + (j % 2) * 0.5) / (cols + 0.5) * (x1 - x0)) * w;
          const py = y + (y0 + (j + 0.5) / rows * (y1 - y0)) * h;
          ctx.beginPath(); ctx.arc(px, py, Math.max(0.5, h * 0.022), 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case "zigzag": {
        const [xf, col, n] = a; ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let i = 0; i <= n * 2; i++) ctx.lineTo(x + (xf + (i % 2 ? 0.08 : 0)) * w, y + (i / (n * 2)) * h);
        ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
        break;
      }
    }
  }
  ctx.restore();
  // A thin sheen and edge so light flags still read on a light background.
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, "rgba(255,255,255,0.18)"); g.addColorStop(0.5, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(0,0,0,0.16)");
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = Math.max(1, h * 0.03); ctx.strokeRect(x, y, w, h);
}

function shieldPath(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x + w * 0.08, y);
  ctx.lineTo(x + w * 0.92, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + h * 0.1);
  ctx.lineTo(x + w, y + h * 0.48);
  ctx.bezierCurveTo(x + w, y + h * 0.78, x + w * 0.7, y + h * 0.9, x + w / 2, y + h);
  ctx.bezierCurveTo(x + w * 0.3, y + h * 0.9, x, y + h * 0.78, x, y + h * 0.48);
  ctx.lineTo(x, y + h * 0.1);
  ctx.quadraticCurveTo(x, y, x + w * 0.08, y);
  ctx.closePath();
}

/** Paints a club crest — a shield in its colours with its initials. */
export function paintCrest(ctx, team, x, y, w, h) {
  const [c1, c2, c3] = team.crest;
  ctx.save();
  shieldPath(ctx, x, y, w, h);
  ctx.fillStyle = c3; ctx.fill();
  const i = Math.max(1.2, w * 0.07);
  shieldPath(ctx, x + i, y + i, w - i * 2, h - i * 2);
  ctx.save(); ctx.clip();
  ctx.fillStyle = c1; ctx.fillRect(x, y, w, h);
  const p = team.home.pattern;
  ctx.fillStyle = c2;
  if (p === "stripes") for (let s = 0; s < 5; s++) { if (s % 2) ctx.fillRect(x + (s / 5) * w, y, w / 5 + 0.5, h); }
  else if (p === "hoops") for (let s = 0; s < 6; s++) { if (s % 2) ctx.fillRect(x, y + (s / 6) * h, w, h / 6 + 0.5); }
  else if (p === "halves") ctx.fillRect(x + w / 2, y, w / 2, h);
  else if (p === "sash") { ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill(); }
  else ctx.fillRect(x, y + h * 0.62, w, h * 0.16);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, "rgba(255,255,255,0.3)"); g.addColorStop(0.55, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.restore();
  // Initials on a dark band so they read on any colour.
  ctx.fillStyle = "rgba(10,12,22,0.72)";
  ctx.fillRect(x + i, y + h * 0.3, w - i * 2, h * 0.27);
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${Math.round(h * 0.22)}px Sora, Inter, system-ui, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(team.id, x + w / 2, y + h * 0.44);
  ctx.restore();
}

/** Flag for a nation, crest for a club, fitted into a box of the given height. */
export function paintBadge(ctx, team, x, y, h) {
  if (team.kind === "club") { const w = h * 0.84; paintCrest(ctx, team, x, y, w, h); return w; }
  const w = h * 1.5; paintFlag(ctx, team.flag, x, y, w, h); return w;
}

const badgeCache = new Map();
/** Data-URL image of a team's flag/crest, cached, for use in the DOM menus. */
export function badgeURL(team) {
  const key = teamKey(team);
  if (badgeCache.has(key)) return badgeCache.get(key);
  const H = 64, W = team.kind === "club" ? Math.round(H * 0.84) : H * 1.5;
  const c = document.createElement("canvas");
  c.width = W + 4; c.height = H + 4;
  const ctx = c.getContext("2d");
  paintBadge(ctx, team, 2, 2, H);
  const url = c.toDataURL("image/png");
  badgeCache.set(key, url);
  return url;
}
