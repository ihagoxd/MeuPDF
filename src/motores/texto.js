'use strict';

/**
 * Leitura "inteligente" do texto do PDF: linhas e colunas de tabela.
 * Base do PDF para texto/Excel e da tarja automática (o Word e o
 * PowerPoint usam a leitura completa de leitura.js).
 */

const pdfjs = require('./pdfjs');

/* ============================================================
   LINHAS
   ============================================================ */

/** Agrupa os trechos em linhas (de cima para baixo) e as linhas em células. */
function montarLinhas(itens) {
  const horizontais = itens.filter((i) => !i.vertical && i.texto.trim());
  horizontais.sort((a, b) => a.base - b.base || a.x - b.x);

  const linhas = [];
  for (const it of horizontais) {
    let alvo = null;
    for (let k = linhas.length - 1; k >= 0 && k >= linhas.length - 4; k -= 1) {
      const l = linhas[k];
      if (Math.abs(l.base - it.base) <= Math.max(l.tamanho, it.tamanho) * 0.45) { alvo = l; break; }
    }
    if (!alvo) {
      alvo = { itens: [], base: it.base, tamanho: it.tamanho };
      linhas.push(alvo);
    }
    alvo.itens.push(it);
    alvo.tamanho = Math.max(alvo.tamanho, it.tamanho);
  }

  for (const l of linhas) {
    l.itens.sort((a, b) => a.x - b.x);
    // trechos do mesmo "pedaço" (palavras de uma frase) x separação de colunas
    const celulas = [];
    let atual = null;
    for (const it of l.itens) {
      const fim = atual ? atual.x1 : 0;
      const folga = it.x - fim;
      const espaco = it.tamanho * 0.22;
      if (!atual || folga > Math.max(it.tamanho * 0.9, 7)) {
        atual = { texto: it.texto, x0: it.x, x1: it.x + it.l, negrito: it.negrito, italico: it.italico, segmentos: [{ texto: it.texto, negrito: it.negrito, italico: it.italico }] };
        celulas.push(atual);
      } else {
        const precisaEspaco = folga > espaco && !/\s$/.test(atual.texto) && !/^\s/.test(it.texto);
        const trecho = (precisaEspaco ? ' ' : '') + it.texto;
        atual.texto += trecho;
        atual.x1 = Math.max(atual.x1, it.x + it.l);
        atual.negrito = atual.negrito && it.negrito;
        atual.italico = atual.italico && it.italico;
        const ultimo = atual.segmentos[atual.segmentos.length - 1];
        if (ultimo.negrito === it.negrito && ultimo.italico === it.italico) ultimo.texto += trecho;
        else atual.segmentos.push({ texto: trecho, negrito: it.negrito, italico: it.italico });
      }
    }
    for (const c of celulas) c.texto = c.texto.replace(/\s+/g, ' ').trim();
    l.celulas = celulas.filter((c) => c.texto);
    l.x0 = l.celulas.length ? l.celulas[0].x0 : 0;
    l.x1 = l.celulas.length ? l.celulas[l.celulas.length - 1].x1 : 0;
    l.texto = l.celulas.map((c) => c.texto).join('   ');
    l.negrito = l.celulas.every((c) => c.negrito);
    l.italico = l.celulas.every((c) => c.italico);
    l.segmentos = l.celulas.flatMap((c, i) => (i ? [{ texto: '   ', negrito: false, italico: false }] : []).concat(c.segmentos));
    delete l.itens;
  }
  return linhas.filter((l) => l.celulas.length);
}

/* ============================================================
   TABELAS
   ============================================================ */

/**
 * Colunas a partir dos "corredores" vazios entre as células de várias linhas.
 * @returns {{x0:number,x1:number}[]}
 */
function colunasDe(linhas) {
  const celulas = linhas.flatMap((l) => l.celulas);
  if (!celulas.length) return [];
  const ini = Math.floor(Math.min(...celulas.map((c) => c.x0)));
  const fim = Math.ceil(Math.max(...celulas.map((c) => c.x1)));
  const cobertura = new Uint16Array(fim - ini + 2);
  for (const c of celulas) {
    for (let x = Math.floor(c.x0) - ini; x <= Math.ceil(c.x1) - ini; x += 1) cobertura[x] += 1;
  }
  const colunas = [];
  let comeco = null;
  for (let x = 0; x < cobertura.length; x += 1) {
    if (cobertura[x] && comeco === null) comeco = x;
    if (!cobertura[x] && comeco !== null) {
      colunas.push({ x0: comeco + ini, x1: x - 1 + ini });
      comeco = null;
    }
  }
  if (comeco !== null) colunas.push({ x0: comeco + ini, x1: cobertura.length - 1 + ini });
  return colunas;
}

