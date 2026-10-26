// SIPOG COFIP — js/estudo-loa.js
// Página de estudo separada (estudo-loa.html): LOA 2027 por Órgão × Sub fonte
// cruzada com a Previsão de Empenho por Estágio dos MAPPs. Não altera o SIPOG.
// Script clássico (escopo global). Depende de js/03 (N, S, V, F,
// valorCelulaExcelJS, labelClasse) e js/06 (classificarRegistro, EST_*, labelEstagio).

// ─── ESTADO ─────────────────────────────────────────────────────────────────
let loaLinhas = [];          // [{ grupo, subfonte, descSubfonte, codOrgao, orgao, sigla, valor }] — só o Executivo
let loaLinhasArquivo = [];   // todas as linhas lidas (inclui os órgãos expurgados), p/ salvar e exportar
let loaArquivo = '';
let loaConferencia = { conferido: false, divergencias: [] }; // resultado da conferência com o Resumo (vai junto ao salvar na nuvem)
let mappsBrutos = [];        // linhas da planilha de MAPPs, cabeçalho em maiúsculas
let mappsArquivo = '';
let mappsOriginais = [];     // linhas como vieram do arquivo (antes da tradução de colunas), p/ exportação
let mappsColunasOriginais = [];
let mappsCalculados = [];    // resultado de calcularPrevisaoEmpenhoEstudo por linha
let deParaSugerido = {};     // { subfonte: { fonte, regra } }
let deParaManual = {};       // { subfonte: fonteSIPOG | '' } — escolhas do usuário
let consolidadoAtual = [];   // linhas do Órgão × Fonte (para tela e exportação)
let situacaoPorPar = {};     // { 'ORGAO||fonte': 'OK' | 'SEM_LOA' | 'SEM_MAPP' } — filtro Situação no card 5

const CHAVE_DEPARA_LOCAL = 'sipog_estudo_loa_depara_v1';

// Padrões da regra vigente — cópia de DEFAULTS_PARAMETROS (js/04-importacao-parametros.js).
const PADROES_ESTUDO = {
    'ep-conveniado': 20, 'ep-licitado': 20, 'ep-emlicitacao': 15,
    'ep-contratado': 20, 'ep-preparatorias': 5, 'ep-naoiniciado': 0,
    'ep-limiar': 40, 'ep-meses': 5,
    // Valor Deliberado por grupo (DEFAULTS_PARAMETROS.classes, pc-*): redução da Prev. Empenho.
    'vd-contrato-gestao': 0, 'vd-continuidade': 0, 'vd-pcf-convenio': 0,
    'vd-operacao-credito': 0, 'vd-investimento': 0
};

// Regra do estudo: a LOA só vale para o Executivo estadual. Os órgãos dos outros Poderes saem
// pelos 2 primeiros dígitos do código (o do Poder/órgão, comum aos fundos vinculados):
// 01 = Assembleia Legislativa e vinculados (FPP); 02 = Tribunal de Contas do Estado;
// 04 = Tribunal de Justiça e vinculados (FERMOJU, FUNSEG, fundo dos oficiais de justiça);
// 15 = Ministério Público (PGJ) e vinculados (fundo de reaparelhamento, FDID). A Defensoria (06) fica.
const LOA_FORA_EXECUTIVO = [
    { prefixo: '01', nome: 'Assembleia Legislativa (AL) e órgãos vinculados' },
    { prefixo: '02', nome: 'Tribunal de Contas do Estado (TCE) e órgãos vinculados' },
    { prefixo: '04', nome: 'Tribunal de Justiça (TJ) e órgãos vinculados' },
    { prefixo: '15', nome: 'Ministério Público (PGJ) e órgãos vinculados' }
];

function loaForaDoExecutivo(l) {
    return LOA_FORA_EXECUTIVO.some(o => String(l.codOrgao || '').startsWith(o.prefixo));
}

// Grupos do Valor Deliberado — mesmos de GRUPOS_REDUTOR (js/07-redutor-paradigma.js).
const GRUPOS_VD_ESTUDO = [
    { sufixo: 'contrato-gestao',  label: 'CONTRATO GESTÃO',  classe: 'CONTRATO_GESTAO' },
    { sufixo: 'continuidade',     label: 'CONTINUIDADE',     classe: 'CONTINUIDADE' },
    { sufixo: 'pcf-convenio',     label: 'PCF CONVÊNIO',     classe: 'PCF_CONVENIO' },
    { sufixo: 'operacao-credito', label: 'OPERAÇÃO CRÉDITO', classe: 'OPERACAO_CREDITO' },
    { sufixo: 'investimento',     label: 'DEMAIS PROJETOS',  classe: 'INVESTIMENTO' }
];

// Rótulo de exibição do grupo (o de Entrega Prioritária só aparece em expurgados).
function rotuloGrupo(classe) {
    let g = GRUPOS_VD_ESTUDO.find(x => x.classe === classe);
    return g ? g.label : (classe === 'ENTREGA_PRIORITARIA' ? 'ENTREGA PRIORITÁRIA' : labelClasse(classe));
}

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
    return { linhas, conferido, divergencias, origem: 'xlsx' };
}

// ─── LEITURA DA LOA EM PDF ("Demonstrativo Consolidado por Órgão e Fonte") ──
// Relatório do orçamento: linha de órgão (8 dígitos + nome + Tesouro / Outras
// Fontes / Total) seguida das linhas de fonte (500.9.1.0.00.00 + descrição +
// valor na coluna do grupo + Total). Nomes longos quebram na linha de baixo.
// O grupo (Tesouro / Outras Fontes) sai da coluna em que o valor está: um 501
// pode estar em Outras Fontes. pdf.js só é baixado quando um PDF é escolhido.
const PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const RE_VALOR_PDF = /^\d{1,3}(\.\d{3})*,\d{2}$/;

function carregarPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((ok, falha) => {
        let s = document.createElement('script');
        s.src = PDFJS_BASE + 'pdf.min.js';
        s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js'; ok(window.pdfjsLib); };
        s.onerror = () => falha(new Error('Não foi possível baixar o leitor de PDF (pdf.js). Verifique a conexão.'));
        document.head.appendChild(s);
    });
}

// Linhas da página: palavras com a borda direita estimada (as colunas de valor
// são alinhadas à direita), agrupadas pela altura (y) e ordenadas pelo x.
function linhasDaPaginaPDF(conteudo) {
    let palavras = [];
    conteudo.items.forEach(it => {
        let txt = it.str || '';
        if (!txt.trim()) return;
        let x = it.transform[4], y = it.transform[5], larg = it.width || 0;
        let re = /\S+/g, m;
        while ((m = re.exec(txt))) {
            palavras.push({ txt: m[0], y, x: x + larg * m.index / txt.length, dir: x + larg * (m.index + m[0].length) / txt.length });
        }
    });
    palavras.sort((a, b) => (b.y - a.y) || (a.x - b.x));
    let linhas = [];
    palavras.forEach(p => {
        let l = linhas[linhas.length - 1];
        if (l && Math.abs(l.y - p.y) <= 2.5) l.palavras.push(p);
        else linhas.push({ y: p.y, palavras: [p] });
    });
    linhas.forEach(l => l.palavras.sort((a, b) => a.x - b.x));
    return linhas;
}

async function lerLOADePDF(buffer) {
    let pdfjs = await carregarPdfJs();
    let doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    let brutas = [];
    for (let i = 1; i <= doc.numPages; i++) {
        let pagina = await doc.getPage(i);
        brutas.push(...linhasDaPaginaPDF(await pagina.getTextContent()));
        brutas.push(null); // quebra de página: descrição não continua na página seguinte
    }

    // Separa código, descrição e valores (com a borda direita de cada valor).
    let itens = [], totalGeral = null, ultimo = null;
    brutas.forEach(l => {
        if (!l) { ultimo = null; return; }
        let ps = l.palavras.slice();
        let valores = [];
        while (ps.length && RE_VALOR_PDF.test(ps[ps.length - 1].txt)) {
            let p = ps.pop();
            valores.unshift({ valor: V(p.txt), dir: p.dir });
        }
        let primeiro = ps.length ? ps[0].txt : '';
        let texto = ps.map(p => p.txt).join(' ');
        if (/^\d{8}$/.test(primeiro) && valores.length) {
            ultimo = { tipo: 'orgao', codigo: primeiro, desc: ps.slice(1).map(p => p.txt).join(' '), valores };
            itens.push(ultimo);
        } else if (/^\d{3}(\.\d+){5}$/.test(primeiro) && valores.length) {
            ultimo = { tipo: 'fonte', codigo: primeiro, desc: ps.slice(1).map(p => p.txt).join(' '), valores };
            itens.push(ultimo);
        } else if (N(texto) === 'TOTAL GERAL' && valores.length) {
            totalGeral = valores[valores.length - 1].valor;
            ultimo = null;
        } else if (!valores.length && ultimo && texto && !/^(PAGINA|ORCAMENTO ANUAL|DEMONSTRATIVO|CODIGO )/.test(N(texto))) {
            ultimo.desc += ' ' + texto; // continuação do nome
        } else {
            ultimo = null;
        }
    });
    if (!itens.some(it => it.tipo === 'fonte')) throw new Error('O PDF não tem o layout "Demonstrativo Consolidado por Órgão e Fonte" (nenhuma linha de fonte com valor encontrada).');

    // Colunas Tesouro e Outras Fontes: bordas direitas das linhas com os 3 valores.
    let mediana = arr => { let a = arr.slice().sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
    let com3 = itens.filter(it => it.valores.length === 3);
    let dirTesouro = mediana(com3.map(it => it.valores[0].dir));
    let dirOutras = mediana(com3.map(it => it.valores[1].dir));
    let grupoDoValor = (v, codigo) => {
        if (dirTesouro !== null && dirOutras !== null) return Math.abs(v.dir - dirTesouro) <= Math.abs(v.dir - dirOutras) ? 'Tesouro' : 'Outras Fontes';
        return /^50[01]\./.test(codigo) ? 'Tesouro' : 'Outras Fontes';
    };

    let linhas = [], orgao = null, orgaos = [];
    itens.forEach(it => {
        if (it.tipo === 'orgao') {
            orgao = { codigo: it.codigo, nome: it.desc, total: it.valores[it.valores.length - 1].valor, lido: 0 };
            orgaos.push(orgao);
            return;
        }
        if (!orgao) return;
        // Uma fonte tem o valor na coluna do grupo + o Total; com 3 valores, as duas colunas.
        let partes = it.valores.length >= 2 ? it.valores.slice(0, -1) : it.valores;
        partes.forEach(v => {
            if (!v.valor) return;
            linhas.push({ grupo: grupoDoValor(v, it.codigo), subfonte: it.codigo, descSubfonte: it.desc,
                codOrgao: orgao.codigo, orgao: orgao.nome, sigla: extrairSigla(orgao.nome), valor: v.valor });
            orgao.lido += v.valor;
        });
    });

    // Conferência: soma das fontes = total do órgão; soma geral = TOTAL GERAL.
    let divergencias = orgaos.filter(o => Math.abs(o.total - o.lido) > 0.5)
        .map(o => ({ item: `${o.codigo} ${o.nome}`, esperado: o.total, lido: o.lido }));
    let somaGeral = linhas.reduce((s, l) => s + l.valor, 0);
    if (totalGeral !== null && Math.abs(totalGeral - somaGeral) > 0.5) divergencias.push({ item: 'TOTAL GERAL', esperado: totalGeral, lido: somaGeral });
    return { linhas, conferido: true, divergencias, origem: 'pdf', totalGeral };
}

async function selecionarArquivoLOA(input) {
    let arquivo = input.files && input.files[0];
    if (!arquivo) return;
    let status = document.getElementById('status-loa');
    status.innerHTML = 'Lendo…';
    try {
        if (/\.pdf$/i.test(arquivo.name)) {
            carregarLOA(await lerLOADePDF(await lerArquivoComoBuffer(arquivo)), arquivo.name);
            return;
        }
        let wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await lerArquivoComoBuffer(arquivo));
        carregarLOA(lerLOADeWorkbook(wb), arquivo.name);
    } catch (err) {
        console.error(err);
        loaLinhas = []; loaLinhasArquivo = [];
        status.innerHTML = `<span class="erro">❌ ${escHtml(err.message || err)}</span>`;
        recalcularEstudo();
    }
}

