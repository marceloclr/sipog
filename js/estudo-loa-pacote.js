// SIPOG COFIP — js/estudo-loa-pacote.js
// "Pacote do estudo": um xlsx com uma aba para cada dado de que o estudo precisa (LOA, MAPPs,
// parâmetros, de-para, órgãos, fontes e propostas). Lê com validação aba por aba e gera o
// modelo vazio ou o pacote com o que está carregado. Script clássico (escopo global); usa
// funções de js/estudo-loa.js, chamadas só em tempo de execução.

const ABAS_PACOTE = ['LEIA-ME', 'PARAMETROS', 'LOA', 'MAPPS', 'DE_PARA_FONTES', 'ORGAOS', 'FONTES_LOA', 'PROPOSTAS'];

// PARAMETROS: PARAMETRO | VALOR. Cada chave aponta para um campo da aba 2.
const PARAMETROS_PACOTE = [
    { chave: 'EXERCICIO_LOA', desc: 'Ano da LOA estudada (o ano base da execução é o anterior)', padrao: 2027, especial: true },
    { chave: 'CONVENIADO_PCT', id: 'ep-conveniado', desc: 'Previsão de Empenho: Conveniado (% do Programado, se Limite = 0)' },
    { chave: 'LICITADO_PCT', id: 'ep-licitado', desc: 'Previsão de Empenho: Licitado (%)' },
    { chave: 'EM_LICITACAO_PCT', id: 'ep-emlicitacao', desc: 'Previsão de Empenho: Em Licitação (%)' },
    { chave: 'CONTRATADO_PCT', id: 'ep-contratado', desc: 'Previsão de Empenho: Contratado (%)' },
    { chave: 'PREPARATORIAS_PCT', id: 'ep-preparatorias', desc: 'Previsão de Empenho: Atividades Preparatórias (%)' },
    { chave: 'NAO_INICIADO_PCT', id: 'ep-naoiniciado', desc: 'Previsão de Empenho: Não Iniciado (%)' },
    { chave: 'EM_EXECUCAO_LIMIAR_PCT', id: 'ep-limiar', desc: 'Em Execução: limiar (% do Programado)' },
    { chave: 'EM_EXECUCAO_MESES', id: 'ep-meses', desc: 'Em Execução: meses decorridos em (EMP/meses)×12' },
    { chave: 'EXPURGAR_FISFIN', id: 'ep-expurgar-fisfin', caixa: true, desc: 'Expurgar MAPPs em Execução Físic/Finan. Concluída (S/N)' },
    { chave: 'VD_CONTRATO_GESTAO_PCT', id: 'vd-contrato-gestao', desc: 'Valor Deliberado: Contrato Gestão (%)' },
    { chave: 'VD_CONTINUIDADE_PCT', id: 'vd-continuidade', desc: 'Valor Deliberado: Continuidade (%)' },
    { chave: 'VD_PCF_CONVENIO_PCT', id: 'vd-pcf-convenio', desc: 'Valor Deliberado: PCF Convênio (%)' },
    { chave: 'VD_OPERACAO_CREDITO_PCT', id: 'vd-operacao-credito', desc: 'Valor Deliberado: Operação Crédito (%)' },
    { chave: 'VD_DEMAIS_PROJETOS_PCT', id: 'vd-investimento', desc: 'Valor Deliberado: Demais Projetos (%)' },
    { chave: 'VD_FONTE', id: 'vd-fonte', desc: 'Valor Deliberado aplicado só nesta Fonte do MAPP (vazio = todas)' },
    { chave: 'GND', desc: 'Recorte da LOA: GNDs separados por ";" (31;32;33;44;45;46;02 = Reserva)', padrao: '44' },
    { chave: 'ESFERAS', desc: 'Recorte da LOA: FISCAL e/ou ESTATAIS, separados por ";"', padrao: 'FISCAL;ESTATAIS' },
    { chave: 'EXCLUIR_MOD91', id: 'loa-sem-mod91', caixa: true, desc: 'Excluir a modalidade 91 (intraorçamentária) (S/N)' }
];

