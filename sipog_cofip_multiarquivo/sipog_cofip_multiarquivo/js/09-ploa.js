// SIPOG COFIP — js/09-ploa.js
// Geração do PLOA 2027, necessidade ajustada, status e PLOA Detalhado (pivot, gráficos, export XLSX).
// Script clássico (escopo global). Ordem de carga definida em index.html — não reordenar.
// ─── PLOA 2027: geração dedicada (botão), independente de Processar Cenário ───
// Replica a Necessidade 2027 Ajustada e aplica o percentual do bloco "PLOA 2027 por
// Grupo de Projetos" (todos os 5 grupos, sem exceção). MAPPs travados (ajuste manual
// na Necessidade 2027 Ajustada) ficam de fora — o PLOA deles fica igual à Necessidade
// 2027 Ajustada. Gerar o PLOA 2027 não trava mais nenhum campo, botão ou ação do
// sistema — o usuário pode continuar editando qualquer campo, processar o cenário
// de novo, salvar ajustes, distribuir saldo e excluir MAPPs normalmente; o PLOA
// gerado permanece congelado até uma nova geração/aplicação em cascata, ou até o
// usuário clicar em "Zerar PLOA 2027" para zerá-lo explicitamente.
function gerarValoresPLO() {
    if (dadosProcessados.length === 0) return alert("Não há dados processados para gerar o PLOA 2027.");
    // Premissa do projeto: apenas a Fonte selecionada tem valores alterados.
    if (!monFonteSelecionada) return alert("Selecione uma Fonte no Painel de Monitoramento antes de gerar o PLOA 2027.");

    let ploFactor = {};
    GRUPOS_PLO.forEach(g => {
        let el = document.getElementById('plo-' + g.sufixo);
        ploFactor[g.classe] = el ? V(el.value) / 100 : 0;
    });

    let jaEstavaGerado = ploGerado;

    // A decisão "1ª geração x cascata" é tomada por MAPP (com base em já ter ou
    // não plo2027 gravado), não pelo flag global `ploGerado` — isso permite gerar
    // o PLOA 2027 de uma Fonte, depois trocar de Fonte e gerar de outra, sem que a
    // segunda Fonte "pule" a 1ª geração dela achando que já foi gerada (o flag
    // global só marca que o recurso já foi usado ao menos uma vez no cenário).
    // Premissa do projeto: apenas a Fonte selecionada tem valores alterados.
    dadosProcessados.forEach(d => {
        if (N(d.fonte) !== N(monFonteSelecionada)) return;
        let jaTinhaPlo = (d.plo2027 !== null && d.plo2027 !== undefined);
        if (!jaTinhaPlo) {
            // 1ª geração para este MAPP: o PLOA 2027 (base) nasce da Necessidade 2027
            // Ajustada atual e fica congelado a partir daqui. O PLOA 2027 Ajustado
            // nasce como réplica dele.
            if (d.foiAjustado) {
                d.plo2027 = d.necessidade2027Ajustada;
            } else {
                let f = ploFactor[d.classe] || 0;
                d.plo2027 = f > 0 ? d.necessidade2027Ajustada * (1 - f) : d.necessidade2027Ajustada;
            }
            d.plo2027Ajustado = d.plo2027;
        } else {
            // Reaplicações seguintes (cascata): o PLOA 2027 base NÃO muda mais — o
            // novo percentual incide sobre o valor atual do PLOA 2027 Ajustado, de
            // forma composta (cada aplicação reduz o que já havia sido reduzido
            // antes).
            if (d.foiAjustado) return; // travados nunca sofrem o percentual
            let f = ploFactor[d.classe] || 0;
            let baseAtual = (d.plo2027Ajustado !== null && d.plo2027Ajustado !== undefined) ? d.plo2027Ajustado : d.plo2027;
            d.plo2027Ajustado = f > 0 ? baseAtual * (1 - f) : baseAtual;
        }
    });

    ploGerado = true;
    ploDataGeracao = new Date();

    // Zera os campos de % e Valor Máximo (R$) do Redutor do PLOA por Grupo assim
    // que o ajuste é aplicado. Sem isso, a tabela reaproveitava o percentual
    // digitado para calcular uma NOVA prévia em cima do PLOA Ajustado que
    // ACABOU de ser reduzido por esse mesmo percentual — compondo a redução
    // silenciosamente a cada re-renderização e divergindo do valor realmente
    // salvo (visível na faixa de indicadores do topo com o selo "prévia").
    GRUPOS_PLO.forEach(g => {
        let elPct = document.getElementById('plo-' + g.sufixo);
        let elValor = document.getElementById('plovalor-' + g.sufixo);
        if (elPct) elPct.value = '0';
        if (elValor) { elValor.value = ''; elValor.dataset.valorNumerico = '0'; }
    });

    atualizarStatusPLO();
    recalculoGeralInjetado();
    atualizarResumoPLO();
    showView('v-plodet');
    if (!jaEstavaGerado) {
        alert("PLOA 2027 gerado com sucesso! Nada no sistema fica bloqueado — você pode continuar editando qualquer campo, processar o cenário novamente, salvar ajustes, distribuir saldo e excluir MAPPs normalmente. O PLOA 2027 gerado permanece congelado; para ajustar de novo, mude o percentual do Redutor do PLOA por Grupo e clique em 'Aplicar Novo Ajuste ao PLOA 2027' quantas vezes precisar — cada aplicação incide de forma acumulada sobre o PLOA 2027 Ajustado.");
    } else {
        alert("Novo ajuste aplicado ao PLOA 2027 Ajustado. O PLOA 2027 original permanece congelado; a redução incidiu sobre o valor mais recente do PLOA 2027 Ajustado.");
    }
}

