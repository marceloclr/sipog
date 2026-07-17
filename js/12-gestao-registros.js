// SIPOG COFIP — js/12-gestao-registros.js
// Grids Órgão×Classe, gestão de registros, lixeira, consolidados e salvamento de ajustes manuais.
// Script clássico (escopo global). Ordem de carga definida em index.html — não reordenar.
const ORDEM_CLASSIFICACOES = ['CONTRATO_GESTAO', 'CONTINUIDADE', 'PCF_CONVENIO', 'OPERACAO_CREDITO', 'INVESTIMENTO'];

function renderizarGridOrgaoClasse() {
    let container = document.getElementById('tab-grid-orgao-classe');
    if (!container) return;

    let filtrados = dadosProcessados.filter(d => checkFiltroMulti(d, 'dash'));

    let orgAgrup = {};
    let totaisColuna = {};
    ORDEM_CLASSIFICACOES.forEach(c => totaisColuna[c] = 0);
    let totalGeral = 0;

    filtrados.forEach(d => {
        let org = d.orgao || 'NÃO INFORMADO';
        if (!orgAgrup[org]) {
            orgAgrup[org] = { orgao: org, TOTAL: 0 };
            ORDEM_CLASSIFICACOES.forEach(c => orgAgrup[org][c] = 0);
        }
        if (ORDEM_CLASSIFICACOES.includes(d.classe)) {
            orgAgrup[org][d.classe] += d.necessidade2027Ajustada;
        }
        orgAgrup[org].TOTAL += d.necessidade2027Ajustada;
        totaisColuna[d.classe] = (totaisColuna[d.classe] || 0) + d.necessidade2027Ajustada;
        totalGeral += d.necessidade2027Ajustada;
    });

    let listaOrgaos = ordenarDados(Object.values(orgAgrup), ordenacaoAtiva.gridOrgaoClasse);

    let h = `<table><thead><tr>
        <th onclick="alternarOrdenacao('gridOrgaoClasse', 'orgao')">Órgão</th>`;
    ORDEM_CLASSIFICACOES.forEach(c => {
        let clsBadge = CLASSE_BADGE_MAP[c] || 'badge-default';
        h += `<th onclick="alternarOrdenacao('gridOrgaoClasse', '${c}')"><span class="badge ${clsBadge}">${c.replace(/_/g, ' ')}</span></th>`;
    });
    h += `<th onclick="alternarOrdenacao('gridOrgaoClasse', 'TOTAL')">Necessidade 2027 Ajustada</th></tr></thead><tbody>`;

    if (listaOrgaos.length === 0) {
        h += `<tr><td colspan="${ORDEM_CLASSIFICACOES.length + 2}" style="text-align:center;color:var(--muted)">Nenhum registro ativo nos filtros selecionados.</td></tr>`;
    }

    listaOrgaos.forEach(v => {
        h += `<tr><td><strong>${v.orgao}</strong></td>`;
        ORDEM_CLASSIFICACOES.forEach(c => {
            h += `<td>${F(v[c])}</td>`;
        });
        h += `<td class="text-success" style="font-weight:700">${F(v.TOTAL)}</td></tr>`;
    });

    h += `</tbody><tfoot><tr><td>TOTAL GERAL</td>`;
    ORDEM_CLASSIFICACOES.forEach(c => {
        h += `<td>${F(totaisColuna[c] || 0)}</td>`;
    });
    h += `<td>${F(totalGeral)}</td></tr></tfoot></table>`;

    container.innerHTML = h;
}

