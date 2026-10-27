# Plano — Estudo LOA × MAPPs: MAPPs abertos dentro da grade, de-para por xlsx, xlsx único de entrada e operação no próximo ano

## Contexto
Pedido de 27/10 (só planejamento):
1. Clicar no órgão deve **abrir os MAPPs logo abaixo, na mesma grade**, e um novo clique recolhe. Hoje o clique aplica um filtro e a grade de MAPPs muda, o que não atende.
2. O **de-para** precisa aceitar **upload de xlsx**.
3. Planejar a reorganização da carga num **xlsx único, com uma aba para cada dado** de que o sistema precisa, e avaliar a viabilidade.
4. Planejar **como o sistema vai operar no próximo ano**, com outra LOA (PLOA 2028 × execução 2027).

Decisões do usuário (27/10):
- Expansão nas **abas 4 e 5**.
- Proposta **editável** nos MAPPs abertos na aba 5.
- LOA de **duas origens**: extração do SIOF ou PDFs com o script.
- Os carregamentos separados de hoje **continuam, num bloco "avançado"**.

---

## Etapa 1 — Expansão dentro da grade (sem filtro)

Arquivos: `js/estudo-loa.js` e `estudo-loa.html` (CSS das linhas).

**Aba 4 — "Fontes por órgão"** (já agrupa por órgão × fonte, em `gruposConsolidado`):
- **Nível 1:** órgão × fonte. O clique abre ou fecha os programas (como hoje, em `alternarGrupoConsolidado`).
- **Nível 2:** programa. O clique abre ou fecha os **MAPPs do par**, numa subtabela compacta dentro de uma linha `<td colspan>`: MAPP, estágio, grupo, Programado 2026, Prev. Empenho, Nec. Ajustada e regra, com os mesmos tooltips de `COLUNAS_DETALHE`.
- Sem a dimensão programa, o nível 1 abre os MAPPs direto.
- Sai `abrirMAPPsDoPar` (filtro e rolagem) e sai o botão "ver MAPPs". A grade "MAPPs — regra aplicada" continua igual, controlada só pelos filtros do topo.
- O estado de abertura fica num `Set` por nível (`expandidosCons`, `expandidosConsProg`) e resiste aos redesenhos.

**Aba 5 — grade "Órgãos":**
- O clique no órgão abre ou fecha os MAPPs dele, agrupados por fonte (e por programa, se houver). Cada linha mostra LOA do par, Nec. Ajustada e Proposta, com o mesmo `input.input-proposta`, `editarProposta`, a tarja vermelha de `propostaExcede` e o botão ↺.
- O clique deixa de preencher `filtro-aj-orgao` e de rolar a página.
- Depois de editar, a grade se redesenha e o órgão continua aberto (`expandidosAj`). O foco volta ao campo editado pela `data-chave`.
- Para não pesar, cada órgão aberto mostra no máximo 200 MAPPs, com aviso.
- Reaproveita `tabelaMappsAjustes`, extraindo a montagem da linha para uma função `linhaMappAjuste(l)`.

## Etapa 2 — De-para por xlsx (aba 3)

- Botões **"⬇ Baixar de-para (xlsx)"** e **"⬆ Carregar de-para (xlsx)"**.
- **Layout:** o da aba DE_PARA_FONTES que a exportação já gera (GRUPO, SUB FONTE, DESCRIÇÃO, LOA, REGRA, FONTE DO MAPP), de modo que baixar → editar → subir funciona.
- **Leitura:**
  - usa SUB FONTE e FONTE DO MAPP (as outras colunas são ignoradas);
  - "(sem fonte)" ou célula vazia = sem fonte;
  - fonte inexistente na base de MAPPs = linha rejeitada, listada num aviso.
- **Gravação:** em `deParaManual` (o mesmo de hoje: localStorage e estudo salvo na nuvem), com resumo do que mudou ("N aplicadas, N iguais, N rejeitadas").
- Aceita tanto o código completo (500.9.1.0.00.00) quanto o FT.DT (500.00); o mapeamento já existe em `recalcularDeParaSugerido`.

## Etapa 3 — Xlsx único de entrada ("Pacote do estudo")

**Viabilidade: alta.**
- O ExcelJS já lê xlsx no navegador.
- Os volumes são pequenos: cerca de 8,7 mil créditos de LOA e de 7 a 31 mil MAPPs, o que dá um arquivo de poucos MB, lido em segundos.
- O sistema já guarda tudo isso em memória; muda só a origem.
- O risco é o pacote mal preenchido. A mitigação é validar aba por aba, com mensagens claras, e oferecer um modelo baixável.