// Reverte o PLOA 2027 para o estado "não gerado" (null em todos os MAPPs), para o
// usuário recomeçar a geração do zero. Como nada mais fica travado pelo PLOA, isto
// é apenas uma ação opcional de reset — não é necessária para editar nenhum outro
// campo do sistema.
function editarNecessidadeAjustada() {
    if (!ploGerado) return;
    if (!confirm("Isso vai zerar os valores de PLOA 2027 já gerados. Será necessário clicar em 'Gerar Valores de PLOA 2027' novamente para regerá-los. Deseja continuar?")) return;

    dadosProcessados.forEach(d => { d.plo2027 = null; d.plo2027Ajustado = null; });
    ploGerado = false;
    ploDataGeracao = null;
    atualizarStatusPLO();
    recalculoGeralInjetado();
    atualizarResumoPLO();
}

// Premissa vigente: gerar o PLOA 2027 NÃO trava mais nenhum campo, botão ou ação
// do sistema. Qualquer alteração de campo/percentual ou exclusão de MAPP continua
// disparando recálculo geral normalmente, mesmo depois do PLOA já ter sido gerado.
// Esta função é puramente informativa — só atualiza o texto do botão "Gerar
// Valores de PLOA 2027" / "Aplicar Novo Ajuste ao PLOA 2027" (a geração vira
// cascata a partir da 2ª aplicação), a visibilidade do botão "Zerar PLOA 2027"
// (zera o PLOA já gerado para recomeçar do zero) e o status exibido.
function atualizarStatusPLO() {
    let btnGerar = document.getElementById('btn-gerar-plo');
    let btnEditar = document.getElementById('btn-editar-necessidade');
    let status = document.getElementById('plo-status-geracao');
    if (btnGerar) btnGerar.textContent = ploGerado ? '➕ Aplicar Novo Ajuste ao PLOA 2027' : '🔒 Gerar Valores de PLOA 2027';
    if (btnEditar) btnEditar.style.display = ploGerado ? 'inline-block' : 'none';
    if (status) {
        status.textContent = ploGerado
            ? `✅ PLOA 2027 gerado em ${ploDataGeracao.toLocaleString('pt-BR')}. O Redutor do PLOA por Grupo continua liberado e cada nova aplicação incide sobre o PLOA 2027 Ajustado (cascata). Nenhum outro campo ou ação do sistema fica bloqueado.`
            : '⚪ PLOA 2027 ainda não foi gerado nesta sessão.';
    }
}

