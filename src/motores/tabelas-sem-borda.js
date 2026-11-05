'use strict';

/**
 * Tabelas sem linhas desenhadas (extrato bancário, relatório, artigo): texto em
 * colunas, com o mesmo vão vazio entre elas em todas as linhas. Saem no mesmo
 * formato das tabelas com borda (leitura.acharTabelas); os filetes horizontais
 * e os fundos de linha (zebrado, cabeçalho colorido) entram na tabela.
 */

const VAO = 4; // menor vão entre duas colunas (pt)

function mediana(v) {
  const o = v.slice().sort((a, b) => a - b);
  return o.length ? o[o.length >> 1] : 0;
}

/** Trechos -> linhas (pela linha de base) -> pedaços (trechos colados um no outro). */
function linhasDe(itens) {
  const ord = itens.slice().sort((a, b) => a.base - b.base || a.x0 - b.x0);
  const linhas = [];
  for (const it of ord) {
    let alvo = null;
    for (let k = linhas.length - 1; k >= 0 && k >= linhas.length - 4; k -= 1) {
      if (Math.abs(linhas[k].base - it.base) <= Math.min(linhas[k].tamanho, it.tamanho) * 0.35) { alvo = linhas[k]; break; }
    }
    if (!alvo) { alvo = { itens: [], base: it.base, tamanho: it.tamanho }; linhas.push(alvo); }
    alvo.itens.push(it);
    if (it.tamanho > alvo.tamanho) alvo.tamanho = it.tamanho;
  }
  for (const l of linhas) {
    l.itens.sort((a, b) => a.x0 - b.x0);
    l.pedacos = [];
    for (const it of l.itens) {
      const u = l.pedacos[l.pedacos.length - 1];
      const espaco = u && it.espacoDesde != null && it.espacoDesde <= u.x1 + 1;
      if (u && (espaco || it.x0 - u.x1 < Math.max(Math.min(it.tamanho, u.tamanho) * 0.8, 3))) {
        u.itens.push(it);
        u.x1 = Math.max(u.x1, it.x1);
      } else l.pedacos.push({ itens: [it], x0: it.x0, x1: it.x1 });
    }
  }
  return linhas;
}

const topoDe = (l) => Math.min(...l.pedacos.flatMap((p) => p.itens.map((i) => i.topo)));
const fundoDe = (l) => Math.max(...l.pedacos.flatMap((p) => p.itens.map((i) => i.fundo)));
const textoDe = (p) => p.itens.map((i) => i.texto).join(' ').replace(/\s+/g, ' ').trim();

/** Vãos verticais vazios entre o conteúdo de um grupo de linhas. */
function vaosDe(linhas) {
  const iv = [];
  for (const l of linhas) for (const p of l.pedacos) iv.push([p.x0, p.x1]);
  iv.sort((a, b) => a[0] - b[0]);
  const saida = [];
  let fim = iv[0][1];
  for (const [a, b] of iv.slice(1)) {
    if (a - fim >= VAO) saida.push([fim, a]);
    fim = Math.max(fim, b);
  }
  return saida;
}

/** A linha nova não tampou nenhum dos vãos que já existiam? */
function preserva(antes, depois) {
  return antes.every((g) => depois.some((d) => Math.min(g[1], d[1]) - Math.max(g[0], d[0]) >= VAO * 0.75));
}

function colunasDe(linhas) {
  const vaos = vaosDe(linhas);
  const x0 = Math.min(...linhas.flatMap((l) => l.pedacos.map((p) => p.x0)));
  const x1 = Math.max(...linhas.flatMap((l) => l.pedacos.map((p) => p.x1)));
  const cols = [];
  let ini = x0;
  for (const [a, b] of vaos) { cols.push({ x0: ini, x1: a }); ini = b; }
  cols.push({ x0: ini, x1 });
  return { cols, vaos };
}

