'use strict';

/**
 * Arquivos do Office (Word, Excel, PowerPoint) gerados direto em XML.
 * Não depende de ter o Office instalado e funciona em qualquer sistema.
 */

const { zipSync, strToU8 } = require('fflate');

const PT = 12700;   // EMU por ponto
const TWIP = 20;    // twips por ponto

/** Escapa texto para XML e tira caracteres que o XML não aceita. */
function x(texto) {
  return String(texto == null ? '' : texto)
    .toWellFormed() // surrogates soltos quebrariam o XML
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function agoraW3C() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function core(titulo) {
  const agora = agoraW3C();
  return `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
    + `<dc:title>${x(titulo)}</dc:title><dc:creator>MeuPDF</dc:creator><cp:lastModifiedBy>MeuPDF</cp:lastModifiedBy>`
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${agora}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${agora}</dcterms:modified>`
    + '</cp:coreProperties>';
}

const APP = `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>MeuPDF</Application></Properties>`;

function rels(lista) {
  return `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + lista.map((r) => `<Relationship Id="${r.id}" Type="${r.tipo}" Target="${x(r.alvo)}"/>`).join('')
    + '</Relationships>';
}

const R = {
  doc: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  core: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  app: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties',
  estilos: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
  config: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings',
  imagem: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  planilha: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
  slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
  mestre: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
  layout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
  tema: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
  presProps: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps',
  viewProps: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps',
  tableStyles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles',
};

function tipos(padroes, especificos) {
  return `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Default Extension="jpeg" ContentType="image/jpeg"/>'
    + '<Default Extension="png" ContentType="image/png"/>'
    + padroes.join('')
    + especificos.map(([parte, tipo]) => `<Override PartName="${parte}" ContentType="${tipo}"/>`).join('')
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
    + '</Types>';
}

function empacotar(arquivos) {
  const entradas = {};
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    entradas[nome] = typeof conteudo === 'string' ? strToU8(conteudo) : conteudo;
  }
  return Buffer.from(zipSync(entradas, { level: 6 }));
}

/* ============================================================
   WORD (.docx)
   ============================================================ */

const NS_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

const ESTILOS_WORD = `${XML}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
  + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="pt-BR" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>'
  + '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
  + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
  + '</w:styles>';

const CONFIG_WORD = `${XML}<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="708"/><w:hyphenationZone w:val="425"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