// ─── PLOA DETALHADO: pivot dinâmico + gráficos + export XLSX ─────────────────
function renderizarPLODetalhado() {
    let vazioEl = document.getElementById('plodet-vazio');
    let conteudoEl = document.getElementById('plodet-conteudo');
    if (!vazioEl || !conteudoEl) return; // view ainda não está no DOM

    if (!ploGerado) {
        vazioEl.style.display = 'block';
        conteudoEl.style.display = 'none';
        return;
    }
    vazioEl.style.display = 'none';
    conteudoEl.style.display = 'block';

    let filtrados = basePLODetalhado().filter(checkFiltroPLODetalhado);

    let agrupadorEl = document.getElementById('plodet-agrupador');
    let agrupador = agrupadorEl ? agrupadorEl.value : 'classe';
    let dim = PLODET_DIMENSOES[agrupador] || PLODET_DIMENSOES.classe;

    let grupos = {};
    filtrados.forEach(d => {
        let chave = (d[dim.campo] || 'NÃO INFORMADO').toString().trim() || 'NÃO INFORMADO';
        if (!grupos[chave]) grupos[chave] = { chave: chave, qtd: 0, calc: 0, ajustada: 0, plo: 0, ploAj: 0 };
        grupos[chave].qtd++;
        grupos[chave].calc += (d.nec || 0);
        grupos[chave].ajustada += (d.necessidade2027Ajustada || 0);
        grupos[chave].plo += (d.plo2027 || 0);
        grupos[chave].ploAj += (d.plo2027Ajustado || 0);
    });

    // Calcula o % de redução ANTES de ordenar, para que a coluna também possa
    // ser usada como critério de ordenação (senão o valor só existiria depois).
    Object.values(grupos).forEach(l => {
        l.pctRed = l.calc > 0 ? ((l.calc - l.ploAj) / l.calc * 100) : 0;
    });

    let linhas = ordenarDados(Object.values(grupos), ordenacaoAtiva.plodetPivot);

    let tCalc = 0, tAj = 0, tPlo = 0, tPloAj = 0, tQtd = 0;
    linhas.forEach(l => { tCalc += l.calc; tAj += l.ajustada; tPlo += l.plo; tPloAj += l.ploAj; tQtd += l.qtd; });

    // Coluna "PLOA 2027" (base congelada na 1ª geração) removida da exibição —
    // só é redundante com "PLOA Ajustado" quando não há cascata (reaplicação do
    // Redutor do PLOA mais de uma vez); o valor de l.plo/tPlo continua calculado
    // e alimentando os gráficos desta aba normalmente. Nenhum cálculo desta
    // tabela dependia dele (% Redução usa ploAj, não plo).
    let h = `<table><thead><tr>
        <th onclick="alternarOrdenacao('plodetPivot','chave')">${dim.label}</th>
        <th onclick="alternarOrdenacao('plodetPivot','qtd')">MAPPs</th>
        <th onclick="alternarOrdenacao('plodetPivot','calc')" title="Necessidade Real 2027">Nec. Real</th>
        <th onclick="alternarOrdenacao('plodetPivot','ajustada')" title="Necessidade 2027 Ajustada">Nec. Ajustada</th>
        <th onclick="alternarOrdenacao('plodetPivot','ploAj')" title="PLOA 2027 Ajustado: valor mais recente, já considerando eventuais reaplicações em cascata do Redutor do PLOA.">PLOA 2027</th>
        <th onclick="alternarOrdenacao('plodetPivot','pctRed')" title="% de redução total do PLOA Ajustado em relação à Necessidade Real 2027.">% Redução</th>
    </tr></thead><tbody>`;

    if (linhas.length === 0) {
        h += `<tr><td colspan="6" style="text-align:center;color:var(--muted)">Nenhum registro para os filtros selecionados.</td></tr>`;
    }

    linhas.forEach(l => {
        let chaveExibida = (agrupador === 'classe') ? badgeClasse(l.chave) : `<strong>${l.chave}</strong>`;
        h += `<tr>
            <td>${chaveExibida}</td>
            <td>${l.qtd}</td>
            <td>${Ftd(l.calc)}</td>
            <td>${Ftd(l.ajustada)}</td>
            <td style="font-weight:700">${Ftd(l.ploAj)}</td>
            <td>${l.pctRed.toFixed(1)}%</td>
        </tr>`;
    });

    let pctRedTotal = tCalc > 0 ? ((tCalc - tPloAj) / tCalc * 100) : 0;
    h += `</tbody><tfoot><tr>
        <td>TOTAL FILTRADO</td><td>${tQtd}</td>
        <td>${Ftd(tCalc)}</td><td>${Ftd(tAj)}</td><td style="font-weight:700">${Ftd(tPloAj)}</td>
        <td>${pctRedTotal.toFixed(1)}%</td>
    </tr></tfoot></table>`;

    document.getElementById('tab-plodet-pivot').innerHTML = h;
    renderizarGraficosPLODetalhado(linhas, { tCalc: tCalc, tAj: tAj, tPlo: tPlo, tPloAj: tPloAj });
    renderizarPLODetalheMapp(1);
}

