// SIPOG COFIP — js/07-redutor-paradigma.js
// Tabelas do Redutor e do PLOA (valor paradigma, percentuais) e painéis de sliders com prévia.
// Script clássico (escopo global). Ordem de carga definida em index.html — não reordenar.
// Calcula, para cada grupo de projetos do Redutor de Transferência, o total de
// MAPPs classificados e a soma da TRF 2026 original (antes da redução) — dá a
// noção de grandeza sobre o que o percentual de cada grupo realmente afeta.
// Metadados fixos dos 7 grupos do Redutor de Transferência (rótulo, nota dos
// grupos com Empenho Previsto fixo, e a chave de classificação correspondente).
const GRUPOS_REDUTOR = [
    { sufixo: 'contrato-gestao',     label: 'CONTRATO GESTÃO',    classe: 'CONTRATO_GESTAO' },
    { sufixo: 'continuidade',        label: 'CONTINUIDADE',       classe: 'CONTINUIDADE' },
    { sufixo: 'pcf-convenio',        label: 'PCF CONVÊNIO',       classe: 'PCF_CONVENIO' },
    { sufixo: 'operacao-credito',    label: 'OPERAÇÃO CRÉDITO',   classe: 'OPERACAO_CREDITO' },
    { sufixo: 'investimento',        label: 'DEMAIS PROJETOS',    classe: 'INVESTIMENTO' }
];

// PLOA 2027: os 5 grupos têm efeito real (nenhum é imune, diferente do Valor Deliberado acima).
const GRUPOS_PLO = [
    { sufixo: 'contrato-gestao',     label: 'CONTRATO GESTÃO',    classe: 'CONTRATO_GESTAO' },
    { sufixo: 'continuidade',        label: 'CONTINUIDADE',       classe: 'CONTINUIDADE' },
    { sufixo: 'pcf-convenio',        label: 'PCF CONVÊNIO',       classe: 'PCF_CONVENIO' },
    { sufixo: 'operacao-credito',    label: 'OPERAÇÃO CRÉDITO',   classe: 'OPERACAO_CREDITO' },
    { sufixo: 'investimento',        label: 'DEMAIS PROJETOS',    classe: 'INVESTIMENTO' }
];

// Renderiza a tabela do Valor Deliberado Máximo do Empenho 2026: calcula MAPPs,
// Programado 2026, Previsão de Empenho (calculada e ajustada) por grupo, e os
// campos de Valor Deliberado / Percentual (sincronizados nos dois sentidos).
function renderizarTabelaRedutor() {
    let tbody = document.getElementById('redutor-tbody');
    if (!tbody) return;

    // Preserva os percentuais atuais: o que está no input, ou o último aplicado
    // via botão "Aplicar" (prevEmpAjustesPreservados), ou 0 por padrão.
    let percentuaisAtuais = {};
    GRUPOS_REDUTOR.forEach(g => {
        let el = document.getElementById('pc-' + g.sufixo);
        let pctPreservado = obterPctPreservado(monFonteSelecionada, g.classe);
        percentuaisAtuais[g.sufixo] = el ? el.value : (pctPreservado !== undefined ? pctPreservado : 0);
    });

    let baseFiltrada = dadosProcessados.filter(d => checkFiltroMulti(d, 'dash'));
    let linhas = GRUPOS_REDUTOR.map(g => {
        let doGrupo = baseFiltrada.filter(d => d.classe === g.classe);
        let travados = doGrupo.filter(d => d.foiAjustado);
        let p26Total = doGrupo.reduce((s, d) => s + d.p26, 0);
        let prevTotal = doGrupo.reduce((s, d) => s + d.prevEmp, 0);
        let prevAjTotal = doGrupo.reduce((s, d) => s + d.prevEmpAjustada, 0);
        let necAjTotal = doGrupo.reduce((s, d) => s + d.necessidade2027Ajustada, 0);
        return { ...g, qtd: doGrupo.length, qtdTravados: travados.length, p26Total, prevTotal, prevAjTotal, necAjTotal };
    });

    linhas.sort((a, b) => b.p26Total - a.p26Total);

    let h = '';
    let temDados = dadosProcessados.length > 0;

    let totQtd = 0, totQtdTravados = 0, totP26 = 0, totPrev = 0, totPrevAj = 0, totNecAj = 0, totValor = 0;

    linhas.forEach(l => {
        let notaTravados = l.qtdTravados > 0 ? ` <span style="font-size:10px; color:var(--warning);">(${l.qtdTravados} travado${l.qtdTravados > 1 ? 's' : ''})</span>` : '';
        let pctAtual = percentuaisAtuais[l.sufixo];
        // Base do Valor Deliberado/Percentual = Necessidade Ajustada do grupo
        // (antes era Programado 2026) — pedido explícito para alinhar com a
        // mesma mecânica já usada no bloco PLOA 2027 (base = Nec. Ajustada).
        let valorAtual = l.necAjTotal > 0 ? l.necAjTotal * (V(pctAtual) / 100) : 0;

        totQtd += l.qtd;
        totQtdTravados += l.qtdTravados;
        totP26 += l.p26Total;
        totPrev += l.prevTotal;
        totPrevAj += l.prevAjTotal;
        totNecAj += l.necAjTotal;
        totValor += valorAtual;

        h += `<tr>
            <td>${labelClasse(l.classe)}${notaTravados}</td>
            <td style="font-size:11px;" id="redutor-qtd-${l.sufixo}">${temDados ? (l.qtd > 0 ? `<strong>${l.qtd}</strong>` : '—') : '—'}</td>
            <td style="font-size:11px;" id="redutor-p26-${l.sufixo}" data-valor="${l.p26Total}">${temDados && l.qtd > 0 ? F(l.p26Total) : '—'}</td>
            <td style="font-size:11px;" id="redutor-prev-${l.sufixo}">${temDados && l.qtd > 0 ? F(l.prevTotal) : '—'}</td>
            <td style="font-size:11px;" id="redutor-prevaj-${l.sufixo}">${temDados && l.qtd > 0 ? F(l.prevAjTotal) : '—'}</td>
            <td style="font-size:11px;" id="redutor-necaj-${l.sufixo}" data-valor="${l.necAjTotal}">${temDados && l.qtd > 0 ? F(l.necAjTotal) : '—'}</td>
            <td><input type="text" inputmode="numeric" id="valorparadigma-${l.sufixo}" class="input-table" style="width:130px;" value="${formatarMascaraNumerica(valorAtual)}" data-valor-numerico="${valorAtual}" oninput="aplicarMascaraNumerica(this); marcarQuebrado('redutor','${l.sufixo}'); atualizarPorValorParadigma('${l.sufixo}'); sincronizarSliderComCampo('redutor','${l.sufixo}'); atualizarPreviaSliders();"></td>
            <td><input type="number" id="pc-${l.sufixo}" class="input-table" value="${pctAtual}" oninput="marcarQuebrado('redutor','${l.sufixo}'); atualizarPorPercentualRedutor('${l.sufixo}'); sincronizarSliderComCampo('redutor','${l.sufixo}'); atualizarPreviaSliders();">%</td>
            <td><button class="btn-mini-export" id="btn-aplicar-${l.sufixo}" onclick="aplicarValorParadigma('${l.sufixo}')" title="Grava este percentual na Previsão de Empenho 2026 de todos os MAPPs não travados deste grupo.">✅ Aplicar</button></td>
        </tr>`;
    });

    tbody.innerHTML = h;

    let notaTotalTravados = totQtdTravados > 0 ? ` <span style="font-size:10px; color:var(--warning);">(${totQtdTravados} travado${totQtdTravados > 1 ? 's' : ''})</span>` : '';
    let pctTotal = totNecAj > 0 ? (totValor / totNecAj * 100) : 0;
    let tfoot = document.getElementById('redutor-tfoot');
    if (tfoot) {
        tfoot.innerHTML = `<tr style="font-weight:700; border-top:2px solid var(--border);">
            <td>TOTAL</td>
            <td style="font-size:11px;">${temDados ? `<strong>${totQtd}</strong>${notaTotalTravados}` : '—'}</td>
            <td style="font-size:11px;">${temDados ? F(totP26) : '—'}</td>
            <td style="font-size:11px;">${temDados ? F(totPrev) : '—'}</td>
            <td style="font-size:11px;">${temDados ? F(totPrevAj) : '—'}</td>
            <td style="font-size:11px;">${temDados ? F(totNecAj) : '—'}</td>
            <td style="font-size:11px;" id="redutor-total-valor">${temDados ? F(totValor) : '—'}</td>
            <td style="font-size:11px;" id="redutor-total-pct">${temDados ? pctTotal.toFixed(2) + '%' : '—'}</td>
            <td></td>
        </tr>`;
    }
    // Re-render da tabela não mexe nos sliders (vivem fora do tbody) — só
    // precisa reler os campos % atuais para manter slider e tabela em sincronia.
    if (typeof sincronizarTodosSliders === 'function') { sincronizarTodosSliders('redutor'); atualizarPreviaSliders(); }
}

