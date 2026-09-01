// ==========================================================================
// GameArt — procedural cover artwork for every game.
//
// Each cover is an inline SVG composed of four layers:
//   1. a two-stop gradient ground tinted with the game's own palette
//   2. a category-specific scene (starfield, neon grid, board, arena…)
//   3. the game's glyph as a lit focal point with a soft halo
//   4. a vignette + grain pass so it reads as printed art, not a CSS box
//
// Everything is deterministic (seeded by game id), so a game's cover never
// changes between renders, and nothing is fetched over the network.
// ==========================================================================
import { seededRng } from "../core/utils.js";

const SCENES = {
  "3D": "space",
  Arcade: "grid",
  Action: "stars",
  Puzzle: "blocks",
  Board: "checker",
  Strategy: "hex",
  Sports: "arena",
  Casual: "bubbles",
  Skill: "rings",
};

function scene(kind, rng, c1, c2) {
  const rand = (a, b) => a + rng() * (b - a);
  let out = "";

  if (kind === "grid") {
    // Perspective floor grid — the classic arcade horizon.
    for (let i = 0; i <= 10; i++) {
      const x = i * 32;
      out += `<line x1="${x}" y1="118" x2="${(x - 160) * 2.4 + 160}" y2="200" stroke="${c2}" stroke-opacity=".38" stroke-width="1"/>`;
    }
    for (let i = 0; i < 7; i++) {
      const y = 118 + Math.pow(i / 6, 2.1) * 82;
      out += `<line x1="-40" y1="${y}" x2="360" y2="${y}" stroke="${c2}" stroke-opacity="${0.34 - i * 0.03}" stroke-width="1"/>`;
    }
    out += `<circle cx="160" cy="118" r="52" fill="${c1}" fill-opacity=".5" filter="url(#soft)"/>`;
  } else if (kind === "stars") {
    for (let i = 0; i < 46; i++) {
      const x = rand(0, 320), y = rand(0, 200), r = rand(.5, 1.9);
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#fff" fill-opacity="${rand(.25, .85).toFixed(2)}"/>`;
    }
    out += `<path d="M-10 165 Q 90 120 180 152 T 340 132 L340 210 L-10 210Z" fill="${c1}" fill-opacity=".34"/>`;
    out += `<circle cx="${rand(40, 280).toFixed(0)}" cy="${rand(30, 70).toFixed(0)}" r="34" fill="${c2}" fill-opacity=".4" filter="url(#soft)"/>`;
  } else if (kind === "blocks") {
    for (let i = 0; i < 13; i++) {
      const s = rand(20, 42), x = rand(-10, 300), y = rand(-10, 180);
      const rot = rand(-16, 16);
      out += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${s.toFixed(0)}" height="${s.toFixed(0)}" rx="7" fill="${i % 2 ? c1 : c2}" fill-opacity="${rand(.14, .4).toFixed(2)}" transform="rotate(${rot.toFixed(1)} ${(x + s / 2).toFixed(0)} ${(y + s / 2).toFixed(0)})"/>`;
    }
  } else if (kind === "checker") {
    const cell = 40;
    for (let r = 0; r < 5; r++) for (let col = 0; col < 8; col++) {
      if ((r + col) % 2) continue;
      out += `<rect x="${col * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="#fff" fill-opacity=".05"/>`;
    }
    out += `<rect x="0" y="0" width="320" height="200" fill="url(#boardFade)"/>`;
    out += `<circle cx="72" cy="140" r="26" fill="${c1}" fill-opacity=".45"/><circle cx="246" cy="66" r="26" fill="${c2}" fill-opacity=".45"/>`;
  } else if (kind === "hex") {
    for (let row = 0; row < 4; row++) for (let col = 0; col < 7; col++) {
      const x = col * 50 + (row % 2 ? 25 : 0), y = row * 44 + 10;
      out += `<path d="M${x} ${y - 16} l14 8 v16 l-14 8 -14 -8 v-16z" fill="none" stroke="${col % 3 ? c2 : c1}" stroke-opacity=".3" stroke-width="1.4"/>`;
    }
  } else if (kind === "arena") {
    out += `<ellipse cx="160" cy="210" rx="180" ry="90" fill="${c1}" fill-opacity=".28"/>`;
    out += `<ellipse cx="160" cy="210" rx="120" ry="60" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="1.6"/>`;
    out += `<line x1="0" y1="140" x2="320" y2="140" stroke="#fff" stroke-opacity=".14" stroke-width="1.4"/>`;
    out += `<circle cx="160" cy="86" r="44" fill="${c2}" fill-opacity=".34" filter="url(#soft)"/>`;
  } else if (kind === "bubbles") {
    for (let i = 0; i < 12; i++) {
      const r = rand(10, 40);
      out += `<circle cx="${rand(0, 320).toFixed(0)}" cy="${rand(0, 200).toFixed(0)}" r="${r.toFixed(0)}" fill="${i % 2 ? c1 : c2}" fill-opacity="${rand(.12, .32).toFixed(2)}"/>`;
    }
  } else if (kind === "space") {
    // Perspective corridor: a vanishing-point grid with floating solids, which
    // reads as "3D" at thumbnail size.
    out += `<rect width="320" height="200" fill="none"/>`;
    for (let i = 0; i <= 12; i++) {
      const x = i * 26.6;
      out += `<line x1="${x}" y1="200" x2="160" y2="86" stroke="${c2}" stroke-opacity=".28" stroke-width="1"/>`;
    }
    for (let i = 1; i < 8; i++) {
      const t = Math.pow(i / 7, 2.2);
      const y = 86 + t * 118;
      out += `<line x1="${(160 - 160 * t).toFixed(0)}" y1="${y.toFixed(0)}" x2="${(160 + 160 * t).toFixed(0)}" y2="${y.toFixed(0)}" stroke="${c2}" stroke-opacity="${(0.3 - i * 0.03).toFixed(2)}" stroke-width="1"/>`;
    }
    out += `<circle cx="160" cy="86" r="46" fill="${c1}" fill-opacity=".45" filter="url(#soft)"/>`;
    for (let i = 0; i < 4; i++) {
      const x = rand(30, 290), y = rand(20, 90), s2 = rand(14, 30);
      out += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${s2.toFixed(0)}" height="${s2.toFixed(0)}" rx="4" fill="${i % 2 ? c1 : c2}" fill-opacity="${rand(.2, .45).toFixed(2)}" transform="rotate(${rand(-30, 30).toFixed(0)} ${(x + s2 / 2).toFixed(0)} ${(y + s2 / 2).toFixed(0)})"/>`;
    }
  } else { // rings
    for (let i = 0; i < 5; i++) {
      out += `<circle cx="160" cy="100" r="${34 + i * 26}" fill="none" stroke="${i % 2 ? c1 : c2}" stroke-opacity="${(0.34 - i * 0.05).toFixed(2)}" stroke-width="1.6"/>`;
    }
  }
  return out;
}

