// SIPOG COFIP — js/11-monitoramento-tetos.js
// Tetos por fonte, subtetos Fonte×Grupo, painel de monitoramento, modal de teto e indicadores finais.
// Script clássico (escopo global). Ordem de carga definida em index.html — não reordenar.
// ─── PAINEL DE MONITORAMENTO DOS AJUSTES — MULTI-FONTE ───────────────────────

function renderizarTabelaTetosPorFonte(abrirBloco) {
    let container = document.getElementById('tetos-por-fonte-container');
    if (!container) return;

    // Coleta todas as fontes disponíveis na base
    let todasFontes = new Set();
    dadosProcessados.forEach(d => { if (d.fonte) todasFontes.add(d.fonte.trim()); });
    dadosExcluidos.forEach(d => { if (d.fonte) todasFontes.add(d.fonte.trim()); });

    let fontesComTeto = Object.keys(tetosPorFonte).filter(f => tetosPorFonte[f] > 0);
    let fontesSemTeto = Array.from(todasFontes).filter(f => !tetosPorFonte[f] || tetosPorFonte[f] <= 0).sort();

    // Atualiza badge no cabeçalho
    let badge = document.getElementById('badge-tetos-count');
    if (badge) {
        badge.textContent = fontesComTeto.length > 0
            ? `${fontesComTeto.length} definido${fontesComTeto.length > 1 ? 's' : ''}`
            : 'nenhum definido';
        badge.style.color = fontesComTeto.length > 0 ? 'var(--success)' : '#e67e22';
    }

    if (todasFontes.size === 0) {
        container.innerHTML = '<div style="font-size:12px; color:var(--muted); font-style:italic; padding:8px 0;">Importe e processe uma base de dados para definir os tetos por fonte.</div>';
        return;
    }

    let h = '';

    // Tabela de fontes com teto já definido
    if (fontesComTeto.length > 0) {
        h += `<table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:12px;">
            <thead><tr>
                <th style="text-align:left; padding:7px 10px; color:var(--muted); font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:0.7px; border-bottom:1px solid var(--border);">Fonte de Recurso</th>
                <th style="text-align:right; padding:7px 10px; color:var(--muted); font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:0.7px; border-bottom:1px solid var(--border); width:220px;">Teto Disponibilizado 2027</th>
                <th style="width:40px; border-bottom:1px solid var(--border);"></th>
            </tr></thead><tbody>`;

        fontesComTeto.sort().forEach((fonte, idx) => {
            let valor = tetosPorFonte[fonte];
            let cor = fonte.includes('500') && fonte.includes('501') ? '#e67e22' : 'var(--accent)';
            let inputId = `teto-edit-${idx}`;
            h += `<tr style="border-bottom:1px solid var(--border);">
                <td style="padding:8px 10px; font-weight:600; color:var(--text); font-size:12px;">${fonte}</td>
                <td style="padding:5px 10px;">
                    <input type="text" inputmode="numeric" id="${inputId}" data-fonte="${fonte}"
                        value="${formatarMascaraNumerica(valor)}"
                        data-valor-numerico="${valor}"
                        style="width:100%; padding:5px 10px; border-radius:6px; border:2px solid ${cor}; background:var(--panel2); color:${cor}; font-weight:800; font-size:13px; text-align:right; box-sizing:border-box;"
                        oninput="aplicarMascaraNumerica(this)"
                        onblur="salvarTetoFonte(this);">
                </td>
                <td style="padding:5px 8px; text-align:center;">
                    <button onclick="removerTetoFonte('${fonte.replace(/'/g,"\\'")}'); renderizarTabelaTetosPorFonte(false);" title="Remover teto desta fonte"
                        style="background:none; border:none; cursor:pointer; color:var(--danger); font-size:16px; padding:2px 4px;">🗑️</button>
                </td>
            </tr>
            <tr><td colspan="3" style="padding:0;">${renderizarBlocoSubtetos(fonte, idx)}</td></tr>`;
        });

        h += '</tbody></table>';
    } else {
        h += `<div style="font-size:12px; color:var(--muted); font-style:italic; padding:6px 0 10px;">Nenhum teto definido ainda.</div>`;
    }

    // Linha de adição de nova fonte
    if (fontesSemTeto.length > 0) {
        h += `<div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; padding-top:10px; border-top:1px solid var(--border);">
            <select id="nova-fonte-select" style="flex:1; min-width:200px; padding:7px 10px; border-radius:6px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:12px; font-weight:600;">
                <option value="">— Selecione uma fonte —</option>
                ${fontesSemTeto.map(f => `<option value="${f.replace(/"/g,'&quot;')}">${f}</option>`).join('')}
            </select>
            <input type="text" inputmode="numeric" id="nova-fonte-valor"
                placeholder="R$ 0,00"
                style="width:180px; padding:7px 10px; border-radius:6px; border:2px solid var(--accent); background:var(--panel2); color:var(--accent); font-weight:800; font-size:13px; text-align:right;"
                oninput="aplicarMascaraNumerica(this)">
            <button class="btn btn-primary" onclick="adicionarTetoNovaFonte()" style="white-space:nowrap;">+ Adicionar Teto</button>
        </div>`;
    } else if (fontesComTeto.length > 0) {
        h += `<div style="font-size:11px; color:var(--success); padding-top:10px; border-top:1px solid var(--border);">✅ Todas as fontes da base têm teto definido.</div>`;
    }

    container.innerHTML = h;

    // Abre o bloco automaticamente se solicitado
    if (abrirBloco) {
        let blocoEl = document.getElementById('bloco-tetos');
        if (blocoEl) blocoEl.style.display = 'block';
    }
}

function atualizarBadgeTetos() {
    let fontesComTeto = Object.keys(tetosPorFonte).filter(f => tetosPorFonte[f] > 0);
    let badge = document.getElementById('badge-tetos-count');
    if (!badge) return;
    badge.textContent = fontesComTeto.length > 0
        ? `${fontesComTeto.length} definido${fontesComTeto.length > 1 ? 's' : ''}`
        : 'nenhum definido';
    badge.style.color = fontesComTeto.length > 0 ? 'var(--success)' : '#e67e22';
}

function removerTetoFonte(fonte) {
    delete tetosPorFonte[fonte];
    desfazerTodosSubtetosDaFonte(fonte);
    atualizarSeletorFontePainel();
    atualizarPainelMonitoramento();
}

function adicionarTetoNovaFonte() {
    let sel = document.getElementById('nova-fonte-select');
    let valEl = document.getElementById('nova-fonte-valor');
    if (!sel || !valEl) return;
    let fonte = sel.value;
    let v = parseFloat(valEl.dataset.valorNumerico);
    if (!fonte) { alert('Selecione uma fonte antes de adicionar.'); return; }
    if (isNaN(v) || v <= 0) { alert('Informe um valor de teto válido.'); return; }
    tetosPorFonte[fonte] = v;
    renderizarTabelaTetosPorFonte(false);
    atualizarBadgeTetos();
    atualizarSeletorFontePainel();
    atualizarPainelMonitoramento();
}

function salvarTetoFonte(el) {
    let fonte = el.dataset.fonte;
    let v = parseFloat(el.dataset.valorNumerico);
    if (!isNaN(v) && v > 0) {
        tetosPorFonte[fonte] = v;
    } else {
        delete tetosPorFonte[fonte];
        desfazerTodosSubtetosDaFonte(fonte);
    }
    // Atualiza ícone de status na mesma linha
    let td = el.parentElement.nextElementSibling;
    if (td) td.innerHTML = (tetosPorFonte[fonte] > 0)
        ? '<span style="color:var(--success); font-size:16px;" title="Teto definido">✅</span>'
        : '<span style="color:var(--muted); font-size:16px;" title="Teto não definido">○</span>';
    // Recalcula automaticamente o painel de monitoramento
    atualizarBadgeTetos();
    atualizarSeletorFontePainel();
    atualizarPainelMonitoramento();
    renderizarTabelaTetosPorFonte(false);
}

// ─── Subtetos por Fonte × Grupo de Projetos ───
// Núcleo silencioso (sem alert), reaproveitado tanto pelo botão "Aplicar" quanto
// pela reaplicação automática a cada "Processar Cenário". Só considera os MAPPs
// que batem fonte E grupo ao mesmo tempo (nunca o grupo inteiro da base toda).
// A base do percentual (Necessidade Real 2027) inclui MAPPs já travados,
// igual ao Valor Deliberado — mas a redução só é ESCRITA nos não travados por
// outro motivo (edição manual ou outro subteto).
function aplicarSubtetoGrupoCore(fonte, classe, subtetoValor) {
    let chave = fonte + '||' + classe;
    let doGrupo = dadosProcessados.filter(d => N(d.fonte) === N(fonte) && d.classe === classe);
    if (doGrupo.length === 0) return null;
    let necTotal = doGrupo.reduce((s, d) => s + (d.nec || 0), 0);
    if (necTotal <= 0) return null;
    let pct = Math.min(Math.max(subtetoValor / necTotal, 0), 1);
    let qtdAplicados = 0;
    doGrupo.forEach(d => {
        if (d.foiAjustado && d.subtetoOrigem !== chave) return; // travado por outro motivo — não mexe
        d.necessidade2027Ajustada = d.nec * (1 - pct);
        d.foiAjustado = true;
        d.subtetoOrigem = chave;
        d.origemTravado = 'subteto';
        qtdAplicados++;
    });
    return { pct: pct * 100, qtd: qtdAplicados, necTotal: necTotal };
}

// Botão "Aplicar" de uma linha do grid de subtetos: valida que a soma dos
// subtetos da fonte nunca ultrapassa o Teto da fonte, e aplica e grava o valor
// (persistente entre reprocessamentos).
function aplicarSubteto(fonte, sufixo, idxFonte) {
    let g = GRUPOS_REDUTOR.find(x => x.sufixo === sufixo);
    let el = document.getElementById(`subteto-${idxFonte}-${sufixo}`);
    if (!g || !el) return;
    let novoValor = parseFloat(el.dataset.valorNumerico) || 0;
    if (novoValor <= 0) return alert("Informe um valor de subteto maior que zero.");

    let teto = tetosPorFonte[fonte] || 0;
    let outrosSubtetos = Object.keys(subtetosPorFonteGrupo[fonte] || {})
        .filter(c => c !== g.classe)
        .reduce((s, c) => s + (subtetosPorFonteGrupo[fonte][c] || 0), 0);
    if (outrosSubtetos + novoValor > teto + 0.005) {
        return alert(`A soma dos subtetos desta fonte (${F(outrosSubtetos + novoValor)}) ultrapassaria o Teto Orçamentário definido (${F(teto)}). A soma dos subtetos nunca pode passar do teto da fonte — reduza o valor antes de aplicar.`);
    }

    let r = aplicarSubtetoGrupoCore(fonte, g.classe, novoValor);
    if (!r) return alert("Não há MAPPs elegíveis para este grupo nesta fonte (Necessidade Real 2027 é zero ou não há registros).");

    if (!subtetosPorFonteGrupo[fonte]) subtetosPorFonteGrupo[fonte] = {};
    subtetosPorFonteGrupo[fonte][g.classe] = novoValor;

    recalculoGeralInjetado();
    atualizarResumoRedutor();
    atualizarResumoPLO();
    renderizarTabelaTetosPorFonte(false);
    alert(`Subteto de ${F(novoValor)} aplicado ao grupo ${labelClasse(g.classe)} na fonte ${fonte}: ${r.qtd} MAPP(s) travado(s), com percentual de ${r.pct.toFixed(2)}% sobre a Necessidade Real 2027 do grupo nesta fonte.`);
}

// Botão "✏️ Editar" (desbloqueio de um subteto já aplicado): destrava só os MAPPs
// que foram travados por ESTE subteto específico (identificados via
// subtetoOrigem), revertendo a Necessidade Ajustada deles ao valor que teriam
// sem o subteto (Programado 2027 Ajustado + TRF Ajustada).
function editarSubteto(fonte, classe) {
    if (!confirm(`Isso vai destravar os MAPPs do grupo ${labelClasse(classe)} na fonte ${fonte} que foram travados por este subteto, revertendo a Necessidade Ajustada deles ao valor sem o subteto. Deseja continuar?`)) return;

    let chave = fonte + '||' + classe;
    dadosProcessados.forEach(d => {
        if (d.subtetoOrigem === chave) {
            d.necessidade2027Ajustada = d.programado2027Ajustado + d.trfAj;
            d.foiAjustado = false;
            d.subtetoOrigem = null;
            d.origemTravado = null;
        }
    });
    if (subtetosPorFonteGrupo[fonte]) delete subtetosPorFonteGrupo[fonte][classe];

    recalculoGeralInjetado();
    atualizarResumoRedutor();
    atualizarResumoPLO();
    renderizarTabelaTetosPorFonte(false);
}

// Usado quando o Teto de uma fonte é removido/zerado — não faz sentido manter
// subtetos "órfãos" sem um teto de referência, então desfaz todos os subtetos
// aplicados daquela fonte, destravando os MAPPs correspondentes.
function desfazerTodosSubtetosDaFonte(fonte) {
    if (!subtetosPorFonteGrupo[fonte]) return;
    Object.keys(subtetosPorFonteGrupo[fonte]).forEach(classe => {
        let chave = fonte + '||' + classe;
        dadosProcessados.forEach(d => {
            if (d.subtetoOrigem === chave) {
                d.necessidade2027Ajustada = d.programado2027Ajustado + d.trfAj;
                d.foiAjustado = false;
                d.subtetoOrigem = null;
                d.origemTravado = null;
            }
        });
    });
    delete subtetosPorFonteGrupo[fonte];
    recalculoGeralInjetado();
    atualizarResumoRedutor();
    atualizarResumoPLO();
}

// Renderiza o grid de subtetos de uma fonte com teto definido — um grupo por
// linha, no mesmo padrão visual do Valor Deliberado (grid + botão Aplicar, sem
// recálculo automático a cada tecla).
function renderizarBlocoSubtetos(fonte, idxFonte) {
    let doFonte = dadosProcessados.filter(d => N(d.fonte) === N(fonte));
    let porGrupo = GRUPOS_REDUTOR.map(g => {
        let doGrupo = doFonte.filter(d => d.classe === g.classe);
        let necTotal = doGrupo.reduce((s, d) => s + (d.nec || 0), 0);
        let chave = fonte + '||' + g.classe;
        let subtetoAtual = (subtetosPorFonteGrupo[fonte] && subtetosPorFonteGrupo[fonte][g.classe]) || 0;
        let aplicado = doGrupo.some(d => d.subtetoOrigem === chave);
        return { ...g, qtd: doGrupo.length, necTotal, subtetoAtual, aplicado };
    });

    let h = `<div style="margin:6px 0 10px 14px; padding:10px 14px; border-left:3px solid var(--accent); background:var(--panel2); border-radius:0 8px 8px 0;">
        <div style="font-size:10px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">🎯 Subtetos por Grupo de Projetos — ${fonte} (opcional, não é obrigatório para todos os grupos)</div>
        <table style="width:100%; font-size:12px; border-collapse:collapse;">
            <thead><tr>
                <th style="text-align:left; padding:5px 8px;">Grupo</th>
                <th style="text-align:right; padding:5px 8px;">MAPPs</th>
                <th style="text-align:right; padding:5px 8px;">Necessidade Real 2027</th>
                <th style="text-align:right; padding:5px 8px; width:150px;">Subteto (R$)</th>
                <th style="text-align:right; padding:5px 8px; width:90px;">% Resultante</th>
                <th style="width:100px;"></th>
            </tr></thead><tbody>`;

    porGrupo.forEach(l => {
        let inputId = `subteto-${idxFonte}-${l.sufixo}`;
        let pctResultante = l.necTotal > 0 && l.subtetoAtual > 0 ? (l.subtetoAtual / l.necTotal * 100) : 0;
        let fonteEscapada = fonte.replace(/'/g, "\\'");
        h += `<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:5px 8px;">${labelClasse(l.classe)}</td>
            <td style="padding:5px 8px; text-align:right;">${l.qtd}${l.aplicado ? ' <span style="color:var(--warning); font-size:10px;">🔒</span>' : ''}</td>
            <td style="padding:5px 8px; text-align:right;">${F(l.necTotal)}</td>
            <td style="padding:5px 8px; text-align:right;">
                <input type="text" inputmode="numeric" id="${inputId}" class="input-table" style="width:140px; text-align:right;"
                    value="${formatarMascaraNumerica(l.subtetoAtual)}" data-valor-numerico="${l.subtetoAtual}"
                    oninput="aplicarMascaraNumerica(this)" ${l.aplicado ? 'disabled' : ''}>
            </td>
            <td style="padding:5px 8px; text-align:right;">${pctResultante > 0 ? pctResultante.toFixed(2) + '%' : '—'}</td>
            <td style="padding:5px 8px; text-align:center;">
                ${l.aplicado
                    ? `<button class="btn-mini-export" onclick="editarSubteto('${fonteEscapada}','${l.classe}')" title="Destrava os MAPPs deste grupo/fonte, revertendo a Necessidade Ajustada ao valor sem o subteto.">✏️ Editar</button>`
                    : `<button class="btn-mini-export" onclick="aplicarSubteto('${fonteEscapada}','${l.sufixo}',${idxFonte})">✅ Aplicar</button>`}
            </td>
        </tr>`;
    });

    h += `</tbody></table></div>`;
    return h;
}

function confirmarSalvarCenario() {
    if (dadosBrutos.length === 0) return alert("Importe e processe uma base antes de salvar um cenário.");
    if (confirm("⚠️ ATENÇÃO — SALVAMENTO DE CENÁRIO OFICIAL\n\nEsta operação salva permanentemente na nuvem o cenário atual, incluindo:\n• Base de dados completa (7.300+ registros)\n• Todos os ajustes manuais realizados\n• Parâmetros e tetos definidos\n\nUm cenário salvo é um REGISTRO OFICIAL do planejamento orçamentário e não pode ser editado — apenas excluído.\n\nOs demais cenários existentes NÃO serão afetados.\n\nConfirma o salvamento deste cenário oficial?")) {
        salvarCenarioNuvem();
    }
}

function calcularSaldoTeto() {
    // Os valores de tetosPorFonte já foram persistidos pelo onblur de cada input.
    // Este botão apenas atualiza o seletor e recalcula o painel.
    atualizarBadgeTetos();
    atualizarSeletorFontePainel();
    atualizarPainelMonitoramento();
}

function atualizarSeletorFontePainel() {
    let sel = document.getElementById('mon-fonte-select');
    if (!sel) return;

    let fontesComTeto = Object.keys(tetosPorFonte).filter(f => tetosPorFonte[f] > 0).sort();
    let semTeto = document.getElementById('mon-sem-teto');

    // Preserva seleção atual se ainda válida
    let selAtual = monFonteSelecionada;

    sel.innerHTML = '<option value="">— Selecione uma fonte —</option>';
    fontesComTeto.forEach(f => {
        let opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        if (f === selAtual) opt.selected = true;
        sel.appendChild(opt);
    });

    if (fontesComTeto.length === 0) {
        if (semTeto) semTeto.style.display = 'block';
        monFonteSelecionada = '';
    } else {
        if (semTeto) semTeto.style.display = 'none';
        // Auto-seleciona Tesouro se for a única ou se nada estiver selecionado
        if (!fontesComTeto.includes(monFonteSelecionada)) {
            let tesouro = fontesComTeto.find(f => f.includes('500') && f.includes('501'));
            monFonteSelecionada = tesouro || fontesComTeto[0];
            sel.value = monFonteSelecionada;
        }
    }
}

// Faixa de Indicadores Gerais (sempre visível, independente da aba aberta):
// quando uma Fonte está selecionada no Painel de Monitoramento (mon-fonte-
// select), os cards passam a refletir SOMENTE aquela fonte; sem fonte
// selecionada, voltam a mostrar o total geral (totaisCenarioAtual).
//
// Premissa: nenhum card com o mesmo título pode mostrar valor diferente de
// outro. Necessidade 2027 Ajustada, PLOA 2027 e TRF 2026 Ajustada (e o Saldo
// do Teto, que deriva da Necessidade Ajustada) usam SEMPRE a mesma prévia ao
// vivo do painel de sliders (calcularPreviaSlidersBase) — o mesmo número que
// aparece nos cards "Necessidade Ajustada 2027" / "PLOA 2027" / "TRF 2026
// Ajustada" dos blocos Redutor por Grupo e PLOA 2027. Isso vale mesmo antes de
// clicar "Aplicar"/"Aplicar para Todos"/"Gerar PLOA 2027" — a exibição
// acompanha ao vivo o que está nos campos, sem gravar nada em dadosProcessados
// (só os botões de aplicar gravam de verdade). Função leve (não chama
// recalculoGeralInjetado), por isso pode ser chamada a cada tecla/arrasto.
function atualizarFaixaIndicadoresGerais() {
    let elNec = document.getElementById('fig-nec27');
    if (!elNec) return;
    let elNecAj = document.getElementById('fig-nec27aj');
    let elPloAj = document.getElementById('fig-ploaj');
    let elTrfAj = document.getElementById('mon-trf26aj');
    let elSaldo = document.getElementById('mon-saldo');
    let cardSaldo = document.getElementById('mon-card-saldo');

    if (!monFonteSelecionada) {
        if (!totaisCenarioAtual) return;
        elNec.textContent = F(totaisCenarioAtual.t_nec27 || 0);
        if (elNecAj) elNecAj.textContent = F(totaisCenarioAtual.t_nec27aj || 0);
        if (elPloAj) elPloAj.textContent = F(totaisCenarioAtual.t_ploAj || 0);
        if (elTrfAj) elTrfAj.textContent = '—';
        if (elSaldo) elSaldo.textContent = '—';
        if (cardSaldo) cardSaldo.className = 'mon-card';
        return;
    }

    let normalFonte = N(monFonteSelecionada);
    let gnec27 = 0;
    dadosProcessados.forEach(d => { if (N(d.fonte) === normalFonte) gnec27 += d.nec; });
    // Mesma regra do total geral: exclusões manuais entram na Necessidade Real
    // 2027 (referência do universo original), expurgos automáticos não.
    dadosExcluidos.forEach(d => {
        if (d.isExpurgado) return;
        if (N(d.fonte) !== normalFonte) return;
        gnec27 += d.nec;
    });

    let r = dadosProcessados.length > 0 ? calcularPreviaSlidersBase() : { totalTrfAj: 0, totalNecAj: 0, totalPloa: 0 };

    elNec.textContent = F(gnec27);
    if (elNecAj) elNecAj.textContent = F(r.totalNecAj);
    if (elPloAj) elPloAj.textContent = F(r.totalPloa);
    if (elTrfAj) elTrfAj.textContent = F(r.totalTrfAj);

    if (elSaldo && cardSaldo) {
        let teto = tetosPorFonte[monFonteSelecionada] || 0;
        if (teto > 0) {
            let saldo = teto - r.totalNecAj;
            elSaldo.textContent = F(saldo);
            cardSaldo.className = 'mon-card ' + (saldo >= 0 ? 'mon-card-saldo-pos' : 'mon-card-saldo-neg');
        } else {
            elSaldo.textContent = '—';
            cardSaldo.className = 'mon-card';
        }
    }
}

// Trava de reentrância: calcularIndicadoresFinais() chama
// atualizarPainelMonitoramento() internamente (para refletir a Fonte nos
// cards mon-*), e agora atualizarPainelMonitoramento() também dispara
// recalculoGeralInjetado() (que inclui calcularIndicadoresFinais()) para
// propagar a troca de Fonte para a aba Dashboard e as tabelas Redutor/PLOA —
// sem a trava, isso viraria uma chamada circular infinita.
let _emAtualizacaoPainelMonitoramento = false;
function atualizarPainelMonitoramento() {
    if (_emAtualizacaoPainelMonitoramento) return;
    _emAtualizacaoPainelMonitoramento = true;
    try {
        atualizarPainelMonitoramentoCore();
    } finally {
        _emAtualizacaoPainelMonitoramento = false;
    }
}

function atualizarPainelMonitoramentoCore() {
    let sel = document.getElementById('mon-fonte-select');
    if (sel) monFonteSelecionada = sel.value;

    // Programado 2027 não depende de nenhum percentual de ajuste — é só a soma
    // do Programado 2027 original dos MAPPs da Fonte. TRF 2026 Ajustada, Saldo
    // do Teto (e o Teto em si) são atualizados logo abaixo, dentro de
    // atualizarFaixaIndicadoresGerais() — mesma prévia ao vivo usada pelos
    // cards de mesmo título no painel de sliders, para nunca divergirem.
    let gp27 = 0;
    if (monFonteSelecionada) {
        let normalFonte = N(monFonteSelecionada);
        dadosProcessados.forEach(d => { if (N(d.fonte) === normalFonte) gp27 += d.p27; });
    }
    document.getElementById('mon-p27').innerText = monFonteSelecionada ? F(gp27) : '—';

    let teto = tetosPorFonte[monFonteSelecionada] || 0;
    document.getElementById('mon-teto').innerText = teto > 0 ? F(teto) : '—';

    atualizarGaugeTeto();
    atualizarFaixaIndicadoresGerais();
    atualizarVisibilidadeSeletorFonte();
    // A partir de checkFiltroMulti('dash') passar a filtrar pela Fonte
    // selecionada, TUDO que depende dela precisa re-renderizar ao trocar de
    // Fonte: a aba Consolidação e Dashboard inteira (cards, grids, gráficos),
    // e as tabelas Redutor por Grupo / PLOA 2027 (cujos painéis de prévia dos
    // sliders são atualizados de graça, no fim de cada uma delas).
    if (typeof recalculoGeralInjetado === 'function') recalculoGeralInjetado();
    if (typeof atualizarResumoRedutor === 'function') atualizarResumoRedutor();
    if (typeof atualizarResumoPLO === 'function') atualizarResumoPLO();
}

// Distribui o Saldo do Teto (positivo ou negativo) proporcionalmente entre todos
// os MAPPs elegíveis da fonte selecionada no Painel de Monitoramento, somando a
// cada um sua fatia proporcional do saldo (conforme sua participação na soma da
// Necessidade 2027 Ajustada) diretamente na própria Necessidade 2027 Ajustada —
// não existem mais colunas separadas de "antes/depois". Diferente do que foi
// tentado antes, isso NÃO trava os MAPPs — travamento só existe por exclusão/
// remoção do MAPP ou por digitação manual direta no campo Necessidade Ajustada.
// Como consequência, o efeito da distribuição é reaplicado sobre a base
// recalculada a cada "Processar Cenário" (não fica congelado num valor fixo),
// exatamente como qualquer outro percentual de ajuste em massa.
function distribuirSaldoTeto() {
    if (!monFonteSelecionada) { alert('Selecione uma Fonte no Painel de Monitoramento antes de distribuir o saldo.'); return; }
    let teto = tetosPorFonte[monFonteSelecionada] || 0;
    if (teto <= 0) { alert('A Fonte selecionada não tem Teto Orçamentário definido.'); return; }

    let normalFonte = N(monFonteSelecionada);
    let mappsDaFonte = dadosProcessados.filter(d => N(d.fonte) === normalFonte);
    if (mappsDaFonte.length === 0) { alert('Nenhum MAPP encontrado para essa Fonte.'); return; }

    // MAPPs já travados (edição manual ou Subteto) ficam de fora — tanto do
    // cálculo do total quanto do recebimento da distribuição. O fator é
    // recalculado só sobre os elegíveis, de forma que travados + elegíveis
    // ajustados somem exatamente o Teto (saldo = 0).
    let mappsTravados = mappsDaFonte.filter(d => d.foiAjustado);
    let mappsElegiveis = mappsDaFonte.filter(d => !d.foiAjustado);

    if (mappsElegiveis.length === 0) { alert('Todos os MAPPs desta Fonte estão travados — não há nada para distribuir.'); return; }

    let totalNecAjTravados = mappsTravados.reduce((s, d) => s + d.necessidade2027Ajustada, 0);
    let totalNecAjElegiveis = mappsElegiveis.reduce((s, d) => s + d.necessidade2027Ajustada, 0);
    let totalNecAj = totalNecAjTravados + totalNecAjElegiveis;
    let saldo = teto - totalNecAj;

    if (Math.abs(saldo) < 0.005) { alert('O saldo já está zerado para essa Fonte — nada para distribuir.'); return; }
    if (totalNecAjElegiveis === 0) { alert('Não é possível distribuir: a soma da Necessidade 2027 Ajustada dos MAPPs elegíveis (não travados) dessa Fonte é zero.'); return; }

    let fator = (teto - totalNecAjTravados) / totalNecAjElegiveis;

    let msgTravados = mappsTravados.length > 0 ? `\n\n🔒 ${mappsTravados.length} MAPP(s) já travado(s) ficam de fora e mantêm seu valor.` : '';
    if (!confirm(`Isso vai somar a fatia proporcional do saldo de ${F(saldo)} à Necessidade 2027 Ajustada de cada um dos ${mappsElegiveis.length} MAPP(s) elegíveis da fonte "${monFonteSelecionada}" (conforme a participação de cada um), zerando o saldo do Teto.${msgTravados}\n\nEsses MAPPs NÃO ficam travados — continuam sujeitos a Parametrização por Estágio, Valor Deliberado, Redutor do PLOA e a um novo "Processar Cenário" (que recalcula a Necessidade Ajustada do zero, então este efeito precisa ser reaplicado depois de qualquer reprocessamento). Deseja continuar?`)) return;

    mappsElegiveis.forEach(d => {
        d.necessidade2027Ajustada = d.necessidade2027Ajustada * fator;
    });

    recalculoGeralInjetado();
    atualizarPainelMonitoramento();
    alert(`Saldo distribuído com sucesso!\n\nFator aplicado: ${(fator * 100).toFixed(2)}%${msgTravados}\n\nOs ${mappsElegiveis.length} MAPP(s) elegíveis tiveram o novo valor somado à Necessidade 2027 Ajustada, sem ficar travados.`);
}

// Modal pós-carga de dados
function exibirModalTeto(qtdRegistros) {
    let modal = document.getElementById('modal-teto-carga');
    if (!modal) { return; }

    let resumoEl = document.getElementById('modal-teto-resumo');
    let anteriorEl = document.getElementById('modal-teto-anterior');
    let inputEl = document.getElementById('modal-input-teto');

    resumoEl.innerHTML = `<strong>${qtdRegistros.toLocaleString('pt-BR')}</strong> registros processados.<br>Defina ou confirme o teto orçamentário para a fonte <strong>(500)-(501) Tesouro</strong>.`;

    let fonteTesouro = Object.keys(tetosPorFonte).find(f => f.includes('500') && f.includes('501')) || '';
    let tetoAnterior = fonteTesouro ? tetosPorFonte[fonteTesouro] : 0;

    if (tetoAnterior > 0) {
        anteriorEl.style.display = 'block';
        anteriorEl.innerHTML = `📌 Teto anterior: <strong>${F(tetoAnterior)}</strong> — confirme ou altere o valor acima.`;
        inputEl.value = formatarMascaraNumerica(tetoAnterior);
        inputEl.dataset.valorNumerico = tetoAnterior;
    } else {
        anteriorEl.style.display = 'none';
        inputEl.value = '';
        inputEl.dataset.valorNumerico = 0;
    }

    modal.style.display = 'flex';
    setTimeout(() => { inputEl.focus(); inputEl.select(); }, 0);
}

function fecharModalTeto(confirmar) {
    let modal = document.getElementById('modal-teto-carga');
    if (modal) modal.style.display = 'none';

    if (confirmar) {
        let inputEl = document.getElementById('modal-input-teto');
        let v = parseFloat(inputEl ? inputEl.dataset.valorNumerico : 0);
        if (!isNaN(v) && v > 0) {
            // Encontra a fonte Tesouro na base e associa o teto
            let fontes = new Set();
            dadosProcessados.forEach(d => { if (d.fonte) fontes.add(d.fonte.trim()); });
            let fonteTesouro = Array.from(fontes).find(f => f.includes('500') && f.includes('501'));
            if (fonteTesouro) {
                tetosPorFonte[fonteTesouro] = v;
            } else {
                tetosPorFonte['(500)-(501) Tesouro'] = v;
            }
            // Teto definido no carregamento inicial: leva o usuário direto para a
            // etapa 2 da trilha ("Previsão de Empenho por Estágio"), como se tivesse
            // clicado em "Próximo" — evita ele ter que navegar manualmente a partir
            // da etapa 1 (Teto e Subteto por Fonte), que acabou de concluir aqui.
            if (typeof proximoEtapaImp === 'function') proximoEtapaImp();
        }
    }

    renderizarTabelaTetosPorFonte(false); // mantém o bloco recolhido, mesmo após confirmar o teto
    atualizarSeletorFontePainel();
    atualizarPainelMonitoramento();
}

function recalculoGeralInjetado() {
    calcularIndicadoresFinais(); 
    renderizarGestao(1); 
    renderizarConsolidados(); 
    renderizarLixeira();
    renderizarGridOrgaoClasse();
    renderizarGridOrgaoClassePLO();
    renderizarGridOrgaoClassePLOAjustado();
    renderizarPLODetalhado();
}

// Snapshot do Cenário Original: congelado na primeira carga da base.
// Resetado apenas quando uma nova base é importada via importar() ou carregarJSON()/nuvem.
function atualizarDashboardZerado() {
    document.getElementById('d-total-base').innerText = '0';
    document.getElementById('d-qtd').innerText = '0';
    document.getElementById('d-expurgados').innerText = '0';
    document.getElementById('d-excluidos-manual').innerText = '0';
    document.getElementById('d-mapp-ajustados').innerText = '0';
    ['d-limite26', 'd-p26', 'd-emp26', 'd-pago26', 'd-prev26', 'd-trf26', 'd-nec27', 'd-nec27aj'].forEach(id => {
        document.getElementById(id).innerText = 'R$ 0,00';
    });
    document.getElementById('d-prev26aj').innerText = '—';
    document.getElementById('d-trf26aj').innerText = '—';
    document.getElementById('d-plo2027').innerText = '—';
    document.getElementById('d-plo2027aj').innerText = '—';
    ['fig-nec27', 'fig-nec27aj', 'fig-ploaj'].forEach(id => {
        let el = document.getElementById(id);
        if (el) el.textContent = '—';
    });
    document.getElementById('tab-classificacao').innerHTML = '';
    document.getElementById('tab-dash-secretaria').innerHTML = '';
    document.getElementById('tab-dash-orgaos').innerHTML = '';
    document.getElementById('tab-grid-orgao-classe').innerHTML = '';
    document.getElementById('tab-grid-orgao-classe-plo').innerHTML = '';
    document.getElementById('tab-grid-orgao-classe-ploaj').innerHTML = '';
}

// Indicador global único "houve ajuste": true se qualquer parametrização de
// Estágio estiver diferente do padrão da regra vigente, se algum grupo tiver
// Valor Deliberado aplicado, ou se existir ao menos 1 MAPP travado (manual ou
// via Subteto — ambos usam o mesmo campo foiAjustado). Usado de forma
// consistente pelos 4 cards que hoje decidiam isso cada um à sua própria
// maneira (Previsão de Empenho Ajustada, TRF Ajustada, Necessidade Ajustada do
// Cenário Ajustado e Necessidade Ajustada do Painel de Monitoramento).
function calcularHouveAjusteGlobal() {
    let defaults = { 'p-conveniado': 20, 'p-licitado': 20, 'p-emlicitacao': 15, 'p-contratado': 20, 'p-preparatorias': 5, 'p-naoiniciado': 0 };
    let estagioDiferente = Object.keys(defaults).some(id => {
        let el = document.getElementById(id);
        return el && V(el.value) !== defaults[id];
    });
    let porFonteAtual = prevEmpAjustesPreservados[N(monFonteSelecionada)];
    let temValorParadigma = !!(porFonteAtual && Object.keys(porFonteAtual).length > 0);
    let temMappTravado = dadosProcessados.some(d => d.foiAjustado);
    return estagioDiferente || temValorParadigma || temMappTravado;
}

// Chamada ao alterar qualquer percentual de Parametrização por Estágio: antes,
// só o "Processar Cenário" manual ou o Valor Deliberado recalculavam a tela — o
// usuário esperava (corretamente) que mudar o % de Estágio também recalculasse
// na hora a Previsão de Empenho Ajustada, TRF Ajustada e Necessidade Ajustada.
// Reaproveita processarDados() (mesmo cálculo do botão manual), só evitando o
// alerta de "importe um arquivo" quando ainda não há base carregada.
function onChangeEstagioPercentual() {
    if (dadosBrutos.length === 0) return;
    processarDados();
}

function calcularIndicadoresFinais() {
    let t_p26=0, t_prev26=0, t_prev26aj=0, t_trf26=0, t_trf26aj=0, t_p27=0, t_nec27=0, t_p27aj=0, t_nec27aj=0;
    let t_plo=0, t_ploAj=0;
    let t_l26=0, t_e26=0, t_pg26=0;
    let classeAgrup = {};
    let qtdFiltrada = 0;
    let qtdMappAjustados = 0;
    let temAjuste = false;

    dadosProcessados.forEach(d => {
        if (!checkFiltroMulti(d, 'dash')) return;

        qtdFiltrada++;
        t_p26 += d.p26; t_prev26 += d.prevEmp; t_prev26aj += d.prevEmpAjustada; t_trf26 += d.trf;
        t_trf26aj += d.trfAj; t_p27 += d.p27; t_nec27 += d.nec;
        t_p27aj += d.programado2027Ajustado; t_nec27aj += d.necessidade2027Ajustada;
        t_plo += (d.plo2027 || 0); t_ploAj += (d.plo2027Ajustado || 0);
        t_l26 += d.l26; t_e26 += d.e26; t_pg26 += d.pg26;
        if (d.ajusteAtivo) temAjuste = true;
        if (d.foiAjustado) qtdMappAjustados++;

        if(!classeAgrup[d.classe]) {
            classeAgrup[d.classe] = { classe: d.classe, p26:0, prev:0, prevAj:0, trf:0, trfAj:0, p27:0, nec:0, necAj:0, qtd:0, temAjuste:false };
        }
        classeAgrup[d.classe].p26 += d.p26; classeAgrup[d.classe].prev += d.prevEmp; classeAgrup[d.classe].prevAj += d.prevEmpAjustada;
        classeAgrup[d.classe].trf += d.trf; classeAgrup[d.classe].trfAj += d.trfAj;
        classeAgrup[d.classe].p27 += d.p27; classeAgrup[d.classe].nec += d.nec;
        classeAgrup[d.classe].necAj += d.necessidade2027Ajustada;
        classeAgrup[d.classe].qtd++;
        if (d.ajusteAtivo) classeAgrup[d.classe].temAjuste = true;
    });

    // Inclui exclusões manuais no t_nec27 para que o card Necessidade Real 2027
    // permaneça como referência do universo original filtrado, independente de exclusões.
    // Expurgos automáticos (isExpurgado=true) não entram — eram inválidos desde o início.
    dadosExcluidos.forEach(d => {
        if (d.isExpurgado) return;
        if (!checkFiltroMulti(d, 'dash')) return;
        t_nec27 += d.nec;
    });

    document.getElementById('d-total-base').innerText = totalRegistrosBase;
    document.getElementById('d-qtd').innerText = qtdFiltrada;
    document.getElementById('d-expurgados').innerText = totalRegistrosExpurgados;
    document.getElementById('d-excluidos-manual').innerText = dadosExcluidos.filter(d => !d.isExpurgado).length;
    document.getElementById('d-mapp-ajustados').innerText = qtdMappAjustados;

    // Cenário Original 2026: dado bruto da planilha, sem cálculo (Limite, Programado, Empenhado, Pago)
    document.getElementById('d-limite26').innerText = F(t_l26);
    document.getElementById('d-p26').innerText       = F(t_p26);
    document.getElementById('d-emp26').innerText     = F(t_e26);
    document.getElementById('d-pago26').innerText    = F(t_pg26);

    // Cenário Ajustado: tudo que é resultado de cálculo (original e ajustado, juntos)
    let houveAjuste = calcularHouveAjusteGlobal();
    document.getElementById('d-prev26').innerText = F(t_prev26);
    document.getElementById('d-prev26aj').innerText = houveAjuste ? F(t_prev26aj) : '—';
    document.getElementById('d-trf26').innerText  = F(t_trf26);
    document.getElementById('d-nec27').innerText  = F(t_nec27);
    document.getElementById('d-nec27aj').innerText = houveAjuste ? F(t_nec27aj) : '—';
    document.getElementById('d-trf26aj').innerText = houveAjuste ? F(t_trf26aj) : '—';
    document.getElementById('d-plo2027').innerText = ploGerado ? F(t_plo) : '—';
    document.getElementById('d-plo2027aj').innerText = ploGerado ? F(t_ploAj) : '—';

    // Guarda os totais atuais para reuso nos gráficos comparativos (aba
    // Comparativos do Dashboard) — evita recalcular tudo de novo lá.
    totaisCenarioAtual = { t_prev26, t_prev26aj, t_trf26, t_trf26aj, t_nec27, t_nec27aj, t_plo, t_ploAj, houveAjuste };
    atualizarFaixaIndicadoresGerais();
    renderizarComparativoEtapas();
    renderizarCascataDashboard();

    // Painel de Monitoramento: filtra pela fonte selecionada no painel (auto-contido)
    atualizarPainelMonitoramento();

    // Detecta qualquer tipo de ajuste que altere a Necessidade Real 2027
    let temNecAjustada = Math.abs(t_nec27 - t_nec27aj) > 0.005;

    let listaAgrupada = ordenarDados(Object.values(classeAgrup), ordenacaoAtiva.classificacao);

    let h = `<table><thead><tr>
        <th onclick="alternarOrdenacao('classificacao', 'classe')">Classificação Hierárquica</th>
        <th onclick="alternarOrdenacao('classificacao', 'qtd')">Qtd</th>
        <th onclick="alternarOrdenacao('classificacao', 'p26')">Programado 2026</th>
        <th onclick="alternarOrdenacao('classificacao', 'prev')">Previsão Empenho</th>
        <th onclick="alternarOrdenacao('classificacao', 'prevAj')">Previsão Empenho Ajustada</th>
        <th onclick="alternarOrdenacao('classificacao', 'trf')">TRF 2026</th>
        <th onclick="alternarOrdenacao('classificacao', 'trfAj')">TRF 2026 Ajustada</th>
        <th onclick="alternarOrdenacao('classificacao', 'p27')">Programado 2027</th>
        <th onclick="alternarOrdenacao('classificacao', 'nec')">Necessidade Real 2027</th>
        <th onclick="alternarOrdenacao('classificacao', 'necAj')">Necessidade 2027 Ajustada</th>
    </tr></thead><tbody>`;
    
    if(listaAgrupada.length === 0) h += `<tr><td colspan="10" style="text-align:center;color:var(--muted)">Nenhum registro ativo nos filtros selecionados.</td></tr>`;

    listaAgrupada.forEach(v => {
        let prevAjCell = temAjuste
            ? `<td style="color:#a29bfe;font-weight:${v.temAjuste?'700':'400'}">${F(v.prevAj)}</td>`
            : `<td style="color:var(--muted)">—</td>`;
        let trfAjCell = temAjuste
            ? `<td style="color:#a29bfe;font-weight:${v.temAjuste?'700':'400'}">${F(v.trfAj)}</td>`
            : `<td style="color:var(--muted)">—</td>`;
        let necAjCell = temNecAjustada
            ? `<td style="color:#a29bfe;font-weight:700">${F(v.necAj)}</td>`
            : `<td style="color:var(--muted)">-</td>`;
        h += `<tr><td>${badgeClasse(v.classe)}</td><td>${v.qtd}</td><td>${F(v.p26)}</td><td>${F(v.prev)}</td>${prevAjCell}<td>${F(v.trf)}</td>${trfAjCell}<td>${F(v.p27)}</td><td class="text-success" style="font-weight:700">${F(v.nec)}</td>${necAjCell}</tr>`;
    });
    h += `</tbody><tfoot><tr><td>TOTAL FILTRADO</td><td>${qtdFiltrada}</td><td>${F(t_p26)}</td><td>${F(t_prev26)}</td><td>${temAjuste ? F(t_prev26aj) : '—'}</td><td>${F(t_trf26)}</td><td>${temAjuste ? F(t_trf26aj) : '—'}</td><td>${F(t_p27)}</td><td class="text-success">${F(t_nec27)}</td><td>${temNecAjustada ? F(t_nec27aj) : '-'}</td></tr></tfoot></table>`;
    document.getElementById('tab-classificacao').innerHTML = h;
    renderizarGraficos();
}

