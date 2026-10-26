// SIPOG COFIP — js/estudo-loa.js
// Página de estudo separada (estudo-loa.html): LOA 2027 por Órgão × Sub fonte
// cruzada com a Previsão de Empenho por Estágio dos MAPPs. Não altera o SIPOG.
// Script clássico (escopo global). Depende de js/03 (N, S, V, F,
// valorCelulaExcelJS, labelClasse) e js/06 (classificarRegistro, EST_*, labelEstagio).

// ─── ESTADO ─────────────────────────────────────────────────────────────────
let loaLinhas = [];          // [{ grupo, subfonte, descSubfonte, codOrgao, orgao, sigla, valor }]
let loaArquivo = '';
let mappsBrutos = [];        // linhas da planilha de MAPPs, cabeçalho em maiúsculas
let mappsArquivo = '';
let mappsCalculados = [];    // resultado de calcularPrevisaoEmpenhoEstudo por linha
let deParaSugerido = {};     // { subfonte: { fonte, regra } }
let deParaManual = {};       // { subfonte: fonteSIPOG | '' } — escolhas do usuário
let consolidadoAtual = [];   // linhas do Órgão × Fonte (para tela e exportação)

const CHAVE_DEPARA_LOCAL = 'sipog_estudo_loa_depara_v1';

// Padrões da regra vigente — cópia de DEFAULTS_PARAMETROS (js/04-importacao-parametros.js).
const PADROES_ESTUDO = {
    'ep-conveniado': 20, 'ep-licitado': 20, 'ep-emlicitacao': 15,
    'ep-contratado': 20, 'ep-preparatorias': 5, 'ep-naoiniciado': 0,
    'ep-limiar': 40
};

// ─── TEMA ───────────────────────────────────────────────────────────────────
// Mesma chave de tema do SIPOG, para as duas páginas abrirem iguais.
(function aplicarTemaSalvoEstudo() {
    let tema = 'light';
    try { tema = localStorage.getItem('spopic_theme') || 'light'; } catch (e) {}
    document.documentElement.setAttribute('data-theme', tema);
})();

function alternarTemaEstudo() {
    let novo = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', novo);
    try { localStorage.setItem('spopic_theme', novo); } catch (e) {}
}

