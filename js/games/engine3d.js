// ==========================================================================
// engine3d — a compact WebGL renderer written for this platform.
//
// It is deliberately small and dependency-free: mat4/vec3 maths, one lit
// shader (directional + ambient + hemisphere fill, distance fog, optional
// texture), a mesh cache for the primitives the games need, procedural
// canvas textures, blob shadows and a camera helper. Everything runs offline.
//
// Coordinate system: right-handed, +Y up, camera looks down -Z.
// ==========================================================================

import { toUnit } from "./color.js";

// ----------------------------------------------------------------- MATHS --
export const M4 = {
  identity: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),

  perspective(fovyDeg, aspect, near, far) {
    const f = 1 / Math.tan((fovyDeg * Math.PI / 180) / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  },

  lookAt(eye, center, up = [0, 1, 0]) {
    const z = V3.normalize(V3.sub(eye, center));
    const x = V3.normalize(V3.cross(up, z));
    const y = V3.cross(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -V3.dot(x, eye), -V3.dot(y, eye), -V3.dot(z, eye), 1,
    ]);
  },

  multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  },

  /** Builds a model matrix directly from TRS — cheaper than chained multiplies. */
  compose(pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    const [rx, ry, rz] = rot;
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const cz = Math.cos(rz), sz = Math.sin(rz);
    // R = Ry * Rx * Rz
    const m00 = cy * cz + sy * sx * sz;
    const m01 = cx * sz;
    const m02 = -sy * cz + cy * sx * sz;
    const m10 = -cy * sz + sy * sx * cz;
    const m11 = cx * cz;
    const m12 = sy * sz + cy * sx * cz;
    const m20 = sy * cx;
    const m21 = -sx;
    const m22 = cy * cx;
    const [sX, sY, sZ] = scale;
    return new Float32Array([
      m00 * sX, m01 * sX, m02 * sX, 0,
      m10 * sY, m11 * sY, m12 * sY, 0,
      m20 * sZ, m21 * sZ, m22 * sZ, 0,
      pos[0], pos[1], pos[2], 1,
    ]);
  },

  /** Inverse-transpose of the upper 3x3, for correct normals under scaling. */
  normalMatrix(m) {
    const a00 = m[0], a01 = m[1], a02 = m[2];
    const a10 = m[4], a11 = m[5], a12 = m[6];
    const a20 = m[8], a21 = m[9], a22 = m[10];
    const b01 = a22 * a11 - a12 * a21;
    const b11 = -a22 * a10 + a12 * a20;
    const b21 = a21 * a10 - a11 * a20;
    let det = a00 * b01 + a01 * b11 + a02 * b21;
    if (!det) return new Float32Array([1,0,0, 0,1,0, 0,0,1]);
    det = 1 / det;
    return new Float32Array([
      b01 * det, (-a22 * a01 + a02 * a21) * det, (a12 * a01 - a02 * a11) * det,
      b11 * det, (a22 * a00 - a02 * a20) * det, (-a12 * a00 + a02 * a10) * det,
      b21 * det, (-a21 * a00 + a01 * a20) * det, (a11 * a00 - a01 * a10) * det,
    ]);
  },
};

