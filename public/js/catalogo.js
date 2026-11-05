/* ============================================================
   Catálogo das ferramentas (lado da tela)
   ============================================================ */

export const CATEGORIAS = [
  { id: 'organizar', icone: 'organizar', titulo: 'Organizar', cor: '#e5484d' },
  { id: 'otimizar', icone: 'otimizar', titulo: 'Otimizar', cor: '#30a46c' },
  { id: 'para-pdf', icone: 'paraPdf', titulo: 'Converter para PDF', cor: '#d97706' },
  { id: 'de-pdf', icone: 'dePdf', titulo: 'Converter de PDF', cor: '#2b579a' },
  { id: 'editar', icone: 'editar', titulo: 'Editar', cor: '#6e56cf' },
  { id: 'seguranca', icone: 'escudo', titulo: 'Segurança', cor: '#3a5bc7' },
];

const PDF = ['pdf'];
const PDF_E_OUTROS = ['pdf', 'imagem', 'office'];
const EXT_PDF = '.pdf';
const EXT_IMAGEM = '.jpg,.jpeg,.jfif,.png,.webp,.gif,.tif,.tiff,.bmp,.avif';
const EXT_WORD = '.doc,.docx,.docm,.dot,.dotx,.rtf,.odt,.txt';
const EXT_EXCEL = '.xls,.xlsx,.xlsm,.xlsb,.ods,.csv';
const EXT_PPT = '.ppt,.pptx,.pptm,.pps,.ppsx,.odp';
const EXT_TUDO = [EXT_PDF, EXT_IMAGEM, EXT_WORD, EXT_EXCEL, EXT_PPT].join(',');

const TEM_OFFICE = (cap, prog) => cap.office && (cap.office[prog] || cap.libreoffice);

/** Posições de texto na página (grade 3x3). */
const POSICOES_TODAS = ['sup-esq', 'sup-centro', 'sup-dir', 'meio-esq', 'centro', 'meio-dir', 'inf-esq', 'inf-centro', 'inf-dir'];

