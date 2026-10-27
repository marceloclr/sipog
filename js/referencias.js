// SIPOG COFIP — js/referencias.js
// Cadastros gerados dos próprios uploads (base de MAPPs e LOA), memória por exercício e crítica
// da base. Usado pelo SIPOG (index.html, depois do js/15) e pelo estudo LOA (estudo-loa.html).
// Script clássico (escopo global), sem efeito ao carregar. Depende de js/03 (N, V,
// corrigirMojibake), js/06 (normalizarEstagio, ESTAGIO_LABEL_MAP) e js/05 (nuvem em chunks).
//
// Nada aqui é digitado: as listas de órgãos, secretarias, fontes e programas saem do arquivo
// carregado e ficam guardadas por exercício só para comparar com a próxima carga ("novo desde
// a última carga"). O que fica de fato salvo é o que o usuário decide: aliases (texto variante →
// texto da base) e, no estudo, as ligações LOA × MAPP do exercício (siglas, fontes, de-para).

const COLECAO_REFERENCIAS = 'referencias';
const CHAVE_REFERENCIAS_LOCAL = 'sipog_referencias_v1';   // { [ano]: memória }
const CAMPOS_ALIAS = ['ORGAO', 'SECRETARIA', 'FONTE'];
const COLUNAS_GRUPO_CRITICA = ['CONTRATO_GESTAO', 'CONTINUIDADE', 'PCF_CONVENIO', 'OPERACAO_CREDITO', 'ENTREGA_PRIORITARIA'];
// Estágios sem regra que mesmo assim são esperados: os que excluem o MAPP do cálculo.
const ESTAGIOS_EXCLUSAO_CRITICA = ['CANCELADO', 'TRANSFERIDO', 'CONCLUIDO'];

// Rótulo e nível de cada tipo de achado (ordem = ordem no painel).
const TIPOS_CRITICA = {
    coluna:        { nivel: 'erro',  rotulo: 'Coluna obrigatória ausente' },
    numero:        { nivel: 'erro',  rotulo: 'Valor que não é número' },
    alias:         { nivel: 'info',  rotulo: 'Texto trocado pelo alias salvo' },
    orgaoNovo:     { nivel: 'aviso', rotulo: 'Órgão novo (não estava na última carga)' },
    secretaria:    { nivel: 'aviso', rotulo: 'Órgão em secretaria diferente da última carga' },
    fonteNova:     { nivel: 'aviso', rotulo: 'Fonte nova (não estava na última carga)' },
    programaNovo:  { nivel: 'aviso', rotulo: 'Programa novo (não estava na última carga)' },
    estagio:       { nivel: 'aviso', rotulo: 'Estágio desconhecido (cai em 100% do Programado)' },
    duplicado:     { nivel: 'aviso', rotulo: 'MAPP repetido no mesmo órgão e fonte' },
    negativo:      { nivel: 'aviso', rotulo: 'Valor negativo' },
    empLimite:     { nivel: 'aviso', rotulo: 'Empenhado maior que o Limite' },
    pagoEmp:       { nivel: 'aviso', rotulo: 'Pago maior que o Empenhado' },
    limiteProg:    { nivel: 'aviso', rotulo: 'Limite maior que o Programado' },
    grupos:        { nivel: 'aviso', rotulo: 'Mais de um grupo marcado "S" (vale o de maior prioridade)' },
    foraExecutivo: { nivel: 'aviso', rotulo: 'Órgão fora do Executivo (expurgado)' },
    orgaoSemLOA:   { nivel: 'aviso', rotulo: 'Órgão do MAPP sem órgão na LOA' },
    loaSemSigla:   { nivel: 'aviso', rotulo: 'Órgão da LOA sem ligação com a base de MAPPs' }
};

