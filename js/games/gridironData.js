// ==========================================================================
// Gridiron Kings — data: teams, rosters, formations, routes and playbooks.
//
// Teams go by city only. Each roster names the players a fan knows — the
// quarterback, the backs and receivers, the stars of the defence — and
// fills the rest of the 11 with generated linemen. A player's attributes
// come from his overall rating, his position's archetype and a stable
// per-name variation, with speed overridden for the famous burners.
// ==========================================================================

// --- Teams ------------------------------------------------------------------
// "Name|number|overall|speed (yards/s, optional)"
// Slots: QB, RB, WR1, WR2, WR3, TE, DL1, DL2, LB, CB1, CB2, S
const RAW = [
  ["KC", "Kansas City", "#e31837", "#ffb81c", "Patrick Mahomes|15|97|9.0", "Isiah Pacheco|10|82", "Rashee Rice|4|86", "Xavier Worthy|1|82|10.9", "Hollywood Brown|5|78|10.3", "Travis Kelce|87|90", "Chris Jones|95|94", "George Karlaftis|56|84", "Nick Bolton|32|84", "Trent McDuffie|21|90", "Jaylen Watson|35|78", "Bryan Cook|6|80"],
  ["BUF", "Buffalo", "#00338d", "#c60c30", "Josh Allen|17|97|9.3", "James Cook|4|88|10.2", "Khalil Shakir|10|82", "Keon Coleman|0|78", "Joshua Palmer|5|77", "Dalton Kincaid|86|82", "Ed Oliver|91|86", "Greg Rousseau|50|84", "Matt Milano|58|83", "Christian Benford|47|84", "Tre'Davious White|27|78", "Taylor Rapp|20|79"],
  ["BAL", "Baltimore", "#241773", "#9e7c0c", "Lamar Jackson|8|96|10.3", "Derrick Henry|22|92", "Zay Flowers|4|86|10.4", "Rashod Bateman|7|80", "DeAndre Hopkins|10|79", "Mark Andrews|89|86", "Nnamdi Madubuike|92|86", "Kyle Van Noy|53|80", "Roquan Smith|0|90", "Marlon Humphrey|44|86", "Nate Wiggins|2|80|10.5", "Kyle Hamilton|14|94"],
  ["CIN", "Cincinnati", "#fb4f14", "#101820", "Joe Burrow|9|95|8.4", "Chase Brown|30|82", "Ja'Marr Chase|1|97|10.2", "Tee Higgins|5|88", "Andrei Iosivas|80|76", "Mike Gesicki|88|78", "Trey Hendrickson|91|92", "B.J. Hill|92|80", "Logan Wilson|55|80", "DJ Turner|20|80|10.4", "Dax Hill|23|79", "Geno Stone|22|78"],
  ["PHI", "Philadelphia", "#004c54", "#a5acaf", "Jalen Hurts|1|91|9.4", "Saquon Barkley|26|96|10.2", "A.J. Brown|11|93", "DeVonta Smith|6|88", "Jahan Dotson|3|76", "Dallas Goedert|88|84", "Jalen Carter|98|92", "Jordan Davis|90|84", "Zack Baun|53|88", "Quinyon Mitchell|27|88|10.4", "Cooper DeJean|33|86", "Reed Blankenship|32|82"],
  ["DET", "Detroit", "#0076b6", "#b0b7bc", "Jared Goff|16|91|8.0", "Jahmyr Gibbs|0|94|10.5", "Amon-Ra St. Brown|14|95", "Jameson Williams|1|86|10.7", "Isaac TeSlaa|81|74", "Sam LaPorta|87|85", "Aidan Hutchinson|97|93", "Alim McNeill|54|82", "Jack Campbell|46|86", "Terrion Arnold|0|82", "D.J. Reed|4|82", "Kerby Joseph|31|88"],
  ["SF", "San Francisco", "#aa0000", "#b3995d", "Brock Purdy|13|90|8.6", "Christian McCaffrey|23|94|10.0", "Brandon Aiyuk|11|86", "Jauan Jennings|15|82", "Ricky Pearsall|14|78", "George Kittle|85|92", "Nick Bosa|97|93", "Bryce Huff|47|78", "Fred Warner|54|95", "Deommodore Lenoir|2|84", "Renardo Green|0|78", "Ji'Ayir Brown|27|78"],
  ["DAL", "Dallas", "#041e42", "#869397", "Dak Prescott|4|89|8.5", "Javonte Williams|33|80", "CeeDee Lamb|88|94", "George Pickens|14|86", "Jalen Tolbert|1|76", "Jake Ferguson|87|82", "Osa Odighizuwa|97|82", "Dante Fowler Jr.|56|78", "DeMarvion Overshown|0|82", "Trevon Diggs|7|84", "DaRon Bland|26|82", "Malik Hooker|28|80"],
  ["GB", "Green Bay", "#203731", "#ffb612", "Jordan Love|10|89|8.7", "Josh Jacobs|8|90", "Jayden Reed|11|82", "Romeo Doubs|87|80", "Matthew Golden|0|78|10.4", "Tucker Kraft|85|84", "Micah Parsons|1|96|9.6", "Rashan Gary|52|86", "Quay Walker|7|80", "Keisean Nixon|25|80", "Carrington Valentine|24|76", "Xavier McKinney|29|90"],
  ["MIA", "Miami", "#008e97", "#fc4c02", "Tua Tagovailoa|1|86|8.2", "De'Von Achane|28|90|10.7", "Tyreek Hill|10|92|11.0", "Jaylen Waddle|17|88|10.6", "Malik Washington|6|75", "Darren Waller|83|80", "Zach Sieler|92|84", "Bradley Chubb|2|82", "Jordyn Brooks|20|84", "Rasul Douglas|24|78", "Storm Duck|36|74", "Minkah Fitzpatrick|29|86"],
  ["HOU", "Houston", "#03202f", "#a71930", "C.J. Stroud|7|89|8.5", "Nick Chubb|21|80", "Nico Collins|12|91", "Christian Kirk|13|80", "Jayden Higgins|81|76", "Dalton Schultz|86|80", "Will Anderson Jr.|51|94", "Danielle Hunter|55|90", "Azeez Al-Shaair|0|84", "Derek Stingley Jr.|24|92", "Kamari Lassiter|5|82", "Jalen Pitre|5|80"],
  ["LAR", "Los Angeles R", "#003594", "#ffa300", "Matthew Stafford|9|90|7.8", "Kyren Williams|23|86", "Puka Nacua|12|94", "Davante Adams|17|88", "Tutu Atwell|5|76|10.6", "Tyler Higbee|89|78", "Jared Verse|8|88", "Kobie Turner|91|86", "Nate Landman|56|78", "Cobie Durant|14|78", "Darious Williams|31|76", "Kamren Kinchens|26|80"],
  ["MIN", "Minnesota", "#4f2683", "#ffc62f", "J.J. McCarthy|9|80|8.8", "Aaron Jones|33|84", "Justin Jefferson|18|98|10.2", "Jordan Addison|3|85", "Jalen Nailor|83|76", "T.J. Hockenson|87|84", "Jonathan Greenard|58|88", "Jonathan Allen|93|84", "Blake Cashman|51|82", "Byron Murphy Jr.|7|84", "Isaiah Rodgers|26|78", "Harrison Smith|22|84"],
  ["PIT", "Pittsburgh", "#101820", "#ffb612", "Aaron Rodgers|8|84|7.6", "Jaylen Warren|30|80", "DK Metcalf|4|88", "Calvin Austin III|19|78|10.6", "Roman Wilson|84|74", "Pat Freiermuth|88|80", "T.J. Watt|90|96", "Cameron Heyward|97|90", "Patrick Queen|6|82", "Jalen Ramsey|5|88", "Joey Porter Jr.|24|84", "DeShon Elliott|25|80"],
  ["LAC", "Los Angeles C", "#0080c6", "#ffc20e", "Justin Herbert|10|92|8.9", "Omarion Hampton|8|82", "Ladd McConkey|15|86", "Keenan Allen|13|84", "Quentin Johnston|1|78", "Will Dissly|81|74", "Khalil Mack|52|88", "Tuli Tuipulotu|45|84", "Daiyan Henley|0|80", "Tarheeb Still|29|80", "Cam Hart|20|76", "Derwin James|3|92"],
  ["NYJ", "New York J", "#125740", "#ffffff", "Justin Fields|7|80|9.8", "Breece Hall|20|86|10.3", "Garrett Wilson|5|89", "Josh Reynolds|8|74", "Allen Lazard|10|74", "Mason Taylor|85|74", "Quinnen Williams|95|92", "Will McDonald IV|99|80", "Quincy Williams|56|84", "Sauce Gardner|1|90", "Brandon Stephens|21|76", "Andre Cisco|5|78"],
  ["WAS", "Washington", "#5a1414", "#ffb612", "Jayden Daniels|5|92|10.0", "Jacory Croskey-Merritt|22|78", "Terry McLaurin|17|88", "Deebo Samuel|1|84", "Luke McCaffrey|12|74", "Zach Ertz|86|78", "Daron Payne|94|82", "Dorance Armstrong|92|78", "Bobby Wagner|54|86", "Marshon Lattimore|2|82", "Mike Sainristil|0|80", "Quan Martin|20|76"],
  ["SEA", "Seattle", "#002244", "#69be28", "Sam Darnold|14|84|8.4", "Kenneth Walker III|9|84|10.2", "Jaxon Smith-Njigba|11|94", "Cooper Kupp|10|82", "Rashid Shaheed|22|80|10.8", "AJ Barner|88|74", "Leonard Williams|99|88", "DeMarcus Lawrence|0|84", "Ernest Jones IV|13|84", "Devon Witherspoon|21|90", "Riq Woolen|27|82|10.6", "Julian Love|20|84"],
  ["TB", "Tampa Bay", "#d50a0a", "#34302b", "Baker Mayfield|6|88|8.3", "Bucky Irving|7|86", "Mike Evans|13|88", "Chris Godwin|14|84", "Emeka Egbuka|2|82", "Cade Otton|88|76", "Vita Vea|50|88", "Yaya Diaby|0|80", "Lavonte David|54|84", "Jamel Dean|35|80", "Zyon McCollum|27|80", "Antoine Winfield Jr.|31|88"],
  ["ATL", "Atlanta", "#a71930", "#000000", "Michael Penix Jr.|9|82|8.2", "Bijan Robinson|7|95|10.2", "Drake London|5|90", "Darnell Mooney|1|80", "Ray-Ray McCloud|34|74", "Kyle Pitts|8|82", "Zach Harrison|96|78", "Jalon Walker|11|80", "Kaden Elliss|55|82", "A.J. Terrell|24|86", "Mike Hughes|21|76", "Jessie Bates III|3|90"],
  ["DEN", "Denver", "#fb4f14", "#002244", "Bo Nix|10|86|9.0", "J.K. Dobbins|27|80", "Courtland Sutton|14|86", "Marvin Mims Jr.|19|78|10.6", "Troy Franklin|16|76", "Evan Engram|1|80", "Zach Allen|99|86", "Nik Bonitto|15|88", "Alex Singleton|49|80", "Pat Surtain II|2|96", "Riley Moss|21|80", "Talanoa Hufanga|29|82"],
  ["JAX", "Jacksonville", "#006778", "#d7a22a", "Trevor Lawrence|16|86|8.8", "Travis Etienne Jr.|1|82", "Brian Thomas Jr.|7|88|10.6", "Travis Hunter|12|86|10.2", "Dyami Brown|2|76", "Brenton Strange|85|76", "Josh Hines-Allen|41|88", "Travon Walker|44|82", "Foyesade Oluokun|23|84", "Tyson Campbell|3|80", "Jourdan Lewis|2|78", "Eric Murray|23|76"],
  ["NE", "New England", "#002244", "#c60c30", "Drake Maye|10|88|9.3", "Rhamondre Stevenson|38|80", "Stefon Diggs|8|84", "Kayshon Boutte|9|78", "DeMario Douglas|3|78", "Hunter Henry|85|80", "Milton Williams|97|84", "Christian Barmore|90|84", "Robert Spillane|14|82", "Christian Gonzalez|0|90", "Carlton Davis III|7|82", "Kyle Dugger|23|78"],
  ["CHI", "Chicago", "#0b162a", "#c83803", "Caleb Williams|18|87|9.0", "D'Andre Swift|4|82", "DJ Moore|2|86", "Rome Odunze|15|86", "Luther Burden III|10|78", "Colston Loveland|84|78", "Montez Sweat|98|86", "Grady Jarrett|97|80", "T.J. Edwards|53|84", "Jaylon Johnson|1|88", "Kyler Gordon|6|82", "Kevin Byard III|31|84"],
  ["ARI", "Arizona", "#97233f", "#ffb612", "Kyler Murray|1|85|9.9", "James Conner|6|84", "Marvin Harrison Jr.|18|86", "Michael Wilson|14|78", "Greg Dortch|4|74", "Trey McBride|85|90", "Josh Sweat|9|84", "Calais Campbell|98|80", "Mack Wilson Sr.|2|78", "Sean Murphy-Bunting|23|78", "Max Melton|16|78", "Budda Baker|3|88"],
  ["LV", "Las Vegas", "#000000", "#a5acaf", "Geno Smith|7|82|8.4", "Ashton Jeanty|2|88|10.1", "Jakobi Meyers|16|82", "Tre Tucker|11|78|10.7", "Dont'e Thornton|80|74", "Brock Bowers|89|92", "Maxx Crosby|98|96", "Adam Butler|69|78", "Elandon Roberts|52|78", "Eric Stokes|5|78", "Kyu Blu Kelly|26|74", "Jeremy Chinn|1|82"],
  ["CLE", "Cleveland", "#311d00", "#ff3c00", "Shedeur Sanders|12|74|8.6", "Quinshon Judkins|10|82", "Jerry Jeudy|3|82", "Cedric Tillman|19|76", "Isaiah Bond|11|74|10.6", "David Njoku|85|82", "Myles Garrett|95|98", "Mason Graham|93|82", "Carson Schwesinger|49|80", "Denzel Ward|21|88", "Greg Newsome II|0|80", "Grant Delpit|9|82"],
  ["IND", "Indianapolis", "#002c5f", "#a2aaad", "Daniel Jones|17|82|9.0", "Jonathan Taylor|28|92|10.2", "Michael Pittman Jr.|11|84", "Josh Downs|1|82", "Alec Pierce|14|80|10.4", "Tyler Warren|84|82", "DeForest Buckner|99|88", "Laiatu Latu|97|80", "Zaire Franklin|44|84", "Charvarius Ward|7|84", "Kenny Moore II|23|82", "Camryn Bynum|25|80"],
  ["TEN", "Tennessee", "#0c2340", "#4b92db", "Cam Ward|1|78|8.8", "Tony Pollard|20|82", "Calvin Ridley|0|82", "Tyler Lockett|16|76", "Elic Ayomanor|5|74", "Chig Okonkwo|85|76", "Jeffery Simmons|98|92", "T'Vondre Sweat|93|80", "Cody Barton|55|76", "L'Jarius Sneed|38|82", "Roger McCreary|21|76", "Amani Hooker|37|80"],
  ["NYG", "New York G", "#0b2265", "#a71930", "Jaxson Dart|6|78|9.4", "Cam Skattebo|44|80", "Malik Nabers|1|92|10.3", "Wan'Dale Robinson|17|80", "Darius Slayton|86|76", "Theo Johnson|84|76", "Dexter Lawrence II|97|94", "Brian Burns|0|88", "Bobby Okereke|58|80", "Paulson Adebo|29|80", "Deonte Banks|25|78", "Jevon Holland|8|84"],
  ["CAR", "Carolina", "#0085ca", "#101820", "Bryce Young|9|80|8.6", "Chuba Hubbard|30|82", "Tetairoa McMillan|4|84", "Xavier Legette|17|78", "Jalen Coker|18|76", "Tommy Tremble|82|74", "Derrick Brown|95|90", "Nic Scourton|11|76", "Christian Rozeboom|56|78", "Jaycee Horn|8|88", "Mike Jackson|2|78", "Tre'von Moehrig|7|80"],
  ["NO", "New Orleans", "#d3bc8d", "#101820", "Spencer Rattler|18|74|8.6", "Alvin Kamara|41|86", "Chris Olave|12|86", "Brandin Cooks|10|76", "Devaughn Vele|80|74", "Juwan Johnson|83|76", "Cameron Jordan|94|82", "Chase Young|99|82", "Demario Davis|56|86", "Alontae Taylor|1|80", "Kool-Aid McKinstry|30|78", "Justin Reid|20|82"],
];