// Detalhe MAPP a MAPP do comparativo PLOA — usa os mesmos filtros e o mesmo
// universo (ativos + excluídos) do pivô acima, com paginação no mesmo padrão
// da grade de Gestão.
function renderizarPLODetalheMapp(pagina) {
    let container = document.getElementById('tab-plodet-mapp');
    let pagWrap = document.getElementById('pag-plodet-mapp');
    if (!container || !pagWrap) return;

    if (!ploGerado) { container.innerHTML = ''; pagWrap.innerHTML = ''; return; }

    let filtrados = basePLODetalhado().filter(checkFiltroPLODetalhado);
    // Calcula o % de redução ANTES de ordenar, para que a coluna também possa
    // ser usada como critério de ordenação.
    filtrados.forEach(d => {
        d.pctRed = (d.nec || 0) > 0 ? (((d.nec || 0) - (d.plo2027Ajustado || 0)) / (d.nec || 0) * 100) : 0;
    });
    let filtradosOrdenados = ordenarDados(filtrados, ordenacaoAtiva.plodetDetalhe);
    let totalPaginas = Math.ceil(filtradosOrdenados.length / itensPorPagina) || 1;
    if (pagina > totalPaginas) pagina = totalPaginas;

    let subSet = filtradosOrdenados.slice((pagina - 1) * itensPorPagina, pagina * itensPorPagina);

    // Coluna "PLOA 2027" (base congelada na 1ª geração) removida da exibição —
    // ver mesmo comentário na tabela pivô acima. d.plo2027 continua calculado e
    // preservado normalmente, só não aparece mais nesta tabela.
    let h = `<table><thead><tr>
        <th onclick="alternarOrdenacao('plodetDetalhe','mapp')">MAPP</th>
        <th onclick="alternarOrdenacao('plodetDetalhe','orgao')">Órgão</th>
        <th onclick="alternarOrdenacao('plodetDetalhe','classe')">Grupo</th>
        <th onclick="alternarOrdenacao('plodetDetalhe','excluido')">Excluído</th>
        <th onclick="alternarOrdenacao('plodetDetalhe','nec')" title="Necessidade Real 2027">Nec. Real</th>
        <th onclick="alternarOrdenacao('plodetDetalhe','necessidade2027Ajustada')" title="Necessidade 2027 Ajustada">Nec. Ajustada</th>
        <th onclick="alternarOrdenacao('plodetDetalhe','plo2027Ajustado')" title="PLOA 2027 Ajustado: valor mais recente, já considerando eventuais reaplicações em cascata do Redutor do PLOA.">PLOA 2027</th>
        <th onclick="alternarOrdenacao('plodetDetalhe','pctRed')" title="% de redução total do PLOA Ajustado em relação à Necessidade Real 2027.">% Redução</th>
    </tr></thead><tbody>`;

    if (subSet.length === 0) {
        h += `<tr><td colspan="8" style="text-align:center;color:var(--muted)">Nenhum registro para os filtros selecionados.</td></tr>`;
    }

    subSet.forEach(d => {
        let travado = !!d.foiAjustado;
        let nomeMapp = travado ? `🔒 ${d.mapp}` : d.mapp;
        h += `<tr${travado ? ' style="background:rgba(230,126,34,0.06);"' : ''}${d.excluido ? ' style="opacity:0.6;"' : ''}>
            <td><strong title="${travado ? 'MAPP travado: ajustado manualmente. Fica de fora de ajustes em massa e do PLOA.' : ''}">${nomeMapp}</strong></td>
            <td><span style="font-size:12px;">${d.orgao || 'NÃO INFORMADO'}</span></td>
            <td>${badgeClasse(d.classe)}</td>
            <td>${d.excluido ? 'SIM' : 'NÃO'}</td>
            <td>${Ftd(d.nec)}</td>
            <td>${Ftd(d.necessidade2027Ajustada)}</td>
            <td style="font-weight:700">${Ftd(d.plo2027Ajustado)}</td>
            <td>${d.pctRed.toFixed(1)}%</td>
        </tr>`;
    });

    h += `</tbody></table>`;
    container.innerHTML = h;

    let pagHtml = totalPaginas > 1 ? `<button class="page-btn" ${pagina===1?'disabled':''} onclick="renderizarPLODetalheMapp(${pagina-1})">Anterior</button>
                   <span>Página ${pagina} de ${totalPaginas} (${filtradosOrdenados.length} MAPPs)</span>
                   <button class="page-btn" ${pagina===totalPaginas?'disabled':''} onclick="renderizarPLODetalheMapp(${pagina+1})">Próxima</button>` : `<span>${filtradosOrdenados.length} MAPPs</span>`;
    pagWrap.innerHTML = pagHtml;
}