**Abas do pacote** (os nomes são fixos; as colunas podem vir em qualquer ordem):

| Aba | Obrigatória | Conteúdo | Substitui |
|---|---|---|---|
| `LEIA-ME` | não | instruções, ano da LOA, data | — |
| `PARAMETROS` | não | exercício da LOA (ex.: 2027); percentuais por estágio; limiar; meses; expurgo Físic/Finan; Valor Deliberado; recorte (GND, esfera, mod. 91) | campos da aba 2 |
| `LOA` | sim | uma linha por crédito: ESFERA, COD_ORGAO, ORGAO, COD_UO, PROGRAMA, NOME_PROGRAMA, TIPO_ACAO, COD_ACAO, ACAO, REGIAO, GND, MODALIDADE, FONTE (FT.DT ou ID.FT.DT), IDUSO, VALOR | PDF / xlsx / json do PLOA |
| `MAPPS` | sim | layout da Consulta Primária + PROGRAMA + colunas de grupo | xlsx/csv de MAPPs + "Programas dos MAPPs" |
| `DE_PARA_FONTES` | não | SUB FONTE → FONTE DO MAPP | de-para manual (etapa 2) |
| `ORGAOS` | não | COD_ORGAO → SIGLA, FORA_EXECUTIVO (S/N) | `SIGLAS_ORGAO_LOA` e `LOA_FORA_EXECUTIVO` fixos no código |
| `FONTES_LOA` | não | FT.DT → sub fonte completa, grupo, descrição (e por órgão, quando ambígua) | `FONTES_LOA` e `SUBFONTE_LOA_POR_ORGAO` fixos |
| `PROPOSTAS` | não | MAPP, ORGAO, FONTE, PROPOSTA (edições já feitas) | localStorage |

**Na tela:**
- **Aba 1:**
  - "Carregar pacote do estudo (xlsx)" e "Baixar modelo";
  - um quadro de validação por aba (✅ lida, ⚠ avisos, ✖ erros);
  - os carregamentos separados de hoje num `<details>` "Avançado".
- **"Baixar pacote atual"**: gera o pacote a partir do que está carregado, para reaproveitar, versionar ou enviar a alguém. As abas opcionais trazem o conteúdo das tabelas fixas atuais, então o primeiro pacote já sai completo.

**Código:**
- Um novo arquivo, `js/estudo-loa-pacote.js`, carregado antes de `js/estudo-loa.js`, com:
  - `lerPacoteEstudo(wb)` → `{ loa, mapps, depara, orgaos, fontes, parametros, propostas, avisos }`;
  - `gerarPacoteEstudo()`.
- Os leitores atuais (`carregarLOAPloa`, `carregarMAPPs`, `aplicarProgramasNaBase`, `aplicarParametrosEstudoTela`) passam a ser chamados a partir do pacote.
- As tabelas fixas viram valores padrão que o pacote substitui (`SIGLAS_ORGAO_LOA`, `FONTES_LOA`, `LOA_FORA_EXECUTIVO`).

## Etapa 4 — Operação no próximo ano (LOA 2028 × execução 2027)

**Situação de hoje:** o estudo tem 152 referências a 2026/2027 no JS e 24 no HTML. A regra é cópia do SIPOG (`js/08`), que também está preso a 2026/2027 (VLR_PROGRAMADO_2026 etc.).

**Proposta — parametrizar pelo exercício:**
1. `PARAMETROS.EXERCICIO_LOA` (ex.: 2028) define `anoBase = LOA − 1`. Sem a aba, o sistema deduz os anos pelos cabeçalhos da base: se houver VLR_PROGRAMADO_2028, a LOA é de 2028.
2. **Camada de mapeamento por papel** na carga de MAPPs: Programado do ano base, Limite do ano base, Empenhado do ano base e Programado do ano da LOA. Lê `VLR_PROGRAMADO_<anoBase>`, `VLR_LIMITE_<anoBase>`, os aliases da extração (`VLR_PLANEJADO_<aa>` …) e `VLR_PROGRAMADO_<anoLOA>`.
   - Os campos internos (`p26`, `l26`, `e26`, `p27`) passam a representar "ano base / ano da LOA", e não anos fixos. Eles podem ser renomeados de uma vez para `pBase/lBase/eBase/pLOA`; recomendo renomear, por clareza.
