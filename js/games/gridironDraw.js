// ==========================================================================
// Gridiron Kings — drawing the match.
//
// The field is drawn from directly above. In landscape the offence attacks
// to the right; on an upright phone the whole picture is turned so it
// attacks up the screen, which keeps the most field ahead of the ball. The
// renderer publishes the projection (world ↔ screen) on match.view so the
// touch controls can put the pass buttons over the receivers and turn a
// tap into "that defender".
// ==========================================================================
import { FL, FW, CY } from "./gridironMatch.js";
import { ROUTES } from "./gridironData.js";

const TAU = Math.PI * 2;
export const LETTER_COLORS = { A: "#22c55e", B: "#ef4444", X: "#3b82f6", Y: "#facc15", RB: "#a855f7" };

/** Builds match.view for this frame: projection both ways. */
export function makeView(m, w, h) {
  // The field's width goes along the screen's long side, so every receiver
  // fits: on a landscape screen the offence attacks up, on an upright one right.
  const up = w >= h * 0.95;
  const { x: cx, y: cy, z } = m.cam;
  const v = { w, h, up, z, cx, cy };
  v.toScreen = up
    ? (x, y) => [w / 2 + (y - cy) * z, h / 2 - (x - cx) * z]
    : (x, y) => [w / 2 + (x - cx) * z, h / 2 + (y - cy) * z];
  v.toWorld = up
    ? (sx, sy) => [cx - (sy - h / 2) / z, cy + (sx - w / 2) / z]
    : (sx, sy) => [cx + (sx - w / 2) / z, cy + (sy - h / 2) / z];
  // A screen direction (stick) as a world direction.
  v.dirToWorld = up ? (dx, dy) => [-dy, dx] : (dx, dy) => [dx, dy];
  return v;
}

function kitFor(team, white) {
  return white
    ? { jersey: "#f4f4f6", trim: team.c1, helmet: team.c1, stripe: team.c2 === "#ffffff" ? "#222" : team.c2, pants: "#e8e8ec" }
    : { jersey: team.c1, trim: team.c2, helmet: team.c1, stripe: team.c2, pants: shade(team.c1, 0.55) };
}

export function shade(hex, amt) {
  const v = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return `rgb(${f((v >> 16) & 255)},${f((v >> 8) & 255)},${f(v & 255)})`;
}
function colorDist(a, b) {
  const p = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}
/** The CPU wears white when the two teams' colours would be confused. */
export function pickKits(user, cpu) {
  const clash = colorDist(user.c1, cpu.c1) < 120 || colorDist(user.c1, "#101820") < 60 && colorDist(cpu.c1, "#101820") < 60;
  return { user: kitFor(user, false), cpu: kitFor(cpu, clash) };
}

