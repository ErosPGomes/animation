# Léxico do Animador

Guia interativo da linguagem técnica de câmera e animação para escrever prompts melhores em modelos de vídeo e imagem.

- **Explorar** — 222 termos em 17 categorias:
  - Linguagem de vídeo (prompts para modelos de vídeo): planos, ângulos, movimentos, lentes, luz, composição, tempo, 12 princípios, estilos, cor, atmosfera, transições.
  - Animação em código (o que o Claude programa): curvas de easing, motion graphics, texto animado, microinterações de interface e técnicas (CSS transition/keyframes, Web Animations API, requestAnimationFrame, SVG, Canvas, Three.js, GSAP, Lottie, FLIP, scroll-driven, reduced motion, sprite sheet). Cada demo é HTML/CSS/JS real, e a ficha mostra o código e um modelo de pedido ao Claude.
- **Montar prompt** — escolha plano, ângulo, movimento, lente, luz, estilo etc.; o app monta o prompt em inglês na ordem recomendada, mostra uma prévia aproximada e sugere um prompt negativo.
- **Treinar** — quiz: identifique o termo pela animação ou pela definição.

As demos usam uma câmera virtual 2.5D com distância focal (mm) e abertura (f/N) físicas: profundidade de campo, compressão de teleobjetiva e dolly zoom saem da óptica, não de efeitos fixos.

## Rodar

Site estático, sem build. Abra `index.html` no navegador ou publique com GitHub Pages (Settings → Pages → Branch `main`, pasta `/root`).
