// Motor 3D (WebGL via Three.js r160, embutido em js/vendor): mundo em voxels com oclusão ambiente por
// vértice, sol com sombras, elenco articulado e um único shader de pós-produção (profundidade de campo
// física, raios volumétricos, bloom, flare, grade de cor, estilos). Substitui o motor 2.5D quando há WebGL2;
// o motor antigo (engine.js) continua como fallback. Interface: window.World3D.render(spec, t, canvas2d).
import * as THREE from './vendor/three.module.min.js';

const TAU = Math.PI * 2, D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const pp = u => u < .5 ? u * 2 : 2 - u * 2;
const fract = x => x - Math.floor(x);
const hash2 = (x, z) => fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453);
const hash1 = n => fract(Math.sin(n * 91.345 + 47.853) * 43758.5453);
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(hash2(xi, zi), hash2(xi + 1, zi), u), lerp(hash2(xi, zi + 1), hash2(xi + 1, zi + 1), u), v);
}
function fbm(x, z) { let s = 0, a = .5, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, z * f); a *= .5; f *= 2; } return s / .9375; }
function noise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash1(i), hash1(i + 1), u) * 2 - 1; }
const col = h => new THREE.Color(h);

const STATUS = { ready: false, failed: false, error: null, t0: performance.now() };
window.World3D = STATUS;

// ───────────────────────── Renderer
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 indisponível');
} catch (e) { STATUS.failed = true; STATUS.error = String(e); throw e; }
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // PCF respeita shadow.radius: luz dura × suave
renderer.autoClear = true;

// ───────────────────────── Texturas procedurais (atlas 16×16 px por bloco, com margem anti-sangramento)
const ATLAS = document.createElement('canvas'); ATLAS.width = ATLAS.height = 512;
const actx = ATLAS.getContext('2d');
const TILE = {}; let tileN = 0;
function tile(name, fn) {
  const i = tileN++, cx = (i % 21) * 24 + 4, cy = Math.floor(i / 21) * 24 + 4, img = actx.createImageData(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = fn(x, y, hash2(x + i * 37.1, y + i * 11.3), hash2(x * 3.7 + i, y * 5.1 - i)), k = (y * 16 + x) * 4;
    img.data[k] = clamp(c[0], 0, 255); img.data[k + 1] = clamp(c[1], 0, 255); img.data[k + 2] = clamp(c[2], 0, 255); img.data[k + 3] = c[3] == null ? 255 : c[3];
  }
  actx.putImageData(img, cx, cy);
  for (let p = 1; p <= 4; p++) { actx.drawImage(ATLAS, cx, cy, 1, 16, cx - p, cy, 1, 16); actx.drawImage(ATLAS, cx + 15, cy, 1, 16, cx + 15 + p, cy, 1, 16); }
  for (let p = 1; p <= 4; p++) { actx.drawImage(ATLAS, cx - 4, cy, 24, 1, cx - 4, cy - p, 24, 1); actx.drawImage(ATLAS, cx - 4, cy + 15, 24, 1, cx - 4, cy + 15 + p, 24, 1); }
  TILE[name] = { u0: cx / 512, u1: (cx + 16) / 512, v0: 1 - (cy + 16) / 512, v1: 1 - cy / 512 };
}
const sh = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
tile('grass_top', (x, y, n, m) => sh(m > .85 ? [118, 182, 70] : [94, 158, 52], .82 + n * .32));
tile('grass_side', (x, y, n, m) => (y < 3 || (y === 3 && m > .45) || (y === 4 && m > .8)) ? sh([94, 158, 52], .8 + n * .3) : sh(m > .9 ? [104, 74, 50] : [134, 96, 67], .8 + n * .35));
tile('dirt', (x, y, n, m) => sh(m > .88 ? [100, 70, 48] : [134, 96, 67], .8 + n * .35));
tile('stone', (x, y, n, m) => sh(m > .9 ? [96, 96, 98] : [128, 128, 130], .78 + n * .34));
tile('sand', (x, y, n) => sh([219, 205, 160], .9 + n * .14));
tile('log_side', (x, y, n) => sh((x % 4 === 0 || (x + (y >> 2)) % 5 === 0) ? [78, 58, 36] : [108, 82, 52], .85 + n * .25));
tile('log_top', (x, y, n) => { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); return sh(d > 6.5 ? [104, 80, 50] : (Math.floor(d) % 2 ? [176, 140, 90] : [150, 116, 70]), .9 + n * .15); });
tile('leaves', (x, y, n, m) => { const c = sh(m > .8 ? [86, 160, 62] : [62, 132, 48], .8 + n * .42); c.push(m < .035 ? 0 : 255); return c; });
tile('planks', (x, y, n) => { const seam = x === ((y >> 2) * 5 + 3) % 16; return sh((y % 4 === 3 || seam) ? [122, 92, 56] : [180, 142, 90], .88 + n * .2 + ((y >> 2) % 2) * .05); });
tile('cobble', (x, y, n) => { const row = y >> 2, ox = (x + (row % 2) * 2) % 4; const mortar = (y % 4 === 0) || ox === 0; return sh(mortar ? [82, 82, 84] : [132, 132, 134], .8 + n * .35); });
tile('path', (x, y, n, m) => sh(m > .85 ? [126, 100, 60] : [158, 128, 78], .85 + n * .25));
tile('roof', (x, y, n) => sh(y % 4 === 0 ? [110, 34, 28] : [158, 54, 42], .85 + n * .25));
tile('glass', (x, y, n) => { const fr = x === 0 || x === 15 || y === 0 || y === 15 || x === 7 || x === 8 || y === 7 || y === 8; if (fr) return sh([118, 86, 50], .9 + n * .15); return (x + y === 10 || x + y === 11) ? [230, 244, 250] : sh([168, 208, 230], .95 + n * .08); });
tile('gravel', (x, y, n, m) => sh(m > .5 ? [150, 140, 130] : [112, 104, 98], .85 + n * .3));
tile('hay', (x, y, n) => sh((x % 3 === 0) ? [178, 140, 40] : [214, 180, 70], .88 + n * .2));
tile('target', (x, y, n) => { const d = Math.hypot(x - 7.5, y - 7.5); return d < 2 ? [210, 40, 40] : d < 4 ? [240, 238, 230] : d < 6 ? [210, 40, 40] : d < 7.6 ? [240, 238, 230] : sh([214, 180, 70], .9 + n * .2); });
tile('flower_red', (x, y) => { if ((x === 7 || x === 8) && y >= 8) return [62, 128, 48, 255]; const d = Math.hypot(x - 7.5, y - 5); if (d < 1.4) return [246, 200, 60, 255]; if (d < 3.6) return [214, 52, 56, 255]; if (y === 11 && (x === 9 || x === 10)) return [74, 146, 54, 255]; return [74, 146, 54, 0]; });
tile('flower_yel', (x, y) => { if ((x === 7 || x === 8) && y >= 8) return [62, 128, 48, 255]; const d = Math.hypot(x - 7.5, y - 5); if (d < 1.3) return [200, 120, 30, 255]; if (d < 3.3) return [246, 214, 60, 255]; return [74, 146, 54, 0]; });
tile('tallgrass', (x, y, n, m) => { const h = 6 + Math.floor(hash2(x, 3.3) * 9); return 15 - y < h && (x % 2 === 0 || m > .6) ? sh([82, 148, 50], .75 + n * .4).concat(255) : [82, 148, 50, 0]; });
tile('lantern', (x, y) => (x === 0 || x === 15 || y === 0 || y === 15) ? [40, 38, 36, 255] : (x > 4 && x < 11 && y > 3 && y < 12) ? [255, 236, 170, 255] : [255, 196, 110, 255]);

function texFrom(canvas, nearest) {
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = nearest ? THREE.NearestFilter : THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = !nearest; t.anisotropy = 4; return t;
}
const atlasTex = texFrom(ATLAS, false);
function smallTex(w, h, fn, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = fn(x, y, hash2(x * 1.7 + w, y * 2.3 + h)), k = (y * w + x) * 4; img.data[k] = v[0]; img.data[k + 1] = v[1]; img.data[k + 2] = v[2]; img.data[k + 3] = v[3] == null ? 255 : v[3]; }
  g.putImageData(img, 0, 0); const t = texFrom(c, true); if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t;
}
const waterTex = smallTex(16, 16, (x, y, n) => { const w = Math.sin((x + y * .5) * .8) * .5 + .5, foam = hash2(x * 7, 3) > .78 && n > .35; return foam ? [210, 228, 246] : sh([70, 128, 214], .85 + n * .12 + w * .16); }, true);
const grassFarTex = smallTex(16, 16, (x, y, n) => sh([94, 158, 52], .82 + n * .3), true);
grassFarTex.repeat.set(400, 400);

// ───────────────────────── Mundo em voxels
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, LOG = 5, LEAVES = 6, PLANK = 7, COBBLE = 8, PATH = 9, ROOF = 10, GLASS = 11, WATER = 12, GRAVEL = 13, HAY = 14, TARGET = 15;
const WX0 = -56, WX1 = 56, WY0 = -6, WY1 = 42, WZ0 = -80, WZ1 = 40;
const NX = WX1 - WX0, NY = WY1 - WY0, NZ = WZ1 - WZ0;
const grid = new Uint8Array(NX * NY * NZ);
const inb = (x, y, z) => x >= WX0 && x < WX1 && y >= WY0 && y < WY1 && z >= WZ0 && z < WZ1;
const gidx = (x, y, z) => ((x - WX0) * NY + (y - WY0)) * NZ + (z - WZ0);
const get = (x, y, z) => inb(x, y, z) ? grid[gidx(x, y, z)] : AIR;
const set = (x, y, z, b) => { if (inb(x, y, z)) grid[gidx(x, y, z)] = b; };
const surf = new Map();   // altura do topo (y do último bloco sólido) por coluna
const sk = (x, z) => x * 1000 + z;
function topY(x, z) { const v = surf.get(sk(x, z)); return v == null ? -1 : v; }
function groundAt(x, z) { return topY(Math.floor(x), Math.floor(z)) + 1; }

const POND = { x: -9, z: -21, rx: 6.2, rz: 4.4 };
const inPond = (x, z) => ((x + .5 - POND.x) / POND.rx) ** 2 + ((z + .5 - POND.z) / POND.rz) ** 2 <= 1;
const HOUSE = { x0: 3, x1: 9, z0: -12, z1: -7 };
function heightAt(x, z) {
  const cx = x + .5, cz = z + .5, r = Math.hypot(cx - 1, cz + 3);
  let h = -1;
  const n = fbm(cx * .045 + 3.1, cz * .045 - 7.7);
  h += Math.round(sstep(15, 32, r) * (n * 8 - 2));
  h += Math.round(sstep(-38, -70, cz) * (6 + fbm(cx * .06, cz * .06) * 18));
  h += Math.round(sstep(34, 52, Math.abs(cx)) * (3 + n * 9));
  if (cx > -18 && cx < 0 && cz < -25 && cz > -34) h = Math.max(h, 4 + Math.round(fbm(cx * .3, cz * .3) * 2));   // penhasco da cachoeira
  return clamp(h, -3, 36);
}
function genTerrain() {
  for (let x = WX0; x < WX1; x++) for (let z = WZ0; z < WZ1; z++) {
    let h = heightAt(x, z);
    const flat = (x >= HOUSE.x0 - 3 && x <= HOUSE.x1 + 3 && z >= HOUSE.z0 - 3 && z <= HOUSE.z1 + 5) || Math.hypot(x + .5, z + .5) < 13 || (z > -2 && Math.abs(x + .5) < 18 + (z > 20 ? (z - 20) * .8 : 0));
    if (flat && !(z < -25)) h = -1;
    const pond = inPond(x, z);
    for (let y = WY0; y <= h; y++) {
      let b = y === h ? GRASS : (y >= h - 3 ? DIRT : STONE);
      if (h - y >= 1 && h > 1 && (x + z) % 3 !== 0 && h - y > 2) b = STONE;
      set(x, y, z, b);
    }
    if (pond) {
      for (let y = -3; y <= h; y++) set(x, y, z, AIR);
      set(x, -4, z, SAND); set(x, -3, z, WATER); set(x, -2, z, WATER); set(x, -1, z, WATER); h = -1;
      surf.set(sk(x, z), -1);
    } else surf.set(sk(x, z), h);
  }
  // borda de areia e penhasco de pedra
  for (let x = POND.x - 9; x <= POND.x + 9; x++) for (let z = POND.z - 7; z <= POND.z + 7; z++) {
    if (inPond(x, z)) continue;
    const near = inPond(x + 1, z) || inPond(x - 1, z) || inPond(x, z + 1) || inPond(x, z - 1);
    if (near && get(x, -1, z) === GRASS) set(x, -1, z, SAND);
  }
  for (let x = -18; x < 0; x++) for (let z = -34; z <= -26; z++) { const h = topY(x, z); for (let y = 0; y < h; y++) if (get(x, y, z)) set(x, y, z, (y + x + z) % 5 === 0 ? COBBLE : STONE); }
  // cachoeira
  for (let x = -10; x <= -8; x++) { const h = topY(x, -26); for (let y = -1; y <= h; y++) set(x, y, -25, WATER); set(x, h, -26, WATER); }
}
function genHouse() {
  const { x0, x1, z0, z1 } = HOUSE;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = 0; y <= 3; y++) {
    const edgeX = x === x0 || x === x1, edgeZ = z === z0 || z === z1;
    if (!edgeX && !edgeZ) { if (y === 0) set(x, -1, z, PLANK); continue; }
    let b = y === 0 ? COBBLE : (edgeX && edgeZ ? LOG : PLANK);
    if ((y === 1 || y === 2) && z === z1 && (x === 4 || x === 8)) b = GLASS;
    if ((y === 1 || y === 2) && (x === x0 || x === x1) && z === -10) b = GLASS;
    if ((y === 1 || y === 2) && z === z0 && x === 6) b = GLASS;
    if (z === z1 && x === 6 && (y === 0 || y === 1)) b = AIR;      // porta
    set(x, y, z, b);
  }
  for (let l = 0; l < 5; l++) { const y = 4 + l, xa = x0 - 1 + l, xb = x1 + 1 - l; if (xa > xb) break; for (let x = xa; x <= xb; x++) for (let z = z0 - 1; z <= z1 + 1; z++) set(x, y, z, ROOF); }
  for (let y = 4; y <= 9; y++) set(8, y, -11, COBBLE);
  for (let x = x0 + 1; x < x1; x++) set(x, 3, -10, PLANK);   // forro: interior escuro
  for (const [x, z] of [[2, -6], [10, -6]]) set(x, 0, z, HAY);
  set(-3, 0, -6, TARGET);                                    // alvo do arqueiro
}
function genPath() {
  const pts = [[-1, 16], [0, 8], [1.5, 3], [4.5, -2], [6, -5.5]];
  for (let s = 0; s <= 200; s++) {
    const k = s / 200 * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(k)), f = k - i;
    const x = lerp(pts[i][0], pts[i + 1][0], f), z = lerp(pts[i][1], pts[i + 1][1], f);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const bx = Math.floor(x + dx * .6), bz = Math.floor(z + dz * .6); if (get(bx, -1, bz) === GRASS && topY(bx, bz) === -1) set(bx, -1, bz, PATH); }
  }
}
const TREES = [[-6, -7, 5], [-10, -14, 6], [-1, -17, 5], [-16, -18, 7], [-22, -6, 6], [-28, -15, 6], [-34, -4, 5], [-26, -36, 6], [-38, -24, 7],
  [13, -4, 5], [16, -15, 6], [12, -24, 5], [21, -6, 6], [25, -20, 7], [19, -32, 6], [30, -10, 5],
  [-10, 9, 5], [12, 11, 6], [-18, 16, 6], [6, 20, 5], [-4, 25, 6], [20, 22, 5], [-28, 8, 6], [28, 6, 6],
  [-1, -13, 5], [13, -13, 5], [-30, -30, 6], [34, -26, 6], [-44, -12, 6], [42, -2, 6]];
