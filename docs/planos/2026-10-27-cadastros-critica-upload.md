# Cadastros automáticos para criticar o upload (SIPOG e estudo LOA)

## Contexto

O usuário pergunta: "O que poderíamos manter salvo no sistema para criticar os dados recebidos via upload? Relação de órgãos, Fontes orçamentárias... Como seria essa estrutura?"
Decisões dele: valer para o **SIPOG e o estudo LOA**; **avisar e carregar** (só erro estrutural bloqueia); e que seja **transparente**: ao subir os PDFs da LOA (Volume II, Tomos I e II) e o xlsx do MAPP, o sistema **monta sozinho** órgãos, fontes, programas... sem cadastro digitado.

Diagnóstico atual:
- `importar()` (js/04) não critica nada: órgão, fonte e estágio entram como texto livre.
- O estudo LOA usa tabelas fixas no código (`js/estudo-loa-tabelas.js`: `SIGLAS_ORGAO_LOA`, `FONTES_LOA`, `SUBFONTE_LOA_POR_ORGAO`; `LOA_FORA_EXECUTIVO` no `js/estudo-loa.js`), escritas à mão em 26–27/10.
- O que cada arquivo traz (conferido):
  - **PLOA por ação** (`dados/loa2027_acoes.json`, do `ferramentas/extrair_ploa.py`): codOrgao (8 díg.) + nome, codUO + UO, programa + nome, ação, função/subfunção, GND, modalidade, **ID + FT + DT** da fonte, esfera. **Não traz** sigla do órgão nem a descrição/grupo da fonte.
  - **Extração do MAPP** (`mapps-regis18-09.xlsx`, 73 col.): SECRETARIA, ORGAO (nome/sigla), MAPP, PROGRAMA ("000 - NOME"), ESTAGIO_EXECUCAO, FONTE ("(500)-(501) Tesouro"), valores por ano. **Não traz** código do órgão nem a sub fonte da LOA.

## Ideia central: o cadastro é gerado; só as ligações ficam salvas

Cada upload gera automaticamente as listas daquilo que ele contém. O que nenhum arquivo traz é **a ligação entre os dois mundos** (LOA × MAPP). Só isso precisa ficar guardado, e é aprendido uma vez e reaproveitado nos anos seguintes.

| Cadastro | Montado de | Fica salvo? |
|---|---|---|
| Órgãos da LOA (código, nome, UOs, poder pelo prefixo) | PDFs da LOA | gerado a cada carga; foto do exercício salva para comparar com o ano anterior |
| Programas e ações | PDFs da LOA | idem |
| Fontes da LOA (ID.FT.DT) | PDFs da LOA | idem |
| Órgãos, secretarias, fontes, estágios, programas do MAPP | xlsx do MAPP | idem |
| **Órgão LOA ↔ órgão MAPP** (código ↔ sigla/nome) | sugerido, editável | **sim, por exercício** (hoje `SIGLAS_ORGAO_LOA`) |
| **Fonte LOA ↔ Fonte do MAPP** (+ grupo Tesouro/Outras, descrição) | sugerido, editável | **sim, por exercício e por estudo** (hoje `FONTES_LOA`, `SUBFONTE_LOA_POR_ORGAO` e de-para manual) |
| **Fora do Executivo** | regra pelo prefixo do código (01, 02, 04, 15) | **sim** (hoje `LOA_FORA_EXECUTIVO`) |
| **Aliases** (texto variante → texto canônico: "(312,82)" → "(312.82)", acentos, siglas) | aprendido na crítica | **sim** |