// ─── UTILITÁRIOS ────────────────────────────────────────────────────────────
function escHtml(v) {
    return String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtPct(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

function lerArquivoComoBuffer(arquivo) {
    return new Promise((resolve, reject) => {
        let r = new FileReader();
        r.onload = e => resolve(e.target.result);
        r.onerror = () => reject(r.error);
        r.readAsArrayBuffer(arquivo);
    });
}

function textoCelula(cell) {
    let v = valorCelulaExcelJS(cell.value);
    return v === null || v === undefined ? '' : String(v);
}

function numeroCelula(cell) {
    let v = valorCelulaExcelJS(cell.value);
    if (typeof v === 'number') return v;
    if (v === '' || v === null || v === undefined) return null;
    let n = V(v);
    return isFinite(n) ? n : null;
}

// Sigla entre parênteses no fim do nome do órgão: "POLÍCIA MILITAR (PM)" → "PM".
function extrairSigla(nomeOrgao) {
    let m = String(nomeOrgao || '').match(/\(([^()]*)\)\s*$/);
    return m ? m[1].trim() : String(nomeOrgao || '').trim();
}

// "(754)-(259) Crédito Externo - BID" → { fff: '754', ddd: '259' }
function partesFonteSIPOG(fonte) {
    let m = String(fonte || '').match(/^\s*\((\d{3})\)\s*-\s*\(([\d,]+)\)/);
    return m ? { fff: m[1], ddd: m[2] } : null;
}

// ─── LEITURA DA LOA (aba "Fonte x Órgão", coluna C) ─────────────────────────
// A aba é hierárquica: linha de grupo (TESOURO / OUTRAS FONTES), linha de sub
// fonte (500.9.1.0.00.00 + descrição) e linhas de órgão (código de 8 dígitos +
// "NOME (SIGLA)" + valor na coluna C). Totais são ignorados.
function lerLOADeWorkbook(wb) {
    let ws = wb.worksheets.find(w => N(w.name).replace(/\s+/g, ' ').includes('FONTE X ORGAO'));
    if (!ws) throw new Error('Aba "Fonte x Órgão" não encontrada no arquivo.');

    let linhas = [];
    let grupo = '', subfonte = '', descSubfonte = '';
    ws.eachRow({ includeEmpty: false }, row => {
        let a = textoCelula(row.getCell(1)).trim();
        let b = textoCelula(row.getCell(2)).trim();
        let nA = N(a);
        if (nA === 'TESOURO') { grupo = 'Tesouro'; return; }
        if (nA === 'OUTRAS FONTES') { grupo = 'Outras Fontes'; return; }
        if (/^\d{3}(\.\d+){5}$/.test(a)) { subfonte = a; descSubfonte = b; return; }
        if (/^\d{8}$/.test(a) && subfonte) {
            let valor = numeroCelula(row.getCell(3));
            if (valor === null) return;
            linhas.push({ grupo, subfonte, descSubfonte, codOrgao: a, orgao: b, sigla: extrairSigla(b), valor });
        }
    });
    if (linhas.length === 0) throw new Error('Nenhuma linha de órgão com valor foi encontrada na aba "Fonte x Órgão".');

    // Conferência com a aba "Resumo por sub fonte" (coluna B = sub fonte, E = valor).
    let divergencias = [], conferido = false;
    let wsResumo = wb.worksheets.find(w => N(w.name).includes('RESUMO'));
    if (wsResumo) {
        let somaLida = {};
        linhas.forEach(l => { somaLida[l.subfonte] = (somaLida[l.subfonte] || 0) + l.valor; });
        wsResumo.eachRow({ includeEmpty: false }, row => {
            let sf = textoCelula(row.getCell(2)).trim();
            if (!/^\d{3}(\.\d+){5}$/.test(sf)) return;
            conferido = true;
            let esperado = numeroCelula(row.getCell(5)) || 0;
            let lido = somaLida[sf] || 0;
            if (Math.abs(esperado - lido) > 0.5) divergencias.push({ subfonte: sf, esperado, lido });
        });
    }
    return { linhas, conferido, divergencias };
}

async function selecionarArquivoLOA(input) {
    let arquivo = input.files && input.files[0];
    if (!arquivo) return;
    let status = document.getElementById('status-loa');
    status.innerHTML = 'Lendo…';
    try {
        let wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await lerArquivoComoBuffer(arquivo));
        carregarLOA(lerLOADeWorkbook(wb), arquivo.name);
    } catch (err) {
        console.error(err);
        loaLinhas = [];
        status.innerHTML = `<span class="erro">❌ ${escHtml(err.message || err)}</span>`;
        recalcularEstudo();
    }
}

function carregarLOA(resultado, nomeArquivo) {
    loaLinhas = resultado.linhas;
    loaArquivo = nomeArquivo || '';
    let total = loaLinhas.reduce((s, l) => s + l.valor, 0);
    let subfontes = new Set(loaLinhas.map(l => l.subfonte)).size;
    let orgaos = new Set(loaLinhas.map(l => l.codOrgao)).size;
    let conf;
    if (!resultado.conferido) conf = '<span class="aviso">⚠ Aba "Resumo por sub fonte" ausente — soma não conferida.</span>';
    else if (resultado.divergencias.length === 0) conf = '<span class="ok">✔ Somas por sub fonte conferem com o Resumo.</span>';
    else conf = `<span class="erro">✖ ${resultado.divergencias.length} sub fonte(s) divergem do Resumo:</span> ` +
        resultado.divergencias.slice(0, 5).map(d => `${escHtml(d.subfonte)} (lido ${F(d.lido)} × resumo ${F(d.esperado)})`).join('; ');
    document.getElementById('status-loa').innerHTML =
        `<span class="ok">✅ ${escHtml(loaArquivo)}</span><br>` +
        `${loaLinhas.length.toLocaleString('pt-BR')} pares Sub fonte × Órgão · ${subfontes} sub fontes · ${orgaos} órgãos<br>` +
        `Total LOA: <strong>${F(total)}</strong><br>${conf}`;
    recalcularEstudo();
}

// ─── LEITURA DA BASE DE MAPPs (mesmo layout do importar() do SIPOG) ─────────
// Aceita também o CSV bruto da extração do MAPP (";" e Windows-1252), cujas
// colunas de valor têm outros nomes — traduzidos para o layout do SIPOG abaixo,
// só quando a coluna do SIPOG não existir no arquivo.
const ALIASES_COLUNAS_MAPPS = {
    VLR_PROGRAMADO_2025: 'VLR_PLANEJADO_25', VLR_EMPENHADO_2025: 'VLR_EMPENHO_25', VLR_PAGO_2025: 'VLR_PAGO_25',
    VLR_PROGRAMADO_2026: 'VLR_PLANEJADO_26', VLR_LIMITE_2026: 'VLR_LIMITE', VLR_EMPENHADO_2026: 'VLR_EMPENHO_26',
    VLR_PAGO_2026: 'VLR_PAGO_26', VLR_PROGRAMADO_2027: 'VLR_PLANEJADO_27'
};
const COLUNAS_OBRIGATORIAS_MAPPS = ['MAPP', 'ORGAO', 'FONTE', 'ESTAGIO_EXECUCAO', 'VLR_PROGRAMADO_2026', 'VLR_LIMITE_2026', 'VLR_EMPENHADO_2026', 'VLR_PROGRAMADO_2027'];
const COLUNAS_GRUPO_MAPPS = ['CONTRATO_GESTAO', 'CONTINUIDADE', 'PCF_CONVENIO', 'OPERACAO_CREDITO', 'ENTREGA_PRIORITARIA'];

// Decodifica o arquivo texto: UTF-8 se for válido, senão Windows-1252 (padrão das extrações).
function decodificarTextoArquivo(buffer) {
    let texto;
    try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch (e) { texto = new TextDecoder('windows-1252').decode(buffer); }
    return texto.replace(/^﻿/, '');
}

// Parser CSV com suporte a campos entre aspas (inclusive com separador e quebra de linha).
function parseCSV(texto, sep) {
    let linhas = [], campo = '', linha = [], aspas = false;
    for (let i = 0; i < texto.length; i++) {
        let c = texto[i];
        if (aspas) {
            if (c === '"') {
                if (texto[i + 1] === '"') { campo += '"'; i++; }
                else aspas = false;
            } else campo += c;
        } else if (c === '"') aspas = true;
        else if (c === sep) { linha.push(campo); campo = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && texto[i + 1] === '\n') i++;
            linha.push(campo); campo = '';
            linhas.push(linha); linha = [];
        } else campo += c;
    }
    if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas;
}

function lerMAPPsDeCSV(texto) {
    let primeira = texto.slice(0, texto.indexOf('\n') > 0 ? texto.indexOf('\n') : texto.length);
    let sep = (primeira.split(';').length >= primeira.split(',').length) ? ';' : ',';
    let tabela = parseCSV(texto, sep);
    let headers = (tabela[0] || []).map(h => String(h).trim().toUpperCase());
    let linhas = [];
    for (let i = 1; i < tabela.length; i++) {
        let cel = tabela[i];
        if (cel.every(v => String(v).trim() === '')) continue;
        let obj = {};
        headers.forEach((h, j) => { if (h) obj[h] = cel[j] !== undefined ? cel[j] : ''; });
        linhas.push(obj);
    }
    return { linhas, headers };
}

// Traduz colunas do CSV bruto para o layout do SIPOG e uniformiza a grafia do
// estágio "FISIC/FINAN.CONCLUÍDA" (extração) → "FISIC/FINAN,CONCLUÍDA" (SIPOG).
function normalizarLayoutMAPPs(linhas, headers) {
    let traduzidas = [];
    for (let destino in ALIASES_COLUNAS_MAPPS) {
        let origem = ALIASES_COLUNAS_MAPPS[destino];
        if (!headers.includes(destino) && headers.includes(origem)) traduzidas.push([origem, destino]);
    }
    linhas.forEach(l => {
        traduzidas.forEach(([origem, destino]) => { l[destino] = l[origem]; });
        if (l.ESTAGIO_EXECUCAO !== undefined) l.ESTAGIO_EXECUCAO = String(l.ESTAGIO_EXECUCAO).replace(/FINAN\.\s*CONCL/i, 'FINAN,CONCL');
    });
    let disponiveis = headers.concat(traduzidas.map(t => t[1]));
    return {
        traduzidas,
        faltando: COLUNAS_OBRIGATORIAS_MAPPS.filter(c => !disponiveis.includes(c)),
        semGrupo: COLUNAS_GRUPO_MAPPS.every(c => !disponiveis.includes(c) && !(c === 'OPERACAO_CREDITO' && disponiveis.includes('OPERACA_CREDITO')))
    };
}

