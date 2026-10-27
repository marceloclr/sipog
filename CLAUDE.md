# SIPOG COFIP — Estrutura multiarquivo (refatoração estrutural de 2026-07-16)

Sistema de projeção orçamentária (PLOA 2027 / MAPP) da SEPLAG-CE. Vanilla HTML/CSS/JS,
**sem build step**, **offline-capable**, aberto por duplo clique (protocolo `file://`).

## Estrutura

- `index.html` — estrutura HTML, CDNs (ExcelJS, Chart.js, jsPDF, autotable) e o **módulo
  Firebase inline** (única exceção: `<script type="module" src>` local não carrega via
  `file://` por bloqueio de CORS — manter embutido).
- `css/styles.css` — todo o CSS (temas claro/escuro, variáveis, componentes).
- `js/01…15-*.js` — scripts **clássicos** com escopo global compartilhado. O prefixo
  numérico é a ordem de carga declarada no `index.html`.

## Regras invioláveis desta arquitetura

1. **NÃO converter para ES modules** (`import`/`export`), IIFEs ou `'use strict'`:
   o HTML possui 156 `onclick` + 12 `oninput` + 13 `onchange` inline que exigem funções
   no escopo global, e módulos locais não carregam via `file://`.
2. **A ordem das tags `<script src>` é semântica** — os arquivos são fatias contíguas do
   fluxo top-down original. Não reordenar; código executado no carregamento reside no
   `js/14` e depende de funções dos arquivos 02, 06, 07 e 08.
3. **Nunca renomear identificadores** — para mudança de rótulo, usar mapas de label
   (`CLASSE_LABEL_MAP` / `labelClasse()`).
4. Entregas sempre com **arquivo completo**; validar com `node --check js/*.js` e
   conferir balanceamento de tags no `index.html`.
5. Encoding: **UTF-8 sem BOM** (literais acentuados são semânticos na classificação
   por estágio).

## Mapa de responsabilidades (origem: sipog_cofip_dieta_3.html)

| Arquivo | Linhas de origem | Conteúdo |
|---|---|---|
| index.html | 1–13, 396–1154, 6863 | Head, CDNs, body, módulo Firebase, ordem de carga |
| css/styles.css | 15–394 | CSS integral |
| js/01-modelo-importacao.js | 1156–1279 | Modelo XLSX de importação |
| js/02-ui-navegacao.js | 1280–1547 | Estado global, dropdowns, ordenação, views, trilha, tema |
| js/03-utils-formatacao.js | 1548–1605 | N/S/V/F/Ftd, mapas de classe |
| js/04-importacao-parametros.js | 1606–1903 | Importação, parâmetros, JSON |
| js/05-nuvem-firestore.js | 1904–2323 | Nuvem (chunks/cenários) + JSON local/limparBase |
| js/06-classificacao-gate.js | 2324–2455 | Classificação, gate, estágios |
| js/07-redutor-paradigma.js | 2456–3128 | Redutor, PLOA (tabelas), sliders |
| js/08-processamento.js | 3129–3605 | Ajustes realizados, premissas, processarDados |
| js/09-ploa.js | 3606–4042 | Geração PLOA 2027 + PLOA Detalhado |
| js/10-filtros.js | 4043–4329 | Filtros multi-dropdown |
| js/11-monitoramento-tetos.js | 4330–5080 | Tetos, subtetos, monitoramento, indicadores |
| js/12-gestao-registros.js | 5081–5516 | Grids, gestão, lixeira, consolidados |
| js/13-exportacao-xlsx.js | 5517–5957 | Exportações ExcelJS |
| js/14-graficos-dashboard.js | 5958–6370 | Cenário estresse, gráficos, gauge, hover, **inicialização** |
| js/15-relatorio-pdf.js | 6371–6861 | Relatório PDF por Fonte |

## Nuvem: pacotes em chunks (js/05)