// Recalcula a linha de TOTAL (Valor Deliberado) somando os valores atuais dos
// campos de cada grupo — chamado sempre que um input individual muda, sem
// precisar re-renderizar a tabela inteira.
function atualizarTotalRedutor() {
    let elValorTot = document.getElementById('redutor-total-valor');
    let elPctTot = document.getElementById('redutor-total-pct');
    if (!elValorTot || !elPctTot) return;
    let totValor = 0, totNecAj = 0;
    GRUPOS_REDUTOR.forEach(g => {
        let elValor = document.getElementById('valorparadigma-' + g.sufixo);
        let elNecAj = document.getElementById('redutor-necaj-' + g.sufixo);
        if (elValor) totValor += parseFloat(elValor.dataset.valorNumerico || '0') || 0;
        if (elNecAj && elNecAj.dataset.valor) totNecAj += parseFloat(elNecAj.dataset.valor) || 0;
    });
    elValorTot.textContent = F(totValor);
    elPctTot.textContent = (totNecAj > 0 ? (totValor / totNecAj * 100) : 0).toFixed(2) + '%';
}

// Input de Valor Deliberado alterado → recalcula o Percentual a partir da
// Necessidade 2027 Ajustada do grupo (Percentual = Valor Deliberado ÷ Necessidade Ajustada × 100).
function atualizarPorValorParadigma(sufixo) {
    let elValor = document.getElementById('valorparadigma-' + sufixo);
    let elPct = document.getElementById('pc-' + sufixo);
    let elNecAj = document.getElementById('redutor-necaj-' + sufixo);
    if (!elValor || !elPct || !elNecAj) return;
    let necAjTotal = parseFloat(elNecAj.dataset.valor);
    if (isNaN(necAjTotal) || necAjTotal <= 0) return;
    let valor = parseFloat(elValor.dataset.valorNumerico || '0');
    elPct.value = ((valor / necAjTotal) * 100).toFixed(2);
    atualizarTotalRedutor();
}

// Input de Percentual alterado → recalcula o Valor Deliberado a partir da
// Necessidade 2027 Ajustada do grupo (Valor Deliberado = Percentual ÷ 100 × Necessidade Ajustada).
function atualizarPorPercentualRedutor(sufixo) {
    let elValor = document.getElementById('valorparadigma-' + sufixo);
    let elPct = document.getElementById('pc-' + sufixo);
    let elNecAj = document.getElementById('redutor-necaj-' + sufixo);
    if (!elValor || !elPct || !elNecAj) return;
    let necAjTotal = parseFloat(elNecAj.dataset.valor);
    if (isNaN(necAjTotal) || necAjTotal <= 0) return;
    let valor = (V(elPct.value) / 100) * necAjTotal;
    elValor.value = formatarMascaraNumerica(valor);
    elValor.dataset.valorNumerico = valor;
    atualizarTotalRedutor();
}

