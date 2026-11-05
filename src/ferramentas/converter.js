'use strict';

/**
 * Conversões para PDF e a partir do PDF.
 */

const fsp = require('fs/promises');
const path = require('path');
const zlib = require('zlib');
const { execFile } = require('child_process');
const { promisify } = require('util');
const sharp = require('sharp');
const { PDFName, PDFRawStream, PDFNumber, PDFArray, PDFRef, PDFStream } = require('@cantoo/pdf-lib');

const config = require('../config');
const pdf = require('../nucleo/pdf');
const paginas = require('../nucleo/paginas');
const pdfjs = require('../motores/pdfjs');
const texto = require('../motores/texto');
const ooxml = require('../motores/ooxml');
const leitura = require('../motores/leitura');
const estrutura = require('../motores/estrutura');
const word = require('../motores/word');
const powerpoint = require('../motores/powerpoint');
const imagens = require('../motores/imagens');
const navegador = require('../motores/navegador-pdf');
const so = require('../motores/so');
const { semExtensao, nomeSeguro, booleano, limitar, novoId, ErroUsuario } = require('../nucleo/util');
const { registrar } = require('./index');

const execFileAsync = promisify(execFile);

/* ============================================================
   PARA PDF
   ============================================================ */

/** Word/Excel/PowerPoint: a conversão já aconteceu na entrada (pelo Office). */
async function officeParaPdf({ arquivos, opcoes }, ctx) {
  if (booleano(opcoes.juntar) && arquivos.length > 1) {
    const destino = await pdf.novo();
    const marcadores = [];
    for (let i = 0; i < arquivos.length; i += 1) {
      ctx.checar();
      const a = arquivos[i];
      ctx.progresso((i / arquivos.length) * 90, `Juntando ${a.nome}`);
      const origem = await pdf.abrir(a.caminhoPdf);
      marcadores.push({ titulo: semExtensao(a.nome), pagina: destino.getPageCount() });
      (await destino.copyPages(origem, origem.getPageIndices())).forEach((p) => destino.addPage(p));
    }
    pdf.criarMarcadores(destino, marcadores);
    await ctx.gravar('Documentos convertidos.pdf', await pdf.salvar(destino), { paginas: destino.getPageCount() });
    return;
  }
  for (const a of arquivos) {
    ctx.checar();
    await ctx.gravar(`${semExtensao(a.nome)}.pdf`, await fsp.readFile(a.caminhoPdf), { paginas: a.paginas });
  }
}

const QUALIDADES = {
  original: { maxPx: 0, qualidade: 92 },
  otimizada: { maxPx: 2600, qualidade: 85 },
  compacta: { maxPx: 1700, qualidade: 72 },
};

async function imagemParaPdf({ arquivos, opcoes }, ctx) {
  const qualidade = QUALIDADES[opcoes.qualidade] || QUALIDADES.otimizada;
  const layout = { tamanho: opcoes.tamanho || 'a4', orientacao: opcoes.orientacao || 'auto', margem: opcoes.margem || 'pequena' };
  const juntar = booleano(opcoes.juntar, true);
  let unico = juntar ? await pdf.novo() : null;

  for (let i = 0; i < arquivos.length; i += 1) {
    ctx.checar();
    const a = arquivos[i];
    ctx.progresso((i / arquivos.length) * 92, `Convertendo ${a.nome}`);
    const bytes = await fsp.readFile(a.caminho);
    const info = await imagens.ler(bytes);
    // TIFF com várias páginas (digitalização) vira várias páginas; GIF só o 1º quadro
    const quadros = info.formato === 'tiff' ? info.paginas : 1;
    const doc = juntar ? unico : await pdf.novo();
    for (let q = 0; q < quadros; q += 1) {
      const preparada = await imagens.paraEmbutir(bytes, { pagina: q, maxPx: qualidade.maxPx, qualidade: qualidade.qualidade });
      await imagens.adicionarPagina(doc, preparada, layout);
    }
    if (!juntar) await ctx.gravar(`${semExtensao(a.nome)}.pdf`, await pdf.salvar(doc), { paginas: doc.getPageCount() });
  }
  if (juntar) {
    const nome = nomeSeguro(opcoes.nome || '', 'Imagens').replace(/\.pdf$/i, '');
    await ctx.gravar(`${nome}.pdf`, await pdf.salvar(unico), { paginas: unico.getPageCount() });
    unico = null;
  }
}

