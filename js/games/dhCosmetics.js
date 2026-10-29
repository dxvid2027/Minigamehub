// ==========================================================================
// Dragonheart — cosmetic art: helmets, capes, wings, auras and pets.
//
// Helmets are drawn in "head space": the origin is the centre of the head
// and the head's radius is 8 units, so the same art fits the hero and the
// quest givers (whose heads are a little smaller).
// ==========================================================================
import { COSMETICS } from "./dhQuests.js";

const TAU = Math.PI * 2;

function shade(hex, amt) {
  if (!hex || !hex.startsWith("#")) return hex;
  const v = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return `rgb(${f((v >> 16) & 255)},${f((v >> 8) & 255)},${f(v & 255)})`;
}
const glowAt = (ctx, x, y, r, rgb, a) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
};
const dome = (ctx, r, y0 = -1) => { ctx.beginPath(); ctx.arc(0, y0, r, Math.PI * 0.95, Math.PI * 2.05); ctx.closePath(); };
const star = (ctx, x, y, r1, r2, n = 5) => {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? r2 : r1; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.closePath();
};

/** Whether a helmet hides the hair entirely (no need to draw it first). */
export function helmCoversHair(id) { return ["hood", "horned", "dragonhelm", "pharaoh", "wingedhelm", "skullhelm", "voidmask", "greathelm", "kabuto", "dragonking"].includes(id); }

/**
 * A cosmetic helmet on a head centred at (x, hy) with radius r.
 * `back` is true when the wearer faces away from the camera.
 */
