// SIPOG COFIP — js/02-ui-navegacao.js
// Estado global da aplicação, dropdowns, ordenação, showView, trilha de etapas e tema.
// Script clássico (escopo global). Ordem de carga definida em index.html — não reordenar.
let dadosBrutos = [];
let tetosPorFonte = {};      // { "nomeFonte": valorNumerico }
let subtetosPorFonteGrupo = {}; // { "nomeFonte": { "CLASSE": valorNumerico } } — subtetos opcionais por grupo dentro de uma fonte com teto definido
let monFonteSelecionada = ''; // fonte ativa no painel de monitoramento
let totaisCenarioAtual = {}; // cache dos totais do Dashboard, para os gráficos comparativos
let dadosProcessados = [];
let dadosExcluidos = [];
let ploGerado = false; // true depois de "Gerar Valores de PLOA 2027" — não trava mais nada no sistema, é só informativo
let ploDataGeracao = null;
// Percentual de redução da Previsão de Empenho 2026 confirmado por grupo (bloco
// "Valor Deliberado Máximo do Empenho 2026 por Grupo de Projetos"), por Fonte
// e por classe: { [fonte]: { [classe]: pct } }. Premissa do projeto: só a
// Fonte selecionada no Painel de Monitoramento pode ter valores alterados —
// por isso o percentual de um grupo é guardado (e reaplicado) por Fonte,
// nunca globalmente. Só é preenchido quando o usuário clica em "Aplicar"
// (ou solta um slider) naquele grupo; sobrevive a reprocessamentos
// (Processar Cenário volta a aplicar os mesmos percentuais salvos aqui, cada
// um só na sua própria Fonte).
let prevEmpAjustesPreservados = {};

// Helpers de leitura/escrita de prevEmpAjustesPreservados (fonte + classe),
// para não espalhar a checagem de existência do nível intermediário por
// todo o código.
function obterPctPreservado(fonte, classe) {
    let porFonte = prevEmpAjustesPreservados[N(fonte)];
    return (porFonte && typeof porFonte[classe] === 'number') ? porFonte[classe] : undefined;
}
function definirPctPreservado(fonte, classe, pct) {
    let chaveFonte = N(fonte);
    if (!prevEmpAjustesPreservados[chaveFonte]) prevEmpAjustesPreservados[chaveFonte] = {};
    prevEmpAjustesPreservados[chaveFonte][classe] = pct;
}

// Sliders de ajuste rápido (Redutor por Grupo + PLOA 2027): registra, por
// sufixo de grupo, se o usuário já mexeu manualmente (slider, % ou R$) naquele
// grupo especificamente — a partir daí o slider Geral do respectivo bloco
// ignora esse grupo. Persiste durante toda a sessão; só é zerado junto com
// prevEmpAjustesPreservados (Restaurar Parâmetros / carregar cenário).
let redutorSliderQuebrados = {};
let ploSliderQuebrados = {};
let totalRegistrosBase = 0;
let totalRegistrosExpurgados = 0;
let itensPorPagina = 50;

let seletoresAtivos = {
    dash: { orgao: new Set(), estagio: new Set(), fonte: new Set(), classe: new Set() },
    gestao: { orgao: new Set(), estagio: new Set(), fonte: new Set(), classe: new Set() },
    plodet: { orgao: new Set(), secretaria: new Set(), estagio: new Set(), fonte: new Set(), classe: new Set() }
};

let ordenacaoAtiva = {
    classificacao: { coluna: 'nec', desc: true },
    gestao: { coluna: 'mapp', desc: false },
    secretaria: { coluna: 'nec', desc: true },
    orgaos: { coluna: 'nec', desc: true },
    gridOrgaoClasse: { coluna: 'TOTAL', desc: true },
    gridOrgaoClassePLO: { coluna: 'TOTAL', desc: true },
    gridOrgaoClassePLOAjustado: { coluna: 'TOTAL', desc: true },
    plodetPivot: { coluna: 'plo', desc: true },
    plodetDetalhe: { coluna: 'necessidade2027Ajustada', desc: true }
};

function toggleDropdownNuvem(e) {
    e.stopPropagation();
    document.getElementById('dropdown-nuvem-wrap').classList.toggle('open');
}
function fecharDropdownNuvem() {
    document.getElementById('dropdown-nuvem-wrap').classList.remove('open');
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.dropdown-nuvem')) fecharDropdownNuvem();
    if (!e.target.closest('.multiselect-container')) {
        document.querySelectorAll('.multiselect-container').forEach(el => {
            el.classList.remove('open');
            let inp = el.querySelector('.multiselect-dropdown input[type="text"]');
            if (inp && inp.value) {
                inp.value = '';
                el.querySelectorAll('.multiselect-item').forEach(item => item.style.display = '');
            }
        });
    }
});