let chartPlodetBarras = null, chartPlodetCascata = null, chartPlodetRanking = null;

function criarBarChartAgrupado(ctxEl, labels, datasets) {
    let t = getChartTheme();
    return new Chart(ctxEl, {
        type: 'bar',
        data: { labels: labels, datasets: datasets.map(ds => ({ label: ds.label, data: ds.data, backgroundColor: ds.color, borderRadius: 4, borderSkipped: false })) },
        options: {
            responsive: true, maintainAspectRatio: false, devicePixelRatio: window.devicePixelRatio || 1,
            plugins: {
                legend: { display: true, position: 'top', labels: { color: t.textColor, font: { size: 11 } } },
                tooltip: {
                    backgroundColor: t.tooltipBg, titleColor: t.textColor, bodyColor: t.tooltipText,
                    borderColor: 'rgba(74,168,255,0.3)', borderWidth: 1,
                    callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
                }
            },
            scales: {
                x: { ticks: { color: t.textColor, font: { size: 10 }, maxRotation: 35, minRotation: 20, callback: function (val, idx) { let l = labels[idx] || ''; return l.length > 18 ? l.substring(0, 16) + '…' : l; } }, grid: { color: t.gridColor } },
                y: { ticks: { color: t.textColor, font: { size: 10 }, callback: v => 'R$ ' + (v / 1e6).toFixed(1) + 'M' }, grid: { color: t.gridColor } }
            }
        }
    });
}

function criarWaterfallTotal(ctxEl, tCalc, tAj, tPlo, tPloAj) {
    let t = getChartTheme();
    let labels = ['Necessidade Real 2027', 'Redutores (Estágio/Transf./Ajustes)', 'Necessidade Ajustada', 'Redutor PLOA', 'PLOA 2027', 'Ajustes em Cascata', 'PLOA 2027 Ajustado'];
    let dados = [tCalc, [Math.min(tAj, tCalc), Math.max(tAj, tCalc)], tAj, [Math.min(tPlo, tAj), Math.max(tPlo, tAj)], tPlo, [Math.min(tPloAj, tPlo), Math.max(tPloAj, tPlo)], tPloAj];
    let cores = ['#4aa8ff', (tAj <= tCalc ? '#ff5b5b' : '#00e676'), '#a29bfe', (tPlo <= tAj ? '#ff5b5b' : '#00e676'), '#00e676', (tPloAj <= tPlo ? '#ff5b5b' : '#00e676'), '#1abc9c'];
    return new Chart(ctxEl, {
        type: 'bar',
        data: { labels: labels, datasets: [{ data: dados, backgroundColor: cores, borderRadius: 4, borderSkipped: false }] },
        options: {
            responsive: true, maintainAspectRatio: false, devicePixelRatio: window.devicePixelRatio || 1,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: t.tooltipBg, titleColor: t.textColor, bodyColor: t.tooltipText, borderColor: 'rgba(74,168,255,0.3)', borderWidth: 1,
                    callbacks: { label: ctx => { let v = ctx.raw; let val = Array.isArray(v) ? (v[1] - v[0]) : v; return ' ' + val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } }
                }
            },
            scales: {
                x: { ticks: { color: t.textColor, font: { size: 9 }, maxRotation: 35, minRotation: 15 }, grid: { color: t.gridColor } },
                y: { ticks: { color: t.textColor, font: { size: 10 }, callback: v => 'R$ ' + (v / 1e6).toFixed(1) + 'M' }, grid: { color: t.gridColor } }
            }
        }
    });
}

