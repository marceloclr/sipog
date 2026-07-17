// SIPOG COFIP — js/14-graficos-dashboard.js
// Cenário de estresse, gráficos Chart.js do Dashboard, gauge de teto, painéis de hover e inicialização.
// Script clássico (escopo global). Ordem de carga definida em index.html — não reordenar.
// === SINCRONIZAÇÃO DO PAINEL DE CENÁRIO DE ESTRESSE ===
function sincronizarCenario() {
    let limiar = parseFloat(document.getElementById('r-exec-limiar').value) || 40;
    let critico = parseFloat(document.getElementById('r-exec-critico').value) || 15;
    let modPct  = parseFloat(document.getElementById('r-cenario-moderado-pct').value) || 10;

    if (critico > limiar) critico = limiar;

    window.r_exec_limiar = limiar;
    window.r_exec_critico = critico;
    window.r_mod_pct = modPct;

    // O select e os radios foram removidos da UI mas o select oculto permanece em PADRAO
    let sel = document.getElementById('cenario-opcao');
    if (sel) sel.value = 'PADRAO';

    // Recálculo automático com debounce: ~400ms após a última digitação,
    // reprocessa o cenário sozinho (PLOA gerado e Valores Deliberados são
    // preservados pelo próprio processarDados). Enquanto isso, exibe o aviso
    // clicável "Cenário desatualizado" no cabeçalho — que também serve de
    // gatilho manual caso o recálculo automático falhe.
    if (dadosBrutos.length === 0) return; // sem base importada, nada a reprocessar
    marcarCenarioDesatualizado(true);
    clearTimeout(timerRecalculoCenario);
    timerRecalculoCenario = setTimeout(() => {
        try { processarDados(); }
        catch (e) { console.error('Recálculo automático do cenário falhou:', e); }
    }, 400);
}
let timerRecalculoCenario = null;
// Exibe/oculta o botão-aviso "⚠️ Cenário desatualizado — reprocessar" do cabeçalho.
function marcarCenarioDesatualizado(ativo) {
    let el = document.getElementById('aviso-cenario-desatualizado');
    if (el) el.style.display = ativo ? 'inline-block' : 'none';
}
// Inicializa as variáveis globais com os defaults ao carregar a página
window.r_exec_limiar = 40;
window.r_exec_critico = 15;
window.r_mod_pct = 10;

// === GRÁFICOS DASHBOARD ===

const pieLabelPlugin={id:"pieLabelPlugin",afterDatasetsDraw(chart){const {ctx}=chart;const meta=chart.getDatasetMeta(0);const data=chart.data.datasets[0].data;const total=data.reduce((a,b)=>a+b,0);ctx.save();ctx.font="bold 13px Arial";ctx.fillStyle="#fff";ctx.textAlign="center";ctx.textBaseline="middle";meta.data.forEach((arc,i)=>{const v=data[i];if(!v)return;const pct=v/total*100;if(pct<3)return;const a=(arc.startAngle+arc.endAngle)/2;const r=(arc.innerRadius+arc.outerRadius)/2;const x=arc.x+Math.cos(a)*r;const y=arc.y+Math.sin(a)*r;ctx.fillText(pct.toFixed(1)+"%",x,y);});ctx.restore();}};
Chart.register(pieLabelPlugin);
let chartColOrgao = null;
let chartPieClasse = null;
let chartColOrgaoAj = null;
let chartPieClasseAj = null;
let chartComparativoEtapas = null;
let chartCascataDashboard = null;

const PALETTE_COLS = [
    '#4aa8ff','#00e676','#ffb300','#ff5b5b','#9b59b6','#1abc9c','#e67e22',
    '#3498db','#e74c3c','#2ecc71','#f39c12','#8e44ad','#16a085','#d35400','#27ae60'
];
const PALETTE_PIE = [
    '#4aa8ff','#00e676','#ffb300','#ff5b5b','#9b59b6','#1abc9c','#e67e22'
];
const PALETTE_PIE_AJ = [
    '#a29bfe','#fd79a8','#fdcb6e','#e17055','#74b9ff','#55efc4','#ffeaa7'
];