function lerMAPPsDeWorkbook(wb) {
    let ws = wb.worksheets[0];
    let headers = [];
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
        headers[col] = String(valorCelulaExcelJS(cell.value)).trim().toUpperCase();
    });
    let linhas = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return;
        let obj = {}, vazia = true;
        headers.forEach((h, col) => {
            if (!h) return;
            let val = valorCelulaExcelJS(row.getCell(col).value);
            obj[h] = val;
            if (val !== '' && val !== null) vazia = false;
        });
        if (!vazia) linhas.push(obj);
    });
    return { linhas, headers: headers.filter(Boolean) };
}

async function selecionarArquivoMAPPs(input) {
    let arquivo = input.files && input.files[0];
    if (!arquivo) return;
    let status = document.getElementById('status-mapps');
    status.innerHTML = 'Lendo…';
    try {
        let buffer = await lerArquivoComoBuffer(arquivo);
        let r;
        if (/\.(csv|txt)$/i.test(arquivo.name)) {
            r = lerMAPPsDeCSV(decodificarTextoArquivo(buffer));
        } else {
            let wb = new ExcelJS.Workbook();
            await wb.xlsx.load(buffer);
            r = lerMAPPsDeWorkbook(wb);
        }
        carregarMAPPs(r.linhas, arquivo.name, r.headers);
    } catch (err) {
        console.error(err);
        mappsBrutos = [];
        status.innerHTML = `<span class="erro">❌ ${escHtml(err.message || err)}</span>`;
        recalcularEstudo();
    }
}

// Também usada nos testes, com as linhas já em memória (ex.: dadosBrutos do SIPOG).
function carregarMAPPs(linhas, nomeArquivo, headers) {
    mappsBrutos = linhas.map(l => {
        let o = {};
        for (let k in l) o[String(k).trim().toUpperCase()] = l[k];
        return o;
    });
    let cab = (headers && headers.length ? headers : Object.keys(mappsBrutos[0] || {})).map(h => String(h).trim().toUpperCase());
    let n = normalizarLayoutMAPPs(mappsBrutos, cab);
    mappsArquivo = nomeArquivo || '';
    let avisos = '';
    if (n.traduzidas.length)
        avisos += `<br>Colunas traduzidas para o layout do SIPOG: ${n.traduzidas.map(t => `${escHtml(t[0])} → ${escHtml(t[1])}`).join(', ')}`;
    if (n.faltando.length)
        avisos += `<br><span class="erro">✖ Colunas não encontradas: ${n.faltando.map(escHtml).join(', ')}</span>`;
    if (n.semGrupo)
        avisos += `<br><span class="aviso">⚠ Sem colunas de grupo (${COLUNAS_GRUPO_MAPPS.join(', ')}): todos os MAPPs seguem a regra por estágio, como "Demais Projetos" — os grupos com 100% do Programado e o expurgo de Entrega Prioritária não se aplicam, e o resultado pode diferir do SIPOG.</span>`;
    let expurgos = mappsBrutos.filter(r => { let e = N(r.ESTAGIO_EXECUCAO); return e.includes('CONCLUIDO') || e.includes('CANCELADO') || e.includes('TRANSFERIDO'); }).length;
    document.getElementById('status-mapps').innerHTML =
        `<span class="ok">✅ ${escHtml(mappsArquivo)}</span><br>${mappsBrutos.length.toLocaleString('pt-BR')} linhas lidas ` +
        `(${expurgos.toLocaleString('pt-BR')} concluídas/canceladas/transferidas, expurgadas)${avisos}`;
    recalcularEstudo();
}

