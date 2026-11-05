'use strict';

/**
 * Apoio dos testes: dados num diretório temporário, arquivos de exemplo
 * gerados na hora e um jeito simples de rodar uma ferramenta até o fim.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// tudo que os testes gravam vai para uma pasta temporária própria
const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'meupdf-teste-'));
process.env.MEUPDF_DADOS = DADOS;

const { PDFDocument, StandardFonts, rgb, degrees, PDFName, PDFString } = require('@cantoo/pdf-lib');
const sharp = require('sharp');

const config = require('../src/config');
const armazem = require('../src/nucleo/armazem');
const tarefas = require('../src/nucleo/tarefas');
require('../src/ferramentas/todas');
const ferramentas = require('../src/ferramentas');
const pdfjs = require('../src/motores/pdfjs');

const PASTA = path.join(DADOS, 'exemplos');
fs.mkdirSync(PASTA, { recursive: true });

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ---------------- arquivos de exemplo ---------------- */

async function pdfDeTexto(nome, { paginas = 3, rotacao = 0, titulo = 'Documento', tamanho = [595.28, 841.89] } = {}) {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const b = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let n = 1; n <= paginas; n += 1) {
    const p = doc.addPage(tamanho);
    p.drawText(`${titulo} - página ${n}`, { x: 60, y: tamanho[1] - 80, size: 20, font: b });
    p.drawText(`Cláusula ${n}: o contratante pagará a quantia combinada.`, { x: 60, y: tamanho[1] - 120, size: 12, font: f });
    p.drawText('CPF do cliente: 123.456.789-09', { x: 60, y: tamanho[1] - 140, size: 12, font: f });
    p.drawRectangle({ x: 60, y: 200, width: 120 + n * 20, height: 80, color: rgb(0.2, 0.4, 0.8) });
    if (rotacao) p.setRotation(degrees(rotacao));
  }
  const caminho = path.join(PASTA, nome);
  fs.writeFileSync(caminho, await doc.save());
  return caminho;
}

async function pdfComTabela(nome) {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const b = await doc.embedFont(StandardFonts.HelveticaBold);
  const p = doc.addPage([595.28, 841.89]);
  p.drawText('Relatório de honorários', { x: 50, y: 780, size: 20, font: b });
  p.drawText('Este relatório lista os valores devidos por cliente no mês, conforme os contratos', { x: 50, y: 750, size: 11, font: f });
  p.drawText('assinados e as decisões publicadas no período.', { x: 50, y: 736, size: 11, font: f });
  const cols = [50, 200, 350, 470];
  const linhas = [
    ['Cliente', 'Processo', 'Valor', 'Data'],
    ['Ana Souza', '0001234-56.2025', 'R$ 1.234,56', '01/02/2025'],
    ['Bruno Lima', '2022331-01.2024', 'R$ 987,00', '15/03/2025'],
    ['Carla Dias', '3033442-55.2023', 'R$ 12.000,10', '20/04/2025'],
    ['Total', '', 'R$ 14.221,66', ''],
  ];
  linhas.forEach((l, i) => l.forEach((c, j) => { if (c) p.drawText(c, { x: cols[j], y: 690 - i * 22, size: 11, font: i === 0 ? b : f }); }));
  const caminho = path.join(PASTA, nome);
  fs.writeFileSync(caminho, await doc.save());
  return caminho;
}

async function pdfRestrito(nome) {
  const base = await PDFDocument.load(fs.readFileSync(await pdfDeTexto(`base-${nome}`, { paginas: 2, titulo: 'Restrito' })));
  base.encrypt({ userPassword: '', ownerPassword: 'dono-secreto', permissions: { printing: false, copying: false, modifying: false } });
  const caminho = path.join(PASTA, nome);
  fs.writeFileSync(caminho, await base.save());
  return caminho;
}

async function pdfComSenha(nome, senha = 'abc123') {
  const base = await PDFDocument.load(fs.readFileSync(await pdfDeTexto(`base-${nome}`, { paginas: 2, titulo: 'Sigiloso' })));
  base.encrypt({ userPassword: senha, ownerPassword: 'x', permissions: { printing: 'highResolution' } });
  const caminho = path.join(PASTA, nome);
  fs.writeFileSync(caminho, await base.save());
  return caminho;
}