async function siteParaPdf({ opcoes }, ctx) {
  const usarHtml = opcoes.fonte === 'html';
  const { bytes, titulo } = await navegador.paraPdf({
    endereco: usarHtml ? '' : opcoes.endereco,
    html: usarHtml ? opcoes.html : '',
    papel: opcoes.papel,
    orientacao: opcoes.orientacao,
    margem: opcoes.margem,
    fundo: booleano(opcoes.fundo, true),
  }, (pct, t) => { ctx.checar(); ctx.progresso(pct, t); });
  let nome = titulo || '';
  if (!nome && !usarHtml) {
    try { nome = new URL(/^https?:/i.test(opcoes.endereco) ? opcoes.endereco : `https://${opcoes.endereco}`).hostname; } catch (_) { nome = ''; }
  }
  const { doc } = await pdf.carregar(bytes);
  await ctx.gravar(`${nomeSeguro(nome, 'Pagina da web').slice(0, 90)}.pdf`, bytes, { paginas: doc.getPageCount() });
}

/** Grava a resolução no cabeçalho JFIF do JPEG, sem recomprimir a imagem. */
function marcarDpiJpeg(bytes, dpi) {
  const b = Buffer.from(bytes);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && b[3] === 0xe0 && b.toString('latin1', 6, 11) === 'JFIF\0') {
    b[13] = 1; // pontos por polegada
    b.writeUInt16BE(dpi, 14);
    b.writeUInt16BE(dpi, 16);
  }
  return b;
}

/* ============================================================
   PDF PARA IMAGEM
   ============================================================ */

async function pdfParaImagem({ arquivos, opcoes }, ctx) {
  if (opcoes.modo === 'imagens') { await extrairImagens({ arquivos }, ctx); return; }
  const dpi = limitar(opcoes.dpi, 50, 600, 150);
  const formato = opcoes.formato === 'png' ? 'png' : 'jpeg';
  const ext = formato === 'png' ? 'png' : 'jpg';

  for (let i = 0; i < arquivos.length; i += 1) {
    ctx.checar();
    const a = arquivos[i];
    const leitor = await pdfjs.abrir(a.caminhoPdf);
    try {
      const lista = paginas.escolhidas(opcoes.paginas, leitor.numPages);
      const digitos = String(leitor.numPages).length;
      for (let k = 0; k < lista.length; k += 1) {
        ctx.checar();
        const n = lista[k];
        ctx.progresso(((i + k / lista.length) / arquivos.length) * 98, `Página ${n} de ${leitor.numPages}${arquivos.length > 1 ? ` · ${a.nome}` : ''}`);
        const d = await pdfjs.desenhar(leitor, n, { dpi, formato, qualidade: 90 });
        // grava a resolução na imagem, para imprimir no tamanho certo
        const bytes = formato === 'png'
          ? await sharp(d.bytes).withMetadata({ density: Math.round(dpi) }).png().toBuffer()
          : marcarDpiJpeg(d.bytes, Math.round(dpi));
        const sufixo = lista.length === 1 && leitor.numPages === 1 ? '' : ` - pág ${String(n).padStart(digitos, '0')}`;
        await ctx.gravar(`${semExtensao(a.nome)}${sufixo}.${ext}`, bytes);
      }
    } finally {
      leitor.destroy();
    }
  }
}