const colunaDoPedaco = (cols, p) => {
  const m = (p.x0 + p.x1) / 2;
  let j = cols.findIndex((c) => m >= c.x0 - 0.5 && m <= c.x1 + 0.5);
  if (j < 0) j = cols.reduce((best, c, k) => (Math.abs((c.x0 + c.x1) / 2 - m) < Math.abs((cols[best].x0 + cols[best].x1) / 2 - m) ? k : best), 0);
  return j;
};

/** Corta da corrida o que não é da tabela: coluna de texto ao lado, linhas soltas em cima ou embaixo. */
function aparar(corrida) {
  let run = corrida;
  for (let volta = 0; volta < 40 && run.length >= 2; volta += 1) {
    const { cols } = colunasDe(run);
    const nc = cols.length;
    if (nc < 3) return run;
    const ocup = run.map((l) => new Set(l.pedacos.map((p) => colunaDoPedaco(cols, p))));
    let cortar = -1;
    for (const j of [0, nc - 1]) {
      // linhas que só têm esta coluna: outro bloco de texto ao lado (coluna de artigo, barra lateral)
      const sozinha = ocup.filter((o) => o.size === 1 && o.has(j)).length;
      const pedacos = run.flatMap((l) => l.pedacos.filter((p) => colunaDoPedaco(cols, p) === j));
      const textos = pedacos.map(textoDe);
      const prosa = textos.length && mediana(textos.map((t) => t.length)) >= 28 && mediana(textos.map((t) => t.split(' ').length)) >= 4;
      if (sozinha >= run.length * 0.3 || prosa) { cortar = j; break; }
    }
    if (cortar >= 0) {
      run = run.map((l) => ({ ...l, pedacos: l.pedacos.filter((p) => colunaDoPedaco(cols, p) !== cortar) })).filter((l) => l.pedacos.length);
      continue;
    }
    // linha da ponta com algo numa coluna que quase só ela usa: não é da tabela
    const conta = cols.map((_, j) => ocup.filter((o) => o.has(j)).length);
    const rara = (j) => conta[j] <= Math.max(1, Math.floor(run.length * 0.12));
    if ([...ocup[0]].some(rara)) { run = run.slice(1); continue; }
    if ([...ocup[ocup.length - 1]].some(rara)) { run = run.slice(0, -1); continue; }
    return run;
  }
  return run;
}

/** Linhas -> fileiras da tabela (linha que continua o texto da de cima entra na mesma célula). */
function fileirasDe(run, cols) {
  const passos = run.slice(1).map((l, i) => l.base - run[i].base);
  const passo = mediana(passos);
  const fileiras = [];
  run.forEach((l, i) => {
    const ocup = new Set(l.pedacos.map((p) => colunaDoPedaco(cols, p)));
    const ant = fileiras[fileiras.length - 1];
    if (ant && i > 0) {
      const d = l.base - run[i - 1].base;
      const subconj = [...ocup].every((j) => ant.ocup.has(j));
      if (subconj && ocup.size <= Math.max(1, Math.floor(cols.length / 2)) && d < passo * 0.8 && d <= l.tamanho * 1.45) {
        ant.linhas.push(l);
        return;
      }
    }
    fileiras.push({ linhas: [l], ocup });
  });
  for (const f of fileiras) {
    f.topo = Math.min(...f.linhas.map(topoDe));
    f.fundo = Math.max(...f.linhas.map(fundoDe));
  }
  return fileiras;
}

function validar(run, cols, fileiras) {
  const nc = cols.length;
  const nf = fileiras.length;
  if (nc < 3 || nc > 30 || nf < 2) return false;
  const conta = cols.map((_, j) => fileiras.filter((f) => f.ocup.has(j)).length);
  // duas linhas só valem como tabela se forem uma grade cheia (rótulo: valor lado a lado)
  if (nf === 2 && (nc < 4 || conta.some((n) => n < 2))) return false;
  if (conta.filter((n) => n >= nf * 0.6).length < 2) return false;
  if (fileiras.filter((f) => f.ocup.size >= 2).length < nf * 0.6) return false;
  // texto corrido em várias colunas (jornal) não é tabela
  const prosa = cols.every((_, j) => {
    const t = run.flatMap((l) => l.pedacos.filter((p) => colunaDoPedaco(cols, p) === j)).map(textoDe);
    return mediana(t.map((x) => x.length)) >= 25;
  });
  return !prosa;
}

