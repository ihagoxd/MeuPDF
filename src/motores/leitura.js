'use strict';

/**
 * Leitura completa da página para levar ao Word e ao PowerPoint.
 *
 * O texto sai com fonte, tamanho, cor, negrito, itálico e sublinhado; as
 * tabelas com borda viram grade de células; e tudo que não é texto (fotos,
 * logos, desenhos, carimbos) é recortado do desenho da página feito SEM as
 * letras, no lugar exato. Assim uma imagem com transparência, um logo
 * vetorial ou uma foto girada saem iguais ao PDF.
 *
 * Página digitalizada: o texto vem do OCR (ou da camada de OCR que o PDF já
 * tem) e as letras da foto são apagadas, para sobrar só o que é figura.
 */

const sharp = require('sharp');

const pdfjs = require('./pdfjs');
const ocr = require('./ocr');

const DPI_FIGURAS = 220;

/* ============================================================
   FONTES E CORES
   ============================================================ */

const FONTES = {
  timesnewroman: 'Times New Roman', times: 'Times New Roman', timesroman: 'Times New Roman', tinos: 'Times New Roman',
  liberationserif: 'Times New Roman', nimbusroman: 'Times New Roman', nimbusromno9l: 'Times New Roman',
  arial: 'Arial', helvetica: 'Arial', liberationsans: 'Arial', arimo: 'Arial', nimbussans: 'Arial', nimbussanl: 'Arial',
  arialnarrow: 'Arial Narrow', arialblack: 'Arial Black', arialunicodems: 'Arial Unicode MS', arialmt: 'Arial',
  couriernew: 'Courier New', courier: 'Courier New', liberationmono: 'Courier New', cousine: 'Courier New', nimbusmono: 'Courier New',
  calibri: 'Calibri', calibrilight: 'Calibri Light', carlito: 'Calibri', cambria: 'Cambria', cambriamath: 'Cambria Math', caladea: 'Cambria',
  candara: 'Candara', consolas: 'Consolas', constantia: 'Constantia', corbel: 'Corbel',
  georgia: 'Georgia', garamond: 'Garamond', ebgaramond: 'Garamond', bookantiqua: 'Book Antiqua', bookmanoldstyle: 'Bookman Old Style',
  palatino: 'Palatino Linotype', palatinolinotype: 'Palatino Linotype', century: 'Century', centurygothic: 'Century Gothic',
  centuryschoolbook: 'Century Schoolbook', tahoma: 'Tahoma', verdana: 'Verdana', trebuchet: 'Trebuchet MS', trebuchetms: 'Trebuchet MS',
  segoeui: 'Segoe UI', segoeuilight: 'Segoe UI Light', segoeuisemibold: 'Segoe UI Semibold', segoeprint: 'Segoe Print', segoescript: 'Segoe Script',
  dejavusans: 'Verdana', dejavuserif: 'Georgia', dejavusansmono: 'Consolas', opensans: 'Segoe UI', roboto: 'Arial', lato: 'Calibri',
  aptos: 'Aptos', aptosdisplay: 'Aptos Display', aptosnarrow: 'Aptos Narrow', franklingothic: 'Franklin Gothic Book',
  franklingothicmedium: 'Franklin Gothic Medium', gillsans: 'Gill Sans MT', gillsansmt: 'Gill Sans MT', lucidasans: 'Lucida Sans',
  lucidasansunicode: 'Lucida Sans Unicode', lucidaconsole: 'Lucida Console', impact: 'Impact', comicsansms: 'Comic Sans MS',
  symbol: 'Symbol', wingdings: 'Wingdings', wingdings2: 'Wingdings 2', wingdings3: 'Wingdings 3', webdings: 'Webdings',
  bahnschrift: 'Bahnschrift', ebrima: 'Ebrima', gadugi: 'Gadugi', leelawadee: 'Leelawadee UI', malgungothic: 'Malgun Gothic',
  mangal: 'Mangal', microsoftsansserif: 'Microsoft Sans Serif', mssansserif: 'Microsoft Sans Serif', sylfaen: 'Sylfaen',
};

const ESTILOS_NO_NOME = /(bold|italic|oblique|regular|roman|semibold|semilight|demibold|demi|light|medium|heavy|black|book|condensed|cond|narrow|it|bd|bi|ps|mt|std|pro|lt)$/i;

/**
 * Nome da fonte no PDF -> fonte que o Word conhece.
 * "BCDFEE+TimesNewRomanPS-BoldMT" -> "Times New Roman"
 */
function fonteWord(nomePdf, { familia = '', serif = false, mono = false } = {}) {
  let n = String(nomePdf || '').replace(/^[A-Z]{6}\+/, '').trim();
  const generica = () => (mono || /mono/i.test(familia) ? 'Courier New' : serif || /^serif/i.test(familia) ? 'Times New Roman' : 'Arial');
  if (!n || /^(F\d+|T\d+|TT\d+|C\d+_\d+|Font\d*|CIDFont.*|g_d\d+_f\d+)$/i.test(n)) return generica();
  n = n.split(/[,-]/)[0].replace(/[_\s]+/g, '');
  const chave = n.toLowerCase();
  if (FONTES[chave]) return FONTES[chave];
  // tira sufixos de estilo, um por vez: "ArialNarrowBold" -> "ArialNarrow"
  let base = n;
  for (let i = 0; i < 4 && ESTILOS_NO_NOME.test(base) && base.length > 3; i += 1) {
    base = base.replace(ESTILOS_NO_NOME, '');
    if (FONTES[base.toLowerCase()]) return FONTES[base.toLowerCase()];
  }
  // nome desconhecido: "SourceSansPro" -> "Source Sans Pro"
  const legivel = base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim();
  return legivel.length >= 3 ? legivel : generica();
}

