# Léxico do Animador

Guia interativo da linguagem técnica de câmera, animação e motion design, para escrever prompts melhores em modelos de vídeo e pedir animações em código ao Claude.

**Online:** https://erospgomes.github.io/animation/

## O que tem

- **Explorar:** 223 termos em 17 categorias.
  - **Linguagem de vídeo:** planos, ângulos, movimentos, lentes e foco, luz, composição, tempo, os 12 princípios, estilos, cor, atmosfera e transições. Cada termo é demonstrado num **mundo 3D em voxels renderizado em tempo real**.
  - **Animação em código:** easing, motion graphics, texto animado, microinterações e técnicas (CSS, Web Animations API, SVG, Canvas, FLIP, scroll-driven…). Cada demo é HTML/CSS/JS real, e a ficha mostra o código que roda e um modelo de pedido ao Claude.
- **Modo Filme:** cada categoria de vídeo vira um curta em que cada plano demonstra um termo. Sobre a imagem aparecem o termo, a legenda da ação, a linha do tempo e uma **ficha técnica** (plano, ângulo, câmera, lente em mm e f/N, luz, atmosfera, estilo, cor, animação, tempo, composição e transição). Cada camada pode ser ligada ou desligada.
- **Efeitos ligáveis:** profundidade de campo, névoa e partículas, cor e pós, sombras. Servem para comparar a mesma cena com e sem cada efeito.
- **Montar prompt:** escolha as camadas e o app monta o prompt em inglês, mostra a prévia em 3D e sugere um prompt negativo.
- **Treinar:** quiz para identificar o termo pela animação ou pela definição.

## Como funciona o 3D

- `js/world3d.js` usa Three.js r160 (embutido em `js/vendor`, licença MIT). Ele gera um mundo em voxels com oclusão ambiente por vértice, sol com sombras, céu, nuvens em blocos, água e cachoeira.
- O elenco é original e articulado: explorador, parceira, esqueleto arqueiro, rei goblin montado numa galinha gigante, slimes, vacas e galinhas.
- A câmera usa distância focal em mm (filme de 36 mm) e abertura f/N. O desfoque é calculado pelo círculo de confusão físico num shader de pós-produção, que também faz raios volumétricos, bloom, flare, grade de cor e os estilos (pixel art, cel shading, aquarela, noir…).
- `js/engine.js` controla os monitores, as transições e o modo filme. Também mantém um motor 2.5D antigo como reserva para quando não há WebGL2.
- `js/films.js` guarda os roteiros dos filmes e a ficha técnica, derivada da própria especificação de cada plano.

## Rodar localmente

O motor 3D é um módulo ES, que o navegador não carrega por `file://`. Sirva a pasta por HTTP:

```
python3 -m http.server 8000
```

Depois abra http://localhost:8000. No GitHub Pages: Settings → Pages → Branch `main`, pasta `/root`.