const COLUNAS_LOA_PACOTE = ['ESFERA', 'COD_ORGAO', 'ORGAO', 'COD_UO', 'UO', 'PROGRAMA', 'NOME_PROGRAMA', 'TIPO_ACAO', 'COD_ACAO', 'ACAO',
    'FUNCAO', 'SUBFUNCAO', 'REGIAO', 'GND', 'MODALIDADE', 'FONTE', 'IDUSO', 'VALOR'];
const OBRIGATORIAS_LOA_PACOTE = ['COD_ORGAO', 'FONTE', 'VALOR'];

let exercicioLOA = 2027;   // ano da LOA (aba PARAMETROS); usado na etapa de troca de exercício

function cabecalhoPacote(txt) { return N(txt).replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''); }

// Linhas de uma aba como objetos, com o cabeçalho normalizado ("SUB FONTE" → SUB_FONTE).
function lerAbaPacote(ws) {
    let cab = [];
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => { cab[col] = cabecalhoPacote(valorCelulaExcelJS(cell.value)); });
    let linhas = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
        if (n === 1) return;
        let o = {}, vazia = true;
        cab.forEach((h, col) => {
            if (!h) return;
            let v = valorCelulaExcelJS(row.getCell(col).value);
            o[h] = v;
            if (v !== '' && v !== null && v !== undefined) vazia = false;
        });
        if (!vazia) linhas.push(o);
    });
    return { linhas, colunas: cab.filter(Boolean) };
}

function abaPacote(wb, nome) {
    return wb.worksheets.find(w => cabecalhoPacote(w.name) === cabecalhoPacote(nome)) || null;
}

function simNao(v) { return /^(S|SIM|1|TRUE|X|VERDADEIRO)$/i.test(String(v).trim()); }

// FONTE da LOA: "1.500.00" (ID.FT.DT), "500.00" (FT.DT) ou "500.9.1.0.00.00" (sub fonte completa).
function partesFonteLOA(txt) {
    let s = String(txt || '').trim().split('.');
    if (s.length === 3) return { id: s[0], ft: s[1], dt: s[2].padStart(2, '0') };
    if (s.length === 2) return { id: '1', ft: s[0], dt: s[1].padStart(2, '0') };
    if (s.length === 6) return { id: '1', ft: s[0], dt: s[5].padStart(2, '0') };
    return null;
}

function esferaPacote(v) {
    let t = N(v);
    if (!t) return '';
    return t.includes('ESTATA') ? 'INVESTIMENTOS ESTATAIS' : 'FISCAL / SEGURIDADE SOCIAL';
}