// Gêmea da grid acima, mas usando PLOA 2027 como valor em vez de Necessidade Real 2027
// Ajustada — pivotada por Órgão × Classificação, mesma estrutura.
function renderizarGridOrgaoClassePLO() {
    let container = document.getElementById('tab-grid-orgao-classe-plo');
    if (!container) return;

    let filtrados = dadosProcessados.filter(d => checkFiltroMulti(d, 'dash'));

    let orgAgrup = {};
    let totaisColuna = {};
    ORDEM_CLASSIFICACOES.forEach(c => totaisColuna[c] = 0);
    let totalGeral = 0;

    filtrados.forEach(d => {
        let org = d.orgao || 'NÃO INFORMADO';
        if (!orgAgrup[org]) {
            orgAgrup[org] = { orgao: org, TOTAL: 0 };
            ORDEM_CLASSIFICACOES.forEach(c => orgAgrup[org][c] = 0);
        }
        if (ORDEM_CLASSIFICACOES.includes(d.classe)) {
            orgAgrup[org][d.classe] += d.plo2027;
        }
        orgAgrup[org].TOTAL += d.plo2027;
        totaisColuna[d.classe] = (totaisColuna[d.classe] || 0) + d.plo2027;
        totalGeral += d.plo2027;
    });

    let listaOrgaos = ordenarDados(Object.values(orgAgrup), ordenacaoAtiva.gridOrgaoClassePLO);

    let h = `<table><thead><tr>
        <th onclick="alternarOrdenacao('gridOrgaoClassePLO', 'orgao')">Órgão</th>`;
    ORDEM_CLASSIFICACOES.forEach(c => {
        let clsBadge = CLASSE_BADGE_MAP[c] || 'badge-default';
        h += `<th onclick="alternarOrdenacao('gridOrgaoClassePLO', '${c}')"><span class="badge ${clsBadge}">${c.replace(/_/g, ' ')}</span></th>`;
    });
    h += `<th onclick="alternarOrdenacao('gridOrgaoClassePLO', 'TOTAL')">PLOA 2027</th></tr></thead><tbody>`;

    if (listaOrgaos.length === 0) {
        h += `<tr><td colspan="${ORDEM_CLASSIFICACOES.length + 2}" style="text-align:center;color:var(--muted)">Nenhum registro ativo nos filtros selecionados.</td></tr>`;
    }

    listaOrgaos.forEach(v => {
        h += `<tr><td><strong>${v.orgao}</strong></td>`;
        ORDEM_CLASSIFICACOES.forEach(c => {
            h += `<td>${F(v[c])}</td>`;
        });
        h += `<td class="text-success" style="font-weight:700">${F(v.TOTAL)}</td></tr>`;
    });

    h += `</tbody><tfoot><tr><td>TOTAL GERAL</td>`;
    ORDEM_CLASSIFICACOES.forEach(c => {
        h += `<td>${F(totaisColuna[c] || 0)}</td>`;
    });
    h += `<td>${F(totalGeral)}</td></tr></tfoot></table>`;

    container.innerHTML = h;
}

// Gêmea da grid acima, mas usando PLOA 2027 AJUSTADO como valor em vez de
// PLOA 2027 — pivotada por Órgão × Classificação, mesma estrutura.
function renderizarGridOrgaoClassePLOAjustado() {
    let container = document.getElementById('tab-grid-orgao-classe-ploaj');
    if (!container) return;

    let filtrados = dadosProcessados.filter(d => checkFiltroMulti(d, 'dash'));

    let orgAgrup = {};
    let totaisColuna = {};
    ORDEM_CLASSIFICACOES.forEach(c => totaisColuna[c] = 0);
    let totalGeral = 0;

    filtrados.forEach(d => {
        let org = d.orgao || 'NÃO INFORMADO';
        if (!orgAgrup[org]) {
            orgAgrup[org] = { orgao: org, TOTAL: 0 };
            ORDEM_CLASSIFICACOES.forEach(c => orgAgrup[org][c] = 0);
        }
        if (ORDEM_CLASSIFICACOES.includes(d.classe)) {
            orgAgrup[org][d.classe] += d.plo2027Ajustado;
        }
        orgAgrup[org].TOTAL += d.plo2027Ajustado;
        totaisColuna[d.classe] = (totaisColuna[d.classe] || 0) + d.plo2027Ajustado;
        totalGeral += d.plo2027Ajustado;
    });

    let listaOrgaos = ordenarDados(Object.values(orgAgrup), ordenacaoAtiva.gridOrgaoClassePLOAjustado);

    let h = `<table><thead><tr>
        <th onclick="alternarOrdenacao('gridOrgaoClassePLOAjustado', 'orgao')">Órgão</th>`;
    ORDEM_CLASSIFICACOES.forEach(c => {
        let clsBadge = CLASSE_BADGE_MAP[c] || 'badge-default';
        h += `<th onclick="alternarOrdenacao('gridOrgaoClassePLOAjustado', '${c}')"><span class="badge ${clsBadge}">${c.replace(/_/g, ' ')}</span></th>`;
    });
    h += `<th onclick="alternarOrdenacao('gridOrgaoClassePLOAjustado', 'TOTAL')">PLOA 2027 Ajustado</th></tr></thead><tbody>`;

    if (listaOrgaos.length === 0) {
        h += `<tr><td colspan="${ORDEM_CLASSIFICACOES.length + 2}" style="text-align:center;color:var(--muted)">Nenhum registro ativo nos filtros selecionados.</td></tr>`;
    }

    listaOrgaos.forEach(v => {
        h += `<tr><td><strong>${v.orgao}</strong></td>`;
        ORDEM_CLASSIFICACOES.forEach(c => {
            h += `<td>${F(v[c])}</td>`;
        });
        h += `<td class="text-success" style="font-weight:700">${F(v.TOTAL)}</td></tr>`;
    });

    h += `</tbody><tfoot><tr><td>TOTAL GERAL</td>`;
    ORDEM_CLASSIFICACOES.forEach(c => {
        h += `<td>${F(totaisColuna[c] || 0)}</td>`;
    });
    h += `<td>${F(totalGeral)}</td></tr></tfoot></table>`;

    container.innerHTML = h;
}

