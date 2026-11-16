// SIPOG — js/projecao-redoc.js
// Projeção do exercício seguinte (ano base + 1) das despesas da extração do REDOC, por item de despesa.
// Página própria (projecao-redoc.html), separada do SIPOG: não lê nem grava o estado do SIPOG.
// Script clássico (escopo global, onclick inline). Usa do js/03: N, V, F, valorCelulaExcelJS, corrigirMojibake.
// Plano: docs/planos/2026-11-16-projecao-redoc-2027.md

// ─── ESTADO ─────────────────────────────────────────────────────────────────
let redocLinhas = [];          // linhas consolidadas (uma por chave), ver montarLinhaRedoc
let redocAnos = { empenho: [], base: 0, completos: [], limite: 0, exercicio: 0 };
let redocArquivo = null;       // { nome, lidas, carregadoEm }
let redocCritica = [];         // itens { nivel: 'erro'|'aviso'|'info', titulo, texto, exemplos }
let redocTotaisLidos = null;   // soma por coluna de valor, como veio do arquivo (antes de consolidar)
let redocDataCorte = '';       // AAAA-MM-DD

const CHAVE_ABA_REDOC = 'sipog_redoc_aba_v1';

// Cabeçalho do arquivo (normalizado por N e sem espaços repetidos) → campo da linha.
const COLUNAS_REDOC = {
    'SECRETARIA': 'sec', 'ORGAO': 'orgao', 'TIPO_MAPP': 'tipo', 'DSC_FONTE_MAPP': 'fonte', 'COD_MAPP': 'cod',
    'DSC_MAPP': 'mapp', 'DSC_GID': 'gid', 'CODIGO_COMPLETO': 'nat', 'GRUPO': 'grupo', 'DSC_GRUPO': 'dgrupo',
    'MODALIDADE': 'mod', 'DSC_MODALIDADE': 'dmod', 'ELEMENTO': 'elem', 'DSC_ELEMENTO': 'delem', 'ITEM': 'item', 'DSC_ITEM': 'ditem'
};
const OBRIGATORIAS_REDOC = ['SECRETARIA', 'ORGAO', 'TIPO_MAPP', 'DSC_FONTE_MAPP', 'COD_MAPP', 'DSC_MAPP', 'DSC_GID', 'CODIGO_COMPLETO'];
const SEM_FONTE = '(sem fonte)';

