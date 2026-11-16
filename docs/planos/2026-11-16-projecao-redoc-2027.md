# Plano — Projeção 2027 das despesas do REDOC no SIPOG

## Contexto
Pedido de 16/11/2026: avaliar o `redoc_13-11-26.csv` (extração do REDOC) "como especialista de finanças e
contabilidade pública", identificar o comportamento das despesas e projetar os recursos financeiros **por item de
despesa** com base no histórico.

Decisões do usuário (16/11):
- Horizonte: **só 2027**.
- Índices: **parâmetros** editáveis.
- Local: **SIPOG**.

## O arquivo

23.031 linhas, `;`, UTF-8 com BOM, números com vírgula decimal. Colunas: SECRETARIA, ORGAO, TIPO_MAPP (Pessoal,
Investimento, Gestão, Finalístico, Manutenção, Serviço da Dívida), DSC_FONTE_MAPP, COD_MAPP, DSC_MAPP, DSC_GID (17),
CODIGO_COMPLETO (natureza de 11 dígitos), GRUPO, MODALIDADE, ELEMENTO, ITEM (com descrições), Empenhado 2023…2026
e Limite 2026.

- **2026 é parcial** (data de corte no nome: 13/11/2026).
- O Limite 2026 existe só fora do Investimento (7.355 linhas).
- Problemas a criticar: 19 linhas sem fonte, 74 chaves repetidas, espaços no cabeçalho ` DSC_ITEM `.

## O que o histórico mostrou (base para os padrões)

- Totais empenhados: R$ 33,1 bi (2023), 37,7 bi (2024), 44,8 bi (2025) e 39,0 bi (2026 até 13/11).
- Só 23% das linhas de MAPP têm valor nos três anos completos, e um terço dos MAPPs de 2025 não existia em 2024.
  Por isso, **a base da projeção é o fechamento de 2026**, que já traz os MAPPs vigentes. O histórico serve só para
  calibrar os índices e as despesas pontuais.
- Teste retroativo (projetar 2025 a partir de 2023 e 2024, no nível Órgão × Tipo × GID; WAPE é o erro absoluto
  ponderado pelo valor):

| Classe | Melhor regra | WAPE | Erro no total |
|---|---|---|---|
| Pessoal | último ano × crescimento próprio | 3,8% | −2,0% |
| Custeio recorrente | último ano × índice (7%) | 17,0% | −7,7% |
| Investimento | último ano × índice (sem tendência) | 31,8% | +4,5% |
| Pontual (DEA, sentenças, indenizações, FGO, aumento de capital) | nenhuma regra funciona | ~87% | ~−53% |
| Contratual (dívida, operações de crédito 754) | depende de cronograma | ~40% | — |

- Extrapolar a tendência do Investimento erra muito (WAPE de 53%).

## Método

1. **Fechamento 2026 por linha:** `Emp26 × fator de fechamento da classe`. Quando há Limite 2026, ele é o teto,
   e o fechamento nunca fica abaixo do Emp26. Os fatores padrão vêm da proporção 2026 parcial / 2025:
   1,22 em Pessoal, 1,10 no custeio e 1,05 no Investimento; todos são editáveis. Quando houver empenhado mensal,
   ele poderá substituir esses fatores (fora deste plano).
2. **Classe da linha**, por regras editáveis por elemento, GID, fonte e tipo:
   A-Pessoal, A-Custeio, B-Investimento, C-Pontual, E-Contratual. A classe também pode ser trocada à mão.
3. **Regra de 2027 por classe** (parâmetros):
   - A-Pessoal: fechamento 2026 × (1 + crescimento vegetativo + reajuste).
   - A-Custeio: fechamento 2026 × (1 + IPCA + crescimento real). Pode haver um índice próprio por GID
     (Terceirização, Contratos de Gestão etc.).
   - B-Investimento: fechamento 2026 × (1 + índice), sem tendência.
   - C-Pontual: escolha entre zero, média 2023–2025 ou valor manual. Padrão: média 2023–2025, sem o maior ano.
   - E-Contratual: padrão = fechamento 2026, marcado como "informar cronograma"; valor manual por linha.
4. **Linhas só com Limite 2026, sem empenho** (1.391 linhas, R$ 246 mi): opção de incluir pelo limite
   (padrão: incluir).
5. **Ajuste manual por linha:** o valor de 2027 pode ser substituído, com tarja e ↺ para voltar à regra.
6. A saída fica no nível do item de despesa (Órgão × Tipo × MAPP × Fonte × natureza de 11 dígitos), com a chave
   do REDOC `ORGAO__MAPP<n>__F<fonte6>__<natureza>` para devolver o resultado ao REDOC.

## Arquitetura

Página separada, como o `estudo-loa.html`: **`projecao-redoc.html` + `js/projecao-redoc.js`**. Reaproveita
`css/styles.css`, js/03 (formatação), js/05 (nuvem em chunks) e ExcelJS. Não mexe no `index.html` nem nos js/01–15,
exceto por um link no menu do SIPOG. Scripts clássicos, `file://`, UTF-8 sem BOM.

Abas:
1. **Carga e crítica:** CSV ou XLSX do REDOC. A data de corte vem do nome do arquivo e é editável. A crítica
   mostra colunas ausentes (bloqueia), linhas sem fonte, chaves repetidas (somadas, com aviso), valores negativos
   e empenho acima do limite.
2. **Parâmetros:** fatores de fechamento, índices por classe e por GID, regras de classe, tratamento das pontuais,
   Limite como teto e linhas só com limite.
3. **Comportamento:** série 2023–2026 por Tipo, GID, Fonte e Secretaria, com crescimento, variação, padrão de
   ocorrência, picos acima de R$ 50 mi e o teste retroativo de 2025 recalculado com os parâmetros da tela.
4. **Projeção 2027:** grade Secretaria → Órgão → Tipo → GID → itens, aberta dentro da própria grade. Colunas:
   2023, 2024, 2025, 2026 parcial, Limite 2026, fechamento 2026, 2027, variação, classe e regra. Tem filtros e
   ajuste manual.
5. **Exportação e cenário:** xlsx com as linhas, os resumos e os parâmetros; JSON local; cenário na nuvem
   (`projecao_redoc/<nome>`, pelos chunks do js/05).

## Etapas (um commit por etapa)

1. Página, carga e crítica (aba 1) e modelo de dados.
2. Classes, parâmetros e fechamento 2026 (aba 2).
3. Projeção 2027: grade e ajuste manual (aba 4).
4. Comportamento e teste retroativo (aba 3).
5. Exportação xlsx, JSON e nuvem (aba 5).
6. Link no SIPOG e seção no CLAUDE.md; teste com o arquivo real no Chrome, conferindo que os totais carregados
   batem com o CSV (R$ 33,082 / 37,701 / 44,794 / 39,018 / 37,141 bi).