function escRef(v) {
    return String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Chave de comparação tolerante: sem acento, caixa, espaços e pontuação ("(312,82)" = "(312.82)").
function chaveTolerante(v) { return N(corrigirMojibake(String(v || ''))).replace(/[^A-Z0-9]+/g, ''); }

function exercicioReferencias() { return typeof exercicioLOA === 'number' ? exercicioLOA : 2027; }

// ─── MEMÓRIA POR EXERCÍCIO (localStorage + nuvem) ──────────────────────────
function memoriaVazia(ano) {
    return { exercicio: ano, atualizadoEm: null, mapp: null, loa: null, aliases: { ORGAO: {}, SECRETARIA: {}, FONTE: {} }, ligacoes: null };
}

function lerMemoriasLocais() {
    try { return JSON.parse(localStorage.getItem(CHAVE_REFERENCIAS_LOCAL) || '{}') || {}; } catch (e) { return {}; }
}

let memoriasReferencias = {};   // { [ano]: memória } já lidas nesta sessão

function memoriaReferencias(ano) {
    ano = ano || exercicioReferencias();
    if (!memoriasReferencias[ano]) memoriasReferencias[ano] = Object.assign(memoriaVazia(ano), lerMemoriasLocais()[ano] || {});
    let m = memoriasReferencias[ano];
    CAMPOS_ALIAS.forEach(c => { m.aliases[c] = m.aliases[c] || {}; });
    return m;
}

// Lê a versão da nuvem e fica com a mais recente. Falha de rede não impede o uso local.
async function carregarMemoriaReferencias(ano) {
    ano = ano || exercicioReferencias();
    let local = memoriaReferencias(ano);
    try {
        let fb = await aguardarNuvemPronta();
        let nuvem = await lerPacoteFragmentado(fb, COLECAO_REFERENCIAS, 'exercicio_' + ano);
        if (nuvem && nuvem.memoria && (!local.atualizadoEm || nuvem.memoria.atualizadoEm > local.atualizadoEm)) {
            memoriasReferencias[ano] = Object.assign(memoriaVazia(ano), nuvem.memoria);
            gravarMemoriaLocal(ano);
        }
    } catch (e) { console.warn('Referências: nuvem indisponível, usando a cópia deste navegador.', e); }
    return memoriaReferencias(ano);
}

function gravarMemoriaLocal(ano) {
    try {
        let todas = lerMemoriasLocais();
        todas[ano] = memoriasReferencias[ano];
        localStorage.setItem(CHAVE_REFERENCIAS_LOCAL, JSON.stringify(todas));
    } catch (e) {}
}

async function salvarMemoriaReferencias(ano) {
    ano = ano || exercicioReferencias();
    let m = memoriaReferencias(ano);
    m.atualizadoEm = new Date().toISOString();
    gravarMemoriaLocal(ano);
    try {
        let fb = await aguardarNuvemPronta();
        await gravarPacoteFragmentado(fb, COLECAO_REFERENCIAS, { nome: `Referências ${ano}`, memoria: m }, 'exercicio_' + ano);
        return true;
    } catch (e) { console.warn('Referências: não foi possível gravar na nuvem.', e); return false; }
}

// Memória usada para dizer "novo": a do exercício ou, se ainda vazia, a do anterior.
function memoriaComparacao(ano, parte) {
    let m = memoriaReferencias(ano);
    if (m[parte]) return m[parte];
    let ant = memoriaReferencias(ano - 1);
    return ant[parte] || null;
}

// ─── CADASTROS GERADOS DO ARQUIVO ───────────────────────────────────────────
function txt(v) { return String(v === null || v === undefined ? '' : v).trim(); }

function extrairCadastroMAPP(linhas) {
    let c = { orgaos: {}, fontes: {}, programas: {} };
    linhas.forEach(r => {
        let org = txt(r.ORGAO), sec = txt(r.SECRETARIA), fonte = txt(r.FONTE), prog = txt(r.PROGRAMA);
        if (org) { let o = c.orgaos[org] || (c.orgaos[org] = {}); if (sec) o[sec] = (o[sec] || 0) + 1; }
        if (fonte) c.fontes[fonte] = (c.fontes[fonte] || 0) + 1;
        if (prog) c.programas[prog] = (c.programas[prog] || 0) + 1;
    });
    return c;
}

function extrairCadastroLOA(creditos) {
    let c = { orgaos: {}, fontes: {}, programas: {} };
    (creditos || []).forEach(x => {
        if (x.codOrgao) c.orgaos[x.codOrgao] = x.orgao || c.orgaos[x.codOrgao] || '';
        let f = x.ft ? [x.id, x.ft, x.dt].filter(v => v !== undefined && v !== '').join('.') : txt(x.fonte);
        if (f) c.fontes[f] = (c.fontes[f] || 0) + 1;
        if (x.programa) c.programas[x.programa] = x.nomePrograma || c.programas[x.programa] || '';
    });
    return c;
}

// Junta a carga atual ao que já se conhecia (nada some da memória por não aparecer numa carga).
function unirCadastros(antigo, novo) {
    let r = JSON.parse(JSON.stringify(antigo || { orgaos: {}, fontes: {}, programas: {} }));
    for (let k in novo.orgaos) {
        if (typeof novo.orgaos[k] === 'object') r.orgaos[k] = Object.assign({}, r.orgaos[k] || {}, novo.orgaos[k]);
        else r.orgaos[k] = novo.orgaos[k];
    }
    Object.assign(r.fontes, novo.fontes);
    Object.assign(r.programas, novo.programas);
    return r;
}

// ─── ALIASES ────────────────────────────────────────────────────────────────
// Troca, nas linhas, o texto variante pelo texto canônico salvo. Devolve as trocas feitas.
function aplicarAliases(linhas, aliases) {
    let trocas = {};
    CAMPOS_ALIAS.forEach(campo => {
        let mapa = (aliases || {})[campo] || {};
        if (!Object.keys(mapa).length) return;
        let porChave = {};
        for (let v in mapa) porChave[chaveTolerante(v)] = mapa[v];
        linhas.forEach(r => {
            let atual = txt(r[campo]);
            if (!atual) return;
            let canon = mapa[atual] !== undefined ? mapa[atual] : porChave[chaveTolerante(atual)];
            if (canon === undefined || canon === atual) return;
            r[campo] = canon;
            let k = campo + '|' + atual + '|' + canon;
            (trocas[k] = trocas[k] || { campo, de: atual, para: canon, qtd: 0 }).qtd++;
        });
    });
    return Object.values(trocas);
}

// Texto já conhecido parecido com o novo (mesma chave tolerante, ou o mesmo código numérico
// no caso das fontes): vira sugestão de alias.
function sugerirConhecido(valor, conhecidos, campo) {
    let k = chaveTolerante(valor);
    let igual = conhecidos.find(c => c !== valor && chaveTolerante(c) === k);
    if (igual) return igual;
    if (campo === 'FONTE') {
        let dig = String(valor).replace(/\D+/g, '');
        let mesmos = dig.length >= 6 ? conhecidos.filter(c => c !== valor && String(c).replace(/\D+/g, '') === dig) : [];
        if (mesmos.length === 1) return mesmos[0];
    }
    return null;
}

// ─── CRÍTICA DA BASE DE MAPPs ───────────────────────────────────────────────
// opcoes: { ano, colunas: { pBase, lBase, eBase, pago, pLOA } (listas de nomes possíveis),
//           obrigatorias, siglasFora: Set(N(sigla)), loa: { siglas: {cod: sigla}, orgaos: {cod: nome} } }
// Não muda valores: só aplica aliases e aponta o que merece conferência.
function criticarBaseMAPPs(linhas, opcoes) {
    let o = opcoes || {};
    let ano = o.ano || exercicioReferencias();
    let mem = memoriaReferencias(ano);
    let itens = [];
    let add = (tipo, valor, extra) => { let it = Object.assign({ tipo, valor: txt(valor), qtd: 1, linhas: [] }, extra || {}); itens.push(it); return it; };
    let porChave = {};
    let acumular = (tipo, valor, linha, extra) => {
        let k = tipo + '|' + valor;
        let it = porChave[k] || (porChave[k] = add(tipo, valor, Object.assign({ qtd: 0 }, extra || {})));
        it.qtd++;
        if (linha !== undefined && it.linhas.length < 5000) it.linhas.push(linha);
        return it;
    };

    // Colunas obrigatórias (o cabeçalho é o das próprias linhas).
    let cab = new Set(); linhas.slice(0, 50).forEach(r => Object.keys(r).forEach(k => cab.add(k)));
    (o.obrigatorias || ['MAPP', 'ORGAO', 'FONTE', 'ESTAGIO_EXECUCAO']).forEach(c => {
        let nomes = Array.isArray(c) ? c : [c];
        if (!nomes.some(n => cab.has(n))) add('coluna', nomes.join(' ou '));
    });

    let trocas = o.semAliases ? [] : aplicarAliases(linhas, mem.aliases);
    trocas.forEach(t => add('alias', `${t.campo}: ${t.de} → ${t.para}`, { qtd: t.qtd }));

    let col = o.colunas || {};
    let valorDe = (r, nomes) => { for (let n of (nomes || [])) if (r[n] !== undefined && r[n] !== null && r[n] !== '') return { nome: n, bruto: r[n] }; return null; };
    let numero = c => {
        if (!c) return 0;
        if (typeof c.bruto === 'number') return c.bruto;
        let t = String(c.bruto).trim().replace(/^R\$\s*/, '');
        if (!/^-?[\d.,\s]+$/.test(t)) return NaN;
        return V(t);
    };
    let anterior = memoriaComparacao(ano, 'mapp');
    let atual = extrairCadastroMAPP(linhas);
    let vistos = {};
    let siglasFora = o.siglasFora || new Set();
    let siglasLOA = o.loa ? new Set(Object.values(o.loa.siglas || {}).map(N)) : null;

    linhas.forEach((r, i) => {
        let ln = i + 2;   // linha na planilha (cabeçalho = 1)
        let org = txt(r.ORGAO), fonte = txt(r.FONTE);
        let vals = {};
        ['pBase', 'lBase', 'eBase', 'pago', 'pLOA'].forEach(p => {
            let c = valorDe(r, col[p]);
            let v = numero(c);
            if (Number.isNaN(v)) { acumular('numero', `${c.nome} = "${c.bruto}"`, ln); v = 0; }
            vals[p] = v;
            if (v < 0) acumular('negativo', c.nome, ln);
        });
        if (vals.eBase > vals.lBase + 0.005 && vals.lBase > 0) acumular('empLimite', org, ln);
        if (vals.pago > vals.eBase + 0.005) acumular('pagoEmp', org, ln);
        if (vals.lBase > vals.pBase + 0.005) acumular('limiteProg', org, ln);

        let est = normalizarEstagio(r.ESTAGIO_EXECUCAO);
        if (!ESTAGIO_LABEL_MAP[est] && !ESTAGIOS_EXCLUSAO_CRITICA.some(x => est.includes(x))) acumular('estagio', txt(r.ESTAGIO_EXECUCAO) || '(vazio)', ln);

        let marcados = COLUNAS_GRUPO_CRITICA.filter(g => S(r[g]) || (g === 'OPERACAO_CREDITO' && S(r.OPERACA_CREDITO)));
        if (marcados.length > 1) acumular('grupos', marcados.join(' + '), ln);

        let chave = N(org) + '|' + N(fonte) + '|' + N(txt(r.MAPP).replace(/\./g, ','));
        if (vistos[chave]) acumular('duplicado', `${txt(r.MAPP)} — ${org} — ${fonte}`, ln); else vistos[chave] = true;

        if (org && siglasFora.has(N(org))) acumular('foraExecutivo', org, ln);
        if (org && siglasLOA && !siglasFora.has(N(org)) && !siglasLOA.has(N(org))) acumular('orgaoSemLOA', org, ln);
    });

    // Novidades em relação à última carga (na primeira carga do exercício, nada é "novo").
    if (anterior) {
        let conhecidos = { ORGAO: Object.keys(anterior.orgaos || {}), FONTE: Object.keys(anterior.fontes || {}) };
        for (let org in atual.orgaos) {
            if (!(anterior.orgaos || {})[org]) {
                let it = add('orgaoNovo', org, { qtd: Object.values(atual.orgaos[org]).reduce((s, n) => s + n, 0) || 1 });
                let sug = sugerirConhecido(org, conhecidos.ORGAO, 'ORGAO');
                if (sug) it.sugestao = { acao: 'alias', campo: 'ORGAO', de: org, para: sug };
                continue;
            }
            let antes = Object.keys(anterior.orgaos[org] || {}), agora = Object.keys(atual.orgaos[org]);
            let novas = agora.filter(s => !antes.includes(s));
            if (antes.length && novas.length) add('secretaria', org, { detalhe: `antes: ${antes.join(', ')} · agora: ${agora.join(', ')}` });
        }
        for (let f in atual.fontes) if (!(anterior.fontes || {})[f]) {
            let it = add('fonteNova', f, { qtd: atual.fontes[f] });
            let sug = sugerirConhecido(f, conhecidos.FONTE, 'FONTE');
            if (sug) it.sugestao = { acao: 'alias', campo: 'FONTE', de: f, para: sug };
        }
        for (let p in atual.programas) if (!(anterior.programas || {})[p]) add('programaNovo', p, { qtd: atual.programas[p] });
    }

    // Detalhes de alguns tipos.
    itens.forEach(it => {
        if (it.tipo === 'orgaoSemLOA' && o.loa) {
            let k = chaveTolerante(it.valor);
            let cod = Object.keys(o.loa.orgaos || {}).find(c => chaveTolerante(o.loa.orgaos[c]) === k && !(o.loa.siglas || {})[c]);
            if (cod) it.sugestao = { acao: 'sigla', cod, sigla: it.valor, nome: o.loa.orgaos[cod] };
        }
    });

    return montarResultadoCritica(itens, { ano, atual, primeiraCarga: !anterior, linhas: linhas.length });
}

// Órgãos da LOA (Executivo, com valor no recorte) sem sigla da base de MAPPs.
function criticarLOAxMAPP(orgaosLOA, siglas, orgaosMAPP) {
    let itens = [];
    let mapp = Object.keys(orgaosMAPP || {});
    for (let cod in orgaosLOA) {
        if (siglas[cod]) continue;   // com sigla, mesmo sem MAPP na base: a ligação existe
        let it = { tipo: 'loaSemSigla', valor: `${cod} ${orgaosLOA[cod]}`, qtd: 1, linhas: [] };
        let k = chaveTolerante(orgaosLOA[cod]);
        let par = mapp.find(o => chaveTolerante(o) === k);
        if (par) it.sugestao = { acao: 'sigla', cod, sigla: par, nome: orgaosLOA[cod] };
        itens.push(it);
    }
    return itens;
}

function montarResultadoCritica(itens, extra) {
    let ordem = Object.keys(TIPOS_CRITICA);
    itens.sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo) || b.qtd - a.qtd);
    let conta = nivel => itens.filter(i => TIPOS_CRITICA[i.tipo].nivel === nivel).length;
    return Object.assign({ itens, erros: conta('erro'), avisos: conta('aviso'), infos: conta('info'),
        bloqueia: itens.some(i => TIPOS_CRITICA[i.tipo].nivel === 'erro') }, extra || {});
}

