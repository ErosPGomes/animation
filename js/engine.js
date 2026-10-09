// Motor de câmera 2.5D: cena em billboards (recortes) projetados por uma câmera física
// (posição, yaw/pitch/roll, distância focal em mm, abertura f/N). Profundidade de campo usa o
// círculo de confusão real: CoC ≈ f²/N · |1/foco − 1/z|, então lente e abertura mudam o desfoque
// de forma coerente. Um único loop rAF por canvas visível.
(function () {
'use strict';
const TAU = Math.PI * 2, D2R = Math.PI / 180, NEAR = 0.05;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const pp = u => u < .5 ? u * 2 : 2 - u * 2;
const hold = u => sstep(.12, .88, u);
const fract = x => x - Math.floor(x);
const hash = n => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
function noise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; }
function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mixHex(a, b, k) { const A = hex2rgb(a), B = hex2rgb(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], k)).toString(16).padStart(2, '0')).join(''); }

// ─── Presets de enquadramento: d = distância câmera→alvo (m), ty = altura do alvo, f = focal (mm)
// Altura visível ≈ 20.25·d/f (16:9, sensor full frame de 36 mm), por isso cada plano é exato.
const SH = {
  xws: { d: 70, ty: 3, f: 24 }, ws: { d: 15, ty: 1.4, f: 28 }, fs: { d: 4.3, ty: .95, f: 35 },
  mws: { d: 3, ty: 1.15, f: 35 }, ms: { d: 1.95, ty: 1.3, f: 35 }, mcu: { d: 1.25, ty: 1.46, f: 35 },
  cu: { d: .78, ty: 1.58, f: 35 }, ecu: { d: .3, ty: 1.615, f: 35 },
  ins: { d: .62, ty: .26, tx: -.45, tz: 9.6, f: 50, el: 22, N: 2.8 },
  ots: { d: 2.6, ty: 1.5, f: 40, az: 9, partner: 'ots', N: 2.8 },
  two: { d: 3.4, ty: 1.2, tx: -.4, f: 35, partner: 'two' },
  pov: { d: 7.2, ty: 1.6, tx: 4, tz: 16, az: 33.7, f: 24, hideChar: true, hands: true },
  macro: { d: .5, ty: .29, tx: -.45, tz: 9.6, f: 100, N: 4, el: 10 }
};
const ANG = {
  eye: { el: 2 }, low: { el: -24 }, high: { el: 34 }, overhead: { el: 87 },
  worm: { el: -62, dMul: .75, ty: .6 }, dutch: { el: 2, roll: 15 }, aerial: { el: 40, dMul: 6 }
};

// ─── Movimentos: modificam o rig relativo ao enquadramento (compõem com plano/ângulo/lente)
const MV = {
  static() {},
  pan(r, t) { r.yawOff += lerp(-28, 28, ease(pp(fract(t / 7)))); },
  tilt(r, t) { r.pitchOff += lerp(-22, 24, ease(pp(fract(t / 7)))); },
  dollyIn(r, t) { r.d *= lerp(2.2, .75, hold(fract(t / 5))); },
  dollyOut(r, t) { r.d *= lerp(.75, 2.4, hold(fract(t / 5))); },
  truck(r, t) { r.tx += lerp(-1, 1, ease(pp(fract(t / 7)))) * Math.max(1.2, r.d * .5); },
  pedestal(r, t) { r.ped += lerp(-.5, .5, ease(pp(fract(t / 7)))) * Math.max(.8, r.d * .4); },
  crane(r, t) { const k = ease(pp(fract(t / 8))); r.el += 48 * k; r.d *= lerp(1, 1.8, k); },
  zoomIn(r, t) { r.f *= lerp(1, 2.6, hold(fract(t / 5))); },
  zoomOut(r, t) { r.f *= lerp(2.6, 1, hold(fract(t / 5))); },
  dollyZoom(r, t) { const k = lerp(1, 2.8, ease(pp(fract(t / 7)))); r.d *= k; r.f *= k; },
  orbit(r, t) { r.az += lerp(-65, 65, ease(pp(fract(t / 9)))); },
  tracking(r, t, S) { r.follow = true; },
  handheld(r) { r.shake += 1; },
  steadicam(r, t) { r.d *= lerp(2, 1, ease(pp(fract(t / 9)))); r.az += Math.sin(t * .6) * 10; r.cy += Math.sin(t * 1.7) * .02; },
  fpv(r, t) { const k = fract(t / 5), e = k * k * (3 - 2 * k); r.el = lerp(62, 4, e); r.d *= lerp(9, 1.1, e); r.az += lerp(-80, 20, e); r.roll += Math.sin(k * Math.PI) * -28; r.mb = Math.max(r.mb, .45); },
  drone(r, t) { const k = fract(t / 10); r.el = 38; r.d *= 5; r.az += lerp(-40, 40, k); r.tx += lerp(-6, 6, k); },
  whip(r, t) { const k = fract(t / 3.2); r.yawOff += 95 * (sstep(.2, .28, k) - sstep(.7, .78, k)); r.mb = Math.max(r.mb, .72); },
  crash(r, t) { const k = fract(t / 3.5), z = sstep(.3, .35, k) - sstep(.86, .92, k); r.f *= lerp(1, 4.2, z); if (k > .35 && k < .45) r.shake += 1.5; },
  pushIn(r, t) { r.d *= lerp(1.25, .82, fract(t / 8)); },
  reveal(r, t) { const k = hold(fract(t / 8)); r.d *= lerp(.5, 7, k * k); r.el += 25 * k; },
  roll(r, t) { r.roll += fract(t / 4) * 360; },
  flare(r, t) { r.yawOff += -30 + Math.sin(t * .5) * 7; r.pitchOff += 4; }
};

// ─── Tempo: s = relógio da cena, c = relógio da câmera
function rampTime(t) { // integral numérica da curva de velocidade 1 → .15 → 1
  const P = 6, n = Math.floor(t / P), k = t - n * P, v = x => 1 - .85 * (sstep(1.6, 2.2, x) - sstep(4, 4.6, x));
  let s = 0; const steps = 48, dx = k / steps; for (let i = 0; i < steps; i++) s += v((i + .5) * dx) * dx;
  let full = 0; const dP = P / steps; for (let i = 0; i < steps; i++) full += v((i + .5) * dP) * dP;
  return n * full + s;
}
const TM = {
  normal: { s: t => t, c: t => t },
  slowmo: { s: t => t * .22, c: t => t * .22, badge: () => '0.22× · 120 fps em 24' },
  timelapse: { s: t => t * 12, c: t => t * .5, badge: () => '12× TIME-LAPSE', cycle: true },
  ramp: { s: rampTime, c: rampTime, badge: t => { const k = t % 6; return (k > 2.2 && k < 4) ? 'RAMP 0.15×' : 'RAMP 1×'; } },
  freeze: { s: t => { const P = 5, n = Math.floor(t / P), k = t - n * P; return n * (P - 1.6) + (k < 2 ? k : k < 3.6 ? 2 : k - 1.6); }, c: null, badge: t => { const k = t % 5; return k >= 2 && k < 3.6 ? 'FREEZE FRAME' : ''; } },
  reverse: { s: t => 40 - t, c: t => 40 - t, badge: () => '◀◀ REVERSO' }
};
TM.freeze.c = TM.freeze.s;

// ─── Luz
const LBASE = { skyT: '#7DB7E8', skyB: '#D9EEF8', gnd: '#86B862', gndF: '#B9D69E', grid: 'rgba(38,84,140,.16)', key: -.6, con: .35, hard: false, shCol: '12,24,48', rim: null, rimA: 0, sun: { az: -35, el: 42, col: '#FFF4D6', r: 1 }, moon: null, stars: 0, rays: 0, spot: 0, sil: false, silCol: '#191720', lamp: 0, win: 0, haze: .35, hazeB: 1, amb: null, shLen: .8, shA: .26, shBlur: null, neon: 0, bulbs: 0, cloud: '#FFFFFF', mtn: '#8FA9C2', mtn2: '#6F8FA3' };
const LP = {
  day: {},
  highkey: { skyT: '#BFDDF3', skyB: '#F6FBFE', gnd: '#A6D48A', gndF: '#D3EAC2', con: .1, shA: .08, amb: ['#ffffff', .2, 'screen'], haze: .5, mtn: '#B9CCDC', mtn2: '#A2BCCC' },
  lowkey: { skyT: '#0B1019', skyB: '#1A2230', gnd: '#141C18', gndF: '#1E2833', grid: 'rgba(120,150,190,.07)', key: -1, con: .9, hard: true, spot: .8, haze: .6, hazeB: -1, sun: null, amb: ['#05070c', .45, 'multiply'], shA: .5, cloud: '#1F2734', mtn: '#1C2431', mtn2: '#161D27' },
  golden: { skyT: '#E58A4E', skyB: '#FFD99E', gnd: '#A39A4E', gndF: '#D8B977', grid: 'rgba(120,60,20,.14)', key: -.85, con: .55, rim: '#FFC27A', rimA: .35, sun: { az: -38, el: 6, col: '#FFE6B0', r: 1.7 }, amb: ['#FF9A3C', .18, 'soft-light'], shLen: 2.4, shA: .3, haze: .55, cloud: '#FFE3C4', mtn: '#C99A88', mtn2: '#A9806F' },
  blue: { skyT: '#1E2D5C', skyB: '#7486BC', gnd: '#33465A', gndF: '#56688A', grid: 'rgba(160,190,255,.10)', key: .3, con: .25, sun: null, stars: .35, win: .85, lamp: .6, amb: ['#2B4590', .26, 'multiply'], haze: .5, hazeB: -.3, shA: .1, bulbs: .8, cloud: '#5A6A99', mtn: '#4F5F8E', mtn2: '#3C4B76' },
  night: { skyT: '#050914', skyB: '#141D36', gnd: '#10181A', gndF: '#1B2433', grid: 'rgba(140,170,230,.07)', key: .7, con: .65, sun: null, moon: { az: 25, el: 28 }, stars: 1, lamp: 1, win: 1, amb: ['#000A24', .42, 'multiply'], rim: '#8FCBFF', rimA: .35, haze: .6, hazeB: -1, shA: .32, bulbs: 1, cloud: '#1E2540', mtn: '#1B2340', mtn2: '#141A30' },
  silhouette: { skyT: '#EE7438', skyB: '#FFD98E', gnd: '#2B2128', gndF: '#4A3238', grid: 'rgba(0,0,0,.12)', sil: true, sun: { az: 0, el: 5, col: '#FFF4D0', r: 3 }, key: 0, con: 0, shA: 0, haze: .3, cloud: '#FFC08A', mtn: '#B85A48', mtn2: '#8E4038' },
  rim: { skyT: '#121824', skyB: '#283245', gnd: '#181E24', gndF: '#262E3A', grid: 'rgba(150,170,210,.07)', key: .2, con: .3, rim: '#FFE3A6', rimA: 1, amb: ['#000', .5, 'multiply'], sun: null, haze: .5, hazeB: -1, cloud: '#232B3B', mtn: '#20293A', mtn2: '#1A2130', shA: .1 },
  volumetric: { skyT: '#7096B6', skyB: '#CFE2EC', gnd: '#5E8A55', con: .45, rays: 1, haze: .85, amb: ['#18261c', .3, 'multiply'], sun: { az: -55, el: 50, col: '#FFF1CC', r: 1 }, shA: .3 },
  chiaro: { skyT: '#08090D', skyB: '#14161D', gnd: '#101210', gndF: '#181B20', grid: 'rgba(255,255,255,.04)', key: -1, con: 1, hard: true, spot: .9, sun: null, amb: ['#000', .35, 'multiply'], haze: .7, hazeB: -1, cloud: '#16181E', mtn: '#15171C', mtn2: '#111316', shA: .55 },
  hard: { con: .62, hard: true, shA: .45, shBlur: 0, key: -.75, sun: { az: -30, el: 60, col: '#FFFBEA', r: .9 } },
  soft: { skyT: '#A9BCCB', skyB: '#E1E8EE', gnd: '#83A877', gndF: '#B4C7B0', con: .26, hard: false, shA: .14, shBlur: 10, sun: null, haze: .55, cloud: '#EEF2F5', mtn: '#AAB9C5', mtn2: '#94A6B3' },
  practical: { skyT: '#060A14', skyB: '#121A30', gnd: '#0F1618', gndF: '#1A2230', grid: 'rgba(140,170,230,.06)', key: .8, con: .7, sun: null, stars: .6, lamp: 1.2, win: 1.2, amb: ['#000818', .48, 'multiply'], rim: '#FFC98A', rimA: .4, haze: .6, hazeB: -1, shA: .35, cloud: '#1A2036', mtn: '#182037', mtn2: '#121828' },
  neon: { skyT: '#0B0518', skyB: '#26103A', gnd: '#120C1C', gndF: '#22163A', grid: 'rgba(255,80,200,.10)', key: .8, con: .7, sun: null, stars: .4, lamp: 0, win: .4, neon: 1, amb: ['#3B0A5C', .35, 'multiply'], rim: '#FF3FA4', rimA: .9, shCol: '0,40,80', haze: .6, hazeB: -1, shA: .3, bulbs: .5, cloud: '#2A1440', mtn: '#2B1544', mtn2: '#1F0F33' }
};
function mkL(name) { return Object.assign({}, LBASE, LP[name] || {}); }
function mixL(a, b, k) {
  const o = {};
  for (const key in a) {
    const x = a[key], y = b[key];
    if (typeof x === 'number' && typeof y === 'number') o[key] = lerp(x, y, k);
    else if (typeof x === 'string' && typeof y === 'string' && x[0] === '#' && y[0] === '#') o[key] = mixHex(x, y, k);
    else o[key] = k < .5 ? x : y;
  }
  return o;
}
function lightAt(name, ts, S) {
  if (name === 'cycle') { // dia → dourada → azul → noite → azul → dia
    const seq = ['day', 'golden', 'blue', 'night', 'blue', 'day'], u = fract(ts / 60) * (seq.length - 1), i = Math.floor(u);
    const L = mixL(mkL(seq[i]), mkL(seq[i + 1]), sstep(0, 1, u - i));
    L.sun = { az: lerp(-60, 60, fract(ts / 60)), el: 45 * Math.sin(Math.PI * clamp(fract(ts / 60) * 1.9, 0, 1)), col: '#FFE6B0', r: 1.2 };
    if (L.sun.el < 1) L.sun = null;
    L.key = Math.sin(fract(ts / 60) * TAU) * -.9;
    return L;
  }
  const L = mkL(name);
  if (name === 'key') { L.key = Math.sin(ts * .9); L.con = .9; L.amb = ['#10141c', .25, 'multiply']; L.label = 'KEY ' + (L.key < -.2 ? '← esquerda' : L.key > .2 ? 'direita →' : 'frontal'); }
  if (name === 'fill') { const k = ease(pp(fract(ts / 5))); L.key = -.9; L.con = lerp(.95, .12, k); L.label = 'FILL ' + Math.round(k * 100) + '%'; }
  if (name === 'rim') { const on = fract(ts / 4) > .5; L.rimA = on ? 1 : 0; L.label = on ? 'RIM ON' : 'RIM OFF'; }
  if (name === 'three') {
    const k = fract(ts / 7.5); L.key = -.8; L.amb = ['#0b0f16', .3, 'multiply']; L.skyT = '#1A2130'; L.skyB = '#2E384A'; L.gnd = '#202830'; L.gndF = '#2A3240'; L.cloud = '#2A3242'; L.mtn = '#283246'; L.mtn2 = '#202838'; L.sun = null; L.hazeB = -1;
    if (k < 1 / 3) { L.con = .95; L.label = '1 · KEY'; } else if (k < 2 / 3) { L.con = .35; L.label = '2 · KEY + FILL'; } else { L.con = .35; L.rim = '#FFD9A0'; L.rimA = 1; L.label = '3 · KEY + FILL + RIM'; }
  }
  return L;
}

