// Animação em código: termos que o Claude escreve diretamente (CSS, SVG, Web Animations API, Canvas).
// Cada demo é HTML/CSS/JS real rodando no palco; o código exibido na ficha é o mesmo que roda.
// DEMOS[key] = { html, css?, js?(root) → cleanup?, code? (texto exibido quando difere do css/js) }
(function () {
'use strict';
const spans = (txt, cls) => [...txt].map((c, i) => `<span class="${cls || ''}" style="--i:${i}">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
const words = txt => txt.split(' ').map((w, i) => `<span style="--i:${i}">${w}</span>`).join(' ');
const every = (ms, fn) => { fn(); const id = setInterval(fn, ms); return () => clearInterval(id); };
const togg = (el, cls, ms) => every(ms, () => el.classList.toggle(cls));
const C = { ink: '#283142', red: '#D7352C', blue: '#3B79C9', teal: '#2F6F8F', yel: '#F2B134', paper: '#F3F5F7' };

// ─── Easing: solver de cubic-bezier idêntico ao do CSS (Newton-Raphson sobre x(t))
function bez(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t, sy = t => ((ay * t + by) * t + cy) * t, dx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => { let t = x; for (let i = 0; i < 10; i++) { const e = sx(t) - x, d = dx(t); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; t -= e / d; } return sy(Math.min(1, Math.max(0, t))); };
}
function outBounce(x) { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + .75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + .9375; return n * (x -= 2.625 / d) * x + .984375; }
const linearCss = f => 'linear(' + Array.from({ length: 31 }, (_, i) => +f(i / 30).toFixed(3)).join(', ') + ')';
const EASE = {
  linear: { f: x => x, css: 'linear' },
  in: { f: bez(.42, 0, 1, 1), css: 'ease-in' },
  out: { f: bez(0, 0, .58, 1), css: 'ease-out' },
  inout: { f: bez(.42, 0, .58, 1), css: 'ease-in-out' },
  expo: { f: bez(.16, 1, .3, 1), css: 'cubic-bezier(.16, 1, .3, 1)' },
  back: { f: bez(.34, 1.56, .64, 1), css: 'cubic-bezier(.34, 1.56, .64, 1)' },
  elastic: { f: x => x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - .75) * (2 * Math.PI / 3)) + 1 },
  bounce: { f: outBounce },
  steps: { f: x => x >= 1 ? 1 : Math.floor(x * 6) / 6, css: 'steps(6, end)' },
  spring: { f: x => 1 - Math.exp(-6.5 * x) * Math.cos(13 * x) }
};
EASE.elastic.css = linearCss(EASE.elastic.f); EASE.bounce.css = linearCss(EASE.bounce.f); EASE.spring.css = linearCss(EASE.spring.f);
function easeDemo(key) {
  const e = EASE[key], pts = Array.from({ length: 101 }, (_, i) => `${i * 2},${(120 - e.f(i / 100) * 100).toFixed(1)}`).join(' ');
  return {
    html: `<div class="ease-demo"><svg class="ease-graph" viewBox="-14 -24 228 190" aria-hidden="true">
      <line x1="0" y1="120" x2="200" y2="120" class="ax"/><line x1="0" y1="20" x2="200" y2="20" class="ax dash"/><line x1="0" y1="-20" x2="0" y2="160" class="ax"/>
      <text x="204" y="124">0</text><text x="204" y="24">1</text><text x="0" y="176">tempo →</text>
      <polyline points="${pts}" class="curve"/><circle r="5" class="pt" cx="0" cy="120"/></svg>
      <div class="ease-track"><i class="ease-ball"></i></div></div>`,
    code: `/* ${key === 'linear' ? 'velocidade constante' : 'mesma duração, outra curva'} */\n.ball {\n  transition: transform 1.4s ${e.css};\n}\n.ball.go { transform: translateX(100%); }`,
    js(root) {
      const pt = root.querySelector('.pt'), ball = root.querySelector('.ease-ball'), track = root.querySelector('.ease-track');
      let t0 = performance.now(), id;
      const frame = now => {
        const T = (now - t0) / 1000 % 2.6, x = Math.min(1, Math.max(0, (T - .4) / 1.4)), v = e.f(x);
        pt.setAttribute('cx', x * 200); pt.setAttribute('cy', 120 - v * 100);
        ball.style.transform = `translateX(${v * (track.clientWidth - ball.clientWidth)}px)`;
        id = requestAnimationFrame(frame);
      };
      id = requestAnimationFrame(frame); return () => cancelAnimationFrame(id);
    }
  };
}

// ─── Geometria para morph (mesmo número de pontos em todas as formas)
const N = 40;
const shape = fn => Array.from({ length: N }, (_, i) => { const a = i / N * Math.PI * 2 - Math.PI / 2, r = fn(a, i); return `${(80 + Math.cos(a) * r).toFixed(1)},${(45 + Math.sin(a) * r).toFixed(1)}`; }).join(' ');
const SHP = [shape(() => 30), shape((a, i) => i % 8 < 4 ? 34 : 15).replace(/,/g, ','), shape(a => 30 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))) * .85)];

const DEMOS = {
// ───────── easing
...Object.fromEntries(Object.keys(EASE).map(k => ['ease-' + k, easeDemo(k)])),

// ───────── objetos / motion graphics
fade: { html: `<div class="box fade-in"></div>`, css:
`.fade-in {
  animation: fade-in 2.6s ease-out infinite;
}
@keyframes fade-in {
  0%      { opacity: 0; }
  35%, 85% { opacity: 1; }
  100%    { opacity: 0; }
}` },
pop: { html: `<div class="box pop-in"></div>`, css:
`.pop-in {
  animation: pop-in 2.4s infinite;
}
@keyframes pop-in {
  0%   { transform: scale(0); animation-timing-function: cubic-bezier(.34,1.56,.64,1); }
  30%, 85% { transform: scale(1); }
  100% { transform: scale(0); }
}` },
slide: { html: `<div class="box slide-in"></div>`, css:
`.slide-in {
  animation: slide-in 2.6s cubic-bezier(.16,1,.3,1) infinite;
}
@keyframes slide-in {
  0%       { transform: translateX(-40cqw); opacity: 0; }
  35%, 85% { transform: none; opacity: 1; }
  100%     { transform: translateX(40cqw); opacity: 0; }
}` },
spin: { html: `<div class="box spin"></div>`, css:
`.spin {
  animation: spin 2s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }` },
bouncebox: { html: `<div class="bounce-wrap"><i class="dot bounce"></i><b class="floor"></b></div>`, css:
`.bounce {
  animation: bounce .8s infinite alternate;
  animation-timing-function: cubic-bezier(.5,0,1,.5); /* acelera ao cair */
  transform-origin: 50% 100%;
}
@keyframes bounce {
  0%   { transform: translateY(-22cqw) scale(.92, 1.08); }
  90%  { transform: translateY(0) scale(1, 1); }
  100% { transform: translateY(0) scale(1.25, .75); } /* squash no impacto */
}` },
pulse: { html: `<div class="dot pulse"></div>`, css:
`.pulse {
  animation: pulse 1.6s ease-in-out infinite;
}
@keyframes pulse {
  0%   { transform: scale(1);    box-shadow: 0 0 0 0 rgb(215 53 44 / .55); }
  50%  { transform: scale(1.08); }
  100% { transform: scale(1);    box-shadow: 0 0 0 4cqw rgb(215 53 44 / 0); }
}` },
shake: { html: `<div class="box shake"></div>`, css:
`.shake {
  animation: shake 2s infinite;
}
@keyframes shake {
  0%, 40%, 100% { transform: none; }
  44% { transform: translateX(-2cqw) rotate(-3deg); }
  52% { transform: translateX(2cqw)  rotate(3deg); }
  60% { transform: translateX(-1.5cqw) rotate(-2deg); }
  68% { transform: translateX(1cqw); }
}` },
float: { html: `<div class="float-wrap"><div class="box float"></div><i class="float-shadow"></i></div>`, css:
`.float {
  animation: float 3s ease-in-out infinite alternate;
}
.float-shadow {
  animation: float-shadow 3s ease-in-out infinite alternate;
}
@keyframes float        { to { transform: translateY(-4cqw); } }
@keyframes float-shadow { to { transform: scale(.7); opacity: .4; } }` },
stagger: { html: `<div class="stagger">${Array.from({ length: 24 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>`, css:
`.stagger i {
  animation: rise 2.8s cubic-bezier(.16,1,.3,1) infinite;
  animation-delay: calc(var(--i) * 45ms); /* atraso cresce por item */
}
@keyframes rise {
  0%       { transform: translateY(3cqw) scale(.6); opacity: 0; }
  30%, 75% { transform: none; opacity: 1; }
  100%     { opacity: 0; }
}` },
path: { html: `<svg viewBox="0 0 160 90" class="svgfull"><path id="mp" d="M15,70 C40,-10 70,100 95,40 S140,10 148,60" class="trail"/>
  <g><polygon points="-5,-4 6,0 -5,4" class="arrow"/><animateMotion dur="3s" repeatCount="indefinite" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".45 0 .55 1"><mpath href="#mp"/></animateMotion></g></svg>`,
  code: `<!-- SVG: o objeto segue o path e gira na tangente -->
<path id="mp" d="M15,70 C40,-10 70,100 95,40 S140,10 148,60"/>
<g>
  <polygon points="-5,-4 6,0 -5,4"/>
  <animateMotion dur="3s" repeatCount="indefinite" rotate="auto">
    <mpath href="#mp"/>
  </animateMotion>
</g>
/* Em CSS: offset-path: path('…'); animation: … offset-distance 0% → 100% */` },
morph: { html: `<svg viewBox="0 0 160 90" class="svgfull"><polygon class="morph" points="${SHP[0]}"><animate attributeName="points" dur="4.5s" repeatCount="indefinite" values="${SHP[0]};${SHP[1]};${SHP[2]};${SHP[0]}" calcMode="spline" keyTimes="0;.33;.66;1" keySplines=".65 0 .35 1;.65 0 .35 1;.65 0 .35 1"/></polygon></svg>`,
  code: `<!-- Morph: as formas precisam ter o MESMO número de pontos -->
<polygon points="círculo (40 pontos)">
  <animate attributeName="points" dur="4.5s" repeatCount="indefinite"
    values="círculo; estrela; quadrado; círculo"
    calcMode="spline" keySplines=".65 0 .35 1; …"/>
</polygon>
/* Paths complexos: bibliotecas como flubber ou GSAP MorphSVG interpolam pontos diferentes */` },
draw: { html: `<svg viewBox="0 0 160 90" class="svgfull"><path class="draw" pathLength="1" d="M20,65 C30,20 55,20 60,45 S85,80 95,45 S120,10 140,30"/><circle class="draw" pathLength="1" cx="140" cy="62" r="12"/></svg>`, css:
`.draw {
  stroke-dasharray: 1;      /* com pathLength="1" no SVG */
  stroke-dashoffset: 1;
  animation: draw 3s cubic-bezier(.65,0,.35,1) infinite;
}
@keyframes draw {
  60%, 85% { stroke-dashoffset: 0; }
  100%     { stroke-dashoffset: -1; }
}` },
wipe: { html: `<div class="wipe-card"><b>Revelação</b><small>clip-path: inset()</small></div>`, css:
`.wipe-card {
  animation: wipe 2.8s cubic-bezier(.77,0,.18,1) infinite;
}
@keyframes wipe {
  0%       { clip-path: inset(0 100% 0 0); }
  35%, 80% { clip-path: inset(0 0 0 0); }
  100%     { clip-path: inset(0 0 0 100%); }
}` },
parallax: { html: `<div class="px"><i class="px-l px1"></i><i class="px-l px2"></i><i class="px-l px3"></i><span class="lbl">fundo lento · frente rápida</span></div>`, css:
`.px-l { animation: px 5s ease-in-out infinite alternate; }
.px1 { --amp: -3cqw;  }   /* fundo */
.px2 { --amp: -9cqw;  }
.px3 { --amp: -20cqw; }   /* primeiro plano */
@keyframes px {
  from { transform: translateX(calc(var(--amp) * -1)); }
  to   { transform: translateX(var(--amp)); }
}` },
orbit: { html: `<div class="orbit"><i class="dot sun"></i><div class="orbit-arm"><i class="dot planet"></i></div></div>`, css:
`.orbit-arm {
  animation: spin 4s linear infinite;   /* gira o braço */
}
.planet {
  animation: spin 4s linear infinite reverse; /* contra-gira: fica de pé */
}
@keyframes spin { to { transform: rotate(360deg); } }` },
confetti: { html: `<div class="burst"><button class="btn-demo">Enviar</button></div>`, css:
`.confetti { position: absolute; width: 1cqw; height: 1.6cqw; border-radius: 2px; }`,
  js(root) {
    const colors = ['#D7352C', '#3B79C9', '#F2B134', '#2F6F8F'];
    return every(2200, () => {
      const w = root.clientWidth;
      for (let i = 0; i < 40; i++) {
        const p = document.createElement('i'); p.className = 'confetti'; p.style.background = colors[i % 4]; root.appendChild(p);
        const a = Math.random() * Math.PI * 2, r = w * (.12 + Math.random() * .22);
        p.animate([
          { transform: 'translate(-50%,-50%) rotate(0)', opacity: 1 },
          { transform: `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r + w * .08}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }
        ], { duration: 1300 + Math.random() * 600, easing: 'cubic-bezier(.1,.8,.3,1)' }).onfinish = () => p.remove();
      }
    });
  } },