// Núcleo do "Aplicar": grava o percentual de UM grupo (sem alert, sem recálculo geral)
// para poder ser reaproveitado tanto pelo botão individual quanto pelo "Aplicar para Todos".
function aplicarValorParadigmaGrupoCore(sufixo) {
    let g = GRUPOS_REDUTOR.find(x => x.sufixo === sufixo);
    let elPct = document.getElementById('pc-' + sufixo);
    if (!g || !elPct) return null;
    let pct = V(elPct.value);
    if (pct < 0 || pct > 100) return null;
    // Premissa do projeto: apenas a Fonte selecionada tem valores alterados.
    if (!monFonteSelecionada) return null;

    definirPctPreservado(monFonteSelecionada, g.classe, pct);

    dadosProcessados.forEach(d => {
        if (d.classe !== g.classe || d.foiAjustado) return;
        if (N(d.fonte) !== N(monFonteSelecionada)) return;
        let fator = pct / 100;
        d.prevEmpAjustada = fator > 0 ? d.prevEmp * (1 - fator) : d.prevEmp;
        d.trfAj = d.p26 - d.prevEmpAjustada;
        d.ajusteAtivo = fator > 0;
        d.necessidade2027Ajustada = d.p27 + d.trfAj;
    });

    return { pct: pct, classe: g.classe, label: labelClasse(g.classe) };
}

function aplicarValorParadigma(sufixo) {
    let r = aplicarValorParadigmaGrupoCore(sufixo);
    if (!r) return alert("Informe um percentual entre 0 e 100.");

    recalculoGeralInjetado();
    atualizarResumoRedutor();
    alert(`Percentual de ${r.pct.toFixed(2)}% aplicado à Previsão de Empenho 2026 do grupo ${r.label}.`);
}

// "Aplicar para Todos": grava o percentual atual de CADA grupo de uma só vez,
// reaproveitando o mesmo núcleo do botão individual "Aplicar". MAPPs travados
// continuam de fora, exatamente como na aplicação grupo a grupo.
function aplicarValorParadigmaTodos() {
    if (dadosProcessados.length === 0) return alert("Não há dados processados para aplicar o Valor Deliberado.");
    if (!confirm("Isso vai gravar o percentual atual de CADA grupo (Valor Deliberado) na Previsão de Empenho 2026 de todos os MAPPs não travados, de uma só vez. Deseja continuar?")) return;

    let aplicados = [];
    GRUPOS_REDUTOR.forEach(g => {
        let r = aplicarValorParadigmaGrupoCore(g.sufixo);
        if (r) aplicados.push(r);
    });

    recalculoGeralInjetado();
    atualizarResumoRedutor();
    alert(`Valor Deliberado aplicado a ${aplicados.length} grupo(s): ${aplicados.map(a => a.label).join(', ')}.`);
}

function atualizarResumoRedutor() {
    renderizarTabelaRedutor();
}

