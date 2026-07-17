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