function getChartTheme() {
    let isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    return {
        gridColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
        textColor: isDark ? '#8fa0dd' : '#64748b',
        tooltipBg: isDark ? '#1f2336' : '#ffffff',
        tooltipText: isDark ? '#f1f3f9' : '#0f172a',
    };
}

function criarBarChart(ctxEl, labels, values, palette, tooltipLabel) {
    let t = getChartTheme();
    return new Chart(ctxEl, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: tooltipLabel,
                data: values,
                backgroundColor: palette.slice(0, values.length),
                borderRadius: 5,
                borderSkipped: false,
            }]
        },
        options: {
            indexAxis: 'x',
            responsive: true,
            maintainAspectRatio: false,
            devicePixelRatio: window.devicePixelRatio || 1,
            plugins: {
                pieLabelPlugin: {},
                legend: { display: false },
                tooltip: {
                    backgroundColor: t.tooltipBg,
                    titleColor: t.textColor,
                    bodyColor: t.tooltipText,
                    borderColor: 'rgba(74,168,255,0.3)',
                    borderWidth: 1,
                    callbacks: {
                        label: ctx => ' ' + ctx.parsed.y.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: t.textColor,
                        font: { size: 10 },
                        maxRotation: 35,
                        minRotation: 20,
                        callback: function(val, idx) {
                            let lbl = labels[idx] || '';
                            return lbl.length > 22 ? lbl.substring(0, 20) + '…' : lbl;
                        }
                    },
                    grid: { color: t.gridColor }
                },
                y: {
                    ticks: {
                        color: t.textColor,
                        font: { size: 10 },
                        callback: v => 'R$ ' + (v / 1e6).toFixed(1) + 'M'
                    },
                    grid: { color: t.gridColor }
                }
            }
        }
    });
}