- `gravarPacoteFragmentado` regrava doc fixo (`estado_atual/sessao`) e, desde 27/10/2026, **apaga os chunks que
  sobram** (índice ≥ total novo); `lerPacoteFragmentado` lê só até `meta.totalChunks`. Antes, regravar um pacote
  menor deixava chunks velhos que corrompiam o JSON (aconteceu com o estado atual: 21 válidos + 64 sobras).

## Estágio de Execução: texto e regras (revisão de 2026-10-26)

- **Sempre** comparar estágio com `normalizarEstagio()` (js/06), nunca só com `N()`: ela corrige
  acentuação corrompida (`corrigirMojibake`, js/03), junta espaços e uniformiza
  "FINAN." / "FINAN, " → "FINAN,". `N()` continua sendo a de órgão/fonte — não mexer nela.
- Textos da base passam por `corrigirAcentosBase()` (js/04) na importação e na carga de
  estado/cenário (js/05); chaves de tetos e filtros salvos recebem a mesma correção.
- Estágio sem regra própria (Não Definido, Não Informado, vazio, desconhecido) cai no padrão de
  segurança (100% do Programado) e aparece em `#aviso-qualidade-base` (só Demais Projetos).
- Regras parametrizadas: `regras['r-expurgar-fisfin']` (padrão **true**: Físic/Finan Concluída é
  expurgada) e `cenario['r-exec-meses']` (padrão 5, `(EMP/meses)×12`). A Necessidade Calculada
  usa o padrão de `DEFAULTS_PARAMETROS`; a Ajustada, o valor da tela.
- Arquivos js/01–15 estão com CRLF na cópia de trabalho e LF no repositório: depois de editar,
  converter para LF antes do commit (senão o diff vira o arquivo inteiro).

## Crítica do upload e referências por exercício: `js/referencias.js` (27/10/2026)

- Carregado pelo SIPOG (`index.html`, **depois** do js/15, fora da sequência 01–15) e pelo estudo LOA. Sem efeito ao carregar.
- Nada é cadastro digitado: órgãos (com secretarias), fontes e programas saem do próprio arquivo (`extrairCadastroMAPP`,
  `extrairCadastroLOA`) e ficam numa memória por exercício (`localStorage` `sipog_referencias_v1` + nuvem
  `referencias/exercicio_<ano>`, em chunks do js/05) só para dizer "novo desde a última carga" (na 1ª carga do ano nada é novo;
  sem memória do ano, compara com o ano anterior). O que fica de fato salvo é decisão do usuário: **aliases** (texto variante →
  texto da base, por ORGAO/SECRETARIA/FONTE) e, no estudo, as **ligações** LOA × MAPP do exercício.
- `criticarBaseMAPPs`: só **erro estrutural bloqueia** (coluna obrigatória ausente, valor que não é número); o resto é aviso
  (órgão/fonte/programa novo, secretaria diferente, estágio desconhecido, MAPP repetido no mesmo órgão + fonte, negativo,
  Empenhado > Limite, Pago > Empenhado, Limite > Programado, mais de um grupo "S", fora do Executivo). Não muda valores.
  Sugestão de alias por chave tolerante (`chaveTolerante`: "(312,82)" = "(312.82)") ou mesmo código numérico da fonte.
- SIPOG: `importar()` (js/04) critica antes de trocar `dadosBrutos` — com erro, a base anterior continua; estado/JSON carregado
  (js/05) só mostra a crítica (`semAliases`, sem registrar). Painel em `#critica-base`.
- Estudo: `carregarMAPPs(..., bloquearComErro)` (só o upload bloqueia); `criticarCargaLOA` no PLOA; `atualizarCriticaEstudo`
  (fim de `recalcularEstudo`) junta tudo em `#critica-estudo`, inclusive `criticarLOAxMAPP` (órgão do MAPP sem sigla na LOA e
  vice-versa; achou "CIPP S,A" da base × "CIPP S.A" da LOA). Ligações **editáveis**: `ligacoesAtuais`/`aplicarLigacoes`;
  "☁ Salvar como padrão do exercício" (aba 3) grava siglas, FONTES_LOA, SUBFONTE_LOA_POR_ORGAO, fora/dentro e de-para;
  `carregarPadraoExercicio` aplica ao abrir. O de-para do padrão (`deParaPadrao`, regra "padrão") fica abaixo do manual.
  O estudo salvo guarda `ligacoes` e reabre igual. `js/estudo-loa-tabelas.js` continua como semente (JSON não abre em `file://`).