/** Tira as fotos/figuras de dentro do PDF, sem perder qualidade. */
async function extrairImagens({ arquivos }, ctx) {
  let total = 0;
  let ignoradas = 0;
  for (let i = 0; i < arquivos.length; i += 1) {
    ctx.checar();
    const a = arquivos[i];
    ctx.progresso((i / arquivos.length) * 95, `Procurando imagens em ${a.nome}`);
    const doc = await pdf.abrir(a.caminhoPdf);
    const ctxPdf = doc.context;
    let n = 0;
    // máscaras de transparência também são "imagens" no PDF: não saem sozinhas, viram o canal alfa
    const mascaras = new Set();
    for (const [, obj] of ctxPdf.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;
      for (const chave of ['SMask', 'Mask']) {
        const m = obj.dict.get(PDFName.of(chave));
        if (m instanceof PDFRef) mascaras.add(m.toString());
      }
    }
    for (const [ref, obj] of ctxPdf.enumerateIndirectObjects()) {
      ctx.checar();
      if (!(obj instanceof PDFRawStream) || mascaras.has(ref.toString())) continue;
      const d = obj.dict;
      const sub = d.lookup(PDFName.of('Subtype'));
      if (!(sub instanceof PDFName) || sub.decodeText() !== 'Image') continue;
      const largura = (d.lookup(PDFName.of('Width')) || PDFNumber.of(0)).asNumber();
      const altura = (d.lookup(PDFName.of('Height')) || PDFNumber.of(0)).asNumber();
      if (largura < 40 || altura < 40) continue; // ícones e máscaras minúsculas
      try {
        const saida = await decodificarImagem(ctxPdf, obj, largura, altura);
        if (!saida) { ignoradas += 1; continue; }
        n += 1;
        await ctx.gravar(`${semExtensao(a.nome)} - imagem ${String(n).padStart(3, '0')}.${saida.ext}`, saida.bytes);
      } catch (_) {
        ignoradas += 1;
      }
    }
    total += n;
  }
  if (!total) throw new ErroUsuario('Não há imagens dentro deste PDF (ou estão num formato que não dá para extrair). Use "Páginas inteiras".');
  if (ignoradas) ctx.aviso(`${ignoradas} imagem(ns) num formato especial (JBIG2, CCITT, JPEG 2000) ficaram de fora.`);
}

function nomeFiltro(d) {
  const f = d.lookup(PDFName.of('Filter'));
  if (f instanceof PDFName) return [f.decodeText()];
  if (f instanceof PDFArray) return f.asArray().map((x) => (x instanceof PDFName ? x.decodeText() : '?'));
  return [];
}

/** Imagem do PDF -> arquivo (com a transparência, quando ela tem máscara SMask). */
async function decodificarImagem(ctxPdf, obj, largura, altura) {
  const base = await decodificarSemMascara(ctxPdf, obj, largura, altura);
  if (!base) return null;
  const smask = obj.dict.lookup(PDFName.of('SMask'));
  if (!(smask instanceof PDFRawStream)) return base;
  try {
    const ml = (smask.dict.lookup(PDFName.of('Width')) || PDFNumber.of(0)).asNumber();
    const ma = (smask.dict.lookup(PDFName.of('Height')) || PDFNumber.of(0)).asNumber();
    let alfa = await decodificarCinza(smask, ml, ma);
    if (!alfa) return base;
    if (ml !== largura || ma !== altura) {
      alfa = await sharp(alfa, { raw: { width: ml, height: ma, channels: 1 } }).resize(largura, altura, { fit: 'fill' }).extractChannel(0).raw().toBuffer();
    }
    const rgb = (await sharp(base.bytes).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true })).data;
    // /Matte: as cores vêm misturadas com o fundo (normalmente preto); desfaz a mistura
    const matte = smask.dict.lookup(PDFName.of('Matte'));
    const fundo = matte instanceof PDFArray ? matte.asArray().map((v) => (v instanceof PDFNumber ? v.asNumber() * 255 : 0)) : null;
    const rgba = Buffer.alloc(largura * altura * 4);
    for (let p = 0; p < largura * altura; p += 1) {
      const a = alfa[p];
      for (let c = 0; c < 3; c += 1) {
        let v = rgb[p * 3 + c];
        if (fundo && a > 0) v = Math.max(0, Math.min(255, Math.round(((v - fundo[c]) * 255) / a + fundo[c])));
        rgba[p * 4 + c] = v;
      }
      rgba[p * 4 + 3] = a;
    }
    const png = await sharp(rgba, { raw: { width: largura, height: altura, channels: 4 } }).png().toBuffer();
    return { ext: 'png', bytes: png };
  } catch (_) {
    return base;
  }
}