const HERO_TREE = [-14, -17];
function genTrees() {
  for (const [tx, tz, th] of TREES) {
    const g = topY(tx, tz); if (inPond(tx, tz) || get(tx, g, tz) === WATER) continue;
    const big = tx === HERO_TREE[0] && tz === HERO_TREE[1], h = th + (big ? 1 : 0), R = big ? 3 : 2;
    for (let y = 1; y <= h; y++) set(tx, g + y, tz, LOG);
    set(tx, g, tz, DIRT);
    for (let dy = -2; dy <= 2; dy++) {
      const r = dy >= 1 ? R - 1 : R;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        const corner = Math.abs(dx) === r && Math.abs(dz) === r;
        if (corner && hash2(tx * 3 + dx, tz * 7 + dz + dy * 13) > (dy > 0 ? .1 : .55)) continue;
        if (dy === 2 && Math.abs(dx) + Math.abs(dz) > r) continue;
        const y = g + h + dy - 1; if (!get(tx + dx, y, tz + dz)) set(tx + dx, y, tz + dz, LEAVES);
      }
    }
  }
}
genTerrain(); genHouse(); genPath(); genTrees();

// Malha: só faces visíveis, AO por vértice (3 vizinhos), diagonal do quad escolhida pelo AO
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }
];
const opaque = b => b !== AIR && b !== LEAVES && b !== WATER && b !== GLASS;
const aoSolid = b => b !== AIR && b !== WATER;
function faceTile(b, f) {
  switch (b) {
    case GRASS: return f === 2 ? 'grass_top' : f === 3 ? 'dirt' : 'grass_side';
    case LOG: return f === 2 || f === 3 ? 'log_top' : 'log_side';
    case DIRT: return 'dirt'; case STONE: return 'stone'; case SAND: return 'sand'; case LEAVES: return 'leaves';
    case PLANK: return 'planks'; case COBBLE: return 'cobble'; case PATH: return f === 2 ? 'path' : 'dirt';
    case ROOF: return 'roof'; case GLASS: return 'glass'; case GRAVEL: return 'gravel';
    case HAY: return 'hay'; case TARGET: return (f === 1 || f === 4) ? 'target' : 'hay';
  }
  return 'stone';
}
const AO_LV = [.42, .62, .8, 1];
class GeoB {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; }
  quad(vs, nrm, uv, cs, flip) {
    const b = this.p.length / 3;
    for (let k = 0; k < 4; k++) { this.p.push(...vs[k]); this.n.push(...nrm); this.u.push(...uv[k]); this.c.push(cs[k], cs[k], cs[k]); }
    if (flip) this.i.push(b + 1, b + 2, b + 3, b + 1, b + 3, b); else this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i); g.computeBoundingSphere(); return g;
  }
}
function meshWorld() {
  const solid = new GeoB(), glow = new GeoB(), water = new GeoB();
  for (let x = WX0; x < WX1; x++) for (let y = WY0; y < WY1; y++) for (let z = WZ0; z < WZ1; z++) {
    const b = grid[gidx(x, y, z)]; if (!b) continue;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2], nb = get(nx, ny, nz);
      if (b === WATER) {
        if (nb === WATER || opaque(nb)) continue;
        const top = f === 2, drop = top ? .12 : 0, vs = F.c.map(c => [x + c[0], y + c[1] - (c[1] ? drop : 0), z + c[2]]);
        const uv = vs.map(v => top ? [v[0] * .5, v[2] * .5] : [(F.n[0] ? v[2] : v[0]) * .5, v[1] * .5]);
        water.quad(vs, F.n, uv, [1, 1, 1, 1], false); continue;
      }
      if (opaque(nb) || (nb === b && (b === LEAVES || b === GLASS))) continue;
      if (ny < WY0) continue;
      const ax = [0, 1, 2].filter(a => F.n[a] === 0), ao = [];
      for (const c of F.c) {
        const d1 = [0, 0, 0], d2 = [0, 0, 0]; d1[ax[0]] = c[ax[0]] ? 1 : -1; d2[ax[1]] = c[ax[1]] ? 1 : -1;
        const s1 = aoSolid(get(nx + d1[0], ny + d1[1], nz + d1[2])), s2 = aoSolid(get(nx + d2[0], ny + d2[1], nz + d2[2]));
        const cr = aoSolid(get(nx + d1[0] + d2[0], ny + d1[1] + d2[1], nz + d1[2] + d2[2]));
        ao.push(AO_LV[s1 && s2 ? 0 : 3 - (s1 + s2 + cr)]);
      }
      const T = TILE[faceTile(b, f)], uv = [[T.u0, T.v0], [T.u1, T.v0], [T.u1, T.v1], [T.u0, T.v1]];
      (b === GLASS ? glow : solid).quad(F.c.map(c => [x + c[0], y + c[1], z + c[2]]), F.n, uv, ao, ao[0] + ao[2] < ao[1] + ao[3]);
    }
  }
  return { solid: solid.build(), glow: glow.build(), water: water.build() };
}
const scene = new THREE.Scene();
const worldGeo = meshWorld();
const solidMat = new THREE.MeshLambertMaterial({ map: atlasTex, vertexColors: true, alphaTest: .5 });
const glowMat = new THREE.MeshLambertMaterial({ map: atlasTex, vertexColors: true, emissive: col('#FFB860'), emissiveIntensity: 0 });
const waterMat = new THREE.MeshStandardMaterial({ map: waterTex, color: col('#CFE3FF'), transparent: true, opacity: .82, roughness: .12, metalness: 0, depthWrite: false });
const worldMesh = new THREE.Mesh(worldGeo.solid, solidMat); worldMesh.castShadow = worldMesh.receiveShadow = true;
const glowMesh = new THREE.Mesh(worldGeo.glow, glowMat); glowMesh.castShadow = glowMesh.receiveShadow = true;
const waterMesh = new THREE.Mesh(worldGeo.water, waterMat); waterMesh.receiveShadow = true;
scene.add(worldMesh, glowMesh, waterMesh);

// Plantas (quads cruzados) e flor herói feita de micro-voxels
function decoGeo() {
  const g = new GeoB();
  for (let x = -44; x < 44; x++) for (let z = -60; z < 34; z++) {
    const h = topY(x, z); if (get(x, h, z) !== GRASS || get(x, h + 1, z) !== AIR) continue;
    if (Math.hypot(x + .5, z + .5) < 2.2) continue;
    if (x >= HOUSE.x0 - 1 && x <= HOUSE.x1 + 1 && z >= HOUSE.z0 - 1 && z <= HOUSE.z1 + 2) continue;
    const r = hash2(x * 1.31, z * 2.77); if (r > .16) continue;
    let kind = r < .022 ? 'flower_red' : r < .04 ? 'flower_yel' : 'tallgrass';
    if (kind !== 'tallgrass' && z > -1 && Math.abs(x + .5) < 4) kind = 'tallgrass';
    const T = TILE[kind], s = kind === 'tallgrass' ? .9 : .75;
    const ox = (hash2(x, z * 3) - .5) * .3, oz = (hash2(x * 5, z) - .5) * .3, y0 = h + 1, uv = [[T.u0, T.v0], [T.u1, T.v0], [T.u1, T.v1], [T.u0, T.v1]];
    const a = [x + .15 + ox, z + .15 + oz], b = [x + .85 + ox, z + .85 + oz], c = [x + .85 + ox, z + .15 + oz], d = [x + .15 + ox, z + .85 + oz];
    for (const [p, q] of [[a, b], [b, a], [c, d], [d, c]]) g.quad([[p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y0 + s, q[1]], [p[0], y0 + s, p[1]]], [0, 1, 0], p === a || p === c ? uv : [uv[1], uv[0], uv[3], uv[2]], [1, 1, 1, 1]);
  }
  return g.build();
}
const decoMat = new THREE.MeshLambertMaterial({ map: atlasTex, vertexColors: true, alphaTest: .5 });
const decoMesh = new THREE.Mesh(decoGeo(), decoMat); decoMesh.castShadow = false; decoMesh.receiveShadow = true; scene.add(decoMesh);
const lamb = c => new THREE.MeshLambertMaterial({ color: col(c) });
function boxMesh(w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
const heroFlower = new THREE.Group();
{
  const g = lamb('#3E7A3E'), r = lamb('#E2373F'), y = lamb('#F6C744');
  heroFlower.add(boxMesh(.03, .26, .03, g, 0, .13, 0), boxMesh(.09, .02, .035, g, .045, .1, 0), boxMesh(.07, .02, .03, g, -.04, .16, 0));
  for (const [dx, dz] of [[.05, 0], [-.05, 0], [0, .05], [0, -.05]]) heroFlower.add(boxMesh(.06, .045, .06, r, dx, .28, dz));
  heroFlower.add(boxMesh(.05, .05, .05, y, 0, .285, 0), boxMesh(.05, .03, .05, r, 0, .32, 0));
  heroFlower.position.set(-.45, 0, .4); scene.add(heroFlower);
}

// Chão além do mundo, montanhas distantes (voxels de 8 m), nuvens em blocos
const farGround = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ map: grassFarTex, color: col('#C9DDB8') }));
farGround.rotation.x = -Math.PI / 2; farGround.position.y = -.03; farGround.receiveShadow = true; scene.add(farGround);
function mountainGeo() {
  const g = new GeoB(), S = 8, hAt = (x, z) => { if (z > -90 && Math.abs(x) < 70) return 0; const k = sstep(-80, -260, z) + sstep(80, 260, Math.abs(x)) * .7; return Math.floor(Math.max(0, fbm(x * .0042 + 9, z * .0042) * 1.7 - .45) * 150 * clamp(k, 0, 1) / S) * S; };
  const colr = y => y > 95 ? [.92, .94, .97] : y > 48 ? [.5, .5, .53] : [.34, .52, .27];
  for (let x = -720; x < 720; x += S) for (let z = -800; z < 40; z += S) {
    const h = hAt(x, z); if (h <= 0) continue;
    const c = colr(h);
    g.quad([[x, h, z + S], [x + S, h, z + S], [x + S, h, z], [x, h, z]], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [1, 1, 1, 1]);
    g.c.splice(g.c.length - 12, 12, ...c, ...c, ...c, ...c);
    for (const [dx, dz, F] of [[1, 0, 0], [-1, 0, 1], [0, 1, 4], [0, -1, 5]]) {
      const nh = hAt(x + dx * S, z + dz * S); if (nh >= h) continue;
      const fc = FACES[F].c.map(cc => [x + cc[0] * S, nh + cc[1] * (h - nh), z + cc[2] * S]), cs = colr(h).map(v => v * .72);
      g.quad(fc, FACES[F].n, [[0, 0], [1, 0], [1, 1], [0, 1]], [1, 1, 1, 1]); g.c.splice(g.c.length - 12, 12, ...cs, ...cs, ...cs, ...cs);
    }
  }
  return g.build();
}
const mountainMat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, emissive: col('#C4DDEF'), emissiveIntensity: .5 });
const mountains = new THREE.Mesh(mountainGeo(), mountainMat); scene.add(mountains);
const cloudGroup = new THREE.Group(); scene.add(cloudGroup);
const cloudMat = new THREE.MeshLambertMaterial({ color: col('#FFFFFF'), emissive: col('#FFFFFF'), emissiveIntensity: .45, transparent: true, opacity: .92, fog: false });
{
  const cells = [], C = 10, P = 100;   // período de 100 células (1000 m) para o loop sem emenda
  for (let gx = 0; gx < P; gx++) for (let gz = -70; gz < 50; gz++) { const n = fbm(gx * .18 + Math.sin(gx / P * TAU) * 3, gz * .22) ; if (n > .6) cells.push([gx, gz]); }
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(C, 3, C), cloudMat, cells.length * 2), m = new THREE.Matrix4();
  cells.forEach(([gx, gz], i) => { for (let r = 0; r < 2; r++) { m.makeTranslation((gx + r * P) * C - P * C, 70, gz * C); im.setMatrixAt(i * 2 + r, m); } });
  im.instanceMatrix.needsUpdate = true; cloudGroup.add(im);
}

