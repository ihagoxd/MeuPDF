'use strict';

/**
 * Word editável (.docx) a partir da estrutura do PDF (estrutura.js).
 *
 * Cada página do PDF vira uma página do Word com o mesmo tamanho e margens.
 * O texto corre normalmente (dá para editar e ele se reacomoda), com o
 * espaço entre parágrafos e a entrelinha medidos no PDF, para cair no mesmo
 * lugar. Figuras ficam no fluxo, ao lado do texto ou atrás dele; texto em
 * cima de figura fica numa caixa de texto no lugar exato. Cabeçalho e rodapé que se
 * repetem vão para o cabeçalho/rodapé do Word, com o número da página.
 */

const { escapar: x, partes } = require('./ooxml');
const estrutura = require('./estrutura');

const { XML, core, APP, rels, R, tipos, empacotar, PT } = partes;

const tw = (pt) => Math.round(pt * 20);
const emu = (pt) => Math.round(pt * PT);

// No Word, com entrelinha "exatamente", a linha de base fica a esta fração do
// tamanho da fonte acima do pé da linha.
const DESCIDA = 0.215;

const NS = 'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

const R_CABECALHO = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header';
const R_RODAPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';

/* ---------------- texto ---------------- */

function rPr(s, { fonte } = {}) {
  const f = fonte || s.fonte;
  let p = '';
  if (f) p += `<w:rFonts w:ascii="${x(f)}" w:hAnsi="${x(f)}" w:eastAsia="${x(f)}" w:cs="${x(f)}"/>`;
  if (s.negrito) p += '<w:b/><w:bCs/>';
  if (s.italico) p += '<w:i/><w:iCs/>';
  if (s.riscado) p += '<w:strike/>';
  if (s.cor && s.cor !== '000000') p += `<w:color w:val="${s.cor}"/>`;
  if (s.tamanho) p += `<w:sz w:val="${Math.max(2, Math.round(s.tamanho * 2))}"/><w:szCs w:val="${Math.max(2, Math.round(s.tamanho * 2))}"/>`;
  if (s.sublinhado) p += '<w:u w:val="single"/>';
  if (s.destaque) p += `<w:shd w:val="clear" w:color="auto" w:fill="${s.destaque}"/>`;
  return p ? `<w:rPr>${p}</w:rPr>` : '';
}

function run(texto, s, op) {
  if (!texto) return '';
  return `<w:r>${rPr(s, op)}<w:t xml:space="preserve">${x(texto)}</w:t></w:r>`;
}

/** Texto com os números trocados por campos (PAGE, NUMPAGES) onde for o caso. */
function runComCampos(texto, s, campos, contador) {
  if (!campos) return run(texto, s);
  let saida = '';
  let resto = texto;
  const re = /\d+/;
  for (;;) {
    const m = re.exec(resto);
    if (!m) break;
    const tipo = campos[contador.n];
    contador.n += 1;
    saida += run(resto.slice(0, m.index), s);
    if (tipo === 'PAGE' || tipo === 'NUMPAGES') {
      saida += `<w:fldSimple w:instr=" ${tipo} ">${run(m[0], s)}</w:fldSimple>`;
    } else saida += run(m[0], s);
    resto = resto.slice(m.index + m[0].length);
  }
  return saida + run(resto, s);
}

const SIMBOLICAS = /^(Symbol|Wingdings.*|Webdings)$/;

function runsDoParagrafo(p) {
  let xml = '';
  p.linhas.forEach((l, li) => {
    const contador = { n: 0 };
    l.segmentos.forEach((s, si) => {
      if (li === 0 && si === 0 && p.marcador) {
        const prox = l.segmentos[1] || s;
        xml += run(p.marcador.texto, s, SIMBOLICAS.test(s.fonte) ? { fonte: prox.fonte } : {});
        xml += `<w:r>${rPr(prox)}<w:tab/></w:r>`;
        return;
      }
      let texto = s.texto;
      if (li === 0 && si === 1 && p.marcador) texto = texto.replace(/^\s+/, '');
      if (s.tab && !(li === 0 && si === 1 && p.marcador)) xml += `<w:r>${rPr(s)}<w:tab/></w:r>`;
      xml += runComCampos(texto, s, l.campos, contador);
    });
    if (li < p.linhas.length - 1) {
      const ultimo = l.segmentos[l.segmentos.length - 1];
      const prox = p.linhas[li + 1].segmentos[0] || ultimo;
      // o espaço entre as linhas só é sublinhado se o texto dos dois lados for
      const espaco = { ...ultimo, sublinhado: ultimo.sublinhado && prox.sublinhado, riscado: ultimo.riscado && prox.riscado };
      if (l.juntar === 'quebra') xml += `<w:r>${rPr(ultimo)}<w:br/></w:r>`;
      else if (l.juntar === ' ') xml += run(' ', espaco);
    }
  });
  return xml;
}