export const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  length: (a) => Math.hypot(a[0], a[1], a[2]),
  normalize(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

// Colours reach the renderer as hex, rgb() or hsl() depending on the game.
export const hexToRgb01 = toUnit;

// ---------------------------------------------------------------- SHADER --
const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec2 aUV;
uniform mat4 uProj, uView, uModel;
uniform mat3 uNormalMat;
varying vec3 vNormal;
varying vec2 vUV;
varying vec3 vWorld;
varying float vDepth;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vec4 viewPos = uView * world;
  gl_Position = uProj * viewPos;
  vNormal = normalize(uNormalMat * aNormal);
  vUV = aUV;
  vWorld = world.xyz;
  vDepth = -viewPos.z;
}`;

const FRAG = `
precision mediump float;
varying vec3 vNormal;
varying vec2 vUV;
varying vec3 vWorld;
varying float vDepth;
uniform vec3 uColor;          // base tint
uniform vec3 uLightDir;       // normalised, points from surface to light
uniform vec3 uLightColor;
uniform vec3 uAmbientSky;     // hemisphere fill (up)
uniform vec3 uAmbientGround;  // hemisphere fill (down)
uniform vec3 uFogColor;
uniform vec2 uFogRange;       // start, end
uniform sampler2D uTex;
uniform float uUseTex;
uniform vec2 uUVScale;
uniform float uEmissive;      // 0 = fully lit, 1 = ignore lighting
uniform float uAlpha;
void main() {
  vec3 base = uColor;
  if (uUseTex > 0.5) base *= texture2D(uTex, vUV * uUVScale).rgb;

  vec3 n = normalize(vNormal);
  float diff = max(dot(n, uLightDir), 0.0);
  // Hemisphere ambient: sky colour from above, bounce colour from below.
  float hemi = n.y * 0.5 + 0.5;
  vec3 ambient = mix(uAmbientGround, uAmbientSky, hemi);
  // A soft rim keeps silhouettes readable against the dark sky.
  float rim = pow(1.0 - max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0), 3.0) * 0.18;

  vec3 lit = base * (ambient + uLightColor * diff) + uLightColor * rim;
  vec3 color = mix(lit, base, uEmissive);

  float fog = clamp((vDepth - uFogRange.x) / max(uFogRange.y - uFogRange.x, 0.001), 0.0, 1.0);
  color = mix(color, uFogColor, fog);
  gl_FragColor = vec4(color, uAlpha);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("Shader compile failed: " + log);
  }
  return sh;
}