function carregarLOA(resultado, nomeArquivo) {
    loaLinhasArquivo = resultado.linhas;
    loaLinhas = loaLinhasArquivo.filter(l => !loaForaDoExecutivo(l));
    let expurgadas = loaLinhasArquivo.filter(loaForaDoExecutivo);
    let origem = resultado.origem || (/\.pdf$/i.test(nomeArquivo || '') ? 'pdf' : 'xlsx');
    loaConferencia = { conferido: !!resultado.conferido, divergencias: resultado.divergencias || [], origem };
    loaArquivo = nomeArquivo || '';
    let total = loaLinhas.reduce((s, l) => s + l.valor, 0);
    let subfontes = new Set(loaLinhas.map(l => l.subfonte)).size;
    let orgaos = new Set(loaLinhas.map(l => l.codOrgao)).size;
    let ref = origem === 'pdf' ? 'totais do PDF' : 'Resumo';
    let divs = loaConferencia.divergencias;
    let conf;
    if (!resultado.conferido) conf = '<span class="aviso">⚠ Aba "Resumo por sub fonte" ausente — soma não conferida.</span>';
    else if (divs.length === 0) conf = origem === 'pdf' ? '<span class="ok">✔ Somas das fontes conferem com o total de cada órgão e com o TOTAL GERAL.</span>'
        : '<span class="ok">✔ Somas por sub fonte conferem com o Resumo.</span>';
    else conf = `<span class="erro">✖ ${divs.length} item(ns) divergem dos ${ref}:</span> ` +
        divs.slice(0, 5).map(d => `${escHtml(d.item || d.subfonte)} (lido ${F(d.lido)} × ${ref} ${F(d.esperado)})`).join('; ');
    document.getElementById('status-loa').innerHTML =
        `<span class="ok">✅ ${escHtml(loaArquivo)}</span><br>` +
        `${loaLinhas.length.toLocaleString('pt-BR')} pares Sub fonte × Órgão · ${subfontes} sub fontes · ${orgaos} órgãos<br>` +
        `Total LOA (Executivo): <strong>${F(total)}</strong><br>` +
        (expurgadas.length
            ? `<span class="aviso">Expurgados (fora do Executivo): ${expurgadas.length} par(es), ${new Set(expurgadas.map(l => l.codOrgao)).size} órgão(s), ${F(expurgadas.reduce((s, l) => s + l.valor, 0))} — ${escHtml([...new Set(expurgadas.map(l => l.sigla || l.orgao))].join(', '))}</span><br>`
            : `Expurgo fora do Executivo (${escHtml(LOA_FORA_EXECUTIVO.map(o => o.nome.split(' (')[0]).join(', '))}): nenhum órgão no arquivo.<br>`) +
        conf +
        (origem === 'xlsx' ? '<br><span class="aviso">⚠ A planilha "Fonte x Órgão" traz a LOA inteira (pessoal, custeio e dívida). Para o estudo, use o PDF emitido só com Investimento.</span>' : '');
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

// Traduz colunas do CSV bruto para o layout do SIPOG. A grafia do estágio
// (ex.: "FINAN.CONCLUÍDA") é tratada no cálculo por normalizarEstagio() (js/06).
function normalizarLayoutMAPPs(linhas, headers) {
    let traduzidas = [];
    for (let destino in ALIASES_COLUNAS_MAPPS) {
        let origem = ALIASES_COLUNAS_MAPPS[destino];
        if (!headers.includes(destino) && headers.includes(origem)) traduzidas.push([origem, destino]);
    }
    linhas.forEach(l => {
        traduzidas.forEach(([origem, destino]) => { l[destino] = l[origem]; });
    });
    let disponiveis = headers.concat(traduzidas.map(t => t[1]));
    return {
        traduzidas,
        faltando: COLUNAS_OBRIGATORIAS_MAPPS.filter(c => !disponiveis.includes(c)),
        semGrupo: COLUNAS_GRUPO_MAPPS.every(c => !disponiveis.includes(c) && !(c === 'OPERACAO_CREDITO' && disponiveis.includes('OPERACA_CREDITO')))
    };
}

// Acentuação corrompida na extração: usa corrigirMojibake() do SIPOG (js/03).
function corrigirMojibakeLinhas(linhas) {
    let celulas = 0, exemplo = '';
    linhas.forEach(l => {
        for (let k in l) {
            let v = l[k];
            if (typeof v !== 'string') continue;
            let c = corrigirMojibake(v);
            if (c !== v) { l[k] = c; celulas++; if (!exemplo) exemplo = `${v} → ${c}`; }
        }
    });
    return { celulas, exemplo };
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
    // Cópia do arquivo como veio (as linhas de mappsBrutos recebem as colunas traduzidas).
    mappsOriginais = mappsBrutos.map(o => Object.assign({}, o));
    mappsColunasOriginais = cab;
    let corrigidos = corrigirMojibakeLinhas(mappsBrutos);
    let n = normalizarLayoutMAPPs(mappsBrutos, cab);
    mappsArquivo = nomeArquivo || '';
    // Edições da Proposta (Ajustes Finais) feitas antes com este mesmo arquivo.
    propostasManuais = lerPropostasLocal(mappsArquivo);
    let avisos = '';
    if (n.traduzidas.length)
        avisos += `<br>Colunas traduzidas para o layout do SIPOG: ${n.traduzidas.map(t => `${escHtml(t[0])} → ${escHtml(t[1])}`).join(', ')}`;
    if (n.faltando.length)
        avisos += `<br><span class="erro">✖ Colunas não encontradas: ${n.faltando.map(escHtml).join(', ')}</span>`;
    if (corrigidos.celulas)
        avisos += `<br><span class="aviso">⚠ Acentuação corrompida corrigida em ${corrigidos.celulas.toLocaleString('pt-BR')} célula(s) (ex.: ${escHtml(corrigidos.exemplo)}) — sem a correção, o estágio não seria reconhecido.</span>`;
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
// opcoes (mesmos parâmetros do SIPOG):
//   expurgarFisFin: expurga "EXECUÇÃO FÍSIC/FINAN,CONCLUÍDA" (regras.r-expurgar-fisfin, padrão ligado);
//   meses: meses de execução decorridos em (EMP/meses)×12 (cenario.r-exec-meses, padrão 5).
// O texto do estágio passa por normalizarEstagio() do SIPOG (js/06).
function calcularPrevisaoEmpenhoEstudo(r, pcts, limiar, opcoes) {
    let meses = (opcoes && opcoes.meses > 0) ? opcoes.meses : 5;
    let estagio = normalizarEstagio(r.ESTAGIO_EXECUCAO);
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
    // Concluída física e financeiramente: sai do cálculo antes dos grupos (como os expurgos acima).
    if (opcoes && opcoes.expurgarFisFin && estagio === EST_EXEC_FISFIN_CONCL) {
        return Object.assign(base, { expurgado: true, regra: 'EXPURGO: EXECUÇÃO FÍSIC/FINAN CONCLUÍDA', prevEmp: 0, trf: 0, nec: 0 });
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
        else if (e26 > 0 && e26 < parametro) { prevEmp = (e26 / meses) * 12; justificativa = `EM EXECUÇÃO: (EMP/${meses})×12 [EMP < ${limiar}% PROG]`; }
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
        limiar: v('ep-limiar'),
        opcoes: {
            expurgarFisFin: !!(document.getElementById('ep-expurgar-fisfin') || {}).checked,
            meses: v('ep-meses')
        },
        vd: Object.fromEntries(GRUPOS_VD_ESTUDO.map(g => [g.classe, Math.min(Math.max(v('vd-' + g.sufixo), 0), 100) / 100])),
        vdFonte: (document.getElementById('vd-fonte') || {}).value || ''
    };
}

// Valor Deliberado: mesma conta de aplicarValorParadigmaGrupoCore() (js/07), para
// todos os MAPPs do grupo na fonte escolhida (ou em todas). Sem travas manuais.
function aplicarValorDeliberadoEstudo(m, vd, vdFonte) {
    let fator = (!m.expurgado && (!vdFonte || N(m.fonte) === N(vdFonte))) ? (vd[m.classe] || 0) : 0;
    m.pctDeliberado = fator * 100;
    m.prevEmpAj = fator > 0 ? m.prevEmp * (1 - fator) : m.prevEmp;
    m.trfAj = m.expurgado ? 0 : m.p26 - m.prevEmpAj;
    m.necAj = m.expurgado ? 0 : m.p27 + m.trfAj;
    return m;
}

function restaurarParametrosEstudo() {
    for (let id in PADROES_ESTUDO) {
        let el = document.getElementById(id);
        if (el) el.value = PADROES_ESTUDO[id];
    }
    // Físic/Finan Concluída expurgada por padrão, como no SIPOG (regras.r-expurgar-fisfin).
    let elExp = document.getElementById('ep-expurgar-fisfin');
    if (elExp) elExp.checked = true;
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
    let todas = Object.values(porSubfonte).sort((a, b) => a.subfonte.localeCompare(b.subfonte));
    let semPar = todas.filter(s => !fonteEfetiva(s.subfonte).fonte).length;
    badge.textContent = semPar > 0 ? `${semPar} sem fonte` : '';
    badge.className = 'estudo-tag ' + (semPar > 0 ? 'tag-sem' : 'tag-exata');

    // Filtro Grupo de Fonte (Tesouro / Outras Fontes, como na aba "Fonte x Órgão")
    preencherSelect('filtro-dp-grupo', Array.from(new Set(todas.map(s => s.grupo).filter(Boolean))).sort((a, b) => b.localeCompare(a)), '(todos)');
    let fGrupo = document.getElementById('filtro-dp-grupo').value;
    let lista = todas.filter(s => !fGrupo || s.grupo === fGrupo);
    if (lista.length === 0) { cont.innerHTML = '<p class="estudo-nota" style="padding:12px;">Nenhuma sub fonte para o filtro.</p>'; return; }
    let tot = lista.reduce((t, s) => {
        t.orgaos += s.orgaos; t.valor += s.valor;
        if (fonteEfetiva(s.subfonte).fonte) { t.qtdCom++; t.valorCom += s.valor; } else { t.qtdSem++; t.valorSem += s.valor; }
        return t;
    }, { orgaos: 0, valor: 0, qtdCom: 0, valorCom: 0, qtdSem: 0, valorSem: 0 });

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
    h += `</tbody><tfoot><tr><td colspan="3">TOTAL${fGrupo ? ' ' + escHtml(fGrupo).toUpperCase() : ''} (${lista.length} sub fontes)</td>
        <td class="num">${tot.orgaos}</td><td class="num">${F(tot.valor)}</td>
        <td colspan="2" style="font-weight:600; font-size:11px; white-space:normal;">Com fonte: ${tot.qtdCom} · ${F(tot.valorCom)} &nbsp;|&nbsp; Sem fonte: ${tot.qtdSem} · ${F(tot.valorSem)}</td>
        </tr></tfoot></table>`;
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
        if (!mapa[k]) mapa[k] = { orgao: rotulo, fonte, loa: 0, temLOA: false, qtd: 0, p26: 0, prevEmp: 0, prevEmpAj: 0, nec: 0, necAj: 0, subfontes: new Set() };
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
        item.prevEmpAj += m.prevEmpAj;
        item.nec += m.nec;
        item.necAj += m.necAj;
    });
    consolidadoAtual = Object.values(mapa).map(i => {
        let situacao = i.temLOA && i.qtd > 0 ? 'OK' : (i.temLOA ? 'SEM_MAPP' : 'SEM_LOA');
        return Object.assign(i, {
            situacao,
            subfontesTxt: Array.from(i.subfontes).sort().join(', '),
            pctLOA: i.loa > 0 ? (i.necAj / i.loa) * 100 : null,
            saldo: i.temLOA ? i.loa - i.necAj : null
        });
    }).sort((a, b) => (ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao]) || a.fonte.localeCompare(b.fonte) ||
        (b.loa - a.loa) || (b.necAj - a.necAj) || a.orgao.localeCompare(b.orgao));
    situacaoPorPar = {};
    consolidadoAtual.forEach(l => { situacaoPorPar[N(l.orgao) + '||' + l.fonte] = l.situacao; });
    return { loaForaCruzamento, paresForaCruzamento };
}