blob: { html: `<div class="blob"></div>`, css:
`.blob {
  background: linear-gradient(135deg, #3B79C9, #D7352C);
  animation: blob 6s ease-in-out infinite;
}
@keyframes blob {
  0%, 100% { border-radius: 42% 58% 70% 30% / 45% 45% 55% 55%; transform: rotate(0); }
  33%      { border-radius: 70% 30% 46% 54% / 30% 29% 71% 70%; }
  66%      { border-radius: 30% 70% 30% 70% / 60% 40% 60% 40%; transform: rotate(120deg); }
}` },
flip: { html: `<div class="flip-scene"><div class="flip-card"><div class="face front">FRENTE</div><div class="face back">VERSO</div></div></div>`, css:
`.flip-scene { perspective: 80cqw; }
.flip-card {
  transform-style: preserve-3d;
  animation: flip 3.2s cubic-bezier(.65,0,.35,1) infinite;
}
.face { backface-visibility: hidden; }
.back { transform: rotateY(180deg); }
@keyframes flip {
  0%, 30%  { transform: rotateY(0); }
  50%, 80% { transform: rotateY(180deg); }
  100%     { transform: rotateY(360deg); }
}` },
trail: { html: `<div class="trail-wrap">${[0, 1, 2, 3, 4].map(i => `<i class="dot echo" style="--i:${i}"></i>`).join('')}</div>`, css:
`.echo {
  animation: echo 2.4s cubic-bezier(.65,0,.35,1) infinite alternate;
  animation-delay: calc(var(--i) * 60ms);
  opacity: calc(1 - var(--i) * .18);
  scale: calc(1 - var(--i) * .12);
}
@keyframes echo {
  from { translate: -30cqw 0; }
  to   { translate: 30cqw 0; }
}` },
gradient: { html: `<div class="grad-bg"><b>Gradiente animado</b></div>`, css:
`.grad-bg {
  background: linear-gradient(120deg, #3B79C9, #2F6F8F, #F2B134, #D7352C, #3B79C9);
  background-size: 300% 300%;
  animation: grad 8s ease-in-out infinite;
}
@keyframes grad {
  0%, 100% { background-position: 0% 50%; }
  50%      { background-position: 100% 50%; }
}` },
wave: { html: `<div class="wave-grid">${Array.from({ length: 15 * 7 }, (_, i) => { const x = i % 15 - 7, y = Math.floor(i / 15) - 3; return `<i style="--d:${Math.hypot(x, y).toFixed(2)}"></i>`; }).join('')}</div>`, css:
`.wave-grid i {
  animation: wave 1.8s ease-in-out infinite;
  animation-delay: calc(var(--d) * 90ms);  /* --d = distância ao centro */
}
@keyframes wave {
  0%, 100% { transform: scale(.35); background: #3B79C9; }
  50%      { transform: scale(1);   background: #D7352C; }
}` },
chart: { html: `<div class="bars">${[42, 68, 55, 90, 74, 98].map((h, i) => `<i style="--h:${h}%;--i:${i}"><b>${h}</b></i>`).join('')}</div>`, css:
`.bars i {
  height: var(--h);
  transform-origin: bottom;
  animation: grow 3.4s cubic-bezier(.16,1,.3,1) infinite;
  animation-delay: calc(var(--i) * 90ms);
}
@keyframes grow {
  0%       { transform: scaleY(0); }
  30%, 85% { transform: scaleY(1); }
  100%     { transform: scaleY(0); }
}` },
tilt: { html: `<div class="tilt-scene"><div class="tilt-card"><b>Card 3D</b><small>perspective + rotateX/Y</small></div></div>`, css:
`.tilt-scene { perspective: 60cqw; }
.tilt-card {
  animation: tilt 5s ease-in-out infinite;
}
@keyframes tilt {
  0%, 100% { transform: rotateX(12deg)  rotateY(-18deg); }
  25%      { transform: rotateX(-10deg) rotateY(-14deg); }
  50%      { transform: rotateX(-12deg) rotateY(18deg);  }
  75%      { transform: rotateX(10deg)  rotateY(14deg);  }
}
/* Interativo: no mousemove, mapeie a posição do cursor para rotateX/rotateY */` },

// ───────── texto
typewriter: { html: `<p class="type">Escreva, Claude anima.</p>`, css:
`.type {
  font-family: monospace;
  width: 22ch;                 /* 22 caracteres */
  white-space: nowrap;
  overflow: hidden;
  border-right: .12em solid;
  animation: typing 4s steps(22) infinite, caret .7s step-end infinite;
}
@keyframes typing {
  0%       { width: 0; }
  55%, 85% { width: 22ch; }
  100%     { width: 0; }
}
@keyframes caret { 50% { border-color: transparent; } }` },
letters: { html: `<p class="big split">${spans('Letra por letra')}</p>`, css:
`/* cada letra em <span style="--i:n"> */
.split span {
  display: inline-block;
  animation: letter 3s cubic-bezier(.16,1,.3,1) infinite;
  animation-delay: calc(var(--i) * 45ms);
}
@keyframes letter {
  0%       { transform: translateY(.7em); opacity: 0; }
  25%, 80% { transform: none; opacity: 1; }
  100%     { opacity: 0; }
}` },
wordsrev: { html: `<p class="mid words">${words('Cada palavra entra no seu próprio tempo')}</p>`, css:
`.words span {
  display: inline-block;
  animation: word 3.6s ease-out infinite;
  animation-delay: calc(var(--i) * 140ms);
}
@keyframes word {
  0%       { opacity: 0; filter: blur(6px); transform: translateY(.3em); }
  25%, 85% { opacity: 1; filter: none; transform: none; }
  100%     { opacity: 0; }
}` },
maskrev: { html: `<div class="mask-lines"><span><b>Linhas sobem</b></span><span><b>de trás de</b></span><span><b>uma máscara</b></span></div>`, css:
`.mask-lines span { display: block; overflow: hidden; }  /* a máscara */
.mask-lines b {
  display: block;
  animation: line-up 3.4s cubic-bezier(.16,1,.3,1) infinite;
}
.mask-lines span:nth-child(2) b { animation-delay: .08s; }
.mask-lines span:nth-child(3) b { animation-delay: .16s; }
@keyframes line-up {
  0%       { transform: translateY(110%); }
  25%, 80% { transform: none; }
  100%     { transform: translateY(-110%); }
}` },
scramble: { html: `<p class="mid mono scramble">ANIMAÇÃO EM CÓDIGO</p>`,
  js(root) {
    const el = root.querySelector('.scramble'), target = 'ANIMAÇÃO EM CÓDIGO', glyphs = '!<>-_\\/[]{}=+*^?#01ABCDEFXYZ';
    let start = performance.now(), id;
    const frame = now => {
      const t = (now - start) % 3200, p = t / 1400; // 1,4 s decodificando, depois segura
      el.textContent = [...target].map((c, i) => c === ' ' || i / target.length < p - .15 ? c : glyphs[Math.random() * glyphs.length | 0]).join('');
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame); return () => cancelAnimationFrame(id);
  } },