- Conferido em 27/10: base real 7.300 MAPPs no SIPOG e no estudo com os mesmos totais; padrão salvo e reaplicado ao recarregar
  com totais iguais. A gravação na coleção `referencias` não foi testada na nuvem real (só leitura).

## Página de estudo separada: `estudo-loa.html` + `js/estudo-loa.js`

Cruza a LOA 2027 com a base de MAPPs (layout do `importar()`). **LOA recomendada: PLOA 2027 por ação**
(`dados/loa2027_acoes.json`, 8.667 créditos), gerado por `ferramentas/extrair_ploa.py` a partir dos PDFs do
Volume II (Tomos I e II; os PDFs ficam em `LOA2027/`, fora do git). O extrator confere Σ créditos = resumo
de cada programa e de cada órgão e Σ por GND = Volume I p. 213 (GND 44 = R$ 5.750.897.507, sem a modalidade
91 e COM as Investimentos Estatais); a única diferença é do próprio PDF (SAP, GND 33, R$ 2.162.885 a mais no
resumo do que nas linhas impressas), registrada em `conferencia.difResumos`. Na página: `carregarLOAPloa`/
`carregarPLOADoRepositorio` guardam `loaCreditos`; `aplicarRecorteLOA` (início de `recalcularEstudo`) monta
`loaLinhas` por Órgão × Programa × Fonte com o recorte da aba 2 (GND, padrão só 44; esferas Fiscal/Seguridade
e Investimentos Estatais; sem modalidade 91 — `RECORTE_LOA_PADRAO`). Siglas e sub fontes vêm de
`js/estudo-loa-tabelas.js` (`SIGLAS_ORGAO_LOA`, `FONTES_LOA`, `SUBFONTE_LOA_POR_ORGAO` para o 754.49 =
Linha Leste na SEINFRA × IPF/BIRD nos demais). Programa dos MAPPs: coluna PROGRAMA da base ou arquivo
"Programas dos MAPPs" (extração bruta; liga por órgão + texto do MAPP com "."→","); com PLOA e programa, o par
é **Órgão × Programa × Fonte** (`cruzaPrograma`, `chavePar`, coluna/filtro Programa com classe `so-programa`).
Alternativas (cruzamento Órgão × Fonte): o **PDF**
"Demonstrativo Consolidado por Órgão e Fonte" emitido **só com Investimento** (`lerLOADePDF`,
pdf.js 3.11.174 do cdnjs baixado sob demanda; grupo Tesouro/Outras Fontes pela coluna do
valor; conferido por órgão e TOTAL GERAL — em 26/10: 205 pares, R$ 6.671.837.045); a planilha
"Fonte x Órgão" (coluna C) ainda é aceita, mas traz a LOA inteira (pessoal, custeio, dívida).
**Só o Executivo**: `carregarLOA` expurga os órgãos de `LOA_FORA_EXECUTIVO` pelos 2 primeiros
dígitos do código — 01 (AL + FPP), 02 (TCE), 04 (TJ + FERMOJU, FUNSEG, fundo dos oficiais) e
15 (MP/PGJ + fundo de reaparelhamento e FDID); a Defensoria (06) fica —
`loaLinhas` = Executivo, `loaLinhasArquivo` = tudo (vai para a nuvem e para a aba ARQ_ do xlsx,
com a coluna EXPURGO). O PDF de Investimento de 26/10 não tem nenhum desses órgãos.
Os MAPPs desses órgãos também são expurgados (`expurgarMAPPForaDoExecutivo`, pela sigla do ORGAO:
siglas fixas em `LOA_FORA_EXECUTIVO` + as dos órgãos expurgados da LOA carregada); nas bases de
14/07 e 18/09 não há nenhum.
Não toca no estado do SIPOG e sem nuvem (de-para manual em `localStorage`).
Carrega só `js/03`, `js/06` e `js/05` do SIPOG (definições sem efeito ao carregar; o js/05 dá a
gravação em chunks) — não incluir outros arquivos js/01–15. Nuvem: coleção própria
`estudos_loa` (separada de `cenarios`), Firebase com cache em memória. Nomes de estudos salvos
e do XLSX exportado terminam em `DDMMAAAA-HHMM` (`carimboDataHora()`), regra dos demais sistemas.

