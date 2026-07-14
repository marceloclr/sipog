# SIPOG/COFIP — contexto do projeto (atualizado)

Sistema de Projeção Orçamentária e Gestão Financeira do Governo do Ceará (Secretaria da Segurança
Pública e Defesa Social — SSPDS). Projeta necessidades de aporte orçamentário (PLOA 2027) a partir de
dados de execução (MAPPs). Marcelo é o desenvolvedor/analista responsável; todas as conversas em
português; ele revisa cada etapa antes de eu avançar para a próxima.

**Este arquivo substitui o CLAUDE.md anterior.** Aquele documentava a fase de protótipo (antes de
mexer no arquivo real); este documenta o estado do **arquivo real já modificado**.

## Arquivo real do sistema

- `SIPOG_COFIP-v1_0907_11_30.html` — sistema principal em produção. Único arquivo HTML (~922KB,
  ~6.038 linhas), sem build step, sem framework, tudo inline (`<style>` + `<script>` únicos). Fonte da
  verdade — toda mudança de UI entra direto aqui, via edição pontual (`str_replace`), nunca
  recriando o arquivo inteiro. **Nenhuma regra de cálculo foi alterada em nenhuma etapa** — só
  UI/navegação/estrutura.
- `MANUAL-DE-IDENTIDADE-VISUAL-2023.pdf` — manual de marca do Governo do Ceará (na verdade um `.pdf`
  que já vem como texto extraído, não como PDF binário — dá pra ler direto com `view`).
- Os CLAUDE.md antigos (do protótipo) e o próprio protótipo (`sipog_prototipo_v3.html`) **não estão
  mais disponíveis** — existiram numa sessão/sandbox anterior. Se precisar consultar decisões de
  design da fase de protótipo, usar `conversation_search`/`recent_chats` (título da conversa antiga:
  "Análise de comparação SIPOG/COFIP e priorização de correções").

## Estrutura atual (mudou — não tem mais barra lateral)

O sistema **era** sidebar + conteúdo (grid de 2 colunas) e **agora é cabeçalho horizontal + abas +
conteúdo em coluna única, largura total**:

```
<header class="top-header">
  .header-row-main  → brand-card (SVG: brasão real + "CEARÁ/GOVERNO DO ESTADO/SIPOG") + título/subtítulo
                       (header-title) + ações (header-actions: 🌗 Alternar Tema, ☁️ Salvar Estado
                       Atual, 💾 Salvar Novo Cenário)
  .header-row-sub   → status-nuvem + estatísticas da base inline + dropdown "☁️ Nuvem e Backup" +
                       botões "🔍 Ajustes Realizados" / "📖 Premissas do Sistema"
</header>
<nav class="tabs-nav">  → 3 abas horizontais (estilo underline), mesmos ids/onclick de sempre:
  b-imp (showView('v-imp')) | b-plodet (showView('v-plodet')) | b-dash (showView('v-dash'))
</nav>
<div class="painel-util-box" id="painel-ajustes-realizados">...</div>  <!-- faixa full-width, toggle -->
<div class="painel-util-box" id="painel-premissas-sistema"></div>      <!-- faixa full-width, toggle -->
<div class="wrap">
  <!-- faixa-indicadores-gerais, painel-monitoramento, e as 3 view-section (v-imp/v-plodet/v-dash) -->
</div>
```

Navegação por `showView('v-imp' | 'v-plodet' | 'v-dash')` — inalterada na lógica, só o HTML dos
botões/onde eles vivem mudou (de `.menu button` na sidebar para `.tabs-nav button`).

### 1. Carga e Ajustes (`v-imp`) — revelação progressiva (trilha de passos)

7 blocos, nesta ordem, agora como **trilha sequencial estrita** (não acordeões todos visíveis):
teto/subteto por fonte (`bloco-tetos`) → previsão de empenho por estágio (`r-m1`) → parâmetro de
referência (`r-m2`) → redutor por grupo/Valor Paradigma (`r-m3`) → portão do PLOA 2027 (`r-m4`,
`gerarValoresPLO()`) → registros ativos (`d-m2`) → lixeira (`d-lixeira`).

- Só a etapa atual (cabeçalho + corpo) fica visível; as futuras ficam com `display:none` completo.
- Trilha visual (`#trilha-imp`) no topo mostra as 7 etapas (✅ concluída/clicável, ▶️ atual, 🔒
  bloqueada).
- Cada etapa tem botão próprio **"✅ Concluir esta etapa e avançar ▸"**, separado dos botões de
  cálculo (não mistura navegação com regra de negócio).
- Lógica em `ETAPAS_IMP` (array), `aplicarEstadoEtapasImp()`, `avancarEtapaImp(i)`,
  `irParaEtapaImp(i)`, `resetarTrilhaImp()` (volta pro passo 0 — chamada em `importar()`,
  `limparBase()`, `restaurarParametrosPadrao()`), `desbloquearTodasEtapasImp()` (destrava tudo de
  uma vez — chamada em `aplicarParametros(p)`, usada ao carregar cenário/estado/parâmetros já
  prontos, pois não faz sentido re-percorrer a trilha de algo já configurado).