function gradeDe(linhas, colunas) {
  return linhas.map((l) => {
    const linha = new Array(colunas.length).fill('');
    const negrito = new Array(colunas.length).fill(false);
    for (const c of l.celulas) {
      let k = colunas.findIndex((col) => c.x0 >= col.x0 - 2 && c.x0 <= col.x1 + 2);
      if (k < 0) {
        const meio = (c.x0 + c.x1) / 2;
        k = colunas.reduce((m, col, idx) => (Math.abs((col.x0 + col.x1) / 2 - meio) < Math.abs((colunas[m].x0 + colunas[m].x1) / 2 - meio) ? idx : m), 0);
      }
      linha[k] = linha[k] ? `${linha[k]} ${c.texto}` : c.texto;
      negrito[k] = c.negrito;
    }
    return { celulas: linha, negrito };
  });
}

/**
 * Divide as linhas da página em blocos de texto corrido e tabelas.
 * Tabela = pelo menos 2 linhas seguidas com 2+ células alinhadas.
 */
function blocos(linhas) {
  const saida = [];
  let i = 0;
  while (i < linhas.length) {
    if (linhas[i].celulas.length >= 2) {
      let j = i;
      while (j + 1 < linhas.length && linhas[j + 1].celulas.length >= 2
        && linhas[j + 1].base - linhas[j].base < linhas[j].tamanho * 3.2) j += 1;
      const grupo = linhas.slice(i, j + 1);
      const colunas = colunasDe(grupo);
      if (grupo.length >= 2 && colunas.length >= 2) {
        saida.push({ tipo: 'tabela', linhas: grupo, colunas, grade: gradeDe(grupo, colunas) });
        i = j + 1;
        continue;
      }
    }
    saida.push({ tipo: 'linha', linha: linhas[i] });
    i += 1;
  }
  return saida;
}

/* ============================================================
   TAMANHO DO CORPO
   ============================================================ */

function tamanhoDoCorpo(linhas) {
  const contagem = new Map();
  for (const l of linhas) {
    const t = Math.round(l.tamanho * 2) / 2;
    contagem.set(t, (contagem.get(t) || 0) + l.texto.length);
  }
  let melhor = 11;
  let max = 0;
  for (const [t, n] of contagem) if (n > max) { max = n; melhor = t; }
  return melhor;
}

/* ============================================================
   ENTRADAS DE ALTO NÍVEL
   ============================================================ */

/**
 * Lê o documento inteiro.
 * @returns {Promise<{paginas: {largura:number, altura:number, linhas:any[]}[], corpo:number}>}
 */
async function lerDocumento(caminho, { aoProgredir, checar, paginas } = {}) {
  const doc = await pdfjs.abrir(caminho);
  try {
    const saida = [];
    const lista = paginas || Array.from({ length: doc.numPages }, (_, i) => i + 1);
    for (let k = 0; k < lista.length; k += 1) {
      if (checar) checar();
      const n = lista[k];
      if (aoProgredir) aoProgredir(k / lista.length, n, doc.numPages);
      const { largura, altura, itens } = await pdfjs.textoDaPagina(doc, n);
      saida.push({ numero: n, largura, altura, linhas: montarLinhas(itens), itens });
    }
    const corpo = tamanhoDoCorpo(saida.flatMap((p) => p.linhas));
    return { paginas: saida, corpo, total: doc.numPages };
  } finally {
    doc.destroy();
  }
}

/** Texto corrido, com as colunas separadas por espaços. */
function textoDaPagina(pagina) {
  const saida = [];
  let ultimaBase = null;
  for (const l of pagina.linhas) {
    if (ultimaBase !== null && l.base - ultimaBase > l.tamanho * 2) saida.push('');
    // reproduz a distância entre colunas com espaços, aproximadamente
    let linha = '';
    for (const c of l.celulas) {
      if (linha) {
        const colunaAlvo = Math.round((c.x0 - pagina.linhas[0].x0) / (l.tamanho * 0.5));
        const faltam = Math.max(colunaAlvo - linha.length, 3);
        linha += ' '.repeat(Math.min(faltam, 40));
      }
      linha += c.texto;
    }
    saida.push(linha);
    ultimaBase = l.base;
  }
  return saida.join('\n');
}

/* ---------------- números e datas (Excel) ---------------- */

const RE_NUMERO_BR = /^(R\$\s?)?\(?-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?\)?(\s?%)?$/;
const RE_NUMERO_PONTO = /^-?\d+\.\d+$/;
const RE_DATA = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * @returns {{tipo:'numero'|'data'|'texto', valor:any, formato?:string}}
 */
