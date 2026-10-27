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
// Os MAPPs desses órgãos também saem (a base traz só a sigla no ORGAO): siglas abaixo, da LOA
// 2027, mais as dos órgãos expurgados do arquivo de LOA carregado. Nas bases de 14/07 e 18/09
// não havia nenhum.
const LOA_FORA_EXECUTIVO = [
    { prefixo: '01', nome: 'Assembleia Legislativa (AL) e órgãos vinculados', siglas: ['AL', 'FPP'] },
    { prefixo: '02', nome: 'Tribunal de Contas do Estado (TCE) e órgãos vinculados', siglas: ['TCE'] },
    { prefixo: '04', nome: 'Tribunal de Justiça (TJ) e órgãos vinculados', siglas: ['TJ', 'FERMOJU', 'FUNSEG', 'FECDOJ'] },
    { prefixo: '15', nome: 'Ministério Público (PGJ) e órgãos vinculados', siglas: ['PGJ', 'FRMMP/CE', 'FDID'] }
];

// A aba ORGAOS do pacote xlsx pode marcar órgãos por código: FORA_EXECUTIVO = S (expurga) ou N
// (mantém, mesmo que o prefixo esteja na lista acima).
let orgaosForaPacote = new Set(), orgaosDentroPacote = new Set();

function loaForaDoExecutivo(l) {
    let cod = String(l.codOrgao || '');
    if (orgaosDentroPacote.has(cod)) return false;
    return orgaosForaPacote.has(cod) || LOA_FORA_EXECUTIVO.some(o => cod.startsWith(o.prefixo));
}

function siglasForaDoExecutivo() {
    let s = new Set();
    LOA_FORA_EXECUTIVO.forEach(o => o.siglas.forEach(x => s.add(N(x))));
    orgaosForaPacote.forEach(cod => { if (SIGLAS_ORGAO_LOA[cod]) s.add(N(SIGLAS_ORGAO_LOA[cod])); });
    orgaosDentroPacote.forEach(cod => { if (SIGLAS_ORGAO_LOA[cod]) s.delete(N(SIGLAS_ORGAO_LOA[cod])); });
    loaLinhasArquivo.filter(loaForaDoExecutivo).forEach(l => { if (l.sigla) s.add(N(l.sigla)); });
    return s;
}

// Mesmo formato dos demais expurgos (valores zerados, fora da LOA e da proposta).
function expurgarMAPPForaDoExecutivo(m, siglas) {
    if (m.expurgado || !siglas.has(N(m.orgao))) return m;
    return Object.assign(m, { expurgado: true, regra: 'EXPURGO: ÓRGÃO FORA DO EXECUTIVO (AL, TCE, TJ, MP)',
        prevEmp: 0, trf: 0, nec: 0, pctDeliberado: 0, prevEmpAj: 0, trfAj: 0, necAj: 0 });
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
    // Gráficos da aba 6 levam as cores do tema: redesenha.
    if (typeof renderizarNaoAlocada === 'function') renderizarNaoAlocada();
}

// ─── UTILITÁRIOS ────────────────────────────────────────────────────────────
function escHtml(v) {
    return String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── EXERCÍCIO (ano da LOA e ano base da execução) ──────────────────────────
// O estudo foi escrito para a LOA 2027 × execução 2026. Com outro exercício (campo da aba 2 ou
// EXERCICIO_LOA do pacote), os dados são lidos por papel (colunasPapel) e os textos de tela
// trocam os anos em trocarAnos — só textos do sistema, nunca dados (nomes de MAPP etc.).
function anoBase() { return exercicioLOA - 1; }

function trocarAnos(txt) {
    if (exercicioLOA === 2027 || txt === null || txt === undefined) return txt;
    return String(txt).replace(/\b(2026|2027)\b/g, a => String(a === '2026' ? anoBase() : exercicioLOA));
}

// Colunas da base de MAPPs por papel: layout do SIPOG (VLR_PROGRAMADO_<ano>) ou extração bruta
// (VLR_PLANEJADO_<aa>, VLR_LIMITE sem ano = ano base, VLR_EMPENHO_<aa>).
function colunasPapel() {
    let B = anoBase(), L = exercicioLOA, b = String(B).slice(-2), l = String(L).slice(-2);
    return {
        pBase: [`VLR_PROGRAMADO_${B}`, `VLR_PLANEJADO_${b}`], lBase: [`VLR_LIMITE_${B}`, 'VLR_LIMITE'],
        eBase: [`VLR_EMPENHADO_${B}`, `VLR_EMPENHO_${b}`], pLOA: [`VLR_PROGRAMADO_${L}`, `VLR_PLANEJADO_${l}`]
    };
}
let COLS_PAPEL = colunasPapel();

function valorPapel(r, nomes) {
    for (let n of nomes) if (r[n] !== undefined && r[n] !== null && r[n] !== '') return V(r[n]);
    return 0;
}

// Textos fixos do HTML com ano: marcados com data-anos (o original fica guardado).
function aplicarAnosNaPagina() {
    document.querySelectorAll('[data-anos]').forEach(el => {
        if (el.dataset.anosOriginal === undefined) el.dataset.anosOriginal = el.innerHTML;
        el.innerHTML = trocarAnos(el.dataset.anosOriginal);
    });
    document.title = trocarAnos('Estudo LOA 2027 × MAPPs — SIPOG');
}

// Rótulos dos cards (<span>) e avisos: troca o ano só nos textos, não nos valores (<b>).
function trocarAnosRotulos(el) {
    if (!el || exercicioLOA === 2027) return;
    el.querySelectorAll('span, h3, p').forEach(s => { if (/\b202[67]\b/.test(s.textContent) && !s.children.length) s.textContent = trocarAnos(s.textContent); });
}

function definirExercicio(valor) {
    let ano = Math.round(Number(valor));
    if (!(ano > 2000 && ano < 2100)) return;
    exercicioLOA = ano;
    COLS_PAPEL = colunasPapel();
    let el = document.getElementById('exercicio-loa');
    if (el && Number(el.value) !== ano) el.value = ano;
    aplicarAnosNaPagina();
}

// ─── TOOLTIPS DE CÁLCULO ────────────────────────────────────────────────────
// Todo valor das grades e dos cards mostra, ao passar o mouse, a fórmula com os
// números usados. FT() é o F() do SIPOG sem o "-" no zero (na fórmula o zero aparece).
function FT(v) { return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

function dica(...linhas) {
    let txt = linhas.filter(l => l !== null && l !== undefined && l !== '').join('\n');
    return txt ? ` title="${escHtml(trocarAnos(txt))}"` : '';
}

function tdNum(valor, titulo, extra) {
    return `<td class="num${extra ? ' ' + extra : ''}"${dica(titulo)}>${F(valor)}</td>`;
}

// Prev. Empenho 2026 de um MAPP: a conta da regra aplicada, com os valores.
function explicarPrevEmp(m) {
    if (m.expurgado) return `${m.regra}: Prev. Empenho, TRF e Necessidade = 0`;
    let r = N(m.regra), conta;
    if (/\(EMP\/[\d.,]+\)/.test(r)) {
        let meses = (r.match(/EMP\/([\d.,]+)/) || [])[1];
        conta = `(Empenhado 2026 ${FT(m.e26)} ÷ ${meses}) × 12`;
    } else if (/LIMITE 2026|EMP=0/.test(r)) conta = `Limite 2026 ${FT(m.l26)}`;
    else if (/EMPENHADO 2026/.test(r)) conta = `Empenhado 2026 ${FT(m.e26)}`;
    else if (/\((\d+(?:[.,]\d+)?)%\)/.test(r) && !/100%/.test(r)) conta = `Programado 2026 ${FT(m.p26)} × ${(r.match(/\((\d+(?:[.,]\d+)?)%\)/) || [])[1]}%`;
    else conta = `Programado 2026 ${FT(m.p26)}`;
    if (/CAP: PROG/.test(r)) conta = `mín(${conta}, Programado 2026 ${FT(m.p26)})`;
    return `Regra: ${m.regra}\nPrev. Empenho 2026 = ${conta} = ${FT(m.prevEmp)}`;
}

// Composição da LOA por fonte da LOA ({ subfonte: valor }): várias fontes da LOA podem ir para a
// mesma Fonte do MAPP; os tooltips mostram de onde vem a LOA.
function somarComposicao(destino, origem) {
    for (let s in (origem || {})) destino[s] = (destino[s] || 0) + origem[s];
    return destino;
}

function descricaoFonteLOA(sub) {
    let l = loaLinhasArquivo.find(x => x.subfonte === sub);
    return l ? `${sub} — ${l.descSubfonte}` : sub;
}

function textoComposicao(comp) {
    let chaves = Object.keys(comp || {}).filter(s => Math.abs(comp[s]) >= 0.5).sort((a, b) => comp[b] - comp[a]);
    if (!chaves.length) return '';
    return `Fontes da LOA (${chaves.length}):\n` + chaves.map(s => `  ${s}: ${FT(comp[s])}`).join('\n');
}

function explicarNecAj(m) {
    return `Nec. 2027 Ajustada = Programado 2027 + (Programado 2026 − Prev. Empenho Ajustada)\n= ${FT(m.p27)} + (${FT(m.p26)} − ${FT(m.prevEmpAj)}) = ${FT(m.necAj)}`;
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
        if (/\.json$/i.test(arquivo.name)) {
            carregarLOAPloa(JSON.parse(new TextDecoder('utf-8').decode(await lerArquivoComoBuffer(arquivo))), arquivo.name);
            return;
        }
        if (/\.pdf$/i.test(arquivo.name)) {
            carregarLOA(await lerLOADePDF(await lerArquivoComoBuffer(arquivo)), arquivo.name);
            return;
        }
        let wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await lerArquivoComoBuffer(arquivo));
        carregarLOA(lerLOADeWorkbook(wb), arquivo.name);
    } catch (err) {
        console.error(err);
        loaLinhas = []; loaLinhasArquivo = []; loaCreditos = [];
        status.innerHTML = `<span class="erro">❌ ${escHtml(err.message || err)}</span>`;
        recalcularEstudo();
    }
}

// ─── LOA DO PLOA 2027 POR AÇÃO (dados/loa2027_acoes.json) ───────────────────
// Gerado por ferramentas/extrair_ploa.py a partir do Volume II (conferido com os resumos de
// programa e de órgão e com o Volume I). Guarda todos os créditos; o recorte (GND, esfera,
// modalidade 91) é aplicado a cada recálculo e agrega por Órgão × Programa × Fonte (FT.DT).
let loaCreditos = [];
// Arquivo gerado pelo extrator para o exercício (ferramentas/extrair_ploa.py --ano).
function arquivoPLOA() { return `dados/loa${exercicioLOA}_acoes.json`; }

async function carregarPLOADoRepositorio() {
    let status = document.getElementById('status-loa');
    status.innerHTML = `Baixando o PLOA ${exercicioLOA}…`;
    try {
        let resp = await fetch(arquivoPLOA());
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        carregarLOAPloa(await resp.json(), `PLOA ${exercicioLOA} — Volume II (${arquivoPLOA()})`);
    } catch (err) {
        console.error(err);
        status.innerHTML = `<span class="erro">❌ Não foi possível baixar ${arquivoPLOA()} (${escHtml(err.message || err)}). Com a página aberta por duplo clique, escolha o arquivo no seletor ao lado.</span>`;
    }
}

function carregarLOAPloa(pacote, nomeArquivo) {
    if (!pacote || !Array.isArray(pacote.creditos)) throw new Error('O arquivo não é o PLOA 2027 por ação (falta a lista "creditos").');
    loaCreditos = pacote.creditos;
    let conf = pacote.conferencia || {};
    carregarLOA({ linhas: montarLinhasPLOA(loaCreditos, lerParametrosEstudo()), conferido: true, origem: 'ploa',
        divergencias: (conf.difResumos || []).map(d => ({ item: `${d.orgao}${d.programa ? ' prog. ' + d.programa : ''} ${d.fonte} GND ${d.gnd}`, esperado: d.resumo, lido: d.creditos })),
        resumoPloa: { creditos: loaCreditos.length, gndVolumeI: conf.gndVolumeI || {}, doPacote: !!pacote.doPacote } }, nomeArquivo);
}

// Sub fonte do crédito: o código completo quando dá para saber qual é (uma só sub fonte
// conhecida para o FT.DT, ou resolvida pelo órgão); senão, o próprio FT.DT.
function fonteLOADoCredito(c) {
    let chave = `${c.ft}.${c.dt}`;
    let conhecidas = FONTES_LOA[chave] || [];
    let resolvida = (SUBFONTE_LOA_POR_ORGAO[c.codOrgao] || {})[chave];
    let unica = resolvida ? conhecidas.find(x => x.subfonte === resolvida) : (conhecidas.length === 1 ? conhecidas[0] : null);
    if (unica) return { subfonte: unica.subfonte, grupo: unica.grupo, desc: unica.desc, codigos: [unica.subfonte] };
    return { subfonte: chave, grupo: conhecidas.length ? conhecidas[0].grupo : (c.ft === '500' ? 'Tesouro' : 'Outras Fontes'),
        desc: conhecidas.length ? conhecidas[0].desc + ` (e mais ${conhecidas.length - 1} variante(s))` : '(sem descrição na LOA por Órgão e Fonte)',
        codigos: conhecidas.map(x => x.subfonte) };
}

// Crédito dentro do recorte da aba 2. GND ou esfera vazios (LOA de outra origem, sem essa
// informação) não são filtrados por esse critério.
function creditoNoRecorte(c, prm) {
    return (!c.gnd || prm.gnds.has(c.gnd)) && (!c.esfera || prm.esferas.has(c.esfera)) && !(prm.semMod91 && c.modalidade === '91');
}

function montarLinhasPLOA(creditos, prm) {
    let agreg = {};
    creditos.forEach(c => {
        if (!creditoNoRecorte(c, prm)) return;
        let f = fonteLOADoCredito(c);
        let k = c.codOrgao + '|' + c.programa + '|' + f.subfonte;
        let l = agreg[k] || (agreg[k] = { grupo: f.grupo, subfonte: f.subfonte, descSubfonte: f.desc, codigosSubfonte: f.codigos,
            codOrgao: c.codOrgao, orgao: c.orgao, sigla: SIGLAS_ORGAO_LOA[c.codOrgao] || c.orgao, esfera: c.esfera,
            programa: c.programa, nomePrograma: c.nomePrograma, valor: 0, acoes: new Set() });
        l.valor += c.valor;
        l.acoes.add(c.codAcao);
    });
    return Object.values(agreg).map(l => Object.assign(l, { acoes: l.acoes.size }));
}

// Refaz as linhas da LOA com o recorte atual (só quando a LOA veio do PLOA por ação).
function aplicarRecorteLOA() {
    if (loaConferencia.origem !== 'ploa' || !loaCreditos.length) return;
    loaLinhasArquivo = montarLinhasPLOA(loaCreditos, lerParametrosEstudo());
    loaLinhas = loaLinhasArquivo.filter(l => !loaForaDoExecutivo(l));
    atualizarStatusLOA();
}

function carregarLOA(resultado, nomeArquivo) {
    loaLinhasArquivo = resultado.linhas;
    loaLinhas = loaLinhasArquivo.filter(l => !loaForaDoExecutivo(l));
    let origem = resultado.origem || (/\.pdf$/i.test(nomeArquivo || '') ? 'pdf' : 'xlsx');
    if (origem !== 'ploa') loaCreditos = [];
    loaConferencia = { conferido: !!resultado.conferido, divergencias: resultado.divergencias || [], origem, resumoPloa: resultado.resumoPloa || null };
    loaArquivo = nomeArquivo || '';
    atualizarStatusLOA();
    recalcularEstudo();
}

function atualizarStatusLOA() {
    let origem = loaConferencia.origem;
    let expurgadas = loaLinhasArquivo.filter(loaForaDoExecutivo);
    let total = loaLinhas.reduce((s, l) => s + l.valor, 0);
    let subfontes = new Set(loaLinhas.map(l => l.subfonte)).size;
    let orgaos = new Set(loaLinhas.map(l => l.codOrgao)).size;
    let ref = origem === 'pdf' ? 'totais do PDF' : origem === 'ploa' ? 'resumos do PDF' : 'Resumo';
    let divs = loaConferencia.divergencias;
    let conf;
    if (!loaConferencia.conferido) conf = '<span class="aviso">⚠ Aba "Resumo por sub fonte" ausente — soma não conferida.</span>';
    else if (origem === 'ploa' && loaConferencia.resumoPloa && loaConferencia.resumoPloa.doPacote && !divs.length)
        conf = '<span class="aviso">Aba LOA do pacote: sem conferência automática com os resumos do PLOA — confira o total com a fonte da extração.</span>';
    else if (divs.length === 0) conf = origem === 'pdf' ? '<span class="ok">✔ Somas das fontes conferem com o total de cada órgão e com o TOTAL GERAL.</span>'
        : '<span class="ok">✔ Somas por sub fonte conferem com o Resumo.</span>';
    else if (origem === 'ploa') conf = `<span class="ok">✔ Créditos conferem com os resumos de programa e de órgão e com o Volume I</span>, salvo ${divs.length} diferença(s) do próprio PDF (resumo maior que as linhas impressas): ` +
        divs.slice(0, 3).map(d => `${escHtml(d.item)} ${F(d.esperado - d.lido)}`).join('; ');
    else conf = `<span class="erro">✖ ${divs.length} item(ns) divergem dos ${ref}:</span> ` +
        divs.slice(0, 5).map(d => `${escHtml(d.item || d.subfonte)} (lido ${F(d.lido)} × ${ref} ${F(d.esperado)})`).join('; ');
    let recorte = '';
    if (origem === 'ploa') {
        let prm = lerParametrosEstudo();
        recorte = `Recorte (aba 2): GND ${[...prm.gnds].sort().join(', ') || 'nenhum'} · ${[...prm.esferas].map(e => e === 'INVESTIMENTOS ESTATAIS' ? 'Estatais' : 'Fiscal/Seguridade').join(' + ') || 'nenhuma esfera'}${prm.semMod91 ? ' · sem modalidade 91' : ''}<br>`;
    }
    let unidade = origem === 'ploa' ? 'pares Órgão × Programa × Fonte' : 'pares Sub fonte × Órgão';
    document.getElementById('status-loa').innerHTML =
        `<span class="ok">✅ ${escHtml(loaArquivo)}</span>${origem === 'ploa' ? ` — ${loaCreditos.length.toLocaleString('pt-BR')} créditos` : ''}<br>` + recorte +
        `${loaLinhas.length.toLocaleString('pt-BR')} ${unidade} · ${subfontes} fontes · ${orgaos} órgãos<br>` +
        `Total LOA (Executivo): <strong>${F(total)}</strong><br>` +
        (expurgadas.length
            ? `<span class="aviso">Expurgados (fora do Executivo): ${expurgadas.length} par(es), ${new Set(expurgadas.map(l => l.codOrgao)).size} órgão(s), ${F(expurgadas.reduce((s, l) => s + l.valor, 0))} — ${escHtml([...new Set(expurgadas.map(l => l.sigla || l.orgao))].join(', '))}</span><br>`
            : `Expurgo fora do Executivo (${escHtml(LOA_FORA_EXECUTIVO.map(o => o.nome.split(' (')[0]).join(', '))}): nenhum órgão no arquivo.<br>`) +
        conf +
        (origem === 'xlsx' ? '<br><span class="aviso">⚠ A planilha "Fonte x Órgão" traz a LOA inteira (pessoal, custeio e dívida). Para o estudo, use o PLOA 2027 por ação.</span>' : '');
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
// Os valores obrigatórios dependem do exercício: ver colunasPapel() (normalizarLayoutMAPPs).
const COLUNAS_OBRIGATORIAS_MAPPS = ['MAPP', 'ORGAO', 'FONTE', 'ESTAGIO_EXECUCAO'];
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
        faltando: COLUNAS_OBRIGATORIAS_MAPPS.filter(c => !disponiveis.includes(c))
            .concat(Object.values(COLS_PAPEL).filter(nomes => !nomes.some(n => disponiveis.includes(n))).map(nomes => nomes[0])),
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

function lerMAPPsDeWorkbook(wb, aba) {
    let ws = aba || wb.worksheets[0];
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
        avisos += `<br><span class="erro">✖ Colunas não encontradas para o exercício ${exercicioLOA} (LOA ${exercicioLOA} × execução ${anoBase()}): ${n.faltando.map(escHtml).join(', ')} — confira o "Exercício da LOA" na aba 2.</span>`;
    if (corrigidos.celulas)
        avisos += `<br><span class="aviso">⚠ Acentuação corrompida corrigida em ${corrigidos.celulas.toLocaleString('pt-BR')} célula(s) (ex.: ${escHtml(corrigidos.exemplo)}) — sem a correção, o estágio não seria reconhecido.</span>`;
    if (n.semGrupo)
        avisos += `<br><span class="aviso">⚠ Sem colunas de grupo (${COLUNAS_GRUPO_MAPPS.join(', ')}): todos os MAPPs seguem a regra por estágio, como "Demais Projetos" — os grupos com 100% do Programado e o expurgo de Entrega Prioritária não se aplicam, e o resultado pode diferir do SIPOG.</span>`;
    let expurgos = mappsBrutos.filter(r => { let e = N(r.ESTAGIO_EXECUCAO); return e.includes('CONCLUIDO') || e.includes('CANCELADO') || e.includes('TRANSFERIDO'); }).length;
    document.getElementById('status-mapps').innerHTML =
        `<span class="ok">✅ ${escHtml(mappsArquivo)}</span><br>${mappsBrutos.length.toLocaleString('pt-BR')} linhas lidas ` +
        `(${expurgos.toLocaleString('pt-BR')} concluídas/canceladas/transferidas, expurgadas)${avisos}`;
    aplicarProgramasNaBase();
    recalcularEstudo();
}

// ─── PROGRAMAS DOS MAPPs (extração bruta com a coluna PROGRAMA) ─────────────
// A base do SIPOG não tem PROGRAMA. A extração do MAPP tem; liga pelo órgão + texto do MAPP
// (o SIPOG trocou "." por "," nos textos, então os dois lados são comparados com ",").
let programasPorMapp = null;   // { 'ORGAO|MAPP': 'NNN - NOME' }
let programasArquivo = '';

function chaveProgramaMapp(orgao, mapp) {
    return N(orgao) + '|' + N(String(mapp || '').replace(/\./g, ',')).replace(/\s+/g, ' ');
}

async function selecionarArquivoProgramas(input) {
    let arquivo = input.files && input.files[0];
    if (!arquivo) return;
    let status = document.getElementById('status-programas');
    status.innerHTML = 'Lendo…';
    try {
        let buffer = await lerArquivoComoBuffer(arquivo);
        let r;
        if (/\.(csv|txt)$/i.test(arquivo.name)) r = lerMAPPsDeCSV(decodificarTextoArquivo(buffer));
        else { let wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer); r = lerMAPPsDeWorkbook(wb); }
        if (!r.headers.includes('PROGRAMA') || !r.headers.includes('MAPP') || !r.headers.includes('ORGAO'))
            throw new Error('O arquivo precisa das colunas ORGAO, MAPP e PROGRAMA.');
        corrigirMojibakeLinhas(r.linhas);
        programasPorMapp = {};
        r.linhas.forEach(l => { if (l.PROGRAMA) programasPorMapp[chaveProgramaMapp(l.ORGAO, l.MAPP)] = String(l.PROGRAMA).trim(); });
        programasArquivo = arquivo.name;
        aplicarProgramasNaBase();
        recalcularEstudo();
    } catch (err) {
        console.error(err);
        status.innerHTML = `<span class="erro">❌ ${escHtml(err.message || err)}</span>`;
    }
}