export function drawHelm(ctx, id, x, hy, r, t, back = false, sway = 0) {
  const C = COSMETICS[id];
  if (!C) return;
  ctx.save();
  ctx.translate(x, hy);
  const k = r / 8;
  ctx.scale(k, k);
  ctx.lineWidth = 1 / k * 1.1;
  ctx.strokeStyle = "rgba(10,10,20,0.55)";
  switch (id) {
    case "flowercrown": {
      ctx.strokeStyle = "#3a8a3a"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, -1, 8.2, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      const cols = ["#ff7fa8", "#ffd76a", "#ffffff", "#9ad0ff", "#ff7fa8"];
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (1.1 + i * 0.2), fx = Math.cos(a) * 8.2, fy = -1 + Math.sin(a) * 8.2;
        ctx.fillStyle = cols[i];
        for (let p = 0; p < 5; p++) { const pa = p * TAU / 5 + t * 0.5; ctx.beginPath(); ctx.arc(fx + Math.cos(pa) * 1.5, fy + Math.sin(pa) * 1.5, 1.2, 0, TAU); ctx.fill(); }
        ctx.fillStyle = "#ffb347"; ctx.beginPath(); ctx.arc(fx, fy, 0.9, 0, TAU); ctx.fill();
      }
      break;
    }
    case "strawhat": {
      ctx.fillStyle = "#d8b45a"; ctx.beginPath(); ctx.ellipse(0, -5, 13.5, 4, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#e8c46a"; ctx.beginPath(); ctx.arc(0, -6, 7, Math.PI, TAU); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#c0503a"; ctx.fillRect(-7, -8, 14, 2);
      ctx.strokeStyle = "rgba(120,80,20,0.4)"; ctx.lineWidth = 0.6;
      for (let i = -10; i <= 10; i += 3) { ctx.beginPath(); ctx.moveTo(i, -6.5); ctx.lineTo(i * 1.2, -3.5); ctx.stroke(); }
      break;
    }
    case "tophat": {
      ctx.fillStyle = "#1a1a24"; ctx.beginPath(); ctx.ellipse(0, -6, 11, 3, 0, 0, TAU); ctx.fill();
      ctx.fillRect(-6.5, -21, 13, 15);
      ctx.fillStyle = "#a01a2a"; ctx.fillRect(-6.5, -10, 13, 2.6);
      ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fillRect(-5, -20, 2, 9);
      break;
    }
    case "hood": {
      ctx.fillStyle = C.color;
      ctx.beginPath(); ctx.arc(0, -1, 10, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6, -8); ctx.quadraticCurveTo(-2 - sway, -16, 4 - sway, -15); ctx.lineTo(3, -8); ctx.fill();
      if (!back) {
        ctx.fillStyle = "#1a3a20"; ctx.beginPath(); ctx.ellipse(0, 1.6, 6.4, 6.8, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#f1c9a5"; ctx.beginPath(); ctx.ellipse(0, 2.2, 5.4, 5.8, 0, 0, TAU); ctx.fill();
      }
      break;
    }
    case "wizard": {
      ctx.fillStyle = shade(C.color, -0.2); ctx.beginPath(); ctx.ellipse(0, -5, 13, 3.6, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.color;
      ctx.beginPath(); ctx.moveTo(-7, -6); ctx.quadraticCurveTo(-2, -16, 4 + sway, -27); ctx.quadraticCurveTo(3, -14, 7, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffd76a"; ctx.fillRect(-7, -8, 14, 2);
      star(ctx, -1, -14, 2, 0.9); ctx.fill(); star(ctx, 2.5, -20, 1.4, 0.6); ctx.fill();
      break;
    }
    case "horned": {
      for (const sg of [-1, 1]) {
        ctx.fillStyle = "#f4ecd8";
        ctx.beginPath(); ctx.moveTo(sg * 6, -4); ctx.quadraticCurveTo(sg * 15, -6, sg * 13, -17); ctx.quadraticCurveTo(sg * 11, -9, sg * 5, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      const g = ctx.createLinearGradient(0, -10, 0, 0); g.addColorStop(0, "#e8ecf4"); g.addColorStop(1, "#8a90a4");
      ctx.fillStyle = g; dome(ctx, 8.8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#c9a24a"; ctx.fillRect(-8.8, -2.5, 17.6, 2);
      if (!back) { ctx.fillStyle = "#8a90a4"; ctx.fillRect(-1, -2, 2, 5.5); }
      break;
    }
    case "flamecrown": {
      for (let i = 0; i < 5; i++) {
        const fx = -6 + i * 3, h = 6 + Math.sin(t * 9 + i * 1.7) * 2 + (i === 2 ? 3 : 0);
        const g = ctx.createLinearGradient(0, -6 - h, 0, -6); g.addColorStop(0, "rgba(255,240,120,0.9)"); g.addColorStop(1, "#ff5a1a");
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(fx - 2, -6); ctx.quadraticCurveTo(fx - 1.5, -6 - h * 0.6, fx + Math.sin(t * 7 + i) * 0.8, -6 - h); ctx.quadraticCurveTo(fx + 1.5, -6 - h * 0.6, fx + 2, -6); ctx.fill();
      }
      ctx.fillStyle = "#ffd76a"; ctx.fillRect(-8, -7, 16, 3); ctx.strokeRect(-8, -7, 16, 3);
      ctx.fillStyle = "#ff3a1a"; ctx.beginPath(); ctx.arc(0, -5.5, 1.2, 0, TAU); ctx.fill();
      break;
    }
    case "dragonhelm": {
      // Great swept horns first, behind the helm.
      for (const sg of [-1, 1]) {
        const hg = ctx.createLinearGradient(sg * 6, -6, sg * 16, -20); hg.addColorStop(0, "#2a1a1a"); hg.addColorStop(1, "#ffd76a");
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.moveTo(sg * 5, -6); ctx.bezierCurveTo(sg * 13, -6, sg * 17, -12, sg * 15, -22); ctx.bezierCurveTo(sg * 13, -14, sg * 10, -10, sg * 4, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
        // Small back spike.
        ctx.fillStyle = "#7a1020"; ctx.beginPath(); ctx.moveTo(sg * 8, -2); ctx.lineTo(sg * 13, -1); ctx.lineTo(sg * 8.5, 1.5); ctx.closePath(); ctx.fill();
      }
      const g = ctx.createLinearGradient(0, -11, 0, 2); g.addColorStop(0, "#ff4a4a"); g.addColorStop(1, "#7a1020");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, -1, 9.2, Math.PI * 0.9, Math.PI * 2.1); ctx.lineTo(9, 3); ctx.lineTo(6, 2); ctx.lineTo(-6, 2); ctx.lineTo(-9, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
      // Scales.
      ctx.strokeStyle = "rgba(60,0,10,0.45)"; ctx.lineWidth = 0.6;
      for (let row = 0; row < 3; row++) for (let i = -3; i <= 3; i++) {
        const sx = i * 2.4 + (row % 2) * 1.2, sy = -8 + row * 2.4;
        if (Math.hypot(sx, sy + 1) > 8.5) continue;
        ctx.beginPath(); ctx.arc(sx, sy, 1.2, 0, Math.PI); ctx.stroke();
      }
      // Gold crest of spikes along the top.
      ctx.fillStyle = "#ffd76a"; ctx.strokeStyle = "rgba(10,10,20,0.55)"; ctx.lineWidth = 0.8;
      for (let i = 0; i < 4; i++) { const sy = -10 + i * 0.6, sx = -3 + i * 2; ctx.beginPath(); ctx.moveTo(sx - 1.2, sy + 1); ctx.lineTo(sx + 0.4 + sway * 0.2, sy - 3.5 + i * 0.4); ctx.lineTo(sx + 1.4, sy + 1); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      if (!back) {
        // Snout visor with glowing eyes.
        ctx.fillStyle = "#5a0a18";
        ctx.beginPath(); ctx.moveTo(-6.5, -3.5); ctx.lineTo(0, -1); ctx.lineTo(6.5, -3.5); ctx.lineTo(4, -6); ctx.lineTo(-4, -6); ctx.closePath(); ctx.fill();
        const gl = 0.6 + Math.sin(t * 4) * 0.3;
        ctx.fillStyle = `rgba(255,200,60,${gl})`;
        ctx.beginPath(); ctx.ellipse(-3.2, -4.4, 1.5, 0.7, 0.3, 0, TAU); ctx.ellipse(3.2, -4.4, 1.5, 0.7, -0.3, 0, TAU); ctx.fill();
        glowAt(ctx, 0, -4.4, 6, "255,180,60", 0.25 * gl);
        ctx.fillStyle = "#ffd76a"; ctx.fillRect(-0.6, -9, 1.2, 5);
      }
      break;
    }
    case "piratehat": {
      ctx.fillStyle = "#1a1a24";
      ctx.beginPath(); ctx.moveTo(-13, -3); ctx.quadraticCurveTo(-8, -18, 0, -15); ctx.quadraticCurveTo(8, -18, 13, -3); ctx.quadraticCurveTo(0, -8, -13, -3); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#ffd76a"; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-13, -3); ctx.quadraticCurveTo(0, -8, 13, -3); ctx.stroke();
      if (!back) {
        ctx.fillStyle = "#f4f4f4"; ctx.beginPath(); ctx.arc(0, -10, 2, 0, TAU); ctx.fill();
        ctx.fillRect(-3, -7.8, 6, 0.9);
        ctx.fillStyle = "#1a1a24"; ctx.fillRect(-1, -10.6, 0.8, 0.8); ctx.fillRect(0.3, -10.6, 0.8, 0.8);
      }
      ctx.fillStyle = "#c0203a"; ctx.beginPath(); ctx.moveTo(8, -12); ctx.quadraticCurveTo(14 + sway, -18, 12 + sway, -24); ctx.quadraticCurveTo(10, -16, 6, -12); ctx.fill();
      break;
    }
    case "pharaoh": {
      ctx.fillStyle = "#ffd76a";
      ctx.beginPath(); ctx.moveTo(-8.5, -2); ctx.arc(0, -1, 8.8, Math.PI, TAU); ctx.lineTo(8.8, -1); ctx.lineTo(11, 11); ctx.lineTo(6, 11); ctx.lineTo(6.5, 1); ctx.lineTo(-6.5, 1); ctx.lineTo(-6, 11); ctx.lineTo(-11, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#2a4ab0"; ctx.lineWidth = 1.1;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 3.2, -9 + Math.abs(i) * 0.6); ctx.lineTo(i * 3.6, -1); ctx.stroke(); }
      for (const sg of [-1, 1]) for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.moveTo(sg * 7, 2 + j * 3); ctx.lineTo(sg * 10.5, 2 + j * 3); ctx.stroke(); }
      ctx.fillStyle = "#2a4ab0"; ctx.fillRect(-8.6, -3, 17.2, 2);
      if (!back) { ctx.fillStyle = "#ffd76a"; ctx.beginPath(); ctx.moveTo(-1.5, -3); ctx.lineTo(0, -8); ctx.lineTo(1.5, -3); ctx.fill(); ctx.fillStyle = "#c0203a"; ctx.beginPath(); ctx.arc(0, -7, 0.8, 0, TAU); ctx.fill(); }
      break;
    }
    case "witchhat": {
      ctx.fillStyle = "#2a1e36"; ctx.beginPath(); ctx.ellipse(0, -5, 14, 3.8, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#3a2a4a";
      ctx.beginPath(); ctx.moveTo(-7, -6); ctx.lineTo(-2, -18); ctx.quadraticCurveTo(2, -26, 10 + sway, -22); ctx.quadraticCurveTo(3, -20, 2, -16); ctx.lineTo(7, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#8a3aca"; ctx.fillRect(-6.6, -9, 13.2, 2.6);
      ctx.fillStyle = "#ffd76a"; ctx.fillRect(-1.5, -9.2, 3, 3); ctx.fillStyle = "#3a2a4a"; ctx.fillRect(-0.7, -8.4, 1.4, 1.4);
      break;
    }
    case "goggles": {
      ctx.fillStyle = "#5a3a1a"; ctx.fillRect(-8.6, -6, 17.2, 2.4);
      if (!back) for (const sg of [-1, 1]) {
        ctx.fillStyle = "#c9a24a"; ctx.beginPath(); ctx.arc(sg * 3.6, -5, 3.3, 0, TAU); ctx.fill(); ctx.stroke();
        const g = ctx.createRadialGradient(sg * 3.6 - 0.8, -5.8, 0.2, sg * 3.6, -5, 2.5); g.addColorStop(0, "#d6f6ff"); g.addColorStop(1, "#2a8ac0");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sg * 3.6, -5, 2.3, 0, TAU); ctx.fill();
      }
      break;
    }
    case "wingedhelm": {
      for (const sg of [-1, 1]) {
        ctx.fillStyle = "#ffffff";
        for (let f = 0; f < 3; f++) {
          ctx.beginPath(); ctx.moveTo(sg * 7, -3 - f * 1.2);
          ctx.quadraticCurveTo(sg * (12 + f * 2), -6 - f * 3, sg * (14 + f), -12 - f * 3 + Math.sin(t * 5) * 0.8);
          ctx.quadraticCurveTo(sg * (10 + f), -6 - f * 2, sg * 7, -5 - f * 1.2); ctx.fill(); ctx.stroke();
        }
      }
      const g = ctx.createLinearGradient(0, -10, 0, 0); g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#9aa6c0");
      ctx.fillStyle = g; dome(ctx, 8.8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffd76a"; ctx.fillRect(-8.8, -2.5, 17.6, 2);
      ctx.fillStyle = "#4aa3ff"; ctx.beginPath(); ctx.arc(0, -1.5, 1.2, 0, TAU); ctx.fill();
      break;
    }
    case "crystalcrown": {
      const cols = ["#2a8ac0", "#5ad0ff", "#d6f6ff", "#5ad0ff", "#2a8ac0"];
      glowAt(ctx, 0, -10, 12, "120,220,255", 0.3 + Math.sin(t * 3) * 0.12);
      for (let i = 0; i < 5; i++) {
        const cx = -6 + i * 3, h = i === 2 ? 11 : i % 2 ? 8 : 6;
        ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(cx - 1.8, -6); ctx.lineTo(cx, -6 - h); ctx.lineTo(cx + 1.8, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = "#c9ccd8"; ctx.fillRect(-8, -7, 16, 2.4); ctx.strokeRect(-8, -7, 16, 2.4);
      break;
    }
    case "skullhelm": {
      ctx.fillStyle = "#e8e2d0"; ctx.beginPath(); ctx.arc(0, -2, 9.4, Math.PI * 0.92, Math.PI * 2.08); ctx.lineTo(8, 1); ctx.lineTo(-8, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (!back) {
        ctx.fillStyle = "#1a1a24"; ctx.beginPath(); ctx.ellipse(-3.4, -4, 2.2, 2.6, 0, 0, TAU); ctx.ellipse(3.4, -4, 2.2, 2.6, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(255,60,80,${0.6 + Math.sin(t * 5) * 0.3})`; ctx.beginPath(); ctx.arc(-3.4, -3.8, 0.8, 0, TAU); ctx.arc(3.4, -3.8, 0.8, 0, TAU); ctx.fill();
        ctx.fillStyle = "#1a1a24"; ctx.beginPath(); ctx.moveTo(0, -2.2); ctx.lineTo(-1, -0.4); ctx.lineTo(1, -0.4); ctx.fill();
        ctx.fillStyle = "#e8e2d0"; for (let i = -3; i <= 3; i++) ctx.fillRect(i * 1.6 - 0.6, 0.6, 1.2, 1.6);
      } else { ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, 0); ctx.stroke(); }
      break;
    }
    case "voidmask": {
      for (const sg of [-1, 1]) { ctx.fillStyle = "#1a0a2a"; ctx.beginPath(); ctx.moveTo(sg * 4, -8); ctx.quadraticCurveTo(sg * 8, -14, sg * 6, -18); ctx.lineTo(sg * 2.5, -9); ctx.fill(); }
      const g = ctx.createLinearGradient(0, -10, 0, 4); g.addColorStop(0, "#3a1a6a"); g.addColorStop(1, "#12061f");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -1, 9.2, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(7, 5); ctx.lineTo(0, 7); ctx.lineTo(-7, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (!back) {
        const a = 0.7 + Math.sin(t * 4) * 0.3;
        ctx.fillStyle = `rgba(200,140,255,${a})`;
        ctx.beginPath(); ctx.moveTo(-6, -1); ctx.lineTo(-1.5, 0.5); ctx.lineTo(-5, 1.5); ctx.closePath(); ctx.moveTo(6, -1); ctx.lineTo(1.5, 0.5); ctx.lineTo(5, 1.5); ctx.closePath(); ctx.fill();
        glowAt(ctx, 0, 0.5, 8, "190,120,255", 0.3 * a);
      }
      // Wisps.
      for (let i = 0; i < 3; i++) { const ph = (t * 0.7 + i / 3) % 1; ctx.fillStyle = `rgba(176,107,255,${0.6 * (1 - ph)})`; ctx.beginPath(); ctx.arc(Math.sin(t * 2 + i * 2) * 5, -10 - ph * 12, 1.4 * (1 - ph) + 0.4, 0, TAU); ctx.fill(); }
      break;
    }
    case "halo": {
      const y = -15 + Math.sin(t * 2.5) * 1.2;
      glowAt(ctx, 0, y, 12, "255,215,106", 0.35);
      ctx.strokeStyle = "#ffe9a0"; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(0, y, 7.5, 2.4, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 0.8; ctx.stroke();
      break;
    }
    case "greathelm": {
      const g = ctx.createLinearGradient(-9, 0, 9, 0); g.addColorStop(0, "#8a90a4"); g.addColorStop(0.45, "#eef0f6"); g.addColorStop(1, "#7a8094");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-9, 5); ctx.lineTo(-9, -6); ctx.quadraticCurveTo(-9, -11, 0, -11); ctx.quadraticCurveTo(9, -11, 9, -6); ctx.lineTo(9, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (!back) {
        ctx.fillStyle = "#1a1a24"; ctx.fillRect(-7, -3, 14, 2.2);
        ctx.fillStyle = "#c0203a"; ctx.fillRect(-0.8, -10.5, 1.6, 15);
        ctx.fillStyle = "#1a1a24"; for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) ctx.fillRect(2 + i * 1.8, 1 + j * 1.8, 0.9, 0.9);
      }
      ctx.fillStyle = "#c0203a"; ctx.beginPath(); ctx.moveTo(0, -11); ctx.quadraticCurveTo(-6 - sway, -18, -10 - sway, -10); ctx.quadraticCurveTo(-4, -13, 0, -11); ctx.fill();
      break;
    }
    case "kabuto": {
      ctx.fillStyle = "#3a0a0a";
      for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sg * 6, -2); ctx.lineTo(sg * 13, 2); ctx.lineTo(sg * 12, 6); ctx.lineTo(sg * 6, 3); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      const g = ctx.createLinearGradient(0, -12, 0, 0); g.addColorStop(0, "#c0302a"); g.addColorStop(1, "#5a0a0a");
      ctx.fillStyle = g; dome(ctx, 9.2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 0.6; for (let i = -6; i <= 6; i += 3) { ctx.beginPath(); ctx.moveTo(i, -9); ctx.lineTo(i * 1.3, -1); ctx.stroke(); }
      ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.quadraticCurveTo(-7, -14, -10, -22); ctx.moveTo(0, -8); ctx.quadraticCurveTo(7, -14, 10, -22); ctx.stroke();
      ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.arc(0, -8, 1.8, 0, TAU); ctx.fill();
      break;
    }
    case "jester": {
      const tips = [[-12, -10, "#ff3a5a"], [0, -20, "#ffd24a"], [12, -10, "#3a8aff"]];
      for (const [tx, ty, c] of tips) {
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-6, -5); ctx.quadraticCurveTo(tx * 0.6, ty + Math.sin(t * 4 + tx) * 1.2, tx + sway * 0.3, ty + 6); ctx.lineTo(6, -5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.arc(tx + sway * 0.3, ty + 6 + Math.sin(t * 6 + tx) * 0.8, 1.8, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = "#2a2a3a"; ctx.fillRect(-8.5, -6, 17, 3);
      break;
    }
    case "catears": {
      for (const sg of [-1, 1]) {
        ctx.fillStyle = C.color; ctx.beginPath(); ctx.moveTo(sg * 3, -7.5); ctx.lineTo(sg * 8, -15 + Math.sin(t * 2 + sg) * 0.6); ctx.lineTo(sg * 8.4, -5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#ffb3c8"; ctx.beginPath(); ctx.moveTo(sg * 4.4, -7.5); ctx.lineTo(sg * 7.4, -12.6); ctx.lineTo(sg * 7.5, -6.5); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case "phoenixcrown": {
      glowAt(ctx, 0, -12, 14, "255,140,40", 0.35 + Math.sin(t * 4) * 0.1);
      for (let i = -2; i <= 2; i++) {
        const h = 9 + (2 - Math.abs(i)) * 3 + Math.sin(t * 7 + i) * 1.2;
        const g = ctx.createLinearGradient(0, -6 - h, 0, -6); g.addColorStop(0, "#fff3a0"); g.addColorStop(0.5, "#ff9a2a"); g.addColorStop(1, "#c0201a");
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(i * 3 - 2, -6); ctx.quadraticCurveTo(i * 4.2, -6 - h * 0.7, i * 4.5 + sway * 0.2, -6 - h); ctx.quadraticCurveTo(i * 3 + 1.5, -6 - h * 0.4, i * 3 + 2, -6); ctx.fill();
      }
      ctx.fillStyle = "#ffd24a"; ctx.fillRect(-8, -7, 16, 2.6); ctx.fillStyle = "#ff3a1a"; ctx.beginPath(); ctx.arc(0, -5.7, 1.2, 0, TAU); ctx.fill();
      break;
    }
    case "antlers": {
      ctx.strokeStyle = "#8a5a2a"; ctx.lineWidth = 1.6; ctx.lineCap = "round";
      for (const sg of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(sg * 4, -7); ctx.quadraticCurveTo(sg * 8, -12, sg * 9, -20);
        ctx.moveTo(sg * 6.6, -11.5); ctx.lineTo(sg * 12, -14); ctx.moveTo(sg * 8.2, -16); ctx.lineTo(sg * 5.5, -20); ctx.stroke();
        ctx.fillStyle = "#4aaa5a"; ctx.beginPath(); ctx.ellipse(sg * 12.4, -14.6, 2, 1.1, sg * 0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = "#ff8af0"; ctx.beginPath(); ctx.arc(sg * 9, -20.5, 1.3, 0, TAU); ctx.fill();
      }
      ctx.lineCap = "butt";
      break;
    }
    case "bonecrown": {
      ctx.fillStyle = "#e8e2d0";
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 2.4 - 1.2, -6); ctx.lineTo(i * 2.5, -11 - (i % 2 ? 0 : 3)); ctx.lineTo(i * 2.4 + 1.2, -6); ctx.fill(); }
      ctx.fillRect(-8, -7, 16, 2.4);
      if (!back) { ctx.fillStyle = "#e8e2d0"; ctx.beginPath(); ctx.arc(0, -9, 2.6, 0, TAU); ctx.fill(); ctx.fillStyle = "#1a1a24"; ctx.fillRect(-1.4, -9.6, 1, 1); ctx.fillRect(0.4, -9.6, 1, 1); }
      break;
    }
    case "bandana": {
      ctx.fillStyle = C.color; ctx.beginPath(); ctx.arc(0, -2, 8.4, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(8, -4); ctx.lineTo(-8, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; for (const [dx, dy] of [[-4, -7], [2, -8], [5, -5], [-1, -5]]) { ctx.beginPath(); ctx.arc(dx, dy, 0.7, 0, TAU); ctx.fill(); }
      ctx.fillStyle = C.color; ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-13 - sway * 0.5, -2); ctx.lineTo(-11, 1); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-12, 3 + sway * 0.4); ctx.lineTo(-9, 3); ctx.closePath(); ctx.fill();
      break;
    }
    case "dragonking": {
      for (const sg of [-1, 1]) {
        const hg = ctx.createLinearGradient(sg * 5, -6, sg * 16, -22); hg.addColorStop(0, "#5a3a0a"); hg.addColorStop(1, "#fff3a0");
        ctx.fillStyle = hg; ctx.beginPath(); ctx.moveTo(sg * 5, -6); ctx.bezierCurveTo(sg * 14, -7, sg * 18, -14, sg * 15, -24); ctx.bezierCurveTo(sg * 13, -15, sg * 10, -11, sg * 4, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      const g = ctx.createLinearGradient(0, -11, 0, 2); g.addColorStop(0, "#fff3a0"); g.addColorStop(1, "#a8862e");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -1, 9.2, Math.PI * 0.9, Math.PI * 2.1); ctx.lineTo(9, 3); ctx.lineTo(-9, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#c0201a"; ctx.beginPath(); ctx.arc(0, -6, 2.2, 0, TAU); ctx.fill();
      glowAt(ctx, 0, -6, 7, "255,80,60", 0.4 + Math.sin(t * 4) * 0.15);
      if (!back) { ctx.fillStyle = "#5a3a0a"; ctx.fillRect(-6, -3.6, 12, 1.6); }
      break;
    }
    case "wizardgold": {
      ctx.fillStyle = "#1a0a4a"; ctx.beginPath(); ctx.ellipse(0, -5, 13.5, 3.8, 0, 0, TAU); ctx.fill(); ctx.stroke();
      const g = ctx.createLinearGradient(0, -28, 0, -6); g.addColorStop(0, "#4a2aaa"); g.addColorStop(1, "#1a0a4a");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-7, -6); ctx.quadraticCurveTo(-1, -18, 6 + sway, -29); ctx.quadraticCurveTo(3, -15, 7, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffd24a"; ctx.fillRect(-7, -8.5, 14, 2.4);
      for (let i = 0; i < 4; i++) { const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + i)); ctx.fillStyle = `rgba(255,240,160,${a})`; star(ctx, -2 + i * 2, -12 - i * 4, 1.4, 0.5); ctx.fill(); }
      break;
    }
    case "crown": case "dhcrown": {
      const dh = id === "dhcrown";
      if (dh) {
        glowAt(ctx, 0, -9, 16, "255,80,100", 0.25 + Math.sin(t * 3) * 0.1);
        for (const sg of [-1, 1]) {
          ctx.fillStyle = "#c0203a";
          ctx.beginPath(); ctx.moveTo(sg * 7, -7); ctx.quadraticCurveTo(sg * 13, -16 + Math.sin(t * 5) * 1.5, sg * 16, -10 + Math.sin(t * 5) * 1.5); ctx.quadraticCurveTo(sg * 12, -11, sg * 13, -6); ctx.quadraticCurveTo(sg * 10, -8, sg * 7, -5); ctx.fill(); ctx.stroke();
        }
      }
      const g = ctx.createLinearGradient(0, -16, 0, -5); g.addColorStop(0, "#fff3b0"); g.addColorStop(1, "#c9922a");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-8, -5); ctx.lineTo(-8.5, -13); ctx.lineTo(-4.5, -9); ctx.lineTo(0, -16); ctx.lineTo(4.5, -9); ctx.lineTo(8.5, -13); ctx.lineTo(8, -5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#4aa3ff"; ctx.beginPath(); ctx.arc(-5, -7, 1, 0, TAU); ctx.arc(5, -7, 1, 0, TAU); ctx.fill();
      if (dh) {
        ctx.fillStyle = "#ff2a4a";
        ctx.beginPath(); ctx.arc(-1.3, -9, 1.6, 0, TAU); ctx.arc(1.3, -9, 1.6, 0, TAU); ctx.moveTo(-2.8, -8.5); ctx.lineTo(0, -5.5); ctx.lineTo(2.8, -8.5); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.beginPath(); ctx.arc(-1.6, -9.6, 0.5, 0, TAU); ctx.fill();
      } else { ctx.fillStyle = "#ff3a5a"; ctx.beginPath(); ctx.arc(0, -8, 1.4, 0, TAU); ctx.fill(); }
      break;
    }
  }
  ctx.restore();
}

/**
 * Fills a cape path already built on ctx with the cosmetic's look.
 * (x0, y0)–(x1, y1) is the cape's bounding box.
 */
export function fillCape(ctx, id, x0, y0, x1, y1, t) {
  const C = COSMETICS[id];
  if (!C) return;
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  if (C.pattern === "rainbow") {
    const hue = (t * 60) % 360;
    const lg = ctx.createLinearGradient(x0, 0, x1, 0);
    for (let i = 0; i <= 5; i++) lg.addColorStop(i / 5, `hsl(${(hue + i * 60) % 360},85%,60%)`);
    ctx.fillStyle = lg;
  } else if (C.pattern === "flame") {
    g.addColorStop(0, C.color); g.addColorStop(0.7, "#ff6a1a"); g.addColorStop(1, "#ffd76a");
    ctx.fillStyle = g;
  } else {
    g.addColorStop(0, shade(C.color, 0.15)); g.addColorStop(1, shade(C.color, -0.3));
    ctx.fillStyle = g;
  }
  ctx.fill(); ctx.stroke();
  ctx.save();
  ctx.clip();
  if (C.pattern === "snow") {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 6; i++) { const px = x0 + ((i * 37) % 17) / 17 * (x1 - x0), py = y0 + ((i * 53 + t * 6) % (y1 - y0 + 4)); ctx.beginPath(); ctx.arc(px, py, 0.9, 0, TAU); ctx.fill(); }
  } else if (C.pattern === "flame") {
    for (let i = 0; i < 4; i++) { const px = x0 + (i + 0.5) / 4 * (x1 - x0), h = 4 + Math.sin(t * 10 + i * 2) * 2; ctx.fillStyle = "rgba(255,240,140,0.8)"; ctx.beginPath(); ctx.moveTo(px - 2, y1); ctx.lineTo(px, y1 - h); ctx.lineTo(px + 2, y1); ctx.fill(); }
  } else if (C.pattern === "stars") {
    for (let i = 0; i < 7; i++) {
      const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i * 1.3));
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(x0 + ((i * 41) % 19) / 19 * (x1 - x0), y0 + ((i * 29) % 13) / 13 * (y1 - y0), 0.9, 0.9);
    }
  } else if (C.pattern === "cross") {
    ctx.fillStyle = "#c0203a"; const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    ctx.fillRect(mx - 1.4, y0 + 2, 2.8, y1 - y0 - 5); ctx.fillRect(x0 + 3, my - 2.5, x1 - x0 - 6, 2.8);
  } else if (C.pattern === "aurora") {
    for (let i = 0; i < 3; i++) {
      const g2 = ctx.createLinearGradient(x0, 0, x1, 0);
      const hue = (t * 40 + i * 70) % 360;
      g2.addColorStop(0, `hsla(${hue},90%,60%,0)`); g2.addColorStop(0.5, `hsla(${(hue + 60) % 360},90%,65%,0.55)`); g2.addColorStop(1, `hsla(${hue},90%,60%,0)`);
      ctx.fillStyle = g2; ctx.beginPath();
      const yy = y0 + 4 + i * 5;
      ctx.moveTo(x0, yy); for (let k = 0; k <= 6; k++) ctx.lineTo(x0 + (x1 - x0) * k / 6, yy + Math.sin(t * 2 + k + i) * 1.6); ctx.lineTo(x1, yy + 4); ctx.lineTo(x0, yy + 4); ctx.fill();
    }
  } else if (C.pattern === "lava") {
    ctx.strokeStyle = `rgba(255,${120 + Math.sin(t * 4) * 40},40,0.9)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0 + 3, y0 + 3); ctx.lineTo(x0 + 7, y0 + 9); ctx.lineTo(x0 + 5, y1 - 4); ctx.moveTo(x1 - 4, y0 + 4); ctx.lineTo(x1 - 8, y0 + 10); ctx.lineTo(x1 - 5, y1 - 3); ctx.moveTo(x0 + 7, y0 + 9); ctx.lineTo(x1 - 8, y0 + 10); ctx.stroke();
  } else if (C.pattern === "moon") {
    ctx.fillStyle = "rgba(255,90,110,0.85)"; ctx.beginPath(); ctx.arc((x0 + x1) / 2, (y0 + y1) / 2 + 1, 2.6, 0, TAU); ctx.fill();
    ctx.fillStyle = shade(C.color, -0.1); ctx.beginPath(); ctx.arc((x0 + x1) / 2 + 1.2, (y0 + y1) / 2 + 0.2, 2.2, 0, TAU); ctx.fill();
  }
  if (C.ermine) {
    ctx.fillStyle = "#f8f4ec"; ctx.fillRect(x0, y0, x1 - x0, 3.2);
    ctx.fillStyle = "#1a1a24"; for (let i = 0; i < 4; i++) ctx.fillRect(x0 + 2 + i * (x1 - x0 - 4) / 3, y0 + 1, 0.9, 1.4);
  }
  // Trim along the hem.
  ctx.fillStyle = C.trim || "#c9a24a"; ctx.fillRect(x0 - 2, y1 - 1.6, x1 - x0 + 4, 2.2);
  ctx.restore();
}

/** Wings, drawn behind the body. (x, y) is between the shoulder blades. */
export function drawWings(ctx, id, x, y, t, moving) {
  const C = COSMETICS[id];
  if (!C || !C.wings) return;
  const flap = Math.sin(t * (moving ? 9 : 3.5)) * (moving ? 0.35 : 0.18);
  for (const sg of [-1, 1]) {
    ctx.save();
    ctx.translate(x + sg * 3, y);
    ctx.scale(sg, 1);
    ctx.rotate(-0.25 - flap);
    ctx.strokeStyle = "rgba(10,10,20,0.55)"; ctx.lineWidth = 1;
    if (C.wings === "fairy") {
      ctx.globalAlpha = 0.75;
      const g = ctx.createLinearGradient(0, -14, 20, 6); g.addColorStop(0, C.color); g.addColorStop(1, C.trim);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, -1); ctx.bezierCurveTo(6, -22, 24, -20, 20, -6); ctx.bezierCurveTo(18, -1, 8, 0, 0, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 1); ctx.bezierCurveTo(10, 4, 18, 12, 10, 14); ctx.bezierCurveTo(5, 15, 2, 8, 0, 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(14, -12); ctx.moveTo(0, 1); ctx.lineTo(10, 10); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.sin(t * 6) * 0.4})`; ctx.beginPath(); ctx.arc(16, -10, 1.2, 0, TAU); ctx.fill();
    } else if (C.wings === "angel") {
      if (C.fire) for (let i = 0; i < 3; i++) { const ph = (t * 1.2 + i / 3) % 1; ctx.fillStyle = `rgba(255,${150 + i * 30},40,${0.8 * (1 - ph)})`; ctx.beginPath(); ctx.arc(10 + i * 6, -10 + i * 4 - ph * 14, 2.4 * (1 - ph) + 0.6, 0, TAU); ctx.fill(); }
      for (let f = 0; f < 4; f++) {
        ctx.fillStyle = C.fire ? (f % 2 ? "#ffb347" : "#ff6a2a") : f % 2 ? "#ffffff" : "#f0f2ff";
        ctx.beginPath(); ctx.moveTo(0, f * 2);
        ctx.quadraticCurveTo(12 + f * 3, -10 + f * 3, 24 - f * 2, -14 + f * 7);
        ctx.quadraticCurveTo(12, -2 + f * 4, 0, 4 + f * 2); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,215,106,0.6)"; ctx.fillRect(2, -1, 10, 1);
    } else {
      // Dragon and bat: bones with a membrane between them.
      const mem = C.wings === "dragon" ? C.color : "#2a1a2a";
      const bone = C.wings === "dragon" ? shade(C.color, -0.55) : "#1a0a1a";
      const tip = [[26, -18], [24, -6], [18, 4], [10, 8]];
      ctx.fillStyle = mem;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14, -16);
      for (let i = 0; i < tip.length; i++) {
        const [tx, ty] = tip[i];
        ctx.lineTo(tx, ty);
        if (i < tip.length - 1) ctx.quadraticCurveTo((tx + tip[i + 1][0]) / 2 - 3, (ty + tip[i + 1][1]) / 2 - 1, tip[i + 1][0], tip[i + 1][1]);
      }
      ctx.lineTo(0, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = bone; ctx.lineWidth = 1.6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14, -16); ctx.lineTo(26, -18);
      for (const [tx, ty] of tip.slice(1)) { ctx.moveTo(14, -16); ctx.lineTo(tx, ty); }
      ctx.stroke();
      if (C.wings === "dragon") { ctx.fillStyle = "#ffd76a"; ctx.beginPath(); ctx.moveTo(14, -16); ctx.lineTo(13, -21); ctx.lineTo(16, -17); ctx.fill(); }
    }
    ctx.restore();
  }
}

/** An aura around the feet of (x, y). Drawn behind the hero. */
export function drawAura(ctx, id, x, y, t) {
  switch (id) {
    case "aurahearts":
      for (let i = 0; i < 5; i++) {
        const ph = (t * 0.45 + i / 5) % 1, a = Math.sin(ph * Math.PI);
        const hx = x + Math.sin(i * 2.3 + t) * 16, hy = y - 6 - ph * 44;
        ctx.fillStyle = `rgba(255,110,160,${a * 0.9})`;
        ctx.beginPath(); ctx.arc(hx - 1.6, hy, 2, 0, TAU); ctx.arc(hx + 1.6, hy, 2, 0, TAU); ctx.moveTo(hx - 3.6, hy + 0.5); ctx.lineTo(hx, hy + 4.5); ctx.lineTo(hx + 3.6, hy + 0.5); ctx.fill();
      }
      break;
    case "auraflame": {
      glowAt(ctx, x, y - 4, 26, "255,120,40", 0.35);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU + t * 0.8, fx = x + Math.cos(a) * 14, fy = y + Math.sin(a) * 5;
        const h = 7 + Math.sin(t * 11 + i * 2) * 3;
        const g = ctx.createLinearGradient(0, fy - h, 0, fy); g.addColorStop(0, "rgba(255,230,120,0)"); g.addColorStop(1, "rgba(255,100,30,0.85)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(fx - 2.5, fy); ctx.quadraticCurveTo(fx, fy - h * 1.2, fx + 2.5, fy); ctx.fill();
      }
      for (let i = 0; i < 4; i++) { const ph = (t * 0.8 + i / 4) % 1; ctx.fillStyle = `rgba(255,180,60,${1 - ph})`; ctx.fillRect(x + Math.sin(i * 3 + t * 2) * 12, y - 8 - ph * 36, 1.6, 1.6); }
      break;
    }
    case "aurafrost": {
      ctx.strokeStyle = `rgba(160,230,255,${0.5 + Math.sin(t * 3) * 0.2})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(x, y, 17, 6, 0, 0, TAU); ctx.stroke();
      glowAt(ctx, x, y - 6, 24, "160,230,255", 0.25);
      for (let i = 0; i < 6; i++) {
        const a = t * 1.2 + i / 6 * TAU, sx = x + Math.cos(a) * 16, sy = y - 14 + Math.sin(a) * 6 + Math.sin(t * 2 + i) * 4;
        ctx.strokeStyle = "rgba(230,250,255,0.9)"; ctx.lineWidth = 0.9;
        ctx.beginPath(); for (let k = 0; k < 3; k++) { const b = k * Math.PI / 3 + t; ctx.moveTo(sx - Math.cos(b) * 2.4, sy - Math.sin(b) * 2.4); ctx.lineTo(sx + Math.cos(b) * 2.4, sy + Math.sin(b) * 2.4); } ctx.stroke();
      }
      break;
    }
    case "aurastorm": {
      glowAt(ctx, x, y - 14, 26, "255,239,106", 0.2 + Math.random() * 0.1);
      ctx.strokeStyle = "rgba(255,247,160,0.95)"; ctx.lineWidth = 1.2;
      for (let i = 0; i < 2; i++) {
        if (Math.random() < 0.45) continue;
        const a = Math.random() * TAU; let px = x + Math.cos(a) * 14, py = y - 14 + Math.sin(a) * 14;
        ctx.beginPath(); ctx.moveTo(px, py);
        for (let k = 0; k < 3; k++) { px += (Math.random() - 0.5) * 9; py += (Math.random() - 0.5) * 9; ctx.lineTo(px, py); }
        ctx.stroke();
      }
      break;
    }
    case "aurasparkle":
      for (let i = 0; i < 6; i++) {
        const a = t * 1.5 + i / 6 * TAU, sx = x + Math.cos(a) * 18, sy = y - 16 + Math.sin(a * 1.3) * 14;
        const s = 1.5 + 2 * Math.abs(Math.sin(t * 4 + i));
        ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.95)" : "rgba(255,230,140,0.95)";
        ctx.beginPath(); ctx.moveTo(sx, sy - s); ctx.lineTo(sx + s * 0.3, sy); ctx.lineTo(sx, sy + s); ctx.lineTo(sx - s * 0.3, sy); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(sx - s, sy); ctx.lineTo(sx, sy + s * 0.3); ctx.lineTo(sx + s, sy); ctx.lineTo(sx, sy - s * 0.3); ctx.closePath(); ctx.fill();
      }
      break;
    case "auravoid": {
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(176,107,255,${0.55 - i * 0.15})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, y, 12 + i * 5, 4 + i * 1.8, 0, t * (2 - i * 0.5), t * (2 - i * 0.5) + Math.PI * 1.3); ctx.stroke();
      }
      for (let i = 0; i < 5; i++) { const ph = (t * 0.5 + i / 5) % 1; ctx.fillStyle = `rgba(40,10,70,${0.8 * (1 - ph)})`; ctx.beginPath(); ctx.arc(x + Math.sin(i * 2 + t) * 14, y - ph * 40, 2.4 * (1 - ph) + 0.6, 0, TAU); ctx.fill(); }
      break;
    }
    case "aurabubbles":
      for (let i = 0; i < 7; i++) {
        const ph = (t * 0.5 + i / 7) % 1, bx = x + Math.sin(i * 2.7 + t * 1.3) * 16, by = y - 4 - ph * 46;
        ctx.strokeStyle = `rgba(200,240,255,${0.9 * (1 - ph)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bx, by, 1.5 + (i % 3) * 1.1, 0, TAU); ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - ph)})`; ctx.beginPath(); ctx.arc(bx - 0.6, by - 0.6, 0.5, 0, TAU); ctx.fill();
      }
      break;
    case "auraleaves":
      for (let i = 0; i < 6; i++) {
        const ph = (t * 0.35 + i / 6) % 1, a = t * 1.5 + i * 1.05;
        const lx = x + Math.cos(a) * (12 + ph * 6), ly = y - 44 + ph * 46;
        ctx.save(); ctx.translate(lx, ly); ctx.rotate(t * 3 + i);
        ctx.fillStyle = `rgba(${i % 2 ? "138,203,74" : "230,160,40"},${Math.sin(ph * Math.PI)})`; ctx.beginPath(); ctx.ellipse(0, 0, 3, 1.5, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      break;
    case "auranotes":
      ctx.font = "9px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let i = 0; i < 4; i++) {
        const ph = (t * 0.45 + i / 4) % 1;
        ctx.fillStyle = `rgba(${["255,138,240", "124,240,255", "255,215,106", "160,255,160"][i]},${Math.sin(ph * Math.PI)})`;
        ctx.fillText(i % 2 ? "♪" : "♫", x + Math.sin(i * 2 + t * 2) * 14, y - 10 - ph * 40);
      }
      break;
    case "auraaurora":
      for (let i = 0; i < 3; i++) {
        const hue = (t * 50 + i * 80) % 360;
        ctx.strokeStyle = `hsla(${hue},90%,65%,0.45)`; ctx.lineWidth = 3;
        ctx.beginPath(); for (let k = 0; k <= 10; k++) { const a = k / 10 * TAU + t * (0.8 + i * 0.3); ctx.lineTo(x + Math.cos(a) * (14 + i * 3), y - 16 - i * 8 + Math.sin(a) * 5 + Math.sin(t * 3 + k) * 2); } ctx.stroke();
      }
      break;
    case "aurasouls":
      for (let i = 0; i < 4; i++) {
        const a = t * 1.1 + i * TAU / 4, sx = x + Math.cos(a) * 16, sy = y - 18 + Math.sin(a) * 8 + Math.sin(t * 3 + i) * 3;
        ctx.fillStyle = "rgba(200,216,255,0.75)"; ctx.beginPath(); ctx.arc(sx, sy, 3, Math.PI, 0); ctx.lineTo(sx + 3, sy + 3); ctx.lineTo(sx + 1, sy + 2); ctx.lineTo(sx - 1, sy + 3.5); ctx.lineTo(sx - 3, sy + 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#1a1a2a"; ctx.fillRect(sx - 1.4, sy - 1, 0.9, 1.2); ctx.fillRect(sx + 0.5, sy - 1, 0.9, 1.2);
      }
      break;
    case "auragold": {
      const g = ctx.createLinearGradient(0, y - 60, 0, y);
      g.addColorStop(0, "rgba(255,215,106,0)"); g.addColorStop(1, `rgba(255,215,106,${0.3 + Math.sin(t * 2) * 0.08})`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - 24, 18, 36, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(255,230,140,0.7)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, y, 18, 6, 0, 0, TAU); ctx.stroke();
      for (let i = 0; i < 6; i++) { const ph = (t * 0.6 + i / 6) % 1; ctx.fillStyle = `rgba(255,240,170,${1 - ph})`; ctx.beginPath(); ctx.arc(x + Math.cos(i * 1.7) * 14, y - ph * 50, 1.3, 0, TAU); ctx.fill(); }
      break;
    }
  }
}

/** A pet. p = { x, y, ang, moving, walk }. */
export function drawPet(ctx, id, p, t) {
  const C = COSMETICS[id];
  if (!C) return;
  const flying = ["petowl", "petghost", "petdragon", "petbat", "petphoenix", "petfairy", "petkraken", "petpigeon"].includes(id);
  const face = Math.cos(p.ang) >= 0 ? 1 : -1;
  const bob = flying ? Math.sin(t * 4) * 2.5 : p.moving ? Math.abs(Math.sin(p.walk * 2.5)) * 2.5 : 0;
  const fy = flying ? -18 : 0;
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, flying ? 6 : 8, flying ? 2 : 3, 0, 0, TAU); ctx.fill();
  ctx.save();
  ctx.translate(p.x, p.y + fy - bob);
  ctx.scale(face, 1);
  ctx.strokeStyle = "rgba(10,10,20,0.55)"; ctx.lineWidth = 1;
  const eye = (ex, ey, r = 1.2) => { ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(ex, ey, r, 0, TAU); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex + 0.4, ey - 0.4, r * 0.4, 0, TAU); ctx.fill(); };
  switch (id) {
    case "petslime": {
      const sq = 1 + Math.sin(t * 6) * 0.08;
      const g = ctx.createRadialGradient(-2, -8, 1, 0, -5, 10); g.addColorStop(0, "#b6ffb6"); g.addColorStop(1, "#2f9a3a");
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -5 * sq, 8 / sq, 6 * sq, 0, Math.PI, TAU); ctx.lineTo(8 / sq, 0); ctx.lineTo(-8 / sq, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      eye(1, -6); eye(4.5, -6);
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.ellipse(-3, -8, 2, 1.2, -0.5, 0, TAU); ctx.fill();
      break;
    }
    case "petowl": {
      const w = Math.sin(t * 12) * 3;
      ctx.fillStyle = "#7a5a3a";
      ctx.beginPath(); ctx.ellipse(-6, -2 - w, 3, 6, -0.6, 0, TAU); ctx.ellipse(6, -2 - w, 3, 6, 0.6, 0, TAU); ctx.fill();
      ctx.fillStyle = "#a07a4a"; ctx.beginPath(); ctx.ellipse(0, -2, 6, 7, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#e8d8b8"; ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#a07a4a"; ctx.beginPath(); ctx.moveTo(-5, -7); ctx.lineTo(-4, -11); ctx.lineTo(-2, -8); ctx.moveTo(5, -7); ctx.lineTo(4, -11); ctx.lineTo(2, -8); ctx.fill();
      ctx.fillStyle = "#ffe9a0"; ctx.beginPath(); ctx.arc(-2.3, -5, 2.2, 0, TAU); ctx.arc(2.3, -5, 2.2, 0, TAU); ctx.fill();
      eye(-2.3, -5, 1.1); eye(2.3, -5, 1.1);
      ctx.fillStyle = "#ff9a3a"; ctx.beginPath(); ctx.moveTo(-0.8, -3.5); ctx.lineTo(0.8, -3.5); ctx.lineTo(0, -1.8); ctx.fill();
      break;
    }
    case "petghost": {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#eef4ff";
      ctx.beginPath(); ctx.arc(0, -4, 6.5, Math.PI, TAU); ctx.lineTo(6.5, 4);
      for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(5 - i * 3.3, 7 + Math.sin(t * 8 + i) * 1.5, 3.2 - i * 3.3, 4);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#1a1a2a"; ctx.beginPath(); ctx.ellipse(-1, -4, 1.2, 1.8, 0, 0, TAU); ctx.ellipse(2.8, -4, 1.2, 1.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ff9ac0"; ctx.beginPath(); ctx.arc(-2.6, -1.5, 1, 0, TAU); ctx.arc(4.4, -1.5, 1, 0, TAU); ctx.fill();
      break;
    }
    case "petdragon": case "petphoenix": {
      const ph = id === "petphoenix";
      const body = ph ? "#ff7a2a" : C.color, belly = ph ? "#ffd76a" : "#ffb38a", wing = ph ? "#ffb347" : "#8a1a2a";
      if (ph) {
        glowAt(ctx, 0, -2, 16, "255,140,40", 0.35);
        for (let i = 0; i < 4; i++) { const tp = (t * 1.5 + i / 4) % 1; ctx.fillStyle = `rgba(255,${160 + i * 20},60,${1 - tp})`; ctx.beginPath(); ctx.arc(-7 - tp * 14, 2 + Math.sin(t * 5 + i) * 2, 2.4 * (1 - tp) + 0.5, 0, TAU); ctx.fill(); }
      }
      const w = Math.sin(t * 10) * 4;
      ctx.fillStyle = wing;
      ctx.beginPath(); ctx.moveTo(-1, -4); ctx.quadraticCurveTo(-6, -12 - w, -11, -9 - w); ctx.quadraticCurveTo(-7, -6, -2, -1); ctx.fill(); ctx.stroke();
      // Tail.
      ctx.strokeStyle = body; ctx.lineWidth = 2.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-4, 1); ctx.quadraticCurveTo(-9, 3, -10, -1 + Math.sin(t * 4) * 1.5); ctx.stroke();
      ctx.strokeStyle = "rgba(10,10,20,0.55)"; ctx.lineWidth = 1;
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(-1, -1, 5.5, 4.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(0, 0.5, 3, 2.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(4.5, -6, 4.2, 3.6, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = ph ? "#ffd76a" : "#ffd76a";
      ctx.beginPath(); ctx.moveTo(2.5, -9); ctx.lineTo(1.5, -13); ctx.lineTo(4, -9.4); ctx.moveTo(4.5, -9.5); ctx.lineTo(4.5, -13.5); ctx.lineTo(6, -9.2); ctx.fill();
      eye(5.6, -6.5, 1.1);
      ctx.fillStyle = shade(body, -0.3); ctx.beginPath(); ctx.arc(8.3, -5.4, 0.6, 0, TAU); ctx.fill();
      // A puff of smoke now and then.
      if (!ph && (t % 3) < 0.6) { const k = (t % 3) / 0.6; ctx.fillStyle = `rgba(200,200,210,${0.6 * (1 - k)})`; ctx.beginPath(); ctx.arc(10 + k * 6, -6 - k * 3, 1.5 + k * 2.5, 0, TAU); ctx.fill(); }
      ctx.fillStyle = wing;
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.quadraticCurveTo(2, -13 - w, 7 - w * 0.3, -14 - w); ctx.quadraticCurveTo(3, -7, 2, -1); ctx.fill(); ctx.stroke();
      break;
    }
    case "petcrab": {
      const step = p.moving ? Math.sin(p.walk * 4) * 1.5 : 0;
      ctx.strokeStyle = "#c03a2a"; ctx.lineWidth = 1.2;
      for (let i = -1; i <= 1; i++) for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sg * 4, -3 + i * 1.5); ctx.lineTo(sg * 8, -1 + i * 1.5 + (i ? step : -step)); ctx.lineTo(sg * 9, 1 + i * 1.5); ctx.stroke(); }
      ctx.strokeStyle = "rgba(10,10,20,0.55)"; ctx.lineWidth = 1;
      ctx.fillStyle = C.color; ctx.beginPath(); ctx.ellipse(0, -4, 6.5, 4.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
      for (const sg of [-1, 1]) { ctx.beginPath(); ctx.arc(sg * 8, -8 + Math.sin(t * 5 + sg) * 1, 2.6, 0, TAU); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-2, -9, 1.6, 0, TAU); ctx.arc(2, -9, 1.6, 0, TAU); ctx.fill();
      eye(-2, -9, 0.9); eye(2, -9, 0.9);
      break;
    }
    case "petbat": {
      const w = Math.sin(t * 16) * 5;
      ctx.fillStyle = "#3a1a3a";
      for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, -3); ctx.quadraticCurveTo(sg * 6, -9 - w, sg * 11, -5 - w); ctx.quadraticCurveTo(sg * 8, -3, sg * 9, 0); ctx.quadraticCurveTo(sg * 5, -1, 0, 0); ctx.fill(); }
      ctx.fillStyle = "#4a2a4a"; ctx.beginPath(); ctx.arc(0, -3, 4.2, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(-2.5, -9.5); ctx.lineTo(-1, -6.5); ctx.moveTo(3, -6); ctx.lineTo(2.5, -9.5); ctx.lineTo(1, -6.5); ctx.fill();
      ctx.fillStyle = "#ff5470"; ctx.beginPath(); ctx.arc(-1.4, -3.5, 0.9, 0, TAU); ctx.arc(1.4, -3.5, 0.9, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillRect(-1, -1.6, 0.7, 1.2); ctx.fillRect(0.4, -1.6, 0.7, 1.2);
      break;
    }
    case "petrobot": {
      const step = p.moving ? Math.sin(p.walk * 3) * 1.5 : 0;
      ctx.fillStyle = "#6a5a3a"; ctx.fillRect(-4.5, -3 + step, 3, 3 - step); ctx.fillRect(1.5, -3 - step, 3, 3 + step);
      const g = ctx.createLinearGradient(0, -14, 0, -2); g.addColorStop(0, "#ffe9a0"); g.addColorStop(1, "#a07a2a");
      ctx.fillStyle = g; ctx.fillRect(-6, -13, 12, 10); ctx.strokeRect(-6, -13, 12, 10);
      ctx.fillStyle = "#2a1a0a"; ctx.fillRect(-4, -11, 8, 4);
      const blink = (t % 3) < 0.15 ? 0.3 : 1;
      ctx.fillStyle = `rgba(124,240,255,${blink})`; ctx.fillRect(-3, -10, 2, 2); ctx.fillRect(1, -10, 2, 2);
      ctx.strokeStyle = "#a07a2a"; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(0, -17); ctx.stroke();
      ctx.fillStyle = (t % 1) < 0.5 ? "#ff5470" : "#ffd76a"; ctx.beginPath(); ctx.arc(0, -17.5, 1.3, 0, TAU); ctx.fill();
      break;
    }
    case "petwolf": {
      const step = p.moving ? Math.sin(p.walk * 3) * 1.6 : 0;
      ctx.strokeStyle = C.color; ctx.lineWidth = 3.2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-6, -6); ctx.quadraticCurveTo(-11, -7, -11, -11 + Math.sin(t * 5) * 1.2); ctx.stroke();
      ctx.strokeStyle = "rgba(10,10,20,0.55)"; ctx.lineWidth = 1;
      ctx.fillStyle = shade(C.color, -0.25); ctx.fillRect(-5, -3 + step, 2.4, 3 - step); ctx.fillRect(3, -3 - step, 2.4, 3 + step);
      ctx.fillStyle = C.color; ctx.beginPath(); ctx.ellipse(-0.5, -6, 6.8, 4, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(6, -10, 4.2, 3.6, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3.6, -12); ctx.lineTo(4, -16.4); ctx.lineTo(6, -12.8); ctx.moveTo(6.6, -12.8); ctx.lineTo(8.4, -16.4); ctx.lineTo(8.8, -12); ctx.fill();
      ctx.fillStyle = "#e8ecf4"; ctx.beginPath(); ctx.ellipse(9, -9, 2.4, 1.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#1a1a1a"; ctx.beginPath(); ctx.arc(11, -9.4, 0.8, 0, TAU); ctx.fill();
      eye(7, -11, 0.9);
      break;
    }
    case "petpenguin": {
      const wob = p.moving ? Math.sin(p.walk * 4) * 0.18 : 0;
      ctx.rotate(wob);
      ctx.fillStyle = "#1a1a24"; ctx.beginPath(); ctx.ellipse(0, -7, 5.4, 7.4, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#f4f4f6"; ctx.beginPath(); ctx.ellipse(1, -6, 3.6, 5.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ffb347"; ctx.beginPath(); ctx.moveTo(3, -10.5); ctx.lineTo(7, -9.6); ctx.lineTo(3, -8.6); ctx.fill();
      ctx.fillRect(-3, -0.6, 2.6, 1.4); ctx.fillRect(1, -0.6, 2.6, 1.4);
      eye(2.2, -11.4, 0.9);
      break;
    }
    case "petfairy": {
      glowAt(ctx, 0, -2, 12, "255,138,240", 0.45 + Math.sin(t * 5) * 0.15);
      const w = Math.sin(t * 22) * 0.6 + 0.6;
      ctx.fillStyle = "rgba(200,255,250,0.7)";
      for (const sg of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sg * 3.5, -4, 3.4 * w + 0.6, 4.4, sg * 0.5, 0, TAU); ctx.fill(); }
      ctx.fillStyle = "#ffd0f0"; ctx.beginPath(); ctx.ellipse(0, -2, 1.8, 3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#f1c9a5"; ctx.beginPath(); ctx.arc(0, -6, 2, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ff8af0"; ctx.beginPath(); ctx.arc(0, -7, 2.1, Math.PI, 0); ctx.fill();
      for (let i = 0; i < 3; i++) { const ph = (t * 1.6 + i / 3) % 1; ctx.fillStyle = `rgba(255,240,160,${1 - ph})`; ctx.fillRect(-4 - ph * 10 + i * 2, 2 + i * 2 + ph * 4, 1.2, 1.2); }
      break;
    }
    case "petgolem": {
      const step = p.moving ? Math.sin(p.walk * 3) * 1.2 : 0;
      ctx.fillStyle = "#6a6a72"; ctx.fillRect(-5, -3 + step, 3.4, 3 - step); ctx.fillRect(2, -3 - step, 3.4, 3 + step);
      ctx.fillStyle = C.color; ctx.beginPath(); ctx.moveTo(-7, -3); ctx.lineTo(-6, -12); ctx.lineTo(2, -14); ctx.lineTo(7, -9); ctx.lineTo(6, -3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#4aaa5a"; ctx.beginPath(); ctx.ellipse(-2, -13.4, 3, 1.4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(124,240,255,${0.7 + Math.sin(t * 4) * 0.3})`; ctx.fillRect(1, -10, 1.6, 1.6); ctx.fillRect(4, -9.6, 1.6, 1.6);
      break;
    }
    case "petkraken": {
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = shade(C.color, -0.1); ctx.lineWidth = 1.8; ctx.lineCap = "round";
        const bx = -4 + i * 2; ctx.beginPath(); ctx.moveTo(bx, -2); ctx.quadraticCurveTo(bx + Math.sin(t * 4 + i) * 3, 3, bx + Math.sin(t * 4 + i + 1) * 2, 6); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(10,10,20,0.55)"; ctx.lineWidth = 1;
      ctx.fillStyle = C.color; ctx.beginPath(); ctx.ellipse(0, -6, 6, 6.6, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-2, -6, 1.8, 0, TAU); ctx.arc(2.4, -6, 1.8, 0, TAU); ctx.fill();
      eye(-1.8, -6, 0.9); eye(2.6, -6, 0.9);
      ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.beginPath(); ctx.ellipse(-2.5, -10, 2, 1, -0.4, 0, TAU); ctx.fill();
      break;
    }
    case "petpigeon": {
      const w = Math.sin(t * 14) * 3;
      ctx.fillStyle = "#7a8094"; ctx.beginPath(); ctx.ellipse(-2, -3 - w, 5, 2.4, -0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = C.color; ctx.beginPath(); ctx.ellipse(0, -2, 6, 4, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#5a8a7a"; ctx.beginPath(); ctx.arc(5, -5, 3, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffb347"; ctx.beginPath(); ctx.moveTo(7.6, -5.4); ctx.lineTo(10, -4.6); ctx.lineTo(7.6, -4); ctx.fill();
      ctx.fillStyle = "#f4ecd8"; ctx.fillRect(-4, -1, 5, 3.4); ctx.fillStyle = "#c0203a"; ctx.fillRect(-2, 0.2, 1.2, 1.2);
      eye(5.8, -5.6, 0.8);
      break;
    }
    case "petunicorn": {
      const step = p.moving ? Math.sin(p.walk * 3) * 1.6 : 0;
      ctx.fillStyle = "#e8e8f4"; ctx.fillRect(-5, -4 + step, 2, 4 - step); ctx.fillRect(3, -4 - step, 2, 4 + step);
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.ellipse(-0.5, -7, 6.4, 3.8, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(5.5, -11, 3.2, 3.8, 0.3, 0, TAU); ctx.fill(); ctx.stroke();
      const hue = (t * 80) % 360;
      ctx.strokeStyle = `hsl(${hue},90%,70%)`; ctx.lineWidth = 2.4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(3.4, -13); ctx.quadraticCurveTo(0, -12, -1, -8); ctx.moveTo(-6.4, -7); ctx.quadraticCurveTo(-10, -6, -9, -2 + Math.sin(t * 4)); ctx.stroke();
      ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.moveTo(6, -14); ctx.lineTo(8.4, -20); ctx.lineTo(7.6, -13.6); ctx.fill();
      eye(6.6, -11.4, 0.8);
      break;
    }
    case "petcat": case "petfox": {
      const fox = id === "petfox";
      const col = C.color, step = p.moving ? Math.sin(p.walk * 3) * 1.5 : 0;
      // Tail.
      ctx.strokeStyle = col; ctx.lineWidth = fox ? 4 : 2.2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-5, -5); ctx.quadraticCurveTo(-10, -6, -10 + Math.sin(t * 3) * 1.5, -12); ctx.stroke();
      if (fox) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-10 + Math.sin(t * 3) * 1.5, -11); ctx.lineTo(-10 + Math.sin(t * 3) * 1.5, -12.5); ctx.stroke(); }
      ctx.strokeStyle = "rgba(10,10,20,0.55)"; ctx.lineWidth = 1;
      ctx.fillStyle = shade(col, -0.2); ctx.fillRect(-5, -3 + step, 2.2, 3 - step); ctx.fillRect(2.5, -3 - step, 2.2, 3 + step);
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(-0.5, -5, 6, 3.6, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(5, -9, 3.8, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2.4, -11); ctx.lineTo(2.8, -15); ctx.lineTo(4.8, -12.4); ctx.moveTo(5.4, -12.6); ctx.lineTo(7.4, -15); ctx.lineTo(7.8, -11); ctx.fill();
      if (fox) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(5, -8); ctx.lineTo(9.6, -8.4); ctx.lineTo(6, -6); ctx.fill(); }
      else { ctx.fillStyle = shade(col, -0.25); ctx.fillRect(-3, -8.4, 1.2, 3); ctx.fillRect(0, -8.6, 1.2, 3); }
      eye(6.2, -9.6, 0.9);
      ctx.fillStyle = "#ff7fa8"; ctx.beginPath(); ctx.arc(8.6, -8.4, 0.7, 0, TAU); ctx.fill();
      break;
    }
  }
  ctx.restore();
}