- Subteto por fonte/grupo continua **100% manual/discricionário** — não existe cascata automática
  Teto→Subteto (decisão confirmada; a ideia foi cogitada e descartada).

### 2. Faixa de Indicadores Gerais — sempre visível, 4 valores ao vivo

Acima do Painel de Monitoramento, independente de aba/fonte selecionada:

| Card | Fonte do valor | Antes do PLOA gerado | Depois de gerado |
|---|---|---|---|
| Necessidade 2027 (Calculada) | `totaisCenarioAtual.t_nec27` | sempre visível | idem |
| Necessidade 2027 Ajustada | `totaisCenarioAtual.t_nec27aj` | sempre visível | idem |
| PLOA 2027 | prévia ao vivo (`plo-total-previa`, mesma conta da tabela do Redutor do PLOA) | selo "prévia" | valor real congelado (`t_plo`), sem selo |
| PLOA 2027 Ajustado | — | fica em **"—"** até a 1ª geração (decisão confirmada) | valor comprometido; reaparece selo "prévia" só se o usuário digitar um novo % ainda não aplicado (compara com `t_ploAj`) |

Funções: `atualizarFaixaIndicadoresGerais()` (chamada dentro de `calcularIndicadoresFinais()`),
`atualizarFaixaPreviaPLOAoVivo(soma)` (chamada dentro de `atualizarTotalPLO()`, a cada tecla digitada
no redutor do PLOA). Zero cálculo novo — só reaproveita valores que o sistema já calculava.

### 3. Painel de Monitoramento dos Ajustes

Agora com **4 cards** (era 5): Programado 2027, TRF 2026 Ajustada, Teto Disponibilizado, Saldo do
Teto. O card "Necessidade 2027 Ajustada" foi removido (redundante com a Faixa de Indicadores Gerais).
Botão "⚖️ Distribuir Saldo entre os MAPPs" alinhado à direita.

### 4. Identidade visual (Manual do Governo do Ceará 2023-2026)

- Tipografia: Kanit (títulos/UI) + Maitree (texto corrido), via Google Fonts (`<link>` no `<head>` —
  precisa de internet real pra carregar; não carrega no sandbox offline, isso é esperado).
- Paleta oficial do "Grafismo" como variáveis CSS (`--ceara-verde #26a737`, `--ceara-laranja #f59c00`,
  `--ceara-teal #2db39e`, `--ceara-ambar #e4a500`, `--ceara-vermelho #e94f0e`, etc.) — conferida
  linha a linha contra o manual. `--accent`/`--warning`/`--danger`/`--teal`/`--success` remapeados pra
  tons oficiais (com variantes claras para o tema escuro — ajuste meu de implementação, não regra do
  manual).
- 7 gradientes de categoria (`--c-qtd`, `--c-p26`, `--c-prev26`, `--c-trf26`, `--c-trf26aj`, `--c-p27`,
  `--c-nec27`) seguem progressão verde→teal→âmbar→laranja→vermelho (dado mais "base" → mais
  "crítico"), para diferenciar categoria de informação (não decoração aleatória).
- Logo: SVG (`.brand-svg`) com o brasão real embutido (reaproveita `BRASAO_CEARA_PNG_B64`, que já
  existia no sistema para o cabeçalho do PDF exportado) + assinatura tipográfica "CEARÁ / GOVERNO DO
  ESTADO" (cor `#465564`, do manual — não é verde) + "SIPOG" como marca secundária. Fica num
  `.brand-card` de fundo branco fixo (regra de controle de fundo do manual, vale nos dois temas).
  **Pendente:** Marcelo pode enviar um arquivo mestre (vetor/alta resolução com alfa real) para
  substituir esse SVG — ainda não enviou.
- `--ceara-ink #465564` é bem parecido com o `#20303B` já usado como cor neutra de UI — não uni os
  dois, Marcelo não pediu.

### 5. Alinhamento de botões — padrão: à direita

Levantamento completo dos ~66 botões estáticos do arquivo. Corrigidos: Distribuir Saldo, linha
"Processar Cenário/Restaurar Parâmetros/Editar Necessidade", linha "Gerar Valores de PLOA 2027".
Os demais já usavam `.title-header-export` (space-between) ou já tinham `flex-end`.
**Exceções mantidas de propósito** (não são "botões de toolbar"): menu/dropdown/hover de navegação,
abas internas do Dashboard, botões centralizados do portal de boas-vindas (empty state), paginação,
botões de célula de tabela (por linha), "+ Adicionar Teto" (trilha de um formulário inline).

### 6. Tema claro/escuro e status de nuvem

Ambos já existiam no sistema real; só reestilizados/reposicionados:
- Tema (`toggleTheme()`): botão movido da sidebar (não existe mais) para `header-actions`, ao lado de
  "Salvar Estado Atual"/"Salvar Novo Cenário".