// Renderiza a tabela do PLOA 2027: mesma estrutura do Redutor, mas com os 6
// grupos (nenhum é imune) e partindo da Necessidade 2027 Ajustada, não da TRF.
// MAPPs travados (edição manual) são contabilizados à parte e não sofrem o %.
function renderizarTabelaPLO() {
    let tbody = document.getElementById('plo-tbody');
    if (!tbody) return;

    // Antes da 1ª geração, a base de cálculo é a Necessidade 2027 Ajustada e o
    // resultado é uma prévia do PLOA 2027. Depois de gerado, a referência passa
    // a ser o PLOA 2027 (Ajustado) atual, e o resultado é a prévia de um NOVO
    // ajuste em cascata — os títulos das colunas acompanham essa mudança e assim
    // permanecem até os valores serem restaurados ("Zerar PLOA 2027").
    let thBase = document.getElementById('th-plo-col-base');
    let thPrevia = document.getElementById('th-plo-col-previa');
    if (thBase && thPrevia) {
        if (ploGerado) {
            thBase.textContent = 'PLOA 2027';
            thBase.title = 'Soma do PLOA 2027 (Ajustado) atual desses MAPPs, antes da redução deste novo percentual.';
            thPrevia.textContent = 'PLOA 2027 Ajustado';
            thPrevia.title = 'Prévia em tempo real do próximo ajuste em cascata: PLOA 2027 atual × (1 − percentual), exceto MAPPs travados. Só é gravado ao clicar em "Aplicar Novo Ajuste ao PLOA 2027".';
        } else {
            thBase.textContent = 'NEC. 2027 Ajustada';
            thBase.title = 'Soma da Necessidade 2027 Ajustada desses MAPPs, antes da redução deste percentual.';
            thPrevia.textContent = 'PLOA 2027 (Prévia)';
            thPrevia.title = 'Prévia em tempo real: Necessidade 2027 Ajustada × (1 − percentual), exceto MAPPs travados. Atualiza enquanto você digita, antes de clicar em Processar Cenário.';
        }
    }

    let percentuaisAtuais = {};
    GRUPOS_PLO.forEach(g => {
        let el = document.getElementById('plo-' + g.sufixo);
        percentuaisAtuais[g.sufixo] = el ? el.value : '0';
    });

    let baseFiltrada = dadosProcessados.filter(d => checkFiltroMulti(d, 'dash'));
    let linhas = GRUPOS_PLO.map(g => {
        let doGrupo = baseFiltrada.filter(d => d.classe === g.classe);
        let travados = doGrupo.filter(d => d.foiAjustado);
        let campoBase = ploGerado ? 'plo2027Ajustado' : 'necessidade2027Ajustada';
        let necAjTotal = doGrupo.reduce((s, d) => s + (d[campoBase] || 0), 0);
        let necAjTravados = travados.reduce((s, d) => s + (d[campoBase] || 0), 0);
        return { ...g, qtd: doGrupo.length, qtdTravados: travados.length, necAjTotal, necAjTravados };
    });

    linhas.sort((a, b) => b.necAjTotal - a.necAjTotal);

    let h = '';
    let temDados = dadosProcessados.length > 0;

    let totQtd = 0, totQtdTravados = 0, totNecAj = 0;

    linhas.forEach(l => {
        let totalmenteTravado = l.qtd > 0 && l.qtdTravados === l.qtd;
        let notaTravados = l.qtdTravados > 0 ? ` <span style="font-size:10px; color:var(--warning);">(${l.qtdTravados} travado${l.qtdTravados > 1 ? 's' : ''})</span>` : '';
        let avisoTotal = totalmenteTravado
            ? `<div style="font-size:10px; color:var(--warning); font-weight:700; margin-top:3px;">🔒 100% do grupo já travado — este percentual não tem efeito</div>`
            : '';

        totQtd += l.qtd;
        totQtdTravados += l.qtdTravados;
        totNecAj += l.qtd > 0 ? l.necAjTotal : 0;

        let pctAtual = V(percentuaisAtuais[l.sufixo]);
        let valorAtual = l.necAjTotal > 0 ? l.necAjTotal * (1 - pctAtual / 100) : 0;

        h += `<tr${totalmenteTravado ? ' style="background:rgba(230,126,34,0.07);"' : ''}>
            <td>${l.label}${avisoTotal}</td>
            <td style="font-size:11px;" id="plo-qtd-${l.sufixo}">${temDados ? (l.qtd > 0 ? `<strong>${l.qtd}</strong>${notaTravados}` : '—') : '—'}</td>
            <td style="font-size:11px;" id="plo-nec-${l.sufixo}" data-valor="${l.qtd > 0 ? l.necAjTotal : 0}" data-travado="${l.necAjTravados}">${temDados && l.qtd > 0 ? F(l.necAjTotal) : '—'}</td>
            <td style="font-size:11px;" id="plo-prevista-${l.sufixo}">—</td>
            <td><input type="text" inputmode="numeric" id="plovalor-${l.sufixo}" class="input-table" style="width:130px;" value="${formatarMascaraNumerica(valorAtual)}" data-valor-numerico="${valorAtual}" oninput="aplicarMascaraNumerica(this); marcarQuebrado('plo','${l.sufixo}'); atualizarPorValorPLO('${l.sufixo}'); sincronizarSliderComCampo('plo','${l.sufixo}'); atualizarPreviaSliders();" title="${totalmenteTravado ? '100% dos MAPPs deste grupo já estão travados — este valor não altera nada.' : ''}"></td>
            <td><input type="number" id="plo-${l.sufixo}" class="input-table" value="${percentuaisAtuais[l.sufixo]}" oninput="marcarQuebrado('plo','${l.sufixo}'); atualizarPorPercentualPLO('${l.sufixo}'); sincronizarSliderComCampo('plo','${l.sufixo}'); atualizarPreviaSliders();" title="${totalmenteTravado ? '100% dos MAPPs deste grupo já estão travados — este percentual não altera nada.' : ''}">%</td>
        </tr>`;
    });

    tbody.innerHTML = h;
    GRUPOS_PLO.forEach(g => atualizarPreviaPLO(g.sufixo));

    let notaTotalTravados = totQtdTravados > 0 ? ` <span style="font-size:10px; color:var(--warning);">(${totQtdTravados} travado${totQtdTravados > 1 ? 's' : ''})</span>` : '';
    let tfoot = document.getElementById('plo-tfoot');
    if (tfoot) {
        tfoot.innerHTML = `<tr style="font-weight:700; border-top:2px solid var(--border);">
            <td>TOTAL</td>
            <td style="font-size:11px;">${temDados ? `<strong>${totQtd}</strong>${notaTotalTravados}` : '—'}</td>
            <td style="font-size:11px;" id="plo-total-nec">${temDados ? F(totNecAj) : '—'}</td>
            <td style="font-size:11px;" id="plo-total-previa">—</td>
            <td style="font-size:11px;" id="plo-total-valor">—</td>
            <td style="font-size:11px;" id="plo-total-pct">—</td>
        </tr>`;
    }
    atualizarTotalValorPLO();
    atualizarTotalPLO();
    // Idem: sliders vivem fora do tbody, só precisam reler os % atuais.
    if (typeof sincronizarTodosSliders === 'function') { sincronizarTodosSliders('plo'); atualizarPreviaSliders(); }
}

// Recalcula o total de Valor Máximo (R$) e o percentual médio ponderado do
// Redutor do PLOA — chamado sempre que um valor/percentual individual muda.
function atualizarTotalValorPLO() {
    let elValorTot = document.getElementById('plo-total-valor');
    let elPctTot = document.getElementById('plo-total-pct');
    if (!elValorTot || !elPctTot) return;
    let totValor = 0, totBase = 0;
    GRUPOS_PLO.forEach(g => {
        let elValor = document.getElementById('plovalor-' + g.sufixo);
        let elNec = document.getElementById('plo-nec-' + g.sufixo);
        if (elValor) totValor += parseFloat(elValor.dataset.valorNumerico || '0') || 0;
        if (elNec && elNec.dataset.valor) totBase += parseFloat(elNec.dataset.valor) || 0;
    });
    elValorTot.textContent = F(totValor);
    elPctTot.textContent = (totBase > 0 ? (1 - totValor / totBase) * 100 : 0).toFixed(2) + '%';
}