/** Imagem com texto (como uma folha digitalizada). */
async function imagemComTexto({ largura = 1654, altura = 2339, linhas = ['CONTRATO DE PRESTAÇÃO DE SERVIÇOS', 'O cliente João da Silva declara que', 'aceita as condições deste acordo.'] } = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">
    <rect width="100%" height="100%" fill="#fbfaf6"/>
    ${linhas.map((t, i) => `<text x="140" y="${300 + i * 110}" font-family="Arial" font-size="${i ? 54 : 64}" fill="#111">${t}</text>`).join('')}
    <rect x="140" y="${300 + linhas.length * 110 + 60}" width="900" height="500" fill="#c9d6ea"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

async function pdfDigitalizado(nome) {
  const doc = await PDFDocument.create();
  const jpg = await imagemComTexto();
  const img = await doc.embedJpg(jpg);
  const p = doc.addPage([595.28, 841.89]);
  p.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
  const caminho = path.join(PASTA, nome);
  fs.writeFileSync(caminho, await doc.save());
  return caminho;
}

/** PDF "pesado": fotos grandes que dá para comprimir. */
async function pdfPesado(nome) {
  const doc = await PDFDocument.create();
  for (let n = 0; n < 2; n += 1) {
    const ruido = await sharp({
      create: { width: 2400, height: 3200, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } },
    }).jpeg({ quality: 95 }).toBuffer();
    const img = await doc.embedJpg(ruido);
    const p = doc.addPage([595.28, 841.89]);
    p.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
    p.drawText('Texto que precisa continuar selecionavel', { x: 40, y: 40, size: 14, font: await doc.embedFont(StandardFonts.Helvetica) });
  }
  const caminho = path.join(PASTA, nome);
  fs.writeFileSync(caminho, await doc.save());
  return caminho;
}

async function pdfComFormulario(nome) {
  const doc = await PDFDocument.create();
  const p = doc.addPage([595.28, 841.89]);
  const form = doc.getForm();
  const campo = form.createTextField('cliente');
  campo.setText('Maria Oliveira');
  campo.addToPage(p, { x: 60, y: 700, width: 300, height: 28 });
  const marca = form.createCheckBox('aceito');
  marca.check();
  marca.addToPage(p, { x: 60, y: 650, width: 18, height: 18 });
  const caminho = path.join(PASTA, nome);
  fs.writeFileSync(caminho, await doc.save());
  return caminho;
}

