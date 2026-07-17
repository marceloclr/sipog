// SIPOG COFIP — js/13-exportacao-xlsx.js
// Replicação PLOA→MAPPs, auditoria e exportações ExcelJS (consolidação, abas formatadas).
// Script clássico (escopo global). Ordem de carga definida em index.html — não reordenar.
// ─── REPLICAÇÃO FINAL: PLOA 2027 → MAPPs (abas do Exportar Consolidação) ─────
// Momento único em que as projeções voltam aos MAPPs — e apenas num ARQUIVO:
// quando o PLOA 2027 está gerado, o Exportar Consolidação inclui a aba
// MAPPS_REPLICADOS (cópia da base original com VLR_PROGRAMADO_2027 substituído
// pelo plo2027Ajustado dos MAPPs com PLOA gerado) e a aba LEIA-ME_REPLICACAO
// (auditoria). dadosBrutos jamais são alterados; nada persiste em memória.
function adicionarAbasReplicacaoPLOA(wb) {
    if (!ploGerado || dadosBrutos.length === 0) return;

    // Só MAPPs ativos com PLOA efetivamente gravado (a geração é por Fonte)
    let ploaPorId = {};
    dadosProcessados.forEach(d => {
        if (d.plo2027Ajustado !== null && d.plo2027Ajustado !== undefined) ploaPorId[d.idOriginal] = d.plo2027Ajustado;
    });
    let qtdReplicados = Object.keys(ploaPorId).length;

    let linhas = dadosBrutos.map((r, idx) => {
        let linha = {};
        MODELO_COLUNAS.forEach(([col]) => { linha[col] = (r[col] !== undefined ? r[col] : ''); });
        if (ploaPorId[idx] !== undefined) linha['VLR_PROGRAMADO_2027'] = ploaPorId[idx];
        return linha;
    });
    adicionarAbaDeJSONFormatada(wb, 'MAPPS_REPLICADOS', linhas);

    // Aba de auditoria: contexto da replicação para quem receber o arquivo
    let wsInfo = wb.addWorksheet('LEIA-ME_REPLICACAO');
    wsInfo.getColumn(1).width = 110;
    [
        'REPLICAÇÃO DO PLOA 2027 NOS MAPPs — SIPOG COFIP',
        '',
        `Arquivo gerado em: ${new Date().toLocaleString('pt-BR')}`,
        `PLOA 2027 gerado em: ${ploDataGeracao ? ploDataGeracao.toLocaleString('pt-BR') : '—'}`,
        `MAPPs com valor replicado: ${qtdReplicados.toLocaleString('pt-BR')} de ${dadosBrutos.length.toLocaleString('pt-BR')}`,
        '',
        'Regra aplicada: na aba MAPPS_REPLICADOS, a coluna VLR_PROGRAMADO_2027 foi substituída pelo PLOA 2027 Ajustado nos MAPPs com PLOA gerado.',
        'MAPPs sem PLOA gerado (a geração é feita por Fonte), excluídos do cenário ou expurgados mantêm o VLR_PROGRAMADO_2027 original da importação.',
        'Todas as demais colunas são idênticas à base importada — os registros originais do sistema não foram alterados.'
    ].forEach((txt, i) => {
        let c = wsInfo.getCell(`A${i + 1}`);
        c.value = txt;
        if (i === 0) c.font = { bold: true, size: 13 };
    });
}