/** Alinhamento de cada coluna: esquerda, direita (números) ou centro. */
function alinhamentos(cols, fileiras) {
  return cols.map((_, j) => {
    const caixas = [];
    for (const f of fileiras) {
      const ps = f.linhas.flatMap((l) => l.pedacos.filter((p) => colunaDoPedaco(cols, p) === j));
      if (ps.length) caixas.push({ x0: Math.min(...ps.map((p) => p.x0)), x1: Math.max(...ps.map((p) => p.x1)) });
    }
    if (caixas.length < 2) return 'esquerda';
    const junto = (v) => { const m = mediana(v); return v.filter((x) => Math.abs(x - m) <= 1.5).length / v.length; };
    const esq = junto(caixas.map((c) => c.x0));
    const dir = junto(caixas.map((c) => c.x1));
    const cen = junto(caixas.map((c) => (c.x0 + c.x1) / 2));
    if (esq >= 0.8 || esq >= dir) return 'esquerda';
    if (dir >= 0.7) return 'direita';
    if (cen >= 0.7) return 'centro';
    return 'esquerda';
  });
}

/** Retângulos de mesma cor lado a lado (o fundo de cada célula) viram uma faixa só. */
function faixasDeFundo(retangulos) {
  const ord = retangulos.slice().sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const faixas = [];
  for (const r of ord) {
    const f = faixas.find((g) => g.cor === r.cor && Math.abs(g.y0 - r.y0) < 0.8 && Math.abs(g.y1 - r.y1) < 0.8 && r.x0 <= g.x1 + 1.5 && r.x1 >= g.x0 - 1.5);
    if (f) { f.x0 = Math.min(f.x0, r.x0); f.x1 = Math.max(f.x1, r.x1); f.partes.push(r); } else faixas.push({ ...r, partes: [r] });
  }
  return faixas;
}

function cobre(lista, pos, a, b) {
  const perto = lista.filter((s) => Math.abs(s.pos - pos) <= 1.2 && s.a1 > a && s.a0 < b);
  let coberto = 0;
  for (const s of perto) coberto += Math.min(s.a1, b) - Math.max(s.a0, a);
  return coberto >= (b - a) * 0.85 ? perto.reduce((m, s) => (s.a1 - s.a0 > m.a1 - m.a0 ? s : m)) : null;
}