const ROTULO_SITUACAO = { OK: 'LOA e MAPPs', SEM_LOA: 'MAPPs sem LOA', SEM_MAPP: 'LOA sem MAPPs' };
let resumoForaCruzamento = { loaForaCruzamento: 0, paresForaCruzamento: 0 };

// ─── ORDENAÇÃO DAS GRADES ───────────────────────────────────────────────────
// Clique no título ordena pela coluna; novo clique inverte. Vale para a tela e
// para a exportação (as abas saem na mesma ordem das grades).
let ordemTabelas = { cons: { chave: null, desc: false }, det: { chave: null, desc: false }, aj: { chave: null, desc: false } };

function ordenarTabela(tabela, chave) {
    let o = ordemTabelas[tabela];
    if (o.chave === chave) o.desc = !o.desc;
    else { o.chave = chave; o.desc = false; }
    if (tabela === 'cons') renderizarConsolidado();
    else if (tabela === 'aj') renderizarAjustesFinais();
    else renderizarDetalhe();
}

function ordenarLinhas(linhas, colunas, ordem) {
    let col = colunas.find(c => c.chave === ordem.chave);
    if (!col) return linhas;
    let valor = col.ordem || col.valor;
    let sinal = ordem.desc ? -1 : 1;
    return linhas.slice().sort((a, b) => {
        let va = valor(a), vb = valor(b);
        let na = va === null || va === undefined || va === '', nb = vb === null || vb === undefined || vb === '';
        if (na || nb) return na === nb ? 0 : (na ? 1 : -1); // vazios sempre no fim
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sinal;
        return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * sinal;
    });
}

function cabecalhoOrdenavel(tabela, colunas) {
    let o = ordemTabelas[tabela];
    return '<tr>' + colunas.map(c => {
        let cls = [c.num ? 'num' : '', o.chave === c.chave ? (o.desc ? 'ordem-desc' : 'ordem-asc') : ''].join(' ').trim();
        return `<th class="${cls}" onclick="ordenarTabela('${tabela}', '${c.chave}')" title="Ordenar por ${escHtml(c.titulo)}">${escHtml(c.titulo)}</th>`;
    }).join('') + '</tr>';
}

// ─── CONSOLIDADO ÓRGÃO × FONTE (grade) ──────────────────────────────────────
const COLUNAS_CONSOLIDADO = [
    { chave: 'fonte', titulo: 'Fonte do SIPOG', valor: l => l.fonte, celula: l => `<td class="col-fonte">${escHtml(l.fonte)}</td>` },
    { chave: 'orgao', titulo: 'Órgão', valor: l => l.orgao, celula: l => `<td><strong>${escHtml(l.orgao)}</strong></td>` },
    { chave: 'situacao', titulo: 'Situação', valor: l => ROTULO_SITUACAO[l.situacao], ordem: l => ORDEM_SITUACAO[l.situacao],
      celula: l => `<td><span class="estudo-tag ${l.situacao === 'OK' ? 'tag-exata' : (l.situacao === 'SEM_LOA' ? 'tag-sem' : 'tag-prefixo')}">${ROTULO_SITUACAO[l.situacao]}</span></td>` },
    { chave: 'loa', titulo: 'LOA 2027', num: true, valor: l => l.temLOA ? l.loa : null, celula: l => `<td class="num">${l.temLOA ? F(l.loa) : '—'}</td>` },
    { chave: 'qtd', titulo: 'MAPPs', num: true, valor: l => l.qtd, celula: l => `<td class="num">${l.qtd || '—'}</td>` },
    { chave: 'p26', titulo: 'Programado 2026', num: true, valor: l => l.p26 },
    { chave: 'prevEmp', titulo: 'Prev. Empenho 2026', num: true, valor: l => l.prevEmp },
    { chave: 'prevEmpAj', titulo: 'Prev. Empenho Ajustada', num: true, valor: l => l.prevEmpAj },
    { chave: 'nec', titulo: 'Nec. 2027 Calculada', num: true, valor: l => l.nec },
    { chave: 'necAj', titulo: 'Nec. 2027 Ajustada', num: true, valor: l => l.necAj, celula: l => `<td class="num"><strong>${F(l.necAj)}</strong></td>` },
    { chave: 'pctLOA', titulo: '% da LOA', num: true, valor: l => l.pctLOA,
      celula: l => `<td class="num ${l.pctLOA !== null && l.pctLOA > 100 ? 'pct-alto' : ''}">${fmtPct(l.pctLOA)}</td>` },
    { chave: 'saldo', titulo: 'Saldo (LOA − Nec. Aj.)', num: true, valor: l => l.saldo,
      celula: l => `<td class="num ${l.saldo !== null && l.saldo < 0 ? 'pct-alto' : ''}">${l.saldo === null ? '—' : F(l.saldo)}</td>` },
    { chave: 'subfontes', titulo: 'Sub fontes da LOA', valor: l => l.subfontesTxt, celula: l => `<td style="font-size:11px; color:var(--muted);">${escHtml(l.subfontesTxt)}</td>` }
];

function linhasConsolidadoOrdenadas() {
    return ordenarLinhas(consolidadoAtual, COLUNAS_CONSOLIDADO, ordemTabelas.cons);
}

function renderizarConsolidado() {
    let cont = document.getElementById('tabela-consolidado');
    let resumoEl = document.getElementById('resumo-consolidado');
    if (loaLinhas.length === 0 && mappsCalculados.length === 0) {
        cont.innerHTML = '<p class="estudo-nota" style="padding:12px;">Carregue os arquivos.</p>';
        resumoEl.innerHTML = '';
        return;
    }
    let fFonte = document.getElementById('filtro-cons-fonte').value;
    let fOrg = document.getElementById('filtro-cons-orgao').value;
    let fSit = document.getElementById('filtro-cons-situacao').value;
    let fTxt = N(document.getElementById('filtro-cons-texto').value);
    let linhas = linhasConsolidadoOrdenadas().filter(l =>
        (!fFonte || l.fonte === fFonte) && (!fOrg || l.orgao === fOrg) && (!fSit || l.situacao === fSit) && (!fTxt || N(l.orgao).includes(fTxt)));

    let tot = linhas.reduce((t, l) => {
        t.loa += l.loa; t.qtd += l.qtd; t.p26 += l.p26; t.prevEmp += l.prevEmp; t.prevEmpAj += l.prevEmpAj; t.nec += l.nec; t.necAj += l.necAj;
        if (l.temLOA) t.necAjComLOA += l.necAj;
        return t;
    }, { loa: 0, qtd: 0, p26: 0, prevEmp: 0, prevEmpAj: 0, nec: 0, necAj: 0, necAjComLOA: 0 });
    let necSemLOA = linhas.filter(l => l.situacao === 'SEM_LOA').reduce((s, l) => s + l.necAj, 0);
    resumoEl.innerHTML = `
        <div><span>LOA 2027 (filtro)</span><b>${F(tot.loa)}</b></div>
        <div><span>Necessidade 2027 Calculada</span><b>${F(tot.nec)}</b></div>
        <div><span>Necessidade 2027 Ajustada</span><b>${F(tot.necAj)}</b></div>
        <div><span>% da LOA (Ajustada, só pares com LOA)</span><b>${fmtPct(tot.loa > 0 ? tot.necAjComLOA / tot.loa * 100 : null)}</b></div>
        <div><span>Nec. Ajustada em MAPPs sem LOA</span><b>${F(necSemLOA)}</b></div>
        <div><span>LOA fora do cruzamento (sub fonte sem fonte)</span><b>${F(resumoForaCruzamento.loaForaCruzamento)}</b><small style="color:var(--muted);">${resumoForaCruzamento.paresForaCruzamento} pares — ver De-para</small></div>`;

    if (linhas.length === 0) { cont.innerHTML = '<p class="estudo-nota" style="padding:12px;">Nenhuma linha para os filtros.</p>'; return; }
    let h = `<table><thead>${cabecalhoOrdenavel('cons', COLUNAS_CONSOLIDADO)}</thead><tbody>`;
    linhas.forEach(l => {
        h += `<tr class="linha-clicavel" data-orgao="${escHtml(l.orgao)}" data-fonte="${escHtml(l.fonte)}" onclick="abrirMAPPsDoPar(this)" title="Ver os MAPPs de ${escHtml(l.orgao)} nesta fonte no card 5">` +
            COLUNAS_CONSOLIDADO.map(c => c.celula ? c.celula(l) : `<td class="num">${F(c.valor(l))}</td>`).join('') + '</tr>';
    });
    h += `</tbody><tfoot><tr><td colspan="3">TOTAL (${linhas.length} linhas)</td>
        <td class="num">${F(tot.loa)}</td><td class="num">${tot.qtd}</td><td class="num">${F(tot.p26)}</td>
        <td class="num">${F(tot.prevEmp)}</td><td class="num">${F(tot.prevEmpAj)}</td><td class="num">${F(tot.nec)}</td><td class="num">${F(tot.necAj)}</td>
        <td class="num">${fmtPct(tot.loa > 0 ? tot.necAjComLOA / tot.loa * 100 : null)}</td><td class="num">—</td><td></td></tr></tfoot></table>`;
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
    let estagios = Array.from(new Set(mappsCalculados.map(m => m.estagio))).sort();
    let fontesCons = Array.from(new Set(consolidadoAtual.map(l => l.fonte))).sort();
    let orgaosCons = Array.from(new Set(consolidadoAtual.map(l => l.orgao))).sort();
    preencherSelect('filtro-det-estagio', estagios, '(todos)');
    preencherSelect('filtro-cons-fonte', fontesCons, '(todas)');
    preencherSelect('filtro-cons-orgao', orgaosCons, '(todos)');
    // Ajustes Finais: só pares com LOA e MAPPs (onde há o que distribuir) e as fontes com LOA.
    preencherSelect('filtro-aj-fonte', Array.from(new Set(consolidadoAtual.filter(l => l.temLOA).map(l => l.fonte))).sort(), '(todas)');
    preencherSelect('filtro-aj-orgao', Array.from(new Set(consolidadoAtual.filter(l => l.temLOA || l.qtd).map(l => l.orgao))).sort(), '(todos)');
}

