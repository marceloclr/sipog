# CLAUDE.md — SIPOG COFIP

Instruções permanentes de projeto para o Claude Code ao trabalhar neste repositório. Este arquivo é versionado no git e viaja automaticamente entre as máquinas de casa e do trabalho a cada `git pull` — qualquer atualização de regra deve ser feita aqui, não em cópias locais soltas.

## Visão geral

**SIPOG COFIP** é um sistema de projeção orçamentária da SEPLAG (Secretaria do Planejamento e Gestão do Ceará), usado para geração de cenários PLOA a partir de registros MAPP.

- **Arquivo único**: `index.html` na raiz do repositório — HTML, CSS e JavaScript embutidos no mesmo arquivo.
- **Offline-capable**: funciona sem servidor, sem dependências externas em tempo de execução.
- **Sem build step**: não há bundler, transpilador ou etapa de compilação. O que está no repositório é exatamente o que roda.
- **Publicação**: GitHub Pages publica automaticamente a partir da raiz da branch `main`. Toda alteração enviada com `git push` para `main` reflete no site público em poucos minutos: `https://marceloclr.github.io/sipog/`

## Regras de trabalho para código (obrigatórias)

Estas regras se aplicam a qualquer alteração no `index.html`, sem exceção:

1. **Sempre entregar o arquivo completo** — nunca trechos parciais ou "cole isso no lugar de X" deixados para o usuário aplicar manualmente.
2. **Validar JavaScript antes de finalizar**: rodar `node --check` sobre o(s) bloco(s) `<script>` extraído(s) do arquivo. Nenhuma alteração é considerada concluída sem essa validação passar.
3. **Checar balanceamento de tags** antes de finalizar — especialmente `<div>`/`</div>`, mas também qualquer outra tag manipulada na alteração. Contagem de abertura/fechamento deve bater.
4. **Apresentar o entendimento da mudança antes de implementar**, sempre que a alteração não for trivial (ou seja, qualquer coisa além de ajuste cosmético isolado). Não presumir escopo — confirmar antes de mexer em lógica de negócio, cálculos, ou estrutura de dados.
5. **Nunca refatorar identificadores/nomes quando apenas o rótulo (label) muda.** Se o pedido é renomear algo que aparece na tela (ex: "PLOA" → "Demais Projetos"), a mudança fica isolada em mapas de label (`CLASSE_LABEL_MAP`, `labelClasse()` e padrões equivalentes) — nunca renomear variáveis, chaves de objeto, IDs de elementos ou funções internas por causa de um rótulo visual.

## Identidade visual institucional

O cabeçalho segue o Manual de Identidade Visual do Governo do Ceará:

- Paleta verde/dourado institucional, fonte Kanit para UI geral.
- O brasão é renderizado como imagem (`<img class="brand-shield-img">`) embutida em base64 — **não** como reconstrução tipográfica. O wordmark textual ("CEARÁ / GOVERNO DO ESTADO / ...") foi removido deliberadamente; não reintroduzir sem pedido explícito.
- Variáveis CSS de tema (`--ceara-ink`, `--panel`, `--border`, etc.) suportam os dois temas (claro/escuro) — qualquer novo elemento visual deve usar essas variáveis, não cores fixas.

## Fluxo de Git

- Este repositório é a fonte única da verdade. Trabalho acontece em duas máquinas (casa e trabalho); cada sessão deve começar com `git pull` e terminar com `git push` — sem exceção, para evitar conflitos de merge.
- Mensagens de commit em português, descritivas do que mudou (não apenas "ajustes" ou "fix").
- Antes de qualquer `git push`, mostrar o `git diff` (ou resumo equivalente) e aguardar confirmação explícita do usuário — não commitar/enviar automaticamente sem esse passo, mesmo em alterações pequenas.
- Como é arquivo único, diffs grandes (milhares de linhas) podem ocorrer mesmo em mudanças conceitualmente pequenas, por causa de blocos como base64 de imagens ou reformatação. Isso é esperado neste formato de arquivo; não é sinal de erro por si só, mas vale checar o resumo do diff antes de confirmar.

## Pendências conhecidas

- **Relatório PDF desatualizado**: o gerador de PDF (jsPDF) ainda não reflete o card/coluna "Previsão de Empenho 2026 Ajustada" nem as renomeações recentes de PLOA/Demais Projetos. Pendente de atualização.

## Estrutura de referência rápida do arquivo

O `index.html` está organizado internamente (não em arquivos separados) nos seguintes blocos, nesta ordem aproximada:

1. `<style>` — variáveis CSS de tema, componentes visuais (cards, tabs, botões, marca institucional).
2. Marcação HTML — cabeçalho institucional, painel de gate, abas nomeadas (PLOA, PLOA Detalhado, etc.).
3. `<script>` — lógica de negócio: parsing/filtro de MAPP, cálculo de PLOA Ajustado, exports (XLSX via ExcelJS, PDF via jsPDF), renderização de gráficos.

Este arquivo é grande (código + imagem embutida). Ao editar, preferir `str_replace`/edição cirúrgica de trechos específicos em vez de reescrever o arquivo inteiro, para reduzir risco de erro e tamanho de diff — exceto quando a regra 1 (entregar arquivo completo) exigir o contrário na entrega final.
