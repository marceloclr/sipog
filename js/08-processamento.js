// SIPOG COFIP — js/08-processamento.js
// Painel de Ajustes Realizados, Premissas do Sistema e o núcleo processarDados().
// Script clássico (escopo global). Ordem de carga definida em index.html — não reordenar.
// Painel "Ajustes Realizados": mostra tudo que difere do padrão do sistema na
// sessão/cenário atualmente carregado — cenário de simulação, tetos e
// subtetos por fonte, MAPPs excluídos manualmente, percentuais de estágio
// alterados, redutores ativos, PLOA 2027 gerado/cascata, saldo distribuído e
// travamentos de Necessidade 2027 Ajustada (manual, subteto ou saldo).
// Monta os dados de "Ajustes Realizados" — usado tanto pelo painel de hover
// quanto pelo Relatório PDF, para garantir que os dois sempre mostrem o mesmo
// conteúdo, sem duplicar a lógica.
function montarDadosAjustesRealizados() {
    let secoes = [];
    let qtdAjustesAtivos = 0;

    let cenarioEl = document.getElementById('cenario-opcao');
    if (cenarioEl && cenarioEl.value !== 'PADRAO') {
        let nomes = { REDUCAO_10: 'Redução de 10% no Limite (Em Execução)', ZERA_CRITICO: 'Zera Empenho Crítico (Em Execução)' };
        secoes.push({ titulo: '🎯 Cenário de Simulação', itens: [nomes[cenarioEl.value] || cenarioEl.value] });
        qtdAjustesAtivos++;
    }

    let fontesComTeto = Object.keys(tetosPorFonte).filter(f => tetosPorFonte[f] > 0);
    if (fontesComTeto.length > 0) {
        secoes.push({ titulo: '💰 Tetos por Fonte definidos', itens: fontesComTeto.map(f => `${f}: ${F(tetosPorFonte[f])}`) });
        qtdAjustesAtivos++;
    } else {
        secoes.push({ titulo: '💰 Tetos por Fonte definidos', itens: [], vazio: 'Nenhum teto definido' });
    }

    // Subtetos por Fonte × Grupo de Projetos
    let itensSubteto = [];
    Object.keys(subtetosPorFonteGrupo).forEach(fonte => {
        Object.keys(subtetosPorFonteGrupo[fonte]).forEach(classe => {
            let valor = subtetosPorFonteGrupo[fonte][classe];
            if (valor > 0) itensSubteto.push(`${fonte} — ${labelClasse(classe)}: ${F(valor)}`);
        });
    });
    if (itensSubteto.length > 0) {
        secoes.push({ titulo: '🎯 Subtetos aplicados (Fonte × Grupo)', itens: itensSubteto });
        qtdAjustesAtivos++;
    } else {
        secoes.push({ titulo: '🎯 Subtetos aplicados (Fonte × Grupo)', itens: [], vazio: 'Nenhum subteto definido' });
    }

    if (dadosExcluidos.length > 0) {
        secoes.push({ titulo: '🗑️ MAPPs excluídos manualmente', itens: [`${dadosExcluidos.length} MAPP(s) na lixeira`] });
        qtdAjustesAtivos++;
    } else {
        secoes.push({ titulo: '🗑️ MAPPs excluídos manualmente', itens: [], vazio: 'Nenhum MAPP excluído' });
    }

    let diferentesEstagio = [];
    for (let k in DEFAULTS_PARAMETROS.estagios) {
        let el = document.getElementById(k);
        if (el && V(el.value) !== DEFAULTS_PARAMETROS.estagios[k]) {
            diferentesEstagio.push(`${el.closest('tr').querySelector('td').innerText}: ${el.value}% (padrão ${DEFAULTS_PARAMETROS.estagios[k]}%)`);
        }
    }
    if (diferentesEstagio.length > 0) {
        secoes.push({ titulo: '⚙️ Parametrização por Estágio alterada', itens: diferentesEstagio });
        qtdAjustesAtivos++;
    } else {
        secoes.push({ titulo: '⚙️ Parametrização por Estágio alterada', itens: [], vazio: 'Todos os percentuais no padrão' });
    }

    let redutoresAtivos = GRUPOS_REDUTOR.filter(g => (obterPctPreservado(monFonteSelecionada, g.classe) || 0) > 0)
        .map(g => `${g.label}: ${obterPctPreservado(monFonteSelecionada, g.classe)}%`);
    if (redutoresAtivos.length > 0) {
        secoes.push({ titulo: '🎯 Valor Deliberado aplicado (Previsão de Empenho)', itens: redutoresAtivos });
        qtdAjustesAtivos++;
    } else {
        secoes.push({ titulo: '🎯 Valor Deliberado aplicado (Previsão de Empenho)', itens: [], vazio: 'Nenhum percentual aplicado' });
    }

    // PLOA 2027: geração + percentual do Redutor do PLOA por grupo (lidos
    // diretamente dos campos da tela, já que não há botão "Aplicar" por grupo
    // aqui — um único botão gera/reaplica em cascata para todos de uma vez).
    if (ploGerado) {
        let itensPlo = [`Gerado em ${ploDataGeracao ? ploDataGeracao.toLocaleString('pt-BR') : '—'}`];
        GRUPOS_PLO.forEach(g => {
            let el = document.getElementById('plo-' + g.sufixo);
            let pct = el ? V(el.value) : 0;
            if (pct > 0) itensPlo.push(`${g.label}: ${pct}% (Redutor do PLOA)`);
        });
        secoes.push({ titulo: '🔒 PLOA 2027 gerado', itens: itensPlo });
        qtdAjustesAtivos++;
    } else {
        secoes.push({ titulo: '🔒 PLOA 2027 gerado', itens: [], vazio: 'PLOA 2027 ainda não foi gerado' });
    }

    // Necessidade 2027 Ajustada travada — detalha por origem (edição manual ou
    // Subteto). Distribuir Saldo NÃO trava — só edição manual (ou exclusão) e
    // Subteto usam o campo foiAjustado.
    let travados = dadosProcessados.filter(d => d.foiAjustado);
    if (travados.length > 0) {
        let qtdManual = travados.filter(d => (d.origemTravado || 'manual') === 'manual').length;
        let qtdSubteto = travados.filter(d => d.origemTravado === 'subteto').length;
        let itensTravado = [];
        if (qtdManual > 0) itensTravado.push(`${qtdManual} MAPP(s) por edição manual`);
        if (qtdSubteto > 0) itensTravado.push(`${qtdSubteto} MAPP(s) por Subteto (Fonte × Grupo)`);
        secoes.push({ titulo: '✏️ Necessidade 2027 Ajustada travada', itens: itensTravado });
        qtdAjustesAtivos++;
    } else {
        secoes.push({ titulo: '✏️ Necessidade 2027 Ajustada travada', itens: [], vazio: 'Nenhum MAPP travado' });
    }

    return { secoes, qtdAjustesAtivos };
}