// Céu: gradiente, sol/lua em HDR, estrelas
const skyUni = { top: { value: col('#5E9FE0') }, hor: { value: col('#C6E2F4') }, bot: { value: col('#8DA878') }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: col('#FFF3DC') }, sunOn: { value: 0 }, sunSize: { value: 1 }, moonDir: { value: new THREE.Vector3(0, 1, 0) }, moonOn: { value: 0 }, stars: { value: 0 }, time: { value: 0 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyUni, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vDir; void main(){ vec4 wp = modelMatrix*vec4(position,1.); vDir = normalize(wp.xyz - cameraPosition); gl_Position = projectionMatrix*viewMatrix*wp; gl_Position.z = gl_Position.w; }`,
  fragmentShader: `uniform vec3 top, hor, bot, sunDir, sunCol, moonDir; uniform float sunOn, sunSize, moonOn, stars, time; varying vec3 vDir;
  float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
  void main(){ vec3 d = normalize(vDir); float h = d.y;
    vec3 c = mix(hor, top, pow(smoothstep(0.0, 1.0, max(h, 0.0)), .55));
    c = mix(c, bot, smoothstep(0.0, -.18, h));
    float s = max(dot(d, sunDir), 0.0);
    c += sunCol * (pow(s, 5.0)*.22 + pow(s, 60.0)*.5) * sunOn;
    c += sunCol * smoothstep(1.0 - .00035*sunSize, 1.0 - .00018*sunSize, s) * 14.0 * sunOn;
    float m = max(dot(d, moonDir), 0.0);
    c += vec3(.75,.82,1.0) * (smoothstep(.99955, .9997, m)*3.0 + pow(m, 80.0)*.12) * moonOn;
    if (stars > 0.0 && h > 0.02) { vec3 q = floor(d*220.0); float r = h3(q); if (r > .9965) c += vec3(1.0) * stars * (.6 + .4*sin(time*3.0 + r*90.0)) * smoothstep(.02, .2, h); }
    gl_FragColor = vec4(c, 1.0); }`
}));
sky.renderOrder = -1; scene.add(sky);

// ───────────────────────── Adereços: postes com lanterna, tochas, varal de luzes, neon
const darkWood = lamb('#4A3626');
const lanternMat = new THREE.MeshLambertMaterial({ color: col('#FFE2A8'), emissive: col('#FFB860'), emissiveIntensity: 0 });
const props = new THREE.Group(); scene.add(props);
const lampPosts = [[2.9, -3.2], [10.1, -3.2]].map(([x, z]) => {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  g.add(boxMesh(.16, 2.5, .16, darkWood, 0, 1.25, 0), boxMesh(.42, .08, .42, darkWood, 0, 2.52, 0));
  const lan = boxMesh(.3, .34, .3, lanternMat, 0, 2.32, 0); lan.castShadow = false; g.add(lan);
  const L = new THREE.PointLight(col('#FFC27A'), 0, 16, 2); L.position.set(0, 2.2, .25); g.add(L);
  props.add(g); return { g, L };
});
const torchMat = new THREE.MeshLambertMaterial({ color: col('#FFD27A'), emissive: col('#FF9A3C'), emissiveIntensity: 0 });
const torches = [[5.5, -5.85], [7.5, -5.85]].map(([x, z]) => {
  const g = new THREE.Group(); g.position.set(x, 1.7, z);
  g.add(boxMesh(.08, .42, .08, darkWood, 0, 0, 0)); const fl = boxMesh(.12, .14, .12, torchMat, 0, .26, 0); fl.castShadow = false; g.add(fl);
  const L = new THREE.PointLight(col('#FF9A44'), 0, 9, 2); L.position.set(0, .4, .3); g.add(L);
  props.add(g); return { g, L, fl };
});
const bulbs = new THREE.Group(); props.add(bulbs);
const bulbMats = ['#FFC878', '#FFAE70', '#FFE0A0'].map(c => new THREE.MeshBasicMaterial({ color: col(c) }));
{
  const A = [-6.5, -9], B = [2.2, -9.5];
  for (const [x, z] of [A, B]) bulbs.add(boxMesh(.12, 3.1, .12, darkWood, x, 1.55, z));
  const wirePts = [];
  for (let i = 0; i <= 26; i++) {
    const k = i / 26, x = lerp(A[0], B[0], k), z = lerp(A[1], B[1], k), y = 3.0 - Math.sin(k * Math.PI) * .55;
    wirePts.push(new THREE.Vector3(x, y + .04, z));
    const s = new THREE.Mesh(new THREE.SphereGeometry(.075, 8, 6), bulbMats[i % 3]); s.position.set(x, y, z); bulbs.add(s);
  }
  bulbs.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wirePts), new THREE.LineBasicMaterial({ color: col('#2A2420') })));
}
const neon = new THREE.Group(); props.add(neon);
const neonM = new THREE.MeshBasicMaterial({ color: col('#FF3FA4') }), neonC = new THREE.MeshBasicMaterial({ color: col('#3FE6FF') });
{ const ring = new THREE.Mesh(new THREE.TorusGeometry(.42, .045, 6, 20), neonM); ring.position.set(6.5, 3.2, -5.9); neon.add(ring); }
neon.add(boxMesh(3.8, .06, .06, neonC, 6.5, 2.75, -5.9));
const neonL1 = new THREE.PointLight(col('#FF3FA4'), 0, 14, 2); neonL1.position.set(6.5, 3.2, -5.2);
const neonL2 = new THREE.PointLight(col('#3FE6FF'), 0, 14, 2); neonL2.position.set(3.5, 2.6, -4.8);
props.add(neonL1, neonL2);

// ───────────────────────── Elenco (skins pintadas pixel a pixel; personagens originais)
const PXs = .9 / 16;   // 1 pixel de skin = 5,6 cm (personagem de 32 px = 1,8 m)
function canvas64() { const c = document.createElement('canvas'); c.width = c.height = 64; return c; }
function painter(c) {
  const g = c.getContext('2d');
  const px = (x, y, rgb) => { g.fillStyle = `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`; g.fillRect(x, y, 1, 1); };
  const area = (x0, y0, w, h, base, v = .1, s = 1) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px(x0 + x, y0 + y, sh(base, 1 + (hash2(x0 + x + s * 17, y0 + y * 1.3) - .5) * v * 2)); };
  const map = (x0, y0, rows, pal) => rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) px(x0 + x, y0 + y, sh(pal[ch], 1 + (hash2(x0 + x, y0 + y) - .5) * .08)); }));
  return { px, area, map };
}
const hx = h => { const c = parseInt(h.slice(1), 16); return [c >> 16 & 255, c >> 8 & 255, c & 255]; };
// layout (px): cabeça 8³, corpo 8×12×4, braço/perna 4×12×4, membros finos 2×12×2
const UV = {
  head: { px: [0, 8, 8, 8], nx: [16, 8, 8, 8], py: [8, 0, 8, 8], ny: [16, 0, 8, 8], pz: [8, 8, 8, 8], nz: [24, 8, 8, 8] },
  body: { px: [16, 20, 4, 12], nx: [28, 20, 4, 12], py: [20, 16, 8, 4], ny: [28, 16, 8, 4], pz: [20, 20, 8, 12], nz: [32, 20, 8, 12] },
  arm: { px: [40, 20, 4, 12], nx: [48, 20, 4, 12], py: [44, 16, 4, 4], ny: [48, 16, 4, 4], pz: [44, 20, 4, 12], nz: [52, 20, 4, 12] },
  leg: { px: [0, 20, 4, 12], nx: [8, 20, 4, 12], py: [4, 16, 4, 4], ny: [8, 16, 4, 4], pz: [4, 20, 4, 12], nz: [12, 20, 4, 12] },
  tarm: { px: [40, 34, 2, 12], nx: [44, 34, 2, 12], py: [42, 32, 2, 2], ny: [44, 32, 2, 2], pz: [42, 34, 2, 12], nz: [46, 34, 2, 12] },
  tleg: { px: [0, 34, 2, 12], nx: [4, 34, 2, 12], py: [2, 32, 2, 2], ny: [4, 32, 2, 2], pz: [2, 34, 2, 12], nz: [6, 34, 2, 12] }
};
function skinGeo(w, h, d, rects) {
  const g = new THREE.BoxGeometry(w * PXs, h * PXs, d * PXs), uv = g.attributes.uv, order = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
  for (let f = 0; f < 6; f++) { const r = rects[order[f]]; for (let k = 0; k < 4; k++) { const i = f * 4 + k, u = uv.getX(i), v = uv.getY(i); uv.setXY(i, (r[0] + u * r[2]) / 64, 1 - (r[1] + (1 - v) * r[3]) / 64); } }
  return g;
}
function paintHumanSkin(c, o) {
  const { area, map, px } = painter(c);
  const S = hx(o.skin), H = hx(o.hair), J = hx(o.jacket), P = hx(o.pants), B = hx(o.boots), SC = o.scarf ? hx(o.scarf) : null;
  const pal = { H, S, W: [250, 250, 250], P: hx(o.eye || '#2B3A67'), N: sh(S, .9), M: hx(o.mouth || '#8C4B3A'), K: [26, 22, 22], R: hx('#E07A7A'), D: sh(S, .8), G: hx('#F0F0E8'), T: J };
  const face = o.face || ['HHHHHHHH', 'HHHHHHHH', 'HSSSSSSH', 'SSSSSSSS', 'SWPSSPWS', 'SRSSSSRS', 'SSMSSMSS', 'SSSMMSSS'];
  map(8, 8, face, pal);
  area(8, 0, 8, 8, H, .12, 2); area(16, 0, 8, 8, S, .06);
  for (const x0 of [0, 16]) { area(x0, 8, 8, 8, S, .06); area(x0, 8, 8, 3, H, .12); area(x0 + (x0 ? 0 : 6), 11, 2, 2, H, .12); }
  area(24, 8, 8, 8, H, .12); area(24, 15, 8, 1, S, .05);
  // corpo
  area(16, 16, 24, 16, J, .08, 3);
  if (o.zip) for (let y = 23; y < 30; y++) px(o.zip, y, sh(J, .78));
  if (SC) { area(20, 20, 8, 2, SC, .1); area(16, 20, 4, 2, SC, .1); area(28, 20, 4, 2, SC, .1); area(32, 20, 8, 2, SC, .1); area(20, 16, 8, 4, SC, .1); }
  if (o.belt) { for (const [x0, w] of [[16, 4], [20, 8], [28, 4], [32, 8]]) { area(x0, 29, w, 1, hx(o.belt), .1); area(x0, 30, w, 2, P, .08); } px(23, 29, [210, 180, 80]); px(24, 29, [210, 180, 80]); }
  if (o.ribs) { area(16, 20, 24, 12, [52, 52, 56], .1); for (let y = 21; y < 30; y += 2) for (let x = 20; x < 28; x++) if (x !== 23 && x !== 24) px(x, y, sh(hx('#DCD8CC'), .95)); for (let y = 20; y < 32; y++) { px(23, y, hx('#DCD8CC')); px(24, y, hx('#DCD8CC')); } }
  // braços: manga, punho, mão
  area(40, 16, 16, 16, J, .08, 5); for (const x0 of [40, 44, 48, 52]) { area(x0, 28, 4, 1, sh(J, .8), .05); area(x0, 29, 4, 3, S, .06); }
  area(44, 16, 8, 4, J, .08); area(48, 16, 4, 4, S, .05);
  // pernas: calça e botas
  area(0, 16, 16, 16, P, .08, 7); for (const x0 of [0, 4, 8, 12]) area(x0, 28, 4, 4, B, .1); area(8, 16, 4, 4, B, .1);
  // membros finos (esqueleto)
  if (o.thin) { area(40, 32, 8, 14, hx(o.thin), .1, 9); area(0, 32, 8, 14, hx(o.thin), .1, 11); }
  return c;
}
function makeHumanoid(o) {
  const skin = paintHumanSkin(canvas64(), o), skinB = canvas64();
  skinB.getContext('2d').drawImage(skin, 0, 0);
  const { map } = painter(skinB);
  map(8, 12, [o.blinkRow || 'SDDSSDDS'], { S: hx(o.skin), D: sh(hx(o.skin), .72) });
  const tex = texFrom(skin, true), texB = texFrom(skinB, true);
  const mat = new THREE.MeshLambertMaterial({ map: tex }), headMat = new THREE.MeshLambertMaterial({ map: tex });
  const thin = !!o.thin, AW = thin ? 2 : 4, LW = thin ? 2 : 4;
  const root = new THREE.Group(), hips = new THREE.Group(), torso = new THREE.Group();
  hips.position.y = 12 * PXs; root.add(hips); hips.add(torso);
  const mk = (geo, m) => { const ms = new THREE.Mesh(geo, m || mat); ms.castShadow = ms.receiveShadow = true; return ms; };
  const bodyM = mk(skinGeo(8, 12, 4, UV.body)); bodyM.position.y = 6 * PXs; torso.add(bodyM);
  const head = new THREE.Group(); head.position.y = 12 * PXs; torso.add(head);
  const headM = mk(skinGeo(8, 8, 8, UV.head), headMat); headM.position.y = 4 * PXs; head.add(headM);
  const limb = (x, y, w, uv, parent, off) => { const g = new THREE.Group(); g.position.set(x * PXs, y * PXs, 0); const m = mk(skinGeo(w, 12, w, uv)); m.position.y = off * PXs; g.add(m); parent.add(g); return g; };
  const armR = limb(-(4 + AW / 2), 10, AW, thin ? UV.tarm : UV.arm, torso, -4), armL = limb(4 + AW / 2, 10, AW, thin ? UV.tarm : UV.arm, torso, -4);
  const legR = limb(-LW / 2 - (thin ? 1 : 0), 0, LW, thin ? UV.tleg : UV.leg, hips, -6), legL = limb(LW / 2 + (thin ? 1 : 0), 0, LW, thin ? UV.tleg : UV.leg, hips, -6);
  const h = { root, hips, torso, head, headMat, tex, texB, armR, armL, legR, legL, bodyM, o, blinkOff: hash1(o.seed || 1) * 3 };
  if (o.scarf) { const tail = new THREE.Group(); tail.position.set(-2 * PXs, 11 * PXs, -2.2 * PXs); const m = boxMesh(2.2 * PXs, 7 * PXs, .8 * PXs, lamb(o.scarf), 0, -3.5 * PXs, 0); tail.add(m); torso.add(tail); h.tail = tail; }
  if (o.pack) { torso.add(boxMesh(6 * PXs, 7 * PXs, 2.6 * PXs, lamb('#7A5434'), 0, 6.5 * PXs, -3.3 * PXs), boxMesh(6.4 * PXs, 1.6 * PXs, 2.9 * PXs, lamb('#5E3F25'), 0, 9.6 * PXs, -3.3 * PXs)); }
  return h;
}
const explorer = makeHumanoid({ skin: '#D9A07A', hair: '#4A2F1F', jacket: '#2F6F8F', pants: '#2C3A55', boots: '#5A3E2B', scarf: '#D23A2F', zip: 24, belt: '#5A3E2B', pack: true, seed: 1 });
const companion = makeHumanoid({ skin: '#8D5A3B', hair: '#1E1814', jacket: '#C99A2E', pants: '#3A4A3A', boots: '#3A2A20', scarf: '#3B6FB6', belt: '#3A2A20', eye: '#3A2418', seed: 2,
  face: ['HHHHHHHH', 'HHHHHHHH', 'HHSSSSHH', 'HSSSSSSH', 'SWPSSPWS', 'SSSSSSSS', 'SSMSSMSS', 'SSSMMSSS'] });
const skeleton = makeHumanoid({ skin: '#DCD8CC', hair: '#DCD8CC', jacket: '#DCD8CC', pants: '#DCD8CC', boots: '#B9B4A6', thin: '#D6D2C4', ribs: true, mouth: '#3A3A3E', eye: '#141416', seed: 3,
  face: ['SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SKKSSKKS', 'SKKSSKKS', 'SSSKKSSS', 'SKSKSKSS', 'SSSSSSSS'], blinkRow: 'SKKSSKKS' });
const king = makeHumanoid({ skin: '#6DBE45', hair: '#4E9A32', jacket: '#3FAFB0', pants: '#2C3E6E', boots: '#26262C', belt: '#7A5434', mouth: '#2E1A1A', eye: '#101010', seed: 4,
  face: ['HHHHHHHH', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SKKSSKKS', 'SSSSSSSS', 'SSMMMMSS', 'SSSGSSSS'], blinkRow: 'SDDSSDDS' });
[explorer, companion, skeleton, king].forEach(h => scene.add(h.root));
// coroa, capa e espada do rei
{
  const gold = new THREE.MeshStandardMaterial({ color: col('#F2C230'), metalness: .6, roughness: .35, emissive: col('#3A2A00') });
  const crown = new THREE.Group(); crown.position.y = 8 * PXs; king.head.add(crown);
  crown.add(boxMesh(9 * PXs, 2 * PXs, 9 * PXs, gold, 0, 1 * PXs + 4 * PXs, 0));
  for (const [x, z] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5], [0, 3.5], [0, -3.5], [3.5, 0], [-3.5, 0]]) crown.add(boxMesh(2 * PXs, 2.2 * PXs, 2 * PXs, gold, x * PXs, 7 * PXs, z * PXs));
  const cape = new THREE.Group(); cape.position.set(0, 11.5 * PXs, -2.3 * PXs); king.torso.add(cape);
  cape.add(boxMesh(9 * PXs, 14 * PXs, .7 * PXs, lamb('#A32626'), 0, -7 * PXs, 0)); king.cape = cape;
  const sword = new THREE.Group(); sword.position.set(0, -10 * PXs, 1 * PXs); king.armR.add(sword);
  const blade = new THREE.MeshStandardMaterial({ color: col('#5FE0D0'), metalness: .3, roughness: .3, emissive: col('#0E4A44') });
  sword.add(boxMesh(1.4 * PXs, 1.4 * PXs, 4 * PXs, lamb('#5A3A22'), 0, 0, 0), boxMesh(5 * PXs, 1.2 * PXs, 1.4 * PXs, lamb('#1E6E66'), 0, 0, 2.6 * PXs), boxMesh(1.6 * PXs, 1.2 * PXs, 13 * PXs, blade, 0, 0, 9.5 * PXs));
}
// arco e flecha do esqueleto
const bow = new THREE.Group(); skeleton.armL.add(bow); bow.position.set(0, -10.5 * PXs, 0);
{
  const wood = lamb('#7A4E26');
  for (let i = -3; i <= 3; i++) { const k = i / 3; bow.add(boxMesh(1.4 * PXs, 1.6 * PXs, 2.4 * PXs, wood, 0, (1 - k * k) * -1.6 * PXs + 1.6 * PXs, k * 7.5 * PXs)); }
  const str = boxMesh(.3 * PXs, .3 * PXs, 15 * PXs, lamb('#DDDDDD'), 0, 1.6 * PXs + 1.4 * PXs, 0); bow.add(str); bow.string = str;
}
function arrowMesh() { const g = new THREE.Group(); g.add(boxMesh(.025, .025, .62, lamb('#8A6A40')), boxMesh(.06, .06, .08, lamb('#9A9AA2'), 0, 0, .33), boxMesh(.09, .012, .1, lamb('#EEEEEE'), 0, 0, -.27), boxMesh(.012, .09, .1, lamb('#EEEEEE'), 0, 0, -.27)); return g; }
const arrow = arrowMesh(); arrow.scale.setScalar(2.2); scene.add(arrow);
const nocked = arrowMesh(); skeleton.armR.add(nocked); nocked.visible = false;

// galinha (montaria gigante e galinhas soltas), vaca e slimes
function makeChicken(scale) {
  const white = new THREE.MeshLambertMaterial({ map: smallTex(8, 8, (x, y, n) => sh([244, 244, 238], .9 + n * .12)) });
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.scale.setScalar(scale);
  body.add(boxMesh(.5, .44, .64, white, 0, .44, 0));
  const tail = boxMesh(.34, .26, .1, white, 0, .62, -.34); tail.rotation.x = -.4; body.add(tail);
  const head = new THREE.Group(); head.position.set(0, .58, .26); body.add(head);
  head.add(boxMesh(.3, .4, .26, white, 0, .16, .04), boxMesh(.3, .1, .16, lamb('#F2B134'), 0, .2, .24), boxMesh(.13, .14, .07, lamb('#D63030'), 0, .07, .2), boxMesh(.12, .09, .2, lamb('#D63030'), 0, .41, .04));
  for (const s of [-1, 1]) head.add(boxMesh(.02, .05, .05, lamb('#111111'), s * .151, .26, .1));
  const wing = s => { const g = new THREE.Group(); g.position.set(s * .26, .6, 0); g.add(boxMesh(.06, .3, .44, white, 0, -.15, 0)); body.add(g); return g; };
  const leg = s => { const g = new THREE.Group(); g.position.set(s * .11, .23, 0); g.add(boxMesh(.05, .23, .05, lamb('#E3A82B'), 0, -.115, 0), boxMesh(.16, .03, .2, lamb('#E3A82B'), 0, -.22, .04)); root.add(g); return g; };
  const c = { root, body, head, wingL: wing(1), wingR: wing(-1), legL: leg(1), legR: leg(-1) };
  scene.add(root); return c;
}
const mount = makeChicken(2.3), hens = [0, 1, 2].map(() => makeChicken(1));
function makeCow() {
  const spots = (x, y, n) => { const v = vnoise(x * .45 + 3, y * .45); return v > .62 ? [34, 30, 30] : sh([236, 232, 226], .92 + n * .1); };
  const skinM = new THREE.MeshLambertMaterial({ map: smallTex(16, 16, spots) });
  const root = new THREE.Group(); root.add(boxMesh(.9, .78, 1.4, skinM, 0, 1.0, 0), boxMesh(.36, .14, .3, lamb('#E8A0A8'), 0, .58, -.3));
  const head = new THREE.Group(); head.position.set(0, 1.18, .7); root.add(head);
  head.add(boxMesh(.56, .54, .46, skinM, 0, 0, .18), boxMesh(.4, .24, .1, lamb('#E8A0A8'), 0, -.13, .45));
  for (const s of [-1, 1]) { head.add(boxMesh(.08, .14, .08, lamb('#D8CCAA'), s * .24, .3, .1), boxMesh(.03, .06, .03, lamb('#111111'), s * .15, .06, .42)); }
  const legs = [[-.3, .5], [.3, .5], [-.3, -.5], [.3, -.5]].map(([x, z]) => { const g = new THREE.Group(); g.position.set(x, .62, z); g.add(boxMesh(.24, .62, .24, skinM, 0, -.31, 0), boxMesh(.25, .08, .25, lamb('#2A2420'), 0, -.58, 0)); root.add(g); return g; });
  const tail = new THREE.Group(); tail.position.set(0, 1.3, -.71); tail.add(boxMesh(.06, .6, .06, skinM, 0, -.3, 0)); root.add(tail);
  scene.add(root); return { root, head, legs, tail };
}
const cows = [[14, 6, 1.2], [17.5, 2.5, -.5], [-17, -9, 2.6]].map(([x, z, f]) => Object.assign(makeCow(), { x, z, f }));
function makeSlime(size, tint) {
  const root = new THREE.Group(), inner = new THREE.Group(); root.add(inner);
  const outer = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0), new THREE.MeshStandardMaterial({ color: col(tint), transparent: true, opacity: .62, roughness: .15, depthWrite: false }));
  outer.castShadow = true; inner.add(outer);
  const core = boxMesh(.48, .48, .48, lamb('#1E7A5C'), 0, .4, 0); core.castShadow = false; inner.add(core);
  for (const s of [-1, 1]) inner.add(boxMesh(.14, .2, .03, lamb('#0E1A16'), s * .2, .62, .505));
  inner.add(boxMesh(.18, .06, .03, lamb('#0E1A16'), 0, .38, .505));
  root.scale.setScalar(size); scene.add(root); return { root, inner, size };
}
const slimes = [makeSlime(1, '#46C9A0'), makeSlime(.5, '#7BE0B8')];
const notes = [0, 1, 2].map(() => { const g = new THREE.Group(), m = lamb('#151820'); g.add(boxMesh(.06, .06, .02, m, 0, 0, 0), boxMesh(.015, .14, .015, m, .025, .07, 0), boxMesh(.05, .015, .015, m, .045, .14, 0)); g.visible = false; scene.add(g); return g; });

// ───────────────────────── Poses (parâmetros → rotações), com interpolação para pose a pose
const POSE0 = { armRx: 0, armRz: 0, armLx: 0, armLz: 0, headX: 0, headY: 0, torsoX: 0, legRx: 0, legLx: 0, legRz: 0, legLz: 0, hipsY: 0, rootY: 0, sy: 1 };
const KEYPOSES = [
  {}, { armRx: -1.45, headY: -.25 }, { armRz: -.45, armLz: .45, armRx: .25, armLx: .25, headY: .15 }, { armRz: -2.7, headX: -.1 }, { armRz: -2.8, armLz: 2.8, headX: -.3, rootY: .05 }
];
function applyPose(h, p) {
  h.armR.rotation.set(p.armRx, 0, p.armRz); h.armL.rotation.set(p.armLx, 0, p.armLz);
  h.head.rotation.set(p.headX, p.headY, 0); h.torso.rotation.set(p.torsoX, 0, 0);
  h.legR.rotation.set(p.legRx, 0, p.legRz); h.legL.rotation.set(p.legLx, 0, p.legLz);
  h.hips.position.y = 12 * PXs + p.hipsY; h.root.position.y += p.rootY; h.root.scale.set(1 / Math.sqrt(p.sy), p.sy, 1 / Math.sqrt(p.sy));
}
function poseFor(act, ts, o) {
  const p = Object.assign({}, POSE0), br = Math.sin(ts * 2.1) * .012;
  p.hipsY = br; p.armRz = -.04 - br; p.armLz = .04 + br;
  let speed = 0;
  const walkP = (w, amp) => { p.legRx = Math.sin(w) * amp; p.legLx = -Math.sin(w) * amp; p.armRx = -Math.sin(w) * amp * .85; p.armLx = Math.sin(w) * amp * .85; p.hipsY += (1 - Math.abs(Math.sin(w))) * .035 * amp / .6; };
  switch (act) {
    case 'walk': case 'whistle': walkP(ts * 7, .6); speed = .55; p.headX = Math.sin(ts * 14) * .03; if (act === 'whistle') p.headY = Math.sin(ts * 1.3) * .25; break;
    case 'run': walkP(ts * 11, .95); p.torsoX = .18; speed = 1; break;
    case 'hop': {
      const k = fract(ts / 2.2);
      if (k > .35 && k <= .5) { const c = sstep(.35, .5, k); p.hipsY -= .12 * c; p.torsoX = .3 * c; p.armRx = p.armLx = .7 * c; p.legRx = p.legLx = -.35 * c; p.sy = 1 - .07 * c; }
      else if (k > .5 && k <= .78) { const j = (k - .5) / .28; p.rootY = 4 * .62 * j * (1 - j); p.armRx = p.armLx = -2.4 * Math.sin(Math.min(1, j * 2) * Math.PI / 2); p.legRx = .3; p.legLx = .15; p.sy = 1 + .08 * (1 - j); }
      else if (k > .78 && k <= .88) { const c = 1 - (k - .78) / .1; p.hipsY -= .1 * c; p.sy = 1 - .08 * c; p.armRx = p.armLx = .3 * c; }
      speed = k > .5 && k < .78 ? .8 : 0; break;
    }
    case 'wave': p.armRz = -2.7 + Math.sin(ts * 8) * .35; p.headY = .1; p.headX = Math.sin(ts * 2) * .04; break;
    case 'lookup': { const k = sstep(0, .8, fract(ts / 7) * 7); p.headX = -.62 * k; p.torsoX = -.06 * k; p.armRz -= .05; break; }
    case 'point': p.armRx = -1.45; p.headY = -.15; break;
    case 'hips': p.armRz = -.45; p.armLz = .45; p.armRx = .25; p.armLx = .25; p.headY = Math.sin(ts * .5) * .2; break;
    case 'celebrate': { p.armRz = -2.8 + Math.sin(ts * 9) * .15; p.armLz = 2.8 - Math.sin(ts * 9) * .15; p.rootY = Math.abs(Math.sin(ts * 4.5)) * .18; break; }
    case 'talk': p.headX = Math.sin(ts * 5) * .12; p.armRx = -.7 + Math.sin(ts * 3) * .3; p.armRz = -.2; break;
    case 'turn': { const k = sstep(.15, .35, fract(ts / 4)) - sstep(.75, .95, fract(ts / 4)); p.headY = .95 * k; p.torsoX = -.04 * k; break; }
    case 'scared': p.armRx = p.armLx = -2.1 + Math.sin(ts * 30) * .05; p.torsoX = -.22; p.headX = .1; break;
    case 'ride': p.legRx = p.legLx = -1.45; p.legRz = -.32; p.legLz = .32; p.armRx = -2.3 + Math.sin(ts * 2.4) * .25; p.armLx = -.6; p.armLz = .2; p.hipsY = 0; break;
    case 'sit': p.legRx = p.legLx = -1.5; p.rootY = -.6; p.armRx = p.armLx = -.4; break;
    case 'blink': p.headX = .03; break;
    case 'poses': {   // pose a pose: segura cada pose-chave e troca com ease
      const T = 1.1, i = Math.floor(ts / T), k = sstep(0, .28, fract(ts / T)), A = KEYPOSES[i % KEYPOSES.length], B = KEYPOSES[(i + 1) % KEYPOSES.length];
      for (const key in POSE0) if (key !== 'sy') p[key] = lerp(A[key] == null ? POSE0[key] : A[key], B[key] == null ? POSE0[key] : B[key], k) + (key === 'hipsY' ? br : 0);
      break;
    }
    case 'aim': {   // ciclo do arqueiro
      const k = fract(ts / 3.4), up = sstep(0, .14, k) - sstep(.9, 1, k), draw = sstep(.14, .42, k) - sstep(.44, .47, k);
      p.armLx = -1.5 * up; p.armRx = -1.5 * up; p.armRz = .35 * up - .25 * draw; p.headY = .1 * up; p.torsoX = -.04 * up; o.draw = draw; o.k = k; break;
    }
    default: p.headY = Math.sin(ts * .45) * .28; p.headX = Math.sin(ts * .31) * .05; p.armRx = Math.sin(ts * 1.1) * .04; p.armLx = -Math.sin(ts * 1.1) * .04;
  }
  if (o) o.speed = speed;
  return p;
}
function animateHuman(h, act, ts, extra) {
  h.root.position.y = 0;
  const o = extra || {}, p = poseFor(act, ts, o);
  applyPose(h, p);
  h.headMat.map = fract((ts + h.blinkOff) / 3.3) < .045 || act === 'blink' && fract(ts / 1.2) < .2 ? h.texB : h.tex;
  if (h.tail) h.tail.rotation.x = .2 + (o.speed || 0) * .9 + Math.sin(ts * 7.3) * (.06 + (o.speed || 0) * .1) + (o.tailKick || 0);
  return o;
}

// ───────────────────────── Partículas e objetos de primeiro plano
const rain = (() => { const N = 1400, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 6), 3)); const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: col('#DCE8F6'), transparent: true, opacity: .75 })); m.frustumCulled = false; scene.add(m); m.N = N; return m; })();
const snow = (() => { const N = 1600, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3)); const m = new THREE.Points(g, new THREE.PointsMaterial({ color: col('#FFFFFF'), size: .13, sizeAttenuation: true })); m.frustumCulled = false; scene.add(m); m.N = N; return m; })();
const dust = (() => { const N = 500, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3)); const m = new THREE.Points(g, new THREE.PointsMaterial({ color: col('#FFE6B0'), size: .025, sizeAttenuation: true, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false })); m.frustumCulled = false; scene.add(m); m.N = N; return m; })();
const leaves = (() => { const N = 26, m = new THREE.InstancedMesh(new THREE.PlaneGeometry(.11, .07), new THREE.MeshLambertMaterial({ color: col('#D5822E'), side: THREE.DoubleSide }), N); m.frustumCulled = false; m.castShadow = true; scene.add(m); return m; })();
const cam = new THREE.PerspectiveCamera(40, 16 / 9, .05, 2600); cam.filmGauge = 36;
const ocam = new THREE.OrthographicCamera(-10, 10, 5.6, -5.6, .1, 3000);
scene.add(cam);
const leafM = new THREE.MeshLambertMaterial({ color: col('#2F6A35') }), leafM2 = new THREE.MeshLambertMaterial({ color: col('#4C8C3E') });
function leafCluster(n, spread, seedv) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) { const s = .1 + hash1(i + seedv) * .12, m = boxMesh(s, s * .5, s, i % 3 ? leafM : leafM2, (hash1(i * 3 + seedv) - .5) * spread, (hash1(i * 7 + seedv) - .5) * spread * .45, (hash1(i * 11 + seedv) - .5) * spread * .3); m.rotation.set(hash1(i) * 2, hash1(i * 5) * 3, 0); m.castShadow = false; g.add(m); }
  return g;
}
const rackBranch = new THREE.Group(); { const tw = boxMesh(.7, .025, .025, lamb('#3A2A20'), .1, -.05, 0); tw.rotation.z = .5; rackBranch.add(tw, leafCluster(16, .38, 3)); }
rackBranch.position.set(-.36, -.16, -2.2); cam.add(rackBranch);
const fgFrame = new THREE.Group(); [[-.7, .38], [.72, .36], [-.78, -.3], [.8, -.34], [0, .5]].forEach(([x, y], i) => { const c = leafCluster(30, .7, i * 17); c.position.set(x, y, -1.15); fgFrame.add(c); }); cam.add(fgFrame);
const povArms = new THREE.Group(); { const jm = lamb('#2F6F8F'), sk = lamb('#D9A07A'); for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(s * .32, -.36, -.55); a.rotation.set(-1.2, 0, s * .2); a.add(boxMesh(.12, .5, .12, jm, 0, -.1, 0), boxMesh(.125, .14, .125, sk, 0, -.42, 0)); povArms.add(a); } } cam.add(povArms);

// ───────────────────────── Luzes
const sun = new THREE.DirectionalLight(0xffffff, 3); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .03; sun.shadow.camera.near = 1; sun.shadow.camera.far = 400;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbfd9f2, 0x6e8b4a, 1); scene.add(hemi);
const rimL = new THREE.DirectionalLight(0xffffff, 0); scene.add(rimL, rimL.target);
const fillL = new THREE.DirectionalLight(0xffffff, 0); scene.add(fillL, fillL.target);
scene.fog = new THREE.FogExp2(0xc6dff0, .006);

// Presets de luz: direções em mundo (câmera padrão olha para -z); rel = relativo à câmera
const LP = {
  day: { sky: ['#4F92DA', '#C2E0F4', '#7F9E66'], sunDir: [-.45, .8, .42], sunCol: '#FFF1D6', sunI: 3.1, hemiS: '#BCD8F2', hemiG: '#6F8A4C', hemiI: 1.15, fog: '#C4DDEF', fogD: .0055, exp: 1, cloud: '#FFFFFF' },
  highkey: { sky: ['#A6D2F5', '#F2F8FC', '#A9CC92'], sunDir: [-.3, .9, .5], sunI: 2.2, hemiS: '#FFFFFF', hemiG: '#C2DDB0', hemiI: 2.3, fog: '#EAF3F8', fogD: .008, exp: 1.22, shadowR: 6 },
  lowkey: { sky: ['#04060A', '#0C121C', '#06080A'], rel: true, sunDir: [-.8, .4, .45], sunCol: '#FFE6C4', sunI: 5, hemiS: '#1A2230', hemiG: '#050607', hemiI: .03, fog: '#080B12', fogD: .035, exp: .95, spot: .78, stars: .15, cloud: '#151A22' },
  golden: { sky: ['#4C76B8', '#FFB468', '#6E6236'], sunDir: [-.62, .1, -.78], sunCol: '#FFAE5C', sunI: 3.8, sunDisc: 1, sunSize: 1.7, hemiS: '#FFD3A0', hemiG: '#7A6838', hemiI: 1.25, fog: '#F0B48A', fogD: .0085, exp: 1.2, fillI: .7, fillCol: '#FFC890', tint: '#FFB070', tintA: .26, cloud: '#FFD2AE' },
  blue: { sky: ['#132148', '#5B6FAA', '#1E2840'], sunDir: [.3, .55, .4], sunCol: '#8DA4FF', sunI: .7, hemiS: '#6A7EB8', hemiG: '#243048', hemiI: 1.15, fog: '#42558A', fogD: .011, exp: 1.4, tint: '#7C9CFF', tintA: .16, lamp: .75, win: .9, bulbs: .85, stars: .35, cloud: '#55648F' },
  night: { sky: ['#02040B', '#0E1630', '#04060B'], moon: [.35, .45, -.82], sunDir: [.35, .6, -.5], sunCol: '#93AAFF', sunI: .75, hemiS: '#2A3A6A', hemiG: '#0A0E16', hemiI: .7, fog: '#0B1330', fogD: .013, exp: 1.55, lamp: 1, win: 1, bulbs: 1, stars: 1, cloud: '#1B2238' },
  silhouette: { sky: ['#E07038', '#FFD890', '#251C24'], sunDir: [0, .09, -1], sunCol: '#FFC27E', sunI: 3.2, sunDisc: 1, sunSize: 3.4, hemiS: '#FFB070', hemiG: '#140E12', hemiI: .12, fog: '#F8B676', fogD: .03, exp: 1.15, tint: '#FF9A50', tintA: .14, cloud: '#FFB38A' },
  rim: { sky: ['#0A0E16', '#1A2232', '#090B10'], rel: true, sunDir: [-.9, .45, -.6], sunCol: '#FFE2A2', sunI: 6, rimI: 6, rimCol: '#FFE2A2', hemiS: '#30405A', hemiG: '#050608', hemiI: .16, fog: '#0E141E', fogD: .022, exp: 1.2, cloud: '#1A2030' },
  volumetric: { sky: ['#6894BC', '#D4E5EE', '#5A7650'], sunDir: [-.28, .5, -.82], sunCol: '#FFEEC8', sunI: 3.4, sunDisc: 1, hemiS: '#C9DCEA', hemiG: '#4A5A38', hemiI: .85, fillI: .4, fog: '#C2D6E2', fogD: .02, rays: 1, exp: 1 },
  chiaro: { sky: ['#030406', '#0A0C10', '#040506'], rel: true, sunDir: [-.85, .3, .42], sunCol: '#FFE2BC', sunI: 6.5, hemiS: '#141820', hemiG: '#030304', hemiI: .015, fog: '#06080A', fogD: .04, exp: .95, spot: .88, cloud: '#101216' },
  hard: { sky: ['#3F8BDC', '#BCDDF3', '#7F9E66'], sunDir: [-.35, .92, .25], sunCol: '#FFFBEA', sunI: 4.4, hemiI: .7, shadowR: .6 },
  soft: { sky: ['#9AAEBF', '#DCE4EA', '#8A9A80'], sunDir: [-.3, .85, .3], sunCol: '#EEF2F6', sunI: .8, hemiS: '#E6ECF2', hemiG: '#8A9A80', hemiI: 2.1, fog: '#D4DCE2', fogD: .011, shadowR: 9, cloud: '#E8ECEF' },
  practical: { sky: ['#030610', '#0F172E', '#04060B'], sunDir: [.35, .6, -.5], sunCol: '#7F96E0', sunI: .3, hemiS: '#1E2A4E', hemiG: '#05070B', hemiI: .35, fog: '#0A1128', fogD: .015, exp: 1.5, lamp: 1.35, win: 1.25, bulbs: .3, stars: .6, cloud: '#161C30' },
  neon: { sky: ['#07020F', '#22103A', '#07030C'], sunDir: [.35, .6, -.5], sunCol: '#7A5AC8', sunI: .3, hemiS: '#4A2270', hemiG: '#08040E', hemiI: .45, fog: '#170A26', fogD: .02, exp: 1.45, neon: 1, rimI: 2.6, rimCol: '#FF3FA4', fillI: 1.1, fillCol: '#3FE6FF', win: .4, bulbs: .5, stars: .4, cloud: '#24123A' },
  studio: { sky: ['#0B0F16', '#1C2433', '#0A0C10'], rel: true, sunDir: [-.85, .45, .35], sunCol: '#FFF0DC', sunI: 4.2, hemiS: '#3A4458', hemiG: '#08090C', hemiI: .05, fog: '#121822', fogD: .02, exp: 1.05, cloud: '#1C2230' }
};
const LBASE3 = { tint: '#FFFFFF', tintA: 0, fillCol: '#DCE6FF', sky: ['#4F92DA', '#C2E0F4', '#7F9E66'], rel: false, sunDir: [-.45, .8, .42], sunCol: '#FFF1D6', sunI: 3.1, sunDisc: 0, sunSize: 1, moon: null, hemiS: '#BCD8F2', hemiG: '#6F8A4C', hemiI: 1.15, fog: '#C4DDEF', fogD: .0055, exp: 1, lamp: 0, win: 0, bulbs: 0, stars: 0, neon: 0, rays: 0, spot: 0, rimI: 0, rimCol: '#FFFFFF', fillI: 0, cloud: '#FFFFFF', shadowR: 2, label: null };
function preset(name) { return Object.assign({}, LBASE3, LP[name] || {}); }
function mixPreset(a, b, k) {
  const o = {};
  for (const key in a) {
    const x = a[key], y = b[key];
    if (typeof x === 'number' && typeof y === 'number') o[key] = lerp(x, y, k);
    else if (typeof x === 'string' && x[0] === '#' && typeof y === 'string') o[key] = '#' + col(x).lerp(col(y), k).getHexString();
    else if (Array.isArray(x) && Array.isArray(y) && typeof x[0] === 'string') o[key] = x.map((c, i) => '#' + col(c).lerp(col(y[i]), k).getHexString());
    else if (Array.isArray(x) && Array.isArray(y)) o[key] = x.map((v, i) => lerp(v, y[i], k));
    else o[key] = k < .5 ? x : y;
  }
  return o;
}
function lightAt(name, ts) {
  if (name === 'cycle') {
    const seq = ['day', 'golden', 'blue', 'night', 'blue', 'day'], u = fract(ts / 60) * (seq.length - 1), i = Math.floor(u);
    const L = mixPreset(preset(seq[i]), preset(seq[i + 1]), sstep(0, 1, u - i)), a = fract(ts / 60) * TAU;
    L.sunDir = [Math.cos(a) * .8, Math.max(.05, Math.sin(a * .5 + .3) * .8), -.5]; L.sunDisc = 1; L.rel = false; L.spot = 0;
    return L;
  }
  if (name === 'key') { const L = preset('studio'), a = Math.sin(ts * .9); L.sunDir = [a, .45, .5 - Math.abs(a) * .3]; L.label = 'KEY ' + (a < -.2 ? '← esquerda' : a > .2 ? 'direita →' : 'frontal'); return L; }
  if (name === 'fill') { const L = preset('studio'), k = ease(pp(fract(ts / 5))); L.hemiI = lerp(.03, 1.6, k); L.fillI = lerp(0, 1.6, k); L.label = 'FILL ' + Math.round(k * 100) + '%'; return L; }
  if (name === 'rim') { const L = preset('rim'), on = fract(ts / 4) > .5; L.sunI = on ? 6 : 0; L.hemiI = on ? .07 : .25; L.fillI = on ? 0 : .8; L.label = on ? 'RIM ON' : 'RIM OFF'; return L; }
  if (name === 'three') {
    const L = preset('studio'), k = fract(ts / 7.5);
    if (k < 1 / 3) { L.label = '1 · KEY'; } else if (k < 2 / 3) { L.label = '2 · KEY + FILL'; L.fillI = 1.2; L.hemiI = .35; } else { L.label = '3 · KEY + FILL + RIM'; L.fillI = 1.2; L.hemiI = .35; L.rimI = 5; L.rimCol = '#FFD9A0'; }
    return L;
  }
  return preset(name);
}

// ───────────────────────── Estilos e grades de cor (uniforms do pós)
const STY = {
  none: {}, voxel: {},
  hand: { outline: 1, oc: '#3A2C24', paper: .38, fps: 12, boil: 1, sat: .9 },
  anime: { outline: .75, oc: '#1C1A28', poster: 7, sat: 1.3, con: 1.04, skyT: '#2E7FE0', skyH: '#BFE3FA' },
  cgi: { bloom: .5, dofMul: 1.25, sat: 1.06 },
  stop: { fps: 12, jitter: 1.2, vig: .42, sat: 1.12, sepia: .14, grain: .05, con: 1.04 },
  clay: { fps: 12, jitter: 1.4, sat: 1.45, vig: .32, con: .94, soft: .9, bri: 1.04, bloom: .25 },
  cutout: { paper: .72, fps: 12, outline: 1.1, oc: '#2A2018', flat: 1, sat: .9, poster: 9 },
  pixel: { pixel: 5, fps: 12, sat: 1.18, con: 1.06 },
  cel: { outline: 1.4, oc: '#101018', poster: 6, sat: 1.2 },
  water: { paper: .62, soft: 2.4, sat: .82, con: .9, bri: 1.05 },
  noir: { gray: 1, con: 1.38, bri: 1.06, vig: .5, grain: .1 },
  iso: { iso: 1, outline: .45, oc: '#2A3442' }
};
const GRADE = {
  none: {}, teal: { split: 1, sat: 1.1, con: 1.08 }, desat: { sat: .34, con: .95, bri: 1.03 }, bw: { gray: 1, con: 1.18 }, vibrant: { sat: 1.5, con: 1.05 },
  pastel: { sat: .62, bri: 1.1, con: .84, tint: '#FFD3E6', tintA: .14 }, warm: { sepia: .2, sat: 1.12, tint: '#FFB070', tintA: .2 }, cool: { tint: '#7FB2FF', tintA: .24, sat: .92 },
  film: { con: .9, sat: .92, sepia: .14, lift: .055 }
};
const GRADE_CYCLE = [['teal', 'TEAL & ORANGE'], ['desat', 'DESSATURADO'], ['bw', 'P&B'], ['warm', 'QUENTE'], ['cool', 'FRIO'], ['pastel', 'PASTEL'], ['vibrant', 'VIBRANTE']];

// ───────────────────────── Pós-produção num único passe
const paperTex = smallTex(128, 128, (x, y, n) => { const f = vnoise(x * .2, y * .2) * .5 + vnoise(x * .9, y * .9) * .5; return sh([244, 238, 224], .88 + f * .14 + (n - .5) * .05); }, true);
const PU = {
  tColor: { value: null }, tDepth: { value: null }, tPaper: { value: paperTex }, uRes: { value: new THREE.Vector2(960, 540) }, uNear: { value: .05 }, uFar: { value: 2600 }, uOrtho: { value: 0 },
  uDof: { value: 1 }, uFocus: { value: 2 }, uFocusScale: { value: 10 }, uMaxBlur: { value: 0 }, uSoft: { value: 0 }, uExposure: { value: 1 },
  uSat: { value: 1 }, uCon: { value: 1 }, uBri: { value: 1 }, uSepia: { value: 0 }, uGray: { value: 0 }, uLift: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) }, uTintAmt: { value: 0 }, uSplit: { value: 0 },
  uVig: { value: .18 }, uGrain: { value: 0 }, uTime: { value: 0 }, uCA: { value: 0 }, uFish: { value: 0 }, uTilt: { value: 0 }, uPixel: { value: 0 }, uPoster: { value: 0 },
  uOutline: { value: 0 }, uOutlineCol: { value: new THREE.Color(0, 0, 0) }, uPaper: { value: 0 }, uBloom: { value: .18 },
  uSun: { value: new THREE.Vector2(.5, .5) }, uSunOn: { value: 0 }, uRays: { value: 0 }, uRayCol: { value: new THREE.Color(1, .95, .8) }, uFlare: { value: 0 }, uAna: { value: 0 }, uFlarePos: { value: new THREE.Vector2(.5, .5) },
  uSpot: { value: 0 }, uSpotPos: { value: new THREE.Vector2(.5, .5) }, uLetter: { value: 0 }, uAspect: { value: 16 / 9 }
};
const postMat = new THREE.ShaderMaterial({
  uniforms: PU, depthTest: false, depthWrite: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
  #include <packing>
  uniform sampler2D tColor, tDepth, tPaper; uniform vec2 uRes; uniform float uNear, uFar, uOrtho;
  uniform float uDof, uFocus, uFocusScale, uMaxBlur, uSoft, uExposure;
  uniform float uSat, uCon, uBri, uSepia, uGray, uLift; uniform vec3 uTint; uniform float uTintAmt, uSplit;
  uniform float uVig, uGrain, uTime, uCA, uFish, uTilt, uPixel, uPoster, uOutline, uPaper, uBloom; uniform vec3 uOutlineCol;
  uniform vec2 uSun; uniform float uSunOn, uRays; uniform vec3 uRayCol; uniform float uFlare, uAna; uniform vec2 uFlarePos;
  uniform float uSpot; uniform vec2 uSpotPos; uniform float uLetter, uAspect;
  varying vec2 vUv;
  float rawD(vec2 uv){ return texture2D(tDepth, uv).x; }
  float viewZ(vec2 uv){ float d = rawD(uv); return uOrtho > .5 ? -orthographicDepthToViewZ(d, uNear, uFar) : -perspectiveDepthToViewZ(d, uNear, uFar); }
  float blurAt(vec2 uv, float z){
    float c = uDof > .5 ? abs(1.0/uFocus - 1.0/max(z, .01)) * uFocusScale : 0.0;
    c = max(c, uTilt * smoothstep(.12, .42, abs(uv.y - .5)) * 14.0 * uRes.x/960.0);
    c = max(c, uSoft);
    return min(c, uMaxBlur);
  }
  vec3 gather(vec2 uv){
    vec2 px = 1.0/uRes; float cz = viewZ(uv); float cs = blurAt(uv, cz);
    vec3 c = texture2D(tColor, uv).rgb; float tot = 1.0; float r = .6; float ang = 0.0;
    for (int i = 0; i < 90; i++) {
      if (r >= uMaxBlur) break;
      ang += 2.39996323; vec2 tc = uv + vec2(cos(ang), sin(ang)) * px * r;
      vec3 s = texture2D(tColor, tc).rgb; float sz = viewZ(tc); float ss = blurAt(tc, sz);
      if (sz > cz) ss = clamp(ss, 0.0, cs * 2.0);
      float m = smoothstep(r - .5, r + .5, ss);
      c += mix(c/tot, s, m); tot += 1.0; r += 1.5/r;
    }
    return c/tot;
  }
  vec3 aces(vec3 x){ x *= .6; return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0.0, 1.0); }
  vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - .055, step(.0031308, c)); }
  float h12(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){
    vec2 uv = vUv;
    if (uFish > 0.0) {
      vec2 q = (uv - .5) * vec2(2.0, 2.0/uAspect); float r = length(q);
      if (r > 1.06) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
      q *= mix(1.0, .48 + .52*r*r, uFish); uv = q * vec2(.5, .5*uAspect) + .5;
    }
    if (uPixel > 1.0) uv = (floor(uv * uRes / uPixel) + .5) * uPixel / uRes;
    vec3 c = (uMaxBlur > .55) ? gather(uv) : texture2D(tColor, uv).rgb;
    if (uCA > 0.0) { vec2 d = (uv - .5) * uCA * .012; c.r = texture2D(tColor, uv + d).r; c.b = texture2D(tColor, uv - d).b; }
    // raios volumétricos: amostra o céu (profundidade máxima) em direção ao sol
    if (uRays > 0.0) {
      vec2 dl = (uv - uSun) / 48.0; vec2 p = uv; float ill = 0.0, dec = 1.0;
      for (int i = 0; i < 48; i++) { p -= dl; if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) break; ill += step(.99999, rawD(p)) * dec; dec *= .962; }
      c += uRayCol * ill / 48.0 * uRays * 1.6;
    }
    if (uBloom > 0.0) {
      vec3 b = vec3(0.0); vec2 px = 1.0/uRes;
      for (int i = 0; i < 12; i++) { float a = float(i) * .5236; vec2 o = vec2(cos(a), sin(a)) * px;
        b += max(texture2D(tColor, uv + o*6.0).rgb - 1.0, 0.0) + max(texture2D(tColor, uv + o*14.0).rgb - 1.0, 0.0)*.7 + max(texture2D(tColor, uv + o*26.0).rgb - 1.0, 0.0)*.45; }
      c += b / 12.0 * uBloom;
    }
    if (uFlare > 0.0) {
      vec2 asp = vec2(uAspect, 1.0); vec2 v = (vec2(.5) - uFlarePos);
      for (int i = 0; i < 5; i++) { float k = float(i) * .45 + .35; vec2 gp = uFlarePos + v * k * 2.0; float d = length((uv - gp) * asp); float s = .03 + float(i) * .018;
        c += vec3(1.0, .75 - float(i)*.08, .5 + float(i)*.1) * smoothstep(s, s*.6, d) * .12 * uFlare; }
      c += vec3(1.0, .82, .6) * pow(max(0.0, 1.0 - length((uv - uFlarePos) * asp) * 2.2), 3.0) * .5 * uFlare;
    }
    if (uAna > 0.0) { float dy = abs(uv.y - uFlarePos.y); c += vec3(.35, .6, 1.0) * exp(-dy * 260.0) * (1.0 - abs(uv.x - uFlarePos.x)) * 1.6 * uAna; }
    c *= uExposure; c = toSRGB(aces(c));
    if (uOutline > 0.0) {
      vec2 px = 1.0/uRes; float z = viewZ(uv);
      float e = abs(viewZ(uv + vec2(px.x, 0.0)) - z) + abs(viewZ(uv - vec2(px.x, 0.0)) - z) + abs(viewZ(uv + vec2(0.0, px.y)) - z) + abs(viewZ(uv - vec2(0.0, px.y)) - z);
      c = mix(c, uOutlineCol, smoothstep(.06, .14, e / max(z, .1)) * uOutline);
    }
    if (uPoster > 0.0) c = floor(c * uPoster + .5) / uPoster;
    float l = dot(c, vec3(.2126, .7152, .0722));
    if (uSplit > 0.0) c = mix(c, c * mix(vec3(.55, 1.05, 1.15), vec3(1.2, .98, .78), smoothstep(.2, .75, l)), .55 * uSplit);
    c = mix(vec3(l), c, uSat);
    c = (c - .5) * uCon + .5; c *= uBri; c = c * (1.0 - uLift) + uLift;
    if (uSepia > 0.0) { vec3 s = vec3(dot(c, vec3(.393,.769,.189)), dot(c, vec3(.349,.686,.168)), dot(c, vec3(.272,.534,.131))); c = mix(c, s, uSepia); }
    c = mix(c, c * uTint * 1.15, uTintAmt);
    c = mix(c, vec3(dot(c, vec3(.2126, .7152, .0722))), uGray);
    if (uSpot > 0.0) { float d = length((uv - uSpotPos) * vec2(uAspect, 1.0)); c *= 1.0 - uSpot * smoothstep(.12, .72, d); }
    if (uPaper > 0.0) c *= mix(vec3(1.0), texture2D(tPaper, uv * vec2(uAspect, 1.0) * 2.2).rgb, uPaper);
    float vd = length((uv - .5) * vec2(uAspect, 1.0) * .9); c *= 1.0 - uVig * smoothstep(.45, 1.05, vd);
    if (uGrain > 0.0) c += (h12(uv * uRes + uTime * 61.0) - .5) * uGrain;
    if (uLetter > 0.0) { float hv = uAspect / uLetter; if (abs(vUv.y - .5) > hv * .5) c = vec3(0.0); }
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  }`
});
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));
let rt = null, RW = 0, RH = 0;
function ensureSize(w, h) {
  if (w === RW && h === RH && rt) return;
  RW = w; RH = h; renderer.setSize(w, h, false);
  if (rt) { rt.depthTexture.dispose(); rt.dispose(); }
  const dt = new THREE.DepthTexture(w, h); dt.type = THREE.UnsignedIntType;
  rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture: dt, samples: STATUS.msaa === false ? 0 : 4 });
}