// ================================================================ field ===
function drawField(ctx, m, v) {
  const off = m.teamOf(m.poss), def = m.teamOf(m.opp(m.poss));
  // Stadium surround.
  ctx.fillStyle = "#14361f"; ctx.fillRect(-30, -20, FL + 60, FW + 40);
  // Grass in 5-yard stripes.
  for (let x = -10; x < FL + 10; x += 5) {
    ctx.fillStyle = ((x + 10) / 5) % 2 ? "#2f8a3e" : "#35963f";
    ctx.fillRect(x, 0, 5, FW);
  }
  // Mown texture.
  ctx.fillStyle = "rgba(255,255,255,0.025)";
  for (let y = 0; y < FW; y += 2.6) ctx.fillRect(-10, y, FL + 20, 1.1);
  // End zones.
  const ez = (x0, team, flip) => {
    const g = ctx.createLinearGradient(x0, 0, x0 + 10, 0);
    g.addColorStop(0, shade(team.c1, -0.15)); g.addColorStop(1, team.c1);
    ctx.fillStyle = g; ctx.fillRect(x0, 0, 10, FW);
    ctx.save();
    ctx.translate(x0 + 5, CY); ctx.rotate(flip ? Math.PI / 2 : -Math.PI / 2);
    ctx.fillStyle = "rgba(255,255,255,0.88)"; ctx.font = "900 6px Sora, Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(team.name.toUpperCase(), 0, 0);
    ctx.restore();
  };
  ez(-10, off, false); ez(FL, def, true);
  // Lines.
  ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 0.22;
  for (let x = 0; x <= FL; x += 5) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, FW); ctx.stroke(); }
  ctx.lineWidth = 0.4; ctx.strokeRect(-10, 0, FL + 20, FW);
  ctx.lineWidth = 0.14;
  for (let x = 1; x < FL; x++) {
    if (x % 5 === 0) continue;
    for (const y of [0.35, 23.58, FW - 23.58, FW - 0.35]) { ctx.beginPath(); ctx.moveTo(x, y - 0.35); ctx.lineTo(x, y + 0.35); ctx.stroke(); }
  }
  // Numbers.
  ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = "800 2.2px Sora, Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let x = 10; x < FL; x += 10) {
    const n = String(x <= 50 ? x : FL - x);
    for (const [y, r] of [[9, v.up ? Math.PI / 2 : 0], [FW - 9, v.up ? -Math.PI / 2 : Math.PI]]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(r);
      ctx.fillText(n, 0, 0);
      ctx.restore();
    }
  }
  // Midfield logo.
  ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.arc(50, CY, 4.2, 0, TAU); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.font = "900 2.4px Sora, Inter, sans-serif";
  ctx.save(); ctx.translate(50, CY); if (v.up) ctx.rotate(Math.PI / 2); ctx.fillText("GK", 0, 0); ctx.restore();
  // Goal posts at the back of each end zone.
  for (const gx of [-10, FL + 10]) {
    ctx.strokeStyle = "#ffd700"; ctx.lineWidth = 0.35;
    ctx.beginPath(); ctx.moveTo(gx, CY - 3.08); ctx.lineTo(gx, CY + 3.08); ctx.stroke();
    ctx.fillStyle = "#ffd700"; ctx.beginPath(); ctx.arc(gx, CY - 3.08, 0.3, 0, TAU); ctx.arc(gx, CY + 3.08, 0.3, 0, TAU); ctx.fill();
  }
  // Sideline crowd strip.
  ctx.fillStyle = "#0d2416"; ctx.fillRect(-30, -20, FL + 60, 17.5); ctx.fillRect(-30, FW + 2.5, FL + 60, 17.5);
  for (let x = -28; x < FL + 28; x += 1.7) {
    ctx.fillStyle = ["#c9ccd8", off.c1, def.c1, "#e8c46a", "#6a7a8a"][Math.abs((x * 7) | 0) % 5];
    ctx.fillRect(x, -6 + Math.sin(x * 3.1 + m.t * (m.banner?.kind === "good" ? 9 : 1.5)) * 0.25, 1, 1.3);
    ctx.fillRect(x + 0.6, FW + 4.6 + Math.cos(x * 2.3 + m.t * 1.4) * 0.25, 1, 1.3);
  }
}

// ============================================================== players ===
const PS = 1.42;          // people are drawn larger than life so they read on a phone