// ─── Estilos de render
const STY = {
  none: {},
  hand: { outline: 1.6, oc: '#3A2C24', boil: 8, paper: .32, flat: false, filter: 'saturate(.88) contrast(.96)', fps: 12 },
  anime: { outline: 1.4, oc: '#1C1A28', flat: false, hardShade: true, filter: 'saturate(1.35) contrast(1.05)', sky: ['#3C8CE6', '#BFE3FA'] },
  cgi: { softDOF: true, bloom: .25, filter: 'saturate(1.08)' },
  stop: { fps: 12, jitter: 1.4, filter: 'saturate(1.1) contrast(1.05) sepia(.08)', vig: .35 },
  clay: { fps: 12, jitter: 1.8, filter: 'saturate(1.35) contrast(.98)', vig: .3, clay: true },
  cutout: { flat: true, cut: true, paper: .45, fps: 12, filter: 'saturate(.95)' },
  pixel: { pixel: 5, fps: 12, filter: 'saturate(1.2) contrast(1.1)' },
  cel: { outline: 2.4, oc: '#101018', hardShade: true, filter: 'saturate(1.2) contrast(1.06)' },
  water: { paper: .55, filter: 'saturate(.85) contrast(.92) brightness(1.04) blur(.6px)', flat: true, bleed: true },
  noir: { filter: 'grayscale(1) contrast(1.35) brightness(1.05)', vig: .45, grain: true, hardShade: true },
  iso: { iso: true, outline: .8, oc: '#2A3442', filter: 'saturate(1.1)' }
};
const GRADE = {
  none: '', teal: 'saturate(1.12) contrast(1.08)', desat: 'saturate(.32) contrast(.94) brightness(1.04)',
  bw: 'grayscale(1) contrast(1.18)', vibrant: 'saturate(1.45) contrast(1.05)', pastel: 'saturate(.6) brightness(1.13) contrast(.82)',
  warm: 'sepia(.22) saturate(1.2) brightness(1.02)', cool: 'saturate(.9) hue-rotate(-8deg) brightness(1.02)',
  film: 'contrast(.9) saturate(.92) sepia(.14) brightness(1.03)'
};
const GRADE_CYCLE = [['teal', 'TEAL & ORANGE'], ['desat', 'DESSATURADO'], ['bw', 'P&B'], ['warm', 'QUENTE'], ['cool', 'FRIO'], ['pastel', 'PASTEL'], ['vibrant', 'VIBRANTE']];

// ─── Cena (x, z em metros; h = altura). Personagem principal em (0, 0, 10).
const MTN_FAR = [], MTN_NEAR = [];
for (let x = -260; x <= 260; x += 20) MTN_FAR.push([x, 9 + hash(x * .37) * 16]);
for (let x = -220; x <= 220; x += 13) MTN_NEAR.push([x, 3 + hash(x * .71 + 3) * 8]);
const BASE_OBJS = [
  { k: 'cloud', x: -24, y: 20, z: 85, h: 4, drift: .6 }, { k: 'cloud', x: 22, y: 25, z: 80, h: 5, drift: .4 }, { k: 'cloud', x: 4, y: 31, z: 95, h: 6, drift: .5 }, { k: 'cloud', x: -60, y: 26, z: 90, h: 5, drift: .45 },
  { k: 'tree', x: -6, z: 17, h: 5 }, { k: 'tree', x: -10, z: 24, h: 6 }, { k: 'tree', x: 7.5, z: 22, h: 5.5 }, { k: 'tree', x: 12, z: 30, h: 6.5 }, { k: 'tree', x: -16, z: 32, h: 7 }, { k: 'tree', x: -3.6, z: 27, h: 4.6 }, { k: 'tree', x: 18, z: 18, h: 5 }, { k: 'tree', x: -22, z: 14, h: 6 },
  { k: 'house', x: 4, z: 16, h: 4.2 },
  { k: 'lamp', x: 2.3, z: 13, h: 2.6 },
  { k: 'grass', x: -1.4, z: 7, h: .4 }, { k: 'grass', x: 1.2, z: 6, h: .35 }, { k: 'grass', x: -.7, z: 12, h: .3 }, { k: 'grass', x: 2.5, z: 9, h: .35 }, { k: 'grass', x: -2.6, z: 4.5, h: .45 }, { k: 'grass', x: .5, z: 3, h: .4 },
  { k: 'flower', x: -.45, z: 9.6, h: .32 },
  { k: 'bulbs', x: 0, z: 22, h: 3 }
];
const SYM_OBJS = [
  { k: 'tree', x: -4.6, z: 15, h: 5.2 }, { k: 'tree', x: 4.6, z: 15, h: 5.2 }, { k: 'tree', x: -8, z: 19, h: 6 }, { k: 'tree', x: 8, z: 19, h: 6 },
  { k: 'house', x: 0, z: 17, h: 4.2 }, { k: 'cloud', x: 0, y: 24, z: 85, h: 5, drift: 0 }, { k: 'flower', x: -.6, z: 9.8, h: .3 }, { k: 'flower', x: .6, z: 9.8, h: .3 }
];
const STARS = Array.from({ length: 140 }, (_, i) => [hash(i * 3.1), hash(i * 7.7 + 1), .4 + hash(i * 1.3) * 1.2]);

// ─── Estado de render (escopo do quadro atual)
let R = null;

function camFromRig(r, t) {
  const T = { x: r.tx, y: r.ty + r.ped, z: r.tz }, el = r.el * D2R, az = r.az * D2R;
  const C = { x: T.x - r.d * Math.cos(el) * Math.sin(az), y: T.y + r.d * Math.sin(el), z: T.z - r.d * Math.cos(el) * Math.cos(az) };
  C.y = Math.max(C.y, r.minY); C.x += r.cx; C.y += r.cy; C.z += r.cz;
  const dx = T.x - C.x, dy = T.y - C.y, dz = T.z - C.z, h = Math.hypot(dx, dz);
  let yaw = Math.atan2(dx, dz) + r.yawOff * D2R, pitch = Math.atan2(dy, h) + r.pitchOff * D2R, roll = r.roll * D2R;
  if (r.shake) { yaw += noise1(t * 1.9) * .9 * D2R * r.shake; pitch += noise1(t * 2.3 + 7) * .7 * D2R * r.shake; roll += noise1(t * 1.4 + 3) * .8 * D2R * r.shake; C.x += noise1(t * 1.1 + 9) * .01 * r.shake; C.y += noise1(t * 2.7 + 2) * .012 * r.shake; }
  pitch = clamp(pitch, -89.5 * D2R, 89.5 * D2R);
  return { x: C.x, y: C.y, z: C.z, yaw, pitch, roll, cy: Math.cos(yaw), sy: Math.sin(yaw), cp: Math.cos(pitch), sp: Math.sin(pitch), f: r.f, N: r.N, fd: r.fd != null ? r.fd : Math.hypot(dx, dy, dz) };
}
function toCam(x, y, z) {
  const c = R.cam, dx = x - c.x, dy = y - c.y, dz = z - c.z;
  const x1 = dx * c.cy - dz * c.sy, z1 = dx * c.sy + dz * c.cy;
  return [x1, dy * c.cp - z1 * c.sp, dy * c.sp + z1 * c.cp];
}
function proj(v) { return [R.W / 2 + v[0] * R.F / v[2], R.H / 2 - v[1] * R.F / v[2]]; }
function cocPx(z) { // círculo de confusão em px
  const f = R.cam.f / 1000, N = R.cam.N; if (N >= 15) return 0;
  return (f * f / N) * Math.abs(1 / R.cam.fd - 1 / Math.max(z, .01)) / .036 * R.W;
}
function clipPoly(pts) { // Sutherland–Hodgman contra o plano próximo, em espaço de câmera
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], ai = a[2] >= NEAR, bi = b[2] >= NEAR;
    if (ai) out.push(a);
    if (ai !== bi) { const k = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, NEAR]); }
  }
  return out;
}
function worldPoly(pts, fill) {
  const cp = clipPoly(pts.map(p => toCam(p[0], p[1], p[2]))); if (cp.length < 3) return false;
  const c = R.ctx; c.beginPath(); cp.forEach((v, i) => { const s = proj(v); i ? c.lineTo(s[0], s[1]) : c.moveTo(s[0], s[1]); }); c.closePath();
  c.fillStyle = fill; c.fill(); return true;
}
function worldLine(a, b) {
  let A = toCam(a[0], a[1], a[2]), B = toCam(b[0], b[1], b[2]);
  if (A[2] < NEAR && B[2] < NEAR) return;
  if (A[2] < NEAR) { const k = (NEAR - A[2]) / (B[2] - A[2]); A = [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, NEAR]; }
  if (B[2] < NEAR) { const k = (NEAR - B[2]) / (A[2] - B[2]); B = [B[0] + (A[0] - B[0]) * k, B[1] + (A[1] - B[1]) * k, NEAR]; }
  const p = proj(A), q = proj(B); R.ctx.moveTo(p[0], p[1]); R.ctx.lineTo(q[0], q[1]);
}

// ─── Primitivas de desenho com luz/estilo
// perspectiva atmosférica por mistura de cor (sem ctx.filter: custo O(1) por preenchimento em vez de um passe de pixels por objeto)
const HZC = new Map();
function col(c) {
  if (R.L.sil) return R.L.silCol;
  if (R.hz < .02 || c[0] !== '#') return c;
  const k = c + R.L.skyB + (R.hz * 50 | 0); let v = HZC.get(k);
  if (!v) { v = mixHex(c, R.L.skyB, Math.round(R.hz * 50) / 50 * .85); if (HZC.size > 4000) HZC.clear(); HZC.set(k, v); }
  return v;
}
function shape(path, color, o) {
  o = o || {}; const c = R.ctx;
  c.beginPath(); path(c); c.fillStyle = o.raw ? color : col(color); c.fill();
  if (R.shade && !o.noShade && !R.L.sil && !R.st.flat) { c.fillStyle = R.shade; c.fill(); }
  if (R.st.clay && !R.L.sil && !o.noShade) { c.fillStyle = R.clayGrad; c.fill(); }
  if (R.st.outline && !o.noLine) { c.lineWidth = R.st.outline * R.pxs / R.scale; c.strokeStyle = R.st.oc; c.lineJoin = 'round'; c.stroke(); }
  if (o.rim && R.L.rim && R.L.rimA > .01 && !R.st.flat) R.rimQ.push({ m: c.getTransform(), path, lw: 2.2 * R.pxs / R.scale });
}
function mkShade(c, w) {
  const L = R.L; if (L.con <= .02 || Math.abs(L.key) < .05) return null;
  const a = clamp(L.con * .66 * Math.min(1, Math.abs(L.key) * 1.4), 0, .92), s = Math.sign(L.key);
  const g = c.createLinearGradient(-w / 2 * -s, 0, w / 2 * -s, 0), dark = `rgba(${L.shCol},${a})`, clear = `rgba(${L.shCol},0)`;
  if (L.hard || R.st.hardShade) { g.addColorStop(0, clear); g.addColorStop(.5, clear); g.addColorStop(.52, dark); g.addColorStop(1, dark); }
  else { g.addColorStop(0, clear); g.addColorStop(.3, `rgba(${L.shCol},${a * .12})`); g.addColorStop(1, dark); }
  return g;
}
const rr = (c, x, y, w, h, r) => { c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); };
const circ = (c, x, y, r) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); };