// ───────────────────────── Câmera (presets com o explorador na origem e a câmera do lado +z)
const SH3 = {
  xws: { d: 70, ty: 3, f: 24 }, ws: { d: 15, ty: 1.4, f: 28 }, fs: { d: 4.6, ty: .95, f: 35 }, mws: { d: 3.1, ty: 1.12, f: 35 },
  ms: { d: 2.35, ty: 1.24, f: 35 }, mcu: { d: 1.95, ty: 1.42, f: 35 }, cu: { d: 1.38, ty: 1.55, f: 35 }, ecu: { d: .74, ty: 1.55, f: 35 },
  ins: { d: .62, ty: .26, tx: -.45, tz: .4, f: 50, el: 22, N: 2.8, abs: 1 }, ots: { d: 2.6, ty: 1.48, f: 40, az: 9, partner: 'ots', N: 2.8 },
  two: { d: 3.4, ty: 1.2, tx: -.4, f: 35, partner: 'two' }, pov: { d: 7.2, ty: 1.6, tx: 4, tz: -6, az: 33.7, f: 24, hideChar: 1, hands: 1, abs: 1 },
  macro: { d: .85, ty: .27, tx: -.45, tz: .4, f: 100, N: 4, el: 12, abs: 1 }
};
const ANG3 = { eye: { el: 2 }, low: { el: -24 }, high: { el: 34 }, overhead: { el: 87 }, worm: { el: -62, dMul: .75, ty: .6 }, dutch: { el: 2, roll: 15 }, aerial: { el: 40, dMul: 6 } };
const SUBJ_H = { explorer: 1.8, companion: 1.8, skeleton: 1.8, king: 3.0, slime: 1.0, cow: 1.5, hen: .7, arrow: 3.6 };