function atualizarPainelAjustesRealizados() {
    let painel = document.getElementById('painel-ajustes-realizados');
    let badge = document.getElementById('badge-ajustes-count');
    if (!painel || !badge) return;

    if (dadosBrutos.length === 0) {
        painel.innerHTML = '<div class="ai-vazio">Carregue uma base para ver os ajustes ativos.</div>';
        badge.style.display = 'none';
        return;
    }

    let { secoes, qtdAjustesAtivos } = montarDadosAjustesRealizados();

    let h = '<h4>Ajustes Realizados nesta Sessão</h4>';
    secoes.forEach(s => {
        h += `<div class="ai-secao"><div class="ai-secao-titulo">${s.titulo}</div>`;
        if (s.itens.length > 0) {
            s.itens.forEach(it => h += `<div class="ai-item">• ${it}</div>`);
        } else {
            h += `<div class="ai-vazio">${s.vazio}</div>`;
        }
        h += '</div>';
    });
    painel.innerHTML = h;

    if (qtdAjustesAtivos > 0) {
        badge.style.display = 'inline-block';
        badge.innerText = qtdAjustesAtivos;
    } else {
        badge.style.display = 'none';
    }
}

// Conteúdo das Premissas do Sistema — dado estruturado, usado tanto pelo painel
// de hover quanto pelo Relatório PDF.
const PREMISSAS_SISTEMA = [
    {
        titulo: '1ª prioridade — Grupos Estratégicos',
        itens: ['Contrato Gestão, Continuidade, PCF Convênio, Operação Crédito → sempre 100% do Programado 2026 (fixo, sem transferência), independente do estágio. Só Demais Projetos (classificação padrão) segue para a 2ª prioridade. O grupo Entrega Prioritária foi ocultado do sistema (expurgo automático).']
    },
    {
        titulo: '2ª prioridade — Estágio de Execução',
        itens: [
            'Conveniado, Licitado, Contratado (20%*), Em Licitação (15%*), Ativ. Preparatórias (5%*): se Limite 2026 = 0, aplica a taxa*; senão usa o Limite 2026.',
            'Não Iniciado: Programado × taxa configurável (0%* padrão).',
            'Paralisado: fixo = Empenhado 2026.',
            'Execução Física Concluída: fixo = Limite 2026.',
            'Execução Físic/Finan,Concluída: fixo = 100% do Programado 2026.',
            'Em Execução: Empenhado=0 → Limite 2026; Empenhado < 40%* do Programado → (Empenhado/5)×12; Empenhado ≥ 40%* → Programado 2026.',
            'Não Definido / Não Informado / estágio não reconhecido: 100% do Programado (padrão de segurança).',
            'Cancelado / Transferido / Concluído: excluído do cálculo inteiramente.',
            '* valores padrão de fábrica — veja "Ajustes Realizados" para o que está configurado agora.'
        ]
    },
    {
        titulo: 'Cálculo final',
        itens: [
            'TRF 2026 = Programado 2026 − Empenho Previsto.',
            'Necessidade Real 2027 = Programado 2027 + TRF 2026.',
            'Necessidade 2027 Ajustada = Programado 2027 + (TRF 2026 recalculada a partir da Previsão de Empenho 2026 Ajustada, se um Valor Deliberado tiver sido aplicado).'
        ]
    }
];