// ─── UTILITÁRIOS ────────────────────────────────────────────────────────────
function escR(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtMi(v) { return (Number(v || 0) / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function fmtPct(v, casas) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas === undefined ? 1 : casas, maximumFractionDigits: casas === undefined ? 1 : casas }) + '%';
}
function fmtNum(n) { return Number(n || 0).toLocaleString('pt-BR'); }
function cabecalhoNormalizado(h) { return N(corrigirMojibake(String(h || '').replace(/^﻿/, ''))).replace(/\s+/g, ' ').trim(); }
function textoLimpo(v) { return corrigirMojibake(String(v === null || v === undefined ? '' : v)).replace(/\s+/g, ' ').trim(); }
// Número no formato da extração: "2919999,26", "1.234,5", vazio = 0. null = não é número.
function numeroRedoc(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let t = String(v === null || v === undefined ? '' : v).trim();
    if (t === '') return 0;
    if (!/^-?[\d.]*(,\d*)?$/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) return null;
    return V(t);
}
function carimboDataHoraRedoc(data) {
    let d = data || new Date();
    let p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}${p(d.getMonth() + 1)}${d.getFullYear()}-${p(d.getHours())}${p(d.getMinutes())}`;
}
function dataBR(iso) { if (!iso) return '—'; let [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; }

// ─── LEITURA DO ARQUIVO ─────────────────────────────────────────────────────
// CSV: campo entre aspas só quando começa com aspas (os textos do REDOC têm aspas no meio, ex.: PROJETO "INTELIGENTES").
function dividirLinhaCSV(linha, sep) {
    let campos = [], i = 0, n = linha.length;
    while (i <= n) {
        if (linha[i] === '"') {
            let v = '', j = i + 1;
            while (j < n) {
                if (linha[j] === '"' && linha[j + 1] === '"') { v += '"'; j += 2; }
                else if (linha[j] === '"') { j++; break; }
                else v += linha[j++];
            }
            let fim = linha.indexOf(sep, j);
            campos.push(v + (fim < 0 ? linha.slice(j) : linha.slice(j, fim)));
            if (fim < 0) break;
            i = fim + 1;
        } else {
            let fim = linha.indexOf(sep, i);
            if (fim < 0) { campos.push(linha.slice(i)); break; }
            campos.push(linha.slice(i, fim));
            i = fim + 1;
        }
    }
    return campos;
}

function decodificarTexto(buffer) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch (e) { return new TextDecoder('windows-1252').decode(buffer); }
}

function lerCSVRedoc(buffer) {
    let texto = decodificarTexto(buffer).replace(/^﻿/, '');
    let linhas = texto.split(/\r?\n/);
    while (linhas.length && linhas[linhas.length - 1].trim() === '') linhas.pop();
    if (!linhas.length) return [];
    let cab = linhas[0];
    let sep = cab.includes(';') ? ';' : (cab.includes('\t') ? '\t' : ',');
    return linhas.map(l => dividirLinhaCSV(l, sep));
}

async function lerXLSXRedoc(buffer) {
    let wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    let ws = wb.worksheets[0];
    let matriz = [];
    ws.eachRow({ includeEmpty: false }, row => {
        let vals = [];
        for (let c = 1; c <= row.cellCount; c++) vals.push(valorCelulaExcelJS(row.getCell(c).value));
        matriz.push(vals);
    });
    return matriz;
}

// Data de corte no nome do arquivo: redoc_13-11-26.csv → 2026-11-13.
function dataCorteDoNome(nome) {
    let m = String(nome || '').match(/(\d{2})[-_.](\d{2})[-_.](\d{4}|\d{2})(?!\d)/);
    if (!m) return '';
    let ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    let d = new Date(ano, Number(m[2]) - 1, Number(m[1]));
    if (d.getDate() !== Number(m[1])) return '';
    return `${ano}-${m[2]}-${m[1]}`;
}

async function selecionarArquivoRedoc(input) {
    let arq = input.files && input.files[0];
    if (!arq) return;
    let st = document.getElementById('status-redoc');
    st.innerHTML = 'Lendo o arquivo…';
    try {
        let buffer = await arq.arrayBuffer();
        let matriz = /\.xlsx$/i.test(arq.name) ? await lerXLSXRedoc(buffer) : lerCSVRedoc(buffer);
        let r = interpretarMatrizRedoc(matriz);
        if (r.erros.length) {
            redocCritica = r.critica;
            renderizarCriticaRedoc();
            st.innerHTML = `<span class="erro">✖ Arquivo não carregado:</span> ${escR(arq.name)} — corrija os erros abaixo. ${redocLinhas.length ? 'A base anterior continua carregada.' : ''}`;
            return;
        }
        aplicarCargaRedoc(r, { nome: arq.name, lidas: matriz.length - 1, carregadoEm: new Date().toISOString() }, dataCorteDoNome(arq.name));
    } catch (err) {
        console.error(err);
        st.innerHTML = `<span class="erro">✖ Falha ao ler o arquivo:</span> ${escR(err.message || err)}`;
    } finally {
        input.value = '';
    }
}

function aplicarCargaRedoc(r, arquivo, dataCorte) {
    redocLinhas = r.linhas;
    redocAnos = r.anos;
    redocTotaisLidos = r.totaisLidos;
    redocCritica = r.critica;
    redocArquivo = arquivo;
    redocDataCorte = dataCorte || redocDataCorte || '';
    document.getElementById('data-corte').value = redocDataCorte;
    criticarDataCorte();
    atualizarAnosNaPagina();
    renderizarCargaRedoc();
    recalcularRedoc();
}

// Matriz (1ª linha = cabeçalho) → linhas consolidadas + crítica. Só erro estrutural bloqueia.
function interpretarMatrizRedoc(matriz) {
    let critica = [], erros = [];
    let erro = (titulo, texto, exemplos) => { erros.push(titulo); critica.push({ nivel: 'erro', titulo, texto, exemplos: exemplos || [] }); };
    if (!matriz || matriz.length < 2) { erro('Arquivo vazio', 'O arquivo não tem linhas de dados.'); return { erros, critica }; }

    let cab = matriz[0].map(cabecalhoNormalizado);
    let idx = {}, anosEmp = {}, anosLim = {};
    cab.forEach((h, i) => {
        if (COLUNAS_REDOC[h] && idx[COLUNAS_REDOC[h]] === undefined) idx[COLUNAS_REDOC[h]] = i;
        let m = h.match(/^EMPENHADO\s*\(?\s*(\d{4})\s*\)?$/); if (m) anosEmp[m[1]] = i;
        m = h.match(/^LIMITE\s*\(?\s*(\d{4})\s*\)?$/); if (m) anosLim[m[1]] = i;
    });
    let faltam = OBRIGATORIAS_REDOC.filter(c => idx[COLUNAS_REDOC[c]] === undefined);
    if (faltam.length) erro('Coluna obrigatória ausente', `Não encontrei: ${faltam.join(', ')}.`, [`Cabeçalho lido: ${matriz[0].join(' | ')}`]);
    let empenho = Object.keys(anosEmp).map(Number).sort((a, b) => a - b);
    if (empenho.length < 2) erro('Anos de empenho insuficientes', 'São precisas ao menos duas colunas "Empenhado (AAAA)" (um ano completo e o ano base).');
    if (erros.length) return { erros, critica };

    let base = empenho[empenho.length - 1];
    let anoLim = anosLim[base] !== undefined ? base : (Object.keys(anosLim).map(Number).sort().pop() || 0);
    let anos = { empenho, base, completos: empenho.slice(0, -1), limite: anoLim, exercicio: base + 1 };
    if (!anoLim) critica.push({ nivel: 'aviso', titulo: 'Sem coluna de Limite', texto: `Não há "Limite (${base})": o fechamento do ano base não terá teto.` });
    else if (anoLim !== base) critica.push({ nivel: 'aviso', titulo: 'Limite de outro ano', texto: `O limite é de ${anoLim}, mas o ano base é ${base}.` });

    let campoTxt = (row, k) => idx[k] === undefined ? '' : textoLimpo(row[idx[k]]);
    let mapa = new Map(), naoNumericos = [], semFonte = 0, exSemFonte = [], repetidas = 0, exRep = [], vazias = 0;
    let totaisLidos = {};
    empenho.forEach(a => totaisLidos['e' + a] = 0); totaisLidos.lim = 0;

    for (let r = 1; r < matriz.length; r++) {
        let row = matriz[r];
        if (!row || row.every(c => String(c === null || c === undefined ? '' : c).trim() === '')) continue;
        let vals = {}, valido = true;
        for (let a of empenho) {
            let n = numeroRedoc(row[anosEmp[a]]);
            if (n === null) { valido = false; naoNumericos.push(`linha ${r + 1}, Empenhado (${a}) = "${row[anosEmp[a]]}"`); n = 0; }
            vals['e' + a] = n; totaisLidos['e' + a] += n;
        }
        let lim = anoLim ? numeroRedoc(row[anosLim[anoLim]]) : 0;
        if (lim === null) { valido = false; naoNumericos.push(`linha ${r + 1}, Limite (${anoLim}) = "${row[anosLim[anoLim]]}"`); lim = 0; }
        vals.lim = lim; totaisLidos.lim += lim;
        if (!valido) continue;

        let l = {};
        for (let k in COLUNAS_REDOC) { let c = COLUNAS_REDOC[k]; l[c] = campoTxt(row, c); }
        l.nat = l.nat.replace(/\D/g, '');
        // Partes da natureza que faltarem saem do código completo (CC GG MM EE IIIII).
        if (!l.grupo) l.grupo = l.nat.slice(0, 2);
        if (!l.mod) l.mod = l.nat.slice(2, 4);
        if (!l.elem) l.elem = l.nat.slice(4, 6);
        if (!l.item) l.item = String(Number(l.nat.slice(6)) || '');
        l.elem = l.elem.padStart(2, '0'); l.mod = l.mod.padStart(2, '0');
        if (!l.fonte) { l.fonte = SEM_FONTE; semFonte++; if (exSemFonte.length < 10) exSemFonte.push(`${l.sec} · ${l.orgao} · ${l.tipo} · MAPP ${l.cod} · ${l.nat}`); }
        if (empenho.every(a => vals['e' + a] === 0) && vals.lim === 0) { vazias++; continue; }

        let chave = [l.orgao, l.tipo, l.cod, N(l.mapp), l.fonte, l.nat].join('|');
        let ex = mapa.get(chave);
        if (ex) {
            repetidas++;
            if (exRep.length < 10) exRep.push(`${l.orgao} · MAPP ${l.cod} · ${l.fonte} · ${l.nat}`);
            for (let k in vals) ex[k] += vals[k];
        } else {
            Object.assign(l, vals);
            l.chave = chave;
            mapa.set(chave, l);
        }
    }
    if (naoNumericos.length) erro('Valor que não é número', `${fmtNum(naoNumericos.length)} célula(s) de valor não puderam ser lidas como número.`, naoNumericos.slice(0, 10));
    if (erros.length) return { erros, critica };

    let linhas = [...mapa.values()];
    linhas.forEach(l => l.chaveRedoc = chaveRedocLinha(l));
    if (semFonte) critica.push({ nivel: 'aviso', titulo: 'Linhas sem fonte', texto: `${fmtNum(semFonte)} linha(s) sem DSC_FONTE_MAPP ficam com a fonte "${SEM_FONTE}".`, exemplos: exSemFonte });
    if (repetidas) critica.push({ nivel: 'aviso', titulo: 'Chave repetida (somada)', texto: `${fmtNum(repetidas)} linha(s) repetem Órgão × Tipo × MAPP × Fonte × natureza de outra linha; os valores foram somados numa só.`, exemplos: exRep });
    let neg = linhas.filter(l => empenho.some(a => l['e' + a] < 0) || l.lim < 0);
    if (neg.length) critica.push({ nivel: 'aviso', titulo: 'Valor negativo', texto: `${fmtNum(neg.length)} linha(s) com empenho ou limite negativo.`, exemplos: neg.slice(0, 10).map(descLinhaCurta) });
    if (anoLim === base) {
        let acima = linhas.filter(l => l.lim > 0 && l['e' + base] > l.lim + 0.005);
        if (acima.length) critica.push({ nivel: 'aviso', titulo: `Empenhado ${base} acima do Limite`, texto: `${fmtNum(acima.length)} linha(s), R$ ${fmtMi(acima.reduce((s, l) => s + l['e' + base] - l.lim, 0))} mi acima do limite.`, exemplos: acima.slice(0, 10).map(descLinhaCurta) });
        let soLim = linhas.filter(l => l.lim > 0 && l['e' + base] === 0);
        if (soLim.length) critica.push({ nivel: 'info', titulo: `Limite ${base} sem empenho`, texto: `${fmtNum(soLim.length)} linha(s) têm limite e ainda não empenharam (R$ ${fmtMi(soLim.reduce((s, l) => s + l.lim, 0))} mi). O tratamento fica nos parâmetros.` });
    }
    if (vazias) critica.push({ nivel: 'info', titulo: 'Linhas sem valor', texto: `${fmtNum(vazias)} linha(s) sem empenho em nenhum ano e sem limite foram ignoradas.` });
    critica.push({ nivel: 'info', titulo: 'Anos', texto: `Anos completos: ${anos.completos.join(', ')}. Ano base (parcial): ${base}. Exercício projetado: ${anos.exercicio}.` });
    return { erros, critica, linhas, anos, totaisLidos };
}

// Chave do REDOC: ORGAO__MAPP<n>__F<fonte6>__<natureza>; fonte6 = os 6 dígitos de "(500)-(501)".
function chaveRedocLinha(l) {
    let dig = (l.fonte.match(/\((\d+)\)/g) || []).map(x => x.replace(/\D/g, '')).join('');
    return `${l.orgao}__MAPP${l.cod}__F${dig || '000000'}__${l.nat}`;
}
function descLinhaCurta(l) { return `${l.orgao} · ${l.tipo} · MAPP ${l.cod} · ${l.fonte} · ${l.nat}`; }

// ─── DATA DE CORTE ──────────────────────────────────────────────────────────
function alterarDataCorte() {
    redocDataCorte = document.getElementById('data-corte').value || '';
    criticarDataCorte();
    renderizarCriticaRedoc();
    renderizarCargaRedoc();
}
function criticarDataCorte() {
    redocCritica = redocCritica.filter(c => c.titulo !== 'Data de corte');
    if (!redocAnos.base) return;
    if (!redocDataCorte) {
        redocCritica.push({ nivel: 'aviso', titulo: 'Data de corte', texto: 'Informe a data de corte do ano base (não foi possível lê-la do nome do arquivo).' });
    } else if (Number(redocDataCorte.slice(0, 4)) !== redocAnos.base) {
        redocCritica.push({ nivel: 'aviso', titulo: 'Data de corte', texto: `A data de corte (${dataBR(redocDataCorte)}) não é do ano base ${redocAnos.base}.` });
    }
}
function fracaoDoAno() {
    if (!redocDataCorte) return null;
    let d = new Date(redocDataCorte + 'T12:00:00'), ini = new Date(d.getFullYear(), 0, 1), fim = new Date(d.getFullYear() + 1, 0, 1);
    return (d - ini) / (fim - ini);
}

// ─── TELA: CARGA E CRÍTICA ──────────────────────────────────────────────────
function renderizarCriticaRedoc() {
    let el = document.getElementById('critica-redoc');
    if (!redocCritica.length) { el.style.display = 'none'; return; }
    let ordem = { erro: 0, aviso: 1, info: 2 };
    let itens = [...redocCritica].sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
    let nErro = itens.filter(c => c.nivel === 'erro').length, nAviso = itens.filter(c => c.nivel === 'aviso').length;
    let h = `<div class="critica-cab"><strong>Crítica do arquivo:</strong> `
        + (nErro ? `<span class="critica-erro">${nErro} erro(s)</span>` : '<span class="critica-ok">sem erros</span>')
        + (nAviso ? ` · <span class="critica-aviso">${nAviso} aviso(s)</span>` : '') + '</div>';
    for (let c of itens) {
        let cls = c.nivel === 'erro' ? 'critica-erro' : (c.nivel === 'aviso' ? 'critica-aviso' : '');
        let ex = (c.exemplos || []).length ? `<ul style="margin:4px 0 0 18px;">${c.exemplos.map(e => `<li>${escR(e)}</li>`).join('')}</ul>` : '';
        h += `<details class="critica-grupo ${cls}" ${c.nivel === 'erro' ? 'open' : ''}><summary>${c.nivel === 'erro' ? '✖' : (c.nivel === 'aviso' ? '⚠' : 'ℹ')} ${escR(c.titulo)}</summary><div>${escR(c.texto)}</div>${ex}</details>`;
    }
    el.innerHTML = h;
    el.style.display = 'block';
}

function somaCampo(linhas, campo) { let s = 0; for (let l of linhas) s += l[campo] || 0; return s; }

function renderizarCargaRedoc() {
    renderizarCriticaRedoc();
    let st = document.getElementById('status-redoc');
    if (!redocArquivo) return;
    let fr = fracaoDoAno();
    st.innerHTML = `<span class="ok">✔ ${escR(redocArquivo.nome)}</span> — ${fmtNum(redocArquivo.lidas)} linhas lidas, ${fmtNum(redocLinhas.length)} linhas consolidadas`
        + ` · data de corte ${dataBR(redocDataCorte)}${fr !== null ? ` (${fmtPct(fr)} do ano)` : ''}`;
    let a = redocAnos, cols = a.empenho.map(y => ({ c: 'e' + y, t: `Empenhado ${y}${y === a.base ? ' (parcial)' : ''}` }));
    if (a.limite) cols.push({ c: 'lim', t: `Limite ${a.limite}` });
    let h = `<h3 class="estudo-subtitulo">Conferência dos totais (R$)</h3><div class="estudo-tabela-wrap"><table><thead><tr><th class="sem-ordem">Coluna</th><th class="sem-ordem num">Soma no arquivo</th><th class="sem-ordem num">Soma carregada</th><th class="sem-ordem num">Linhas com valor</th></tr></thead><tbody>`;
    for (let k of cols) {
        let lido = redocTotaisLidos[k.c], carr = somaCampo(redocLinhas, k.c), n = redocLinhas.filter(l => l[k.c]).length;
        let ok = Math.abs(lido - carr) < 1;
        h += `<tr><td>${escR(k.t)}</td><td class="num">${F(lido)}</td><td class="num" ${ok ? '' : 'style="color:var(--danger);font-weight:700;"'}>${F(carr)}</td><td class="num">${fmtNum(n)}</td></tr>`;
    }
    h += '</tbody></table></div>';
    // Tamanho da base por dimensão.
    let dims = [['Secretarias', 'sec'], ['Órgãos', 'orgao'], ['Tipos de MAPP', 'tipo'], ['Fontes', 'fonte'], ['MAPPs (órgão × código)', l => l.orgao + '|' + l.cod], ['GIDs', 'gid'], ['Naturezas (11 dígitos)', 'nat'], ['Elementos', l => l.grupo + '.' + l.elem]];
    h += '<div class="estudo-resumo" style="margin-top:12px;">' + dims.map(([t, f]) => {
        let s = new Set(redocLinhas.map(l => typeof f === 'function' ? f(l) : l[f]));
        return `<div><span>${t}</span><b>${fmtNum(s.size)}</b></div>`;
    }).join('') + '</div>';
    document.getElementById('totais-carga').innerHTML = h;
}

function atualizarAnosNaPagina() {
    document.querySelectorAll('.ano-exercicio').forEach(e => e.textContent = redocAnos.exercicio || '');
    document.querySelectorAll('.ano-base').forEach(e => e.textContent = redocAnos.base || '');
}

// ─── PARÂMETROS ─────────────────────────────────────────────────────────────
// Classes de comportamento (teste retroativo de 16/11/2026, projetando 2025 com 2023–2024, no nível Órgão × Tipo × GID):
// Pessoal acerta com crescimento (WAPE 3,8%), custeio com índice (17%), investimento sem tendência (32%; com tendência, 53%);
// pontuais não seguem regra (~87%) e dívida/operação de crédito dependem de cronograma (~40%).
const CLASSES_REDOC = {
    'A-PESSOAL': { rotulo: 'A · Pessoal', desc: 'Pessoal recorrente: cresce de forma estável (vegetativo + reajuste).' },
    'A-CUSTEIO': { rotulo: 'A · Custeio recorrente', desc: 'Custeio recorrente (contratos, serviços, materiais): corrige por índice.' },
    'B-INVEST': { rotulo: 'B · Investimento', desc: 'Investimento: volátil; repete o fechamento corrigido, sem extrapolar tendência.' },
    'C-PONTUAL': { rotulo: 'C · Pontual', desc: 'Despesa pontual (DEA, sentenças, indenizações, FGO, aumento de capital): sem tendência.' },
    'E-CONTRATO': { rotulo: 'E · Contratual', desc: 'Dívida e operações de crédito: segue o cronograma dos contratos.' }
};
const ORDEM_CLASSES = Object.keys(CLASSES_REDOC);

// id do campo na aba 2 → valor padrão. Percentuais em % (4,5 = 4,5%).
const PADROES_REDOC = {
    'p-fat-A-PESSOAL': 1.22, 'p-fat-A-CUSTEIO': 1.10, 'p-fat-B-INVEST': 1.05, 'p-fat-C-PONTUAL': 1.00, 'p-fat-E-CONTRATO': 1.10,
    'p-veg': 2.0, 'p-reaj': 4.5, 'p-ipca': 4.5, 'p-real': 2.5, 'p-inv': 4.5,
    'p-pontual-regra': 'media_sem_maior', 'p-contrato-regra': 'fechamento',
    'p-cl-pontual-elem': '91, 92, 93, 77, 65', 'p-cl-pontual-gid': 'DEA',
    'p-cl-contrato-tipo': 'SERVIÇO DA DÍVIDA', 'p-cl-contrato-fonte': '754'
};
const PADROES_REDOC_CHECK = { 'p-limite-teto': true, 'p-incluir-so-limite': true };
const CHAVE_PARAMS_REDOC = 'sipog_redoc_params_v1';

let redocIndiceGid = {};       // GID → % próprio (substitui o índice da classe nas classes A e B)
let redocClasseManual = {};    // chave da linha → classe escolhida à mão
let redocValorManual = {};     // chave da linha → valor do exercício digitado à mão

function listaTexto(v) { return String(v || '').split(/[,;\n]/).map(x => N(x)).filter(Boolean); }

function lerParametrosRedoc() {
    let p = {};
    for (let id in PADROES_REDOC) {
        let el = document.getElementById(id), v = el ? el.value : PADROES_REDOC[id];
        p[id] = typeof PADROES_REDOC[id] === 'number' ? (v === '' || v === null || v === undefined ? PADROES_REDOC[id] : V(v)) : (v || PADROES_REDOC[id]);
    }
    for (let id in PADROES_REDOC_CHECK) { let el = document.getElementById(id); p[id] = el ? !!el.checked : PADROES_REDOC_CHECK[id]; }
    p.fator = {}; ORDEM_CLASSES.forEach(c => p.fator[c] = p['p-fat-' + c]);
    p.indice = {
        'A-PESSOAL': (p['p-veg'] + p['p-reaj']) / 100,
        'A-CUSTEIO': (p['p-ipca'] + p['p-real']) / 100,
        'B-INVEST': p['p-inv'] / 100
    };
    p.pontualElem = listaTexto(p['p-cl-pontual-elem']).map(e => e.padStart(2, '0'));
    p.pontualGid = listaTexto(p['p-cl-pontual-gid']);
    p.contratoTipo = listaTexto(p['p-cl-contrato-tipo']);
    p.contratoFonte = listaTexto(p['p-cl-contrato-fonte']);
    return p;
}

function coletarParametrosRedocTela() {
    let campos = {};
    for (let id in PADROES_REDOC) { let el = document.getElementById(id); if (el) campos[id] = el.value; }
    for (let id in PADROES_REDOC_CHECK) { let el = document.getElementById(id); if (el) campos[id] = el.checked; }
    return { campos, indiceGid: redocIndiceGid };
}
function aplicarParametrosRedocTela(p) {
    let campos = Object.assign({}, PADROES_REDOC, PADROES_REDOC_CHECK, (p && p.campos) || {});
    for (let id in campos) {
        let el = document.getElementById(id); if (!el) continue;
        if (el.type === 'checkbox') el.checked = !!campos[id];
        else el.value = typeof campos[id] === 'number' ? String(campos[id]).replace('.', ',') : campos[id];
    }
    redocIndiceGid = Object.assign({}, (p && p.indiceGid) || {});
}
function guardarParametrosRedocLocal() {
    try { localStorage.setItem(CHAVE_PARAMS_REDOC, JSON.stringify(coletarParametrosRedocTela())); } catch (e) {}
}
function restaurarPadroesRedoc() {
    if (!confirm('Voltar todos os parâmetros (fatores, índices, regras de classe e índices por GID) aos valores padrão?')) return;
    aplicarParametrosRedocTela(null);
    alterouParametroRedoc();
}
function alterouParametroRedoc() {
    guardarParametrosRedocLocal();
    recalcularRedoc();
}
function alterarIndiceGid(input) {
    let gid = input.dataset.gid, t = input.value.trim();
    if (t === '') delete redocIndiceGid[gid]; else redocIndiceGid[gid] = V(t);
    alterouParametroRedoc();
}

// ─── CLASSE E FECHAMENTO DO ANO BASE ────────────────────────────────────────
function classeAutomatica(l, p) {
    if (p.pontualElem.includes(l.elem) || p.pontualGid.includes(N(l.gid))) return 'C-PONTUAL';
    if (p.contratoTipo.includes(N(l.tipo))) return 'E-CONTRATO';
    let fonteCod = (l.fonte.match(/\((\d+)\)/) || [])[1] || '';
    if (p.contratoFonte.some(f => fonteCod === f || N(l.fonte).startsWith(f))) return 'E-CONTRATO';
    if (N(l.tipo) === 'PESSOAL') return 'A-PESSOAL';
    if (N(l.tipo) === 'INVESTIMENTO') return 'B-INVEST';
    return 'A-CUSTEIO';
}

// Fechamento = Emp. base × fator da classe; com Limite e "Limite como teto", não passa do limite
// (salvo se o empenhado já passou); nunca fica abaixo do já empenhado.
function fechamentoLinha(l, p) {
    let e = l['e' + redocAnos.base] || 0, lim = l.lim || 0, f = p.fator[l.classe];
    if (e === 0 && lim > 0) {
        return p['p-incluir-so-limite']
            ? { v: lim, regra: 'só limite', exp: `Sem empenho em ${redocAnos.base}: fechamento = Limite ${F(lim)}` }
            : { v: 0, regra: 'só limite (fora)', exp: `Sem empenho em ${redocAnos.base} e "linhas só com limite" desligado: 0` };
    }
    let bruto = e * f, v = bruto, exp = `${F(e)} × ${String(f).replace('.', ',')} = ${F(bruto)}`;
    if (p['p-limite-teto'] && lim > 0 && v > Math.max(lim, e)) { v = Math.max(lim, e); exp += ` → teto do Limite ${F(lim)}`; }
    if (v < e) { v = e; exp += ` → não fica abaixo do empenhado ${F(e)}`; }
    return { v, regra: 'fator', exp };
}

// Recalcula classe, fechamento e projeção de todas as linhas e redesenha as abas.
function recalcularRedoc() {
    if (!redocLinhas.length) return;
    let p = lerParametrosRedoc();
    for (let l of redocLinhas) {
        l.classeAuto = classeAutomatica(l, p);
        l.classe = redocClasseManual[l.chave] || l.classeAuto;
        let fc = fechamentoLinha(l, p);
        l.fech = fc.v; l.fechExp = fc.exp; l.fechRegra = fc.regra;
    }
    if (typeof projetarLinhasRedoc === 'function') projetarLinhasRedoc(p);
    renderizarParametrosRedoc(p);
    if (typeof renderizarProjecaoRedoc === 'function') renderizarProjecaoRedoc();
    if (typeof renderizarComportamentoRedoc === 'function') renderizarComportamentoRedoc(p);
}

// ─── TELA: PARÂMETROS ───────────────────────────────────────────────────────
function resumoPorClasse(linhas) {
    let r = {};
    ORDEM_CLASSES.forEach(c => r[c] = { n: 0, base: 0, lim: 0, fech: 0, proj: 0, hist: {} });
    for (let l of linhas) {
        let x = r[l.classe]; x.n++; x.base += l['e' + redocAnos.base] || 0; x.lim += l.lim || 0; x.fech += l.fech || 0; x.proj += l.proj || 0;
        for (let a of redocAnos.completos) x.hist[a] = (x.hist[a] || 0) + (l['e' + a] || 0);
    }
    return r;
}

function renderizarParametrosRedoc(p) {
    let el = document.getElementById('resumo-classes');
    if (!el) return;
    let a = redocAnos, r = resumoPorClasse(redocLinhas), ult = a.completos[a.completos.length - 1];
    let h = `<div class="estudo-tabela-wrap"><table><thead><tr><th class="sem-ordem">Classe</th><th class="sem-ordem num">Linhas</th>`
        + `<th class="sem-ordem num">Empenhado ${ult} (R$ mi)</th><th class="sem-ordem num">Empenhado ${a.base} parcial (R$ mi)</th><th class="sem-ordem num">Limite ${a.limite || a.base} (R$ mi)</th>`
        + `<th class="sem-ordem num" title="Empenhado do ano base × fator da classe, limitado pelo Limite quando ligado">Fechamento ${a.base} (R$ mi)</th>`
        + `<th class="sem-ordem num" title="Fechamento ÷ empenhado parcial">Fator efetivo</th><th class="sem-ordem num" title="Fechamento ÷ empenhado do último ano completo">Fechamento ÷ ${ult}</th></tr></thead><tbody>`;
    let t = { n: 0, u: 0, base: 0, lim: 0, fech: 0 };
    for (let c of ORDEM_CLASSES) {
        let x = r[c], u = x.hist[ult] || 0;
        t.n += x.n; t.u += u; t.base += x.base; t.lim += x.lim; t.fech += x.fech;
        h += `<tr><td><span class="estudo-tag cl-${c}" title="${escR(CLASSES_REDOC[c].desc)}">${CLASSES_REDOC[c].rotulo}</span></td><td class="num">${fmtNum(x.n)}</td><td class="num">${fmtMi(u)}</td><td class="num">${fmtMi(x.base)}</td><td class="num">${fmtMi(x.lim)}</td><td class="num">${fmtMi(x.fech)}</td>`
            + `<td class="num">${x.base ? (x.fech / x.base).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '—'}</td><td class="num">${u ? fmtPct(x.fech / u - 1) : '—'}</td></tr>`;
    }
    h += `</tbody><tfoot><tr><td>Total</td><td class="num">${fmtNum(t.n)}</td><td class="num">${fmtMi(t.u)}</td><td class="num">${fmtMi(t.base)}</td><td class="num">${fmtMi(t.lim)}</td><td class="num">${fmtMi(t.fech)}</td><td class="num">${t.base ? (t.fech / t.base).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '—'}</td><td class="num">${t.u ? fmtPct(t.fech / t.u - 1) : '—'}</td></tr></tfoot></table></div>`;
    el.innerHTML = h;
    renderizarIndicesGid();
}

function renderizarIndicesGid() {
    let el = document.getElementById('indices-gid');
    if (!el) return;
    let p = lerParametrosRedoc(), g = {};
    for (let l of redocLinhas) {
        let x = g[l.gid] = g[l.gid] || { gid: l.gid, fech: 0, porClasse: {} };
        x.fech += l.fech; x.porClasse[l.classe] = (x.porClasse[l.classe] || 0) + l.fech;
    }
    let lista = Object.values(g).sort((a, b) => b.fech - a.fech);
    let h = `<div class="estudo-tabela-wrap" style="max-height:420px;"><table><thead><tr><th class="sem-ordem">GID</th><th class="sem-ordem">Classe predominante</th><th class="sem-ordem num">Fechamento ${redocAnos.base} (R$ mi)</th><th class="sem-ordem num">Índice da classe</th><th class="sem-ordem num" title="Deixe em branco para usar o índice da classe. Vale só para as classes A e B.">Índice próprio (%)</th></tr></thead><tbody>`;
    for (let x of lista) {
        let pred = Object.entries(x.porClasse).sort((a, b) => b[1] - a[1])[0][0];
        let ind = p.indice[pred];
        let proprio = redocIndiceGid[x.gid];
        h += `<tr><td>${escR(x.gid)}</td><td><span class="estudo-tag cl-${pred}">${CLASSES_REDOC[pred].rotulo}</span></td><td class="num">${fmtMi(x.fech)}</td><td class="num">${ind === undefined ? 'não se aplica' : fmtPct(ind)}</td>`
            + `<td class="num"><input class="input-valor" style="width:90px;" data-gid="${escR(x.gid)}" value="${proprio === undefined ? '' : String(proprio).replace('.', ',')}" placeholder="—" onchange="alterarIndiceGid(this)"></td></tr>`;
    }
    el.innerHTML = h + '</tbody></table></div>';
}

// ─── NAVEGAÇÃO E TEMA ───────────────────────────────────────────────────────
function mostrarAbaRedoc(aba) {
    if (!document.querySelector(`.estudo-aba[data-aba="${aba}"]`)) aba = 'carga';
    document.querySelectorAll('.estudo-aba').forEach(s => s.classList.toggle('ativa', s.dataset.aba === aba));
    document.querySelectorAll('.estudo-menu-item').forEach(b => b.classList.toggle('ativo', b.dataset.aba === aba));
    try { localStorage.setItem(CHAVE_ABA_REDOC, aba); } catch (e) {}
    window.scrollTo({ top: 0 });
}
function alternarTemaRedoc() {
    let novo = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', novo);
    try { localStorage.setItem('spopic_theme', novo); } catch (e) {}
}

function iniciarRedoc() {
    try { let t = localStorage.getItem('spopic_theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}
    let salvos = null;
    try { salvos = JSON.parse(localStorage.getItem(CHAVE_PARAMS_REDOC) || 'null'); } catch (e) {}
    aplicarParametrosRedocTela(salvos);
    let aba = 'carga';
    try { aba = localStorage.getItem(CHAVE_ABA_REDOC) || 'carga'; } catch (e) {}
    mostrarAbaRedoc(aba);
}
iniciarRedoc();
