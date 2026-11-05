'use strict';

/**
 * pdf.js rodando no servidor: desenha páginas em imagem e lê o texto com a
 * posição de cada trecho. Usa o @napi-rs/canvas (já vem com o pdfjs-dist).
 */

const fsp = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');
const config = require('../config');

let modulo = null;

function carregar() {
  if (!modulo) {
    const alvo = path.join(config.vendor.pdfjs, 'legacy', 'build', 'pdf.mjs');
    modulo = import(pathToFileURL(alvo).href);
  }
  return modulo;
}

const barra = (p) => `${p.replace(/\\/g, '/')}/`;

/**
 * Abre um PDF (caminho ou bytes). Lembre de chamar doc.destroy() no fim.
 * Com `analise`, o documento serve para desenharAnalise() (desenho sem o texto).
 */
async function abrir(origem, { senha, analise = false } = {}) {
  const pdfjs = await carregar();
  const dados = typeof origem === 'string' ? await fsp.readFile(origem) : origem;
  return pdfjs.getDocument({
    data: new Uint8Array(dados.buffer ? dados.buffer.slice(dados.byteOffset, dados.byteOffset + dados.byteLength) : dados),
    password: senha,
    verbosity: 0,
    isEvalSupported: false,
    standardFontDataUrl: barra(path.join(config.vendor.pdfjs, 'standard_fonts')),
    cMapUrl: barra(path.join(config.vendor.pdfjs, 'cmaps')),
    cMapPacked: true,
    ...(analise ? { CanvasFactory: FabricaEspia } : {}),
  }).promise;
}

const MAX_PIXELS = 36e6; // ~ A3 a 300 dpi; acima disso a escala cai

/**
 * Desenha uma página.
 * @param {*} doc     documento do pdf.js
 * @param {number} n  página (1-based)
 * @param {{dpi?:number, formato?:'jpeg'|'png', qualidade?:number, antes?:Function, depois?:Function}} op
 *   depois(ctx, vp): desenha por cima (tarjas)
 * @returns {Promise<{bytes:Buffer, largura:number, altura:number, escala:number, larguraPt:number, alturaPt:number}>}
 */
async function desenhar(doc, n, { dpi = 150, formato = 'jpeg', qualidade = 88, depois } = {}) {
  const pagina = await doc.getPage(n);
  try {
    const base = pagina.getViewport({ scale: 1 });
    let escala = dpi / 72;
    const px = base.width * base.height * escala * escala;
    if (px > MAX_PIXELS) escala *= Math.sqrt(MAX_PIXELS / px);
    const vp = pagina.getViewport({ scale: escala });
    const largura = Math.max(1, Math.round(vp.width));
    const altura = Math.max(1, Math.round(vp.height));
    const { canvas, context } = doc.canvasFactory.create(largura, altura);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, largura, altura);
    // modo padrão de anotações: campos de formulário e carimbos saem desenhados na imagem
    await pagina.render({ canvasContext: context, viewport: vp }).promise;
    if (depois) depois(context, vp, largura, altura);
    const bytes = formato === 'png'
      ? await canvas.encode('png')
      : await canvas.encode('jpeg', qualidade);
    doc.canvasFactory.destroy({ canvas, context });
    return { bytes: Buffer.from(bytes), largura, altura, escala, larguraPt: base.width, alturaPt: base.height };
  } finally {
    pagina.cleanup();
  }
}

/**
 * Trechos de texto da página, em coordenadas visuais (pontos, origem no
 * canto superior esquerdo da página como ela aparece).
 * @returns {Promise<{largura:number, altura:number, itens:{texto:string,x:number,y:number,l:number,a:number,fonte:string,tamanho:number,negrito:boolean,italico:boolean}[]}>}
 */