/* ---------------- figuras ---------------- */

class Midia {
  constructor() {
    this.arquivos = {};
    this.n = 0;
    this.ids = 0;
  }

  /** Guarda a imagem e devolve o id da relação na parte atual. */
  guardar(fig, relsParte) {
    this.n += 1;
    const nome = `img${this.n}.${fig.ext === 'jpeg' ? 'jpeg' : 'png'}`;
    this.arquivos[`word/media/${nome}`] = fig.bytes;
    const rid = `rIdImg${this.n}`;
    relsParte.push({ id: rid, tipo: R.imagem, alvo: `media/${nome}` });
    return rid;
  }

  novoId() {
    this.ids += 1;
    return this.ids;
  }
}

function grafico(rid, id, cx, cy) {
  return '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
    + `<pic:nvPicPr><pic:cNvPr id="${id}" name="Figura ${id}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + '</pic:pic></a:graphicData></a:graphic>';
}

function figuraNaLinha(fig, midia, relsParte) {
  const rid = midia.guardar(fig, relsParte);
  const id = midia.novoId();
  const cx = emu(fig.x1 - fig.x0);
  const cy = emu(fig.y1 - fig.y0);
  return `<w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>`
    + `<wp:docPr id="${id}" name="Figura ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>`
    + `${grafico(rid, id, cx, cy)}</wp:inline></w:drawing></w:r>`;
}

function figuraFlutuante(fig, midia, relsParte, z) {
  const rid = midia.guardar(fig, relsParte);
  const id = midia.novoId();
  const cx = emu(fig.x1 - fig.x0);
  const cy = emu(fig.y1 - fig.y0);
  const atras = fig.modo === 'atras';
  const quebra = atras ? '<wp:wrapNone/>' : '<wp:wrapSquare wrapText="bothSides"/>';
  return `<w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:drawing><wp:anchor distT="0" distB="0" distL="${emu(fig.distE || 0)}" distR="${emu(fig.distD || 0)}" simplePos="0" relativeHeight="${z}" behindDoc="${atras ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1">`
    + '<wp:simplePos x="0" y="0"/>'
    + `<wp:positionH relativeFrom="page"><wp:posOffset>${emu(fig.x0)}</wp:posOffset></wp:positionH>`
    + `<wp:positionV relativeFrom="page"><wp:posOffset>${emu(fig.y0)}</wp:posOffset></wp:positionV>`
    + `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>${quebra}`
    + `<wp:docPr id="${id}" name="Figura ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>`
    + `${grafico(rid, id, cx, cy)}</wp:anchor></w:drawing></w:r>`;
}

/* ---------------- parágrafos ---------------- */

/** Topo da caixa da 1ª linha e pé da última, como o Word desenha com entrelinha exata. */
function geometria(p) {
  const primeira = p.linhas[0];
  const ultima = p.linhas[p.linhas.length - 1];
  return {
    topo: p.base0 - (p.passo - DESCIDA * primeira.tamanho),
    fundo: p.baseN + DESCIDA * ultima.tamanho,
  };
}