wavetext: { html: `<p class="big wave-text">${spans('ondulando~')}</p>`, css:
`.wave-text span {
  display: inline-block;
  animation: wave-y 1.4s ease-in-out infinite;
  animation-delay: calc(var(--i) * 90ms);
}
@keyframes wave-y {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-.35em); color: #D7352C; }
}` },
glitch: { html: `<p class="big glitch" data-text="GLITCH">GLITCH</p>`, css:
`.glitch { position: relative; }
.glitch::before, .glitch::after {
  content: attr(data-text);
  position: absolute; inset: 0;
}
.glitch::before { color: #3B79C9; animation: g1 2.2s steps(1) infinite; }
.glitch::after  { color: #D7352C; animation: g2 2.2s steps(1) infinite; }
@keyframes g1 {
  0%, 60%, 100% { clip-path: inset(0 0 100% 0); transform: none; }
  62% { clip-path: inset(10% 0 60% 0); transform: translate(-.06em, 0); }
  70% { clip-path: inset(50% 0 20% 0); transform: translate(.05em, 0); }
  78% { clip-path: inset(30% 0 40% 0); transform: translate(-.03em, 0); }
}
@keyframes g2 {
  0%, 64%, 100% { clip-path: inset(0 0 100% 0); transform: none; }
  66% { clip-path: inset(70% 0 5% 0);  transform: translate(.06em, 0); }
  74% { clip-path: inset(20% 0 55% 0); transform: translate(-.05em, 0); }
}` },
counter: { html: `<div class="count"><b class="num">0</b><small>visualizações</small></div>`,
  js(root) {
    const el = root.querySelector('.num'), to = 12480, fmt = new Intl.NumberFormat('pt-BR');
    const easeOut = x => 1 - Math.pow(1 - x, 4);
    let start = performance.now(), id;
    const frame = now => {
      const t = ((now - start) % 3400) / 1800;          // 1,8 s contando, depois segura
      el.textContent = fmt.format(Math.round(to * easeOut(Math.min(1, t))));
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame); return () => cancelAnimationFrame(id);
  } },
blurin: { html: `<p class="big track-in">FOCO</p>`, css:
`.track-in {
  animation: track-in 3.2s cubic-bezier(.215,.61,.355,1) infinite;
}
@keyframes track-in {
  0%       { letter-spacing: 1em; filter: blur(12px); opacity: 0; }
  40%, 85% { letter-spacing: .05em; filter: blur(0); opacity: 1; }
  100%     { opacity: 0; }
}` },
flip3d: { html: `<p class="big flip-letters">${spans('VIRANDO')}</p>`, css:
`.flip-letters { perspective: 40cqw; }
.flip-letters span {
  display: inline-block;
  transform-origin: 50% 100%;
  animation: flip-x 3s cubic-bezier(.34,1.56,.64,1) infinite;
  animation-delay: calc(var(--i) * 70ms);
}
@keyframes flip-x {
  0%       { transform: rotateX(-95deg); opacity: 0; }
  25%, 80% { transform: none; opacity: 1; }
  100%     { transform: rotateX(95deg); opacity: 0; }
}` },
outline: { html: `<svg viewBox="0 0 320 90" class="svgfull"><text x="160" y="62" text-anchor="middle" class="stroke-text">TRAÇO</text></svg>`, css:
`.stroke-text {
  fill: transparent;
  stroke: #283142; stroke-width: 1.2;
  stroke-dasharray: 340;
  animation: stroke-text 4s ease-in-out infinite;
}
@keyframes stroke-text {
  0%       { stroke-dashoffset: 340; fill: transparent; }
  55%      { stroke-dashoffset: 0;   fill: transparent; }
  70%, 90% { stroke-dashoffset: 0;   fill: #283142; }
  100%     { stroke-dashoffset: 0;   fill: transparent; }
}` },
shimmer: { html: `<p class="big shine">BRILHO</p>`, css:
`.shine {
  background: linear-gradient(100deg, #283142 40%, #F2B134 50%, #283142 60%);
  background-size: 300% 100%;
  -webkit-background-clip: text; background-clip: text;
  color: transparent;
  animation: shine 2.4s linear infinite;
}
@keyframes shine { from { background-position: 100% 0; } to { background-position: 0 0; } }` },
marquee: { html: `<div class="marquee"><div class="marquee-track"><span>CSS · SVG · CANVAS · WEB ANIMATIONS API · </span><span aria-hidden="true">CSS · SVG · CANVAS · WEB ANIMATIONS API · </span></div></div>`, css:
`.marquee { overflow: hidden; white-space: nowrap; }
.marquee-track {
  display: inline-flex;
  animation: marquee 9s linear infinite;
}
/* o conteúdo é duplicado: ao chegar em -50% o loop é invisível */
@keyframes marquee { to { transform: translateX(-50%); } }` },
underline: { html: `<p class="mid">Um texto com <mark class="hl">destaque desenhado</mark> no meio.</p>`, css:
`.hl {
  background: linear-gradient(#F2B134, #F2B134) no-repeat 0 85% / 0% 40%;
  color: inherit;
  animation: hl 3s cubic-bezier(.65,0,.35,1) infinite;
}
@keyframes hl {
  0%       { background-size: 0% 40%; }
  40%, 85% { background-size: 100% 40%; }
  100%     { background-size: 0% 40%; background-position: 100% 85%; }
}` },
kinetic: { html: `<div class="kin"><b style="--i:0">MOVIMENTO</b><b style="--i:1" class="r">É</b><b style="--i:2">LINGUAGEM</b></div>`, css:
`.kin b {
  position: absolute;
  opacity: 0;
  animation: kin 3.6s cubic-bezier(.16,1,.3,1) infinite;
  animation-delay: calc(var(--i) * 1.2s);  /* uma palavra por vez */
}
@keyframes kin {
  0%  { transform: scale(2.4); opacity: 0; }
  5%  { transform: scale(1);   opacity: 1; }
  28% { transform: scale(.94); opacity: 1; }
  33%, 100% { opacity: 0; }
}` },
textpath: { html: `<svg viewBox="0 0 320 120" class="svgfull"><path id="tp" d="M10,90 C80,10 160,130 310,30" class="trail"/><text class="tp-text"><textPath href="#tp" startOffset="0%">texto seguindo uma curva →<animate attributeName="startOffset" from="-70%" to="100%" dur="6s" repeatCount="indefinite"/></textPath></text></svg>`,
  code: `<path id="tp" d="M10,90 C80,10 160,130 310,30"/>
<text>
  <textPath href="#tp" startOffset="0%">
    texto seguindo uma curva →
    <animate attributeName="startOffset" from="-70%" to="100%"
             dur="6s" repeatCount="indefinite"/>
  </textPath>
</text>` },

// ───────── interface
hover: { html: `<div class="cards2"><div class="lift-card">Card</div><div class="lift-card on">:hover</div></div>`, css:
`.lift-card {
  transition: transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s;
}
.lift-card:hover, .lift-card.on {
  transform: translateY(-1.2cqw);
  box-shadow: 0 2cqw 3cqw -1cqw rgb(0 0 0 / .25);
}`, js(root) { const c = root.querySelector('.lift-card.on'); return every(1300, () => c.classList.toggle('on')); } },
ripple: { html: `<button class="btn-demo ripple-btn">Clique</button>`, css:
`.ripple-btn { position: relative; overflow: hidden; }
.ripple {
  position: absolute; border-radius: 50%;
  background: rgb(255 255 255 / .55);
  transform: scale(0);
  animation: ripple .7s ease-out forwards;
}
@keyframes ripple { to { transform: scale(4); opacity: 0; } }`,
  js(root) {
    const b = root.querySelector('.ripple-btn');
    return every(1200, () => {
      const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height), x = Math.random() * r.width, y = Math.random() * r.height;
      const d = document.createElement('span'); d.className = 'ripple';
      Object.assign(d.style, { width: s + 'px', height: s + 'px', left: x - s / 2 + 'px', top: y - s / 2 + 'px' });
      b.appendChild(d); setTimeout(() => d.remove(), 800);
    });
  } },