// Guarda a foto da carga como referência do exercício (só quando a carga não foi bloqueada).
function registrarCargaMAPP(resultado) {
    if (!resultado || resultado.bloqueia) return;
    let m = memoriaReferencias(resultado.ano);
    m.mapp = unirCadastros(m.mapp, resultado.atual);
    salvarMemoriaReferencias(resultado.ano);
}

function registrarCargaLOA(ano, creditos) {
    let m = memoriaReferencias(ano);
    m.loa = unirCadastros(m.loa, extrairCadastroLOA(creditos));
    salvarMemoriaReferencias(ano);
}

function salvarAlias(ano, campo, de, para) {
    let m = memoriaReferencias(ano);
    m.aliases[campo][de] = para;
    return salvarMemoriaReferencias(ano);
}

// ─── SIPOG (index.html) ─────────────────────────────────────────────────────
// Colunas do layout de importação do SIPOG (js/01, MODELO_COLUNAS), exercício 2027.
const COLUNAS_CRITICA_SIPOG = {
    pBase: ['VLR_PROGRAMADO_2026'], lBase: ['VLR_LIMITE_2026'], eBase: ['VLR_EMPENHADO_2026'],
    pago: ['VLR_PAGO_2026'], pLOA: ['VLR_PROGRAMADO_2027']
};
const OBRIGATORIAS_CRITICA_SIPOG = ['MAPP', 'ORGAO', 'FONTE', 'ESTAGIO_EXECUCAO', 'VLR_PROGRAMADO_2026', 'VLR_LIMITE_2026',
    'VLR_EMPENHADO_2026', 'VLR_PROGRAMADO_2027'];

