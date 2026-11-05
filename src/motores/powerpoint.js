'use strict';

/**
 * PowerPoint editável (.pptx) a partir do PDF lido (leitura.js).
 *
 * Cada página vira um slide do mesmo tamanho. As figuras (fotos, logos,
 * formas, linhas) entram como imagens soltas, que dá para mover, e o texto
 * entra em caixas de texto com a fonte, o tamanho e a cor do PDF, cada uma
 * no lugar exato. As linhas ficam como estão no PDF (o PowerPoint não
 * reacomoda o texto); o justificado continua esticado até a borda.
 */

const { escapar: x, partes, pptx } = require('./ooxml');
const estrutura = require('./estrutura');

const { PT } = partes;
const emu = (pt) => Math.round(pt * PT);

// Com entrelinha exata no PowerPoint, a linha de base fica a esta fração da
// entrelinha abaixo do topo da linha.
const BASE_NA_LINHA = 0.77;

const ALINHAMENTO = { esquerda: 'l', centro: 'ctr', direita: 'r', justificado: 'just' };

function rPr(s) {
  const tam = Math.max(100, Math.round((s.tamanho || 12) * 100));
  const f = x(s.fonte || 'Calibri');
  return `<a:rPr lang="pt-BR" sz="${tam}" b="${s.negrito ? 1 : 0}" i="${s.italico ? 1 : 0}"${s.sublinhado ? ' u="sng"' : ''}${s.riscado ? ' strike="sngStrike"' : ''}${s.vert ? ` baseline="${s.vert === 'super' ? 30000 : -25000}"` : ''} dirty="0">`
    + `<a:solidFill><a:srgbClr val="${s.cor || '000000'}"/></a:solidFill>`
    + `<a:latin typeface="${f}"/><a:cs typeface="${f}"/></a:rPr>`;
}

// marcadores de lista vêm em fontes de símbolos; o caractere comum (•) sai na fonte do texto
const SIMBOLICAS = /^(Symbol|Wingdings.*|Webdings)$/;

function runs(p) {
  let xml = '';
  p.linhas.forEach((l, li) => {
    l.segmentos.forEach((s, si) => {
      const texto = (s.tab ? '\t' : '') + s.texto;
      const estilo = SIMBOLICAS.test(s.fonte) ? { ...s, fonte: (l.segmentos[si + 1] || {}).fonte || 'Arial' } : s;
      if (texto) xml += `<a:r>${rPr(estilo)}<a:t>${x(texto)}</a:t></a:r>`;
    });
    if (li < p.linhas.length - 1) {
      const u = l.segmentos[l.segmentos.length - 1];
      const prox = p.linhas[li + 1].segmentos[0] || u;
      // o espaço entre as linhas só é sublinhado se o texto dos dois lados for
      const espaco = { ...u, sublinhado: u.sublinhado && prox.sublinhado, riscado: u.riscado && prox.riscado };
      if (l.juntar === 'quebra') xml += `<a:br>${rPr({ ...u, sublinhado: false, riscado: false })}</a:br>`;
      else if (l.juntar === ' ') xml += `<a:r>${rPr(espaco)}<a:t> </a:t></a:r>`;
    }
  });
  return xml;
}

/** Bloco de texto -> caixa de texto do PowerPoint. */
function caixa(bloco, id) {
  const pars = bloco.paragrafos;
  const justificado = pars.some((p) => p.alinhamento === 'justificado');
  const largura = bloco.area.x1 - bloco.area.x0;
  // folga: o PowerPoint mede o texto um tiquinho mais largo que o PDF e não pode quebrar a linha
  const folga = justificado ? Math.max(4, largura * 0.015) : Math.max(8, largura * 0.2);
  const al = pars[0].alinhamento;
  const w = largura + folga;
  const xpos = al === 'centro' ? bloco.area.x0 - folga / 2 : al === 'direita' ? bloco.area.x1 - w : bloco.area.x0;
  const p0 = pars[0];
  const topo = p0.base0 - p0.passo * BASE_NA_LINHA;
  const ultimo = pars[pars.length - 1];
  const fundo = ultimo.baseN + ultimo.passo * (1 - BASE_NA_LINHA);
  let anterior = topo;
  // As linhas ficam exatamente como no PDF. No justificado, a quebra manual também
  // estica a linha até a borda da caixa, então ele continua justificado.
  for (const p of pars) for (const l of p.linhas.slice(0, -1)) l.juntar = 'quebra';
  const corpo = pars.map((p) => {
    const t = p.base0 - p.passo * BASE_NA_LINHA;
    const antes = Math.max(0, t - anterior);
    anterior = p.baseN + p.passo * (1 - BASE_NA_LINHA);
    const recuo = al === 'esquerda' || al === 'justificado' ? Math.max(0, (p.recuoEsq || 0) + (bloco.area.x0 - xpos)) : 0;
    const prim = Math.max(-recuo, p.recuoPrimeira || 0);
    return `<a:p><a:pPr algn="${ALINHAMENTO[p.alinhamento] || 'l'}"${recuo ? ` marL="${emu(recuo)}"` : ''}${prim ? ` indent="${emu(prim)}"` : ''}>`
      + `<a:lnSpc><a:spcPts val="${Math.max(100, Math.round(p.passo * 100))}"/></a:lnSpc><a:spcBef><a:spcPts val="${Math.round(antes * 100)}"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft><a:buNone/></a:pPr>`
      + `${runs(p)}<a:endParaRPr lang="pt-BR" sz="${Math.round((p.tamanho || 12) * 100)}" dirty="0"/></a:p>`;
  }).join('');
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Texto ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>`
    + `<p:spPr><a:xfrm><a:off x="${emu(xpos)}" y="${emu(topo)}"/><a:ext cx="${emu(w)}" cy="${emu(Math.max(4, fundo - topo))}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>`
    + `<p:txBody><a:bodyPr wrap="${justificado ? 'square' : 'none'}" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${corpo}</p:txBody></p:sp>`;
}

function figura(f, rid, id) {
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Figura ${id}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>`
    + `<p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`
    + `<p:spPr><a:xfrm><a:off x="${emu(f.x0)}" y="${emu(f.y0)}"/><a:ext cx="${emu(f.x1 - f.x0)}" cy="${emu(f.y1 - f.y0)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}

/**
 * @param {{titulo:string, lido:{paginas:any[]}}} op  lido = leitura.lerDocumento(..., { alvo: 'powerpoint' })
 * @returns {Buffer}
 */
function pptxEditavel({ titulo, lido }) {
  const doc = estrutura.medidas(lido.paginas);

  const paginas = lido.paginas.map((p) => {
    let id = 2;
    let formas = '';
    const midias = [];
    p.figuras.forEach((f, k) => {
      const rid = `rIdF${k + 1}`;
      midias.push({ rid, bytes: f.bytes, ext: f.ext });
      formas += figura(f, rid, id++);
    });
    for (const b of estrutura.blocosDeMoldura(p.itens, doc, { separarTabs: true })) {
      if (b.paragrafos.length) formas += caixa(b, id++);
    }
    return { largura: p.largura, altura: p.altura, formas, midias };
  });
  return pptx({ titulo, paginas });
}

module.exports = { pptxEditavel, BASE_NA_LINHA };