// ----------------------------------------------------------------- MESHES --
/** Each builder returns { positions, normals, uvs, indices }. */
export const Geometry = {
  box(w = 1, h = 1, d = 1) {
    const x = w / 2, y = h / 2, z = d / 2;
    const positions = [], normals = [], uvs = [], indices = [];
    const faces = [
      { n: [0, 0, 1], v: [[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]] },
      { n: [0, 0,-1], v: [[x,-y,-z],[-x,-y,-z],[-x,y,-z],[x,y,-z]] },
      { n: [1, 0, 0], v: [[x,-y,z],[x,-y,-z],[x,y,-z],[x,y,z]] },
      { n: [-1,0, 0], v: [[-x,-y,-z],[-x,-y,z],[-x,y,z],[-x,y,-z]] },
      { n: [0, 1, 0], v: [[-x,y,z],[x,y,z],[x,y,-z],[-x,y,-z]] },
      { n: [0,-1, 0], v: [[-x,-y,-z],[x,-y,-z],[x,-y,z],[-x,-y,z]] },
    ];
    faces.forEach((f, i) => {
      f.v.forEach(v => { positions.push(...v); normals.push(...f.n); });
      uvs.push(0,0, 1,0, 1,1, 0,1);
      const o = i * 4;
      indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    return { positions, normals, uvs, indices };
  },

  sphere(radius = 0.5, seg = 18, rings = 14) {
    const positions = [], normals = [], uvs = [], indices = [];
    for (let y = 0; y <= rings; y++) {
      const v = y / rings, phi = v * Math.PI;
      for (let x = 0; x <= seg; x++) {
        const u = x / seg, theta = u * Math.PI * 2;
        const nx = Math.sin(phi) * Math.cos(theta);
        const ny = Math.cos(phi);
        const nz = Math.sin(phi) * Math.sin(theta);
        positions.push(nx * radius, ny * radius, nz * radius);
        normals.push(nx, ny, nz);
        uvs.push(u, v);
      }
    }
    for (let y = 0; y < rings; y++) {
      for (let x = 0; x < seg; x++) {
        const a = y * (seg + 1) + x, b = a + seg + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return { positions, normals, uvs, indices };
  },

  cylinder(radius = 0.5, height = 1, seg = 20) {
    const positions = [], normals = [], uvs = [], indices = [];
    const h = height / 2;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg, a = u * Math.PI * 2;
      const nx = Math.cos(a), nz = Math.sin(a);
      positions.push(nx * radius, -h, nz * radius); normals.push(nx, 0, nz); uvs.push(u, 1);
      positions.push(nx * radius,  h, nz * radius); normals.push(nx, 0, nz); uvs.push(u, 0);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const capStart = positions.length / 3;
    for (const dir of [1, -1]) {
      const centerIdx = positions.length / 3;
      positions.push(0, dir * h, 0); normals.push(0, dir, 0); uvs.push(.5, .5);
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        positions.push(Math.cos(a) * radius, dir * h, Math.sin(a) * radius);
        normals.push(0, dir, 0);
        uvs.push(Math.cos(a) * .5 + .5, Math.sin(a) * .5 + .5);
      }
      for (let i = 1; i <= seg; i++) {
        if (dir > 0) indices.push(centerIdx, centerIdx + i, centerIdx + i + 1);
        else indices.push(centerIdx, centerIdx + i + 1, centerIdx + i);
      }
    }
    void capStart;
    return { positions, normals, uvs, indices };
  },

  cone(radius = 0.5, height = 1, seg = 18) {
    const positions = [], normals = [], uvs = [], indices = [];
    const h = height / 2;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = [Math.cos(a0) * radius, -h, Math.sin(a0) * radius];
      const p1 = [Math.cos(a1) * radius, -h, Math.sin(a1) * radius];
      const tip = [0, h, 0];
      const n = V3.normalize(V3.cross(V3.sub(p1, p0), V3.sub(tip, p0)));
      [p0, p1, tip].forEach(p => { positions.push(...p); normals.push(...n); });
      uvs.push(0, 1, 1, 1, .5, 0);
      const o = i * 3;
      indices.push(o, o + 1, o + 2);
    }
    const centerIdx = positions.length / 3;
    positions.push(0, -h, 0); normals.push(0, -1, 0); uvs.push(.5, .5);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      positions.push(Math.cos(a) * radius, -h, Math.sin(a) * radius);
      normals.push(0, -1, 0);
      uvs.push(Math.cos(a) * .5 + .5, Math.sin(a) * .5 + .5);
    }
    for (let i = 1; i <= seg; i++) indices.push(centerIdx, centerIdx + i + 1, centerIdx + i);
    return { positions, normals, uvs, indices };
  },

  /** Ground/quad in the XZ plane, facing +Y. */
  plane(w = 1, d = 1) {
    return {
      positions: [-w/2, 0, -d/2,  w/2, 0, -d/2,  w/2, 0, d/2,  -w/2, 0, d/2],
      normals: [0,1,0, 0,1,0, 0,1,0, 0,1,0],
      uvs: [0,0, 1,0, 1,1, 0,1],
      indices: [0, 1, 2, 0, 2, 3],
    };
  },

  /** Billboard quad in the XY plane, facing +Z. */
  quad(w = 1, h = 1) {
    return {
      positions: [-w/2, -h/2, 0,  w/2, -h/2, 0,  w/2, h/2, 0,  -w/2, h/2, 0],
      normals: [0,0,1, 0,0,1, 0,0,1, 0,0,1],
      uvs: [0,1, 1,1, 1,0, 0,0],
      indices: [0, 1, 2, 0, 2, 3],
    };
  },

  torus(radius = 0.6, tube = 0.18, radialSeg = 24, tubeSeg = 12) {
    const positions = [], normals = [], uvs = [], indices = [];
    for (let j = 0; j <= radialSeg; j++) {
      const u = (j / radialSeg) * Math.PI * 2;
      for (let i = 0; i <= tubeSeg; i++) {
        const v = (i / tubeSeg) * Math.PI * 2;
        const cx = Math.cos(u) * radius, cz = Math.sin(u) * radius;
        const x = (radius + tube * Math.cos(v)) * Math.cos(u);
        const y = tube * Math.sin(v);
        const z = (radius + tube * Math.cos(v)) * Math.sin(u);
        positions.push(x, y, z);
        normals.push(...V3.normalize([x - cx, y, z - cz]));
        uvs.push(j / radialSeg, i / tubeSeg);
      }
    }
    for (let j = 0; j < radialSeg; j++) {
      for (let i = 0; i < tubeSeg; i++) {
        const a = j * (tubeSeg + 1) + i;
        const b = a + tubeSeg + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return { positions, normals, uvs, indices };
  },
};

// -------------------------------------------------------------- TEXTURES --
/**
 * Procedural textures drawn on a 2D canvas — no image files, so nothing is
 * fetched at runtime and every surface stays crisp at any resolution.
 */
export const Textures = {
  asphalt(size = 256) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d");
    g.fillStyle = "#2b3048"; g.fillRect(0, 0, size, size);
    const img = g.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 34;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    // Faint aggregate specks
    for (let i = 0; i < size * 2; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    return c;
  },

  grid(size = 256, { bg = "#101830", line = "#3ad6ff", cells = 4, width = 3, glow = true } = {}) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d");
    g.fillStyle = bg; g.fillRect(0, 0, size, size);
    g.strokeStyle = line; g.lineWidth = width;
    if (glow) { g.shadowColor = line; g.shadowBlur = 10; }
    const step = size / cells;
    g.beginPath();
    for (let i = 0; i <= cells; i++) {
      g.moveTo(i * step, 0); g.lineTo(i * step, size);
      g.moveTo(0, i * step); g.lineTo(size, i * step);
    }
    g.stroke();
    return c;
  },

  checker(size = 256, a = "#e8ecff", b = "#1b2138", cells = 8) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d");
    const step = size / cells;
    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
      g.fillStyle = (x + y) % 2 ? a : b;
      g.fillRect(x * step, y * step, step, step);
    }
    return c;
  },

  metal(size = 256, tint = "#8f9bd0") {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, "#ffffff"); grad.addColorStop(0.45, tint); grad.addColorStop(1, "#4a5378");
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
    // Brushed streaks
    for (let i = 0; i < size; i++) {
      g.strokeStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
      g.beginPath(); g.moveTo(0, i); g.lineTo(size, i + (Math.random() - 0.5) * 4); g.stroke();
    }
    return c;
  },

  rock(size = 256, base = "#6b6f8a") {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d");
    g.fillStyle = base; g.fillRect(0, 0, size, size);
    for (let i = 0; i < 220; i++) {
      const r = 4 + Math.random() * 26;
      g.fillStyle = `rgba(${Math.random() > .5 ? 255 : 0},${Math.random() > .5 ? 255 : 0},255,${Math.random() * 0.05})`;
      g.beginPath(); g.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2); g.fill();
    }
    const img = g.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 40;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    return c;
  },

  stripes(size = 256, { bg = "#ffd76a", stripe = "#1a1206", count = 6, angle = Math.PI / 4 } = {}) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d");
    g.fillStyle = bg; g.fillRect(0, 0, size, size);
    g.save(); g.translate(size / 2, size / 2); g.rotate(angle); g.translate(-size, -size);
    g.fillStyle = stripe;
    const step = (size * 2) / count;
    for (let i = 0; i < count; i++) g.fillRect(i * step, 0, step / 2, size * 2);
    g.restore();
    return c;
  },
};