// Personagem (unidades em metros, y negativo = para cima)
function drawChar(c, o) {
  const ts = R.ts, walk = o.walk, side = walk ? 1 : 0, w = walk ? ts * 7 : 0;
  const J = o.jacket || '#2F6F8F', SC = o.scarf || '#D23A2F', skin = '#D9A07A', hair = '#2B1E1A', pants = '#2C3A55';
  const sw = Math.sin(w) * .42;
  // pernas
  if (side) {
    for (const s of [-1, 1]) { c.save(); c.translate(0, -.8); c.rotate(sw * s); shape(cc => rr(cc, -.05, 0, .1, .8, .04), pants); c.restore(); }
  } else {
    shape(cc => rr(cc, -.14, -.82, .1, .82, .04), pants); shape(cc => rr(cc, .04, -.82, .1, .82, .04), pants);
  }
  // braços atrás
  if (side) { c.save(); c.translate(0, -1.36); c.rotate(-sw * .8); shape(cc => rr(cc, -.045, 0, .09, .5, .045), mixHex(J, '#000000', .2)); c.restore(); }
  // corpo
  shape(cc => rr(cc, -.2, -1.45, .4, .68, .12), J, { rim: 1 });
  if (!side) { shape(cc => rr(cc, -.29, -1.4, .09, .52, .045), J, { rim: 1 }); shape(cc => rr(cc, .2, -1.4, .09, .52, .045), J, { rim: 1 }); }
  else { c.save(); c.translate(0, -1.36); c.rotate(sw * .8); shape(cc => rr(cc, -.045, 0, .09, .5, .045), J); c.restore(); }
  // cachecol com ponta tremulando
  const fl = Math.sin(ts * 6) * .04, dir = side ? -1 : 1;
  shape(cc => { cc.moveTo(.1 * dir, -1.44); cc.quadraticCurveTo(.26 * dir, -1.38 + fl, .4 * dir, -1.3 - fl); cc.lineTo(.38 * dir, -1.22 - fl); cc.quadraticCurveTo(.24 * dir, -1.3 + fl, .06 * dir, -1.36); cc.closePath(); }, SC);
  shape(cc => rr(cc, -.19, -1.5, .38, .1, .05), SC, { rim: 1 });
  // cabeça
  const hy = -1.63;
  if (o.back) { shape(cc => circ(cc, 0, hy, .15), hair, { rim: 1 }); return; }
  shape(cc => circ(cc, side ? .02 : 0, hy, .15), skin, { rim: 1 });
  shape(cc => { cc.ellipse(side ? -.01 : 0, hy - .04, .158, .11, 0, Math.PI, 0); cc.closePath(); }, hair);
  if (R.L.sil) return;
  const blink = (fract(ts / 3.3) < .04) ? .12 : 1, ex = side ? [.09] : [-.052, .052];
  c.fillStyle = '#1A1414';
  for (const x of ex) { c.beginPath(); c.ellipse(x, hy + .01, .02, .027 * blink, 0, 0, TAU); c.fill(); }
  if (blink > .5) { c.fillStyle = '#fff'; for (const x of ex) { c.beginPath(); c.arc(x + .007, hy, .007, 0, TAU); c.fill(); } }
  c.fillStyle = 'rgba(230,110,110,.45)'; for (const x of (side ? [.06] : [-.09, .09])) { c.beginPath(); c.arc(x, hy + .05, .025, 0, TAU); c.fill(); }
  c.strokeStyle = '#5A2A22'; c.lineWidth = .012; c.beginPath(); side ? c.arc(.1, hy + .065, .025, .2, 1.6) : c.arc(0, hy + .055, .03, .3, Math.PI - .3); c.stroke();
}
function topChar(c, o) {
  shape(cc => cc.ellipse(0, 0, .26, .13, 0, 0, TAU), o.jacket || '#2F6F8F', { noShade: 1 });
  shape(cc => cc.ellipse(0, 0, .2, .1, 0, 0, TAU), o.scarf || '#D23A2F', { noShade: 1 });
  shape(cc => circ(cc, 0, 0, .13), '#2B1E1A', { noShade: 1 });
}
function drawTree(c, o) {
  const h = o.h, g1 = o.x % 2 ? '#3E7D4F' : '#357248', g2 = '#2C6340';
  shape(cc => rr(cc, -.13 * h / 5, -h * .5, .26 * h / 5, h * .5, .05), '#6B4A35');
  shape(cc => { circ(cc, -h * .17, -h * .52, h * .22); circ(cc, h * .17, -h * .5, h * .22); circ(cc, 0, -h * .68, h * .3); }, g1);
  if (!R.L.sil) { R.ctx.fillStyle = 'rgba(255,255,255,.07)'; R.ctx.beginPath(); circ(R.ctx, -h * .08, -h * .78, h * .12); R.ctx.fill(); }
  void g2;
}
function topTree(c, o) { const h = o.h; shape(cc => circ(cc, 0, 0, h * .34), '#357248', { noShade: 1 }); shape(cc => circ(cc, -h * .06, -h * .06, h * .18), '#4A8A5A', { noShade: 1 }); }
function drawHouse(c, o) {
  shape(cc => rr(cc, -1.6, -2.6, 3.2, 2.6, .05), '#C9B79C');
  shape(cc => { cc.moveTo(-1.95, -2.55); cc.lineTo(0, -4.2); cc.lineTo(1.95, -2.55); cc.closePath(); }, '#8E3B32');
  shape(cc => rr(cc, -.32, -1.25, .64, 1.25, .04), '#5A3A2A', { noShade: 1 });
  const lit = R.L.win;
  shape(cc => rr(cc, .55, -1.95, .62, .55, .03), lit > .1 ? '#FFD27A' : '#9CC3D8', { noShade: 1, raw: lit > .1 && !R.L.sil });
  shape(cc => rr(cc, -1.25, -1.95, .5, .55, .03), lit > .1 ? '#FFC768' : '#9CC3D8', { noShade: 1, raw: lit > .1 && !R.L.sil });
  if (lit > .1 && !R.L.sil) glow(c, .86, -1.7, 1.6, `rgba(255,190,90,${.35 * lit})`);
  if (R.L.neon) {
    c.save(); c.lineWidth = .09; c.shadowColor = '#FF3FA4'; c.shadowBlur = 18 * R.pxs; c.strokeStyle = '#FF7ACB';
    c.beginPath(); c.arc(-.1, -3.2, .32, 0, TAU); c.stroke();
    c.shadowColor = '#3FE6FF'; c.strokeStyle = '#9AF4FF'; c.beginPath(); c.moveTo(-1.3, -2.3); c.lineTo(1.3, -2.3); c.stroke(); c.restore();
    R.flares.push(c.getTransform().transformPoint(new DOMPoint(-.1, -3.2)));
  }
}
function topHouse(c) { shape(cc => rr(cc, -1.95, -1.7, 3.9, 3.4, .05), '#8E3B32', { noShade: 1 }); R.ctx.strokeStyle = 'rgba(0,0,0,.3)'; R.ctx.lineWidth = .06; R.ctx.beginPath(); R.ctx.moveTo(-1.95, 0); R.ctx.lineTo(1.95, 0); R.ctx.stroke(); }
function glow(c, x, y, r, color) {
  const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.beginPath(); circ(c, x, y, r); c.fill(); c.restore();
}
function drawLamp(c, o) {
  const h = o.h;
  shape(cc => rr(cc, -.045, -h, .09, h, .02), '#2F3540', { noShade: 1 });
  shape(cc => rr(cc, -.17, -h - .14, .34, .16, .04), '#2F3540', { noShade: 1 });
  const on = R.L.lamp;
  if (on > .05 && !R.L.sil) {
    shape(cc => rr(cc, -.12, -h + .01, .24, .07, .03), '#FFE7B0', { noShade: 1, raw: 1 });
    glow(c, 0, -h + .05, 2.4, `rgba(255,196,120,${.42 * Math.min(1, on)})`);
    R.flares.push(c.getTransform().transformPoint(new DOMPoint(0, -h + .05)));
  }
}
function drawGrass(c, o) {
  const h = o.h; c.strokeStyle = col(R.L.sil ? R.L.silCol : '#4F8A4A'); c.lineWidth = h * .08; c.lineCap = 'round';
  for (let i = -3; i <= 3; i++) { const sway = Math.sin(R.ts * 1.6 + i + o.x) * h * .12; c.beginPath(); c.moveTo(i * h * .08, 0); c.quadraticCurveTo(i * h * .14, -h * .5, i * h * .22 + sway, -h * (1 - Math.abs(i) * .1)); c.stroke(); }
}
function drawFlower(c, o) {
  const h = o.h; c.strokeStyle = col('#3E7A3E'); c.lineWidth = .012; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(.02, -h * .5, 0, -h * .88); c.stroke();
  shape(cc => cc.ellipse(.04, -h * .4, .04, .015, -.5, 0, TAU), '#4C8C46', { noShade: 1 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + R.ts * .1; shape(cc => cc.ellipse(Math.cos(a) * .035, -h * .9 + Math.sin(a) * .035, .03, .02, a, 0, TAU), '#E2474F', { noShade: 1 }); }
  shape(cc => circ(cc, 0, -h * .9, .018), '#F6C744', { noShade: 1 });
}
function topFlower(c, o) { for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; shape(cc => cc.ellipse(Math.cos(a) * .035, Math.sin(a) * .035, .03, .02, a, 0, TAU), '#E2474F', { noShade: 1 }); } shape(cc => circ(cc, 0, 0, .018), '#F6C744', { noShade: 1 }); }
function drawCloud(c, o) { const h = o.h; c.fillStyle = col(R.L.cloud); c.globalAlpha = R.L.sil ? .6 : .92; c.beginPath(); circ(c, 0, -h * .4, h * .45); circ(c, -h * .6, -h * .2, h * .32); circ(c, h * .6, -h * .25, h * .35); circ(c, h * .2, -h * .62, h * .3); c.fill(); c.globalAlpha = 1; }
function drawBird(c, o) { const f = Math.sin(R.ts * 12) * .25; c.strokeStyle = col('#2A2A33'); c.lineWidth = .06; c.lineCap = 'round'; c.beginPath(); c.moveTo(-.45, -f - .1); c.quadraticCurveTo(-.2, -.15, 0, 0); c.quadraticCurveTo(.2, -.15, .45, -f - .1); c.stroke(); }
function drawBranch(c, o) {
  c.strokeStyle = col('#3A2A20'); c.lineWidth = .025; c.beginPath(); c.moveTo(-.6, -.05); c.quadraticCurveTo(-.2, -.25, .15, -.42); c.stroke();
  for (let i = 0; i < 9; i++) { const k = i / 8, x = lerp(-.55, .12, k), y = lerp(-.07, -.4, k) - Math.sin(k * 3) * .05; shape(cc => cc.ellipse(x, y + (i % 2 ? .04 : -.04), .07, .03, i % 2 ? .6 : -.6, 0, TAU), i % 3 ? '#3F7A3A' : '#5B9A48', { noShade: 1 }); }
}
function drawLeaf(c, o) { c.save(); c.rotate(o.rot); shape(cc => cc.ellipse(0, 0, .05, .025, 0, 0, TAU), o.col, { noShade: 1 }); c.restore(); }
const DRAW = { char: drawChar, tree: drawTree, house: drawHouse, lamp: drawLamp, grass: drawGrass, flower: drawFlower, cloud: drawCloud, bird: drawBird, branch: drawBranch, leaf: drawLeaf };
const TOP = { char: topChar, tree: topTree, house: topHouse, flower: topFlower };