// Importação do xlsx: aplica aliases, critica e registra a carga. Devolve o resultado.
async function criticarImportacaoSIPOG(linhas, nomeArquivo) {
    let ano = exercicioReferencias();
    await carregarMemoriaReferencias(ano);
    let r = criticarBaseMAPPs(linhas, { ano, colunas: COLUNAS_CRITICA_SIPOG, obrigatorias: OBRIGATORIAS_CRITICA_SIPOG });
    renderizarPainelCritica(r, { contId: 'critica-base', ano, titulo: `Crítica da base — ${nomeArquivo || 'arquivo importado'}`,
        aoAceitar: s => {
            if (s.acao !== 'alias' || !dadosBrutos.length) return;
            aplicarAliases(dadosBrutos, memoriaReferencias(ano).aliases);
            processarDados();
        } });
    registrarCargaMAPP(r);
    return r;
}

// Estado ou cenário salvo (nuvem/JSON): só mostra a crítica, sem trocar textos (as chaves de
// tetos e filtros salvos dependem deles) e sem registrar como referência.
async function criticarBaseCarregadaSIPOG(linhas, nome) {
    let ano = exercicioReferencias();
    await carregarMemoriaReferencias(ano);
    let r = criticarBaseMAPPs(linhas, { ano, colunas: COLUNAS_CRITICA_SIPOG, obrigatorias: OBRIGATORIAS_CRITICA_SIPOG, semAliases: true });
    renderizarPainelCritica(r, { contId: 'critica-base', ano, titulo: `Crítica da base — ${nome || 'estado carregado'}` });
    return r;
}