export const FERRAMENTAS = [
  /* ---------------- organizar ---------------- */
  {
    id: 'juntar', titulo: 'Juntar PDF', icone: 'juntar', cor: '#e5484d', categoria: 'organizar',
    descricao: 'Combine vários PDFs, imagens e documentos num só, na ordem que quiser.',
    aceita: PDF_E_OUTROS, extensoes: EXT_TUDO, min: 2, area: 'arquivos', ordenavel: true,
    acao: 'Juntar PDF', palavras: 'unir mesclar combinar merge juntada anexar',
    opcoes: [
      { chave: 'nome', tipo: 'texto', rotulo: 'Nome do arquivo final', padrao: 'Documentos juntados', placeholder: 'Documentos juntados' },
      { chave: 'marcadores', tipo: 'alternar', rotulo: 'Marcadores por documento', ajuda: 'Cria um índice lateral com o nome de cada arquivo.', padrao: true },
      { chave: 'frenteVerso', tipo: 'alternar', rotulo: 'Pronto para frente e verso', ajuda: 'Põe uma página em branco quando preciso, para cada documento começar numa folha nova.', padrao: false },
    ],
  },
  {
    id: 'dividir', titulo: 'Dividir PDF', icone: 'dividir', cor: '#f76b15', categoria: 'organizar',
    descricao: 'Separe por intervalos, a cada N páginas, página por página ou por tamanho máximo.',
    aceita: PDF, extensoes: EXT_PDF, area: 'arquivos', acao: 'Dividir PDF', palavras: 'separar cortar split partes tamanho pje',
    opcoes: [
      {
        chave: 'modo', tipo: 'escolhas', rotulo: 'Como dividir', padrao: 'intervalos',
        opcoes: [
          { valor: 'intervalos', rotulo: 'Por intervalos', dica: 'Você diz quais páginas vão em cada arquivo.' },
          { valor: 'cada', rotulo: 'A cada N páginas', dica: 'Pedaços do mesmo tamanho.' },
          { valor: 'todas', rotulo: 'Uma página por arquivo', dica: 'Cada página vira um PDF.' },
          { valor: 'tamanho', rotulo: 'Por tamanho máximo', dica: 'Ideal para limites de envio, como o do PJe.' },
        ],
      },
      { chave: 'intervalos', tipo: 'intervalo', rotulo: 'Intervalos', placeholder: 'ex.: 1-3, 4-10, 11', ajuda: 'Cada intervalo separado por vírgula vira um arquivo.', padrao: '', quando: (o) => o.modo === 'intervalos' },
      { chave: 'juntarIntervalos', tipo: 'alternar', rotulo: 'Juntar todos num arquivo só', padrao: false, quando: (o) => o.modo === 'intervalos' },
      { chave: 'cada', tipo: 'numero', rotulo: 'Páginas por arquivo', padrao: 2, min: 1, max: 9999, quando: (o) => o.modo === 'cada' },
      { chave: 'mb', tipo: 'numero', rotulo: 'Tamanho máximo de cada parte', unidade: 'MB', padrao: 10, min: 0.5, max: 2000, passo: 0.5, quando: (o) => o.modo === 'tamanho' },
    ],
  },
  {
    id: 'remover', titulo: 'Remover páginas', icone: 'remover', cor: '#e93d82', categoria: 'organizar',
    descricao: 'Clique nas páginas que não servem e gere o PDF sem elas.',
    aceita: PDF, extensoes: EXT_PDF, area: 'paginas', modoPaginas: 'remover', acao: 'Remover páginas',
    palavras: 'apagar excluir tirar deletar paginas',
    opcoes: [],
  },
  {
    id: 'extrair', titulo: 'Extrair páginas', icone: 'extrair', cor: '#d6409f', categoria: 'organizar',
    descricao: 'Escolha as páginas que interessam e leve só elas para um PDF novo.',
    aceita: PDF, extensoes: EXT_PDF, area: 'paginas', modoPaginas: 'selecionar', acao: 'Extrair páginas',
    palavras: 'selecionar copiar paginas separar',
    opcoes: [
      { chave: 'separadas', tipo: 'alternar', rotulo: 'Cada página num arquivo', ajuda: 'Desligado, as páginas escolhidas saem juntas num PDF só.', padrao: false },
    ],
  },
  {
    id: 'organizar', titulo: 'Organizar PDF', icone: 'organizar', cor: '#e54d2e', categoria: 'organizar',
    descricao: 'Arraste para reordenar, gire, apague e insira páginas em branco. Dá para misturar arquivos.',
    aceita: PDF_E_OUTROS, extensoes: EXT_TUDO, area: 'paginas', modoPaginas: 'organizar', acao: 'Salvar PDF organizado',
    palavras: 'ordenar reordenar mover arrastar sequencia',
    opcoes: [
      { chave: 'nome', tipo: 'texto', rotulo: 'Nome do arquivo final', padrao: '', placeholder: 'Igual ao original' },
    ],
  },
  {
    id: 'girar', titulo: 'Girar PDF', icone: 'girar', cor: '#8e4ec6', categoria: 'organizar',
    descricao: 'Endireite páginas deitadas ou de cabeça para baixo — todas de uma vez ou uma a uma.',
    aceita: PDF, extensoes: EXT_PDF, area: 'paginas', modoPaginas: 'girar', acao: 'Salvar PDF girado',
    palavras: 'rotacionar virar rotacao deitada',
    opcoes: [],
  },

  /* ---------------- otimizar ---------------- */
  {
    id: 'comprimir', titulo: 'Comprimir PDF', icone: 'comprimir', cor: '#30a46c', categoria: 'otimizar',
    descricao: 'Diminua o tamanho mantendo o texto selecionável. Ideal para anexar e protocolar.',
    aceita: PDF, extensoes: EXT_PDF, area: 'arquivos', acao: 'Comprimir PDF', palavras: 'reduzir diminuir tamanho otimizar leve mb',
    opcoes: [
      {
        chave: 'nivel', tipo: 'escolhas', rotulo: 'Nível de compressão', padrao: 'recomendada',
        opcoes: [
          { valor: 'extrema', rotulo: 'Extrema', dica: 'Menor arquivo possível; imagens perdem qualidade.' },
          { valor: 'recomendada', rotulo: 'Recomendada', dica: 'Boa redução com ótima legibilidade.' },
          { valor: 'leve', rotulo: 'Leve', dica: 'Reduz menos, mantém imagens quase intactas.' },
        ],
      },
      { chave: 'tonsCinza', tipo: 'alternar', rotulo: 'Converter imagens para tons de cinza', ajuda: 'Bom para documentos digitalizados em cores sem necessidade.', padrao: false },
    ],
  },
  {
    id: 'ocr', titulo: 'OCR — PDF pesquisável', icone: 'ocr', cor: '#12a594', categoria: 'otimizar',
    descricao: 'Reconhece o texto de documentos digitalizados. Depois dá para buscar e copiar.',
    aceita: PDF_E_OUTROS, extensoes: [EXT_PDF, EXT_IMAGEM].join(','), area: 'arquivos', acao: 'Reconhecer texto',
    palavras: 'digitalizado escaneado reconhecimento texto pesquisavel scanner',
    requer: (cap) => (cap.ocr && cap.ocr.por ? null : 'Os dados do OCR não foram baixados. Rode "npm run ocr" com internet.'),
    opcoes: [
      {
        chave: 'idioma', tipo: 'segmentado', rotulo: 'Idioma do documento', padrao: 'por',
        opcoes: [{ valor: 'por', rotulo: 'Português' }, { valor: 'eng', rotulo: 'Inglês' }, { valor: 'por+eng', rotulo: 'Os dois' }],
      },
      { chave: 'pularComTexto', tipo: 'alternar', rotulo: 'Pular páginas que já têm texto', ajuda: 'Mais rápido em PDFs mistos.', padrao: true },
    ],
  },
  {
    id: 'reparar', titulo: 'Reparar PDF', icone: 'reparar', cor: '#29a383', categoria: 'otimizar',
    descricao: 'Tenta recuperar PDFs danificados que não abrem ou abrem com erro.',
    aceita: PDF, extensoes: EXT_PDF, area: 'arquivos', acao: 'Reparar PDF', aceitaComErro: true,
    palavras: 'corrompido danificado consertar recuperar erro',
    opcoes: [],
  },

  /* ---------------- converter para PDF ---------------- */
  {
    id: 'imagem-pdf', titulo: 'Imagem para PDF', icone: 'imagem', cor: '#d97706', categoria: 'para-pdf',
    descricao: 'JPG, PNG, TIFF e outras imagens viram PDF. Fotos de celular já saem na posição certa.',
    aceita: ['imagem'], extensoes: EXT_IMAGEM, area: 'arquivos', ordenavel: true, acao: 'Converter para PDF',
    palavras: 'jpg png foto fotografia tiff scanner celular converter',
    opcoes: [
      {
        chave: 'tamanho', tipo: 'selecao', rotulo: 'Tamanho da página', padrao: 'a4',
        opcoes: [
          { valor: 'a4', rotulo: 'A4' }, { valor: 'carta', rotulo: 'Carta' }, { valor: 'oficio', rotulo: 'Ofício' },
          { valor: 'a3', rotulo: 'A3' }, { valor: 'a5', rotulo: 'A5' }, { valor: 'imagem', rotulo: 'Do tamanho da imagem' },
        ],
      },
      {
        chave: 'orientacao', tipo: 'segmentado', rotulo: 'Orientação', padrao: 'auto', quando: (o) => o.tamanho !== 'imagem',
        opcoes: [{ valor: 'auto', rotulo: 'Automática' }, { valor: 'retrato', rotulo: 'Retrato' }, { valor: 'paisagem', rotulo: 'Paisagem' }],
      },
      {
        chave: 'margem', tipo: 'segmentado', rotulo: 'Margem', padrao: 'pequena', quando: (o) => o.tamanho !== 'imagem',
        opcoes: [{ valor: 'nenhuma', rotulo: 'Sem' }, { valor: 'pequena', rotulo: 'Pequena' }, { valor: 'grande', rotulo: 'Grande' }],
      },
      {
        chave: 'qualidade', tipo: 'segmentado', rotulo: 'Qualidade', padrao: 'otimizada',
        opcoes: [{ valor: 'original', rotulo: 'Original' }, { valor: 'otimizada', rotulo: 'Otimizada' }, { valor: 'compacta', rotulo: 'Compacta' }],
        ajuda: 'Otimizada reduz fotos enormes sem perder a leitura.',
      },
      { chave: 'juntar', tipo: 'alternar', rotulo: 'Juntar tudo num PDF só', padrao: true },
      { chave: 'nome', tipo: 'texto', rotulo: 'Nome do arquivo final', padrao: 'Imagens', quando: (o) => o.juntar },
    ],
  },
  {
    id: 'word-pdf', titulo: 'Word para PDF', icone: 'word', cor: '#2b579a', categoria: 'para-pdf',
    descricao: 'DOC e DOCX viram PDF com o mesmo layout do Word.',
    aceita: ['office'], extensoes: EXT_WORD, area: 'arquivos', acao: 'Converter para PDF', servidor: 'office-pdf',
    palavras: 'doc docx documento texto converter',
    requer: (cap) => (TEM_OFFICE(cap, 'word') ? null : 'Precisa do Microsoft Word ou do LibreOffice instalado.'),
    opcoes: [{ chave: 'juntar', tipo: 'alternar', rotulo: 'Juntar tudo num PDF só', padrao: false }],
  },
  {
    id: 'excel-pdf', titulo: 'Excel para PDF', icone: 'excel', cor: '#217346', categoria: 'para-pdf',
    descricao: 'Planilhas viram PDF respeitando as áreas de impressão.',
    aceita: ['office'], extensoes: EXT_EXCEL, area: 'arquivos', acao: 'Converter para PDF', servidor: 'office-pdf',
    palavras: 'xls xlsx planilha csv converter',
    requer: (cap) => (TEM_OFFICE(cap, 'excel') ? null : 'Precisa do Microsoft Excel ou do LibreOffice instalado.'),
    opcoes: [{ chave: 'juntar', tipo: 'alternar', rotulo: 'Juntar tudo num PDF só', padrao: false }],
  },
  {
    id: 'powerpoint-pdf', titulo: 'PowerPoint para PDF', icone: 'powerpoint', cor: '#c43e1c', categoria: 'para-pdf',
    descricao: 'Apresentações viram PDF, um slide por página.',
    aceita: ['office'], extensoes: EXT_PPT, area: 'arquivos', acao: 'Converter para PDF', servidor: 'office-pdf',
    palavras: 'ppt pptx slides apresentacao converter',
    requer: (cap) => (TEM_OFFICE(cap, 'powerpoint') ? null : 'Precisa do Microsoft PowerPoint ou do LibreOffice instalado.'),
    opcoes: [{ chave: 'juntar', tipo: 'alternar', rotulo: 'Juntar tudo num PDF só', padrao: false }],
  },
  {
    id: 'html-pdf', titulo: 'Site para PDF', icone: 'html', cor: '#0588f0', categoria: 'para-pdf',
    descricao: 'Salve uma página da internet (ou um HTML) como PDF, do jeito que aparece.',
    aceita: [], area: 'site', acao: 'Gerar PDF', semArquivos: true,
    palavras: 'html url pagina internet web link navegador',
    requer: (cap) => (cap.navegador ? null : 'Precisa do Microsoft Edge ou do Google Chrome instalado.'),
    opcoes: [
      {
        chave: 'fonte', tipo: 'segmentado', rotulo: 'De onde vem', padrao: 'endereco',
        opcoes: [{ valor: 'endereco', rotulo: 'Endereço (URL)' }, { valor: 'html', rotulo: 'Código HTML' }],
      },
      { chave: 'endereco', tipo: 'texto', rotulo: 'Endereço da página', placeholder: 'https://exemplo.com.br', padrao: '', quando: (o) => o.fonte !== 'html' },
      { chave: 'html', tipo: 'area', rotulo: 'Código HTML', placeholder: '<h1>Olá</h1>', padrao: '', quando: (o) => o.fonte === 'html' },
      {
        chave: 'papel', tipo: 'segmentado', rotulo: 'Papel', padrao: 'a4',
        opcoes: [{ valor: 'a4', rotulo: 'A4' }, { valor: 'carta', rotulo: 'Carta' }, { valor: 'oficio', rotulo: 'Ofício' }, { valor: 'unica', rotulo: 'Página única' }],
      },
      {
        chave: 'orientacao', tipo: 'segmentado', rotulo: 'Orientação', padrao: 'retrato', quando: (o) => o.papel !== 'unica',
        opcoes: [{ valor: 'retrato', rotulo: 'Retrato' }, { valor: 'paisagem', rotulo: 'Paisagem' }],
      },
      {
        chave: 'margem', tipo: 'segmentado', rotulo: 'Margem', padrao: 'normal',
        opcoes: [{ valor: 'nenhuma', rotulo: 'Sem' }, { valor: 'pequena', rotulo: 'Pequena' }, { valor: 'normal', rotulo: 'Normal' }],
      },
      { chave: 'fundo', tipo: 'alternar', rotulo: 'Imprimir cores e imagens de fundo', padrao: true },
    ],
  },

  /* ---------------- converter de PDF ---------------- */
  {
    id: 'pdf-jpg', titulo: 'PDF para JPG', icone: 'jpg', cor: '#d97706', categoria: 'de-pdf',
    descricao: 'Cada página vira uma imagem — ou extraia só as fotos que estão dentro do PDF.',
    aceita: PDF, extensoes: EXT_PDF, area: 'arquivos', acao: 'Converter para imagem',
    palavras: 'imagem png jpeg foto extrair imagens converter',
    opcoes: [
      {
        chave: 'modo', tipo: 'escolhas', rotulo: 'O que gerar', padrao: 'paginas',
        opcoes: [
          { valor: 'paginas', rotulo: 'Páginas inteiras', dica: 'Cada página vira uma imagem.' },
          { valor: 'imagens', rotulo: 'Extrair imagens', dica: 'Só as fotos e figuras que estão dentro do PDF.' },
        ],
      },
      {
        chave: 'formato', tipo: 'segmentado', rotulo: 'Formato', padrao: 'jpg', quando: (o) => o.modo === 'paginas',
        opcoes: [{ valor: 'jpg', rotulo: 'JPG' }, { valor: 'png', rotulo: 'PNG' }],
      },
      {
        chave: 'dpi', tipo: 'segmentado', rotulo: 'Resolução', padrao: '150', quando: (o) => o.modo === 'paginas',
        opcoes: [{ valor: '96', rotulo: 'Tela' }, { valor: '150', rotulo: 'Normal' }, { valor: '220', rotulo: 'Alta' }, { valor: '300', rotulo: 'Impressão' }],
      },
      { chave: 'paginas', tipo: 'intervalo', rotulo: 'Páginas', placeholder: 'Todas', padrao: '', quando: (o) => o.modo === 'paginas', ajuda: 'Deixe vazio para todas, ou algo como 1-3, 7.' },
    ],
  },
  {
    id: 'pdf-word', titulo: 'PDF para Word', icone: 'word', cor: '#2b579a', categoria: 'de-pdf',
    descricao: 'Gera um DOCX editável com o mesmo visual: texto, fotos, tabelas, cabeçalho e rodapé no lugar.',
    aceita: PDF, extensoes: EXT_PDF, area: 'arquivos', acao: 'Converter para Word',
    palavras: 'docx doc editar editavel converter documento',
    opcoes: [
      {
        chave: 'modo', tipo: 'escolhas', rotulo: 'Como converter', padrao: 'texto',
        opcoes: [
          { valor: 'texto', rotulo: 'Texto editável', dica: 'Fontes, cores, fotos, tabelas e listas no lugar. Dá para editar tudo.' },
          { valor: 'imagem', rotulo: 'Página como imagem', dica: 'Cada página vira uma foto. Não dá para editar o texto.' },
        ],
      },
      { chave: 'ocr', tipo: 'alternar', rotulo: 'Ler o texto de páginas digitalizadas (OCR)', padrao: true, quando: (o) => o.modo === 'texto', ajuda: 'Páginas que são foto do papel viram texto editável.' },
    ],
  },
  {
    id: 'pdf-excel', titulo: 'PDF para Excel', icone: 'excel', cor: '#217346', categoria: 'de-pdf',
    descricao: 'Tabelas do PDF (com ou sem linhas, como num extrato) viram planilha, com colunas, números e datas de verdade.',
    aceita: PDF, extensoes: EXT_PDF, area: 'arquivos', acao: 'Converter para Excel',
    palavras: 'xlsx planilha tabela extrato converter',
    opcoes: [
      {
        chave: 'abas', tipo: 'segmentado', rotulo: 'Organização', padrao: 'pagina',
        opcoes: [{ valor: 'pagina', rotulo: 'Uma aba por página' }, { valor: 'unica', rotulo: 'Tudo numa aba' }],
      },
      { chave: 'numeros', tipo: 'alternar', rotulo: 'Reconhecer números e datas', ajuda: 'Valores como 1.234,56 viram números que somam no Excel.', padrao: true },
      { chave: 'ocr', tipo: 'alternar', rotulo: 'Ler o texto de páginas digitalizadas (OCR)', padrao: true },
    ],
  },
  {
    id: 'pdf-powerpoint', titulo: 'PDF para PowerPoint', icone: 'powerpoint', cor: '#c43e1c', categoria: 'de-pdf',
    descricao: 'Cada página vira um slide igual, com o texto editável e as imagens soltas.',
    aceita: PDF, extensoes: EXT_PDF, area: 'arquivos', acao: 'Converter para PowerPoint',
    palavras: 'pptx slides apresentacao converter',
    opcoes: [
      {
        chave: 'modo', tipo: 'escolhas', rotulo: 'Como converter', padrao: 'editavel',
        opcoes: [
          { valor: 'editavel', rotulo: 'Editável', dica: 'Texto em caixas de texto e imagens que dá para mover.' },
          { valor: 'imagem', rotulo: 'Slide como imagem', dica: 'Cada página vira uma foto do slide.' },
        ],
      },
      { chave: 'ocr', tipo: 'alternar', rotulo: 'Ler o texto de páginas digitalizadas (OCR)', padrao: true, quando: (o) => o.modo !== 'imagem' },
    ],
  },
  {
    id: 'pdf-texto', titulo: 'PDF para texto', icone: 'textoArquivo', cor: '#60646c', categoria: 'de-pdf',
    descricao: 'Extrai todo o texto do documento num arquivo .txt.',
    aceita: PDF, extensoes: EXT_PDF, area: 'arquivos', acao: 'Extrair texto',
    palavras: 'txt extrair copiar texto',
    opcoes: [
      { chave: 'separarPaginas', tipo: 'alternar', rotulo: 'Marcar onde começa cada página', padrao: true },
    ],
  },
  {
    id: 'pdf-pdfa', titulo: 'PDF para PDF/A', icone: 'pdfa', cor: '#0797b9', categoria: 'de-pdf',
    descricao: 'Formato de arquivamento de longo prazo, exigido em alguns órgãos públicos.',
    aceita: PDF, extensoes: EXT_PDF, area: 'arquivos', acao: 'Converter para PDF/A',
    palavras: 'pdfa arquivamento iso conformidade',
    opcoes: [
      {
        chave: 'nivel', tipo: 'segmentado', rotulo: 'Conformidade', padrao: '2B',
        opcoes: [{ valor: '1B', rotulo: 'PDF/A-1b' }, { valor: '2B', rotulo: 'PDF/A-2b' }, { valor: '3B', rotulo: 'PDF/A-3b' }],
      },
    ],
  },

  /* ---------------- editar ---------------- */
  {
    id: 'editar', titulo: 'Editar PDF', icone: 'editar', cor: '#6e56cf', categoria: 'editar',
    descricao: 'Escreva texto, insira imagens, desenhe caixas e cubra trechos com branco.',
    aceita: PDF, extensoes: EXT_PDF, max: 1, area: 'editor', modoEditor: 'editar', acao: 'Salvar alterações',
    palavras: 'escrever texto adicionar imagem preencher anotar',
    opcoes: [],
  },
  {
    id: 'assinar', titulo: 'Assinar PDF', icone: 'assinar', cor: '#3e63dd', categoria: 'editar',
    descricao: 'Desenhe, digite ou use uma imagem da sua assinatura e coloque onde quiser.',
    aceita: PDF, extensoes: EXT_PDF, max: 1, area: 'editor', modoEditor: 'assinar', acao: 'Assinar',
    palavras: 'assinatura rubrica visto firmar',
    opcoes: [],
  },
  {
    id: 'numerar', titulo: 'Numerar páginas', icone: 'numerar', cor: '#8e4ec6', categoria: 'editar',
    descricao: 'Número em cada página, no formato e lugar que quiser — inclusive "Fls."',
    aceita: PDF, extensoes: EXT_PDF, area: 'arquivos', acao: 'Numerar páginas',
    palavras: 'numeracao paginar folhas fls contagem',
    opcoes: [
      { chave: 'posicao', tipo: 'posicao', rotulo: 'Posição', padrao: 'inf-centro', permitidas: ['sup-esq', 'sup-centro', 'sup-dir', 'inf-esq', 'inf-centro', 'inf-dir'] },
      {
        chave: 'formato', tipo: 'selecao', rotulo: 'Formato', padrao: '{n}',
        opcoes: [
          { valor: '{n}', rotulo: '1, 2, 3...' },
          { valor: '{n} / {total}', rotulo: '1 / 10' },
          { valor: 'Página {n}', rotulo: 'Página 1' },
          { valor: 'Página {n} de {total}', rotulo: 'Página 1 de 10' },
          { valor: 'Fls. {n}', rotulo: 'Fls. 1' },
          { valor: '- {n} -', rotulo: '- 1 -' },
          { valor: 'personalizado', rotulo: 'Personalizado...' },
        ],
      },
      { chave: 'modelo', tipo: 'texto', rotulo: 'Texto personalizado', padrao: 'Página {n} de {total}', ajuda: 'Use {n} para o número e {total} para o total.', quando: (o) => o.formato === 'personalizado' },
      { chave: 'inicio', tipo: 'numero', rotulo: 'Primeiro número', padrao: 1, min: 0, max: 99999 },
      { chave: 'paginas', tipo: 'intervalo', rotulo: 'Quais páginas numerar', placeholder: 'Todas', padrao: '', ajuda: 'Ex.: 2- para pular a capa.' },
      { chave: 'tamanho', tipo: 'faixa', rotulo: 'Tamanho da letra', padrao: 11, min: 6, max: 36, unidade: 'pt' },
      {
        chave: 'fonte', tipo: 'segmentado', rotulo: 'Fonte', padrao: 'sans',
        opcoes: [{ valor: 'sans', rotulo: 'Arial' }, { valor: 'serif', rotulo: 'Times' }, { valor: 'mono', rotulo: 'Courier' }],
      },
      { chave: 'negrito', tipo: 'alternar', rotulo: 'Negrito', padrao: false },
      { chave: 'cor', tipo: 'cor', rotulo: 'Cor', padrao: '#333333' },
      { chave: 'margem', tipo: 'faixa', rotulo: 'Distância da borda', padrao: 12, min: 3, max: 40, unidade: 'mm' },
    ],
  },
  {
    id: 'marca-dagua', titulo: "Marca d'água", icone: 'marcaDagua', cor: '#ab4aba', categoria: 'editar',
    descricao: 'Carimbe CÓPIA, CONFIDENCIAL, seu logo ou qualquer texto em todas as páginas.',
    aceita: PDF, extensoes: EXT_PDF, area: 'arquivos', acao: "Aplicar marca d'água",
    palavras: 'carimbo copia confidencial logotipo marca agua',
    opcoes: [
      { chave: 'tipo', tipo: 'segmentado', rotulo: 'Tipo', padrao: 'texto', opcoes: [{ valor: 'texto', rotulo: 'Texto' }, { valor: 'imagem', rotulo: 'Imagem' }] },
      { chave: 'texto', tipo: 'texto', rotulo: 'Texto', padrao: 'CONFIDENCIAL', quando: (o) => o.tipo === 'texto' },
      { chave: 'imagem', tipo: 'imagem', rotulo: 'Imagem (PNG ou JPG)', padrao: '', quando: (o) => o.tipo === 'imagem' },
      {
        chave: 'disposicao', tipo: 'segmentado', rotulo: 'Disposição', padrao: 'unica',
        opcoes: [{ valor: 'unica', rotulo: 'Uma por página' }, { valor: 'mosaico', rotulo: 'Mosaico' }],
      },
      { chave: 'posicao', tipo: 'posicao', rotulo: 'Posição', padrao: 'centro', permitidas: POSICOES_TODAS, quando: (o) => o.disposicao === 'unica' },
      {
        chave: 'rotacao', tipo: 'segmentado', rotulo: 'Inclinação', padrao: '45',
        opcoes: [{ valor: '0', rotulo: '0°' }, { valor: '45', rotulo: '45°' }, { valor: '-45', rotulo: '-45°' }, { valor: '90', rotulo: '90°' }],
      },
      { chave: 'tamanho', tipo: 'faixa', rotulo: 'Tamanho', padrao: 54, min: 10, max: 160, unidade: 'pt', quando: (o) => o.tipo === 'texto' },
      { chave: 'escala', tipo: 'faixa', rotulo: 'Tamanho da imagem', padrao: 40, min: 5, max: 100, unidade: '%', quando: (o) => o.tipo === 'imagem' },
      { chave: 'cor', tipo: 'cor', rotulo: 'Cor', padrao: '#d92d20', quando: (o) => o.tipo === 'texto' },
      { chave: 'negrito', tipo: 'alternar', rotulo: 'Negrito', padrao: true, quando: (o) => o.tipo === 'texto' },
      { chave: 'opacidade', tipo: 'faixa', rotulo: 'Transparência', padrao: 25, min: 5, max: 100, unidade: '%' },
      { chave: 'camada', tipo: 'segmentado', rotulo: 'Camada', padrao: 'sobre', opcoes: [{ valor: 'sobre', rotulo: 'Por cima do conteúdo' }, { valor: 'sob', rotulo: 'Por baixo' }] },
      { chave: 'paginas', tipo: 'intervalo', rotulo: 'Páginas', placeholder: 'Todas', padrao: '' },
    ],
  },
  {
    id: 'recortar', titulo: 'Recortar PDF', icone: 'recortar', cor: '#5b5bd6', categoria: 'editar',
    descricao: 'Desenhe a área que deve ficar e corte as margens de uma ou de todas as páginas.',
    aceita: PDF, extensoes: EXT_PDF, max: 1, area: 'editor', modoEditor: 'recortar', acao: 'Recortar',
    palavras: 'cortar margem aparar area',
    opcoes: [],
  },
  {
    id: 'metadados', titulo: 'Propriedades do PDF', icone: 'metadados', cor: '#7c66dc', categoria: 'editar',
    descricao: 'Veja e altere título, autor e palavras-chave — ou apague todos os metadados.',
    aceita: PDF, extensoes: EXT_PDF, max: 1, area: 'metadados', acao: 'Salvar propriedades',
    palavras: 'metadados titulo autor propriedades informacoes privacidade',
    opcoes: [],
  },
  {
    id: 'achatar', titulo: 'Achatar PDF', icone: 'achatar', cor: '#5151cd', categoria: 'editar',
    descricao: 'Fixa formulários preenchidos e anotações para que ninguém altere depois.',
    aceita: PDF, extensoes: EXT_PDF, area: 'arquivos', acao: 'Achatar PDF',
    palavras: 'formulario campos flatten fixar travar anotacoes',
    opcoes: [],
  },

  /* ---------------- segurança ---------------- */
  {
    id: 'proteger', titulo: 'Proteger PDF', icone: 'proteger', cor: '#3a5bc7', categoria: 'seguranca',
    descricao: 'Coloque senha (AES-256) e escolha o que pode ser feito com o arquivo.',
    aceita: PDF, extensoes: EXT_PDF, area: 'arquivos', acao: 'Proteger PDF',
    palavras: 'senha criptografar bloquear segredo seguranca',
    opcoes: [
      { chave: 'senha', tipo: 'senha', rotulo: 'Senha para abrir', padrao: '', confirmar: true },
      { chave: 'imprimir', tipo: 'alternar', rotulo: 'Permitir imprimir', padrao: true },
      { chave: 'copiar', tipo: 'alternar', rotulo: 'Permitir copiar o texto', padrao: false },
      { chave: 'editar', tipo: 'alternar', rotulo: 'Permitir alterar', padrao: false },
      { chave: 'aviso', tipo: 'aviso', nivel: 'aviso', texto: 'Guarde bem a senha: sem ela ninguém abre o arquivo, nem você.' },
    ],
  },
  {
    id: 'desbloquear', titulo: 'Desbloquear PDF', icone: 'desbloquear', cor: '#0588f0', categoria: 'seguranca',
    descricao: 'Tire a senha (sabendo qual é) ou as travas de impressão e cópia.',
    aceita: PDF, extensoes: EXT_PDF, area: 'arquivos', acao: 'Desbloquear PDF', aceitaSenha: true,
    palavras: 'senha remover tirar liberar desproteger restricao imprimir',
    opcoes: [],
  },
  {
    id: 'tarjar', titulo: 'Tarjar PDF', icone: 'tarjar', cor: '#3f3f46', categoria: 'seguranca',
    descricao: 'Cubra de preto CPFs, nomes e dados sensíveis — e eles somem de verdade (LGPD).',
    aceita: PDF, extensoes: EXT_PDF, max: 1, area: 'editor', modoEditor: 'tarjar', acao: 'Aplicar tarjas',
    palavras: 'ocultar censurar esconder lgpd cpf sigilo redigir redact anonimizar',
    opcoes: [],
  },
  {
    id: 'comparar', titulo: 'Comparar PDF', icone: 'comparar', cor: '#0797b9', categoria: 'seguranca',
    descricao: 'Veja lado a lado o que mudou entre duas versões de um documento.',
    aceita: PDF, extensoes: EXT_PDF, min: 2, max: 2, area: 'comparar', acao: 'Comparar',
    palavras: 'diferenca versao mudancas contrato revisar',
    opcoes: [],
  },
];