- `calcularPrevisaoEmpenhoEstudo()` é **cópia** da Previsão de Empenho por Estágio de
  `processarDados()` (js/08, cenário PADRAO). **Mudou a regra no js/08 → atualizar a cópia.**
  Conferência: processar a base real no SIPOG com parâmetros padrão e comparar MAPP a MAPP
  (`prevEmp`, `regra`, `nec`); em 2026-10-26 deu 7.300/7.300 iguais.
- Usa `normalizarEstagio()`/`corrigirMojibake()` do SIPOG e os mesmos padrões (expurgo de
  Físic/Finan ligado, 5 meses). Conferido após a revisão de regras: 7.300/7.300 iguais.
- `aplicarValorDeliberadoEstudo()` é **cópia** da conta de `aplicarValorParadigmaGrupoCore()`
  (js/07): Prev. Emp. × (1 − % do grupo) → TRF e Necessidade Ajustadas, na fonte escolhida ou
  em todas; sem travas/edições manuais. Conferido em 2026-10-26: 7.111/7.111 iguais.
- Layout: menu lateral com 5 abas (`mostrarAbaEstudo`): Carga, Parâmetros, De-para,
  Consolidado e MAPPs (um filtro para a página toda; clique na linha de fonte filtra e rola
  até os MAPPs) e Ajustes Finais.
- Ajustes Finais: Proposta de Programado 2027 = Nec. Ajustada × mín(1, LOA do par Órgão × Fonte
  ÷ soma da Nec. Ajustada do par) — proporcional e **nunca acima da Nec. Ajustada**. Duas grades:
  grade 1 = Nec. Ajustada > 0 (automática; edição acima da necessidade é aceita, mas a linha fica
  tarjada em vermelho claro, `propostaExcede`), grade 2 = demais MAPPs (proposta só manual, sem
  teto). Nec. Ajustada negativa não deveria existir (só com Limite/Empenhado 2026 > Programado
  2026; 0 casos nas bases de 14/07 e 18/09): vai para a grade 2 com aviso. Edições em
  `propostasManuais` (localStorage por arquivo e no estudo salvo na nuvem); "Distribuir" reparte,
  por par, LOA − editados entre os não editados, também com o teto da necessidade.
  Alerta por fonte apurado par a par: estouro (Proposta > LOA), sobra distribuível (cabe nos não
  editados até a necessidade) e "LOA sem destino" (par sem MAPP com necessidade ou LOA além da
  necessidade — só a grade 2 recebe, à mão).
- Filtros ligados (facetados): `atualizarFiltrosConsolidado` (aba 4: Fonte, Órgão, Situação, Estágio +
  buscas) e `atualizarFiltrosAjustes` (aba 5: Fonte, Órgão + busca) montam cada lista só com os
  valores das linhas que atendem aos OUTROS filtros (`valoresLigados`/`preencherSelectLigado`);
  são chamadas no início de `renderizarConsolidado`/`renderizarAjustesFinais`.
- Cabeçalhos: significado e cálculo de cada coluna no tooltip do `th` (`DESC_COLUNAS` para as grades
  ordenáveis, `thDesc()` para as fixas; `DESC_PROPOSTA` = composição da Proposta, também no
  quadro "O que compõe a Proposta 2027" da aba 5).