// Preenche PROGRAMA nas linhas da base que não têm (também na cópia original, para salvar e exportar).
function aplicarProgramasNaBase() {
    let status = document.getElementById('status-programas');
    if (!programasPorMapp || !mappsBrutos.length) {
        if (status && programasPorMapp) status.innerHTML = `✅ ${escHtml(programasArquivo)} — carregue a base de MAPPs para ligar os programas.`;
        return;
    }
    let ligados = 0, jaTinham = 0;
    mappsBrutos.forEach((r, i) => {
        if (r.PROGRAMA) { jaTinham++; return; }
        let p = programasPorMapp[chaveProgramaMapp(r.ORGAO, r.MAPP)];
        if (!p) return;
        r.PROGRAMA = p;
        if (mappsOriginais[i]) mappsOriginais[i].PROGRAMA = p;
        ligados++;
    });
    if (ligados && !mappsColunasOriginais.includes('PROGRAMA')) mappsColunasOriginais.push('PROGRAMA');
    let sem = mappsBrutos.length - ligados - jaTinham;
    if (status) status.innerHTML = `<span class="ok">✅ ${escHtml(programasArquivo)}</span><br>` +
        `${ligados.toLocaleString('pt-BR')} MAPP(s) ligados a um programa${jaTinham ? ` · ${jaTinham.toLocaleString('pt-BR')} já tinham` : ''}` +
        (sem ? `<br><span class="aviso">⚠ ${sem.toLocaleString('pt-BR')} linha(s) sem programa (órgão + texto do MAPP não encontrados na extração) — ficam no par "${SEM_PROGRAMA}", sem LOA.</span>` : '');
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
    // p26/l26/e26 = ano base da execução; p27 = ano da LOA (colunas pelo exercício: COLS_PAPEL).
    let p26 = valorPapel(r, COLS_PAPEL.pBase), l26 = valorPapel(r, COLS_PAPEL.lBase), e26 = valorPapel(r, COLS_PAPEL.eBase), p27 = valorPapel(r, COLS_PAPEL.pLOA);
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
        vdFonte: (document.getElementById('vd-fonte') || {}).value || '',
        // Recorte da LOA do PLOA por ação (caixas da aba 2).
        gnds: new Set(GNDS_LOA.filter(g => marcadoRecorte('gnd-' + g)).map(g => g)),
        esferas: new Set(ESFERAS_LOA.filter(e => marcadoRecorte(e.id)).map(e => e.esfera)),
        semMod91: marcadoRecorte('loa-sem-mod91')
    };
}

// Recorte padrão da LOA: só GND 44, as duas esferas e sem a modalidade 91 (intraorçamentária).
const GNDS_LOA = ['31', '32', '33', '44', '45', '46', '02'];
const ESFERAS_LOA = [{ id: 'esf-fiscal', esfera: 'FISCAL / SEGURIDADE SOCIAL' }, { id: 'esf-estatais', esfera: 'INVESTIMENTOS ESTATAIS' }];
const RECORTE_LOA_PADRAO = { 'gnd-31': false, 'gnd-32': false, 'gnd-33': false, 'gnd-44': true, 'gnd-45': false, 'gnd-46': false, 'gnd-02': false,
    'esf-fiscal': true, 'esf-estatais': true, 'loa-sem-mod91': true };

function marcadoRecorte(id) {
    let el = document.getElementById(id);
    return el ? el.checked : !!RECORTE_LOA_PADRAO[id];
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
    for (let id in RECORTE_LOA_PADRAO) { let el = document.getElementById(id); if (el) el.checked = RECORTE_LOA_PADRAO[id]; }
    recalcularEstudo();
}

// ─── DE-PARA: SUB FONTE DA LOA → FONTE DO MAPP ──────────────────────────────
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
// A sub fonte do PLOA por ação vem como "FT.DT" (ex.: "754.59"), sem a modalidade que a 754
// usa no código do SIPOG ((754)-(259)): com uma só sub fonte conhecida para o FT.DT, usa o
// código completo dela; senão, procura a fonte do MAPP com o mesmo FT terminada no DT.
function sugerirFonteSIPOG(linhaLOA, fontesSIPOG) {
    let seg = linhaLOA.subfonte.split('.');
    if (seg.length === 2 && (linhaLOA.codigosSubfonte || []).length === 1) seg = linhaLOA.codigosSubfonte[0].split('.');
    let fff = seg[0], modalidade = seg.length === 6 ? seg[3] : null, det = seg[seg.length - 1];
    let comPartes = fontesSIPOG.map(f => ({ fonte: f, p: partesFonteSIPOG(f) })).filter(x => x.p);
    let mesmoFFF = comPartes.filter(x => x.p.fff === fff);

    let exatas = (fff === '754' && modalidade === null)
        ? mesmoFFF.filter(x => x.p.ddd.length === 3 && x.p.ddd.slice(1) === det)
        : mesmoFFF.filter(x => x.p.ddd === ((fff === '754') ? (modalidade + det) : ('0' + det)));
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
        if (deParaSugerido[l.subfonte]) return;
        // FT.DT do PLOA: herda a escolha manual feita antes para a sub fonte completa equivalente.
        let codigos = l.codigosSubfonte || [];
        if (codigos.length === 1 && Object.prototype.hasOwnProperty.call(deParaManual, codigos[0])) {
            deParaSugerido[l.subfonte] = { fonte: deParaManual[codigos[0]], regra: 'manual' };
            return;
        }
        deParaSugerido[l.subfonte] = sugerirFonteSIPOG(l, fontes);
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
        ${thDesc('Grupo', 'Grupo da sub fonte na LOA: Tesouro ou Outras Fontes (coluna do valor no relatório).')}${thDesc('Sub fonte', 'Código da sub fonte na LOA (fonte.detalhamento).')}
        ${thDesc('Descrição', 'Descrição da sub fonte na LOA.')}
        ${thDesc('Órgãos', 'Órgãos do Executivo com LOA nesta sub fonte.', 'num')}${thDesc('LOA 2027', 'Σ LOA 2027 da sub fonte em todos os órgãos do Executivo.', 'num')}
        ${thDesc('Regra', 'Como a Fonte do MAPP foi achada: exata (código igual), tesouro (500/501 do grupo Tesouro), prefixo (fonte única com o mesmo código) ou manual.')}
        ${thDesc('Fonte do MAPP', 'Fonte do MAPP que recebe a LOA desta sub fonte. "Sem fonte" deixa a LOA fora do cruzamento.')}</tr></thead><tbody>`;
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
            <td class="num"${dica(`Órgãos do Executivo com LOA 2027 na sub fonte ${s.subfonte}`)}>${s.orgaos}</td>
            ${tdNum(s.valor, `LOA 2027 da sub fonte = Σ LOA dos ${s.orgaos} órgão(s) = ${FT(s.valor)}`)}
            <td><span class="estudo-tag tag-${tag === 'sem par' ? 'sem' : tag}">${ROTULO_REGRA_DEPARA[tag] || tag}</span></td>
            <td><select data-subfonte="${escHtml(s.subfonte)}" onchange="alterarDePara(this)" style="max-width:340px;">${opcoes}</select></td>
        </tr>`;
    });
    h += `</tbody><tfoot><tr><td colspan="3">TOTAL${fGrupo ? ' ' + escHtml(fGrupo).toUpperCase() : ''} (${lista.length} sub fontes)</td>
        <td class="num"${dica('Σ pares Órgão × Sub fonte')}>${tot.orgaos}</td>
        ${tdNum(tot.valor, `Σ LOA das ${lista.length} sub fontes = com fonte do MAPP ${FT(tot.valorCom)} + sem fonte ${FT(tot.valorSem)} = ${FT(tot.valor)}`)}
        <td colspan="2" style="font-weight:600; font-size:11px; white-space:normal;">Com fonte: ${tot.qtdCom} · ${F(tot.valorCom)} &nbsp;|&nbsp; Sem fonte: ${tot.qtdSem} · ${F(tot.valorSem)}</td>
        </tr></tfoot></table>`;
    cont.innerHTML = h;
    renderizarDeParaPorMapp(todas, fGrupo);
}

// ─── DE-PARA VISTO PELA FONTE DO MAPP ───────────────────────────────────────
// Várias fontes da LOA podem ir para uma mesma Fonte do MAPP (sem rateio: cada fonte da LOA vai
// inteira para uma só). Uma linha por Fonte do MAPP; o clique abre a composição na própria grade,
// com ✕ (desligar) e "+ ligar fonte da LOA".
let expandidosDeParaMapp = new Set();

function alternarFonteMappDePara(fonte) {
    if (expandidosDeParaMapp.has(fonte)) expandidosDeParaMapp.delete(fonte); else expandidosDeParaMapp.add(fonte);
    renderizarDePara();
}

function ligarFonteLOA(sel) {
    if (!sel.value) return;
    deParaManual[sel.value] = sel.dataset.fonte;
    salvarDeParaManual();
    recalcularEstudo();
}

function desligarFonteLOA(btn) {
    deParaManual[btn.dataset.subfonte] = '';
    salvarDeParaManual();
    recalcularEstudo();
}

function renderizarDeParaPorMapp(todas, fGrupo) {
    let cont = document.getElementById('tabela-depara-mapp');
    if (!cont) return;
    let fTxt = N((document.getElementById('filtro-dp-texto') || {}).value || '');
    let porFonte = {};
    let obter = f => porFonte[f] || (porFonte[f] = { fonte: f, subs: [], loa: 0, mapps: 0, necAj: 0 });
    fontesSIPOGDisponiveis().forEach(obter);
    todas.forEach(s => {
        let f = fonteEfetiva(s.subfonte).fonte;
        if (!f || (fGrupo && s.grupo !== fGrupo)) return;
        let g = obter(f);
        g.subs.push(s); g.loa += s.valor;
    });
    mappsCalculados.forEach(m => { if (!m.expurgado && porFonte[m.fonte]) { porFonte[m.fonte].mapps++; porFonte[m.fonte].necAj += m.necAj; } });
    let linhas = Object.values(porFonte).filter(g => (!fGrupo || g.subs.length) && (!fTxt || N(g.fonte).includes(fTxt)))
        .sort((a, b) => (b.loa - a.loa) || (b.necAj - a.necAj) || a.fonte.localeCompare(b.fonte));
    if (!linhas.length) { cont.innerHTML = '<p class="estudo-nota" style="padding:12px;">Nenhuma Fonte do MAPP para o filtro.</p>'; return; }
    let h = `<table><thead><tr>${thDesc('Fonte do MAPP', 'Fonte da base de MAPPs. Clique na linha (▸) para ver e editar as fontes da LOA ligadas a ela.')}
        ${thDesc('Fontes da LOA', 'Quantas fontes (sub fontes) da LOA estão ligadas a esta Fonte do MAPP pelo de-para. Cada fonte da LOA vai inteira para uma só Fonte do MAPP.', 'num')}
        ${thDesc('LOA 2027', 'Σ LOA 2027 das fontes da LOA ligadas (só Executivo, recorte da aba 2).', 'num')}
        ${thDesc('MAPPs', 'MAPPs ativos nesta Fonte do MAPP.', 'num')}${thDesc('Nec. 2027 Ajustada', 'Σ Nec. 2027 Ajustada dos MAPPs ativos da fonte.', 'num')}
        ${thDesc('Necessidade ÷ LOA', 'Nec. Ajustada ÷ LOA × 100 (sem LOA: —).', 'num')}</tr></thead><tbody>`;
    linhas.forEach(g => {
        let aberto = expandidosDeParaMapp.has(g.fonte);
        let pct = g.loa > 0 ? g.necAj / g.loa * 100 : null;
        let compos = g.subs.length ? `Σ = ${g.subs.map(s => `${s.subfonte} ${FT(s.valor)}`).join(' + ')} = ${FT(g.loa)}` : 'Nenhuma fonte da LOA ligada';
        h += `<tr class="linha-clicavel${g.subs.length ? '' : ' alerta-semdestino'}" data-fonte="${escHtml(g.fonte)}" onclick="alternarFonteMappDePara(this.dataset.fonte)" title="${aberto ? 'Recolher' : 'Ver e editar as fontes da LOA ligadas'}">
            <td><span class="seta-grupo">${aberto ? '▾' : '▸'}</span> <strong>${escHtml(g.fonte)}</strong></td>
            <td class="num"${dica(compos)}>${g.subs.length || '—'}</td>${g.loa ? tdNum(g.loa, compos) : '<td class="num">—</td>'}
            <td class="num">${g.mapps || '—'}</td>${tdNum(g.necAj, `Σ Nec. 2027 Ajustada dos ${g.mapps} MAPPs = ${FT(g.necAj)}`)}
            <td class="num ${pct !== null && pct > 100 ? 'pct-alto' : ''}"${dica(pct === null ? 'Sem LOA ligada' : `${FT(g.necAj)} ÷ ${FT(g.loa)} × 100`)}>${fmtPct(pct)}</td></tr>`;
        if (aberto) h += `<tr class="linha-mapps"><td colspan="6">${subtabelaComposicaoFonte(g, todas)}</td></tr>`;
    });
    let semLOA = linhas.filter(g => !g.subs.length && g.necAj > 0.5);
    h += `</tbody><tfoot><tr><td>TOTAL (${linhas.length} Fontes do MAPP)</td><td class="num">${linhas.reduce((s, g) => s + g.subs.length, 0)}</td>
        ${tdNum(linhas.reduce((s, g) => s + g.loa, 0), 'Σ LOA ligada')}<td class="num">${linhas.reduce((s, g) => s + g.mapps, 0).toLocaleString('pt-BR')}</td>
        ${tdNum(linhas.reduce((s, g) => s + g.necAj, 0), 'Σ Nec. Ajustada')}<td></td></tr></tfoot></table>`;
    cont.innerHTML = h;
    let aviso = document.getElementById('aviso-depara-mapp');
    if (aviso) aviso.innerHTML = semLOA.length
        ? `⚠ ${semLOA.length} Fonte(s) do MAPP com necessidade e <strong>nenhuma fonte da LOA ligada</strong> (${abreviarValor(semLOA.reduce((s, g) => s + g.necAj, 0))} de Nec. Ajustada): ${escHtml(semLOA.slice(0, 6).map(g => g.fonte).join('; '))}${semLOA.length > 6 ? '…' : ''}. Se alguma fonte da LOA "sem par" corresponde a elas, ligue-a abrindo a linha.`
        : '';
}

function subtabelaComposicaoFonte(g, todas) {
    let h = `<table class="subtabela-mapps"><thead><tr>${thDesc('Fonte da LOA', 'Sub fonte da LOA ligada a esta Fonte do MAPP.')}${thDesc('Descrição', 'Descrição da sub fonte na LOA.')}
        ${thDesc('Grupo', 'Tesouro ou Outras Fontes.')}${thDesc('Regra', 'exata, tesouro, prefixo ou manual.')}${thDesc('LOA 2027', 'LOA da sub fonte (Executivo).', 'num')}<th class="sem-ordem"></th></tr></thead><tbody>`;
    g.subs.slice().sort((a, b) => b.valor - a.valor).forEach(s => {
        let ef = fonteEfetiva(s.subfonte);
        h += `<tr><td style="white-space:nowrap;">${escHtml(s.subfonte)}</td><td>${escHtml(s.desc)}</td><td>${escHtml(s.grupo)}</td>
            <td><span class="estudo-tag tag-${ef.regra === 'sem' ? 'sem' : ef.regra}">${ROTULO_REGRA_DEPARA[ef.regra] || ef.regra}</span></td>${tdNum(s.valor, `LOA 2027 da sub fonte = ${FT(s.valor)}`)}
            <td><button class="btn-link" data-subfonte="${escHtml(s.subfonte)}" onclick="event.stopPropagation(); desligarFonteLOA(this)" title="Desligar: a fonte da LOA fica sem Fonte do MAPP (de-para manual)">✕ desligar</button></td></tr>`;
    });
    // Fontes da LOA que podem ser ligadas: sem par primeiro, depois as ligadas a outra Fonte do MAPP.
    let candidatas = todas.filter(s => fonteEfetiva(s.subfonte).fonte !== g.fonte)
        .sort((a, b) => (!!fonteEfetiva(a.subfonte).fonte - !!fonteEfetiva(b.subfonte).fonte) || b.valor - a.valor);
    let opcoes = candidatas.map(s => {
        let atual = fonteEfetiva(s.subfonte).fonte;
        return `<option value="${escHtml(s.subfonte)}">${escHtml(`${s.subfonte} — ${String(s.desc).slice(0, 50)} — ${abreviarValor(s.valor)} — ${atual ? 'hoje em ' + atual : 'sem par'}`)}</option>`;
    }).join('');
    h += `</tbody><tfoot><tr><td colspan="6" onclick="event.stopPropagation();">+ ligar fonte da LOA:
        <select data-fonte="${escHtml(g.fonte)}" onchange="ligarFonteLOA(this)" style="max-width:560px;"><option value="">(escolha a fonte da LOA)</option>${opcoes}</select></td></tr></tfoot></table>`;
    return h;
}

// ─── CONSOLIDADO ÓRGÃO × FONTE ──────────────────────────────────────────────
// Pares com LOA e MAPPs primeiro (o cruzamento de interesse), depois os demais.
const ORDEM_SITUACAO = { OK: 0, SEM_MAPP: 1, SEM_LOA: 2 };