function montarTabela(run, cols, fileiras, horizontais, faixas) {
  const nf = fileiras.length;
  const vaos = cols.slice(1).map((c, j) => c.x0 - cols[j].x1);
  const folgaX = Math.max(1, Math.min(4, Math.min(...vaos) / 2));
  const xs = [cols[0].x0 - folgaX, ...cols.slice(1).map((c, j) => (cols[j].x1 + c.x0) / 2), cols[cols.length - 1].x1 + folgaX];
  const tx0 = xs[0];
  const tx1 = xs[xs.length - 1];
  const largura = tx1 - tx0;
  const vaosY = fileiras.slice(1).map((f, i) => f.topo - fileiras[i].fundo);
  const passo = mediana(fileiras.slice(1).map((f, i) => f.linhas[0].base - fileiras[i].linhas[0].base)) || fileiras[0].linhas[0].tamanho * 1.4;
  const folgaY = Math.max(0.8, Math.min(4, (vaosY.length ? mediana(vaosY) : 3) / 2));
  const ys = [fileiras[0].topo - folgaY];
  for (let i = 1; i < nf; i += 1) ys.push((fileiras[i - 1].fundo + fileiras[i].topo) / 2);
  ys.push(fileiras[nf - 1].fundo + folgaY);
  // limites possíveis de cada divisa (sem atravessar o texto)
  // (nas pontas, só um filete colado no texto: a linha embaixo de um título não é da tabela)
  const ponta = Math.max(4, passo * 0.35);
  const minY = (k) => (k === 0 ? fileiras[0].topo - ponta : fileiras[k - 1].fundo - 1.5);
  const maxY = (k) => (k === nf ? fileiras[nf - 1].fundo + ponta : fileiras[k].topo + 1.5);
  const fixo = new Array(nf + 1).fill(false);
  const usadosSeg = new Set();
  const usadosRet = new Set();

  // filetes horizontais: viram a borda da divisa mais perto
  // (um filete bem mais largo que a tabela é de outra coisa: a linha embaixo do título da página)
  const filetes = horizontais.filter((s) => s.esp <= 3 && s.a1 - s.a0 <= largura * 1.15 + 6
    && Math.min(s.a1, tx1) - Math.max(s.a0, tx0) >= Math.min(largura * 0.4, (s.a1 - s.a0) * 0.9) && s.pos >= minY(0) && s.pos <= maxY(nf));
  const divisaDe = new Map();
  for (const s of filetes) {
    let k = -1;
    for (let i = 0; i <= nf; i += 1) {
      if (s.pos < minY(i) || s.pos > maxY(i)) continue;
      if (k < 0 || Math.abs(ys[i] - s.pos) < Math.abs(ys[k] - s.pos)) k = i;
    }
    if (k < 0) continue;
    if (!divisaDe.has(k)) divisaDe.set(k, []);
    divisaDe.get(k).push(s);
    usadosSeg.add(s);
  }
  for (const [k, ss] of divisaDe) {
    const s = ss.reduce((m, x) => (x.a1 - x.a0 > m.a1 - m.a0 ? x : m));
    ys[k] = s.pos;
    fixo[k] = true;
  }
  // fundos de linha: as divisas encostam na borda do fundo
  const fundos = faixas.filter((r) => Math.min(r.x1, tx1) - Math.max(r.x0, tx0) >= largura * 0.3 && r.y1 > fileiras[0].topo - ponta && r.y0 < fileiras[nf - 1].fundo + ponta);
  for (const r of fundos) {
    for (const borda of [r.y0, r.y1]) {
      let k = -1;
      for (let i = 0; i <= nf; i += 1) {
        if (fixo[i] || borda < minY(i) || borda > maxY(i)) continue;
        if (Math.abs(ys[i] - borda) > Math.max(2, passo * 0.45)) continue;
        if (k < 0 || Math.abs(ys[i] - borda) < Math.abs(ys[k] - borda)) k = i;
      }
      if (k >= 0) ys[k] = borda;
    }
  }
  for (let i = 1; i <= nf; i += 1) if (ys[i] <= ys[i - 1] + 0.5) ys[i] = ys[i - 1] + 0.5;

  const alin = alinhamentos(cols, fileiras);
  const bordaDe = (k, a, b) => {
    const ss = divisaDe.get(k);
    const s = ss && cobre(ss, ys[k], a, b);
    return s ? { esp: s.esp, cor: s.cor } : null;
  };
  const celulas = [];
  for (let i = 0; i < nf; i += 1) {
    for (let j = 0; j < cols.length; j += 1) {
      const cx0 = xs[j];
      const cx1 = xs[j + 1];
      const cy0 = ys[i];
      const cy1 = ys[i + 1];
      const fundo = fundos.find((r) => {
        const ix = Math.min(r.x1, cx1) - Math.max(r.x0, cx0);
        const iy = Math.min(r.y1, cy1) - Math.max(r.y0, cy0);
        return ix > 0 && iy > 0 && ix * iy >= (cx1 - cx0) * (cy1 - cy0) * 0.8;
      });
      if (fundo) for (const p of fundo.partes) usadosRet.add(p);
      const itens = fileiras[i].linhas.flatMap((l) => l.pedacos.filter((p) => colunaDoPedaco(cols, p) === j).flatMap((p) => p.itens));
      celulas.push({
        lin: i, col: j, spanC: 1, spanL: 1,
        x0: cx0, x1: cx1, y0: cy0, y1: cy1,
        bordas: { t: bordaDe(i, cx0, cx1), b: bordaDe(i + 1, cx0, cx1), l: null, r: null },
        fundo: fundo ? fundo.cor : null,
        alinhamento: alin[j],
        itens,
      });
    }
  }
  return {
    tabela: {
      x0: tx0, y0: ys[0], x1: tx1, y1: ys[nf], colunas: xs, linhas: ys, celulas, semBorda: true,
      conteudo: { x0: cols[0].x0, x1: cols[cols.length - 1].x1 },
    },
    usadosSeg,
    usadosRet,
  };
}