async function textoDaPagina(doc, n) {
  const pdfjs = await carregar();
  const pagina = await doc.getPage(n);
  try {
    const vp = pagina.getViewport({ scale: 1 });
    const conteudo = await pagina.getTextContent({ disableNormalization: false });
    const estilos = conteudo.styles || {};
    let nomesFontes = null;
    const nomesReais = {};
    const itens = [];
    for (const it of conteudo.items) {
      if (typeof it.str !== 'string' || !it.str.length) continue;
      const m = pdfjs.Util.transform(vp.transform, it.transform);
      const tamanho = Math.hypot(m[2], m[3]) || Math.hypot(m[0], m[1]) || 10;
      // m[4], m[5] = início da linha de base, já na tela (y para baixo)
      const vertical = Math.abs(m[1]) > Math.abs(m[0]);
      const l = vertical ? it.height || tamanho : it.width * (vp.scale || 1);
      itens.push({
        texto: it.str,
        x: m[4],
        y: m[5] - tamanho * 0.82,
        base: m[5],
        l: Math.abs(l),
        a: tamanho,
        tamanho,
        fonte: it.fontName,
        familia: (estilos[it.fontName] || {}).fontFamily || '',
        vertical,
        // girado (marca d'água em diagonal, texto de cabeça para baixo): não é linha de texto comum
        inclinado: vertical || m[0] <= 0 || Math.abs(m[1]) > Math.abs(m[0]) * 0.08,
        fimDeLinha: Boolean(it.hasEOL),
      });
    }
    // nomes reais das fontes (para achar negrito/itálico) só existem depois de carregá-las
    if (itens.length) {
      try {
        await pagina.getOperatorList();
        nomesFontes = {};
        for (const it of itens) {
          if (nomesFontes[it.fonte] !== undefined) continue;
          let nome = '';
          try {
            const f = pagina.commonObjs.get(it.fonte);
            nome = `${f.name || ''} ${f.loadedName || ''} ${f.bold ? 'bold' : ''} ${f.italic ? 'italic' : ''}`;
            nomesReais[it.fonte] = { nome: f.name || '', serif: Boolean(f.isSerifFont), mono: Boolean(f.isMonospace) };
          } catch (_) { /* fonte não carregada */ }
          nomesFontes[it.fonte] = nome;
        }
      } catch (_) { nomesFontes = null; }
    }
    for (const it of itens) {
      const nome = `${(nomesFontes && nomesFontes[it.fonte]) || ''} ${it.familia}`;
      const real = nomesReais[it.fonte] || {};
      it.nomeFonte = real.nome || '';
      it.serif = real.serif;
      it.mono = real.mono;
      it.negrito = /bold|black|heavy|semibold|demi|\bbd\b|-b\b|,b\b/i.test(nome);
      it.italico = /italic|oblique|\bit\b/i.test(nome);
    }
    return { largura: vp.width, altura: vp.height, itens };
  } finally {
    pagina.cleanup();
  }
}

/* ============================================================
   DESENHO PARA ANÁLISE (PDF -> Word/PowerPoint)
   Desenha a página escondendo as letras que vão virar texto editável e
   anota o que foi desenhado: formas (linhas de tabela, sublinhados,
   fundos), imagens e a cor de cada letra.
   ============================================================ */

let napi = null;
function novoCanvas(largura, altura) {
  if (!napi) napi = require('@napi-rs/canvas');
  return napi.createCanvas(largura, altura);
}

/**
 * Letra em pé (sem giro). As giradas continuam no desenho, como imagem.
 * No espaço da letra o "para cima" é +y; em pé, ele aponta para cima na tela (d < 0).
 */
function emPe(t) {
  return t.a > 0 && t.d < 0 && Math.abs(t.b) <= t.a * 0.08 && Math.abs(t.c) <= -t.d * 0.35;
}

/**
 * Função (x, y) em pixels -> índice do trecho de texto naquela posição, ou -1.
 * x, y = origem da letra (início da linha de base).
 */