function pPrXml(o) {
  let s = '';
  if (o.estilo) s += `<w:pStyle w:val="${o.estilo}"/>`;
  if (o.quebraPagina) s += '<w:pageBreakBefore/>';
  if (o.tabs && o.tabs.length) {
    s += `<w:tabs>${o.tabs.map((t) => `<w:tab w:val="${t.tipo === 'direita' ? 'right' : 'left'}" w:pos="${tw(t.pos)}"/>`).join('')}</w:tabs>`;
  }
  const antes = Math.max(0, tw(o.antes || 0));
  const depois = Math.max(0, tw(o.depois || 0));
  s += `<w:spacing w:before="${antes}" w:after="${depois}" ${o.linha ? `w:line="${Math.max(20, tw(o.linha))}" w:lineRule="exact"` : 'w:line="240" w:lineRule="auto"'}/>`;
  if (o.esq || o.dir || o.primeira) {
    const prim = o.primeira || 0;
    s += `<w:ind w:left="${tw(o.esq || 0)}" w:right="${tw(o.dir || 0)}" ${prim < 0 ? `w:hanging="${tw(-prim)}"` : `w:firstLine="${tw(prim)}"`}/>`;
  }
  if (o.jc) s += `<w:jc w:val="${o.jc}"/>`;
  if (o.nivel) s += `<w:outlineLvl w:val="${o.nivel - 1}"/>`;
  if (o.tamanhoMarca) s += `<w:rPr><w:sz w:val="${Math.max(2, Math.round(o.tamanhoMarca * 2))}"/></w:rPr>`;
  if (o.sectPr) s += o.sectPr;
  return `<w:pPr>${s}</w:pPr>`;
}

const JC = { justificado: 'both', centro: 'center', direita: 'right' };

/** Objeto de parágrafo (ainda não serializado: dá para ajustar o espaço depois). */
function paragrafoObj(p) {
  return {
    tipo: 'p',
    estilo: p.nivel ? `Ttulo${p.nivel}` : null,
    nivel: p.nivel,
    tabs: p.tabs,
    linha: p.passo,
    esq: p.recuoEsq,
    dir: p.recuoDir,
    primeira: p.recuoPrimeira,
    jc: JC[p.alinhamento] || null,
    tamanhoMarca: p.tamanho,
    corpo: runsDoParagrafo(p),
    ancoras: [],
  };
}

function serializar(objs) {
  return objs.map((o) => {
    if (o.tipo === 'xml') return o.xml;
    return `<w:p>${pPrXml(o)}${o.ancoras.join('')}${o.corpo || ''}</w:p>`;
  }).join('');
}

/* ---------------- tabelas ---------------- */

function borda(b) {
  if (!b) return 'w:val="nil"';
  return `w:val="single" w:sz="${Math.min(96, Math.max(2, Math.round(b.esp * 8)))}" w:space="0" w:color="${b.cor || '000000'}"`;
}

function tabelaXml(t, area, ctx) {
  const cols = t.colunas;
  const larguras = cols.slice(1).map((c, i) => Math.max(1, c - cols[i]));
  // margem interna da célula: a menor folga entre a borda e o texto
  const folgas = [];
  for (const c of t.celulas) for (const it of c.itens) folgas.push(it.x0 - c.x0);
  const mar = Math.min(5.4, Math.max(0.5, folgas.length ? Math.min(...folgas) - 0.5 : 2));
  const linhasXml = [];
  const nl = t.linhas.length - 1;
  for (let i = 0; i < nl; i += 1) {
    const altura = t.linhas[i + 1] - t.linhas[i];
    let tcs = '';
    for (let j = 0; j < larguras.length;) {
      const inicio = t.celulas.find((c) => c.lin === i && c.col === j);
      const continuacao = !inicio && t.celulas.find((c) => c.col === j && c.lin < i && c.lin + c.spanL > i);
      const c = inicio || continuacao;
      if (!c) { j += 1; continue; }
      const w = larguras.slice(j, j + c.spanC).reduce((s, v) => s + v, 0);
      let props = `<w:tcW w:w="${tw(w)}" w:type="dxa"/>`;
      if (c.spanC > 1) props += `<w:gridSpan w:val="${c.spanC}"/>`;
      if (c.spanL > 1) props += inicio ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>';
      props += `<w:tcBorders><w:top ${borda(c.bordas.t)}/><w:left ${borda(c.bordas.l)}/><w:bottom ${borda(c.bordas.b)}/><w:right ${borda(c.bordas.r)}/></w:tcBorders>`;
      if (c.fundo) props += `<w:shd w:val="clear" w:color="auto" w:fill="${c.fundo}"/>`;
      let conteudo = '';
      if (inicio && c.itens.length) {
        const areaCel = { x0: c.x0 + mar, x1: c.x1 - mar };
        const pars = estrutura.paragrafos(estrutura.montarLinhas(c.itens), areaCel, ctx.doc);
        const objs = fluxoObjs(pars, areaCel, ctx, { topo: c.y0 + (c.bordas.t ? c.bordas.t.esp : 0) });
        conteudo = serializar(objs);
      }
      if (!conteudo) conteudo = `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${Math.max(20, Math.min(240, tw(altura - 1)))}" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>`;
      tcs += `<w:tc><w:tcPr>${props}</w:tcPr>${conteudo}</w:tc>`;
      j += c.spanC;
    }
    linhasXml.push(`<w:tr><w:trPr><w:trHeight w:val="${tw(altura)}" w:hRule="atLeast"/></w:trPr>${tcs}</w:tr>`);
  }
  const total = larguras.reduce((s, v) => s + v, 0);
  return '<w:tbl><w:tblPr>'
    + `<w:tblW w:w="${tw(total)}" w:type="dxa"/><w:tblInd w:w="${tw(cols[0] - area.x0)}" w:type="dxa"/>`
    + '<w:tblLayout w:type="fixed"/>'
    + `<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="${tw(mar)}" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="${tw(mar)}" w:type="dxa"/></w:tblCellMar>`
    + '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>'
    + `<w:tblGrid>${larguras.map((v) => `<w:gridCol w:w="${tw(v)}"/>`).join('')}</w:tblGrid>${linhasXml.join('')}</w:tbl>`;
}

