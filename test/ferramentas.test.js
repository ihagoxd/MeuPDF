'use strict';

/**
 * Testa cada ferramenta do começo ao fim, com PDFs de verdade, e confere o
 * resultado lendo o arquivo gerado com o pdf.js.
 *
 *   npm test
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { unzipSync, strFromU8 } = require('fflate');

const A = require('./apoio');

after(async () => {
  await require('../src/motores/ocr').encerrarTodos();
  A.limpar();
});

const ok = (t) => assert.equal(t.estado, 'concluida', `esperava concluir, veio: ${t.estado} — ${t.erro || ''}`);

describe('entrada de arquivos', () => {
  test('PDF com restrição é liberado na entrada (texto legível)', async () => {
    const [a] = await A.registrar([await A.pdfRestrito('restrito.pdf')]);
    assert.equal(a.estado, 'pronto');
    assert.equal(a.protegido, true);
    const lido = await A.lerPdf(a.caminhoPdf);
    assert.match(lido.paginas[0].texto, /Restrito - página 1/);
  });

  test('PDF com senha fica aguardando e abre com a senha certa', async () => {
    const [a] = await A.registrar([await A.pdfComSenha('senha.pdf', 'segredo1')]);
    assert.equal(a.estado, 'senha');
    await assert.rejects(() => A.armazem.desbloquear(a.id, 'errada'), /Senha incorreta/);
    const pub = await A.armazem.desbloquear(a.id, 'segredo1');
    assert.equal(pub.estado, 'pronto');
    const lido = await A.lerPdf(A.armazem.obter(a.id).caminhoPdf);
    assert.match(lido.paginas[0].texto, /Sigiloso/);
  });

  test('arquivo que não é PDF é recusado com mensagem clara', async () => {
    const falso = path.join(A.PASTA, 'falso.pdf');
    fs.writeFileSync(falso, 'isto não é um pdf');
    const [a] = await A.registrar([falso]);
    assert.equal(a.estado, 'erro');
    assert.match(a.erro, /válido/);
  });

  test('foto de celular entra de pé (EXIF respeitado)', async () => {
    const [a] = await A.registrar([await A.fotoDeCelular('foto.jpg')]);
    assert.equal(a.estado, 'pronto');
    assert.ok(a.imagem.altura > a.imagem.largura, 'a foto deveria ficar em pé');
  });
});

describe('organizar', () => {
  test('juntar mantém a ordem e cria marcadores', async () => {
    const arquivos = await A.registrar([
      await A.pdfDeTexto('a.pdf', { paginas: 2, titulo: 'Alfa' }),
      await A.pdfRestrito('b.pdf'),
      await A.fotoDeCelular('c.jpg'),
    ]);
    const t = await A.rodar('juntar', arquivos, { marcadores: true, nome: 'Juntos' });
    ok(t);
    const lido = await A.lerPdf(t.arquivos[0]);
    assert.equal(lido.total, 5);
    assert.match(lido.paginas[0].texto, /Alfa - página 1/);
    assert.match(lido.paginas[2].texto, /Restrito - página 1/, 'página do PDF restrito tem que sair legível');
    assert.deepEqual(lido.marcadores, ['a', 'b', 'c']);
    assert.equal(path.basename(t.arquivos[0]), 'Juntos.pdf');
  });

  test('juntar para frente e verso põe página em branco quando precisa', async () => {
    const arquivos = await A.registrar([await A.pdfDeTexto('impar.pdf', { paginas: 3 }), await A.pdfDeTexto('par.pdf', { paginas: 2 })]);
    const t = await A.rodar('juntar', arquivos, { frenteVerso: true });
    ok(t);
    const lido = await A.lerPdf(t.arquivos[0]);
    assert.equal(lido.total, 6);
    assert.equal(lido.paginas[3].texto, '');
  });

  test('dividir por intervalos, a cada N e por tamanho', async () => {
    const [a] = await A.registrar([await A.pdfDeTexto('dez.pdf', { paginas: 10, titulo: 'Dez' })]);
    let t = await A.rodar('dividir', [a], { modo: 'intervalos', intervalos: '1-3, 4, 8-' });
    ok(t);
    assert.equal(t.arquivos.length, 3);
    assert.equal((await A.lerPdf(t.arquivos[2])).total, 3);
    t = await A.rodar('dividir', [a], { modo: 'cada', cada: 4 });
    ok(t);
    assert.deepEqual(await Promise.all(t.arquivos.map(async (c) => (await A.lerPdf(c)).total)), [4, 4, 2]);
    t = await A.rodar('dividir', [a], { modo: 'intervalos', intervalos: '2, 5', juntarIntervalos: true });
    ok(t);
    assert.equal((await A.lerPdf(t.arquivos[0])).total, 2);
    const [p] = await A.registrar([await A.pdfPesado('pesado-dividir.pdf')]);
    const tamanhoTotal = fs.statSync(p.caminhoPdf).size;
    t = await A.rodar('dividir', [p], { modo: 'tamanho', mb: (tamanhoTotal * 0.7) / 1024 / 1024 });
    ok(t);
    assert.equal(t.arquivos.length, 2, 'duas fotos pesadas devem ir para dois arquivos');
  });

  test('remover e extrair páginas', async () => {
    const [a] = await A.registrar([await A.pdfDeTexto('cinco.pdf', { paginas: 5, titulo: 'Cinco' })]);
    let t = await A.rodar('remover', [a], { selecao: { [a.id]: [2, 4] } });
    ok(t);
    let lido = await A.lerPdf(t.arquivos[0]);
    assert.deepEqual(lido.paginas.map((p) => p.texto.match(/página (\d)/)[1]), ['1', '3', '5']);
    t = await A.rodar('remover', [a], { selecao: { [a.id]: [1, 2, 3, 4, 5] } });
    assert.equal(t.estado, 'erro');
    t = await A.rodar('extrair', [a], { selecao: { [a.id]: [5, 1] } });
    ok(t);
    lido = await A.lerPdf(t.arquivos[0]);
    assert.equal(lido.total, 2);
    t = await A.rodar('extrair', [a], { selecao: { [a.id]: [2, 3] }, separadas: true });
    ok(t);
    assert.equal(t.arquivos.length, 2);
  });

  test('organizar: ordem livre, giro, branca e dois arquivos', async () => {
    const [a, b] = await A.registrar([await A.pdfDeTexto('x.pdf', { paginas: 2, titulo: 'X' }), await A.pdfDeTexto('y.pdf', { paginas: 1, titulo: 'Y' })]);
    const t = await A.rodar('organizar', [a, b], {
      paginas: [
        { arquivo: b.id, pagina: 1 },
        { branco: true },
        { arquivo: a.id, pagina: 2, rotacao: 90 },
        { arquivo: a.id, pagina: 1 },
      ],
    });
    ok(t);
    const lido = await A.lerPdf(t.arquivos[0]);
    assert.equal(lido.total, 4);
    assert.match(lido.paginas[0].texto, /Y - página 1/);
    assert.equal(lido.paginas[1].texto, '');
    assert.equal(lido.paginas[2].rotacao, 90);
    assert.match(lido.paginas[3].texto, /X - página 1/);
  });

  test('girar soma ao giro que a página já tinha', async () => {
    const [a] = await A.registrar([await A.pdfDeTexto('deitado.pdf', { paginas: 2, rotacao: 90 })]);
    const t = await A.rodar('girar', [a], { rotacoes: { [a.id]: { 1: 270, 2: 180 } } });
    ok(t);
    const lido = await A.lerPdf(t.arquivos[0]);
    assert.deepEqual(lido.paginas.map((p) => p.rotacao), [0, 270]);
  });
});

describe('editar', () => {
  test('numerar aparece como texto na página, inclusive em página girada', async () => {
    const [a] = await A.registrar([await A.pdfDeTexto('numerar.pdf', { paginas: 3, rotacao: 90 })]);
    const t = await A.rodar('numerar', [a], { formato: 'Fls. {n}', inicio: 10, paginas: '2-', posicao: 'inf-dir' });
    ok(t);
    const lido = await A.lerPdf(t.arquivos[0]);
    assert.ok(!/Fls\./.test(lido.paginas[0].texto), 'a página 1 ficou de fora');
    assert.match(lido.paginas[1].texto, /Fls\. 10/);
    assert.match(lido.paginas[2].texto, /Fls\. 11/);
  });

  test('numerar com "de {total}" e acentos', async () => {
    const [a] = await A.registrar([await A.pdfDeTexto('total.pdf', { paginas: 2 })]);
    const t = await A.rodar('numerar', [a], { formato: 'Página {n} de {total}' });
    ok(t);
    const lido = await A.lerPdf(t.arquivos[0]);
    assert.match(lido.paginas[1].texto, /Página 2 de 2/);
  });

  test("marca d'água em texto (mosaico, por baixo) e em imagem", async () => {
    const [a] = await A.registrar([await A.pdfRestrito('marca.pdf')]);
    let t = await A.rodar('marca-dagua', [a], { tipo: 'texto', texto: 'CONFIDENCIAL', disposicao: 'mosaico', camada: 'sob', rotacao: 45 });
    ok(t);
    let lido = await A.lerPdf(t.arquivos[0]);
    assert.match(lido.paginas[0].texto, /CONFIDENCIAL/);
    assert.match(lido.paginas[0].texto, /Restrito - página 1/);
    const png = fs.readFileSync(await A.pngTransparente('logo.png'));
    t = await A.rodar('marca-dagua', [a], { tipo: 'imagem', imagem: `data:image/png;base64,${png.toString('base64')}`, posicao: 'sup-dir' });
    ok(t);
    lido = await A.lerPdf(t.arquivos[0]);
    assert.equal(lido.total, 2);
  });

  test('editar/assinar coloca texto e imagem no lugar certo', async () => {
    const [a] = await A.registrar([await A.pdfDeTexto('assinar.pdf', { paginas: 2 })]);
    const png = fs.readFileSync(await A.pngTransparente('assinatura.png'));
    const t = await A.rodar('assinar', [a], {
      elementos: [
        { tipo: 'imagem', pagina: 2, x: 0.6, y: 0.8, w: 0.3, h: 0.1, imagem: `data:image/png;base64,${png.toString('base64')}` },
        { tipo: 'texto', pagina: 1, x: 0.1, y: 0.5, w: 0.5, h: 0.05, texto: 'Recebido em 14/10/2026 ✓', tamanho: 14 },
        { tipo: 'retangulo', pagina: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.05, fundo: '#ffffff' },
      ],
    });
    ok(t);
    const lido = await A.lerPdf(t.arquivos[0]);
    assert.match(lido.paginas[0].texto, /Recebido em 14\/10\/2026/);
  });

  test('recortar muda a área visível', async () => {
    const [a] = await A.registrar([await A.pdfDeTexto('recortar.pdf', { paginas: 2 })]);
    const t = await A.rodar('recortar', [a], { recorte: { x: 0.1, y: 0.1, w: 0.5, h: 0.5, pagina: 1 } });
    ok(t);
    const lido = await A.lerPdf(t.arquivos[0]);
    assert.ok(Math.abs(lido.paginas[0].largura - 297.6) < 1, `largura ${lido.paginas[0].largura}`);
    assert.ok(Math.abs(lido.paginas[1].altura - 420.9) < 1);
  });

  test('propriedades: alterar e limpar', async () => {
    const [a] = await A.registrar([await A.pdfDeTexto('meta.pdf', { paginas: 1 })]);
    let t = await A.rodar('metadados', [a], { titulo: 'Petição inicial', autor: 'Escritório', palavrasChave: 'cível, urgente' });
    ok(t);
    const doc = await A.PDFDocument.load(fs.readFileSync(t.arquivos[0]), { updateMetadata: false });
    assert.equal(doc.getTitle(), 'Petição inicial');
    assert.equal(doc.getAuthor(), 'Escritório');
    t = await A.rodar('metadados', [a], { limpar: true });
    ok(t);
    const limpo = await A.PDFDocument.load(fs.readFileSync(t.arquivos[0]), { updateMetadata: false });
    assert.equal(limpo.getAuthor(), undefined);
  });

  test('achatar formulário: o valor fica na página e os campos somem', async () => {
    const [a] = await A.registrar([await A.pdfComFormulario('form.pdf')]);
    const t = await A.rodar('achatar', [a], {});
    ok(t);
    const doc = await A.PDFDocument.load(fs.readFileSync(t.arquivos[0]));
    assert.equal(doc.getForm().getFields().length, 0);
    const lido = await A.lerPdf(t.arquivos[0]);
    assert.match(lido.paginas[0].texto, /Maria Oliveira/);
  });
});

describe('segurança', () => {
  test('proteger com senha (AES-256) e desbloquear de volta', async () => {
    const [a] = await A.registrar([await A.pdfDeTexto('proteger.pdf', { paginas: 1, titulo: 'Protegido' })]);
    const t = await A.rodar('proteger', [a], { senha: 'minhasenha', imprimir: true });
    ok(t);
    await assert.rejects(() => A.lerPdf(t.arquivos[0]));
    const lido = await A.lerPdf(t.arquivos[0], 'minhasenha');
    assert.match(lido.paginas[0].texto, /Protegido/);

    const [b] = await A.registrar([t.arquivos[0]]);
    assert.equal(b.estado, 'senha');
    await A.armazem.desbloquear(b.id, 'minhasenha');
    const t2 = await A.rodar('desbloquear', [b], {});
    ok(t2);
    const livre = await A.lerPdf(t2.arquivos[0]);
    assert.match(livre.paginas[0].texto, /Protegido/);
  });

  test('senha curta é recusada', async () => {
    const [a] = await A.registrar([await A.pdfDeTexto('curta.pdf', { paginas: 1 })]);
    const t = await A.rodar('proteger', [a], { senha: '12' });
    assert.equal(t.estado, 'erro');
  });

  test('desbloquear PDF com restrição tira a trava', async () => {
    const [a] = await A.registrar([await A.pdfRestrito('travado.pdf')]);
    const t = await A.rodar('desbloquear', [a], {});
    ok(t);
    const doc = await A.PDFDocument.load(fs.readFileSync(t.arquivos[0]));
    assert.equal(doc.isEncrypted, false);
  });

  test('tarjar apaga de verdade o texto coberto (e só nas páginas marcadas)', async () => {
    const [a] = await A.registrar([await A.pdfDeTexto('tarjar.pdf', { paginas: 2, titulo: 'Sigilo' })]);
    const achados = await require('../src/motores/texto').localizar(a.caminhoPdf, { padroes: ['cpf'] });
    assert.equal(achados.length, 2, 'acha o CPF nas duas páginas');
    const t = await A.rodar('tarjar', [a], { elementos: [{ ...achados[0], tipo: 'tarja' }] });
    ok(t);
    const lido = await A.lerPdf(t.arquivos[0]);
    assert.ok(!/123\.456/.test(lido.paginas[0].texto), 'o CPF tarjado não pode sobrar como texto');
    assert.match(lido.paginas[1].texto, /123\.456\.789-09/, 'a página 2 não foi tarjada');
    const bruto = fs.readFileSync(t.arquivos[0]).toString('latin1');
    assert.ok(!bruto.includes('123.456.789-09'), 'nem escondido no arquivo');
  });
});

describe('otimizar', () => {
  test('comprimir reduz fotos e mantém o texto selecionável', async () => {
    const [a] = await A.registrar([await A.pdfPesado('pesado.pdf')]);
    const t = await A.rodar('comprimir', [a], { nivel: 'recomendada' });
    ok(t);
    const antes = fs.statSync(a.caminhoPdf).size;
    const depois = fs.statSync(t.arquivos[0]).size;
    assert.ok(depois < antes * 0.6, `esperava reduzir bem: ${antes} -> ${depois}`);
    const lido = await A.lerPdf(t.arquivos[0]);
    assert.match(lido.paginas[0].texto, /Texto que precisa continuar selecionavel/);
  });

  test('comprimir nunca entrega arquivo maior', async () => {
    const [a] = await A.registrar([await A.pdfDeTexto('leve.pdf', { paginas: 1 })]);
    const t = await A.rodar('comprimir', [a], { nivel: 'extrema' });
    ok(t);
    assert.ok(fs.statSync(t.arquivos[0]).size <= fs.statSync(a.caminhoPdf).size);
  });

  test('reparar um PDF com lixo e xref quebrada', async () => {
    const bom = fs.readFileSync(await A.pdfDeTexto('para-quebrar.pdf', { paginas: 2, titulo: 'Quebrado' }));
    const texto = bom.toString('latin1').replace(/startxref\s+\d+/, 'startxref\n999999');
    const quebrado = path.join(A.PASTA, 'quebrado.pdf');
    fs.writeFileSync(quebrado, Buffer.concat([Buffer.from('LIXO NO COMECO\n'), Buffer.from(texto, 'latin1')]));
    const [a] = await A.registrar([quebrado]);
    const t = await A.rodar('reparar', [a], {});
    ok(t);
    const lido = await A.lerPdf(t.arquivos[0]);
    assert.equal(lido.total, 2);
  });

  test('OCR torna pesquisável o documento digitalizado', { timeout: 240000 }, async () => {
    const [a] = await A.registrar([await A.pdfDigitalizado('digitalizado.pdf')]);
    const antes = await A.lerPdf(a.caminhoPdf);
    assert.equal(antes.paginas[0].texto, '');
    const t = await A.rodar('ocr', [a], { idioma: 'por' });
    ok(t);
    const lido = await A.lerPdf(t.arquivos[0]);
    assert.match(lido.paginas[0].texto, /CONTRATO/);
    assert.match(lido.paginas[0].texto, /Silva/);
  });
});

describe('converter', () => {
  test('imagens para PDF: juntas, de pé, com transparência', async () => {
    const arquivos = await A.registrar([await A.fotoDeCelular('f1.jpg'), await A.pngTransparente('f2.png')]);
    const t = await A.rodar('imagem-pdf', arquivos, { juntar: true, tamanho: 'a4', orientacao: 'auto' });
    ok(t);
    const lido = await A.lerPdf(t.arquivos[0]);
    assert.equal(lido.total, 2);
    assert.ok(lido.paginas[0].altura > lido.paginas[0].largura, 'foto girada pelo EXIF fica em retrato');
  });

  test('PDF para JPG: uma imagem por página e extração das fotos', async () => {
    const [a] = await A.registrar([await A.pdfDeTexto('jpg.pdf', { paginas: 3 })]);
    let t = await A.rodar('pdf-jpg', [a], { modo: 'paginas', dpi: '96', paginas: '1,3' });
    ok(t);
    assert.equal(t.arquivos.length, 2);
    const meta = await require('sharp')(t.arquivos[0]).metadata();
    assert.equal(meta.density, 96);
    const [p] = await A.registrar([await A.pdfPesado('fotos.pdf')]);
    t = await A.rodar('pdf-jpg', [p], { modo: 'imagens' });
    ok(t);
    assert.equal(t.arquivos.length, 2);
  });

  test('PDF para texto', async () => {
    const [a] = await A.registrar([await A.pdfComTabela('texto.pdf')]);
    const t = await A.rodar('pdf-texto', [a], {});
    ok(t);
    const conteudo = fs.readFileSync(t.arquivos[0], 'utf8');
    assert.match(conteudo, /Relatório de honorários/);
    assert.match(conteudo, /Ana Souza\s+0001234-56\.2025/);
  });

  test('PDF para Word gera DOCX com parágrafos e tabela', async () => {
    const [a] = await A.registrar([await A.pdfComTabela('word.pdf')]);
    const t = await A.rodar('pdf-word', [a], { modo: 'texto' });
    ok(t);
    const zip = unzipSync(fs.readFileSync(t.arquivos[0]));
    const doc = strFromU8(zip['word/document.xml']);
    assert.match(doc, /Relatório de honorários/);
    assert.match(doc, /<w:tbl>/);
    assert.match(doc, /assinados e as decisões/, 'as duas linhas do parágrafo viram um parágrafo só');
    const t2 = await A.rodar('pdf-word', [a], { modo: 'imagem' });
    ok(t2);
    assert.ok(unzipSync(fs.readFileSync(t2.arquivos[0]))['word/media/pagina1.jpeg']);
  });

  test('PDF para Word leva imagens, tabela com bordas, cores, sublinhado, cabeçalho e rodapé', async () => {
    const [a] = await A.registrar([await A.pdfCompleto('word-completo.pdf')]);
    const t = await A.rodar('pdf-word', [a], { modo: 'texto' });
    ok(t);
    const zip = unzipSync(fs.readFileSync(t.arquivos[0]));
    const doc = strFromU8(zip['word/document.xml']);
    const midias = Object.keys(zip).filter((k) => k.startsWith('word/media/'));
    assert.ok(midias.some((k) => k.endsWith('.png')), 'o logo (com transparência) vai como imagem');
    assert.ok(midias.some((k) => k.endsWith('.jpeg')), 'a foto vai como JPEG');
    assert.match(doc, /<w:tbl>[\s\S]*<w:top w:val="single"[\s\S]*w:fill="D9D9D9"/, 'tabela com bordas e o fundo do cabeçalho');
    assert.match(doc, />Parcela</);
    assert.match(doc, /<w:color w:val="1F4[CD]78"\/>/, 'título na cor do PDF');
    assert.match(doc, /<w:u w:val="single"\/>[\s\S]{0,200}Atenção:/, 'palavra sublinhada');
    assert.match(doc, /w:ascii="Times New Roman"/, 'fonte do PDF');
    assert.doesNotMatch(doc, /Escritório Modelo/, 'o cabeçalho repetido sai do corpo');
    assert.match(strFromU8(zip['word/header1.xml']), /Escritório Modelo de Advocacia/);
    const rodape = strFromU8(zip['word/footer1.xml']);
    assert.match(rodape, /w:instr=" PAGE [^"]*"/, 'número da página vira campo');
    assert.match(rodape, /w:instr=" NUMPAGES [^"]*"/, 'total de páginas vira campo');
    assert.match(doc, /<w:pageBreakBefore\/>/, 'cada página do PDF começa uma página no Word');
  });

  test('PDF para Word: tabela sem linhas (extrato) vira tabela, um valor por célula', async () => {
    const [a] = await A.registrar([await A.pdfComTabela('word-tabela-solta.pdf')]);
    const t = await A.rodar('pdf-word', [a], { modo: 'texto' });
    ok(t);
    const zip = unzipSync(fs.readFileSync(t.arquivos[0]));
    const doc = strFromU8(zip['word/document.xml']);
    const tabela = doc.match(/<w:tbl>[\s\S]*?<\/w:tbl>/);
    assert.ok(tabela, 'tem tabela');
    assert.equal((tabela[0].match(/<w:gridCol /g) || []).length, 4, 'quatro colunas');
    assert.equal((tabela[0].match(/<w:tr>/g) || []).length, 5, 'cinco linhas');
    const celulas = [...tabela[0].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
    assert.deepEqual(celulas.slice(4, 8), ['Ana Souza', '0001234-56.2025', 'R$ 1.234,56', '01/02/2025']);
    assert.doesNotMatch(tabela[0], /w:val="single"/, 'sem borda que o PDF não tem');
    // texto que não veio do Word novo: modo sem o aperto de espaços do justificado
    assert.match(strFromU8(zip['word/settings.xml']), /compatibilityMode" w:uri="[^"]+" w:val="14"/);
  });

  test('PDF digitalizado vira Word editável (OCR automático)', { timeout: 240000 }, async () => {
    const [a] = await A.registrar([await A.pdfDigitalizado('word-scan.pdf')]);
    const t = await A.rodar('pdf-word', [a], { modo: 'texto' });
    ok(t);
    const doc = strFromU8(unzipSync(fs.readFileSync(t.arquivos[0]))['word/document.xml']);
    assert.match(doc, /PRESTA/, 'o texto da foto do papel virou texto');
    assert.ok(t.avisos.some((x) => /OCR/.test(x)), 'avisa que usou OCR');
    const sem = await A.rodar('pdf-word', [a], { modo: 'texto', ocr: false });
    ok(sem);
    assert.ok(sem.avisos.some((x) => /como imagem/.test(x)), 'sem OCR, avisa que ficou como imagem');
  });

  test('PDF para Excel reconhece colunas, valores e datas', async () => {
    const [a] = await A.registrar([await A.pdfComTabela('excel.pdf')]);
    const t = await A.rodar('pdf-excel', [a], { numeros: true });
    ok(t);
    const zip = unzipSync(fs.readFileSync(t.arquivos[0]));
    const folha = strFromU8(zip['xl/worksheets/sheet1.xml']);
    assert.match(folha, /<v>1234\.56<\/v>/, 'R$ 1.234,56 vira número');
    assert.match(folha, />0001234-56\.2025</, 'número de processo continua texto');
    assert.match(folha, /<v>45689<\/v>/, '01/02/2025 vira data do Excel');
  });

  test('PDF para Excel usa as bordas da tabela para separar as colunas', async () => {
    const [a] = await A.registrar([await A.pdfCompleto('excel-bordas.pdf')]);
    const t = await A.rodar('pdf-excel', [a], { numeros: true, abas: 'pagina' });
    ok(t);
    const folha = strFromU8(unzipSync(fs.readFileSync(t.arquivos[0]))['xl/worksheets/sheet1.xml']);
    const celula = (texto) => (new RegExp(`<c r="([A-Z]+)\\d+"[^>]*>(?:<is><t[^>]*>${texto}</t>|<v>${texto}</v>)`).exec(folha) || [])[1];
    assert.equal(celula('Parcela'), 'A');
    assert.equal(celula('Vencimento'), 'B');
    assert.equal(celula('Valor'), 'C');
    assert.equal(celula('1500'), 'C', 'R$ 1.500,00 vira número na coluna do valor');
    assert.match(folha, /<c r="A\d+" s="1[0-5]"/, 'células da tabela com borda');
  });

  test('PDF para PowerPoint: editável (caixas de texto e imagens) ou como imagem', async () => {
    const [a] = await A.registrar([await A.pdfCompleto('ppt-completo.pdf')]);
    const t = await A.rodar('pdf-powerpoint', [a], {});
    ok(t);
    const zip = unzipSync(fs.readFileSync(t.arquivos[0]));
    assert.ok(zip['ppt/slides/slide2.xml']);
    assert.ok(!zip['ppt/slides/slide3.xml']);
    const slide = strFromU8(zip['ppt/slides/slide1.xml']);
    assert.match(slide, /<p:cNvSpPr txBox="1"\/>/, 'texto em caixa de texto');
    assert.match(slide, /CONTRATO DE HONORÁRIOS/);
    assert.match(slide, /<a:latin typeface="Times New Roman"\/>/);
    assert.match(slide, /<p:pic>/, 'logo e foto como imagens soltas');
    const t2 = await A.rodar('pdf-powerpoint', [a], { modo: 'imagem' });
    ok(t2);
    assert.ok(unzipSync(fs.readFileSync(t2.arquivos[0]))['ppt/media/pagina1.jpeg']);
  });

  test('extrair imagens mantém a transparência e não solta as máscaras', async () => {
    const [a] = await A.registrar([await A.pdfCompleto('extrair.pdf')]);
    const t = await A.rodar('pdf-jpg', [a], { modo: 'imagens' });
    ok(t);
    assert.equal(t.arquivos.length, 2, 'logo e foto (a máscara do logo não vira imagem separada)');
    const png = t.arquivos.find((f) => f.endsWith('.png'));
    const meta = await require('sharp')(png).metadata();
    assert.ok(meta.hasAlpha, 'o logo sai com fundo transparente');
  });

  test('PDF para PDF/A marca a conformidade', async () => {
    const [a] = await A.registrar([await A.pdfDeTexto('pdfa.pdf', { paginas: 1 })]);
    const t = await A.rodar('pdf-pdfa', [a], { nivel: '2B' });
    ok(t);
    const bruto = fs.readFileSync(t.arquivos[0]).toString('latin1');
    assert.match(bruto, /pdfaid:part/);
  });
});

describe('comparar', () => {
  test('acha linha alterada, removida e adicionada', async () => {
    const { PDFDocument, StandardFonts } = require('@cantoo/pdf-lib');
    const criar = async (nome, linhas) => {
      const d = await PDFDocument.create();
      const f = await d.embedFont(StandardFonts.Helvetica);
      const p = d.addPage([595, 842]);
      linhas.forEach((l, i) => p.drawText(l, { x: 50, y: 780 - i * 20, size: 12, font: f }));
      const c = path.join(A.PASTA, nome);
      fs.writeFileSync(c, await d.save());
      return c;
    };
    const [a, b] = await A.registrar([
      await criar('v1.pdf', ['Contrato de locação', 'O valor do aluguel é de R$ 1.000,00 por mês.', 'Cláusula que vai sair.', 'Fim.']),
      await criar('v2.pdf', ['Contrato de locação', 'O valor do aluguel é de R$ 1.200,00 por mês.', 'Fim.', 'Cláusula nova.']),
    ]);
    const t = await A.rodar('comparar', [a, b], {});
    ok(t);
    assert.equal(t.dados.resumo.alteradas, 1);
    assert.equal(t.dados.resumo.removidas, 1);
    assert.equal(t.dados.resumo.adicionadas, 1);
    const alterada = t.dados.linhas.find((l) => l.t === '~');
    assert.ok(alterada.partes.some((p) => p.t === '+' && p.s.includes('1.200,00')));
    const lido = await A.lerPdf(t.arquivos[0]);
    assert.match(lido.paginas[0].texto, /Comparação de documentos/);
  });
});
