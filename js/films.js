// Filmes por categoria: cada plano demonstra um termo da categoria dentro de uma pequena história.
// shot = [id do termo, legenda, overrides da spec (opcional), duração em s (opcional)]
// A ficha técnica sobreposta é derivada da própria spec por describeShot(), então nunca contradiz a cena.
(function () {
'use strict';
const F = {};
F.plano = { title: 'Planos · A chegada', shots: [
  ['extreme-wide-shot', 'Um ponto no vale: o explorador chega.', { act: 'walk' }, 5],
  ['wide-shot', 'Ele avista a casa no fim da trilha.', { act: 'turn' }],
  ['full-shot', 'Para no meio do campo.', { act: 'idle' }],
  ['cowboy-shot', 'Mãos na cintura: chegou.', { act: 'hips' }],
  ['medium-shot', 'Olha para o céu.', { act: 'lookup' }],
  ['medium-close-up', 'Respira fundo.', { act: 'idle' }],
  ['close-up', 'Algo chama sua atenção.', { act: 'turn' }],
  ['extreme-close-up', 'Os olhos procuram.', { act: 'idle' }, 3.5],
  ['insert-shot', 'Uma flor vermelha aos seus pés.'],
  ['over-the-shoulder-shot', 'A parceira de viagem chega.', { act: 'talk' }],
  ['two-shot', 'Os dois, lado a lado.', { act: 'wave' }],
  ['pov-shot', 'Juntos, seguem para a casa.', {}, 5]
] };
F.angulo = { title: 'Ângulos · O rei e o arqueiro', shots: [
  ['eye-level-shot', 'O explorador encara o vale.', { act: 'idle' }],
  ['low-angle', 'O rei passa montado, imponente.', { subject: 'king' }, 5],
  ['high-angle', 'Visto de cima, o explorador parece pequeno.', { act: 'lookup' }],
  ['overhead-shot', 'De cima, tudo vira mapa.', { act: 'lookup' }],
  ['worm-s-eye-view', 'Do chão, o rei parece um gigante.', { subject: 'king' }],
  ['dutch-angle', 'O esqueleto mira. Algo está errado.', { subject: 'skeleton' }, 5],
  ['aerial-shot', 'Lá de cima: o vale inteiro em jogo.', {}, 5]
] };
F.movimento = { title: 'Movimentos · A trilha', shots: [
  ['static-shot', 'A câmera parada só observa.', { act: 'idle' }],
  ['pan', 'O olhar percorre o vale.', {}, 5],
  ['tilt', 'Das botas até o céu.', { act: 'lookup' }, 5],
  ['dolly-in', 'A câmera se aproxima: atenção.', {}, 5],
  ['dolly-out', 'E se afasta: solidão.', {}, 5],
  ['truck', 'O campo desliza ao lado dele.', {}, 5],
  ['pedestal', 'A câmera sobe sem inclinar.', {}, 5],
  ['crane-shot', 'A grua revela o vale.', {}, 6],
  ['zoom-in', 'Zoom: a lente aproxima, a câmera fica.', {}, 5],
  ['zoom-out', 'Zoom out: o contexto aparece.', {}, 5],
  ['dolly-zoom', 'O mundo estica: vertigem.', { act: 'scared' }, 5],
  ['orbit', 'Ao redor do herói.', { act: 'hips' }, 6],
  ['tracking-shot', 'A caminhada continua.', { act: 'walk' }, 5],
  ['handheld', 'Nervoso, de perto.', { act: 'scared' }],
  ['steadicam', 'Flutuando até ele.', {}, 5],
  ['fpv-drone-shot', 'Mergulho do céu até o explorador.', {}, 5],
  ['drone-flyover', 'Sobrevoo da vila.', {}, 6],
  ['whip-pan', 'Chicote: a casa!', {}, 3.2],
  ['crash-zoom', 'Surpresa!', { act: 'scared' }, 3.5],
  ['push-in', 'Ele decide.', { act: 'idle' }, 5],
  ['pull-back-reveal', 'O mundo é maior do que parecia.', {}, 6],
  ['barrel-roll', 'Tudo gira.', {}, 4]
] };
F.lente = { title: 'Lentes & foco · O mesmo rosto, outra lente', shots: [
  ['14mm-ultra-wide-lens', '14 mm: perto e distorcido; o fundo encolhe.'],
  ['24mm-wide-lens', '24 mm: o cenário ainda conta.'],
  ['35mm-lens', '35 mm: o olhar do narrador.'],
  ['50mm-lens', '50 mm: perspectiva natural.'],
  ['85mm-portrait-lens', '85 mm: retrato, fundo suave.'],
  ['200mm-telephoto-lens', '200 mm: as montanhas colam nele.', {}, 5],
  ['macro-lens', 'Macro: a flor vira paisagem.'],
  ['fisheye-lens', 'Olho de peixe: o mundo curva.'],
  ['anamorphic-lens', 'Anamórfica: tela larga e flare azul.', {}, 5],
  ['shallow-depth-of-field', 'Foco raso: só ele importa.'],
  ['deep-focus', 'Foco profundo: tudo nítido.'],
  ['bokeh', 'Bokeh: as luzes viram discos.'],
  ['rack-focus', 'O foco salta do galho para ele.', {}, 6],
  ['tilt-shift', 'Tilt-shift: o vale vira maquete.'],
  ['lens-flare', 'O sol entra na lente.', {}, 5]
] };
F.luz = { tr: 'dissolve', title: 'Luz · Um dia inteiro', shots: [
  ['high-key-lighting', 'Manhã clara, quase sem sombras.'],
  ['hard-light', 'Meio-dia: sombras nítidas.'],
  ['soft-light', 'O céu fecha: luz macia.'],
  ['key-light', 'A luz principal procura o rosto.', {}, 5],
  ['fill-light', 'O preenchimento abre as sombras.', {}, 5],
  ['rim-light', 'O contorno separa do fundo.', {}, 5],
  ['three-point-lighting', 'O esquema clássico, passo a passo.', {}, 7.5],
  ['volumetric-lighting', 'Raios de sol entre as árvores.', {}, 5],
  ['golden-hour', 'Fim de tarde dourado.'],
  ['silhouette', 'Contra o sol, só a forma.'],
  ['blue-hour', 'A hora azul acende as janelas.'],
  ['practical-lights', 'A noite: postes e lanternas.'],
  ['neon-lighting', 'Neon na vila.'],
  ['low-key-lighting', 'Um segredo no escuro.'],
  ['chiaroscuro', 'Metade luz, metade sombra.']
] };
F.composicao = { title: 'Composição · Onde olhar', shots: [
  ['rule-of-thirds', 'Ele no terço; o campo respira.'],
  ['symmetrical-composition', 'Simetria: a porta, o centro, a ordem.'],
  ['leading-lines', 'A trilha leva o olhar até ele.'],
  ['negative-space', 'Pequeno diante do céu.'],
  ['frame-within-a-frame', 'Emoldurado pelas folhas.'],
  ['depth-layers', 'Primeiro plano, meio e fundo.', {}, 5],
  ['parallax', 'O que está perto passa mais rápido.', {}, 5],
  ['lead-room', 'Espaço à frente de quem anda.', { act: 'walk' }, 5],
  ['vertical-9-16', 'Vertical: feito para o celular.'],
  ['widescreen-2-39-1', 'Tela larga: épico.']
] };
F.tempo = { title: 'Tempo & ritmo · O salto', shots: [
  ['24-fps', '24 quadros por segundo: cadência de cinema.', { shot: 'fs', move: 'tracking', act: 'walk', fps: 24 }],
  ['animated-on-twos', 'Em twos: 12 desenhos por segundo.', { shot: 'fs', move: 'tracking', act: 'walk', fps: 12 }],
  ['keyframes-in-betweens', 'Poses-chave ligadas por intervalos.', { shot: 'fs', act: 'poses' }, 5.5],
  ['smear-frame', 'Rápido demais: o movimento borra.', { shot: 'ms', act: 'wave', mb: .6 }],
  ['seamless-loop', 'Um ciclo de caminhada que nunca emenda.', { shot: 'fs', move: 'tracking', act: 'walk' }],
  ['moving-hold', 'Parado, mas vivo: respira e pisca.', { shot: 'mcu', act: 'idle' }],
  ['slow-motion', 'Câmera lenta: cada folha conta.', {}, 5],
  ['speed-ramp', 'Normal, lento, normal.', {}, 6],
  ['freeze-frame', 'Congela no ar.', {}, 5],
  ['reverse-motion', 'E volta no tempo.', {}, 5],
  ['motion-blur', 'O rastro da velocidade.', {}, 5],
  ['time-lapse', 'O dia passa em segundos.', {}, 6]
] };
F.principios = { title: '12 princípios · O vale ganha vida', shots: [
  ['squash-and-stretch', 'O slime comprime e estica.', { shot: 'fs', subject: 'slime' }],
  ['anticipation', 'Agacha antes de pular.', { shot: 'fs', act: 'hop' }, 4.4],
  ['staging', 'Um foco por vez.', { shot: 'fs', light: 'lowkey', act: 'idle' }],
  ['pose-to-pose', 'Pose, pose, pose.', { shot: 'fs', act: 'poses' }, 5.5],
  ['follow-through', 'A galinha para; a capa continua.', { shot: 'fs', subject: 'king', kingAct: 'stopgo' }, 5],
  ['slow-in-and-slow-out', 'Acelera e freia suave.', { shot: 'fs', lens: { f: 24 }, act: 'stopstart' }, 6],
  ['arcs', 'A flecha voa em arco.', { shot: 'fs', subject: 'arrow', az: -29, mb: .45 }, 5],
  ['secondary-action', 'Anda e assobia.', { shot: 'fs', move: 'tracking', act: 'whistle' }],
  ['timing', 'Pequeno e rápido; grande e lento.', { shot: 'fs', subject: 'slime' }],
  ['exaggeration', 'Mais squash, mais altura.', { shot: 'fs', subject: 'slime', exag: true }],
  ['solid-drawing', 'Volume consistente de todos os lados.', { shot: 'fs', subject: 'king', move: 'orbit' }, 6],
  ['appeal', 'Carisma: forma clara e expressão.', { shot: 'mcu', act: 'wave' }]
] };
F.estilo = { title: 'Estilos · A mesma cena, 12 técnicas', shots: [
  ['voxel-art', 'Voxel: o mundo em blocos.', {}, 5],
  ['3d-cgi-animation', 'Animação 3D de estúdio.'],
  ['hand-drawn-2d-animation', 'Desenhado à mão, com linha viva.'],
  ['anime-style', 'Anime: contorno e céu saturado.'],
  ['cel-shaded', 'Cel shading: 3D com cara de 2D.'],
  ['stop-motion', 'Stop-motion a 12 quadros.'],
  ['claymation', 'Massinha.'],
  ['paper-cutout', 'Recorte de papel.'],
  ['pixel-art', 'Pixel art.'],
  ['watercolor', 'Aquarela.'],
  ['film-noir', 'Noir.'],
  ['isometric', 'Isométrico: diorama.', {}, 5]
] };
F.cor = { tr: 'dissolve', title: 'Cor & acabamento · Uma cena, muitos humores', shots: [
  ['color-grading', 'A grade muda a emoção.', {}, 7],
  ['teal-and-orange', 'Blockbuster.'],
  ['desaturated', 'Melancolia.'],
  ['black-and-white', 'Atemporal.'],
  ['vibrant-colors', 'Alegria.'],
  ['pastel-palette', 'Sonho.'],
  ['warm-tones', 'Aconchego.'],
  ['cool-tones', 'Frio.'],
  ['film-grain', 'Grão de película.'],
  ['vignette', 'Vinheta: o olhar vai ao centro.'],
  ['halation', 'As luzes vazam.'],
  ['chromatic-aberration', 'Franjas de cor nas bordas.'],
  ['35mm-film-look', 'Tudo junto: película 35 mm.']
] };
F.atmos = { tr: 'dissolve', title: 'Atmosfera · O tempo vira', shots: [
  ['atmospheric-perspective', 'Quanto mais longe, mais azul.'],
  ['fog', 'A névoa engole as árvores.', {}, 5],
  ['rain', 'Chove.', {}, 5],
  ['snowfall', 'E neva.', {}, 5],
  ['floating-dust', 'Poeira dançando na luz.', {}, 5]
] };
F.edicao = { title: 'Transições · Como um plano vira outro', shots: [
  ['hard-cut', 'Corte seco: troca instantânea.', {}, 5],
  ['match-cut', 'O sol vira lua na mesma posição.', {}, 5],
  ['jump-cut', 'O tempo pula dentro do mesmo plano.', {}, 5],
  ['cross-dissolve', 'Uma imagem se funde na outra.', {}, 5],
  ['fade-to-black', 'Tudo escurece e volta.', {}, 5],
  ['wipe', 'Uma linha varre a tela.', {}, 5],
  ['iris-transition', 'O círculo fecha: fim de desenho animado.', {}, 5],
  ['whip-pan-transition', 'O chicote esconde o corte.', {}, 5],
  ['smash-cut', 'Do caos ao silêncio.', {}, 5],
  ['morph-transition', 'Uma imagem vira a outra.', {}, 5],
  ['long-take', 'Sem cortes: tudo em um plano.', {}, 7],
  ['montage', 'Montagem: o resumo da jornada.', {}, 5]
] };

// ─── Ficha técnica derivada da spec
const SHOT = { xws: 'Grande plano geral', ws: 'Plano geral', fs: 'Plano inteiro', mws: 'Plano americano', ms: 'Plano médio', mcu: 'Plano próximo', cu: 'Close-up', ecu: 'Plano detalhe', ins: 'Inserte', ots: 'Por cima do ombro', two: 'Two-shot', pov: 'Subjetivo (POV)', macro: 'Macro' };
const ANG = { eye: 'Altura dos olhos', low: 'Contra-plongée', high: 'Plongée', overhead: 'Zenital', worm: 'Contra-plongée extrema', dutch: 'Holandês (dutch)', aerial: 'Aéreo' };
const MOVE = { static: 'Estática', pan: 'Pan', tilt: 'Tilt', dollyIn: 'Dolly in', dollyOut: 'Dolly out', truck: 'Travelling lateral', pedestal: 'Pedestal', crane: 'Grua', zoomIn: 'Zoom in', zoomOut: 'Zoom out', dollyZoom: 'Dolly zoom', orbit: 'Órbita', tracking: 'Tracking', handheld: 'Câmera na mão', steadicam: 'Steadicam', fpv: 'Drone FPV', drone: 'Sobrevoo de drone', whip: 'Whip pan', crash: 'Crash zoom', pushIn: 'Push-in lento', reveal: 'Pull-back reveal', roll: 'Barrel roll', flare: 'Pan lento' };
const LIGHT = { day: 'Luz do dia', highkey: 'High-key', lowkey: 'Low-key', golden: 'Hora dourada', blue: 'Hora azul', night: 'Noite', silhouette: 'Contraluz (silhueta)', rim: 'Rim light', volumetric: 'Volumétrica', chiaro: 'Claro-escuro', hard: 'Luz dura', soft: 'Luz suave', practical: 'Prática (postes, janelas)', neon: 'Neon', key: 'Key light', fill: 'Fill light', three: 'Três pontos' };
const FX = { fog: 'Névoa', haze: 'Perspectiva atmosférica', rain: 'Chuva', snow: 'Neve', dust: 'Poeira no ar', leaves: 'Folhas caindo' };
const LOOK = { grain: 'grão', vignette: 'vinheta', halation: 'halação', ca: 'aberração cromática', flare: 'flare', anaflare: 'flare anamórfico', letterbox: '2.39:1', fisheye: 'olho de peixe', tiltshift: 'tilt-shift' };
const GRADE = { teal: 'Teal & orange', desat: 'Dessaturada', bw: 'Preto e branco', vibrant: 'Vibrante', pastel: 'Pastel', warm: 'Quente', cool: 'Fria', film: 'Película 35 mm', cycle: 'Grades alternando' };
const STYLE = { voxel: 'Voxel', hand: '2D à mão', anime: 'Anime', cgi: '3D de estúdio', stop: 'Stop-motion', clay: 'Massinha', cutout: 'Recorte de papel', pixel: 'Pixel art', cel: 'Cel shading', water: 'Aquarela', noir: 'Noir', iso: 'Isométrico' };
const ACT = { idle: 'Moving hold: respira, olha, pisca', walk: 'Ciclo de caminhada + follow-through no cachecol', hop: 'Antecipação → salto → squash na aterrissagem', wave: 'Aceno (ação secundária)', lookup: 'Virada de cabeça com ease', point: 'Pose: apontar', hips: 'Pose: mãos na cintura', celebrate: 'Comemoração em loop', talk: 'Gestos + aceno de cabeça', turn: 'Olhar de lado com ease', scared: 'Susto (exagero)', poses: 'Pose a pose: chaves + intervalos', stopstart: 'Slow in / slow out + follow-through', whistle: 'Caminhada + assobio (ação secundária)' };
const SUBJ = { king: 'Rei montado: cavalgada + capa em follow-through', skeleton: 'Arqueiro: mira, puxa, solta; flecha em arco', arrow: 'Flecha em trajetória balística (arco)', slime: 'Slime: squash & stretch a cada salto' };
const TIME = { slowmo: 'Câmera lenta 0,22×', timelapse: 'Time-lapse 12×', ramp: 'Speed ramp', freeze: 'Freeze frame', reverse: 'Reverso' };
const TRANS = { cut: 'Corte seco', match: 'Match cut', smash: 'Smash cut', jump: 'Jump cut', dissolve: 'Fusão', fade: 'Fade para preto', wipe: 'Cortina', iris: 'Íris', whip: 'Whip pan', morph: 'Morph', long: 'Plano-sequência', montage: 'Montagem' };
const COMP = { thirds: 'Regra dos terços', sym: 'Simetria', path: 'Linhas guia (trilha)', neg: 'Espaço negativo', fgframe: 'Moldura em primeiro plano', layers: 'Camadas de profundidade', lead: 'Espaço de direção' };
const LESSON_ROW = { plano: 'plano', angulo: 'angulo', movimento: 'camera', lente: 'lente', luz: 'luz', composicao: 'comp', tempo: 'tempo', principios: 'anim', estilo: 'estilo', cor: 'cor', atmos: 'atmos', edicao: 'trans' };
const ROWS = [['plano', 'Plano'], ['angulo', 'Ângulo'], ['camera', 'Câmera'], ['lente', 'Lente'], ['luz', 'Luz'], ['atmos', 'Atmosfera'], ['estilo', 'Estilo'], ['cor', 'Cor'], ['anim', 'Animação'], ['tempo', 'Tempo'], ['comp', 'Composição'], ['trans', 'Transição']];

function describeShot(S, info, opts) {
  opts = opts || {};
  const fx = S.fx || [], v = {};
  if (S.trans) { v.trans = TRANS[S.trans] || S.trans; v.plano = S.trans === 'montage' ? 'Vários' : S.trans === 'long' ? 'Do geral ao próximo' : 'Plano A → plano B'; }
  else {
    v.plano = SHOT[S.shot || 'fs'] || '—';
    if (S.subject && S.subject !== 'explorer') v.plano += ' · ' + ({ king: 'o rei', skeleton: 'o arqueiro', slime: 'o slime', arrow: 'a flecha' }[S.subject] || S.subject);
    v.angulo = S.style === 'iso' ? 'Isométrico (35°)' : ANG[S.angle || 'eye'];
    v.camera = typeof S.move === 'function' ? 'Personalizado' : MOVE[S.move || 'static'];
    if (info) { const N = info.N, f = Math.round(info.f); v.lente = `${f} mm · f/${N >= 10 ? Math.round(N) : String(+N.toFixed(1)).replace('.', ',')}` + (S.rack ? ' · troca de foco' : N <= 2.8 ? ' · foco raso' : N >= 11 ? ' · foco profundo' : ''); }
    v.luz = LIGHT[S.light || 'day'] || 'Luz do dia';
    if (S.time === 'timelapse') v.luz = 'Ciclo dia → noite';
    const at = fx.filter(k => FX[k]).map(k => FX[k]); if (S.light === 'volumetric') at.unshift('Raios volumétricos');
    v.atmos = at.length ? at.join(' · ') : 'Ar limpo';
    v.estilo = STYLE[S.style || 'voxel'] || 'Voxel';
    const look = fx.filter(k => LOOK[k]).map(k => LOOK[k]);
    v.cor = [GRADE[S.grade] || 'Neutra'].concat(look).join(' · ');
    v.anim = S.subject && SUBJ[S.subject] ? SUBJ[S.subject] : (ACT[S.act || 'idle'] || S.act);
    if (S.exag) v.anim = 'Slime com squash & stretch exagerado';
    const tparts = [TIME[S.time] || (S.fps === 12 || ['stop', 'clay', 'pixel', 'hand', 'cutout'].includes(S.style) ? 'Em twos (12 fps)' : '24 fps')];
    if (S.mb) tparts.push('motion blur'); v.tempo = tparts.join(' · ');
    const comp = S.comp || {}, cp = Object.keys(comp).filter(k => COMP[k]).map(k => COMP[k]);
    if (comp.aspect === '9:16') cp.push('Vertical 9:16'); if (fx.includes('letterbox')) cp.push('Tela larga 2.39:1');
    v.comp = cp.length ? cp.join(' · ') : 'Sujeito centralizado';
  }
  if (opts.next) v.trans = (opts.next === 'cut' ? 'Corte seco' : TRANS[opts.next]) + ' para o próximo plano';
  const lesson = LESSON_ROW[opts.cat];
  return ROWS.filter(([k]) => v[k]).map(([k, label]) => ({ k, label, value: v[k], lesson: k === lesson }));
}

window.FILMS = F;
window.describeShot = describeShot;
window.FICHA_ROWS = ROWS;
})();