/** Blocos lado a lado: tabela sem bordas, uma célula por coluna. */
function colunasXml(el, area, ctx) {
  const larguras = el.colunas.map((c) => Math.max(1, c.x1 - c.x0));
  let tcs = '';
  el.colunas.forEach((c, i) => {
    const areaCel = c.conteudo || { x0: c.x0, x1: c.x1 };
    const objs = fluxoObjs(c.elementos, areaCel, ctx, { topo: el.topo });
    const conteudo = serializar(objs) || '<w:p/>';
    // fecha a célula com um parágrafo se ela terminar em tabela
    const fim = /<\/w:tbl>$/.test(conteudo) ? '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>' : '';
    // margens da célula: do limite da célula até onde o texto começa e acaba
    const mar = `<w:tcMar><w:left w:w="${tw(Math.max(0, areaCel.x0 - c.x0))}" w:type="dxa"/><w:right w:w="${tw(Math.max(0, c.x1 - areaCel.x1))}" w:type="dxa"/></w:tcMar>`;
    tcs += `<w:tc><w:tcPr><w:tcW w:w="${tw(larguras[i])}" w:type="dxa"/><w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>${mar}</w:tcPr>${conteudo}${fim}</w:tc>`;
  });
  const total = larguras.reduce((s, v) => s + v, 0);
  return '<w:tbl><w:tblPr>'
    + `<w:tblW w:w="${tw(total)}" w:type="dxa"/><w:tblInd w:w="${tw(el.colunas[0].x0 - area.x0)}" w:type="dxa"/>`
    + '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>'
    + '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>'
    + '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>'
    + `<w:tblGrid>${larguras.map((v) => `<w:gridCol w:w="${tw(v)}"/>`).join('')}</w:tblGrid><w:tr>${tcs}</w:tr></w:tbl>`;
}

/* ---------------- fluxo (corpo, célula, coluna) ---------------- */

/**
 * Elementos de um fluxo -> objetos de parágrafo/tabela, com o espaço antes de
 * cada um calculado a partir da posição no PDF.
 * @param {{topo:number}} inicio  onde o fluxo começa (margem superior, topo da célula)
 */