// Resumo por grupo do Valor Deliberado (mesmas colunas-base da tabela do Redutor no SIPOG).
function renderizarGrupos() {
    let cont = document.getElementById('tabela-grupos');
    if (!cont) return;
    let ativos = mappsCalculados.filter(m => !m.expurgado);
    if (ativos.length === 0) { cont.innerHTML = '<p class="estudo-nota" style="padding:12px;">Carregue a base de MAPPs.</p>'; return; }
    let prm = lerParametrosEstudo();
    let tot = { qtd: 0, p26: 0, prevEmp: 0, prevEmpAj: 0, nec: 0, necAj: 0 };
    let h = `<table><thead><tr><th class="sem-ordem">Grupo</th><th class="sem-ordem num">MAPPs</th><th class="sem-ordem num">Programado 2026</th>
        <th class="sem-ordem num">Prev. Empenho 2026</th><th class="sem-ordem num">% deliberado</th><th class="sem-ordem num">Prev. Empenho Ajustada</th>
        <th class="sem-ordem num">Nec. 2027 Calculada</th><th class="sem-ordem num">Nec. 2027 Ajustada</th></tr></thead><tbody>`;
    GRUPOS_VD_ESTUDO.forEach(g => {
        let doGrupo = ativos.filter(m => m.classe === g.classe);
        let s = doGrupo.reduce((t, m) => { t.p26 += m.p26; t.prevEmp += m.prevEmp; t.prevEmpAj += m.prevEmpAj; t.nec += m.nec; t.necAj += m.necAj; return t; },
            { p26: 0, prevEmp: 0, prevEmpAj: 0, nec: 0, necAj: 0 });
        tot.qtd += doGrupo.length; for (let k in s) tot[k] += s[k];
        h += `<tr><td>${escHtml(g.label)}</td><td class="num">${doGrupo.length.toLocaleString('pt-BR')}</td><td class="num">${F(s.p26)}</td>
            <td class="num">${F(s.prevEmp)}</td><td class="num">${fmtPct(prm.vd[g.classe] * 100)}</td><td class="num">${F(s.prevEmpAj)}</td>
            <td class="num">${F(s.nec)}</td><td class="num"><strong>${F(s.necAj)}</strong></td></tr>`;
    });
    h += `</tbody><tfoot><tr><td>TOTAL${prm.vdFonte ? ' — % aplicado só em ' + escHtml(prm.vdFonte) : ''}</td><td class="num">${tot.qtd.toLocaleString('pt-BR')}</td>
        <td class="num">${F(tot.p26)}</td><td class="num">${F(tot.prevEmp)}</td><td></td><td class="num">${F(tot.prevEmpAj)}</td>
        <td class="num">${F(tot.nec)}</td><td class="num">${F(tot.necAj)}</td></tr></tfoot></table>`;
    cont.innerHTML = h;
}

const COLUNAS_DETALHE = [
    { chave: 'mapp', titulo: 'MAPP', valor: m => m.mapp,
      celula: m => `<td class="col-mapp" title="${escHtml(m.mapp)}"><span>${escHtml(m.mapp)}</span></td>` },
    { chave: 'orgao', titulo: 'Órgão', valor: m => m.orgao, celula: m => `<td>${escHtml(m.orgao)}</td>` },
    { chave: 'fonte', titulo: 'Fonte', valor: m => m.fonte, celula: m => `<td class="col-fonte" style="font-size:11px;">${escHtml(m.fonte)}</td>` },
    { chave: 'estagio', titulo: 'Estágio', valor: m => m.estagio, celula: m => `<td style="font-size:11px;">${escHtml(m.estagio)}</td>` },
    { chave: 'grupo', titulo: 'Grupo', valor: m => rotuloGrupo(m.classe), celula: m => `<td style="font-size:11px;">${escHtml(rotuloGrupo(m.classe))}</td>` },
    { chave: 'p26', titulo: 'Programado 2026', num: true, valor: m => m.p26 },
    { chave: 'l26', titulo: 'Limite 2026', num: true, valor: m => m.l26 },
    { chave: 'e26', titulo: 'Empenhado 2026', num: true, valor: m => m.e26 },
    { chave: 'regra', titulo: 'Regra aplicada', valor: m => m.regra, celula: m => `<td class="col-regra">${escHtml(m.regra)}</td>` },
    { chave: 'prevEmp', titulo: 'Prev. Empenho 2026', num: true, valor: m => m.prevEmp },
    { chave: 'trf', titulo: 'TRF 2026', num: true, valor: m => m.trf },
    { chave: 'p27', titulo: 'Programado 2027', num: true, valor: m => m.p27 },
    { chave: 'nec', titulo: 'Nec. 2027 Calculada', num: true, valor: m => m.nec },
    { chave: 'pctDel', titulo: '% deliberado', num: true, valor: m => m.pctDeliberado,
      celula: m => `<td class="num">${m.pctDeliberado > 0 ? fmtPct(m.pctDeliberado) : '—'}</td>` },
    { chave: 'prevEmpAj', titulo: 'Prev. Empenho Ajustada', num: true, valor: m => m.prevEmpAj },
    { chave: 'necAj', titulo: 'Nec. 2027 Ajustada', num: true, valor: m => m.necAj, celula: m => `<td class="num"><strong>${F(m.necAj)}</strong></td>` }
];

function linhasDetalheOrdenadas() {
    return ordenarLinhas(mappsCalculados, COLUNAS_DETALHE, ordemTabelas.det);
}

function renderizarDetalhe() {
    let cont = document.getElementById('tabela-detalhe');
    if (mappsCalculados.length === 0) {
        cont.innerHTML = '<p class="estudo-nota" style="padding:12px;">Carregue a base de MAPPs.</p>';
        return;
    }
    // Filtros da página (aba 4): os mesmos da grade de fontes valem para os MAPPs.
    let fOrg = document.getElementById('filtro-cons-orgao').value;
    let fFon = document.getElementById('filtro-cons-fonte').value;
    let fEst = document.getElementById('filtro-det-estagio').value;
    let fSit = document.getElementById('filtro-cons-situacao').value;
    let fBuscaOrgaoCard4 = N(document.getElementById('filtro-cons-texto').value);
    let fExp = document.getElementById('filtro-det-expurgo').checked;
    let fTxt = N(document.getElementById('filtro-det-texto').value);
    let linhas = linhasDetalheOrdenadas().filter(m =>
        (fExp || !m.expurgado) && (!fOrg || N(m.orgao) === N(fOrg)) && (!fFon || m.fonte === fFon) && (!fEst || m.estagio === fEst) &&
        (!fSit || situacaoPorPar[N(m.orgao) + '||' + m.fonte] === fSit) && (!fBuscaOrgaoCard4 || N(m.orgao).includes(fBuscaOrgaoCard4)) &&
        (!fTxt || N(m.mapp).includes(fTxt) || N(m.regra).includes(fTxt)));

    // Totais só dos MAPPs ativos, como no card 4: expurgados exibidos (checkbox)
    // aparecem na grade, mas não entram no cálculo nem no total.
    let ativosExibidos = linhas.filter(m => !m.expurgado);
    let qtdExpurgadosExibidos = linhas.length - ativosExibidos.length;
    let tot = ativosExibidos.reduce((t, m) => { t.p26 += m.p26; t.l26 += m.l26; t.e26 += m.e26; t.prevEmp += m.prevEmp; t.prevEmpAj += m.prevEmpAj; t.trf += m.trf; t.p27 += m.p27; t.nec += m.nec; t.necAj += m.necAj; return t; },
        { p26: 0, l26: 0, e26: 0, prevEmp: 0, prevEmpAj: 0, trf: 0, p27: 0, nec: 0, necAj: 0 });
    let exibidas = linhas.slice(0, LIMITE_LINHAS_DETALHE);
    let h = `<table><thead>${cabecalhoOrdenavel('det', COLUNAS_DETALHE)}</thead><tbody>`;
    exibidas.forEach(m => {
        h += `<tr${m.expurgado ? ' style="opacity:0.55;"' : ''}>` +
            COLUNAS_DETALHE.map(c => c.celula ? c.celula(m) : `<td class="num">${F(c.valor(m))}</td>`).join('') + '</tr>';
    });
    let aviso = linhas.length > exibidas.length ? ` — exibindo ${exibidas.length}; use os filtros ou exporte o XLSX para ver todas` : '';
    let notaExpurgo = qtdExpurgadosExibidos ? `; ${qtdExpurgadosExibidos.toLocaleString('pt-BR')} expurgado(s) exibido(s), fora do total` : '';
    h += `</tbody><tfoot><tr><td colspan="5">TOTAL (${ativosExibidos.length.toLocaleString('pt-BR')} MAPPs${notaExpurgo}${aviso})</td>
        <td class="num">${F(tot.p26)}</td><td class="num">${F(tot.l26)}</td><td class="num">${F(tot.e26)}</td><td></td>
        <td class="num">${F(tot.prevEmp)}</td><td class="num">${F(tot.trf)}</td><td class="num">${F(tot.p27)}</td><td class="num">${F(tot.nec)}</td>
        <td></td><td class="num">${F(tot.prevEmpAj)}</td><td class="num">${F(tot.necAj)}</td></tr></tfoot></table>`;
    cont.innerHTML = h;
}