// ─── PAINEL ─────────────────────────────────────────────────────────────────
// ctx: { contId, ano, aoAceitar(sugestao) → Promise|void, titulo }
let criticaAtual = null, criticaContexto = null;

function renderizarPainelCritica(resultado, ctx) {
    criticaAtual = resultado; criticaContexto = ctx;
    let cont = document.getElementById(ctx.contId);
    if (!cont) return;
    if (!resultado) { cont.innerHTML = ''; cont.style.display = 'none'; return; }
    cont.style.display = 'block';
    let cab = `<div class="critica-cab"><strong>${escRef(ctx.titulo || 'Crítica da base')}</strong> · ` +
        (resultado.bloqueia ? `<span class="critica-erro">✖ ${resultado.erros} erro(s) — a carga foi interrompida</span>`
            : `<span class="critica-ok">✔ carregada</span>`) +
        (resultado.avisos ? ` · <span class="critica-aviso">⚠ ${resultado.avisos} aviso(s)</span>` : '') +
        (resultado.infos ? ` · ${resultado.infos} correção(ões) por alias` : '') +
        (resultado.primeiraCarga ? ' · primeira carga do exercício: órgãos, fontes e programas registrados como referência' : '') +
        ` <button class="btn-mini-header" onclick="exportarCriticaXLSX()" title="Todos os achados e as linhas da planilha">⬇ xlsx</button></div>`;
    if (!resultado.itens.length) { cont.innerHTML = cab + '<div class="critica-vazio">Nada a conferir.</div>'; return; }
    let grupos = {};
    resultado.itens.forEach((it, i) => (grupos[it.tipo] = grupos[it.tipo] || []).push(i));
    let h = cab;
    for (let tipo in grupos) {
        let t = TIPOS_CRITICA[tipo], idx = grupos[tipo];
        let total = idx.reduce((s, i) => s + resultado.itens[i].qtd, 0);
        h += `<details class="critica-grupo critica-${t.nivel}"${t.nivel === 'erro' ? ' open' : ''}><summary>${t.nivel === 'erro' ? '✖' : t.nivel === 'aviso' ? '⚠' : 'ℹ'} ${escRef(t.rotulo)} — ${idx.length} item(ns), ${total.toLocaleString('pt-BR')} ocorrência(s)</summary>` +
            '<table class="critica-tabela"><thead><tr><th>Valor</th><th class="num">Qtd</th><th>Linhas / detalhe</th><th>Sugestão</th></tr></thead><tbody>';
        idx.slice(0, 200).forEach(i => {
            let it = resultado.itens[i];
            let lin = it.detalhe || (it.linhas.length ? it.linhas.slice(0, 8).join(', ') + (it.linhas.length > 8 ? '…' : '') : '');
            h += `<tr><td>${escRef(it.valor)}</td><td class="num">${it.qtd.toLocaleString('pt-BR')}</td><td>${escRef(lin)}</td><td>${textoSugestao(it, i)}</td></tr>`;
        });
        if (idx.length > 200) h += `<tr><td colspan="4">… mais ${idx.length - 200} (veja o xlsx)</td></tr>`;
        h += '</tbody></table></details>';
    }
    cont.innerHTML = h;
}