function fluxoObjs(elementos, area, ctx, inicio) {
  const objs = [];
  let fundoAnterior = inicio.topo;
  let ultimoP = null;
  for (const el of elementos) {
    if (el.tipo === 'paragrafo') {
      let g = geometria(el);
      if (g.topo < fundoAnterior - 0.1 && !el.passoMedido) {
        // linha única sem espaço acima (início de célula, por exemplo): entrelinha menor, para a base cair no lugar
        el.passo = Math.max(el.tamanho * 1.02, el.base0 - fundoAnterior + DESCIDA * el.linhas[0].tamanho);
        g = geometria(el);
      }
      const o = paragrafoObj(el);
      o.antes = g.topo - fundoAnterior;
      o.topo = g.topo;
      objs.push(o);
      ultimoP = o;
      fundoAnterior = g.fundo;
    } else if (el.tipo === 'figuras') {
      const figs = el.figuras.slice().sort((a, b) => a.x0 - b.x0);
      let corpo = '';
      const tabs = [];
      figs.forEach((f, i) => {
        if (i) { corpo += '<w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:tab/></w:r>'; tabs.push({ tipo: 'esquerda', pos: f.x0 - area.x0 }); }
        corpo += figuraNaLinha(f, ctx.midia, ctx.rels);
      });
      const o = {
        tipo: 'p', antes: el.topo - fundoAnterior, topo: el.topo, esq: figs[0].x0 - area.x0, tabs, tamanhoMarca: 1, corpo, ancoras: [],
      };
      objs.push(o);
      ultimoP = o;
      fundoAnterior = el.fundo + 0.2;
    } else if (el.tipo === 'tabela' || el.tipo === 'colunas') {
      const folga = el.topo - fundoAnterior;
      if (ultimoP && objs[objs.length - 1] === ultimoP) ultimoP.depois = Math.max(0, folga);
      else if (folga > 0.5) objs.push({ tipo: 'p', antes: 0, linha: Math.max(1, folga), tamanhoMarca: 1, corpo: '', ancoras: [], topo: fundoAnterior, espacador: true });
      objs.push({ tipo: 'xml', xml: el.tipo === 'tabela' ? tabelaXml(el.tabela, area, ctx) : colunasXml(el, area, ctx), topo: el.topo });
      ultimoP = null;
      fundoAnterior = el.fundo;
    }
  }
  return objs;
}

/* ---------------- caixas de texto (texto sobre figura) ---------------- */

/**
 * Texto em cima de figura -> caixa de texto flutuante, sem contorno e sem
 * fundo, no lugar exato. Ela não empurra o resto do texto (uma moldura do
 * Word empurraria).
 * @returns {{y:number, xml:string}[]}
 */
function caixasDeTexto(molduras, midia, z) {
  const saida = [];
  for (const m of molduras) {
    if (!m.paragrafos.length) continue;
    const largura = m.area.x1 - m.area.x0;
    const al = m.paragrafos[0].alinhamento;
    // folga: a fonte do Word pode sair um pouco mais larga que a do PDF e a linha não pode quebrar
    const folga = al === 'justificado' ? 2 : Math.max(10, largura * 0.25);
    const w = largura + folga;
    const xpos = al === 'centro' ? m.area.x0 - folga / 2 : al === 'direita' ? m.area.x1 - w : m.area.x0;
    const geo = geometria(m.paragrafos[0]);
    const ultima = geometria(m.paragrafos[m.paragrafos.length - 1]);
    let fundo = geo.topo;
    const objs = m.paragrafos.map((p, i) => {
      const g = geometria(p);
      const o = paragrafoObj(p);
      // recuos relativos à própria caixa (a folga fica livre)
      o.esq = al === 'esquerda' || al === 'justificado' ? Math.max(0, (p.recuoEsq || 0) + (m.area.x0 - xpos)) : 0;
      o.dir = 0;
      if (o.primeira && o.esq + o.primeira < 0) o.primeira = -o.esq;
      o.antes = i ? g.topo - fundo : 0;
      o.estilo = null;
      o.nivel = null;
      fundo = g.fundo;
      return o;
    });
    const id = midia.novoId();
    const cx = emu(w);
    const cy = emu(Math.max(4, ultima.fundo - geo.topo + 2));
    const xml = `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${z.n++}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">`
      + '<wp:simplePos x="0" y="0"/>'
      + `<wp:positionH relativeFrom="page"><wp:posOffset>${emu(xpos)}</wp:posOffset></wp:positionH>`
      + `<wp:positionV relativeFrom="page"><wp:posOffset>${emu(geo.topo)}</wp:posOffset></wp:positionV>`
      + `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>`
      + `<wp:docPr id="${id}" name="Texto ${id}"/><wp:cNvGraphicFramePr/>`
      + '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/>'
      + `<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr>`
      + `<wps:txbx><w:txbxContent>${serializar(objs)}</w:txbxContent></wps:txbx>`
      + '<wps:bodyPr rot="0" vert="horz" wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t" anchorCtr="0" upright="1"><a:spAutoFit/></wps:bodyPr>'
      + '</wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>';
    saida.push({ y: geo.topo, xml });
  }
  return saida;
}