// ─── ABA 4: FILTRO ÚNICO DA PÁGINA ──────────────────────────────────────────
// Clique numa linha de fonte: aplica Órgão e Fonte da linha ao filtro da página
// (fontes e MAPPs) e rola até a lista de MAPPs, logo abaixo, na mesma aba.
function abrirMAPPsDoPar(tr) {
    document.getElementById('filtro-cons-orgao').value = tr.dataset.orgao;
    document.getElementById('filtro-cons-fonte').value = tr.dataset.fonte;
    document.getElementById('filtro-cons-situacao').value = '';
    document.getElementById('filtro-cons-texto').value = '';
    document.getElementById('filtro-det-estagio').value = '';
    document.getElementById('filtro-det-texto').value = '';
    renderizarConsolidado();
    renderizarDetalhe();
    let alvo = document.getElementById('secao-detalhe');
    if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function limparFiltrosConsolidado() {
    ['filtro-cons-fonte', 'filtro-cons-orgao', 'filtro-cons-situacao', 'filtro-det-estagio', 'filtro-cons-texto', 'filtro-det-texto']
        .forEach(id => { let el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('filtro-det-expurgo').checked = false;
    renderizarConsolidado();
    renderizarDetalhe();
}

// ─── MENU LATERAL (ABAS) ────────────────────────────────────────────────────
const CHAVE_ABA_LOCAL = 'sipog_estudo_loa_aba_v1';

function mostrarAbaEstudo(aba) {
    let existe = document.querySelector(`.estudo-aba[data-aba="${aba}"]`);
    if (!existe) aba = 'carga';
    document.querySelectorAll('.estudo-aba').forEach(s => s.classList.toggle('ativa', s.dataset.aba === aba));
    document.querySelectorAll('.estudo-menu-item').forEach(b => b.classList.toggle('ativo', b.dataset.aba === aba));
    try { localStorage.setItem(CHAVE_ABA_LOCAL, aba); } catch (e) {}
    window.scrollTo({ top: 0 });
}

// ─── ORQUESTRAÇÃO ───────────────────────────────────────────────────────────
function recalcularEstudo() {
    // A lista de fontes do Valor Deliberado precisa estar pronta antes de ler os parâmetros.
    preencherSelect('vd-fonte', fontesSIPOGDisponiveis(), '(todas as fontes)');
    let prm = lerParametrosEstudo();
    mappsCalculados = mappsBrutos.map(r => aplicarValorDeliberadoEstudo(calcularPrevisaoEmpenhoEstudo(r, prm.pcts, prm.limiar, prm.opcoes), prm.vd, prm.vdFonte));
    recalcularDeParaSugerido();
    resumoForaCruzamento = montarConsolidado();
    atualizarFiltros();
    renderizarGrupos();
    renderizarDePara();
    renderizarConsolidado();
    renderizarDetalhe();
    calcularPropostasAutomaticas();
    renderizarAjustesFinais();
    let semDados = (loaLinhas.length === 0 && mappsCalculados.length === 0);
    ['btn-exportar-estudo', 'btn-salvar-estudo'].forEach(id => {
        let btn = document.getElementById(id);
        if (btn) btn.disabled = semDados;
    });
}

// ─── AJUSTES FINAIS: PROPOSTA DE PROGRAMADO 2027 ────────────────────────────
// Distribuição automática: a LOA 2027 de cada par Órgão × Fonte vai para os MAPPs
// ativos daquele par, na proporção da Necessidade 2027 Ajustada (necessidades
// negativas contam como zero). Edições ficam em propostasManuais e não mexem nas
// demais linhas; "Distribuir diferença" reequilibra os pares de uma fonte.
let linhasAjustes = [];        // MAPPs ativos com chave, par, LOA do par e proposta automática
let propostasManuais = {};     // { chave: { valor, origem: 'manual' | 'redistribuicao' } }
const CHAVE_PROPOSTAS_LOCAL = 'sipog_estudo_loa_propostas_v1';
const TOLERANCIA_ALERTA = 1;   // R$ 1: abaixo disso a fonte "confere"

function chaveParAj(orgao, fonte) { return N(orgao) + '||' + fonte; }

function lerPropostasLocal(arquivo) {
    try {
        let s = JSON.parse(localStorage.getItem(CHAVE_PROPOSTAS_LOCAL) || 'null');
        return (s && s.arquivo === arquivo && s.propostas) ? s.propostas : {};
    } catch (e) { return {}; }
}

function salvarPropostasLocal() {
    try { localStorage.setItem(CHAVE_PROPOSTAS_LOCAL, JSON.stringify({ arquivo: mappsArquivo, propostas: propostasManuais })); } catch (e) {}
}

function calcularPropostasAutomaticas() {
    let loaPar = {};
    consolidadoAtual.forEach(l => { if (l.temLOA) loaPar[chaveParAj(l.orgao, l.fonte)] = l.loa; });
    let somaNecPar = {}, ocorrencias = {};
    linhasAjustes = mappsCalculados.filter(m => !m.expurgado).map(m => {
        let base = N(m.mapp) + '||' + m.fonte + '||' + N(m.orgao);
        ocorrencias[base] = (ocorrencias[base] || 0) + 1;
        let par = chaveParAj(m.orgao, m.fonte);
        let peso = Math.max(m.necAj || 0, 0);
        somaNecPar[par] = (somaNecPar[par] || 0) + peso;
        return { chave: base + '#' + ocorrencias[base], par, peso, mapp: m.mapp, orgao: m.orgao, fonte: m.fonte, estagio: m.estagio,
            classe: m.classe, necAj: m.necAj, loaPar: loaPar[par] !== undefined ? loaPar[par] : null };
    });
    // Proporcional à Necessidade Ajustada e nunca acima dela: se a LOA do par passa da soma
    // das necessidades, cada MAPP fica com a própria necessidade e o resto é "LOA sem destino".
    // Grade 1 = MAPPs com necessidade; grade 2 = sem necessidade (proposta só manual).
    linhasAjustes.forEach(l => {
        let soma = somaNecPar[l.par] || 0;
        l.auto = (l.loaPar > 0 && soma > 0) ? l.peso * Math.min(1, l.loaPar / soma) : 0;
        l.grade = l.peso > 0 ? 1 : 2;
    });
}

// Teto da Proposta: a Nec. Ajustada (só na grade 1; a grade 2 recebe valor manual livre).
function propostaExcede(l) {
    return l.grade === 1 && propostaDe(l) > l.necAj + 0.005;
}

function propostaDe(l) {
    let m = propostasManuais[l.chave];
    return m ? m.valor : l.auto;
}

function editarProposta(input) {
    let chave = input.dataset.chave;
    let txt = String(input.value || '').trim();
    if (txt === '') delete propostasManuais[chave];
    else propostasManuais[chave] = { valor: Math.max(V(txt.replace(/R\$\s?/g, '')), 0), origem: 'manual' };
    salvarPropostasLocal();
    renderizarAjustesFinais();
}

function restaurarProposta(chave) {
    delete propostasManuais[chave];
    salvarPropostasLocal();
    renderizarAjustesFinais();
}

function restaurarTodasPropostas() {
    if (Object.keys(propostasManuais).length && !confirm('Descartar todas as edições da Proposta e voltar à distribuição automática?')) return;
    propostasManuais = {};
    salvarPropostasLocal();
    renderizarAjustesFinais();
}

function filtrosAjustes() {
    return {
        fonte: (document.getElementById('filtro-aj-fonte') || {}).value || '',
        orgao: (document.getElementById('filtro-aj-orgao') || {}).value || '',
        texto: N((document.getElementById('filtro-aj-texto') || {}).value || ''),
        soEditados: !!(document.getElementById('filtro-aj-editados') || {}).checked
    };
}

// Fontes: LOA (pares do filtro) × soma das propostas, apurado par a par (Órgão × Fonte):
//   estouro    = Proposta acima da LOA do par;
//   distribuível = sobra que cabe nos MAPPs não editados até a Nec. Ajustada deles ("Distribuir");
//   sem destino = sobra que não cabe (par sem MAPP com necessidade, ou LOA além da necessidade):
//                 só a grade de MAPPs sem necessidade pode recebê-la, à mão.
function montarAlertasFontes(f) {
    let noFiltro = (orgao, fonte) => (!f.fonte || fonte === f.fonte) && (!f.orgao || N(orgao) === N(f.orgao));
    let pares = {};
    let obterPar = (orgao, fonte) => {
        let k = chaveParAj(orgao, fonte);
        return pares[k] || (pares[k] = { fonte, loa: 0, proposta: 0, folga: 0, qtd: 0, editados: 0 });
    };
    consolidadoAtual.forEach(c => { if (c.temLOA && noFiltro(c.orgao, c.fonte)) obterPar(c.orgao, c.fonte).loa += c.loa; });
    linhasAjustes.forEach(l => {
        if (!noFiltro(l.orgao, l.fonte)) return;
        let p = obterPar(l.orgao, l.fonte), prop = propostaDe(l), man = propostasManuais[l.chave];
        p.proposta += prop;
        p.qtd++;
        if (man) p.editados++;
        if (l.grade === 1 && (!man || man.origem === 'redistribuicao')) p.folga += Math.max(l.necAj - prop, 0);
    });
    let porFonte = {};
    Object.values(pares).forEach(p => {
        let a = porFonte[p.fonte] || (porFonte[p.fonte] = { fonte: p.fonte, loa: 0, proposta: 0, estouro: 0, sobraDistribuivel: 0, semDestino: 0, qtd: 0, editados: 0 });
        let dif = p.loa - p.proposta;
        a.loa += p.loa; a.proposta += p.proposta; a.qtd += p.qtd; a.editados += p.editados;
        if (dif < 0) a.estouro += -dif;
        else { let d = Math.min(dif, p.folga); a.sobraDistribuivel += d; a.semDestino += dif - d; }
    });
    let ordem = { estouro: 0, sobra: 1, semdestino: 2, ok: 3 };
    return Object.values(porFonte).map(a => {
        a.dif = a.loa - a.proposta;
        a.difDistribuivel = a.sobraDistribuivel - a.estouro;
        a.distribuivel = a.estouro >= TOLERANCIA_ALERTA || a.sobraDistribuivel >= TOLERANCIA_ALERTA;
        a.status = a.estouro >= TOLERANCIA_ALERTA ? 'estouro' : a.sobraDistribuivel >= TOLERANCIA_ALERTA ? 'sobra'
            : (a.semDestino >= TOLERANCIA_ALERTA ? 'semdestino' : 'ok');
        return a;
    }).sort((x, y) => (ordem[x.status] - ordem[y.status]) || Math.abs(y.dif) - Math.abs(x.dif));
}

// Reequilibra cada par da fonte: os MAPPs NÃO editados recebem (LOA do par − soma
// dos editados) na proporção da Necessidade Ajustada, sem passar dela (o que sobrar
// fica como LOA sem destino). Grava como "redistribuição".
function distribuirDiferencaFonte(fonte) {
    let f = filtrosAjustes();
    let pares = {};
    linhasAjustes.filter(l => l.fonte === fonte && l.loaPar !== null && (!f.orgao || N(l.orgao) === N(f.orgao)))
        .forEach(l => { (pares[l.par] = pares[l.par] || []).push(l); });
    let alterados = 0;
    Object.values(pares).forEach(linhas => {
        let livres = linhas.filter(l => !propostasManuais[l.chave] || propostasManuais[l.chave].origem === 'redistribuicao');
        let fixos = linhas.filter(l => propostasManuais[l.chave] && propostasManuais[l.chave].origem === 'manual');
        let pesoLivre = livres.reduce((s, l) => s + l.peso, 0);
        if (!livres.length || pesoLivre <= 0) return;
        let alvo = Math.max(linhas[0].loaPar - fixos.reduce((s, l) => s + propostaDe(l), 0), 0);
        livres.forEach(l => {
            // Sem necessidade (peso 0) a proposta é zero de qualquer forma: volta ao automático.
            if (l.peso <= 0) { delete propostasManuais[l.chave]; return; }
            propostasManuais[l.chave] = { valor: l.peso * Math.min(1, alvo / pesoLivre), origem: 'redistribuicao' };
            alterados++;
        });
    });
    salvarPropostasLocal();
    renderizarAjustesFinais();
    if (!alterados) alert('Não há MAPPs não editados com Necessidade Ajustada para receber a diferença nesta fonte.');
}

const ROTULO_ALERTA = { ok: 'Confere', sobra: 'LOA sobrando', estouro: 'Acima da LOA', semdestino: 'LOA sem destino' };

function celulaDiferenca(dif) {
    if (Math.abs(dif) < TOLERANCIA_ALERTA) return `<td class="num">—</td>`;
    return `<td class="num ${dif > 0 ? 'valor-sobra' : 'valor-estouro'}">${dif > 0 ? '+' : '−'}${F(Math.abs(dif))}</td>`;
}

function renderizarAjustesFinais() {
    let contA = document.getElementById('tabela-alertas');
    if (!contA) return;
    let contO = document.getElementById('tabela-ajustes-orgaos');
    let contM = document.getElementById('tabela-ajustes-mapps');
    let contM2 = document.getElementById('tabela-ajustes-mapps-sem-nec');
    let resumo = document.getElementById('resumo-ajustes');
    let aviso = document.getElementById('aviso-loa-ajustes');
    if (aviso) {
        let avisos = [];
        if (loaLinhas.length && loaConferencia.origem !== 'pdf') avisos.push('⚠️ A LOA 2027 carregada é a planilha "Fonte x Órgão", que <strong>inclui Pessoal, Custeio e Dívida</strong>. Carregue na aba 1 o PDF "Demonstrativo Consolidado por Órgão e Fonte" emitido só com Investimento.');
        // Nec. Ajustada < 0 só ocorre com Prev. Empenho acima do Programado 2026 (Limite ou Empenhado maiores que o Programado).
        let negativas = linhasAjustes.filter(l => l.necAj < -0.005).length;
        if (negativas) avisos.push(`⚠️ ${negativas} MAPP(s) com <strong>Necessidade 2027 Ajustada negativa</strong> (Limite ou Empenhado 2026 acima do Programado 2026 — base inconsistente): ficam na grade "sem necessidade".`);
        aviso.innerHTML = avisos.join('<br>');
    }

    // Selo do menu: fontes divergentes no total (sem filtro).
    let todas = montarAlertasFontes({ fonte: '', orgao: '' });
    let badge = document.getElementById('badge-ajustes');
    let qtdDiv = todas.filter(a => a.status === 'estouro' || a.status === 'sobra').length;
    if (badge) badge.textContent = qtdDiv ? `${qtdDiv} a resolver` : '';

    if (!loaLinhas.length || !mappsCalculados.length) {
        let msg = '<p class="estudo-nota" style="padding:12px;">Carregue a LOA e a base de MAPPs.</p>';
        contA.innerHTML = msg; contO.innerHTML = msg; contM.innerHTML = msg; contM2.innerHTML = msg; resumo.innerHTML = '';
        return;
    }
    let f = filtrosAjustes();
    let alertas = montarAlertasFontes(f);
    let divergentes = alertas.filter(a => a.status !== 'ok');

    // Linhas de MAPP no filtro
    let linhas = linhasAjustes.filter(l => (!f.fonte || l.fonte === f.fonte) && (!f.orgao || N(l.orgao) === N(f.orgao)) &&
        (!f.texto || N(l.mapp).includes(f.texto)) && (!f.soEditados || propostasManuais[l.chave]));

    let tLOA = alertas.reduce((s, a) => s + a.loa, 0), tProp = alertas.reduce((s, a) => s + a.proposta, 0);
    let tSemDest = alertas.reduce((s, a) => s + a.semDestino, 0);
    let doFiltro = linhasAjustes.filter(l => (!f.fonte || l.fonte === f.fonte) && (!f.orgao || N(l.orgao) === N(f.orgao)));
    let qtdEditados = doFiltro.filter(l => propostasManuais[l.chave]).length;
    let qtdExcede = doFiltro.filter(propostaExcede).length;
    resumo.innerHTML = `
        <div><span>LOA 2027 (filtro)</span><b>${F(tLOA)}</b></div>
        <div><span>Proposta de Programado 2027</span><b>${F(tProp)}</b></div>
        <div><span>Diferença (LOA − Proposta)</span><b class="${Math.abs(tLOA - tProp) < TOLERANCIA_ALERTA ? '' : (tLOA > tProp ? 'valor-sobra' : 'valor-estouro')}">${F(tLOA - tProp)}</b></div>
        <div><span>Fontes a resolver (Proposta ≠ LOA distribuível)</span><b class="${divergentes.some(a => a.status === 'estouro' || a.status === 'sobra') ? 'valor-estouro' : ''}">${divergentes.filter(a => a.status === 'estouro' || a.status === 'sobra').length} de ${alertas.length}</b><small style="color:var(--muted);">${divergentes.filter(a => a.status === 'semdestino').length} só com LOA sem destino</small></div>
        <div><span>LOA sem destino (sem MAPP ou além da Nec. Ajustada)</span><b>${F(tSemDest)}</b></div>
        <div><span>MAPPs com proposta editada</span><b>${qtdEditados.toLocaleString('pt-BR')}</b></div>
        <div><span>Proposta acima da Nec. Ajustada</span><b class="${qtdExcede ? 'valor-estouro' : ''}">${qtdExcede.toLocaleString('pt-BR')} MAPP(s)</b></div>`;

    // Grade de alerta (só fontes com diferença)
    if (!divergentes.length) {
        contA.innerHTML = `<p class="estudo-nota" style="padding:12px; color:var(--success); font-weight:700;">✔ Todas as ${alertas.length} fonte(s) do filtro conferem: Proposta = LOA 2027.</p>`;
    } else {
        let h = `<table><thead><tr><th class="sem-ordem" style="width:86px;"></th><th class="sem-ordem">Fonte do SIPOG</th><th class="sem-ordem">Situação</th><th class="sem-ordem num">LOA 2027</th>
            <th class="sem-ordem num">Proposta 2027</th><th class="sem-ordem num" title="LOA − Proposta">Diferença</th><th class="sem-ordem num" title="LOA de órgãos sem MAPP com necessidade, ou além da Nec. Ajustada dos MAPPs — só a grade de MAPPs sem necessidade pode recebê-la (valor manual)">LOA sem destino</th>
            <th class="sem-ordem num" title="O que os MAPPs não editados ainda podem absorver até a Nec. Ajustada (+) ou o que a Proposta passa da LOA (−) — resolvido pelo Distribuir">A distribuir</th>
            <th class="sem-ordem num">MAPPs</th><th class="sem-ordem num">Editados</th></tr></thead><tbody>`;
        divergentes.forEach(a => {
            let fonteJs = escHtml(a.fonte.replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
            h += `<tr class="alerta-${a.status}">
                <td>${a.distribuivel ? `<button class="btn-mini-header" style="padding:4px 8px; font-size:11px;" onclick="distribuirDiferencaFonte('${fonteJs}')" title="Reparte a diferença de cada órgão desta fonte entre os MAPPs não editados, pela Necessidade Ajustada">⚖ Distribuir</button>` : ''}</td>
                <td class="col-fonte">${escHtml(a.fonte)}</td>
                <td><span class="estudo-tag tag-${a.status}">${ROTULO_ALERTA[a.status]}</span></td>
                <td class="num">${F(a.loa)}</td><td class="num"><strong>${F(a.proposta)}</strong></td>${celulaDiferenca(a.dif)}
                <td class="num">${a.semDestino ? F(a.semDestino) : '—'}</td>${celulaDiferenca(a.difDistribuivel)}
                <td class="num">${a.qtd}</td><td class="num">${a.editados || '—'}</td>
            </tr>`;
        });
        let okQtd = alertas.length - divergentes.length;
        h += `</tbody><tfoot><tr><td colspan="3">${divergentes.length} fonte(s) com diferença${okQtd ? ` · ${okQtd} conferem` : ''}</td>
            <td class="num">${F(divergentes.reduce((s, a) => s + a.loa, 0))}</td><td class="num">${F(divergentes.reduce((s, a) => s + a.proposta, 0))}</td>
            ${celulaDiferenca(divergentes.reduce((s, a) => s + a.dif, 0))}<td class="num">${F(divergentes.reduce((s, a) => s + a.semDestino, 0))}</td>
            ${celulaDiferenca(divergentes.reduce((s, a) => s + a.difDistribuivel, 0))}<td></td><td></td></tr></tfoot></table>`;
        contA.innerHTML = h;
    }

    // Órgãos (todas as fontes do filtro)
    let porOrgao = {};
    consolidadoAtual.forEach(c => {
        if (!c.temLOA || (f.fonte && c.fonte !== f.fonte) || (f.orgao && N(c.orgao) !== N(f.orgao))) return;
        let o = porOrgao[N(c.orgao)] || (porOrgao[N(c.orgao)] = { orgao: c.orgao, loa: 0, necAj: 0, proposta: 0, qtd: 0, fontes: new Set() });
        o.loa += c.loa; o.fontes.add(c.fonte);
    });
    linhasAjustes.forEach(l => {
        if ((f.fonte && l.fonte !== f.fonte) || (f.orgao && N(l.orgao) !== N(f.orgao))) return;
        let o = porOrgao[N(l.orgao)] || (porOrgao[N(l.orgao)] = { orgao: l.orgao, loa: 0, necAj: 0, proposta: 0, qtd: 0, fontes: new Set() });
        o.necAj += l.necAj; o.proposta += propostaDe(l); o.qtd++; o.fontes.add(l.fonte);
    });
    // Órgãos com MAPPs primeiro (onde há proposta a ajustar), depois os só com LOA.
    let orgaos = Object.values(porOrgao).map(o => Object.assign(o, { dif: o.loa - o.proposta }))
        .sort((a, b) => ((b.qtd > 0) - (a.qtd > 0)) || b.loa - a.loa || b.proposta - a.proposta);
    let ho = `<table><thead><tr><th class="sem-ordem">Órgão</th><th class="sem-ordem num">Fontes</th><th class="sem-ordem num">MAPPs</th><th class="sem-ordem num">LOA 2027</th>
        <th class="sem-ordem num">Nec. 2027 Ajustada</th><th class="sem-ordem num">Proposta 2027</th><th class="sem-ordem num">Diferença</th></tr></thead><tbody>`;
    orgaos.forEach(o => {
        let st = Math.abs(o.dif) < TOLERANCIA_ALERTA ? 'ok' : (o.dif > 0 ? 'sobra' : 'estouro');
        ho += `<tr class="linha-clicavel alerta-${st}" data-orgao="${escHtml(o.orgao)}" onclick="document.getElementById('filtro-aj-orgao').value=this.dataset.orgao; renderizarAjustesFinais(); document.getElementById('tabela-ajustes-mapps').scrollIntoView({behavior:'smooth'});" title="Ver os MAPPs de ${escHtml(o.orgao)}">
            <td><strong>${escHtml(o.orgao)}</strong></td><td class="num">${o.fontes.size}</td><td class="num">${o.qtd || '—'}</td><td class="num">${o.loa ? F(o.loa) : '—'}</td>
            <td class="num">${F(o.necAj)}</td><td class="num"><strong>${F(o.proposta)}</strong></td>${celulaDiferenca(o.dif)}</tr>`;
    });
    let to = orgaos.reduce((t, o) => { t.loa += o.loa; t.necAj += o.necAj; t.proposta += o.proposta; t.qtd += o.qtd; return t; }, { loa: 0, necAj: 0, proposta: 0, qtd: 0 });
    ho += `</tbody><tfoot><tr><td colspan="2">TOTAL (${orgaos.length} órgãos)</td><td class="num">${to.qtd.toLocaleString('pt-BR')}</td><td class="num">${F(to.loa)}</td>
        <td class="num">${F(to.necAj)}</td><td class="num">${F(to.proposta)}</td>${celulaDiferenca(to.loa - to.proposta)}</tr></tfoot></table>`;
    contO.innerHTML = orgaos.length ? ho : '<p class="estudo-nota" style="padding:12px;">Nenhum órgão para o filtro.</p>';

    // MAPPs — proposta editável: com Nec. Ajustada (distribuição automática) e sem (só manual)
    contM.innerHTML = tabelaMappsAjustes(linhas.filter(l => l.grade === 1), 'Nenhum MAPP com Necessidade 2027 Ajustada para o filtro.');
    contM2.innerHTML = tabelaMappsAjustes(linhas.filter(l => l.grade === 2), 'Nenhum MAPP sem necessidade para o filtro.');
}

function tabelaMappsAjustes(linhas, msgVazia) {
    if (!linhas.length) return `<p class="estudo-nota" style="padding:12px;">${msgVazia}</p>`;
    let ordenadas = ordenarLinhas(linhas.map(l => Object.assign(l, { proposta: propostaDe(l) })), COLUNAS_AJUSTES, ordemTabelas.aj);
    let exibidas = ordenadas.slice(0, LIMITE_LINHAS_DETALHE);
    let hm = `<table><thead>${cabecalhoOrdenavel('aj', COLUNAS_AJUSTES)}</thead><tbody>`;
    exibidas.forEach(l => {
        let man = propostasManuais[l.chave];
        let excede = propostaExcede(l);
        let valorTxt = propostaDe(l).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        hm += `<tr class="${excede ? 'proposta-excede' : (man ? 'proposta-editada' : '')}"${excede ? ` title="Proposta acima da Nec. 2027 Ajustada (${escHtml(F(l.necAj))})"` : ''}>
            <td class="col-mapp" title="${escHtml(l.mapp)}"><span>${escHtml(l.mapp)}</span></td><td>${escHtml(l.orgao)}</td>
            <td class="col-fonte" style="font-size:11px;">${escHtml(l.fonte)}</td><td style="font-size:11px;">${escHtml(l.estagio)}</td>
            <td class="num">${l.loaPar === null ? '<span title="Órgão sem LOA nesta fonte">sem LOA</span>' : F(l.loaPar)}</td>
            <td class="num">${F(l.necAj)}</td>
            <td class="num"><input class="input-proposta" data-chave="${escHtml(l.chave)}" value="${valorTxt}" onchange="editarProposta(this)" onkeydown="if(event.key==='Enter'){this.blur();}" title="Automático: ${escHtml(F(l.auto))}">
                ${man ? `<button class="btn-link" onclick="restaurarProposta('${escHtml(l.chave.replace(/\\/g, '\\\\').replace(/'/g, "\\'"))}')" title="${man.origem === 'redistribuicao' ? 'Valor da redistribuição' : 'Editado'} — voltar ao automático (${escHtml(F(l.auto))})">↺</button>` : ''}</td>
        </tr>`;
    });
    let tm = linhas.reduce((t, l) => { t.necAj += l.necAj; t.proposta += propostaDe(l); return t; }, { necAj: 0, proposta: 0 });
    let paresVistos = {}; linhas.forEach(l => { if (l.loaPar !== null) paresVistos[l.par] = l.loaPar; });
    let loaPares = Object.values(paresVistos).reduce((s, v) => s + v, 0);
    let avisoLim = linhas.length > exibidas.length ? ` — exibindo ${exibidas.length}; filtre por fonte ou órgão para ver todas` : '';
    hm += `</tbody><tfoot><tr><td colspan="4">TOTAL (${linhas.length.toLocaleString('pt-BR')} MAPPs${avisoLim})</td>
        <td class="num" title="Soma da LOA dos pares Órgão × Fonte destes MAPPs">${F(loaPares)}</td><td class="num">${F(tm.necAj)}</td><td class="num">${F(tm.proposta)}</td></tr></tfoot></table>`;
    return hm;
}

const COLUNAS_AJUSTES = [
    { chave: 'mapp', titulo: 'MAPP', valor: l => l.mapp },
    { chave: 'orgao', titulo: 'Órgão', valor: l => l.orgao },
    { chave: 'fonte', titulo: 'Fonte SIPOG', valor: l => l.fonte },
    { chave: 'estagio', titulo: 'Estágio', valor: l => l.estagio },
    { chave: 'loaPar', titulo: 'LOA 2027 (órgão na fonte)', num: true, valor: l => l.loaPar },
    { chave: 'necAj', titulo: 'Nec. 2027 Ajustada', num: true, valor: l => l.necAj },
    { chave: 'proposta', titulo: 'Proposta Programado 2027', num: true, valor: l => l.proposta }
];

// ─── NOMEAÇÃO ───────────────────────────────────────────────────────────────
// Regra dos demais sistemas: nome + data e hora no formato DDMMAAAA-HHMM.
function carimboDataHora(data) {
    let d = data || new Date();
    let p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}${p(d.getMonth() + 1)}${d.getFullYear()}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// ─── NUVEM (coleção própria "estudos_loa", separada dos cenários do SIPOG) ──
// Grava os dois arquivos como vieram (para recarregar exatamente o mesmo estudo),
// os parâmetros, o de-para manual e as ordenações, em chunks (js/05).
const COLECAO_ESTUDOS = 'estudos_loa';

function coletarParametrosEstudoTela() {
    let campos = {};
    for (let id in PADROES_ESTUDO) { let el = document.getElementById(id); if (el) campos[id] = el.value; }
    let elExp = document.getElementById('ep-expurgar-fisfin');
    return { campos, expurgarFisFin: elExp ? elExp.checked : true, vdFonte: (document.getElementById('vd-fonte') || {}).value || '' };
}

function aplicarParametrosEstudoTela(p) {
    if (!p) return;
    for (let id in (p.campos || {})) { let el = document.getElementById(id); if (el) el.value = p.campos[id]; }
    let elExp = document.getElementById('ep-expurgar-fisfin');
    if (elExp && typeof p.expurgarFisFin === 'boolean') elExp.checked = p.expurgarFisFin;
}

async function salvarEstudoNuvem() {
    if (loaLinhas.length === 0 && mappsOriginais.length === 0) return alert('Carregue a LOA e/ou a base de MAPPs antes de salvar.');
    let base = prompt('Nome do estudo (a data e hora DDMMAAAA-HHMM são acrescentadas ao final):', 'Estudo LOA x MAPPs');
    if (base === null) return;
    let nome = `${(base.trim() || 'Estudo LOA x MAPPs')} ${carimboDataHora()}`;
    try {
        window.__setStatusNuvem('☁️ Salvando estudo...', true);
        let fb = await aguardarNuvemPronta();
        let pacote = {
            sistema: 'SIPOG', tipo: 'estudo-loa', versao_schema: 1,
            nome, salvo_em: new Date().toISOString(), criado_em: fb.serverTimestamp(),
            arquivos: { loa: loaArquivo || null, mapps: mappsArquivo || null },
            parametros: coletarParametrosEstudoTela(),
            deParaManual: deParaManual,
            ordemTabelas: ordemTabelas,
            propostasManuais: propostasManuais,
            // "dadosBrutos" alimenta o totalRegistros dos metadados (gravarPacoteFragmentado).
            dados: { loaLinhas: loaLinhasArquivo, loaConferencia, dadosBrutos: mappsOriginais, colunasMapps: mappsColunasOriginais }
        };
        await gravarPacoteFragmentado(fb, COLECAO_ESTUDOS, pacote);
        window.__setStatusNuvem('☁️ Estudo salvo na nuvem', true);
        alert(`Estudo "${nome}" salvo na nuvem.`);
    } catch (err) {
        console.error(err);
        window.__setStatusNuvem('☁️ Falha ao salvar estudo', false);
        alert('Não foi possível salvar o estudo na nuvem. Verifique a conexão e tente novamente.');
    }
}

async function listarEstudosNuvem() {
    let lista = document.getElementById('lista-estudos-nuvem');
    document.getElementById('modal-estudos-nuvem').style.display = 'flex';
    lista.innerHTML = '<p class="estudo-nota" style="padding:12px;">Carregando estudos salvos...</p>';
    try {
        let fb = await aguardarNuvemPronta();
        let snap = await fb.getDocs(fb.query(fb.collection(fb.db, COLECAO_ESTUDOS), fb.orderBy('criado_em', 'desc')));
        if (snap.empty) { lista.innerHTML = '<p class="estudo-nota" style="padding:12px;">Nenhum estudo salvo na nuvem ainda.</p>'; return; }
        let h = `<table><thead><tr><th class="sem-ordem">Nome</th><th class="sem-ordem">Salvo em</th><th class="sem-ordem num">MAPPs</th><th class="sem-ordem" style="width:190px;">Ações</th></tr></thead><tbody>`;
        snap.forEach(docSnap => {
            let d = docSnap.data();
            let quando = (d.criado_em && typeof d.criado_em.toDate === 'function') ? d.criado_em.toDate().toLocaleString('pt-BR')
                : (d.salvo_em ? new Date(d.salvo_em).toLocaleString('pt-BR') : '—');
            h += `<tr><td><strong>${escHtml(d.nome || 'Sem nome')}</strong></td><td>${escHtml(quando)}</td>
                <td class="num">${typeof d.totalRegistros === 'number' ? d.totalRegistros.toLocaleString('pt-BR') : '—'}</td>
                <td><button class="btn-mini-header" onclick="carregarEstudoNuvemPorId('${docSnap.id}')">⚡ Carregar</button>
                    <button class="btn-mini-header" onclick="excluirEstudoNuvemPorId('${docSnap.id}')">🗑️ Excluir</button></td></tr>`;
        });
        lista.innerHTML = h + '</tbody></table>';
    } catch (err) {
        console.error(err);
        lista.innerHTML = '<p class="estudo-nota" style="padding:12px; color:var(--danger);">Falha ao carregar a lista de estudos. Verifique a conexão.</p>';
    }
}

async function carregarEstudoNuvemPorId(id) {
    if ((loaLinhas.length || mappsOriginais.length) && !confirm('Isso vai substituir os arquivos e parâmetros atuais pelo estudo selecionado. Continuar?')) return;
    try {
        window.__setStatusNuvem('☁️ Carregando estudo...', true);
        let fb = await aguardarNuvemPronta();
        let pacote = await lerPacoteFragmentado(fb, COLECAO_ESTUDOS, id);
        if (!pacote || !pacote.dados) { alert('Estudo não encontrado ou vazio — pode ter sido excluído.'); return; }
        aplicarParametrosEstudoTela(pacote.parametros);
        deParaManual = pacote.deParaManual || {};
        salvarDeParaManual();
        if (pacote.ordemTabelas) ordemTabelas = pacote.ordemTabelas;
        let dados = pacote.dados;
        loaLinhas = []; loaLinhasArquivo = []; mappsBrutos = []; mappsOriginais = [];
        if (Array.isArray(dados.loaLinhas) && dados.loaLinhas.length) carregarLOA(Object.assign({ linhas: dados.loaLinhas }, dados.loaConferencia || { conferido: false, divergencias: [] }), (pacote.arquivos || {}).loa);
        if (Array.isArray(dados.dadosBrutos) && dados.dadosBrutos.length) carregarMAPPs(dados.dadosBrutos, (pacote.arquivos || {}).mapps, dados.colunasMapps);
        // As edições da Proposta salvas com o estudo prevalecem sobre as deste navegador.
        propostasManuais = pacote.propostasManuais || {};
        salvarPropostasLocal();
        // Fonte do Valor Deliberado só existe na lista depois que a base foi carregada.
        if (pacote.parametros && pacote.parametros.vdFonte) { let sel = document.getElementById('vd-fonte'); if (sel) sel.value = pacote.parametros.vdFonte; }
        recalcularEstudo();
        fecharModalEstudos();
        window.__setStatusNuvem(`☁️ Estudo carregado: ${pacote.nome || ''}`, true);
    } catch (err) {
        console.error(err);
        window.__setStatusNuvem('☁️ Falha ao carregar estudo', false);
        alert('Não foi possível carregar o estudo selecionado. Verifique a conexão.');
    }
}

async function excluirEstudoNuvemPorId(id) {
    if (!confirm('Excluir definitivamente este estudo da nuvem? Esta ação não pode ser desfeita.')) return;
    try {
        let fb = await aguardarNuvemPronta();
        await excluirPacoteFragmentado(fb, COLECAO_ESTUDOS, id);
        listarEstudosNuvem();
    } catch (err) {
        console.error(err);
        alert('Não foi possível excluir o estudo selecionado. Verifique a conexão.');
    }
}

function fecharModalEstudos() {
    document.getElementById('modal-estudos-nuvem').style.display = 'none';
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
        { titulo: 'PREV. EMPENHO 2026', chave: 'prevEmp', moeda: true, largura: 20 }, { titulo: 'PREV. EMPENHO AJUSTADA', chave: 'prevEmpAj', moeda: true, largura: 20 },
        { titulo: 'NEC. 2027 CALCULADA', chave: 'nec', moeda: true, largura: 20 }, { titulo: 'NEC. 2027 AJUSTADA', chave: 'necAj', moeda: true, largura: 20 },
        { titulo: '% DA LOA (NEC. AJ.)', chave: 'pct', pct: true, largura: 13 }, { titulo: 'SALDO (LOA − NEC. AJ.)', chave: 'saldo', moeda: true, largura: 20 },
        { titulo: 'SUB FONTES DA LOA', chave: 'sfs', largura: 40 }
    ], linhasConsolidadoOrdenadas().map(l => ({
        fonte: l.fonte, orgao: l.orgao, sit: ROTULO_SITUACAO[l.situacao], loa: l.temLOA ? l.loa : null, qtd: l.qtd,
        p26: l.p26, prevEmp: l.prevEmp, prevEmpAj: l.prevEmpAj, nec: l.nec, necAj: l.necAj, pct: l.pctLOA === null ? null : Number(l.pctLOA.toFixed(4)),
        saldo: l.saldo, sfs: l.subfontesTxt
    })));

    adicionarAbaEstudo(wb, 'DETALHE_MAPP', [
        { titulo: 'MAPP', chave: 'mapp', largura: 16 }, { titulo: 'ÓRGÃO', chave: 'orgao', largura: 14 },
        { titulo: 'FONTE', chave: 'fonte', largura: 40 }, { titulo: 'ESTÁGIO', chave: 'estagio', largura: 26 },
        { titulo: 'GRUPO', chave: 'grupo', largura: 20 }, { titulo: 'EXPURGADO', chave: 'exp', largura: 11 },
        { titulo: 'PROGRAMADO 2026', chave: 'p26', moeda: true, largura: 18 }, { titulo: 'LIMITE 2026', chave: 'l26', moeda: true, largura: 18 },
        { titulo: 'EMPENHADO 2026', chave: 'e26', moeda: true, largura: 18 }, { titulo: 'REGRA APLICADA', chave: 'regra', largura: 48 },
        { titulo: 'PREV. EMPENHO 2026', chave: 'prevEmp', moeda: true, largura: 18 }, { titulo: 'TRF 2026', chave: 'trf', moeda: true, largura: 18 },
        { titulo: 'PROGRAMADO 2027', chave: 'p27', moeda: true, largura: 18 }, { titulo: 'NEC. 2027 CALCULADA', chave: 'nec', moeda: true, largura: 18 },
        { titulo: '% DELIBERADO', chave: 'pctDel', pct: true, largura: 12 }, { titulo: 'PREV. EMPENHO AJUSTADA', chave: 'prevEmpAj', moeda: true, largura: 18 },
        { titulo: 'TRF 2026 AJUSTADA', chave: 'trfAj', moeda: true, largura: 18 }, { titulo: 'NEC. 2027 AJUSTADA', chave: 'necAj', moeda: true, largura: 18 }
    ], linhasDetalheOrdenadas().map(m => ({
        mapp: m.mapp, orgao: m.orgao, fonte: m.fonte, estagio: m.estagio, grupo: rotuloGrupo(m.classe), exp: m.expurgado ? 'SIM' : 'NÃO',
        p26: m.p26, l26: m.l26, e26: m.e26, regra: m.regra, prevEmp: m.prevEmp, trf: m.trf, p27: m.p27, nec: m.nec,
        pctDel: m.pctDeliberado, prevEmpAj: m.prevEmpAj, trfAj: m.trfAj, necAj: m.necAj
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

    // Abas com o conteúdo de cada arquivo carregado, para o xlsx ficar autossuficiente.
    if (loaLinhasArquivo.length) {
        adicionarAbaEstudo(wb, 'ARQ_LOA_FONTE_X_ORGAO', [
            { titulo: 'GRUPO', chave: 'grupo', largura: 14 }, { titulo: 'SUB FONTE', chave: 'subfonte', largura: 18 },
            { titulo: 'DESCRIÇÃO DA SUB FONTE', chave: 'descSubfonte', largura: 60 }, { titulo: 'CÓDIGO ÓRGÃO', chave: 'codOrgao', largura: 14 },
            { titulo: 'ÓRGÃO', chave: 'orgao', largura: 60 }, { titulo: 'SIGLA', chave: 'sigla', largura: 14 },
            { titulo: 'VALOR LOA (R$)', chave: 'valor', moeda: true, largura: 20 },
            { titulo: 'EXPURGO', chave: 'expurgo', largura: 22 }
        ], loaLinhasArquivo.map(l => Object.assign({}, l, { expurgo: loaForaDoExecutivo(l) ? 'FORA DO EXECUTIVO' : '' })));
    }
    if (mappsOriginais.length) {
        // Colunas VLR_* viram número (o CSV traz texto com vírgula decimal).
        let colunas = mappsColunasOriginais.map(c => ({ titulo: c, chave: c, moeda: /^VLR_/.test(c), largura: /^VLR_/.test(c) ? 18 : (c === 'MAPP' ? 60 : 16) }));
        adicionarAbaEstudo(wb, 'ARQ_BASE_MAPPS', colunas, mappsOriginais.map(r => {
            let o = {};
            mappsColunasOriginais.forEach(c => { o[c] = /^VLR_/.test(c) ? V(r[c]) : (r[c] === undefined ? '' : r[c]); });
            return o;
        }));
    }

    // Ajustes Finais: todas as linhas e todas as fontes (sem os filtros da tela).
    if (linhasAjustes.length) {
        adicionarAbaEstudo(wb, 'AJUSTES_FINAIS', [
            { titulo: 'MAPP', chave: 'mapp', largura: 60 }, { titulo: 'ÓRGÃO', chave: 'orgao', largura: 14 },
            { titulo: 'FONTE SIPOG', chave: 'fonte', largura: 40 }, { titulo: 'ESTÁGIO', chave: 'estagio', largura: 26 },
            { titulo: 'LOA 2027 (ÓRGÃO NA FONTE)', chave: 'loa', moeda: true, largura: 22 }, { titulo: 'NEC. 2027 AJUSTADA', chave: 'necAj', moeda: true, largura: 20 },
            { titulo: 'PROPOSTA AUTOMÁTICA', chave: 'auto', moeda: true, largura: 20 }, { titulo: 'PROPOSTA PROGRAMADO 2027', chave: 'proposta', moeda: true, largura: 22 },
            { titulo: 'ORIGEM', chave: 'origem', largura: 16 }, { titulo: 'GRADE', chave: 'grade', largura: 18 },
            { titulo: 'ACIMA DA NEC. AJUSTADA', chave: 'excede', largura: 14 }
        ], linhasAjustes.map(l => ({ mapp: l.mapp, orgao: l.orgao, fonte: l.fonte, estagio: l.estagio, loa: l.loaPar, necAj: l.necAj, auto: l.auto,
            proposta: propostaDe(l), origem: propostasManuais[l.chave] ? (propostasManuais[l.chave].origem === 'manual' ? 'editada' : 'redistribuída') : 'automática',
            grade: l.grade === 1 ? 'com necessidade' : 'sem necessidade', excede: propostaExcede(l) ? 'SIM' : '' })));
        adicionarAbaEstudo(wb, 'ALERTAS_FONTES', [
            { titulo: 'FONTE SIPOG', chave: 'fonte', largura: 42 }, { titulo: 'SITUAÇÃO', chave: 'sit', largura: 16 },
            { titulo: 'LOA 2027', chave: 'loa', moeda: true, largura: 20 }, { titulo: 'PROPOSTA 2027', chave: 'proposta', moeda: true, largura: 20 },
            { titulo: 'DIFERENÇA (LOA − PROPOSTA)', chave: 'dif', moeda: true, largura: 24 }, { titulo: 'LOA SEM DESTINO', chave: 'semDestino', moeda: true, largura: 22 },
            { titulo: 'A DISTRIBUIR', chave: 'difDistribuivel', moeda: true, largura: 20 },
            { titulo: 'MAPPS', chave: 'qtd', largura: 10 }, { titulo: 'EDITADOS', chave: 'editados', largura: 10 }
        ], montarAlertasFontes({ fonte: '', orgao: '' }).map(a => Object.assign({}, a, { sit: ROTULO_ALERTA[a.status] })));
    }

    let wsP = wb.addWorksheet('PARAMETROS');
    wsP.getColumn(1).width = 46; wsP.getColumn(2).width = 30;
    [
        ['Estudo LOA 2027 × MAPPs — SIPOG', ''],
        ['Gerado em', new Date().toLocaleString('pt-BR')],
        ['Arquivo LOA', loaArquivo || '—'],
        ['LOA expurgada (fora do Executivo)', LOA_FORA_EXECUTIVO.map(o => `${o.prefixo}xxxxxx ${o.nome}`).join('; ')],
        ['Arquivo MAPPs', mappsArquivo || '—'],
        ['Conveniado (%)', prm.pcts.conveniado * 100], ['Licitado (%)', prm.pcts.licitado * 100],
        ['Em Licitação (%)', prm.pcts.emlicitacao * 100], ['Contratado (%)', prm.pcts.contratado * 100],
        ['Atividades Preparatórias (%)', prm.pcts.preparatorias * 100], ['Não Iniciado (%)', prm.pcts.naoiniciado * 100],
        ['Em Execução — limiar (% do Programado 2026)', prm.limiar],
        ['Em Execução — meses decorridos na anualização (EMP/meses×12)', prm.opcoes.meses],
        ['Expurgar Execução Físic/Finan. Concluída', prm.opcoes.expurgarFisFin ? 'SIM' : 'NÃO'],
        ...GRUPOS_VD_ESTUDO.map(g => [`Valor Deliberado — ${g.label} (%)`, prm.vd[g.classe] * 100]),
        ['Valor Deliberado — fonte de aplicação', prm.vdFonte || '(todas as fontes)'],
        ['', ''],
        ['Regra', 'Cópia da Previsão de Empenho por Estágio do SIPOG (cenário PADRÃO) e do Valor Deliberado por grupo; sem subtetos, PLOA ou edições/travas manuais.'],
        ['Necessidade Ajustada', 'Programado 2027 + (Programado 2026 − Prev. Empenho × (1 − % deliberado do grupo)).'],
        ['% da LOA', 'Necessidade 2027 Ajustada dos MAPPs ÷ LOA 2027 do órgão na fonte (' + (loaConferencia.origem === 'pdf' ? 'LOA de Investimento, do PDF por Órgão e Fonte' : 'planilha Fonte x Órgão: inclui pessoal, custeio e dívida') + ').']
    ].forEach((r, i) => { wsP.addRow(r); if (i === 0) wsP.getRow(1).font = { bold: true, size: 13 }; });

    let buffer = await wb.xlsx.writeBuffer();
    let blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = `SIPOG_Estudo_LOA_MAPPs_${carimboDataHora()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ─── INICIALIZAÇÃO ──────────────────────────────────────────────────────────
carregarDeParaManual();
restaurarParametrosEstudo();
(function abrirAbaInicial() {
    let aba = 'carga';
    try { aba = localStorage.getItem(CHAVE_ABA_LOCAL) || 'carga'; } catch (e) {}
    mostrarAbaEstudo(aba);
})();