// ---------------------------------------------------------------- ENGINE --
export class Engine3D {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} opts { fog: [start, end], fogColor, clearColor }
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    // alpha:true so a CSS backdrop can show through where nothing is drawn.
    const attrs = { antialias: true, alpha: true, depth: true, premultipliedAlpha: false, powerPreference: "high-performance" };
    const gl = canvas.getContext("webgl", attrs) || canvas.getContext("experimental-webgl", attrs);
    if (!gl) throw new Error("WebGL is not available in this browser.");
    this.gl = gl;

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("Program link failed: " + gl.getProgramInfoLog(prog));
    this.program = prog;
    gl.useProgram(prog);

    this.attrs = {
      pos: gl.getAttribLocation(prog, "aPos"),
      normal: gl.getAttribLocation(prog, "aNormal"),
      uv: gl.getAttribLocation(prog, "aUV"),
    };
    this.uni = {};
    for (const name of ["uProj","uView","uModel","uNormalMat","uColor","uLightDir","uLightColor",
                        "uAmbientSky","uAmbientGround","uFogColor","uFogRange","uTex","uUseTex",
                        "uUVScale","uEmissive","uAlpha"]) {
      this.uni[name] = gl.getUniformLocation(prog, name);
    }

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.meshes = new Map();
    this.textures = new Map();
    this.clearColor = opts.clearColor || "#05060d";
    this.fogColor = opts.fogColor || this.clearColor;
    this.fogRange = opts.fog || [30, 120];
    this.light = {
      dir: V3.normalize(opts.lightDir || [0.45, 0.9, 0.35]),
      color: hexToRgb01(opts.lightColor || "#ffffff"),
      ambientSky: hexToRgb01(opts.ambientSky || "#3d4a7a"),
      ambientGround: hexToRgb01(opts.ambientGround || "#12141f"),
    };
    this.camera = { pos: [0, 4, 10], target: [0, 0, 0], fov: 60, near: 0.1, far: 400 };
    this._clearAlpha = 1;
    this._white = this._makeSolidTexture([255, 255, 255, 255]);
    this.drawCalls = 0;
  }

  // ---- resources ----------------------------------------------------------
  mesh(name, builder) {
    if (this.meshes.has(name)) return this.meshes.get(name);
    const gl = this.gl;
    const data = typeof builder === "function" ? builder() : builder;
    const buffers = {
      pos: gl.createBuffer(), normal: gl.createBuffer(), uv: gl.createBuffer(), index: gl.createBuffer(),
      count: data.indices.length,
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.pos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.positions), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normal);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.normals), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.uv);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.uvs), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.indices), gl.STATIC_DRAW);
    this.meshes.set(name, buffers);
    return buffers;
  }

  texture(name, factory) {
    if (this.textures.has(name)) return this.textures.get(name);
    const gl = this.gl;
    const source = typeof factory === "function" ? factory() : factory;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    this.textures.set(name, tex);
    return tex;
  }

  _makeSolidTexture(rgba) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba));
    return tex;
  }

  // ---- frame --------------------------------------------------------------
  resize(width, height, dpr = 1) {
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.canvas.style.width = width + "px";
      this.canvas.style.height = height + "px";
    }
    this.aspect = w / h;
    this.gl.viewport(0, 0, w, h);
  }

  beginFrame() {
    const gl = this.gl;
    const [r, g, b] = hexToRgb01(this.clearColor);
    gl.clearColor(r, g, b, this._clearAlpha);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);

    const proj = M4.perspective(this.camera.fov, this.aspect || 1, this.camera.near, this.camera.far);
    const view = M4.lookAt(this.camera.pos, this.camera.target, this.camera.up || [0, 1, 0]);
    gl.uniformMatrix4fv(this.uni.uProj, false, proj);
    gl.uniformMatrix4fv(this.uni.uView, false, view);
    gl.uniform3fv(this.uni.uLightDir, new Float32Array(this.light.dir));
    gl.uniform3fv(this.uni.uLightColor, new Float32Array(this.light.color));
    gl.uniform3fv(this.uni.uAmbientSky, new Float32Array(this.light.ambientSky));
    gl.uniform3fv(this.uni.uAmbientGround, new Float32Array(this.light.ambientGround));
    gl.uniform3fv(this.uni.uFogColor, new Float32Array(hexToRgb01(this.fogColor)));
    gl.uniform2f(this.uni.uFogRange, this.fogRange[0], this.fogRange[1]);
    this.drawCalls = 0;
  }

  /**
   * Draws one mesh.
   * @param {string} meshName  registered via mesh()
   * @param {Object} o { pos, rot, scale, color, texture, uvScale, emissive, alpha }
   */
  draw(meshName, o = {}) {
    const gl = this.gl;
    const m = this.meshes.get(meshName);
    if (!m) return;
    const model = o.model || M4.compose(o.pos || [0, 0, 0], o.rot || [0, 0, 0], o.scale || [1, 1, 1]);
    gl.uniformMatrix4fv(this.uni.uModel, false, model);
    gl.uniformMatrix3fv(this.uni.uNormalMat, false, M4.normalMatrix(model));
    gl.uniform3fv(this.uni.uColor, new Float32Array(hexToRgb01(o.color || "#ffffff")));
    gl.uniform1f(this.uni.uEmissive, o.emissive ?? 0);
    gl.uniform1f(this.uni.uAlpha, o.alpha ?? 1);
    gl.uniform2f(this.uni.uUVScale, o.uvScale?.[0] ?? 1, o.uvScale?.[1] ?? 1);

    gl.activeTexture(gl.TEXTURE0);
    const tex = o.texture ? this.textures.get(o.texture) : null;
    gl.bindTexture(gl.TEXTURE_2D, tex || this._white);
    gl.uniform1i(this.uni.uTex, 0);
    gl.uniform1f(this.uni.uUseTex, tex ? 1 : 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, m.pos);
    gl.enableVertexAttribArray(this.attrs.pos);
    gl.vertexAttribPointer(this.attrs.pos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.normal);
    gl.enableVertexAttribArray(this.attrs.normal);
    gl.vertexAttribPointer(this.attrs.normal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.uv);
    gl.enableVertexAttribArray(this.attrs.uv);
    gl.vertexAttribPointer(this.attrs.uv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.index);
    gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
    this.drawCalls++;
  }

  /**
   * Screen-space sky. Because a camera-facing quad would be screen-fixed
   * anyway, the gradient is painted onto the canvas with CSS and the colour
   * buffer is cleared transparent — same picture, zero fill cost per frame.
   * @param {string} css any CSS background value, e.g. a linear-gradient
   */
  backdrop(css) {
    this.canvas.style.background = css;
    this._clearAlpha = 0;
  }

  /**
   * Soft contact shadow: a dark, unlit disc laid just above the ground. Far
   * cheaper than a shadow map and, for these games, just as convincing.
   */
  shadow(x, z, radius, { y = 0.02, alpha = 0.34 } = {}) {
    this.mesh("__shadow", () => Geometry.plane(1, 1));
    this.draw("__shadow", {
      pos: [x, y, z], scale: [radius * 2, 1, radius * 2],
      color: "#000000", emissive: 1, alpha,
      texture: this.texture("__shadowTex", () => {
        const c = document.createElement("canvas"); c.width = c.height = 64;
        const g = c.getContext("2d");
        const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, "rgba(255,255,255,1)");
        grad.addColorStop(0.55, "rgba(255,255,255,0.5)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
        return c;
      }),
    });
  }

  /** Positions the camera behind/above a target — the standard chase view. */
  chase(target, { back = 9, height = 4.5, lookAhead = 6, lerp = 1 } = {}) {
    const want = [target[0] * 0.6, target[1] + height, target[2] + back];
    this.camera.pos = lerp >= 1 ? want : V3.lerp(this.camera.pos, want, lerp);
    this.camera.target = [target[0] * 0.35, target[1] + 0.6, target[2] - lookAhead];
  }

  dispose() {
    const gl = this.gl;
    this.meshes.forEach(m => {
      gl.deleteBuffer(m.pos); gl.deleteBuffer(m.normal); gl.deleteBuffer(m.uv); gl.deleteBuffer(m.index);
    });
    this.textures.forEach(t => gl.deleteTexture(t));
    gl.deleteTexture(this._white);
    gl.deleteProgram(this.program);
    this.meshes.clear();
    this.textures.clear();
    // Free the GPU context immediately rather than waiting for GC — games are
    // mounted and unmounted constantly as the player browses.
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
  }
}

export default Engine3D;