function drawPlayer(ctx, p, kit, t, sel) {
  const lying = p.down > 0.15;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(PS, PS);
  const air = p.move?.kind === "hurdle" ? Math.sin(Math.min(1, p.move.t / 0.55) * Math.PI) : p.leap ? Math.sin(Math.min(1, p.leap.t / 0.6) * Math.PI) * 0.8 : 0;
  // Shadow.
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(0.15 + air * 0.5, 0.2 + air * 0.6, lying ? 1.1 : 0.75, lying ? 0.7 : 0.6, p.face, 0, TAU); ctx.fill();
  if (sel) {
    ctx.strokeStyle = sel === "ball" ? "#ffd76a" : "#7cf0ff"; ctx.lineWidth = 0.18;
    ctx.beginPath(); ctx.arc(0, 0, 1.25 + Math.sin(t * 6) * 0.08, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.25; ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(0, 0, 1.25, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  }
  let rot = p.face;
  if (p.move?.kind === "spin") rot += p.move.t / 0.45 * TAU;
  ctx.rotate(rot);
  const s = 1 + air * 0.22;
  ctx.scale(s, s);
  ctx.lineWidth = 0.07; ctx.strokeStyle = "rgba(0,0,0,0.5)";
  if (lying) {
    ctx.fillStyle = kit.pants; ctx.beginPath(); ctx.ellipse(-0.75, 0, 0.55, 0.35, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = kit.jersey; ctx.beginPath(); ctx.ellipse(0, 0, 0.55, 0.62, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = kit.helmet; ctx.beginPath(); ctx.arc(0.62, 0, 0.34, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
    return;
  }
  const sp = Math.min(1, Math.hypot(p.vx, p.vy) / 6);
  const ph = p.walk * 2.6;
  const stride = Math.sin(ph) * 0.42 * sp;
  // Legs.
  ctx.fillStyle = kit.pants;
  ctx.beginPath(); ctx.ellipse(stride, -0.24, 0.26, 0.15, 0, 0, TAU); ctx.ellipse(-stride, 0.24, 0.26, 0.15, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath(); ctx.arc(stride + 0.2, -0.24, 0.1, 0, TAU); ctx.arc(-stride + 0.2, 0.24, 0.1, 0, TAU); ctx.fill();
  // Arms swing opposite the legs; a stiff arm shoots out.
  ctx.fillStyle = kit.jersey;
  const stiff = p.move?.kind === "stiff";
  const throwA = p.throwAnim > 0 ? 1 - p.throwAnim / 0.3 : -1;
  ctx.beginPath(); ctx.ellipse(-stride * 0.6 + 0.05, -0.62, 0.24, 0.16, 0, 0, TAU); ctx.fill(); ctx.stroke();
  if (stiff) { ctx.strokeStyle = kit.jersey; ctx.lineWidth = 0.26; ctx.beginPath(); ctx.moveTo(0.1, 0.5); ctx.lineTo(1.05, 0.75); ctx.stroke(); ctx.fillStyle = "#c68c5a"; ctx.beginPath(); ctx.arc(1.1, 0.76, 0.14, 0, TAU); ctx.fill(); ctx.lineWidth = 0.07; ctx.strokeStyle = "rgba(0,0,0,0.5)"; }
  else if (throwA >= 0) { ctx.strokeStyle = kit.jersey; ctx.lineWidth = 0.24; ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.lineTo(-0.5 + throwA * 1.4, 0.75 - throwA * 0.2); ctx.stroke(); ctx.lineWidth = 0.07; ctx.strokeStyle = "rgba(0,0,0,0.5)"; }
  else { ctx.beginPath(); ctx.ellipse(stride * 0.6 + 0.05, 0.62, 0.24, 0.16, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
  // Shoulder pads.
  const g = ctx.createLinearGradient(-0.4, -0.8, 0.4, 0.8);
  g.addColorStop(0, shadeOrSelf(kit.jersey, 0.18)); g.addColorStop(1, shadeOrSelf(kit.jersey, -0.2));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, 0.42, 0.74, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = kit.trim; ctx.lineWidth = 0.09;
  ctx.beginPath(); ctx.ellipse(0, 0, 0.3, 0.6, 0, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke();
  // Number on the back, readable from behind.
  if (p.p.num !== undefined) {
    ctx.save(); ctx.rotate(Math.PI / 2);
    ctx.fillStyle = kit.trim; ctx.font = "800 0.5px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(p.p.num), 0, 0.12);
    ctx.restore();
  }
  // Helmet with stripe and facemask.
  ctx.lineWidth = 0.07; ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.fillStyle = kit.helmet; ctx.beginPath(); ctx.arc(0.08, 0, 0.36, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = kit.stripe; ctx.lineWidth = 0.12; ctx.beginPath(); ctx.moveTo(-0.25, 0); ctx.lineTo(0.4, 0); ctx.stroke();
  ctx.strokeStyle = "#d0d4dc"; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.arc(0.18, 0, 0.32, -0.9, 0.9); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(-0.02, -0.12, 0.1, 0, TAU); ctx.fill();
  ctx.restore();
}
function shadeOrSelf(c, amt) { return c.startsWith("#") ? shade(c, amt) : c; }

function drawBall(ctx, m) {
  const b = m.ball;
  if (!b || (b.state === "held" && m.phase !== "dead")) {
    if (b && b.state === "held") {
      const c = b.carrier;
      ctx.save(); ctx.translate(c.x + Math.cos(c.face + 0.6) * 0.62, c.y + Math.sin(c.face + 0.6) * 0.62); ctx.rotate(c.face);
      footballShape(ctx, 0.44);
      ctx.restore();
    }
    return;
  }
  const z = b.z || 0;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath(); ctx.ellipse(b.x + z * 0.18, b.y + z * 0.28, 0.32, 0.2, 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(b.x, b.y);
  const a = b.state === "air" ? Math.atan2(b.to[1] - b.from[1], b.to[0] - b.from[0]) : m.t * 6;
  ctx.rotate(a);
  footballShape(ctx, 0.46 * (1 + z * 0.09));
  ctx.restore();
}
function footballShape(ctx, r) {
  ctx.fillStyle = "#8a4a1e"; ctx.strokeStyle = "#4a2208"; ctx.lineWidth = r * 0.15;
  ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.62, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = r * 0.12;
  ctx.beginPath(); ctx.moveTo(-r * 0.45, 0); ctx.lineTo(r * 0.45, 0); ctx.stroke();
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.18, -r * 0.16); ctx.lineTo(i * r * 0.18, r * 0.16); ctx.stroke(); }
}

// =========================================================== main entry ===
/**
 * Draws the whole match. ui: { aim: {x,y,err,from}, letterOf } from the
 * controls, so the aim marker shows while a pass is being charged.
 */
export function drawMatch(ctx, m, w, h, dpr, kits, ui = {}) {
  const v = makeView(m, w, h);
  m.view = v;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0b1a10"; ctx.fillRect(0, 0, w, h);
  const z = v.z;
  if (v.up) ctx.setTransform(0, -z * dpr, z * dpr, 0, (w / 2 - z * v.cy) * dpr, (h / 2 + z * v.cx) * dpr);
  else ctx.setTransform(z * dpr, 0, 0, z * dpr, (w / 2 - z * v.cx) * dpr, (h / 2 - z * v.cy) * dpr);
  drawField(ctx, m, v);
  const live = m.phase === "presnap" || m.phase === "live" || m.phase === "dead";
  // Line of scrimmage and the line to gain.
  if (m.phase !== "kick" && m.phase !== "over") {
    ctx.fillStyle = "rgba(60,140,255,0.85)"; ctx.fillRect(m.los - 0.12, 0, 0.24, FW);
    const lg = m.los + m.toGo;
    if (lg < FL && !m.special) { ctx.fillStyle = "rgba(255,221,60,0.9)"; ctx.fillRect(lg - 0.12, 0, 0.24, FW); }
  }
  // Pre-snap: the user's routes, so the play reads before the snap.
  if (m.phase === "presnap" && m.poss === "user") drawRoutes(ctx, m);
  if (m.phase === "presnap" && m.poss === "cpu" && ui.showZones !== false) drawZones(ctx, m);
  // Aim assist.
  if (ui.aim && m.phase === "live") {
    const a = ui.aim;
    ctx.setLineDash([0.5, 0.5]); ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 0.12;
    ctx.beginPath(); ctx.moveTo(m.qb.x, m.qb.y); ctx.quadraticCurveTo((m.qb.x + a.x) / 2, (m.qb.y + a.y) / 2 - 2 - a.power * 0, a.x, a.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,215,106,0.18)"; ctx.strokeStyle = "rgba(255,215,106,0.9)"; ctx.lineWidth = 0.14;
    ctx.beginPath(); ctx.arc(a.x, a.y, Math.max(0.6, a.err), 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.x - 0.5, a.y); ctx.lineTo(a.x + 0.5, a.y); ctx.moveTo(a.x, a.y - 0.5); ctx.lineTo(a.x, a.y + 0.5); ctx.stroke();
  }
  // Kicks.
  if (m.phase === "kick" && m.kick) drawKick(ctx, m);
  // Players back to front (top-down: order by y so overlaps read).
  if (live || m.phase === "over") {
    const ctl = m.controlled();
    const userSide = m.poss === "user" ? "O" : "D";
    const list = [...m.players].sort((a, b) => a.y - b.y);
    for (const p of list) {
      const kit = (p.side === userSide) ? kits.user : kits.cpu;
      const sel = p === ctl ? (m.ball?.state === "held" && m.ball.carrier === p ? "ball" : "sel") : null;
      drawPlayer(ctx, p, kit, m.t, sel);
    }
    drawBall(ctx, m);
  }
  // Effects.
  for (const f of m.fx) {
    const k = f.t / f.life;
    if (f.kind === "conf") { ctx.fillStyle = f.color; ctx.globalAlpha = 1 - k; ctx.fillRect(f.x + f.vx * f.t, f.y + f.vy * f.t, 0.35, 0.35); ctx.globalAlpha = 1; }
    else if (f.kind === "hit" || f.kind === "puff") { ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 0.15; ctx.beginPath(); ctx.arc(f.x, f.y, 0.6 + k * 1.8, 0, TAU); ctx.stroke(); }
  }
  // Screen space from here.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Names: the man you control and the ball carrier.
  if (live) {
    const ctl = m.controlled();
    if (ctl && m.phase !== "dead") nameTag(ctx, v, ctl, "#7cf0ff");
    const c = m.ball?.state === "held" ? m.ball.carrier : null;
    if (c && c !== ctl && m.phase === "live" && c.role !== "OL") nameTag(ctx, v, c, "#ffd76a");
  }
  for (const f of m.fx) {
    if (f.kind !== "text") continue;
    const k = f.t / f.life;
    const [sx, sy] = v.toScreen(f.x, f.y);
    ctx.globalAlpha = Math.min(1, (1 - k) * 2);
    ctx.font = `900 ${Math.round(15 + (1 - k) * 4)}px Sora, Inter, sans-serif`; ctx.textAlign = "center";
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.strokeText(f.txt, sx, sy - 40 - k * 26);
    ctx.fillStyle = f.color; ctx.fillText(f.txt, sx, sy - 40 - k * 26);
    ctx.globalAlpha = 1;
  }
  drawScoreboard(ctx, m, w, h);
  if (m.banner) drawBanner(ctx, m, w, h);
}

function nameTag(ctx, v, p, color) {
  const [sx, sy] = v.toScreen(p.x, p.y);
  const label = `#${p.p.num} ${p.p.name}`;
  ctx.font = "700 11px Inter, sans-serif"; ctx.textAlign = "center";
  const tw = ctx.measureText(label).width + 12;
  const y = sy + 30;
  ctx.fillStyle = "rgba(8,12,20,0.72)";
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(sx - tw / 2, y - 10, tw, 17, 8) : ctx.rect(sx - tw / 2, y - 10, tw, 17); ctx.fill();
  ctx.fillStyle = color; ctx.fillText(label, sx, y + 2.5);
}

function drawRoutes(ctx, m) {
  for (const p of m.players) {
    if (p.side !== "O" || !p.letter) continue;
    const col = LETTER_COLORS[p.letter] || "#fff";
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 0.2; ctx.globalAlpha = 0.75;
    if (p.route?.block) {
      ctx.beginPath(); ctx.moveTo(p.x + 0.6, p.y - 0.6); ctx.lineTo(p.x + 0.6, p.y + 0.6); ctx.stroke();
    } else if (p.route) {
      const pts = [[p.x, p.y], ...p.route.pts];
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (const q of pts.slice(1)) ctx.lineTo(Math.min(q[0], m.los + 40), q[1]);
      ctx.stroke();
      const n = pts.length;
      if (n >= 2) {
        const [x1, y1] = pts[n - 1], [x0, y0] = pts[n - 2];
        const a = Math.atan2(y1 - y0, x1 - x0), ex = Math.min(x1, m.los + 40), ey = y1;
        if (p.route.stops) { ctx.beginPath(); ctx.arc(ex, ey, 0.45, 0, TAU); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(ex + Math.cos(a) * 0.9, ey + Math.sin(a) * 0.9); ctx.lineTo(ex + Math.cos(a + 2.5) * 0.9, ey + Math.sin(a + 2.5) * 0.9); ctx.lineTo(ex + Math.cos(a - 2.5) * 0.9, ey + Math.sin(a - 2.5) * 0.9); ctx.fill(); }
      }
    }
    ctx.globalAlpha = 1;
  }
  // Run plays: an arrow to the hole.
  const play = m.offPlay;
  if (play?.kind === "run") {
    const rb = m.players.find(p => p.role === "RB");
    if (rb) {
      const gy = m.ballY + (m.flipped ? -1 : 1) * play.run.gap;
      ctx.strokeStyle = "#ffd76a"; ctx.lineWidth = 0.3; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(rb.x, rb.y); ctx.quadraticCurveTo(m.los - 1.5, gy, m.los + 4, gy); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

function drawZones(ctx, m) {
  for (const p of m.players) {
    if (p.side !== "D") continue;
    if (p.job === "zone" && p.zone) {
      ctx.fillStyle = p.deep ? "rgba(59,130,246,0.16)" : "rgba(250,204,21,0.16)";
      ctx.strokeStyle = p.deep ? "rgba(59,130,246,0.55)" : "rgba(250,204,21,0.55)"; ctx.lineWidth = 0.12;
      ctx.beginPath(); ctx.ellipse(p.zone[0], p.zone[1], p.deep ? 6 : 3.6, p.deep ? 8 : 4.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
    } else if (p.job === "man" && p.man) {
      ctx.strokeStyle = "rgba(239,68,68,0.55)"; ctx.lineWidth = 0.12; ctx.setLineDash([0.4, 0.4]);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.man.x, p.man.y); ctx.stroke(); ctx.setLineDash([]);
    } else if (p.job === "rush" && p.role !== "DL") {
      ctx.strokeStyle = "rgba(255,90,60,0.8)"; ctx.lineWidth = 0.22;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(m.los - 3, m.ballY); ctx.stroke();
    }
  }
}

function drawKick(ctx, m) {
  const k = m.kick, q = Math.min(1, k.t / k.dur);
  let x, y, z;
  if (k.kind === "fg") {
    const e = q;
    x = k.from + (110 - k.from) * e; y = CY + (k.good ? 0 : (k.side ? 1 : -1) * 5 * e);
    z = Math.sin(e * Math.PI * 0.85) * 12 + e * 6;
  } else {
    x = k.from + (k.to - k.from) * q; y = CY + Math.sin(q * 3) * 2;
    z = Math.sin(q * Math.PI) * (k.kind === "punt" ? 16 : 20);
  }
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(x + z * 0.12, y + z * 0.2, 0.4, 0.25, 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(x, y); ctx.rotate(m.t * 9); footballShape(ctx, 0.36 + z * 0.03); ctx.restore();
}

function drawScoreboard(ctx, m, w, h) {
  const U = m.user, C = m.cpu;
  const small = w < 560;
  const bw = Math.min(w - 16, small ? 330 : 420), bh = small ? 30 : 34;
  const x = (w - bw) / 2, y = 8;
  ctx.fillStyle = "rgba(8,10,20,0.82)";
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, bw, bh, 9) : ctx.rect(x, y, bw, bh); ctx.fill();
  const seg = bw / 3;
  const team = (T, sc, x0, poss) => {
    ctx.fillStyle = T.c1; ctx.fillRect(x0 + 4, y + 4, 5, bh - 8);
    ctx.fillStyle = "#fff"; ctx.font = `800 ${small ? 12 : 14}px Sora, Inter, sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(`${T.abbr}${poss ? " 🏈" : ""}`, x0 + 14, y + bh / 2 + 1);
    ctx.textAlign = "right"; ctx.font = `900 ${small ? 16 : 19}px Sora, Inter, sans-serif`;
    ctx.fillText(String(sc), x0 + seg - 8, y + bh / 2 + 1);
  };
  team(U, m.score.user, x, m.poss === "user");
  team(C, m.score.cpu, x + seg * 2, m.poss === "cpu");
  ctx.textAlign = "center"; ctx.fillStyle = "#ffd76a"; ctx.font = `800 ${small ? 11 : 13}px Inter, sans-serif`;
  ctx.fillText(`${m.quarterText()}  ${m.ot ? "" : m.clockText()}`, x + seg * 1.5, y + bh / 2 + 1);
  if (m.phase !== "kick" && m.phase !== "over") {
    const t = m.downText();
    ctx.font = "700 11px Inter, sans-serif";
    const tw = ctx.measureText(t).width + 16;
    ctx.fillStyle = "rgba(8,10,20,0.7)";
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(w / 2 - tw / 2, y + bh + 4, tw, 18, 8) : ctx.rect(w / 2 - tw / 2, y + bh + 4, tw, 18); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillText(t, w / 2, y + bh + 13.5);
  }
  ctx.textBaseline = "alphabetic";
}

function drawBanner(ctx, m, w, h) {
  const b = m.banner;
  const a = Math.min(1, b.t * 4, (b.time - b.t) * 3);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  const y = h * 0.36;
  const g = ctx.createLinearGradient(0, 0, w, 0);
  const tint = b.kind === "good" ? "20,120,60" : b.kind === "bad" ? "140,20,40" : "10,14,28";
  g.addColorStop(0, `rgba(${tint},0)`); g.addColorStop(0.5, `rgba(${tint},0.82)`); g.addColorStop(1, `rgba(${tint},0)`);
  ctx.fillStyle = g; ctx.fillRect(0, y - 30, w, b.sub ? 56 : 44);
  ctx.textAlign = "center";
  const big = b.title.length > 14 ? 0.055 : 0.075;
  ctx.font = `900 ${Math.min(38, w * big)}px Sora, Inter, sans-serif`;
  ctx.fillStyle = b.kind === "good" ? "#a6ffcb" : b.kind === "bad" ? "#ffb3c0" : "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 10;
  ctx.fillText(b.title, w / 2, y + 2);
  ctx.shadowBlur = 0;
  if (b.sub) { ctx.font = "600 12px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillText(b.sub, w / 2, y + 20); }
  ctx.restore();
}

// ====================================================== playbook diagrams ===
/** An SVG diagram of a play for its card: formation, routes, run arrow. */
export function playSVG(play, formId, FORMATIONS) {
  if (play.kind === "punt" || play.kind === "fg") {
    const icon = play.kind === "punt" ? "M20 60 Q70 -10 120 50" : "M40 70 Q70 0 70 14";
    return `<svg viewBox="0 0 140 90" class="gi-svg"><rect x="0" y="0" width="140" height="90" rx="8" fill="#1f6b33"/>${play.kind === "fg" ? '<path d="M55 30 L55 12 M85 30 L85 12 M55 30 L85 30 M70 30 L70 44" stroke="#ffd700" stroke-width="3" fill="none"/>' : ""}<path d="${icon}" stroke="#fff" stroke-width="2.5" fill="none" stroke-dasharray="5 4"/><ellipse cx="${play.kind === "punt" ? 20 : 40}" cy="${play.kind === "punt" ? 62 : 72}" rx="6" ry="4" fill="#8a4a1e"/></svg>`;
  }
  const F = FORMATIONS[formId];
  const sx = (lat) => 70 + lat * 2.6, sy = (fwd) => 64 - fwd * 2.1;
  let out = `<svg viewBox="0 0 140 90" class="gi-svg"><rect x="0" y="0" width="140" height="90" rx="8" fill="#1f6b33"/><line x1="0" y1="64" x2="140" y2="64" stroke="#5aa0ff" stroke-width="1.2"/>`;
  for (const l of [-4, -2, 0, 2, 4]) out += `<rect x="${sx(l) - 2.6}" y="${sy(-1) - 2.6}" width="5.2" height="5.2" fill="#e8e8ec"/>`;
  out += `<circle cx="${sx(0)}" cy="${sy(-F.qb[0])}" r="3" fill="#fff"/>`;
  const draw = (letter, lat, back) => {
    const col = LETTER_COLORS[letter] || "#fff";
    const rid = play.routes?.[letter] || "block";
    const R = ROUTES[rid];
    const inward = lat < 0 ? 1 : -1;
    const x0 = sx(lat), y0 = sy(-back);
    if (R && !R.block && R.pts.length) {
      let d = `M${x0} ${y0}`;
      for (const [f, l] of R.pts) d += ` L${sx(lat + l * inward * (lat === 0 ? -1 : 1))} ${Math.max(6, sy(-back + Math.min(f, 22)))}`;
      out += `<path d="${d}" stroke="${col}" stroke-width="2" fill="none" stroke-linejoin="round"/>`;
    } else if (R?.block) out += `<line x1="${x0 - 3}" y1="${y0 - 4}" x2="${x0 + 3}" y2="${y0 - 4}" stroke="${col}" stroke-width="2"/>`;
    out += `<circle cx="${x0}" cy="${y0}" r="3.6" fill="${col}" stroke="#0008" stroke-width="1"/>`;
  };
  for (const [letter, , back, lat] of F.skill) draw(letter, lat, back);
  if (F.rb) draw("RB", F.rb[1], F.rb[0]);
  if (F.fb) out += `<circle cx="${sx(F.fb[1])}" cy="${sy(-F.fb[0])}" r="3" fill="#ccc"/>`;
  if (play.kind === "run" && F.rb) {
    const gx = sx(play.run.gap);
    out += `<path d="M${sx(F.rb[1])} ${sy(-F.rb[0])} Q ${gx} ${sy(-1)} ${gx} ${sy(6)}" stroke="#ffd76a" stroke-width="3" fill="none"/><path d="M${gx - 4} ${sy(5)} L${gx} ${sy(8)} L${gx + 4} ${sy(5)}" fill="#ffd76a"/>`;
  }
  if (play.kind === "qbrun") out += `<path d="M${sx(0)} ${sy(-F.qb[0])} L${sx(0)} ${sy(8)}" stroke="#ffd76a" stroke-width="3"/>`;
  return out + "</svg>";
}

/** Defensive call diagram: zones, man lines, blitz arrows. */
export function defSVG(play) {
  const sx = (lat) => 70 + lat * 2.4, sy = (fwd) => 22 + fwd * 2.4;
  let out = `<svg viewBox="0 0 140 90" class="gi-svg"><rect x="0" y="0" width="140" height="90" rx="8" fill="#1f6b33"/><line x1="0" y1="20" x2="140" y2="20" stroke="#5aa0ff" stroke-width="1.2"/>`;
  const Z = {
    cover2: [[5, -19, 0], [5, 19, 0], [18, -12, 1], [18, 12, 1], [8, -8, 0], [8, 8, 0], [11, 0, 0]],
    cover3: [[18, -18, 1], [18, 18, 1], [22, 0, 1], [6, 16, 0], [7, -14, 0], [8, -4, 0], [8, 5, 0]],
    prevent: [[22, -17, 1], [22, 17, 1], [28, -9, 1], [28, 9, 1], [13, -12, 0], [15, 0, 0], [13, 12, 0]],
    man: [[20, 0, 1]], cover0: [],
  }[play.cover] || [];
  for (const [f, l, deep] of Z) out += `<ellipse cx="${sx(l)}" cy="${Math.min(84, sy(f))}" rx="${deep ? 13 : 8}" ry="${deep ? 8 : 6}" fill="${deep ? "#3b82f655" : "#facc1555"}" stroke="${deep ? "#3b82f6" : "#facc15"}" stroke-width="1"/>`;
  if (play.cover === "man" || play.cover === "cover0") {
    for (const l of [-20, 20, -8, 8, 0]) out += `<line x1="${sx(l)}" y1="${sy(1)}" x2="${sx(l)}" y2="${sy(6)}" stroke="#ef4444" stroke-width="2" stroke-dasharray="3 2"/>`;
  }
  for (const l of [-4.6, -1.6, 1.6, 4.6]) out += `<circle cx="${sx(l)}" cy="${sy(1)}" r="3.2" fill="#fff"/>`;
  const blitz = { LB0: -5, LB1: 0, S1: 10 };
  for (const b of play.blitz || []) { const l = blitz[b] ?? 0; out += `<path d="M${sx(l)} ${sy(6)} L${sx(l * 0.3)} ${sy(-1)}" stroke="#ff5a3c" stroke-width="2.5"/><path d="M${sx(l * 0.3) - 3} ${sy(0)} L${sx(l * 0.3)} ${sy(-2)} L${sx(l * 0.3) + 3} ${sy(0)}" fill="#ff5a3c"/>`; }
  return out + "</svg>";
}
