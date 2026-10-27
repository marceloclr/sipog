# Plano — Várias fontes da LOA para uma Fonte do MAPP (estudo LOA × MAPPs)

## Contexto
Algumas Fontes do MAPP recebem LOA de **mais de uma fonte da LOA**. Por exemplo, (500)-(501) Tesouro recebe 500.00, 501.00 e 501.01.

Decisões do usuário (27/10):
- Só o sentido **várias LOA → uma Fonte do MAPP**.
- **Sem rateio:** cada fonte da LOA continua indo inteira para uma única Fonte do MAPP.

O cálculo atual já soma as sub fontes da LOA que apontam para a mesma Fonte do MAPP (`montarConsolidado`, em `loaSubfonte`). O que falta é:
- **ver** essa composição;
- **montar** a ligação a partir da Fonte do MAPP, sem precisar caçar sub fonte por sub fonte;
- **barrar** conflitos, isto é, a mesma fonte da LOA ligada a duas Fontes do MAPP.

## Etapa A — De-para visto pela Fonte do MAPP (aba 3)
- **Nova grade** abaixo da atual: "Por Fonte do MAPP".
  - Uma linha por Fonte do MAPP, com: quantas fontes da LOA estão ligadas, LOA total, MAPPs ativos, Nec. Ajustada e Necessidade ÷ LOA.
  - Também aparecem as Fontes do MAPP **sem nenhuma LOA**.
- **Clique na linha** abre, na própria grade (mesmo padrão `expandidos*`), as fontes da LOA que compõem a Fonte do MAPP:
  - código, descrição, regra (exata/tesouro/prefixo/manual) e valor;
  - botão ✕ para desligar a fonte da LOA (vira "sem fonte" manual);
  - seletor **"+ ligar fonte da LOA"**, com as fontes ainda sem par ou ligadas a outra Fonte do MAPP; ao escolher, grava `deParaManual[sub] = fonte`.
- Filtro ligado por Grupo (Tesouro/Outras) e busca. Os tooltips mostram a composição: "Σ = 500.00 R$ x + 501.00 R$ y".
- Reaproveita `fonteEfetiva`, `alterarDePara`/`salvarDeParaManual`, `thDesc`, `dica` e `tdNum`.

## Etapa B — Composição visível nas abas 4, 5 e 6
- **Aba 4:**
  - a coluna "Sub fontes da LOA" vira **"Fontes da LOA"**, com contagem ("3 fontes") e o detalhe no tooltip (já existe `loaSubfonte`);
  - na linha aberta de órgão × fonte, aparece uma faixa "Composição da LOA" com os valores por fonte da LOA antes dos programas.
- **Aba 5:** nos alertas por fonte e na grade de órgãos, o tooltip da LOA mostra a composição.
- **Aba 6:** a grade "Por fonte" ganha o tooltip de composição. Na "Sobra no par", a lista por ação já identifica a fonte da LOA de origem de cada crédito.

## Etapa C — Exportação, pacote e conferências
- **XLSX:** nova aba **FONTE_MAPP_X_LOA** (FONTE DO MAPP, FONTE DA LOA, DESCRIÇÃO, ÓRGÃO, PROGRAMA, VALOR) e coluna "FONTES DA LOA" (contagem) em ORGAO_X_FONTE.
- **Pacote e de-para por xlsx:**
  - várias linhas com a mesma FONTE DO MAPP = permitido;
  - a mesma SUB FONTE com duas FONTES DO MAPP diferentes = **conflito**: a linha é rejeitada, listada no relatório e vale a primeira.
- **Aba 1/3:** aviso com as Fontes do MAPP que têm MAPPs com necessidade mas nenhuma LOA ligada. É o caso típico de fonte da LOA "sem par" que deveria ser ligada.

## Etapa D — Upload de de-para em CSV ou xlsx, com formato livre (aba 3)
O formato da planilha ainda não está definido. A área aceita qualquer layout e o usuário indica as colunas depois de carregar.

1. **Área "Importar de-para (CSV ou xlsx)"** na aba 3, separada do "Carregar de-para" de layout fixo, que continua.
   - CSV com ";" ou "," detectado sozinho, UTF-8 ou Windows-1252 (`decodificarTextoArquivo` e `parseCSV` já existem).
   - xlsx com escolha da aba.