/** Máscara em tons de cinza (8 bits) -> bytes crus, um por pixel. */
async function decodificarCinza(obj, largura, altura) {
  const filtros = nomeFiltro(obj.dict);
  const bpc = (obj.dict.lookup(PDFName.of('BitsPerComponent')) || PDFNumber.of(8)).asNumber();
  if (filtros.length === 1 && filtros[0] === 'DCTDecode') {
    return sharp(Buffer.from(obj.contents)).greyscale().resize(largura, altura, { fit: 'fill' }).raw().toBuffer();
  }
  if (bpc !== 8 || filtros.length > 1 || (filtros.length === 1 && filtros[0] !== 'FlateDecode')) return null;
  const bruto = desfazerPredicao(filtros.length ? zlib.inflateSync(Buffer.from(obj.contents)) : Buffer.from(obj.contents), obj.dict, largura, altura, 1);
  return bruto && bruto.length >= largura * altura ? bruto.subarray(0, largura * altura) : null;
}

async function decodificarSemMascara(ctxPdf, obj, largura, altura) {
  const d = obj.dict;
  const filtros = nomeFiltro(d);
  if (filtros.length === 1 && filtros[0] === 'DCTDecode') {
    const bytes = Buffer.from(obj.contents);
    const meta = await sharp(bytes).metadata();
    // JPEG em CMYK abre esquisito em muitos programas: converte para RGB
    if (meta.space === 'cmyk') return { ext: 'jpg', bytes: await sharp(bytes).toColourspace('srgb').jpeg({ quality: 92 }).toBuffer() };
    return { ext: 'jpg', bytes };
  }
  if (filtros.length > 1 || (filtros.length === 1 && filtros[0] !== 'FlateDecode')) return null;
  const bpc = (d.lookup(PDFName.of('BitsPerComponent')) || PDFNumber.of(8)).asNumber();
  if (bpc !== 8) return null;
  let cs = d.lookup(PDFName.of('ColorSpace'));
  let canais = null;
  if (cs instanceof PDFName) canais = { DeviceRGB: 3, DeviceGray: 1, CalRGB: 3, CalGray: 1 }[cs.decodeText()] || null;
  else if (cs instanceof PDFArray && cs.lookup(0) instanceof PDFName && cs.lookup(0).decodeText() === 'ICCBased') {
    const perfil = cs.lookup(1);
    if (perfil instanceof PDFStream) {
      const nn = perfil.dict.lookup(PDFName.of('N'));
      canais = nn instanceof PDFNumber && [1, 3].includes(nn.asNumber()) ? nn.asNumber() : null;
    }
  }
  if (!canais) return null;
  const bruto = desfazerPredicao(filtros.length ? zlib.inflateSync(Buffer.from(obj.contents)) : Buffer.from(obj.contents), d, largura, altura, canais);
  if (!bruto || bruto.length < largura * altura * canais) return null;
  const png = await sharp(bruto.subarray(0, largura * altura * canais), { raw: { width: largura, height: altura, channels: canais } }).png().toBuffer();
  return { ext: 'png', bytes: png };
}