// ─── REGRA: PREVISÃO DE EMPENHO POR ESTÁGIO ─────────────────────────────────
// CÓPIA da regra de processarDados() (js/08-processamento.js), no Cenário de
// Simulação PADRAO (o único usado na prática no SIPOG) e sem Valor Deliberado,
// subtetos ou edições manuais. Se a regra mudar no js/08, atualizar aqui também.
// pcts: frações (0,20 = 20%); limiar: percentual do Programado 2026 em Em Execução.
function calcularPrevisaoEmpenhoEstudo(r, pcts, limiar) {
    let estagio = N(r.ESTAGIO_EXECUCAO);
    let classe = classificarRegistro(r);
    let p26 = V(r.VLR_PROGRAMADO_2026), l26 = V(r.VLR_LIMITE_2026), e26 = V(r.VLR_EMPENHADO_2026), p27 = V(r.VLR_PROGRAMADO_2027);
    let base = {
        mapp: r.MAPP || 'SEM MAPP', orgao: String(r.ORGAO || 'NÃO INFORMADO').trim(), fonte: String(r.FONTE || 'NÃO INFORMADA').trim(),
        estagio: labelEstagio(estagio), classe, p26, l26, e26, p27
    };

    if (estagio.includes('CONCLUIDO') || estagio.includes('CANCELADO') || estagio.includes('TRANSFERIDO')) {
        let motivo = 'EXPURGO: ';
        if (estagio.includes('CONCLUIDO')) motivo += 'MAPP CONCLUÍDO';
        if (estagio.includes('CANCELADO')) motivo += 'MAPP CANCELADO';
        if (estagio.includes('TRANSFERIDO')) motivo += 'MAPP TRANSFERIDO';
        return Object.assign(base, { expurgado: true, regra: motivo, prevEmp: 0, trf: 0, nec: 0 });
    }
    if (classe === 'ENTREGA_PRIORITARIA') {
        return Object.assign(base, { expurgado: true, regra: 'EXPURGO: GRUPO ENTREGA PRIORITÁRIA (grupo oculto do sistema)', prevEmp: 0, trf: 0, nec: 0 });
    }

    let prevEmp = 0, justificativa = 'FALLBACK';
    if (S(r.CONTRATO_GESTAO)) { prevEmp = p26; justificativa = 'CONTRATO_GESTAO (100% — SEM TRANSFERÊNCIA)'; }
    else if (S(r.CONTINUIDADE)) { prevEmp = p26; justificativa = 'CONTINUIDADE (100% — SEM TRANSFERÊNCIA)'; }
    else if (S(r.PCF_CONVENIO)) { prevEmp = p26; justificativa = 'PCF_CONVENIO (100% — SEM TRANSFERÊNCIA)'; }
    else if (S(r.OPERACAO_CREDITO) || S(r.OPERACA_CREDITO)) { prevEmp = p26; justificativa = 'OPERACAO_CREDITO (100% — SEM TRANSFERÊNCIA)'; }
    else if (estagio === EST_CONVENIADO) {
        if (l26 === 0) { prevEmp = p26 * pcts.conveniado; justificativa = `ESTÁGIO CONVENIADO (${pcts.conveniado*100}%)`; }
        else { prevEmp = l26; justificativa = 'ESTÁGIO CONVENIADO (LIMITE 2026 GARANTIDO)'; }
    }
    else if (estagio === EST_EM_LICITACAO) {
        if (l26 === 0) { prevEmp = p26 * pcts.emlicitacao; justificativa = `ESTÁGIO EM LICITAÇÃO (${pcts.emlicitacao*100}%)`; }
        else { prevEmp = l26; justificativa = 'ESTÁGIO EM LICITAÇÃO (LIMITE 2026 GARANTIDO)'; }
    }
    else if (estagio === EST_LICITADO) {
        if (l26 === 0) { prevEmp = p26 * pcts.licitado; justificativa = `ESTÁGIO LICITADO (${pcts.licitado*100}%)`; }
        else { prevEmp = l26; justificativa = 'ESTÁGIO LICITADO (LIMITE 2026 GARANTIDO)'; }
    }
    else if (estagio === EST_CONTRATADO) {
        if (l26 === 0) { prevEmp = p26 * pcts.contratado; justificativa = `ESTÁGIO CONTRATADO (${pcts.contratado*100}%)`; }
        else { prevEmp = l26; justificativa = 'ESTÁGIO CONTRATADO (LIMITE 2026 GARANTIDO)'; }
    }
    else if (estagio === EST_ATIV_PREPARATORIAS) {
        if (l26 === 0) { prevEmp = p26 * pcts.preparatorias; justificativa = `ESTÁGIO ATIVIDADES PREPARATÓRIAS (${pcts.preparatorias*100}%)`; }
        else { prevEmp = l26; justificativa = 'ESTÁGIO ATIVIDADES PREPARATÓRIAS (LIMITE 2026 GARANTIDO)'; }
    }
    else if (estagio === EST_NAO_INICIADO) { prevEmp = p26 * pcts.naoiniciado; justificativa = `ESTÁGIO NÃO INICIADO (${pcts.naoiniciado*100}%)`; }
    else if (estagio === EST_PARALISADO) { prevEmp = e26; justificativa = 'ESTÁGIO PARALISADO (FIXO = EMPENHADO 2026)'; }
    else if (estagio === EST_EXEC_FIS_CONCL) { prevEmp = l26; justificativa = 'ESTÁGIO EXECUÇÃO FÍSICA CONCLUÍDA (FIXO = LIMITE 2026)'; }
    else if (estagio === EST_EXEC_FISFIN_CONCL) { prevEmp = p26; justificativa = 'ESTÁGIO EXECUÇÃO FÍSIC/FINAN,CONCLUÍDA (100% — SEM TRANSFERÊNCIA)'; }
    else if (estagio === EST_EM_EXECUCAO) {
        let parametro = p26 * (limiar / 100);
        if (e26 === 0) { prevEmp = l26; justificativa = 'EM EXECUÇÃO: EMP=0 → LIMITE 2026'; }
        else if (e26 > 0 && e26 < parametro) { prevEmp = (e26 / 5) * 12; justificativa = `EM EXECUÇÃO: (EMP/5)×12 [EMP < ${limiar}% PROG]`; }
        else { prevEmp = p26; justificativa = `EM EXECUÇÃO: EMP >= ${limiar}% PROG → PROGRAMADO`; }
        if (prevEmp > p26) { prevEmp = p26; justificativa += ' [CAP: PROG 2026]'; }
    } else { prevEmp = p26; justificativa = 'PADRÃO DE SEGURANÇA (100% PROGRAMADO)'; }

    let trf = p26 - prevEmp;
    return Object.assign(base, { expurgado: false, regra: justificativa, prevEmp, trf, nec: p27 + trf });
}

function lerParametrosEstudo() {
    let v = id => {
        let el = document.getElementById(id);
        return el ? V(el.value) : PADROES_ESTUDO[id];
    };
    return {
        pcts: {
            conveniado: v('ep-conveniado') / 100, licitado: v('ep-licitado') / 100, emlicitacao: v('ep-emlicitacao') / 100,
            contratado: v('ep-contratado') / 100, preparatorias: v('ep-preparatorias') / 100, naoiniciado: v('ep-naoiniciado') / 100
        },
        limiar: v('ep-limiar')
    };
}

function restaurarParametrosEstudo() {
    for (let id in PADROES_ESTUDO) {
        let el = document.getElementById(id);
        if (el) el.value = PADROES_ESTUDO[id];
    }
    recalcularEstudo();
}

// ─── DE-PARA: SUB FONTE DA LOA → FONTE DO SIPOG ─────────────────────────────
function carregarDeParaManual() {
    try { deParaManual = JSON.parse(localStorage.getItem(CHAVE_DEPARA_LOCAL) || '{}') || {}; }
    catch (e) { deParaManual = {}; }
}

function salvarDeParaManual() {
    try { localStorage.setItem(CHAVE_DEPARA_LOCAL, JSON.stringify(deParaManual)); } catch (e) {}
}

function fontesSIPOGDisponiveis() {
    return Array.from(new Set(mappsBrutos.map(r => String(r.FONTE || '').trim()).filter(Boolean))).sort();
}

