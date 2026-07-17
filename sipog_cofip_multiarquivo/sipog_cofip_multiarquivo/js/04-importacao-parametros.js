// SIPOG COFIP — js/04-importacao-parametros.js
// Importação XLSX, coleta/aplicação de parâmetros, exportação/carga JSON e reaplicação de ajustes.
// Script clássico (escopo global). Ordem de carga definida em index.html — não reordenar.
function importar() {
    let f = document.getElementById('arquivo').files[0];
    if (!f) return;
    let r = new FileReader();
    r.onload = async e => {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(e.target.result);
        const ws = wb.worksheets[0];
        const headers = [];
        ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
            headers[col] = String(valorCelulaExcelJS(cell.value)).trim();
        });
        let jsonBruto = [];
        ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1) return;
            const obj = {};
            let vazia = true;
            headers.forEach((h, col) => {
                if (!h) return;
                const val = valorCelulaExcelJS(row.getCell(col).value);
                obj[h] = val;
                if (val !== '' && val !== null) vazia = false;
            });
            if (!vazia) jsonBruto.push(obj);
        });
        
        dadosBrutos = jsonBruto.map(linha => {
            let linhaNormalizada = {};
            for (let chave in linha) { linhaNormalizada[chave.trim().toUpperCase()] = linha[chave]; }
            return linhaNormalizada;
        });

        dadosExcluidos = [];
        window._filtrosPendentesRestore = null; // Importação XLSX sempre usa filtros padrão (Tesouro)
        totalRegistrosBase = dadosBrutos.length;
        document.getElementById('info-registros').innerHTML = `<strong style="color:var(--success)">✅ ${totalRegistrosBase.toLocaleString('pt-BR')} registros carregados do arquivo.</strong>`;
        ploGerado = false; ploDataGeracao = null; atualizarStatusPLO();
        resetarTrilhaImp();
        processarDados();
    };
    r.readAsArrayBuffer(f);
}