/** '#1f4e78' / 'rgb(..)' -> '1F4E78' (null para gradientes e padrões) */
function corHex(estilo) {
  if (typeof estilo !== 'string') return null;
  const s = estilo.trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return m[1].toUpperCase();
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  if (m) return `${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toUpperCase();
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
  if (m) return [m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)).toString(16).padStart(2, '0')).join('').toUpperCase();
  return null;
}

function rgbDe(hex) {
  const v = parseInt(hex, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function quaseBranco(hex) {
  return rgbDe(hex).every((c) => c >= 245);
}

// marcadores das fontes Symbol/Wingdings (área de uso privado) -> caractere comum
const MARCADORES = {
  '': '•', '': '▪', '': '➢', '': '❖', '': '✓', '': '□', '': '■',
  '': '❑', '': '◆', '': '➔', '': '⇨', '': '°', '': '-', '': '—',
};

function limparTexto(t) {
  return String(t).replace(/[-]/g, (c) => MARCADORES[c] || '•').replace(/ /g, ' ');
}

/* ============================================================
   FORMAS: linhas (bordas, sublinhados) e retângulos (fundos)
   ============================================================ */

/** Pontos de um subcaminho -> retângulo alinhado aos eixos, ou null. */
function retanguloDe(pts) {
  let p = pts;
  if (p.length === 5 && Math.abs(p[0][0] - p[4][0]) < 0.01 && Math.abs(p[0][1] - p[4][1]) < 0.01) p = p.slice(0, 4);
  if (p.length === 2) {
    const [a, b] = p;
    if (Math.abs(a[0] - b[0]) < 0.05 || Math.abs(a[1] - b[1]) < 0.05) {
      return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
    }
    return null;
  }
  if (p.length !== 4) return null;
  for (let i = 0; i < 4; i += 1) {
    const a = p[i];
    const b = p[(i + 1) % 4];
    if (Math.abs(a[0] - b[0]) > 0.05 && Math.abs(a[1] - b[1]) > 0.05) return null;
  }
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/**
 * Formas anotadas no desenho (pixels) -> linhas horizontais/verticais e
 * retângulos preenchidos, em pontos.
 */
function analisarFormas(formas, escala) {
  const horizontais = [];
  const verticais = [];
  const retangulos = [];
  for (const f of formas) {
    const cor = corHex(f.cor);
    if (!cor || f.alfa < 0.3 || quaseBranco(cor)) continue;
    for (const s of f.sub) {
      const pts = s.map(([x, y]) => [x / escala, y / escala]);
      if (f.tipo === 'fill') {
        const r = !f.curvo && retanguloDe(pts);
        if (!r) continue;
        const w = r.x1 - r.x0;
        const h = r.y1 - r.y0;
        if (h <= 2.5 && w > h) horizontais.push({ pos: (r.y0 + r.y1) / 2, a0: r.x0, a1: r.x1, esp: Math.max(h, 0.3), cor });
        else if (w <= 2.5 && h > w) verticais.push({ pos: (r.x0 + r.x1) / 2, a0: r.y0, a1: r.y1, esp: Math.max(w, 0.3), cor });
        else retangulos.push({ ...r, cor });
      } else if (!f.curvo) {
        const esp = Math.max(f.largura / escala, 0.3);
        if (esp > 4) continue;
        const n = pts.length;
        const pares = [];
        for (let i = 0; i + 1 < n; i += 1) pares.push([pts[i], pts[i + 1]]);
        if (s.fechado && n > 2) pares.push([pts[n - 1], pts[0]]);
        for (const [a, b] of pares) {
          if (Math.abs(a[1] - b[1]) < 0.3 && Math.abs(a[0] - b[0]) > 0.5) {
            horizontais.push({ pos: (a[1] + b[1]) / 2, a0: Math.min(a[0], b[0]), a1: Math.max(a[0], b[0]), esp, cor });
          } else if (Math.abs(a[0] - b[0]) < 0.3 && Math.abs(a[1] - b[1]) > 0.5) {
            verticais.push({ pos: (a[0] + b[0]) / 2, a0: Math.min(a[1], b[1]), a1: Math.max(a[1], b[1]), esp, cor });
          }
        }
      }
    }
  }
  return { horizontais: juntarSegmentos(horizontais), verticais: juntarSegmentos(verticais), retangulos };
}

/** Junta pedaços da mesma linha (o Word desenha cada borda de célula separada). */
function juntarSegmentos(lista) {
  const ordenada = lista.slice().sort((a, b) => a.pos - b.pos);
  const grupos = [];
  for (const s of ordenada) {
    const g = grupos[grupos.length - 1];
    if (g && s.pos - g.ultimo <= 1.2) { g.itens.push(s); g.ultimo = s.pos; } else grupos.push({ itens: [s], ultimo: s.pos });
  }
  const saida = [];
  for (const g of grupos) {
    const itens = g.itens.sort((a, b) => a.a0 - b.a0);
    let atual = null;
    for (const s of itens) {
      if (atual && s.a0 <= atual.a1 + 1.5) {
        atual.a1 = Math.max(atual.a1, s.a1);
        atual.esp = Math.max(atual.esp, s.esp);
        atual.soma += s.pos * (s.a1 - s.a0);
        atual.peso += s.a1 - s.a0;
      } else {
        atual = { ...s, soma: s.pos * (s.a1 - s.a0), peso: s.a1 - s.a0 };
        saida.push(atual);
      }
    }
  }
  for (const s of saida) {
    if (s.peso > 0) s.pos = s.soma / s.peso;
    delete s.soma;
    delete s.peso;
  }
  return saida;
}

/* ============================================================
   SUBLINHADO, TACHADO E REALCE
   ============================================================ */

function marcarSublinhados(itens, horizontais) {
  const usados = new Set();
  for (const s of horizontais) {
    if (s.esp > 2.2 || s.a1 - s.a0 < 2) continue;
    const comprimento = s.a1 - s.a0;
    for (const tipo of ['sublinhado', 'riscado']) {
      const alvo = itens.filter((it) => {
        const sobre = Math.min(it.x1, s.a1) - Math.max(it.x0, s.a0);
        if (sobre < Math.min(it.x1 - it.x0, comprimento) * 0.5) return false;
        const d = s.pos - it.base;
        return tipo === 'sublinhado'
          ? d >= -0.5 && d <= it.tamanho * 0.34 + 0.8
          : d <= -it.tamanho * 0.12 && d >= -it.tamanho * 0.5;
      });
      if (!alvo.length) continue;
      const ini = Math.min(...alvo.map((it) => it.x0));
      const fim = Math.max(...alvo.map((it) => it.x1));
      // a linha tem o tamanho do texto: uma borda de tabela é bem mais comprida
      if (fim - ini < comprimento * 0.7) continue;
      for (const it of alvo) it[tipo] = true;
      usados.add(s);
      break;
    }
  }
  return horizontais.filter((s) => !usados.has(s));
}

function marcarRealces(itens, retangulos) {
  const usados = new Set();
  for (const r of retangulos) {
    const dentro = itens.filter((it) => it.x0 >= r.x0 - 1.5 && it.x1 <= r.x1 + 1.5 && it.topo >= r.y0 - 2.5 && it.fundo <= r.y1 + 2.5);
    if (!dentro.length) continue;
    const tamanho = Math.max(...dentro.map((it) => it.tamanho));
    const largura = Math.max(...dentro.map((it) => it.x1)) - Math.min(...dentro.map((it) => it.x0));
    if (r.y1 - r.y0 > tamanho * 2.2 || r.x1 - r.x0 > largura + tamanho * 3) continue;
    for (const it of dentro) it.destaque = r.cor;
    usados.add(r);
  }
  return retangulos.filter((r) => !usados.has(r));
}

/* ============================================================
   TABELAS COM BORDA
   ============================================================ */

function agrupar(valores, tol) {
  const v = valores.slice().sort((a, b) => a - b);
  const saida = [];
  let grupo = [];
  for (const x of v) {
    if (grupo.length && x - grupo[grupo.length - 1] > tol) { saida.push(grupo.reduce((s, y) => s + y, 0) / grupo.length); grupo = []; }
    grupo.push(x);
  }
  if (grupo.length) saida.push(grupo.reduce((s, y) => s + y, 0) / grupo.length);
  return saida;
}

/** Existe linha em `pos` cobrindo o trecho [a, b]? Devolve a linha (para espessura e cor). */
function linhaCobrindo(lista, pos, a, b) {
  const perto = lista.filter((s) => Math.abs(s.pos - pos) <= 1.8 && s.a1 > a && s.a0 < b);
  if (!perto.length) return null;
  const trechos = perto.map((s) => [Math.max(s.a0, a), Math.min(s.a1, b)]).sort((x, y) => x[0] - y[0]);
  let coberto = 0;
  let fim = a;
  for (const [i, f] of trechos) {
    if (f <= fim) continue;
    coberto += f - Math.max(i, fim);
    fim = f;
  }
  return coberto >= (b - a) * 0.85 ? perto.reduce((m, s) => (s.a1 - s.a0 > m.a1 - m.a0 ? s : m)) : null;
}

/**
 * Tabelas a partir das linhas desenhadas: grade de colunas e linhas,
 * células mescladas onde falta a borda, fundo das células e texto de cada uma.
 * @returns {{tabelas:any[], horizontais:any[], verticais:any[], retangulos:any[]}} o que sobrou
 */
function acharTabelas(horizontais, verticais, retangulos, itens, alturaPagina) {
  const todos = [...horizontais.map((s) => ({ ...s, o: 'h', ref: s })), ...verticais.map((s) => ({ ...s, o: 'v', ref: s }))];
  const pai = todos.map((_, i) => i);
  const raiz = (i) => { while (pai[i] !== i) { pai[i] = pai[pai[i]]; i = pai[i]; } return i; };
  const tol = 2;
  for (let i = 0; i < todos.length; i += 1) {
    if (todos[i].o !== 'h') continue;
    const h = todos[i];
    for (let j = 0; j < todos.length; j += 1) {
      const v = todos[j];
      if (v.o !== 'v') continue;
      if (v.pos >= h.a0 - tol && v.pos <= h.a1 + tol && h.pos >= v.a0 - tol && h.pos <= v.a1 + tol) pai[raiz(i)] = raiz(j);
    }
  }
  const grupos = new Map();
  todos.forEach((s, i) => { const r = raiz(i); if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(s); });

  const tabelas = [];
  const usadosSeg = new Set();
  const usadosRet = new Set();
  const usadosItens = new Set();

  for (const grupo of grupos.values()) {
    const hs = grupo.filter((s) => s.o === 'h');
    const vs = grupo.filter((s) => s.o === 'v');
    if (hs.length < 2 || vs.length < 2) continue;
    const xs = agrupar([...vs.map((s) => s.pos), Math.min(...hs.map((s) => s.a0)), Math.max(...hs.map((s) => s.a1))], 3);
    const ys = agrupar([...hs.map((s) => s.pos), Math.min(...vs.map((s) => s.a0)), Math.max(...vs.map((s) => s.a1))], 3);
    if (xs.length < 2 || ys.length < 2 || xs.length > 64 || ys.length > 400) continue;
    const x0 = xs[0];
    const x1 = xs[xs.length - 1];
    const y0 = ys[0];
    const y1 = ys[ys.length - 1];
    if (x1 - x0 < 20 || y1 - y0 < 8) continue;
    const dentro = itens.filter((it) => !usadosItens.has(it) && (it.x0 + it.x1) / 2 > x0 && (it.x0 + it.x1) / 2 < x1 && (it.topo + it.base) / 2 > y0 && (it.topo + it.base) / 2 < y1);
    if (!dentro.length) continue; // moldura de figura, não tabela
    // uma moldura só, em volta de quase a página inteira, é borda decorativa
    if (xs.length === 2 && ys.length === 2 && y1 - y0 > alturaPagina * 0.4) continue;

    const listaH = hs.map((s) => s.ref);
    const listaV = vs.map((s) => s.ref);
    const nc = xs.length - 1;
    const nl = ys.length - 1;
    const ocupada = Array.from({ length: nl }, () => new Array(nc).fill(false));
    const celulas = [];
    for (let i = 0; i < nl; i += 1) {
      for (let j = 0; j < nc; j += 1) {
        if (ocupada[i][j]) continue;
        let span = 1;
        while (j + span < nc && !ocupada[i][j + span] && !linhaCobrindo(listaV, xs[j + span], ys[i], ys[i + 1])) span += 1;
        let altura = 1;
        while (i + altura < nl && !linhaCobrindo(listaH, ys[i + altura], xs[j], xs[j + span])) {
          let livre = true;
          for (let k = j; k < j + span; k += 1) if (ocupada[i + altura][k]) livre = false;
          if (!livre) break;
          altura += 1;
        }
        for (let a = i; a < i + altura; a += 1) for (let k = j; k < j + span; k += 1) ocupada[a][k] = true;
        const cx0 = xs[j];
        const cx1 = xs[j + span];
        const cy0 = ys[i];
        const cy1 = ys[i + altura];
        const borda = (s) => (s ? { esp: s.esp, cor: s.cor } : null);
        const fundo = retangulos.find((r) => {
          const ix = Math.min(r.x1, cx1) - Math.max(r.x0, cx0);
          const iy = Math.min(r.y1, cy1) - Math.max(r.y0, cy0);
          return ix > 0 && iy > 0 && ix * iy >= (cx1 - cx0) * (cy1 - cy0) * 0.85;
        });
        if (fundo) usadosRet.add(fundo);
        const conteudo = dentro.filter((it) => {
          const mx = (it.x0 + it.x1) / 2;
          const my = (it.topo + it.base) / 2;
          return mx >= cx0 && mx < cx1 && my >= cy0 && my < cy1;
        });
        conteudo.forEach((it) => usadosItens.add(it));
        celulas.push({
          lin: i, col: j, spanC: span, spanL: altura,
          x0: cx0, x1: cx1, y0: cy0, y1: cy1,
          bordas: {
            t: borda(linhaCobrindo(listaH, cy0, cx0, cx1)),
            b: borda(linhaCobrindo(listaH, cy1, cx0, cx1)),
            l: borda(linhaCobrindo(listaV, cx0, cy0, cy1)),
            r: borda(linhaCobrindo(listaV, cx1, cy0, cy1)),
          },
          fundo: fundo ? fundo.cor : null,
          itens: conteudo,
        });
      }
    }
    for (const s of grupo) usadosSeg.add(s.ref);
    tabelas.push({ x0, y0, x1, y1, colunas: xs, linhas: ys, celulas });
  }
  return {
    tabelas,
    horizontais: horizontais.filter((s) => !usadosSeg.has(s)),
    verticais: verticais.filter((s) => !usadosSeg.has(s)),
    retangulos: retangulos.filter((r) => !usadosRet.has(r)),
    usados: { segmentos: [...usadosSeg], retangulos: [...usadosRet] },
    livres: itens.filter((it) => !usadosItens.has(it)),
  };
}

/* ============================================================
   FIGURAS: tudo o que não é texto, recortado do desenho sem letras
   ============================================================ */

function corDoPapel(rgba, w, h) {
  const contagem = new Map();
  for (let i = 0; i < w * h; i += 7) {
    const o = i * 4;
    const r = rgba[o]; const g = rgba[o + 1]; const b = rgba[o + 2];
    if (r + g + b < 480) continue;
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    contagem.set(k, (contagem.get(k) || 0) + 1);
  }
  let melhor = -1;
  let max = 0;
  for (const [k, n] of contagem) if (n > max) { max = n; melhor = k; }
  if (melhor < 0) return [255, 255, 255];
  const c = [(melhor >> 10) & 31, (melhor >> 5) & 31, melhor & 31].map((v) => v * 8 + 4);
  return c.every((v) => v >= 244) ? [255, 255, 255] : c;
}

/** Pinta retângulos (em pontos) com a cor do papel: apaga as letras da foto digitalizada. */
function apagar(rgba, w, h, escala, caixas, papel) {
  for (const c of caixas) {
    const x0 = Math.max(0, Math.floor(c.x0 * escala));
    const x1 = Math.min(w, Math.ceil(c.x1 * escala));
    const y0 = Math.max(0, Math.floor(c.y0 * escala));
    const y1 = Math.min(h, Math.ceil(c.y1 * escala));
    for (let y = y0; y < y1; y += 1) {
      let o = (y * w + x0) * 4;
      for (let x = x0; x < x1; x += 1) { rgba[o] = papel[0]; rgba[o + 1] = papel[1]; rgba[o + 2] = papel[2]; o += 4; }
    }
  }
}

/**
 * Regiões com tinta no desenho sem texto.
 * @param {{x0:number,y0:number,x1:number,y1:number}[]} ignorar  bordas de tabela, sublinhados... (pontos)
 * @returns {{x0:number,y0:number,x1:number,y1:number}[]} em pontos
 */
function regioesComTinta(rgba, w, h, escala, papel, { ignorar = [], ruido = false } = {}) {
  const passo = Math.max(2, Math.round(escala * 1.5));
  const gw = Math.ceil(w / passo);
  const gh = Math.ceil(h / passo);
  const contagem = new Uint16Array(gw * gh);
  const [pr, pg, pb] = papel;
  const limite = ruido ? 48 : 26;
  for (let y = 0; y < h; y += 1) {
    const linha = Math.floor(y / passo) * gw;
    let o = y * w * 4;
    for (let x = 0; x < w; x += 1, o += 4) {
      const d = Math.max(Math.abs(rgba[o] - pr), Math.abs(rgba[o + 1] - pg), Math.abs(rgba[o + 2] - pb));
      if (d > limite) contagem[linha + Math.floor(x / passo)] += 1;
    }
  }
  const minimo = ruido ? Math.max(2, Math.round(passo * passo * 0.08)) : 1;
  const tinta = new Uint8Array(gw * gh);
  for (let i = 0; i < tinta.length; i += 1) tinta[i] = contagem[i] >= minimo ? 1 : 0;
  for (const c of ignorar) {
    const gx0 = Math.max(0, Math.floor((c.x0 * escala) / passo) - 1);
    const gx1 = Math.min(gw - 1, Math.floor((c.x1 * escala) / passo) + 1);
    const gy0 = Math.max(0, Math.floor((c.y0 * escala) / passo) - 1);
    const gy1 = Math.min(gh - 1, Math.floor((c.y1 * escala) / passo) + 1);
    for (let gy = gy0; gy <= gy1; gy += 1) for (let gx = gx0; gx <= gx1; gx += 1) tinta[gy * gw + gx] = 0;
  }
  // engorda a tinta (~3 pt) para juntar as partes de um mesmo desenho
  const raio = 2;
  const tmp = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      if (!tinta[gy * gw + gx]) continue;
      for (let k = Math.max(0, gx - raio); k <= Math.min(gw - 1, gx + raio); k += 1) tmp[gy * gw + k] = 1;
    }
  }
  const gorda = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      if (!tmp[gy * gw + gx]) continue;
      for (let k = Math.max(0, gy - raio); k <= Math.min(gh - 1, gy + raio); k += 1) gorda[k * gw + gx] = 1;
    }
  }
  const rotulo = new Int32Array(gw * gh).fill(-1);
  const fila = new Int32Array(gw * gh);
  const regioes = [];
  for (let inicio = 0; inicio < gorda.length; inicio += 1) {
    if (!gorda[inicio] || rotulo[inicio] >= 0) continue;
    const id = regioes.length;
    const r = { gx0: Infinity, gy0: Infinity, gx1: -1, gy1: -1, celulas: 0 };
    let ini = 0;
    let fim = 0;
    fila[fim++] = inicio;
    rotulo[inicio] = id;
    while (ini < fim) {
      const p = fila[ini++];
      const gx = p % gw;
      const gy = (p - gx) / gw;
      if (tinta[p]) {
        r.celulas += 1;
        if (gx < r.gx0) r.gx0 = gx;
        if (gx > r.gx1) r.gx1 = gx;
        if (gy < r.gy0) r.gy0 = gy;
        if (gy > r.gy1) r.gy1 = gy;
      }
      const viz = [gx > 0 ? p - 1 : -1, gx < gw - 1 ? p + 1 : -1, gy > 0 ? p - gw : -1, gy < gh - 1 ? p + gw : -1];
      for (const q of viz) {
        if (q >= 0 && gorda[q] && rotulo[q] < 0) { rotulo[q] = id; fila[fim++] = q; }
      }
    }
    if (r.celulas) regioes.push(r);
  }
  let caixas = regioes
    .filter((r) => !ruido || r.celulas >= 4)
    .map((r) => ({
      x0: (r.gx0 * passo) / escala,
      y0: (r.gy0 * passo) / escala,
      x1: (Math.min(w, (r.gx1 + 1) * passo)) / escala,
      y1: (Math.min(h, (r.gy1 + 1) * passo)) / escala,
    }))
    .filter((c) => c.x1 - c.x0 >= 1.5 || c.y1 - c.y0 >= 1.5);
  // caixas que se sobrepõem viram uma só
  let mudou = true;
  while (mudou) {
    mudou = false;
    const saida = [];
    for (const c of caixas) {
      const outra = saida.find((o) => c.x0 < o.x1 + 0.5 && c.x1 > o.x0 - 0.5 && c.y0 < o.y1 + 0.5 && c.y1 > o.y0 - 0.5);
      if (outra) {
        outra.x0 = Math.min(outra.x0, c.x0); outra.y0 = Math.min(outra.y0, c.y0);
        outra.x1 = Math.max(outra.x1, c.x1); outra.y1 = Math.max(outra.y1, c.y1);
        mudou = true;
      } else saida.push({ ...c });
    }
    caixas = saida;
  }
  return caixas;
}

/** Muitas cores diferentes = foto (JPEG); poucas = logo, desenho, assinatura (PNG, sem borrão). */
function pareceFoto(raw, largura, altura) {
  const cores = new Set();
  const passo = Math.max(1, Math.floor(Math.sqrt((largura * altura) / 20000)));
  for (let y = 0; y < altura; y += passo) {
    for (let x = 0; x < largura; x += passo) {
      const o = (y * largura + x) * 3;
      cores.add(((raw[o] >> 3) << 10) | ((raw[o + 1] >> 3) << 5) | (raw[o + 2] >> 3));
      if (cores.size > 1200) return true;
    }
  }
  return false;
}

/**
 * @param {'jpeg'|'png'|'auto'} formato  auto: pelo conteúdo (foto ou desenho)
 * @param {number[]|null} papel  folha digitalizada: o tom do papel vira branco
 *   (senão cada figura aparece num retângulo bege na página branca do Word)
 */
async function recortar(rgba, w, h, escala, caixa, formato, papel = null) {
  const folga = 0.75;
  const left = Math.max(0, Math.floor((caixa.x0 - folga) * escala));
  const top = Math.max(0, Math.floor((caixa.y0 - folga) * escala));
  const right = Math.min(w, Math.ceil((caixa.x1 + folga) * escala));
  const bottom = Math.min(h, Math.ceil((caixa.y1 + folga) * escala));
  let imagem = sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) })
    .removeAlpha();
  if (papel && papel.some((c) => c < 255)) imagem = imagem.linear(papel.map((c) => 255 / Math.max(c, 1)), [0, 0, 0]);
  const { data, info } = await imagem.raw().toBuffer({ resolveWithObject: true });
  const tipo = formato === 'auto' ? (pareceFoto(data, info.width, info.height) ? 'jpeg' : 'png') : formato;
  const final = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
  const bytes = tipo === 'jpeg'
    ? await final.jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer()
    : await final.png({ compressionLevel: 6, adaptiveFiltering: true }).toBuffer();
  return {
    x0: left / escala, y0: top / escala, x1: right / escala, y1: bottom / escala,
    px: right - left, py: bottom - top,
    bytes, ext: tipo,
  };
}

/* ============================================================
   OCR
   ============================================================ */

/**
 * Palavras do OCR -> trechos de texto (em pontos).
 * @param {{x:number, y:number, w:number, h:number}} [recorte]  só esta parte da página (pixels)
 * @param {number} [confianca]  confiança mínima de cada palavra
 */
async function textoPorOcr(rgba, w, h, escala, idioma, recorte = null, confianca = 0) {
  let imagem = sharp(rgba, { raw: { width: w, height: h, channels: 4 } });
  if (recorte) imagem = imagem.extract({ left: recorte.x, top: recorte.y, width: recorte.w, height: recorte.h });
  // com a resolução gravada (senão o Tesseract reclama e chuta 70 dpi)
  const png = await imagem.removeAlpha().withMetadata({ density: Math.round(escala * 72) }).png({ compressionLevel: 2 }).toBuffer();
  const lido = await ocr.reconhecer(png, idioma);
  const dx = recorte ? recorte.x : 0;
  const dy = recorte ? recorte.y : 0;
  // letra "gigante" e curtinha no meio do texto é lixo do OCR (borda, mancha, desenho)
  const alturas = lido.linhas.flatMap((l) => l.palavras.map((p) => p.y1 - p.y0)).sort((a, b) => a - b);
  const tipica = alturas.length ? alturas[alturas.length >> 1] : 0;
  for (const l of lido.linhas) {
    l.palavras = l.palavras
      .filter((p) => p.conf >= confianca)
      .filter((p) => !(tipica && p.y1 - p.y0 > tipica * 2.5 && p.texto.length <= 3))
      .filter((p) => !(p.conf < 45 && p.texto.replace(/[^\p{L}\p{N}]/gu, '').length <= 1))
      // traço solto costuma ser um pedaço de linha de tabela lido como letra
      .filter((p) => /[\p{L}\p{N}]/u.test(p.texto) || (p.conf >= 85 && !recorte))
      .map((p) => ({ ...p, x0: p.x0 + dx, x1: p.x1 + dx, y0: p.y0 + dy, y1: p.y1 + dy }));
    if (l.base) l.base = { ...l.base, x0: l.base.x0 + dx, x1: l.base.x1 + dx, y0: l.base.y0 + dy, y1: l.base.y1 + dy };
  }
  const itens = [];
  for (const l of lido.linhas) {
    if (!l.palavras.length) continue;
    const bases = l.palavras.map((p) => {
      let base = p.y1 - (p.y1 - p.y0) * 0.12;
      const b = l.base;
      if (b && Number.isFinite(b.y0) && Number.isFinite(b.y1) && b.x1 > b.x0) {
        const cx = (p.x0 + p.x1) / 2;
        base = b.y0 + ((b.y1 - b.y0) * (cx - b.x0)) / (b.x1 - b.x0);
        if (base < p.y0 || base > p.y1 + (p.y1 - p.y0) * 0.5) base = p.y1 - (p.y1 - p.y0) * 0.12;
      }
      return base;
    });
    // tamanho da fonte pela altura das maiúsculas/ascendentes acima da linha de base (~0,71 da fonte)
    const acima = l.palavras.map((p, i) => bases[i] - p.y0).sort((a, b) => a - b);
    const ref = acima[Math.floor((acima.length - 1) * 0.8)];
    const tamanho = Math.min(72, Math.max(5, Math.round(((ref / 0.71) / escala) * 2) / 2));
    for (let k = 0; k < l.palavras.length; k += 1) {
      const p = l.palavras[k];
      const base = bases[k];
      itens.push({
        texto: p.texto,
        x0: p.x0 / escala,
        x1: p.x1 / escala,
        base: base / escala,
        tamanho,
        caixa: { x0: p.x0 / escala, y0: p.y0 / escala, x1: p.x1 / escala, y1: p.y1 / escala },
      });
    }
  }
  return itens;
}

/**
 * Negrito no texto digitalizado: o traço das letras é mais grosso.
 * Espessura = tinta / número de trechos de tinta em cada linha de pixels,
 * dividida pelo tamanho da letra (letra maior tem traço maior).
 */
function marcarNegrito(itens, rgba, w, escala) {
  const tracos = itens.map((it) => {
    const c = it.caixa;
    const x0 = Math.max(0, Math.floor(c.x0 * escala));
    const x1 = Math.min(w, Math.ceil(c.x1 * escala));
    const y0 = Math.max(0, Math.floor(c.y0 * escala));
    const y1 = Math.ceil(c.y1 * escala);
    let tinta = 0;
    let trechos = 0;
    for (let y = y0; y < y1; y += 1) {
      let dentro = false;
      for (let x = x0; x < x1; x += 1) {
        const o = (y * w + x) * 4;
        const escuro = rgba[o] * 0.3 + rgba[o + 1] * 0.59 + rgba[o + 2] * 0.11 < 130;
        if (escuro) { tinta += 1; if (!dentro) trechos += 1; }
        dentro = escuro;
      }
    }
    return trechos ? tinta / trechos / (it.tamanho * escala) : 0;
  });
  const ord = tracos.filter((v) => v > 0).sort((a, b) => a - b);
  const tipico = ord.length ? ord[ord.length >> 1] : 0;
  itens.forEach((it, i) => { it.negrito = tipico > 0 && tracos[i] > tipico * 1.25 && it.texto.replace(/[^\p{L}]/gu, '').length >= 3; });
}

/** Times ou Arial? Pela largura média das letras do texto reconhecido. */
function fonteDoOcr(itens) {
  let largura = 0;
  let letras = 0;
  for (const it of itens) { largura += (it.x1 - it.x0) / it.tamanho; letras += it.texto.length; }
  return letras && largura / letras > 0.49 ? 'Arial' : 'Times New Roman';
}

/* ============================================================
   PÁGINA
   ============================================================ */

/**
 * Valores dos campos de texto de formulário preenchidos. O pdf.js não os
 * devolve como texto; aqui viram trechos de texto (o lugar exato sai das
 * letras desenhadas dentro do campo).
 */
async function camposPreenchidos(doc, n) {
  try {
    const pagina = await doc.getPage(n);
    const vp = pagina.getViewport({ scale: 1 });
    const anotacoes = await pagina.getAnnotations();
    const saida = [];
    for (const a of anotacoes) {
      if (a.subtype !== 'Widget' || a.fieldType !== 'Tx' || a.hidden || a.multiLine || a.comb) continue;
      const valor = typeof a.fieldValue === 'string' ? a.fieldValue.replace(/s+/g, ' ').trim() : '';
      if (!valor || !Array.isArray(a.rect)) continue;
      const [x0, y0, x1, y1] = vp.convertToViewportRectangle(a.rect);
      const caixa = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
      const da = a.defaultAppearanceData || {};
      const tamanho = da.fontSize > 0 ? da.fontSize : (caixa.y1 - caixa.y0) * 0.6;
      saida.push({
        texto: valor, x: caixa.x0, l: caixa.x1 - caixa.x0, base: caixa.y1, tamanho, a: tamanho,
        nomeFonte: da.fontName || 'Helvetica', familia: 'sans-serif', vertical: false, inclinado: false,
        negrito: /bold/i.test(da.fontName || ''), italico: false, caixa,
      });
    }
    pagina.cleanup();
    return saida;
  } catch (_) {
    return [];
  }
}

function novoItem(base) {
  return {
    sublinhado: false, riscado: false, destaque: null, negrito: false, italico: false, cor: '000000', ocr: false,
    ...base,
    topo: base.base - base.tamanho * 0.78,
    fundo: base.base + base.tamanho * 0.22,
  };
}

/**
 * Lê uma página.
 * @param {*} doc  aberto com pdfjs.abrir(..., { analise: true })
 * @param {number} n
 * @param {{alvo?:'word'|'powerpoint', ocr?:boolean, idioma?:string, aoOcr?:Function}} op
 *   alvo 'word': bordas de tabela e sublinhados viram formatação (saem do desenho)
 */
async function lerPagina(doc, n, { alvo = 'word', ocr: usarOcr = true, idioma = 'por', aoOcr } = {}) {
  const { largura, altura, itens: brutos } = await pdfjs.textoDaPagina(doc, n);
  brutos.push(...await camposPreenchidos(doc, n));
  const d = await pdfjs.desenharAnalise(doc, n, { dpi: DPI_FIGURAS, semTexto: true, itens: brutos });
  const { escala, rgba } = d;
  const w = d.largura;
  const h = d.altura;

  // cor de cada trecho = a das letras desenhadas; sem letra desenhada = invisível (camada de OCR)
  const cores = new Map();
  const letrasDoCampo = new Map();
  for (const l of d.registro.letras) {
    if (brutos[l.idx] && brutos[l.idx].caixa) {
      if (!letrasDoCampo.has(l.idx)) letrasDoCampo.set(l.idx, []);
      letrasDoCampo.get(l.idx).push(l);
    }
    if (!cores.has(l.idx)) cores.set(l.idx, new Map());
    const m = cores.get(l.idx);
    const c = corHex(l.cor) || '000000';
    m.set(c, (m.get(c) || 0) + 1);
  }
  const visiveis = [];
  const invisiveis = [];
  brutos.forEach((it, idx) => {
    if (it.inclinado || !it.texto.trim()) return;
    const texto = limparTexto(it.texto);
    const item = novoItem({
      texto,
      x0: it.x,
      x1: it.x + it.l,
      base: it.base,
      tamanho: Math.round(it.tamanho * 4) / 4,
      fonte: fonteWord(it.nomeFonte, { familia: it.familia, serif: it.serif, mono: it.mono }),
      negrito: it.negrito,
      italico: it.italico,
    });
    const doCampo = letrasDoCampo.get(idx);
    if (doCampo) {
      // valor de campo: a posição e o tamanho vêm das letras desenhadas
      const ord = doCampo.slice().sort((a, b) => a.x - b.x);
      const tam = ord.map((l) => l.tam).sort((a, b) => a - b)[ord.length >> 1] / escala;
      item.tamanho = Math.round(tam * 4) / 4;
      item.base = ord.map((l) => l.y).sort((a, b) => a - b)[ord.length >> 1] / escala;
      item.x0 = ord[0].x / escala;
      item.x1 = Math.min(it.caixa.x1, ord[ord.length - 1].x / escala + (tam * 0.55));
      item.topo = item.base - item.tamanho * 0.78;
      item.fundo = item.base + item.tamanho * 0.22;
    }
    const m = cores.get(idx);
    if (m) {
      item.cor = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
      visiveis.push(item);
    } else invisiveis.push(item);
  });

  const paginaToda = largura * altura;
  const fotoGrande = d.registro.imagens.some((im) => ((im.x1 - im.x0) * (im.y1 - im.y0)) / (escala * escala) > paginaToda * 0.5);
  const letrasVisiveis = visiveis.reduce((s, it) => s + it.texto.replace(/\s/g, '').length, 0);
  let escaneada = false;
  let ocrProprio = false;
  let itens = visiveis;
  let papel = [255, 255, 255];

  if (fotoGrande && letrasVisiveis < 20) {
    papel = corDoPapel(rgba, w, h);
    const letrasInvisiveis = invisiveis.reduce((s, it) => s + it.texto.replace(/\s/g, '').length, 0);
    let lidos = [];
    if (letrasInvisiveis >= 10) {
      // o PDF já tem a camada de OCR
      // (o tamanho da camada é estimado: a caixa a apagar vai um pouco além dela)
      lidos = invisiveis.map((it) => ({
        ...it,
        caixa: { x0: it.x0 - it.tamanho * 0.12, y0: it.base - it.tamanho, x1: it.x1 + it.tamanho * 0.12, y1: it.base + it.tamanho * 0.32 },
      }));
    } else if (usarOcr) {
      if (aoOcr) aoOcr();
      try { lidos = await textoPorOcr(rgba, w, h, escala, idioma); } catch (_) { lidos = []; }
      ocrProprio = lidos.length > 0;
    }
    if (lidos.length) {
      escaneada = true;
      marcarNegrito(lidos, rgba, w, escala);
      const fonte = fonteDoOcr(lidos);
      // apaga as letras da foto: o que sobra são as figuras (logo, assinatura, carimbo)
      apagar(rgba, w, h, escala, lidos.map((it) => {
        const c = it.caixa;
        const folga = (c.y1 - c.y0) * 0.18 + 0.6;
        return { x0: c.x0 - folga, y0: c.y0 - folga, x1: c.x1 + folga, y1: c.y1 + folga };
      }), papel);
      itens = [...visiveis, ...lidos.map((it) => novoItem({
        texto: it.texto, x0: it.x0, x1: it.x1, base: it.base, tamanho: it.tamanho, fonte, negrito: it.negrito, ocr: true,
      }))];
    }
  }

  // formas: sublinhado, realce e tabelas
  const formas = analisarFormas(d.registro.formas, escala);
  const ignorar = [];
  let tabelas = [];
  let livres = itens;
  if (alvo === 'word') {
    // primeiro as tabelas: a borda de baixo de uma célula fica colada no texto, como um sublinhado
    const t = acharTabelas(formas.horizontais, formas.verticais, formas.retangulos, itens, altura);
    tabelas = t.tabelas;
    livres = t.livres;
    for (const s of t.usados.segmentos) ignorar.push(caixaDoSegmento(s, formas.horizontais.includes(s) ? 'h' : 'v'));
    for (const r of t.usados.retangulos) ignorar.push(r);
    const restoH = marcarSublinhados(itens, t.horizontais);
    for (const s of t.horizontais) if (!restoH.includes(s)) ignorar.push(caixaDoSegmento(s, 'h'));
    const restoR = marcarRealces(livres, t.retangulos);
    for (const r of t.retangulos) if (!restoR.includes(r)) ignorar.push(r);
  }

  // figuras
  let caixas = regioesComTinta(rgba, w, h, escala, papel, { ignorar, ruido: escaneada });
  if (escaneada && ocrProprio) {
    // O OCR da página inteira costuma pular o texto de dentro de tabelas e quadros
    // desenhados: cada região que sobrou é lida de novo, sozinha.
    const novos = [];
    const candidatas = caixas.filter((c) => c.x1 - c.x0 >= 40 && c.y1 - c.y0 >= 14 && (c.x1 - c.x0) * (c.y1 - c.y0) < paginaToda * 0.7);
    for (const c of candidatas.slice(0, 8)) {
      const x = Math.max(0, Math.floor(c.x0 * escala) - 6);
      const y = Math.max(0, Math.floor(c.y0 * escala) - 6);
      const rec = { x, y, w: Math.min(w, Math.ceil(c.x1 * escala) + 6) - x, h: Math.min(h, Math.ceil(c.y1 * escala) + 6) - y };
      let daRegiao = [];
      try { daRegiao = await textoPorOcr(rgba, w, h, escala, idioma, rec, 55); } catch (_) { daRegiao = []; }
      for (const it of daRegiao) {
        const jaLido = itens.some((o) => o.x0 < it.x1 && o.x1 > it.x0 && o.topo < it.base && o.fundo > it.base - it.tamanho * 0.6);
        if (!jaLido) novos.push(it);
      }
    }
    if (novos.length) {
      marcarNegrito(novos, rgba, w, escala);
      apagar(rgba, w, h, escala, novos.map((it) => {
        const c = it.caixa;
        const folga = (c.y1 - c.y0) * 0.18 + 0.6;
        return { x0: c.x0 - folga, y0: c.y0 - folga, x1: c.x1 + folga, y1: c.y1 + folga };
      }), papel);
      const fonte = fonteDoOcr(novos);
      const extra = novos.map((it) => novoItem({ texto: it.texto, x0: it.x0, x1: it.x1, base: it.base, tamanho: it.tamanho, fonte, negrito: it.negrito, ocr: true }));
      itens.push(...extra);
      if (livres !== itens) livres.push(...extra);
      caixas = regioesComTinta(rgba, w, h, escala, papel, { ignorar, ruido: escaneada });
    }
  }
  const figuras = [];
  for (const c of caixas) figuras.push(await recortar(rgba, w, h, escala, c, 'auto', escaneada ? papel : null));

  // digitalizada sem texto reconhecido (OCR desligado ou sem os dados do OCR): fica só como imagem
  const semTexto = fotoGrande && letrasVisiveis < 20 && !escaneada;
  return { numero: n, largura, altura, itens: livres, todosItens: itens, tabelas, figuras, escaneada, semTexto };
}

function caixaDoSegmento(s, o) {
  const meia = s.esp / 2 + 0.4;
  return o === 'h'
    ? { x0: s.a0 - 0.4, x1: s.a1 + 0.4, y0: s.pos - meia, y1: s.pos + meia }
    : { x0: s.pos - meia, x1: s.pos + meia, y0: s.a0 - 0.4, y1: s.a1 + 0.4 };
}

/**
 * Lê o documento todo.
 * @returns {Promise<{paginas: any[], total: number, ocr: number, semTexto: number}>}
 *   ocr: páginas digitalizadas lidas por OCR; semTexto: digitalizadas que ficaram só como imagem
 */
async function lerDocumento(caminho, { alvo = 'word', ocr: usarOcr = true, idioma = 'por', checar, aoProgredir } = {}) {
  const doc = await pdfjs.abrir(caminho, { analise: true });
  try {
    const paginas = [];
    let comOcr = 0;
    let semTexto = 0;
    for (let n = 1; n <= doc.numPages; n += 1) {
      if (checar) checar();
      if (aoProgredir) aoProgredir((n - 1) / doc.numPages, n, doc.numPages, false);
      const p = await lerPagina(doc, n, {
        alvo,
        ocr: usarOcr,
        idioma,
        aoOcr: () => { if (aoProgredir) aoProgredir((n - 1) / doc.numPages, n, doc.numPages, true); },
      });
      if (p.escaneada) comOcr += 1;
      if (p.semTexto) semTexto += 1;
      paginas.push(p);
    }
    return { paginas, total: doc.numPages, ocr: comOcr, semTexto };
  } finally {
    doc.destroy();
  }
}

module.exports = { lerDocumento, lerPagina, fonteWord, corHex, analisarFormas, acharTabelas, regioesComTinta };