// ─── AUDITORIA: Exportar base processada completa + excluídos em abas separadas ───
async function exportarBaseCompletaXLSX() {
    if (dadosProcessados.length === 0 && dadosExcluidos.length === 0) {
        return alert("Não há dados processados para exportar.");
    }
    if (typeof ExcelJS === 'undefined') return alert("A biblioteca de exportação formatada (ExcelJS) não carregou — verifique sua conexão e tente novamente.");

    let wb = new ExcelJS.Workbook();
    wb.creator = 'SIPOG COFIP';
    wb.created = new Date();

    if (dadosProcessados.length > 0) {
        adicionarAbaDeJSONFormatada(wb, 'ATIVOS', dadosProcessados.map(mapFormatoExcel));
    }
    if (dadosExcluidos.length > 0) {
        let dadosExcluidosFormatados = dadosExcluidos.map(d => ({
            ...mapFormatoExcel(d),
            'TIPO EXCLUSÃO': d.isExpurgado ? 'EXPURGO AUTOMÁTICO' : 'REMOÇÃO MANUAL',
            'MOTIVO': d.regra || '—'
        }));
        adicionarAbaDeJSONFormatada(wb, 'EXCLUIDOS', dadosExcluidosFormatados);
    }

    let ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    await baixarWorkbookExcelJS(wb, `SIPOG_BASE_COMPLETA_${ts}.xlsx`);
}

async function exportarTabelaEspecifica(idDivTabela, nomeSugerido) {
    let container = document.getElementById(idDivTabela);
    let tabela = container.querySelector('table');
    if(!tabela) return alert("Não existem dados gerados nesta tabela para exportar.");
    if (typeof ExcelJS === 'undefined') return alert("A biblioteca de exportação formatada (ExcelJS) não carregou — verifique sua conexão e tente novamente.");

    let wb = new ExcelJS.Workbook();
    wb.creator = 'SIPOG COFIP';
    wb.created = new Date();
    adicionarAbaDeTabelaFormatada(wb, nomeSugerido, tabela, COR_VERDE, COR_CLARO, COR_BRANCO);
    await baixarWorkbookExcelJS(wb, `SPOPIC_${nomeSugerido}.xlsx`);
}

// Converte um texto de célula em número, quando ele "parece" um valor
// monetário (contém dígitos e símbolo de moeda/sinal) — usado só para o
// Painel de Monitoramento, cujos valores já vêm formatados no DOM.
function parseMoedaTexto(texto) {
    if (!texto) return null;
    let limpo = texto.trim();
    if (limpo === '' || limpo === '—' || limpo === '-') return null;
    limpo = limpo.replace(/[^\d,.\-]/g, '').replace(/\.(?=\d{3},)/g, '').replace(',', '.');
    let n = parseFloat(limpo);
    return isNaN(n) ? null : n;
}

// Paleta e formato de moeda compartilhados por TODAS as exportações XLSX do
// sistema (Consolidação, PLOA Detalhado, Base Completa, Planilhas por Classe,
// e a exportação genérica de tabela única) — via ExcelJS, que sabe gravar
// estilo/cor de verdade (a edição gratuita do SheetJS usada antes só grava em
// texto puro, sem formatação).
const COR_VERDE = 'FF008241', COR_VERDE_ESC = 'FF2A7050', COR_AZUL = 'FF465564', COR_CLARO = 'FFE8F3ED', COR_BRANCO = 'FFFFFFFF';
const FMT_MOEDA = '"R$" #,##0.00;[RED]-"R$" #,##0.00';