function nomeArquivoSeguro(nome) {
    return String(nome || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'USUARIO';
}

function coletarParametros() {
    // Serializa os sets de seletoresAtivos como arrays para persistência no JSON
    let filtrosSalvos = {};
    ['dash', 'gestao'].forEach(aba => {
        filtrosSalvos[aba] = {};
        ['orgao', 'estagio', 'fonte', 'classe'].forEach(tipo => {
            filtrosSalvos[aba][tipo] = Array.from(seletoresAtivos[aba][tipo]);
        });
    });
    return {
        estagios: {
            'p-conveniado': document.getElementById('p-conveniado').value,
            'p-licitado': document.getElementById('p-licitado').value,
            'p-emlicitacao': document.getElementById('p-emlicitacao').value,
            'p-contratado': document.getElementById('p-contratado').value,
            'p-preparatorias': document.getElementById('p-preparatorias').value,
            'p-naoiniciado': document.getElementById('p-naoiniciado').value
        },
        classes: {
            'pc-contrato-gestao': document.getElementById('pc-contrato-gestao').value,
            'pc-continuidade': document.getElementById('pc-continuidade').value,
            'pc-pcf-convenio': document.getElementById('pc-pcf-convenio').value,
            'pc-operacao-credito': document.getElementById('pc-operacao-credito').value,
            'pc-investimento': document.getElementById('pc-investimento').value
        },
        plo: {
            'plo-contrato-gestao': document.getElementById('plo-contrato-gestao').value,
            'plo-continuidade': document.getElementById('plo-continuidade').value,
            'plo-pcf-convenio': document.getElementById('plo-pcf-convenio').value,
            'plo-operacao-credito': document.getElementById('plo-operacao-credito').value,
            'plo-investimento': document.getElementById('plo-investimento').value
        },
        cenario: {
            'r-exec-limiar': document.getElementById('r-exec-limiar').value,
            'r-cenario-moderado-pct': document.getElementById('r-cenario-moderado-pct').value,
            'r-exec-critico': document.getElementById('r-exec-critico').value
        },
        filtros: filtrosSalvos,
        tetosPorFonte: tetosPorFonte,
        subtetosPorFonteGrupo: subtetosPorFonteGrupo
    };
}

// Valores padrão canônicos da regra vigente — usados tanto para "resetar" a tela
// quanto como piso de segurança ao carregar cenários salvos (evita "sujeira" de
// campos que não existiam no pacote salvo e ficariam com o valor anterior na tela).
const DEFAULTS_PARAMETROS = {
    estagios: {
        'p-conveniado': 20, 'p-licitado': 20, 'p-emlicitacao': 15,
        'p-contratado': 20, 'p-preparatorias': 5, 'p-naoiniciado': 0
    },
    classes: {
        'pc-contrato-gestao': 0, 'pc-continuidade': 0, 'pc-pcf-convenio': 0,
        'pc-operacao-credito': 0, 'pc-investimento': 0
    },
    plo: {
        'plo-contrato-gestao': 0, 'plo-continuidade': 0, 'plo-pcf-convenio': 0,
        'plo-operacao-credito': 0, 'plo-investimento': 0
    },
    cenario: { 'r-exec-limiar': 40, 'r-cenario-moderado-pct': 10, 'r-exec-critico': 15 }
};

// Reseta a tela de parametrização para os valores padrão da regra vigente.
// Usada tanto pelo botão manual quanto internamente antes de aplicar qualquer
// cenário carregado (nuvem/JSON), para nunca deixar resíduo de outro cenário.
function aplicarDefaultsParametros() {
    for (let k in DEFAULTS_PARAMETROS.estagios) { let el = document.getElementById(k); if (el) el.value = DEFAULTS_PARAMETROS.estagios[k]; }
    for (let k in DEFAULTS_PARAMETROS.classes) { let el = document.getElementById(k); if (el) el.value = DEFAULTS_PARAMETROS.classes[k]; }
    for (let k in DEFAULTS_PARAMETROS.plo) { let el = document.getElementById(k); if (el) el.value = DEFAULTS_PARAMETROS.plo[k]; }
    for (let k in DEFAULTS_PARAMETROS.cenario) { let el = document.getElementById(k); if (el) el.value = DEFAULTS_PARAMETROS.cenario[k]; }
    prevEmpAjustesPreservados = {};
    if (typeof resetarQuebradosSlider === 'function') resetarQuebradosSlider();
    if (typeof sincronizarCenario === 'function') sincronizarCenario();
}

function restaurarParametrosPadrao() {
    aplicarDefaultsParametros();
    tetosPorFonte = {};
    subtetosPorFonteGrupo = {};
    renderizarTabelaTetosPorFonte(false);
    atualizarSeletorFontePainel();
    resetarTrilhaImp();
    if (dadosBrutos.length > 0) {
        ploGerado = false; ploDataGeracao = null; atualizarStatusPLO();
        processarDados();
        recalculoGeralInjetado();
    }
    alert("Parâmetros restaurados para o padrão da regra vigente.");
}

function aplicarParametros(p) {
    if (!p) return;
    // Sempre parte do padrão canônico primeiro — qualquer campo ausente no pacote
    // salvo (schema antigo, cenário incompleto) cai no default, nunca herda o que
    // estava na tela antes de carregar (elimina a "sujeira" entre cenários).
    aplicarDefaultsParametros();
    tetosPorFonte = {};
    subtetosPorFonteGrupo = {};

    let classesRestauradas = null;
    if (p.estagios) for (let k in p.estagios) { let el = document.getElementById(k); if (el) el.value = p.estagios[k]; }
    if (p.classes) {
        for (let k in p.classes) { let el = document.getElementById(k); if (el) el.value = p.classes[k]; }
        // Guarda para restaurar o estado "Aplicado" do Valor Deliberado por grupo
        // depois — precisa da Fonte selecionada (só é conhecida após
        // atualizarSeletorFontePainel(), mais abaixo), pois prevEmpAjustesPreservados
        // agora é indexado por Fonte.
        classesRestauradas = p.classes;
    }
    if (p.plo) for (let k in p.plo) { let el = document.getElementById(k); if (el) el.value = p.plo[k]; }
    if (p.cenario) {
        let c = p.cenario;
        if ('r-exec-limiar' in c) document.getElementById('r-exec-limiar').value = c['r-exec-limiar'];
        if ('r-cenario-moderado-pct' in c) { let el = document.getElementById('r-cenario-moderado-pct'); if (el) el.value = c['r-cenario-moderado-pct']; }
        if ('r-exec-critico' in c) { let el = document.getElementById('r-exec-critico'); if (el) el.value = c['r-exec-critico']; }
        // r-cen-padrao / r-cen-moderado / r-cen-restritivo foram removidos da UI — ignorar se presentes em pacotes antigos
        if (typeof sincronizarCenario === 'function') sincronizarCenario();
    }
    if (p.tetosPorFonte && typeof p.tetosPorFonte === 'object') {
        tetosPorFonte = p.tetosPorFonte;
    } else if (p.tetoDisponibilizado !== undefined && p.tetoDisponibilizado > 0) {
        tetosPorFonte['(500)-(501) Tesouro'] = p.tetoDisponibilizado;
    }
    if (p.subtetosPorFonteGrupo && typeof p.subtetosPorFonteGrupo === 'object') {
        subtetosPorFonteGrupo = p.subtetosPorFonteGrupo;
    }
    renderizarTabelaTetosPorFonte(false);
    atualizarSeletorFontePainel();
    // Só agora monFonteSelecionada está definido — restaura o estado "Aplicado"
    // do Valor Deliberado por grupo para a Fonte ativa. Sem isso, o input
    // mostraria o percentual salvo mas o cálculo não o usaria até o usuário
    // clicar em "Aplicar" de novo.
    if (classesRestauradas && monFonteSelecionada) {
        GRUPOS_REDUTOR.forEach(g => {
            let chave = 'pc-' + g.sufixo;
            if (classesRestauradas[chave] !== undefined && V(classesRestauradas[chave]) > 0) {
                definirPctPreservado(monFonteSelecionada, g.classe, V(classesRestauradas[chave]));
            }
        });
    }
    desbloquearTodasEtapasImp();
    // Restaura estado dos filtros de seleção múltipla (aplicado APÓS constuírDropdownsMultiplos)
    if (p.filtros) {
        window._filtrosPendentesRestore = p.filtros;
    }
}

// Chamada após constuírDropdownsMultiplos() para aplicar filtros salvos nos dropdowns
function restaurarFiltrosSalvos(filtros) {
    if (!filtros) return;
    ['dash', 'gestao'].forEach(aba => {
        if (!filtros[aba]) return;
        ['orgao', 'estagio', 'fonte', 'classe'].forEach(tipo => {
            let savedArr = filtros[aba][tipo];
            if (!Array.isArray(savedArr)) return;
            let savedSet = new Set(savedArr);
            seletoresAtivos[aba][tipo] = new Set(savedSet);
            let idContainer = `m-${aba}-${tipo}`;
            let container = document.getElementById(idContainer);
            if (!container) return;
            let dropdownMenu = container.querySelector('.multiselect-dropdown');
            let items = dropdownMenu.querySelectorAll('.multiselect-item');
            let totalItens = items.length;
            items.forEach(item => {
                let chk = item.querySelector('input[type="checkbox"]');
                let texto = item.querySelector('span').textContent;
                chk.checked = savedSet.has(texto);
            });
            atualizarTextoCaixaSeletor(idContainer, savedSet, totalItens);
        });
    });
}



function exportarJSON() {
    if (dadosBrutos.length === 0) return alert("Importe um arquivo antes de exportar.");
    let nomeUsuario = prompt("Informe o nome do usuário para identificar o arquivo exportado:");
    if (nomeUsuario === null) return; // cancelado
    let nomeSeguro = nomeArquivoSeguro(nomeUsuario);

    let agora = new Date();
    let dd = String(agora.getDate()).padStart(2, '0');
    let mm = String(agora.getMonth() + 1).padStart(2, '0');
    let aa = String(agora.getFullYear()).slice(-2);
    let hh = String(agora.getHours()).padStart(2, '0');
    let mi = String(agora.getMinutes()).padStart(2, '0');
    let dataArq = `${dd}${mm}${aa}_${hh}${mi}`;

    let exclusoesManuais = dadosExcluidos.filter(d => !d.isExpurgado).map(d => d.idOriginal);
    let ajustesManuais = dadosProcessados.filter(d => d.foiAjustado).map(d => ({ idOriginal: d.idOriginal, necessidade2027Ajustada: d.necessidade2027Ajustada }));

    let pacote = {
        sistema: "SIPOG",
        versao_schema: 2,
        exportado_em: agora.toISOString(),
        exportado_por: nomeUsuario,
        parametros: coletarParametros(),
        dados: {
            dadosBrutos: dadosBrutos,
            totalRegistrosBase: totalRegistrosBase,
            exclusoesManuais: exclusoesManuais,
            ajustesManuais: ajustesManuais
        }
    };

    let blob = new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = `SIPOG_dados_${nomeSeguro}_${dataArq}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function reaplicarExclusoesManuais(idsExcluidos) {
    if (!Array.isArray(idsExcluidos) || idsExcluidos.length === 0) return 0;
    let contador = 0;
    idsExcluidos.forEach(idOrig => {
        let indexAtivo = dadosProcessados.findIndex(d => d.idOriginal === idOrig);
        if (indexAtivo !== -1) {
            let itemRemovido = dadosProcessados.splice(indexAtivo, 1)[0];
            itemRemovido.isExpurgado = false;
            itemRemovido.regra = "REMOÇÃO MANUAL: Excluído pelo usuário do cenário ativo de projeção.";
            dadosExcluidos.push(itemRemovido);
            contador++;
        }
    });
    return contador;
}

function reaplicarAjustesManuais(ajustes) {
    if (!Array.isArray(ajustes) || ajustes.length === 0) return 0;
    let contador = 0;
    ajustes.forEach(aj => {
        let item = dadosProcessados.find(d => d.idOriginal === aj.idOriginal);
        if (item) {
            item.necessidade2027Ajustada = aj.necessidade2027Ajustada;
            let necBase = item.programado2027Ajustado + item.trfAj;
            item.foiAjustado = (item.necessidade2027Ajustada !== necBase);
            contador++;
        }
    });
    return contador;
}