// ─── LEITURA ────────────────────────────────────────────────────────────────
function lerPacoteEstudo(wb) {
    let r = { relatorio: [], erros: 0 };
    let nota = (aba, tipo, txt) => { r.relatorio.push({ aba, tipo, txt }); if (tipo === 'erro') r.erros++; };

    // PARAMETROS
    let wsP = abaPacote(wb, 'PARAMETROS');
    if (wsP) {
        r.parametros = {};
        lerAbaPacote(wsP).linhas.forEach(l => { let k = cabecalhoPacote(l.PARAMETRO); if (k) r.parametros[k] = l.VALOR; });
        let desconhecidos = Object.keys(r.parametros).filter(k => !PARAMETROS_PACOTE.some(p => p.chave === k));
        nota('PARAMETROS', desconhecidos.length ? 'aviso' : 'ok', `${Object.keys(r.parametros).length} parâmetro(s)` +
            (desconhecidos.length ? ` — ignorados: ${desconhecidos.join(', ')}` : ''));
    } else nota('PARAMETROS', 'aviso', 'aba ausente — ficam os parâmetros da tela');

    // ORGAOS
    let wsO = abaPacote(wb, 'ORGAOS');
    if (wsO) {
        let a = lerAbaPacote(wsO);
        if (!a.colunas.includes('COD_ORGAO') || !a.colunas.includes('SIGLA')) nota('ORGAOS', 'erro', 'precisa das colunas COD_ORGAO e SIGLA');
        else {
            r.orgaos = a.linhas.map(l => ({ cod: String(l.COD_ORGAO).trim().padStart(8, '0'), sigla: String(l.SIGLA || '').trim(),
                fora: l.FORA_EXECUTIVO === undefined || l.FORA_EXECUTIVO === '' ? null : simNao(l.FORA_EXECUTIVO) })).filter(o => o.cod && o.sigla);
            nota('ORGAOS', 'ok', `${r.orgaos.length} órgão(s), ${r.orgaos.filter(o => o.fora).length} fora do Executivo`);
        }
    } else nota('ORGAOS', 'aviso', 'aba ausente — ficam as siglas e o expurgo padrão do sistema');

    // FONTES_LOA
    let wsF = abaPacote(wb, 'FONTES_LOA');
    if (wsF) {
        let a = lerAbaPacote(wsF);
        if (!a.colunas.includes('FT_DT') || !a.colunas.includes('SUB_FONTE')) nota('FONTES_LOA', 'erro', 'precisa das colunas FT_DT e SUB_FONTE');
        else {
            r.fontes = a.linhas.map(l => ({ ftdt: String(l.FT_DT).trim(), subfonte: String(l.SUB_FONTE).trim(),
                grupo: N(l.GRUPO) === 'TESOURO' ? 'Tesouro' : 'Outras Fontes', desc: String(l.DESCRICAO || '').trim(),
                codOrgao: l.COD_ORGAO ? String(l.COD_ORGAO).trim().padStart(8, '0') : '' })).filter(f => f.ftdt && f.subfonte);
            nota('FONTES_LOA', 'ok', `${r.fontes.length} sub fonte(s)`);
        }
    } else nota('FONTES_LOA', 'aviso', 'aba ausente — fica a tabela de fontes padrão do sistema');

    // LOA (obrigatória)
    let wsL = abaPacote(wb, 'LOA');
    if (!wsL) nota('LOA', 'erro', 'aba obrigatória ausente');
    else {
        let a = lerAbaPacote(wsL);
        let falta = OBRIGATORIAS_LOA_PACOTE.filter(c => !a.colunas.includes(c));
        if (falta.length) nota('LOA', 'erro', `colunas obrigatórias ausentes: ${falta.join(', ')}`);
        else {
            let invalidas = 0;
            r.creditos = [];
            a.linhas.forEach(l => {
                let f = partesFonteLOA(l.FONTE);
                let valor = typeof l.VALOR === 'number' ? l.VALOR : V(l.VALOR);
                if (!f || !valor) { invalidas++; return; }
                // PROGRAMA: só o código (222) ou "222 - NOME"; o nome também pode vir em NOME_PROGRAMA.
                let txtProg = String(l.PROGRAMA === undefined || l.PROGRAMA === null ? '' : l.PROGRAMA).trim();
                let prog = / - /.test(txtProg) ? programaDoTexto(txtProg) : { cod: txtProg ? txtProg.padStart(3, '0') : '', nome: '' };
                r.creditos.push({
                    esfera: esferaPacote(l.ESFERA), codOrgao: String(l.COD_ORGAO).trim().padStart(8, '0'), orgao: String(l.ORGAO || '').trim(),
                    codUO: String(l.COD_UO || l.COD_ORGAO).trim(), uo: String(l.UO || l.ORGAO || '').trim(),
                    programa: prog.cod, nomePrograma: String(l.NOME_PROGRAMA || prog.nome || '').trim(),
                    tipoAcao: String(l.TIPO_ACAO || '').trim(), codAcao: String(l.COD_ACAO || '').trim(), acao: String(l.ACAO || '').trim(),
                    funcao: String(l.FUNCAO || '').trim(), subfuncao: String(l.SUBFUNCAO || '').trim(), regiao: String(l.REGIAO || '').trim().padStart(2, '0'),
                    categoria: '', gnd: l.GND === '' || l.GND === undefined || l.GND === null ? '' : String(l.GND).trim().padStart(2, '0'),
                    modalidade: String(l.MODALIDADE || '').trim(), id: f.id, ft: f.ft, dt: f.dt, iduso: String(l.IDUSO || '').trim(), rp: '', valor });
            });
            let total = r.creditos.reduce((s, c) => s + c.valor, 0);
            nota('LOA', r.creditos.length ? (invalidas ? 'aviso' : 'ok') : 'erro', `${r.creditos.length.toLocaleString('pt-BR')} crédito(s), ${F(total)}` +
                (invalidas ? ` — ${invalidas} linha(s) sem FONTE válida ou sem VALOR, ignoradas` : '') +
                (a.colunas.includes('GND') ? '' : ' — sem coluna GND: o recorte por GND não se aplica'));
        }
    }

    // MAPPS (obrigatória)
    let wsM = abaPacote(wb, 'MAPPS');
    if (!wsM) nota('MAPPS', 'erro', 'aba obrigatória ausente');
    else {
        r.mapps = lerMAPPsDeWorkbook(wb, wsM);
        let falta = ['MAPP', 'ORGAO', 'FONTE', 'ESTAGIO_EXECUCAO'].filter(c => !r.mapps.headers.includes(c));
        if (falta.length) nota('MAPPS', 'erro', `colunas obrigatórias ausentes: ${falta.join(', ')}`);
        else nota('MAPPS', 'ok', `${r.mapps.linhas.length.toLocaleString('pt-BR')} linha(s)` +
            (r.mapps.headers.includes('PROGRAMA') ? ', com PROGRAMA' : ' — sem PROGRAMA: o cruzamento fica Órgão × Fonte') +
            (COLUNAS_GRUPO_MAPPS.some(c => r.mapps.headers.includes(c) || (c === 'OPERACAO_CREDITO' && r.mapps.headers.includes('OPERACA_CREDITO'))) ? '' : ' — sem colunas de grupo'));
    }

    // DE_PARA_FONTES
    if (abaPacote(wb, 'DE_PARA_FONTES')) {
        try { r.depara = lerDeParaDeWorkbook(wb); nota('DE_PARA_FONTES', 'ok', `${r.depara.length} linha(s)`); }
        catch (e) { nota('DE_PARA_FONTES', 'erro', e.message); }
    } else nota('DE_PARA_FONTES', 'aviso', 'aba ausente — vale a sugestão automática e o de-para deste navegador');

    // PROPOSTAS
    let wsPr = abaPacote(wb, 'PROPOSTAS');
    if (wsPr) {
        r.propostas = lerAbaPacote(wsPr).linhas.filter(l => l.MAPP && l.PROPOSTA !== '' && l.PROPOSTA !== undefined);
        nota('PROPOSTAS', 'ok', `${r.propostas.length} proposta(s) editada(s)`);
    }
    return r;
}