/** Desfaz o "Predictor" PNG do FlateDecode (linhas com filtro). */
function desfazerPredicao(dados, d, largura, altura, canais) {
  let bruto = dados;
  const parms = d.lookup(PDFName.of('DecodeParms'));
  const pred = parms && parms.lookup ? (parms.lookup(PDFName.of('Predictor')) || PDFNumber.of(1)).asNumber() : 1;
  if (pred >= 10) {
    const linha = largura * canais;
    const saida = Buffer.alloc(linha * altura);
    let anterior = Buffer.alloc(linha);
    for (let y = 0; y < altura; y += 1) {
      const ini = y * (linha + 1);
      const tipo = bruto[ini];
      const atual = saida.subarray(y * linha, (y + 1) * linha);
      for (let k = 0; k < linha; k += 1) {
        const b = bruto[ini + 1 + k];
        const e = k >= canais ? atual[k - canais] : 0;
        const c = anterior[k];
        const dg = k >= canais ? anterior[k - canais] : 0;
        let v = b;
        if (tipo === 1) v = b + e;
        else if (tipo === 2) v = b + c;
        else if (tipo === 3) v = b + ((e + c) >> 1);
        else if (tipo === 4) { const p = e + c - dg; const pa = Math.abs(p - e); const pb = Math.abs(p - c); const pc = Math.abs(p - dg); v = b + (pa <= pb && pa <= pc ? e : pb <= pc ? c : dg); }
        atual[k] = v & 255;
      }
      anterior = atual;
    }
    bruto = saida;
  } else if (pred !== 1) {
    return null;
  }
  return bruto;
}

/* ============================================================
   PDF PARA TEXTO, WORD, EXCEL, POWERPOINT
   ============================================================ */

async function pdfParaTexto({ arquivos, opcoes }, ctx) {
  const separar = booleano(opcoes.separarPaginas, true);
  for (let i = 0; i < arquivos.length; i += 1) {
    ctx.checar();
    const a = arquivos[i];
    const lido = await texto.lerDocumento(a.caminhoPdf, {
      checar: ctx.checar,
      aoProgredir: (f, n, total) => ctx.progresso(((i + f) / arquivos.length) * 95, `Lendo a página ${n} de ${total}`),
    });
    const partes = lido.paginas.map((p) => {
      const t = texto.textoDaPagina(p);
      return separar ? `===== Página ${p.numero} =====\n\n${t}` : t;
    });
    const tudo = partes.join('\n\n').trim();
    if (!tudo.replace(/=+ Página \d+ =+/g, '').trim()) {
      throw new ErroUsuario(`"${a.nome}" não tem texto (parece ser digitalizado). Passe antes no OCR.`);
    }
    // BOM: o Bloco de Notas abre com os acentos certos
    await ctx.gravar(`${semExtensao(a.nome)}.txt`, Buffer.from(`\uFEFF${tudo.replace(/\n/g, '\r\n')}\r\n`, 'utf8'));
  }
}

/** Progresso da leitura completa (com o aviso de quando a página está passando pelo OCR). */
function progressoDaLeitura(ctx, i, total, fim) {
  return (f, n, paginas, lendoOcr) => ctx.progresso(
    ((i + f) / total) * fim,
    lendoOcr ? `Reconhecendo o texto da página ${n} de ${paginas} (OCR)...` : `Lendo a página ${n} de ${paginas}`,
  );
}

function avisarOcr(ctx, comOcr, semTexto) {
  if (comOcr) ctx.aviso(`${comOcr === 1 ? 'Uma página era digitalizada' : `${comOcr} páginas eram digitalizadas`}: o texto foi reconhecido por OCR. Confira nomes e números.`);
  if (semTexto) ctx.aviso(`${semTexto === 1 ? 'Uma página digitalizada ficou' : `${semTexto} páginas digitalizadas ficaram`} como imagem, sem texto editável.`);
}