export const POR_ID = Object.fromEntries(FERRAMENTAS.map((f) => [f.id, f]));

/** Valores iniciais das opções de uma ferramenta. */
export function opcoesPadrao(f) {
  const o = {};
  for (const c of f.opcoes || []) if (c.padrao !== undefined) o[c.chave] = c.padrao;
  return o;
}

/** Normaliza para buscar sem acento. */
export function normalizar(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function buscar(texto, lista = FERRAMENTAS) {
  const q = normalizar(texto).trim();
  if (!q) return lista;
  const termos = q.split(/\s+/);
  return lista
    .map((f) => {
      const alvo = normalizar(`${f.titulo} ${f.descricao} ${f.palavras || ''}`);
      const titulo = normalizar(f.titulo);
      if (!termos.every((t) => alvo.includes(t))) return null;
      const pontos = titulo.startsWith(q) ? 3 : titulo.includes(q) ? 2 : 1;
      return { f, pontos };
    })
    .filter(Boolean)
    .sort((a, b) => b.pontos - a.pontos)
    .map((x) => x.f);
}

/** Motivo de a ferramenta não funcionar nesta máquina (ou null). */
export function indisponivel(f, capacidades) {
  if (!f.requer || !capacidades) return null;
  return f.requer(capacidades);
}

/** Ferramentas que fazem sentido para continuar com um resultado. */
export function sugestoesPara(tipoArquivo) {
  if (tipoArquivo === 'pdf') {
    return ['comprimir', 'juntar', 'assinar', 'numerar', 'proteger', 'ocr', 'dividir', 'marca-dagua', 'organizar'];
  }
  return [];
}
