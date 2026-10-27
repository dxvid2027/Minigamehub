// ==========================================================================
// Dragonheart — drawing the hero, the monsters and the bosses.
//
// Everything is painted with canvas paths in world units, centred on the
// actor's feet. `t` is a running clock for idle bobbing, `flash` (0…1) turns
// an actor white for a frame when it is hit, and `wind` (0…1) is how far
// into an attack's wind-up it is — every attack shows it, so it can be read.
// ==========================================================================

const TAU = Math.PI * 2;

function shadow(ctx, x, y, rx, a = 0.3) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.38, 0, 0, TAU); ctx.fill();
}

function eyes(ctx, x, y, gap, r, look = 0, col = "#111") {
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(x - gap, y, r, 0, TAU); ctx.arc(x + gap, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(x - gap + look, y + 0.5, r * 0.55, 0, TAU); ctx.arc(x + gap + look, y + 0.5, r * 0.55, 0, TAU); ctx.fill();
}

function glow(ctx, x, y, r, col, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col.replace("A", a)); g.addColorStop(1, col.replace("A", 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

// ==========================================================================
// Hero
// ==========================================================================
/**
 * @param h  hero: x, y, ang (facing), moving, walk, rolling, swing (0…1 or -1),
 *           swingDir, armorColor, swordColor, hurt
 */
export function drawHero(ctx, h, t) {
  const { x, y } = h;
  const face = h.ang;
  const fx = Math.cos(face), fy = Math.sin(face);
  const back = fy < -0.35;                       // facing away from camera
  const side = Math.abs(fx) > 0.55 ? Math.sign(fx) : 0;
  const bob = h.moving ? Math.abs(Math.sin(h.walk * 2)) * 2 : Math.sin(t * 2) * 0.6;
  shadow(ctx, x, y + 1, 11);
  ctx.save();
  if (h.rolling) {
    ctx.translate(x, y - 10);
    ctx.rotate(h.rollSpin);
    ctx.fillStyle = "#2c4f9a"; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = h.armorColor; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
    ctx.restore();
    return;
  }
  if (h.hurt > 0 && Math.floor(t * 30) % 2) ctx.globalAlpha = 0.55;
  const by = y - bob;
  // Sword behind the body when facing away.
  const drawSword = () => {
    let a = face;
    if (h.swing >= 0) a = h.swingDir + (-1.15 + h.swing * 2.3) * (h.combo % 2 ? -1 : 1);
    else a = face + (side ? 0.9 * side : 0.9);
    const hx = x + Math.cos(a) * 9, hy = by - 11 + Math.sin(a) * 6;
    const len = 22;
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(a);
    ctx.fillStyle = "#6a4a2a"; ctx.fillRect(-3, -1.5, 6, 3);
    ctx.fillStyle = "#c9a24a"; ctx.fillRect(2, -4.5, 2.5, 9);
    const g = ctx.createLinearGradient(4, 0, 4 + len, 0);
    g.addColorStop(0, h.swordColor); g.addColorStop(1, "#ffffff");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(4, -2.4); ctx.lineTo(4 + len, 0); ctx.lineTo(4, 2.4); ctx.closePath(); ctx.fill();
    ctx.restore();
  };
  if (back) drawSword();
  // Cape.
  ctx.fillStyle = "#2c4f9a";
  const sway = Math.sin(h.walk * 2) * (h.moving ? 2.5 : 0.8);
  ctx.beginPath();
  ctx.moveTo(x - 7, by - 18); ctx.lineTo(x + 7, by - 18);
  ctx.lineTo(x + 9 - fx * 4 + sway, by - 2 - fy * 2); ctx.lineTo(x - 9 - fx * 4 + sway, by - 2 - fy * 2);
  ctx.closePath(); ctx.fill();
  // Legs.
  const step = h.moving ? Math.sin(h.walk * 2) * 3 : 0;
  ctx.fillStyle = "#3a2a1a";
  ctx.fillRect(x - 5, by - 7 + step * 0.3, 4, 7 - step * 0.3);
  ctx.fillRect(x + 1, by - 7 - step * 0.3, 4, 7 + step * 0.3);
  // Body.
  ctx.fillStyle = h.armorColor;
  ctx.beginPath(); ctx.ellipse(x, by - 13, 8, 8.5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.ellipse(x - 3, by - 16, 3, 4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "#5a3a1a"; ctx.fillRect(x - 8, by - 10, 16, 2.5);
  ctx.fillStyle = "#c9a24a"; ctx.fillRect(x - 1.5, by - 10.5, 3, 3.5);
  // Head.
  ctx.fillStyle = "#f1c9a5";
  ctx.beginPath(); ctx.arc(x, by - 25, 7.5, 0, TAU); ctx.fill();
  ctx.fillStyle = "#6a3a1a";
  if (back) { ctx.beginPath(); ctx.arc(x, by - 26, 7.8, 0, TAU); ctx.fill(); }
  else {
    ctx.beginPath(); ctx.arc(x, by - 27.5, 7.6, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 7.5, by - 27); ctx.lineTo(x - 4, by - 22); ctx.lineTo(x - 2, by - 27); ctx.lineTo(x + 2, by - 23); ctx.lineTo(x + 4, by - 27); ctx.lineTo(x + 7.5, by - 23); ctx.lineTo(x + 7.5, by - 28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#1a1a2a";
    const ex = side * 2.2;
    if (side >= 0) ctx.fillRect(x + 1.5 + ex, by - 25, 1.8, 2.6);
    if (side <= 0) ctx.fillRect(x - 3.3 + ex, by - 25, 1.8, 2.6);
  }
  if (!back) drawSword();
  ctx.restore();
  // Swing trail.
  if (h.swing >= 0 && h.swing < 0.9) {
    const a0 = h.swingDir - 1.15, a1 = h.swingDir - 1.15 + h.swing * 2.3;
    const flip = h.combo % 2;
    ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - h.swing)})`;
    ctx.lineWidth = h.combo === 2 ? 8 : 5;
    ctx.beginPath();
    if (!flip) ctx.arc(x, by - 11, 30, a0, a1);
    else ctx.arc(x, by - 11, 30, h.swingDir + 1.15 - h.swing * 2.3, h.swingDir + 1.15);
    ctx.stroke();
  }
}

// ==========================================================================
// Monsters
// ==========================================================================
export function drawFoe(ctx, f, t) {
  const { x, y } = f;
  const r = f.r;
  const ph = t * 4 + f.seed;
  const wind = f.wind || 0;
  const shake = wind > 0 ? Math.sin(t * 60) * wind * 2 : 0;
  const fl = f.flash > 0;
  const look = Math.cos(f.ang || 0) * 1.5;
  ctx.save();
  ctx.translate(x + shake, y);
  if (f.ai !== "float") shadow(ctx, 0, 1, r * 0.95);
  else shadow(ctx, 0, 8, r * 0.7, 0.18);
  if (f.elite) glow(ctx, 0, -r, r * 2.2, "rgba(255,200,80,A)", 0.25);
  const col = fl ? "#ffffff" : f.color;
  switch (f.type) {
    case "slime": {
      const sq = 1 + Math.sin(ph) * 0.08 + wind * 0.25;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, -r * 0.8 / sq, r * sq, r * 0.85 / sq, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 1.15, r * 0.25, r * 0.18, -0.4, 0, TAU); ctx.fill();
      eyes(ctx, 0, -r * 0.85, r * 0.35, 2.4, look);
      break;
    }
    case "boar": case "salamander": {
      const sal = f.type === "salamander";
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, -r * 0.7, r * 1.2, r * 0.75, 0, 0, TAU); ctx.fill();
      const hx = Math.cos(f.ang || 0) * r;
      ctx.beginPath(); ctx.arc(hx, -r * 0.8, r * 0.6, 0, TAU); ctx.fill();
      if (sal) { ctx.fillStyle = "#ffd76a"; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * r * 0.5, -r * 1.2, 2.2, 0, TAU); ctx.fill(); } }
      else { ctx.fillStyle = "#f2ecd8"; ctx.beginPath(); ctx.moveTo(hx + 4, -r * 0.6); ctx.lineTo(hx + 9 * Math.sign(hx || 1), -r * 0.4); ctx.lineTo(hx + 4, -r * 0.4); ctx.fill(); }
      eyes(ctx, hx, -r * 0.95, 3, 1.8, look, sal ? "#ff3a1a" : "#111");
      ctx.fillStyle = shadeOr(col, -0.3);
      const leg = Math.sin(ph * 2) * 2;
      ctx.fillRect(-r * 0.8, -r * 0.1 + leg, 3, 4); ctx.fillRect(r * 0.6, -r * 0.1 - leg, 3, 4);
      break;
    }
    case "wolf": case "icewolf": {
      ctx.fillStyle = col;
      const s = Math.sign(Math.cos(f.ang || 0)) || 1;
      ctx.beginPath(); ctx.ellipse(0, -r * 0.8, r * 1.15, r * 0.6, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(s * r * 0.95, -r * 1.15, r * 0.55, r * 0.45, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s * r * 0.7, -r * 1.45); ctx.lineTo(s * r * 0.85, -r * 1.95); ctx.lineTo(s * r * 1.05, -r * 1.45); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s * r * 1.1, -r * 1.45); ctx.lineTo(s * r * 1.3, -r * 1.9); ctx.lineTo(s * r * 1.35, -r * 1.35); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-s * r, -r * 0.9); ctx.quadraticCurveTo(-s * r * 1.6, -r * 1.5 + Math.sin(ph) * 3, -s * r * 1.5, -r * 1.9); ctx.stroke();
      ctx.fillStyle = f.type === "icewolf" ? "#2a7fff" : "#ffcf4a";
      ctx.beginPath(); ctx.arc(s * r * 1.15, -r * 1.2, 1.8, 0, TAU); ctx.fill();
      const leg = Math.sin(ph * 2.5) * 2.5;
      ctx.fillStyle = shadeOr(col, -0.25);
      ctx.fillRect(-r * 0.7, -r * 0.35 + leg, 3, 5); ctx.fillRect(r * 0.5, -r * 0.35 - leg, 3, 5);
      break;
    }
    case "shroom": {
      ctx.fillStyle = fl ? col : "#efe6d8"; ctx.fillRect(-r * 0.4, -r * 1.1, r * 0.8, r * 1.1);
      ctx.fillStyle = col;
      const puff = 1 + wind * 0.2;
      ctx.beginPath(); ctx.ellipse(0, -r * 1.2, r * 1.1 * puff, r * 0.75 * puff, 0, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = "#fff"; for (const [a, b] of [[-0.5, -1.5], [0.3, -1.65], [0.6, -1.3]]) { ctx.beginPath(); ctx.arc(a * r, b * r, 2.2, 0, TAU); ctx.fill(); }
      eyes(ctx, 0, -r * 0.55, 3, 1.7, look);
      break;
    }
    case "bat": {
      const flap = Math.sin(t * 22 + f.seed) * 0.8;
      ctx.translate(0, -r * 2.2 + Math.sin(ph) * 3);
      ctx.fillStyle = col;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * r * 1.8, -r * 0.8 * flap - 2); ctx.lineTo(s * r * 1.4, r * 0.4); ctx.lineTo(s * r * 0.8, 0); ctx.closePath(); ctx.fill(); }
      ctx.beginPath(); ctx.arc(0, 0, r * 0.65, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ff3a3a"; ctx.beginPath(); ctx.arc(-2, -1, 1.3, 0, TAU); ctx.arc(2, -1, 1.3, 0, TAU); ctx.fill();
      break;
    }
    case "skeleton": case "archer": case "knight": {
      const knight = f.type === "knight";
      const step = Math.sin(ph * 2) * 1.5;
      ctx.fillStyle = knight ? (fl ? col : "#3a3348") : (fl ? col : "#e8e2d0");
      ctx.fillRect(-4, -9 + step * 0.3, 3, 9); ctx.fillRect(1, -9 - step * 0.3, 3, 9);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, -r - 2, r * 0.6, r * 0.75, 0, 0, TAU); ctx.fill();
      if (!knight) { ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-5, -r - 6 + i * 4); ctx.lineTo(5, -r - 6 + i * 4); ctx.stroke(); } }
      ctx.fillStyle = knight ? (fl ? col : "#8a7ab0") : col;
      ctx.beginPath(); ctx.arc(0, -r * 2 - 4, r * 0.55, 0, TAU); ctx.fill();
      if (knight) {
        ctx.fillStyle = "#1a1424"; ctx.fillRect(-r * 0.4, -r * 2 - 5, r * 0.8, 2.5);
        ctx.fillStyle = "#ff4fd8"; ctx.beginPath(); ctx.moveTo(0, -r * 2.5 - 4); ctx.quadraticCurveTo(-8, -r * 3 - 6, -10, -r * 2 - 2); ctx.lineTo(-2, -r * 2.4); ctx.fill();
      } else { ctx.fillStyle = "#1a1a1a"; ctx.beginPath(); ctx.arc(-2.5, -r * 2 - 4, 1.8, 0, TAU); ctx.arc(2.5, -r * 2 - 4, 1.8, 0, TAU); ctx.fill(); }
      const a = (f.ang || 0) - (wind ? wind * 1.4 : 0);
      ctx.save(); ctx.translate(Math.cos(f.ang || 0) * 7, -r - 2); ctx.rotate(a);
      if (f.type === "archer") {
        ctx.strokeStyle = "#8a5a2a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(4, 0, 9, -1.2, 1.2); ctx.stroke();
        ctx.strokeStyle = "#ddd"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(4 + Math.cos(-1.2) * 9 - wind * 5, Math.sin(-1.2) * 9); ctx.lineTo(4 - wind * 6, 0); ctx.lineTo(4 + Math.cos(1.2) * 9 - wind * 5, Math.sin(1.2) * 9); ctx.stroke();
      } else {
        ctx.fillStyle = knight ? "#d77bff" : "#c9ccd8"; ctx.fillRect(2, -1.5, knight ? 24 : 17, 3);
        ctx.fillStyle = "#8a6a2a"; ctx.fillRect(0, -3.5, 3, 7);
      }
      ctx.restore();
      break;
    }
    case "ghost": case "wisp": {
      ctx.translate(0, -r * 1.6 + Math.sin(ph) * 4);
      if (f.type === "wisp") {
        glow(ctx, 0, 0, r * 2.6, "rgba(127,224,255,A)", 0.5 + wind * 0.4);
        ctx.fillStyle = fl ? "#fff" : "#dff8ff"; ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, TAU); ctx.fill();
        ctx.fillStyle = "#2a7fff"; ctx.beginPath(); ctx.arc(-2, -1, 1.5, 0, TAU); ctx.arc(2, -1, 1.5, 0, TAU); ctx.fill();
        break;
      }
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(0, -r * 0.3, r, Math.PI, 0);
      for (let i = 0; i <= 4; i++) ctx.lineTo(r - i * r / 2, r * 0.8 + Math.sin(ph * 2 + i) * 3 * (i % 2 ? -1 : 1));
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#123"; ctx.beginPath(); ctx.ellipse(-4, -r * 0.4, 2.2, 3.5, 0, 0, TAU); ctx.ellipse(4, -r * 0.4, 2.2, 3.5, 0, 0, TAU); ctx.fill();
      break;
    }
    case "yeti": case "magma": {
      const lava = f.type === "magma";
      const stomp = Math.abs(Math.sin(ph)) * 2;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, -r - stomp, r * 1.0, r * 1.05, 0, 0, TAU); ctx.fill();
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * r * 1.05, -r * 0.8 - wind * r * 0.6 * (s > 0 ? 1 : 0.6), r * 0.38, r * 0.6, s * 0.3, 0, TAU); ctx.fill(); }
      if (lava) {
        ctx.strokeStyle = `rgba(255,${150 + Math.sin(ph) * 60},40,0.9)`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 1.6); ctx.lineTo(-r * 0.1, -r * 1.1); ctx.lineTo(-r * 0.4, -r * 0.6); ctx.moveTo(r * 0.4, -r * 1.5); ctx.lineTo(r * 0.15, -r * 0.9); ctx.stroke();
        ctx.fillStyle = "#ffcf4a"; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 1.35, 2.4, 0, TAU); ctx.arc(r * 0.3, -r * 1.35, 2.4, 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = "#8ab4d8"; ctx.beginPath(); ctx.ellipse(0, -r * 1.25, r * 0.5, r * 0.38, 0, 0, TAU); ctx.fill();
        eyes(ctx, 0, -r * 1.35, 4, 2, look);
        ctx.fillStyle = "#fff"; ctx.fillRect(-4, -r * 1.05, 2.5, 3); ctx.fillRect(1.5, -r * 1.05, 2.5, 3);
      }
      break;
    }
    case "imp": {
      ctx.translate(0, -r * 1.2 + Math.sin(ph) * 2);
      glow(ctx, 0, 0, r * 2.2, "rgba(255,120,40,A)", 0.3 + wind * 0.4);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.5); ctx.lineTo(-r * 0.75, -r * 1.3); ctx.lineTo(-r * 0.2, -r * 0.75); ctx.moveTo(r * 0.6, -r * 0.5); ctx.lineTo(r * 0.75, -r * 1.3); ctx.lineTo(r * 0.2, -r * 0.75); ctx.fill();
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * r * 0.6, 0); ctx.lineTo(s * r * 1.6, -r * 0.5 + Math.sin(t * 18) * 3); ctx.lineTo(s * r * 1.2, r * 0.4); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = "#ffef9a"; ctx.beginPath(); ctx.arc(-3, -1, 2, 0, TAU); ctx.arc(3, -1, 2, 0, TAU); ctx.fill();
      if (wind > 0) { ctx.fillStyle = `rgba(255,220,120,${wind})`; ctx.beginPath(); ctx.arc(0, -r * 1.4, 3 + wind * 5, 0, TAU); ctx.fill(); }
      break;
    }
    default: {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -r, r, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
  // Health bar once it has been hurt.
  if (f.hp < f.maxHp && f.hp > 0) {
    const w = Math.max(22, r * 2);
    const top = y - (f.ai === "float" ? r * 3.4 : r * 2.6) - 6;
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x - w / 2 - 1, top - 1, w + 2, 5);
    ctx.fillStyle = f.elite ? "#ffb347" : "#ff5470"; ctx.fillRect(x - w / 2, top, w * (f.hp / f.maxHp), 3);
  }
}

// ==========================================================================
// Bosses
// ==========================================================================
export function drawBoss(ctx, b, t) {
  const { x, y, r } = b;
  const fl = b.flash > 0;
  const wind = b.wind || 0;
  const ph = t * 2.5;
  const enr = b.enraged;
  ctx.save();
  if (b.fade !== undefined) ctx.globalAlpha = b.fade;
  shadow(ctx, x, y + 2, r * 1.1, 0.35);
  if (enr) glow(ctx, x, y - r, r * 2.6, "rgba(255,60,60,A)", 0.22 + Math.sin(t * 6) * 0.08);
  const col = fl ? "#ffffff" : b.color;
  ctx.translate(x, y);
  switch (b.type) {
    case "slimeking": {
      const sq = 1 + Math.sin(ph * 2) * 0.06 + wind * 0.3;
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -r * 0.8 / sq, r * sq, r * 0.85 / sq, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 1.2, r * 0.25, r * 0.15, -0.5, 0, TAU); ctx.fill();
      eyes(ctx, 0, -r * 0.9, r * 0.32, 6, Math.cos(b.ang) * 3);
      ctx.fillStyle = "#ffcf4a";
      const cy = -r * 1.6 / sq - 4;
      ctx.beginPath(); ctx.moveTo(-r * 0.45, cy + 8); for (let i = 0; i <= 4; i++) ctx.lineTo(-r * 0.45 + i * r * 0.225, cy - (i % 2 ? 0 : 14)); ctx.lineTo(r * 0.45, cy + 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ff5470"; ctx.beginPath(); ctx.arc(0, cy, 3, 0, TAU); ctx.fill();
      break;
    }
    case "treant": {
      ctx.fillStyle = fl ? col : "#5a3a22";
      ctx.fillRect(-r * 0.45, -r * 1.7, r * 0.9, r * 1.7);
      ctx.strokeStyle = fl ? col : "#5a3a22"; ctx.lineWidth = 9; ctx.lineCap = "round";
      const arm = Math.sin(ph) * 0.3 + wind * 0.9;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * r * 0.4, -r * 1.2); ctx.quadraticCurveTo(s * r * 1.1, -r * (1.5 + arm), s * r * 1.3, -r * (0.6 + arm)); ctx.stroke(); }
      const cols = fl ? ["#fff", "#fff", "#fff"] : ["#2f6b2f", "#3d8f38", "#56a84a"];
      [[0, -2.2, 0.85], [-0.7, -1.9, 0.6], [0.7, -1.9, 0.6], [0, -2.8, 0.55]].forEach(([dx, dy, rr], i) => { ctx.fillStyle = cols[i % 3]; ctx.beginPath(); ctx.arc(dx * r, dy * r + Math.sin(ph + i) * 2, rr * r, 0, TAU); ctx.fill(); });
      ctx.fillStyle = "#ffef9a"; ctx.beginPath(); ctx.arc(-r * 0.18, -r * 1.15, 4, 0, TAU); ctx.arc(r * 0.18, -r * 1.15, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = "#1a0f08"; ctx.beginPath(); ctx.ellipse(0, -r * 0.8, r * 0.2, r * 0.1 + wind * 4, 0, 0, TAU); ctx.fill();
      break;
    }
    case "lich": {
      ctx.translate(0, Math.sin(ph) * 4 - 6);
      glow(ctx, 0, -r * 1.2, r * 2, "rgba(120,200,255,A)", 0.3);
      ctx.fillStyle = fl ? col : "#2a2a4a";
      ctx.beginPath(); ctx.moveTo(-r * 0.8, 0); ctx.lineTo(-r * 0.5, -r * 1.6); ctx.lineTo(r * 0.5, -r * 1.6); ctx.lineTo(r * 0.8, 0);
      for (let i = 0; i < 5; i++) ctx.lineTo(r * 0.8 - (i + 1) * r * 0.32, (i % 2 ? -6 : 4) + Math.sin(ph * 2 + i) * 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -r * 1.85, r * 0.42, 0, TAU); ctx.fill();
      ctx.fillStyle = "#2a2a4a"; ctx.beginPath(); ctx.arc(0, -r * 1.95, r * 0.5, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = "#7cf0ff"; ctx.beginPath(); ctx.arc(-5, -r * 1.85, 2.6, 0, TAU); ctx.arc(5, -r * 1.85, 2.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#8a7a5a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(r * 0.9, 0); ctx.lineTo(r * 0.9, -r * 2.3); ctx.stroke();
      glow(ctx, r * 0.9, -r * 2.4, 14 + wind * 14, "rgba(124,240,255,A)", 0.9);
      break;
    }
    case "frostgolem": {
      const stomp = Math.abs(Math.sin(ph)) * 3;
      ctx.fillStyle = col;
      const blk = (bx, by, w, h) => { ctx.fillStyle = col; ctx.fillRect(bx, by, w, h); ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(bx, by, w, 3); ctx.fillStyle = "rgba(40,90,140,0.25)"; ctx.fillRect(bx + w - 4, by, 4, h); };
      blk(-r * 0.7, -r * 1.8 - stomp, r * 1.4, r * 1.2);
      blk(-r * 0.45, -r * 2.5 - stomp, r * 0.9, r * 0.7);
      const arm = wind * r * 0.7;
      blk(-r * 1.25, -r * 1.7 - stomp - arm, r * 0.5, r * 1.1);
      blk(r * 0.75, -r * 1.7 - stomp - arm, r * 0.5, r * 1.1);
      blk(-r * 0.6, -r * 0.65, r * 0.45, r * 0.65); blk(r * 0.15, -r * 0.65, r * 0.45, r * 0.65);
      ctx.fillStyle = "#2a7fff"; ctx.fillRect(-r * 0.25, -r * 2.2 - stomp, 5, 5); ctx.fillRect(r * 0.12, -r * 2.2 - stomp, 5, 5);
      break;
    }
    case "drake": case "dragon": {
      const big = b.type === "dragon";
      const s = Math.sign(Math.cos(b.ang)) || 1;
      const flap = Math.sin(ph * (big ? 1.4 : 2)) * 0.5;
      ctx.fillStyle = fl ? col : shadeOr(b.color, -0.25);
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(side * r * 0.3, -r * 1.3);
        ctx.lineTo(side * r * 1.9, -r * (2.4 + flap)); ctx.lineTo(side * r * 2.1, -r * (1.2 + flap * 0.5)); ctx.lineTo(side * r * 1.5, -r * 0.9); ctx.lineTo(side * r * 1.1, -r * 0.7);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, -r * 0.9, r * 0.95, r * 0.75, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = r * 0.28; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-s * r * 0.7, -r * 0.6); ctx.quadraticCurveTo(-s * r * 1.6, -r * 0.2 + Math.sin(ph) * 6, -s * r * 1.8, -r * 0.9); ctx.stroke();
      const hx = s * r * 0.85, hy = -r * 1.65;
      ctx.beginPath(); ctx.moveTo(s * r * 0.3, -r * 1.2); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(hx + s * 6, hy, r * 0.42, r * 0.3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = big ? "#ffd76a" : "#3a1a10";
      ctx.beginPath(); ctx.moveTo(hx - s * 4, hy - r * 0.2); ctx.lineTo(hx - s * 14, hy - r * 0.55); ctx.lineTo(hx + s * 2, hy - r * 0.25); ctx.fill();
      ctx.fillStyle = "#ffef9a"; ctx.beginPath(); ctx.arc(hx + s * 10, hy - 4, 3, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,230,180,0.5)"; ctx.beginPath(); ctx.ellipse(0, -r * 0.7, r * 0.5, r * 0.45, 0, 0, TAU); ctx.fill();
      if (wind > 0) glow(ctx, hx + s * 22, hy, 16 + wind * 20, big ? "rgba(214,120,255,A)" : "rgba(255,140,40,A)", wind);
      break;
    }
  }
  ctx.restore();
}

function shadeOr(hex, amt) {
  if (!hex.startsWith("#")) return hex;
  const v = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return `rgb(${f((v >> 16) & 255)},${f((v >> 8) & 255)},${f(v & 255)})`;
}

/** NPCs in the village. */
export function drawNpc(ctx, n, t) {
  const { x, y } = n;
  shadow(ctx, x, y + 1, 10);
  const bob = Math.sin(t * 2 + x) * 0.8;
  ctx.fillStyle = n.color;
  ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x - 6, y - 20 - bob); ctx.lineTo(x + 6, y - 20 - bob); ctx.lineTo(x + 9, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#f1c9a5"; ctx.beginPath(); ctx.arc(x, y - 26 - bob, 7, 0, TAU); ctx.fill();
  ctx.fillStyle = n.hair; ctx.beginPath(); ctx.arc(x, y - 28 - bob, 7.2, Math.PI, TAU); ctx.fill();
  if (n.id === "elder") { ctx.fillStyle = "#e8e8e8"; ctx.beginPath(); ctx.moveTo(x - 4, y - 23 - bob); ctx.lineTo(x, y - 14 - bob); ctx.lineTo(x + 4, y - 23 - bob); ctx.fill(); }
  ctx.fillStyle = "#1a1a2a"; ctx.fillRect(x - 3, y - 27 - bob, 1.6, 2.2); ctx.fillRect(x + 1.4, y - 27 - bob, 1.6, 2.2);
}

/** Treasure chest. */
export function drawChest(ctx, c, t) {
  const { x, y } = c;
  shadow(ctx, x, y + 1, 14);
  if (!c.opened) glow(ctx, x, y - 10, 30, "rgba(255,215,106,A)", 0.25 + Math.sin(t * 3) * 0.1);
  ctx.fillStyle = "#7a4a22"; ctx.fillRect(x - 13, y - 14, 26, 14);
  ctx.fillStyle = "#c9a24a"; ctx.fillRect(x - 13, y - 9, 26, 2); ctx.fillRect(x - 2, y - 12, 4, 6);
  ctx.fillStyle = "#8a5a2a";
  if (c.opened) { ctx.fillRect(x - 13, y - 26, 26, 6); ctx.fillStyle = "#2a1a0a"; ctx.fillRect(x - 11, y - 15, 22, 3); }
  else { ctx.beginPath(); ctx.moveTo(x - 13, y - 14); ctx.quadraticCurveTo(x, y - 26, x + 13, y - 14); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#c9a24a"; ctx.fillRect(x - 13, y - 15, 26, 2); }
}