// Gera o arquivo a partir de um Workbook do ExcelJS e dispara o download —
// reaproveitado por todas as exportações XLSX formatadas do sistema.
async function baixarWorkbookExcelJS(wb, nomeArquivo) {
    let buffer = await wb.xlsx.writeBuffer();
    let blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Adiciona uma aba formatada a partir de uma lista de registros (objetos com
// as mesmas chaves) — cabeçalho verde/negrito, número de verdade com moeda
// (detectada pelo nome da coluna), largura de coluna ajustada ao conteúdo e
// cabeçalho congelado ao rolar.
function adicionarAbaDeJSONFormatada(wb, nomeAba, registros) {
    let ws = wb.addWorksheet(nomeAba.substring(0, 31), { views: [{ showGridLines: false }] });
    if (!registros || registros.length === 0) { ws.addRow(['Nenhum registro para os filtros selecionados.']); return ws; }

    let colunas = Object.keys(registros[0]);
    let headerRow = ws.addRow(colunas);
    headerRow.height = 22;
    headerRow.eachCell(c => {
        c.font = { bold: true, color: { argb: COR_BRANCO } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_VERDE } };
        c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });

    let larguras = colunas.map(c => c.length + 2);
    registros.forEach(r => {
        let valores = colunas.map(c => r[c]);
        let row = ws.addRow(valores);
        valores.forEach((v, i) => {
            larguras[i] = Math.max(larguras[i], String(v == null ? '' : v).length + 2);
            if (typeof v === 'number') {
                let nomeCol = colunas[i].toUpperCase();
                row.getCell(i + 1).alignment = { horizontal: 'right' };
                if (nomeCol.includes('%') || nomeCol.includes('PERCENT')) {
                    row.getCell(i + 1).numFmt = '0.00"%"';
                } else if (nomeCol.includes('QTD') || nomeCol.includes('QUANT')) {
                    row.getCell(i + 1).numFmt = '#,##0';
                } else {
                    row.getCell(i + 1).numFmt = FMT_MOEDA;
                }
            }
        });
    });
    larguras.forEach((w, i) => { ws.getColumn(i + 1).width = Math.min(w, 42); });
    ws.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
    return ws;
}

// Exporta toda a aba Consolidação e Dashboard num único XLSX, com formatação
// visual (cores, negrito, cabeçalhos) seguindo a paleta do sistema. Usa a
// biblioteca ExcelJS — a edição gratuita do SheetJS (usada nos outros
// exports do sistema) não sabe gravar estilo/cor, só a Pro paga. Cada bloco
// de tabela vira uma aba própria, com exatamente os mesmos dados exibidos na
// tela (respeitando os filtros ativos). A 1ª aba — "PANORAMA GERAL" — traz
// tudo que NÃO virou aba própria: os cards (Cenário Original, Cenário
// Ajustado, Painel de Monitoramento) e a base numérica dos gráficos (Top 15
// Órgãos e por Classificação, original e ajustada).
async function exportarConsolidacaoXLSX() {
    if (dadosProcessados.length === 0) return alert("Não há dados processados para exportar.");
    if (typeof ExcelJS === 'undefined') return alert("A biblioteca de exportação formatada (ExcelJS) não carregou — verifique sua conexão e tente novamente.");

    let wb = new ExcelJS.Workbook();
    wb.creator = 'SIPOG COFIP';
    wb.created = new Date();

    // ── Recalcula os totais dos cards direto da base (números reais, não texto) ──
    let filtradosDash = dadosProcessados.filter(d => checkFiltroMulti(d, 'dash'));
    let t = { l26: 0, p26: 0, e26: 0, pg26: 0, prev26: 0, prev26aj: 0, trf26: 0, trf26aj: 0, p27: 0, nec27: 0, nec27aj: 0, plo: 0, ploAj: 0 };
    filtradosDash.forEach(d => {
        t.l26 += d.l26; t.p26 += d.p26; t.e26 += d.e26; t.pg26 += d.pg26;
        t.prev26 += d.prevEmp; t.prev26aj += d.prevEmpAjustada;
        t.trf26 += d.trf; t.trf26aj += d.trfAj;
        t.p27 += d.p27; t.nec27 += d.nec; t.nec27aj += d.necessidade2027Ajustada;
        t.plo += (d.plo2027 || 0); t.ploAj += (d.plo2027Ajustado || 0);
    });
    let houveAjuste = calcularHouveAjusteGlobal();

    // ── Aba 1: Panorama Geral ───────────────────────────────────────────────
    let wsPan = wb.addWorksheet('PANORAMA GERAL', { views: [{ showGridLines: false }] });
    wsPan.getColumn(1).width = 44;
    wsPan.getColumn(2).width = 24;

    let tituloPrincipal = (texto) => {
        let row = wsPan.addRow([texto]);
        wsPan.mergeCells(`A${row.number}:B${row.number}`);
        row.height = 28;
        row.getCell(1).font = { bold: true, size: 14, color: { argb: COR_BRANCO } };
        row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_VERDE } };
        row.getCell(1).alignment = { vertical: 'middle', indent: 1 };
    };
    let secao = (texto) => {
        let row = wsPan.addRow([texto]);
        wsPan.mergeCells(`A${row.number}:B${row.number}`);
        row.height = 20;
        row.getCell(1).font = { bold: true, color: { argb: COR_BRANCO } };
        row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_VERDE_ESC } };
        row.getCell(1).alignment = { vertical: 'middle', indent: 1 };
    };
    let linhaValor = (label, valor) => {
        let row = wsPan.addRow([label, (valor === null || valor === undefined) ? '—' : valor]);
        row.getCell(1).font = { bold: true };
        row.getCell(1).border = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
        row.getCell(2).border = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
        row.getCell(2).alignment = { horizontal: 'right' };
        if (typeof valor === 'number') row.getCell(2).numFmt = FMT_MOEDA;
    };
    let linhaBranco = () => wsPan.addRow([]);
    let cabecalhoMiniTabela = (cols) => {
        let row = wsPan.addRow(cols);
        row.eachCell(c => {
            c.font = { bold: true, color: { argb: COR_BRANCO } };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_AZUL } };
            c.alignment = { vertical: 'middle' };
        });
    };
    let linhaMiniTabela = (label, valor) => {
        let row = wsPan.addRow([label, valor]);
        row.getCell(2).numFmt = FMT_MOEDA;
        row.getCell(2).alignment = { horizontal: 'right' };
    };

    tituloPrincipal('PANORAMA GERAL — CONSOLIDAÇÃO E DASHBOARD');
    linhaBranco();

    secao('CENÁRIO ORIGINAL 2026');
    linhaValor('Limite 2026', t.l26);
    linhaValor('Programado 2026', t.p26);
    linhaValor('Empenhado 2026', t.e26);
    linhaValor('Pago 2026', t.pg26);
    linhaBranco();

    secao('CENÁRIO AJUSTADO');
    linhaValor('Previsão Empenho 2026', t.prev26);
    linhaValor('Previsão de Empenho 2026 Ajustada', houveAjuste ? t.prev26aj : null);
    linhaValor('TRF 2026', t.trf26);
    linhaValor('TRF 2026 Ajustada', houveAjuste ? t.trf26aj : null);
    linhaValor('Necessidade Real 2027', t.nec27);
    linhaValor('Necessidade 2027 Ajustada', houveAjuste ? t.nec27aj : null);
    linhaValor('PLOA 2027', ploGerado ? t.plo : null);
    linhaValor('PLOA 2027 Ajustado', ploGerado ? t.ploAj : null);
    linhaBranco();

    let fonteMonEl = document.getElementById('mon-fonte-select');
    let fonteMon = fonteMonEl ? fonteMonEl.value : '';
    secao('PAINEL DE MONITORAMENTO DOS AJUSTES' + (fonteMon ? ' — Fonte: ' + fonteMon : ''));
    linhaValor('Programado 2027', parseMoedaTexto(document.getElementById('mon-p27').innerText));
    linhaValor('TRF 2026 Ajustada', parseMoedaTexto(document.getElementById('mon-trf26aj').innerText));
    linhaValor('Teto Disponibilizado', parseMoedaTexto(document.getElementById('mon-teto').innerText));
    linhaValor('Saldo do Teto', parseMoedaTexto(document.getElementById('mon-saldo').innerText));
    linhaBranco();

    // Base numérica dos gráficos (mesmos dados usados para desenhá-los — este
    // Excel não embute o gráfico em si, só os valores por trás dele).
    let orgMap = {}, clsMap = {}, orgMapAj = {}, clsMapAj = {};
    let tNec = 0, tNecAj = 0;
    filtradosDash.forEach(d => {
        let ko = d.orgao || 'NÃO INFORMADO';
        let kc = d.classe || 'NÃO CLASSIFICADO';
        orgMap[ko] = (orgMap[ko] || 0) + d.nec;
        clsMap[kc] = (clsMap[kc] || 0) + d.nec;
        orgMapAj[ko] = (orgMapAj[ko] || 0) + d.necessidade2027Ajustada;
        clsMapAj[kc] = (clsMapAj[kc] || 0) + d.necessidade2027Ajustada;
        tNec += d.nec; tNecAj += d.necessidade2027Ajustada;
    });
    dadosExcluidos.forEach(d => {
        if (d.isExpurgado) return;
        if (!checkFiltroMulti(d, 'dash')) return;
        tNec += d.nec;
    });
    let temNecAjustada = Math.abs(tNec - tNecAj) > 0.005;

    let orgArr = Object.entries(orgMap).map(([k, v]) => [k, Number(v.toFixed(2))]).sort((a, b) => b[1] - a[1]).slice(0, 15);
    let clsArr = Object.entries(clsMap).map(([k, v]) => [labelClasse(k), Number(v.toFixed(2))]).sort((a, b) => b[1] - a[1]);

    secao('TOP 15 ÓRGÃOS — NECESSIDADE 2027 (MAIOR → MENOR)');
    cabecalhoMiniTabela(['Órgão', 'Necessidade Real 2027']);
    orgArr.forEach(([l, v]) => linhaMiniTabela(l, v));
    linhaBranco();

    secao('NECESSIDADE 2027 POR CLASSIFICAÇÃO');
    cabecalhoMiniTabela(['Classificação', 'Necessidade Real 2027']);
    clsArr.forEach(([l, v]) => linhaMiniTabela(l, v));

    if (temNecAjustada) {
        linhaBranco();
        let orgArrAj = Object.entries(orgMapAj).map(([k, v]) => [k, Number(v.toFixed(2))]).sort((a, b) => b[1] - a[1]).slice(0, 15);
        let clsArrAj = Object.entries(clsMapAj).map(([k, v]) => [labelClasse(k), Number(v.toFixed(2))]).sort((a, b) => b[1] - a[1]);

        secao('TOP 15 ÓRGÃOS — NECESSIDADE 2027 AJUSTADA (MAIOR → MENOR)');
        cabecalhoMiniTabela(['Órgão', 'Necessidade 2027 Ajustada']);
        orgArrAj.forEach(([l, v]) => linhaMiniTabela(l, v));
        linhaBranco();

        secao('NECESSIDADE 2027 AJUSTADA POR CLASSIFICAÇÃO');
        cabecalhoMiniTabela(['Classificação', 'Necessidade 2027 Ajustada']);
        clsArrAj.forEach(([l, v]) => linhaMiniTabela(l, v));
    }

    // ── Aba: Consolidado por Secretaria — gerada direto da base (independente
    // do DOM), com as mesmas colunas da tabela exibida na tela. Ordenada pela
    // Necessidade 2027 Ajustada, com linha de total ao final.
    let secAgg = {};
    filtradosDash.forEach(d => {
        let k = d.secretaria || 'NÃO INFORMADO';
        let s = secAgg[k] || (secAgg[k] = { p26: 0, prev: 0, prevAj: 0, trf: 0, trfAj: 0, p27: 0, nec: 0, necAj: 0, plo: 0, ploAj: 0 });
        s.p26 += d.p26; s.prev += d.prevEmp; s.prevAj += d.prevEmpAjustada;
        s.trf += d.trf; s.trfAj += d.trfAj; s.p27 += d.p27;
        s.nec += d.nec; s.necAj += d.necessidade2027Ajustada;
        s.plo += (d.plo2027 || 0); s.ploAj += (d.plo2027Ajustado || 0);
    });
    let linhaSecretaria = (nome, s) => ({
        'SECRETARIA': nome,
        'PROGRAMADO 2026': s.p26, 'PREVISÃO EMPENHO 2026': s.prev, 'PREVISÃO EMPENHO 2026 AJUSTADA': s.prevAj,
        'TRF 2026': s.trf, 'TRF 2026 AJUSTADA': s.trfAj, 'PROGRAMADO 2027': s.p27,
        'NECESSIDADE REAL 2027': s.nec, 'NECESSIDADE 2027 AJUSTADA': s.necAj,
        'PLOA 2027': ploGerado ? s.plo : '—', 'PLOA 2027 AJUSTADO': ploGerado ? s.ploAj : '—'
    });
    let linhasSecretaria = Object.entries(secAgg)
        .sort((a, b) => b[1].necAj - a[1].necAj)
        .map(([nome, s]) => linhaSecretaria(nome, s));
    linhasSecretaria.push(linhaSecretaria('TOTAL CONSOLIDADO', t.hasOwnProperty('prev26')
        ? { p26: t.p26, prev: t.prev26, prevAj: t.prev26aj, trf: t.trf26, trfAj: t.trf26aj, p27: t.p27, nec: t.nec27, necAj: t.nec27aj, plo: t.plo, ploAj: t.ploAj }
        : { p26: 0, prev: 0, prevAj: 0, trf: 0, trfAj: 0, p27: 0, nec: 0, necAj: 0, plo: 0, ploAj: 0 }));
    adicionarAbaDeJSONFormatada(wb, 'CONSOLIDADO_SECRETARIA', linhasSecretaria);

    // ── Demais abas: exatamente as tabelas já exibidas na tela ──────────────
    let tabelas = [
        { id: 'tab-dash-orgaos', nome: 'CONSOLIDADO_ORGAO' },
        { id: 'tab-classificacao', nome: 'PROJECOES_HIERARQUICAS' },
        { id: 'tab-grid-orgao-classe', nome: 'NEC_AJUSTADA_ORGAO_CLASSE' },
        { id: 'tab-grid-orgao-classe-plo', nome: 'PLOA_2027_ORGAO_CLASSE' },
        { id: 'tab-grid-orgao-classe-ploaj', nome: 'PLOA_2027_AJUST_ORGAO_CLASSE' }
    ];
    tabelas.forEach(tb => {
        let container = document.getElementById(tb.id);
        let tabela = container ? container.querySelector('table') : null;
        if (!tabela) return; // bloco ainda sem dados renderizados nos filtros atuais
        adicionarAbaDeTabelaFormatada(wb, tb.nome, tabela, COR_VERDE, COR_CLARO, COR_BRANCO);
    });

    // Com o PLOA 2027 gerado, o arquivo passa a carregar também a replicação
    // final nos MAPPs (abas MAPPS_REPLICADOS + LEIA-ME_REPLICACAO) — um único
    // produto consolidado, sem exportações paralelas com valores divergentes.
    adicionarAbasReplicacaoPLOA(wb);

    let ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    await baixarWorkbookExcelJS(wb, `SIPOG_CONSOLIDACAO_${ts}.xlsx`);
}