**A ligação LOA × MAPP não é fixa** (decisão do usuário): é uma **proposta editável**, não uma regra.
- Ligações guardadas por exercício (`referencias/exercicio_{ano}` na nuvem, junto com a foto e os aliases), cada uma com origem (`semente`, `sugestão aceita`, `manual`), quem e quando alterou.
- Ao carregar um exercício novo, o sistema parte das ligações do exercício anterior como sugestão; nada fica travado.
- Podem ser alteradas a qualquer momento: na grade de de-para (aba 3 do estudo, que já edita `deParaManual`), no painel de crítica ou por xlsx (importador de formato livre já existente). Alterar refaz o cruzamento na hora.
- Um estudo salvo guarda as ligações que usou, para ser reaberto igual mesmo que o padrão mude depois.
- Escopo: toda alteração vale para o estudo aberto (como hoje); o botão "Salvar como padrão do exercício" (aba 3) a promove. O padrão é aplicado sozinho ao abrir a página, sem apagar escolhas já feitas no estudo.

**Semente no repositório** = o próprio `js/estudo-loa-tabelas.js` (um JSON não abre por `fetch` com a página em `file://`) com as ligações que já conhecemos hoje (as tabelas de `estudo-loa-tabelas.js`, o de-para já feito, as siglas). Serve só de **ponto de partida** da primeira carga, inclusive offline (`file://`); a nuvem sobrepõe a semente e o usuário sobrepõe a nuvem. O usuário não mantém tabela: confere e altera ligações quando quiser.

## Fluxo para o usuário

1. Sobe os PDFs da LOA e o xlsx do MAPP (como hoje).
2. O sistema extrai as listas, aplica aliases e ligações conhecidas e mostra um **painel de crítica** curto:
   - ✅ reconhecidos (contagem);
   - ⚠ novos: órgão/fonte/programa que não existia no exercício anterior, ou do MAPP sem par na LOA (e vice-versa), com **sugestão automática** (nome parecido, mesmo FT.DT, mesmo código no texto). Um clique aceita → vira ligação ou alias salvo;
   - ⚠ consistência: secretaria × órgão diferente do habitual, Empenhado > Limite, Pago > Empenhado, valor negativo, mais de um grupo "S", MAPP repetido no mesmo órgão + fonte, órgão fora do Executivo;
   - ✖ só bloqueia: coluna obrigatória ausente ou valor não numérico.
3. Carrega mesmo com avisos; o painel pode ser exportado em xlsx.

## Código (quando aprovado)

- Novo `js/referencias.js` (script clássico, sem efeito ao carregar), usado pelos dois:
  - `extrairCadastrosLOA(creditos)` e `extrairCadastrosMAPP(linhas)` → listas do exercício;
  - `carregarMemoriaReferencias()` (localStorage + nuvem `referencias/exercicio_<ano>`, reaproveitando `lerPacoteFragmentado`/`gravarPacoteFragmentado` do js/05);
  - `canonizar(tipo, texto)`, `criticarBase(cadastros, ligacoes, anterior)` → `{ erros, avisos, correcoes, sugestoes }`;
  - `aprenderLigacao(...)` grava na nuvem.
- Reaproveitar `classificarDePara`, `reconhecerFonteLOA`, `reconhecerFonteMAPP` (js/estudo-loa.js) para as sugestões de fonte, movendo-os para o novo arquivo.
- `js/estudo-loa-tabelas.js` continua como semente; o padrão do exercício sobrepõe as constantes ao abrir.
- SIPOG: `index.html` carrega `js/referencias.js` **depois** do js/15 (não mexe na ordem dos 01–15); `importar()` chama a crítica antes de `processarDados()`. No SIPOG não há LOA: compara com o exercício anterior e com as ligações salvas.
- A foto do exercício (órgãos, fontes, programas) é tirada no navegador a partir dos créditos já extraídos; o extrator não muda.

## Verificação

- Com a semente, a carga atual (PLOA 2027 + base real de 7.300 MAPPs e extração de 18/09) tem de reconhecer os mesmos pares de hoje e apontar como "novos" só os já conhecidos sem par (501.70 RDA, 722 FEF, 754.72, 762.01, 754.68).
- Totais do estudo e do SIPOG iguais aos de antes (a crítica só canoniza texto, não muda valores); 7.300/7.300 iguais.
- Simular um ano novo (exercício 2028, como em 27/10) e conferir que só órgão/fonte realmente novos pedem resposta.
- Edge headless via CDP (porta 9448) + `python -m http.server`.