function localizadorDeTexto(itens, escala) {
  const lista = [];
  const caixas = [];
  itens.forEach((it, idx) => {
    if (it.inclinado || !it.texto.trim()) return;
    // valor de campo de formulário: vale qualquer letra dentro do retângulo do campo
    if (it.caixa) { caixas.push({ idx, x0: it.caixa.x0 * escala, x1: it.caixa.x1 * escala, y0: it.caixa.y0 * escala, y1: it.caixa.y1 * escala }); return; }
    lista.push({
      idx,
      x0: (it.x - 1) * escala,
      x1: (it.x + it.l + 1) * escala,
      y: it.base * escala,
      tol: Math.max(1.5, it.tamanho * 0.35) * escala,
    });
  });
  if (!lista.length && !caixas.length) return null;
  lista.sort((a, b) => a.y - b.y);
  const ys = lista.map((i) => i.y);
  const janela = lista.length ? Math.max(...lista.map((i) => i.tol)) : 0;
  return (x, y) => {
    for (const c of caixas) if (x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) return c.idx;
    let lo = 0;
    let hi = lista.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (ys[m] < y - janela) lo = m + 1; else hi = m;
    }
    // vizinhos se encostam: fica com o trecho que começa mais perto (à esquerda) da letra
    let antes = -1;
    let inicioAntes = -Infinity;
    let depois = -1;
    let inicioDepois = Infinity;
    for (let k = lo; k < lista.length && ys[k] <= y + janela; k += 1) {
      const it = lista[k];
      if (Math.abs(it.y - y) > it.tol || x < it.x0 || x > it.x1) continue;
      const ini = it.x0 + escala; // início real do trecho (x0 tem 1 pt de folga)
      if (ini <= x + escala * 0.5) { if (ini > inicioAntes) { antes = it.idx; inicioAntes = ini; } } else if (ini < inicioDepois) { depois = it.idx; inicioDepois = ini; }
    }
    return antes >= 0 ? antes : depois;
  };
}

/**
 * Envolve o contexto do canvas. `modo` = { semTexto, achar, registro }:
 * achar(x, y) diz se a letra pertence a um trecho de texto (e qual);
 * registro (opcional) recebe formas, imagens e letras.
 * @param {boolean} principal  só o canvas da página anota formas e imagens
 *   (nos canvases auxiliares de transparência as coordenadas são outras)
 */