/**
 * @param {any[]} itens  trechos de texto livres (fora das tabelas com borda)
 * @param {{horizontais:any[], retangulos:any[]}} formas  o que sobrou das formas
 */
function acharTabelasSemBorda(itens, { horizontais = [], retangulos = [] } = {}) {
  const linhas = linhasDe(itens.filter((it) => it.texto.trim()));
  const tabelas = [];
  const usadosItens = new Set();
  const usadosSeg = new Set();
  const usadosRet = new Set();
  const faixas = faixasDeFundo(retangulos);
  const ocupadas = new Set();
  // de novo até não achar mais nada: linhas cortadas da ponta de uma tabela podem formar outra
  for (let volta = 0, achou = true; achou && volta < 6; volta += 1) {
  achou = false;
  for (let i = 0; i < linhas.length; i += 1) {
    if (ocupadas.has(i) || linhas[i].pedacos.length < 3) continue;
    let run = [linhas[i]];
    const indices = [i];
    let vaos = vaosDe(run);
    for (let k = i + 1; k < linhas.length; k += 1) {
      if (ocupadas.has(k)) break;
      const L = linhas[k];
      const ult = run[run.length - 1];
      const passos = run.slice(1).map((l, j) => l.base - run[j].base);
      const passo = passos.length ? mediana(passos) : 0;
      const limite = passo ? Math.max(passo * 2.2, L.tamanho * 1.8) : Math.max(ult.tamanho, L.tamanho) * 3.2;
      if (L.base - ult.base > limite) break;
      const novos = vaosDe([...run, L]);
      if (!preserva(vaos, novos)) break;
      run.push(L);
      indices.push(k);
      vaos = novos;
    }
    if (run.length < 2) continue;
    run = aparar(run);
    if (run.length < 2) continue;
    const { cols } = colunasDe(run);
    const fileiras = fileirasDe(run, cols);
    if (!validar(run, cols, fileiras)) continue;
    const m = montarTabela(run, cols, fileiras, horizontais.filter((s) => !usadosSeg.has(s)), faixas.filter((f) => !f.partes.some((p) => usadosRet.has(p))));
    tabelas.push(m.tabela);
    for (const s of m.usadosSeg) usadosSeg.add(s);
    for (const r of m.usadosRet) usadosRet.add(r);
    for (const l of run) for (const p of l.pedacos) for (const it of p.itens) usadosItens.add(it);
    // o que sobrou das linhas usadas (texto ao lado da tabela) continua disponível
    for (const k of indices) {
      linhas[k] = { ...linhas[k], pedacos: linhas[k].pedacos.filter((p) => !p.itens.some((it) => usadosItens.has(it))) };
      if (!linhas[k].pedacos.length) ocupadas.add(k);
    }
    achou = true;
  }
  }
  return {
    tabelas,
    livres: itens.filter((it) => !usadosItens.has(it)),
    horizontais: horizontais.filter((s) => !usadosSeg.has(s)),
    retangulos: retangulos.filter((r) => !usadosRet.has(r)),
    usados: { segmentos: [...usadosSeg], retangulos: [...usadosRet] },
  };
}

module.exports = { acharTabelasSemBorda };