2. **Mapeamento de colunas:** depois da leitura, mostra as 10 primeiras linhas e dois seletores obrigatórios, "Coluna da fonte da LOA" e "Coluna da Fonte do MAPP".
   - Há também um seletor opcional, "Coluna do órgão", para ligações que valem só num órgão (ex.: 754.49 Linha Leste só na SEINFRA). Ele usa o mecanismo de `SUBFONTE_LOA_POR_ORGAO`.
   - A sugestão automática acha colunas pelo nome (SUB FONTE, FONTE LOA, FONTE DO MAPP, FONTE SIPOG, ÓRGÃO...).
   - O último mapeamento usado fica salvo no navegador, para o próximo arquivo no mesmo formato.
3. **Reconhecimento dos códigos** (tolerante ao formato):
   - **Fonte da LOA:** aceita o código completo (500.9.1.0.00.00), FT.DT (500.00), ID.FT.DT (1.500.00) e código com descrição ("500.9.1.0.00.00 - RECURSOS…"), usando `partesFonteLOA` e o mapa `codigosSubfonte`.
   - **Fonte do MAPP:** aceita o texto exato ("(500)-(501) Tesouro"), só o código ("(500)-(501)", "500-501", "500.501") ou só a descrição. Casa com as fontes da base de MAPPs pelo código (`partesFonteSIPOG`) e, se não houver código, pelo texto normalizado (`N`).
4. **Pré-visualização antes de aplicar.** Cada linha recebe um status, com contagem por tipo:
   - ✅ nova ligação; = já igual; ↺ substitui a atual;
   - ⚠ fonte da LOA não encontrada na LOA carregada;
   - ✖ Fonte do MAPP inexistente na base;
   - ✖ conflito: a mesma fonte da LOA ligada a duas Fontes do MAPP no arquivo; vale a 1ª e as outras são listadas.
   - Botões "Aplicar" (grava em `deParaManual`, com os mesmos efeitos da etapa A) e "Cancelar". "Baixar relatório" gera um xlsx com o status de cada linha.
5. **Reaproveitamento:** a mesma rotina de reconhecimento passa a valer para a aba DE_PARA_FONTES do pacote e para o "Carregar de-para" atual (`aplicarDeParaImportado` ganha os casamentos tolerantes). Assim, quando o formato definitivo existir, basta ele ter as duas colunas.

## Arquivos
- `js/estudo-loa.js`: `renderizarDePara` ganha a nova grade e as funções `alternarFonteMappDePara`/`ligarFonteLOA`; `COLUNAS_CONSOLIDADO` muda (subfontes); `exportarEstudoXLSX`; `aplicarDeParaImportado` passa a detectar o conflito.
- `estudo-loa.html`: container e CSS.
- `CLAUDE.md`.

## Verificação (Edge headless, base real + PLOA)
- A grade nova mostra (500)-(501) Tesouro com as fontes 500.xx e 501.xx, e a soma bate com a LOA da coluna das abas 4 e 5.
- Ligar 501.1.2.0.00.70 a (759)-(070) pelo seletor da grade nova: a fonte aparece na composição, a LOA fora do cruzamento cai (R$ 1,44 bi → R$ 0,81 bi) e o ✕ desfaz.
- Um xlsx com a mesma sub fonte em duas Fontes do MAPP gera conflito no relatório.
- **Etapa D:** testar um CSV ";" em Windows-1252 com colunas de nomes livres ("Fonte Orçamento"; "Fonte MAPP"), códigos em formatos misturados (500.00, 1.501.70, "754.3.2.1.00.49 - LINHA LESTE"; "(500)-(501)", "759-070", só a descrição) e uma coluna de órgão.
  - A pré-visualização classifica cada linha corretamente (novas, iguais, não encontradas, inválidas e conflito).
  - "Aplicar" muda a aba 3 e os totais como o esperado; "Cancelar" não muda nada.
  - O mesmo arquivo salvo em xlsx dá o mesmo resultado, e o mapeamento de colunas é lembrado no 2º arquivo.
- Os totais gerais não mudam com as etapas A e B (só visualização): LOA do Executivo R$ 5.682.613.358.
- Um commit por etapa, push em `origin`, relatório ao final.
