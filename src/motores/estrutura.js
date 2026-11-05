'use strict';

/**
 * Da página lida (leitura.js) para a estrutura de um documento editável:
 * linhas, parágrafos (alinhamento, recuos, entrelinha), listas, blocos lado a
 * lado, figuras no fluxo ou flutuando ao lado do texto, texto por cima de
 * figura e o cabeçalho/rodapé que se repete nas páginas.
 * Coordenadas em pontos, y para baixo.
 */

const MARCADOR = /^([•▪➢❖✓□■❑◆➔⇨○●◦►▶‣⁃∙·*–—-]|\d{1,3}[.)ºª°]|\(?[a-zA-Z][.)]|\(\d{1,3}\)|[IVXLCivxlc]{1,6}[.)])$/;
const FIM_DE_FRASE = /[.:;!?…]["”'’)\]]?$/;

function mediana(v) {
  if (!v.length) return 0;
  const s = v.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function moda(valores, passo = 1) {
  const c = new Map();
  for (const v of valores) { const k = Math.round(v / passo); c.set(k, (c.get(k) || 0) + 1); }
  let melhor = null;
  let max = 0;
  for (const [k, n] of c) if (n > max || (n === max && k < melhor)) { max = n; melhor = k; }
  return melhor === null ? null : melhor * passo;
}

const chaveEstilo = (s) => `${s.fonte}|${s.tamanho}|${s.negrito}|${s.italico}|${s.sublinhado}|${s.riscado}|${s.cor}|${s.destaque}`;

/* ============================================================
   LINHAS
   ============================================================ */

/**
 * Trechos -> linhas (pela linha de base) -> pedaços com o mesmo estilo.
 * Distância grande entre trechos vira tabulação.
 */
function montarLinhas(itens) {
  const lista = itens.slice().sort((a, b) => a.base - b.base || a.x0 - b.x0);
  const linhas = [];
  for (const it of lista) {
    let alvo = null;
    for (let k = linhas.length - 1; k >= 0 && k >= linhas.length - 6; k -= 1) {
      const l = linhas[k];
      if (Math.abs(l.base - it.base) <= Math.min(l.tamanho, it.tamanho) * 0.5) { alvo = l; break; }
    }
    if (!alvo) { alvo = { itens: [], base: it.base, tamanho: it.tamanho }; linhas.push(alvo); }
    alvo.itens.push(it);
    if (it.tamanho > alvo.tamanho) { alvo.tamanho = it.tamanho; alvo.base = it.base; }
  }
  for (const l of linhas) {
    l.itens.sort((a, b) => a.x0 - b.x0);
    const segs = [];
    let anterior = null;
    for (const it of l.itens) {
      let sep = '';
      if (anterior) {
        const folga = it.x0 - anterior.x1;
        if (folga > Math.max(it.tamanho * 1.6, 10)) sep = '\t';
        else if (folga > it.tamanho * 0.12 && !/\s$/.test(anterior.texto) && !/^\s/.test(it.texto)) sep = ' ';
      }
      const ultimo = segs[segs.length - 1];
      const texto = it.texto.replace(/\s+/g, ' ');
      if (ultimo && sep !== '\t' && chaveEstilo(ultimo) === chaveEstilo(it)) {
        ultimo.texto += sep + texto;
        ultimo.x1 = Math.max(ultimo.x1, it.x1);
      } else {
        segs.push({
          texto: (sep === ' ' ? ' ' : '') + texto,
          tab: sep === '\t',
          x0: it.x0, x1: it.x1,
          fonte: it.fonte, tamanho: it.tamanho, negrito: it.negrito, italico: it.italico,
          sublinhado: it.sublinhado, riscado: it.riscado, cor: it.cor, destaque: it.destaque,
          base: it.base,
        });
      }
      anterior = it;
    }
    if (segs.length) segs[0].texto = segs[0].texto.replace(/^\s+/, '');
    segs[segs.length - 1].texto = segs[segs.length - 1].texto.replace(/\s+$/, '');
    l.segmentos = segs.filter((s) => s.texto.length || s.tab);
    l.x0 = l.itens[0].x0;
    l.x1 = Math.max(...l.itens.map((i) => i.x1));
    l.topo = Math.min(...l.itens.map((i) => i.topo));
    l.fundo = Math.max(...l.itens.map((i) => i.fundo));
    l.texto = l.segmentos.map((s) => (s.tab ? '\t' : '') + s.texto).join('');
    // marcador de lista: "•", "1.", "a)" seguido de um espaço largo
    const s0 = l.segmentos[0];
    const s1 = l.segmentos[1];
    if (s0 && s1 && MARCADOR.test(s0.texto.trim()) && s1.x0 - s0.x1 > s0.tamanho * 0.45) {
      l.marcador = { texto: s0.texto.trim(), x0: s0.x0, textoX: s1.x0 };
    }
    delete l.itens;
  }
  return linhas.filter((l) => l.segmentos.length);
}

/** Largura aproximada da primeira palavra da linha (para saber se ela caberia na linha de cima). */
function primeiraPalavra(l) {
  const s = l.segmentos.find((x) => x.texto.trim());
  if (!s) return 0;
  const palavra = s.texto.trim().split(/\s+/)[0];
  const letras = Math.max(1, s.texto.length);
  return ((s.x1 - s.x0) * palavra.length) / letras;
}

/* ============================================================
   BLOCOS LADO A LADO (corte XY)
   ============================================================ */

function linhasDistintas(caixas) {
  const bases = caixas.filter((c) => c.tipo === 'item').map((c) => c.ref.base).sort((a, b) => a - b);
  let n = 0;
  let ultima = -Infinity;
  for (const b of bases) { if (b - ultima > 2) { n += 1; ultima = b; } }
  return n + caixas.filter((c) => c.tipo === 'figura').length * 2;
}

function soMarcadores(caixas) {
  return caixas.every((c) => c.tipo === 'item' && c.ref.texto.trim().length <= 4 && MARCADOR.test(c.ref.texto.trim()));
}

function cortarColunas(caixas, tamanho) {
  const ord = caixas.slice().sort((a, b) => a.x0 - b.x0);
  const minimo = Math.max(9, tamanho * 0.9);
  const grupos = [[ord[0]]];
  let fim = ord[0].x1;
  for (const c of ord.slice(1)) {
    if (c.x0 - fim >= minimo) grupos.push([]);
    grupos[grupos.length - 1].push(c);
    fim = Math.max(fim, c.x1);
  }
  if (grupos.length < 2) return null;
  if (grupos.some((g) => linhasDistintas(g) < 2 || soMarcadores(g))) return null;
  return grupos;
}

function cortarFaixas(caixas) {
  const ord = caixas.slice().sort((a, b) => a.y0 - b.y0);
  const faixas = [[ord[0]]];
  let fim = ord[0].y1;
  for (const c of ord.slice(1)) {
    if (c.y0 > fim + 0.1) faixas.push([]);
    faixas[faixas.length - 1].push(c);
    fim = Math.max(fim, c.y1);
  }
  return faixas;
}

/**
 * Árvore: pilha (de cima para baixo), colunas (lado a lado) e folhas.
 * Primeiro corta em faixas horizontais; só dentro de uma faixa contínua é que
 * procura colunas (blocos realmente lado a lado).
 */
/** Vãos verticais (sem nada) de uma faixa, entre o começo e o fim do conteúdo. */
function vaos(caixas, minimo) {
  const ord = caixas.slice().sort((a, b) => a.x0 - b.x0);
  const saida = [];
  let fim = ord[0].x1;
  for (const c of ord.slice(1)) {
    if (c.x0 - fim >= minimo) saida.push([fim, c.x0]);
    fim = Math.max(fim, c.x1);
  }
  return saida;
}

/**
 * Faixas seguidas que têm o mesmo vão vertical (duas colunas de texto, cujos
 * parágrafos às vezes terminam na mesma altura) voltam a ser uma faixa só.
 */
function juntarFaixasComColunas(faixas, tamanho) {
  const minimo = Math.max(9, tamanho * 0.9);
  const saida = [];
  let atual = null;
  for (const f of faixas) {
    const v = vaos(f, minimo);
    if (atual && v.length) {
      const comum = atual.vaos.map((a) => v.map((b) => [Math.max(a[0], b[0]), Math.min(a[1], b[1])]).filter((c) => c[1] - c[0] >= 4)).flat();
      if (comum.length) { atual.caixas.push(...f); atual.vaos = comum; continue; }
    }
    atual = { caixas: f.slice(), vaos: v };
    saida.push(atual);
  }
  return saida.map((s) => s.caixas);
}

function cortarXY(caixas, tamanho, prof = 0) {
  if (caixas.length <= 1 || prof > 14) return { tipo: 'folha', caixas };
  const faixas = juntarFaixasComColunas(cortarFaixas(caixas), tamanho);
  if (faixas.length === 1) {
    const cols = cortarColunas(caixas, tamanho);
    if (cols) return { tipo: 'colunas', filhos: cols.map((g) => cortarXY(g, tamanho, prof + 1)) };
    return { tipo: 'folha', caixas };
  }
  {
    // dentro de uma faixa pode haver colunas; faixas simples seguidas voltam a ser uma folha só
    const filhos = faixas.map((f) => cortarXY(f, tamanho, prof + 1));
    const juntos = [];
    for (const f of filhos) {
      const u = juntos[juntos.length - 1];
      if (f.tipo === 'folha' && u && u.tipo === 'folha') u.caixas.push(...f.caixas);
      else if (f.tipo === 'pilha') juntos.push(...f.filhos);
      else juntos.push(f);
    }
    return juntos.length === 1 ? juntos[0] : { tipo: 'pilha', filhos: juntos };
  }
}

/* ============================================================
   PARÁGRAFOS
   ============================================================ */

/**
 * @param {any[]} linhas    de cima para baixo (podem vir figuras: {figura})
 * @param {{x0:number, x1:number}} area  margens do trecho (página, coluna ou célula)
 * @param {{passo:number, corpo:number}} doc
 * @param {any[]} flutuantes  figuras com texto em volta (para saber onde a linha acaba)
 */
function paragrafos(linhas, area, doc, flutuantes = []) {
  const limites = (l) => {
    let esq = area.x0;
    let dir = area.x1;
    for (const f of flutuantes) {
      if (l.fundo <= f.y0 || l.topo >= f.y1) continue;
      if (f.x0 >= l.x1 - 1) dir = Math.min(dir, f.x0 - f.distE);
      else if (f.x1 <= l.x0 + 1) esq = Math.max(esq, f.x1 + f.distD);
    }
    return { esq, dir };
  };
  const saida = [];
  let p = null;

  const fechar = () => {
    if (!p) return;
    finalizar(p, area, doc);
    saida.push(p);
    p = null;
  };

  for (const l of linhas) {
    if (l.figura) {
      fechar();
      saida.push({ tipo: 'figuras', figuras: l.figuras, topo: l.topo, fundo: l.fundo, x0: l.x0, x1: l.x1 });
      continue;
    }
    l.limites = limites(l);
    if (p && continua(p, l, doc)) {
      const ant = p.linhas[p.linhas.length - 1];
      const coube = ant.x1 + ant.tamanho * 0.28 + primeiraPalavra(l) <= ant.limites.dir + 1;
      ant.juntar = coube ? 'quebra' : /-$/.test(ant.texto) ? '' : ' ';
      p.linhas.push(l);
    } else {
      fechar();
      p = { tipo: 'paragrafo', linhas: [l] };
    }
  }
  fechar();
  return saida;
}

function continua(p, l, doc) {
  const ant = p.linhas[p.linhas.length - 1];
  const primeira = p.linhas[0];
  const passo = l.base - ant.base;
  if (passo <= 0) return false;
  if (l.marcador) return false;
  if (Math.abs(l.tamanho - ant.tamanho) > Math.max(1, ant.tamanho * 0.12)) return false;
  const passoDoc = (doc.passo || 1.2) * Math.max(l.tamanho, ant.tamanho);
  const passoPar = p.linhas.length >= 2 ? p.linhas[1].base - p.linhas[0].base : null;
  const esperado = passoPar || passoDoc;
  if (passo > esperado * 1.12 + 1 || (passoPar && passo < passoPar * 0.85 - 1)) return false;
  // alinhamento das bordas
  const x0 = l.x0 - l.limites.esq;
  const ax0 = ant.x0 - ant.limites.esq;
  const centro = (z) => (z.x0 + z.x1) / 2;
  const centralizadas = Math.abs(centro(l) - centro(ant)) <= 3 && Math.abs(x0 - ax0) > 3;
  const direita = Math.abs(l.x1 - ant.x1) <= 2 && Math.abs(x0 - ax0) > 3;
  const esquerdaDoPar = p.linhas.length >= 2 ? p.linhas[1].x0 - p.linhas[1].limites.esq : null;
  let alinhada;
  if (esquerdaDoPar !== null) alinhada = Math.abs(x0 - esquerdaDoPar) <= 2.5;
  else if (Math.abs(x0 - ax0) <= 2.5) alinhada = true;
  else if (ax0 > x0) alinhada = ax0 - x0 < (l.limites.dir - l.limites.esq) * 0.45; // recuo da 1ª linha
  else {
    // deslocamento: só se a linha de cima tinha marcador ou tabulação naquele ponto
    alinhada = Boolean((primeira.marcador && Math.abs(primeira.marcador.textoX - l.x0) <= 2.5)
      || ant.segmentos.some((s) => s.tab && Math.abs(s.x0 - l.x0) <= 2.5));
  }
  if (!alinhada && !centralizadas && !direita) return false;
  // a linha de cima acabou por falta de espaço? senão é fim de parágrafo (ou quebra manual)
  const coube = ant.x1 + ant.tamanho * 0.28 + primeiraPalavra(l) <= ant.limites.dir + 1;
  if (coube && FIM_DE_FRASE.test(ant.texto.trim()) && !centralizadas && !direita) return false;
  if (coube && alinhada && !centralizadas && ant.x1 - ant.x0 > (ant.limites.dir - ant.limites.esq) * 0.8) return false;
  return true;
}

function finalizar(p, area, doc) {
  const L = p.linhas;
  const n = L.length;
  const primeira = L[0];
  const ultima = L[n - 1];
  const largura = (l) => l.limites.dir - l.limites.esq;
  const folgaDir = (l) => l.limites.dir - l.x1;
  const relX0 = (l) => l.x0 - l.limites.esq;
  // entrelinha
  const passos = [];
  for (let i = 1; i < n; i += 1) passos.push(L[i].base - L[i - 1].base);
  const tamanho = moda(L.map((l) => l.tamanho), 0.5) || primeira.tamanho;
  p.tamanho = tamanho;
  p.passo = passos.length ? mediana(passos) : (doc.passo || 1.2) * tamanho;
  p.passoMedido = passos.length > 0;
  p.topo = Math.min(...L.map((l) => l.topo));
  p.fundo = Math.max(...L.map((l) => l.fundo));
  p.x0 = Math.min(...L.map((l) => l.x0));
  p.x1 = Math.max(...L.map((l) => l.x1));
  p.base0 = primeira.base;
  p.baseN = ultima.base;

  // alinhamento
  const meio = L.slice(0, -1);
  const naturais = meio.every((l) => l.juntar !== 'quebra');
  const centro = (l) => (l.x0 + l.x1) / 2;
  const centroArea = (l) => (l.limites.esq + l.limites.dir) / 2;
  // justificado: as linhas (menos a última) vão até a margem, ou todas acabam no mesmo ponto (recuo à direita)
  const mesmaPonta = meio.length >= 2 && meio.every((l) => Math.abs(l.x1 - meio[0].x1) <= 1.2) && folgaDir(meio[0]) > 0;
  if (n >= 2 && naturais && (meio.every((l) => Math.abs(folgaDir(l)) <= Math.max(2.5, l.tamanho * 0.25)) || mesmaPonta)) p.alinhamento = 'justificado';
  else if (L.every((l) => Math.abs(folgaDir(l)) <= 2.5) && relX0(primeira) > largura(primeira) * 0.25) p.alinhamento = 'direita';
  else if (L.every((l) => relX0(l) > 3 && Math.abs(centro(l) - centroArea(l)) <= Math.max(3.5, l.tamanho * 0.3))) p.alinhamento = 'centro';
  else if (n >= 2 && L.every((l) => Math.abs(centro(l) - centro(primeira)) <= 3) && L.some((l) => Math.abs(l.x0 - primeira.x0) > 3)) p.alinhamento = 'centro';
  else p.alinhamento = 'esquerda';

  // recuos (relativos à área)
  p.recuoDir = 0;
  if (p.alinhamento === 'centro') {
    const c = mediana(L.map(centro));
    const dir = Math.min(...L.map((l) => l.limites.dir));
    const esq = Math.max(...L.map((l) => l.limites.esq));
    // a faixa centralizada tem de caber a linha mais larga (mesmo passando da margem)
    const maior = Math.max(...L.map((l) => l.x1 - l.x0));
    const meia = Math.max(maior / 2 + 2, Math.min(c - esq, dir - c));
    p.recuoEsq = c - meia - area.x0;
    p.recuoDir = area.x1 - (c + meia);
    p.recuoPrimeira = 0;
  } else if (p.alinhamento === 'direita') {
    p.recuoEsq = 0;
    p.recuoDir = Math.max(0, area.x1 - Math.max(...L.map((l) => l.x1)) - (area.x1 - Math.min(...L.map((l) => l.limites.dir))));
    p.recuoPrimeira = 0;
  } else {
    const esquerda = n >= 2 ? mediana(L.slice(1).map(relX0)) : relX0(primeira);
    p.recuoEsq = esquerda + (Math.min(...L.map((l) => l.limites.esq)) - area.x0);
    p.recuoPrimeira = relX0(primeira) - esquerda;
    if (p.alinhamento === 'justificado') {
      const folga = mediana(meio.map(folgaDir));
      if (folga > 3) p.recuoDir = folga;
    }
    // Linha que chega (ou passa) na margem direita sem ter quebrado ali: uma folga
    // à direita, para o Word não quebrar onde o PDF não quebrou (a fonte pode sair
    // um tiquinho mais larga). Parágrafo que quebra sozinho fica com a margem certa.
    const quebraSozinho = n >= 2 && naturais;
    const folgaMin = quebraSozinho ? 2 : Math.max(4, (p.x1 - p.x0) * 0.04);
    if (p.x1 > area.x1 - folgaMin && p.alinhamento !== 'justificado') p.recuoDir = Math.min(p.recuoDir, area.x1 - p.x1 - folgaMin);
  }
  if (primeira.marcador) {
    // lista: marcador pendurado e o texto alinhado na tabulação
    const textoX = primeira.marcador.textoX;
    p.marcador = primeira.marcador;
    p.recuoEsq = textoX - area.x0;
    p.recuoPrimeira = primeira.marcador.x0 - textoX;
  }
  // tabulações (posições relativas à margem esquerda da área)
  const tabs = [];
  for (const l of L) {
    l.segmentos.forEach((s, i) => {
      if (!s.tab) return;
      const ultimoDaLinha = i === l.segmentos.length - 1;
      if (ultimoDaLinha && Math.abs(s.x1 - l.limites.dir) <= 3 && s.x0 - area.x0 > (area.x1 - area.x0) * 0.5) {
        tabs.push({ tipo: 'direita', pos: s.x1 - area.x0 });
      } else tabs.push({ tipo: 'esquerda', pos: s.x0 - area.x0 });
    });
  }
  if (p.marcador) tabs.push({ tipo: 'esquerda', pos: p.marcador.textoX - area.x0 });
  p.tabs = tabs.filter((t, i) => tabs.findIndex((u) => Math.abs(u.pos - t.pos) < 1 && u.tipo === t.tipo) === i).sort((a, b) => a.pos - b.pos);
  // em texto justificado, um espaço largo não é tabulação
  if (p.alinhamento === 'justificado') {
    for (const l of meio) for (const s of l.segmentos) if (s.tab && !(p.marcador && s === l.segmentos[1])) { s.tab = false; s.texto = ` ${s.texto}`; }
  }
  // título? (para o painel de navegação do Word)
  const texto = L.map((l) => l.texto).join(' ');
  if (doc.corpo && n <= 3 && texto.length < 160 && !FIM_DE_FRASE.test(texto.trim())) {
    if (tamanho >= doc.corpo * 1.5) p.nivel = 1;
    else if (tamanho >= doc.corpo * 1.15) p.nivel = 2;
  }
}

/* ============================================================
   CABEÇALHO E RODAPÉ
   ============================================================ */

const normalizar = (t) => t.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Tira das páginas o que se repete no topo/pé de várias delas e devolve
 * como cabeçalho e rodapé (com o número da página virando campo).
 */
function separarCabecalhoRodape(paginas) {
  const vazio = { cabecalho: null, rodape: null };
  if (paginas.length < 2) return vazio;
  const limiar = paginas.length === 2 ? 2 : Math.max(2, Math.ceil(paginas.length * 0.5));
  const candidatos = paginas.map((p) => {
    const zona = (y0, y1) => (y1 < p.altura * 0.15 ? 'topo' : y0 > p.altura * 0.85 ? 'base' : null);
    const linhas = montarLinhas(p.itens.filter((it) => zona(it.topo, it.fundo)))
      .map((l) => ({ l, zona: zona(l.topo, l.fundo) }))
      .filter((x) => x.zona)
      .map((x) => ({ ...x, chave: `${x.zona}|t|${normalizar(x.l.texto)}|${Math.round(x.l.x0 / 4)}|${Math.round(x.l.base / 4)}` }));
    const figuras = p.figuras
      .map((f) => ({ f, zona: zona(f.y0, f.y1) }))
      .filter((x) => x.zona)
      .map((x) => ({ ...x, chave: `${x.zona}|f|${Math.round(x.f.x0 / 3)}|${Math.round(x.f.y0 / 3)}|${Math.round((x.f.x1 - x.f.x0) / 3)}|${Math.round((x.f.y1 - x.f.y0) / 3)}` }));
    return { linhas, figuras };
  });
  const contagem = new Map();
  for (const c of candidatos) {
    for (const k of new Set([...c.linhas, ...c.figuras].map((x) => x.chave))) contagem.set(k, (contagem.get(k) || 0) + 1);
  }
  const repetidas = new Set([...contagem].filter(([, n]) => n >= limiar).map(([k]) => k));
  if (!repetidas.size) return vazio;

  // números que mudam de página para página: PAGE / NUMPAGES (ou não dá para repetir)
  const campos = new Map();
  for (const k of repetidas) {
    if (!k.includes('|t|') || !/#/.test(k.split('|')[2])) continue;
    const ocorrencias = [];
    candidatos.forEach((c, i) => { const x = c.linhas.find((y) => y.chave === k); if (x) ocorrencias.push({ pagina: paginas[i].numero, texto: x.l.texto }); });
    const numeros = ocorrencias.map((o) => (o.texto.match(/\d+/g) || []).map(Number));
    const qtd = numeros[0].length;
    const tipos = [];
    for (let j = 0; j < qtd; j += 1) {
      const vals = numeros.map((v) => v[j]);
      if (ocorrencias.every((o, i) => vals[i] === o.pagina)) tipos.push('PAGE');
      else if (vals.every((v) => v === paginas.length)) tipos.push('NUMPAGES');
      else if (vals.every((v) => v === vals[0])) tipos.push(null);
      else { tipos.length = 0; tipos.push('invalido'); break; }
    }
    if (tipos.includes('invalido')) repetidas.delete(k);
    else campos.set(k, tipos);
  }
  if (!repetidas.size) return vazio;

  const montar = (zona) => {
    let modelo = null;
    let primeiraSem = false;
    candidatos.forEach((c, i) => {
      const daqui = [...c.linhas, ...c.figuras].filter((x) => x.zona === zona && repetidas.has(x.chave));
      if (!daqui.length) { if (i === 0) primeiraSem = true; return; }
      if (!modelo) modelo = { pagina: paginas[i], linhas: daqui.filter((x) => x.l), figuras: daqui.filter((x) => x.f) };
    });
    if (!modelo) return null;
    return {
      linhas: modelo.linhas.map((x) => {
        const tipos = campos.get(x.chave);
        if (tipos) x.l.campos = tipos;
        return x.l;
      }),
      figuras: modelo.figuras.map((x) => x.f),
      pagina: modelo.pagina.numero,
      largura: modelo.pagina.largura,
      altura: modelo.pagina.altura,
      primeiraSem,
    };
  };
  const cabecalho = montar('topo');
  const rodape = montar('base');

  // tira das páginas
  candidatos.forEach((c, i) => {
    const p = paginas[i];
    const remover = new Set();
    for (const x of c.linhas) {
      if (!repetidas.has(x.chave)) continue;
      const faixa = [x.l.topo - 0.5, x.l.fundo + 0.5];
      for (const it of p.itens) if (it.base >= faixa[0] && it.base <= faixa[1] && it.x0 >= x.l.x0 - 0.5 && it.x1 <= x.l.x1 + 0.5) remover.add(it);
    }
    p.itens = p.itens.filter((it) => !remover.has(it));
    const figs = new Set(c.figuras.filter((x) => repetidas.has(x.chave)).map((x) => x.f));
    p.figuras = p.figuras.filter((f) => !figs.has(f));
  });
  return { cabecalho, rodape };
}

/* ============================================================
   PÁGINA
   ============================================================ */

function itemDentro(it, f, folga = 1) {
  const cx = (it.x0 + it.x1) / 2;
  const cy = (it.topo + it.base) / 2;
  return cx >= f.x0 - folga && cx <= f.x1 + folga && cy >= f.y0 - folga && cy <= f.y1 + folga;
}

/**
 * Organiza uma página.
 * @returns {{fluxo:any[], molduras:any[], flutuantes:any[], area:{x0:number,x1:number}}}
 */
function estruturarPagina(p, doc, area) {
  const itens = p.itens.slice();
  const molduras = [];
  const flutuantes = [];
  const soltas = [];
  const areaPagina = p.largura * p.altura;

  for (const f of p.figuras) {
    const fa = (f.x1 - f.x0) * (f.y1 - f.y0);
    if (fa >= areaPagina * 0.6) { flutuantes.push({ ...f, modo: 'atras' }); continue; }
    const dentro = itens.filter((it) => itemDentro(it, f));
    if (dentro.length) {
      // texto por cima da figura (caixa colorida, gráfico, faixa): figura atrás e o texto no lugar exato
      flutuantes.push({ ...f, modo: 'atras' });
      for (const it of dentro) itens.splice(itens.indexOf(it), 1);
      molduras.push(...blocosDeMoldura(dentro, doc));
      continue;
    }
    const lado = itens.filter((it) => it.topo < f.y1 - 1 && it.fundo > f.y0 + 1 && (it.x1 <= f.x0 || it.x0 >= f.x1));
    if (lado.length) {
      const aEsq = lado.filter((it) => it.x1 <= f.x0);
      const aDir = lado.filter((it) => it.x0 >= f.x1);
      flutuantes.push({
        ...f,
        modo: 'quadrado',
        distE: aEsq.length ? Math.min(18, Math.max(0, f.x0 - Math.max(...aEsq.map((it) => it.x1)) - 1)) : 0,
        distD: aDir.length ? Math.min(18, Math.max(0, Math.min(...aDir.map((it) => it.x0)) - f.x1 - 1)) : 0,
      });
    } else soltas.push(f);
  }

  const caixas = [
    ...itens.map((it) => ({ tipo: 'item', x0: it.x0, x1: it.x1, y0: it.topo, y1: it.fundo, ref: it })),
    ...soltas.map((f) => ({ tipo: 'figura', x0: f.x0, x1: f.x1, y0: f.y0, y1: f.y1, ref: f })),
    ...p.tabelas.map((t) => ({ tipo: 'tabela', x0: t.x0, x1: t.x1, y0: t.y0, y1: t.y1, ref: t })),
  ];
  const fluxo = caixas.length
    ? montarFluxo(cortarXY(caixas, doc.corpo || 11), area, doc, flutuantes.filter((f) => f.modo === 'quadrado'))
    : [];
  return { fluxo, molduras, flutuantes, area };
}

function montarFluxo(no, area, doc, flutuantes) {
  if (no.tipo === 'pilha') return no.filhos.flatMap((f) => montarFluxo(f, area, doc, flutuantes));
  if (no.tipo === 'colunas') {
    const colunas = no.filhos.map((f) => {
      const cx = todasCaixas(f);
      return { x0: Math.min(...cx.map((c) => c.x0)), x1: Math.max(...cx.map((c) => c.x1)), no: f };
    });
    // a coluna vai até o meio do espaço entre ela e a vizinha
    for (let i = 0; i < colunas.length; i += 1) {
      colunas[i].a0 = i === 0 ? Math.min(colunas[i].x0, area.x0) : (colunas[i - 1].x1 + colunas[i].x0) / 2;
      colunas[i].a1 = i === colunas.length - 1 ? Math.max(colunas[i].x1, area.x1) : (colunas[i].x1 + colunas[i + 1].x0) / 2;
    }
    const cx = todasCaixas(no);
    return [{
      tipo: 'colunas',
      topo: Math.min(...cx.map((c) => c.y0)),
      fundo: Math.max(...cx.map((c) => c.y1)),
      // x0/x1: a célula (até o meio do vão); conteudo: onde o texto fica de fato
      colunas: colunas.map((c) => ({
        x0: c.a0,
        x1: c.a1,
        conteudo: { x0: c.x0, x1: c.x1 },
        elementos: montarFluxo(c.no, { x0: c.x0, x1: c.x1 }, doc, flutuantes),
      })),
    }];
  }
  // folha: linhas de texto, figuras e tabelas em ordem vertical
  const itens = no.caixas.filter((c) => c.tipo === 'item').map((c) => c.ref);
  const linhas = montarLinhas(itens);
  const figuras = no.caixas.filter((c) => c.tipo === 'figura').map((c) => c.ref).sort((a, b) => a.y0 - b.y0);
  const tabelas = no.caixas.filter((c) => c.tipo === 'tabela').map((c) => c.ref);
  // figuras que ficam na mesma altura saem juntas, numa linha só
  const gruposFig = [];
  for (const f of figuras) {
    const g = gruposFig.find((x) => f.y0 < x.fundo && f.y1 > x.topo);
    if (g) { g.figuras.push(f); g.topo = Math.min(g.topo, f.y0); g.fundo = Math.max(g.fundo, f.y1); g.x0 = Math.min(g.x0, f.x0); g.x1 = Math.max(g.x1, f.x1); } else gruposFig.push({ figura: true, figuras: [f], topo: f.y0, fundo: f.y1, x0: f.x0, x1: f.x1 });
  }
  const sequencia = [...linhas, ...gruposFig].sort((a, b) => (a.figura ? a.topo : a.base - a.tamanho) - (b.figura ? b.topo : b.base - b.tamanho));
  // tabelas no meio: quebram a sequência
  const saida = [];
  const tabs = tabelas.slice().sort((a, b) => a.y0 - b.y0);
  let pendentes = [];
  const descarregar = () => { if (pendentes.length) { saida.push(...paragrafos(pendentes, area, doc, flutuantes)); pendentes = []; } };
  for (const el of sequencia) {
    const topo = el.figura ? el.topo : el.topo;
    while (tabs.length && tabs[0].y0 <= topo) { descarregar(); const t = tabs.shift(); saida.push({ tipo: 'tabela', tabela: t, topo: t.y0, fundo: t.y1 }); }
    pendentes.push(el);
  }
  descarregar();
  for (const t of tabs) saida.push({ tipo: 'tabela', tabela: t, topo: t.y0, fundo: t.y1 });
  return saida;
}

function todasCaixas(no) {
  if (no.tipo === 'folha') return no.caixas;
  return no.filhos.flatMap(todasCaixas);
}

/** Texto em cima de figura: cada bloco vira uma caixa no lugar exato, com as linhas como estão. */
/** Linha com tabulação -> um pedaço por coluna (para caixas de texto separadas). */
function dividirNasTabs(linhas) {
  const saida = [];
  for (const l of linhas) {
    if (!l.segmentos.some((s) => s.tab)) { saida.push(l); continue; }
    let atual = null;
    l.segmentos.forEach((s, i) => {
      if (!atual || s.tab) {
        atual = { ...l, segmentos: [], marcador: i === 0 ? l.marcador : undefined };
        saida.push(atual);
      }
      atual.segmentos.push(s.tab ? { ...s, tab: false } : s);
    });
  }
  for (const l of saida) {
    l.x0 = l.segmentos[0].x0;
    l.x1 = Math.max(...l.segmentos.map((s) => s.x1));
    l.texto = l.segmentos.map((s) => s.texto).join('');
  }
  return saida;
}

/**
 * Agrupa o texto em blocos (para caixas de texto no lugar exato).
 * @param {{separarTabs?:boolean}} [op]  separarTabs: colunas separadas por tabulação viram blocos diferentes
 */
function blocosDeMoldura(itens, doc, { separarTabs = false } = {}) {
  const linhas = separarTabs ? dividirNasTabs(montarLinhas(itens)) : montarLinhas(itens);
  linhas.sort((a, b) => a.base - b.base || a.x0 - b.x0);
  const blocos = [];
  for (const l of linhas) {
    const b = blocos.find((x) => {
      const u = x.linhas[x.linhas.length - 1];
      return l.base - u.base > 0 && l.base - u.base <= Math.max(l.tamanho, u.tamanho) * Math.max(1.7, (doc.passo || 1.2) * 1.15)
        && Math.abs(l.tamanho - u.tamanho) <= 2 && l.x0 < u.x1 + 4 && l.x1 > u.x0 - 4;
    });
    if (b) b.linhas.push(l); else blocos.push({ linhas: [l] });
  }
  return blocos.map((b) => {
    const area = { x0: Math.min(...b.linhas.map((l) => l.x0)), x1: Math.max(...b.linhas.map((l) => l.x1)) };
    const pars = paragrafos(b.linhas, area, doc).filter((x) => x.tipo === 'paragrafo');
    // as linhas ficam como no PDF (menos no justificado, que volta a correr na mesma largura)
    for (const p of pars) if (p.alinhamento !== 'justificado') for (const l of p.linhas) if (l !== p.linhas[p.linhas.length - 1]) l.juntar = 'quebra';
    return { area, paragrafos: pars, topo: Math.min(...b.linhas.map((l) => l.topo)), fundo: Math.max(...b.linhas.map((l) => l.fundo)) };
  });
}

/* ============================================================
   DOCUMENTO
   ============================================================ */

// O Word não aceita página maior que 22 polegadas (55,9 cm)
const MAIOR_PAGINA_WORD = 1584;

/** Página gigante (cartaz, planta): tudo encolhe na mesma proporção até caber no Word. */
function encolherPagina(p, s) {
  const vistos = new Set();
  const item = (it) => {
    if (vistos.has(it)) return;
    vistos.add(it);
    for (const k of ['x0', 'x1', 'base', 'topo', 'fundo', 'tamanho']) it[k] *= s;
  };
  p.itens.forEach(item);
  for (const f of p.figuras) for (const k of ['x0', 'y0', 'x1', 'y1']) f[k] *= s;
  for (const t of p.tabelas) {
    for (const k of ['x0', 'y0', 'x1', 'y1']) t[k] *= s;
    t.colunas = t.colunas.map((v) => v * s);
    t.linhas = t.linhas.map((v) => v * s);
    for (const c of t.celulas) {
      for (const k of ['x0', 'y0', 'x1', 'y1']) c[k] *= s;
      for (const b of Object.values(c.bordas)) if (b) b.esp *= s;
      c.itens.forEach(item);
    }
  }
  p.largura *= s;
  p.altura *= s;
}

/** Tamanho do texto do corpo e entrelinha típica (em múltiplos do tamanho). */
function medidas(paginas) {
  const porPagina = paginas.map((p) => montarLinhas(p.itens));
  const porTamanho = new Map();
  for (const l of porPagina.flat()) porTamanho.set(Math.round(l.tamanho * 2) / 2, (porTamanho.get(Math.round(l.tamanho * 2) / 2) || 0) + l.texto.length);
  let corpo = 11;
  let max = 0;
  for (const [t, n] of porTamanho) if (n > max) { max = n; corpo = t; }
  const razoes = [];
  for (const ls of porPagina) {
    for (let i = 1; i < ls.length; i += 1) {
      const a = ls[i - 1];
      const b = ls[i];
      if (Math.abs(a.tamanho - corpo) <= 0.6 && Math.abs(b.tamanho - corpo) <= 0.6 && Math.abs(a.x0 - b.x0) < 40) razoes.push((b.base - a.base) / corpo);
    }
  }
  const passo = razoes.length >= 3 ? Math.min(2.6, Math.max(1, moda(razoes, 0.02))) : 1.2;
  return { corpo, passo };
}

/**
 * @param {{paginas:any[]}} lido  saída de leitura.lerDocumento
 */
function estruturar(lido) {
  const paginas = lido.paginas;
  for (const p of paginas) {
    const maior = Math.max(p.largura, p.altura);
    if (maior > MAIOR_PAGINA_WORD) encolherPagina(p, MAIOR_PAGINA_WORD / maior);
  }
  const { cabecalho, rodape } = separarCabecalhoRodape(paginas);

  const todas = paginas.flatMap((p) => montarLinhas(p.itens));
  const doc = medidas(paginas);

  // margens: a borda esquerda e a direita mais comuns das linhas compridas (da página ou do documento)
  const longas = (ls) => ls.filter((l) => l.texto.length > 25);
  const esqDoc = moda(longas(todas).map((l) => l.x0), 1);
  const dirDoc = moda(longas(todas).map((l) => l.x1), 1);
  const areas = paginas.map((p) => {
    const ls = montarLinhas(p.itens);
    const lp = longas(ls);
    let x0;
    let x1;
    if (lp.length >= 3) {
      x0 = moda(lp.map((l) => l.x0), 1);
      x1 = moda(lp.map((l) => l.x1), 1);
      // texto justificado: muitas linhas acabam no mesmo ponto; texto solto à direita: vale a mais comprida
      const noPonto = lp.filter((l) => Math.abs(l.x1 - x1) <= 1.5).length;
      if (noPonto < Math.max(3, lp.length * 0.35)) x1 = Math.max(...lp.map((l) => l.x1));
    } else if (ls.length && (esqDoc == null || dirDoc == null
      || Math.min(...ls.map((l) => l.x0)) < esqDoc - 5 || Math.max(...ls.map((l) => l.x1)) > dirDoc + 5)) {
      // página diferente das outras (slide, capa): margens pelas próprias linhas
      x0 = Math.min(...ls.map((l) => l.x0));
      x1 = Math.max(...ls.map((l) => l.x1));
    } else {
      x0 = esqDoc;
      x1 = dirDoc;
    }
    if (x0 == null) x0 = ls.length ? Math.min(...ls.map((l) => l.x0)) : p.largura * 0.1;
    if (x1 == null) x1 = ls.length ? Math.max(...ls.map((l) => l.x1)) : p.largura * 0.9;
    // linhas que passam um pouco da borda mais comum alargam a área (senão o Word quebraria antes)
    if (lp.length) x1 = Math.max(x1, ...lp.map((l) => l.x1).filter((v) => v - x1 < 6));
    x0 = Math.max(6, Math.min(x0, p.largura * 0.4));
    x1 = Math.min(p.largura - 6, Math.max(x1, x0 + 50));
    return { x0, x1 };
  });

  const saida = paginas.map((p, i) => ({
    numero: p.numero, largura: p.largura, altura: p.altura, escaneada: p.escaneada,
    ...estruturarPagina(p, doc, areas[i]),
  }));

  const areaDe = (f) => areas[Math.max(0, paginas.findIndex((p) => p.numero === f.pagina))];
  const cab = cabecalho ? estruturarFaixa(cabecalho, doc, areaDe(cabecalho)) : null;
  const rod = rodape ? estruturarFaixa(rodape, doc, areaDe(rodape)) : null;
  return { paginas: saida, cabecalho: cab, rodape: rod, doc };
}

function estruturarFaixa(f, doc, area) {
  const linhas = f.linhas.slice().sort((a, b) => a.base - b.base);
  const pars = paragrafos(linhas.map((l) => ({ ...l })), area, doc).filter((x) => x.tipo === 'paragrafo');
  for (const p of pars) {
    for (const l of p.linhas) {
      const orig = f.linhas.find((o) => o.base === l.base && o.x0 === l.x0);
      if (orig && orig.campos) l.campos = orig.campos;
    }
  }
  return { paragrafos: pars, figuras: f.figuras, primeiraSem: f.primeiraSem, largura: f.largura, altura: f.altura, area };
}

module.exports = { estruturar, medidas, montarLinhas, paragrafos, blocosDeMoldura, separarCabecalhoRodape, cortarXY };