function criarPieChart(ctxEl, labels, values, palette) {
    let t = getChartTheme();
    return new Chart(ctxEl, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: palette.slice(0, values.length),
                borderColor: 'transparent',
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            devicePixelRatio: window.devicePixelRatio || 1,
            cutout: '52%',
            plugins: {
                pieLabelPlugin: {},
                legend: {
                    position: 'bottom',
                    labels: {
                        color: t.textColor,
                        font: { size: 11 },
                        padding: 14,
                        boxWidth: 14,
                        boxHeight: 14
                    }
                },
                tooltip: {
                    backgroundColor: t.tooltipBg,
                    titleColor: t.textColor,
                    bodyColor: t.tooltipText,
                    borderColor: 'rgba(74,168,255,0.3)',
                    borderWidth: 1,
                    callbacks: {
                        label: ctx => {
                            let total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            let pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                            return ` ${ctx.parsed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ResizeObserver: re-renderiza gráficos quando o container muda de tamanho (inclusive por zoom)
let _chartResizeObserver = null;
function registrarChartResizeObserver() {
    if (_chartResizeObserver) _chartResizeObserver.disconnect();
    let chartsWrap = document.querySelector('.charts-row');
    if (!chartsWrap || !window.ResizeObserver) return;
    let debounce = null;
    _chartResizeObserver = new ResizeObserver(() => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            [chartColOrgao, chartPieClasse, chartColOrgaoAj, chartPieClasseAj].forEach(c => {
                if (c) {
                    c.options.devicePixelRatio = window.devicePixelRatio || 1;
                    c.resize();
                }
            });
        }, 120);
    });
    _chartResizeObserver.observe(chartsWrap);
}

function renderizarGraficos() {
    let filtrados = dadosProcessados.filter(d => checkFiltroMulti(d, 'dash'));

    // ── Dados originais ──────────────────────────────────────────────────────
    let orgMap = {}, clsMap = {};
    filtrados.forEach(d => {
        let ko = d.orgao || 'NÃO INFORMADO';
        orgMap[ko] = (orgMap[ko] || 0) + d.nec;
        let kc = d.classe || 'NÃO CLASSIFICADO';
        clsMap[kc] = (clsMap[kc] || 0) + d.nec;
    });
    let orgArr = Object.entries(orgMap).map(([k,v]) => ({label:k,value:v})).sort((a,b) => b.value-a.value).slice(0,15);
    let clsArr = Object.entries(clsMap).map(([k,v]) => ({label:k,value:v})).sort((a,b) => b.value-a.value);

    // ── Dados ajustados ──────────────────────────────────────────────────────
    let orgMapAj = {}, clsMapAj = {};
    let tNec = 0, tNecAj = 0;
    filtrados.forEach(d => {
        tNec += d.nec; tNecAj += d.necessidade2027Ajustada;
        let ko = d.orgao || 'NÃO INFORMADO';
        orgMapAj[ko] = (orgMapAj[ko] || 0) + d.necessidade2027Ajustada;
        let kc = d.classe || 'NÃO CLASSIFICADO';
        clsMapAj[kc] = (clsMapAj[kc] || 0) + d.necessidade2027Ajustada;
    });

    // Inclui excluídos manuais em tNec (mas não em tNecAj) para que
    // a exclusão de MAPP acione o bloco de gráficos do Cenário Ajustado.
    dadosExcluidos.forEach(d => {
        if (d.isExpurgado) return;
        if (!checkFiltroMulti(d, 'dash')) return;
        tNec += d.nec;
    });
    let orgArrAj = Object.entries(orgMapAj).map(([k,v]) => ({label:k,value:v})).sort((a,b) => b.value-a.value).slice(0,15);
    let clsArrAj = Object.entries(clsMapAj).map(([k,v]) => ({label:k,value:v})).sort((a,b) => b.value-a.value);
    let temNecAjustada = Math.abs(tNec - tNecAj) > 0.005;

    // ── Gráficos originais ───────────────────────────────────────────────────
    let ctxCol = document.getElementById('chart-col-orgao');
    if (ctxCol) {
        if (chartColOrgao) chartColOrgao.destroy();
        chartColOrgao = criarBarChart(ctxCol, orgArr.map(o=>o.label), orgArr.map(o=>o.value), PALETTE_COLS, 'Necessidade Real 2027');
    }

    let ctxPie = document.getElementById('chart-pie-classe');
    if (ctxPie) {
        if (chartPieClasse) chartPieClasse.destroy();
        chartPieClasse = criarPieChart(ctxPie, clsArr.map(c=>c.label), clsArr.map(c=>c.value), PALETTE_PIE);
    }

    // ── Bloco ajustado: exibe somente quando há diferença ───────────────────
    let wrapAj = document.getElementById('charts-ajustados-wrap');
    if (wrapAj) wrapAj.style.display = temNecAjustada ? 'block' : 'none';

    if (temNecAjustada) {
        let ctxColAj = document.getElementById('chart-col-orgao-aj');
        if (ctxColAj) {
            if (chartColOrgaoAj) chartColOrgaoAj.destroy();
            chartColOrgaoAj = criarBarChart(ctxColAj, orgArrAj.map(o=>o.label), orgArrAj.map(o=>o.value), PALETTE_COLS.map((_,i) => PALETTE_PIE_AJ[i % PALETTE_PIE_AJ.length]), 'Necessidade 2027 Ajustada');
        }

        let ctxPieAj = document.getElementById('chart-pie-classe-aj');
        if (ctxPieAj) {
            if (chartPieClasseAj) chartPieClasseAj.destroy();
            chartPieClasseAj = criarPieChart(ctxPieAj, clsArrAj.map(c=>c.label), clsArrAj.map(c=>c.value), PALETTE_PIE_AJ);
        }
    } else {
        if (chartColOrgaoAj) { chartColOrgaoAj.destroy(); chartColOrgaoAj = null; }
        if (chartPieClasseAj) { chartPieClasseAj.destroy(); chartPieClasseAj = null; }
    }

    registrarChartResizeObserver();
}

// Alterna entre as duas sub-abas do Dashboard: "Números" (cards e tabelas —
// o que já existia) e "Comparativos" (todos os gráficos, incluindo os que já
// existiam e os novos comparativos Original × Ajustado).
function mostrarDashSubtab(qual) {
    let numerosEl = document.getElementById('dash-sub-numeros');
    let comparativosEl = document.getElementById('dash-sub-comparativos');
    let btnNumeros = document.getElementById('btn-dash-numeros');
    let btnComparativos = document.getElementById('btn-dash-comparativos');
    if (!numerosEl || !comparativosEl) return;
    numerosEl.style.display = qual === 'numeros' ? 'block' : 'none';
    comparativosEl.style.display = qual === 'comparativos' ? 'block' : 'none';
    if (btnNumeros) btnNumeros.classList.toggle('active', qual === 'numeros');
    if (btnComparativos) btnComparativos.classList.toggle('active', qual === 'comparativos');
}

// Gráfico de barras pareadas Original × Ajustado, uma etapa do pipeline por
// vez — resume os 8 cards do Cenário Ajustado num único gráfico compacto,
// sem removê-los (eles continuam na sub-aba Números).
function renderizarComparativoEtapas() {
    let ctx = document.getElementById('chart-comparativo-etapas');
    if (!ctx) return;
    if (chartComparativoEtapas) chartComparativoEtapas.destroy();
    let t = totaisCenarioAtual;
    let labels = ['Previsão de Empenho 2026', 'TRF 2026', 'Necessidade Real 2027', 'PLOA 2027'];
    let original = [t.t_prev26 || 0, t.t_trf26 || 0, t.t_nec27 || 0, ploGerado ? (t.t_plo || 0) : 0];
    let ajustado = [
        t.houveAjuste ? (t.t_prev26aj || 0) : (t.t_prev26 || 0),
        t.houveAjuste ? (t.t_trf26aj || 0) : (t.t_trf26 || 0),
        t.houveAjuste ? (t.t_nec27aj || 0) : (t.t_nec27 || 0),
        ploGerado ? (t.t_ploAj || 0) : 0
    ];
    chartComparativoEtapas = criarBarChartAgrupado(ctx, labels, [
        { label: 'Original / Base', data: original, color: '#4aa8ff' },
        { label: 'Ajustado', data: ajustado, color: '#a29bfe' }
    ]);
}

// Cascata agregada do Dashboard: mesmo componente visual já usado na aba PLOA
// Detalhado (criarWaterfallTotal), só que com os totais gerais do cenário
// filtrado, não de um agrupamento específico.
function renderizarCascataDashboard() {
    let ctx = document.getElementById('chart-cascata-dashboard');
    if (!ctx) return;
    if (chartCascataDashboard) chartCascataDashboard.destroy();
    let t = totaisCenarioAtual;
    chartCascataDashboard = criarWaterfallTotal(ctx, t.t_nec27 || 0, t.t_nec27aj || 0, ploGerado ? (t.t_plo || 0) : (t.t_nec27aj || 0), ploGerado ? (t.t_ploAj || 0) : (t.t_nec27aj || 0));
}

// Termômetro/barra de ocupação do Teto — usa a Fonte selecionada no Painel de
// Monitoramento (o mesmo seletor, sem duplicar). Azul enquanto dentro do
// Teto, vermelho se estourar.
function atualizarGaugeTeto() {
    let labelEl = document.getElementById('gauge-teto-fonte-label');
    let barraEl = document.getElementById('gauge-teto-barra');
    let pctEl = document.getElementById('gauge-teto-pct');
    let necEl = document.getElementById('gauge-teto-nec');
    let valorEl = document.getElementById('gauge-teto-valor');
    let saldoEl = document.getElementById('gauge-teto-saldo');
    if (!barraEl) return;

    if (!monFonteSelecionada) {
        labelEl.textContent = 'selecione uma Fonte no Painel de Monitoramento';
        barraEl.style.width = '0%';
        pctEl.textContent = '';
        necEl.textContent = '—'; valorEl.textContent = '—'; saldoEl.textContent = '—';
        return;
    }

    let teto = tetosPorFonte[monFonteSelecionada] || 0;
    let normalFonte = N(monFonteSelecionada);
    let necAj = 0;
    dadosProcessados.forEach(d => { if (N(d.fonte) === normalFonte) necAj += d.necessidade2027Ajustada; });

    labelEl.textContent = monFonteSelecionada;
    necEl.textContent = F(necAj);

    if (teto <= 0) {
        valorEl.textContent = 'não definido';
        saldoEl.textContent = '—';
        barraEl.style.width = '0%';
        pctEl.textContent = '';
        return;
    }

    let pct = (necAj / teto) * 100;
    let pctBarra = Math.min(pct, 100);
    let saldo = teto - necAj;
    barraEl.style.width = pctBarra.toFixed(1) + '%';
    barraEl.style.background = pct > 100 ? 'var(--danger)' : 'var(--accent)';
    pctEl.textContent = pct.toFixed(1) + '%';
    valorEl.textContent = F(teto);
    saldoEl.textContent = F(saldo);
    saldoEl.style.color = saldo >= 0 ? 'var(--success)' : 'var(--danger)';
}

// Estado inicial da página: garante que o portal de entrada apareça e o
// conteúdo pós-carga / Painel de Monitoramento fiquem ocultos até haver dados.
atualizarEstadoGateImportacao();
aplicarEstadoEtapasImp();
inicializarPaineisSlider();
renderizarTabelaRedutor();
renderizarTabelaPLO();

// Painéis flutuantes "Ajustes Realizados" e "Premissas do Sistema": abertos por
// hover (mouseenter) nos botões do cabeçalho, com um pequeno atraso ao sair para
// permitir que o mouse "atravesse" até o painel sem fechá-lo no meio do caminho.
renderizarPainelPremissasSistema();

let _hoverPanelFecharTimeout = null;

// Posiciona e exibe o painel flutuante logo abaixo do botão que disparou o
// hover, mantendo-o dentro dos limites da janela.
function mostrarPainelHover(panelId, wrapId) {
    let panel = document.getElementById(panelId);
    let wrap = document.getElementById(wrapId);
    if (!panel || !wrap) return;
    document.querySelectorAll('.hover-info-panel-floating').forEach(p => { if (p.id !== panelId) p.style.display = 'none'; });
    panel.style.display = 'block';
    let rect = wrap.getBoundingClientRect();
    let larguraPainel = panel.offsetWidth;
    let alturaDisponivel = window.innerHeight - 16;
    let topo = Math.min(rect.bottom + 8, alturaDisponivel - panel.offsetHeight);
    let esquerda = Math.min(rect.left, window.innerWidth - larguraPainel - 16);
    panel.style.top = Math.max(8, topo) + 'px';
    panel.style.left = Math.max(8, esquerda) + 'px';
}

function agendarFecharPainelHover() {
    cancelarFecharPainelHover();
    _hoverPanelFecharTimeout = setTimeout(() => {
        document.querySelectorAll('.hover-info-panel-floating').forEach(p => p.style.display = 'none');
    }, 150);
}

function cancelarFecharPainelHover() {
    if (_hoverPanelFecharTimeout) { clearTimeout(_hoverPanelFecharTimeout); _hoverPanelFecharTimeout = null; }
}