- Aba 6 "LOA não alocada" (LOA do Executivo não vinculada a MAPP): `montarNaoAlocada` (chamada no fim de
  `renderizarAjustesFinais`) gera `itensNaoAlocada` em 3 categorias de cor fixa (`CATEGORIAS_NA`, CSS `--na-*`,
  paleta categórica validada slots 1–3): fora do cruzamento (sub fonte sem de-para), par sem MAPP e sobra no par
  (LOA − Proposta > 0). Cards, 4 gráficos Chart.js 4.4.0 (rosca + barras horizontais empilhadas; desenhados só com a
  aba visível — `naoAlocadaSuja`), grades por fonte/órgão/par e por ação do PLOA (`acoesNaoAlocada`: crédito ×
  não alocado ÷ LOA do item), filtros ligados e abas LOA_NAO_ALOCADA(_ACOES) no XLSX. Conferido em 27/10: Σ = de-para
  fora do cruzamento + Σ alertas (sem destino + distribuível); Σ ações = Σ itens.
- Layout: `input[type=checkbox]` volta ao tamanho natural (o css do SIPOG dá width:100% a todo input); a faixa de
  filtros (`.estudo-filtros-pagina`) rola com a página (sem sticky) e usa selects/buscas compactos.
- **Pacote do estudo (xlsx único)** — `js/estudo-loa-pacote.js` (carregado antes de `js/estudo-loa.js`): abas LEIA-ME,
  PARAMETROS (PARAMETRO|VALOR, `PARAMETROS_PACOTE`), LOA (obrigatória; um crédito por linha, FONTE em ID.FT.DT/FT.DT/código
  completo), MAPPS (obrigatória; layout da Consulta Primária + PROGRAMA), DE_PARA_FONTES, ORGAOS (COD_ORGAO, SIGLA,
  FORA_EXECUTIVO S/N → `orgaosForaPacote`/`orgaosDentroPacote`), FONTES_LOA (substitui `FONTES_LOA`/
  `SUBFONTE_LOA_POR_ORGAO`) e PROPOSTAS. `lerPacoteEstudo` valida aba por aba (erro em aba obrigatória = nada é
  carregado); `baixarPacoteEstudo(true|false)` gera o modelo ou o pacote atual. Ida e volta conferida em 27/10 (mesmos
  totais). LOA sem GND/esfera passa pelo recorte (`creditoNoRecorte`). Na aba 1 os carregamentos separados ficam em
  "Avançado".
- **Exercício (troca de ano)**: `exercicioLOA` (campo "Exercício da LOA" da aba 2, `EXERCICIO_LOA` do pacote ou estudo
  salvo) define LOA = exercício e ano base = exercício − 1. A base é lida por papel (`colunasPapel`/`valorPapel`:
  VLR_PROGRAMADO/LIMITE/EMPENHADO do ano base e VLR_PROGRAMADO do ano da LOA, ou os nomes da extração bruta); os campos
  internos p26/l26/e26/p27 significam "ano base / ano da LOA". Textos: `trocarAnos` (em `dica`, `thDesc`, cabeçalhos,
  XLSX — exceto colunas `fixo` de dados —, regra, avisos), `trocarAnosRotulos` (cards) e `data-anos` no HTML
  (`aplicarAnosNaPagina`). Conferido em 27/10: 2027 lê exatamente o mesmo que antes; base simulada 2027/2028 com
  exercício 2028 dá os mesmos totais, com os rótulos trocados.
- **Roteiro do próximo ano** (também na aba LEIA-ME do pacote): 1) preparar o SIPOG para o novo exercício (fora deste
  estudo) e copiar a regra nova para `calcularPrevisaoEmpenhoEstudo`; 2) LOA: extração do SIOF na aba LOA do pacote, ou
  PDFs em `LOA<ano>/` + `python -I ferramentas/extrair_ploa.py LOA<ano> dados/loa<ano>_acoes.json --ano <ano> --xlsx
  loa<ano>.xlsx`; 3) baixar o pacote do ano anterior, trocar LOA, MAPPS e EXERCICIO_LOA; 4) revisar ORGAOS, FONTES_LOA e o
  de-para (a página lista órgãos sem sigla e fontes sem par); 5) carregar e conferir os totais.