function espiar(ctx, modo, principal) {
  let subcaminhos = [];
  let atual = null;
  let curvo = false;
  // O canvas devolve o último valor atribuído mesmo depois de restore();
  // por isso a cor, a transparência e a espessura são acompanhadas aqui.
  const VIGIADOS = ['fillStyle', 'strokeStyle', 'globalAlpha', 'lineWidth'];
  let estado = Object.fromEntries(VIGIADOS.map((k) => [k, ctx[k]]));
  const pilha = [];
  const reg = () => (principal ? modo.registro : null);
  const ponto = (t, x, y) => [t.a * x + t.c * y + t.e, t.b * x + t.d * y + t.f];
  const novo = (p) => { atual = [p]; subcaminhos.push(atual); };

  const letra = (alvo, metodo, args) => {
    const t = alvo.getTransform();
    const reta = emPe(t);
    const idx = reta && modo.achar ? modo.achar(t.e, t.f) : -1;
    if (modo.registro && idx >= 0) {
      modo.registro.letras.push({ idx, cor: metodo === 'fill' ? estado.fillStyle : estado.strokeStyle, alfa: estado.globalAlpha, x: t.e, y: t.f, tam: -t.d });
    }
    if (modo.semTexto && idx >= 0) return undefined;
    return alvo[metodo](...args);
  };

  const forma = (alvo, tipo) => {
    const r = reg();
    if (!r || !subcaminhos.length) return;
    const t = alvo.getTransform();
    r.formas.push({
      tipo,
      sub: subcaminhos,
      curvo,
      cor: tipo === 'fill' ? estado.fillStyle : estado.strokeStyle,
      alfa: estado.globalAlpha,
      largura: tipo === 'stroke' ? estado.lineWidth * Math.sqrt(Math.abs(t.a * t.d - t.b * t.c)) : 0,
    });
  };

  return new Proxy(ctx, {
    get(alvo, prop) {
      switch (prop) {
        case 'save':
          return () => { pilha.push({ ...estado }); alvo.save(); };
        case 'restore':
          return () => { if (pilha.length) estado = pilha.pop(); alvo.restore(); };
        case 'beginPath':
          return () => { subcaminhos = []; atual = null; curvo = false; alvo.beginPath(); };
        case 'moveTo':
          return (x, y) => { if (reg()) novo(ponto(alvo.getTransform(), x, y)); alvo.moveTo(x, y); };
        case 'lineTo':
          return (x, y) => {
            if (reg()) { const p = ponto(alvo.getTransform(), x, y); if (atual) atual.push(p); else novo(p); }
            alvo.lineTo(x, y);
          };
        case 'bezierCurveTo':
          return (...a) => {
            if (reg()) {
              const t = alvo.getTransform();
              curvo = true;
              const pts = [ponto(t, a[0], a[1]), ponto(t, a[2], a[3]), ponto(t, a[4], a[5])];
              if (!atual) novo(pts[0]);
              atual.push(...pts);
            }
            alvo.bezierCurveTo(...a);
          };
        case 'quadraticCurveTo':
          return (...a) => {
            if (reg()) {
              const t = alvo.getTransform();
              curvo = true;
              const pts = [ponto(t, a[0], a[1]), ponto(t, a[2], a[3])];
              if (!atual) novo(pts[0]);
              atual.push(...pts);
            }
            alvo.quadraticCurveTo(...a);
          };
        case 'rect':
          return (x, y, w, h) => {
            if (reg()) {
              const t = alvo.getTransform();
              novo(ponto(t, x, y));
              atual.push(ponto(t, x + w, y), ponto(t, x + w, y + h), ponto(t, x, y + h));
              atual.fechado = true;
              atual = null;
            }
            alvo.rect(x, y, w, h);
          };
        case 'closePath':
          return () => { if (atual) { atual.fechado = true; atual = null; } alvo.closePath(); };
        case 'fill':
          return (...a) => {
            if (a[0] && typeof a[0] === 'object') return letra(alvo, 'fill', a);
            forma(alvo, 'fill');
            return alvo.fill(...a);
          };
        case 'stroke':
          return (...a) => {
            if (a[0] && typeof a[0] === 'object') return letra(alvo, 'stroke', a);
            forma(alvo, 'stroke');
            return alvo.stroke(...a);
          };
        case 'fillRect':
          return (x, y, w, h) => {
            const r = reg();
            if (r) {
              const t = alvo.getTransform();
              const s = [ponto(t, x, y), ponto(t, x + w, y), ponto(t, x + w, y + h), ponto(t, x, y + h)];
              s.fechado = true;
              r.formas.push({ tipo: 'fill', sub: [s], curvo: false, cor: estado.fillStyle, alfa: estado.globalAlpha, largura: 0 });
            }
            return alvo.fillRect(x, y, w, h);
          };
        case 'fillText':
        case 'strokeText':
          return (...a) => (modo.semTexto ? undefined : alvo[prop](...a));
        case 'drawImage':
          return (img, ...a) => {
            const r = reg();
            if (r && img) {
              const t = alvo.getTransform();
              let dx; let dy; let dw; let dh;
              if (a.length >= 8) [, , , , dx, dy, dw, dh] = a;
              else if (a.length >= 4) [dx, dy, dw, dh] = a;
              else { [dx, dy] = a; dw = img.width; dh = img.height; }
              const c = [ponto(t, dx, dy), ponto(t, dx + dw, dy), ponto(t, dx, dy + dh), ponto(t, dx + dw, dy + dh)];
              r.imagens.push({
                x0: Math.min(...c.map((p) => p[0])),
                y0: Math.min(...c.map((p) => p[1])),
                x1: Math.max(...c.map((p) => p[0])),
                y1: Math.max(...c.map((p) => p[1])),
                px: img.width || 0,
                py: img.height || 0,
              });
            }
            return alvo.drawImage(img, ...a);
          };
        default:
          break;
      }
      const v = alvo[prop];
      return typeof v === 'function' ? v.bind(alvo) : v;
    },
    set(alvo, prop, valor) {
      alvo[prop] = valor;
      if (VIGIADOS.includes(prop)) estado[prop] = valor;
      return true;
    },
  });
}