function textoSugestao(it, i) {
    let s = it.sugestao;
    if (!s) return '';
    if (it.aceita) return '✔ aceita';
    let rot = s.acao === 'alias' ? `é o mesmo que "${escRef(s.para)}"` : `ligar ${escRef(s.cod)} ${escRef(s.nome)} → ${escRef(s.sigla)}`;
    return `${rot} <button class="btn-mini-header" onclick="aceitarSugestaoCritica(${i})">Aceitar</button>`;
}

async function aceitarSugestaoCritica(i) {
    let it = criticaAtual && criticaAtual.itens[i];
    if (!it || !it.sugestao || !criticaContexto) return;
    let s = it.sugestao;
    if (s.acao === 'alias') await salvarAlias(criticaContexto.ano, s.campo, s.de, s.para);
    it.aceita = true;
    if (criticaContexto.aoAceitar) await criticaContexto.aoAceitar(s);
    renderizarPainelCritica(criticaAtual, criticaContexto);
}

async function exportarCriticaXLSX() {
    if (!criticaAtual) return;
    let wb = new ExcelJS.Workbook();
    let ws = wb.addWorksheet('CRITICA', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [{ header: 'NIVEL', key: 'nivel', width: 8 }, { header: 'TIPO', key: 'tipo', width: 44 }, { header: 'VALOR', key: 'valor', width: 50 },
        { header: 'QTD', key: 'qtd', width: 8 }, { header: 'DETALHE', key: 'detalhe', width: 50 }, { header: 'SUGESTAO', key: 'sug', width: 40 }];
    let wl = wb.addWorksheet('LINHAS', { views: [{ state: 'frozen', ySplit: 1 }] });
    wl.columns = [{ header: 'TIPO', key: 'tipo', width: 44 }, { header: 'VALOR', key: 'valor', width: 50 }, { header: 'LINHA_PLANILHA', key: 'linha', width: 14 }];
    criticaAtual.itens.forEach(it => {
        let t = TIPOS_CRITICA[it.tipo], s = it.sugestao;
        ws.addRow({ nivel: t.nivel, tipo: t.rotulo, valor: it.valor, qtd: it.qtd, detalhe: it.detalhe || '',
            sug: !s ? '' : s.acao === 'alias' ? `mesmo que "${s.para}"` : `ligar ${s.cod} → ${s.sigla}` });
        it.linhas.forEach(l => wl.addRow({ tipo: t.rotulo, valor: it.valor, linha: l }));
    });
    ws.getRow(1).font = wl.getRow(1).font = { bold: true };
    let buf = await wb.xlsx.writeBuffer();
    let a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    let d = new Date(), p = n => String(n).padStart(2, '0');
    a.download = `SIPOG_critica_base_${p(d.getDate())}${p(d.getMonth() + 1)}${d.getFullYear()}-${p(d.getHours())}${p(d.getMinutes())}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