// ───────────────────────── Estado do quadro: elenco
const UP = new THREE.Vector3(0, 1, 0);
const ARROW_FROM = new THREE.Vector3(), ARROW_TO = new THREE.Vector3(-3.05, .55, -5.5);
const SKEL_POS = [-11, -1];
const baseOf = S => S.pos || (S.comp && S.comp.sym ? [6.5, -2.2] : [0, 0]);
function placeCast(S, ts, st) {
  const jit = (obj, k) => { if (!st.jitter && !st.boil) return; const s = Math.floor(ts * (st.boil ? 8 : 12)) * 13.7 + k * 7.1, a = (st.jitter || .5); obj.rotation.y += (hash1(s) - .5) * .05 * a; obj.position.x += (hash1(s + 1) - .5) * .012 * a; };
  // explorador
  const act = S.act || 'idle', base = baseOf(S);
  let ex = base[0], ez = base[1], face = S.face != null ? S.face : 0, tailKick = 0;
  if (act === 'walk' || act === 'whistle') { ex += ((ts * 1.25 + 12) % 24 + 24) % 24 - 12; face = Math.PI / 2; }
  let eact = act;
  if (act === 'stopstart') {   // anda, freia com ease e o cachecol continua (follow-through)
    const P = 6, k = fract(ts / P), dir = k < .5 ? 1 : -1, kk = k < .5 ? k : k - .5, m = sstep(0, .38, kk);
    ex += dir > 0 ? lerp(-1.6, 1.6, m) : lerp(1.6, -1.6, m); face = dir * Math.PI / 2;
    const v = kk < .38 ? Math.sin(kk / .38 * Math.PI) : 0; eact = v > .15 ? 'walk' : 'idle';
    const tau = Math.max(0, (kk - .38) * P); tailKick = kk > .38 ? .9 * Math.exp(-tau * 3) * Math.cos(tau * 10) : 0;
  }
  if (S.jumpX != null) ex = S.jumpX;
  const hideEx = !!(SH3[S.shot || 'fs'] || {}).hideChar;
  explorer.root.visible = !hideEx;
  explorer.root.position.set(ex, 0, ez); explorer.root.rotation.set(0, face, 0);
  const eo = animateHuman(explorer, eact, ts, { tailKick });
  explorer.root.position.x = ex; explorer.root.position.z = ez;
  jit(explorer.root, 1);
  // notas musicais (ação secundária)
  notes.forEach((n, i) => { n.visible = act === 'whistle'; if (!n.visible) return; const k = fract(ts * .45 + i / 3); n.position.set(ex + .25 + k * .4, 1.85 + k * .9, ez + .1); n.scale.setScalar(1 - k * .6); n.rotation.z = Math.sin(ts * 3 + i) * .3; });
  // parceira
  const pt = (SH3[S.shot || 'fs'] || {}).partner;
  if (pt === 'ots') { companion.root.position.set(-.62, 0, 1.75); companion.root.rotation.set(0, Math.PI, 0); animateHuman(companion, 'talk', ts + 1); }
  else if (pt === 'two') { companion.root.position.set(-.85, 0, 0); companion.root.rotation.set(0, 0, 0); animateHuman(companion, S.act === 'wave' ? 'wave' : 'idle', ts + 1.7); }
  else { companion.root.position.set(-6.2, 0, -16.6); companion.root.rotation.set(0, Math.PI * .82, 0); animateHuman(companion, 'idle', ts + 2.3); }
  jit(companion.root, 2);
  // esqueleto arqueiro
  const sa = Math.atan2(ARROW_TO.x - SKEL_POS[0], ARROW_TO.z - SKEL_POS[1]);
  skeleton.root.position.set(SKEL_POS[0], 0, SKEL_POS[1]); skeleton.root.rotation.set(0, sa, 0);
  const so = animateHuman(skeleton, 'aim', ts, {});
  bow.rotation.set(0, 0, 0); bow.string.position.y = 3 * PXs + (so.draw || 0) * 5 * PXs;
  nocked.visible = (so.k > .1 && so.k < .45); nocked.position.set(0, -10.5 * PXs, 0); nocked.rotation.set(Math.PI / 2, 0, 0);
  scene.updateMatrixWorld(true);
  bow.getWorldPosition(ARROW_FROM);
  const T = 1.05, fk = (so.k - .45) * 3.4;
  if (fk >= 0 && fk <= T) {
    const g = -9.8, v = new THREE.Vector3().subVectors(ARROW_TO, ARROW_FROM).divideScalar(T); v.y -= .5 * g * T;
    const p = ARROW_FROM.clone().addScaledVector(v, fk); p.y += .5 * g * fk * fk; arrow.position.copy(p);
    const vel = v.clone(); vel.y += g * fk; arrow.lookAt(p.clone().add(vel)); arrow.visible = true;
  } else if (fk > T) { arrow.visible = true; arrow.position.copy(ARROW_TO); }
  else arrow.visible = false;
  jit(skeleton.root, 3);
  // rei montado na galinha gigante (para e anda: a capa mostra follow-through)
  let ang, mv, tau = 0;
  if (S.kingAct === 'stopgo') { const P = 4.5, n = Math.floor(ts / P), k = fract(ts / P); ang = (n + sstep(0, .5, k)) * 1.3; mv = k < .5 ? Math.sin(k / .5 * Math.PI) : 0; tau = k > .5 ? (k - .5) * P : 0; }
  else { ang = ts * .33; mv = .6; }
  const KC = [-13, 7], KR = 3.6, kx = KC[0] + Math.cos(ang) * KR, kz = KC[1] + Math.sin(ang) * KR, kf = Math.atan2(-Math.sin(ang), Math.cos(ang));
  mount.root.position.set(kx, 0, kz); mount.root.rotation.set(0, kf, 0);
  animChicken(mount, ts, mv);
  const seat = new THREE.Vector3(0, (.66 + mount.body.position.y) * 2.3, -.05 * 2.3).applyAxisAngle(UP, kf);
  animateHuman(king, 'ride', ts, {});
  king.root.position.set(kx + seat.x, seat.y - 12 * PXs, kz + seat.z); king.root.rotation.set(0, kf, 0);
  king.cape.rotation.x = .18 + mv * .55 + Math.sin(ts * 6) * .05 * (.4 + mv) + (tau ? .7 * Math.exp(-tau * 2.6) * Math.cos(tau * 8) : 0);
  jit(mount.root, 4);
  // vacas pastando, galinhas, slimes
  cows.forEach((c, i) => { const g = sstep(.2, .35, fract(ts / 7 + i * .37)) - sstep(.75, .9, fract(ts / 7 + i * .37)); c.root.position.set(c.x, 0, c.z); c.root.rotation.y = c.f; c.head.rotation.x = .75 * g + Math.sin(ts * 5) * .03 * g; c.tail.rotation.z = Math.sin(ts * 2.2 + i) * .3; });
  hens.forEach((h, i) => {
    const a = ts * .45 + i * 2.1, x = 5 + i * 1.6 + Math.sin(a) * 1.4, z = -3.2 + Math.cos(a * .8 + i) * .9, dx = Math.cos(a) * 1.4 * .45, dz = -Math.sin(a * .8 + i) * .9 * .36;
    h.root.position.set(x, 0, z); h.root.rotation.y = Math.atan2(dx, dz);
    const peck = sstep(.6, .7, fract(ts * .3 + i * .33)) - sstep(.8, .9, fract(ts * .3 + i * .33));
    animChicken(h, ts * 1.3 + i, 1 - peck); h.head.rotation.x = peck * .9;
  });
  slimes.forEach((s, i) => {
    const P = i ? .75 : 1.6, k = fract(ts / P), a = (Math.floor(ts / P) + sstep(.2, .8, k)) * (i ? .55 : .42), R = i ? .7 : 1.2, c = i ? [-9.6, 2.2] : [-7.2, 3.4];
    const jump = k > .2 && k < .8 ? Math.sin((k - .2) / .6 * Math.PI) : 0, ex2 = S.exag && !i ? 2.2 : 1;
    let sy = 1; if (k < .2) sy = 1 - .3 * ex2 * Math.sin(k / .2 * Math.PI); else if (k < .35) sy = 1 + .22 * ex2 * (1 - (k - .2) / .15); else if (k > .8) sy = 1 - .25 * ex2 * Math.sin((k - .8) / .2 * Math.PI);
    s.root.position.set(c[0] + Math.cos(a) * R, jump * (i ? .45 : .9) * (S.exag && !i ? 1.6 : 1), c[1] + Math.sin(a) * R);
    s.root.rotation.y = -a; s.inner.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
  });
  // folhas caindo
  leaves.visible = !!(S.fx && S.fx.includes('leaves'));
  if (leaves.visible) { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(); for (let i = 0; i < 26; i++) { const k = fract(ts * .16 + i * .37); e.set(ts * 2 + i, ts * 1.3 + i * 2, ts + i); q.setFromEuler(e); m.compose(new THREE.Vector3(ex + (hash1(i) - .5) * 3.2 + Math.sin(ts * 1.3 + i) * .4, 3.8 - k * 3.8, ez + (hash1(i + 9) - .5) * 2.4), q, new THREE.Vector3(1, 1, 1)); leaves.setMatrixAt(i, m); } leaves.instanceMatrix.needsUpdate = true; }
  return { ex, ez, act: eact, speed: eo.speed || 0 };
}
function animChicken(c, ts, mv) {
  const w = ts * 9, a = .55 * mv;
  c.legL.rotation.x = Math.sin(w) * a; c.legR.rotation.x = -Math.sin(w) * a;
  c.head.position.z = .26 + Math.sin(w * 2) * .05 * mv; c.body.position.y = Math.abs(Math.sin(w)) * .03 * mv;
  const flap = Math.max(0, Math.sin(ts * 1.7)) > .97 ? Math.sin(ts * 40) * .6 : 0;
  c.wingL.rotation.z = .05 + flap; c.wingR.rotation.z = -.05 - flap; c.head.rotation.x = 0;
}
function subjectPos(name, cast) {
  const v = new THREE.Vector3();
  if (name === 'king') { king.root.getWorldPosition(v); v.y = 0; }
  else if (name === 'skeleton') v.set(SKEL_POS[0], 0, SKEL_POS[1]);
  else if (name === 'companion') companion.root.getWorldPosition(v).setY(0);
  else if (name === 'slime') slimes[0].root.getWorldPosition(v).setY(0);
  else if (name === 'cow') v.set(cows[0].x, 0, cows[0].z);
  else if (name === 'arrow') v.set((SKEL_POS[0] + ARROW_TO.x) / 2, 0, (SKEL_POS[1] + ARROW_TO.z) / 2);
  else v.set(cast.ex, 0, cast.ez);
  return v;
}