/** Fábrica de canvas do pdf.js que esconde o texto também nos canvases auxiliares (grupos, máscaras). */
class FabricaEspia {
  constructor() {
    this.modo = { semTexto: false, achar: null, registro: null };
  }

  create(largura, altura) {
    if (largura <= 0 || altura <= 0) throw new Error('Invalid canvas size');
    const canvas = novoCanvas(largura, altura);
    return { canvas, context: espiar(canvas.getContext('2d'), this.modo, false) };
  }

  reset(cc, largura, altura) {
    cc.canvas.width = largura;
    cc.canvas.height = altura;
  }

  destroy(cc) {
    if (cc.canvas) { cc.canvas.width = 0; cc.canvas.height = 0; }
    cc.canvas = null;
    cc.context = null;
  }
}

/**
 * Desenha a página para a conversão em Word/PowerPoint (documento aberto com { analise: true }).
 * @param {{dpi?:number, semTexto?:boolean, itens?:any[]}} op
 *   itens: trechos de textoDaPagina(); com semTexto, as letras deles não são desenhadas
 * @returns {Promise<{largura:number, altura:number, escala:number, larguraPt:number, alturaPt:number,
 *   rgba:Buffer, registro:{formas:any[], imagens:any[], letras:{idx:number, cor:any, alfa:number, x:number, y:number, tam:number}[]}}>}
 *   (letras: origem e tamanho em pixels)
 */
async function desenharAnalise(doc, n, { dpi = 200, semTexto = true, itens = [] } = {}) {
  const pagina = await doc.getPage(n);
  try {
    const base = pagina.getViewport({ scale: 1 });
    let escala = dpi / 72;
    const px = base.width * base.height * escala * escala;
    if (px > MAX_PIXELS) escala *= Math.sqrt(MAX_PIXELS / px);
    const vp = pagina.getViewport({ scale: escala });
    const largura = Math.max(1, Math.round(vp.width));
    const altura = Math.max(1, Math.round(vp.height));
    const canvas = novoCanvas(largura, altura);
    const real = canvas.getContext('2d');
    real.fillStyle = '#ffffff';
    real.fillRect(0, 0, largura, altura);
    const registro = { formas: [], imagens: [], letras: [] };
    const fabrica = doc.canvasFactory;
    const modo = fabrica && fabrica.modo ? fabrica.modo : { semTexto: false, achar: null, registro: null };
    Object.assign(modo, { semTexto, achar: localizadorDeTexto(itens, escala), registro });
    try {
      await pagina.render({ canvasContext: espiar(real, modo, true), viewport: vp }).promise;
    } finally {
      Object.assign(modo, { semTexto: false, achar: null, registro: null });
    }
    const dados = real.getImageData(0, 0, largura, altura).data;
    const rgba = Buffer.from(dados.buffer, dados.byteOffset, dados.byteLength);
    return { largura, altura, escala, larguraPt: base.width, alturaPt: base.height, rgba, registro };
  } finally {
    pagina.cleanup();
  }
}

module.exports = { carregar, abrir, desenhar, desenharAnalise, textoDaPagina };