function toggleMDropdown(id) {
    let container = document.getElementById(id);
    let abrindo = !container.classList.contains('open');
    document.querySelectorAll('.multiselect-container').forEach(el => {
        el.classList.remove('open');
        // Limpa campo de busca e restaura visibilidade de todos os itens ao fechar
        let inp = el.querySelector('.multiselect-dropdown input[type="text"]');
        if (inp && inp.value) {
            inp.value = '';
            el.querySelectorAll('.multiselect-item').forEach(item => item.style.display = '');
        }
    });
    if (abrindo) container.classList.add('open');
}

function ordenarDados(lista, config) {
    if (!config.coluna) return lista;
    return [...lista].sort((a, b) => {
        let valA = a[config.coluna];
        let valB = b[config.coluna];
        if (typeof valA === 'string') return config.desc ? valB.localeCompare(valA) : valA.localeCompare(valB);
        return config.desc ? valB - valA : valA - valB;
    });
}

function alternarOrdenacao(tabela, coluna) {
    if (ordenacaoAtiva[tabela].coluna === coluna) {
        ordenacaoAtiva[tabela].desc = !ordenacaoAtiva[tabela].desc;
    } else {
        ordenacaoAtiva[tabela].coluna = coluna;
        ordenacaoAtiva[tabela].desc = true;
    }
    if (tabela === 'classificacao') { calcularIndicadoresFinais(); }
    if (tabela === 'gestao') renderizarGestao(1);
    if (tabela === 'secretaria' || tabela === 'orgaos') renderizarConsolidados();
    if (tabela === 'gridOrgaoClasse') renderizarGridOrgaoClasse();
    if (tabela === 'gridOrgaoClassePLO') renderizarGridOrgaoClassePLO();
    if (tabela === 'gridOrgaoClassePLOAjustado') renderizarGridOrgaoClassePLOAjustado();
    if (tabela === 'plodetPivot') renderizarPLODetalhado();
    if (tabela === 'plodetDetalhe') renderizarPLODetalheMapp(1);
}

let abaAtualId = 'v-imp';

function showView(viewId) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.tabs-nav > button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tabs-nav-actions-group').forEach(g => g.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    let btnMap = {'v-dash':'b-dash','v-imp':'b-imp','v-plodet':'b-plodet'};
    if(btnMap[viewId]) document.getElementById(btnMap[viewId]).classList.add('active');
    let grupoAcoes = document.getElementById('tabs-actions-' + viewId);
    if (grupoAcoes) grupoAcoes.classList.add('active');
    abaAtualId = viewId;
    atualizarEstadoGateImportacao();
    if (viewId === 'v-plodet') renderizarPLODetalhado();
}

function tg(id) {
    let e = document.getElementById(id);
    e.style.display = e.style.display === 'block' ? 'none' : 'block';
}

// ─── Revelação progressiva — trilha de passos da aba "Carga e Ajustes" ───
// Tela sempre mostra UM único bloco por vez (o "exibido"), para não poluir a
// tela: os demais somem por completo (cabeçalho + corpo), só voltando quando
// selecionados pela trilha. Não altera nenhuma regra de cálculo — é só
// navegação/visibilidade.
// etapaAtualImp    = etapa mais avançada já concluída/desbloqueada (a fronteira).
// etapaExibidaImp  = etapa cujo bloco está de fato na tela agora; nunca pode
//                    ser maior que etapaAtualImp (não dá pra ver o que ainda
//                    está bloqueado). Navegação (Voltar/Próximo/clique na
//                    trilha) só move este ponteiro; concluir e avançar a
//                    fronteira só acontece no botão "Próximo" quando ele
//                    coincide com a etapa atual.
const ETAPAS_IMP = [
    { head: 'acc-tetos-head',  body: 'bloco-tetos', label: 'Teto e Subteto por Fonte' },
    { head: 'acc-head-imp-1',  body: 'r-m1',        label: 'Previsão de Empenho por Estágio' },
    { head: 'acc-head-imp-2',  body: 'r-m2',        label: 'Parâmetro de Referência' },
    { head: 'acc-head-imp-3',  body: 'r-m3',        label: 'Redutor por Grupo' },
    { head: 'acc-head-imp-4',  body: 'r-m4',        label: 'PLOA 2027' },
    { head: 'acc-head-imp-5',  body: 'd-m2',        label: 'MAPP' },
    { head: 'acc-head-imp-6',  body: 'd-lixeira',   label: 'Recuperar MAPP' }
];
let etapaAtualImp = 0;
let etapaExibidaImp = 0;