function interpretarCelula(texto) {
  const t = String(texto || '').trim();
  if (!t) return { tipo: 'texto', valor: '' };
  const data = RE_DATA.exec(t);
  if (data) {
    const [d, m, a] = [Number(data[1]), Number(data[2]), Number(data[3])];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && a > 1900 && a < 2200) {
      const serial = (Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
      return { tipo: 'data', valor: serial, formato: 'data' };
    }
  }
  const compacto = t.replace(/\s+/g, ' ');
  if (RE_NUMERO_BR.test(compacto)) {
    // zero à esquerda (código, matrícula) continua texto
    const digitos = compacto.replace(/^R\$\s?|[()%\s-]/g, '');
    if (/^0\d/.test(digitos) && !digitos.includes(',')) return { tipo: 'texto', valor: t };
    if (/^\d{9,}$/.test(digitos)) return { tipo: 'texto', valor: t }; // CPF/processo sem pontuação
    let n = Number(digitos.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(n)) return { tipo: 'texto', valor: t };
    const negativo = /^\(.*\)$/.test(compacto) || compacto.includes('-');
    if (negativo) n = -Math.abs(n);
    if (compacto.endsWith('%')) return { tipo: 'numero', valor: n / 100, formato: 'porcentagem' };
    if (/^R\$/.test(compacto)) return { tipo: 'numero', valor: n, formato: 'moeda' };
    return { tipo: 'numero', valor: n, formato: digitos.includes(',') ? 'decimal' : 'inteiro' };
  }
  if (RE_NUMERO_PONTO.test(compacto) && compacto.length < 12) return { tipo: 'numero', valor: Number(compacto), formato: 'decimal' };
  return { tipo: 'texto', valor: t };
}

/* ---------------- localizar (tarja automática) ---------------- */

const PADROES = {
  cpf: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
  cnpj: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
  email: /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  telefone: /(?:\(?\b\d{2}\)?\s?)?(?:9\s?)?\d{4}[-\s]?\d{4}\b/g,
  rg: /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dxX]\b/g,
  cep: /\b\d{5}-\d{3}\b/g,
  data: /\b\d{2}\/\d{2}\/\d{4}\b/g,
};

function escaparRegex(t) {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Procura termos e padrões e devolve caixas normalizadas (0..1, canto
 * superior esquerdo) por página.
 */
async function localizar(caminho, { termos = [], padroes = [] } = {}) {
  const regexes = [];
  for (const p of padroes) if (PADROES[p]) regexes.push(new RegExp(PADROES[p].source, 'g'));
  for (const t of termos) {
    const limpo = String(t || '').trim();
    if (limpo.length >= 2) regexes.push(new RegExp(escaparRegex(limpo).replace(/\s+/g, '\\s+'), 'gi'));
  }
  if (!regexes.length) return [];

  const doc = await pdfjs.abrir(caminho);
  const achados = [];
  try {
    for (let n = 1; n <= doc.numPages; n += 1) {
      const { largura, altura, itens } = await pdfjs.textoDaPagina(doc, n);
      // junta os trechos da mesma linha para achar termos quebrados em pedaços
      for (const l of montarLinhasCruas(itens)) {
        const texto = l.partes.map((p) => p.texto).join('');
        for (const re of regexes) {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(texto))) {
            if (!m[0].trim()) { re.lastIndex += 1; continue; }
            const caixa = caixaDoTrecho(l.partes, m.index, m.index + m[0].length);
            if (caixa) {
              achados.push({
                pagina: n,
                texto: m[0],
                x: Math.max(caixa.x0 / largura, 0),
                y: Math.max(caixa.y0 / altura, 0),
                w: Math.min((caixa.x1 - caixa.x0) / largura, 1),
                h: Math.min((caixa.y1 - caixa.y0) / altura, 1),
              });
            }
          }
        }
      }
    }
  } finally {
    doc.destroy();
  }
  return achados;
}

/** Linhas com a posição de cada caractere (aproximada pela largura do trecho). */
function montarLinhasCruas(itens) {
  const horizontais = itens.filter((i) => !i.vertical && i.texto);
  horizontais.sort((a, b) => a.base - b.base || a.x - b.x);
  const linhas = [];
  for (const it of horizontais) {
    let alvo = linhas.find((l) => Math.abs(l.base - it.base) <= it.tamanho * 0.45);
    if (!alvo) { alvo = { base: it.base, itens: [] }; linhas.push(alvo); }
    alvo.itens.push(it);
  }
  return linhas.map((l) => {
    l.itens.sort((a, b) => a.x - b.x);
    const partes = [];
    let fim = null;
    for (const it of l.itens) {
      if (fim !== null && it.x - fim > it.tamanho * 0.2) partes.push({ texto: ' ', x0: fim, x1: it.x, y0: it.y, y1: it.y + it.a });
      const n = it.texto.length;
      for (let k = 0; k < n; k += 1) {
        partes.push({ texto: it.texto[k], x0: it.x + (it.l * k) / n, x1: it.x + (it.l * (k + 1)) / n, y0: it.y, y1: it.y + it.a * 1.08 });
      }
      fim = it.x + it.l;
    }
    return { partes };
  });
}

function caixaDoTrecho(partes, ini, fim) {
  // cada parte é um caractere (ou o espaço entre trechos)
  const sel = partes.slice(ini, fim);
  if (!sel.length) return null;
  const folga = 1;
  return {
    x0: Math.min(...sel.map((p) => p.x0)) - folga,
    x1: Math.max(...sel.map((p) => p.x1)) + folga,
    y0: Math.min(...sel.map((p) => p.y0)) - folga,
    y1: Math.max(...sel.map((p) => p.y1)) + folga,
  };
}

module.exports = {
  montarLinhas,
  blocos,
  colunasDe,
  tamanhoDoCorpo,
  lerDocumento,
  textoDaPagina,
  interpretarCelula,
  localizar,
  PADROES,
};