// Regras, em ordem: exata → tesouro → prefixo → sem par.
function sugerirFonteSIPOG(linhaLOA, fontesSIPOG) {
    let seg = linhaLOA.subfonte.split('.');
    let fff = seg[0], modalidade = seg[3], det = seg[5];
    let comPartes = fontesSIPOG.map(f => ({ fonte: f, p: partesFonteSIPOG(f) })).filter(x => x.p);
    let mesmoFFF = comPartes.filter(x => x.p.fff === fff);

    let alvo = (fff === '754') ? (modalidade + det) : ('0' + det);
    let exatas = mesmoFFF.filter(x => x.p.ddd === alvo);
    if (exatas.length === 1) return { fonte: exatas[0].fonte, regra: 'exata' };

    if (linhaLOA.grupo === 'Tesouro' && (fff === '500' || fff === '501')) {
        let tesouro = comPartes.find(x => x.p.fff === '500' && x.p.ddd === '501');
        if (tesouro) return { fonte: tesouro.fonte, regra: 'tesouro' };
    }

    let semTesouro = mesmoFFF.filter(x => !(x.p.fff === '500' && x.p.ddd === '501'));
    if (semTesouro.length === 1) return { fonte: semTesouro[0].fonte, regra: 'prefixo' };
    // Emendas parlamentares (detalhamento 3xx, ex.: "(600)-(312) SUS - Emenda") são
    // recortes da fonte principal: se, sem elas, sobrar uma única fonte, é a principal.
    let semEmendas = semTesouro.filter(x => !/^3\d\d/.test(x.p.ddd));
    if (semEmendas.length === 1) return { fonte: semEmendas[0].fonte, regra: 'prefixo' };

    return { fonte: '', regra: 'sem' };
}

function recalcularDeParaSugerido() {
    let fontes = fontesSIPOGDisponiveis();
    deParaSugerido = {};
    loaLinhas.forEach(l => {
        if (!deParaSugerido[l.subfonte]) deParaSugerido[l.subfonte] = sugerirFonteSIPOG(l, fontes);
    });
}

// Fonte efetiva da sub fonte: escolha manual (inclusive "sem fonte") ou sugestão.
function fonteEfetiva(subfonte) {
    if (Object.prototype.hasOwnProperty.call(deParaManual, subfonte)) return { fonte: deParaManual[subfonte], regra: 'manual' };
    return deParaSugerido[subfonte] || { fonte: '', regra: 'sem' };
}

function alterarDePara(sel) {
    let sf = sel.dataset.subfonte;
    if (sel.value === '__auto__') delete deParaManual[sf];
    else deParaManual[sf] = sel.value;
    salvarDeParaManual();
    recalcularEstudo();
}

const ROTULO_REGRA_DEPARA = { exata: 'exata', tesouro: 'tesouro', prefixo: 'prefixo', manual: 'manual', sem: 'sem par' };

function renderizarDePara() {
    let cont = document.getElementById('tabela-depara');
    let badge = document.getElementById('badge-depara');
    if (loaLinhas.length === 0) {
        cont.innerHTML = '<p class="estudo-nota" style="padding:12px;">Carregue a LOA e a base de MAPPs.</p>';
        badge.textContent = '';
        return;
    }
    let porSubfonte = {};
    loaLinhas.forEach(l => {
        if (!porSubfonte[l.subfonte]) porSubfonte[l.subfonte] = { grupo: l.grupo, subfonte: l.subfonte, desc: l.descSubfonte, valor: 0, orgaos: 0 };
        porSubfonte[l.subfonte].valor += l.valor;
        porSubfonte[l.subfonte].orgaos++;
    });
    let fontes = fontesSIPOGDisponiveis();
    let lista = Object.values(porSubfonte).sort((a, b) => a.subfonte.localeCompare(b.subfonte));
    let semPar = lista.filter(s => !fonteEfetiva(s.subfonte).fonte).length;
    badge.textContent = semPar > 0 ? `${semPar} sem fonte` : '';
    badge.className = 'estudo-tag ' + (semPar > 0 ? 'tag-sem' : 'tag-exata');

    let h = `<table><thead><tr>
        <th class="sem-ordem">Grupo</th><th class="sem-ordem">Sub fonte</th><th class="sem-ordem">Descrição</th>
        <th class="sem-ordem num">Órgãos</th><th class="sem-ordem num">LOA 2027</th>
        <th class="sem-ordem">Regra</th><th class="sem-ordem">Fonte do SIPOG</th></tr></thead><tbody>`;
    lista.forEach(s => {
        let ef = fonteEfetiva(s.subfonte);
        let sug = deParaSugerido[s.subfonte] || { fonte: '', regra: 'sem' };
        let tag = ef.fonte || ef.regra === 'manual' ? ef.regra : 'sem';
        let opcoes = `<option value="__auto__"${ef.regra !== 'manual' ? ' selected' : ''}>Automático${sug.fonte ? ': ' + escHtml(sug.fonte) : ' (sem par)'}</option>`;
        opcoes += `<option value=""${ef.regra === 'manual' && ef.fonte === '' ? ' selected' : ''}>— Sem fonte (fica fora do cruzamento) —</option>`;
        fontes.forEach(f => {
            opcoes += `<option value="${escHtml(f)}"${ef.regra === 'manual' && ef.fonte === f ? ' selected' : ''}>${escHtml(f)}</option>`;
        });
        h += `<tr>
            <td>${escHtml(s.grupo)}</td><td style="white-space:nowrap;">${escHtml(s.subfonte)}</td><td>${escHtml(s.desc)}</td>
            <td class="num">${s.orgaos}</td><td class="num">${F(s.valor)}</td>
            <td><span class="estudo-tag tag-${tag === 'sem par' ? 'sem' : tag}">${ROTULO_REGRA_DEPARA[tag] || tag}</span></td>
            <td><select data-subfonte="${escHtml(s.subfonte)}" onchange="alterarDePara(this)" style="max-width:340px;">${opcoes}</select></td>
        </tr>`;
    });
    h += '</tbody></table>';
    cont.innerHTML = h;
}

// ─── CONSOLIDADO ÓRGÃO × FONTE ──────────────────────────────────────────────
// Pares com LOA e MAPPs primeiro (o cruzamento de interesse), depois os demais.
const ORDEM_SITUACAO = { OK: 0, SEM_MAPP: 1, SEM_LOA: 2 };