const SLOTS = ["QB", "RB", "WR", "WR", "WR", "TE", "DL", "DL", "LB", "CB", "CB", "S"];

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function vary(name, k, amt) { return ((hash(name + k) % 1000) / 1000 - 0.5) * 2 * amt; }
const cl = (v, a = 40, b = 99) => Math.max(a, Math.min(b, Math.round(v)));

// Typical speed (yards per second at full sprint) for each position.
const BASE_SPD = { QB: 8.4, RB: 9.8, WR: 10.0, TE: 9.0, OL: 6.9, DL: 7.9, LB: 8.9, CB: 10.0, S: 9.7 };

/** Attributes for one player. All 40–99 except spd (yards/s). */
export function makePlayer(name, num, ovr, pos, spd) {
  const v = (k, amt = 6) => vary(name, k, amt);
  const o = ovr;
  const p = {
    name, num, ovr: o, pos,
    spd: spd || +(BASE_SPD[pos] * (0.94 + (o - 70) / 300 + v("s", 0.025)).toFixed(2)),
    acc: cl(o + v("a")), agi: cl(o + v("g")), str: cl(o + v("t")), hands: cl(o + v("h")),
    thr: cl(o + v("p")), aim: cl(o + v("c")), tac: cl(o + v("k")), cov: cl(o + v("v")),
    rush: cl(o + v("r")), blk: cl(o + v("b")), ball: cl(o + v("l")), awr: cl(o + v("w")),
  };
  // Archetype nudges.
  if (pos === "QB") { p.hands = cl(o - 20); p.tac = 40; p.cov = 40; }
  if (pos === "RB") { p.agi = cl(p.agi + 4); p.str = cl(p.str + 2); }
  if (pos === "WR") { p.hands = cl(p.hands + 3); p.str = cl(p.str - 10); }
  if (pos === "TE") { p.blk = cl(p.blk + 4); p.str = cl(p.str + 6); }
  if (pos === "OL") { p.blk = cl(o + 4); p.str = cl(o + 6); p.agi = cl(o - 20); p.hands = 40; }
  if (pos === "DL") { p.rush = cl(o + 3); p.str = cl(o + 6); p.agi = cl(o - 10); p.cov = cl(o - 30); }
  if (pos === "LB") { p.tac = cl(p.tac + 4); }
  if (pos === "CB") { p.cov = cl(p.cov + 4); p.ball = cl(p.ball + 2); p.str = cl(p.str - 10); }
  if (pos === "S") { p.tac = cl(p.tac + 2); p.ball = cl(p.ball + 2); }
  return p;
}