function imagemWord(rid, id, larguraPt, alturaPt) {
  const cx = Math.round(larguraPt * PT);
  const cy = Math.round(alturaPt * PT);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>`
    + `<wp:docPr id="${id}" name="Página ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>`
    + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
    + `<pic:nvPicPr><pic:cNvPr id="${id}" name="pagina${id}.jpeg"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
}

/**
 * Word com cada página do PDF como imagem ("Página como imagem").
 * O Word editável é montado em word.js.
 * @param {object} doc
 * @param {string} doc.titulo
 * @param {{largura:number, altura:number, imagem:{bytes:Buffer}}[]} doc.paginas
 */
function docx({ titulo, paginas }) {
  const midia = {};
  const relsDoc = [
    { id: 'rIdEstilos', tipo: R.estilos, alvo: 'styles.xml' },
    { id: 'rIdConfig', tipo: R.config, alvo: 'settings.xml' },
  ];
  const corpo = [];
  const primeira = paginas[0] || { largura: 595.28, altura: 841.89 };
  paginas.forEach((p, i) => {
    const rid = `rIdImg${i + 1}`;
    midia[`word/media/pagina${i + 1}.jpeg`] = p.imagem.bytes;
    relsDoc.push({ id: rid, tipo: R.imagem, alvo: `media/pagina${i + 1}.jpeg` });
    // cabe na página do Word (que tem o tamanho da 1ª página do PDF)
    const escala = Math.min(primeira.largura / p.largura, (primeira.altura - 2) / p.altura, 1);
    const pPr = `<w:pPr>${i ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>`;
    corpo.push(`<w:p>${pPr}${imagemWord(rid, i + 1, p.largura * escala, p.altura * escala)}</w:p>`);
  });
  const sect = `<w:sectPr><w:pgSz w:w="${Math.round(primeira.largura * TWIP)}" w:h="${Math.round(primeira.altura * TWIP)}"${primeira.largura > primeira.altura ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;

  const documento = `${XML}<w:document ${NS_W}><w:body>${corpo.join('')}${sect}</w:body></w:document>`;
  return empacotar({
    '[Content_Types].xml': tipos([], [
      ['/word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'],
      ['/word/styles.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml'],
      ['/word/settings.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml'],
    ]),
    '_rels/.rels': rels([
      { id: 'rId1', tipo: R.doc, alvo: 'word/document.xml' },
      { id: 'rId2', tipo: R.core, alvo: 'docProps/core.xml' },
      { id: 'rId3', tipo: R.app, alvo: 'docProps/app.xml' },
    ]),
    'docProps/core.xml': core(titulo),
    'docProps/app.xml': APP,
    'word/document.xml': documento,
    'word/styles.xml': ESTILOS_WORD,
    'word/settings.xml': CONFIG_WORD,
    'word/_rels/document.xml.rels': rels(relsDoc),
    ...midia,
  });
}

/* ============================================================
   EXCEL (.xlsx)
   ============================================================ */

// estilos de célula (índices em cellXfs)
const ESTILO = { padrao: 0, decimal: 1, inteiro: 2, moeda: 3, porcentagem: 4, data: 5, negrito: 6, texto: 7 };

const ESTILOS_EXCEL = `${XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
  + '<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="&quot;R$&quot;\\ #,##0.00"/></numFmts>'
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
  + '<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  // 0-7 sem borda; 8-15 os mesmos com borda fina (células de tabela do PDF)
  + `<cellXfs count="16">${[0, 1].flatMap((borda) => [
    'numFmtId="0" fontId="0"',
    'numFmtId="4" fontId="0" applyNumberFormat="1"',
    'numFmtId="3" fontId="0" applyNumberFormat="1"',
    'numFmtId="165" fontId="0" applyNumberFormat="1"',
    'numFmtId="10" fontId="0" applyNumberFormat="1"',
    'numFmtId="164" fontId="0" applyNumberFormat="1"',
    'numFmtId="0" fontId="1" applyFont="1"',
    'numFmtId="49" fontId="0" applyNumberFormat="1"',
  ].map((base) => `<xf ${base} fillId="0" borderId="${borda}" xfId="0"${borda ? ' applyBorder="1"' : ''}/>`)).join('')}`
  + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

function colunaLetra(n) {
  let s = '';
  let k = n + 1;
  while (k > 0) { const r = (k - 1) % 26; s = String.fromCharCode(65 + r) + s; k = Math.floor((k - 1) / 26); }
  return s;
}

function nomeAba(nome, usados) {
  let base = String(nome || 'Planilha').replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Planilha';
  let final = base;
  for (let n = 2; usados.has(final.toLowerCase()); n += 1) final = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
  usados.add(final.toLowerCase());
  return final;
}

/**
 * @param {{nome:string, linhas:{valor:any, tipo:'texto'|'numero'|'data', formato?:string, negrito?:boolean, borda?:boolean}[][], mesclas?:string[]}[]} abas
 *   mesclas: células mescladas, como "A1:C1"
 */
function xlsx({ titulo, abas }) {
  const usados = new Set();
  const arquivos = {};
  const relsWb = [];
  const folhas = [];

  abas.forEach((aba, i) => {
    const nome = nomeAba(aba.nome, usados);
    const larguras = [];
    const linhasXml = aba.linhas.map((linha, r) => {
      const celulas = linha.map((c, k) => {
        const ref = `${colunaLetra(k)}${r + 1}`;
        // célula de tabela com borda: os estilos 8-15 são os mesmos com borda fina
        const b = c && c.borda ? 8 : 0;
        if (!c || c.valor === '' || c.valor == null) return b ? `<c r="${ref}" s="${b}"/>` : '';
        const tam = String(c.texto != null ? c.texto : c.valor).length;
        larguras[k] = Math.max(larguras[k] || 0, Math.min(tam, 80));
        if (c.tipo === 'numero' || c.tipo === 'data') {
          const s = (c.tipo === 'data' ? ESTILO.data : ESTILO[c.formato] || ESTILO.padrao) + b;
          return `<c r="${ref}"${s ? ` s="${s}"` : ''}><v>${c.valor}</v></c>`;
        }
        const s = (c.negrito ? ESTILO.negrito : ESTILO.texto) + b;
        return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${x(c.valor)}</t></is></c>`;
      }).join('');
      return `<row r="${r + 1}">${celulas}</row>`;
    }).join('');
    const cols = larguras.length
      ? `<cols>${larguras.map((w, k) => `<col min="${k + 1}" max="${k + 1}" width="${Math.max(8, Math.min((w || 6) * 1.1 + 2, 70)).toFixed(1)}" customWidth="1"/>`).join('')}</cols>`
      : '';
    arquivos[`xl/worksheets/sheet${i + 1}.xml`] = `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
      + `<sheetViews><sheetView workbookViewId="0"${i === 0 ? ' tabSelected="1"' : ''}/></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${linhasXml}</sheetData>`
      + (aba.mesclas && aba.mesclas.length ? `<mergeCells count="${aba.mesclas.length}">${aba.mesclas.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '')
      + '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
    relsWb.push({ id: `rId${i + 1}`, tipo: R.planilha, alvo: `worksheets/sheet${i + 1}.xml` });
    folhas.push(`<sheet name="${x(nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`);
  });
  relsWb.push({ id: `rId${abas.length + 1}`, tipo: R.estilos, alvo: 'styles.xml' });

  return empacotar({
    '[Content_Types].xml': tipos([], [
      ['/xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'],
      ['/xl/styles.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml'],
      ...abas.map((_, i) => [`/xl/worksheets/sheet${i + 1}.xml`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml']),
    ]),
    '_rels/.rels': rels([
      { id: 'rId1', tipo: R.doc, alvo: 'xl/workbook.xml' },
      { id: 'rId2', tipo: R.core, alvo: 'docProps/core.xml' },
      { id: 'rId3', tipo: R.app, alvo: 'docProps/app.xml' },
    ]),
    'docProps/core.xml': core(titulo),
    'docProps/app.xml': APP,
    'xl/workbook.xml': `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${folhas.join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': rels(relsWb),
    'xl/styles.xml': ESTILOS_EXCEL,
    ...arquivos,
  });
}

/* ============================================================
   POWERPOINT (.pptx)
   ============================================================ */

const NS_P = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

const GRUPO = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

const TEMA = `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="MeuPDF"><a:themeElements>`
  + '<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>'
  + '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>'
  + '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>'
  + '<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
  + '<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>'
  + '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>'
  + '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
  + '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>'
  + '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';

const MESTRE = `${XML}<p:sldMaster ${NS_P}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GRUPO}</p:spTree></p:cSld>`
  + '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
  + '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
  + '<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>';

const LAYOUT = `${XML}<p:sldLayout ${NS_P} type="blank" preserve="1"><p:cSld name="Em branco"><p:spTree>${GRUPO}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

/**
 * @param {{titulo:string, paginas:{bytes:Buffer, largura:number, altura:number}[]}} p
 *   largura/altura em pontos (tamanho da página do PDF)
 */
function pptx({ titulo, paginas }) {
  const primeira = paginas[0];
  // o slide tem o tamanho da 1ª página (limites do PowerPoint: 1 a 56 polegadas)
  const limitar = (v) => Math.min(Math.max(v, 914400), 51206400);
  const cx = limitar(Math.round(primeira.largura * PT));
  const cy = limitar(Math.round(primeira.altura * PT));
  const arquivos = {};
  const relsPres = [{ id: 'rId1', tipo: R.mestre, alvo: 'slideMasters/slideMaster1.xml' }];
  const ids = [];

  paginas.forEach((p, i) => {
    const n = i + 1;
    const escala = Math.min(cx / (p.largura * PT), cy / (p.altura * PT));
    if (p.formas != null) {
      // slide editável: figuras e caixas de texto já montadas (powerpoint.js)
      const ox = Math.round((cx - p.largura * PT * escala) / 2);
      const oy = Math.round((cy - p.altura * PT * escala) / 2);
      const relsSlide = [{ id: 'rId1', tipo: R.layout, alvo: '../slideLayouts/slideLayout1.xml' }];
      (p.midias || []).forEach((m, k) => {
        const nome = `slide${n}-${k + 1}.${m.ext === 'jpeg' ? 'jpeg' : 'png'}`;
        arquivos[`ppt/media/${nome}`] = m.bytes;
        relsSlide.push({ id: m.rid, tipo: R.imagem, alvo: `../media/${nome}` });
      });
      const grupo = ox || oy || escala !== 1
        ? `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="1000" name="Página"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${ox}" y="${oy}"/><a:ext cx="${Math.round(p.largura * PT * escala)}" cy="${Math.round(p.altura * PT * escala)}"/><a:chOff x="0" y="0"/><a:chExt cx="${Math.round(p.largura * PT)}" cy="${Math.round(p.altura * PT)}"/></a:xfrm></p:grpSpPr>${p.formas}</p:grpSp>`
        : p.formas;
      arquivos[`ppt/slides/slide${n}.xml`] = `${XML}<p:sld ${NS_P}><p:cSld><p:spTree>${GRUPO}${grupo}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
      arquivos[`ppt/slides/_rels/slide${n}.xml.rels`] = rels(relsSlide);
      relsPres.push({ id: `rId${n + 1}`, tipo: R.slide, alvo: `slides/slide${n}.xml` });
      ids.push(`<p:sldId id="${255 + n}" r:id="rId${n + 1}"/>`);
      return;
    }
    arquivos[`ppt/media/pagina${n}.jpeg`] = p.bytes;
    const w = Math.round(p.largura * PT * escala);
    const h = Math.round(p.altura * PT * escala);
    const ox = Math.round((cx - w) / 2);
    const oy = Math.round((cy - h) / 2);
    arquivos[`ppt/slides/slide${n}.xml`] = `${XML}<p:sld ${NS_P}><p:cSld><p:spTree>${GRUPO}`
      + `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Página ${n}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>`
      + '<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
      + `<p:spPr><a:xfrm><a:off x="${ox}" y="${oy}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
      + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
    arquivos[`ppt/slides/_rels/slide${n}.xml.rels`] = rels([
      { id: 'rId1', tipo: R.layout, alvo: '../slideLayouts/slideLayout1.xml' },
      { id: 'rId2', tipo: R.imagem, alvo: `../media/pagina${n}.jpeg` },
    ]);
    relsPres.push({ id: `rId${n + 1}`, tipo: R.slide, alvo: `slides/slide${n}.xml` });
    ids.push(`<p:sldId id="${255 + n}" r:id="rId${n + 1}"/>`);
  });

  const extra = paginas.length + 2;
  relsPres.push(
    { id: `rId${extra}`, tipo: R.presProps, alvo: 'presProps.xml' },
    { id: `rId${extra + 1}`, tipo: R.viewProps, alvo: 'viewProps.xml' },
    { id: `rId${extra + 2}`, tipo: R.tema, alvo: 'theme/theme1.xml' },
    { id: `rId${extra + 3}`, tipo: R.tableStyles, alvo: 'tableStyles.xml' },
  );

  return empacotar({
    '[Content_Types].xml': tipos([], [
      ['/ppt/presentation.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'],
      ['/ppt/slideMasters/slideMaster1.xml', 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml'],
      ['/ppt/slideLayouts/slideLayout1.xml', 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml'],
      ['/ppt/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml'],
      ['/ppt/presProps.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml'],
      ['/ppt/viewProps.xml', 'application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml'],
      ['/ppt/tableStyles.xml', 'application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml'],
      ...paginas.map((_, i) => [`/ppt/slides/slide${i + 1}.xml`, 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml']),
    ]),
    '_rels/.rels': rels([
      { id: 'rId1', tipo: R.doc, alvo: 'ppt/presentation.xml' },
      { id: 'rId2', tipo: R.core, alvo: 'docProps/core.xml' },
      { id: 'rId3', tipo: R.app, alvo: 'docProps/app.xml' },
    ]),
    'docProps/core.xml': core(titulo),
    'docProps/app.xml': APP,
    'ppt/presentation.xml': `${XML}<p:presentation ${NS_P} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>`
      + `<p:sldIdLst>${ids.join('')}</p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': rels(relsPres),
    'ppt/slideMasters/slideMaster1.xml': MESTRE,
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': rels([
      { id: 'rId1', tipo: R.layout, alvo: '../slideLayouts/slideLayout1.xml' },
      { id: 'rId2', tipo: R.tema, alvo: '../theme/theme1.xml' },
    ]),
    'ppt/slideLayouts/slideLayout1.xml': LAYOUT,
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': rels([{ id: 'rId1', tipo: R.mestre, alvo: '../slideMasters/slideMaster1.xml' }]),
    'ppt/theme/theme1.xml': TEMA,
    'ppt/presProps.xml': `${XML}<p:presentationPr ${NS_P}/>`,
    'ppt/viewProps.xml': `${XML}<p:viewPr ${NS_P}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="72008" cy="72008"/></p:viewPr>`,
    'ppt/tableStyles.xml': `${XML}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`,
    ...arquivos,
  });
}

module.exports = {
  docx, xlsx, pptx, escapar: x, colunaLetra,
  // peças comuns, usadas também pelo Word editável (word.js)
  partes: { XML, core, APP, rels, R, tipos, empacotar, PT, TWIP },
};