/* ---------------- cabeçalho e rodapé ---------------- */

function faixaXml(f, tipo, midia, z) {
  const relsParte = [];
  const ctx = { midia, rels: relsParte, doc: f.doc };
  const pars = f.paragrafos;
  let objs = [];
  let distancia = 36;
  if (pars.length) {
    const g0 = geometria(pars[0]);
    const gN = geometria(pars[pars.length - 1]);
    distancia = tipo === 'cabecalho' ? Math.max(0, g0.topo) : Math.max(0, f.altura - gN.fundo);
    objs = fluxoObjs(pars, f.area, ctx, { topo: g0.topo });
  } else if (f.figuras.length) {
    distancia = tipo === 'cabecalho' ? Math.max(0, Math.min(...f.figuras.map((g) => g.y0))) : Math.max(0, f.altura - Math.max(...f.figuras.map((g) => g.y1)));
  }
  if (!objs.length) objs.push({ tipo: 'p', antes: 0, linha: 1, tamanhoMarca: 1, corpo: '', ancoras: [] });
  const primeiro = objs.find((o) => o.tipo === 'p');
  for (const fig of f.figuras) primeiro.ancoras.push(figuraFlutuante({ ...fig, modo: 'atras' }, midia, relsParte, z.n++));
  const raiz = tipo === 'cabecalho' ? 'w:hdr' : 'w:ftr';
  return { xml: `${XML}<${raiz} ${NS}>${serializar(objs)}</${raiz}>`, rels: relsParte, distancia };
}

/* ---------------- documento ---------------- */