const LAST = ["Smith", "Johnson", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Clark", "Lewis", "Walker", "Hall", "Young", "King", "Wright", "Hill", "Scott", "Green", "Adams", "Baker", "Nelson", "Carter", "Mitchell", "Roberts"];
const FIRST = ["Mike", "Chris", "James", "Tyler", "Josh", "Brandon", "Kevin", "Ryan", "Marcus", "Andre", "Darius", "Trent", "Logan", "Cody", "Isaiah", "Jordan", "Jalen", "Dylan", "Caleb", "Nate"];

export const TEAMS = RAW.map(r => {
  const [abbr, city, c1, c2, ...slots] = r;
  const players = slots.map((s, i) => {
    const [name, num, ovr, spd] = s.split("|");
    return makePlayer(name, +num, +ovr, SLOTS[i], spd ? +spd : 0);
  });
  const avg = players.reduce((a, p) => a + p.ovr, 0) / players.length;
  // Linemen and depth: named by a stable hash so a team keeps its line.
  const gen = (pos, k, num) => {
    const h = hash(abbr + pos + k);
    return makePlayer(`${FIRST[h % FIRST.length]} ${LAST[(h >>> 8) % LAST.length]}`, num, cl(avg - 6 + (h % 9) - 4, 60, 88), pos);
  };
  const ol = [0, 1, 2, 3, 4].map(k => gen("OL", k, [71, 64, 60, 66, 77][k]));
  const dl2 = [0, 1].map(k => gen("DL", k, [93, 96][k]));
  const lb2 = [0, 1].map(k => gen("LB", k, [50, 57][k]));
  const s2 = gen("S", 0, 39);
  const te2 = gen("TE", 0, 48);
  const fb = gen("TE", 1, 44);
  const k = gen("K", 0, 3);
  const kick = cl(avg + (hash(abbr + "K") % 14) - 5, 70, 97);
  const off = (players[0].ovr * 2 + players[1].ovr + players[2].ovr + players[3].ovr + players[5].ovr) / 6;
  const def = (players[6].ovr + players[7].ovr + players[8].ovr + players[9].ovr + players[10].ovr + players[11].ovr) / 6;
  return {
    id: abbr, abbr, city, name: city.replace(/ [A-Z]$/, ""), c1, c2,
    ovr: Math.round(avg), off: Math.round(off), def: Math.round(def),
    qb: players[0], rb: players[1], wr: [players[2], players[3], players[4]], te: players[5],
    dl: [players[6], players[7], ...dl2], lb: [players[8], ...lb2], cb: [players[9], players[10]], s: [players[11], s2],
    ol, te2, fb, kicker: { name: k.name, num: 3, kick },
  };
});
// "Los Angeles R" → show "LA Rams-side" simply as LA (R) in short labels.
for (const t of TEAMS) if (/ [A-Z]$/.test(t.city)) t.name = t.city.replace(/ ([A-Z])$/, " ($1)");
export const teamById = (id) => TEAMS.find(t => t.id === id);

// --- Routes -----------------------------------------------------------------
// Waypoints as [forward, inward] yards from where the receiver lines up.
// "Inward" points toward the middle of the field, so one route serves both
// sides. After the last point the receiver keeps going the same way, unless
// the route `stops` (curls, hitches, comebacks), where he settles and waits.
export const ROUTES = {
  go:      { name: "Go",       pts: [[12, 0], [60, 0]] },
  slant:   { name: "Slant",    pts: [[3, 0], [12, 9]] },
  out:     { name: "Out",      pts: [[9, 0], [9, -14]] },
  in:      { name: "Dig",      pts: [[12, 0], [12, 20]] },
  post:    { name: "Post",     pts: [[12, 0], [34, 12]] },
  corner:  { name: "Corner",   pts: [[12, 0], [28, -12]] },
  curl:    { name: "Curl",     pts: [[12, 0], [10, 2]], stops: true },
  hitch:   { name: "Hitch",    pts: [[6, 0], [5, 0]], stops: true },
  comeback:{ name: "Comeback", pts: [[16, 0], [13, -3]], stops: true },
  drag:    { name: "Drag",     pts: [[2, 2], [5, 30]] },
  fade:    { name: "Fade",     pts: [[10, -2], [50, -5]] },
  seam:    { name: "Seam",     pts: [[10, 1], [50, 2]] },
  flat:    { name: "Flat",     pts: [[2, -4], [3, -16]] },
  wheel:   { name: "Wheel",    pts: [[1, -6], [5, -11], [40, -12]] },
  swing:   { name: "Swing",    pts: [[0, -5], [3, -14]] },
  screen:  { name: "Screen",   pts: [[-1, -5], [-0.5, -8]], stops: true },
  angle:   { name: "Angle",    pts: [[2, -4], [7, 3]], stops: true },
  block:   { name: "Block",    pts: [], block: true },
};
// Routes a receiver can be switched to before the snap (a hot route).
export const HOT_ROUTES = ["go", "slant", "out", "in", "curl", "post", "corner", "drag", "block"];

// --- Formations -------------------------------------------------------------
// Positions as [back, lateral] yards from the ball: back is behind the line,
// lateral is + to the offence's right. OL are always at -4, -2, 0, 2, 4.
// Eligible receivers carry the letter they wear in the passing game.
export const FORMATIONS = {
  gunTrips:   { name: "Shotgun Trips",   qb: [5, 0], rb: [5, -2], skill: [["A", "WR", 1, -21], ["B", "WR", 1, 19], ["X", "WR", 1, 13], ["Y", "TE", 1, 7.5]] },
  gunSpread:  { name: "Shotgun Spread",  qb: [5, 0], rb: [5, 2],  skill: [["A", "WR", 1, -21], ["B", "WR", 1, 21], ["X", "WR", 1, -14], ["Y", "TE", 1, 13]] },
  singleback: { name: "Singleback",      qb: [1, 0], rb: [7, 0],  skill: [["A", "WR", 1, -20], ["B", "WR", 1, 19], ["X", "WR", 1, 13], ["Y", "TE", 0.5, 5.5]] },
  iform:      { name: "I-Formation",     qb: [1, 0], rb: [7.5, 0], fb: [4.5, 0], skill: [["A", "WR", 1, -20], ["B", "WR", 1, 19], ["Y", "TE", 0.5, 5.5]] },
  pistol:     { name: "Pistol",          qb: [3.5, 0], rb: [7, 0], skill: [["A", "WR", 1, -20], ["B", "WR", 1, 20], ["X", "WR", 1, 13], ["Y", "TE", 0.5, -5.5]] },
  empty:      { name: "Empty",           qb: [5, 0], rb: null,     skill: [["A", "WR", 1, -22], ["B", "WR", 1, 22], ["X", "WR", 1, -15], ["Y", "TE", 1, 15], ["RB", "RB", 1, 8]] },
  goalLine:   { name: "Goal Line",       qb: [1, 0], rb: [6.5, 0], fb: [4, 0], skill: [["Y", "TE", 0.5, -5.5], ["X", "TE", 0.5, 5.5], ["A", "WR", 1, -12]] },
};

// --- Offensive playbook -------------------------------------------------------
// routes: letter → route id. "RB" is the back. kind: pass | run | qbrun.
// run: { gap: lateral yards from the ball the back aims for, toss: outside run }.
export const OFF_PLAYS = [
  { id: "slants",  name: "Quick Slants",   kind: "pass", forms: ["gunTrips", "gunSpread"], diff: 1, sit: "Beat the blitz · 3rd & short", routes: { A: "slant", B: "slant", X: "slant", Y: "flat", RB: "block" }, hot: true },
  { id: "curlflat",name: "Curl Flat",      kind: "pass", forms: ["singleback", "gunTrips"], diff: 1, sit: "2nd & medium · safe throw", routes: { A: "curl", B: "curl", X: "flat", Y: "curl", RB: "swing" }, hot: true },
  { id: "mesh",    name: "Mesh",           kind: "pass", forms: ["gunSpread", "gunTrips"], diff: 2, sit: "3rd & medium · vs man", routes: { A: "go", B: "go", X: "drag", Y: "drag", RB: "angle" }, hot: true },
  { id: "smash",   name: "Smash",          kind: "pass", forms: ["gunTrips", "singleback"], diff: 2, sit: "Red zone · vs Cover 2", routes: { A: "hitch", B: "hitch", X: "corner", Y: "corner", RB: "flat" }, hot: true },
  { id: "drive",   name: "Drive",          kind: "pass", forms: ["singleback", "pistol"], diff: 2, sit: "1st & 10 · beats zone", routes: { A: "post", B: "in", X: "drag", Y: "in", RB: "flat" }, hot: true },
  { id: "verts",   name: "Four Verticals", kind: "pass", forms: ["gunSpread", "empty"], diff: 3, sit: "3rd & long · deep shot", routes: { A: "go", B: "go", X: "seam", Y: "seam", RB: "swing" }, hot: true },
  { id: "padeep",  name: "PA Deep Post",   kind: "pass", forms: ["iform", "singleback"], diff: 3, sit: "After a few runs · big play", routes: { A: "post", B: "comeback", X: "in", Y: "out", RB: "block" }, playAction: true, hot: true },
  { id: "screen",  name: "HB Screen",      kind: "pass", forms: ["gunTrips", "singleback"], diff: 1, sit: "Vs heavy blitz", routes: { A: "go", B: "go", X: "out", Y: "block", RB: "screen" }, screen: true },
  { id: "outs",    name: "Sideline Outs",  kind: "pass", forms: ["gunSpread", "empty"], diff: 2, sit: "Two-minute drill · stop the clock", routes: { A: "out", B: "out", X: "comeback", Y: "out", RB: "flat" }, hot: true },
  { id: "fades",   name: "Fade & Corner",  kind: "pass", forms: ["goalLine", "gunTrips"], diff: 2, sit: "Goal line · jump ball", routes: { A: "fade", B: "fade", X: "corner", Y: "corner", RB: "flat" }, hot: true },
  { id: "hail",    name: "Hail Mary",      kind: "pass", forms: ["empty"], diff: 3, sit: "Last play of the half", routes: { A: "go", B: "go", X: "go", Y: "go", RB: "post" } },
  { id: "zone",    name: "Inside Zone",    kind: "run", forms: ["singleback", "pistol", "gunTrips"], diff: 1, sit: "Short yardage · 1st down", run: { gap: 1.5 }, routes: { A: "block", B: "block", X: "block", Y: "block" } },
  { id: "toss",    name: "HB Toss",        kind: "run", forms: ["singleback", "iform"], diff: 2, sit: "1st & 10 · get to the edge", run: { gap: 9, toss: true }, routes: { A: "block", B: "block", X: "block", Y: "block" } },
  { id: "power",   name: "Power O",        kind: "run", forms: ["iform", "goalLine"], diff: 1, sit: "Goal line · 3rd & 1", run: { gap: -2.5 }, routes: { A: "block", B: "block", X: "block", Y: "block" } },
  { id: "counter", name: "Counter",        kind: "run", forms: ["pistol", "singleback"], diff: 2, sit: "Vs fast defences", run: { gap: -4, counter: true }, routes: { A: "block", B: "block", X: "block", Y: "block" } },
  { id: "qbdraw",  name: "QB Draw",        kind: "qbrun", forms: ["gunSpread", "gunTrips"], diff: 2, sit: "Vs man coverage · mobile QB", routes: { A: "go", B: "go", X: "go", Y: "go", RB: "block" } },
];
export const SPECIAL_PLAYS = [
  { id: "punt", name: "Punt", kind: "punt", diff: 1, sit: "4th down, out of range" },
  { id: "fg", name: "Field Goal", kind: "fg", diff: 1, sit: "4th down inside the 35" },
];

// --- Defensive playbook -------------------------------------------------------
// cover: man | cover2 | cover3 | cover0 | prevent. blitz: who rushes besides the DL.
export const DEF_PLAYS = [
  { id: "c2",      name: "Cover 2 Zone",   cover: "cover2",  blitz: [],           diff: 1, sit: "Vs short passes · safe" },
  { id: "c3",      name: "Cover 3 Zone",   cover: "cover3",  blitz: [],           diff: 1, sit: "Balanced · stops deep shots" },
  { id: "c1",      name: "Man Free",       cover: "man",     blitz: [],           diff: 2, sit: "Lock up receivers" },
  { id: "lbblitz", name: "LB Blitz",       cover: "man",     blitz: ["LB0"],      diff: 2, sit: "3rd down · get home fast" },
  { id: "c0",      name: "Cover 0 Blitz",  cover: "cover0",  blitz: ["LB0", "LB1", "S1"], diff: 3, sit: "All-out pressure · risky" },
  { id: "prevent", name: "Prevent",        cover: "prevent", blitz: [],           diff: 1, sit: "End of half · no big plays" },
  { id: "runstop", name: "Run Stuff",      cover: "cover3",  blitz: ["LB1"], box: true, diff: 1, sit: "Short yardage · stop the run" },
];

export const DIFFICULTY = {
  Rookie:   { cpu: -8, user: 6, react: 0.45, aimErr: 0.7 },
  Pro:      { cpu: 0,  user: 0, react: 0.3,  aimErr: 1 },
  "All-Pro":{ cpu: 6,  user: -2, react: 0.18, aimErr: 1.25 },
};