function montarConsolidado() {
    let mapa = {};
    let chave = (orgaoN, fonte) => orgaoN + '||' + fonte;
    let obter = (orgaoN, rotulo, fonte) => {
        let k = chave(orgaoN, fonte);
        if (!mapa[k]) mapa[k] = { orgao: rotulo, fonte, loa: 0, temLOA: false, qtd: 0, p26: 0, prevEmp: 0, nec: 0, subfontes: new Set() };
        return mapa[k];
    };
    let loaForaCruzamento = 0, paresForaCruzamento = 0;
    loaLinhas.forEach(l => {
        let fonte = fonteEfetiva(l.subfonte).fonte;
        if (!fonte) { loaForaCruzamento += l.valor; paresForaCruzamento++; return; }
        let item = obter(N(l.sigla), l.sigla, fonte);
        item.loa += l.valor;
        item.temLOA = true;
        item.subfontes.add(l.subfonte);
    });
    mappsCalculados.forEach(m => {
        if (m.expurgado) return;
        let item = obter(N(m.orgao), m.orgao, m.fonte);
        item.qtd++;
        item.p26 += m.p26;
        item.prevEmp += m.prevEmp;
        item.nec += m.nec;
    });
    consolidadoAtual = Object.values(mapa).map(i => {
        let situacao = i.temLOA && i.qtd > 0 ? 'OK' : (i.temLOA ? 'SEM_MAPP' : 'SEM_LOA');
        return Object.assign(i, {
            situacao,
            subfontesTxt: Array.from(i.subfontes).sort().join(', '),
            pctLOA: i.loa > 0 ? (i.nec / i.loa) * 100 : null,
            saldo: i.temLOA ? i.loa - i.nec : null
        });
    }).sort((a, b) => (ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao]) || a.fonte.localeCompare(b.fonte) ||
        (b.loa - a.loa) || (b.nec - a.nec) || a.orgao.localeCompare(b.orgao));
    return { loaForaCruzamento, paresForaCruzamento };
}

const ROTULO_SITUACAO = { OK: 'LOA e MAPPs', SEM_LOA: 'MAPPs sem LOA', SEM_MAPP: 'LOA sem MAPPs' };
let resumoForaCruzamento = { loaForaCruzamento: 0, paresForaCruzamento: 0 };

function renderizarConsolidado() {
    let cont = document.getElementById('tabela-consolidado');
    let resumoEl = document.getElementById('resumo-consolidado');
    if (loaLinhas.length === 0 && mappsCalculados.length === 0) {
        cont.innerHTML = '<p class="estudo-nota" style="padding:12px;">Carregue os arquivos.</p>';
        resumoEl.innerHTML = '';
        return;
    }
    let fFonte = document.getElementById('filtro-cons-fonte').value;
    let fSit = document.getElementById('filtro-cons-situacao').value;
    let fTxt = N(document.getElementById('filtro-cons-texto').value);
    let linhas = consolidadoAtual.filter(l =>
        (!fFonte || l.fonte === fFonte) && (!fSit || l.situacao === fSit) && (!fTxt || N(l.orgao).includes(fTxt)));

    let tot = linhas.reduce((t, l) => {
        t.loa += l.loa; t.qtd += l.qtd; t.p26 += l.p26; t.prevEmp += l.prevEmp; t.nec += l.nec;
        if (l.temLOA) t.necComLOA += l.nec;
        return t;
    }, { loa: 0, qtd: 0, p26: 0, prevEmp: 0, nec: 0, necComLOA: 0 });
    let necSemLOA = linhas.filter(l => l.situacao === 'SEM_LOA').reduce((s, l) => s + l.nec, 0);
    resumoEl.innerHTML = `
        <div><span>LOA 2027 (filtro)</span><b>${F(tot.loa)}</b></div>
        <div><span>Necessidade 2027 dos MAPPs</span><b>${F(tot.nec)}</b></div>
        <div><span>% da LOA (só pares com LOA)</span><b>${fmtPct(tot.loa > 0 ? tot.necComLOA / tot.loa * 100 : null)}</b></div>
        <div><span>Necessidade em MAPPs sem LOA</span><b>${F(necSemLOA)}</b></div>
        <div><span>LOA fora do cruzamento (sub fonte sem fonte)</span><b>${F(resumoForaCruzamento.loaForaCruzamento)}</b><small style="color:var(--muted);">${resumoForaCruzamento.paresForaCruzamento} pares — ver De-para</small></div>`;

    if (linhas.length === 0) { cont.innerHTML = '<p class="estudo-nota" style="padding:12px;">Nenhuma linha para os filtros.</p>'; return; }
    let h = `<table><thead><tr>
        <th class="sem-ordem">Fonte do SIPOG</th><th class="sem-ordem">Órgão</th><th class="sem-ordem">Situação</th>
        <th class="sem-ordem num">LOA 2027</th><th class="sem-ordem num">MAPPs</th><th class="sem-ordem num">Programado 2026</th>
        <th class="sem-ordem num">Prev. Empenho 2026</th><th class="sem-ordem num">Necessidade 2027</th>
        <th class="sem-ordem num">% da LOA</th><th class="sem-ordem num">Saldo (LOA − Nec.)</th><th class="sem-ordem">Sub fontes da LOA</th>
        </tr></thead><tbody>`;
    linhas.forEach(l => {
        let tag = l.situacao === 'OK' ? 'tag-exata' : (l.situacao === 'SEM_LOA' ? 'tag-sem' : 'tag-prefixo');
        h += `<tr>
            <td style="min-width:220px;">${escHtml(l.fonte)}</td><td><strong>${escHtml(l.orgao)}</strong></td>
            <td><span class="estudo-tag ${tag}">${ROTULO_SITUACAO[l.situacao]}</span></td>
            <td class="num">${l.temLOA ? F(l.loa) : '—'}</td><td class="num">${l.qtd || '—'}</td>
            <td class="num">${F(l.p26)}</td><td class="num">${F(l.prevEmp)}</td><td class="num">${F(l.nec)}</td>
            <td class="num ${l.pctLOA !== null && l.pctLOA > 100 ? 'pct-alto' : ''}">${fmtPct(l.pctLOA)}</td>
            <td class="num ${l.saldo !== null && l.saldo < 0 ? 'pct-alto' : ''}">${l.saldo === null ? '—' : F(l.saldo)}</td>
            <td style="font-size:11px; color:var(--muted);">${escHtml(l.subfontesTxt)}</td>
        </tr>`;
    });
    h += `</tbody><tfoot><tr><td colspan="3">TOTAL (${linhas.length} linhas)</td>
        <td class="num">${F(tot.loa)}</td><td class="num">${tot.qtd}</td><td class="num">${F(tot.p26)}</td>
        <td class="num">${F(tot.prevEmp)}</td><td class="num">${F(tot.nec)}</td>
        <td class="num">${fmtPct(tot.loa > 0 ? tot.necComLOA / tot.loa * 100 : null)}</td><td class="num">—</td><td></td></tr></tfoot></table>`;
    cont.innerHTML = h;
}

// ─── DETALHE POR MAPP ───────────────────────────────────────────────────────
const LIMITE_LINHAS_DETALHE = 500;