// Converte uma tabela HTML (thead/tbody/tfoot) numa aba do ExcelJS, mantendo
// exatamente o texto exibido na tela e aplicando o mesmo padrão visual do
// sistema: cabeçalho verde com texto branco, rodapé em destaque claro,
// largura de coluna ajustada ao conteúdo e cabeçalho congelado ao rolar.
function adicionarAbaDeTabelaFormatada(wb, nomeAba, tabela, corCabecalho, corRodape, corTextoClaro) {
    let ws = wb.addWorksheet(nomeAba.substring(0, 31), { views: [{ showGridLines: false }] });
    let larguras = [];
    let qtdLinhasCabecalho = 0;

    let processarGrupo = (trs, tipo) => {
        trs.forEach(tr => {
            let cels = Array.from(tr.children).map(td => td.innerText.trim());
            let row = ws.addRow(cels);
            cels.forEach((txt, i) => { larguras[i] = Math.max(larguras[i] || 10, Math.min(txt.length + 3, 42)); });
            if (tipo === 'header') {
                qtdLinhasCabecalho++;
                row.height = 22;
                row.eachCell(c => {
                    c.font = { bold: true, color: { argb: corTextoClaro } };
                    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: corCabecalho } };
                    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                });
            } else if (tipo === 'footer') {
                row.eachCell(c => {
                    c.font = { bold: true };
                    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: corRodape } };
                });
            } else {
                row.eachCell(c => {
                    let ehNumero = typeof c.value === 'string' && /^-?R?\$?\s*[\d.,]+%?$/.test(c.value.trim()) && /\d/.test(c.value);
                    c.alignment = { horizontal: ehNumero ? 'right' : 'left' };
                });
            }
        });
    };

    processarGrupo(tabela.querySelectorAll('thead tr'), 'header');
    processarGrupo(tabela.querySelectorAll('tbody tr'), 'body');
    processarGrupo(tabela.querySelectorAll('tfoot tr'), 'footer');

    larguras.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    if (qtdLinhasCabecalho > 0) ws.views = [{ state: 'frozen', ySplit: qtdLinhasCabecalho, showGridLines: false }];
}