function estilos(doc) {
  const f = x(doc.fonte || 'Calibri');
  const sz = Math.round((doc.corpo || 11) * 2);
  return `${XML}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
    + `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${f}" w:cs="${f}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:lang w:val="pt-BR" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>`
    + '<w:pPrDefault><w:pPr><w:widowControl w:val="0"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Ttulo1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Ttulo2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:unhideWhenUsed/><w:qFormat/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>'
    + '<w:style w:type="table" w:default="1" w:styleId="TabelaNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
    + '</w:styles>';
}

const CONFIG = `${XML}<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="708"/><w:hyphenationZone w:val="425"/><w:characterSpacingControl w:val="doNotCompress"/>`
  + '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';

/** Fonte mais usada no texto (vira a fonte padrão do documento). */
function fonteDoCorpo(est) {
  const conta = new Map();
  const visitar = (els) => {
    for (const el of els) {
      if (el.tipo === 'paragrafo') for (const l of el.linhas) for (const s of l.segmentos) conta.set(s.fonte, (conta.get(s.fonte) || 0) + s.texto.length);
      if (el.tipo === 'colunas') for (const c of el.colunas) visitar(c.elementos);
    }
  };
  for (const p of est.paginas) visitar(p.fluxo);
  let melhor = 'Calibri';
  let max = 0;
  for (const [f, n] of conta) if (f && n > max) { max = n; melhor = f; }
  return melhor;
}

/**
 * @param {{titulo:string, estrutura:any}} op  estrutura = estrutura.estruturar(...)
 * @returns {Buffer}
 */
function docx({ titulo, estrutura: est }) {
  const midia = new Midia();
  const relsDoc = [
    { id: 'rIdEstilos', tipo: R.estilos, alvo: 'styles.xml' },
    { id: 'rIdConfig', tipo: R.config, alvo: 'settings.xml' },
  ];
  const doc = { ...est.doc, fonte: fonteDoCorpo(est) };
  const z = { n: 251658240 };
  const extras = {};
  const overrides = [];
  let refs = '';
  let titlePg = false;
  const distancias = { cabecalho: 36, rodape: 36 };
  for (const [tipo, f] of [['cabecalho', est.cabecalho], ['rodape', est.rodape]]) {
    if (!f) continue;
    const parte = faixaXml({ ...f, doc }, tipo, midia, z);
    const nome = tipo === 'cabecalho' ? 'header1.xml' : 'footer1.xml';
    extras[`word/${nome}`] = parte.xml;
    if (parte.rels.length) extras[`word/_rels/${nome}.rels`] = rels(parte.rels);
    overrides.push([`/word/${nome}`, `application/vnd.openxmlformats-officedocument.wordprocessingml.${tipo === 'cabecalho' ? 'header' : 'footer'}+xml`]);
    const rid = `rId${tipo === 'cabecalho' ? 'Cab' : 'Rod'}`;
    relsDoc.push({ id: rid, tipo: tipo === 'cabecalho' ? R_CABECALHO : R_RODAPE, alvo: nome });
    refs += `<w:${tipo === 'cabecalho' ? 'headerReference' : 'footerReference'} w:type="default" r:id="${rid}"/>`;
    distancias[tipo] = parte.distancia;
    if (f.primeiraSem) {
      titlePg = true;
      const nomeVazio = tipo === 'cabecalho' ? 'header2.xml' : 'footer2.xml';
      const raiz = tipo === 'cabecalho' ? 'w:hdr' : 'w:ftr';
      extras[`word/${nomeVazio}`] = `${XML}<${raiz} ${NS}><w:p/></${raiz}>`;
      overrides.push([`/word/${nomeVazio}`, `application/vnd.openxmlformats-officedocument.wordprocessingml.${tipo === 'cabecalho' ? 'header' : 'footer'}+xml`]);
      relsDoc.push({ id: `${rid}1`, tipo: tipo === 'cabecalho' ? R_CABECALHO : R_RODAPE, alvo: nomeVazio });
      refs += `<w:${tipo === 'cabecalho' ? 'headerReference' : 'footerReference'} w:type="first" r:id="${rid}1"/>`;
    }
  }

  // páginas com o mesmo tamanho e margens formam uma seção
  const ctx = { midia, rels: relsDoc, doc };
  const grupos = [];
  for (const p of est.paginas) {
    const chave = `${Math.round(p.largura)}x${Math.round(p.altura)}|${Math.round(p.area.x0)}|${Math.round(p.area.x1)}`;
    const g = grupos[grupos.length - 1];
    if (g && g.chave === chave) g.paginas.push(p); else grupos.push({ chave, paginas: [p] });
  }

  const corpo = [];
  grupos.forEach((g, gi) => {
    const primeira = g.paginas[0];
    // margem de cima: onde começa o conteúdo; de baixo: folga até o fim do conteúdo mais baixo
    const topos = [];
    const fundos = [];
    for (const p of g.paginas) {
      if (p.fluxo.length) topos.push(p.fluxo[0].tipo === 'paragrafo' ? geometria(p.fluxo[0]).topo : p.fluxo[0].topo);
      for (const el of p.fluxo) fundos.push(p.altura - (el.tipo === 'paragrafo' ? geometria(el).fundo : el.fundo));
    }
    const margemTopo = Math.max(0, Math.min(primeira.altura * 0.4, topos.length ? Math.min(...topos) : 36));
    const passoCorpo = (doc.passo || 1.2) * (doc.corpo || 11);
    const margemBase = Math.max(0, Math.min(primeira.altura * 0.3, (fundos.length ? Math.min(...fundos) : 36) - passoCorpo * 1.2));
    const sect = `<w:sectPr>${refs}<w:pgSz w:w="${tw(primeira.largura)}" w:h="${tw(primeira.altura)}"${primeira.largura > primeira.altura ? ' w:orient="landscape"' : ''}/>`
      + `<w:pgMar w:top="${tw(margemTopo)}" w:right="${tw(primeira.largura - primeira.area.x1)}" w:bottom="${tw(margemBase)}" w:left="${tw(primeira.area.x0)}" w:header="${tw(distancias.cabecalho)}" w:footer="${tw(distancias.rodape)}" w:gutter="0"/>`
      + `${gi === 0 && titlePg ? '<w:titlePg/>' : ''}</w:sectPr>`;

    const objsGrupo = [];
    g.paginas.forEach((p, pi) => {
      const objs = fluxoObjs(p.fluxo, p.area, ctx, { topo: margemTopo });
      // Depois de uma quebra de página o Word ignora o "espaço antes": a distância
      // até o topo vira um parágrafo vazio com a altura exata.
      if (objs[0] && objs[0].tipo === 'p' && !objs[0].espacador && (objs[0].antes || 0) > 0.5) {
        objs.unshift({ tipo: 'p', antes: 0, linha: objs[0].antes, tamanhoMarca: 1, corpo: '', ancoras: [], topo: margemTopo, espacador: true });
        objs[1].antes = 0;
      }
      // a página precisa de um parágrafo no começo (para a quebra de página e as âncoras)
      if (!objs.length || objs[0].tipo !== 'p') {
        const prox = objs.find((o) => o.topo != null);
        const altura = prox ? Math.max(1, prox.topo - margemTopo) : 1;
        if (objs[0] && objs[0].tipo === 'p') objs[0].antes = Math.max(0, (objs[0].antes || 0) - altura);
        objs.unshift({ tipo: 'p', antes: 0, linha: Math.min(altura, 1), tamanhoMarca: 1, corpo: '', ancoras: [], topo: margemTopo, espacador: true });
      }
      if (pi > 0) objs[0].quebraPagina = true;
      // figuras flutuantes: no parágrafo mais próximo acima delas
      const pars = objs.filter((o) => o.tipo === 'p');
      for (const f of p.flutuantes.slice().sort((a, b) => (a.modo === 'atras' ? -1 : 1) - (b.modo === 'atras' ? -1 : 1))) {
        let alvo = pars[0];
        for (const o of pars) if (o.topo != null && o.topo <= f.y0 + 1) alvo = o;
        alvo.ancoras.push(figuraFlutuante(f, midia, relsDoc, z.n++));
      }
      // texto sobre figura: caixas de texto, também presas ao parágrafo mais próximo acima
      for (const c of caixasDeTexto(p.molduras, midia, z)) {
        let alvo = pars[0];
        for (const o of pars) if (o.topo != null && o.topo <= c.y + 1) alvo = o;
        alvo.ancoras.push(c.xml);
      }
      objsGrupo.push(...objs);
    });
    if (gi < grupos.length - 1) {
      // fecha a seção num parágrafo (se a página terminar em tabela, num parágrafo mínimo)
      let ultimo = objsGrupo[objsGrupo.length - 1];
      if (!ultimo || ultimo.tipo !== 'p') {
        ultimo = { tipo: 'p', antes: 0, linha: 1, tamanhoMarca: 1, corpo: '', ancoras: [] };
        objsGrupo.push(ultimo);
      }
      ultimo.sectPr = sect;
    } else {
      if (objsGrupo.length && objsGrupo[objsGrupo.length - 1].tipo === 'xml') {
        objsGrupo.push({ tipo: 'p', antes: 0, linha: 1, tamanhoMarca: 1, corpo: '', ancoras: [] });
      }
    }
    corpo.push(serializar(objsGrupo));
    if (gi === grupos.length - 1) corpo.push(sect);
  });

  const documento = `${XML}<w:document ${NS}><w:body>${corpo.join('')}</w:body></w:document>`;
  return empacotar({
    '[Content_Types].xml': tipos([], [
      ['/word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'],
      ['/word/styles.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml'],
      ['/word/settings.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml'],
      ...overrides,
    ]),
    '_rels/.rels': rels([
      { id: 'rId1', tipo: R.doc, alvo: 'word/document.xml' },
      { id: 'rId2', tipo: R.core, alvo: 'docProps/core.xml' },
      { id: 'rId3', tipo: R.app, alvo: 'docProps/app.xml' },
    ]),
    'docProps/core.xml': core(titulo),
    'docProps/app.xml': APP,
    'word/document.xml': documento,
    'word/styles.xml': estilos(doc),
    'word/settings.xml': CONFIG,
    'word/_rels/document.xml.rels': rels(relsDoc),
    ...extras,
    ...midia.arquivos,
  });
}

module.exports = { docx, DESCIDA };