// ─── APLICAÇÃO ──────────────────────────────────────────────────────────────
function aplicarParametrosPacote(p) {
    if (!p) return;
    PARAMETROS_PACOTE.forEach(def => {
        if (!(def.chave in p) || !def.id) return;
        let el = document.getElementById(def.id);
        if (!el) return;
        if (def.caixa) el.checked = simNao(p[def.chave]);
        else el.value = p[def.chave] === null ? '' : p[def.chave];
    });
    if ('EXERCICIO_LOA' in p) definirExercicio(p.EXERCICIO_LOA);
    if ('GND' in p) {
        let gnds = new Set(String(p.GND).split(/[;,\s]+/).filter(Boolean).map(g => g.padStart(2, '0')));
        GNDS_LOA.forEach(g => { let el = document.getElementById('gnd-' + g); if (el) el.checked = gnds.has(g); });
    }
    if ('ESFERAS' in p) {
        let t = N(p.ESFERAS);
        document.getElementById('esf-fiscal').checked = t.includes('FISCAL');
        document.getElementById('esf-estatais').checked = t.includes('ESTATA');
    }
}

function aplicarTabelasPacote(r) {
    if (r.orgaos) {
        orgaosForaPacote = new Set(); orgaosDentroPacote = new Set();
        r.orgaos.forEach(o => {
            SIGLAS_ORGAO_LOA[o.cod] = o.sigla;
            if (o.fora === true) orgaosForaPacote.add(o.cod);
            if (o.fora === false) orgaosDentroPacote.add(o.cod);
        });
    }
    if (r.fontes) {
        Object.keys(FONTES_LOA).forEach(k => delete FONTES_LOA[k]);
        Object.keys(SUBFONTE_LOA_POR_ORGAO).forEach(k => delete SUBFONTE_LOA_POR_ORGAO[k]);
        r.fontes.forEach(f => {
            let lista = FONTES_LOA[f.ftdt] || (FONTES_LOA[f.ftdt] = []);
            if (!lista.some(x => x.subfonte === f.subfonte)) lista.push({ subfonte: f.subfonte, grupo: f.grupo, desc: f.desc });
            if (f.codOrgao) (SUBFONTE_LOA_POR_ORGAO[f.codOrgao] = SUBFONTE_LOA_POR_ORGAO[f.codOrgao] || {})[f.ftdt] = f.subfonte;
        });
    }
}