async function exportarXLSXBySheets() {
    if(dadosProcessados.length === 0) return alert("Não existem dados processados para exportar.");
    if (typeof ExcelJS === 'undefined') return alert("A biblioteca de exportação formatada (ExcelJS) não carregou — verifique sua conexão e tente novamente.");

    let wb = new ExcelJS.Workbook();
    wb.creator = 'SIPOG COFIP';
    wb.created = new Date();

    adicionarAbaDeJSONFormatada(wb, 'GERAL_CONSOLIDADO', dadosProcessados.map(mapFormatoExcel));

    let classesDiferentes = {};
    dadosProcessados.forEach(d => {
        if(!classesDiferentes[d.classe]) classesDiferentes[d.classe] = [];
        classesDiferentes[d.classe].push(d);
    });

    for(let nomeClasse in classesDiferentes) {
        let dadosAba = classesDiferentes[nomeClasse].map(mapFormatoExcel);
        let nomeLimpoAba = nomeClasse.substring(0, 31).replace(/[\\"\?\*\/\[\]]/g, '');
        adicionarAbaDeJSONFormatada(wb, nomeLimpoAba, dadosAba);
    }

    await baixarWorkbookExcelJS(wb, `SPOPIC_V4.7_Planilhas_Classificadas.xlsx`);
}

function mapFormatoExcel(d) {
    return {
        'MAPP': d.mapp, 'SECRETARIA': d.secretaria, 'ÓRGÃO': d.orgao, 'FONTE': d.fonte, 'ESTÁGIO EXECUÇÃO': d.estagio, 'CLASSIFICAÇÃO': labelClasse(d.classe),
        'PROGRAMADO 2026': d.p26, 'LIMITE 2026': d.l26, 'EMPENHADO 2026': d.e26, 'PAGO 2026': d.pg26, 'PREVISÃO EMPENHO 2026': d.prevEmp, 'PREVISÃO EMPENHO 2026 AJUSTADA': d.prevEmpAjustada, 'TRF 2026': d.trf, 'PROGRAMADO 2027': d.p27, 'NECESSIDADE 2027': d.nec,
        'PROGRAMADO 2027 AJUSTADO': d.programado2027Ajustado, 'NECESSIDADE 2027 AJUSTADA': d.necessidade2027Ajustada, 'FOI AJUSTADO': d.foiAjustado ? 'SIM' : 'NÃO',
        'PLOA 2027': d.plo2027,
        'PLOA 2027 AJUSTADO': d.plo2027Ajustado,
        'REGRA METODOLÓGICA': d.regra
    };
}