// Painel "Premissas do Sistema": explica as regras embutidas no código, aplicadas
// antes de qualquer ajuste do usuário — conteúdo fixo, não depende dos dados carregados.
function renderizarPainelPremissasSistema() {
    let painel = document.getElementById('painel-premissas-sistema');
    if (!painel) return;
    let h = '<h4>Premissas do Sistema</h4>';
    PREMISSAS_SISTEMA.forEach(s => {
        h += `<div class="ai-secao"><div class="ai-secao-titulo">${s.titulo}</div>`;
        s.itens.forEach(it => h += `<div class="ai-item">• ${it}</div>`);
        h += '</div>';
    });
    painel.innerHTML = h;
}

function processarDados() {
    if (dadosBrutos.length === 0) return alert("Importe um arquivo antes de processar.");

    // Preserva o PLOA 2027 já gerado (se houver) por idOriginal — Processar Cenário
    // não trava mais nada nem apaga o PLOA: só o botão "Gerar Valores de PLOA 2027" /
    // "Aplicar Novo Ajuste ao PLOA 2027" escreve nesses campos.
    let ploPreservado = {};
    dadosProcessados.forEach(d => {
        if (d.plo2027 !== null && d.plo2027 !== undefined) {
            ploPreservado[d.idOriginal] = { plo2027: d.plo2027, plo2027Ajustado: d.plo2027Ajustado };
        }
    });

    // Preserva ajustes manuais de "Necessidade 2027 Ajustada" feitos antes de reprocessar
    let ajustesPreservados = {};
    dadosProcessados.forEach(d => {
        if (d.foiAjustado) ajustesPreservados[d.idOriginal] = { valor: d.necessidade2027Ajustada, origem: d.origemTravado || 'manual' };
    });
    dadosExcluidos.forEach(d => {
        if (d.foiAjustado) ajustesPreservados[d.idOriginal] = { valor: d.necessidade2027Ajustada, origem: d.origemTravado || 'manual' };
    });

    // Preserva os IDs das exclusões manuais feitas pelo usuário (não os expurgos automáticos)
    // para reaplicá-las após reprocessar a base do zero.
    let exclusoesManuaisPreservadas = dadosExcluidos
        .filter(d => !d.isExpurgado)
        .map(d => d.idOriginal);

    dadosProcessados = [];
    dadosExcluidos = [];
    totalRegistrosExpurgados = 0;
    
    // Fatores de Estágios
    let p_conve = V(document.getElementById('p-conveniado').value) / 100;
    let p_licit = V(document.getElementById('p-licitado').value) / 100;
    let p_emlic = V(document.getElementById('p-emlicitacao').value) / 100;
    let p_contr = V(document.getElementById('p-contratado').value) / 100;
    let p_prepa = V(document.getElementById('p-preparatorias').value) / 100;
    let p_naoin = V(document.getElementById('p-naoiniciado').value) / 100;
    // PARALISADO não usa mais taxa: Empenho Previsto = Empenhado 2026 (regra fixa, confirmada)

    // Percentuais PADRÃO da regra vigente — sempre os valores oficiais
    // (DEFAULTS_PARAMETROS.estagios), nunca os que estão nos campos da tela.
    // Usados exclusivamente para calcular a Necessidade Real 2027 (CALCULADA), que
    // deve permanecer imune a qualquer alteração de % de Estágio feita pelo
    // usuário — só a Necessidade Real 2027 AJUSTADA reflete a parametrização atual.
    let pP_conve = DEFAULTS_PARAMETROS.estagios['p-conveniado'] / 100;
    let pP_licit = DEFAULTS_PARAMETROS.estagios['p-licitado'] / 100;
    let pP_emlic = DEFAULTS_PARAMETROS.estagios['p-emlicitacao'] / 100;
    let pP_contr = DEFAULTS_PARAMETROS.estagios['p-contratado'] / 100;
    let pP_prepa = DEFAULTS_PARAMETROS.estagios['p-preparatorias'] / 100;
    let pP_naoin = DEFAULTS_PARAMETROS.estagios['p-naoiniciado'] / 100;

    // Redutor de Previsão de Empenho 2026 (bloco "Valor Deliberado Máximo do Empenho
    // 2026 por Grupo de Projetos") — vale para todos os grupos, sem particularidade.
    // O percentual de cada grupo só é reaplicado aqui se já tiver sido confirmado
    // antes via botão "Aplicar" (preservado em prevEmpAjustesPreservados), e SOMENTE
    // para registros da própria Fonte em que o percentual foi aplicado — premissa do
    // projeto: apenas a Fonte selecionada no momento do "Aplicar" tem valores
    // alterados, nunca as demais. Cada linha (r.FONTE) consulta seu próprio fator.
    function pc_factor(fonte, classe) {
        let pct = obterPctPreservado(fonte, classe);
        return (typeof pct === 'number') ? pct / 100 : 0;
    }


    let cenario = document.getElementById('cenario-opcao').value;

    dadosBrutos.forEach((r, idx) => {
        let estagio = N(r.ESTAGIO_EXECUCAO || r.ESTAGIO_EXECUCAO);
        let classe = classificarRegistro(r);
        let p26 = V(r.VLR_PROGRAMADO_2026), l26 = V(r.VLR_LIMITE_2026), e26 = V(r.VLR_EMPENHADO_2026), pg26 = V(r.VLR_PAGO_2026), p27 = V(r.VLR_PROGRAMADO_2027);

        if (estagio.includes('CONCLUIDO') || estagio.includes('CANCELADO') || estagio.includes('TRANSFERIDO')) {
            totalRegistrosExpurgados++;
            let motivoExpurgo = "EXPURGO: ";
            if(estagio.includes('CONCLUIDO')) motivoExpurgo += "MAPP CONCLUÍDO";
            if(estagio.includes('CANCELADO')) motivoExpurgo += "MAPP CANCELADO";
            if(estagio.includes('TRANSFERIDO')) motivoExpurgo += "MAPP TRANSFERIDO";

            dadosExcluidos.push({
                idOriginal: idx, mapp: r.MAPP || 'SEM MAPP', secretaria: r.SECRETARIA || 'NÃO INFORMADO', orgao: r.ORGAO || 'NÃO INFORMADO',
                fonte: r.FONTE || 'NÃO INFORMADA', estagio: labelEstagio(estagio), p26: p26, p27: p27, classe: classe,
                isExpurgado: true, regra: motivoExpurgo
            });
            return; 
        }

        // Grupo Entrega Prioritária foi ocultado do sistema — tratado como expurgo
        // automático, igual a Concluído/Cancelado/Transferido: sai do cenário ativo.
        if (classe === 'ENTREGA_PRIORITARIA') {
            totalRegistrosExpurgados++;
            dadosExcluidos.push({
                idOriginal: idx, mapp: r.MAPP || 'SEM MAPP', secretaria: r.SECRETARIA || 'NÃO INFORMADO', orgao: r.ORGAO || 'NÃO INFORMADO',
                fonte: r.FONTE || 'NÃO INFORMADA', estagio: labelEstagio(estagio), p26: p26, p27: p27, classe: classe,
                isExpurgado: true, regra: "EXPURGO: GRUPO ENTREGA PRIORITÁRIA (grupo oculto do sistema)"
            });
            return;
        }

        let execFin = p26 > 0 ? (pg26 / p26) * 100 : 0;
        let prevEmp = 0, justificativa = "FALLBACK";

        if (S(r.CONTRATO_GESTAO)) { prevEmp = p26; justificativa = "CONTRATO_GESTAO (100% — SEM TRANSFERÊNCIA)"; }
        else if (S(r.CONTINUIDADE)) { prevEmp = p26; justificativa = "CONTINUIDADE (100% — SEM TRANSFERÊNCIA)"; }
        else if (S(r.PCF_CONVENIO)) { prevEmp = p26; justificativa = "PCF_CONVENIO (100% — SEM TRANSFERÊNCIA)"; }
        else if (S(r.OPERACAO_CREDITO) || S(r.OPERACA_CREDITO)) { prevEmp = p26; justificativa = "OPERACAO_CREDITO (100% — SEM TRANSFERÊNCIA)"; }
        else if (estagio === EST_CONVENIADO) {
            if (l26 === 0) { prevEmp = p26 * p_conve; justificativa = `ESTÁGIO CONVENIADO (${p_conve*100}%)`; }
            else { prevEmp = l26; justificativa = `ESTÁGIO CONVENIADO (LIMITE 2026 GARANTIDO)`; }
        }
        else if (estagio === EST_EM_LICITACAO) {
            if (l26 === 0) { prevEmp = p26 * p_emlic; justificativa = `ESTÁGIO EM LICITAÇÃO (${p_emlic*100}%)`; }
            else { prevEmp = l26; justificativa = `ESTÁGIO EM LICITAÇÃO (LIMITE 2026 GARANTIDO)`; }
        }
        else if (estagio === EST_LICITADO) {
            if (l26 === 0) { prevEmp = p26 * p_licit; justificativa = `ESTÁGIO LICITADO (${p_licit*100}%)`; }
            else { prevEmp = l26; justificativa = `ESTÁGIO LICITADO (LIMITE 2026 GARANTIDO)`; }
        }
        else if (estagio === EST_CONTRATADO) {
            if (l26 === 0) { prevEmp = p26 * p_contr; justificativa = `ESTÁGIO CONTRATADO (${p_contr*100}%)`; }
            else { prevEmp = l26; justificativa = `ESTÁGIO CONTRATADO (LIMITE 2026 GARANTIDO)`; }
        }
        else if (estagio === EST_ATIV_PREPARATORIAS) {
            if (l26 === 0) { prevEmp = p26 * p_prepa; justificativa = `ESTÁGIO ATIVIDADES PREPARATÓRIAS (${p_prepa*100}%)`; }
            else { prevEmp = l26; justificativa = `ESTÁGIO ATIVIDADES PREPARATÓRIAS (LIMITE 2026 GARANTIDO)`; }
        }
        else if (estagio === EST_NAO_INICIADO) { prevEmp = p26 * p_naoin; justificativa = `ESTÁGIO NÃO INICIADO (${p_naoin*100}%)`; }
        else if (estagio === EST_PARALISADO) { prevEmp = e26; justificativa = `ESTÁGIO PARALISADO (FIXO = EMPENHADO 2026)`; }
        else if (estagio === EST_EXEC_FIS_CONCL) { prevEmp = l26; justificativa = `ESTÁGIO EXECUÇÃO FÍSICA CONCLUÍDA (FIXO = LIMITE 2026)`; }
        else if (estagio === EST_EXEC_FISFIN_CONCL) { prevEmp = p26; justificativa = `ESTÁGIO EXECUÇÃO FÍSIC/FINAN,CONCLUÍDA (100% — SEM TRANSFERÊNCIA)`; }
        else if (estagio === EST_EM_EXECUCAO) {
            let _limiar = (typeof window.r_exec_limiar === 'number') ? window.r_exec_limiar : 40;
            let _critico = (typeof window.r_exec_critico === 'number') ? window.r_exec_critico : 15;
            let _modPct = (typeof window.r_mod_pct === 'number') ? window.r_mod_pct : 10;
            let _parametro = p26 * (_limiar / 100); // parâmetro = limiar% × Programado 2026

            if (e26 === 0) {
                // Regra 2: Empenhado = 0 → Previsão = Limite 2026
                prevEmp = l26;
                justificativa = `EM EXECUÇÃO: EMP=0 → LIMITE 2026`;
                if (cenario === 'REDUCAO_10') { prevEmp = l26 * (1 - _modPct/100); justificativa = `CENÁRIO: EM EXECUÇÃO (LIMITE -${_modPct}%)`; }
                else if (cenario === 'ZERA_CRITICO' && e26 < (p26 * (_critico / 100))) { prevEmp = 0; justificativa = "CENÁRIO: CRÍTICO EXTREMO ZERO"; }
            } else if (e26 > 0 && e26 < _parametro) {
                // Regra 1: 0 < Empenhado < parâmetro → (Empenhado / 5) × 12
                prevEmp = (e26 / 5) * 12;
                justificativa = `EM EXECUÇÃO: (EMP/5)×12 [EMP < ${_limiar}% PROG]`;
            } else {
                // Empenhado >= parâmetro → 100% do Programado 2026
                prevEmp = p26;
                justificativa = `EM EXECUÇÃO: EMP >= ${_limiar}% PROG → PROGRAMADO`;
            }

            // Regra 3: cap — Previsão nunca supera o Programado 2026
            if (prevEmp > p26) {
                prevEmp = p26;
                justificativa += ` [CAP: PROG 2026]`;
            }
        } else { prevEmp = p26; justificativa = "PADRÃO DE SEGURANÇA (100% PROGRAMADO)"; }

        // Previsão de Empenho com os percentuais PADRÃO da regra vigente (nunca os
        // da tela) — usada só para blindar a Necessidade Real 2027 abaixo.
        // Nos ramos que não dependem de % de Estágio (flags SEM TRANSFERÊNCIA,
        // PARALISADO, EXECUÇÃO CONCLUÍDA, fallback) o resultado é idêntico a
        // prevEmp, então reaproveita-se o mesmo valor sem recalcular. EM EXECUÇÃO
        // É uma exceção a essa regra geral — depende do parâmetro "Regra de
        // Projeção de Empenho" (window.r_exec_limiar) — por isso tem ramo próprio
        // logo abaixo, recalculado com o limiar PADRÃO fixo (nunca o da tela).
        let prevEmpPadrao;
        if (estagio === EST_CONVENIADO) { prevEmpPadrao = (l26 === 0) ? p26 * pP_conve : l26; }
        else if (estagio === EST_EM_LICITACAO) { prevEmpPadrao = (l26 === 0) ? p26 * pP_emlic : l26; }
        else if (estagio === EST_LICITADO) { prevEmpPadrao = (l26 === 0) ? p26 * pP_licit : l26; }
        else if (estagio === EST_CONTRATADO) { prevEmpPadrao = (l26 === 0) ? p26 * pP_contr : l26; }
        else if (estagio === EST_ATIV_PREPARATORIAS) { prevEmpPadrao = (l26 === 0) ? p26 * pP_prepa : l26; }
        else if (estagio === EST_NAO_INICIADO) { prevEmpPadrao = p26 * pP_naoin; }
        else if (estagio === EST_EM_EXECUCAO) {
            // Mesmas 3 regras de EM EXECUÇÃO acima, mas com o limiar PADRÃO fixo
            // (DEFAULTS_PARAMETROS.cenario['r-exec-limiar'] = 40%), ignorando
            // window.r_exec_limiar e o Cenário de Simulação (que na prática está
            // sempre travado em PADRAO — ver sincronizarCenario()).
            let _limiarPadrao = DEFAULTS_PARAMETROS.cenario['r-exec-limiar'];
            let _parametroPadrao = p26 * (_limiarPadrao / 100);
            if (e26 === 0) { prevEmpPadrao = l26; }
            else if (e26 > 0 && e26 < _parametroPadrao) { prevEmpPadrao = (e26 / 5) * 12; }
            else { prevEmpPadrao = p26; }
            if (prevEmpPadrao > p26) prevEmpPadrao = p26;
        }
        else { prevEmpPadrao = prevEmp; }
        // Os 4 flags "SEM TRANSFERÊNCIA" (Contrato Gestão, Continuidade, PCF
        // Convênio, Operação Crédito) têm prioridade sobre o estágio e nunca usam
        // % — se algum estiver ativo, prevEmp já é 100% do Programado, então o
        // ramo acima (baseado em `estagio`) seria calculado à toa; corrige aqui.
        if (S(r.CONTRATO_GESTAO) || S(r.CONTINUIDADE) || S(r.PCF_CONVENIO) || S(r.OPERACAO_CREDITO) || S(r.OPERACA_CREDITO)) {
            prevEmpPadrao = prevEmp;
        }

        let trf = p26 - prevEmp;

        // Previsão de Empenho 2026 Ajustada: reduz a Previsão de Empenho 2026 pelo
        // percentual confirmado do grupo (bloco "Valor Deliberado Máximo do Empenho
        // 2026 por Grupo de Projetos"). A TRF Ajustada passa a ser recalculada a
        // partir dela — não é mais reduzida diretamente. MAPPs travados continuam
        // imunes porque a Necessidade 2027 Ajustada deles usa o valor preservado
        // manualmente (abaixo), não este necBase.
        let fClass = pc_factor(r.FONTE, classe);
        let prevEmpAjustada = (fClass > 0) ? prevEmp * (1 - fClass) : prevEmp;
        let trfAj = p26 - prevEmpAjustada;
        let ajusteAtivo = (fClass > 0);

        // Necessidade Real 2027 original ("Calculada"): usa a Previsão de Empenho com os
        // percentuais PADRÃO da regra vigente (prevEmpPadrao), não os da tela — por
        // isso é imune a qualquer % de Estágio, Cenário de Simulação, redutor,
        // exclusões ou edições individuais. Só a Necessidade Ajustada (abaixo)
        // reflete a parametrização atual.
        let trfPadrao = p26 - prevEmpPadrao;
        let nec = p27 + trfPadrao;

        // Necessidade 2027 Ajustada: usa TRF já recalculada a partir da Previsão de
        // Empenho Ajustada. Esse é o valor-base do Cenário Ajustado antes de
        // qualquer edição manual.
        let necBase = p27 + trfAj;

        let necAjustadaAplicada = necBase;
        let foiAjustadoAplicado = false;
        let origemTravadoAplicada = null;
        if (Object.prototype.hasOwnProperty.call(ajustesPreservados, idx)) {
            necAjustadaAplicada = ajustesPreservados[idx].valor;
            foiAjustadoAplicado = (necAjustadaAplicada !== necBase);
            if (foiAjustadoAplicado) origemTravadoAplicada = ajustesPreservados[idx].origem;
        }

        dadosProcessados.push({
            idOriginal: idx, mapp: r.MAPP || 'SEM MAPP', secretaria: r.SECRETARIA || 'NÃO INFORMADO', orgao: r.ORGAO || 'NÃO INFORMADO',
            fonte: r.FONTE || 'NÃO INFORMADA', estagio: labelEstagio(estagio),
            p26: p26, l26: l26, e26: e26, pg26: pg26, p27: p27, execFin: execFin, prevEmp: prevEmp, prevEmpAjustada: prevEmpAjustada,
            trf: trf, trfAj: trfAj, ajusteAtivo: ajusteAtivo, nec: nec, classe: classe, regra: justificativa,
            necessidade2027Ajustada: necAjustadaAplicada, programado2027Ajustado: p27, foiAjustado: foiAjustadoAplicado,
            origemTravado: origemTravadoAplicada, isExpurgado: false
        });
    });

    // Reaplica as exclusões manuais preservadas antes do reprocessamento.
    if (exclusoesManuaisPreservadas.length > 0) {
        reaplicarExclusoesManuais(exclusoesManuaisPreservadas);
    }

    // Reaplica os subtetos por fonte×grupo preservados entre reprocessamentos —
    // mesmo princípio do Valor Deliberado (prevEmpAjustesPreservados), mas aqui
    // trava (foiAjustado=true) os MAPPs da combinação fonte×grupo em vez de só
    // reduzir a Previsão de Empenho. Só reaplica em cima de MAPPs que não estejam
    // travados por outro motivo (ver guarda dentro de aplicarSubtetoGrupoCore).
    Object.keys(subtetosPorFonteGrupo).forEach(fonte => {
        Object.keys(subtetosPorFonteGrupo[fonte]).forEach(classe => {
            aplicarSubtetoGrupoCore(fonte, classe, subtetosPorFonteGrupo[fonte][classe]);
        });
    });

    // PLOA 2027 NÃO é recalculado aqui — só é gravado pelo botão dedicado "🔒 Gerar
    // Valores de PLOA 2027" / "➕ Aplicar Novo Ajuste ao PLOA 2027" (gerarValoresPLO()).
    // Reprocessar o cenário não trava nem apaga o PLOA já gerado: o valor congelado
    // de cada MAPP (por idOriginal) é restaurado abaixo; MAPPs novos (sem PLOA
    // gerado antes) ficam null normalmente, como antes de qualquer geração.
    dadosProcessados.forEach(d => {
        let p = ploPreservado[d.idOriginal];
        d.plo2027 = p ? p.plo2027 : null;
        d.plo2027Ajustado = p ? p.plo2027Ajustado : null;
    });
    // constuírDropdownsMultiplos() lê seletoresAtivos e usa selAtual para manter as seleções.
    constuírDropdownsMultiplos();
    construirDropdownsPLODetalhado();
    recalculoGeralInjetado();
    renderizarTabelaTetosPorFonte(false);
    atualizarSeletorFontePainel();
    atualizarEstadoGateImportacao();
    atualizarResumoParametrizacaoEstagio();
    atualizarResumoRedutor();
    atualizarResumoPLO();
    atualizarPainelAjustesRealizados();

    // Exibe modal apenas se não há teto do Tesouro definido (1ª carga). Fora
    // disso (reprocessamentos por mudança de parâmetro, redutor etc.), o usuário
    // permanece na aba em que já está — nenhum redirecionamento forçado.
    // Cenário acabou de ser reprocessado: apaga o aviso de desatualização.
    if (typeof marcarCenarioDesatualizado === 'function') marcarCenarioDesatualizado(false);

    let temTesouro = Object.keys(tetosPorFonte).some(f => tetosPorFonte[f] > 0 && f.includes('500') && f.includes('501'));
    let temQualquerTeto = Object.values(tetosPorFonte).some(v => v > 0);
    if (!temTesouro && !temQualquerTeto) {
        exibirModalTeto(dadosProcessados.length + dadosExcluidos.filter(d => !d.isExpurgado).length);
    }
}