async function pdfParaWord({ arquivos, opcoes }, ctx) {
  const modo = opcoes.modo === 'imagem' ? 'imagem' : 'texto';
  const usarOcr = booleano(opcoes.ocr, true);
  let comOcr = 0;
  let semTexto = 0;
  for (let i = 0; i < arquivos.length; i += 1) {
    ctx.checar();
    const a = arquivos[i];
    const titulo = semExtensao(a.nome);
    let paginasDoc;
    if (modo === 'imagem') {
      const leitor = await pdfjs.abrir(a.caminhoPdf);
      try {
        paginasDoc = [];
        for (let n = 1; n <= leitor.numPages; n += 1) {
          ctx.checar();
          ctx.progresso(((i + n / leitor.numPages) / arquivos.length) * 90, `Preparando a página ${n} de ${leitor.numPages}`);
          const d = await pdfjs.desenhar(leitor, n, { dpi: 170, qualidade: 86 });
          paginasDoc.push({ largura: d.larguraPt, altura: d.alturaPt, imagem: { bytes: d.bytes } });
        }
      } finally {
        leitor.destroy();
      }
      ctx.progresso(((i + 0.95) / arquivos.length) * 100, 'Montando o documento do Word...');
      await ctx.gravar(`${titulo}.docx`, ooxml.docx({ titulo, paginas: paginasDoc }));
      continue;
    }
    // texto editável: texto com formatação, tabelas, figuras no lugar, cabeçalho e rodapé
    const lido = await leitura.lerDocumento(a.caminhoPdf, {
      alvo: 'word',
      ocr: usarOcr,
      checar: ctx.checar,
      aoProgredir: progressoDaLeitura(ctx, i, arquivos.length, 90),
    });
    comOcr += lido.ocr;
    semTexto += lido.semTexto;
    ctx.progresso(((i + 0.93) / arquivos.length) * 100, 'Montando o documento do Word...');
    const est = estrutura.estruturar(lido);
    await ctx.gravar(`${titulo}.docx`, word.docx({ titulo, estrutura: est }));
  }
  avisarOcr(ctx, comOcr, semTexto);
}

async function pdfParaExcel({ arquivos, opcoes }, ctx) {
  const porPagina = opcoes.abas !== 'unica';
  const numeros = booleano(opcoes.numeros, true);
  const celula = (t, negrito) => {
    if (!numeros) return { tipo: 'texto', valor: t, negrito };
    const c = texto.interpretarCelula(t);
    return { ...c, texto: t, negrito: c.tipo === 'texto' ? negrito : false };
  };

  let comOcr = 0;
  let semTexto = 0;
  for (let i = 0; i < arquivos.length; i += 1) {
    ctx.checar();
    const a = arquivos[i];
    const lido = await leitura.lerDocumento(a.caminhoPdf, {
      alvo: 'word',
      ocr: booleano(opcoes.ocr, true),
      checar: ctx.checar,
      aoProgredir: progressoDaLeitura(ctx, i, arquivos.length, 92),
    });
    comOcr += lido.ocr;
    semTexto += lido.semTexto;
    const abas = [];
    let unica = null;
    for (const p of lido.paginas) {
      const { linhas, mesclas } = linhasDaPlanilha(p, celula);
      if (porPagina) abas.push({ nome: `Página ${p.numero}`, linhas, mesclas });
      else {
        if (!unica) { unica = { nome: semExtensao(a.nome), linhas: [], mesclas: [] }; abas.push(unica); }
        if (unica.linhas.length) unica.linhas.push([]);
        const desloc = unica.linhas.length;
        unica.linhas.push(...linhas);
        unica.mesclas.push(...mesclas.map((m) => m.replace(/\d+/g, (r) => String(Number(r) + desloc))));
      }
    }
    const temAlgo = abas.some((ab) => ab.linhas.some((l) => l.some((c) => c && c.valor !== '')));
    if (!temAlgo) throw new ErroUsuario(`"${a.nome}" não tem texto nem tabela para levar ao Excel.`);
    ctx.progresso(((i + 0.96) / arquivos.length) * 100, 'Montando a planilha...');
    await ctx.gravar(`${semExtensao(a.nome)}.xlsx`, ooxml.xlsx({ titulo: semExtensao(a.nome), abas }));
  }
  avisarOcr(ctx, comOcr, semTexto);
}

/**
 * Página lida -> linhas da planilha. Tabela com bordas usa a grade desenhada
 * (colunas certas, células mescladas, com borda); o resto do texto vai por
 * posição, como antes.
 */