function drawObj(o, idx) {
  const c = R.ctx, y0 = o.y || 0;
  const v0 = toCam(o.x, y0, o.z); if (v0[2] < NEAR) return;
  const v1 = toCam(o.x, y0 + o.h, o.z);
  const s = R.F / v0[2], b = proj(v0);
  let fore = 0, t = null;
  if (v1[2] > NEAR) { t = proj(v1); fore = Math.hypot(t[0] - b[0], t[1] - b[1]) / (s * o.h); }
  let m;
  const useTop = fore < .42 && TOP[o.k];
  if (useTop) {
    const px = toCam(o.x + 1, y0, o.z), pz = toCam(o.x, y0, o.z + 1); if (px[2] < NEAR || pz[2] < NEAR) return;
    const a = proj(px), d = proj(pz); m = new DOMMatrix([a[0] - b[0], a[1] - b[1], -(d[0] - b[0]), -(d[1] - b[1]), b[0], b[1]]);
  } else {
    if (!t) return;
    m = new DOMMatrix([s, 0, -(t[0] - b[0]) / o.h, -(t[1] - b[1]) / o.h, b[0], b[1]]);
  }
  // cull fora da tela
  const sx = b[0], sy = b[1], rad = s * Math.max(o.h, o.k === 'house' ? 4 : o.k === 'cloud' ? 8 : 1) * 1.6;
  if (sx + rad < -R.W * .6 || sx - rad > R.W * 1.6 || sy + rad < -R.H * .6 || sy - rad > R.H * 1.8 + rad) return;
  let jm = R.base;
  const jit = R.st.jitter ? R.st.jitter * R.pxs : R.st.boil ? 1.1 * R.pxs : 0;
  if (jit) { const seed = Math.floor(R.ts * (R.st.boil || 12)) * 13 + idx * 7.3; jm = jm.translate((hash(seed) - .5) * jit * 2, (hash(seed + 1.7) - .5) * jit * 2).rotate((hash(seed + 3.1) - .5) * (R.st.boil ? 1 : .8)); }
  c.save(); c.setTransform(jm.multiply(m));
  R.scale = useTop ? Math.max(1, Math.hypot(m.a, m.b)) : s;
  // DOF + perspectiva atmosférica via filtro por objeto
  const zc = (v0[2] + (v1[2] > NEAR ? v1[2] : v0[2])) / 2;
  R.hz = clamp((zc - 6) / 90, 0, .7) * R.L.haze * R.hazeMul;
  if (R.st.cut && o.k !== 'cloud') { c.shadowColor = 'rgba(30,20,10,.35)'; c.shadowBlur = 6 * R.pxs; c.shadowOffsetX = 3 * R.pxs; c.shadowOffsetY = 4 * R.pxs; }
  const w = o.k === 'house' ? 4 : o.k === 'tree' ? o.h * .8 : .6;
  R.shade = useTop ? null : mkShade(c, w);
  if (R.st.clay) { const g = c.createRadialGradient(-.1, -o.h * .8, 0, 0, -o.h * .5, o.h * .7); g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(0,0,0,.12)'); R.clayGrad = g; }
  if (o.k === 'bulbs') drawBulbs(o);
  else if (useTop) TOP[o.k](c, o); else DRAW[o.k](c, o);
  c.restore(); R.hz = 0;
}
function drawBulbs(o) {
  if (!R.L.bulbs || R.L.sil) return;
  const c = R.ctx; c.setTransform(R.base); c.save(); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i <= 26; i++) {
    const k = i / 26, x = lerp(-9, 9, k), y = 2.9 - Math.sin(k * Math.PI * 3) ** 2 * .5, z = o.z + Math.sin(i) * .6;
    const v = toCam(x, y, z); if (v[2] < NEAR) continue;
    const p = proj(v), r = Math.max(1.6 * R.pxs, cocPx(v[2]) * .55), a = R.L.bulbs * clamp(5 * R.pxs / r, .38, .95);
    const hue = i % 3 === 0 ? '255,200,120' : i % 3 === 1 ? '255,170,110' : '255,225,160';
    const g = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], r); g.addColorStop(0, `rgba(${hue},${a})`); g.addColorStop(.75, `rgba(${hue},${a * .8})`); g.addColorStop(1, `rgba(${hue},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(p[0], p[1], r, 0, TAU); c.fill();
  }
  c.restore();
}

// ─── Render de cena completa em um canvas de destino
function buildRig(S) {
  const sh = SH[S.shot || 'fs'];
  const r = { d: sh.d, ty: sh.ty, tx: sh.tx || 0, tz: sh.tz || 10, f: sh.f, el: sh.el || 0, az: sh.az || 0, N: sh.N || 5.6, fd: null, yawOff: 0, pitchOff: 0, roll: 0, ped: 0, shake: 0, mb: 0, cx: 0, cy: 0, cz: 0, minY: .05, follow: false };
  if (S.angle) { const a = ANG[S.angle]; r.el = a.el; r.roll += a.roll || 0; r.d *= a.dMul || 1; r.ty += a.ty || 0; }
  if (S.lens) { if (S.lens.f) { r.d *= S.lens.f / r.f; r.f = S.lens.f; } if (S.lens.N) r.N = S.lens.N; }
  const st = STY[S.style] || STY.none;
  if (st.iso) { r.el = 35; r.az = 40; r.d *= 400 / r.f * 1.1; r.f = 400; r.N = 22; }
  return r;
}
function sceneObjects(S, ts, r) {
  const objs = [];
  const src = S.comp && S.comp.sym ? BASE_OBJS.filter(o => o.k === 'cloud' || o.k === 'grass' || o.k === 'bulbs').concat(SYM_OBJS) : BASE_OBJS;
  for (const o of src) {
    if (o.k === 'cloud') { const x = ((o.x + ts * o.drift + 120) % 240 + 240) % 240 - 120; objs.push(Object.assign({}, o, { x })); }
    else objs.push(o);
  }
  objs.push({ k: 'bird', x: ((ts * 4) % 60 + 60) % 60 - 30, y: 6 + Math.sin(ts * 2) * .4, z: 18, h: .2 });
  if (!SH[S.shot || 'fs'].hideChar && !S.hideChar) objs.push({ k: 'char', x: R.charX, y: R.charY, z: 10, h: 1.78, walk: R.walking });
  const pt = (SH[S.shot || 'fs'].partner);
  if (pt === 'ots') objs.push({ k: 'char', x: -.62, z: 8.25, h: 1.74, back: true, jacket: '#C99A2E', scarf: '#3B6FB6' });
  if (pt === 'two') objs.push({ k: 'char', x: -.8, z: 10, h: 1.7, jacket: '#C99A2E', scarf: '#3B6FB6' });
  if (S.rack || (S.comp && S.comp.fgframe)) {
    const cam = R.cam, fx = cam.x + Math.sin(cam.yaw) * 1.6 - Math.cos(cam.yaw) * .15, fz = cam.z + Math.cos(cam.yaw) * 1.6 + Math.sin(cam.yaw) * .15;
    objs.push({ k: 'branch', x: fx, y: cam.y - .3, z: fz, h: .45 });
  }
  if (S.fx && S.fx.includes('leaves')) {
    for (let i = 0; i < 16; i++) {
      const k = fract(ts * .18 + i * .37), x = (hash(i) - .5) * 3 + Math.sin(ts * 1.3 + i) * .35, z = 9 + hash(i + 9) * 3;
      objs.push({ k: 'leaf', x, y: 3.6 - k * 3.6, z, h: .05, rot: ts * 3 + i, col: i % 2 ? '#D98E2E' : '#C2562E' });
    }
  }
  return objs;
}

function renderScene(cv, S, t) {
  const W = cv.width, H = cv.height, ctx = cv.getContext('2d');
  const st = STY[S.style] || STY.none, tm = TM[S.time || 'normal'];
  let ts = tm.s(t), tc = tm.c(t);
  if (st.fps) { ts = Math.floor(ts * st.fps) / st.fps; tc = Math.floor(tc * st.fps) / st.fps; }
  const L = lightAt(tm.cycle ? 'cycle' : (S.light || 'day'), ts, S);
  if (st.sky && !S.light) { L.skyT = st.sky[0]; L.skyB = st.sky[1]; }
  R = { ctx, W, H, ts, L, st, S, pxs: W / 960, hz: 0, rimQ: [], flares: [], hazeMul: 1, charX: 0, charY: 0, walking: false };
  if (S.fx && S.fx.includes('haze')) R.hazeMul = 2.6;
  if (S.fx && S.fx.includes('fog')) R.hazeMul = 3.4;
  // ação do personagem
  if (S.act === 'walk') { R.walking = true; R.charX = ((ts * 1.25 + 12) % 24 + 24) % 24 - 12; }
  if (S.act === 'hop') { const k = fract(ts / 2.2); R.charY = k < .45 ? 4 * .55 * (k / .45) * (1 - k / .45) : 0; }
  if (S.jumpX != null) R.charX = S.jumpX;
  // câmera
  const r = buildRig(S);
  const mv = typeof S.move === 'function' ? S.move : MV[S.move || 'static'];
  mv(r, tc, S);
  if (S.rigFn) S.rigFn(r, tc);
  if (S.comp) {
    if (S.comp.thirds) r.yawOff += Math.atan(6 / r.f) / D2R;
    if (S.comp.neg) { r.yawOff -= Math.atan(11 / r.f) / D2R; r.pitchOff += Math.atan(5 / r.f) / D2R; }
    if (S.comp.lead) { r.follow = true; r.yawOff += Math.atan(6 / r.f) / D2R; }
  }
  if (r.follow) r.tx += R.charX;
  R.cam = camFromRig(r, tc);
  if (S.rack) { const k = sstep(.35, .65, pp(fract(tc / 6))); R.cam.fd = lerp(1.65, r.d, k); R.label = k < .5 ? 'FOCO: 1º PLANO' : 'FOCO: PERSONAGEM'; }
  R.F = W * R.cam.f / 36; R.mb = Math.max(r.mb, S.mb || 0);
  R.base = new DOMMatrix().translate(W / 2, H / 2).rotate(R.cam.roll / D2R).translate(-W / 2, -H / 2);
  R.info = { f: R.cam.f, N: R.cam.N };

  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.setTransform(R.base);
  // céu
  const hy = H / 2 + R.F * Math.tan(R.cam.pitch), big = Math.hypot(W, H);
  const sg = ctx.createLinearGradient(0, Math.min(hy, H) - H * 1.1, 0, hy); sg.addColorStop(0, L.skyT); sg.addColorStop(1, L.skyB);
  ctx.fillStyle = sg; ctx.fillRect(W / 2 - big, H / 2 - big, big * 2, big * 2);
  if (L.stars > .01) {
    ctx.fillStyle = `rgba(255,255,255,${.75 * L.stars})`;
    for (const s of STARS) { const x = fract(s[0] - R.cam.yaw / TAU * 2) * W * 1.4 - W * .2, y = hy - s[1] * (H * 1.2) - 6; if (y < hy - 4) { ctx.fillRect(x, y, s[2] * R.pxs, s[2] * R.pxs); } }
  }
  // sol / lua
  const body = L.sun || L.moon;
  if (body) {
    const az = body.az * D2R, el = body.el * D2R, v = toCam(R.cam.x + Math.sin(az) * Math.cos(el) * 1e4, R.cam.y + Math.sin(el) * 1e4, R.cam.z + Math.cos(az) * Math.cos(el) * 1e4);
    if (v[2] > 0) {
      const p = proj(v), rad = (L.sun ? 26 * L.sun.r : 20) * R.pxs * Math.sqrt(R.cam.f / 35);
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad * 5); g.addColorStop(0, L.sun ? 'rgba(255,240,200,.55)' : 'rgba(200,220,255,.25)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], rad * 5, 0, TAU); ctx.fill();
      ctx.fillStyle = L.sun ? L.sun.col : '#EEF2FF'; ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, TAU); ctx.fill();
      if (L.sun) R.sunP = p; R.flares.push(new DOMPoint(p[0], p[1]));
    }
  }
  // montanhas (polígonos em mundo)
  const mfar = MTN_FAR.map(p => [p[0], p[1], 120]); mfar.push([260, 0, 120], [-260, 0, 120]);
  const mnear = MTN_NEAR.map(p => [p[0], p[1], 80]); mnear.push([220, 0, 80], [-220, 0, 80]);
  const hzf = clamp(L.haze * R.hazeMul * .55, 0, .85);
  ctx.filter = 'none';
  worldPoly(mfar, mixHex(L.mtn, L.skyB, hzf));
  worldPoly(mnear, mixHex(L.mtn2, L.skyB, hzf * .7));
  // chão
  const gg = ctx.createLinearGradient(0, hy, 0, Math.max(hy + 10, H)); gg.addColorStop(0, mixHex(L.gndF, L.skyB, clamp(.25 * R.hazeMul, 0, .8))); gg.addColorStop(1, L.gnd);
  ctx.fillStyle = gg;
  const G = 600; worldPoly([[-G, 0, -G], [G, 0, -G], [G, 0, G], [-G, 0, G]], gg);
  // grade de layout (lápis azul)
  ctx.strokeStyle = L.grid; ctx.lineWidth = 1 * R.pxs; ctx.beginPath();
  for (let z = -40; z <= 120; z += 4) worldLine([-80, 0, z], [80, 0, z]);
  for (let x = -80; x <= 80; x += 4) worldLine([x, 0, -40], [x, 0, 120]);
  ctx.stroke();
  // caminho (linhas guia)
  if (S.comp && S.comp.path) {
    const L1 = [], L2 = [];
    for (let i = 0; i <= 30; i++) { const k = i / 30, z = lerp(-14, 16, k), x = Math.sin(k * 3.2) * 2.2 * (1 - k) + k * 3.6, w = lerp(1.6, .7, k); L1.push([x - w, 0.005, z]); L2.unshift([x + w, 0.005, z]); }
    worldPoly(L1.concat(L2), L.sil ? L.silCol : '#D9C59A');
    ctx.strokeStyle = 'rgba(120,90,50,.55)'; ctx.lineWidth = 2 * R.pxs; ctx.beginPath();
    for (let i = 0; i < 30; i++) { worldLine(L1[i], L1[i + 1]); worldLine(L2[i], L2[i + 1]); }
    ctx.stroke();
    for (let z = -12; z < 15; z += 2.4) { const k = (z + 14) / 30, x = Math.sin(k * 3.2) * 2.2 * (1 - k) + k * 3.6 - lerp(1.6, .7, k) - .5; ctx.strokeStyle = '#6B4A35'; ctx.lineWidth = 3 * R.pxs; ctx.beginPath(); worldLine([x, 0, z], [x, .9, z]); ctx.stroke(); }
  }
  const objs = sceneObjects(S, ts, r);
  // sombras no chão
  if (L.shA > .01) {
    const soft = (L.shBlur != null ? L.shBlur : (L.hard ? 0 : 6)) > 0, passes = soft ? [1.25, 1, .75] : [1];
    for (const o of objs) {
      if (!['char', 'tree', 'house', 'lamp'].includes(o.k)) continue;
      const w = o.k === 'house' ? 2.2 : o.k === 'tree' ? o.h * .28 : o.k === 'lamp' ? .15 : .28;
      const len = L.shLen * o.h * .5, cx = o.x - L.key * len * .6, cz = o.z + len * .3, rx = w + Math.abs(L.key) * len * .5, rz = w * .55 + len * .15;
      const a = L.shA * (o.k === 'char' && R.charY > 0 ? .5 : 1) / passes.length;
      for (const sc of passes) { const pts = []; for (let i = 0; i < 18; i++) { const q = i / 18 * TAU; pts.push([cx + Math.cos(q) * rx * sc, .01, cz + Math.sin(q) * rz * sc]); } worldPoly(pts, `rgba(${L.shCol},${soft ? a * 1.3 : a})`); }
    }
  }
  // objetos do fundo para frente
  // DOF em camadas: objetos consecutivos (ordem de pintura) com o mesmo nível de desfoque vão para uma
  // camada que recebe UM blur ao ser descarregada — no máx. ~6 passes de blur por quadro em vez de 1 por objeto.
  const withD = objs.map((o, i) => ({ o, i, d: toCam(o.x, (o.y || 0) + o.h * .5, o.z)[2] })).filter(e => e.d > NEAR).sort((a, b) => b.d - a.d);
  if (layerCv.width !== W || layerCv.height !== H) { layerCv.width = W; layerCv.height = H; }
  const lctx = layerCv.getContext('2d'); lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, W, H);
  const BK = [0, 1.5, 3, 5, 8, 12];
  let curB = 0;
  const flush = () => { if (curB > 0) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = `blur(${(curB * R.pxs).toFixed(1)}px)`; ctx.drawImage(layerCv, 0, 0); ctx.restore(); lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, W, H); } };
  for (const e of withD) {
    let bl = e.o.k === 'bulbs' ? 0 : cocPx(e.d) * .38 / R.pxs * (R.st.softDOF ? 1.2 : 1);
    let b = 0; for (const v of BK) if (bl >= v * .8) b = v;
    if (b !== curB) { flush(); curB = b; }
    R.ctx = b > 0 ? lctx : ctx; drawObj(e.o, e.i);
  }
  flush(); R.ctx = ctx;
  ctx.setTransform(R.base); ctx.filter = 'none'; ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  // névoa (fx)
  if (S.fx && S.fx.includes('fog')) {
    for (let i = 0; i < 4; i++) {
      const y = hy - H * .05 + i * H * .09 + Math.sin(ts * .3 + i) * 6, g = ctx.createLinearGradient(0, y - H * .25, 0, y + H * .25);
      g.addColorStop(0, 'rgba(235,240,244,0)'); g.addColorStop(.5, `rgba(235,240,244,${.42 - i * .07})`); g.addColorStop(1, 'rgba(235,240,244,0)');
      ctx.fillStyle = g; ctx.fillRect(-W * .5, y - H * .25, W * 2, H * .5);
    }
  }
  // luz ambiente
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (L.amb) { ctx.globalCompositeOperation = L.amb[2]; ctx.globalAlpha = L.amb[1]; ctx.fillStyle = L.amb[0]; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  const sp = proj(toCam(R.charX, 1.25 + R.charY, 10));
  if (L.spot > .01) {
    const rr0 = Math.min(W, H) * .18, g = ctx.createRadialGradient(sp[0], sp[1], rr0 * .4, sp[0], sp[1], Math.max(W, H) * .6);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.35, `rgba(0,0,0,${L.spot * .6})`); g.addColorStop(1, `rgba(0,0,0,${L.spot})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  // rim light (por cima da luz ambiente para continuar brilhando)
  if (L.rim && L.rimA > .01 && R.rimQ.length) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = L.rim; ctx.globalAlpha = L.rimA; ctx.lineJoin = 'round';
    for (const q of R.rimQ) { ctx.setTransform(q.m); ctx.lineWidth = q.lw; ctx.beginPath(); q.path(ctx); ctx.stroke(); }
    ctx.restore(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  // raios volumétricos
  if (L.rays > .01) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const ox = -W * .1, oy = -H * .3;
    for (let i = 0; i < 7; i++) {
      const a0 = .35 + i * .13, a1 = a0 + .045 + hash(i) * .04, len = big * 1.4, fl = .1 + .05 * Math.sin(ts * .7 + i * 2);
      const g = ctx.createLinearGradient(ox, oy, ox + Math.cos(a0) * len, oy + Math.sin(a0) * len); g.addColorStop(0, `rgba(255,240,200,${fl * 2})`); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + Math.cos(a0) * len, oy + Math.sin(a0) * len); ctx.lineTo(ox + Math.cos(a1) * len, oy + Math.sin(a1) * len); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // partículas
  const fx = S.fx || [];
  if (fx.includes('rain')) {
    ctx.fillStyle = 'rgba(40,50,70,.18)'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(210,225,245,.5)'; ctx.lineWidth = 1.1 * R.pxs; ctx.beginPath();
    for (let i = 0; i < 220; i++) { const d = .4 + hash(i) * .6, x = fract(hash(i + 3) + ts * .05 * d) * W * 1.1, y = fract(hash(i + 7) + ts * 1.6 * d) * H * 1.2 - H * .1, l = 22 * d * R.pxs; ctx.moveTo(x, y); ctx.lineTo(x - l * .18, y + l); }
    ctx.stroke();
  }
  if (fx.includes('snow')) {
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    for (let i = 0; i < 160; i++) { const d = .3 + hash(i) * .7, x = fract(hash(i + 1) + Math.sin(ts * .8 * d + i) * .01 + ts * .01) * W, y = fract(hash(i + 5) + ts * .12 * d) * H, s = (1 + d * 3) * R.pxs; ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill(); }
  }
  if (fx.includes('dust')) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) { const x = fract(hash(i) + Math.sin(ts * .2 + i) * .02) * W, y = fract(hash(i + 2) - ts * .01 * (1 + hash(i + 4))) * H, a = .25 + .3 * Math.sin(ts * 2 + i); ctx.fillStyle = `rgba(255,236,190,${Math.max(0, a)})`; ctx.beginPath(); ctx.arc(x, y, (1 + hash(i + 8) * 1.6) * R.pxs, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  // moldura de folhagem
  if (S.comp && S.comp.fgframe) {
    // folhagem desenhada numa camada e desfocada uma única vez
    const l = layerCv.getContext('2d'); l.setTransform(1, 0, 0, 1, 0, 0); l.clearRect(0, 0, W, H); l.fillStyle = '#16261A';
    for (let i = 0; i < 18; i++) { const side = i % 2 ? 1 : -1, x = side > 0 ? W * (.9 + hash(i) * .15) : W * (.1 - hash(i) * .15), y = H * hash(i + 4) * 1.1 - H * .05; l.beginPath(); l.ellipse(x, y, W * .09, H * .08, hash(i + 2) * 3, 0, TAU); l.fill(); }
    for (let i = 0; i < 8; i++) { l.beginPath(); l.ellipse(W * (i / 7), -H * .02, W * .08, H * .07, i, 0, TAU); l.fill(); }
    ctx.save(); ctx.filter = `blur(${6 * R.pxs}px)`; ctx.drawImage(layerCv, 0, 0); ctx.restore();
  }
  // mãos (POV)
  if (SH[S.shot || 'fs'].hands) {
    const bob = Math.sin(ts * 5) * 6 * R.pxs;
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(W / 2 + s * W * .3, H + bob); ctx.rotate(s * -.35);
      ctx.fillStyle = '#2F6F8F'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-W * .05, -H * .05, W * .1, H * .3, 20 * R.pxs) : ctx.rect(-W * .05, -H * .05, W * .1, H * .3); ctx.fill();
      ctx.fillStyle = '#D9A07A'; ctx.beginPath(); ctx.ellipse(0, -H * .1, W * .045, H * .085, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  // flares
  if (fx.includes('flare') || fx.includes('anaflare')) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of R.flares) {
      if (p.x < -W * .2 || p.x > W * 1.2 || p.y < -H * .2 || p.y > H * 1.2) continue;
      if (fx.includes('anaflare')) {
        const g = ctx.createLinearGradient(p.x - W * .6, 0, p.x + W * .6, 0); g.addColorStop(0, 'rgba(60,140,255,0)'); g.addColorStop(.5, 'rgba(110,180,255,.55)'); g.addColorStop(1, 'rgba(60,140,255,0)');
        ctx.fillStyle = g; ctx.fillRect(p.x - W * .6, p.y - 2 * R.pxs, W * 1.2, 4 * R.pxs);
        ctx.fillStyle = 'rgba(110,170,255,.12)'; ctx.fillRect(p.x - W * .4, p.y - 7 * R.pxs, W * .8, 14 * R.pxs);
      } else {
        const cx = W / 2 - p.x, cy = H / 2 - p.y;
        [[.35, 18, '255,200,120', .18], [.7, 9, '120,220,180', .2], [1.1, 26, '255,140,90', .1], [1.5, 13, '160,140,255', .16], [1.85, 40, '255,220,160', .07]].forEach(([k, s, cc, a]) => {
          ctx.fillStyle = `rgba(${cc},${a})`; ctx.beginPath(); ctx.arc(p.x + cx * k * 2, p.y + cy * k * 2, s * R.pxs * 1.4, 0, TAU); ctx.fill();
        });
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, W * .25); g.addColorStop(0, 'rgba(255,220,160,.45)'); g.addColorStop(1, 'rgba(255,220,160,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
    }
    ctx.restore();
  }
  post(cv, S, st, ts);
  return R;
}

// ─── Pós-produção
let noiseCv = null, paperCv = null;
function getNoise() {
  if (noiseCv) return noiseCv; noiseCv = document.createElement('canvas'); noiseCv.width = noiseCv.height = 192;
  const c = noiseCv.getContext('2d'), d = c.createImageData(192, 192);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  c.putImageData(d, 0, 0); return noiseCv;
}
function getPaper() {
  if (paperCv) return paperCv; paperCv = document.createElement('canvas'); paperCv.width = paperCv.height = 256;
  const c = paperCv.getContext('2d'); c.fillStyle = '#F3EEE2'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(${120 + Math.random() * 60},${110 + Math.random() * 50},90,${Math.random() * .08})`; c.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3); }
  for (let i = 0; i < 60; i++) { c.strokeStyle = 'rgba(140,120,90,.08)'; c.beginPath(); const x = Math.random() * 256, y = Math.random() * 256; c.moveTo(x, y); c.lineTo(x + Math.random() * 30 - 15, y + Math.random() * 30 - 15); c.stroke(); }
  return paperCv;
}
const layerCv = document.createElement('canvas'), tmpCv = document.createElement('canvas'), smallCv = document.createElement('canvas');
let fishMap = null, fishKey = '';
function post(cv, S, st, ts) {
  const W = cv.width, H = cv.height, ctx = cv.getContext('2d'), fx = S.fx || [];
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = 'none';
  if (tmpCv.width !== W || tmpCv.height !== H) { tmpCv.width = W; tmpCv.height = H; }
  const tctx = tmpCv.getContext('2d');
  // tilt-shift: cópia desfocada mascarada em cima e embaixo
  if (fx.includes('tiltshift')) {
    tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.globalCompositeOperation = 'source-over'; tctx.clearRect(0, 0, W, H); tctx.filter = `blur(${7 * R.pxs}px)`; tctx.drawImage(cv, 0, 0); tctx.filter = 'none';
    const g = tctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#000'); g.addColorStop(.36, 'rgba(0,0,0,0)'); g.addColorStop(.62, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000');
    tctx.globalCompositeOperation = 'destination-in'; tctx.fillStyle = g; tctx.fillRect(0, 0, W, H); tctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(tmpCv, 0, 0);
  }
  // bloom / halação
  if (fx.includes('halation') || st.bloom) {
    tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, W, H); tctx.filter = `blur(${12 * R.pxs}px) brightness(1.35) saturate(1.6)`; tctx.drawImage(cv, 0, 0); tctx.filter = 'none';
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = st.bloom || .42; ctx.drawImage(tmpCv, 0, 0); ctx.restore();
  }
  // grade de cor
  let grade = S.grade || 'none';
  if (grade === 'cycle') { const g = GRADE_CYCLE[Math.floor(ts / 1.6) % GRADE_CYCLE.length]; grade = g[0]; R.label = g[1]; }
  const filt = [GRADE[grade] || '', st.filter || ''].join(' ').trim();
  if (filt) { tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, W, H); tctx.drawImage(cv, 0, 0); ctx.filter = filt; ctx.drawImage(tmpCv, 0, 0); ctx.filter = 'none'; }
  if (grade === 'teal') {
    ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = 'rgba(0,120,140,.55)'; ctx.fillRect(0, 0, W, H);
    const sp = R.subjP || [W / 2, H / 2], g = ctx.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], W * .45); g.addColorStop(0, 'rgba(255,140,60,.6)'); g.addColorStop(1, 'rgba(255,140,60,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  if (grade === 'warm' || grade === 'film') { ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = 'rgba(255,150,60,.35)'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  if (grade === 'cool') { ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = 'rgba(40,110,220,.5)'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  if (grade === 'pastel') { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = 'rgba(255,190,220,.14)'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  if (grade === 'film') { ctx.save(); ctx.globalCompositeOperation = 'lighten'; ctx.fillStyle = 'rgba(28,24,30,1)'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  // fisheye: remapeamento radial por pixel (mapa pré-calculado por tamanho)
  if (fx.includes('fisheye')) {
    const key = W + 'x' + H;
    if (fishKey !== key) {
      fishKey = key; fishMap = new Int32Array(W * H); const cx = W / 2, cy = H / 2, s = W / 2;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const nx = (x - cx) / s, ny = (y - cy) / s, r = Math.hypot(nx, ny), k = .5 + .5 * r * r;
        const sx = Math.round(cx + nx * k * s), sy = Math.round(cy + ny * k * s);
        fishMap[y * W + x] = (r > 1.08 || sx < 0 || sy < 0 || sx >= W || sy >= H) ? -1 : sy * W + sx;
      }
    }
    const img = ctx.getImageData(0, 0, W, H), src = new Uint32Array(img.data.buffer.slice(0)), dst = new Uint32Array(img.data.buffer);
    for (let i = 0; i < fishMap.length; i++) { const j = fishMap[i]; dst[i] = j < 0 ? 0xFF000000 : src[j]; }
    ctx.putImageData(img, 0, 0);
  }
  if (fx.includes('ca')) {
    const img = ctx.getImageData(0, 0, W, H), d = img.data, src = new Uint8ClampedArray(d), sh = Math.round(3 * R.pxs);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, k = Math.abs(x - W / 2) / (W / 2), o = Math.round(sh * (.3 + k));
      d[i] = src[(y * W + Math.min(W - 1, x + o)) * 4]; d[i + 2] = src[(y * W + Math.max(0, x - o)) * 4 + 2];
    }
    ctx.putImageData(img, 0, 0);
  }
  // pixel art
  if (st.pixel) {
    const sw = Math.round(W / st.pixel / R.pxs / 1.4), sh2 = Math.round(sw * H / W);
    smallCv.width = sw; smallCv.height = sh2; const sc = smallCv.getContext('2d'); sc.imageSmoothingEnabled = true; sc.drawImage(cv, 0, 0, sw, sh2);
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, W, H); ctx.drawImage(smallCv, 0, 0, W, H); ctx.imageSmoothingEnabled = true;
  }
  if (st.paper) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = st.paper; ctx.fillStyle = ctx.createPattern(getPaper(), 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore(); }
  if (st.bleed) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .18; ctx.filter = `blur(${4 * R.pxs}px)`; ctx.drawImage(cv, 0, 0); ctx.restore(); }
  if (fx.includes('vignette') || st.vig) {
    const a = st.vig || .6, g = ctx.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, W * .65);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (fx.includes('grain') || st.grain) {
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = .14;
    const p = ctx.createPattern(getNoise(), 'repeat'); ctx.translate(Math.random() * 192, Math.random() * 192); ctx.fillStyle = p; ctx.fillRect(-192, -192, W + 384, H + 384); ctx.restore();
  }
  if (fx.includes('letterbox')) { const bh = (H - W / 2.39) / 2; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh); }
}

// ─── Demos 2D dos princípios (desenhadas como em papel de animação, com pinos de registro)
const PAPER = '#F3F5F7', INK = '#283142', BLUE = '#3B79C9', RED = '#D7352C';
function paper2d(c, W, H) {
  c.setTransform(1, 0, 0, 1, 0, 0); c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(59,121,201,.10)'; c.lineWidth = 1; c.beginPath();
  for (let x = 0; x < W; x += H / 12) { c.moveTo(x, 0); c.lineTo(x, H); } for (let y = 0; y < H; y += H / 12) { c.moveTo(0, y); c.lineTo(W, y); } c.stroke();
  // pinos de registro (Acme): furo redondo central e dois rasgos
  c.fillStyle = '#D5DCE4'; c.strokeStyle = '#B9C3CF';
  c.beginPath(); c.arc(W / 2, H * .045, H * .018, 0, TAU); c.fill(); c.stroke();
  for (const s of [-1, 1]) { c.beginPath(); rr(c, W / 2 + s * W * .14 - H * .045, H * .03, H * .09, H * .03, H * .015); c.fill(); c.stroke(); }
}
let QUIET = false;
function label(c, txt, x, y, H, color, align) { if (QUIET) return; c.font = `600 ${Math.round(H * .042)}px "IBM Plex Mono", ui-monospace, monospace`; c.fillStyle = color || INK; c.textAlign = align || 'center'; c.textBaseline = 'middle'; c.fillText(txt, x, y); }
function ball(c, x, y, r, sx, sy, color, ang) { c.save(); c.translate(x, y); c.rotate(ang || 0); c.scale(sx, sy); c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = color || RED; c.fill(); c.restore(); }
function ghost(c, x, y, r, sx, sy, a, color) { c.save(); c.translate(x, y); c.scale(sx, sy); c.beginPath(); c.arc(0, 0, r, 0, TAU); c.strokeStyle = color || BLUE; c.globalAlpha = a; c.lineWidth = 1.5; c.stroke(); c.restore(); }
function bean(c, x, y, s, o) {
  o = o || {}; const sx = o.sx || 1, sy = o.sy || 1;
  c.save(); c.translate(x, y); c.scale(sx, sy);
  c.fillStyle = o.body || '#2F6F8F'; c.beginPath(); rr(c, -s * .38, -s * 1.1, s * .76, s * 1.1, s * .38); c.fill();
  c.fillStyle = o.scarf || RED; c.beginPath(); rr(c, -s * .4, -s * .62, s * .8, s * .12, s * .06); c.fill();
  c.fillStyle = '#F2D2B0'; c.beginPath(); c.ellipse(0, -s * .82, s * .28, s * .17, 0, 0, TAU); c.fill();
  const bl = o.blink ? .12 : 1, look = o.look || 0;
  c.fillStyle = '#1A1414'; for (const ex of [-.1, .1]) { c.beginPath(); c.ellipse((ex + look * .06) * s, -s * .84, s * .04, s * .055 * bl, 0, 0, TAU); c.fill(); }
  c.restore();
}
function bounceY(p, hmax) { return hmax * 4 * p * (1 - p); }
function sqBall(p, amt) { const speed = Math.abs(1 - 2 * p), c = Math.max(0, 1 - Math.min(p, 1 - p) / .06); const sy = (1 + amt * .35 * speed * speed) * (1 - amt * .5 * c); return [1 / sy, sy]; }

const P2D = {
  squash(c, W, H, t) {
    const G = H * .82, hmax = H * .52, r = H * .07, T = 1.1;
    c.strokeStyle = BLUE; c.lineWidth = 2; c.beginPath(); c.moveTo(W * .08, G); c.lineTo(W * .92, G); c.stroke();
    [[.3, 0, 'RÍGIDA'], [.7, 1, 'SQUASH & STRETCH']].forEach(([px, amt, name]) => {
      for (let k = 6; k >= 1; k--) { const p = fract((t - k / 24) / T), [sx, sy] = sqBall(p, amt); ghost(c, W * px, G - bounceY(p, hmax) - r * sy, r, sx, sy, .08 * (7 - k), BLUE); }
      const p = fract(t / T), [sx, sy] = sqBall(p, amt); ball(c, W * px, G - bounceY(p, hmax) - r * sy, r, sx, sy, amt ? RED : INK);
      label(c, name, W * px, H * .92, H, amt ? RED : INK);
    });
  },
  anticipation(c, W, H, t) {
    const G = H * .8, u = fract(t / 3), s = H * .26; let sx = 1, sy = 1, y = 0, ph = 0;
    if (u < .3) { const b = Math.sin(u * 30) * .01; sy = 1 + b; ph = 0; }
    else if (u < .5) { const k = sstep(.3, .5, u); sy = 1 - .32 * k; sx = 1 + .22 * k; ph = 1; }
    else if (u < .78) { const k = (u - .5) / .28; y = bounceY(k, H * .38); sy = 1 + .25 * (1 - k * 1.4 < 0 ? 0 : 1 - k * 1.4); sx = 1 / sy; ph = 2; }
    else { const k = (u - .78) / .22; sy = 1 - .25 * Math.exp(-k * 6) * Math.cos(k * 14); sx = 1 / sy; ph = 3; }
    c.strokeStyle = BLUE; c.lineWidth = 2; c.beginPath(); c.moveTo(W * .2, G); c.lineTo(W * .8, G); c.stroke();
    bean(c, W / 2, G - y, s, { sx, sy, blink: u > .29 && u < .31 });
    ['1 · ANTECIPAÇÃO', '2 · AÇÃO', '3 · RECUPERAÇÃO'].forEach((n, i) => label(c, n, W * (.22 + i * .28), H * .14, H, ph === i + 1 ? RED : 'rgba(40,49,66,.35)'));
  },
  staging(c, W, H, t) {
    const good = fract(t / 6) > .5, G = H * .78, s = H * .2;
    if (!good) { for (let i = 0; i < 9; i++) { c.fillStyle = `hsla(${i * 40},45%,70%,.5)`; c.fillRect(W * hash(i), H * hash(i + 3) * .7, W * .12, H * .1); } }
    else { const g = c.createRadialGradient(W / 2, G - s, s * .3, W / 2, G - s, W * .45); g.addColorStop(0, 'rgba(255,240,200,.45)'); g.addColorStop(1, 'rgba(0,0,0,.18)'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
    [-1, 0, 1].forEach(i => {
      const main = i === 0, mv = good ? (main ? 1 : 0) : 1, ph = t * 3 + i * 2;
      bean(c, W / 2 + i * W * .25, G - Math.abs(Math.sin(ph)) * H * .08 * mv, s, { body: good && !main ? '#9AA6B4' : '#2F6F8F', scarf: good && !main ? '#B8C0CA' : RED, look: Math.sin(ph) * mv });
    });
    label(c, good ? 'COM STAGING · um foco por vez' : 'SEM STAGING · tudo disputa atenção', W / 2, H * .92, H, good ? RED : INK);
  },
  pose(c, W, H, t) {
    const N = 13, pts = []; for (let i = 0; i < N; i++) { const k = i / (N - 1), e = ease(k); pts.push([lerp(W * .15, W * .85, e), H * .75 - Math.sin(e * Math.PI) * H * .5]); }
    c.setLineDash([4, 6]); c.strokeStyle = 'rgba(59,121,201,.4)'; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); c.setLineDash([]);
    pts.forEach((p, i) => {
      const key = i === 0 || i === 6 || i === 12;
      c.beginPath(); c.arc(p[0], p[1], key ? H * .05 : H * .022, 0, TAU); c.strokeStyle = key ? RED : BLUE; c.lineWidth = key ? 3 : 1.5; c.stroke();
      label(c, String(i + 1), p[0], p[1] - (key ? H * .085 : H * .05), H * (key ? 1 : .8), key ? RED : BLUE);
    });
    const f = Math.floor(fract(t / 1.6) * 16); const p = pts[Math.min(N - 1, f)]; ball(c, p[0], p[1], H * .035, 1, 1, INK);
    label(c, 'KEYS (vermelho) · IN-BETWEENS (azul)', W / 2, H * .92, H);
  },
  follow(c, W, H, t) {
    const G = H * .8, s = H * .24, T = 3.2, u = fract(t / T), stop = .38;
    const k = Math.min(1, u / stop), x = lerp(W * .2, W * .62, 1 - Math.pow(1 - k, 3)), vel = u < stop ? 3 * Math.pow(1 - k, 2) : 0;
    const tau = Math.max(0, (u - stop) * T);
    c.strokeStyle = BLUE; c.lineWidth = 2; c.beginPath(); c.moveTo(W * .1, G); c.lineTo(W * .9, G); c.stroke();
    bean(c, x, G, s);
    // antena com 4 segmentos, cada um com atraso (overlapping)
    let px = x, py = G - s * 1.1, ang = -Math.PI / 2;
    c.strokeStyle = INK; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(px, py);
    for (let i = 0; i < 4; i++) {
      const lag = Math.max(0, tau - i * .07), osc = u < stop ? -vel * .25 * (i + 1) / 2 : -.75 * (i + 1) / 2.5 * Math.exp(-lag * 2.2) * Math.cos(lag * 9 + Math.PI);
      ang = -Math.PI / 2 + osc * (u < stop ? 1 : -1); px += Math.cos(ang) * s * .14; py += Math.sin(ang) * s * .14; c.lineTo(px, py);
    }
    c.stroke(); ball(c, px, py, H * .025, 1, 1, RED);
    label(c, u < stop ? 'CORPO EM MOVIMENTO' : 'CORPO PAROU · ANTENA CONTINUA', W / 2, H * .92, H, u < stop ? INK : RED);
  },
  ease(c, W, H, t) {
    const T = 2.4, u = fract(t / T), k = clamp(pp(u) * 1.25 - .125, 0, 1), N = 13;
    [[.32, 'LINEAR', x => x, INK], [.68, 'SLOW IN / SLOW OUT', ease, RED]].forEach(([y, name, fn, color]) => {
      const Y = H * y; c.strokeStyle = 'rgba(40,49,66,.25)'; c.lineWidth = 1; c.beginPath(); c.moveTo(W * .12, Y); c.lineTo(W * .88, Y); c.stroke();
      for (let i = 0; i < N; i++) { const x = lerp(W * .12, W * .88, fn(i / (N - 1))); c.strokeStyle = color === RED ? RED : BLUE; c.lineWidth = 2; c.beginPath(); c.moveTo(x, Y + H * .06); c.lineTo(x, Y + H * .1); c.stroke(); }
      ball(c, lerp(W * .12, W * .88, fn(Math.floor(k * 24) / 24)), Y, H * .045, 1, 1, color);
      label(c, name, W * .12, Y - H * .1, H, color, 'left');
    });
    label(c, 'marcas = posição em cada quadro (spacing chart)', W / 2, H * .94, H * .85, 'rgba(40,49,66,.6)');
  },
  arcs(c, W, H, t) {
    const k = ease(pp(fract(t / 2.6)));
    [[.3, false, 'RETA · mecânico'], [.68, true, 'ARCO · orgânico']].forEach(([y, arc, name]) => {
      const Y = H * y, at = q => [lerp(W * .2, W * .8, q), Y - (arc ? Math.sin(q * Math.PI) * H * .16 : 0)];
      c.setLineDash([3, 6]); c.strokeStyle = 'rgba(59,121,201,.45)'; c.lineWidth = 1.5; c.beginPath(); for (let i = 0; i <= 40; i++) { const p = at(i / 40); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); } c.stroke(); c.setLineDash([]);
      for (let g = 1; g <= 5; g++) { const p = at(clamp(k - g * .04, 0, 1)); ghost(c, p[0], p[1], H * .04, 1, 1, .1 * (6 - g)); }
      const p = at(k); ball(c, p[0], p[1], H * .04, 1, 1, arc ? RED : INK); label(c, name, W * .5, Y + H * .1, H, arc ? RED : INK);
    });
  },
  secondary(c, W, H, t) {
    const G = H * .78, s = H * .26, bob = Math.abs(Math.sin(t * 5)) * H * .03;
    c.strokeStyle = BLUE; c.lineWidth = 2; c.beginPath(); for (let x = 0; x < W; x += 40) { const xx = (x - t * 120) % W; c.moveTo((xx + W) % W, G); c.lineTo((xx + W) % W + 18, G); } c.stroke();
    bean(c, W * .45, G - bob, s, { blink: fract(t / 2.7) < .05 });
    c.strokeStyle = RED; c.lineWidth = H * .03; c.lineCap = 'round'; c.beginPath(); c.moveTo(W * .45 - s * .3, G - bob - s * .56);
    c.quadraticCurveTo(W * .45 - s * .7, G - bob - s * .55 + Math.sin(t * 9) * H * .03, W * .45 - s * 1.0, G - bob - s * .45 + Math.sin(t * 9 + 1) * H * .04); c.stroke();
    for (let i = 0; i < 3; i++) { const k = fract(t * .5 + i / 3); c.globalAlpha = 1 - k; label(c, '♪', W * .52 + k * W * .15, G - s * 1.1 - k * H * .3, H * 1.6, INK); c.globalAlpha = 1; }
    label(c, 'PRIMÁRIA: andar · SECUNDÁRIA: cachecol, assobio, piscar', W / 2, H * .93, H * .9);
  },
  timing(c, W, H, t) {
    [[.32, 6, 'RÁPIDO · 6 quadros', H * .035, RED], [.68, 24, 'LENTO · 24 quadros', H * .055, INK]].forEach(([y, n, name, r, color]) => {
      const Y = H * y, cyc = (n + 12) / 24, u = fract(t / cyc) * cyc * 24, f = Math.min(n, Math.floor(u));
      for (let i = 0; i <= n; i++) ghost(c, lerp(W * .15, W * .85, i / n), Y, r, 1, 1, .25);
      ball(c, lerp(W * .15, W * .85, f / n), Y, r, 1, 1, color); label(c, name, W * .15, Y - H * .11, H, color, 'left');
    });
  },
  exag(c, W, H, t) {
    const G = H * .84, r = H * .065;
    c.strokeStyle = BLUE; c.lineWidth = 2; c.beginPath(); c.moveTo(W * .08, G); c.lineTo(W * .92, G); c.stroke();
    { const p = fract(t / 1), [sx, sy] = sqBall(p, .4); ball(c, W * .3, G - bounceY(p, H * .3) - r * sy, r, sx, sy, INK); label(c, 'REALISTA', W * .3, H * .93, H); }
    { const p = fract(t / 1.4), e = p < .5 ? 1 - Math.pow(1 - p * 2, 2.5) : 1 - Math.pow((p - .5) * 2, 2.5), y = H * .62 * e, sp = Math.abs(1 - 2 * p); const c0 = Math.max(0, 1 - Math.min(p, 1 - p) / .07); const sy = (1 + 1.1 * sp * sp) * (1 - .62 * c0); ball(c, W * .7, G - y - r * sy, r, 1 / sy, sy, RED); label(c, 'EXAGERADO', W * .7, H * .93, H, RED); }
  },
  solid(c, W, H, t) {
    const a = t * .6, b = .5, s = H * .22, cx = W * .32, cy = H * .48;
    const V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map(([x, y, z]) => { const x1 = x * Math.cos(a) - z * Math.sin(a), z1 = x * Math.sin(a) + z * Math.cos(a), y1 = y * Math.cos(b) - z1 * Math.sin(b), z2 = y * Math.sin(b) + z1 * Math.cos(b), p = 4 / (4 + z2); return [cx + x1 * s * p, cy + y1 * s * p, z2]; });
    const F = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]];
    c.fillStyle = 'rgba(0,0,0,.12)'; c.beginPath(); c.ellipse(cx, H * .82, s * 1.3, s * .25, 0, 0, TAU); c.fill();
    F.map(f => ({ f, z: f.reduce((m, i) => m + V[i][2], 0) })).sort((p, q) => q.z - p.z).forEach(({ f }, i) => { c.beginPath(); f.forEach((j, k) => k ? c.lineTo(V[j][0], V[j][1]) : c.moveTo(V[j][0], V[j][1])); c.closePath(); c.fillStyle = `rgba(47,111,143,${.25 + i * .1})`; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); });
    const sx = W * .7, sy = H * .5, sr = H * .2, g = c.createRadialGradient(sx - sr * .4, sy - sr * .4, sr * .1, sx, sy, sr); g.addColorStop(0, '#F07A6E'); g.addColorStop(1, '#8E1F18');
    c.fillStyle = 'rgba(0,0,0,.12)'; c.beginPath(); c.ellipse(sx + sr * .2, H * .82, sr, sr * .2, 0, 0, TAU); c.fill();
    c.fillStyle = g; c.beginPath(); c.arc(sx, sy, sr, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.5; for (let i = -2; i <= 2; i++) { c.beginPath(); c.ellipse(sx, sy, sr * Math.abs(Math.cos(a + i * .6)), sr, 0, 0, TAU); c.stroke(); }
    label(c, 'VOLUME · PESO · PERSPECTIVA', W / 2, H * .93, H);
  },
  appeal(c, W, H, t) {
    const bl = fract(t / 3) < .05, bob = Math.sin(t * 2) * H * .01;
    // sem apelo
    const x1 = W * .3, y1 = H * .48 + bob; c.fillStyle = '#9AA3AD'; c.fillRect(x1 - H * .17, y1 - H * .2, H * .34, H * .4);
    c.fillStyle = INK; c.fillRect(x1 - H * .08, y1 - H * .05, H * .03, bl ? 2 : H * .03); c.fillRect(x1 + H * .05, y1 - H * .05, H * .03, bl ? 2 : H * .03); c.fillRect(x1 - H * .06, y1 + H * .08, H * .12, 3);
    label(c, 'SEM APELO', x1, H * .9, H);
    // com apelo
    const x2 = W * .7, y2 = H * .5 + bob; c.fillStyle = '#F2D2B0'; c.beginPath(); c.ellipse(x2, y2, H * .2, H * .22, 0, 0, TAU); c.fill();
    c.fillStyle = '#2B1E1A'; c.beginPath(); c.ellipse(x2 - H * .02, y2 - H * .15, H * .22, H * .11, -.15, Math.PI, 0); c.fill(); c.beginPath(); c.moveTo(x2 + H * .05, y2 - H * .24); c.quadraticCurveTo(x2 + H * .14, y2 - H * .36, x2 + H * .2, y2 - H * .28); c.quadraticCurveTo(x2 + H * .12, y2 - H * .28, x2 + H * .1, y2 - H * .2); c.fill();
    for (const s of [-1, 1]) { c.fillStyle = '#1A1414'; c.beginPath(); c.ellipse(x2 + s * H * .075, y2 + H * .01, H * .045, bl ? 2 : H * .06, 0, 0, TAU); c.fill(); if (!bl) { c.fillStyle = '#fff'; c.beginPath(); c.arc(x2 + s * H * .075 + H * .015, y2 - H * .015, H * .015, 0, TAU); c.fill(); } c.fillStyle = 'rgba(230,110,110,.5)'; c.beginPath(); c.arc(x2 + s * H * .13, y2 + H * .08, H * .03, 0, TAU); c.fill(); }
    c.strokeStyle = '#5A2A22'; c.lineWidth = 3; c.beginPath(); c.arc(x2, y2 + H * .08, H * .04, .3, Math.PI - .3); c.stroke();
    label(c, 'COM APELO', x2, H * .9, H, RED);
  },
  fps(c, W, H, t) {
    [[.24, 0, '60 fps · vídeo/game'], [.5, 24, '24 fps · cinema'], [.76, 12, '12 fps']].forEach(([y, f, name]) => {
      const tt = f ? Math.floor(t * f) / f : t, x = lerp(W * .15, W * .85, (Math.sin(tt * 2.2) + 1) / 2);
      label(c, name, W * .05, H * y - H * .08, H, f === 24 ? RED : INK, 'left'); ball(c, x, H * y, H * .04, 1, 1, f === 24 ? RED : INK);
    });
  },
  twos(c, W, H, t) {
    [[.24, 24, 'ON ONES · 24 desenhos/s'], [.5, 12, 'ON TWOS · 12 desenhos/s'], [.76, 8, 'ON THREES · 8 desenhos/s']].forEach(([y, f, name]) => {
      const tt = Math.floor(t * f) / f, x = lerp(W * .15, W * .85, (Math.sin(tt * 2.2) + 1) / 2);
      label(c, name, W * .05, H * y - H * .08, H, f === 12 ? RED : INK, 'left'); ball(c, x, H * y, H * .04, 1, 1, f === 12 ? RED : INK);
    });
  },
  smear(c, W, H, t) {
    const T = 2.4, u = fract(t / T), f = Math.floor(u * 20), Y = H * .5;
    const pos = i => lerp(W * .12, W * .88, ease(clamp(i / 10, 0, 1)));
    for (let i = 0; i <= 10; i++) ghost(c, pos(i), Y, H * .05, 1, 1, .15);
    const i = Math.min(10, f), x = pos(i), v = i > 0 && i < 10 ? pos(i) - pos(i - 1) : 0, isSmear = v > W * .1;
    if (isSmear) {
      c.fillStyle = RED; c.beginPath(); c.moveTo(x - v, Y - H * .01); c.quadraticCurveTo(x - v * .3, Y - H * .05, x, Y - H * .05); c.arc(x, Y, H * .05, -Math.PI / 2, Math.PI / 2); c.quadraticCurveTo(x - v * .3, Y + H * .05, x - v, Y + H * .01); c.fill();
      for (let k = 1; k <= 3; k++) ball(c, x - v * k * .3, Y, H * .05 * (1 - k * .2), 1, 1, `rgba(215,53,42,${.5 - k * .12})`);
    } else ball(c, x, Y, H * .05, 1, 1, INK);
    label(c, `QUADRO ${String(i + 1).padStart(2, '0')}${isSmear ? ' · SMEAR' : ''}`, W / 2, H * .82, H, isSmear ? RED : INK);
  },
  loop(c, W, H, t) {
    const G = H * .75, s = H * .28, f = Math.floor(t * 12) % 8, ph = f / 8 * TAU;
    c.strokeStyle = BLUE; c.lineWidth = 2; c.beginPath(); for (let x = -40; x < W + 40; x += 36) { const xx = ((x - t * 140) % (W + 72) + W + 72) % (W + 72) - 36; c.moveTo(xx, G); c.lineTo(xx + 16, G); } c.stroke();
    c.strokeStyle = '#2C3A55'; c.lineWidth = H * .035; c.lineCap = 'round';
    for (const sgn of [-1, 1]) { const a = Math.sin(ph) * .5 * sgn; c.beginPath(); c.moveTo(W / 2, G - s * .35); c.lineTo(W / 2 + Math.sin(a) * s * .38, G - s * .35 + Math.cos(a) * s * .35); c.stroke(); }
    bean(c, W / 2, G - s * .3 - Math.abs(Math.cos(ph)) * H * .02, s * .9);
    label(c, `CICLO · quadro ${f + 1}/8 ↻`, W / 2, H * .9, H, RED);
  },
  hold(c, W, H, t) {
    const G = H * .8, s = H * .3;
    bean(c, W * .3, G, s); label(c, 'HOLD MORTO', W * .3, H * .92, H);
    const br = Math.sin(t * 2.2) * .02; bean(c, W * .7 + Math.sin(t * .7) * 2, G, s, { sy: 1 + br, sx: 1 - br * .5, blink: fract(t / 2.8) < .05, look: Math.sin(t * .5) * .6 });
    label(c, 'MOVING HOLD', W * .7, H * .92, H, RED);
  }
};
function draw2D(cv, key, t) { const c = cv.getContext('2d'), W = cv.width, H = cv.height; paper2d(c, W, H); (P2D[key] || P2D.squash)(c, W, H, t); }

// ─── Render: motor 3D (world3d.js) quando disponível; o 2.5D acima é o fallback sem WebGL2
const W3T0 = performance.now();
function renderAny(cv, S, t) {
  const W3 = window.World3D;
  if (W3 && W3.ready) { try { return W3.render(S, t, cv); } catch (e) { console.error(e); W3.ready = false; W3.failed = true; } }
  if ((W3 && W3.failed) || performance.now() - W3T0 > 9000) return renderScene(cv, S, t);
  const c = cv.getContext('2d'), W = cv.width, H = cv.height;
  c.setTransform(1, 0, 0, 1, 0, 0); c.filter = 'none'; c.globalAlpha = 1; c.fillStyle = '#0B0E13'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#9FB0C4'; c.font = `600 ${Math.max(11, Math.round(15 * W / 960))}px "IBM Plex Mono", monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('carregando cena 3D…', W / 2, H / 2);
  return { label: '', info: null, mb: 0, L: {} };
}
function renderShot(cv, S, t) {   // qualquer spec (cena, papel 2D ou transição) num canvas
  if (S.p2d) { draw2D(cv, S.p2d, t - 3); return { label: '', info: null, mb: 0, L: {} }; }
  if (S.trans) return { label: renderTrans(cv, S, t), info: null, mb: 0, L: {} };
  return renderAny(cv, S, t);
}

// ─── Transições: renderiza A e B e compõe
const bufA = document.createElement('canvas'), bufB = document.createElement('canvas');
// k: 0 = só A, 1 = só B
function composite(c, kind, A, B, k, W, H) {
  c.setTransform(1, 0, 0, 1, 0, 0); c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  if (kind === 'dissolve' || kind === 'morph') {
    if (kind === 'morph') { const m = Math.sin(k * Math.PI); c.filter = `blur(${m * 8 * W / 960}px)`; c.save(); c.translate(W / 2, H / 2); c.scale(1 + m * .08, 1 - m * .04); c.translate(-W / 2, -H / 2); c.drawImage(A, 0, 0, W, H); c.globalAlpha = k; c.drawImage(B, 0, 0, W, H); c.restore(); c.filter = 'none'; c.globalAlpha = 1; }
    else { c.drawImage(A, 0, 0, W, H); c.globalAlpha = k; c.drawImage(B, 0, 0, W, H); c.globalAlpha = 1; }
  } else if (kind === 'fade') {
    c.drawImage(k < .5 ? A : B, 0, 0, W, H); c.fillStyle = `rgba(0,0,0,${1 - Math.abs(k - .5) * 2})`; c.fillRect(0, 0, W, H);
  } else if (kind === 'wipe') {
    c.drawImage(A, 0, 0, W, H); c.save(); c.beginPath(); c.rect(0, 0, W * k, H); c.clip(); c.drawImage(B, 0, 0, W, H); c.restore();
    if (k > 0 && k < 1) { c.fillStyle = '#fff'; c.fillRect(W * k - 2, 0, 4, H); }
  } else if (kind === 'iris') {
    const img = k < .5 ? A : B, rad = Math.abs(k - .5) * 2 * Math.hypot(W, H) * .55;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.save(); c.beginPath(); c.arc(W * .5, H * .45, rad, 0, TAU); c.clip(); c.drawImage(img, 0, 0, W, H); c.restore();
  } else if (kind === 'whip') {
    const off = k * W; c.filter = (k > .02 && k < .98) ? `blur(${18 * W / 960}px)` : 'none';
    c.drawImage(A, -off, 0, W, H); c.drawImage(B, W - off, 0, W, H); c.filter = 'none';
  } else c.drawImage(k > .5 ? B : A, 0, 0, W, H);
}
const TRANS_A = { shot: 'ms', light: 'day' }, TRANS_B = { shot: 'ws', light: 'golden' };
function renderTrans(cv, S, t) {
  const W = cv.width, H = cv.height, c = cv.getContext('2d');
  for (const b of [bufA, bufB]) if (b.width !== W || b.height !== H) { b.width = W; b.height = H; }
  const kind = S.trans, u = fract(t / 5);
  let lab = '';
  const p = (a, b) => sstep(.36, .36 + a, u) - sstep(.86, .86 + b, u);
  c.setTransform(1, 0, 0, 1, 0, 0); c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  if (kind === 'long') {
    const k = fract(t / 12);
    renderAny(cv, { shot: 'ms', light: 'golden', rigFn: r => { const e = ease(pp(k)); r.d *= lerp(9, .45, e); r.el += lerp(35, 0, e); r.az += lerp(-50, 25, e); r.mb = 0; } }, t);
    return 'SEM CORTES';
  }
  if (kind === 'montage') {
    const shots = [{ shot: 'cu', light: 'golden' }, { shot: 'xws', light: 'golden' }, { shot: 'ins', light: 'day' }, { shot: 'fs', angle: 'low', light: 'golden' }, { shot: 'fs', angle: 'overhead' }, { shot: 'ms', light: 'blue' }, { shot: 'ws', move: 'pan', light: 'day' }];
    const i = Math.floor(t / .55) % shots.length; renderAny(cv, shots[i], t); return 'PLANO ' + (i + 1) + '/' + shots.length;
  }
  if (kind === 'jump') {
    const seg = Math.floor(t / .7); renderAny(cv, { shot: 'fs', light: 'day', jumpX: (hash(seg) - .5) * 1.6 }, seg * .7 + 3); return 'CORTE ' + (seg % 9 + 1);
  }
  let A = TRANS_A, B = TRANS_B;
  if (kind === 'match') { A = { shot: 'ws', light: 'golden', rigFn: r => { r.yawOff = -38; r.pitchOff = 6; } }; B = { shot: 'ws', light: 'night', rigFn: r => { r.yawOff = 25; r.pitchOff = 28; } }; }
  if (kind === 'smash') { A = { shot: 'cu', light: 'neon', move: 'handheld', fx: ['ca'], rigFn: r => { r.shake = 4; } }; B = { shot: 'ws', light: 'night' }; }
  renderAny(bufA, A, t); renderAny(bufB, B, t);
  const instant = kind === 'cut' || kind === 'match' || kind === 'smash';
  const k = instant ? (p(.001, .001) > .5 ? 1 : 0) : kind === 'whip' ? p(.12, .12) : kind === 'iris' || kind === 'fade' ? p(.3, .3) : p(.22, .22);
  composite(c, instant ? 'cut' : kind, bufA, bufB, k, W, H);
  lab = (k > .5 ? 'PLANO B' : 'PLANO A');
  if (kind === 'smash') lab = k > .5 ? 'SILÊNCIO' : 'CAOS';
  return lab;
}

// ─── Classe pública: um canvas, um loop. Modos: spec única (termo) ou filme (sequência de planos)
const TR_DUR = { dissolve: .9, morph: .9, fade: 1.1, wipe: .7, iris: 1.1, whip: .45 };
const fA = document.createElement('canvas'), fB = document.createElement('canvas');
function rrect(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }
class Viewer {
  constructor(canvas, hud) {
    this.cv = canvas; this.hud = hud || {}; this.spec = null; this.time = 0; this.last = 0; this.running = false; this.paused = false;
    this.guides = { thirds: false, safe: false }; this.buf = document.createElement('canvas'); this.trail = false;
    this.layers = null; this.lessonCat = null; this.shotIdx = -1; this.onShot = null;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._loop = this._loop.bind(this);
    new ResizeObserver(() => this.resize()).observe(canvas); this.resize();
  }
  resize() {
    const r = this.cv.getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(clamp(r.width * dpr * (this.q || 1), 320, 960)), h = Math.round(w * 9 / 16);
    if (w !== this.cv.width) { this.cv.width = w; this.cv.height = h; this.buf.width = w; this.buf.height = h; this.trail = false; if (this.paused || !this.running) this.draw(); }
  }
  set(spec) { this.spec = spec; this.time = 0; this.trail = false; this.shotIdx = -1; this.draw(); }
  seek(time) { this.time = Math.max(0, time); this.trail = false; this.draw(); }
  start() { if (this.running) return; this.running = true; this.last = performance.now(); requestAnimationFrame(this._loop); }
  stop() { this.running = false; }
  toggle() { this.paused = !this.paused; return this.paused; }
  _loop(now) {
    if (!this.running) return;
    const raw = (now - this.last) / 1000, dt = Math.min(.1, raw); this.last = now;
    // resolução adaptativa: se o quadro passa de ~33 ms de forma sustentada, reduz a área renderizada
    this.slow = (this.slow || 0) * .9 + (raw > .034 ? 1 : 0) * .1;
    if (this.slow > .6 && (this.q || 1) > .55) { this.q = (this.q || 1) * .8; this.slow = 0; this.resize(); }
    if (!this.paused) { this.time += this.reduced ? dt * .5 : dt; this.draw(); }
    requestAnimationFrame(this._loop);
  }
  draw() {
    const S = this.spec; if (!S || !this.cv.width) return;
    const c = this.cv.getContext('2d'), W = this.cv.width, H = this.cv.height;
    QUIET = !!this.quiet;
    let o = { lab: '', info: null, badge: '' };
    try { o = S.film ? this.drawFilm(c, W, H, S.film) : this.drawSpec(c, W, H, S, this.time + 3); } catch (e) { console.error(e); }
    const spec = o.shot ? o.shot.spec : S;
    this.overlay(c, W, H, spec, o.lab, o.badge);
    if (this.layers && window.describeShot && !spec.p2d) this.drawFicha(c, W, H, spec, o.info, S.film ? S.film.cat : this.lessonCat, o.shot);
    if (S.film) this.drawFilmOverlay(c, W, H, S.film, o);
    if (this.hud.update) this.hud.update({ t: this.time, info: o.info, spec });
  }
  drawSpec(c, W, H, S, t) {
    if (S.p2d) { draw2D(this.cv, S.p2d, t - 3); return { lab: '', info: null, badge: '' }; }
    if (S.trans) return { lab: renderTrans(this.cv, S, t), info: null, badge: '' };
    const r = renderAny(this.buf, S, t), tm = TM[S.time || 'normal'] || TM.normal;
    c.setTransform(1, 0, 0, 1, 0, 0); c.filter = 'none'; c.globalCompositeOperation = 'source-over';
    const mb = r.mb || 0;
    c.globalAlpha = (this.trail && mb) ? 1 - mb : 1; c.drawImage(this.buf, 0, 0, W, H); c.globalAlpha = 1; this.trail = true;
    if (S.time === 'freeze') { const k = t % 5; if (k > 2 && k < 2.12) { c.fillStyle = `rgba(255,255,255,${1 - (k - 2) / .12})`; c.fillRect(0, 0, W, H); } }
    return { lab: r.label || (r.L && r.L.label) || '', info: r.info, badge: tm.badge ? tm.badge(t) : '' };
  }
  shotAt(F, time) {
    const n = F.shots.length, ft = ((time % F.total) + F.total) % F.total;
    let i = 0, acc = 0; while (i < n - 1 && ft >= acc + F.shots[i].dur) { acc += F.shots[i].dur; i++; }
    return { i, acc, ft, lt: ft - acc };
  }
  drawFilm(c, W, H, F) {
    const { i, ft, lt } = this.shotAt(F, this.time), sh = F.shots[i], nx = F.shots[(i + 1) % F.shots.length], trD = TR_DUR[sh.tr] || 0;
    if (i !== this.shotIdx) { this.shotIdx = i; this.trail = false; if (this.onShot) this.onShot(i, sh); }
    if (trD && lt > sh.dur - trD) {
      for (const b of [fA, fB]) if (b.width !== W || b.height !== H) { b.width = W; b.height = H; }
      const k = clamp((lt - (sh.dur - trD)) / trD, 0, 1), ra = renderShot(fA, sh.spec, lt + 3);
      renderShot(fB, nx.spec, lt - (sh.dur - trD) + 3);
      composite(c, sh.tr, fA, fB, k, W, H); this.trail = false;
      return { lab: '', info: ra.info, badge: '', shot: sh, i, ft, lt };
    }
    return Object.assign(this.drawSpec(c, W, H, sh.spec, lt + 3), { shot: sh, i, ft, lt });
  }
  drawFicha(c, W, H, spec, info, cat, shot) {
    const L = this.layers; if (!L.ficha) return;
    const rows = window.describeShot(spec, info, { cat, next: shot ? shot.tr || 'cut' : null }).filter(r => L[r.k] || r.lesson);
    if (!rows.length) return;
    const ks = Math.max(W / 960, .62), pad = 9 * ks, lh = 18 * ks, fl = Math.round(9.5 * ks), fv = Math.round(12 * ks);
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.font = `600 ${fl}px "IBM Plex Mono", monospace`; const lw = Math.max(...rows.map(r => c.measureText(r.label.toUpperCase()).width)) + 10 * ks;
    c.font = `500 ${fv}px "Atkinson Hyperlegible", system-ui, sans-serif`;
    const maxV = W * .38, vw = Math.min(maxV, Math.max(...rows.map(r => c.measureText(r.value).width)));
    const w = lw + vw + pad * 2, h = rows.length * lh + pad * 1.4, x = W - w - 12 * ks, y = 12 * ks;
    c.fillStyle = 'rgba(8,10,14,.68)'; rrect(c, x, y, w, h, 6 * ks); c.fill();
    c.textBaseline = 'middle';
    rows.forEach((r, k) => {
      const yy = y + pad * .7 + lh * (k + .5);
      if (r.lesson) { c.fillStyle = 'rgba(255,116,104,.16)'; c.fillRect(x + 3 * ks, yy - lh / 2 + 1, w - 6 * ks, lh - 2); }
      c.font = `600 ${fl}px "IBM Plex Mono", monospace`; c.fillStyle = r.lesson ? '#FF8A7E' : '#8FA3BA'; c.textAlign = 'left'; c.fillText(r.label.toUpperCase(), x + pad, yy);
      c.font = `${r.lesson ? 700 : 500} ${fv}px "Atkinson Hyperlegible", system-ui, sans-serif`; c.fillStyle = '#F2F5F8';
      let v = r.value; while (c.measureText(v).width > vw && v.length > 4) v = v.slice(0, -2) + '…';
      c.fillText(v, x + pad + lw, yy);
    });
    c.restore();
  }
  drawFilmOverlay(c, W, H, F, o) {
    const L = this.layers || {}, ks = Math.max(W / 960, .62), sh = o.shot; if (!sh) return;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.textBaseline = 'middle';
    if (L.term) {
      const x = 14 * ks, y = 52 * ks, t1 = `${String(o.i + 1).padStart(2, '0')}/${String(F.shots.length).padStart(2, '0')} · ${F.title.toUpperCase()}`, t2 = sh.term ? sh.term.en : '', t3 = sh.term ? sh.term.pt : '';
      c.font = `600 ${Math.round(10 * ks)}px "IBM Plex Mono", monospace`; const w1 = c.measureText(t1).width;
      c.font = `800 ${Math.round(26 * ks)}px "Big Shoulders Display", "Arial Narrow", sans-serif`; const w2 = c.measureText(t2.toUpperCase()).width;
      const w = Math.max(w1, w2) + 20 * ks; c.fillStyle = 'rgba(8,10,14,.68)'; rrect(c, x, y, w, 64 * ks, 6 * ks); c.fill();
      c.fillStyle = '#FF8A7E'; c.font = `600 ${Math.round(10 * ks)}px "IBM Plex Mono", monospace`; c.textAlign = 'left'; c.fillText(t1, x + 10 * ks, y + 13 * ks);
      c.fillStyle = '#FFFFFF'; c.font = `800 ${Math.round(26 * ks)}px "Big Shoulders Display", "Arial Narrow", sans-serif`; c.fillText(t2.toUpperCase(), x + 10 * ks, y + 34 * ks);
      c.fillStyle = '#B9C6D6'; c.font = `500 ${Math.round(11.5 * ks)}px "Atkinson Hyperlegible", system-ui, sans-serif`; c.fillText(t3, x + 10 * ks, y + 53 * ks);
    }
    if (L.caption && sh.cap) {
      c.font = `600 ${Math.round(17 * ks)}px "Atkinson Hyperlegible", system-ui, sans-serif`; c.textAlign = 'center';
      const tw = c.measureText(sh.cap).width, y = H - (L.timeline ? 34 : 24) * ks;
      c.fillStyle = 'rgba(8,10,14,.72)'; rrect(c, W / 2 - tw / 2 - 12 * ks, y - 15 * ks, tw + 24 * ks, 30 * ks, 5 * ks); c.fill();
      c.fillStyle = '#FFFFFF'; c.fillText(sh.cap, W / 2, y + 1);
    }
    if (L.timeline) {
      const y = H - 7 * ks, gap = 2 * ks; let x = 0;
      F.shots.forEach((s, k) => {
        const w = s.dur / F.total * W;
        c.fillStyle = k === o.i ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.18)'; c.fillRect(x + gap / 2, y, w - gap, 4 * ks);
        if (k === o.i) { c.fillStyle = '#FF5A4D'; c.fillRect(x + gap / 2, y, (w - gap) * clamp(o.lt / s.dur, 0, 1), 4 * ks); }
        x += w;
      });
    }
    c.restore();
  }
  overlay(c, W, H, S, lab, badge) {
    c.setTransform(1, 0, 0, 1, 0, 0); c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    const comp = S.comp || {}, k = W / 960, film = this.spec && this.spec.film;
    if (comp.aspect === '9:16') { const w = H * 9 / 16; c.fillStyle = 'rgba(8,10,14,.82)'; c.fillRect(0, 0, (W - w) / 2, H); c.fillRect((W + w) / 2, 0, (W - w) / 2, H); c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1; c.strokeRect((W - w) / 2, 0, w, H); }
    if (this.guides.thirds || comp.thirds || (this.layers && this.layers.guides)) {
      c.strokeStyle = comp.thirds ? 'rgba(255,90,80,.85)' : 'rgba(255,255,255,.55)'; c.lineWidth = 1.2 * k; c.beginPath();
      for (const f of [1 / 3, 2 / 3]) { c.moveTo(W * f, 0); c.lineTo(W * f, H); c.moveTo(0, H * f); c.lineTo(W, H * f); } c.stroke();
    }
    if (this.guides.safe) { c.strokeStyle = 'rgba(255,255,255,.45)'; c.setLineDash([6 * k, 6 * k]); c.lineWidth = 1 * k; c.strokeRect(W * .05, H * .05, W * .9, H * .9); c.strokeRect(W * .1, H * .1, W * .8, H * .8); c.setLineDash([]); }
    if (comp.layers) {
      const tags = [['FUNDO', .14], ['PLANO MÉDIO', .52], ['PRIMEIRO PLANO', .9]];
      c.font = `600 ${Math.round(13 * k)}px "IBM Plex Mono", monospace`; c.textAlign = 'left'; c.textBaseline = 'middle';
      for (const [n, y] of tags) { const tw = c.measureText(n).width; c.fillStyle = 'rgba(10,14,20,.72)'; c.fillRect(12 * k, H * y - 12 * k, tw + 16 * k, 24 * k); c.fillStyle = '#fff'; c.fillText(n, 20 * k, H * y); }
    }
    const txt = this.quiet ? '' : [lab, badge].filter(Boolean).join('  ·  ');
    if (txt) {
      c.font = `600 ${Math.round(14 * k)}px "IBM Plex Mono", monospace`; c.textAlign = 'right'; c.textBaseline = 'middle';
      const yb = H - (film ? 64 : 40) * k;
      const tw = c.measureText(txt).width; c.fillStyle = 'rgba(10,14,20,.72)'; c.fillRect(W - tw - 34 * k, yb, tw + 22 * k, 26 * k); c.fillStyle = '#fff'; c.fillText(txt, W - 23 * k, yb + 13 * k);
    }
  }
}

window.Anim = { Viewer, SH, MV, TM, TR_DUR };
})();