function montarConsolidado() {
    let mapa = {};
    let obter = (rotulo, programa, nomePrograma, fonte) => {
        let k = chavePar(rotulo, programa, fonte);
        if (!mapa[k]) mapa[k] = { orgao: rotulo, programa, nomePrograma: nomePrograma || '', fonte, loa: 0, temLOA: false, qtd: 0, p26: 0, p27: 0, prevEmp: 0, prevEmpAj: 0, nec: 0, necAj: 0, subfontes: new Set(), loaSubfonte: {} };
        if (!mapa[k].nomePrograma && nomePrograma) mapa[k].nomePrograma = nomePrograma;
        return mapa[k];
    };
    let loaForaCruzamento = 0, paresForaCruzamento = 0;
    loaLinhas.forEach(l => {
        let fonte = fonteEfetiva(l.subfonte).fonte;
        if (!fonte) { loaForaCruzamento += l.valor; paresForaCruzamento++; return; }
        let item = obter(l.sigla, cruzaPrograma ? l.programa : '', l.nomePrograma, fonte);
        item.loa += l.valor;
        item.temLOA = true;
        item.subfontes.add(l.subfonte);
        item.loaSubfonte[l.subfonte] = (item.loaSubfonte[l.subfonte] || 0) + l.valor;
    });
    mappsCalculados.forEach(m => {
        if (m.expurgado) return;
        let item = obter(m.orgao, programaDoPar(m), m.nomePrograma, m.fonte);
        item.qtd++;
        item.p26 += m.p26;
        item.p27 += m.p27;
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
    consolidadoAtual.forEach(l => { situacaoPorPar[chavePar(l.orgao, l.programa, l.fonte)] = l.situacao; });
    return { loaForaCruzamento, paresForaCruzamento };
}

// ─── CRUZAMENTO ÓRGÃO × PROGRAMA × FONTE ────────────────────────────────────
// Com a LOA do PLOA por ação e MAPPs com programa (coluna PROGRAMA ou arquivo "Programas
// dos MAPPs"), o par passa a ser Órgão × Programa × Fonte; senão, Órgão × Fonte (programa '').
let cruzaPrograma = false;
let nomesProgramas = {};      // código → nome (LOA e MAPPs), para rótulos e filtros
const SEM_PROGRAMA = '(sem programa)';

function chavePar(orgao, programa, fonte) { return N(orgao) + '||' + (programa || '') + '||' + fonte; }

// "222 - INOVA CEARÁ" → { cod: '222', nome: 'INOVA CEARÁ' }
function programaDoTexto(txt) {
    let m = String(txt || '').trim().match(/^(\d{1,3})\s*-\s*(.*)$/);
    return m ? { cod: m[1].padStart(3, '0'), nome: m[2].trim() } : { cod: '', nome: '' };
}

function programaDoPar(m) { return cruzaPrograma ? (m.programa || SEM_PROGRAMA) : ''; }

function rotuloPrograma(cod, nome) {
    if (!cod) return '';
    return cod === SEM_PROGRAMA ? SEM_PROGRAMA : `${cod}${nome ? ' - ' + nome : ''}`;
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

// Significado e modo de cálculo de cada coluna (tooltip do cabeçalho), por grade.
const DESC_PROPOSTA = 'Grade com necessidade: automática = Nec. Ajustada × mín(1, LOA do par Órgão × Fonte ÷ Σ Nec. Ajustada dos MAPPs do par) — proporcional à necessidade e nunca acima dela. Grade sem necessidade: R$ 0 (só manual). Valor editado ou redistribuído ("Distribuir") substitui o automático.';
const DESC_COLUNAS = {
    cons: {
        fonte: 'Fonte do MAPP (a sub fonte da LOA vem pelo De-para da aba 3).',
        orgao: 'Órgão (sigla). Na LOA, a sigla entre parênteses do nome do órgão.',
        programa: 'Programa de governo (PLOA 2027 por ação × coluna PROGRAMA dos MAPPs). O par passa a ser Órgão × Programa × Fonte.',
        situacao: 'LOA e MAPPs: o par tem LOA e MAPPs ativos. MAPPs sem LOA: há MAPPs, mas o órgão não tem LOA nesta fonte. LOA sem MAPPs: há LOA, mas nenhum MAPP ativo.',
        loa: 'LOA 2027 do órgão na fonte = Σ das sub fontes da LOA ligadas a esta fonte (só Executivo).',
        qtd: 'Quantidade de MAPPs ativos (não expurgados) do órgão na fonte.',
        p26: 'Σ Programado 2026 dos MAPPs ativos (valor da base).',
        prevEmp: 'Σ Previsão de Empenho 2026: regra por estágio do SIPOG (% do Programado, Limite, Empenhado anualizado…).',
        prevEmpAj: 'Σ Prev. Empenho × (1 − % do Valor Deliberado do grupo).',
        nec: 'Nec. 2027 Calculada = Σ Programado 2027 + Σ TRF 2026, com TRF = Programado 2026 − Prev. Empenho.',
        necAj: 'Nec. 2027 Ajustada = Σ Programado 2027 + (Σ Programado 2026 − Σ Prev. Empenho Ajustada).',
        pctLOA: 'Necessidade ÷ LOA = Nec. 2027 Ajustada ÷ LOA 2027 × 100: quanto da LOA a necessidade dos MAPPs representa. 100% = a LOA cobre exatamente; acima de 100% (vermelho) = a necessidade passa da LOA; abaixo = sobra LOA.',
        saldo: 'Saldo = LOA 2027 − Nec. 2027 Ajustada. Negativo: a necessidade passa da LOA.',
        subfontes: 'Quantas fontes da LOA compõem a LOA desta linha (várias fontes da LOA podem ir para a mesma Fonte do MAPP). Passe o mouse para ver os valores.'
    },
    det: {
        mapp: 'Número e título do MAPP.', orgao: 'Órgão do MAPP.', programa: 'Programa do MAPP (coluna PROGRAMA da base ou do arquivo "Programas dos MAPPs").',
        fonte: 'Fonte do MAPP.', estagio: 'Estágio de execução (normalizado como no SIPOG).',
        grupo: 'Grupo do MAPP (Contrato Gestão, Continuidade, PCF Convênio, Operação de Crédito ou Demais Projetos).',
        p26: 'Programado 2026 (valor da base).', l26: 'Limite 2026 (valor da base).', e26: 'Empenhado 2026 (valor da base).',
        regra: 'Regra da Previsão de Empenho aplicada ao MAPP (cópia do SIPOG).',
        prevEmp: 'Previsão de Empenho 2026 pela regra do estágio/grupo.',
        trf: 'TRF 2026 = Programado 2026 − Prev. Empenho 2026 (o que não será empenhado e passa para 2027).',
        p27: 'Programado 2027 (valor da base).',
        nec: 'Nec. 2027 Calculada = Programado 2027 + TRF 2026.',
        pctDel: 'Valor Deliberado do grupo (aba 2), se aplicado na fonte do MAPP.',
        prevEmpAj: 'Prev. Empenho Ajustada = Prev. Empenho × (1 − % deliberado).',
        necAj: 'Nec. 2027 Ajustada = Programado 2027 + (Programado 2026 − Prev. Empenho Ajustada).'
    },
    aj: {
        mapp: 'Número e título do MAPP.', orgao: 'Órgão do MAPP.', programa: 'Programa do MAPP (o par é Órgão × Programa × Fonte).',
        fonte: 'Fonte do MAPP.', estagio: 'Estágio de execução.',
        loaPar: 'LOA 2027 do par do MAPP (órgão [× programa] × fonte), repartida entre os MAPPs do par.',
        necAj: 'Nec. 2027 Ajustada do MAPP = Programado 2027 + (Programado 2026 − Prev. Empenho Ajustada). É o teto da proposta automática.',
        proposta: DESC_PROPOSTA
    }
};

function thDesc(titulo, desc, cls) {
    return `<th class="sem-ordem${cls ? ' ' + cls : ''}" data-desc="1"${dica(titulo, desc)}>${escHtml(trocarAnos(titulo))}</th>`;
}

function cabecalhoOrdenavel(tabela, colunas) {
    let o = ordemTabelas[tabela];
    return '<tr>' + colunas.map(c => {
        let cls = [c.num ? 'num' : '', c.classe || '', o.chave === c.chave ? (o.desc ? 'ordem-desc' : 'ordem-asc') : ''].join(' ').trim();
        let desc = (DESC_COLUNAS[tabela] || {})[c.chave];
        return `<th class="${cls}"${desc ? ' data-desc="1"' : ''} onclick="ordenarTabela('${tabela}', '${c.chave}')"${dica(c.titulo, desc, '(clique para ordenar)')}>${escHtml(trocarAnos(c.titulo))}</th>`;
    }).join('') + '</tr>';
}

// Coluna Programa (só aparece com o cruzamento Órgão × Programa × Fonte; classe so-programa).
const COLUNA_PROGRAMA = { chave: 'programa', titulo: 'Programa', classe: 'so-programa', valor: x => rotuloPrograma(x.programa, x.nomePrograma || nomesProgramas[x.programa]),
    celula: x => `<td class="so-programa" style="font-size:11px; min-width:150px;">${escHtml(rotuloPrograma(x.programa, x.nomePrograma || nomesProgramas[x.programa]))}</td>` };

// Colunas de texto antes dos valores (para o colspan do TOTAL), contando a coluna Programa se visível.
function colsTexto(n) { return n + (cruzaPrograma ? 1 : 0); }

// ─── CONSOLIDADO ÓRGÃO × FONTE (grade) ──────────────────────────────────────
const COLUNAS_CONSOLIDADO = [
    { chave: 'fonte', titulo: 'Fonte do MAPP', valor: l => l.fonte, celula: l => `<td class="col-fonte">${escHtml(l.fonte)}</td>` },
    { chave: 'orgao', titulo: 'Órgão', valor: l => l.orgao, celula: l => `<td><strong>${escHtml(l.orgao)}</strong></td>` },
    COLUNA_PROGRAMA,
    { chave: 'situacao', titulo: 'Situação', valor: l => ROTULO_SITUACAO[l.situacao], ordem: l => ORDEM_SITUACAO[l.situacao],
      celula: l => `<td><span class="estudo-tag ${l.situacao === 'OK' ? 'tag-exata' : (l.situacao === 'SEM_LOA' ? 'tag-sem' : 'tag-prefixo')}">${ROTULO_SITUACAO[l.situacao]}</span></td>` },
    { chave: 'loa', titulo: 'LOA 2027', num: true, valor: l => l.temLOA ? l.loa : null,
      celula: l => `<td class="num"${dica(l.temLOA ? `LOA 2027 de ${l.orgao}${l.programa ? ' no programa ' + rotuloPrograma(l.programa, l.nomePrograma) : ''} na fonte = Σ sub fontes da LOA\n` +
          Object.keys(l.loaSubfonte).sort().map(sf => `  ${sf}: ${FT(l.loaSubfonte[sf])}`).join('\n') + `\n= ${FT(l.loa)}` : 'Sem LOA 2027 para o órgão nesta fonte')}>${l.temLOA ? F(l.loa) : '—'}</td>` },
    { chave: 'qtd', titulo: 'MAPPs', num: true, valor: l => l.qtd, celula: l => `<td class="num"${dica('MAPPs ativos (não expurgados) do órgão na fonte')}>${l.qtd || '—'}</td>` },
    { chave: 'p26', titulo: 'Programado 2026', num: true, valor: l => l.p26, dica: l => `Σ Programado 2026 dos ${l.qtd} MAPPs = ${FT(l.p26)}` },
    { chave: 'prevEmp', titulo: 'Prev. Empenho 2026', num: true, valor: l => l.prevEmp, dica: l => `Σ Prev. Empenho 2026 (regra por estágio) dos ${l.qtd} MAPPs = ${FT(l.prevEmp)}` },
    { chave: 'prevEmpAj', titulo: 'Prev. Empenho Ajustada', num: true, valor: l => l.prevEmpAj, dica: l => `Σ Prev. Empenho × (1 − % deliberado do grupo) dos ${l.qtd} MAPPs = ${FT(l.prevEmpAj)}` },
    { chave: 'nec', titulo: 'Nec. 2027 Calculada', num: true, valor: l => l.nec,
      dica: l => `Nec. 2027 Calculada = Σ Programado 2027 + (Σ Programado 2026 − Σ Prev. Empenho)\n= ${FT(l.p27)} + (${FT(l.p26)} − ${FT(l.prevEmp)}) = ${FT(l.nec)}` },
    { chave: 'necAj', titulo: 'Nec. 2027 Ajustada', num: true, valor: l => l.necAj,
      celula: l => `<td class="num"${dica(`Nec. 2027 Ajustada = Σ Programado 2027 + (Σ Programado 2026 − Σ Prev. Empenho Ajustada)\n= ${FT(l.p27)} + (${FT(l.p26)} − ${FT(l.prevEmpAj)}) = ${FT(l.necAj)}`)}><strong>${F(l.necAj)}</strong></td>` },
    { chave: 'pctLOA', titulo: 'Necessidade ÷ LOA', num: true, valor: l => l.pctLOA,
      celula: l => `<td class="num ${l.pctLOA !== null && l.pctLOA > 100 ? 'pct-alto' : ''}"${dica(l.pctLOA === null ? 'Sem LOA 2027: não há percentual' : `Necessidade ÷ LOA = Nec. 2027 Ajustada${l.filhos ? ' (dos programas com LOA)' : ''} ÷ LOA 2027 × 100\n= ${FT(l.filhos ? l.necAjComLOA : l.necAj)} ÷ ${FT(l.loa)} × 100 = ${fmtPct(l.pctLOA)}`)}>${fmtPct(l.pctLOA)}</td>` },
    { chave: 'saldo', titulo: 'Saldo (LOA − Nec. Aj.)', num: true, valor: l => l.saldo,
      celula: l => `<td class="num ${l.saldo !== null && l.saldo < 0 ? 'pct-alto' : ''}"${dica(l.saldo === null ? 'Sem LOA 2027: não há saldo' : `Saldo = LOA 2027 − Nec. 2027 Ajustada${l.filhos ? ' (dos programas com LOA)' : ''}\n= ${FT(l.loa)} − ${FT(l.filhos ? l.necAjComLOA : l.necAj)} = ${FT(l.saldo)}`)}>${l.saldo === null ? '—' : F(l.saldo)}</td>` },
    { chave: 'subfontes', titulo: 'Fontes da LOA', num: true, valor: l => l.subfontes ? l.subfontes.size : 0,
      celula: l => { let n = l.subfontes ? l.subfontes.size : 0;
          return `<td class="num"${dica(n ? textoComposicao(l.loaSubfonte) : 'Sem LOA')}>${n ? `${n} fonte${n > 1 ? 's' : ''}` : '—'}</td>`; } }
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
    atualizarFiltrosConsolidado();
    let fFonte = document.getElementById('filtro-cons-fonte').value;
    let fOrg = document.getElementById('filtro-cons-orgao').value;
    let fSit = document.getElementById('filtro-cons-situacao').value;
    let fTxt = N(document.getElementById('filtro-cons-texto').value);
    let fProg = cruzaPrograma ? document.getElementById('filtro-cons-programa').value : '';
    let linhas = linhasConsolidadoOrdenadas().filter(l =>
        (!fFonte || l.fonte === fFonte) && (!fOrg || N(l.orgao) === N(fOrg)) && (!fProg || l.programa === fProg) && (!fSit || l.situacao === fSit) && (!fTxt || N(l.orgao).includes(fTxt)));

    let tot = linhas.reduce((t, l) => {
        t.loa += l.loa; t.qtd += l.qtd; t.p26 += l.p26; t.p27 += l.p27; t.prevEmp += l.prevEmp; t.prevEmpAj += l.prevEmpAj; t.nec += l.nec; t.necAj += l.necAj;
        if (l.temLOA) { t.necAjComLOA += l.necAj; t.paresLOA++; }
        return t;
    }, { loa: 0, qtd: 0, p26: 0, p27: 0, prevEmp: 0, prevEmpAj: 0, nec: 0, necAj: 0, necAjComLOA: 0, paresLOA: 0 });
    let semLOA = linhas.filter(l => l.situacao === 'SEM_LOA');
    let necSemLOA = semLOA.reduce((s, l) => s + l.necAj, 0);
    let pctTot = tot.loa > 0 ? tot.necAjComLOA / tot.loa * 100 : null;
    let dNec = `Nec. 2027 Calculada = Σ Programado 2027 + (Σ Programado 2026 − Σ Prev. Empenho)\n= ${FT(tot.p27)} + (${FT(tot.p26)} − ${FT(tot.prevEmp)}) = ${FT(tot.nec)}`;
    let dNecAj = `Nec. 2027 Ajustada = Σ Programado 2027 + (Σ Programado 2026 − Σ Prev. Empenho Ajustada)\n= ${FT(tot.p27)} + (${FT(tot.p26)} − ${FT(tot.prevEmpAj)}) = ${FT(tot.necAj)}`;
    // Cobertura: quanto a necessidade dos MAPPs representa da LOA, só onde há LOA (os MAPPs sem LOA
    // ficam de fora para não inflar a conta). Acima de 100% = a LOA não cobre a necessidade.
    let dPct = pctTot === null ? 'Sem LOA no filtro' : `Necessidade ÷ LOA = Σ Nec. 2027 Ajustada dos MAPPs que têm LOA no par ÷ Σ LOA 2027 × 100\n` +
        `= ${FT(tot.necAjComLOA)} ÷ ${FT(tot.loa)} × 100 = ${fmtPct(pctTot)}\n` +
        (pctTot > 100 ? `A necessidade é ${(pctTot / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} vezes a LOA: faltam ${FT(tot.necAjComLOA - tot.loa)} para cobri-la.`
            : `A LOA cobre a necessidade e sobram ${FT(tot.loa - tot.necAjComLOA)}.`) +
        `\nMAPPs de pares sem LOA não entram (estão no card "Nec. Ajustada em MAPPs sem LOA").`;
    resumoEl.innerHTML = `
        <div${dica(`Σ LOA 2027 dos ${tot.paresLOA} pares Órgão × Fonte do filtro = ${FT(tot.loa)}`)}><span>LOA 2027 (filtro)</span><b>${F(tot.loa)}</b></div>
        <div${dica(dNec)}><span>Necessidade 2027 Calculada</span><b>${F(tot.nec)}</b></div>
        <div${dica(dNecAj)}><span>Necessidade 2027 Ajustada</span><b>${F(tot.necAj)}</b></div>
        <div${dica(dPct)}><span>Necessidade ÷ LOA (onde há LOA)</span><b class="${pctTot > 100 ? 'valor-estouro' : ''}">${fmtPct(pctTot)}</b><small style="color:var(--muted);">${pctTot === null ? '' : pctTot > 100
            ? `necessidade ${(pctTot / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}× a LOA — faltam ${abreviarValor(tot.necAjComLOA - tot.loa)}`
            : `a LOA cobre a necessidade — sobram ${abreviarValor(tot.loa - tot.necAjComLOA)}`}</small></div>
        <div${dica(`Σ Nec. 2027 Ajustada dos ${semLOA.length} pares Órgão × Fonte sem LOA 2027 = ${FT(necSemLOA)}`)}><span>Nec. Ajustada em MAPPs sem LOA</span><b>${F(necSemLOA)}</b></div>
        <div${dica(`Σ LOA das sub fontes sem Fonte do MAPP no De-para (aba 3): ${resumoForaCruzamento.paresForaCruzamento} pares = ${FT(resumoForaCruzamento.loaForaCruzamento)}`)}><span>LOA fora do cruzamento (sub fonte sem fonte)</span><b>${F(resumoForaCruzamento.loaForaCruzamento)}</b><small style="color:var(--muted);">${resumoForaCruzamento.paresForaCruzamento} pares — ver De-para</small></div>`;
    trocarAnosRotulos(resumoEl);

    if (linhas.length === 0) { cont.innerHTML = '<p class="estudo-nota" style="padding:12px;">Nenhuma linha para os filtros.</p>'; return; }
    // Os MAPPs abrem DENTRO da grade, na linha de baixo (não mexe nos filtros nem na grade de MAPPs).
    let mappsPorPar = {};
    mappsCalculados.forEach(m => { if (!m.expurgado) (mappsPorPar[chavePar(m.orgao, programaDoPar(m), m.fonte)] = mappsPorPar[chavePar(m.orgao, programaDoPar(m), m.fonte)] || []).push(m); });
    let nCols = COLUNAS_CONSOLIDADO.length - (cruzaPrograma ? 0 : 1);
    let seta = aberto => `<span class="seta-grupo">${aberto ? '▾' : '▸'}</span>`;
    // Linha de um par (órgão [× programa] × fonte): o clique abre/fecha os MAPPs dele.
    let linhaPar = (l, filha) => {
        let k = chavePar(l.orgao, l.programa, l.fonte);
        let aberto = expandidosConsPar.has(k);
        let mapps = mappsPorPar[k] || [];
        let cel = c => {
            if (filha && (c.chave === 'fonte' || c.chave === 'orgao')) return '<td></td>';
            let td = c.celula ? c.celula(l) : tdNum(c.valor(l), c.dica ? c.dica(l) : '');
            // A seta vai na 1ª coluna de texto da linha: Programa (filha) ou Fonte (sem programa).
            if (mapps.length && ((filha && c.chave === 'programa') || (!cruzaPrograma && c.chave === 'fonte'))) td = td.replace(/^(<td[^>]*>)/, `$1${seta(aberto)} `);
            return td;
        };
        let h = `<tr class="${mapps.length ? 'linha-clicavel ' : ''}${filha ? 'linha-filha' : ''}" data-par="${escHtml(k)}"${mapps.length ? ` onclick="alternarParConsolidado(this.dataset.par)" title="${aberto ? 'Recolher' : `Ver os ${mapps.length} MAPP(s)`}"` : ''}>` +
            COLUNAS_CONSOLIDADO.map(cel).join('') + '</tr>';
        if (aberto && mapps.length) h += `<tr class="linha-mapps"><td colspan="${nCols}">${subtabelaMappsConsolidado(mapps)}</td></tr>`;
        return h;
    };
    let h = `<table><thead>${cabecalhoOrdenavel('cons', COLUNAS_CONSOLIDADO)}</thead><tbody>`;
    let rotuloTotal;
    if (!cruzaPrograma) {
        linhas.forEach(l => { h += linhaPar(l, false); });
        rotuloTotal = `${linhas.length} linhas`;
    } else {
        // Com programa: uma linha por Órgão × Fonte (total); o clique abre os programas e cada programa abre os MAPPs.
        let grupos = gruposConsolidado(linhas);
        grupos.forEach(g => {
            let aberto = expandidosCons.has(g.chave);
            let celProg = `<td class="so-programa" style="white-space:nowrap;">${seta(aberto)} ${g.filhos.length} programa(s)</td>`;
            h += `<tr class="linha-clicavel linha-grupo" data-chave="${escHtml(g.chave)}" onclick="alternarGrupoConsolidado(this.dataset.chave)" title="${aberto ? 'Recolher' : 'Ver a distribuição nos programas'}">` +
                COLUNAS_CONSOLIDADO.map(c => c.chave === 'programa' ? celProg : (c.celula ? c.celula(g) : tdNum(c.valor(g), c.dica ? c.dica(g) : ''))).join('') + '</tr>';
            if (aberto) {
                // Composição da LOA da linha (várias fontes da LOA podem formar a mesma Fonte do MAPP).
                let comp = Object.keys(g.loaSubfonte).filter(s => Math.abs(g.loaSubfonte[s]) >= 0.5).sort((a, b) => g.loaSubfonte[b] - g.loaSubfonte[a]);
                if (comp.length) h += `<tr class="linha-composicao"><td colspan="${nCols}">Composição da LOA: ` +
                    comp.map(s => `<span class="estudo-tag tag-prefixo"${dica(descricaoFonteLOA(s))}>${escHtml(s)} · ${F(g.loaSubfonte[s])}</span>`).join(' ') + '</td></tr>';
                g.filhos.forEach(l => { h += linhaPar(l, true); });
            }
        });
        rotuloTotal = `${grupos.length} órgão × fonte · ${linhas.length} pares com programa`;
    }
    h += `</tbody><tfoot><tr><td colspan="${colsTexto(3)}">TOTAL (${rotuloTotal})</td>
        ${tdNum(tot.loa, `Σ LOA 2027 das ${linhas.length} linhas = ${FT(tot.loa)}`)}<td class="num"${dica('Σ MAPPs ativos das linhas')}>${tot.qtd}</td>${tdNum(tot.p26, `Σ Programado 2026 = ${FT(tot.p26)}`)}
        ${tdNum(tot.prevEmp, `Σ Prev. Empenho 2026 = ${FT(tot.prevEmp)}`)}${tdNum(tot.prevEmpAj, `Σ Prev. Empenho Ajustada = ${FT(tot.prevEmpAj)}`)}${tdNum(tot.nec, dNec)}${tdNum(tot.necAj, dNecAj)}
        <td class="num"${dica(dPct)}>${fmtPct(pctTot)}</td><td class="num">—</td><td></td></tr></tfoot></table>`;
    cont.innerHTML = h;
}

// Agrupa os pares Órgão × Programa × Fonte em Órgão × Fonte. A ordenação da grade vale para os
// grupos (pelo total) e para os programas dentro de cada grupo; sem ordenação, situação → fonte → LOA.
let expandidosCons = new Set();

function gruposConsolidado(linhas) {
    let mapa = {};
    linhas.forEach(l => {
        let k = N(l.orgao) + '||' + l.fonte;
        let g = mapa[k] || (mapa[k] = { chave: k, orgao: l.orgao, fonte: l.fonte, programa: '', nomePrograma: '', filhos: [], loa: 0, temLOA: false, qtd: 0,
            p26: 0, p27: 0, prevEmp: 0, prevEmpAj: 0, nec: 0, necAj: 0, necAjComLOA: 0, subfontes: new Set(), loaSubfonte: {} });
        g.filhos.push(l);
        ['loa', 'qtd', 'p26', 'p27', 'prevEmp', 'prevEmpAj', 'nec', 'necAj'].forEach(c => { g[c] += l[c]; });
        if (l.temLOA) { g.temLOA = true; g.necAjComLOA += l.necAj; }
        l.subfontes.forEach(s => g.subfontes.add(s));
        for (let s in l.loaSubfonte) g.loaSubfonte[s] = (g.loaSubfonte[s] || 0) + l.loaSubfonte[s];
    });
    let grupos = Object.values(mapa).map(g => Object.assign(g, {
        situacao: g.temLOA && g.qtd > 0 ? 'OK' : (g.temLOA ? 'SEM_MAPP' : 'SEM_LOA'),
        subfontesTxt: Array.from(g.subfontes).sort().join(', '),
        pctLOA: g.loa > 0 ? g.necAjComLOA / g.loa * 100 : null,
        saldo: g.temLOA ? g.loa - g.necAjComLOA : null
    }));
    if (ordemTabelas.cons.chave) return ordenarLinhas(grupos, COLUNAS_CONSOLIDADO, ordemTabelas.cons);
    return grupos.sort((a, b) => (ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao]) || a.fonte.localeCompare(b.fonte) || (b.loa - a.loa) || a.orgao.localeCompare(b.orgao));
}

function alternarGrupoConsolidado(chave) {
    if (expandidosCons.has(chave)) expandidosCons.delete(chave); else expandidosCons.add(chave);
    renderizarConsolidado();
}

// Pares (órgão [× programa] × fonte) com os MAPPs abertos na própria grade.
let expandidosConsPar = new Set();

function alternarParConsolidado(chave) {
    if (expandidosConsPar.has(chave)) expandidosConsPar.delete(chave); else expandidosConsPar.add(chave);
    renderizarConsolidado();
}

const COLUNAS_SUB_MAPPS = ['mapp', 'estagio', 'grupo', 'p26', 'prevEmp', 'prevEmpAj', 'p27', 'necAj', 'regra'];
const LIMITE_SUB_MAPPS = 200;

// Subtabela dos MAPPs de um par (mesmas células e dicas da grade "MAPPs — regra aplicada").
function subtabelaMappsConsolidado(mapps) {
    let cols = COLUNAS_SUB_MAPPS.map(k => COLUNAS_DETALHE.find(c => c.chave === k));
    let ordenados = mapps.slice().sort((a, b) => b.necAj - a.necAj);
    let h = `<table class="subtabela-mapps"><thead><tr>` +
        cols.map(c => thDesc(c.titulo, DESC_COLUNAS.det[c.chave], c.num ? 'num' : '')).join('') + '</tr></thead><tbody>';
    ordenados.slice(0, LIMITE_SUB_MAPPS).forEach(m => {
        h += '<tr>' + cols.map(c => c.celula ? c.celula(m) : tdNum(c.valor(m), c.dica ? c.dica(m) : '')).join('') + '</tr>';
    });
    let t = mapps.reduce((s, m) => { ['p26', 'prevEmp', 'prevEmpAj', 'p27', 'necAj'].forEach(k => s[k] += m[k]); return s; }, { p26: 0, prevEmp: 0, prevEmpAj: 0, p27: 0, necAj: 0 });
    h += `</tbody><tfoot><tr><td colspan="3">${mapps.length} MAPP(s)${mapps.length > LIMITE_SUB_MAPPS ? ` — exibindo os ${LIMITE_SUB_MAPPS} de maior necessidade` : ''}</td>` +
        ['p26', 'prevEmp', 'prevEmpAj', 'p27', 'necAj'].map(k => tdNum(t[k], `Σ ${COLUNAS_DETALHE.find(c => c.chave === k).titulo} = ${FT(t[k])}`)).join('') + '<td></td></tr></tfoot></table>';
    return h;
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

// ─── FILTROS LIGADOS (facetados) ────────────────────────────────────────────
// Cada lista mostra só os valores que existem nas linhas que atendem a TODOS os
// outros filtros da aba (Fonte → só os órgãos com aquela fonte no MAPP ou na LOA,
// e vice-versa; idem Situação e Estágio). O valor escolhido nunca some da lista.
function atualizarFiltros() {
    atualizarFiltrosConsolidado();
    atualizarFiltrosAjustes();
}

// filtros: { campo: casa(u) | null }; null = filtro vazio (não restringe).
function valoresLigados(universo, filtros, campo, extras) {
    let outros = Object.keys(filtros).filter(k => k !== campo && filtros[k]);
    let valores = new Map();
    universo.forEach(u => {
        if (!outros.every(k => filtros[k](u)) || (extras && !extras(u))) return;
        let v = u[campo];
        if (v === null || v === undefined || v === '') return;
        let k = campo === 'orgao' ? N(v) : v;
        if (!valores.has(k)) valores.set(k, v);
    });
    return valores;
}

function preencherSelectLigado(id, valores, rotuloTodos, rotulo) {
    let sel = document.getElementById(id);
    if (!sel) return;
    let atual = sel.value;
    let lista = Array.from(valores.values());
    if (atual && !lista.includes(atual)) lista.push(atual);
    lista.sort((a, b) => String(rotulo ? rotulo(a) : a).localeCompare(String(rotulo ? rotulo(b) : b), 'pt-BR', { numeric: true }));
    sel.innerHTML = `<option value="">${rotuloTodos}</option>` +
        lista.map(v => `<option value="${escHtml(v)}">${escHtml(rotulo ? rotulo(v) : v)}</option>`).join('');
    sel.value = atual;
}

// Aba 4: MAPPs (com estágio) + pares só com LOA (sem estágio).
function atualizarFiltrosConsolidado() {
    let val = id => (document.getElementById(id) || {}).value || '';
    let fFonte = val('filtro-cons-fonte'), fOrg = val('filtro-cons-orgao'), fSit = val('filtro-cons-situacao'), fEst = val('filtro-det-estagio');
    let fProg = cruzaPrograma ? val('filtro-cons-programa') : '';
    let fBuscaOrg = N(val('filtro-cons-texto')), fTxt = N(val('filtro-det-texto'));
    let fExp = !!(document.getElementById('filtro-det-expurgo') || {}).checked;
    let universo = [];
    mappsCalculados.forEach(m => {
        if (m.expurgado && !fExp) return;
        let programa = programaDoPar(m);
        universo.push({ fonte: m.fonte, orgao: m.orgao, programa, situacao: situacaoPorPar[chavePar(m.orgao, programa, m.fonte)], estagio: m.estagio, texto: N(m.mapp) + ' ' + N(m.regra) });
    });
    consolidadoAtual.forEach(c => { if (c.situacao === 'SEM_MAPP') universo.push({ fonte: c.fonte, orgao: c.orgao, programa: c.programa, situacao: c.situacao, estagio: null, texto: null }); });
    let filtros = {
        fonte: fFonte ? u => u.fonte === fFonte : null,
        orgao: fOrg ? u => N(u.orgao) === N(fOrg) : null,
        programa: fProg ? u => u.programa === fProg : null,
        situacao: fSit ? u => u.situacao === fSit : null,
        estagio: fEst ? u => u.estagio === fEst : null
    };
    let extras = (fBuscaOrg || fTxt) ? u => (!fBuscaOrg || N(u.orgao).includes(fBuscaOrg)) && (!fTxt || (u.texto !== null && u.texto.includes(fTxt))) : null;
    preencherSelectLigado('filtro-cons-fonte', valoresLigados(universo, filtros, 'fonte', extras), '(todas)');
    preencherSelectLigado('filtro-cons-orgao', valoresLigados(universo, filtros, 'orgao', extras), '(todos)');
    if (cruzaPrograma) preencherSelectLigado('filtro-cons-programa', valoresLigados(universo, filtros, 'programa', extras), '(todos)', v => rotuloPrograma(v, nomesProgramas[v]));
    preencherSelectLigado('filtro-cons-situacao', valoresLigados(universo, filtros, 'situacao', extras), '(todas)', v => ROTULO_SITUACAO[v] || v);
    preencherSelectLigado('filtro-det-estagio', valoresLigados(universo, filtros, 'estagio', extras), '(todos)');
}

// Aba 5: MAPPs ativos + pares com LOA.
function atualizarFiltrosAjustes() {
    let val = id => (document.getElementById(id) || {}).value || '';
    let fFonte = val('filtro-aj-fonte'), fOrg = val('filtro-aj-orgao'), fTxt = N(val('filtro-aj-texto'));
    let fProg = cruzaPrograma ? val('filtro-aj-programa') : '';
    let universo = linhasAjustes.map(l => ({ fonte: l.fonte, orgao: l.orgao, programa: l.programa, texto: N(l.mapp) }));
    consolidadoAtual.forEach(c => { if (c.temLOA) universo.push({ fonte: c.fonte, orgao: c.orgao, programa: c.programa, texto: null }); });
    let filtros = { fonte: fFonte ? u => u.fonte === fFonte : null, orgao: fOrg ? u => N(u.orgao) === N(fOrg) : null,
        programa: fProg ? u => u.programa === fProg : null };
    let extras = fTxt ? u => u.texto !== null && u.texto.includes(fTxt) : null;
    preencherSelectLigado('filtro-aj-fonte', valoresLigados(universo, filtros, 'fonte', extras), '(todas)');
    preencherSelectLigado('filtro-aj-orgao', valoresLigados(universo, filtros, 'orgao', extras), '(todos)');
    if (cruzaPrograma) preencherSelectLigado('filtro-aj-programa', valoresLigados(universo, filtros, 'programa', extras), '(todos)', v => rotuloPrograma(v, nomesProgramas[v]));
}

// Resumo por grupo do Valor Deliberado (mesmas colunas-base da tabela do Redutor no SIPOG).
function renderizarGrupos() {
    let cont = document.getElementById('tabela-grupos');
    if (!cont) return;
    let ativos = mappsCalculados.filter(m => !m.expurgado);
    if (ativos.length === 0) { cont.innerHTML = '<p class="estudo-nota" style="padding:12px;">Carregue a base de MAPPs.</p>'; return; }
    let prm = lerParametrosEstudo();
    let tot = { qtd: 0, p26: 0, prevEmp: 0, prevEmpAj: 0, nec: 0, necAj: 0, p27: 0 };
    let celulas = (s, qtd, rotulo) => [
        tdNum(s.p26, `Σ Programado 2026 dos ${qtd} MAPPs ativos ${rotulo} = ${FT(s.p26)}`),
        tdNum(s.prevEmp, `Σ Prev. Empenho 2026 (regra por estágio, aba 4) dos ${qtd} MAPPs ${rotulo} = ${FT(s.prevEmp)}`),
        tdNum(s.nec, `Nec. 2027 Calculada = Σ Programado 2027 + (Σ Programado 2026 − Σ Prev. Empenho)\n= ${FT(s.p27)} + (${FT(s.p26)} − ${FT(s.prevEmp)}) = ${FT(s.nec)}`),
        `<td class="num"${dica(`Nec. 2027 Ajustada = Σ Programado 2027 + (Σ Programado 2026 − Σ Prev. Empenho Ajustada)\n= ${FT(s.p27)} + (${FT(s.p26)} − ${FT(s.prevEmpAj)}) = ${FT(s.necAj)}`)}><strong>${F(s.necAj)}</strong></td>`
    ];
    let h = `<table><thead><tr>${thDesc('Grupo', 'Grupo de projetos do Valor Deliberado (mesmos grupos do Redutor do SIPOG).')}
        ${thDesc('MAPPs', 'MAPPs ativos (não expurgados) do grupo.', 'num')}${thDesc('Programado 2026', 'Σ Programado 2026 dos MAPPs do grupo.', 'num')}
        ${thDesc('Prev. Empenho 2026', 'Σ Previsão de Empenho 2026 pela regra por estágio/grupo.', 'num')}${thDesc('% deliberado', 'Percentual do Valor Deliberado do grupo (campo acima).', 'num')}
        ${thDesc('Prev. Empenho Ajustada', 'Σ Prev. Empenho × (1 − % deliberado), na fonte escolhida ou em todas.', 'num')}
        ${thDesc('Nec. 2027 Calculada', 'Σ Programado 2027 + (Σ Programado 2026 − Σ Prev. Empenho).', 'num')}
        ${thDesc('Nec. 2027 Ajustada', 'Σ Programado 2027 + (Σ Programado 2026 − Σ Prev. Empenho Ajustada).', 'num')}</tr></thead><tbody>`;
    GRUPOS_VD_ESTUDO.forEach(g => {
        let doGrupo = ativos.filter(m => m.classe === g.classe);
        let s = doGrupo.reduce((t, m) => { t.p26 += m.p26; t.prevEmp += m.prevEmp; t.prevEmpAj += m.prevEmpAj; t.nec += m.nec; t.necAj += m.necAj; t.p27 += m.p27; return t; },
            { p26: 0, prevEmp: 0, prevEmpAj: 0, nec: 0, necAj: 0, p27: 0 });
        tot.qtd += doGrupo.length; for (let k in s) tot[k] += s[k];
        let pct = prm.vd[g.classe] * 100;
        let c = celulas(s, doGrupo.length, 'do grupo');
        h += `<tr><td>${escHtml(g.label)}</td><td class="num"${dica(`MAPPs ativos (não expurgados) do grupo ${g.label}`)}>${doGrupo.length.toLocaleString('pt-BR')}</td>${c[0]}
            ${c[1]}<td class="num"${dica(`Valor Deliberado do grupo (parâmetro acima)${prm.vdFonte ? ', só na fonte ' + prm.vdFonte : ', em todas as fontes'}`)}>${fmtPct(pct)}</td>
            ${tdNum(s.prevEmpAj, `Prev. Empenho Ajustada = Σ Prev. Empenho × (1 − ${fmtPct(pct)})${prm.vdFonte ? ' nos MAPPs da fonte ' + prm.vdFonte + ' (demais sem redução)' : ''}\n= ${FT(s.prevEmpAj)}`)}
            ${c[2]}${c[3]}</tr>`;
    });
    let ct = celulas(tot, tot.qtd, 'de todos os grupos');
    h += `</tbody><tfoot><tr><td>TOTAL${prm.vdFonte ? ' — % aplicado só em ' + escHtml(prm.vdFonte) : ''}</td><td class="num"${dica('Σ MAPPs ativos dos grupos')}>${tot.qtd.toLocaleString('pt-BR')}</td>
        ${ct[0]}${ct[1]}<td></td>${tdNum(tot.prevEmpAj, `Σ Prev. Empenho Ajustada dos grupos = ${FT(tot.prevEmpAj)}`)}
        ${ct[2]}${ct[3]}</tr></tfoot></table>`;
    cont.innerHTML = h;
}

const COLUNAS_DETALHE = [
    { chave: 'mapp', titulo: 'MAPP', valor: m => m.mapp,
      celula: m => `<td class="col-mapp" title="${escHtml(m.mapp)}"><span>${escHtml(m.mapp)}</span></td>` },
    { chave: 'orgao', titulo: 'Órgão', valor: m => m.orgao, celula: m => `<td>${escHtml(m.orgao)}</td>` },
    COLUNA_PROGRAMA,
    { chave: 'fonte', titulo: 'Fonte', valor: m => m.fonte, celula: m => `<td class="col-fonte" style="font-size:11px;">${escHtml(m.fonte)}</td>` },
    { chave: 'estagio', titulo: 'Estágio', valor: m => m.estagio, celula: m => `<td style="font-size:11px;">${escHtml(m.estagio)}</td>` },
    { chave: 'grupo', titulo: 'Grupo', valor: m => rotuloGrupo(m.classe), celula: m => `<td style="font-size:11px;">${escHtml(rotuloGrupo(m.classe))}</td>` },
    { chave: 'p26', titulo: 'Programado 2026', num: true, valor: m => m.p26, dica: () => 'Valor da base de MAPPs (Programado 2026)' },
    { chave: 'l26', titulo: 'Limite 2026', num: true, valor: m => m.l26, dica: () => 'Valor da base de MAPPs (Limite 2026)' },
    { chave: 'e26', titulo: 'Empenhado 2026', num: true, valor: m => m.e26, dica: () => 'Valor da base de MAPPs (Empenhado 2026)' },
    { chave: 'regra', titulo: 'Regra aplicada', valor: m => m.regra, celula: m => `<td class="col-regra">${escHtml(trocarAnos(m.regra))}</td>` },
    { chave: 'prevEmp', titulo: 'Prev. Empenho 2026', num: true, valor: m => m.prevEmp, dica: explicarPrevEmp },
    { chave: 'trf', titulo: 'TRF 2026', num: true, valor: m => m.trf,
      dica: m => m.expurgado ? explicarPrevEmp(m) : `TRF 2026 = Programado 2026 − Prev. Empenho 2026\n= ${FT(m.p26)} − ${FT(m.prevEmp)} = ${FT(m.trf)}` },
    { chave: 'p27', titulo: 'Programado 2027', num: true, valor: m => m.p27, dica: () => 'Valor da base de MAPPs (Programado 2027)' },
    { chave: 'nec', titulo: 'Nec. 2027 Calculada', num: true, valor: m => m.nec,
      dica: m => m.expurgado ? explicarPrevEmp(m) : `Nec. 2027 Calculada = Programado 2027 + TRF 2026\n= ${FT(m.p27)} + ${FT(m.trf)} = ${FT(m.nec)}` },
    { chave: 'pctDel', titulo: '% deliberado', num: true, valor: m => m.pctDeliberado,
      celula: m => `<td class="num"${dica('Valor Deliberado do grupo do MAPP (aba 2), se aplicado na fonte dele')}>${m.pctDeliberado > 0 ? fmtPct(m.pctDeliberado) : '—'}</td>` },
    { chave: 'prevEmpAj', titulo: 'Prev. Empenho Ajustada', num: true, valor: m => m.prevEmpAj,
      dica: m => m.expurgado ? explicarPrevEmp(m) : `Prev. Empenho Ajustada = Prev. Empenho 2026 × (1 − % deliberado)\n= ${FT(m.prevEmp)} × (1 − ${fmtPct(m.pctDeliberado || 0)}) = ${FT(m.prevEmpAj)}` },
    { chave: 'necAj', titulo: 'Nec. 2027 Ajustada', num: true, valor: m => m.necAj,
      celula: m => `<td class="num"${dica(m.expurgado ? explicarPrevEmp(m) : explicarNecAj(m))}><strong>${F(m.necAj)}</strong></td>` }
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
    let fProg = cruzaPrograma ? document.getElementById('filtro-cons-programa').value : '';
    let linhas = linhasDetalheOrdenadas().filter(m =>
        (fExp || !m.expurgado) && (!fOrg || N(m.orgao) === N(fOrg)) && (!fFon || m.fonte === fFon) && (!fEst || m.estagio === fEst) &&
        (!fProg || programaDoPar(m) === fProg) &&
        (!fSit || situacaoPorPar[chavePar(m.orgao, programaDoPar(m), m.fonte)] === fSit) && (!fBuscaOrgaoCard4 || N(m.orgao).includes(fBuscaOrgaoCard4)) &&
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
            COLUNAS_DETALHE.map(c => c.celula ? c.celula(m) : tdNum(c.valor(m), c.dica ? c.dica(m) : '')).join('') + '</tr>';
    });
    let aviso = linhas.length > exibidas.length ? ` — exibindo ${exibidas.length}; use os filtros ou exporte o XLSX para ver todas` : '';
    let notaExpurgo = qtdExpurgadosExibidos ? `; ${qtdExpurgadosExibidos.toLocaleString('pt-BR')} expurgado(s) exibido(s), fora do total` : '';
    h += `</tbody><tfoot><tr><td colspan="${colsTexto(5)}">TOTAL (${ativosExibidos.length.toLocaleString('pt-BR')} MAPPs${notaExpurgo}${aviso})</td>
        ${tdNum(tot.p26, `Σ Programado 2026 dos MAPPs ativos = ${FT(tot.p26)}`)}${tdNum(tot.l26, `Σ Limite 2026 = ${FT(tot.l26)}`)}${tdNum(tot.e26, `Σ Empenhado 2026 = ${FT(tot.e26)}`)}<td></td>
        ${tdNum(tot.prevEmp, `Σ Prev. Empenho 2026 = ${FT(tot.prevEmp)}`)}${tdNum(tot.trf, `Σ TRF 2026 = Σ Programado 2026 − Σ Prev. Empenho\n= ${FT(tot.p26)} − ${FT(tot.prevEmp)} = ${FT(tot.trf)}`)}
        ${tdNum(tot.p27, `Σ Programado 2027 = ${FT(tot.p27)}`)}${tdNum(tot.nec, `Σ Nec. 2027 Calculada = Σ Programado 2027 + Σ TRF\n= ${FT(tot.p27)} + ${FT(tot.trf)} = ${FT(tot.nec)}`)}
        <td></td>${tdNum(tot.prevEmpAj, `Σ Prev. Empenho Ajustada = ${FT(tot.prevEmpAj)}`)}${tdNum(tot.necAj, `Σ Nec. 2027 Ajustada = Σ Programado 2027 + (Σ Programado 2026 − Σ Prev. Empenho Ajustada)\n= ${FT(tot.p27)} + (${FT(tot.p26)} − ${FT(tot.prevEmpAj)}) = ${FT(tot.necAj)}`)}</tr></tfoot></table>`;
    cont.innerHTML = h;
}

// ─── ABA 4: FILTRO ÚNICO DA PÁGINA ──────────────────────────────────────────
function limparFiltrosConsolidado() {
    ['filtro-cons-fonte', 'filtro-cons-orgao', 'filtro-cons-programa', 'filtro-cons-situacao', 'filtro-det-estagio', 'filtro-cons-texto', 'filtro-det-texto']
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
    if (aba === 'naoalocada' && naoAlocadaSuja) renderizarNaoAlocada();
    window.scrollTo({ top: 0 });
}

// ─── ORQUESTRAÇÃO ───────────────────────────────────────────────────────────
function recalcularEstudo() {
    // A lista de fontes do Valor Deliberado precisa estar pronta antes de ler os parâmetros.
    preencherSelect('vd-fonte', fontesSIPOGDisponiveis(), '(todas as fontes)');
    aplicarRecorteLOA();
    let prm = lerParametrosEstudo();
    let siglasFora = siglasForaDoExecutivo();
    mappsCalculados = mappsBrutos.map(r => {
        let m = expurgarMAPPForaDoExecutivo(
            aplicarValorDeliberadoEstudo(calcularPrevisaoEmpenhoEstudo(r, prm.pcts, prm.limiar, prm.opcoes), prm.vd, prm.vdFonte), siglasFora);
        let p = programaDoTexto(r.PROGRAMA);
        m.programa = p.cod;
        m.nomePrograma = p.nome;
        return m;
    });
    // Órgão × Programa × Fonte só com a LOA do PLOA por ação e MAPPs com programa.
    cruzaPrograma = loaConferencia.origem === 'ploa' && mappsCalculados.some(m => !m.expurgado && m.programa);
    document.body.classList.toggle('cruza-programa', cruzaPrograma);
    nomesProgramas = {};
    loaLinhas.forEach(l => { if (l.programa) nomesProgramas[l.programa] = l.nomePrograma; });
    mappsCalculados.forEach(m => { if (m.programa && !nomesProgramas[m.programa]) nomesProgramas[m.programa] = m.nomePrograma; });
    let statusFora = document.getElementById('status-mapps-expurgo');
    if (statusFora) {
        let fora = mappsCalculados.filter(m => /FORA DO EXECUTIVO/.test(m.regra));
        statusFora.innerHTML = !mappsBrutos.length ? '' : fora.length
            ? `<span class="aviso">Expurgados (fora do Executivo): ${fora.length} MAPP(s) — ${escHtml([...new Set(fora.map(m => m.orgao))].join(', '))}</span>`
            : 'Nenhum MAPP de AL, TCE, TJ ou MP (e vinculados) na base.';
    }
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
    consolidadoAtual.forEach(l => { if (l.temLOA) loaPar[chavePar(l.orgao, l.programa, l.fonte)] = l.loa; });
    let somaNecPar = {}, ocorrencias = {};
    linhasAjustes = mappsCalculados.filter(m => !m.expurgado).map(m => {
        let base = N(m.mapp) + '||' + m.fonte + '||' + N(m.orgao);
        ocorrencias[base] = (ocorrencias[base] || 0) + 1;
        let programa = programaDoPar(m);
        let par = chavePar(m.orgao, programa, m.fonte);
        let peso = Math.max(m.necAj || 0, 0);
        somaNecPar[par] = (somaNecPar[par] || 0) + peso;
        return { chave: base + '#' + ocorrencias[base], par, peso, mapp: m.mapp, orgao: m.orgao, programa, nomePrograma: m.nomePrograma, fonte: m.fonte, estagio: m.estagio,
            classe: m.classe, necAj: m.necAj, p26: m.p26, p27: m.p27, prevEmpAj: m.prevEmpAj, loaPar: loaPar[par] !== undefined ? loaPar[par] : null };
    });
    // Proporcional à Necessidade Ajustada e nunca acima dela: se a LOA do par passa da soma
    // das necessidades, cada MAPP fica com a própria necessidade e o resto é "LOA sem destino".
    // Grade 1 = MAPPs com necessidade; grade 2 = sem necessidade (proposta só manual).
    linhasAjustes.forEach(l => {
        let soma = somaNecPar[l.par] || 0;
        l.somaPar = soma;
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
        programa: cruzaPrograma ? ((document.getElementById('filtro-aj-programa') || {}).value || '') : '',
        texto: N((document.getElementById('filtro-aj-texto') || {}).value || ''),
        soEditados: !!(document.getElementById('filtro-aj-editados') || {}).checked
    };
}

// Fontes: LOA (pares do filtro) × soma das propostas, apurado par a par (Órgão × [Programa ×] Fonte):
//   estouro    = Proposta acima da LOA do par;
//   distribuível = sobra que cabe nos MAPPs não editados até a Nec. Ajustada deles ("Distribuir");
//   sem destino = sobra que não cabe (par sem MAPP com necessidade, ou LOA além da necessidade):
//                 só a grade de MAPPs sem necessidade pode recebê-la, à mão.
function noFiltroAjustes(f, x) {
    return (!f.fonte || x.fonte === f.fonte) && (!f.orgao || N(x.orgao) === N(f.orgao)) && (!f.programa || x.programa === f.programa);
}

function montarAlertasFontes(f) {
    let pares = {};
    let obterPar = x => {
        let k = chavePar(x.orgao, x.programa, x.fonte);
        return pares[k] || (pares[k] = { fonte: x.fonte, loa: 0, proposta: 0, folga: 0, qtd: 0, editados: 0, loaSubfonte: {} });
    };
    consolidadoAtual.forEach(c => {
        if (!c.temLOA || !noFiltroAjustes(f, c)) return;
        let p = obterPar(c);
        p.loa += c.loa;
        somarComposicao(p.loaSubfonte, c.loaSubfonte);
    });
    linhasAjustes.forEach(l => {
        if (!noFiltroAjustes(f, l)) return;
        let p = obterPar(l), prop = propostaDe(l), man = propostasManuais[l.chave];
        p.proposta += prop;
        p.qtd++;
        if (man) p.editados++;
        if (l.grade === 1 && (!man || man.origem === 'redistribuicao')) p.folga += Math.max(l.necAj - prop, 0);
    });
    let porFonte = {};
    Object.values(pares).forEach(p => {
        let a = porFonte[p.fonte] || (porFonte[p.fonte] = { fonte: p.fonte, loa: 0, proposta: 0, estouro: 0, sobraDistribuivel: 0, semDestino: 0, qtd: 0, editados: 0, loaSubfonte: {} });
        let dif = p.loa - p.proposta;
        a.loa += p.loa; a.proposta += p.proposta; a.qtd += p.qtd; a.editados += p.editados;
        somarComposicao(a.loaSubfonte, p.loaSubfonte);
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
    linhasAjustes.filter(l => l.fonte === fonte && l.loaPar !== null && noFiltroAjustes(Object.assign({}, f, { fonte }), l))
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

function celulaDiferenca(dif, titulo) {
    if (Math.abs(dif) < TOLERANCIA_ALERTA) return `<td class="num"${dica(titulo)}>—</td>`;
    return `<td class="num ${dif > 0 ? 'valor-sobra' : 'valor-estouro'}"${dica(titulo)}>${dif > 0 ? '+' : '−'}${F(Math.abs(dif))}</td>`;
}

// Proposta de um MAPP: a conta da distribuição automática e, se houver, o valor editado.
function explicarProposta(l) {
    let man = propostasManuais[l.chave];
    let auto = l.grade === 2
        ? 'Automática = R$ 0,00 (MAPP sem Nec. 2027 Ajustada: proposta só manual)'
        : (l.loaPar > 0
            ? `Automática = Nec. Ajustada × mín(1, LOA do par ÷ Σ Nec. Ajustada do par)\n= ${FT(l.necAj)} × mín(1, ${FT(l.loaPar)} ÷ ${FT(l.somaPar)}) = ${FT(l.auto)}`
            : 'Automática = R$ 0,00 (órgão sem LOA 2027 nesta fonte)');
    let linhas = [auto];
    if (man) linhas.push(`${man.origem === 'redistribuicao' ? 'Redistribuída (Distribuir)' : 'Editada'}: ${FT(man.valor)}`);
    if (propostaExcede(l)) linhas.push(`⚠ Acima da Nec. 2027 Ajustada (${FT(l.necAj)}) em ${FT(propostaDe(l) - l.necAj)}`);
    return linhas.join('\n');
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
        aviso.innerHTML = trocarAnos(avisos.join('<br>'));
    }

    // Selo do menu: fontes divergentes no total (sem filtro).
    let todas = montarAlertasFontes({ fonte: '', orgao: '' });
    let badge = document.getElementById('badge-ajustes');
    let qtdDiv = todas.filter(a => a.status === 'estouro' || a.status === 'sobra').length;
    if (badge) badge.textContent = qtdDiv ? `${qtdDiv} a resolver` : '';

    if (!loaLinhas.length || !mappsCalculados.length) {
        let msg = '<p class="estudo-nota" style="padding:12px;">Carregue a LOA e a base de MAPPs.</p>';
        contA.innerHTML = msg; contO.innerHTML = msg; contM.innerHTML = msg; contM2.innerHTML = msg; resumo.innerHTML = '';
        let bloco = document.getElementById('bloco-ajustes-orgaos');
        if (bloco) bloco.style.display = '';
        return;
    }
    atualizarFiltrosAjustes();
    let f = filtrosAjustes();
    let alertas = montarAlertasFontes(f);
    let divergentes = alertas.filter(a => a.status !== 'ok');

    // Linhas de MAPP no filtro
    let linhas = linhasAjustes.filter(l => noFiltroAjustes(f, l) &&
        (!f.texto || N(l.mapp).includes(f.texto)) && (!f.soEditados || propostasManuais[l.chave]));

    let tLOA = alertas.reduce((s, a) => s + a.loa, 0), tProp = alertas.reduce((s, a) => s + a.proposta, 0);
    let tSemDest = alertas.reduce((s, a) => s + a.semDestino, 0);
    let doFiltro = linhasAjustes.filter(l => noFiltroAjustes(f, l));
    let qtdEditados = doFiltro.filter(l => propostasManuais[l.chave]).length;
    let qtdExcede = doFiltro.filter(propostaExcede).length;
    let propAuto = doFiltro.filter(l => !propostasManuais[l.chave]).reduce((s, l) => s + l.auto, 0);
    let propEdit = doFiltro.filter(l => propostasManuais[l.chave]).reduce((s, l) => s + propostaDe(l), 0);
    let tEstouro = alertas.reduce((s, a) => s + a.estouro, 0), tSobraDist = alertas.reduce((s, a) => s + a.sobraDistribuivel, 0);
    let aResolver = divergentes.filter(a => a.status === 'estouro' || a.status === 'sobra');
    resumo.innerHTML = `
        <div${dica(`Σ LOA 2027 dos pares Órgão × Fonte do filtro (${alertas.length} fonte(s)) = ${FT(tLOA)}`)}><span>LOA 2027 (filtro)</span><b>${F(tLOA)}</b></div>
        <div${dica(`Σ Proposta dos ${doFiltro.length} MAPPs = automáticas ${FT(propAuto)} + editadas/redistribuídas ${FT(propEdit)} = ${FT(tProp)}`)}><span>Proposta de Programado 2027</span><b>${F(tProp)}</b></div>
        <div${dica(`Diferença = LOA − Proposta = ${FT(tLOA)} − ${FT(tProp)} = ${FT(tLOA - tProp)}\n= LOA sem destino ${FT(tSemDest)} + a distribuir ${FT(tSobraDist)} − estouro ${FT(tEstouro)}`)}><span>Diferença (LOA − Proposta)</span><b class="${Math.abs(tLOA - tProp) < TOLERANCIA_ALERTA ? '' : (tLOA > tProp ? 'valor-sobra' : 'valor-estouro')}">${F(tLOA - tProp)}</b></div>
        <div${dica(`Fontes com Proposta acima da LOA (${divergentes.filter(a => a.status === 'estouro').length}) ou com sobra que cabe nos MAPPs não editados (${divergentes.filter(a => a.status === 'sobra').length})`)}><span>Fontes a resolver (Proposta ≠ LOA distribuível)</span><b class="${aResolver.length ? 'valor-estouro' : ''}">${aResolver.length} de ${alertas.length}</b><small style="color:var(--muted);">${divergentes.filter(a => a.status === 'semdestino').length} só com LOA sem destino</small></div>
        <div${dica(`Por par Órgão × Fonte: sobra (LOA − Proposta) que não cabe na Nec. Ajustada dos MAPPs não editados\nΣ dos pares = ${FT(tSemDest)}`)}><span>LOA sem destino (sem MAPP ou além da Nec. Ajustada)</span><b>${F(tSemDest)}</b></div>
        <div${dica(`MAPPs do filtro com proposta editada ou redistribuída, somando ${FT(propEdit)}`)}><span>MAPPs com proposta editada</span><b>${qtdEditados.toLocaleString('pt-BR')}</b></div>
        <div${dica('MAPPs com Nec. Ajustada cuja Proposta passa dela (linhas tarjadas em vermelho)')}><span>Proposta acima da Nec. Ajustada</span><b class="${qtdExcede ? 'valor-estouro' : ''}">${qtdExcede.toLocaleString('pt-BR')} MAPP(s)</b></div>`;
    trocarAnosRotulos(resumo);

    // Grade de alerta (só fontes com diferença)
    if (!divergentes.length) {
        contA.innerHTML = `<p class="estudo-nota" style="padding:12px; color:var(--success); font-weight:700;">✔ Todas as ${alertas.length} fonte(s) do filtro conferem: Proposta = LOA 2027.</p>`;
    } else {
        let h = `<table><thead><tr><th class="sem-ordem" style="width:86px;"></th>${thDesc('Fonte do MAPP', 'Fonte com diferença entre LOA e Proposta (só as divergentes aparecem).')}
            ${thDesc('Situação', 'Acima da LOA: a Proposta passa da LOA em algum órgão. LOA sobrando: há sobra que cabe nos MAPPs não editados (use Distribuir). LOA sem destino: só sobra que não cabe na necessidade dos MAPPs.')}
            ${thDesc('LOA 2027', 'Σ LOA 2027 dos órgãos do filtro nesta fonte.', 'num')}${thDesc('Proposta 2027', 'Σ Proposta de Programado 2027 dos MAPPs da fonte. ' + DESC_PROPOSTA, 'num')}
            ${thDesc('Diferença', 'LOA − Proposta. Positivo (laranja): sobra; negativo (vermelho): estouro.', 'num')}
            ${thDesc('LOA sem destino', 'Por órgão: sobra (LOA − Proposta) que não cabe na Nec. Ajustada dos MAPPs não editados — órgão sem MAPP com necessidade ou LOA além da necessidade. Só a grade de MAPPs sem necessidade pode recebê-la (valor manual).', 'num')}
            ${thDesc('A distribuir', 'Sobra que cabe nos MAPPs não editados até a Nec. Ajustada (+) menos o que a Proposta passa da LOA (−). Resolvido pelo botão Distribuir.', 'num')}
            ${thDesc('MAPPs', 'MAPPs ativos da fonte no filtro.', 'num')}${thDesc('Editados', 'MAPPs com proposta editada ou redistribuída.', 'num')}</tr></thead><tbody>`;
        divergentes.forEach(a => {
            let fonteJs = escHtml(a.fonte.replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
            h += `<tr class="alerta-${a.status}">
                <td>${a.distribuivel ? `<button class="btn-mini-header" style="padding:4px 8px; font-size:11px;" onclick="distribuirDiferencaFonte('${fonteJs}')" title="Reparte a diferença de cada órgão desta fonte entre os MAPPs não editados, pela Necessidade Ajustada">⚖ Distribuir</button>` : ''}</td>
                <td class="col-fonte">${escHtml(a.fonte)}</td>
                <td><span class="estudo-tag tag-${a.status}">${ROTULO_ALERTA[a.status]}</span></td>
                ${tdNum(a.loa, `Σ LOA 2027 dos órgãos do filtro nesta fonte = ${FT(a.loa)}\n${textoComposicao(a.loaSubfonte)}`)}
                <td class="num"${dica(`Σ Proposta dos ${a.qtd} MAPPs desta fonte = ${FT(a.proposta)}`)}><strong>${F(a.proposta)}</strong></td>
                ${celulaDiferenca(a.dif, `Diferença = LOA − Proposta = ${FT(a.loa)} − ${FT(a.proposta)} = ${FT(a.dif)}`)}
                <td class="num"${dica(`Σ, por órgão, da sobra (LOA − Proposta) que não cabe na Nec. Ajustada dos MAPPs não editados = ${FT(a.semDestino)}`)}>${a.semDestino ? F(a.semDestino) : '—'}</td>
                ${celulaDiferenca(a.difDistribuivel, `A distribuir = sobra que cabe nos MAPPs não editados ${FT(a.sobraDistribuivel)} − Proposta acima da LOA ${FT(a.estouro)} = ${FT(a.difDistribuivel)}`)}
                <td class="num"${dica('MAPPs ativos desta fonte no filtro')}>${a.qtd}</td><td class="num"${dica('MAPPs com proposta editada ou redistribuída')}>${a.editados || '—'}</td>
            </tr>`;
        });
        let okQtd = alertas.length - divergentes.length;
        let sd = k => divergentes.reduce((s, a) => s + a[k], 0);
        h += `</tbody><tfoot><tr><td colspan="3">${divergentes.length} fonte(s) com diferença${okQtd ? ` · ${okQtd} conferem` : ''}</td>
            ${tdNum(sd('loa'), `Σ LOA das ${divergentes.length} fontes com diferença = ${FT(sd('loa'))}`)}${tdNum(sd('proposta'), `Σ Proposta das ${divergentes.length} fontes = ${FT(sd('proposta'))}`)}
            ${celulaDiferenca(sd('dif'), `Σ LOA − Σ Proposta = ${FT(sd('loa'))} − ${FT(sd('proposta'))} = ${FT(sd('dif'))}`)}${tdNum(sd('semDestino'), `Σ LOA sem destino = ${FT(sd('semDestino'))}`)}
            ${celulaDiferenca(sd('difDistribuivel'), `Σ a distribuir = ${FT(sd('sobraDistribuivel'))} − ${FT(sd('estouro'))} = ${FT(sd('difDistribuivel'))}`)}<td></td><td></td></tr></tfoot></table>`;
        contA.innerHTML = h;
    }

    // Órgãos (todas as fontes do filtro)
    let porOrgao = {};
    consolidadoAtual.forEach(c => {
        if (!c.temLOA || !noFiltroAjustes(f, c)) return;
        let o = porOrgao[N(c.orgao)] || (porOrgao[N(c.orgao)] = { orgao: c.orgao, loa: 0, necAj: 0, proposta: 0, qtd: 0, fontes: new Set(), loaSubfonte: {} });
        o.loa += c.loa; o.fontes.add(c.fonte); somarComposicao(o.loaSubfonte, c.loaSubfonte);
    });
    linhasAjustes.forEach(l => {
        if (!noFiltroAjustes(f, l)) return;
        let o = porOrgao[N(l.orgao)] || (porOrgao[N(l.orgao)] = { orgao: l.orgao, loa: 0, necAj: 0, proposta: 0, qtd: 0, fontes: new Set() });
        o.necAj += l.necAj; o.proposta += propostaDe(l); o.qtd++; o.fontes.add(l.fonte);
    });
    // Órgãos com MAPPs primeiro (onde há proposta a ajustar), depois os só com LOA.
    let orgaos = Object.values(porOrgao).map(o => Object.assign(o, { dif: o.loa - o.proposta }))
        .sort((a, b) => ((b.qtd > 0) - (a.qtd > 0)) || b.loa - a.loa || b.proposta - a.proposta);
    let mappsPorOrgao = {};
    linhasAjustes.forEach(l => { if (noFiltroAjustes(f, l)) (mappsPorOrgao[N(l.orgao)] = mappsPorOrgao[N(l.orgao)] || []).push(l); });
    let ho = `<table><thead><tr>${thDesc('Órgão', 'Órgão (clique na linha para abrir os MAPPs dele aqui mesmo; novo clique recolhe).')}${thDesc('Fontes', 'Fontes do órgão com LOA ou MAPP, conforme o filtro.', 'num')}
        ${thDesc('MAPPs', 'MAPPs ativos do órgão.', 'num')}${thDesc('LOA 2027', 'Σ LOA 2027 do órgão nas fontes do filtro.', 'num')}
        ${thDesc('Nec. 2027 Ajustada', 'Σ Nec. 2027 Ajustada dos MAPPs do órgão.', 'num')}${thDesc('Proposta 2027', 'Σ Proposta dos MAPPs do órgão. ' + DESC_PROPOSTA, 'num')}
        ${thDesc('Diferença', 'LOA − Proposta do órgão.', 'num')}</tr></thead><tbody>`;
    orgaos.forEach(o => {
        let st = Math.abs(o.dif) < TOLERANCIA_ALERTA ? 'ok' : (o.dif > 0 ? 'sobra' : 'estouro');
        let k = N(o.orgao), aberto = expandidosAj.has(k), mapps = mappsPorOrgao[k] || [];
        ho += `<tr class="${mapps.length ? 'linha-clicavel ' : ''}alerta-${st}" data-orgao="${escHtml(k)}"${mapps.length ? ` onclick="alternarOrgaoAjustes(this.dataset.orgao)" title="${aberto ? 'Recolher' : `Abrir os ${mapps.length} MAPP(s) de ${escHtml(o.orgao)}`}"` : ''}>
            <td>${mapps.length ? `<span class="seta-grupo">${aberto ? '▾' : '▸'}</span> ` : ''}<strong>${escHtml(o.orgao)}</strong></td><td class="num"${dica(`Fontes com LOA ou MAPP: ${[...o.fontes].sort().join('; ')}`)}>${o.fontes.size}</td><td class="num"${dica('MAPPs ativos do órgão no filtro')}>${o.qtd || '—'}</td>
            <td class="num"${dica(`Σ LOA 2027 do órgão nas ${o.fontes.size} fonte(s) do filtro = ${FT(o.loa)}`, textoComposicao(o.loaSubfonte || {}))}>${o.loa ? F(o.loa) : '—'}</td>
            ${tdNum(o.necAj, `Σ Nec. 2027 Ajustada dos ${o.qtd} MAPPs do órgão = ${FT(o.necAj)}`)}<td class="num"${dica(`Σ Proposta dos ${o.qtd} MAPPs do órgão = ${FT(o.proposta)}`)}><strong>${F(o.proposta)}</strong></td>
            ${celulaDiferenca(o.dif, `Diferença = LOA − Proposta = ${FT(o.loa)} − ${FT(o.proposta)} = ${FT(o.dif)}`)}</tr>`;
        if (aberto && mapps.length) ho += `<tr class="linha-mapps"><td colspan="7">${subtabelaMappsOrgaoAjustes(mapps)}</td></tr>`;
    });
    let to = orgaos.reduce((t, o) => { t.loa += o.loa; t.necAj += o.necAj; t.proposta += o.proposta; t.qtd += o.qtd; return t; }, { loa: 0, necAj: 0, proposta: 0, qtd: 0 });
    ho += `</tbody><tfoot><tr><td colspan="2">TOTAL (${orgaos.length} órgãos)</td><td class="num"${dica('Σ MAPPs ativos dos órgãos')}>${to.qtd.toLocaleString('pt-BR')}</td>${tdNum(to.loa, `Σ LOA 2027 dos ${orgaos.length} órgãos = ${FT(to.loa)}`)}
        ${tdNum(to.necAj, `Σ Nec. 2027 Ajustada = ${FT(to.necAj)}`)}${tdNum(to.proposta, `Σ Proposta = ${FT(to.proposta)}`)}${celulaDiferenca(to.loa - to.proposta, `Σ LOA − Σ Proposta = ${FT(to.loa)} − ${FT(to.proposta)} = ${FT(to.loa - to.proposta)}`)}</tr></tfoot></table>`;
    contO.innerHTML = orgaos.length ? ho : '<p class="estudo-nota" style="padding:12px;">Nenhum órgão para o filtro.</p>';
    // Com um órgão só (selecionado no filtro ou único na fonte) a grade repete os cards: fica oculta.
    let blocoOrgaos = document.getElementById('bloco-ajustes-orgaos');
    if (blocoOrgaos) blocoOrgaos.style.display = orgaos.length > 1 ? '' : 'none';

    // MAPPs — proposta editável: com Nec. Ajustada (distribuição automática) e sem (só manual)
    contM.innerHTML = tabelaMappsAjustes(linhas.filter(l => l.grade === 1), 'Nenhum MAPP com Necessidade 2027 Ajustada para o filtro.');
    contM2.innerHTML = tabelaMappsAjustes(linhas.filter(l => l.grade === 2), 'Nenhum MAPP sem necessidade para o filtro.');

    // A LOA não alocada (aba 6) depende da Proposta: refaz a cada mudança aqui.
    montarNaoAlocada();
    renderizarNaoAlocada();
}

// Linha de MAPP com a Proposta editável (grades de MAPPs e MAPPs abertos na grade "Órgãos").
function linhaMappAjuste(l) {
    let man = propostasManuais[l.chave];
    let excede = propostaExcede(l);
    let valorTxt = propostaDe(l).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `<tr class="${excede ? 'proposta-excede' : (man ? 'proposta-editada' : '')}"${excede ? ` title="Proposta acima da Nec. 2027 Ajustada (${escHtml(F(l.necAj))})"` : ''}>
        <td class="col-mapp" title="${escHtml(l.mapp)}"><span>${escHtml(l.mapp)}</span></td><td>${escHtml(l.orgao)}</td>${COLUNA_PROGRAMA.celula(l)}
        <td class="col-fonte" style="font-size:11px;">${escHtml(l.fonte)}</td><td style="font-size:11px;">${escHtml(l.estagio)}</td>
        <td class="num"${dica(l.loaPar === null ? 'Sem LOA 2027 para este par (órgão' + (l.programa ? ', programa' : '') + ' e fonte)' : `LOA 2027 de ${l.orgao}${l.programa ? ' no programa ' + rotuloPrograma(l.programa, l.nomePrograma) : ''} na fonte ${l.fonte} = ${FT(l.loaPar)}\nΣ Nec. 2027 Ajustada dos MAPPs do par = ${FT(l.somaPar)}`)}>${l.loaPar === null ? 'sem LOA' : F(l.loaPar)}</td>
        ${tdNum(l.necAj, explicarNecAj(l))}
        <td class="num"${dica(explicarProposta(l))}><input class="input-proposta" data-chave="${escHtml(l.chave)}" value="${valorTxt}" onchange="editarProposta(this)" onkeydown="if(event.key==='Enter'){this.blur();}" title="${escHtml(explicarProposta(l))}">
            ${man ? `<button class="btn-link" onclick="restaurarProposta('${escHtml(l.chave.replace(/\\/g, '\\\\').replace(/'/g, "\\'"))}')" title="${man.origem === 'redistribuicao' ? 'Valor da redistribuição' : 'Editado'} — voltar ao automático (${escHtml(F(l.auto))})">↺</button>` : ''}</td>
    </tr>`;
}

// Órgãos da aba 5 com os MAPPs abertos na própria grade (o clique no órgão abre/fecha).
let expandidosAj = new Set();

function alternarOrgaoAjustes(orgaoN) {
    if (expandidosAj.has(orgaoN)) expandidosAj.delete(orgaoN); else expandidosAj.add(orgaoN);
    renderizarAjustesFinais();
}

function subtabelaMappsOrgaoAjustes(linhas) {
    let ordenadas = linhas.slice().sort((a, b) => a.fonte.localeCompare(b.fonte) || (a.programa || '').localeCompare(b.programa || '') || b.necAj - a.necAj);
    let h = `<table class="subtabela-mapps"><thead><tr>` +
        COLUNAS_AJUSTES.map(c => `<th class="sem-ordem${c.num ? ' num' : ''}${c.classe ? ' ' + c.classe : ''}" data-desc="1"${dica(c.titulo, DESC_COLUNAS.aj[c.chave])}>${escHtml(c.titulo)}</th>`).join('') +
        '</tr></thead><tbody>';
    ordenadas.slice(0, LIMITE_SUB_MAPPS).forEach(l => { h += linhaMappAjuste(l); });
    let t = linhas.reduce((s, l) => { s.necAj += l.necAj; s.proposta += propostaDe(l); return s; }, { necAj: 0, proposta: 0 });
    h += `</tbody><tfoot><tr><td colspan="${colsTexto(5)}">${linhas.length} MAPP(s)${linhas.length > LIMITE_SUB_MAPPS ? ` — exibindo ${LIMITE_SUB_MAPPS}; use o filtro de fonte para ver os demais` : ''}</td>
        ${tdNum(t.necAj, `Σ Nec. 2027 Ajustada = ${FT(t.necAj)}`)}${tdNum(t.proposta, `Σ Proposta = ${FT(t.proposta)}`)}</tr></tfoot></table>`;
    return h;
}

function tabelaMappsAjustes(linhas, msgVazia) {
    if (!linhas.length) return `<p class="estudo-nota" style="padding:12px;">${msgVazia}</p>`;
    let ordenadas = ordenarLinhas(linhas.map(l => Object.assign(l, { proposta: propostaDe(l) })), COLUNAS_AJUSTES, ordemTabelas.aj);
    let exibidas = ordenadas.slice(0, LIMITE_LINHAS_DETALHE);
    let hm = `<table><thead>${cabecalhoOrdenavel('aj', COLUNAS_AJUSTES)}</thead><tbody>`;
    exibidas.forEach(l => { hm += linhaMappAjuste(l); });
    let tm = linhas.reduce((t, l) => { t.necAj += l.necAj; t.proposta += propostaDe(l); return t; }, { necAj: 0, proposta: 0 });
    let paresVistos = {}; linhas.forEach(l => { if (l.loaPar !== null) paresVistos[l.par] = l.loaPar; });
    let loaPares = Object.values(paresVistos).reduce((s, v) => s + v, 0);
    let avisoLim = linhas.length > exibidas.length ? ` — exibindo ${exibidas.length}; filtre por fonte ou órgão para ver todas` : '';
    hm += `</tbody><tfoot><tr><td colspan="${colsTexto(4)}">TOTAL (${linhas.length.toLocaleString('pt-BR')} MAPPs${avisoLim})</td>
        ${tdNum(loaPares, `Σ LOA 2027 dos ${Object.keys(paresVistos).length} pares Órgão × Fonte destes MAPPs (cada par uma vez) = ${FT(loaPares)}`)}
        ${tdNum(tm.necAj, `Σ Nec. 2027 Ajustada dos ${linhas.length} MAPPs = ${FT(tm.necAj)}`)}${tdNum(tm.proposta, `Σ Proposta dos ${linhas.length} MAPPs = ${FT(tm.proposta)}`)}</tr></tfoot></table>`;
    return hm;
}

const COLUNAS_AJUSTES = [
    { chave: 'mapp', titulo: 'MAPP', valor: l => l.mapp },
    { chave: 'orgao', titulo: 'Órgão', valor: l => l.orgao },
    COLUNA_PROGRAMA,
    { chave: 'fonte', titulo: 'Fonte do MAPP', valor: l => l.fonte },
    { chave: 'estagio', titulo: 'Estágio', valor: l => l.estagio },
    { chave: 'loaPar', titulo: 'LOA 2027 do par', num: true, valor: l => l.loaPar },
    { chave: 'necAj', titulo: 'Nec. 2027 Ajustada', num: true, valor: l => l.necAj },
    { chave: 'proposta', titulo: 'Proposta Programado 2027', num: true, valor: l => l.proposta }
];

// ─── ABA 6: LOA NÃO ALOCADA (LOA 2027 não vinculada a MAPP) ─────────────────
// Três categorias, sempre nesta ordem e com a mesma cor (CSS --na-*):
//   fora    = sub fonte sem Fonte do MAPP no De-para (fora do cruzamento);
//   semmapp = par com LOA e nenhum MAPP ativo;
//   sobra   = par com MAPPs cuja Proposta não usa toda a LOA (LOA − Proposta > 0).
const CATEGORIAS_NA = [
    { id: 'fora', rotulo: 'Fora do cruzamento', cor: '--na-fora', desc: 'LOA de sub fonte sem Fonte do MAPP no De-para (aba 3): não há MAPP que possa recebê-la.' },
    { id: 'semmapp', rotulo: 'Par sem MAPP', cor: '--na-semmapp', desc: 'LOA de órgão × programa × fonte sem nenhum MAPP ativo.' },
    { id: 'sobra', rotulo: 'Sobra no par', cor: '--na-sobra', desc: 'LOA do par − Proposta dos MAPPs do par, quando positiva (necessidade menor que a LOA ou proposta não distribuída).' }
];
const ROTULO_CAT_NA = Object.fromEntries(CATEGORIAS_NA.map(c => [c.id, c.rotulo]));
let itensNaoAlocada = [];      // um item por par (ou por linha da LOA fora do cruzamento)
let graficosNaoAlocada = {};   // instâncias do Chart.js, recriadas a cada desenho
let naoAlocadaSuja = true;

function montarNaoAlocada() {
    let itens = [];
    // LOA por par (só as linhas que cruzam), para chegar às ações do PLOA.
    let linhasPorPar = {};
    loaLinhas.forEach(l => {
        let fonte = fonteEfetiva(l.subfonte).fonte;
        if (!fonte) {
            itens.push({ categoria: 'fora', orgao: l.sigla, programa: cruzaPrograma ? (l.programa || '') : '', nomePrograma: l.nomePrograma || '',
                fonte: `(sem fonte) ${l.subfonte}`, subfontes: l.subfonte, descFonte: l.descSubfonte, loa: l.valor, proposta: 0, valor: l.valor,
                qtd: 0, necAj: 0, linhasLOA: [l] });
            return;
        }
        let k = chavePar(l.sigla, cruzaPrograma ? l.programa : '', fonte);
        (linhasPorPar[k] = linhasPorPar[k] || []).push(l);
    });
    let propPar = {};
    linhasAjustes.forEach(l => { propPar[l.par] = (propPar[l.par] || 0) + propostaDe(l); });
    consolidadoAtual.forEach(c => {
        if (!c.temLOA) return;
        let k = chavePar(c.orgao, c.programa, c.fonte);
        let prop = propPar[k] || 0;
        let livre = c.loa - prop;
        if (livre < TOLERANCIA_ALERTA) return;
        itens.push({ categoria: c.qtd > 0 ? 'sobra' : 'semmapp', orgao: c.orgao, programa: c.programa || '', nomePrograma: c.nomePrograma || '',
            fonte: c.fonte, subfontes: c.subfontesTxt, loa: c.loa, proposta: prop, valor: livre, qtd: c.qtd, necAj: c.necAj, linhasLOA: linhasPorPar[k] || [] });
    });
    itensNaoAlocada = itens;
    let badge = document.getElementById('badge-naoalocada');
    let total = itens.reduce((s, i) => s + i.valor, 0);
    if (badge) badge.textContent = total >= TOLERANCIA_ALERTA ? abreviarValor(total) : '';
}

// "R$ 1,44 bi" / "R$ 328 mi" para selos e rótulos de gráfico.
function abreviarValor(v) {
    let a = Math.abs(v);
    if (a >= 1e9) return 'R$ ' + (v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' bi';
    if (a >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
    if (a >= 1e3) return 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil';
    return F(v);
}

function filtrosNaoAlocada() {
    let val = id => (document.getElementById(id) || {}).value || '';
    return { categoria: val('filtro-na-categoria'), fonte: val('filtro-na-fonte'), orgao: val('filtro-na-orgao'), programa: cruzaPrograma ? val('filtro-na-programa') : '' };
}

function itemNoFiltroNA(f, i) {
    return (!f.categoria || i.categoria === f.categoria) && (!f.fonte || i.fonte === f.fonte) &&
        (!f.orgao || N(i.orgao) === N(f.orgao)) && (!f.programa || i.programa === f.programa);
}

function atualizarFiltrosNaoAlocada() {
    let f = filtrosNaoAlocada();
    let filtros = {
        categoria: f.categoria ? u => u.categoria === f.categoria : null, fonte: f.fonte ? u => u.fonte === f.fonte : null,
        orgao: f.orgao ? u => N(u.orgao) === N(f.orgao) : null, programa: f.programa ? u => u.programa === f.programa : null
    };
    preencherSelectLigado('filtro-na-categoria', valoresLigados(itensNaoAlocada, filtros, 'categoria'), '(todas)', v => ROTULO_CAT_NA[v] || v);
    preencherSelectLigado('filtro-na-fonte', valoresLigados(itensNaoAlocada, filtros, 'fonte'), '(todas)');
    preencherSelectLigado('filtro-na-orgao', valoresLigados(itensNaoAlocada, filtros, 'orgao'), '(todos)');
    if (cruzaPrograma) preencherSelectLigado('filtro-na-programa', valoresLigados(itensNaoAlocada, filtros, 'programa'), '(todos)', v => rotuloPrograma(v, nomesProgramas[v]));
}

function limparFiltrosNaoAlocada() {
    ['filtro-na-categoria', 'filtro-na-fonte', 'filtro-na-orgao', 'filtro-na-programa'].forEach(id => { let el = document.getElementById(id); if (el) el.value = ''; });
    renderizarNaoAlocada();
}

// Agrupa os itens do filtro por uma dimensão, com o valor por categoria.
function agruparNaoAlocada(itens, chave, rotulo) {
    let grupos = {};
    itens.forEach(i => {
        let k = chave(i);
        let g = grupos[k] || (grupos[k] = { chave: k, rotulo: rotulo(i), fora: 0, semmapp: 0, sobra: 0, valor: 0, loa: 0, proposta: 0, pares: 0, loaSubfonte: {} });
        g[i.categoria] += i.valor; g.valor += i.valor; g.loa += i.loa; g.proposta += i.proposta; g.pares++;
        i.linhasLOA.forEach(l => { g.loaSubfonte[l.subfonte] = (g.loaSubfonte[l.subfonte] || 0) + l.valor; });
    });
    return Object.values(grupos).sort((a, b) => b.valor - a.valor);
}

// Ações do PLOA por trás de cada item: valor da ação × (não alocado ÷ LOA do item).
function acoesNaoAlocada(itens) {
    if (loaConferencia.origem !== 'ploa' || !loaCreditos.length) return null;
    let prm = lerParametrosEstudo();
    let idx = {};
    loaCreditos.forEach(c => {
        if (!creditoNoRecorte(c, prm) || loaForaDoExecutivo(c)) return;
        let k = c.codOrgao + '|' + c.programa + '|' + fonteLOADoCredito(c).subfonte;
        (idx[k] = idx[k] || []).push(c);
    });
    let acoes = {};
    itens.forEach(i => {
        let fator = i.loa > 0 ? i.valor / i.loa : 0;
        i.linhasLOA.forEach(l => {
            (idx[l.codOrgao + '|' + l.programa + '|' + l.subfonte] || []).forEach(c => {
                let k = c.codOrgao + '|' + c.programa + '|' + c.codAcao;
                let a = acoes[k] || (acoes[k] = { orgao: SIGLAS_ORGAO_LOA[c.codOrgao] || c.orgao, programa: c.programa, nomePrograma: c.nomePrograma,
                    codAcao: c.codAcao, acao: c.acao, tipo: c.tipoAcao, fontes: new Set(), regioes: new Set(), categorias: new Set(), loa: 0, valor: 0 });
                a.loa += c.valor; a.valor += c.valor * fator;
                a.fontes.add(i.fonte); a.regioes.add(c.regiao); a.categorias.add(i.categoria);
            });
        });
    });
    return Object.values(acoes).filter(a => a.valor >= 0.5).sort((a, b) => b.valor - a.valor);
}

function corCategoriaNA(id) {
    return getComputedStyle(document.documentElement).getPropertyValue(CATEGORIAS_NA.find(c => c.id === id).cor).trim();
}

function desenharGraficosNaoAlocada(itens) {
    if (typeof Chart === 'undefined') return;
    Object.values(graficosNaoAlocada).forEach(g => g.destroy());
    graficosNaoAlocada = {};
    let estilo = getComputedStyle(document.documentElement);
    let texto = estilo.getPropertyValue('--text').trim() || '#333';
    let muted = estilo.getPropertyValue('--muted').trim() || '#777';
    let grade = estilo.getPropertyValue('--border').trim() || '#ddd';
    let superficie = estilo.getPropertyValue('--na-superficie').trim();
    let tooltipValor = ctx => `${ctx.dataset.label || ctx.label}: ${F(ctx.parsed.x !== undefined && typeof ctx.parsed === 'object' ? ctx.parsed.x : ctx.parsed)}`;
    let comuns = { responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { labels: { color: texto, boxWidth: 12, boxHeight: 12 } } } };

    // Rosca por categoria (parte do todo; legenda + rótulos no tooltip).
    let porCat = CATEGORIAS_NA.map(c => itens.filter(i => i.categoria === c.id).reduce((s, i) => s + i.valor, 0));
    let total = porCat.reduce((s, v) => s + v, 0);
    graficosNaoAlocada.categoria = new Chart(document.getElementById('graf-na-categoria'), {
        type: 'doughnut',
        data: { labels: CATEGORIAS_NA.map(c => c.rotulo), datasets: [{ data: porCat, backgroundColor: CATEGORIAS_NA.map(c => corCategoriaNA(c.id)), borderColor: superficie, borderWidth: 2 }] },
        options: Object.assign({}, comuns, { cutout: '62%', plugins: { legend: { position: 'right', labels: { color: texto, boxWidth: 12, boxHeight: 12 } },
            tooltip: { callbacks: { label: ctx => `${ctx.label}: ${F(ctx.parsed)} (${fmtPct(total ? ctx.parsed / total * 100 : 0)})` } } } })
    });

    // Barras horizontais empilhadas por categoria (rótulos longos ficam legíveis).
    let barras = (id, grupos) => {
        let top = grupos.slice(0, 15);
        graficosNaoAlocada[id] = new Chart(document.getElementById('graf-na-' + id), {
            type: 'bar',
            data: { labels: top.map(g => g.rotulo.length > 32 ? g.rotulo.slice(0, 31) + '…' : g.rotulo),
                datasets: CATEGORIAS_NA.map(c => ({ label: c.rotulo, data: top.map(g => g[c.id]), backgroundColor: corCategoriaNA(c.id),
                    borderColor: superficie, borderWidth: { right: 2 }, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 18 })) },
            options: Object.assign({}, comuns, { indexAxis: 'y',
                scales: {
                    x: { stacked: true, ticks: { color: muted, maxTicksLimit: 5, maxRotation: 0, callback: v => abreviarValor(v) }, grid: { color: grade } },
                    y: { stacked: true, ticks: { color: texto, font: { size: 11 }, autoSkip: false }, grid: { display: false } }
                },
                plugins: { legend: { labels: { color: texto, boxWidth: 12, boxHeight: 12 } },
                    tooltip: { callbacks: { title: ctx => top[ctx[0].dataIndex].rotulo, label: ctx => `${ctx.dataset.label}: ${F(ctx.parsed.x)}`,
                        footer: ctx => `Total não alocado: ${F(top[ctx[0].dataIndex].valor)}` } } } })
        });
    };
    barras('fonte', agruparNaoAlocada(itens, i => i.fonte, i => i.fonte));
    barras('orgao', agruparNaoAlocada(itens, i => N(i.orgao), i => i.orgao));
    if (cruzaPrograma) barras('programa', agruparNaoAlocada(itens, i => i.programa, i => rotuloPrograma(i.programa, i.nomePrograma || nomesProgramas[i.programa]) || '(sem programa)'));
}

function tabelaAgrupadaNA(grupos, titulo, descTitulo, vazio) {
    if (!grupos.length) return `<p class="estudo-nota" style="padding:12px;">${vazio}</p>`;
    let h = `<table><thead><tr>${thDesc(titulo, descTitulo)}` +
        CATEGORIAS_NA.map(c => thDesc(c.rotulo, c.desc, 'num')).join('') +
        `${thDesc('Não alocado', 'Σ das três categorias.', 'num')}${thDesc('LOA 2027', 'Σ LOA dos itens não alocados (pares e linhas fora do cruzamento) — a LOA dos pares totalmente alocados não entra.', 'num')}
        ${thDesc('Proposta', 'Σ Proposta dos MAPPs desses pares.', 'num')}${thDesc('% não alocado', 'Não alocado ÷ LOA 2027 × 100.', 'num')}</tr></thead><tbody>`;
    grupos.slice(0, LIMITE_LINHAS_DETALHE).forEach(g => {
        h += `<tr><td><strong>${escHtml(g.rotulo)}</strong></td>` +
            CATEGORIAS_NA.map(c => g[c.id] ? tdNum(g[c.id], `${c.rotulo} em ${g.rotulo} = ${FT(g[c.id])}`) : '<td class="num">—</td>').join('') +
            `<td class="num"${dica(`Não alocado = ${CATEGORIAS_NA.map(c => FT(g[c.id])).join(' + ')} = ${FT(g.valor)}`)}><strong>${F(g.valor)}</strong></td>
            ${tdNum(g.loa, `Σ LOA 2027 dos ${g.pares} item(ns) = ${FT(g.loa)}\n${textoComposicao(g.loaSubfonte)}`)}${tdNum(g.proposta, `Σ Proposta = ${FT(g.proposta)}`)}
            <td class="num"${dica(`${FT(g.valor)} ÷ ${FT(g.loa)} × 100`)}>${fmtPct(g.loa ? g.valor / g.loa * 100 : null)}</td></tr>`;
    });
    let t = grupos.reduce((s, g) => { CATEGORIAS_NA.forEach(c => s[c.id] += g[c.id]); s.valor += g.valor; s.loa += g.loa; s.proposta += g.proposta; return s; }, { fora: 0, semmapp: 0, sobra: 0, valor: 0, loa: 0, proposta: 0 });
    h += `</tbody><tfoot><tr><td>TOTAL (${grupos.length})</td>` + CATEGORIAS_NA.map(c => tdNum(t[c.id], `Σ ${c.rotulo} = ${FT(t[c.id])}`)).join('') +
        `${tdNum(t.valor, `Σ não alocado = ${FT(t.valor)}`)}${tdNum(t.loa, `Σ LOA 2027 = ${FT(t.loa)}`)}${tdNum(t.proposta, `Σ Proposta = ${FT(t.proposta)}`)}
        <td class="num">${fmtPct(t.loa ? t.valor / t.loa * 100 : null)}</td></tr></tfoot></table>`;
    return h;
}

function renderizarNaoAlocada() {
    let secao = document.querySelector('.estudo-aba[data-aba="naoalocada"]');
    // Gráficos só desenham com a aba visível (canvas oculto não tem tamanho): marca e adia.
    if (!secao || !secao.classList.contains('ativa')) { naoAlocadaSuja = true; return; }
    naoAlocadaSuja = false;
    let resumo = document.getElementById('resumo-naoalocada');
    let ids = ['tabela-na-fonte', 'tabela-na-orgao', 'tabela-na-par', 'tabela-na-acao'];
    if (!loaLinhas.length || !mappsCalculados.length) {
        resumo.innerHTML = '';
        ids.forEach(id => { document.getElementById(id).innerHTML = '<p class="estudo-nota" style="padding:12px;">Carregue a LOA e a base de MAPPs.</p>'; });
        Object.values(graficosNaoAlocada).forEach(g => g.destroy()); graficosNaoAlocada = {};
        return;
    }
    atualizarFiltrosNaoAlocada();
    let f = filtrosNaoAlocada();
    let itens = itensNaoAlocada.filter(i => itemNoFiltroNA(f, i));

    // Cards
    let loaExec = loaLinhas.reduce((s, l) => s + l.valor, 0);
    let total = itens.reduce((s, i) => s + i.valor, 0);
    let porCat = Object.fromEntries(CATEGORIAS_NA.map(c => [c.id, itens.filter(i => i.categoria === c.id).reduce((s, i) => s + i.valor, 0)]));
    let filtrado = f.categoria || f.fonte || f.orgao || f.programa;
    resumo.innerHTML = `
        <div${dica(`Σ LOA 2027 do Executivo no recorte atual = ${FT(loaExec)}`)}><span>LOA 2027 do Executivo</span><b>${F(loaExec)}</b></div>
        <div${dica(`LOA − não alocada (sem filtro) = ${FT(loaExec)} − ${FT(itensNaoAlocada.reduce((s, i) => s + i.valor, 0))}`)}><span>LOA alocada em Proposta</span><b>${F(loaExec - itensNaoAlocada.reduce((s, i) => s + i.valor, 0))}</b></div>
        <div${dica(`Σ das três categorias${filtrado ? ' (filtro)' : ''} = ${CATEGORIAS_NA.map(c => FT(porCat[c.id])).join(' + ')} = ${FT(total)}`)}><span>LOA não alocada${filtrado ? ' (filtro)' : ''}</span><b class="valor-sobra">${F(total)}</b><small style="color:var(--muted);">${fmtPct(loaExec ? total / loaExec * 100 : null)} da LOA do Executivo</small></div>` +
        CATEGORIAS_NA.map(c => `<div${dica(c.desc + `\n= ${FT(porCat[c.id])}`)}><span><span class="na-chave" style="--na-cor:var(${c.cor}); margin-left:0;"></span>${c.rotulo}</span><b>${F(porCat[c.id])}</b><small style="color:var(--muted);">${itens.filter(i => i.categoria === c.id).length} item(ns) · ${fmtPct(total ? porCat[c.id] / total * 100 : null)}</small></div>`).join('');
    trocarAnosRotulos(resumo);

    desenharGraficosNaoAlocada(itens);

    document.getElementById('tabela-na-fonte').innerHTML = tabelaAgrupadaNA(agruparNaoAlocada(itens, i => i.fonte, i => i.fonte),
        'Fonte', 'Fonte do MAPP; "(sem fonte)" + código = sub fonte da LOA sem par no De-para.', 'Nada para o filtro.');
    document.getElementById('tabela-na-orgao').innerHTML = tabelaAgrupadaNA(agruparNaoAlocada(itens, i => N(i.orgao), i => i.orgao),
        'Órgão', 'Órgão (sigla).', 'Nada para o filtro.');

    // Pares
    let pares = itens.slice().sort((a, b) => b.valor - a.valor);
    let hp = `<table><thead><tr>${thDesc('Categoria', 'Fora do cruzamento, Par sem MAPP ou Sobra no par.')}${thDesc('Órgão', 'Órgão (sigla).')}
        <th class="sem-ordem so-programa" data-desc="1"${dica('Programa', 'Programa do PLOA.')}>Programa</th>${thDesc('Fonte', 'Fonte do MAPP (ou sub fonte sem par).')}
        ${thDesc('LOA 2027', 'LOA do par (ou da linha fora do cruzamento).', 'num')}${thDesc('Proposta', 'Σ Proposta dos MAPPs do par (aba 5).', 'num')}
        ${thDesc('MAPPs', 'MAPPs ativos do par.', 'num')}${thDesc('Nec. 2027 Ajustada', 'Σ Nec. Ajustada dos MAPPs do par.', 'num')}
        ${thDesc('Não alocado', 'LOA − Proposta (fora do cruzamento e par sem MAPP: a LOA inteira).', 'num')}</tr></thead><tbody>`;
    pares.slice(0, LIMITE_LINHAS_DETALHE).forEach(i => {
        hp += `<tr><td><span class="na-chave" style="--na-cor:var(${CATEGORIAS_NA.find(c => c.id === i.categoria).cor}); margin-left:0;"></span>${ROTULO_CAT_NA[i.categoria]}</td>
            <td><strong>${escHtml(i.orgao)}</strong></td><td class="so-programa" style="font-size:11px;">${escHtml(rotuloPrograma(i.programa, i.nomePrograma))}</td>
            <td class="col-fonte" style="font-size:11px;"${i.descFonte ? dica(i.descFonte) : ''}>${escHtml(i.fonte)}</td>
            ${tdNum(i.loa, `LOA 2027 = ${FT(i.loa)}${i.subfontes ? '\nSub fontes: ' + i.subfontes : ''}`)}${tdNum(i.proposta, `Σ Proposta dos ${i.qtd} MAPP(s) = ${FT(i.proposta)}`)}
            <td class="num">${i.qtd || '—'}</td>${tdNum(i.necAj, `Σ Nec. 2027 Ajustada = ${FT(i.necAj)}`)}
            <td class="num"${dica(`Não alocado = LOA − Proposta = ${FT(i.loa)} − ${FT(i.proposta)} = ${FT(i.valor)}`)}><strong>${F(i.valor)}</strong></td></tr>`;
    });
    let tp = pares.reduce((s, i) => { s.loa += i.loa; s.proposta += i.proposta; s.valor += i.valor; s.necAj += i.necAj; s.qtd += i.qtd; return s; }, { loa: 0, proposta: 0, valor: 0, necAj: 0, qtd: 0 });
    hp += `</tbody><tfoot><tr><td colspan="${colsTexto(3)}">TOTAL (${pares.length.toLocaleString('pt-BR')} itens${pares.length > LIMITE_LINHAS_DETALHE ? ` — exibindo ${LIMITE_LINHAS_DETALHE}` : ''})</td>
        ${tdNum(tp.loa, `Σ LOA = ${FT(tp.loa)}`)}${tdNum(tp.proposta, `Σ Proposta = ${FT(tp.proposta)}`)}<td class="num">${tp.qtd.toLocaleString('pt-BR')}</td>
        ${tdNum(tp.necAj, `Σ Nec. Ajustada = ${FT(tp.necAj)}`)}${tdNum(tp.valor, `Σ não alocado = ${FT(tp.valor)}`)}</tr></tfoot></table>`;
    document.getElementById('tabela-na-par').innerHTML = pares.length ? hp : '<p class="estudo-nota" style="padding:12px;">Nada para o filtro.</p>';

    // Ações do PLOA
    let acoes = acoesNaoAlocada(itens);
    let contA = document.getElementById('tabela-na-acao');
    if (acoes === null) {
        contA.innerHTML = '<p class="estudo-nota" style="padding:12px;">Disponível com a LOA do PLOA 2027 por ação (aba 1).</p>';
    } else if (!acoes.length) {
        contA.innerHTML = '<p class="estudo-nota" style="padding:12px;">Nada para o filtro.</p>';
    } else {
        let ha = `<table><thead><tr>${thDesc('Órgão', 'Órgão (sigla).')}${thDesc('Programa', 'Programa do PLOA.')}${thDesc('Ação', 'Código e nome da ação no PLOA 2027.')}
            ${thDesc('Tipo', 'Projeto, Atividade ou Operação Especial.')}${thDesc('Fonte(s)', 'Fontes do MAPP (ou sub fonte sem par) dos créditos da ação.')}
            ${thDesc('Região(ões)', 'Códigos de região dos créditos (15 = Estado do Ceará).')}${thDesc('Categoria(s)', 'Categorias de não alocação dos créditos.')}
            ${thDesc('LOA da ação', 'Σ dos créditos da ação no recorte (nos itens não alocados).', 'num')}
            ${thDesc('Não alocado', 'Σ crédito × (não alocado do item ÷ LOA do item). Fora do cruzamento e par sem MAPP: o crédito inteiro.', 'num')}</tr></thead><tbody>`;
        acoes.slice(0, LIMITE_LINHAS_DETALHE).forEach(a => {
            ha += `<tr><td><strong>${escHtml(a.orgao)}</strong></td><td style="font-size:11px;">${escHtml(rotuloPrograma(a.programa, a.nomePrograma))}</td>
                <td class="col-mapp" title="${escHtml(a.codAcao + ' - ' + a.acao)}"><span>${escHtml(a.codAcao + ' - ' + a.acao)}</span></td>
                <td style="font-size:11px;">${escHtml(a.tipo)}</td><td class="col-fonte" style="font-size:11px;">${escHtml([...a.fontes].join('; '))}</td>
                <td style="font-size:11px;">${escHtml([...a.regioes].sort().join(', '))}</td><td style="font-size:11px;">${escHtml([...a.categorias].map(c => ROTULO_CAT_NA[c]).join('; '))}</td>
                ${tdNum(a.loa, `Σ créditos da ação = ${FT(a.loa)}`)}<td class="num"${dica(`Parte não alocada da ação = ${FT(a.valor)}`)}><strong>${F(a.valor)}</strong></td></tr>`;
        });
        let ta = acoes.reduce((s, a) => { s.loa += a.loa; s.valor += a.valor; return s; }, { loa: 0, valor: 0 });
        ha += `</tbody><tfoot><tr><td colspan="7">TOTAL (${acoes.length.toLocaleString('pt-BR')} ações${acoes.length > LIMITE_LINHAS_DETALHE ? ` — exibindo ${LIMITE_LINHAS_DETALHE}` : ''})</td>
            ${tdNum(ta.loa, `Σ LOA das ações = ${FT(ta.loa)}`)}${tdNum(ta.valor, `Σ não alocado = ${FT(ta.valor)}`)}</tr></tfoot></table>`;
        contA.innerHTML = ha;
    }
}

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
    let recorte = {};
    for (let id in RECORTE_LOA_PADRAO) recorte[id] = marcadoRecorte(id);
    return { campos, expurgarFisFin: elExp ? elExp.checked : true, vdFonte: (document.getElementById('vd-fonte') || {}).value || '', recorteLOA: recorte, exercicioLOA };
}

function aplicarParametrosEstudoTela(p) {
    if (!p) return;
    for (let id in (p.campos || {})) { let el = document.getElementById(id); if (el) el.value = p.campos[id]; }
    let elExp = document.getElementById('ep-expurgar-fisfin');
    if (elExp && typeof p.expurgarFisFin === 'boolean') elExp.checked = p.expurgarFisFin;
    definirExercicio(p.exercicioLOA || 2027);
    let recorte = Object.assign({}, RECORTE_LOA_PADRAO, p.recorteLOA || {});
    for (let id in recorte) { let el = document.getElementById(id); if (el) el.checked = !!recorte[id]; }
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
            // PLOA por ação: guarda os créditos (o recorte é refeito ao carregar); senão, as linhas lidas.
            dados: loaConferencia.origem === 'ploa'
                ? { loaCreditos, loaConferencia, dadosBrutos: mappsOriginais, colunasMapps: mappsColunasOriginais }
                : { loaLinhas: loaLinhasArquivo, loaConferencia, dadosBrutos: mappsOriginais, colunasMapps: mappsColunasOriginais }
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
        loaLinhas = []; loaLinhasArquivo = []; loaCreditos = []; mappsBrutos = []; mappsOriginais = [];
        if (Array.isArray(dados.loaCreditos) && dados.loaCreditos.length) {
            let c = dados.loaConferencia || {};
            loaCreditos = dados.loaCreditos;
            carregarLOA({ linhas: montarLinhasPLOA(loaCreditos, lerParametrosEstudo()), conferido: true, origem: 'ploa',
                divergencias: c.divergencias || [], resumoPloa: c.resumoPloa || null }, (pacote.arquivos || {}).loa);
        } else if (Array.isArray(dados.loaLinhas) && dados.loaLinhas.length) carregarLOA(Object.assign({ linhas: dados.loaLinhas }, dados.loaConferencia || { conferido: false, divergencias: [] }), (pacote.arquivos || {}).loa);
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
    // c.fixo: cabeçalho de dado (coluna da base, ex.: VLR_PROGRAMADO_2026) — não troca o ano.
    ws.columns = colunas.map(c => ({ header: c.fixo ? c.titulo : trocarAnos(c.titulo), key: c.chave, width: c.largura || 16 }));
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
        { titulo: 'FONTE DO MAPP', chave: 'fonte', largura: 42 }, { titulo: 'ÓRGÃO', chave: 'orgao', largura: 16 },
        { titulo: 'PROGRAMA', chave: 'programa', largura: 40 },
        { titulo: 'SITUAÇÃO', chave: 'sit', largura: 16 }, { titulo: 'LOA 2027', chave: 'loa', moeda: true, largura: 20 },
        { titulo: 'QTD MAPPS', chave: 'qtd', largura: 11 }, { titulo: 'PROGRAMADO 2026', chave: 'p26', moeda: true, largura: 20 },
        { titulo: 'PREV. EMPENHO 2026', chave: 'prevEmp', moeda: true, largura: 20 }, { titulo: 'PREV. EMPENHO AJUSTADA', chave: 'prevEmpAj', moeda: true, largura: 20 },
        { titulo: 'NEC. 2027 CALCULADA', chave: 'nec', moeda: true, largura: 20 }, { titulo: 'NEC. 2027 AJUSTADA', chave: 'necAj', moeda: true, largura: 20 },
        { titulo: 'NECESSIDADE ÷ LOA', chave: 'pct', pct: true, largura: 13 }, { titulo: 'SALDO (LOA − NEC. AJ.)', chave: 'saldo', moeda: true, largura: 20 },
        { titulo: 'SUB FONTES DA LOA', chave: 'sfs', largura: 40 }
    ], linhasConsolidadoOrdenadas().map(l => ({
        fonte: l.fonte, orgao: l.orgao, programa: rotuloPrograma(l.programa, l.nomePrograma), sit: ROTULO_SITUACAO[l.situacao], loa: l.temLOA ? l.loa : null, qtd: l.qtd,
        p26: l.p26, prevEmp: l.prevEmp, prevEmpAj: l.prevEmpAj, nec: l.nec, necAj: l.necAj, pct: l.pctLOA === null ? null : Number(l.pctLOA.toFixed(4)),
        saldo: l.saldo, sfs: l.subfontesTxt
    })));

    adicionarAbaEstudo(wb, 'DETALHE_MAPP', [
        { titulo: 'MAPP', chave: 'mapp', largura: 16 }, { titulo: 'ÓRGÃO', chave: 'orgao', largura: 14 },
        { titulo: 'PROGRAMA', chave: 'programa', largura: 40 },
        { titulo: 'FONTE', chave: 'fonte', largura: 40 }, { titulo: 'ESTÁGIO', chave: 'estagio', largura: 26 },
        { titulo: 'GRUPO', chave: 'grupo', largura: 20 }, { titulo: 'EXPURGADO', chave: 'exp', largura: 11 },
        { titulo: 'PROGRAMADO 2026', chave: 'p26', moeda: true, largura: 18 }, { titulo: 'LIMITE 2026', chave: 'l26', moeda: true, largura: 18 },
        { titulo: 'EMPENHADO 2026', chave: 'e26', moeda: true, largura: 18 }, { titulo: 'REGRA APLICADA', chave: 'regra', largura: 48 },
        { titulo: 'PREV. EMPENHO 2026', chave: 'prevEmp', moeda: true, largura: 18 }, { titulo: 'TRF 2026', chave: 'trf', moeda: true, largura: 18 },
        { titulo: 'PROGRAMADO 2027', chave: 'p27', moeda: true, largura: 18 }, { titulo: 'NEC. 2027 CALCULADA', chave: 'nec', moeda: true, largura: 18 },
        { titulo: '% DELIBERADO', chave: 'pctDel', pct: true, largura: 12 }, { titulo: 'PREV. EMPENHO AJUSTADA', chave: 'prevEmpAj', moeda: true, largura: 18 },
        { titulo: 'TRF 2026 AJUSTADA', chave: 'trfAj', moeda: true, largura: 18 }, { titulo: 'NEC. 2027 AJUSTADA', chave: 'necAj', moeda: true, largura: 18 }
    ], linhasDetalheOrdenadas().map(m => ({
        mapp: m.mapp, orgao: m.orgao, programa: rotuloPrograma(m.programa, m.nomePrograma), fonte: m.fonte, estagio: m.estagio, grupo: rotuloGrupo(m.classe), exp: m.expurgado ? 'SIM' : 'NÃO',
        p26: m.p26, l26: m.l26, e26: m.e26, regra: m.regra, prevEmp: m.prevEmp, trf: m.trf, p27: m.p27, nec: m.nec,
        pctDel: m.pctDeliberado, prevEmpAj: m.prevEmpAj, trfAj: m.trfAj, necAj: m.necAj
    })));

    adicionarAbaDePara(wb);

    // Abas com o conteúdo de cada arquivo carregado, para o xlsx ficar autossuficiente.
    if (loaConferencia.origem === 'ploa' && loaCreditos.length) {
        // PLOA por ação: os créditos do recorte (GND/esfera/modalidade da aba 2), um por linha.
        let prmRec = lerParametrosEstudo();
        adicionarAbaEstudo(wb, 'LOA_ACOES', [
            { titulo: 'ESFERA', chave: 'esfera', largura: 24 }, { titulo: 'CÓD. ÓRGÃO', chave: 'codOrgao', largura: 12 },
            { titulo: 'ÓRGÃO', chave: 'orgao', largura: 50 }, { titulo: 'SIGLA', chave: 'sigla', largura: 14 },
            { titulo: 'UO', chave: 'uo', largura: 40 }, { titulo: 'PROGRAMA', chave: 'programa', largura: 10 },
            { titulo: 'NOME DO PROGRAMA', chave: 'nomePrograma', largura: 40 }, { titulo: 'TIPO', chave: 'tipoAcao', largura: 18 },
            { titulo: 'AÇÃO', chave: 'codAcao', largura: 10 }, { titulo: 'NOME DA AÇÃO', chave: 'acao', largura: 60 },
            { titulo: 'REGIÃO', chave: 'regiao', largura: 8 }, { titulo: 'GND', chave: 'gnd', largura: 6 },
            { titulo: 'MODALIDADE', chave: 'modalidade', largura: 11 }, { titulo: 'FONTE (ID.FT.DT)', chave: 'fonteId', largura: 14 },
            { titulo: 'IDUSO', chave: 'iduso', largura: 7 }, { titulo: 'VALOR', chave: 'valor', moeda: true, largura: 18 },
            { titulo: 'EXPURGO', chave: 'expurgo', largura: 22 }
        ], loaCreditos.filter(c => creditoNoRecorte(c, prmRec))
            .map(c => Object.assign({}, c, { sigla: SIGLAS_ORGAO_LOA[c.codOrgao] || '', fonteId: `${c.id}.${c.ft}.${c.dt}`,
                expurgo: loaForaDoExecutivo(c) ? 'FORA DO EXECUTIVO' : '' })));
    } else if (loaLinhasArquivo.length) {
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
        let colunas = mappsColunasOriginais.map(c => ({ titulo: c, chave: c, fixo: true, moeda: /^VLR_/.test(c), largura: /^VLR_/.test(c) ? 18 : (c === 'MAPP' ? 60 : 16) }));
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
            { titulo: 'PROGRAMA', chave: 'programa', largura: 40 },
            { titulo: 'FONTE DO MAPP', chave: 'fonte', largura: 40 }, { titulo: 'ESTÁGIO', chave: 'estagio', largura: 26 },
            { titulo: 'LOA 2027 DO PAR', chave: 'loa', moeda: true, largura: 22 }, { titulo: 'NEC. 2027 AJUSTADA', chave: 'necAj', moeda: true, largura: 20 },
            { titulo: 'PROPOSTA AUTOMÁTICA', chave: 'auto', moeda: true, largura: 20 }, { titulo: 'PROPOSTA PROGRAMADO 2027', chave: 'proposta', moeda: true, largura: 22 },
            { titulo: 'ORIGEM', chave: 'origem', largura: 16 }, { titulo: 'GRADE', chave: 'grade', largura: 18 },
            { titulo: 'ACIMA DA NEC. AJUSTADA', chave: 'excede', largura: 14 }
        ], linhasAjustes.map(l => ({ mapp: l.mapp, orgao: l.orgao, programa: rotuloPrograma(l.programa, l.nomePrograma), fonte: l.fonte, estagio: l.estagio, loa: l.loaPar, necAj: l.necAj, auto: l.auto,
            proposta: propostaDe(l), origem: propostasManuais[l.chave] ? (propostasManuais[l.chave].origem === 'manual' ? 'editada' : 'redistribuída') : 'automática',
            grade: l.grade === 1 ? 'com necessidade' : 'sem necessidade', excede: propostaExcede(l) ? 'SIM' : '' })));
        adicionarAbaEstudo(wb, 'ALERTAS_FONTES', [
            { titulo: 'FONTE DO MAPP', chave: 'fonte', largura: 42 }, { titulo: 'SITUAÇÃO', chave: 'sit', largura: 16 },
            { titulo: 'LOA 2027', chave: 'loa', moeda: true, largura: 20 }, { titulo: 'PROPOSTA 2027', chave: 'proposta', moeda: true, largura: 20 },
            { titulo: 'DIFERENÇA (LOA − PROPOSTA)', chave: 'dif', moeda: true, largura: 24 }, { titulo: 'LOA SEM DESTINO', chave: 'semDestino', moeda: true, largura: 22 },
            { titulo: 'A DISTRIBUIR', chave: 'difDistribuivel', moeda: true, largura: 20 },
            { titulo: 'MAPPS', chave: 'qtd', largura: 10 }, { titulo: 'EDITADOS', chave: 'editados', largura: 10 }
        ], montarAlertasFontes({ fonte: '', orgao: '' }).map(a => Object.assign({}, a, { sit: ROTULO_ALERTA[a.status] })));
    }

    // LOA não alocada (aba 6): todos os itens e, com o PLOA, as ações (sem os filtros da tela).
    montarNaoAlocada();
    if (itensNaoAlocada.length) {
        adicionarAbaEstudo(wb, 'LOA_NAO_ALOCADA', [
            { titulo: 'CATEGORIA', chave: 'cat', largura: 20 }, { titulo: 'ÓRGÃO', chave: 'orgao', largura: 14 },
            { titulo: 'PROGRAMA', chave: 'prog', largura: 40 }, { titulo: 'FONTE', chave: 'fonte', largura: 42 },
            { titulo: 'SUB FONTES DA LOA', chave: 'subfontes', largura: 30 }, { titulo: 'LOA 2027', chave: 'loa', moeda: true, largura: 20 },
            { titulo: 'PROPOSTA', chave: 'proposta', moeda: true, largura: 20 }, { titulo: 'MAPPS', chave: 'qtd', largura: 9 },
            { titulo: 'NEC. 2027 AJUSTADA', chave: 'necAj', moeda: true, largura: 20 }, { titulo: 'NÃO ALOCADO', chave: 'valor', moeda: true, largura: 20 }
        ], itensNaoAlocada.slice().sort((a, b) => b.valor - a.valor).map(i => Object.assign({}, i, { cat: ROTULO_CAT_NA[i.categoria], prog: rotuloPrograma(i.programa, i.nomePrograma) })));
        let acoes = acoesNaoAlocada(itensNaoAlocada);
        if (acoes && acoes.length) adicionarAbaEstudo(wb, 'LOA_NAO_ALOCADA_ACOES', [
            { titulo: 'ÓRGÃO', chave: 'orgao', largura: 14 }, { titulo: 'PROGRAMA', chave: 'prog', largura: 40 },
            { titulo: 'AÇÃO', chave: 'codAcao', largura: 10 }, { titulo: 'NOME DA AÇÃO', chave: 'acao', largura: 60 },
            { titulo: 'TIPO', chave: 'tipo', largura: 18 }, { titulo: 'FONTES', chave: 'fontesTxt', largura: 40 },
            { titulo: 'REGIÕES', chave: 'regioesTxt', largura: 14 }, { titulo: 'CATEGORIAS', chave: 'catTxt', largura: 30 },
            { titulo: 'LOA DA AÇÃO', chave: 'loa', moeda: true, largura: 20 }, { titulo: 'NÃO ALOCADO', chave: 'valor', moeda: true, largura: 20 }
        ], acoes.map(a => Object.assign({}, a, { prog: rotuloPrograma(a.programa, a.nomePrograma), fontesTxt: [...a.fontes].join('; '),
            regioesTxt: [...a.regioes].sort().join(', '), catTxt: [...a.categorias].map(c => ROTULO_CAT_NA[c]).join('; ') })));
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
        ['Necessidade ÷ LOA', 'Necessidade 2027 Ajustada dos MAPPs ÷ LOA 2027 do órgão na fonte (' + (loaConferencia.origem === 'pdf' ? 'LOA de Investimento, do PDF por Órgão e Fonte' : 'planilha Fonte x Órgão: inclui pessoal, custeio e dívida') + ').']
    ].forEach((r, i) => { wsP.addRow(r); if (i === 0) wsP.getRow(1).font = { bold: true, size: 13 }; });

    await baixarWorkbook(wb, `SIPOG_Estudo_LOA_MAPPs_${carimboDataHora()}.xlsx`);
}

async function baixarWorkbook(wb, nomeArquivo) {
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

// ─── DE-PARA POR XLSX (aba 3) ───────────────────────────────────────────────
// Mesmo layout da aba DE_PARA_FONTES da exportação: baixar → editar a coluna FONTE DO MAPP → carregar.
const COLUNAS_DEPARA_XLSX = [
    { titulo: 'GRUPO', chave: 'grupo', largura: 14 }, { titulo: 'SUB FONTE', chave: 'subfonte', largura: 18 },
    { titulo: 'DESCRIÇÃO', chave: 'desc', largura: 60 }, { titulo: 'LOA 2027', chave: 'valor', moeda: true, largura: 20 },
    { titulo: 'REGRA', chave: 'regra', largura: 10 }, { titulo: 'FONTE DO MAPP', chave: 'fonte', largura: 42 }
];

function adicionarAbaDePara(wb) {
    let porSubfonte = {};
    loaLinhas.forEach(l => {
        if (!porSubfonte[l.subfonte]) porSubfonte[l.subfonte] = { grupo: l.grupo, subfonte: l.subfonte, desc: l.descSubfonte, valor: 0 };
        porSubfonte[l.subfonte].valor += l.valor;
    });
    adicionarAbaEstudo(wb, 'DE_PARA_FONTES', COLUNAS_DEPARA_XLSX, Object.values(porSubfonte).sort((a, b) => a.subfonte.localeCompare(b.subfonte)).map(s => {
        let ef = fonteEfetiva(s.subfonte);
        return Object.assign({}, s, { regra: ROTULO_REGRA_DEPARA[ef.fonte || ef.regra === 'manual' ? ef.regra : 'sem'], fonte: ef.fonte || '(sem fonte)' });
    }));
}

async function baixarDeParaXLSX() {
    if (typeof ExcelJS === 'undefined') return alert('A biblioteca de exportação (ExcelJS) não carregou — verifique a conexão.');
    if (!loaLinhas.length) return alert('Carregue a LOA antes de baixar o de-para.');
    let wb = new ExcelJS.Workbook();
    adicionarAbaDePara(wb);
    // Lista das fontes válidas (as da base de MAPPs), para copiar e colar na coluna FONTE DO MAPP.
    adicionarAbaEstudo(wb, 'FONTES_DO_MAPP', [{ titulo: 'FONTE DO MAPP', chave: 'fonte', largura: 50 }], fontesSIPOGDisponiveis().map(fonte => ({ fonte })));
    await baixarWorkbook(wb, `SIPOG_DePara_Fontes_${carimboDataHora()}.xlsx`);
}

// Lê SUB FONTE e FONTE DO MAPP (as demais colunas são ignoradas). "(sem fonte)" ou vazio = sem
// fonte; fonte que não existe na base de MAPPs é rejeitada. Grava no de-para manual.
function lerDeParaDeWorkbook(wb) {
    let ws = wb.worksheets.find(w => N(w.name).replace(/\s+/g, '_') === 'DE_PARA_FONTES') || wb.worksheets[0];
    let cab = {};
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => { cab[N(valorCelulaExcelJS(cell.value))] = col; });
    let colSub = cab['SUB FONTE'], colFonte = cab['FONTE DO MAPP'] || cab['FONTE SIPOG'] || cab['FONTE DO SIPOG'];
    if (!colSub || !colFonte) throw new Error(`A aba "${ws.name}" precisa das colunas SUB FONTE e FONTE DO MAPP.`);
    let linhas = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
        if (n === 1) return;
        let sub = String(valorCelulaExcelJS(row.getCell(colSub).value) || '').trim();
        if (!sub) return;
        linhas.push({ subfonte: sub, fonte: String(valorCelulaExcelJS(row.getCell(colFonte).value) || '').trim() });
    });
    return linhas;
}

function aplicarDeParaImportado(linhas) {
    let validas = new Set(fontesSIPOGDisponiveis());
    let conhecidas = new Set(loaLinhasArquivo.map(l => l.subfonte));
    // Sub fonte informada como código completo ou como FT.DT: usa a forma que a LOA carregada usa.
    let porCodigo = {};
    loaLinhasArquivo.forEach(l => (l.codigosSubfonte || []).forEach(c => { porCodigo[c] = l.subfonte; }));
    let r = { aplicadas: 0, iguais: 0, rejeitadas: [], ignoradas: [] };
    linhas.forEach(x => {
        let sub = conhecidas.has(x.subfonte) ? x.subfonte : porCodigo[x.subfonte];
        if (!sub) { r.ignoradas.push(x.subfonte); return; }
        let fonte = /^\(?sem fonte\)?$/i.test(x.fonte) ? '' : x.fonte;
        if (fonte && !validas.has(fonte)) { r.rejeitadas.push(`${x.subfonte} → ${x.fonte}`); return; }
        if (fonteEfetiva(sub).fonte === fonte) { r.iguais++; return; }
        deParaManual[sub] = fonte;
        r.aplicadas++;
    });
    salvarDeParaManual();
    return r;
}

async function selecionarArquivoDePara(input) {
    let arquivo = input.files && input.files[0];
    if (!arquivo) return;
    let status = document.getElementById('status-depara-xlsx');
    try {
        if (!loaLinhas.length || !mappsBrutos.length) throw new Error('Carregue a LOA e a base de MAPPs antes do de-para.');
        let wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await lerArquivoComoBuffer(arquivo));
        let r = aplicarDeParaImportado(lerDeParaDeWorkbook(wb));
        recalcularEstudo();
        status.innerHTML = `<span class="ok">✅ ${escHtml(arquivo.name)}</span>: ${r.aplicadas} alterada(s), ${r.iguais} já iguais` +
            (r.rejeitadas.length ? `<br><span class="erro">✖ ${r.rejeitadas.length} rejeitada(s) — fonte que não existe na base de MAPPs: ${escHtml(r.rejeitadas.slice(0, 6).join('; '))}${r.rejeitadas.length > 6 ? '…' : ''}</span>` : '') +
            (r.ignoradas.length ? `<br><span class="aviso">⚠ ${r.ignoradas.length} sub fonte(s) que não estão na LOA carregada (ignoradas): ${escHtml(r.ignoradas.slice(0, 6).join(', '))}${r.ignoradas.length > 6 ? '…' : ''}</span>` : '');
    } catch (err) {
        console.error(err);
        status.innerHTML = `<span class="erro">❌ ${escHtml(err.message || err)}</span>`;
    } finally {
        input.value = '';
    }
}

// ─── INICIALIZAÇÃO ──────────────────────────────────────────────────────────
carregarDeParaManual();
restaurarParametrosEstudo();
(function abrirAbaInicial() {
    let aba = 'carga';
    try { aba = localStorage.getItem(CHAVE_ABA_LOCAL) || 'carga'; } catch (e) {}
    mostrarAbaEstudo(aba);
})();
