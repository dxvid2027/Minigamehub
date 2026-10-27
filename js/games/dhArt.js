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
  const tier = h.tier || 0;
  const trim = h.trimColor || "#c9a24a";
  shadow(ctx, x, y + 1, 12);
  if (h.shield > 0) {
    // Aegis: a shimmering bubble.
    const a = 0.25 + Math.sin(t * 6) * 0.08;
    const g = ctx.createRadialGradient(x, y - 16, 8, x, y - 16, 30);
    g.addColorStop(0, "rgba(255,215,106,0)"); g.addColorStop(0.8, `rgba(255,215,106,${a})`); g.addColorStop(1, `rgba(255,240,180,${a * 2})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 16, 30, 0, TAU); ctx.fill();
  }
  ctx.save();
  if (h.rolling) {
    ctx.translate(x, y - 11);
    ctx.rotate(h.rollSpin);
    ctx.fillStyle = h.capeColor || "#2c4f9a"; ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
    ctx.fillStyle = h.armorColor; ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 1.2); ctx.stroke();
    ctx.restore();
    return;
  }
  if (h.hurt > 0 && Math.floor(t * 30) % 2) ctx.globalAlpha = 0.55;
  const by = y - bob;
  const outline = "rgba(10,10,20,0.55)";
  ctx.lineWidth = 1.2; ctx.strokeStyle = outline;
  const drawSword = () => {
    let a;
    if (h.swing >= 0) a = h.swingDir + (-1.15 + h.swing * 2.3) * (h.combo % 2 ? -1 : 1);
    else a = face + (side ? 0.9 * side : 0.9);
    const hx = x + Math.cos(a) * 10, hy = by - 12 + Math.sin(a) * 6;
    const len = 22 + Math.min(10, tier * 0.7);
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(a);
    if (h.fxColor) {
      const gg = ctx.createRadialGradient(4 + len / 2, 0, 0, 4 + len / 2, 0, len * 0.7);
      gg.addColorStop(0, h.fxColor + "99"); gg.addColorStop(1, h.fxColor + "00");
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(4 + len / 2, 0, len * 0.7, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = "#4a2e18"; ctx.fillRect(-4, -1.6, 7, 3.2);
    ctx.fillStyle = trim; ctx.fillRect(2, -5, 3, 10);
    ctx.beginPath(); ctx.arc(-4.5, 0, 2, 0, TAU); ctx.fill();
    const g = ctx.createLinearGradient(5, -3, 5, 3);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, h.swordColor); g.addColorStop(1, shadeOr(h.swordColor, -0.35));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(5, -2.8); ctx.lineTo(4 + len - 4, -2); ctx.lineTo(4 + len + 2, 0); ctx.lineTo(4 + len - 4, 2); ctx.lineTo(5, 2.8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = outline; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.restore();
  };
  if (back) drawSword();
  // Cape.
  ctx.fillStyle = h.capeColor || "#2c4f9a";
  const sway = Math.sin(h.walk * 2) * (h.moving ? 2.5 : 0.8) + Math.sin(t * 2.2) * 0.6;
  ctx.beginPath();
  ctx.moveTo(x - 7.5, by - 20); ctx.lineTo(x + 7.5, by - 20);
  ctx.quadraticCurveTo(x + 11 - fx * 4 + sway, by - 8, x + 10 - fx * 5 + sway, by - 1 - fy * 2);
  ctx.lineTo(x - 10 - fx * 5 + sway, by - 1 - fy * 2);
  ctx.quadraticCurveTo(x - 11 - fx * 4 + sway, by - 8, x - 7.5, by - 20);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Legs and boots.
  const step = h.moving ? Math.sin(h.walk * 2) * 3 : 0;
  ctx.fillStyle = "#2a2030";
  ctx.fillRect(x - 5.5, by - 8 + step * 0.3, 4.5, 8 - step * 0.3);
  ctx.fillRect(x + 1, by - 8 - step * 0.3, 4.5, 8 + step * 0.3);
  ctx.fillStyle = "#4a2e18";
  ctx.fillRect(x - 6, by - 2.5 + step * 0.3, 5.5, 3); ctx.fillRect(x + 0.5, by - 2.5 - step * 0.3, 5.5, 3);
  // Body: armour picks up plates and trim as its tier rises.
  const bg = ctx.createLinearGradient(x - 9, by - 22, x + 9, by - 6);
  bg.addColorStop(0, shadeOr(h.armorColor, 0.25)); bg.addColorStop(1, shadeOr(h.armorColor, -0.25));
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.ellipse(x, by - 14, 8.5, 9, 0, 0, TAU); ctx.fill(); ctx.stroke();
  if (tier >= 2) { ctx.strokeStyle = trim; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, by - 22); ctx.lineTo(x, by - 7); ctx.stroke(); ctx.strokeStyle = outline; }
  if (tier >= 5) for (const sgn of [-1, 1]) {
    ctx.fillStyle = shadeOr(h.armorColor, 0.1);
    ctx.beginPath(); ctx.ellipse(x + sgn * 8, by - 19, 4.5, 3.5, sgn * 0.4, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = trim; ctx.beginPath(); ctx.arc(x + sgn * 8, by - 19.5, 1.2, 0, TAU); ctx.fill();
  }
  if (tier >= 9) {
    const gl = 0.4 + Math.sin(t * 3) * 0.25;
    ctx.fillStyle = `rgba(255,255,255,${gl})`; ctx.beginPath(); ctx.arc(x, by - 15, 2.2, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = "#4a2e18"; ctx.fillRect(x - 8.5, by - 10.5, 17, 2.5);
  ctx.fillStyle = trim; ctx.fillRect(x - 1.8, by - 11, 3.6, 3.5);
  // Head, hair or helmet.
  ctx.fillStyle = "#f1c9a5";
  ctx.beginPath(); ctx.arc(x, by - 27, 7.8, 0, TAU); ctx.fill(); ctx.stroke();
  if (tier >= 3) {
    // Helmet.
    ctx.fillStyle = shadeOr(h.armorColor, 0.15);
    ctx.beginPath(); ctx.arc(x, by - 28.5, 8.3, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(x + 8.3, by - 26); ctx.lineTo(x - 8.3, by - 26); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = trim; ctx.fillRect(x - 8.3, by - 27, 16.6, 1.6);
    if (tier >= 7) { ctx.fillStyle = h.fxColor || "#ff5470"; ctx.beginPath(); ctx.moveTo(x, by - 36); ctx.quadraticCurveTo(x - 9 - sway, by - 42, x - 12 - sway, by - 30); ctx.lineTo(x - 2, by - 33); ctx.fill(); }
  } else if (back) { ctx.fillStyle = "#6a3a1a"; ctx.beginPath(); ctx.arc(x, by - 28, 8, 0, TAU); ctx.fill(); }
  else {
    ctx.fillStyle = "#6a3a1a";
    ctx.beginPath(); ctx.arc(x, by - 29.5, 7.8, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 7.8, by - 29); ctx.lineTo(x - 4, by - 24); ctx.lineTo(x - 2, by - 29); ctx.lineTo(x + 2, by - 25); ctx.lineTo(x + 4, by - 29); ctx.lineTo(x + 7.8, by - 25); ctx.lineTo(x + 7.8, by - 30); ctx.closePath(); ctx.fill();
  }
  if (!back) {
    ctx.fillStyle = "#1a1a2a";
    const ex = side * 2.2;
    if (side >= 0) ctx.fillRect(x + 1.5 + ex, by - 27, 1.9, 2.8);
    if (side <= 0) ctx.fillRect(x - 3.4 + ex, by - 27, 1.9, 2.8);
  }
  if (!back) drawSword();
  ctx.restore();
  // Swing trail, tinted by the weapon's effect.
  if (h.swing >= 0 && h.swing < 0.9) {
    const a0 = h.swingDir - 1.15, a1 = h.swingDir - 1.15 + h.swing * 2.3;
    const flip = h.combo % 2;
    const col = h.fxColor || "#ffffff";
    ctx.strokeStyle = col; ctx.globalAlpha = 0.65 * (1 - h.swing);
    ctx.lineWidth = h.combo === 2 ? 9 : 5.5; ctx.lineCap = "round";
    ctx.beginPath();
    if (!flip) ctx.arc(x, by - 12, 32, a0, a1);
    else ctx.arc(x, by - 12, 32, h.swingDir + 1.15 - h.swing * 2.3, h.swingDir + 1.15);
    ctx.stroke();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = 1;
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
  const col = fl ? "#ffffff" : f.frozen > 0 ? "#bfe8ff" : f.color;
  switch (f.art || f.type) {
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
    case "crab": case "scorpion": {
      const sc = f.type === "scorpion" || f.art === "scorpion";
      const sn = Math.sin(ph * 2.5);
      ctx.fillStyle = shadeOr(f.color, -0.3);
      for (let i = -1; i <= 1; i++) for (const sgn of [-1, 1]) { ctx.fillRect(sgn * r * 0.7 + (sgn > 0 ? 0 : -6), -r * 0.4 + i * 4 + sn * (i % 2 ? 1 : -1), 6, 2); }
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, -r * 0.7, r, r * 0.7, 0, 0, TAU); ctx.fill();
      const claw = wind * 5;
      for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.arc(sgn * r * 1.15, -r * 1.05 - claw, r * 0.38, 0, TAU); ctx.fill(); ctx.fillStyle = shadeOr(f.color, -0.3); ctx.beginPath(); ctx.moveTo(sgn * r * 1.15, -r * 1.05 - claw); ctx.lineTo(sgn * r * 1.5, -r * 1.25 - claw); ctx.lineTo(sgn * r * 1.2, -r * 0.9 - claw); ctx.fill(); ctx.fillStyle = col; }
      if (sc) { ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(0, -r * 0.4); ctx.quadraticCurveTo(0, r * 0.6, r * 0.2, -r * (1.6 + wind)); ctx.stroke(); ctx.fillStyle = "#ffef6a"; ctx.beginPath(); ctx.arc(r * 0.2, -r * (1.6 + wind), 2.5, 0, TAU); ctx.fill(); }
      eyes(ctx, 0, -r * 1.1, 3.5, 2, look);
      break;
    }
    case "serpentling": {
      ctx.translate(0, -r * 1.2 + Math.sin(ph) * 3);
      ctx.strokeStyle = col; ctx.lineCap = "round"; ctx.lineWidth = r * 0.9;
      const a = f.ang || 0;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const k = i / 6; const px = -Math.cos(a) * k * r * 2.6 + Math.sin(ph * 2 + k * 5) * 4 * k, py = -Math.sin(a) * k * r * 1.6 + Math.cos(ph * 2 + k * 5) * 3 * k; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ffef6a"; ctx.beginPath(); ctx.arc(Math.cos(a) * 3 - 2, -2, 1.6, 0, TAU); ctx.arc(Math.cos(a) * 3 + 2, -2, 1.6, 0, TAU); ctx.fill();
      break;
    }
    case "eye": {
      ctx.translate(0, -r * 1.7 + Math.sin(ph) * 4);
      glow(ctx, 0, 0, r * 2.4, "rgba(255,255,255,A)", 0.12 + wind * 0.3);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.75, r * 0.55, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#1a0a2a"; ctx.beginPath(); ctx.arc(Math.cos(f.ang || 0) * r * 0.3, Math.sin(f.ang || 0) * r * 0.2, r * (0.3 + wind * 0.15), 0, TAU); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) { const a = Math.PI * 0.6 + i * 0.4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(a) * (r + 7) + Math.sin(ph + i) * 2, Math.sin(a) * (r + 7)); ctx.stroke(); }
      break;
    }
    case "spider": {
      const sn = Math.sin(ph * 3);
      ctx.strokeStyle = shadeOr(f.color, -0.3); ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) for (const sgn of [-1, 1]) {
        const a = sgn * (0.5 + i * 0.35);
        ctx.beginPath(); ctx.moveTo(0, -r * 0.6);
        ctx.quadraticCurveTo(Math.sin(a) * r * 1.3, -r * 1.3 + (i % 2 ? sn : -sn) * 2, Math.sin(a) * r * 1.8, -r * 0.1 + i * 2); ctx.stroke();
      }
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -r * 0.6, r * 0.8, r * 0.65, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = shadeOr(f.color, 0.4); ctx.beginPath(); ctx.moveTo(-4, -r); ctx.lineTo(0, -r * 1.4); ctx.lineTo(4, -r); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ff3a5a"; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * 3, -r * 0.6, 1.4, 0, TAU); ctx.fill(); }
      break;
    }
    case "construct": {
      const stomp = Math.abs(Math.sin(ph)) * 2;
      ctx.fillStyle = shadeOr(f.color, -0.25);
      ctx.fillRect(-r * 0.6, -r * 0.5, r * 0.45, r * 0.5); ctx.fillRect(r * 0.15, -r * 0.5, r * 0.45, r * 0.5);
      ctx.fillStyle = col;
      ctx.fillRect(-r * 0.8, -r * 1.7 - stomp, r * 1.6, r * 1.25);
      ctx.fillStyle = shadeOr(f.color, 0.3); ctx.fillRect(-r * 0.8, -r * 1.7 - stomp, r * 1.6, 3);
      const arm = wind * r * 0.6;
      ctx.fillStyle = col; ctx.fillRect(-r * 1.2, -r * 1.55 - stomp - arm, r * 0.38, r * 1.0); ctx.fillRect(r * 0.82, -r * 1.55 - stomp - arm, r * 0.38, r * 1.0);
      ctx.fillStyle = "#1a1424"; ctx.fillRect(-r * 0.45, -r * 1.45 - stomp, r * 0.9, r * 0.28);
      ctx.fillStyle = `rgba(255,${180 + Math.sin(ph * 2) * 60},60,1)`; ctx.fillRect(-r * 0.35, -r * 1.4 - stomp, r * 0.7, r * 0.15);
      ctx.save(); ctx.translate(0, -r * 1.05 - stomp); ctx.rotate(t * 2); ctx.strokeStyle = shadeOr(f.color, -0.4); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, TAU); ctx.moveTo(-r * 0.3, 0); ctx.lineTo(r * 0.3, 0); ctx.stroke(); ctx.restore();
      break;
    }
    default: {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -r, r, 0, TAU); ctx.fill();
    }
  }
  if (f.frozen > 0) { ctx.fillStyle = "rgba(190,235,255,0.45)"; ctx.beginPath(); ctx.ellipse(0, -r, r * 1.3, r * 1.2, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1.5; ctx.stroke(); }
  if (f.burn > 0 && Math.random() < 0.7) { ctx.fillStyle = `rgba(255,${120 + Math.random() * 100},40,0.85)`; ctx.beginPath(); ctx.arc(rand2(r), -r * 1.4 - Math.random() * r, 2 + Math.random() * 2, 0, TAU); ctx.fill(); }
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
  if (b.nightmare) glow(ctx, 0, -r, r * 2.4, "rgba(140,0,200,A)", 0.3 + Math.sin(t * 4) * 0.1);
  switch (b.art || b.type) {
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
    case "serpent": {
      // A great sea / sand serpent: coils behind, a crowned head in front.
      const a = b.ang;
      ctx.lineCap = "round";
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? shadeOr(b.color, 0.25) : shadeOr(b.color, -0.25);
        ctx.lineWidth = pass ? r * 0.5 : r * 0.75;
        ctx.beginPath();
        for (let i = 0; i <= 14; i++) {
          const k = i / 14;
          const px = -Math.cos(a) * k * r * 3 + Math.sin(ph * 1.5 + k * 7) * r * 0.5 * k;
          const py = -r * 0.9 - Math.sin(a) * k * r * 1.5 + Math.cos(ph * 1.5 + k * 7) * r * 0.3 * k;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * 0.3, -r * 1.1, r * 0.7, r * 0.5, a, 0, TAU); ctx.fill();
      ctx.fillStyle = shadeOr(b.color, 0.4);
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.3 - 5, -r * 1.45); ctx.lineTo(i * r * 0.3, -r * (1.95 + (i ? 0 : 0.2))); ctx.lineTo(i * r * 0.3 + 5, -r * 1.45); ctx.fill(); }
      ctx.fillStyle = "#ffef6a"; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.55 - 6, -r * 1.15, 3.5, 0, TAU); ctx.arc(Math.cos(a) * r * 0.55 + 6, -r * 1.15, 3.5, 0, TAU); ctx.fill();
      if (wind > 0) glow(ctx, Math.cos(a) * r, -r * 1.1, 16 + wind * 18, "rgba(150,240,255,A)", wind);
      break;
    }
    case "kraken": {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + Math.sin(ph + i) * 0.2;
        ctx.strokeStyle = i % 2 ? shadeOr(b.color, -0.2) : col; ctx.lineWidth = 9 - wind * 2; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(0, -r * 0.6);
        ctx.quadraticCurveTo(Math.cos(a) * r * 1.2, -r * 0.6 + Math.sin(a) * r * 0.8, Math.cos(a + Math.sin(ph * 1.3 + i) * 0.6) * r * 1.9, -r * 0.4 + Math.sin(a) * r * 1.1);
        ctx.stroke();
      }
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -r * 1.3, r * 0.85, r * 1.05, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 1.8, r * 0.25, r * 0.35, -0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ffef6a"; ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 1.1, 6, 4 + wind * 3, 0, 0, TAU); ctx.ellipse(r * 0.3, -r * 1.1, 6, 4 + wind * 3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#1a0a2a"; ctx.fillRect(-r * 0.3 - 1.5, -r * 1.1 - 3, 3, 6); ctx.fillRect(r * 0.3 - 1.5, -r * 1.1 - 3, 3, 6);
      break;
    }
    case "seraph": {
      ctx.translate(0, Math.sin(ph) * 5 - 10);
      glow(ctx, 0, -r * 1.3, r * 2.6, "rgba(255,230,150,A)", 0.35);
      for (const sgn of [-1, 1]) for (let i = 0; i < 3; i++) {
        ctx.fillStyle = `rgba(255,${245 - i * 15},${220 - i * 30},${0.9 - i * 0.2})`;
        ctx.beginPath(); ctx.moveTo(sgn * r * 0.2, -r * 1.4);
        ctx.quadraticCurveTo(sgn * r * (1.2 + i * 0.5), -r * (2.4 - i * 0.3 + Math.sin(ph + i) * 0.1), sgn * r * (1.6 + i * 0.4), -r * (0.6 + i * 0.3));
        ctx.quadraticCurveTo(sgn * r * 0.9, -r * 1.0, sgn * r * 0.2, -r * 1.1); ctx.fill();
      }
      ctx.fillStyle = fl ? col : "#fff8e0";
      ctx.beginPath(); ctx.moveTo(-r * 0.5, 0); ctx.lineTo(-r * 0.3, -r * 1.5); ctx.lineTo(r * 0.3, -r * 1.5); ctx.lineTo(r * 0.5, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col; ctx.fillRect(-r * 0.32, -r * 1.2, r * 0.64, 4);
      ctx.fillStyle = "#f8e6c8"; ctx.beginPath(); ctx.arc(0, -r * 1.75, r * 0.32, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,215,106,${0.8 + Math.sin(t * 3) * 0.2})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, -r * 2.25, r * 0.4, r * 0.12, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = "#ffd76a"; ctx.fillRect(-5, -r * 1.8, 3, 2.5); ctx.fillRect(2, -r * 1.8, 3, 2.5);
      if (wind > 0) glow(ctx, 0, -r * 1.3, 20 + wind * 30, "rgba(255,255,255,A)", wind);
      break;
    }
    case "eternal": {
      // Nyxara: three heads, a crown of void, wings of starlight.
      const flap = Math.sin(ph * 1.2) * 0.4;
      for (const sgn of [-1, 1]) {
        const wg = ctx.createLinearGradient(0, -r * 2, sgn * r * 2.4, -r * 0.6);
        wg.addColorStop(0, fl ? col : "#2a0a4a"); wg.addColorStop(1, fl ? col : "#d77bff");
        ctx.fillStyle = wg;
        ctx.beginPath(); ctx.moveTo(sgn * r * 0.3, -r * 1.3);
        ctx.lineTo(sgn * r * 2.3, -r * (2.6 + flap)); ctx.lineTo(sgn * r * 2.5, -r * (1.2 + flap * 0.5)); ctx.lineTo(sgn * r * 1.8, -r * 1.0); ctx.lineTo(sgn * r * 1.2, -r * 0.6);
        ctx.closePath(); ctx.fill();
        for (let i = 0; i < 4; i++) { ctx.fillStyle = `rgba(255,255,255,${0.4 + Math.sin(t * 3 + i + sgn) * 0.3})`; ctx.fillRect(sgn * r * (1.2 + i * 0.3), -r * (1.6 + (i % 2) * 0.4 + flap * 0.5), 2, 2); }
      }
      ctx.fillStyle = fl ? col : "#3a1a5a"; ctx.beginPath(); ctx.ellipse(0, -r * 0.9, r * 1.0, r * 0.8, 0, 0, TAU); ctx.fill();
      for (let i = -1; i <= 1; i++) {
        const hx = i * r * 0.65 + Math.sin(ph + i) * 4, hy = -r * (1.75 + (i ? 0 : 0.25)) + Math.cos(ph * 1.3 + i) * 3;
        ctx.strokeStyle = fl ? col : "#3a1a5a"; ctx.lineWidth = r * 0.22; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(i * r * 0.3, -r * 1.2); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(hx, hy, r * 0.3, r * 0.22, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#ffef9a"; ctx.beginPath(); ctx.arc(hx - 4, hy - 2, 2.5, 0, TAU); ctx.arc(hx + 4, hy - 2, 2.5, 0, TAU); ctx.fill();
        ctx.fillStyle = "#1a0a2a"; ctx.beginPath(); ctx.moveTo(hx - 6, hy - r * 0.15); ctx.lineTo(hx - 3, hy - r * 0.45); ctx.lineTo(hx, hy - r * 0.18); ctx.lineTo(hx + 3, hy - r * 0.45); ctx.lineTo(hx + 6, hy - r * 0.15); ctx.fill();
      }
      glow(ctx, 0, -r * 0.9, r * 0.6, "rgba(255,138,240,A)", 0.4 + Math.sin(t * 4) * 0.2);
      if (wind > 0) glow(ctx, 0, -r * 1.8, 20 + wind * 34, "rgba(255,138,240,A)", wind);
      break;
    }
  }
  ctx.restore();
}

function rand2(r) { return (Math.random() - 0.5) * r * 1.4; }

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
