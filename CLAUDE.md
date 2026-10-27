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

## Página de estudo separada: `estudo-loa.html` + `js/estudo-loa.js`

Cruza a LOA 2027 com a base de MAPPs (layout do `importar()`). LOA: de preferência o **PDF**
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
- Tooltips de cálculo: todo valor de grade (`tdNum`/`dica`) e todo card mostra a fórmula com os
  números (`FT` = F sem o "-" no zero; `explicarPrevEmp`, `explicarNecAj`, `explicarProposta`).
  Na aba 5 a grade "Órgãos" (`#bloco-ajustes-orgaos`) só aparece com mais de um órgão no filtro. O aviso de
  "LOA inteira" só aparece quando a LOA veio da planilha (`loaConferencia.origem`).
- De-para Sub fonte → Fonte do SIPOG: exata (`0`+det.; no 754, modalidade+det.), tesouro
  (500/501 do grupo Tesouro → `(500)-(501) Tesouro`), prefixo (fonte única com o mesmo código,
  ignorando emendas 3xx) e manual. Órgão casa pela sigla entre parênteses.