async function fotoDeCelular(nome) {
  // foto "deitada": pixels em paisagem, EXIF mandando girar 90°
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="100%" height="100%" fill="#fff"/><rect x="0" y="0" width="1600" height="200" fill="#d00"/><text x="80" y="600" font-size="90" font-family="Arial">FOTO</text></svg>`;
  const bytes = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).withMetadata({ orientation: 6 }).toBuffer();
  const caminho = path.join(PASTA, nome);
  fs.writeFileSync(caminho, bytes);
  return caminho;
}

async function pngTransparente(nome) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><circle cx="150" cy="150" r="120" fill="#0a7"/><text x="300" y="170" font-size="60" font-family="Arial">logo</text></svg>';
  const caminho = path.join(PASTA, nome);
  fs.writeFileSync(caminho, await sharp(Buffer.from(svg)).png().toBuffer());
  return caminho;
}

/**
 * Documento "de verdade": logo com transparência, foto, título colorido,
 * palavra sublinhada, tabela com bordas e fundo no cabeçalho, e o mesmo
 * cabeçalho/rodapé (com "Página N de 2") nas duas páginas.
 */
async function pdfCompleto(nome) {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.TimesRoman);
  const b = await doc.embedFont(StandardFonts.TimesRomanBold);
  const logo = await doc.embedPng(fs.readFileSync(await pngTransparente(`logo-${nome}.png`)));
  // foto de verdade tem textura (milhares de cores)
  const foto = await doc.embedJpg(await sharp({ create: { width: 900, height: 600, channels: 3, noise: { type: 'gaussian', mean: 120, sigma: 35 } } })
    .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><circle cx="700" cy="150" r="90" fill="#ffd200" fill-opacity="0.8"/><polygon points="0,600 380,220 760,600" fill="#2e8b57" fill-opacity="0.7"/></svg>') }])
    .jpeg({ quality: 88 }).toBuffer());
  for (let n = 1; n <= 2; n += 1) {
    const p = doc.addPage([595.28, 841.89]);
    p.drawText('Escritório Modelo de Advocacia', { x: 60, y: 805, size: 9, font: f, color: rgb(0.4, 0.4, 0.4) });
    p.drawText(`Página ${n} de 2`, { x: 260, y: 30, size: 9, font: f });
    if (n === 1) {
      p.drawImage(logo, { x: 60, y: 720, width: 120, height: 60 });
      p.drawText('CONTRATO DE HONORÁRIOS', { x: 60, y: 680, size: 18, font: b, color: rgb(0.12, 0.3, 0.47) });
      p.drawText('O contratante pagará os honorários conforme a tabela abaixo, em', { x: 60, y: 650, size: 12, font: f });
      p.drawText('parcelas mensais e sucessivas, sem juros.', { x: 60, y: 636, size: 12, font: f });
      p.drawText('Atenção:', { x: 60, y: 610, size: 12, font: b });
      p.drawLine({ start: { x: 60, y: 608 }, end: { x: 60 + b.widthOfTextAtSize('Atenção:', 12), y: 608 }, thickness: 0.8 });
      p.drawText('o atraso gera multa de 2%.', { x: 112, y: 610, size: 12, font: f });
      // tabela com bordas: 3 colunas x 3 linhas, cabeçalho com fundo cinza
      const xs = [60, 200, 340, 480];
      const ys = [580, 558, 536, 514];
      p.drawRectangle({ x: 60, y: 558, width: 420, height: 22, color: rgb(0.85, 0.85, 0.85) });
      for (const y of ys) p.drawLine({ start: { x: 60, y }, end: { x: 480, y }, thickness: 0.75 });
      for (const x of xs) p.drawLine({ start: { x, y: 580 }, end: { x, y: 514 }, thickness: 0.75 });
      [['Parcela', 'Vencimento', 'Valor'], ['1ª', '10/01/2027', 'R$ 1.500,00'], ['2ª', '10/02/2027', 'R$ 1.500,00']]
        .forEach((l, i) => l.forEach((t, j) => p.drawText(t, { x: xs[j] + 5, y: ys[i] - 15, size: 11, font: i === 0 ? b : f })));
      p.drawImage(foto, { x: 60, y: 300, width: 240, height: 160 });
    } else {
      p.drawText('Cláusula final: as partes elegem o foro da comarca de Araguaína.', { x: 60, y: 760, size: 12, font: f });
    }
  }
  const caminho = path.join(PASTA, nome);
  fs.writeFileSync(caminho, await doc.save());
  return caminho;
}

/* ---------------- rodar ferramentas ---------------- */

async function registrar(caminhos) {
  const entradas = caminhos.map((c) => {
    const copia = path.join(config.pastas.entrada, `${Math.random().toString(36).slice(2)}${path.extname(c)}`);
    fs.copyFileSync(c, copia);
    return { nome: path.basename(c), caminho: copia, tamanho: fs.statSync(copia).size };
  });
  const novos = armazem.registrar(entradas);
  const limite = Date.now() + 180000;
  while (novos.some((a) => armazem.obter(a.id).estado === 'preparando')) {
    if (Date.now() > limite) throw new Error('Arquivos não ficaram prontos a tempo.');
    await esperar(50);
  }
  return novos.map((a) => armazem.obter(a.id));
}

async function rodar(ferramenta, arquivos, opcoes = {}) {
  const ids = arquivos.map((a) => (typeof a === 'string' ? a : a.id));
  const t = ferramentas.executar(ferramenta, { arquivos: ids, opcoes });
  const limite = Date.now() + 600000;
  for (;;) {
    const atual = tarefas.obter(t.id);
    if (['concluida', 'erro', 'cancelada'].includes(atual.estado)) {
      return {
        ...atual,
        arquivos: atual.resultados.map((r) => armazem.obterResultado(r.id).caminho),
      };
    }
    if (Date.now() > limite) throw new Error('Tarefa demorou demais.');
    await esperar(40);
  }
}

/* ---------------- inspeção ---------------- */

async function lerPdf(caminho, senha) {
  const doc = await pdfjs.abrir(caminho, { senha });
  try {
    const paginas = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const p = await doc.getPage(n);
      const t = await p.getTextContent();
      paginas.push({
        texto: t.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim(),
        rotacao: p.rotate,
        largura: p.view[2] - p.view[0],
        altura: p.view[3] - p.view[1],
      });
      p.cleanup();
    }
    const marcadores = await doc.getOutline();
    return { paginas, total: doc.numPages, marcadores: (marcadores || []).map((m) => m.title) };
  } finally {
    doc.destroy();
  }
}

function limpar() {
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch (_) { /* arquivos ainda abertos */ }
}

module.exports = {
  DADOS, PASTA, esperar,
  pdfDeTexto, pdfComTabela, pdfRestrito, pdfComSenha, pdfDigitalizado, pdfPesado, pdfComFormulario, pdfCompleto,
  fotoDeCelular, pngTransparente, imagemComTexto,
  registrar, rodar, lerPdf, limpar,
  armazem,
  PDFDocument, PDFName, PDFString,
};