- De-para por xlsx (aba 3): `baixarDeParaXLSX` (abas DE_PARA_FONTES + FONTES_DO_MAPP) e `selecionarArquivoDePara` →
  `lerDeParaDeWorkbook` + `aplicarDeParaImportado` (SUB FONTE completa ou FT.DT; "(sem fonte)" = sem fonte; fonte fora da base
  de MAPPs é rejeitada); grava em `deParaManual`.
- **Várias fontes da LOA → uma Fonte do MAPP** (sem rateio; a mesma fonte da LOA em duas Fontes do MAPP é conflito,
  vale a 1ª): aba 3 tem a grade "Por Fonte do MAPP" (`renderizarDeParaPorMapp`, composição aberta na grade, ✕ desligar,
  "+ ligar fonte da LOA", aviso de Fonte do MAPP com necessidade e sem LOA); abas 4/5/6 mostram a composição
  (`somarComposicao`/`textoComposicao`, coluna "Fontes da LOA", faixa "Composição da LOA"); XLSX tem FONTE_MAPP_X_LOA.
- **Reconhecimento de de-para** (`classificarDePara`, `reconhecerFonteLOA`, `reconhecerFonteMAPP`): código completo,
  FT.DT ou ID.FT.DT (o órgão desfaz FT.DT ambíguo, via `SUBFONTE_LOA_POR_ORGAO`); Fonte do MAPP por texto, código
  ("500-501", "759.070") ou descrição. Usado pelo "Carregar de-para", pelo pacote e pelo **importador de formato livre**
  (aba 3, CSV ;/,/tab em UTF-8 ou Windows-1252, ou xlsx; o usuário escolhe as colunas — salvas por cabeçalho em
  `CHAVE_MAPA_IMPORT_DEPARA` —, vê a pré-visualização com status e só então aplica; relatório em xlsx).
- Termos de demanda × alocação: "Nec. 2027 Ajustada (demanda)" é o que o MAPP precisa (não depende da LOA);
  "Proposta (LOA alocada)" é quanto da LOA vai para ele (≤ necessidade, salvo edição). "Atendimento %" = Proposta ÷
  Necessidade (`atendimentoPct`/`celulaAtendimento`). Razões acima de 100% aparecem só pelo excedente (`fmtRazao`:
  128% → "+28%"), em Necessidade ÷ LOA e Atendimento; o tooltip mostra o valor completo.
- Termos: na tela e no XLSX é "Fonte do MAPP" (não "Fonte do SIPOG"); o percentual Nec. Ajustada ÷ LOA chama-se
  "Necessidade ÷ LOA" (só pares com LOA; card mostra quantas vezes e quanto falta/sobra).
- Consolidado com programa: `gruposConsolidado` mostra uma linha por Órgão × Fonte (total) e, ao clicar
  (`alternarGrupoConsolidado`, `expandidosCons`), uma linha por programa; o clique no programa (ou no par, sem
  programa) abre os MAPPs numa subtabela logo abaixo (`alternarParConsolidado`, `expandidosConsPar`,
  `subtabelaMappsConsolidado`, até 200). Na aba 5 o clique no órgão abre os MAPPs dele com a Proposta editável
  (`alternarOrgaoAjustes`, `expandidosAj`, `linhaMappAjuste`). Nada disso usa filtro.
- Tooltips de cálculo: todo valor de grade (`tdNum`/`dica`) e todo card mostra a fórmula com os
  números (`FT` = F sem o "-" no zero; `explicarPrevEmp`, `explicarNecAj`, `explicarProposta`).
  Na aba 5 a grade "Órgãos" (`#bloco-ajustes-orgaos`) só aparece com mais de um órgão no filtro. O aviso de
  "LOA inteira" só aparece quando a LOA veio da planilha (`loaConferencia.origem`).
- De-para Sub fonte → Fonte do SIPOG: exata (`0`+det.; no 754, modalidade+det.), tesouro
  (500/501 do grupo Tesouro → `(500)-(501) Tesouro`), prefixo (fonte única com o mesmo código,
  ignorando emendas 3xx) e manual. Órgão casa pela sigla entre parênteses.