skeleton: { html: `<div class="skel"><i class="sk-av"></i><div><i class="sk-l"></i><i class="sk-l w60"></i><i class="sk-l w80"></i></div></div>`, css:
`.skel i {
  background: linear-gradient(90deg, #E2E7EE 25%, #F4F6F9 50%, #E2E7EE 75%);
  background-size: 200% 100%;
  animation: skeleton 1.4s ease-in-out infinite;
}
@keyframes skeleton { from { background-position: 200% 0; } to { background-position: -200% 0; } }` },
spinner: { html: `<div class="spin-wrap"><i class="spinner"></i><i class="dots"><b></b><b></b><b></b></i></div>`, css:
`.spinner {
  border: .8cqw solid #DCE2EA;
  border-top-color: #D7352C;
  border-radius: 50%;
  animation: spin .8s linear infinite;
}
.dots b { animation: dot 1.2s ease-in-out infinite; }
.dots b:nth-child(2) { animation-delay: .15s; }
.dots b:nth-child(3) { animation-delay: .3s; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes dot  { 0%, 80%, 100% { transform: scale(.4); opacity: .4; } 40% { transform: scale(1); opacity: 1; } }` },
progress: { html: `<div class="prog-wrap"><div class="prog"><i></i></div><div class="prog indet"><i></i></div><span class="lbl">determinado · indeterminado</span></div>`, css:
`.prog i {
  transform-origin: left;
  animation: fill 3s cubic-bezier(.65,0,.35,1) infinite;
}
.indet i {
  width: 35%;
  animation: indet 1.4s ease-in-out infinite;
}
@keyframes fill  { 0% { transform: scaleX(0); } 70%, 100% { transform: scaleX(1); } }
@keyframes indet { from { transform: translateX(-100%); } to { transform: translateX(300%); } }` },
toggle: { html: `<div class="sw-wrap"><span class="sw"><i></i></span></div>`, css:
`.sw { background: #C9D2DD; transition: background .25s; }
.sw i { transition: transform .3s cubic-bezier(.34,1.56,.64,1); }
.sw.on { background: #2B7A4B; }
.sw.on i { transform: translateX(100%); }`, js(root) { return togg(root.querySelector('.sw'), 'on', 1100); } },
burger: { html: `<button class="burger" aria-label="menu"><i></i><i></i><i></i></button>`, css:
`.burger i { transition: transform .35s cubic-bezier(.65,0,.35,1), opacity .2s; }
.burger.open i:nth-child(1) { transform: translateY(var(--gap)) rotate(45deg); }
.burger.open i:nth-child(2) { opacity: 0; }
.burger.open i:nth-child(3) { transform: translateY(calc(var(--gap) * -1)) rotate(-45deg); }`, js(root) { return togg(root.querySelector('.burger'), 'open', 1300); } },
accordion: { html: `<div class="acc"><div class="acc-h">Pergunta frequente <b>+</b></div><div class="acc-b"><div><p>A altura anima de 0 até o conteúdo com grid-template-rows: 0fr → 1fr, sem medir em JS.</p></div></div></div>`, css:
`.acc-b {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows .45s cubic-bezier(.65,0,.35,1);
}
.acc-b > div { overflow: hidden; }
.acc.open .acc-b { grid-template-rows: 1fr; }
.acc-h b { transition: transform .3s; }
.acc.open .acc-h b { transform: rotate(45deg); }`, js(root) { return togg(root.querySelector('.acc'), 'open', 1600); } },
toast: { html: `<div class="toast-wrap"><div class="toast-demo">✓ Salvo com sucesso</div></div>`, css:
`.toast-demo {
  transform: translateY(150%);
  opacity: 0;
  transition: transform .45s cubic-bezier(.16,1,.3,1), opacity .3s;
}
.toast-demo.show { transform: none; opacity: 1; }`, js(root) { return togg(root.querySelector('.toast-demo'), 'show', 1500); } },
scrollrev: { html: `<div class="scroller"><div class="scroll-col">${Array.from({ length: 8 }, (_, i) => `<div class="rev-card">Seção ${i + 1}</div>`).join('')}</div></div>`, css:
`.rev-card {
  opacity: 0;
  transform: translateY(2cqw);
  transition: opacity .6s, transform .6s cubic-bezier(.16,1,.3,1);
}
.rev-card.in { opacity: 1; transform: none; }`,
  code: `.reveal { opacity: 0; transform: translateY(24px); transition: .6s cubic-bezier(.16,1,.3,1); }
.reveal.in { opacity: 1; transform: none; }

const io = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) e.target.classList.add('in');
}, { threshold: .2 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));`,
  js(root) {
    const box = root.querySelector('.scroller'), col = root.querySelector('.scroll-col'), cards = [...col.children];
    let start = performance.now(), id;
    const frame = now => {
      const max = col.scrollHeight - box.clientHeight, k = ((now - start) / 7000) % 1, y = max * Math.min(1, k * 1.15);
      col.style.transform = `translateY(${-y}px)`;
      const lim = box.clientHeight * .85;
      cards.forEach(c => { const top = c.offsetTop - y; if (k < .02) c.classList.remove('in'); else if (top < lim) c.classList.add('in'); });
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame); return () => cancelAnimationFrame(id);
  } },
modal: { html: `<div class="modal-wrap"><div class="backdrop"></div><div class="dialog"><b>Confirmar?</b><small>scale .94 → 1 + fade</small></div></div>`, css:
`.backdrop { opacity: 0; transition: opacity .3s; }
.dialog {
  opacity: 0;
  transform: translateY(1cqw) scale(.94);
  transition: opacity .25s, transform .35s cubic-bezier(.16,1,.3,1);
}
.open .backdrop { opacity: 1; }
.open .dialog   { opacity: 1; transform: none; }`, js(root) { return togg(root.querySelector('.modal-wrap'), 'open', 1600); } },
shared: { html: `<div class="shared"><div class="thumbs"><i></i><i class="hero-el"></i><i></i><i></i></div></div>`, css:
`/* Shared element: o mesmo elemento muda de layout e o FLIP anima a diferença */`,
  code: `// FLIP: First, Last, Invert, Play
function flip(el, change) {
  const first = el.getBoundingClientRect();     // First
  change();                                      // muda o layout (classe, DOM…)
  const last = el.getBoundingClientRect();       // Last
  const dx = first.left - last.left, dy = first.top - last.top;
  const sx = first.width / last.width, sy = first.height / last.height;
  el.animate([                                   // Invert → Play
    { transform: \`translate(\${dx}px, \${dy}px) scale(\${sx}, \${sy})\` },
    { transform: 'none' }
  ], { duration: 500, easing: 'cubic-bezier(.16,1,.3,1)', transformOrigin: 'top left' });
}
// Em navegadores recentes: document.startViewTransition(() => change())`,
  js(root) {
    const el = root.querySelector('.hero-el'), wrap = root.querySelector('.shared');
    return every(1700, () => {
      const f = el.getBoundingClientRect(); el.classList.toggle('big'); const l = el.getBoundingClientRect();
      el.animate([{ transform: `translate(${f.left - l.left}px,${f.top - l.top}px) scale(${f.width / l.width},${f.height / l.height})` }, { transform: 'none' }], { duration: 550, easing: 'cubic-bezier(.16,1,.3,1)' });
      void wrap;
    });
  } },
heart: { html: `<button class="heart-btn" aria-label="curtir"><svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.5-9.2C1 8.3 3.2 4.5 6.8 4.5c2.1 0 3.6 1.2 5.2 3 1.6-1.8 3.1-3 5.2-3 3.6 0 5.8 3.8 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg></button>`, css:
`.heart-btn path { fill: none; stroke: #283142; stroke-width: 1.6; transition: fill .2s; }
.heart-btn.liked path { fill: #D7352C; stroke: #D7352C; }
.heart-btn.liked svg { animation: like .45s cubic-bezier(.34,1.56,.64,1); }
.heart-btn.liked::after {          /* anel que expande */
  content: ''; position: absolute; inset: 0; border-radius: 50%;
  border: .4cqw solid #D7352C;
  animation: ring .5s ease-out forwards;
}
@keyframes like { 0% { transform: scale(.6); } 100% { transform: scale(1); } }
@keyframes ring { from { transform: scale(.5); opacity: 1; } to { transform: scale(1.6); opacity: 0; } }`, js(root) { return togg(root.querySelector('.heart-btn'), 'liked', 1300); } },

// ───────── técnicas
transition: { html: `<div class="tech-tr"><div class="box tr-box"></div><span class="lbl">a classe muda · o CSS interpola</span></div>`, css:
`.tr-box {
  transition: transform .6s cubic-bezier(.65,0,.35,1), background-color .6s;
}
.tr-box.on {
  transform: translateX(20cqw) rotate(90deg);
  background-color: #D7352C;
}`, js(root) { return togg(root.querySelector('.tr-box'), 'on', 1200); } },
keyframes: { html: `<div class="kf-wrap"><div class="box kf"></div></div>`, css:
`.kf { animation: square 4s cubic-bezier(.65,0,.35,1) infinite; }
@keyframes square {
  0%, 100% { transform: translate(-15cqw, -8cqw); background: #2F6F8F; }
  25%      { transform: translate(15cqw, -8cqw) rotate(90deg); background: #3B79C9; }
  50%      { transform: translate(15cqw, 8cqw)  rotate(180deg); background: #F2B134; }
  75%      { transform: translate(-15cqw, 8cqw) rotate(270deg); background: #D7352C; }
}` },
waapi: { html: `<div class="box waapi-box"></div>`,
  js(root) {
    const anim = root.querySelector('.waapi-box').animate(
      [{ transform: 'translateX(-25cqw) rotate(0)', borderRadius: '1.5cqw' },
       { transform: 'translateX(25cqw) rotate(180deg)', borderRadius: '50%' }],
      { duration: 1600, iterations: Infinity, direction: 'alternate', easing: 'cubic-bezier(.65,0,.35,1)' });
    return () => anim.cancel();   // controle total: pause(), reverse(), playbackRate, finished
  } },
raf: { html: `<div class="raf-box"></div>`,
  js(root) {
    const box = root.querySelector('.raf-box'), W = () => box.clientWidth, H = () => box.clientHeight;
    const balls = Array.from({ length: 7 }, (_, i) => {
      const el = document.createElement('i'); el.className = 'raf-ball'; el.style.background = ['#D7352C', '#3B79C9', '#F2B134', '#2F6F8F'][i % 4]; box.appendChild(el);
      return { el, x: Math.random() * 300, y: Math.random() * 60, vx: (Math.random() - .5) * 260, vy: 0 };
    });
    let last = performance.now(), id;
    const frame = now => {
      const dt = Math.min(.033, (now - last) / 1000); last = now;   // passo de tempo real
      const r = box.clientWidth * .025;
      for (const b of balls) {
        b.vy += 900 * dt; b.x += b.vx * dt; b.y += b.vy * dt;        // gravidade
        if (b.y > H() - r) { b.y = H() - r; b.vy *= -.82; }          // quica com perda
        if (b.x < r || b.x > W() - r) { b.vx *= -1; b.x = Math.max(r, Math.min(W() - r, b.x)); }
        if (Math.abs(b.vy) < 40 && b.y > H() - r - 1) b.vy = -500 - Math.random() * 200;
        b.el.style.transform = `translate(${b.x - r}px, ${b.y - r}px)`;
      }
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame); return () => cancelAnimationFrame(id);
  } },
