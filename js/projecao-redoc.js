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
    restaurarManuaisRedoc(arquivo.nome);
    expandidosRedoc.clear();
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

// ─── PROJEÇÃO DO EXERCÍCIO ──────────────────────────────────────────────────
const ROTULO_REGRA_PONTUAL = { media_sem_maior: 'média sem o maior ano', media: 'média dos anos completos', fechamento: 'fechamento do ano base', zero: 'zero' };
const ROTULO_REGRA_CONTRATO = { fechamento: 'fechamento do ano base — informar cronograma', limite: 'limite do ano base', zero: 'zero' };

function projecaoAutomatica(l, p) {
    let a = redocAnos, c = l.classe;
    if (c === 'A-PESSOAL' || c === 'A-CUSTEIO' || c === 'B-INVEST') {
        let proprio = redocIndiceGid[l.gid], i = proprio !== undefined ? proprio / 100 : p.indice[c];
        return { v: l.fech * (1 + i), regra: proprio !== undefined ? 'índice do GID' : 'índice da classe', exp: `Fechamento ${F(l.fech)} × (1 + ${fmtPct(i, 2)})${proprio !== undefined ? ' (índice próprio do GID)' : ''}` };
    }
    if (c === 'C-PONTUAL') {
        let regra = p['p-pontual-regra'], hist = a.completos.map(y => l['e' + y] || 0);
        if (regra === 'zero') return { v: 0, regra: 'pontual: zero', exp: 'Pontual: zero (informar à mão)' };
        if (regra === 'fechamento') return { v: l.fech, regra: 'pontual: fechamento', exp: `Pontual: fechamento ${F(l.fech)}` };
        let usados = hist.slice(), tirado = null;
        if (regra === 'media_sem_maior' && usados.length >= 3) { let m = Math.max(...usados); tirado = m; usados.splice(usados.indexOf(m), 1); }
        let v = usados.reduce((s, x) => s + x, 0) / (usados.length || 1);
        return { v, regra: 'pontual: ' + ROTULO_REGRA_PONTUAL[regra], exp: `Pontual: média de ${usados.map(F).join(' + ')}${tirado !== null ? ` (sem o maior, ${F(tirado)})` : ''} = ${F(v)}` };
    }
    let regra = p['p-contrato-regra'];
    if (regra === 'limite') return { v: l.lim || 0, regra: 'contratual: limite', exp: `Contratual: Limite ${F(l.lim)}` };
    if (regra === 'zero') return { v: 0, regra: 'contratual: zero', exp: 'Contratual: zero (informar à mão)' };
    return { v: l.fech, regra: 'contratual: fechamento', exp: `Contratual: fechamento ${F(l.fech)} — conferir com o cronograma do contrato` };
}

function projetarLinhasRedoc(p) {
    for (let l of redocLinhas) {
        let r = projecaoAutomatica(l, p);
        l.projAuto = r.v;
        if (redocValorManual[l.chave] !== undefined) {
            l.proj = redocValorManual[l.chave]; l.projRegra = 'manual'; l.projExp = `Valor digitado: ${F(l.proj)} (regra daria ${F(r.v)} — ${r.exp})`;
        } else { l.proj = r.v; l.projRegra = r.regra; l.projExp = r.exp; }
    }
}

// ─── AJUSTES MANUAIS (guardados por arquivo neste navegador) ────────────────
const CHAVE_MANUAIS_REDOC = 'sipog_redoc_manuais_v1';
function guardarManuaisRedoc() {
    if (!redocArquivo) return;
    try {
        let todos = JSON.parse(localStorage.getItem(CHAVE_MANUAIS_REDOC) || '{}');
        todos[redocArquivo.nome] = { classe: redocClasseManual, valor: redocValorManual };
        localStorage.setItem(CHAVE_MANUAIS_REDOC, JSON.stringify(todos));
    } catch (e) {}
}
function restaurarManuaisRedoc(nome) {
    redocClasseManual = {}; redocValorManual = {};
    try {
        let m = JSON.parse(localStorage.getItem(CHAVE_MANUAIS_REDOC) || '{}')[nome];
        if (m) { redocClasseManual = m.classe || {}; redocValorManual = m.valor || {}; }
    } catch (e) {}
    let chaves = new Set(redocLinhas.map(l => l.chave));
    for (let k in redocClasseManual) if (!chaves.has(k)) delete redocClasseManual[k];
    for (let k in redocValorManual) if (!chaves.has(k)) delete redocValorManual[k];
}
function linhaPorChave(chave) { return redocLinhas.find(l => l.chave === chave); }
function alterarClasseRedoc(sel) {
    let l = linhaPorChave(sel.dataset.chave); if (!l) return;
    if (sel.value === l.classeAuto) delete redocClasseManual[l.chave]; else redocClasseManual[l.chave] = sel.value;
    guardarManuaisRedoc(); recalcularRedoc();
}
function editarValorRedoc(input) {
    let chave = input.dataset.chave, t = input.value.trim();
    if (t === '') delete redocValorManual[chave]; else redocValorManual[chave] = valorDigitado(t);
    guardarManuaisRedoc(); recalcularRedoc();
}
function voltarRegraRedoc(chave) {
    delete redocValorManual[chave]; delete redocClasseManual[chave];
    guardarManuaisRedoc(); recalcularRedoc();
}
function descartarManuaisRedoc() {
    let n = Object.keys(redocValorManual).length + Object.keys(redocClasseManual).length;
    if (!n || !confirm(`Descartar ${n} ajuste(s) manual(is) de valor e de classe?`)) return;
    redocValorManual = {}; redocClasseManual = {};
    guardarManuaisRedoc(); recalcularRedoc();
}

// ─── TELA: PROJEÇÃO (grade em árvore Secretaria → Órgão → Tipo → GID → linhas) ──
const NIVEIS_ARVORE = [['sec', 'Secretaria'], ['orgao', 'Órgão'], ['tipo', 'Tipo de MAPP'], ['gid', 'GID']];
const MAX_LINHAS_NO = 300;
let expandidosRedoc = new Set();
let filtrosRedoc = { sec: '', tipo: '', classe: '', fonte: '', busca: '', editadas: false };