3. **Rótulos com o ano:** todos os textos com 2026/2027 (cabeçalhos, tooltips, `DESC_COLUNAS`, cards, nomes das abas do XLSX) passam a usar `rotuloAno('Programado', anoBase)` etc.
4. **LOA:**
   - aba `LOA` do pacote, vinda de uma extração do SIOF ou do script;
   - `ferramentas/extrair_ploa.py` ganha `--ano` e nomes de arquivo por padrão (`PLOA-<ano>-Volume-II-Tomo-*.pdf`) e passa a gerar também a aba `LOA` em xlsx;
   - as conferências com o Volume I continuam; se o layout do PDF mudar, o script avisa e não grava.
5. **Regra da Previsão de Empenho:** continua sendo cópia do SIPOG. Quando o SIPOG for preparado para 2028 (percentuais, meses decorridos, estágios), o estudo recebe a mesma mudança; o `CLAUDE.md` já registra essa obrigação.
   - Os percentuais e os meses passam a vir do `PARAMETROS` do pacote, então não exigem mudança de código no ano novo.
   - Fica de fora deste plano: preparar o SIPOG (index.html e js/01–15) para o novo exercício. É outro trabalho, e recomendo fazê-lo antes.
6. **Roteiro anual** (vai para o `CLAUDE.md` e para a aba `LEIA-ME` do modelo):
   1. receber a LOA (extração do SIOF ou PDFs → script);
   2. baixar o pacote do ano anterior como modelo;
   3. trocar as abas `LOA` e `MAPPS` e o `EXERCICIO_LOA`;
   4. revisar `ORGAOS`, `FONTES_LOA` e o de-para (o sistema lista órgãos sem sigla e fontes sem par);
   5. carregar e conferir os totais na aba 1.

**Viabilidade da etapa 4: média.**
- O trabalho é amplo, mas mecânico: mapeamento e rótulos.
- O ponto sensível é manter a regra igual à do SIPOG. A conferência MAPP a MAPP contra o SIPOG (7.300/7.300) continua sendo o teste de aceite.

---

## Ordem e entregas
Um commit por etapa (Conventional Commits, push em `origin`) e relatório ao fim de cada uma:
1. Expansão nas abas 4 e 5.
2. De-para por xlsx.
3. Pacote xlsx único: leitura, modelo, "baixar pacote atual" e bloco avançado.
4. Parametrização do exercício (mapeamento por papel e rótulos), `--ano` no extrator e roteiro anual.

As etapas 3 e 4 se apoiam: a aba `PARAMETROS` traz o exercício.

## Arquivos
- `js/estudo-loa.js` e `estudo-loa.html`.
- Novo: `js/estudo-loa-pacote.js`.
- `js/estudo-loa-tabelas.js`: passa a guardar os padrões substituíveis.
- `ferramentas/extrair_ploa.py`, `CLAUDE.md`.

Reaproveitar:
- `lerMAPPsDeWorkbook`, `lerMAPPsDeCSV`, `carregarMAPPs`, `carregarLOAPloa`, `montarLinhasPLOA`;
- `aplicarProgramasNaBase`/`chaveProgramaMapp`, `recalcularDeParaSugerido`;
- `adicionarAbaEstudo` (geração de xlsx), `editarProposta`, `propostaExcede`, `tabelaMappsAjustes`, `COLUNAS_DETALHE`.

## Verificação (Edge headless via CDP, servidores nas portas 8795/8796)
1. **Abas 4 e 5:**
   - abrir e fechar um órgão × fonte, um programa e um órgão;
   - os MAPPs aparecem na linha de baixo e somam o total da linha-mãe;
   - os filtros do topo e a grade de MAPPs não mudam;
   - na aba 5, editar uma Proposta dentro da expansão atualiza o total do órgão e mantém a linha aberta.
2. **De-para:** baixar, alterar duas linhas, subir; as linhas mudam na aba 3, uma fonte inválida é rejeitada com aviso, e o cruzamento se recalcula.
3. **Pacote:**
   - "baixar pacote atual" → limpar → "carregar pacote" dá os mesmos totais: LOA do Executivo R$ 5.682.613.358, Proposta, LOA não alocada R$ 2,85 bi, 7.243 MAPPs com programa;
   - um pacote com uma aba obrigatória faltando gera um erro claro.
4. **Ano:**
   - uma base com colunas renomeadas para 2027/2028 e `EXERCICIO_LOA` = 2028 dá os mesmos valores, com os rótulos trocados;
   - a regra continua 7.300/7.300 igual ao SIPOG com a base atual.