function linhasDaPlanilha(p, celula) {
  const blocos = [];
  for (const t of p.tabelas) blocos.push({ y: t.y0, tabela: t });
  const soltos = texto.montarLinhas(p.itens.map((it) => ({
    texto: it.texto, x: it.x0, l: it.x1 - it.x0, base: it.base, tamanho: it.tamanho, negrito: it.negrito, italico: it.italico, vertical: false,
  })));
  for (const b of texto.blocos(soltos)) blocos.push({ y: (b.tipo === 'tabela' ? b.linhas[0] : b.linha).base, bloco: b });
  blocos.sort((x, y) => x.y - y.y);
  const linhas = [];
  const mesclas = [];
  for (const b of blocos) {
    if (b.tabela) {
      const t = b.tabela;
      const inicio = linhas.length;
      const nl = t.linhas.length - 1;
      // tabela sem linhas no PDF (extrato) fica sem borda na planilha também
      const borda = !t.semBorda;
      for (let r = 0; r < nl; r += 1) linhas.push(new Array(t.colunas.length - 1).fill(null).map(() => ({ valor: '', tipo: 'texto', borda })));
      for (const c of t.celulas) {
        const ordem = c.itens.slice().sort((x, y) => x.base - y.base || x.x0 - y.x0);
        let txt = '';
        ordem.forEach((it, k) => {
          const ant = ordem[k - 1];
          if (ant) txt += Math.abs(it.base - ant.base) > it.tamanho * 0.5 || it.x0 - ant.x1 > it.tamanho * 0.12 ? ' ' : '';
          txt += it.texto;
        });
        txt = txt.replace(/\s+/g, ' ').trim();
        const negrito = ordem.length > 0 && ordem.every((it) => it.negrito);
        linhas[inicio + c.lin][c.col] = { ...celula(txt, negrito), borda };
        if (c.spanC > 1 || c.spanL > 1) {
          mesclas.push(`${ooxml.colunaLetra(c.col)}${inicio + c.lin + 1}:${ooxml.colunaLetra(c.col + c.spanC - 1)}${inicio + c.lin + c.spanL}`);
        }
      }
    } else if (b.bloco.tipo === 'tabela') {
      for (const g of b.bloco.grade) linhas.push(g.celulas.map((t, k) => celula(t, g.negrito[k])));
    } else {
      // texto solto: cada "pedaço" numa coluna, alinhado pela posição
      linhas.push(b.bloco.linha.celulas.map((c) => celula(c.texto, c.negrito)));
    }
  }
  return { linhas, mesclas };
}

async function pdfParaPowerPoint({ arquivos, opcoes }, ctx) {
  const editavel = opcoes.modo !== 'imagem';
  let comOcr = 0;
  let semTexto = 0;
  for (let i = 0; i < arquivos.length; i += 1) {
    ctx.checar();
    const a = arquivos[i];
    if (editavel) {
      // figuras soltas + caixas de texto editáveis, cada coisa no lugar exato
      const lido = await leitura.lerDocumento(a.caminhoPdf, {
        alvo: 'powerpoint',
        ocr: booleano(opcoes.ocr, true),
        checar: ctx.checar,
        aoProgredir: progressoDaLeitura(ctx, i, arquivos.length, 92),
      });
      comOcr += lido.ocr;
      semTexto += lido.semTexto;
      ctx.progresso(((i + 0.96) / arquivos.length) * 100, 'Montando a apresentação...');
      await ctx.gravar(`${semExtensao(a.nome)}.pptx`, powerpoint.pptxEditavel({ titulo: semExtensao(a.nome), lido }));
      continue;
    }
    const leitor = await pdfjs.abrir(a.caminhoPdf);
    const lista = [];
    try {
      for (let n = 1; n <= leitor.numPages; n += 1) {
        ctx.checar();
        ctx.progresso(((i + n / leitor.numPages) / arquivos.length) * 92, `Preparando o slide ${n} de ${leitor.numPages}`);
        const d = await pdfjs.desenhar(leitor, n, { dpi: 190, qualidade: 88 });
        lista.push({ bytes: d.bytes, largura: d.larguraPt, altura: d.alturaPt });
      }
    } finally {
      leitor.destroy();
    }
    ctx.progresso(((i + 0.96) / arquivos.length) * 100, 'Montando a apresentação...');
    await ctx.gravar(`${semExtensao(a.nome)}.pptx`, ooxml.pptx({ titulo: semExtensao(a.nome), paginas: lista }));
  }
  avisarOcr(ctx, comOcr, semTexto);
}