/**
 * Builds the SVG markup for a game's cover.
 * @param {Object} meta  registry entry
 * @param {Object} opts  { compact } — compact drops the fine detail for small tiles
 */
export function gameArtSVG(meta, { compact = false } = {}) {
  const rng = seededRng("art-" + meta.id);
  const [c1, c2] = meta.grad;
  const uid = `a${meta.id.replace(/[^a-z0-9]/gi, "")}`;
  const kind = SCENES[meta.category] || "grid";
  const glyphSize = compact ? 46 : 76;

  return `
<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${meta.title} cover art">
  <defs>
    <linearGradient id="${uid}g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
    <radialGradient id="${uid}halo" cx=".5" cy=".46" r=".5">
      <stop offset="0" stop-color="#fff" stop-opacity=".55"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${uid}vig" cx=".5" cy=".42" r=".78">
      <stop offset=".45" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".62"/>
    </radialGradient>
    <linearGradient id="boardFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".35"/>
    </linearGradient>
    <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
    <filter id="${uid}glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="320" height="200" fill="url(#${uid}g)"/>
  <rect width="320" height="200" fill="#05060d" opacity=".42"/>
  <g>${scene(kind, rng, c1, c2)}</g>
  <ellipse cx="160" cy="96" rx="86" ry="70" fill="url(#${uid}halo)" opacity=".5"/>
  <text x="160" y="104" text-anchor="middle" dominant-baseline="central"
        font-size="${glyphSize}" filter="url(#${uid}glow)"
        style="paint-order:stroke">${meta.emoji}</text>
  <rect width="320" height="200" fill="url(#${uid}vig)"/>
  <rect width="320" height="200" fill="url(#${uid}g)" opacity=".14" style="mix-blend-mode:overlay"/>
</svg>`;
}

/** Creates a thumb element containing the cover art. */
export function gameArt(meta, { compact = false, className = "thumb" } = {}) {
  const wrap = document.createElement("div");
  wrap.className = className;
  wrap.innerHTML = gameArtSVG(meta, { compact });
  return wrap;
}

export default gameArt;
