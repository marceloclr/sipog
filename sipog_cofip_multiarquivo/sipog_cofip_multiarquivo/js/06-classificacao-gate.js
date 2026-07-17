// SIPOG COFIP — js/06-classificacao-gate.js
// Classificação de registros, gate de importação e constantes/labels de estágio de execução.
// Script clássico (escopo global). Ordem de carga definida em index.html — não reordenar.
function classificarRegistro(r) {
    if (S(r.CONTRATO_GESTAO)) return 'CONTRATO_GESTAO';
    if (S(r.CONTINUIDADE)) return 'CONTINUIDADE';
    if (S(r.PCF_CONVENIO)) return 'PCF_CONVENIO';
    if (S(r.OPERACAO_CREDITO) || S(r.OPERACA_CREDITO)) return 'OPERACAO_CREDITO';
    if (S(r.ENTREGA_PRIORITARIA)) return 'ENTREGA_PRIORITARIA';
    return 'INVESTIMENTO';
}

// Controla a visibilidade do portal de entrada ("boas-vindas") vs. o conteúdo
// pós-carga na aba Importação e Gestão de Dados, e da barra de indicadores +
// Painel de Monitoramento (que ficam fora do sistema de abas, no topo da
// página). A barra fica visível em TODAS as abas (não só Carga e Ajustes) —
// premissa do projeto é que toda tabela/card de qualquer aba respeita a
// mesma Fonte, então o usuário precisa ver/trocá-la de qualquer lugar. Só o
// CONTROLE de troca (o <select>) fica exclusivo da aba Carga e Ajustes; nas
// demais, o mesmo espaço mostra a Fonte já escolhida como texto fixo (ver
// atualizarVisibilidadeSeletorFonte()).
function atualizarEstadoGateImportacao() {
    let temDados = dadosBrutos.length > 0;
    let mostrarBarraIndicadores = temDados;
    let painelBoasVindas = document.getElementById('painel-boas-vindas');
    let conteudoPosCarga = document.getElementById('conteudo-pos-carga');
    let painelMonitoramento = document.querySelector('.painel-monitoramento');
    let painelMonCards = document.getElementById('painel-mon-cards');
    let faixaIndicadores = document.getElementById('faixa-indicadores-gerais');
    let btnProcessar = document.getElementById('btn-processar-1');
    let btnRestaurarParametros = document.getElementById('btn-restaurar-parametros');
    if (painelBoasVindas) painelBoasVindas.style.display = temDados ? 'none' : 'block';
    if (conteudoPosCarga) conteudoPosCarga.style.display = temDados ? 'block' : 'none';
    if (painelMonitoramento) painelMonitoramento.style.display = mostrarBarraIndicadores ? 'block' : 'none';
    // 'contents' (em vez de 'flex') faz estes dois agrupadores "desaparecerem"
    // da árvore de caixas, deixando seus cards como filhos diretos de
    // .barra-indicadores — assim os 7 cards (3 da faixa + 4 do painel) ficam
    // todos na mesma linha, com a mesma proporção (mesma regra .fig-item,
    // .mon-card já compartilhada). Mesmo truque já usado em .mon-teto-group.
    if (painelMonCards) painelMonCards.style.display = mostrarBarraIndicadores ? 'contents' : 'none';
    if (faixaIndicadores) faixaIndicadores.style.display = mostrarBarraIndicadores ? 'contents' : 'none';
    if (btnProcessar) btnProcessar.style.display = temDados ? 'inline-flex' : 'none';
    if (btnRestaurarParametros) btnRestaurarParametros.style.display = temDados ? 'inline-flex' : 'none';
    atualizarVisibilidadeSeletorFonte();
}

// A Fonte só é EDITÁVEL na aba Carga e Ajustes (v-imp) — nas demais abas
// (PLOA Detalhado, Consolidação e Dashboard), o mesmo espaço no topo mostra
// a Fonte já escolhida como texto fixo, não como <select>, para deixar claro
// que ela não pode ser trocada por ali (só reflete a definida em Carga e
// Ajustes). Chamada sempre que a aba muda ou a Fonte é alterada.
function atualizarVisibilidadeSeletorFonte() {
    let elSelect = document.getElementById('mon-fonte-select');
    let elReadonly = document.getElementById('mon-fonte-readonly');
    if (!elSelect || !elReadonly) return;
    let editavel = (abaAtualId === 'v-imp');
    elSelect.style.display = editavel ? '' : 'none';
    elReadonly.style.display = editavel ? 'none' : 'inline-block';
    elReadonly.textContent = monFonteSelecionada || '— Nenhuma fonte selecionada —';
}