function preencherSelect(id, valores, rotuloTodos) {
    let sel = document.getElementById(id);
    if (!sel) return;
    let atual = sel.value;
    sel.innerHTML = `<option value="">${rotuloTodos}</option>` +
        valores.map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('');
    if (valores.includes(atual)) sel.value = atual;
}

function atualizarFiltros() {
    let orgaos = Array.from(new Set(mappsCalculados.map(m => m.orgao))).sort();
    let fontes = Array.from(new Set(mappsCalculados.map(m => m.fonte))).sort();
    let estagios = Array.from(new Set(mappsCalculados.map(m => m.estagio))).sort();
    let fontesCons = Array.from(new Set(consolidadoAtual.map(l => l.fonte))).sort();
    preencherSelect('filtro-det-orgao', orgaos, '(todos)');
    preencherSelect('filtro-det-fonte', fontes, '(todas)');
    preencherSelect('filtro-det-estagio', estagios, '(todos)');
    preencherSelect('filtro-cons-fonte', fontesCons, '(todas)');
}

function renderizarDetalhe() {
    let cont = document.getElementById('tabela-detalhe');
    if (mappsCalculados.length === 0) {
        cont.innerHTML = '<p class="estudo-nota" style="padding:12px;">Carregue a base de MAPPs.</p>';
        return;
    }
    let fOrg = document.getElementById('filtro-det-orgao').value;
    let fFon = document.getElementById('filtro-det-fonte').value;
    let fEst = document.getElementById('filtro-det-estagio').value;
    let fExp = document.getElementById('filtro-det-expurgo').checked;
    let fTxt = N(document.getElementById('filtro-det-texto').value);
    let linhas = mappsCalculados.filter(m =>
        (fExp || !m.expurgado) && (!fOrg || m.orgao === fOrg) && (!fFon || m.fonte === fFon) && (!fEst || m.estagio === fEst) &&
        (!fTxt || N(m.mapp).includes(fTxt) || N(m.regra).includes(fTxt)));

    let tot = linhas.reduce((t, m) => { t.p26 += m.p26; t.l26 += m.l26; t.e26 += m.e26; t.prevEmp += m.prevEmp; t.trf += m.trf; t.p27 += m.p27; t.nec += m.nec; return t; },
        { p26: 0, l26: 0, e26: 0, prevEmp: 0, trf: 0, p27: 0, nec: 0 });
    let exibidas = linhas.slice(0, LIMITE_LINHAS_DETALHE);
    let h = `<table><thead><tr>
        <th class="sem-ordem">MAPP</th><th class="sem-ordem">Órgão</th><th class="sem-ordem">Fonte</th><th class="sem-ordem">Estágio</th><th class="sem-ordem">Grupo</th>
        <th class="sem-ordem num">Programado 2026</th><th class="sem-ordem num">Limite 2026</th><th class="sem-ordem num">Empenhado 2026</th>
        <th class="sem-ordem">Regra aplicada</th><th class="sem-ordem num">Prev. Empenho 2026</th><th class="sem-ordem num">TRF 2026</th>
        <th class="sem-ordem num">Programado 2027</th><th class="sem-ordem num">Necessidade 2027</th></tr></thead><tbody>`;
    exibidas.forEach(m => {
        h += `<tr${m.expurgado ? ' style="opacity:0.55;"' : ''}>
            <td style="white-space:nowrap;">${escHtml(m.mapp)}</td><td>${escHtml(m.orgao)}</td><td style="font-size:11px;">${escHtml(m.fonte)}</td>
            <td style="font-size:11px;">${escHtml(m.estagio)}</td><td style="font-size:11px;">${escHtml(labelClasse(m.classe))}</td>
            <td class="num">${F(m.p26)}</td><td class="num">${F(m.l26)}</td><td class="num">${F(m.e26)}</td>
            <td style="font-size:11px;">${escHtml(m.regra)}</td>
            <td class="num">${F(m.prevEmp)}</td><td class="num">${F(m.trf)}</td><td class="num">${F(m.p27)}</td><td class="num"><strong>${F(m.nec)}</strong></td>
        </tr>`;
    });
    let aviso = linhas.length > exibidas.length ? ` — exibindo ${exibidas.length}; use os filtros ou exporte o XLSX para ver todas` : '';
    h += `</tbody><tfoot><tr><td colspan="5">TOTAL (${linhas.length.toLocaleString('pt-BR')} MAPPs${aviso})</td>
        <td class="num">${F(tot.p26)}</td><td class="num">${F(tot.l26)}</td><td class="num">${F(tot.e26)}</td><td></td>
        <td class="num">${F(tot.prevEmp)}</td><td class="num">${F(tot.trf)}</td><td class="num">${F(tot.p27)}</td><td class="num">${F(tot.nec)}</td></tr></tfoot></table>`;
    cont.innerHTML = h;
}

// ─── ORQUESTRAÇÃO ───────────────────────────────────────────────────────────
function recalcularEstudo() {
    let prm = lerParametrosEstudo();
    mappsCalculados = mappsBrutos.map(r => calcularPrevisaoEmpenhoEstudo(r, prm.pcts, prm.limiar));
    recalcularDeParaSugerido();
    resumoForaCruzamento = montarConsolidado();
    atualizarFiltros();
    renderizarDePara();
    renderizarConsolidado();
    renderizarDetalhe();
    let btn = document.getElementById('btn-exportar-estudo');
    if (btn) btn.disabled = (loaLinhas.length === 0 && mappsCalculados.length === 0);
}