svgsmil: { html: `<svg viewBox="0 0 160 90" class="svgfull"><g transform="translate(62 45)"><path class="gear" d="${(() => { let d = ''; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, b = a + Math.PI / 12; d += `${i ? 'L' : 'M'}${Math.cos(a) * 22},${Math.sin(a) * 22} L${Math.cos(a) * 28},${Math.sin(a) * 28} L${Math.cos(b) * 28},${Math.sin(b) * 28} L${Math.cos(b) * 22},${Math.sin(b) * 22} `; } return d + 'Z'; })()}"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="6s" repeatCount="indefinite"/></path><circle r="8" class="gear-hole"/></g>
  <g transform="translate(108 45)"><circle r="14" class="sm"><animate attributeName="r" values="10;16;10" dur="2s" repeatCount="indefinite"/><animate attributeName="fill" values="#3B79C9;#D7352C;#3B79C9" dur="2s" repeatCount="indefinite"/></circle></g></svg>`,
  code: `<!-- SVG anima atributos direto no markup (SMIL) -->
<path d="…engrenagem…">
  <animateTransform attributeName="transform" type="rotate"
    from="0" to="360" dur="6s" repeatCount="indefinite"/>
</path>
<circle r="14">
  <animate attributeName="r"    values="10;16;10" dur="2s" repeatCount="indefinite"/>
  <animate attributeName="fill" values="#3B79C9;#D7352C;#3B79C9" dur="2s" repeatCount="indefinite"/>
</circle>` },
canvas2d: { html: `<canvas class="cv-demo"></canvas>`,
  js(root) {
    const cv = root.querySelector('canvas'), c = cv.getContext('2d');
    const fit = () => { cv.width = cv.clientWidth * Math.min(2, devicePixelRatio || 1); cv.height = cv.clientHeight * Math.min(2, devicePixelRatio || 1); };
    fit();
    const P = Array.from({ length: 260 }, () => ({ x: Math.random(), y: Math.random() }));
    let id, t = 0;
    const frame = () => {
      t += .006; c.fillStyle = 'rgba(243,245,247,.12)'; c.fillRect(0, 0, cv.width, cv.height);   // rastro por sobreposição
      for (const p of P) {
        const a = Math.sin(p.x * 6 + t) * Math.cos(p.y * 5 - t) * Math.PI * 2;                 // campo de fluxo
        p.x = (p.x + Math.cos(a) * .0016 + 1) % 1; p.y = (p.y + Math.sin(a) * .0016 + 1) % 1;
        c.fillStyle = a > 0 ? '#3B79C9' : '#D7352C'; c.fillRect(p.x * cv.width, p.y * cv.height, 2, 2);
      }
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame); return () => cancelAnimationFrame(id);
  } },
webgl: { html: `<canvas class="cv-demo"></canvas>`,
  js(root) {
    // Projeção 3D → 2D de um icosaedro (o que o Three.js faz na GPU, aqui em Canvas 2D)
    const cv = root.querySelector('canvas'), c = cv.getContext('2d'), g = (1 + Math.sqrt(5)) / 2;
    cv.width = cv.clientWidth * 2; cv.height = cv.clientHeight * 2;
    const V = [[-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0], [0, -1, g], [0, 1, g], [0, -1, -g], [0, 1, -g], [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1]];
    const E = []; V.forEach((a, i) => V.forEach((b, j) => { if (j > i && Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) - 2) < .01) E.push([i, j]); }));
    let id, t = 0;
    const frame = () => {
      t += .01; c.clearRect(0, 0, cv.width, cv.height);
      const s = cv.height * .2, P = V.map(([x, y, z]) => { const x1 = x * Math.cos(t) - z * Math.sin(t), z1 = x * Math.sin(t) + z * Math.cos(t), y1 = y * Math.cos(t * .7) - z1 * Math.sin(t * .7), z2 = y * Math.sin(t * .7) + z1 * Math.cos(t * .7), k = 4 / (5 + z2); return [cv.width / 2 + x1 * s * k, cv.height / 2 + y1 * s * k, z2]; });
      for (const [i, j] of E) { const d = (P[i][2] + P[j][2]) / 2; c.strokeStyle = d > 0 ? 'rgba(40,49,66,.25)' : '#3B79C9'; c.lineWidth = d > 0 ? 2 : 4; c.beginPath(); c.moveTo(P[i][0], P[i][1]); c.lineTo(P[j][0], P[j][1]); c.stroke(); }
      for (const p of P) { c.fillStyle = '#D7352C'; c.beginPath(); c.arc(p[0], p[1], p[2] > 0 ? 4 : 7, 0, 7); c.fill(); }
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame); return () => cancelAnimationFrame(id);
  } },