// ───────────────────────── Render
const flags = { dof: true, atmos: true, post: true, shadows: true };
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
function render(S, t, out) {
  const A = window.Anim || {}, MV = A.MV || {}, TM = A.TM || { normal: { s: x => x, c: x => x } };
  const W = Math.max(64, Math.min(1280, out.width | 0)), H = Math.max(36, Math.round(W * 9 / 16));
  ensureSize(W, H);
  const st = STY[S.style] || STY.none, tm = TM[S.time || 'normal'] || TM.normal;
  let ts = tm.s(t), tc = tm.c(t);
  const fps = S.fps || st.fps;
  if (fps) { ts = Math.floor(ts * fps) / fps; tc = Math.floor(tc * fps) / fps; }
  const fx = S.fx || [];
  const L = lightAt(tm.cycle ? 'cycle' : (S.light || 'day'), ts);
  if (st.skyT && !S.light) { L.sky = [st.skyT, st.skyH, L.sky[2]]; }
  if (fx.includes('rain')) { L.sunI *= .25; L.hemiI *= .7; L.fogD = Math.max(L.fogD, .02); L.fog = '#8E9AA8'; L.sky = ['#5E6C7C', '#9AA6B2', L.sky[2]]; L.cloud = '#9AA4AE'; }
  if (st.flat) { L.hemiI *= 1.8; L.sunI *= .45; }
  const cast = placeCast(S, ts, st);
  let label = L.label || null;

  // câmera
  const sh0 = SH3[S.shot || 'fs'] || SH3.fs, subj = S.subject || 'explorer', hk = sh0.abs ? 1 : (SUBJ_H[subj] || 1.8) / 1.8;
  const r = { d: sh0.d * hk, ty: sh0.ty * hk, tx: sh0.tx || 0, tz: sh0.tz || 0, f: sh0.f, el: sh0.el || 0, az: sh0.az || 0, N: sh0.N || 5.6, fd: null, yawOff: 0, pitchOff: 0, roll: 0, ped: 0, shake: 0, mb: 0, cx: 0, cy: 0, cz: 0, minY: .05, follow: false };
  if (S.angle && ANG3[S.angle]) { const a = ANG3[S.angle]; r.el = a.el; r.roll += a.roll || 0; r.d *= a.dMul || 1; r.ty += (a.ty || 0) * hk; }
  if (S.lens) { if (S.lens.f) { r.d *= S.lens.f / r.f; r.f = S.lens.f; } if (S.lens.N) r.N = S.lens.N; }
  if (st.iso) { r.el = 35; r.az = 40; }
  if (S.az != null) r.az = S.az;
  const mv = typeof S.move === 'function' ? S.move : MV[S.move || 'static'];
  if (mv) mv(r, tc, S);
  if (S.rigFn) S.rigFn(r, tc);
  const comp = S.comp || {};
  if (comp.thirds) r.yawOff += Math.atan(6 / r.f) / D2R;
  if (comp.neg) { r.yawOff -= Math.atan(11 / r.f) / D2R; r.pitchOff += Math.atan(5 / r.f) / D2R; }
  if (comp.lead) { r.follow = true; r.yawOff += Math.atan(6 / r.f) / D2R; }
  if (S.move === 'tracking' || comp.lead) r.follow = true;
  let sp;
  if (sh0.abs) sp = new THREE.Vector3();
  else if (subj === 'explorer') { const b = baseOf(S); sp = r.follow ? new THREE.Vector3(cast.ex, 0, cast.ez) : new THREE.Vector3(b[0], 0, b[1]); }
  else sp = subjectPos(subj, cast);
  const T = new THREE.Vector3(sp.x + r.tx, r.ty + r.ped, sp.z + r.tz);
  const el = r.el * D2R, az = r.az * D2R;
  const C = new THREE.Vector3(T.x - r.d * Math.cos(el) * Math.sin(az), T.y + r.d * Math.sin(el), T.z + r.d * Math.cos(el) * Math.cos(az));
  C.y = Math.max(C.y, groundAt(C.x, C.z) + r.minY); C.x += r.cx; C.y += r.cy; C.z += r.cz;
  let camera = cam;
  if (st.iso) {
    camera = ocam; const visH = 20.25 * r.d / r.f * 1.15, aspect = W / H, dir = new THREE.Vector3().subVectors(C, T).normalize();
    ocam.top = visH / 2; ocam.bottom = -visH / 2; ocam.left = -visH / 2 * aspect; ocam.right = visH / 2 * aspect;
    ocam.position.copy(T).addScaledVector(dir, 150); ocam.lookAt(T); ocam.updateProjectionMatrix();
  } else {
    cam.aspect = W / H; cam.position.copy(C); cam.up.set(0, 1, 0); cam.lookAt(T);
    let yo = r.yawOff, po = r.pitchOff, ro = r.roll;
    if (r.shake) { yo += noise1(tc * 1.9) * .9 * r.shake; po += noise1(tc * 2.3 + 7) * .7 * r.shake; ro += noise1(tc * 1.4 + 3) * .8 * r.shake; cam.position.x += noise1(tc * 1.1 + 9) * .01 * r.shake; cam.position.y += noise1(tc * 2.7 + 2) * .012 * r.shake; }
    if (st.boil || st.jitter) { const s = Math.floor(ts * (st.boil ? 8 : 12)); yo += (hash1(s) - .5) * .12; po += (hash1(s + 3) - .5) * .1; }
    cam.rotateY(-yo * D2R); cam.rotateX(po * D2R); cam.rotateZ(-ro * D2R);
    cam.setFocalLength(r.f); cam.updateProjectionMatrix();
  }
  camera.updateMatrixWorld(true);
  const fd = r.fd != null ? r.fd : C.distanceTo(T);
  let focus = fd;
  if (S.rack) { const k = sstep(.35, .65, pp(fract(tc / 6))); focus = lerp(2.2, fd, k); label = k < .5 ? 'FOCO: 1º PLANO' : 'FOCO: PERSONAGEM'; }

  // luzes e céu
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion).setY(0).normalize(), back = new THREE.Vector3(0, 0, 1).applyQuaternion(cam.quaternion).setY(0).normalize();
  const dirOf = (v, rel) => rel ? new THREE.Vector3().addScaledVector(right, v[0]).addScaledVector(back, v[2]).add(new THREE.Vector3(0, v[1], 0)).normalize() : new THREE.Vector3(v[0], v[1], v[2]).normalize();
  const sd = dirOf(L.sunDir, L.rel);
  const shadowExt = clamp(r.d * .9 + 7, 9, st.iso ? 60 : 75);
  sun.position.copy(T).addScaledVector(sd, 120); sun.target.position.copy(T); sun.color.set(L.sunCol); sun.intensity = L.sunI;
  const sc = sun.shadow.camera; sc.left = -shadowExt; sc.right = shadowExt; sc.top = shadowExt; sc.bottom = -shadowExt; sc.updateProjectionMatrix();
  sun.shadow.radius = L.shadowR; sun.castShadow = flags.shadows;
  hemi.color.set(L.hemiS); hemi.groundColor.set(L.hemiG); hemi.intensity = L.hemiI;
  rimL.intensity = L.rimI; rimL.color.set(L.rimCol); rimL.position.copy(T).addScaledVector(dirOf([.9, .45, -.6], true), 50); rimL.target.position.copy(T);
  fillL.intensity = L.fillI; fillL.color.set(L.fillCol); fillL.position.copy(T).addScaledVector(dirOf([.8, .3, .9], true), 50); fillL.target.position.copy(T);
  const flick = .85 + .15 * Math.sin(ts * 17) * Math.sin(ts * 7.3);
  lampPosts.forEach(l => { l.L.intensity = L.lamp * 26; }); lanternMat.emissiveIntensity = L.lamp * 2.4;
  torches.forEach(tq => { tq.L.intensity = (L.lamp + L.win) * .5 * 14 * flick; }); torchMat.emissiveIntensity = (L.lamp + L.win) * .5 * 2.2 * flick;
  glowMat.emissiveIntensity = L.win * .9;
  bulbs.visible = L.bulbs > .02; bulbMats.forEach((m, i) => m.color.set(['#FFC878', '#FFAE70', '#FFE0A0'][i]).multiplyScalar(4 * L.bulbs));
  neon.visible = L.neon > 0; neonL1.intensity = neonL2.intensity = L.neon * 40; neonM.color.set('#FF3FA4').multiplyScalar(1 + 2.5 * L.neon); neonC.color.set('#3FE6FF').multiplyScalar(1 + 2.5 * L.neon);
  skyUni.top.value.set(L.sky[0]); skyUni.hor.value.set(L.sky[1]); skyUni.bot.value.set(L.sky[2]);
  skyUni.sunDir.value.copy(sd); skyUni.sunCol.value.set(L.sunCol); skyUni.sunOn.value = L.sunDisc ? 1 : (L.rel ? 0 : .35); skyUni.sunSize.value = L.sunSize;
  skyUni.moonOn.value = L.moon ? 1 : 0; if (L.moon) skyUni.moonDir.value.set(...L.moon).normalize();
  skyUni.stars.value = L.stars; skyUni.time.value = ts; sky.position.copy(camera.position);
  cloudMat.color.set(L.cloud); cloudMat.emissive.set(L.cloud); cloudMat.emissiveIntensity = L.rel ? .1 : .4;
  mountainMat.emissive.set(L.fog); mountainMat.emissiveIntensity = clamp(.35 + L.fogD * 30, .35, .85); mountainMat.color.setScalar(1 - mountainMat.emissiveIntensity * .6);
  cloudGroup.position.x = -fract(ts * (tm.cycle ? 2.5 : .35) / 1000) * 1000; cloudGroup.visible = !st.iso;
  let fogD = L.fogD;
  if (fx.includes('haze')) fogD *= 2.6;
  if (fx.includes('fog')) fogD = Math.max(fogD * 5, .045);
  if (!flags.atmos) fogD = Math.min(fogD, .0015);
  if (st.iso) fogD = 0;
  scene.fog.color.set(fx.includes('fog') ? '#DDE5EA' : L.fog); scene.fog.density = fogD;
  waterTex.offset.set(ts * .05, -ts * .35);

  // partículas
  const cp = camera.position, atm = flags.atmos;
  rain.visible = atm && fx.includes('rain'); snow.visible = atm && fx.includes('snow'); dust.visible = atm && fx.includes('dust');
  if (rain.visible) { const a = rain.geometry.attributes.position.array; for (let i = 0; i < rain.N; i++) { const x = cp.x + (hash1(i) - .5) * 30, z = cp.z + (hash1(i + 7) - .5) * 30 - 6, y = cp.y + 14 - fract(hash1(i + 3) + ts * 1.4) * 26; a.set([x, y, z, x - .05, y - .55, z], i * 6); } rain.geometry.attributes.position.needsUpdate = true; }
  if (snow.visible) { const a = snow.geometry.attributes.position.array; for (let i = 0; i < snow.N; i++) a.set([cp.x + (hash1(i) - .5) * 24 + Math.sin(ts * .8 + i) * .3, cp.y + 9 - fract(hash1(i + 3) + ts * .09) * 16, cp.z + (hash1(i + 7) - .5) * 24 - 5], i * 3); snow.geometry.attributes.position.needsUpdate = true; }
  if (dust.visible) { const a = dust.geometry.attributes.position.array; for (let i = 0; i < dust.N; i++) a.set([T.x + (hash1(i) - .5) * 7 + Math.sin(ts * .3 + i) * .2, .2 + fract(hash1(i + 3) + ts * .02 * (1 + hash1(i + 5))) * 4, T.z + (hash1(i + 7) - .5) * 7 + Math.cos(ts * .25 + i) * .2], i * 3); dust.geometry.attributes.position.needsUpdate = true; }
  rackBranch.visible = !!S.rack; fgFrame.visible = !!comp.fgframe; povArms.visible = !!sh0.hands;
  if (povArms.visible) povArms.position.y = Math.sin(ts * 5) * .02;

  // render da cena
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  // pós
  const g = Object.assign({}, GRADE[S.grade === 'cycle' ? GRADE_CYCLE[Math.floor(ts / 1.6) % GRADE_CYCLE.length][0] : (S.grade || 'none')] || {});
  if (S.grade === 'cycle') label = GRADE_CYCLE[Math.floor(ts / 1.6) % GRADE_CYCLE.length][1];
  const post = flags.post;
  PU.tColor.value = rt.texture; PU.tDepth.value = rt.depthTexture; PU.uRes.value.set(W, H); PU.uAspect.value = W / H;
  PU.uNear.value = camera.near; PU.uFar.value = camera.far; PU.uOrtho.value = st.iso ? 1 : 0;
  const fm = r.f / 1000, pxScale = W / 960;
  PU.uFocus.value = Math.max(.05, focus); PU.uFocusScale.value = (fm * fm / r.N) / .036 * W * .5 * (st.dofMul || 1);
  const blurInf = PU.uFocusScale.value / PU.uFocus.value;
  PU.uDof.value = flags.dof && !st.iso ? 1 : 0;
  PU.uSoft.value = (st.soft || 0) * pxScale; PU.uTilt.value = fx.includes('tiltshift') ? 1 : 0;
  PU.uMaxBlur.value = Math.min(16 * pxScale, Math.max(PU.uDof.value ? (S.rack || comp.fgframe ? 16 * pxScale : blurInf * 1.6) : 0, PU.uSoft.value, PU.uTilt.value * 14 * pxScale));
  PU.uExposure.value = L.exp;
  PU.uSat.value = post ? (g.sat || 1) * (st.sat || 1) : (st.sat || 1); PU.uCon.value = post ? (g.con || 1) * (st.con || 1) : 1; PU.uBri.value = post ? (g.bri || 1) * (st.bri || 1) : 1;
  PU.uSepia.value = post ? (g.sepia || 0) + (st.sepia || 0) : 0; PU.uGray.value = Math.max(post ? g.gray || 0 : 0, st.gray || 0); PU.uLift.value = post ? g.lift || 0 : 0;
  if (post && g.tintA) { PU.uTint.value.set(g.tint); PU.uTintAmt.value = g.tintA; } else { PU.uTint.value.set(L.tint); PU.uTintAmt.value = post ? L.tintA : 0; }
  PU.uSplit.value = post ? g.split || 0 : 0;
  PU.uVig.value = post ? Math.max(fx.includes('vignette') ? .7 : .16, st.vig || 0) : 0;
  PU.uGrain.value = post ? (fx.includes('grain') ? .07 : 0) + (st.grain || 0) : 0; PU.uTime.value = ts;
  PU.uCA.value = post && fx.includes('ca') ? 1 : 0; PU.uFish.value = fx.includes('fisheye') ? 1 : 0;
  PU.uPixel.value = st.pixel ? st.pixel * pxScale : 0; PU.uPoster.value = st.poster || 0;
  PU.uOutline.value = st.outline || 0; PU.uOutlineCol.value.set(st.oc || '#000000'); PU.uPaper.value = st.paper || 0;
  PU.uBloom.value = post ? (fx.includes('halation') ? .9 : .2) + (st.bloom || 0) : 0;
  PU.uLetter.value = fx.includes('letterbox') || fx.includes('anaflare') ? 2.39 : 0;
  // posição do sol / fonte de luz na tela (raios e flare)
  tmpV.copy(camera.position).addScaledVector(sd, 1000).project(camera);
  const sunVis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.6 && Math.abs(tmpV.y) < 1.6;
  PU.uSun.value.set(tmpV.x * .5 + .5, tmpV.y * .5 + .5); PU.uRays.value = atm && L.rays ? L.rays * (sunVis ? 1 : .55) : 0; PU.uRayCol.value.set(L.sunCol);
  let fp = null;
  if (fx.includes('flare') && sunVis) fp = PU.uSun.value.clone();
  if (fx.includes('anaflare')) { lampPosts[0].g.getWorldPosition(tmpV2); tmpV2.y = 2.32; tmpV2.project(camera); if (tmpV2.z < 1) fp = new THREE.Vector2(tmpV2.x * .5 + .5, tmpV2.y * .5 + .5); }
  PU.uFlare.value = post && fp && fx.includes('flare') ? 1 : 0; PU.uAna.value = post && fp && fx.includes('anaflare') ? 1 : 0; if (fp) PU.uFlarePos.value.copy(fp);
  tmpV2.set(cast.ex, 1.2, cast.ez).project(camera); PU.uSpotPos.value.set(tmpV2.x * .5 + .5, tmpV2.y * .5 + .5); PU.uSpot.value = L.spot;
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  const c2 = out.getContext('2d'); c2.setTransform(1, 0, 0, 1, 0, 0); c2.globalAlpha = 1; c2.globalCompositeOperation = 'source-over'; c2.filter = 'none';
  c2.drawImage(renderer.domElement, 0, 0, out.width, out.height);
  return { label, info: { f: r.f, N: r.N }, mb: Math.max(r.mb, S.mb || 0), L: { label: null }, cast };
}

// verificação rápida de MSAA + depthTexture; sem suporte, volta para 0 amostras
try {
  const probe = document.createElement('canvas'); probe.width = 64; probe.height = 36;
  render({ shot: 'fs' }, 1, probe);
  const gl = renderer.getContext(); if (gl.getError() !== gl.NO_ERROR) { STATUS.msaa = false; RW = 0; }
} catch (e) { STATUS.msaa = false; RW = 0; }

Object.assign(STATUS, { ready: true, render, flags, SH3, ANG3, buildMs: Math.round(performance.now() - STATUS.t0) });
window.dispatchEvent(new Event('world3d-ready'));