// Input de Valor Máximo (R$) alterado → recalcula o Percentual a partir da
// base atual do grupo (Necessidade Ajustada ou PLOA Ajustado, conforme o
// estado), e então atualiza a prévia. Percentual = (1 − Valor ÷ Base) × 100.
function atualizarPorValorPLO(sufixo) {
    let elValor = document.getElementById('plovalor-' + sufixo);
    let elPct = document.getElementById('plo-' + sufixo);
    let elNec = document.getElementById('plo-nec-' + sufixo);
    if (!elValor || !elPct || !elNec) return;
    let base = parseFloat(elNec.dataset.valor);
    if (isNaN(base) || base <= 0) return;
    let valor = parseFloat(elValor.dataset.valorNumerico || '0');
    let pct = (1 - valor / base) * 100;
    elPct.value = Math.max(0, pct).toFixed(2);
    atualizarPreviaPLO(sufixo);
    atualizarTotalValorPLO();
}

// Input de Percentual alterado → recalcula o Valor Máximo (R$) a partir da
// base atual do grupo. Valor = Base × (1 − Percentual ÷ 100).
function atualizarPorPercentualPLO(sufixo) {
    let elValor = document.getElementById('plovalor-' + sufixo);
    let elPct = document.getElementById('plo-' + sufixo);
    let elNec = document.getElementById('plo-nec-' + sufixo);
    if (!elValor || !elPct || !elNec) return;
    let base = parseFloat(elNec.dataset.valor);
    if (isNaN(base) || base <= 0) { atualizarPreviaPLO(sufixo); return; }
    let valor = base * (1 - V(elPct.value) / 100);
    elValor.value = formatarMascaraNumerica(valor);
    elValor.dataset.valorNumerico = valor;
    atualizarPreviaPLO(sufixo);
    atualizarTotalValorPLO();
}

// Prévia em tempo real do PLOA 2027 por grupo — a fatia travada (edição manual)
// fica de fora do percentual; só a fatia elegível é reduzida.
function atualizarPreviaPLO(sufixo) {
    let elNec = document.getElementById('plo-nec-' + sufixo);
    let elPrevia = document.getElementById('plo-prevista-' + sufixo);
    let inputPct = document.getElementById('plo-' + sufixo);
    if (!elNec || !elPrevia || !inputPct) return;
    if (elNec.innerHTML === '—') { elPrevia.innerHTML = '—'; elPrevia.dataset.valor = '0'; atualizarTotalPLO(); return; }
    let necTotal = parseFloat(elNec.dataset.valor);
    let necTravado = parseFloat(elNec.dataset.travado || '0');
    if (isNaN(necTotal)) { elPrevia.innerHTML = '—'; elPrevia.dataset.valor = '0'; atualizarTotalPLO(); return; }
    let pct = V(inputPct.value) / 100;
    let necElegivel = necTotal - necTravado;
    let previa = necTravado + (pct > 0 ? necElegivel * (1 - pct) : necElegivel);
    elPrevia.innerHTML = F(previa);
    elPrevia.dataset.valor = previa;
    atualizarTotalPLO();
}

// Recalcula a linha de TOTAL do PLOA somando as prévias de cada grupo — chamado
// sempre que um percentual individual muda, sem re-renderizar a tabela inteira.
function atualizarTotalPLO() {
    let elTotal = document.getElementById('plo-total-previa');
    if (!elTotal) return;
    let soma = 0;
    GRUPOS_PLO.forEach(g => {
        let el = document.getElementById('plo-prevista-' + g.sufixo);
        if (el && el.dataset.valor) soma += parseFloat(el.dataset.valor) || 0;
    });
    elTotal.innerHTML = F(soma);
    atualizarFaixaPreviaPLOAoVivo(soma);
}

// Espelha, na faixa sempre-visível, a mesma prévia ao vivo que a tabela do
// Redutor do PLOA já calcula (nenhuma conta nova — só reaproveita "soma").
// O Redutor do PLOA não é segmentado por fonte, então essa prévia por tecla
// só atualiza o card quando nenhuma fonte está selecionada no Painel de
// Monitoramento — com fonte selecionada, o card já reflete só aquela fonte
// (atualizarFaixaIndicadoresGerais), e não deve ser sobrescrito pelo total geral.
function atualizarFaixaPreviaPLOAoVivo(soma) {
    if (monFonteSelecionada) return;
    let elPloAj = document.getElementById('fig-ploaj');
    if (!elPloAj) return;
    elPloAj.textContent = F(soma);
}