timeline: { html: `<div class="tl"><div class="tl-row"><i class="box tl-a"></i></div><div class="tl-row"><i class="box tl-b"></i></div><div class="tl-row"><i class="box tl-c"></i></div><div class="tl-bar"><i class="tl-head"></i></div></div>`,
  js(root) {
    // Timeline com sobreposição ("-=0.3s"), feita com Web Animations API e um relógio único
    const q = s => root.querySelector(s), D = 3600, opts = { duration: D, iterations: Infinity, easing: 'linear' };
    const seg = (from, to) => [{ offset: 0, transform: 'translateX(0)' }, { offset: from, transform: 'translateX(0)', easing: 'cubic-bezier(.16,1,.3,1)' }, { offset: to, transform: 'translateX(40cqw)' }, { offset: .9, transform: 'translateX(40cqw)' }, { offset: 1, transform: 'translateX(0)' }];
    const a = [q('.tl-a').animate(seg(0, .3), opts), q('.tl-b').animate(seg(.2, .5), opts), q('.tl-c').animate(seg(.4, .7), opts), q('.tl-head').animate([{ left: '0%' }, { left: '100%' }], opts)];
    return () => a.forEach(x => x.cancel());
  },
  code: `// GSAP (biblioteca): sequência com sobreposição
const tl = gsap.timeline({ repeat: -1, repeatDelay: .4 });
tl.to('.a', { x: 300, duration: 1, ease: 'expo.out' })
  .to('.b', { x: 300, duration: 1, ease: 'expo.out' }, '-=0.6')  // começa antes do fim de .a
  .to('.c', { x: 300, duration: 1, ease: 'expo.out' }, '-=0.6');

// Sem biblioteca: Web Animations API com offsets no mesmo relógio (é o que esta demo usa)` },
lottie: { html: `<svg viewBox="0 0 160 90" class="svgfull"><circle cx="80" cy="45" r="26" class="lt-circle" pathLength="1"/><path d="M68,46 L77,55 L94,36" class="lt-check" pathLength="1"/></svg>`, css:
`/* Ícone "sucesso" no estilo Lottie, refeito em SVG + CSS */
.lt-circle, .lt-check { stroke-dasharray: 1; stroke-dashoffset: 1; }
.lt-circle { animation: lt-draw 2.6s cubic-bezier(.65,0,.35,1) infinite; }
.lt-check  { animation: lt-draw 2.6s cubic-bezier(.65,0,.35,1) .35s infinite; }
@keyframes lt-draw { 35%, 85% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: 0; opacity: 0; } }` },
flipdemo: { html: `<ul class="flip-list">${['A', 'B', 'C', 'D', 'E'].map((l, i) => `<li style="--c:${['#D7352C', '#3B79C9', '#F2B134', '#2F6F8F', '#283142'][i]}">${l}</li>`).join('')}</ul>`,
  js(root) {
    const ul = root.querySelector('.flip-list');
    return every(1800, () => {
      const items = [...ul.children], first = new Map(items.map(el => [el, el.getBoundingClientRect()]));
      items.sort(() => Math.random() - .5).forEach(el => ul.appendChild(el));             // novo layout
      for (const el of items) {
        const f = first.get(el), l = el.getBoundingClientRect();
        el.animate([{ transform: `translate(${f.left - l.left}px, ${f.top - l.top}px)` }, { transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.16,1,.3,1)' });
      }
    });
  } },
perf: { html: `<div class="perf"><div class="perf-row"><i class="box perf-left"></i><span>left (layout + paint)</span></div><div class="perf-row"><i class="box perf-tf"></i><span>transform (compositor)</span></div></div>`, css:
`/* Visualmente iguais; custo muito diferente */
.perf-left { position: relative; animation: by-left 2s ease-in-out infinite alternate; }
.perf-tf   { animation: by-transform 2s ease-in-out infinite alternate; }
@keyframes by-left      { from { left: 0; } to { left: 40cqw; } }        /* recalcula layout a cada quadro */
@keyframes by-transform { to { transform: translateX(40cqw); } }        /* só a GPU recompõe */` },
scrolldriven: { html: `<div class="sd"><i class="sd-bar"></i><div class="sd-page"><div class="sd-col">${Array.from({ length: 9 }, () => '<p></p>').join('')}</div></div></div>`, code:
`/* CSS nativo: a animação avança com a rolagem, sem JS */
.sd-bar {
  transform-origin: left;
  animation: grow-x linear;
  animation-timeline: scroll(root);
}
@keyframes grow-x { from { transform: scaleX(0); } to { transform: scaleX(1); } }
/* Revelar elementos ao entrar na tela: animation-timeline: view(); */`,
  js(root) {
    // A demo simula a rolagem; num site real o CSS acima liga a barra ao scroll sozinho
    const col = root.querySelector('.sd-col'), page = root.querySelector('.sd-page'), bar = root.querySelector('.sd-bar');
    let start = performance.now(), id;
    const frame = now => {
      const k = Math.min(1, ((now - start) % 6000) / 5000), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, max = col.scrollHeight - page.clientHeight;
      col.style.transform = `translateY(${-e * max}px)`; bar.style.transform = `scaleX(${e})`;
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame); return () => cancelAnimationFrame(id);
  } },
reduced: { html: `<div class="rm"><div class="rm-pane"><i class="box rm-full"></i><span>movimento completo</span></div><div class="rm-pane"><i class="box rm-red"></i><span>prefers-reduced-motion</span></div></div>`, code:
`.panel { animation: rm-slide .8s cubic-bezier(.16,1,.3,1) both; }

@media (prefers-reduced-motion: reduce) {
  .panel { animation: fade-only .4s ease both; }   /* troca deslocamento por fade */
}
@keyframes rm-slide  { from { transform: translateX(-60%); opacity: 0; } }
@keyframes fade-only { from { opacity: 0; } }` },
sprite: { html: `<div class="sprite-wrap"><i class="sprite"></i><span class="lbl">8 quadros · steps(8)</span></div>`, css:
`.sprite {
  background-image: url(walk-sheet.png);   /* 8 quadros lado a lado */
  background-size: 800% 100%;
  animation: walk .8s steps(8) infinite;    /* pula de quadro em quadro, sem interpolar */
}
@keyframes walk { to { background-position: 114.2857% 0; } }   /* 100% · 8/7 */`,
  js(root) {
    // gera a sprite sheet num canvas (na vida real é uma imagem exportada)
    const fw = 120, fh = 160, cv = document.createElement('canvas'); cv.width = fw * 8; cv.height = fh; const c = cv.getContext('2d');
    for (let f = 0; f < 8; f++) {
      const ph = f / 8 * Math.PI * 2, x = f * fw + fw / 2, bob = Math.abs(Math.cos(ph)) * 6;
      c.strokeStyle = '#2C3A55'; c.lineWidth = 10; c.lineCap = 'round';
      for (const s of [-1, 1]) { const a = Math.sin(ph) * .55 * s; c.beginPath(); c.moveTo(x, 104 - bob); c.lineTo(x + Math.sin(a) * 42, 104 - bob + Math.cos(a) * 42); c.stroke(); }
      c.fillStyle = '#2F6F8F'; c.beginPath(); c.roundRect ? c.roundRect(x - 26, 30 - bob, 52, 80, 26) : c.rect(x - 26, 30 - bob, 52, 80); c.fill();
      c.fillStyle = '#D7352C'; c.fillRect(x - 28, 62 - bob, 56, 9);
      c.fillStyle = '#F2D2B0'; c.beginPath(); c.ellipse(x + 4, 46 - bob, 18, 11, 0, 0, 7); c.fill();
      c.fillStyle = '#1A1414'; c.beginPath(); c.arc(x + 12, 46 - bob, 3.5, 0, 7); c.fill();
    }
    root.querySelector('.sprite').style.backgroundImage = `url(${cv.toDataURL()})`;
  } }
};

// ─── Termos
const T = [
// easing
{c:'easing',en:'Linear',pt:'Linear',x:{dom:'ease-linear'},
 d:'Velocidade constante do início ao fim. Sem aceleração.',
 u:'Rotação contínua, loaders, marquees, barras de progresso. Em movimentos de objeto parece robótico.',
 p:'Faça o spinner girar com rotate 360deg em 1s, linear, infinito.'},
{c:'easing',en:'Ease-in',pt:'Aceleração',x:{dom:'ease-in'},
 d:'Começa devagar e termina rápido.',
 u:'Elementos SAINDO da tela. Na entrada parece atrasado.',
 p:'Ao fechar, o painel sai para baixo em 250ms com ease-in.',
 v:'ease-in acelera; ease-out desacelera. Entradas usam ease-out, saídas usam ease-in.'},
{c:'easing',en:'Ease-out',pt:'Desaceleração',x:{dom:'ease-out'},
 d:'Começa rápido e freia ao chegar.',
 u:'O padrão para elementos ENTRANDO: responde na hora e assenta com suavidade.',
 p:'Os cards entram com translateY(16px) → 0 em 400ms ease-out.'},
{c:'easing',en:'Ease-in-out',pt:'Suave nas pontas',x:{dom:'ease-inout'},
 d:'Acelera no começo e freia no fim. Equivale a slow in / slow out.',
 u:'Objetos que já estão na tela e mudam de lugar (A → B).',
 p:'Mova o indicador da aba ativa com transform em 300ms ease-in-out.'},
{c:'easing',en:'Expo out',pt:'Saída exponencial',tk:'cubic-bezier(.16,1,.3,1)',x:{dom:'ease-expo'},
 d:'Arranque muito rápido e uma frenagem longa. cubic-bezier(.16, 1, .3, 1).',
 u:'Visual "premium" de interfaces modernas e sites de produto.',
 p:'Use easing expo out — cubic-bezier(.16,1,.3,1) — em todas as entradas, 600–800ms.'},
{c:'easing',en:'Back (overshoot)',pt:'Passa do ponto',tk:'back easing with overshoot',x:{dom:'ease-back'},
 d:'Ultrapassa o destino e volta. cubic-bezier com valor acima de 1.',
 u:'Pop-ins, botões, ícones: energia e personalidade.',
 p:'O badge aparece com scale 0 → 1 e um leve overshoot: cubic-bezier(.34,1.56,.64,1), 450ms.'},
{c:'easing',en:'Elastic',pt:'Elástico',x:{dom:'ease-elastic'},
 d:'Oscila várias vezes ao redor do destino até parar, como um elástico.',
 u:'Cartoon, brincadeira, notificações divertidas. Use pouco.',
 p:'Faça o ícone de sino entrar com easing elastic (use CSS linear() ou uma função JS).'},
{c:'easing',en:'Bounce',pt:'Quique',x:{dom:'ease-bounce'},
 d:'Bate no destino e quica com quiques cada vez menores.',
 u:'Objetos caindo, toques lúdicos.',
 p:'O ícone cai do topo e quica no chão com easing bounce em 900ms.',
 v:'Bounce quica ANTES de chegar (bate no destino); elastic oscila AO REDOR do destino.'},
{c:'easing',en:'Steps',pt:'Em degraus',tk:'steps() timing function',x:{dom:'ease-steps'},
 d:'Pula de valor em valor sem interpolar. steps(n).',
 u:'Sprite sheets, máquina de escrever, relógios, estética de animação em twos.',
 p:'Anime a sprite sheet de 8 quadros com steps(8) em 800ms.'},
{c:'easing',en:'Spring physics',pt:'Mola',tk:'spring animation',x:{dom:'ease-spring'},
 d:'Movimento calculado por física de mola (rigidez, amortecimento, massa), não por duração fixa.',
 u:'Interfaces que reagem ao toque e arrasto; padrão no iOS, Framer Motion e React Spring.',
 p:'Use uma animação de mola com stiffness 170 e damping 26 no card arrastável.'},

// objetos
{c:'objeto',en:'Fade in',pt:'Aparecer',x:{dom:'fade'},
 d:'A opacidade vai de 0 a 1.',
 u:'A entrada mais discreta. Combine com um pequeno deslocamento para ganhar direção.',
 p:'Faça a seção aparecer com fade in de 500ms ease-out.'},
{c:'objeto',en:'Scale pop-in',pt:'Pop de escala',tk:'pop-in scale animation',x:{dom:'pop'},
 d:'O objeto cresce de 0 até o tamanho final, geralmente com overshoot.',
 u:'Ícones, badges, confirmações, elementos lúdicos.',
 p:'O ícone entra com scale de 0 a 1, com overshoot leve, em 450ms.'},
{c:'objeto',en:'Slide in',pt:'Deslizar',x:{dom:'slide'},
 d:'O objeto entra deslizando de fora do quadro ou de um deslocamento curto.',
 u:'Menus, painéis, cards, transições de slide.',
 p:'O painel lateral desliza da direita com translateX(100%) → 0 em 400ms expo out.'},
{c:'objeto',en:'Spin',pt:'Rotação',tk:'continuous rotation',x:{dom:'spin'},
 d:'Rotação contínua ao redor do próprio centro.',
 u:'Loaders, engrenagens, elementos decorativos.',
 p:'Faça o logo girar 360° a cada 8s, linear, infinito.'},
{c:'objeto',en:'Bounce',pt:'Quicar',tk:'bouncing ball',x:{dom:'bouncebox'},
 d:'Sobe e desce acelerando na queda, com squash no impacto.',
 u:'Chamar atenção, personagens, ícones de "arraste aqui".',
 p:'A bolinha quica no lugar: acelera ao cair e achata 25% no impacto, loop infinito.'},
{c:'objeto',en:'Pulse',pt:'Pulsar',x:{dom:'pulse'},
 d:'Cresce e encolhe ritmicamente, às vezes com um anel que se expande.',
 u:'Indicadores "ao vivo", pontos de atenção, botões de ação principal.',
 p:'Adicione um pulse com anel expandindo ao redor do ponto vermelho "ao vivo", a cada 1,6s.'},
{c:'objeto',en:'Shake',pt:'Tremer',tk:'shake animation',x:{dom:'shake'},
 d:'Vibração lateral curta com rotação leve.',
 u:'Erro de formulário, senha incorreta, alerta.',
 p:'Quando a senha estiver errada, o campo treme lateralmente 4 vezes em 400ms.'},
{c:'objeto',en:'Float',pt:'Flutuar',tk:'gentle floating idle animation',x:{dom:'float'},
 d:'Sobe e desce devagar, com a sombra reagindo.',
 u:'Ilustrações em hero, ícones 3D, estado ocioso.',
 p:'A ilustração flutua 12px para cima e para baixo em 3s ease-in-out, com a sombra encolhendo.'},
{c:'objeto',en:'Stagger',pt:'Escalonado',tk:'staggered animation',x:{dom:'stagger'},
 d:'Vários itens executam a mesma animação com um atraso crescente entre eles.',
 u:'Grids, listas, menus. Dá ritmo e guia o olhar.',
 p:'Os cards da grade entram com fade up e stagger de 60ms por item.'},
{c:'objeto',en:'Motion path',pt:'Trajetória',tk:'motion path animation',x:{dom:'path'},
 d:'O objeto percorre uma curva definida e gira acompanhando a direção.',
 u:'Aviões, setas, rotas em mapas, infográficos.',
 p:'Anime o aviãozinho ao longo de um path SVG curvo, rotacionando na tangente, 3s.'},
{c:'objeto',en:'Shape morph',pt:'Transformação de forma',tk:'shape morphing',x:{dom:'morph'},
 d:'Uma forma se transforma em outra interpolando seus pontos.',
 u:'Ícones que mudam de estado, logos, transições abstratas.',
 p:'Faça o círculo virar estrela e depois quadrado com morph de SVG, 4,5s em loop.'},
{c:'objeto',en:'Line drawing',pt:'Desenho de traço',tk:'SVG line draw-on animation',x:{dom:'draw'},
 d:'O traço de um SVG se desenha progressivamente (stroke-dasharray + stroke-dashoffset).',
 u:'Assinaturas, ilustrações de linha, ícones, mapas.',
 p:'Desenhe o contorno do logo SVG traço a traço em 2s com stroke-dashoffset.'},
{c:'objeto',en:'Wipe reveal',pt:'Revelação por cortina',tk:'clip-path wipe reveal',x:{dom:'wipe'},
 d:'O elemento é revelado por uma máscara que se desloca (clip-path).',
 u:'Imagens, títulos, transições editoriais.',
 p:'Revele a imagem da esquerda para a direita com clip-path: inset() em 900ms.'},
{c:'objeto',en:'Parallax layers',pt:'Camadas com paralaxe',tk:'parallax layers',x:{dom:'parallax'},
 d:'Camadas se movem em velocidades diferentes: as próximas mais rápido.',
 u:'Profundidade em heros, cenários 2.5D, scroll storytelling.',
 p:'Monte um hero com 3 camadas em paralaxe: fundo a 10%, meio a 30%, frente a 60% do scroll.'},
{c:'objeto',en:'Orbit',pt:'Órbita',tk:'orbiting element',x:{dom:'orbit'},
 d:'Um objeto gira ao redor de outro mantendo a própria orientação.',
 u:'Ícones de integração, sistemas, loaders decorativos.',
 p:'Coloque 4 ícones orbitando o logo central em 12s, sempre de pé.'},
{c:'objeto',en:'Confetti burst',pt:'Explosão de confete',tk:'confetti particle burst',x:{dom:'confetti'},
 d:'Dezenas de partículas lançadas em direções aleatórias com gravidade e fade.',
 u:'Celebração: compra concluída, meta batida.',
 p:'Ao concluir o pedido, solte uma explosão de 40 confetes a partir do botão.'},
{c:'objeto',en:'Liquid blob',pt:'Blob orgânico',tk:'morphing liquid blob',x:{dom:'blob'},
 d:'Forma arredondada que se deforma organicamente (border-radius animado).',
 u:'Fundos de hero, avatares, estética orgânica.',
 p:'Crie um blob com gradiente azul-vermelho que se deforma devagar ao fundo, 6s.'},
{c:'objeto',en:'3D card flip',pt:'Virar carta 3D',tk:'3D card flip',x:{dom:'flip'},
 d:'O elemento gira 180° em perspectiva revelando o verso.',
 u:'Cards de produto, flashcards, preços.',
 p:'Ao passar o mouse, o card vira em 3D (rotateY 180°) e mostra o verso.'},
{c:'objeto',en:'Motion trail',pt:'Rastro',tk:'echo motion trail',x:{dom:'trail'},
 d:'Cópias atrasadas e mais transparentes seguem o objeto.',
 u:'Velocidade, estética retrô, cursores.',
 p:'Faça o ponto deixar um rastro de 5 cópias com atraso de 60ms e opacidade decrescente.'},
{c:'objeto',en:'Animated gradient',pt:'Gradiente animado',x:{dom:'gradient'},
 d:'O gradiente desliza ou muda de cor lentamente.',
 u:'Fundos vivos, botões, cabeçalhos.',
 p:'Fundo com gradiente de 4 cores deslizando em 8s, ease-in-out, loop.'},
{c:'objeto',en:'Wave pattern',pt:'Padrão em onda',tk:'kinetic wave pattern',x:{dom:'wave'},
 d:'Grade de formas animadas com atraso pela distância do centro: forma uma onda.',
 u:'Motion design abstrato, telas de carregamento, fundos.',
 p:'Grade de 15×7 pontos pulsando em onda radial a partir do centro.'},
{c:'objeto',en:'Animated chart',pt:'Gráfico animado',tk:'animated bar chart',x:{dom:'chart'},
 d:'Barras ou linhas crescem até o valor, uma após a outra.',
 u:'Dashboards, relatórios, vídeos explicativos.',
 p:'As barras do gráfico crescem da base com stagger de 90ms e expo out.'},
{c:'objeto',en:'3D tilt',pt:'Inclinação 3D',tk:'3D tilt on hover',x:{dom:'tilt'},
 d:'O card inclina em perspectiva seguindo o cursor.',
 u:'Cards de produto, cartões, portfólio.',
 p:'Card que inclina até 12° em 3D seguindo a posição do mouse.'},

// texto
{c:'texto',en:'Typewriter',pt:'Máquina de escrever',tk:'typewriter text effect',x:{dom:'typewriter'},
 d:'O texto aparece caractere por caractere com um cursor piscando.',
 u:'Terminais, chatbots, títulos com tom de conversa.',
 p:'Título com efeito typewriter: 22 caracteres em 2s com steps(), cursor piscando.'},
{c:'texto',en:'Letter stagger',pt:'Letra a letra',tk:'staggered letter reveal',x:{dom:'letters'},
 d:'Cada letra entra com atraso em relação à anterior.',
 u:'Títulos de hero, aberturas, logos.',
 p:'Divida o título em letras e faça cada uma subir com fade, stagger de 45ms.'},
{c:'texto',en:'Word reveal',pt:'Palavra a palavra',tk:'word-by-word reveal',x:{dom:'wordsrev'},
 d:'Palavras entram em sequência, muitas vezes saindo do desfoque.',
 u:'Frases de impacto, legendas animadas, citações.',
 p:'Revele a frase palavra a palavra, cada uma saindo do blur, 140ms entre elas.'},
{c:'texto',en:'Mask reveal',pt:'Revelação por máscara',tk:'line mask reveal',x:{dom:'maskrev'},
 d:'Cada linha sobe de trás de uma máscara invisível (overflow: hidden).',
 u:'O efeito editorial clássico de sites de agência.',
 p:'Cada linha do título sobe de translateY(110%) a 0 dentro de uma máscara, 80ms de stagger.'},
{c:'texto',en:'Text scramble',pt:'Embaralhar / decodificar',tk:'text scramble decode effect',x:{dom:'scramble'},
 d:'Caracteres aleatórios vão se resolvendo no texto final.',
 u:'Hacker, tecnologia, revelação de código.',
 p:'Efeito de decodificação: caracteres aleatórios resolvendo da esquerda para a direita em 1,4s.'},
{c:'texto',en:'Wavy text',pt:'Texto em onda',tk:'wavy text animation',x:{dom:'wavetext'},
 d:'As letras sobem e descem em sequência formando uma onda contínua.',
 u:'Lúdico, infantil, estados de carregamento.',
 p:'Letras ondulando em loop com 90ms de defasagem entre elas.'},
{c:'texto',en:'Glitch',pt:'Glitch',tk:'glitch text effect',x:{dom:'glitch'},
 d:'Fatias deslocadas com separação de cor (vermelho/azul), em instantes curtos.',
 u:'Cyberpunk, erro digital, música eletrônica.',
 p:'Título com glitch: cópias vermelha e azul fatiadas com clip-path, a cada 2s.'},
{c:'texto',en:'Count-up',pt:'Contador animado',tk:'animated number count-up',x:{dom:'counter'},
 d:'Um número sobe de 0 até o valor final com desaceleração.',
 u:'Estatísticas, métricas, landing pages.',
 p:'Conte de 0 até 12.480 em 1,8s com ease-out, formatado em pt-BR, quando entrar na tela.'},
{c:'texto',en:'Tracking in',pt:'Espaçamento entrando',tk:'tracking-in blur text',x:{dom:'blurin'},
 d:'O espaço entre letras diminui enquanto o texto sai do desfoque.',
 u:'Aberturas elegantes, títulos de filme.',
 p:'Título entra com letter-spacing de 1em a .05em e blur 12px → 0 em 1,2s.'},
{c:'texto',en:'3D letter flip',pt:'Letras virando em 3D',tk:'3D flipping letters',x:{dom:'flip3d'},
 d:'Cada letra gira no eixo X como um painel, em sequência.',
 u:'Painéis de aeroporto, trocas de palavra, títulos.',
 p:'As letras giram em rotateX de -95° a 0 com perspectiva, 70ms de stagger.'},
{c:'texto',en:'Stroke text draw',pt:'Contorno se desenhando',tk:'outlined text stroke draw',x:{dom:'outline'},
 d:'O contorno das letras se desenha e depois o preenchimento aparece.',
 u:'Logos, títulos de abertura.',
 p:'Desenhe o contorno do texto SVG com stroke-dashoffset e depois preencha a cor.'},
{c:'texto',en:'Shimmer text',pt:'Brilho passando',tk:'shimmering gradient text',x:{dom:'shimmer'},
 d:'Um brilho atravessa o texto (gradiente recortado no texto).',
 u:'Premium, destaque, carregamento.',
 p:'Texto com brilho dourado passando a cada 2,4s usando background-clip: text.'},
{c:'texto',en:'Marquee',pt:'Letreiro corrido',tk:'infinite marquee ticker',x:{dom:'marquee'},
 d:'Faixa de texto rolando sem fim na horizontal.',
 u:'Logos de clientes, avisos, estética editorial.',
 p:'Faixa marquee infinita com os nomes dos clientes, 9s por ciclo, pausando no hover.'},
{c:'texto',en:'Animated highlight',pt:'Grifo desenhado',tk:'animated highlight underline',x:{dom:'underline'},
 d:'Um marca-texto ou sublinhado se desenha atrás da palavra.',
 u:'Ênfase em títulos e textos longos.',
 p:'Destaque a palavra-chave com um marca-texto amarelo que se desenha da esquerda para a direita.'},
{c:'texto',en:'Kinetic typography',pt:'Tipografia cinética',tk:'kinetic typography',x:{dom:'kinetic'},
 d:'Palavras se movem, escalam e se substituem no ritmo da fala ou da música.',
 u:'Vídeos de frase, lyric videos, aberturas, anúncios.',
 p:'Tipografia cinética: "MOVIMENTO / É / LINGUAGEM", uma palavra por vez com punch de escala.'},
{c:'texto',en:'Text on a path',pt:'Texto na curva',tk:'text following a curved path',x:{dom:'textpath'},
 d:'O texto segue uma curva e desliza ao longo dela.',
 u:'Selos, badges circulares, decoração.',
 p:'Texto deslizando ao longo de um path SVG curvo com textPath e startOffset animado.'},

// interface
{c:'ui',en:'Hover lift',pt:'Elevação no hover',tk:'hover lift effect',x:{dom:'hover'},
 d:'Ao passar o mouse, o card sobe alguns pixels e a sombra cresce.',
 u:'Mostra que o elemento é clicável.',
 p:'Cards sobem 6px no hover com sombra maior, transição de 250ms.'},
{c:'ui',en:'Ripple effect',pt:'Ondulação no clique',tk:'material ripple effect',x:{dom:'ripple'},
 d:'Um círculo se expande a partir do ponto do clique.',
 u:'Feedback de toque (Material Design).',
 p:'Botões com efeito ripple a partir do ponto exato do clique.'},
{c:'ui',en:'Skeleton loading',pt:'Esqueleto de carregamento',tk:'skeleton shimmer loader',x:{dom:'skeleton'},
 d:'Blocos cinzas no formato do conteúdo com um brilho passando.',
 u:'Carregamento percebido como mais rápido que um spinner.',
 p:'Enquanto carrega, mostre skeletons com shimmer no formato dos cards.'},
{c:'ui',en:'Loading spinner',pt:'Indicador de carregamento',tk:'loading spinner',x:{dom:'spinner'},
 d:'Arco girando ou pontos pulsando em sequência.',
 u:'Esperas curtas e de duração desconhecida.',
 p:'Spinner de arco vermelho girando em 0,8s e uma variação com 3 pontos pulsando.'},
{c:'ui',en:'Progress bar',pt:'Barra de progresso',tk:'animated progress bar',x:{dom:'progress'},
 d:'Barra que enche (determinada) ou vai e volta (indeterminada).',
 u:'Uploads, etapas, leitura.',
 p:'Barra de progresso animando com scaleX e uma versão indeterminada.'},
{c:'ui',en:'Toggle switch',pt:'Interruptor',tk:'animated toggle switch',x:{dom:'toggle'},
 d:'O botão desliza com overshoot e a cor muda.',
 u:'Configurações liga/desliga.',
 p:'Toggle switch com knob deslizando em 300ms com leve overshoot.'},
{c:'ui',en:'Icon morph',pt:'Ícone que se transforma',tk:'hamburger to close icon morph',x:{dom:'burger'},
 d:'Um ícone vira outro (hambúrguer → X) girando e escondendo partes.',
 u:'Abrir/fechar menus, play/pause.',
 p:'Ícone hambúrguer vira X ao abrir o menu, 350ms.'},
{c:'ui',en:'Accordion',pt:'Sanfona',tk:'smooth accordion expand',x:{dom:'accordion'},
 d:'Painel que expande a altura até o conteúdo.',
 u:'FAQs, filtros, menus.',
 p:'Accordion que expande com grid-template-rows 0fr → 1fr, sem altura fixa.'},
{c:'ui',en:'Toast notification',pt:'Notificação toast',tk:'toast slide-in',x:{dom:'toast'},
 d:'Aviso que entra deslizando e some sozinho.',
 u:'Confirmações não bloqueantes.',
 p:'Toast entra de baixo com expo out e sai após 3s.'},
{c:'ui',en:'Scroll reveal',pt:'Revelar na rolagem',tk:'scroll-triggered reveal',x:{dom:'scrollrev'},
 d:'Elementos animam ao entrar na área visível durante a rolagem.',
 u:'Landing pages e storytelling.',
 p:'Cada seção entra com fade up ao aparecer na tela, usando IntersectionObserver.'},
{c:'ui',en:'Modal transition',pt:'Abrir modal',tk:'modal scale-in',x:{dom:'modal'},
 d:'O fundo escurece e a janela entra crescendo levemente.',
 u:'Diálogos, confirmações.',
 p:'Modal com backdrop em fade e caixa entrando de scale .94 → 1 em 350ms.'},
{c:'ui',en:'Shared element transition',pt:'Elemento compartilhado',tk:'shared element transition',x:{dom:'shared'},
 d:'O mesmo elemento viaja entre dois layouts (miniatura → tela cheia).',
 u:'Galerias, abrir detalhes, continuidade visual.',
 p:'Ao clicar na miniatura, ela expande até virar o cabeçalho do detalhe (View Transitions API ou FLIP).'},
{c:'ui',en:'Like animation',pt:'Curtir',tk:'heart like burst',x:{dom:'heart'},
 d:'O coração enche, dá um pop e solta um anel.',
 u:'Microinteração de recompensa.',
 p:'Botão de curtir: coração preenche de vermelho com pop e anel expandindo.'},

// técnicas
{c:'tecnica',en:'CSS transition',pt:'Transição CSS',x:{dom:'transition'},
 d:'O navegador interpola uma propriedade quando ela muda (por classe, hover, foco).',
 u:'Estados de interface: hover, ativo, aberto/fechado. Mais simples e leve.',
 p:'Use transition no transform e no background, 600ms, ao trocar a classe .on.'},
{c:'tecnica',en:'CSS @keyframes',pt:'Keyframes CSS',tk:'CSS keyframe animation',x:{dom:'keyframes'},
 d:'Sequência com várias etapas definidas em porcentagem, que pode repetir sozinha.',
 u:'Loops, animações decorativas, entradas com várias fases.',
 p:'Crie um @keyframes que percorre os 4 cantos com rotação e troca de cor, loop de 4s.'},
{c:'tecnica',en:'Web Animations API',pt:'API de Animações Web',tk:'Web Animations API',x:{dom:'waapi'},
 d:'element.animate(): keyframes em JavaScript com controle de play, pause, reverse e velocidade.',
 u:'Animações disparadas por lógica, sem biblioteca.',
 p:'Use element.animate() com keyframes e easing, guardando a referência para pausar.'},
{c:'tecnica',en:'requestAnimationFrame',pt:'Loop por quadro',tk:'requestAnimationFrame loop',x:{dom:'raf'},
 d:'Executa uma função a cada quadro da tela: base de física, jogos e simulações.',
 u:'Gravidade, colisões, partículas, qualquer coisa calculada.',
 p:'Simule bolas com gravidade e quique usando requestAnimationFrame com delta time.'},
{c:'tecnica',en:'SVG animation',pt:'Animação SVG (SMIL)',tk:'animated SVG',x:{dom:'svgsmil'},
 d:'Animações declaradas dentro do próprio SVG (<animate>, <animateTransform>).',
 u:'Ícones e ilustrações autocontidos, que funcionam até como arquivo .svg.',
 p:'Gere um SVG animado de engrenagem girando com animateTransform.'},
{c:'tecnica',en:'Canvas 2D',pt:'Canvas 2D',tk:'HTML canvas animation',x:{dom:'canvas2d'},
 d:'Desenho por pixel via JavaScript: milhares de elementos sem criar nós no DOM.',
 u:'Partículas, campos de fluxo, arte generativa, gráficos em tempo real.',
 p:'Arte generativa em canvas: 260 partículas seguindo um campo de fluxo com rastro.'},
{c:'tecnica',en:'WebGL / Three.js',pt:'3D na GPU',tk:'Three.js 3D scene',x:{dom:'webgl'},
 d:'3D acelerado pela placa de vídeo. Three.js é a biblioteca mais usada.',
 u:'Cenas 3D, produtos giráveis, shaders, experiências imersivas.',
 p:'Cena Three.js com um icosaedro em wireframe girando, câmera em perspectiva.',
 v:'Esta demo projeta o 3D em Canvas 2D para não depender de biblioteca; Three.js faz o mesmo na GPU com luz e materiais.'},
{c:'tecnica',en:'Timeline sequencing',pt:'Linha do tempo (GSAP)',tk:'GSAP timeline',x:{dom:'timeline'},
 d:'Várias animações coordenadas num mesmo relógio, com sobreposição e ordem.',
 u:'Coreografias complexas, aberturas, storytelling. GSAP é o padrão da indústria.',
 p:'Com GSAP, crie uma timeline: três elementos entram em sequência com sobreposição de 0,6s.',
 v:'A demo usa Web Animations API; o código mostra a versão GSAP equivalente.'},
{c:'tecnica',en:'Lottie',pt:'Lottie',tk:'Lottie animation',x:{dom:'lottie'},
 d:'Formato JSON exportado do After Effects (Bodymovin) e tocado na web e em apps.',
 u:'Ícones e ilustrações animadas feitos por designers de motion.',
 p:'Toque o arquivo success.json com lottie-web, sem loop, ao concluir o envio.',
 v:'O Claude não exporta do After Effects; ele integra arquivos Lottie ou refaz o efeito em SVG/CSS, como nesta demo.'},
{c:'tecnica',en:'FLIP technique',pt:'Técnica FLIP',tk:'FLIP layout animation',x:{dom:'flipdemo'},
 d:'First, Last, Invert, Play: mede antes e depois de mudar o layout e anima a diferença com transform.',
 u:'Reordenar listas, filtros, mudanças de layout fluidas.',
 p:'Ao embaralhar a lista, anime cada item da posição antiga para a nova com FLIP.'},
{c:'tecnica',en:'Transform vs layout',pt:'Transform vs layout',tk:'animate only transform and opacity',x:{dom:'perf'},
 d:'Animar transform e opacity roda no compositor; animar left, width ou top recalcula layout a cada quadro.',
 u:'Regra de performance número um para animações a 60 fps.',
 p:'Anime só transform e opacity; nunca left/top/width.'},
{c:'tecnica',en:'Scroll-driven animation',pt:'Animação guiada pela rolagem',tk:'scroll-driven animation',x:{dom:'scrolldriven'},
 d:'A animação avança conforme a rolagem, não pelo tempo (animation-timeline: scroll() / view()).',
 u:'Barras de leitura, parallax, storytelling, sem JavaScript.',
 p:'Barra de progresso de leitura com animation-timeline: scroll(), com fallback em JS.'},
{c:'tecnica',en:'Reduced motion',pt:'Movimento reduzido',tk:'prefers-reduced-motion support',x:{dom:'reduced'},
 d:'Media query que detecta quem pediu ao sistema menos movimento.',
 u:'Acessibilidade: pessoas com vestibulopatia sentem enjoo com deslocamentos grandes.',
 p:'Respeite prefers-reduced-motion: troque deslizes e paralaxe por fades curtos.'},
{c:'tecnica',en:'Sprite sheet',pt:'Folha de sprites',tk:'sprite sheet animation',x:{dom:'sprite'},
 d:'Todos os quadros numa só imagem; o CSS pula de quadro com steps().',
 u:'Personagens de jogos, ícones complexos, animação quadro a quadro.',
 p:'Anime o personagem com uma sprite sheet de 8 quadros e steps(8) a 10 fps.'}
];

window.CATS.push(
  { id: 'easing', pt: 'Easing', en: 'Easing curves', q: 'A curva de velocidade', code: true },
  { id: 'objeto', pt: 'Motion graphics', en: 'Object animation', q: 'Formas e objetos em movimento', code: true },
  { id: 'texto', pt: 'Texto animado', en: 'Text animation', q: 'Tipografia em movimento', code: true },
  { id: 'ui', pt: 'Interface', en: 'UI micro-interactions', q: 'Microinterações', code: true },
  { id: 'tecnica', pt: 'Técnicas', en: 'Code techniques', q: 'Como é implementado', code: true }
);
window.TERMS.push(...T);
window.MOTION = { DEMOS };
})();