function renderizarTrilhaImp() {
    let cont = document.getElementById('trilha-imp');
    if (!cont) return;
    cont.innerHTML = ETAPAS_IMP.map((etapa, i) => {
        let estado = i < etapaAtualImp ? 'concluida' : (i === etapaAtualImp ? 'atual' : 'bloqueada');
        let icone = estado === 'concluida' ? '✅' : (estado === 'atual' ? '▶️' : '🔒');
        let clique = estado !== 'bloqueada' ? ` onclick="irParaEtapaImp(${i})"` : '';
        let exibida = i === etapaExibidaImp ? ' trilha-exibida' : '';
        return `<div class="trilha-item trilha-${estado}${exibida}"${clique}><span>${icone}</span><span>${i + 1}. ${etapa.label}</span></div>`;
    }).join('');
}

// Mostra na tela SOMENTE o bloco da etapa exibida — cabeçalho e corpo de
// todas as demais etapas ficam com display:none, mesmo as já concluídas.
function aplicarEstadoEtapasImp() {
    ETAPAS_IMP.forEach((etapa, i) => {
        let head = document.getElementById(etapa.head);
        let body = document.getElementById(etapa.body);
        let exibida = i === etapaExibidaImp;
        if (head) head.style.display = exibida ? '' : 'none';
        if (body) body.style.display = exibida ? 'block' : 'none';
    });
    let btnVoltar = document.getElementById('btn-voltar-etapa-imp');
    let btnProximo = document.getElementById('btn-proximo-etapa-imp');
    if (btnVoltar) btnVoltar.style.display = etapaExibidaImp > 0 ? 'inline-flex' : 'none';
    if (btnProximo) btnProximo.style.display = etapaExibidaImp < ETAPAS_IMP.length - 1 ? 'inline-flex' : 'none';
    renderizarTrilhaImp();
}

// Rola sempre até o topo da página — garante que a barra de indicadores
// (os cards) e a trilha fiquem sempre visíveis ao trocar de etapa, com
// posição final padronizada independentemente da altura do bloco.
function scrollTopoEtapaImp() {
    setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 60);
}

// Botão "◂ Voltar": só navega para o passo anterior já desbloqueado — nunca
// desfaz uma conclusão.
function voltarEtapaImp() {
    if (etapaExibidaImp <= 0) return;
    etapaExibidaImp--;
    aplicarEstadoEtapasImp();
    scrollTopoEtapaImp();
}

// Botão "✅ Próximo ▸": se a etapa exibida for a fronteira (etapaAtualImp),
// conclui-a de fato e avança a fronteira; se for uma etapa anterior já
// concluída (o usuário voltou/clicou na trilha para revisar), apenas navega
// para a próxima já desbloqueada, sem re-concluir nada.
function proximoEtapaImp() {
    if (etapaExibidaImp >= ETAPAS_IMP.length - 1) return;
    if (etapaExibidaImp === etapaAtualImp) etapaAtualImp++;
    etapaExibidaImp++;
    aplicarEstadoEtapasImp();
    scrollTopoEtapaImp();
}

// Clique numa etapa concluída ou na etapa atual, pela trilha: só troca qual
// bloco está exibido — nunca desbloqueia uma etapa futura.
function irParaEtapaImp(i) {
    if (i > etapaAtualImp) return;
    etapaExibidaImp = i;
    aplicarEstadoEtapasImp();
    scrollTopoEtapaImp();
}

// Volta a trilha para a 1ª etapa — usada em importação nova, limpeza de
// base e restauração de parâmetros padrão (recomeça a configuração do zero).
function resetarTrilhaImp() {
    etapaAtualImp = 0;
    etapaExibidaImp = 0;
    aplicarEstadoEtapasImp();
}

// Desbloqueia todas as etapas de uma vez — usada ao carregar um cenário,
// estado da nuvem ou pacote de parâmetros já configurado (não faz sentido
// forçar o usuário a reabrir passo a passo algo que já veio pronto). A tela
// abre no 1º passo, mas todos ficam acessíveis pela trilha.
function desbloquearTodasEtapasImp() {
    etapaAtualImp = ETAPAS_IMP.length - 1;
    etapaExibidaImp = 0;
    aplicarEstadoEtapasImp();
}

function toggleTheme() {
    let htmlElement = document.documentElement;
    let novoTema = htmlElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    htmlElement.setAttribute('data-theme', novoTema);
    localStorage.setItem('spopic_theme', novoTema);
    // Reatualiza gráficos com nova paleta
    setTimeout(renderizarGraficos, 50);
}
let temaSalvo = localStorage.getItem('spopic_theme') || 'light';
document.documentElement.setAttribute('data-theme', temaSalvo);