- Status de nuvem (`#status-nuvem`): mantido, agora em `.header-row-sub`.

## Bugs reais encontrados e corrigidos ao longo do trabalho

Vale registrar porque são o tipo de coisa que só aparece testando de verdade, não só lendo o código:

1. Uma edição de fonte (loading overlay) quebrou a sintaxe JS inteira (aspas simples aninhadas dentro
   de uma string já delimitada por aspas simples) — travaria o sistema inteiro. Pego via
   `node --check` no JS extraído do HTML.
2. `mon-nec27aj` foi removido do HTML (card redundante) mas duas referências no JS (`atualizarPainelMonitoramento()`
   e o export/relatório XLSX) ainda escreviam nele — geraria `Cannot read properties of null`. Limpo.
3. Os botões "Ajustes Realizados"/"Premissas do Sistema" no cabeçalho chamavam `togglePainelUtil()` —
   função que nunca tinha sido escrita (clique não fazia nada). Implementada, reaproveitando a classe
   `.painel-util-box` já pronta no CSS.
4. `showView()` limpava a classe `.active` de `.menu button` (sidebar antiga, que não existe mais) —
   ao trocar de aba, o botão anterior nunca perdia o destaque visual. Corrigido para `.tabs-nav
   button`.
5. CSS morto removido: `.hover-info-wrap`, `.menu-hover-icon`, `.menu`/`.menu button*`, `.hero*`
   (todos da sidebar antiga).

## Metodologia de teste (importante replicar em sessões futuras)

O sandbox **não tem acesso à internet** (rede restrita a poucos domínios de pacotes) — CDNs
(Chart.js, xlsx.js, Google Fonts) não carregam. Isso causa efeitos colaterais que **não são bugs
reais**, só limitação do ambiente:
- `wkhtmltoimage` na página inteira retorna `ContentAccessDenied` e pode abortar a execução do script
  antes de rodar tudo.
- jsdom (`runScripts:'dangerously'`) joga `ReferenceError: Chart is not defined`, o que interrompe a
  execução do `<script>` principal no meio (deixando variáveis `let` declaradas depois em TDZ —
  `Cannot access '...' before initialization`).

**Como testar mesmo assim:**
- Para lógica JS isolada: injetar um `<script>` **dentro do próprio HTML** (não um arquivo `.js`
  externo em Node) — scripts inline no mesmo documento compartilham o escopo léxico de `let`/`const`
  de nível superior entre si (funções declaradas viram propriedade de `window`; `let`/`const` não,
  mas são visíveis por nome em scripts posteriores do mesmo documento).
- Para rodar o fluxo completo sem o crash do Chart.js: injetar um stub `window.Chart = function(){...}`
  **antes** do script principal (no `<head>`), permitindo a execução completa até o fim.
- Para prints confiáveis: extrair só `<style>` + o HTML estático relevante (sem `<script src>` nem
  `<link>` de fontes externas) e renderizar com `wkhtmltoimage` — isolado, sem chamadas de rede, sem
  abortar.
- Sempre `node --check` no JS extraído do HTML antes de considerar uma edição pronta.
- Testes ficam em `/home/claude/sipog/` (arquivos `test_*.html`, `run_*.js`) — não fazem parte do
  entregável, não copiar para `/mnt/user-data/outputs/`.

## Princípios de trabalho (confirmados nesta fase)

- Ler o arquivo real diretamente antes de qualquer mudança — nunca confiar só em relatório/resumo
  anterior (já pegou erro real feito assim antes).
- Editar por `str_replace` pontual; nunca recriar o HTML inteiro.
- Nenhuma regra de cálculo pode mudar — toda mudança é UI/navegação/estrutura.
- Antes de mudanças grandes/ambíguas, perguntar (ex: base da cascata, onde encaixar um componente nível
  de risco); para decisões pequenas com um default razoável, seguir e avisar a suposição.
- Testar de verdade (jsdom) antes de apresentar, não só ler o código e assumir que funciona — isso já
  pegou múltiplos bugs reais nesta sessão.
- Mostrar prints (light/dark quando fizer sentido) a cada entrega visual.
- Marcelo revisa cada etapa antes de eu avançar pra próxima.

## Em aberto / próximos passos possíveis

- Responsividade do novo cabeçalho horizontal em telas menores — ainda não testada/ajustada.
- Arquivo mestre da logo (vetor/alta resolução com alfa real) — Marcelo pode enviar.
- Aplicar trilha de revelação progressiva também em "PLOA Detalhado" (`v-plodet`, 2 blocos) — decidido
  não fazer por ora (redundante, já tem gate próprio por "PLOA gerado"), mas pode reconsiderar.
- Validação mais ampla do cabeçalho/abas em fluxo real (com dados de verdade, não só simulação
  jsdom) — recomendável Marcelo testar no Claude Code/navegador real antes de considerar definitivo.