function criarBarChartRankingPct(ctxEl, labels, pcts, valoresCalc) {
    let t = getChartTheme();
    return new Chart(ctxEl, {
        type: 'bar',
        data: { labels: labels, datasets: [{ data: pcts, backgroundColor: '#e67e22', borderRadius: 4, borderSkipped: false }] },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false, devicePixelRatio: window.devicePixelRatio || 1,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: t.tooltipBg, titleColor: t.textColor, bodyColor: t.tooltipText, borderColor: 'rgba(74,168,255,0.3)', borderWidth: 1,
                    callbacks: {
                        label: ctx => ' Redução: ' + ctx.parsed.x.toFixed(1) + '%',
                        afterLabel: ctx => {
                            let calc = valoresCalc ? valoresCalc[ctx.dataIndex] : null;
                            if (calc === null || calc === undefined) return '';
                            let txt = ' Necessidade Real 2027: ' + calc.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                            if (calc > 0 && calc < 100000) txt += '  ⚠️ base pequena — % pode não ser representativo';
                            return txt;
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { color: t.textColor, font: { size: 10 }, callback: v => v + '%' }, grid: { color: t.gridColor } },
                y: { ticks: { color: t.textColor, font: { size: 10 }, callback: function (val, idx) { let l = labels[idx] || ''; return l.length > 20 ? l.substring(0, 18) + '…' : l; } }, grid: { color: t.gridColor } }
            }
        }
    });
}

function renderizarGraficosPLODetalhado(linhas, totais) {
    if (chartPlodetBarras) chartPlodetBarras.destroy();
    if (chartPlodetCascata) chartPlodetCascata.destroy();
    if (chartPlodetRanking) chartPlodetRanking.destroy();

    let canvasBarras = document.getElementById('chart-plodet-barras');
    let canvasCascata = document.getElementById('chart-plodet-cascata');
    let canvasRanking = document.getElementById('chart-plodet-ranking');
    if (!canvasBarras || !canvasCascata || !canvasRanking) return;

    let labels = linhas.map(l => l.chave);
    chartPlodetBarras = criarBarChartAgrupado(canvasBarras, labels, [
        { label: 'Necessidade Real 2027', data: linhas.map(l => l.calc), color: '#4aa8ff' },
        { label: 'Necessidade Ajustada', data: linhas.map(l => l.ajustada), color: '#a29bfe' },
        { label: 'PLOA 2027', data: linhas.map(l => l.plo), color: '#00e676' },
        { label: 'PLOA 2027 Ajustado', data: linhas.map(l => l.ploAj), color: '#1abc9c' }
    ]);

    chartPlodetCascata = criarWaterfallTotal(canvasCascata, totais.tCalc, totais.tAj, totais.tPlo, totais.tPloAj);

    let ranking = linhas.map(l => ({ chave: l.chave, pct: l.calc > 0 ? ((l.calc - l.ploAj) / l.calc * 100) : 0, calc: l.calc })).sort((a, b) => b.pct - a.pct);
    chartPlodetRanking = criarBarChartRankingPct(canvasRanking, ranking.map(r => r.chave), ranking.map(r => r.pct), ranking.map(r => r.calc));
}