/* ============================================================
   PDF/A
   ============================================================ */

async function pdfaComGhostscript(entrada, nivel) {
  const gs = so.acharGhostscript();
  if (!gs) return null;
  const saida = path.join(config.pastas.trabalho, `pdfa-${novoId()}.pdf`);
  try {
    await execFileAsync(gs, [
      `-dPDFA=${nivel[0]}`, '-dBATCH', '-dNOPAUSE', '-dQUIET', '-dNOOUTERSAVE', '-dSAFER',
      '-sColorConversionStrategy=RGB', '-sDEVICE=pdfwrite', '-dPDFACompatibilityPolicy=1',
      `-sOutputFile=${saida}`, entrada,
    ], { timeout: 600000, windowsHide: true });
    return await fsp.readFile(saida);
  } catch (_) {
    return null;
  } finally {
    fsp.rm(saida, { force: true }).catch(() => {});
  }
}

async function pdfParaPdfa({ arquivos, opcoes }, ctx) {
  const nivel = ['1B', '2B', '3B'].includes(opcoes.nivel) ? opcoes.nivel : '2B';
  let semFontes = 0;
  for (let i = 0; i < arquivos.length; i += 1) {
    ctx.checar();
    const a = arquivos[i];
    ctx.progresso((i / arquivos.length) * 90, `Convertendo ${a.nome}`);
    const gs = await pdfaComGhostscript(a.caminhoPdf, nivel);
    if (gs) {
      await ctx.gravar(`${semExtensao(a.nome)} - PDFA.pdf`, gs, { paginas: a.paginas });
      continue;
    }
    const doc = await pdf.abrir(a.caminhoPdf);
    // fontes não embutidas impedem a conformidade total
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      const d = obj instanceof PDFStream ? null : obj;
      if (!d || !d.lookup) continue;
      const tipo = d.lookup(PDFName.of('Type'));
      if (tipo instanceof PDFName && tipo.decodeText() === 'FontDescriptor'
        && !d.has(PDFName.of('FontFile')) && !d.has(PDFName.of('FontFile2')) && !d.has(PDFName.of('FontFile3'))) {
        semFontes += 1;
        break;
      }
    }
    doc.convertToPDFA({ conformance: nivel });
    await ctx.gravar(`${semExtensao(a.nome)} - PDFA.pdf`, await pdf.salvar(doc, { objetosCompactos: nivel !== '1B' }), { paginas: doc.getPageCount() });
  }
  if (semFontes) {
    ctx.aviso('Alguns arquivos usam fontes que não estão embutidas no PDF. O arquivo foi marcado como PDF/A, mas um validador rigoroso pode recusá-lo. Com o Ghostscript instalado, as fontes são embutidas automaticamente.');
  }
}

/* ---------------- registro ---------------- */

registrar('office-pdf', { executar: officeParaPdf, tipos: ['office'] });
registrar('imagem-pdf', { executar: imagemParaPdf, tipos: ['imagem'] });
registrar('html-pdf', { executar: siteParaPdf, entrada: 'nenhuma' });
registrar('pdf-jpg', { executar: pdfParaImagem });
registrar('pdf-texto', { executar: pdfParaTexto });
registrar('pdf-word', { executar: pdfParaWord });
registrar('pdf-excel', { executar: pdfParaExcel });
registrar('pdf-powerpoint', { executar: pdfParaPowerPoint });
registrar('pdf-pdfa', { executar: pdfParaPdfa });

module.exports = { officeParaPdf, imagemParaPdf, siteParaPdf, pdfParaImagem, pdfParaTexto, pdfParaWord, pdfParaExcel, pdfParaPowerPoint, pdfParaPdfa };