// Proposta editada: pela CHAVE (exportada pelo próprio sistema) ou por MAPP + ÓRGÃO + FONTE.
function aplicarPropostasPacote(lista) {
    if (!lista) return 0;
    let porTexto = {};
    linhasAjustes.forEach(l => { let k = N(l.mapp) + '||' + l.fonte + '||' + N(l.orgao); if (!porTexto[k]) porTexto[k] = l.chave; });
    let n = 0;
    propostasManuais = {};
    lista.forEach(p => {
        let chave = p.CHAVE || porTexto[N(p.MAPP) + '||' + String(p.FONTE || '').trim() + '||' + N(p.ORGAO)];
        if (!chave) return;
        let valor = typeof p.PROPOSTA === 'number' ? p.PROPOSTA : V(p.PROPOSTA);
        propostasManuais[chave] = { valor: Math.max(valor, 0), origem: N(p.ORIGEM).startsWith('REDISTRIBU') ? 'redistribuicao' : 'manual' };
        n++;
    });
    salvarPropostasLocal();
    return n;
}

async function selecionarArquivoPacote(input) {
    let arquivo = input.files && input.files[0];
    if (!arquivo) return;
    let status = document.getElementById('status-pacote');
    status.innerHTML = 'Lendo o pacote…';
    try {
        let wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await lerArquivoComoBuffer(arquivo));
        let r = lerPacoteEstudo(wb);
        if (r.erros) { mostrarRelatorioPacote(arquivo.name, r, false); return; }
        aplicarParametrosPacote(r.parametros);
        aplicarTabelasPacote(r);
        carregarLOAPloa({ creditos: r.creditos, conferencia: {}, doPacote: true }, `${arquivo.name} (aba LOA)`);
        carregarMAPPs(r.mapps.linhas, `${arquivo.name} (aba MAPPS)`, r.mapps.headers);
        // A fonte do Valor Deliberado só existe na lista depois que a base foi carregada.
        if (r.parametros && r.parametros.VD_FONTE) { let sel = document.getElementById('vd-fonte'); if (sel) sel.value = r.parametros.VD_FONTE; }
        if (r.depara) {
            deParaManual = {};
            let d = aplicarDeParaImportado(r.depara);
            r.relatorio.find(x => x.aba === 'DE_PARA_FONTES').txt += ` → ${d.aplicadas} manual(is)` + (d.rejeitadas.length ? `, ${d.rejeitadas.length} rejeitada(s) (fonte fora da base)` : '') +
                (d.conflitos.length ? `, ${d.conflitos.length} conflito(s) (mesma fonte da LOA em duas Fontes do MAPP; vale a 1ª): ${d.conflitos.slice(0, 4).join('; ')}` : '');
        }
        recalcularEstudo();
        if (r.propostas) {
            let n = aplicarPropostasPacote(r.propostas);
            r.relatorio.find(x => x.aba === 'PROPOSTAS').txt += ` → ${n} aplicada(s)`;
            renderizarAjustesFinais();
        }
        mostrarRelatorioPacote(arquivo.name, r, true);
    } catch (err) {
        console.error(err);
        status.innerHTML = `<span class="erro">❌ ${escHtml(err.message || err)}</span>`;
    } finally {
        input.value = '';
    }
}