// Estágios de execução — comparação por igualdade EXATA (não "includes"), para eliminar
// colisões de substring (ex: "EM EXECUÇÃO" x "EXECUÇÃO FÍSICA CONCLUÍDA"). Lista literal
// de estágios confirmada pelo usuário. Escopo global: usada em processarDados() e em
// atualizarResumoParametrizacaoEstagio().
const EST_EM_EXECUCAO       = 'EM EXECUCAO';
const EST_EXEC_FIS_CONCL    = 'EXECUCAO FISICA CONCLUIDA';
const EST_PARALISADO        = 'PARALISADO';
const EST_EXEC_FISFIN_CONCL = 'EXECUCAO FISIC/FINAN,CONCLUIDA';
const EST_NAO_INICIADO      = 'NAO INICIADO';
const EST_EM_LICITACAO      = 'EM LICITACAO';
const EST_CONTRATADO        = 'CONTRATADO';
const EST_ATIV_PREPARATORIAS = 'ATIVIDADES PREPARATORIAS';
const EST_CONVENIADO        = 'CONVENIADO';
const EST_NAO_DEFINIDO      = 'NAO DEFINIDO';
const EST_NAO_INFORMADO     = 'NAO INFORMADO';
const EST_LICITADO          = 'LICITADO';

// Rótulo canônico por Estágio de Execução — a planilha MAPP traz variações de
// acentuação/caixa para o mesmo estágio (ex.: "EM EXECUÇÃO" e "EM EXECUCAO"),
// que a função N() já unifica para fins de CÁLCULO (comparação com as
// constantes EST_* acima). Este mapa faz o mesmo para fins de EXIBIÇÃO/
// AGRUPAMENTO (tabelas, gráficos, exports): recebe a versão normalizada
// (chave, sem acento) e devolve sempre o mesmo rótulo acentuado — evita
// linhas duplicadas em PLOA Detalhado e agrupamentos correlatos.
const ESTAGIO_LABEL_MAP = {
    [EST_CONVENIADO]: 'CONVENIADO',
    [EST_EM_LICITACAO]: 'EM LICITAÇÃO',
    [EST_LICITADO]: 'LICITADO',
    [EST_CONTRATADO]: 'CONTRATADO',
    [EST_ATIV_PREPARATORIAS]: 'ATIVIDADES PREPARATÓRIAS',
    [EST_NAO_INICIADO]: 'NÃO INICIADO',
    [EST_PARALISADO]: 'PARALISADO',
    [EST_EXEC_FIS_CONCL]: 'EXECUÇÃO FÍSICA CONCLUÍDA',
    [EST_EXEC_FISFIN_CONCL]: 'EXECUÇÃO FÍSIC/FINAN,CONCLUÍDA',
    [EST_EM_EXECUCAO]: 'EM EXECUÇÃO',
    [EST_NAO_DEFINIDO]: 'NÃO DEFINIDO',
    [EST_NAO_INFORMADO]: 'NÃO INFORMADO'
};
function labelEstagio(estagioNormalizado) {
    return ESTAGIO_LABEL_MAP[estagioNormalizado] || estagioNormalizado || 'NÃO INFORMADO';
}

// Calcula, para cada estágio com taxa condicional ao Limite 2026, quantos MAPPs
// têm Limite = 0 (afetados pelo percentual) e a soma do Programado 2026 deles —
// para dar noção de grandeza de quem a parametrização realmente atinge.
function atualizarResumoParametrizacaoEstagio() {
    let mapaEstagios = {
        'resumo-conveniado': EST_CONVENIADO,
        'resumo-licitado': EST_LICITADO,
        'resumo-emlicitacao': EST_EM_LICITACAO,
        'resumo-contratado': EST_CONTRATADO,
        'resumo-preparatorias': EST_ATIV_PREPARATORIAS
    };
    // Respeita os filtros ativos da aba Dashboard, para bater com "Registros
    // Elegíveis" e os demais cards/tabelas do sistema. Exclui também os MAPPs
    // classificados em algum dos 4 grupos com prioridade fixa (100% do Programado,
    // sem transferência) — a taxa de estágio não tem efeito algum sobre eles,
    // então contá-los aqui como "afetados" seria enganoso. Só INVESTIMENTO
    // (classificação padrão, sem grupo) continua dependendo do Estágio.
    let baseFiltrada = dadosProcessados.filter(d => checkFiltroMulti(d, 'dash') && d.classe === 'INVESTIMENTO');
    for (let elId in mapaEstagios) {
        let el = document.getElementById(elId);
        if (!el) continue;
        let estagioAlvo = mapaEstagios[elId];
        let doEstagio = baseFiltrada.filter(d => N(d.estagio) === estagioAlvo);
        if (doEstagio.length === 0) { el.innerHTML = '—'; continue; }
        let afetados = doEstagio.filter(d => d.l26 === 0);
        let naoAfetados = doEstagio.length - afetados.length;
        let somaAfetados = afetados.reduce((s, d) => s + d.p26, 0);
        el.innerHTML = `<strong style="color:var(--warning)">${afetados.length}</strong> MAPP(s) · Prog. 2026: <strong>${F(somaAfetados)}</strong>` +
            (naoAfetados > 0 ? `<br><span style="color:var(--muted)">${naoAfetados} MAPP(s) c/ Limite≠0 (usam o Limite)</span>` : '');
    }
}