function renderizarGestao(pagina) {
    let filtrados = dadosProcessados.filter(d => checkFiltroMulti(d, 'gestao'));
    let sumP26 = 0, sumPrev = 0, sumPrevAj = 0, sumP27 = 0, sumNec27Aj = 0;
    filtrados.forEach(f => { sumP26 += f.p26; sumPrev += f.prevEmp; sumPrevAj += f.prevEmpAjustada; sumP27 += f.p27; sumNec27Aj += f.necessidade2027Ajustada; });

    let filtradosOrdenados = ordenarDados(filtrados, ordenacaoAtiva.gestao);
    let totalPaginas = Math.ceil(filtradosOrdenados.length / itensPorPagina) || 1;
    if (pagina > totalPaginas) pagina = totalPaginas;

    let subSet = filtradosOrdenados.slice((pagina - 1) * itensPorPagina, pagina * itensPorPagina);

    let h = `<table><thead><tr>
        <th onclick="alternarOrdenacao('gestao', 'mapp')">MAPP</th>
        <th onclick="alternarOrdenacao('gestao', 'orgao')">Órgão / Secretaria</th>
        <th onclick="alternarOrdenacao('gestao', 'fonte')">Fonte de Recursos</th>
        <th onclick="alternarOrdenacao('gestao', 'estagio')">Estágio Execução</th>
        <th onclick="alternarOrdenacao('gestao', 'classe')">Classe</th>
        <th onclick="alternarOrdenacao('gestao', 'p26')">Prog. 2026</th>
        <th onclick="alternarOrdenacao('gestao', 'prevEmp')">Prev. Empenho</th>
        <th onclick="alternarOrdenacao('gestao', 'prevEmpAjustada')">Prev. Empenho Ajustada</th>
        <th onclick="alternarOrdenacao('gestao', 'p27')">Prog. 2027</th>
        <th onclick="alternarOrdenacao('gestao', 'nec')">Necessidade Real 2027</th>
        <th onclick="alternarOrdenacao('gestao', 'necessidade2027Ajustada')">Necessidade 2027 Ajustada</th>
        <th onclick="alternarOrdenacao('gestao', 'plo2027Ajustado')" title="PLOA 2027 Ajustado: réplica da Necessidade 2027 Ajustada com o percentual do bloco 'Redutor do PLOA 2027 / PLOA 2027 Ajustado por Grupo' aplicado (aba Carga e Ajustes), já incluindo eventuais reaplicações em cascata. MAPPs travados (🔒) mantêm o valor original.">PLOA 2027 Ajustado</th>
        <th onclick="alternarOrdenacao('gestao', 'regra')">Regra Aplicada</th>
        <th>Ações</th>
    </tr></thead><tbody>`;
    
    if(subSet.length === 0) h += `<tr><td colspan="14" style="text-align:center;color:var(--muted)">Nenhum registro ativo selecionado.</td></tr>`;

    subSet.forEach(d => {
        let travado = !!d.foiAjustado;
        let nomeMapp = travado ? `🔒 ${d.mapp}` : d.mapp;
        h += `<tr${travado ? ' style="background:rgba(230,126,34,0.06);"' : ''}><td><strong title="${travado ? 'MAPP travado: ajustado manualmente. Fica de fora de ajustes em massa (Valor Deliberado, Parametrização por Estágio, PLOA 2027 e Distribuir Saldo).' : ''}">${nomeMapp}</strong></td>
            <td><div style="font-size:12px; font-weight:600">${d.orgao}</div><div style="font-size:11px;color:var(--muted)">${d.secretaria}</div></td>
            <td><span style="font-size:11px; word-break:break-all">${d.fonte}</span></td>
            <td><span style="font-size:11px">${d.estagio}</span></td>
            <td>${badgeClasse(d.classe)}</td><td>${F(d.p26)}</td><td>${F(d.prevEmp)}</td><td style="color:#a29bfe">${F(d.prevEmpAjustada)}</td><td>${F(d.p27)}</td><td>${F(d.nec)}</td>
            <td><input type="text" inputmode="numeric" class="input-ajustavel ${d.foiAjustado ? 'foi-ajustado' : ''}" value="${formatarMascaraNumerica(d.necessidade2027Ajustada)}" data-valor-numerico="${d.necessidade2027Ajustada}" oninput="aplicarMascaraNumerica(this)" onblur="atualizarNecessidadeAjustada(${d.idOriginal}, this)"></td>
            <td style="font-weight:600;">${F(d.plo2027Ajustado)}</td>
            <td><span style="font-size:11px;color:var(--accent);font-weight:600">${d.regra}</span></td>
            <td><button class="btn btn-danger" style="padding:5px 10px;font-size:11px" onclick="removerRegistro(${d.idOriginal})">Excluir</button></td></tr>`;
    });
    
    h += `</tbody><tfoot><tr><td colspan="5">TOTAL FILTRADO</td><td>${F(sumP26)}</td><td>${F(sumPrev)}</td><td>${F(sumPrevAj)}</td><td>${F(sumP27)}</td><td></td><td>${F(sumNec27Aj)}</td><td></td><td></td></tr></tfoot></table>`;
    document.getElementById('tab-gestao').innerHTML = h;

    let pagHtml = `<button class="page-btn" ${pagina===1?'disabled':''} onclick="renderizarGestao(${pagina-1})">Anterior</button>
                   <span>Página ${pagina} de ${totalPaginas}</span>
                   <button class="page-btn" ${pagina===totalPaginas?'disabled':''} onclick="renderizarGestao(${pagina+1})">Próxima</button>`;
    document.getElementById('pag-gestao').innerHTML = pagHtml;
}