function mostrarRelatorioPacote(nome, r, carregado) {
    let icone = { ok: '✅', aviso: '⚠', erro: '✖' };
    document.getElementById('status-pacote').innerHTML =
        (carregado ? `<span class="ok">✅ ${escHtml(nome)} carregado</span>` : `<span class="erro">✖ ${escHtml(nome)} não foi carregado: corrija os erros abaixo.</span>`) +
        '<br>' + r.relatorio.map(x => `<span class="${x.tipo === 'erro' ? 'erro' : x.tipo === 'aviso' ? 'aviso' : ''}">${icone[x.tipo]} <strong>${escHtml(x.aba)}</strong>: ${escHtml(x.txt)}</span>`).join('<br>');
}

// ─── GERAÇÃO (modelo vazio ou pacote com o que está carregado) ──────────────
function linhasParametrosPacote() {
    let prm = lerParametrosEstudo();
    return PARAMETROS_PACOTE.map(def => {
        let valor;
        if (def.chave === 'EXERCICIO_LOA') valor = exercicioLOA;
        else if (def.chave === 'GND') valor = [...prm.gnds].sort().join(';');
        else if (def.chave === 'ESFERAS') valor = [...prm.esferas].map(e => e === 'INVESTIMENTOS ESTATAIS' ? 'ESTATAIS' : 'FISCAL').join(';');
        else {
            let el = document.getElementById(def.id);
            valor = def.caixa ? (el && el.checked ? 'S' : 'N') : (el ? el.value : '');
            if (!def.caixa && valor !== '' && !isNaN(Number(valor))) valor = Number(valor);
        }
        return { parametro: def.chave, valor, desc: def.desc };
    });
}

function linhasOrgaosPacote() {
    let cods = new Set(Object.keys(SIGLAS_ORGAO_LOA));
    loaCreditos.forEach(c => cods.add(c.codOrgao));
    let nomes = {};
    loaCreditos.forEach(c => { nomes[c.codOrgao] = c.orgao; });
    return [...cods].sort().map(cod => ({ cod, sigla: SIGLAS_ORGAO_LOA[cod] || '', nome: nomes[cod] || '', fora: loaForaDoExecutivo({ codOrgao: cod }) ? 'S' : 'N' }));
}

function linhasFontesPacote() {
    let linhas = [];
    Object.keys(FONTES_LOA).sort().forEach(ftdt => FONTES_LOA[ftdt].forEach(f => linhas.push({ ftdt, subfonte: f.subfonte, grupo: f.grupo, desc: f.desc, cod: '' })));
    Object.keys(SUBFONTE_LOA_POR_ORGAO).sort().forEach(cod => {
        for (let ftdt in SUBFONTE_LOA_POR_ORGAO[cod]) {
            let sub = SUBFONTE_LOA_POR_ORGAO[cod][ftdt];
            let f = (FONTES_LOA[ftdt] || []).find(x => x.subfonte === sub) || {};
            linhas.push({ ftdt, subfonte: sub, grupo: f.grupo || '', desc: f.desc || '', cod });
        }
    });
    return linhas;
}