function atualizarResumoPLO() {
    renderizarTabelaPLO();
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDER DE AJUSTE RÁPIDO — Redutor por Grupo (r-m3) e PLOA 2027 (r-m4).
// Cada bloco tem: 1 painel de 4 cards de prévia ao vivo + 1 slider geral +
// 5 sliders individuais (um por grupo). Os sliders só espelham/alimentam os
// campos já existentes (pc-{sufixo}/valorparadigma-{sufixo} no Redutor,
// plo-{sufixo}/plovalor-{sufixo} no PLOA) — nenhum cálculo novo de negócio,
// só orquestração de UI. Nunca ficam desabilitados, mesmo com o PLOA 2027 já
// gerado (mesma regra usada hoje só para os campos do bloco PLOA).
// ─────────────────────────────────────────────────────────────────────────

const CORES_GRUPOS_SLIDER = {
    'CONTRATO_GESTAO':   'var(--warning)',
    'CONTINUIDADE':      'var(--accent)',
    'PCF_CONVENIO':      'var(--purple)',
    'OPERACAO_CREDITO':  'var(--teal)',
    'INVESTIMENTO':      'var(--success)'
};

function fmtPctSlider(v) {
    return V(v).toFixed(2).replace('.', ',') + '%';
}

// Monta o HTML de um painel (chamado 1x na inicialização para cada bloco).
function montarPainelSlider(tipo) {
    let grupos = tipo === 'redutor' ? GRUPOS_REDUTOR : GRUPOS_PLO;
    let nomeCampoRS = tipo === 'redutor' ? 'Valor Deliberado (R$)' : 'Valor Máximo (R$)';

    let cardsHtml = `
        <div class="slider-cards-preview">
            <div class="slider-card slider-card-fixo"><div class="slider-card-label" title="Necessidade 2027 calculada pela regra vigente de Parametrização por Estágio — é fixa aqui, não muda ao mexer nos sliders abaixo.">Necessidade Real 2027</div><div class="slider-card-value" id="slider-prev-nec27-${tipo}">—</div></div>
            <div class="slider-card"><div class="slider-card-label" title="Prévia ao vivo, recalculada a cada movimento do slider: Necessidade 2027 com os percentuais atuais do Redutor por Grupo. Só é gravada de fato ao soltar um slider do Redutor ou pelos botões Aplicar/Aplicar para Todos.">Necessidade Ajustada 2027</div><div class="slider-card-value" id="slider-prev-necaj-${tipo}">—</div></div>
            <div class="slider-card"><div class="slider-card-label" title="Prévia ao vivo: TRF 2026 Ajustada = Programado 2026 − Previsão de Empenho 2026 Ajustada, seguindo os percentuais atuais do Redutor por Grupo.">TRF 2026 Ajustada</div><div class="slider-card-value" id="slider-prev-trfaj-${tipo}">—</div></div>
            <div class="slider-card"><div class="slider-card-label" title="Prévia ao vivo do PLOA 2027: combina a Necessidade Ajustada acima com o percentual atual do Redutor do PLOA por Grupo. Depois de gerado oficialmente, mostra o PLOA 2027 (Ajustado) já congelado.">PLOA 2027</div><div class="slider-card-value" id="slider-prev-ploa-${tipo}">—</div></div>
        </div>`;

    let botaoReplicar = tipo === 'redutor'
        ? `<button class="btn-mini-export" onclick="aplicarValorParadigmaTodos()" title="Grava de uma vez a distribuição percentual atual (slider geral + grupos ajustados individualmente) na Previsão de Empenho 2026 de todos os MAPPs não travados — mesma ação do botão 'Aplicar para Todos' abaixo.">🔁 Replicar Proporção nos MAPPs</button>`
        : '';

    // Slider geral oculto da tela por cautela (ver .slider-geral-controle no CSS) —
    // continua no DOM e funcional, só não aparece visualmente. No bloco PLOA 2027,
    // que não tem botão próprio nesta linha, a linha inteira some (ficaria vazia).
    let geralHtml = `
        <div class="slider-geral-row${botaoReplicar ? '' : ' slider-geral-row-vazia'}">
            <div class="slider-geral-controle">
                <label title="Aplica o mesmo percentual a todos os grupos abaixo que ainda não foram ajustados manualmente de forma individual (slider, % ou R$ próprios daquele grupo).">🎚️ Geral</label>
                <input type="range" min="0" max="100" step="0.01" value="0" id="slider-geral-${tipo}"
                    oninput="onSliderGeral('${tipo}', this.value)" onchange="onSliderGeralChange('${tipo}')"
                    title="Move de uma vez todos os grupos ainda não &quot;destravados&quot; individualmente, aplicando o mesmo percentual a todos eles. Assim que um grupo específico é ajustado à parte (slider, % ou R$), ele passa a ignorar este slider geral.">
                <span class="slider-geral-valor" id="slider-geral-${tipo}-val">0,00%</span>
            </div>
            ${botaoReplicar}
        </div>`;

    let gruposHtml = grupos.map(g => {
        let cor = CORES_GRUPOS_SLIDER[g.classe] || 'var(--muted)';
        let tituloAcao = tipo === 'redutor'
            ? 'Ao soltar o slider, este percentual é gravado automaticamente na Previsão de Empenho 2026 dos MAPPs não travados deste grupo (mesma rotina do botão Aplicar).'
            : 'Prévia ao vivo — a gravação real do PLOA 2027 continua acontecendo só pelo botão "Gerar Valores de PLOA 2027" / "Aplicar Novo Ajuste ao PLOA 2027" abaixo.';
        return `
        <div class="slider-grupo-item" id="slider-wrap-${tipo}-${g.sufixo}" style="border-left:3px solid ${cor};">
            <label title="Percentual do grupo ${g.label}, sincronizado nos dois sentidos com os campos Percentual e ${nomeCampoRS} da linha correspondente na tabela abaixo.">${g.label}<span class="slider-quebrado-badge" title="Este grupo foi ajustado manualmente e não acompanha mais o slider Geral.">🔓 individual</span></label>
            <input type="range" min="0" max="100" step="0.01" value="0" id="slider-${tipo}-${g.sufixo}" style="accent-color:${cor};"
                oninput="onSliderGrupo('${tipo}', '${g.sufixo}', this.value)" onchange="onSliderGrupoChange('${tipo}', '${g.sufixo}')"
                title="Arraste para ajustar o percentual do grupo ${g.label} (0% a 100%). ${tituloAcao}">
            <div class="slider-grupo-valor" id="slider-${tipo}-${g.sufixo}-val">0,00%</div>
        </div>`;
    }).join('');

    return `${cardsHtml}${geralHtml}<div class="slider-grupos-grid">${gruposHtml}</div>`;
}

// Chamada 1x na carga da página — a estrutura dos sliders é fixa (5 grupos +
// geral), só os valores mudam depois, via sincronizarSliderComCampo().
function inicializarPaineisSlider() {
    let elRedutor = document.getElementById('slider-painel-redutor');
    let elPlo = document.getElementById('slider-painel-plo');
    if (elRedutor) elRedutor.innerHTML = montarPainelSlider('redutor');
    if (elPlo) elPlo.innerHTML = montarPainelSlider('plo');
}

// Marca um grupo como "quebrado" (ajustado manualmente) — o slider Geral do
// bloco passa a ignorá-lo. Chamada tanto pelos sliders individuais quanto
// pelos campos de % e R$ já existentes na tabela (ver templates das linhas).
function marcarQuebrado(tipo, sufixo) {
    let mapa = tipo === 'redutor' ? redutorSliderQuebrados : ploSliderQuebrados;
    mapa[sufixo] = true;
    let el = document.getElementById('slider-wrap-' + tipo + '-' + sufixo);
    if (el) el.classList.add('slider-quebrado');
}

// Zera a memória de "grupos quebrados" dos dois blocos e devolve os sliders
// gerais para 0% — chamada junto de prevEmpAjustesPreservados (Restaurar
// Parâmetros / carregar cenário), para não deixar resíduo de sessão anterior.
function resetarQuebradosSlider() {
    redutorSliderQuebrados = {};
    ploSliderQuebrados = {};
    document.querySelectorAll('.slider-grupo-item.slider-quebrado').forEach(el => el.classList.remove('slider-quebrado'));
    ['slider-geral-redutor', 'slider-geral-plo'].forEach(id => { let el = document.getElementById(id); if (el) el.value = 0; });
    ['slider-geral-redutor-val', 'slider-geral-plo-val'].forEach(id => { let el = document.getElementById(id); if (el) el.textContent = '0,00%'; });
}

// Relê o campo de % atual (pc-/plo-) de UM grupo e reflete no slider e no seu
// rótulo — chamada sempre que a tabela correspondente é re-renderizada, para
// os sliders (que vivem fora do tbody) nunca ficarem dessincronizados dela.
function sincronizarSliderComCampo(tipo, sufixo) {
    let prefixoCampo = tipo === 'redutor' ? 'pc-' : 'plo-';
    let elCampo = document.getElementById(prefixoCampo + sufixo);
    let elSlider = document.getElementById('slider-' + tipo + '-' + sufixo);
    let elLabel = document.getElementById('slider-' + tipo + '-' + sufixo + '-val');
    if (!elCampo || !elSlider) return;
    let pct = V(elCampo.value);
    if (isNaN(pct) || pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    elSlider.value = pct;
    if (elLabel) elLabel.textContent = fmtPctSlider(pct);
}

function sincronizarTodosSliders(tipo) {
    let grupos = tipo === 'redutor' ? GRUPOS_REDUTOR : GRUPOS_PLO;
    grupos.forEach(g => sincronizarSliderComCampo(tipo, g.sufixo));
}

// Arraste de um slider INDIVIDUAL — atualiza campo %, R$, marca o grupo como
// quebrado e recalcula a prévia ao vivo. Sem recalculoGeralInjetado aqui (só
// no "change", ao soltar), para não travar a interface a cada tick do drag.
function onSliderGrupo(tipo, sufixo, valor) {
    marcarQuebrado(tipo, sufixo);
    let prefixoCampo = tipo === 'redutor' ? 'pc-' : 'plo-';
    let elCampo = document.getElementById(prefixoCampo + sufixo);
    if (elCampo) {
        elCampo.value = valor;
        if (tipo === 'redutor') atualizarPorPercentualRedutor(sufixo); else atualizarPorPercentualPLO(sufixo);
    }
    let elLabel = document.getElementById('slider-' + tipo + '-' + sufixo + '-val');
    if (elLabel) elLabel.textContent = fmtPctSlider(valor);
    atualizarPreviaSliders();
}

// Soltou o slider individual: no Redutor por Grupo, grava de verdade (mesma
// rotina do botão "Aplicar"). No PLOA 2027 nunca grava sozinho — a gravação
// real continua exclusiva do botão "Gerar/Aplicar Novo Ajuste ao PLOA 2027".
function onSliderGrupoChange(tipo, sufixo) {
    if (tipo !== 'redutor') return;
    aplicarValorParadigmaGrupoCore(sufixo);
    recalculoGeralInjetado();
    atualizarResumoRedutor();
}

// Arraste do slider GERAL — aplica o mesmo percentual a todos os grupos do
// bloco que ainda não foram "quebrados" (ajustados individualmente).
function onSliderGeral(tipo, valor) {
    let grupos = tipo === 'redutor' ? GRUPOS_REDUTOR : GRUPOS_PLO;
    let quebrados = tipo === 'redutor' ? redutorSliderQuebrados : ploSliderQuebrados;
    let prefixoCampo = tipo === 'redutor' ? 'pc-' : 'plo-';
    grupos.forEach(g => {
        if (quebrados[g.sufixo]) return;
        let elSlider = document.getElementById('slider-' + tipo + '-' + g.sufixo);
        let elLabel = document.getElementById('slider-' + tipo + '-' + g.sufixo + '-val');
        let elCampo = document.getElementById(prefixoCampo + g.sufixo);
        if (elSlider) elSlider.value = valor;
        if (elLabel) elLabel.textContent = fmtPctSlider(valor);
        if (elCampo) {
            elCampo.value = valor;
            if (tipo === 'redutor') atualizarPorPercentualRedutor(g.sufixo); else atualizarPorPercentualPLO(g.sufixo);
        }
    });
    let elGeralLabel = document.getElementById('slider-geral-' + tipo + '-val');
    if (elGeralLabel) elGeralLabel.textContent = fmtPctSlider(valor);
    atualizarPreviaSliders();
}

// Soltou o slider GERAL: no Redutor por Grupo, grava de verdade todos os
// grupos que o geral moveu (não quebrados). No PLOA 2027, não grava sozinho.
function onSliderGeralChange(tipo) {
    if (tipo !== 'redutor') return;
    let algum = false;
    GRUPOS_REDUTOR.forEach(g => {
        if (redutorSliderQuebrados[g.sufixo]) return;
        let r = aplicarValorParadigmaGrupoCore(g.sufixo);
        if (r) algum = true;
    });
    if (algum) { recalculoGeralInjetado(); atualizarResumoRedutor(); }
}

// Cálculo local (sem mutar dadosProcessados, sem recalculoGeralInjetado) da
// Necessidade Ajustada / TRF Ajustada / PLOA 2027 "e se" — usando os % que
// estão AGORA nos campos pc-{sufixo} (Redutor) e plo-{sufixo} (PLOA), mesmo
// que ainda não tenham sido gravados de verdade. Serve às prévias dos DOIS
// painéis de cards (mesma conta, os dois blocos mostram o mesmo cenário).
//
// O escopo (quais MAPPs entram na soma) e a regra do PLOA seguem EXATAMENTE
// renderizarTabelaRedutor()/renderizarTabelaPLO() — a tabela logo abaixo do
// painel — e não a barra superior (fig-nec27 etc.), que é filtrada por Fonte
// quando há uma selecionada no Painel de Monitoramento. As duas tabelas
// (Redutor por Grupo e PLOA 2027) sempre usam o filtro do Dashboard
// (checkFiltroMulti), NUNCA a Fonte — por isso o painel de prévia, que fica
// colado nelas, precisa do mesmo escopo, senão o card de prévia diverge do
// TOTAL da própria tabela e dos cards da aba Consolidação e Dashboard (que
// também são sempre pelo filtro do Dashboard).
function calcularPreviaSlidersBase() {
    let percentuaisRedutor = {};
    GRUPOS_REDUTOR.forEach(g => { let el = document.getElementById('pc-' + g.sufixo); percentuaisRedutor[g.classe] = el ? V(el.value) : 0; });
    let percentuaisPLO = {};
    GRUPOS_PLO.forEach(g => { let el = document.getElementById('plo-' + g.sufixo); percentuaisPLO[g.classe] = el ? V(el.value) : 0; });

    let baseFiltrada = dadosProcessados.filter(d => checkFiltroMulti(d, 'dash'));

    let totalTrfAj = 0, totalNecAj = 0, totalPloa = 0;
    baseFiltrada.forEach(d => {
        let trfAj, necAj;
        if (d.foiAjustado) {
            trfAj = d.trfAj || 0;
            necAj = d.necessidade2027Ajustada || 0;
        } else {
            let pct = percentuaisRedutor[d.classe] || 0;
            let fator = pct / 100;
            let prevEmpAj = fator > 0 ? d.prevEmp * (1 - fator) : d.prevEmp;
            trfAj = d.p26 - prevEmpAj;
            necAj = d.p27 + trfAj;
        }
        totalTrfAj += trfAj;
        totalNecAj += necAj;

        let ploaVal;
        if (ploGerado) {
            ploaVal = d.plo2027Ajustado || 0; // congelado: Redutor não afeta mais o PLOA já gerado
        } else if (d.foiAjustado) {
            ploaVal = necAj;
        } else {
            let ploPct = percentuaisPLO[d.classe] || 0;
            ploaVal = necAj * (1 - ploPct / 100);
        }
        totalPloa += ploaVal;
    });
    return { totalTrfAj, totalNecAj, totalPloa };
}

// Atualiza os 4 cards de prévia nos DOIS painéis (Redutor e PLOA) de uma vez.
// O card fixo "Necessidade Real 2027" usa totaisCenarioAtual.t_nec27 (mesmo
// total dash-filtrado que alimenta a aba Consolidação e Dashboard) — não o
// fig-nec27 da barra superior, que é filtrado por Fonte quando há uma
// selecionada e por isso pode mostrar um universo menor do que a tabela.
function atualizarPreviaSliders() {
    let necFixoTexto = (dadosProcessados.length > 0 && totaisCenarioAtual) ? F(totaisCenarioAtual.t_nec27) : '—';
    let r = dadosProcessados.length > 0 ? calcularPreviaSlidersBase() : { totalTrfAj: 0, totalNecAj: 0, totalPloa: 0 };
    ['redutor', 'plo'].forEach(tipo => {
        let elNec = document.getElementById('slider-prev-nec27-' + tipo);
        let elNecAj = document.getElementById('slider-prev-necaj-' + tipo);
        let elTrfAj = document.getElementById('slider-prev-trfaj-' + tipo);
        let elPloa = document.getElementById('slider-prev-ploa-' + tipo);
        if (elNec) elNec.textContent = necFixoTexto;
        if (elNecAj) elNecAj.textContent = dadosProcessados.length > 0 ? F(r.totalNecAj) : '—';
        if (elTrfAj) elTrfAj.textContent = dadosProcessados.length > 0 ? F(r.totalTrfAj) : '—';
        if (elPloa) elPloa.textContent = dadosProcessados.length > 0 ? F(r.totalPloa) : '—';
    });
    // Premissa: nenhum card com o mesmo título pode divergir. Os cards da barra
    // superior (Necessidade 2027 Ajustada, PLOA 2027, TRF 2026 Ajustada, Saldo
    // do Teto) usam a MESMA prévia ao vivo acima — atualizados a cada tecla/
    // arrasto, sem gravar nada em dadosProcessados (só o botão Aplicar/Aplicar
    // para Todos/Gerar PLOA grava de verdade). atualizarFaixaIndicadoresGerais()
    // é leve (não chama recalculoGeralInjetado), então é seguro chamar aqui.
    atualizarFaixaIndicadoresGerais();
}