function fmtR(v) { let n = Math.round(Number(v || 0)); return n === 0 ? '-' : n.toLocaleString('pt-BR'); }
function celVar(proj, fech) {
    if (!fech) return `<td class="num">${proj ? 'novo' : '—'}</td>`;
    let v = proj / fech - 1, cls = Math.abs(v) < 0.0005 ? '' : (v > 0 ? 'var-pos' : 'var-neg');
    return `<td class="num ${cls}">${fmtPct(v)}</td>`;
}

function linhasFiltradasRedoc() {
    let f = filtrosRedoc, b = N(f.busca);
    return redocLinhas.filter(l => (!f.sec || l.sec === f.sec) && (!f.tipo || l.tipo === f.tipo) && (!f.classe || l.classe === f.classe)
        && (!f.fonte || l.fonte === f.fonte)
        && (!f.editadas || redocValorManual[l.chave] !== undefined || redocClasseManual[l.chave] !== undefined)
        && (!b || N(`${l.orgao} ${l.cod} ${l.mapp} ${l.nat} ${l.ditem} ${l.delem} ${l.fonte}`).includes(b)));
}

function preencherFiltroRedoc(id, valores, rotuloTodos, atual) {
    let el = document.getElementById(id); if (!el) return;
    el.innerHTML = `<option value="">${rotuloTodos}</option>` + valores.map(([v, t]) => `<option value="${escR(v)}" ${v === atual ? 'selected' : ''}>${escR(t)}</option>`).join('');
}
function alterarFiltroRedoc() {
    filtrosRedoc = {
        sec: document.getElementById('f-sec').value, tipo: document.getElementById('f-tipo').value,
        classe: document.getElementById('f-classe').value, fonte: document.getElementById('f-fonte').value,
        busca: document.getElementById('f-busca').value, editadas: document.getElementById('f-editadas').checked
    };
    renderizarProjecaoRedoc();
}
function limparFiltrosRedoc() {
    ['f-sec', 'f-tipo', 'f-classe', 'f-fonte', 'f-busca'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('f-editadas').checked = false;
    alterarFiltroRedoc();
}
function alternarNoRedoc(caminho) {
    if (expandidosRedoc.has(caminho)) expandidosRedoc.delete(caminho); else expandidosRedoc.add(caminho);
    renderizarProjecaoRedoc();
}
function recolherTudoRedoc() { expandidosRedoc.clear(); renderizarProjecaoRedoc(); }

function somarNo(linhas) {
    let s = { fech: 0, proj: 0, lim: 0, n: linhas.length };
    redocAnos.empenho.forEach(a => s['e' + a] = 0);
    for (let l of linhas) { s.fech += l.fech; s.proj += l.proj; s.lim += l.lim || 0; for (let a of redocAnos.empenho) s['e' + a] += l['e' + a] || 0; }
    return s;
}
function celulasValores(s, titFech, titProj) {
    let t = x => x ? ` title="${escR(x)}"` : '';
    return redocAnos.empenho.map(a => `<td class="num">${fmtR(s['e' + a])}</td>`).join('')
        + `<td class="num">${fmtR(s.lim)}</td><td class="num"${t(titFech)}>${fmtR(s.fech)}</td><td class="num"${t(titProj)}><strong>${fmtR(s.proj)}</strong></td>` + celVar(s.proj, s.fech);
}
// Valor digitado: "1.234.567", "1234567,89", "R$ 1.234,5".
function valorDigitado(t) {
    t = String(t || '').replace(/R\$\s*/, '').replace(/\s/g, '');
    if (t.includes(',')) return V(t);
    if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
    return parseFloat(t) || 0;
}

function renderizarProjecaoRedoc() {
    let el = document.getElementById('grade-projecao');
    if (!el || !redocLinhas.length) return;
    let a = redocAnos, f = filtrosRedoc;
    let uniq = campo => [...new Set(redocLinhas.map(l => l[campo]))].sort((x, y) => x.localeCompare(y, 'pt-BR')).map(v => [v, v]);
    preencherFiltroRedoc('f-sec', uniq('sec'), '(todas as secretarias)', f.sec);
    preencherFiltroRedoc('f-tipo', uniq('tipo'), '(todos os tipos)', f.tipo);
    preencherFiltroRedoc('f-fonte', uniq('fonte'), '(todas as fontes)', f.fonte);
    preencherFiltroRedoc('f-classe', ORDEM_CLASSES.map(c => [c, CLASSES_REDOC[c].rotulo]), '(todas as classes)', f.classe);

    let linhas = linhasFiltradasRedoc(), tot = somarNo(linhas);
    let nManuais = Object.keys(redocValorManual).length, nClasse = Object.keys(redocClasseManual).length;
    document.getElementById('cards-projecao').innerHTML =
        `<div title="Soma do fechamento das linhas filtradas"><span>Fechamento ${a.base}</span><b>R$ ${fmtMi(tot.fech)} mi</b></div>`
        + `<div title="Soma da projeção das linhas filtradas"><span>Projeção ${a.exercicio}</span><b>R$ ${fmtMi(tot.proj)} mi</b></div>`
        + `<div><span>Variação sobre o fechamento</span><b>${tot.fech ? fmtPct(tot.proj / tot.fech - 1) : '—'}</b></div>`
        + `<div><span>Último ano completo (${a.completos[a.completos.length - 1]})</span><b>R$ ${fmtMi(tot['e' + a.completos[a.completos.length - 1]])} mi</b></div>`
        + `<div><span>Linhas no filtro</span><b>${fmtNum(linhas.length)}</b></div>`
        + `<div title="Valores digitados e classes trocadas à mão (em todas as linhas)"><span>Ajustes manuais</span><b>${fmtNum(nManuais)} valor(es) · ${fmtNum(nClasse)} classe(s)</b></div>`;

    let cab = `<tr><th class="sem-ordem">Secretaria › Órgão › Tipo › GID › linha</th>`
        + a.empenho.map(y => `<th class="sem-ordem num" title="Empenhado ${y}${y === a.base ? ` até ${dataBR(redocDataCorte)}` : ''}">${y}${y === a.base ? ' parcial' : ''}</th>`).join('')
        + `<th class="sem-ordem num">Limite ${a.limite || a.base}</th><th class="sem-ordem num" title="Empenhado parcial × fator da classe (aba 2), com o Limite como teto">Fechamento ${a.base}</th>`
        + `<th class="sem-ordem num" title="Fechamento corrigido pela regra da classe, ou o valor digitado">Projeção ${a.exercicio}</th><th class="sem-ordem num" title="Projeção ÷ fechamento − 1">Var.</th>`
        + `<th class="sem-ordem">Classe</th><th class="sem-ordem">Regra</th><th class="sem-ordem" title="Digite para substituir a regra; em branco volta à regra">Valor manual</th></tr>`;
    let ncol = a.empenho.length + 8;
    let corpo = [];
    let montar = (lista, nivel, caminho) => {
        if (nivel === NIVEIS_ARVORE.length) {
            let ordenadas = lista.slice().sort((x, y) => y.proj - x.proj);
            ordenadas.slice(0, MAX_LINHAS_NO).forEach(l => corpo.push(linhaFolhaRedoc(l)));
            if (ordenadas.length > MAX_LINHAS_NO) corpo.push(`<tr class="linha-aviso"><td colspan="${ncol}">Mostrando ${MAX_LINHAS_NO} de ${fmtNum(ordenadas.length)} linhas (as de maior projeção). Use a busca para achar as demais.</td></tr>`);
            return;
        }
        let campo = NIVEIS_ARVORE[nivel][0], grupos = new Map();
        for (let l of lista) { let k = l[campo]; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(l); }
        let ordem = [...grupos.entries()].map(([k, ls]) => [k, ls, somarNo(ls)]).sort((x, y) => y[2].proj - x[2].proj);
        for (let [k, ls, s] of ordem) {
            let cam = caminho + '¦' + k, aberto = expandidosRedoc.has(cam);
            let mix = {}; ls.forEach(l => mix[l.classe] = (mix[l.classe] || 0) + l.proj);
            let tags = Object.entries(mix).sort((x, y) => y[1] - x[1]).map(([c]) => `<span class="estudo-tag cl-${c}" title="${escR(CLASSES_REDOC[c].rotulo)}">${c[0]}</span>`).join(' ');
            corpo.push(`<tr class="no-arvore nivel-${nivel}" onclick="alternarNoRedoc(this.dataset.cam)" data-cam="${escR(cam)}"><td><span class="seta">${aberto ? '▾' : '▸'}</span> ${escR(k)} <span style="color:var(--muted);font-weight:400;font-size:11px;">(${fmtNum(ls.length)})</span></td>${celulasValores(s)}<td>${tags}</td><td></td><td></td></tr>`);
            if (aberto) montar(ls, nivel + 1, cam);
        }
    };
    montar(linhas, 0, '');
    el.innerHTML = `<div class="estudo-tabela-wrap" style="max-height:none;"><table><thead>${cab}</thead><tbody>${corpo.join('') || `<tr><td colspan="${ncol}" class="estudo-nota">Nenhuma linha no filtro.</td></tr>`}</tbody>`
        + `<tfoot><tr><td>Total do filtro</td>${celulasValores(tot)}<td colspan="3"></td></tr></tfoot></table></div>`;
}

function linhaFolhaRedoc(l) {
    let editada = redocValorManual[l.chave] !== undefined, classeTrocada = redocClasseManual[l.chave] !== undefined;
    let opts = ORDEM_CLASSES.map(c => `<option value="${c}" ${c === l.classe ? 'selected' : ''}>${CLASSES_REDOC[c].rotulo}${c === l.classeAuto ? ' (auto)' : ''}</option>`).join('');
    let chave = escR(l.chave);
    let s = Object.assign({ fech: l.fech, proj: l.proj, lim: l.lim }, ...redocAnos.empenho.map(a => ({ ['e' + a]: l['e' + a] })));
    let cels = celulasValores(s, l.fechExp, l.projExp);
    return `<tr class="nivel-4 ${editada || classeTrocada ? 'linha-editada' : ''}">`
        + `<td title="${escR(`${l.mapp}\n${l.fonte}\nNatureza ${l.nat} — ${l.delem} / ${l.ditem}\nChave REDOC: ${l.chaveRedoc}`)}"><span class="txt-mapp"><strong>MAPP ${escR(l.cod)}</strong> — ${escR(l.mapp)}</span><span style="color:var(--muted);">${escR(l.fonte)} · ${escR(l.nat)} ${escR(l.ditem)}</span></td>`
        + cels
        + `<td><select class="select-classe" data-chave="${chave}" onchange="alterarClasseRedoc(this)" onclick="event.stopPropagation()">${opts}</select></td>`
        + `<td style="font-size:11px;min-width:130px;">${escR(l.projRegra)}</td>`
        + `<td style="white-space:nowrap;"><input class="input-valor" data-chave="${chave}" value="${editada ? fmtR(redocValorManual[l.chave]) : ''}" placeholder="${fmtR(l.projAuto)}" onchange="editarValorRedoc(this)">`
        + `${editada || classeTrocada ? ` <button class="btn-link" title="Volta à classe e à regra automáticas" onclick="voltarRegraRedoc(this.dataset.chave)" data-chave="${chave}">↺</button>` : ''}</td></tr>`;
}

// ─── TELA: COMPORTAMENTO E TESTE RETROATIVO ─────────────────────────────────
const DIMENSOES_REDOC = {
    tipo: { rotulo: 'Tipo de MAPP', f: l => l.tipo },
    classe: { rotulo: 'Classe', f: l => CLASSES_REDOC[l.classe].rotulo },
    gid: { rotulo: 'GID', f: l => l.gid },
    fonte: { rotulo: 'Fonte', f: l => l.fonte },
    sec: { rotulo: 'Secretaria', f: l => l.sec },
    elemento: { rotulo: 'Grupo.Elemento', f: l => `${l.grupo}.${l.elem} ${l.delem}` }
};

function cagr(primeiro, ultimo, anos) { return primeiro > 0 && ultimo > 0 && anos > 0 ? Math.pow(ultimo / primeiro, 1 / anos) - 1 : null; }
function coefVar(vals) {
    let m = vals.reduce((s, x) => s + x, 0) / vals.length;
    if (!m) return null;
    return Math.sqrt(vals.reduce((s, x) => s + (x - m) * (x - m), 0) / vals.length) / m;
}

function renderizarComportamentoRedoc(p) {
    let el = document.getElementById('comp-serie');
    if (!el || !redocLinhas.length) return;
    p = p || lerParametrosRedoc();
    let a = redocAnos, cs = a.completos, ult = cs[cs.length - 1];
    let dimSel = document.getElementById('c-dim'), dim = DIMENSOES_REDOC[dimSel.value] ? dimSel.value : 'tipo';

    // 1. Série por dimensão
    let g = new Map();
    for (let l of redocLinhas) {
        let k = DIMENSOES_REDOC[dim].f(l), x = g.get(k);
        if (!x) { x = { k, fech: 0, proj: 0 }; a.empenho.forEach(y => x['e' + y] = 0); g.set(k, x); }
        a.empenho.forEach(y => x['e' + y] += l['e' + y] || 0); x.fech += l.fech; x.proj += l.proj;
    }
    let lista = [...g.values()].sort((x, y) => y['e' + ult] - x['e' + ult]);
    let tot = { k: 'Total', fech: 0, proj: 0 }; a.empenho.forEach(y => tot['e' + y] = 0);
    lista.forEach(x => { a.empenho.forEach(y => tot['e' + y] += x['e' + y]); tot.fech += x.fech; tot.proj += x.proj; });
    let linhaSerie = (x, tag) => {
        let c = cagr(x['e' + cs[0]], x['e' + ult], cs.length - 1), cv = coefVar(cs.map(y => x['e' + y]));
        return `<${tag}><td>${escR(x.k)}</td>` + a.empenho.map(y => `<td class="num">${fmtMi(x['e' + y])}</td>`).join('')
            + `<td class="num">${fmtMi(x.fech)}</td><td class="num"><strong>${fmtMi(x.proj)}</strong></td>`
            + `<td class="num">${fmtPct(c)}</td><td class="num">${cv === null ? '—' : cv.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>`
            + `<td class="num">${x['e' + ult] ? fmtPct(x.proj / x['e' + ult] - 1) : '—'}</td></${tag}>`;
    };
    el.innerHTML = `<div class="estudo-tabela-wrap" style="max-height:520px;"><table><thead><tr><th class="sem-ordem">${DIMENSOES_REDOC[dim].rotulo}</th>`
        + a.empenho.map(y => `<th class="sem-ordem num">${y}${y === a.base ? ' parcial' : ''}</th>`).join('')
        + `<th class="sem-ordem num">Fechamento ${a.base}</th><th class="sem-ordem num">Projeção ${a.exercicio}</th>`
        + `<th class="sem-ordem num" title="Crescimento médio anual de ${cs[0]} a ${ult}">Cresc. a.a. ${cs[0]}–${ult}</th>`
        + `<th class="sem-ordem num" title="Coeficiente de variação dos anos completos (desvio-padrão ÷ média): acima de 0,25 indica despesa volátil">Variação (CV)</th>`
        + `<th class="sem-ordem num" title="Projeção ÷ último ano completo − 1">Proj. ÷ ${ult}</th></tr></thead><tbody>`
        + lista.map(x => linhaSerie(x, 'tr')).join('') + `</tbody><tfoot>${linhaSerie(tot, 'tr')}</tfoot></table></div>`;

    // 2. Padrão de ocorrência (anos com empenho) por linha
    let pad = new Map();
    for (let l of redocLinhas) {
        let k = a.empenho.map(y => (l['e' + y] || 0) > 0 ? '■' : '·').join(' ');
        let x = pad.get(k) || { k, n: 0, ult: 0, base: 0, fech: 0, proj: 0 };
        x.n++; x.ult += l['e' + ult] || 0; x.base += l['e' + a.base] || 0; x.fech += l.fech; x.proj += l.proj; pad.set(k, x);
    }
    let pads = [...pad.values()].sort((x, y) => (y.fech + y.ult) - (x.fech + x.ult));
    document.getElementById('comp-padrao').innerHTML = `<div class="estudo-tabela-wrap" style="max-height:420px;"><table><thead><tr><th class="sem-ordem" title="■ = empenhou no ano; · = não empenhou">${a.empenho.join(' ')}</th><th class="sem-ordem num">Linhas</th><th class="sem-ordem num">Empenhado ${ult} (R$ mi)</th><th class="sem-ordem num">${a.base} parcial (R$ mi)</th><th class="sem-ordem num">Fechamento (R$ mi)</th><th class="sem-ordem num">Projeção (R$ mi)</th></tr></thead><tbody>`
        + pads.map(x => `<tr><td style="font-family:monospace;letter-spacing:2px;">${x.k}</td><td class="num">${fmtNum(x.n)}</td><td class="num">${fmtMi(x.ult)}</td><td class="num">${fmtMi(x.base)}</td><td class="num">${fmtMi(x.fech)}</td><td class="num">${fmtMi(x.proj)}</td></tr>`).join('')
        + '</tbody></table></div>';

    // 3. Picos: maior ano completo > R$ 50 mi e > 3× a mediana dos anos completos
    let mediana = v => { let s = v.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    let picos = redocLinhas.map(l => { let v = cs.map(y => l['e' + y] || 0), mx = Math.max(...v); return { l, mx, ano: cs[v.indexOf(mx)], med: mediana(v) }; })
        .filter(x => x.mx > 50e6 && x.mx > 3 * Math.max(x.med, 1)).sort((x, y) => y.mx - x.mx);
    document.getElementById('comp-picos').innerHTML = !picos.length ? '<p class="estudo-nota">Nenhum pico.</p>'
        : `<p class="estudo-nota">${fmtNum(picos.length)} linha(s), R$ ${fmtMi(picos.reduce((s, x) => s + x.mx, 0))} mi nos anos de pico. Confira a classe: uma despesa que não se repete deve ser pontual ou contratual.</p>`
        + `<div class="estudo-tabela-wrap" style="max-height:420px;"><table><thead><tr><th class="sem-ordem">Linha</th><th class="sem-ordem">Classe</th>` + a.empenho.map(y => `<th class="sem-ordem num">${y}</th>`).join('') + `<th class="sem-ordem num">Projeção ${a.exercicio}</th></tr></thead><tbody>`
        + picos.slice(0, 40).map(({ l }) => `<tr><td title="${escR(l.mapp)}">${escR(l.sec)} · ${escR(l.orgao)} · MAPP ${escR(l.cod)}<br><span style="color:var(--muted);font-size:11px;">${escR(l.fonte)} · ${escR(l.grupo + '.' + l.elem + ' ' + l.delem)}</span></td><td><span class="estudo-tag cl-${l.classe}">${CLASSES_REDOC[l.classe].rotulo}</span></td>`
            + a.empenho.map(y => `<td class="num">${fmtMi(l['e' + y])}</td>`).join('') + `<td class="num">${fmtMi(l.proj)}</td></tr>`).join('')
        + '</tbody></table></div>';

    renderizarTesteRetroativo(p);
}

// Projeta o último ano completo com os anteriores, no nível Órgão × Tipo × GID × classe, pela regra da tela
// (o ano anterior faz o papel do fechamento) e compara com "repetir o ano anterior".
function calcularTesteRetroativo(p) {
    let cs = redocAnos.completos;
    if (cs.length < 2) return null;
    let alvo = cs[cs.length - 1], hist = cs.slice(0, -1), ant = hist[hist.length - 1];
    let g = new Map();
    for (let l of redocLinhas) {
        let k = [l.orgao, l.tipo, l.gid, l.classe].join('|'), x = g.get(k);
        if (!x) { x = { classe: l.classe, gid: l.gid, real: 0 }; hist.forEach(y => x['e' + y] = 0); g.set(k, x); }
        x.real += l['e' + alvo] || 0; hist.forEach(y => x['e' + y] += l['e' + y] || 0);
    }
    let res = {};
    ORDEM_CLASSES.concat(['TOTAL']).forEach(c => res[c] = { real: 0, regra: 0, repete: 0, absRegra: 0, absRepete: 0, n: 0 });
    for (let x of g.values()) {
        let prior = x['e' + ant], prev;
        if (x.classe === 'C-PONTUAL') {
            let regra = p['p-pontual-regra'], v = hist.map(y => x['e' + y]);
            if (regra === 'zero') prev = 0;
            else if (regra === 'fechamento') prev = prior;
            else { if (regra === 'media_sem_maior' && v.length >= 3) v.splice(v.indexOf(Math.max(...v)), 1); prev = v.reduce((s, y) => s + y, 0) / v.length; }
        } else if (x.classe === 'E-CONTRATO') prev = p['p-contrato-regra'] === 'zero' ? 0 : prior;
        else { let i = redocIndiceGid[x.gid] !== undefined ? redocIndiceGid[x.gid] / 100 : p.indice[x.classe]; prev = prior * (1 + i); }
        for (let c of [x.classe, 'TOTAL']) {
            let r = res[c]; r.n++; r.real += x.real; r.regra += prev; r.repete += prior;
            r.absRegra += Math.abs(prev - x.real); r.absRepete += Math.abs(prior - x.real);
        }
    }
    return { alvo, hist, res };
}

function renderizarTesteRetroativo(p) {
    let el = document.getElementById('comp-teste');
    let t = calcularTesteRetroativo(p);
    if (!t) { el.innerHTML = '<p class="estudo-nota">São precisos ao menos dois anos completos.</p>'; return; }
    let linha = (c, r) => `<tr><td>${c === 'TOTAL' ? '<strong>Total</strong>' : `<span class="estudo-tag cl-${c}">${CLASSES_REDOC[c].rotulo}</span>`}</td><td class="num">${fmtNum(r.n)}</td><td class="num">${fmtMi(r.real)}</td>`
        + `<td class="num">${fmtMi(r.regra)}</td><td class="num">${r.real ? fmtPct(r.regra / r.real - 1) : '—'}</td><td class="num"><strong>${r.real ? fmtPct(r.absRegra / r.real) : '—'}</strong></td>`
        + `<td class="num">${fmtMi(r.repete)}</td><td class="num">${r.real ? fmtPct(r.repete / r.real - 1) : '—'}</td><td class="num">${r.real ? fmtPct(r.absRepete / r.real) : '—'}</td></tr>`;
    el.innerHTML = `<p class="estudo-nota">Projeta <strong>${t.alvo}</strong> com ${t.hist.join(' e ')}, usando as regras e os índices desta tela (o ano ${t.hist[t.hist.length - 1]} faz o papel do fechamento), em grupos Órgão × Tipo × GID × classe, e compara com o realizado. <strong>WAPE</strong> = Σ |previsto − realizado| ÷ Σ realizado: mede o erro grupo a grupo; o erro no total mostra se a soma fica acima ou abaixo.</p>`
        + `<div class="estudo-tabela-wrap"><table><thead><tr><th class="sem-ordem" rowspan="2">Classe</th><th class="sem-ordem num" rowspan="2">Grupos</th><th class="sem-ordem num" rowspan="2">Realizado ${t.alvo} (R$ mi)</th><th class="sem-ordem" colspan="3" style="text-align:center;">Regra da tela</th><th class="sem-ordem" colspan="3" style="text-align:center;">Repetir ${t.hist[t.hist.length - 1]}</th></tr>`
        + `<tr><th class="sem-ordem num">Previsto</th><th class="sem-ordem num">Erro no total</th><th class="sem-ordem num">WAPE</th><th class="sem-ordem num">Previsto</th><th class="sem-ordem num">Erro no total</th><th class="sem-ordem num">WAPE</th></tr></thead><tbody>`
        + ORDEM_CLASSES.map(c => linha(c, t.res[c])).join('') + `</tbody><tfoot>${linha('TOTAL', t.res.TOTAL)}</tfoot></table></div>`;
}

// ─── EXPORTAÇÃO XLSX ────────────────────────────────────────────────────────
function exigirBaseRedoc() {
    if (redocLinhas.length) return true;
    alert('Carregue a extração do REDOC (aba 1) ou abra um cenário antes.');
    return false;
}
async function baixarWorkbookRedoc(wb, nome) {
    let buffer = await wb.xlsx.writeBuffer();
    baixarBlobRedoc(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nome);
}
function baixarBlobRedoc(blob, nome) {
    let url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Aba com cabeçalho em negrito, congelado e com filtro; colunas numéricas com #,##0.00.
function abaTabela(wb, nome, colunas, linhas) {
    let ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = colunas.map(c => ({ header: c.t, key: c.k, width: c.w || (c.n ? 16 : 24) }));
    ws.getRow(1).font = { bold: true };
    linhas.forEach(r => ws.addRow(r));
    colunas.forEach((c, i) => { if (c.n) ws.getColumn(i + 1).numFmt = c.pct ? '0.0%' : '#,##0.00'; });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
    return ws;
}
function resumoPor(campoFn) {
    let a = redocAnos, g = new Map();
    for (let l of redocLinhas) {
        let k = campoFn(l), x = g.get(k);
        if (!x) { x = { k, n: 0, lim: 0, fech: 0, proj: 0 }; a.empenho.forEach(y => x['e' + y] = 0); g.set(k, x); }
        x.n++; x.lim += l.lim || 0; x.fech += l.fech; x.proj += l.proj; a.empenho.forEach(y => x['e' + y] += l['e' + y] || 0);
    }
    return [...g.values()].sort((x, y) => y.proj - x.proj);
}
function colunasResumo(titulo) {
    let a = redocAnos;
    return [{ t: titulo, k: 'k', w: 50 }, { t: 'LINHAS', k: 'n', n: true, w: 10 }]
        .concat(a.empenho.map(y => ({ t: `EMPENHADO_${y}${y === a.base ? '_PARCIAL' : ''}`, k: 'e' + y, n: true })))
        .concat([{ t: `LIMITE_${a.limite || a.base}`, k: 'lim', n: true }, { t: `FECHAMENTO_${a.base}`, k: 'fech', n: true }, { t: `PROJECAO_${a.exercicio}`, k: 'proj', n: true }, { t: 'VARIACAO', k: 'var', n: true, pct: true, w: 11 }]);
}
function linhasResumo(lista) { return lista.map(x => Object.assign({}, x, { var: x.fech ? x.proj / x.fech - 1 : null })); }

async function exportarXLSXRedoc() {
    if (!exigirBaseRedoc()) return;
    let a = redocAnos, p = lerParametrosRedoc(), wb = new ExcelJS.Workbook();
    wb.creator = 'SIPOG — Projeção REDOC';
    let leia = wb.addWorksheet('LEIA-ME');
    leia.columns = [{ width: 34 }, { width: 110 }];
    [['Projeção', `Exercício ${a.exercicio} — despesas da extração do REDOC, por item de despesa`],
     ['Arquivo', redocArquivo ? redocArquivo.nome : ''], ['Data de corte do ano base', dataBR(redocDataCorte)],
     ['Anos completos', a.completos.join(', ')], ['Ano base (parcial)', String(a.base)], ['Gerado em', new Date().toLocaleString('pt-BR')],
     ['Fechamento do ano base', 'Empenhado do ano base × fator da classe; com "Limite como teto", não passa do limite (salvo se o empenhado já passou); nunca abaixo do empenhado.'],
     ['Projeção', 'A · Pessoal: fechamento × (1 + vegetativo + reajuste). A · Custeio: fechamento × (1 + IPCA + real). B · Investimento: fechamento × (1 + correção). Índice próprio do GID substitui o da classe (A e B). C · Pontual e E · Contratual: regra da aba PARAMETROS. Valor manual substitui a regra.'],
     ['Chave REDOC', 'ORGAO__MAPP<código>__F<6 dígitos da fonte>__<natureza de 11 dígitos>'],
     ['Abas', 'PARAMETROS, PROJECAO (uma linha por item), RESUMO_CLASSE, RESUMO_TIPO, RESUMO_GID, RESUMO_ORGAO, RESUMO_FONTE, TESTE_RETROATIVO, CRITICA']
    ].forEach(r => leia.addRow(r));
    leia.getColumn(1).font = { bold: true };
    leia.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

    let prm = coletarParametrosRedocTela();
    let linhasPrm = Object.entries(prm.campos).map(([k, v]) => ({ k, v: typeof v === 'boolean' ? (v ? 'S' : 'N') : v }));
    Object.entries(prm.indiceGid).forEach(([g, v]) => linhasPrm.push({ k: 'INDICE_GID:' + g, v }));
    abaTabela(wb, 'PARAMETROS', [{ t: 'PARAMETRO', k: 'k', w: 40 }, { t: 'VALOR', k: 'v', w: 40 }], linhasPrm);

    let cols = [['SECRETARIA', 'sec'], ['ORGAO', 'orgao'], ['TIPO_MAPP', 'tipo'], ['DSC_FONTE_MAPP', 'fonte', 30], ['COD_MAPP', 'cod', 10], ['DSC_MAPP', 'mapp', 60], ['DSC_GID', 'gid', 30],
        ['CODIGO_COMPLETO', 'nat', 14], ['GRUPO', 'grupo', 8], ['MODALIDADE', 'mod', 8], ['ELEMENTO', 'elem', 8], ['DSC_ELEMENTO', 'delem', 36], ['ITEM', 'item', 8], ['DSC_ITEM', 'ditem', 40]]
        .map(([t, k, w]) => ({ t, k, w }))
        .concat(a.empenho.map(y => ({ t: `EMPENHADO_${y}${y === a.base ? '_PARCIAL' : ''}`, k: 'e' + y, n: true })))
        .concat([{ t: `LIMITE_${a.limite || a.base}`, k: 'lim', n: true }, { t: 'CLASSE', k: 'classeTxt', w: 22 }, { t: 'CLASSE_AUTOMATICA', k: 'classeAutoTxt', w: 22 },
            { t: `FECHAMENTO_${a.base}`, k: 'fech', n: true }, { t: 'CONTA_FECHAMENTO', k: 'fechExp', w: 50 },
            { t: `PROJECAO_${a.exercicio}`, k: 'proj', n: true }, { t: 'REGRA_PROJECAO', k: 'projRegra', w: 26 }, { t: 'CONTA_PROJECAO', k: 'projExp', w: 60 },
            { t: 'AJUSTE_MANUAL', k: 'manual', w: 8 }, { t: 'CHAVE_REDOC', k: 'chaveRedoc', w: 50 }]);
    abaTabela(wb, 'PROJECAO', cols, redocLinhas.map(l => Object.assign({}, l, {
        classeTxt: CLASSES_REDOC[l.classe].rotulo, classeAutoTxt: CLASSES_REDOC[l.classeAuto].rotulo,
        manual: (redocValorManual[l.chave] !== undefined || redocClasseManual[l.chave] !== undefined) ? 'S' : 'N'
    })));
    abaTabela(wb, 'RESUMO_CLASSE', colunasResumo('CLASSE'), linhasResumo(resumoPor(l => CLASSES_REDOC[l.classe].rotulo)));
    abaTabela(wb, 'RESUMO_TIPO', colunasResumo('TIPO_MAPP'), linhasResumo(resumoPor(l => l.tipo)));
    abaTabela(wb, 'RESUMO_GID', colunasResumo('DSC_GID'), linhasResumo(resumoPor(l => l.gid)));
    abaTabela(wb, 'RESUMO_ORGAO', colunasResumo('SECRETARIA / ORGAO'), linhasResumo(resumoPor(l => `${l.sec} / ${l.orgao}`)));
    abaTabela(wb, 'RESUMO_FONTE', colunasResumo('DSC_FONTE_MAPP'), linhasResumo(resumoPor(l => l.fonte)));

    let t = calcularTesteRetroativo(p);
    if (t) {
        abaTabela(wb, 'TESTE_RETROATIVO', [{ t: 'CLASSE', k: 'c', w: 26 }, { t: 'GRUPOS', k: 'n', n: true, w: 10 }, { t: `REALIZADO_${t.alvo}`, k: 'real', n: true },
            { t: 'PREVISTO_REGRA', k: 'regra', n: true }, { t: 'ERRO_TOTAL_REGRA', k: 'eRegra', n: true, pct: true }, { t: 'WAPE_REGRA', k: 'wRegra', n: true, pct: true },
            { t: `PREVISTO_REPETIR_${t.hist[t.hist.length - 1]}`, k: 'repete', n: true }, { t: 'ERRO_TOTAL_REPETIR', k: 'eRep', n: true, pct: true }, { t: 'WAPE_REPETIR', k: 'wRep', n: true, pct: true }],
            ORDEM_CLASSES.concat(['TOTAL']).map(c => { let r = t.res[c]; return { c: c === 'TOTAL' ? 'Total' : CLASSES_REDOC[c].rotulo, n: r.n, real: r.real, regra: r.regra, repete: r.repete,
                eRegra: r.real ? r.regra / r.real - 1 : null, wRegra: r.real ? r.absRegra / r.real : null, eRep: r.real ? r.repete / r.real - 1 : null, wRep: r.real ? r.absRepete / r.real : null }; }));
    }
    abaTabela(wb, 'CRITICA', [{ t: 'NIVEL', k: 'nivel', w: 8 }, { t: 'ITEM', k: 'titulo', w: 32 }, { t: 'DESCRICAO', k: 'texto', w: 90 }, { t: 'EXEMPLOS', k: 'ex', w: 90 }],
        redocCritica.map(c => ({ nivel: c.nivel, titulo: c.titulo, texto: c.texto, ex: (c.exemplos || []).join(' | ') })));
    await baixarWorkbookRedoc(wb, `SIPOG_Projecao_REDOC_${a.exercicio}_${carimboDataHoraRedoc()}.xlsx`);
}

// ─── CENÁRIO: JSON LOCAL E NUVEM ────────────────────────────────────────────
// O cenário leva as linhas consolidadas (colunar, para caber em menos chunks), a crítica, os parâmetros e os ajustes.
const CAMPOS_TEXTO_REDOC = ['sec', 'orgao', 'tipo', 'fonte', 'cod', 'mapp', 'gid', 'nat', 'grupo', 'dgrupo', 'mod', 'dmod', 'elem', 'delem', 'item', 'ditem'];
const COLECAO_REDOC = 'projecoes_redoc';

function montarCenarioRedoc(nome) {
    let campos = CAMPOS_TEXTO_REDOC.concat(redocAnos.empenho.map(y => 'e' + y), ['lim']);
    return {
        sistema: 'SIPOG', tipo: 'projecao-redoc', versao_schema: 1, nome, salvo_em: new Date().toISOString(),
        arquivo: redocArquivo, dataCorte: redocDataCorte, anos: redocAnos, totaisLidos: redocTotaisLidos,
        critica: redocCritica.filter(c => c.titulo !== 'Data de corte'),
        parametros: coletarParametrosRedocTela(), classeManual: redocClasseManual, valorManual: redocValorManual,
        // "dadosBrutos" alimenta o totalRegistros dos metadados da nuvem (gravarPacoteFragmentado, js/05).
        dados: { campos, dadosBrutos: redocLinhas.map(l => campos.map(c => l[c])) }
    };
}

function abrirCenarioRedoc(c) {
    if (!c || c.tipo !== 'projecao-redoc' || !c.dados || !Array.isArray(c.dados.dadosBrutos)) throw new Error('O arquivo não é um cenário da projeção REDOC.');
    let campos = c.dados.campos;
    let linhas = c.dados.dadosBrutos.map(v => {
        let l = {}; campos.forEach((k, i) => l[k] = v[i]);
        l.chave = [l.orgao, l.tipo, l.cod, N(l.mapp), l.fonte, l.nat].join('|');
        l.chaveRedoc = chaveRedocLinha(l);
        return l;
    });
    aplicarParametrosRedocTela(c.parametros);
    guardarParametrosRedocLocal();
    aplicarCargaRedoc({ linhas, anos: c.anos, totaisLidos: c.totaisLidos, critica: c.critica || [] }, c.arquivo || { nome: c.nome, lidas: linhas.length }, c.dataCorte);
    redocClasseManual = Object.assign({}, c.classeManual || {});
    redocValorManual = Object.assign({}, c.valorManual || {});
    guardarManuaisRedoc();
    recalcularRedoc();
    document.getElementById('status-redoc').innerHTML += `<br><span class="ok">Cenário aberto:</span> ${escR(c.nome || '')}`;
}

function baixarJSONRedoc() {
    if (!exigirBaseRedoc()) return;
    let nome = `Projecao REDOC ${redocAnos.exercicio} ${carimboDataHoraRedoc()}`;
    baixarBlobRedoc(new Blob([JSON.stringify(montarCenarioRedoc(nome))], { type: 'application/json' }), `SIPOG_Projecao_REDOC_${redocAnos.exercicio}_${carimboDataHoraRedoc()}.json`);
}
async function selecionarJSONRedoc(input) {
    let arq = input.files && input.files[0];
    if (!arq) return;
    try { abrirCenarioRedoc(JSON.parse(await arq.text())); }
    catch (err) { console.error(err); alert('Não foi possível abrir o cenário: ' + (err.message || err)); }
    finally { input.value = ''; }
}

async function salvarCenarioNuvemRedoc() {
    if (!exigirBaseRedoc()) return;
    let base = prompt('Nome do cenário (a data e hora DDMMAAAA-HHMM são acrescentadas ao final):', `Projeção REDOC ${redocAnos.exercicio}`);
    if (base === null) return;
    let nome = `${base.trim() || 'Projeção REDOC'} ${carimboDataHoraRedoc()}`;
    try {
        window.__setStatusNuvem('☁️ Salvando cenário...', true);
        let fb = await aguardarNuvemPronta();
        let pacote = montarCenarioRedoc(nome);
        pacote.criado_em = fb.serverTimestamp();
        await gravarPacoteFragmentado(fb, COLECAO_REDOC, pacote);
        window.__setStatusNuvem('☁️ Cenário salvo na nuvem', true);
        alert(`Cenário "${nome}" salvo na nuvem.`);
    } catch (err) {
        console.error(err);
        window.__setStatusNuvem('☁️ Falha ao salvar', false);
        alert('Não foi possível salvar na nuvem. Verifique a conexão e tente de novo (ou use "Baixar JSON").');
    }
}
async function listarCenariosNuvemRedoc() {
    let lista = document.getElementById('lista-cenarios-redoc');
    document.getElementById('modal-cenarios-redoc').style.display = 'flex';
    lista.innerHTML = '<p class="estudo-nota" style="padding:12px;">Carregando cenários salvos...</p>';
    try {
        let fb = await aguardarNuvemPronta();
        let snap = await fb.getDocs(fb.query(fb.collection(fb.db, COLECAO_REDOC), fb.orderBy('criado_em', 'desc')));
        if (snap.empty) { lista.innerHTML = '<p class="estudo-nota" style="padding:12px;">Nenhum cenário salvo na nuvem ainda.</p>'; return; }
        let h = '<table><thead><tr><th class="sem-ordem">Nome</th><th class="sem-ordem">Salvo em</th><th class="sem-ordem num">Linhas</th><th class="sem-ordem" style="width:190px;">Ações</th></tr></thead><tbody>';
        snap.forEach(d => {
            let x = d.data();
            let quando = (x.criado_em && typeof x.criado_em.toDate === 'function') ? x.criado_em.toDate().toLocaleString('pt-BR') : (x.salvo_em ? new Date(x.salvo_em).toLocaleString('pt-BR') : '—');
            h += `<tr><td><strong>${escR(x.nome || 'Sem nome')}</strong></td><td>${escR(quando)}</td><td class="num">${typeof x.totalRegistros === 'number' ? fmtNum(x.totalRegistros) : '—'}</td>`
                + `<td><button class="btn-mini-header" onclick="carregarCenarioNuvemRedoc('${d.id}')">⚡ Carregar</button> <button class="btn-mini-header" onclick="excluirCenarioNuvemRedoc('${d.id}')">🗑️ Excluir</button></td></tr>`;
        });
        lista.innerHTML = h + '</tbody></table>';
    } catch (err) {
        console.error(err);
        lista.innerHTML = '<p class="estudo-nota" style="padding:12px; color:var(--danger);">Falha ao carregar a lista. Verifique a conexão.</p>';
    }
}
function fecharModalCenariosRedoc() { document.getElementById('modal-cenarios-redoc').style.display = 'none'; }
async function carregarCenarioNuvemRedoc(id) {
    if (redocLinhas.length && !confirm('Substituir a base, os parâmetros e os ajustes atuais pelo cenário selecionado?')) return;
    try {
        window.__setStatusNuvem('☁️ Carregando cenário...', true);
        let fb = await aguardarNuvemPronta();
        let c = await lerPacoteFragmentado(fb, COLECAO_REDOC, id);
        if (!c) { alert('Cenário não encontrado — pode ter sido excluído.'); return; }
        abrirCenarioRedoc(c);
        fecharModalCenariosRedoc();
        window.__setStatusNuvem('☁️ Cenário carregado', true);
    } catch (err) {
        console.error(err);
        window.__setStatusNuvem('☁️ Falha ao carregar', false);
        alert('Não foi possível carregar o cenário: ' + (err.message || err));
    }
}
async function excluirCenarioNuvemRedoc(id) {
    if (!confirm('Excluir este cenário da nuvem? Não dá para desfazer.')) return;
    try { let fb = await aguardarNuvemPronta(); await excluirPacoteFragmentado(fb, COLECAO_REDOC, id); listarCenariosNuvemRedoc(); }
    catch (err) { console.error(err); alert('Não foi possível excluir o cenário.'); }
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