async function exportarPLODetalhadoXLSX() {
    if (!ploGerado) return alert("Gere o PLOA 2027 antes de exportar este comparativo.");
    if (typeof ExcelJS === 'undefined') return alert("A biblioteca de exportação formatada (ExcelJS) não carregou — verifique sua conexão e tente novamente.");

    let filtrados = basePLODetalhado().filter(checkFiltroPLODetalhado);
    if (filtrados.length === 0) return alert("Não há registros para os filtros selecionados.");

    let agrupadorEl = document.getElementById('plodet-agrupador');
    let agrupador = agrupadorEl ? agrupadorEl.value : 'classe';
    let dim = PLODET_DIMENSOES[agrupador] || PLODET_DIMENSOES.classe;

    // Aba 1: pivot agrupado (mesma lógica da tela)
    let grupos = {};
    filtrados.forEach(d => {
        let chave = (d[dim.campo] || 'NÃO INFORMADO').toString().trim() || 'NÃO INFORMADO';
        if (!grupos[chave]) grupos[chave] = { chave: chave, qtd: 0, qtdExcluidos: 0, calc: 0, ajustada: 0, plo: 0, ploAj: 0 };
        grupos[chave].qtd++;
        if (d.excluido) grupos[chave].qtdExcluidos++;
        grupos[chave].calc += (d.nec || 0);
        grupos[chave].ajustada += (d.necessidade2027Ajustada || 0);
        grupos[chave].plo += (d.plo2027 || 0);
        grupos[chave].ploAj += (d.plo2027Ajustado || 0);
    });
    let linhasPivot = Object.values(grupos).map(l => ({
        [dim.label]: l.chave,
        'QTD MAPPS': l.qtd,
        'QTD EXCLUÍDOS': l.qtdExcluidos,
        'NECESSIDADE 2027 CALCULADA': Number(l.calc.toFixed(2)),
        'NECESSIDADE 2027 AJUSTADA': Number(l.ajustada.toFixed(2)),
        'PLOA 2027': Number(l.plo.toFixed(2)),
        'PLOA 2027 AJUSTADO': Number(l.ploAj.toFixed(2)),
        'DELTA AJUSTADA - CALCULADA': Number((l.ajustada - l.calc).toFixed(2)),
        'DELTA PLOA - AJUSTADA': Number((l.plo - l.ajustada).toFixed(2)),
        'DELTA PLOA AJUSTADO - PLOA': Number((l.ploAj - l.plo).toFixed(2)),
        '% REDUCAO TOTAL (PLOA AJUSTADO VS CALCULADA)': l.calc > 0 ? Number((((l.calc - l.ploAj) / l.calc) * 100).toFixed(2)) : 0
    }));

    // Aba 2: detalhe MAPP a MAPP (respeita os filtros ativos, sem agrupar)
    let linhasDetalhe = filtrados.map(d => ({
        'MAPP': d.mapp || 'SEM MAPP',
        'SECRETARIA': d.secretaria || 'NÃO INFORMADO',
        'ÓRGÃO': d.orgao || 'NÃO INFORMADO',
        'FONTE': d.fonte || 'NÃO INFORMADA',
        'GRUPO DE PROJETOS': labelClasse(d.classe) || 'NÃO INFORMADO',
        'ESTÁGIO DE EXECUÇÃO': d.estagio || 'NÃO INFORMADO',
        'EXCLUÍDO': d.excluido ? 'SIM' : 'NÃO',
        'MOTIVO EXCLUSÃO': d.excluido ? (d.regra || '—') : '—',
        'NECESSIDADE 2027 CALCULADA': Number((d.nec || 0).toFixed(2)),
        'NECESSIDADE 2027 AJUSTADA': Number((d.necessidade2027Ajustada || 0).toFixed(2)),
        'PLOA 2027': Number((d.plo2027 || 0).toFixed(2)),
        'PLOA 2027 AJUSTADO': Number((d.plo2027Ajustado || 0).toFixed(2)),
        'DELTA AJUSTADA - CALCULADA': Number(((d.necessidade2027Ajustada || 0) - (d.nec || 0)).toFixed(2)),
        'DELTA PLOA - AJUSTADA': Number(((d.plo2027 || 0) - (d.necessidade2027Ajustada || 0)).toFixed(2)),
        'DELTA PLOA AJUSTADO - PLOA': Number(((d.plo2027Ajustado || 0) - (d.plo2027 || 0)).toFixed(2)),
        '% REDUCAO TOTAL (PLOA AJUSTADO VS CALCULADA)': (d.nec || 0) > 0 ? Number(((((d.nec || 0) - (d.plo2027Ajustado || 0)) / (d.nec || 0)) * 100).toFixed(2)) : 0
    }));

    let wb = new ExcelJS.Workbook();
    wb.creator = 'SIPOG COFIP';
    wb.created = new Date();
    adicionarAbaDeJSONFormatada(wb, `PIVOT_${agrupador.toUpperCase()}`, linhasPivot);
    adicionarAbaDeJSONFormatada(wb, 'DETALHE_MAPP_A_MAPP', linhasDetalhe);

    let ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    await baixarWorkbookExcelJS(wb, `SIPOG_PLO_DETALHADO_${ts}.xlsx`);
}