// ─── EXPORTAÇÃO XLSX ────────────────────────────────────────────────────────
function adicionarAbaEstudo(wb, nome, colunas, linhas) {
    let ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = colunas.map(c => ({ header: c.titulo, key: c.chave, width: c.largura || 16 }));
    linhas.forEach(l => ws.addRow(l));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF008241' } };
    colunas.forEach((c, i) => {
        if (c.moeda) ws.getColumn(i + 1).numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
        if (c.pct) ws.getColumn(i + 1).numFmt = '0.00"%"';
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
}

async function exportarEstudoXLSX() {
    if (typeof ExcelJS === 'undefined') return alert('A biblioteca de exportação (ExcelJS) não carregou — verifique a conexão.');
    let prm = lerParametrosEstudo();
    let wb = new ExcelJS.Workbook();
    wb.creator = 'SIPOG COFIP — Estudo LOA × MAPPs';
    wb.created = new Date();

    adicionarAbaEstudo(wb, 'ORGAO_X_FONTE', [
        { titulo: 'FONTE SIPOG', chave: 'fonte', largura: 42 }, { titulo: 'ÓRGÃO', chave: 'orgao', largura: 16 },
        { titulo: 'SITUAÇÃO', chave: 'sit', largura: 16 }, { titulo: 'LOA 2027', chave: 'loa', moeda: true, largura: 20 },
        { titulo: 'QTD MAPPS', chave: 'qtd', largura: 11 }, { titulo: 'PROGRAMADO 2026', chave: 'p26', moeda: true, largura: 20 },
        { titulo: 'PREV. EMPENHO 2026', chave: 'prevEmp', moeda: true, largura: 20 }, { titulo: 'NECESSIDADE 2027', chave: 'nec', moeda: true, largura: 20 },
        { titulo: '% DA LOA', chave: 'pct', pct: true, largura: 11 }, { titulo: 'SALDO (LOA − NEC.)', chave: 'saldo', moeda: true, largura: 20 },
        { titulo: 'SUB FONTES DA LOA', chave: 'sfs', largura: 40 }
    ], consolidadoAtual.map(l => ({
        fonte: l.fonte, orgao: l.orgao, sit: ROTULO_SITUACAO[l.situacao], loa: l.temLOA ? l.loa : null, qtd: l.qtd,
        p26: l.p26, prevEmp: l.prevEmp, nec: l.nec, pct: l.pctLOA === null ? null : Number(l.pctLOA.toFixed(4)),
        saldo: l.saldo, sfs: l.subfontesTxt
    })));

    adicionarAbaEstudo(wb, 'DETALHE_MAPP', [
        { titulo: 'MAPP', chave: 'mapp', largura: 16 }, { titulo: 'ÓRGÃO', chave: 'orgao', largura: 14 },
        { titulo: 'FONTE', chave: 'fonte', largura: 40 }, { titulo: 'ESTÁGIO', chave: 'estagio', largura: 26 },
        { titulo: 'GRUPO', chave: 'grupo', largura: 20 }, { titulo: 'EXPURGADO', chave: 'exp', largura: 11 },
        { titulo: 'PROGRAMADO 2026', chave: 'p26', moeda: true, largura: 18 }, { titulo: 'LIMITE 2026', chave: 'l26', moeda: true, largura: 18 },
        { titulo: 'EMPENHADO 2026', chave: 'e26', moeda: true, largura: 18 }, { titulo: 'REGRA APLICADA', chave: 'regra', largura: 48 },
        { titulo: 'PREV. EMPENHO 2026', chave: 'prevEmp', moeda: true, largura: 18 }, { titulo: 'TRF 2026', chave: 'trf', moeda: true, largura: 18 },
        { titulo: 'PROGRAMADO 2027', chave: 'p27', moeda: true, largura: 18 }, { titulo: 'NECESSIDADE 2027', chave: 'nec', moeda: true, largura: 18 }
    ], mappsCalculados.map(m => ({
        mapp: m.mapp, orgao: m.orgao, fonte: m.fonte, estagio: m.estagio, grupo: labelClasse(m.classe), exp: m.expurgado ? 'SIM' : 'NÃO',
        p26: m.p26, l26: m.l26, e26: m.e26, regra: m.regra, prevEmp: m.prevEmp, trf: m.trf, p27: m.p27, nec: m.nec
    })));

    let porSubfonte = {};
    loaLinhas.forEach(l => {
        if (!porSubfonte[l.subfonte]) porSubfonte[l.subfonte] = { grupo: l.grupo, subfonte: l.subfonte, desc: l.descSubfonte, valor: 0 };
        porSubfonte[l.subfonte].valor += l.valor;
    });
    adicionarAbaEstudo(wb, 'DE_PARA_FONTES', [
        { titulo: 'GRUPO', chave: 'grupo', largura: 14 }, { titulo: 'SUB FONTE', chave: 'subfonte', largura: 18 },
        { titulo: 'DESCRIÇÃO', chave: 'desc', largura: 60 }, { titulo: 'LOA 2027', chave: 'valor', moeda: true, largura: 20 },
        { titulo: 'REGRA', chave: 'regra', largura: 10 }, { titulo: 'FONTE SIPOG', chave: 'fonte', largura: 42 }
    ], Object.values(porSubfonte).sort((a, b) => a.subfonte.localeCompare(b.subfonte)).map(s => {
        let ef = fonteEfetiva(s.subfonte);
        return Object.assign({}, s, { regra: ROTULO_REGRA_DEPARA[ef.fonte || ef.regra === 'manual' ? ef.regra : 'sem'], fonte: ef.fonte || '(sem fonte)' });
    }));

    let wsP = wb.addWorksheet('PARAMETROS');
    wsP.getColumn(1).width = 46; wsP.getColumn(2).width = 30;
    [
        ['Estudo LOA 2027 × MAPPs — SIPOG', ''],
        ['Gerado em', new Date().toLocaleString('pt-BR')],
        ['Arquivo LOA', loaArquivo || '—'],
        ['Arquivo MAPPs', mappsArquivo || '—'],
        ['Conveniado (%)', prm.pcts.conveniado * 100], ['Licitado (%)', prm.pcts.licitado * 100],
        ['Em Licitação (%)', prm.pcts.emlicitacao * 100], ['Contratado (%)', prm.pcts.contratado * 100],
        ['Atividades Preparatórias (%)', prm.pcts.preparatorias * 100], ['Não Iniciado (%)', prm.pcts.naoiniciado * 100],
        ['Em Execução — limiar (% do Programado 2026)', prm.limiar],
        ['', ''],
        ['Regra', 'Cópia da Previsão de Empenho por Estágio do SIPOG (cenário PADRÃO, sem Valor Deliberado, subtetos ou edições manuais).'],
        ['% da LOA', 'Necessidade 2027 dos MAPPs ÷ LOA 2027 do órgão na fonte (a LOA inclui pessoal, custeio e dívida).']
    ].forEach((r, i) => { wsP.addRow(r); if (i === 0) wsP.getRow(1).font = { bold: true, size: 13 }; });

    let buffer = await wb.xlsx.writeBuffer();
    let blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = `SIPOG_Estudo_LOA_MAPPs_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ─── INICIALIZAÇÃO ──────────────────────────────────────────────────────────
carregarDeParaManual();
restaurarParametrosEstudo();