async function baixarPacoteEstudo(modelo) {
    if (typeof ExcelJS === 'undefined') return alert('A biblioteca de exportação (ExcelJS) não carregou — verifique a conexão.');
    let wb = new ExcelJS.Workbook();
    wb.creator = 'SIPOG COFIP — Estudo LOA × MAPPs';
    let leia = wb.addWorksheet('LEIA-ME');
    leia.getColumn(1).width = 22; leia.getColumn(2).width = 110;
    [
        ['Pacote do estudo LOA × MAPPs', ''],
        ['Gerado em', new Date().toLocaleString('pt-BR')],
        ['Exercício da LOA', exercicioLOA],
        ['', ''],
        ['Aba', 'Conteúdo'],
        ['PARAMETROS', 'PARAMETRO | VALOR. Percentuais e opções da aba 2 e o recorte da LOA (GND, esferas, modalidade 91).'],
        ['LOA', 'Obrigatória. Uma linha por crédito da LOA (extração do SIOF ou ferramentas/extrair_ploa.py). Obrigatórias: COD_ORGAO, FONTE (ID.FT.DT, FT.DT ou código completo), VALOR. Recomendadas: PROGRAMA, GND, ESFERA, MODALIDADE, COD_ACAO, ACAO.'],
        ['MAPPS', 'Obrigatória. Layout da "Consulta Primária" do SIPOG (MAPP, ORGAO, FONTE, ESTAGIO_EXECUCAO, VLR_…, colunas de grupo) + PROGRAMA ("222 - NOME").'],
        ['DE_PARA_FONTES', 'SUB FONTE da LOA → FONTE DO MAPP. "(sem fonte)" deixa a LOA fora do cruzamento.'],
        ['ORGAOS', 'COD_ORGAO → SIGLA usada nos MAPPs; FORA_EXECUTIVO = S expurga a LOA e os MAPPs do órgão.'],
        ['FONTES_LOA', 'FT_DT → SUB_FONTE completa, GRUPO (Tesouro/Outras Fontes), DESCRICAO; COD_ORGAO quando o FT.DT tem mais de uma sub fonte (ex.: 754.49).'],
        ['PROPOSTAS', 'Edições da Proposta de Programado (CHAVE ou MAPP + ORGAO + FONTE, PROPOSTA, ORIGEM).'],
        ['', ''],
        ['Próximo ano', '1) receber a LOA nova; 2) baixar este pacote como modelo; 3) trocar LOA e MAPPS e o EXERCICIO_LOA; 4) revisar ORGAOS, FONTES_LOA e o de-para; 5) carregar e conferir os totais na aba 1.']
    ].forEach((l, i) => { leia.addRow(l); if (i === 0 || i === 4) leia.getRow(i + 1).font = { bold: true }; });

    adicionarAbaEstudo(wb, 'PARAMETROS', [{ titulo: 'PARAMETRO', chave: 'parametro', largura: 26 }, { titulo: 'VALOR', chave: 'valor', largura: 22 },
        { titulo: 'DESCRIÇÃO', chave: 'desc', largura: 70 }], linhasParametrosPacote());

    let colsLOA = COLUNAS_LOA_PACOTE.map(c => ({ titulo: c, chave: c, largura: c === 'VALOR' ? 18 : (/ACAO$|ORGAO$|UO$|PROGRAMA$/.test(c) && !/^COD/.test(c) ? 36 : 12), moeda: c === 'VALOR' }));
    adicionarAbaEstudo(wb, 'LOA', colsLOA, modelo ? [] : loaCreditos.map(c => ({
        ESFERA: c.esfera, COD_ORGAO: c.codOrgao, ORGAO: c.orgao, COD_UO: c.codUO, UO: c.uo, PROGRAMA: c.programa, NOME_PROGRAMA: c.nomePrograma,
        TIPO_ACAO: c.tipoAcao, COD_ACAO: c.codAcao, ACAO: c.acao, FUNCAO: c.funcao, SUBFUNCAO: c.subfuncao, REGIAO: c.regiao, GND: c.gnd,
        MODALIDADE: c.modalidade, FONTE: `${c.id}.${c.ft}.${c.dt}`, IDUSO: c.iduso, VALOR: c.valor })));

    let colsM = (!modelo && mappsColunasOriginais.length) ? mappsColunasOriginais : ['SECRETARIA', 'ORGAO', 'MAPP', 'PROGRAMA', 'FONTE', 'ESTAGIO_EXECUCAO',
        COLS_PAPEL.pBase[0], COLS_PAPEL.lBase[0], COLS_PAPEL.eBase[0], COLS_PAPEL.pLOA[0], 'ENTREGA_PRIORITARIA', 'PCF_CONVENIO', 'CONTRATO_GESTAO', 'CONTINUIDADE', 'OPERACA_CREDITO'];
    adicionarAbaEstudo(wb, 'MAPPS', colsM.map(c => ({ titulo: c, chave: c, fixo: true, moeda: /^VLR_/.test(c), largura: /^VLR_/.test(c) ? 18 : (c === 'MAPP' ? 60 : 16) })),
        modelo ? [] : mappsOriginais.map(r => { let o = {}; colsM.forEach(c => { o[c] = /^VLR_/.test(c) ? V(r[c]) : (r[c] === undefined ? '' : r[c]); }); return o; }));

    if (!modelo && loaLinhas.length) adicionarAbaDePara(wb);
    else adicionarAbaEstudo(wb, 'DE_PARA_FONTES', COLUNAS_DEPARA_XLSX, []);

    adicionarAbaEstudo(wb, 'ORGAOS', [{ titulo: 'COD_ORGAO', chave: 'cod', largura: 12 }, { titulo: 'SIGLA', chave: 'sigla', largura: 16 },
        { titulo: 'NOME', chave: 'nome', largura: 60 }, { titulo: 'FORA_EXECUTIVO', chave: 'fora', largura: 16 }], linhasOrgaosPacote());
    adicionarAbaEstudo(wb, 'FONTES_LOA', [{ titulo: 'FT_DT', chave: 'ftdt', largura: 10 }, { titulo: 'SUB_FONTE', chave: 'subfonte', largura: 18 },
        { titulo: 'GRUPO', chave: 'grupo', largura: 14 }, { titulo: 'DESCRICAO', chave: 'desc', largura: 70 }, { titulo: 'COD_ORGAO', chave: 'cod', largura: 12 }], linhasFontesPacote());

    let porChave = {};
    linhasAjustes.forEach(l => { porChave[l.chave] = l; });
    adicionarAbaEstudo(wb, 'PROPOSTAS', [{ titulo: 'CHAVE', chave: 'chave', largura: 40 }, { titulo: 'MAPP', chave: 'mapp', largura: 60 },
        { titulo: 'ORGAO', chave: 'orgao', largura: 14 }, { titulo: 'FONTE', chave: 'fonte', largura: 40 }, { titulo: 'PROPOSTA', chave: 'proposta', moeda: true, largura: 20 },
        { titulo: 'ORIGEM', chave: 'origem', largura: 16 }],
        modelo ? [] : Object.entries(propostasManuais).filter(([k]) => porChave[k]).map(([k, p]) => ({ chave: k, mapp: porChave[k].mapp, orgao: porChave[k].orgao,
            fonte: porChave[k].fonte, proposta: p.valor, origem: p.origem === 'redistribuicao' ? 'redistribuída' : 'editada' })));

    await baixarWorkbook(wb, `SIPOG_Pacote_Estudo_LOA_${modelo ? 'modelo_' : ''}${carimboDataHora()}.xlsx`);
}