function formatarMascaraNumerica(valor) {
    let v = Number(valor);
    if (isNaN(v)) v = 0;
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function aplicarMascaraNumerica(el) {
    let digitos = el.value.replace(/\D/g, '');
    if (digitos === '') digitos = '0';
    digitos = digitos.replace(/^0+(?=\d)/, '');
    if (digitos === '') digitos = '0';
    let valorNumerico = parseInt(digitos, 10) / 100;
    el.value = valorNumerico.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    el.dataset.valorNumerico = valorNumerico;
}

function atualizarNecessidadeAjustada(idOrig, el) {
    let item = dadosProcessados.find(d => d.idOriginal === idOrig);
    if (!item) return;
    let necBase = item.programado2027Ajustado + item.trfAj;
    let novoValor = parseFloat(el.dataset.valorNumerico);
    if (isNaN(novoValor)) novoValor = necBase;
    item.necessidade2027Ajustada = novoValor;
    item.foiAjustado = (novoValor !== necBase);
    item.origemTravado = item.foiAjustado ? 'manual' : null;
    el.value = formatarMascaraNumerica(novoValor);
    el.dataset.valorNumerico = novoValor;
    el.classList.toggle('foi-ajustado', item.foiAjustado);
    recalculoGeralInjetado();
}

function removerRegistro(idOrig) {
    if(confirm("Deseja remover este projeto da base ativa? Ele irá para a lixeira.")) {
        let indexAtivo = dadosProcessados.findIndex(d => d.idOriginal === idOrig);
        if(indexAtivo !== -1) {
            let itemRemovido = dadosProcessados.splice(indexAtivo, 1)[0];
            itemRemovido.isExpurgado = false; 
            itemRemovido.regra = "REMOÇÃO MANUAL: Excluído pelo usuário do cenário ativo de projeção.";
            dadosExcluidos.push(itemRemovido);
            document.getElementById('d-excluidos-manual').innerText = dadosExcluidos.filter(d => !d.isExpurgado).length;
            recalculoGeralInjetado();
        }
    }
}

function restaurarRegistro(idOrig) {
    let indexLixeira = dadosExcluidos.findIndex(d => d.idOriginal === idOrig);
    if(indexLixeira !== -1) {
        let itemRestaurado = dadosExcluidos.splice(indexLixeira, 1)[0];
        itemRestaurado.isExpurgado = false;
        dadosProcessados.push(itemRestaurado);
        document.getElementById('d-excluidos-manual').innerText = dadosExcluidos.filter(d => !d.isExpurgado).length;
        recalculoGeralInjetado();
    }
}

function renderizarLixeira() {
    let h = `<table><thead><tr>
        <th>MAPP</th>
        <th>Órgão / Secretaria</th>
        <th>Estágio / Classificação</th>
        <th>Origem da Carga</th>
        <th>Regra Aplicada</th>
        <th style="width:140px">Ações</th>
    </tr></thead><tbody>`;
    
    if(dadosExcluidos.length === 0) {
        h += `<tr><td colspan="6" style="text-align:center;color:var(--muted); padding:20px;">A lixeira está vazia.</td></tr>`;
    } else {
        let listaLixeiraOrdenada = [...dadosExcluidos].sort((a,b) => b.isExpurgado - a.isExpurgado);
        listaLixeiraOrdenada.forEach(d => {
            let badgeOrigem = d.isExpurgado ? `<span class="badge badge-danger">SISTEMA (EXPURGO)</span>` : `<span class="badge badge-default">MANUAL</span>`;
            let acaoBotao = d.isExpurgado
                ? `<button class="btn btn-secondary" style="padding:5px 10px; font-size:11px; opacity:0.5; cursor:not-allowed;" disabled>🔒 Definitivo</button>`
                : `<button class="btn btn-success" style="padding:5px 10px; font-size:11px;" onclick="restaurarRegistro(${d.idOriginal})">⚡ Restaurar</button>`;
            let estiloLinha = d.isExpurgado ? `style="background: rgba(255, 91, 91, 0.02)"` : '';

            h += `<tr ${estiloLinha}><td><strong>${d.mapp}</strong></td><td><div style="font-size:12px; font-weight:600">${d.orgao}</div></td>
                <td><div style="font-size:11px; margin-bottom:4px;">${d.estagio}</div>${badgeClasse(d.classe)}</td>
                <td>${badgeOrigem}</td><td><span style="font-size:12px; font-weight:600; color: ${d.isExpurgado ? 'var(--danger)' : 'var(--accent)'}">${d.regra}</span></td>
                <td>${acaoBotao}</td></tr>`;
        });
    }
    h += `</tbody></table>`;
    document.getElementById('tab-lixeira').innerHTML = h;
}

function renderizarConsolidados() {
    function gerarHTMLConsolidado(aba) {
        let filtrados = dadosProcessados.filter(d => checkFiltroMulti(d, aba));
        let secAgrup = {}, orgAgrup = {};
        let t_p26=0, t_prev=0, t_prevAj=0, t_trf=0, t_trfAj=0, t_p27=0, t_nec=0, t_necAj=0, t_plo=0;
        let temAjuste = false;

        filtrados.forEach(d => {
            t_p26 += d.p26; t_prev += d.prevEmp; t_prevAj += d.prevEmpAjustada; t_trf += d.trf;
            t_trfAj += d.trfAj; t_p27 += d.p27; t_nec += d.nec;
            t_necAj += d.necessidade2027Ajustada; t_plo += d.plo2027;
            if (d.ajusteAtivo) temAjuste = true;

            if(!secAgrup[d.secretaria]) secAgrup[d.secretaria] = { secretaria: d.secretaria, p26:0, prev:0, prevAj:0, trf:0, trfAj:0, p27:0, nec:0, necAj:0, plo:0 };
            secAgrup[d.secretaria].p26 += d.p26; secAgrup[d.secretaria].prev += d.prevEmp; secAgrup[d.secretaria].prevAj += d.prevEmpAjustada;
            secAgrup[d.secretaria].trf += d.trf; secAgrup[d.secretaria].trfAj += d.trfAj;
            secAgrup[d.secretaria].p27 += d.p27; secAgrup[d.secretaria].nec += d.nec;
            secAgrup[d.secretaria].necAj += d.necessidade2027Ajustada; secAgrup[d.secretaria].plo += d.plo2027;

            if(!orgAgrup[d.orgao]) orgAgrup[d.orgao] = { orgao: d.orgao, secretaria: d.secretaria, fonte: d.fonte, p26:0, prev:0, prevAj:0, trf:0, trfAj:0, p27:0, nec:0, necAj:0, plo:0 };
            orgAgrup[d.orgao].p26 += d.p26; orgAgrup[d.orgao].prev += d.prevEmp; orgAgrup[d.orgao].prevAj += d.prevEmpAjustada;
            orgAgrup[d.orgao].trf += d.trf; orgAgrup[d.orgao].trfAj += d.trfAj;
            orgAgrup[d.orgao].p27 += d.p27; orgAgrup[d.orgao].nec += d.nec;
            orgAgrup[d.orgao].necAj += d.necessidade2027Ajustada; orgAgrup[d.orgao].plo += d.plo2027;
        });

        // Detecta qualquer tipo de ajuste: redutor de classe, exclusão de MAPP ou edição individual
        let temNecAjustada = Math.abs(t_nec - t_necAj) > 0.005;

        let listaSec = ordenarDados(Object.values(secAgrup), ordenacaoAtiva.secretaria);
        let hSec = `<table><thead><tr>
            <th onclick="alternarOrdenacao('secretaria', 'secretaria')">Secretaria</th>
            <th onclick="alternarOrdenacao('secretaria', 'p26')">Programado 2026</th>
            <th onclick="alternarOrdenacao('secretaria', 'prev')">Previsão Empenho</th>
            <th onclick="alternarOrdenacao('secretaria', 'prevAj')">Previsão Empenho Ajustada</th>
            <th onclick="alternarOrdenacao('secretaria', 'trf')">TRF 2026</th>
            <th onclick="alternarOrdenacao('secretaria', 'trfAj')">TRF 2026 Ajustada</th>
            <th onclick="alternarOrdenacao('secretaria', 'p27')">Programado 2027</th>
            <th onclick="alternarOrdenacao('secretaria', 'nec')">Necessidade Real 2027</th>
            <th onclick="alternarOrdenacao('secretaria', 'necAj')">Necessidade 2027 Ajustada</th>
            <th onclick="alternarOrdenacao('secretaria', 'plo')">PLOA 2027</th>
        </tr></thead><tbody>`;
        listaSec.forEach(v => {
            let prevAjCell = temAjuste ? `<td style="color:#a29bfe">${F(v.prevAj)}</td>` : `<td style="color:var(--muted)">—</td>`;
            let trfAjCell = temAjuste ? `<td style="color:#a29bfe">${F(v.trfAj)}</td>` : `<td style="color:var(--muted)">—</td>`;
            let necAjCell = temNecAjustada ? `<td style="color:#a29bfe;font-weight:700">${F(v.necAj)}</td>` : `<td style="color:var(--muted)">-</td>`;
            hSec += `<tr><td><strong>${v.secretaria}</strong></td><td>${F(v.p26)}</td><td>${F(v.prev)}</td>${prevAjCell}<td>${F(v.trf)}</td>${trfAjCell}<td>${F(v.p27)}</td><td class="text-success" style="font-weight:700">${F(v.nec)}</td>${necAjCell}<td style="font-weight:700">${F(v.plo)}</td></tr>`;
        });
        hSec += `</tbody><tfoot><tr><td>TOTAL CONSOLIDADO</td><td>${F(t_p26)}</td><td>${F(t_prev)}</td><td>${temAjuste ? F(t_prevAj) : '—'}</td><td>${F(t_trf)}</td><td>${temAjuste ? F(t_trfAj) : '—'}</td><td>${F(t_p27)}</td><td class="text-success">${F(t_nec)}</td><td>${temNecAjustada ? F(t_necAj) : '-'}</td><td>${F(t_plo)}</td></tr></tfoot></table>`;

        let listaOrg = ordenarDados(Object.values(orgAgrup), ordenacaoAtiva.orgaos);
        let hOrg = `<table><thead><tr>
            <th onclick="alternarOrdenacao('orgaos', 'orgao')">Órgão</th>
            <th onclick="alternarOrdenacao('orgaos', 'secretaria')">Secretaria Relacionada</th>
            <th onclick="alternarOrdenacao('orgaos', 'fonte')">Fonte Dominante</th>
            <th onclick="alternarOrdenacao('orgaos', 'p26')">Programado 2026</th>
            <th onclick="alternarOrdenacao('orgaos', 'prev')">Previsão Empenho</th>
            <th onclick="alternarOrdenacao('orgaos', 'prevAj')">Previsão Empenho Ajustada</th>
            <th onclick="alternarOrdenacao('orgaos', 'trf')">TRF 2026</th>
            <th onclick="alternarOrdenacao('orgaos', 'trfAj')">TRF 2026 Ajustada</th>
            <th onclick="alternarOrdenacao('orgaos', 'nec')">Necessidade Real 2027</th>
            <th onclick="alternarOrdenacao('orgaos', 'necAj')">Necessidade 2027 Ajustada</th>
            <th onclick="alternarOrdenacao('orgaos', 'plo')">PLOA 2027</th>
        </tr></thead><tbody>`;
        listaOrg.forEach(v => {
            let prevAjCell = temAjuste ? `<td style="color:#a29bfe">${F(v.prevAj)}</td>` : `<td style="color:var(--muted)">—</td>`;
            let trfAjCell = temAjuste ? `<td style="color:#a29bfe">${F(v.trfAj)}</td>` : `<td style="color:var(--muted)">—</td>`;
            let necAjCell = temNecAjustada ? `<td style="color:#a29bfe;font-weight:700">${F(v.necAj)}</td>` : `<td style="color:var(--muted)">-</td>`;
            hOrg += `<tr><td><strong>${v.orgao}</strong></td><td><span style="font-size:11px;color:var(--muted)">${v.secretaria}</span></td><td><span style="font-size:11px">${v.fonte}</span></td><td>${F(v.p26)}</td><td>${F(v.prev)}</td>${prevAjCell}<td>${F(v.trf)}</td>${trfAjCell}<td class="text-success" style="font-weight:700">${F(v.nec)}</td>${necAjCell}<td style="font-weight:700">${F(v.plo)}</td></tr>`;
        });
        hOrg += `</tbody><tfoot><tr><td colspan="3">TOTAL CONSOLIDADO</td><td>${F(t_p26)}</td><td>${F(t_prev)}</td><td>${temAjuste ? F(t_prevAj) : '—'}</td><td>${F(t_trf)}</td><td>${temAjuste ? F(t_trfAj) : '—'}</td><td class="text-success">${F(t_nec)}</td><td>${temNecAjustada ? F(t_necAj) : '-'}</td><td>${F(t_plo)}</td></tr></tfoot></table>`;

        return { hSec, hOrg };
    }

    let resDash = gerarHTMLConsolidado('dash');
    document.getElementById('tab-dash-secretaria').innerHTML = resDash.hSec;
    document.getElementById('tab-dash-orgaos').innerHTML = resDash.hOrg;
}



// ─── GESTÃO: Salvar ajustes manuais da tabela visível e propagar recálculo ───
function salvarAjustesGestao() {
    // Varre todos os inputs de Necessidade 2027 Ajustada atualmente renderizados no DOM,
    // sincroniza com dadosProcessados e dispara o recálculo global.
    let inputs = document.querySelectorAll('#tab-gestao .input-ajustavel');
    inputs.forEach(el => {
        let match = el.getAttribute('onblur') ? el.getAttribute('onblur').match(/\d+/) : null;
        if (!match) return;
        let idOrig = parseInt(match[0]);
        let novoValor = parseFloat(el.dataset.valorNumerico);
        let item = dadosProcessados.find(d => d.idOriginal === idOrig);
        if (item && !isNaN(novoValor)) {
            let necBase = item.programado2027Ajustado + item.trfAj;
            item.necessidade2027Ajustada = novoValor;
            item.foiAjustado = (novoValor !== necBase);
            el.classList.toggle('foi-ajustado', item.foiAjustado);
        }
    });
    recalculoGeralInjetado();
}

function salvarAjustesEProcessar() {
    // Sincroniza o DOM antes de processar para que processarDados() capture
    // os ajustesPreservados corretos (inclusive inputs da página atual visíveis).
    let inputs = document.querySelectorAll('#tab-gestao .input-ajustavel');
    inputs.forEach(el => {
        let match = el.getAttribute('onblur') ? el.getAttribute('onblur').match(/\d+/) : null;
        if (!match) return;
        let idOrig = parseInt(match[0]);
        let novoValor = parseFloat(el.dataset.valorNumerico);
        let item = dadosProcessados.find(d => d.idOriginal === idOrig);
        if (item && !isNaN(novoValor)) {
            let necBase = item.programado2027Ajustado + item.trfAj;
            item.necessidade2027Ajustada = novoValor;
            item.foiAjustado = (novoValor !== necBase);
        }
    });
    processarDados();
}

