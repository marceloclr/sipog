// SIPOG COFIP — js/10-filtros.js
// Dropdowns múltiplos de filtro por aba e filtros/dimensões do PLOA Detalhado.
// Script clássico (escopo global). Ordem de carga definida em index.html — não reordenar.
function constuírDropdownsMultiplos() {
    let orgs = new Set(), ests = new Set(), fnts = new Set(), clss = new Set();
    dadosProcessados.forEach(d => {
        if(d.orgao) orgs.add(d.orgao.trim());
        if(d.estagio) ests.add(d.estagio.trim());
        if(d.fonte) fnts.add(d.fonte.trim());
        if(d.classe) clss.add(d.classe.trim());
    });

    let arrOrg = Array.from(orgs).sort();
    let arrEst = Array.from(ests).sort();
    let arrFnt = Array.from(fnts).sort();
    let arrCls = Array.from(clss).sort();

    ['dash', 'gestao'].forEach(aba => {
        // Preserva as seleções ativas antes de reconstruir os dropdowns
        // Mantém apenas as opções que ainda existem na nova lista (ex.: após exclusão de MAPPs)
        let selAtualOrg  = new Set([...seletoresAtivos[aba]['orgao']].filter(v => orgs.has(v)));
        let selAtualEst  = new Set([...seletoresAtivos[aba]['estagio']].filter(v => ests.has(v)));
        let selAtualFnt  = new Set([...seletoresAtivos[aba]['fonte']].filter(v => fnts.has(v)));
        let selAtualCls  = new Set([...seletoresAtivos[aba]['classe']].filter(v => clss.has(v)));

        renderizarEstruturaHtmlDropdown(`m-${aba}-orgao`,   arrOrg, aba, 'orgao',   true,  selAtualOrg);
        renderizarEstruturaHtmlDropdown(`m-${aba}-estagio`, arrEst, aba, 'estagio', true,  selAtualEst);
        renderizarEstruturaHtmlDropdown(`m-${aba}-fonte`,   arrFnt, aba, 'fonte',   false, selAtualFnt);
        renderizarEstruturaHtmlDropdown(`m-${aba}-classe`,  arrCls, aba, 'classe',  true,  selAtualCls);
    });
}

// Reseta os filtros de uma aba específica para o estado padrão de fábrica
function resetarFiltrosAba(aba) {
    let tipos = ['orgao', 'estagio', 'fonte', 'classe'];
    tipos.forEach(tipo => {
        // Limpa a seleção atual
        seletoresAtivos[aba][tipo].clear();
        // Reconstrói o dropdown do tipo nesta aba com padrão de fábrica (selAtual vazio → usa padrão)
        let idContainer = `m-${aba}-${tipo}`;
        let container = document.getElementById(idContainer);
        if (!container) return;
        let dropdownMenu = container.querySelector('.multiselect-dropdown');
        if (!dropdownMenu) return;
        // Coleta as opções atuais do DOM para reconstruir com padrão
        let listaOpcoes = Array.from(dropdownMenu.querySelectorAll('.multiselect-item span')).map(s => s.textContent);
        renderizarEstruturaHtmlDropdown(idContainer, listaOpcoes, aba, tipo, tipo !== 'fonte', new Set());
    });
    sincronizarEFiltarTudo(aba, 'orgao');
    sincronizarEFiltarTudo(aba, 'estagio');
    sincronizarEFiltarTudo(aba, 'fonte');
    sincronizarEFiltarTudo(aba, 'classe');
    recalculoGeralInjetado();
}

function renderizarEstruturaHtmlDropdown(idContainer, listaOpcoes, aba, tipoFiltro, marcarTodosPorPadrao, selAtual) {
    let container = document.getElementById(idContainer);
    if(!container) return;
    let dropdownMenu = container.querySelector('.multiselect-dropdown');
    dropdownMenu.innerHTML = '';

    // Se selAtual foi passado e tem itens → preservar seleções existentes
    // Se selAtual está vazio (reset ou primeira carga) → usar padrão de fábrica
    let usarPreservado = selAtual && selAtual.size > 0;

    let acoesBarra = document.createElement('div');
    acoesBarra.className = 'multiselect-actions';
    
    let btnMarcarTodos = document.createElement('button');
    btnMarcarTodos.textContent = '☑️ Marcar Todos';
    btnMarcarTodos.type = 'button';
    btnMarcarTodos.onclick = function(e) {
        e.stopPropagation();
        listaOpcoes.forEach(op => seletoresAtivos[aba][tipoFiltro].add(op));
        dropdownMenu.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = true);
        atualizarTextoCaixaSeletor(idContainer, seletoresAtivos[aba][tipoFiltro], listaOpcoes.length);
        sincronizarEFiltarTudo(aba, tipoFiltro);
    };

    let btnDesmarcarTodos = document.createElement('button');
    btnDesmarcarTodos.textContent = '⬜ Limpar Filtro';
    btnDesmarcarTodos.type = 'button';
    btnDesmarcarTodos.onclick = function(e) {
        e.stopPropagation();
        seletoresAtivos[aba][tipoFiltro].clear();
        dropdownMenu.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
        atualizarTextoCaixaSeletor(idContainer, seletoresAtivos[aba][tipoFiltro], listaOpcoes.length);
        sincronizarEFiltarTudo(aba, tipoFiltro);
    };

    acoesBarra.appendChild(btnMarcarTodos);
    acoesBarra.appendChild(btnDesmarcarTodos);
    dropdownMenu.appendChild(acoesBarra);

    // Campo de busca
    let buscaWrap = document.createElement('div');
    buscaWrap.style.cssText = 'padding:6px 10px 4px;';
    let buscaInput = document.createElement('input');
    buscaInput.type = 'text';
    buscaInput.placeholder = '🔍 Buscar...';
    buscaInput.style.cssText = 'width:100%;padding:5px 8px;border-radius:5px;border:1px solid var(--border);background:var(--panel2);color:var(--text);font-size:12px;box-sizing:border-box;';
    buscaInput.addEventListener('input', function(e) {
        e.stopPropagation();
        let termo = this.value.toLowerCase().trim();
        dropdownMenu.querySelectorAll('.multiselect-item').forEach(item => {
            let texto = item.querySelector('span') ? item.querySelector('span').textContent.toLowerCase() : '';
            item.style.display = (!termo || texto.includes(termo)) ? '' : 'none';
        });
    });
    buscaInput.addEventListener('click', e => e.stopPropagation());
    buscaInput.addEventListener('keydown', e => e.stopPropagation());
    buscaWrap.appendChild(buscaInput);
    dropdownMenu.appendChild(buscaWrap);

    seletoresAtivos[aba][tipoFiltro].clear();

    listaOpcoes.forEach(opcao => {
        let item = document.createElement('div');
        item.className = 'multiselect-item';
        
        let chk = document.createElement('input');
        chk.type = 'checkbox';
        
        let deveMarcar = false;
        if (usarPreservado) {
            // Preserva a seleção anterior do usuário
            deveMarcar = selAtual.has(opcao);
        } else if (tipoFiltro === 'fonte') {
            let nOpcao = N(opcao);
            deveMarcar = (nOpcao.includes('500') && nOpcao.includes('501'));
        } else {
            deveMarcar = marcarTodosPorPadrao;
        }

        chk.checked = deveMarcar;
        if(deveMarcar) { seletoresAtivos[aba][tipoFiltro].add(opcao); }

        chk.addEventListener('change', function(e) {
            if(chk.checked) { seletoresAtivos[aba][tipoFiltro].add(opcao); } 
            else { seletoresAtivos[aba][tipoFiltro].delete(opcao); }
            atualizarTextoCaixaSeletor(idContainer, seletoresAtivos[aba][tipoFiltro], listaOpcoes.length);
            sincronizarEFiltarTudo(aba, tipoFiltro);
        });

        item.appendChild(chk);
        let lbl = document.createElement('span');
        lbl.textContent = (tipoFiltro === 'classe') ? labelClasse(opcao) : opcao;
        item.appendChild(lbl);
        
        item.onclick = function(e) {
            if(e.target !== chk) {
                chk.checked = !chk.checked;
                chk.dispatchEvent(new Event('change'));
            }
        };
        dropdownMenu.appendChild(item);
    });
    atualizarTextoCaixaSeletor(idContainer, seletoresAtivos[aba][tipoFiltro], listaOpcoes.length);
}

function sincronizarEFiltarTudo(abaOrigem, tipoFiltro) {
    // "PLOA Detalhado" tem escopo de dados próprio (inclui MAPPs excluídos e a
    // dimensão Secretaria) — fica isolado, não sincroniza com dash/gestao/aud.
    if (abaOrigem === 'plodet') { renderizarPLODetalhado(); return; }

    let conjuntoOrigem = seletoresAtivos[abaOrigem][tipoFiltro];
    
    ['dash', 'gestao'].forEach(abaDestino => {
        if(abaDestino !== abaOrigem) {
            seletoresAtivos[abaDestino][tipoFiltro] = new Set(conjuntoOrigem);
            
            let idContainer = `m-${abaDestino}-${tipoFiltro}`;
            let container = document.getElementById(idContainer);
            if(container) {
                let dropdownMenu = container.querySelector('.multiselect-dropdown');
                let checkboxes = dropdownMenu.querySelectorAll('.multiselect-item');
                checkboxes.forEach(item => {
                    let chk = item.querySelector('input[type="checkbox"]');
                    let texto = item.querySelector('span').textContent;
                    chk.checked = conjuntoOrigem.has(texto);
                });
                let totalItens = dropdownMenu.querySelectorAll('.multiselect-item').length;
                atualizarTextoCaixaSeletor(idContainer, conjuntoOrigem, totalItens);
            }
        }
    });

    recalculoGeralInjetado();
}

function atualizarTextoCaixaSeletor(idContainer, conjuntoAtivo, totalItens) {
    let container = document.getElementById(idContainer);
    if(!container) return;
    let box = container.querySelector('.multiselect-box');
    if(conjuntoAtivo.size === 0) { box.textContent = "Nenhum Selecionado"; } 
    else if(conjuntoAtivo.size === totalItens) { box.textContent = "Todos Selecionados (" + totalItens + ")"; } 
    else { box.textContent = conjuntoAtivo.size + " selecionados"; }
}

function zerarFiltrosEstrutura() {
    ['dash', 'gestao'].forEach(aba => {
        for(let tipo in seletoresAtivos[aba]) { seletoresAtivos[aba][tipo].clear(); }
        ['orgao','estagio','fonte','classe'].forEach(tipo => {
            let container = document.getElementById(`m-${aba}-${tipo}`);
            if(container) {
                container.querySelector('.multiselect-box').textContent = "Nenhum Selecionado";
                container.querySelector('.multiselect-dropdown').innerHTML = '';
            }
        });
    });
}

function checkFiltroMulti(item, aba) {
    let s = seletoresAtivos[aba];
    // Premissa do projeto: TODO valor em tabela ou card respeita a Fonte
    // selecionada no Painel de Monitoramento (Carga e Ajustes) — não existe
    // mais agregação "todas as fontes" em nenhum lugar do sistema. A aba
    // 'dash' não tem seletor de Fonte próprio: usa sempre monFonteSelecionada.
    // Sem fonte selecionada, nada passa no filtro (estado vazio proposital).
    let fonteOk = (aba === 'dash')
        ? (!!monFonteSelecionada && N(item.fonte) === N(monFonteSelecionada))
        : s.fonte.has(item.fonte.trim());
    return s.orgao.has(item.orgao.trim()) &&
           s.estagio.has(item.estagio.trim()) &&
           fonteOk &&
           s.classe.has(item.classe.trim());
}

// ─── PLOA DETALHADO: dimensões de agrupamento disponíveis ─────────────────────
const PLODET_DIMENSOES = {
    classe:      { campo: 'classe',      label: 'Grupo de Projetos' },
    orgao:       { campo: 'orgao',       label: 'Órgão' },
    secretaria:  { campo: 'secretaria',  label: 'Secretaria' },
    fonte:       { campo: 'fonte',       label: 'Fonte' },
    estagio:     { campo: 'estagio',     label: 'Estágio de Execução' }
};

// Escopo próprio: todos os MAPPs (ativos + excluídos/expurgados), com a dimensão
// Secretaria além das 4 já usadas em Dash/Gestão.
function checkFiltroPLODetalhado(item) {
    let s = seletoresAtivos.plodet;
    return s.orgao.has((item.orgao || 'NÃO INFORMADO').toString().trim()) &&
           s.secretaria.has((item.secretaria || 'NÃO INFORMADO').toString().trim()) &&
           s.estagio.has((item.estagio || 'NÃO INFORMADO').toString().trim()) &&
           s.fonte.has((item.fonte || 'NÃO INFORMADA').toString().trim()) &&
           s.classe.has((item.classe || 'NÃO INFORMADO').toString().trim());
}

function basePLODetalhado() {
    return dadosProcessados.map(d => Object.assign({}, d, { excluido: false }))
        .concat(dadosExcluidos.map(d => Object.assign({}, d, { excluido: true })));
}

function construirDropdownsPLODetalhado() {
    let base = basePLODetalhado();
    let orgs = new Set(), secs = new Set(), ests = new Set(), fnts = new Set(), clss = new Set();
    base.forEach(d => {
        orgs.add((d.orgao || 'NÃO INFORMADO').toString().trim());
        secs.add((d.secretaria || 'NÃO INFORMADO').toString().trim());
        ests.add((d.estagio || 'NÃO INFORMADO').toString().trim());
        fnts.add((d.fonte || 'NÃO INFORMADA').toString().trim());
        clss.add((d.classe || 'NÃO INFORMADO').toString().trim());
    });
    let selOrg = new Set([...seletoresAtivos.plodet.orgao].filter(v => orgs.has(v)));
    let selSec = new Set([...seletoresAtivos.plodet.secretaria].filter(v => secs.has(v)));
    let selEst = new Set([...seletoresAtivos.plodet.estagio].filter(v => ests.has(v)));
    let selFnt = new Set([...seletoresAtivos.plodet.fonte].filter(v => fnts.has(v)));
    let selCls = new Set([...seletoresAtivos.plodet.classe].filter(v => clss.has(v)));

    renderizarEstruturaHtmlDropdown('m-plodet-orgao',      Array.from(orgs).sort(), 'plodet', 'orgao',      true,  selOrg);
    renderizarEstruturaHtmlDropdown('m-plodet-secretaria', Array.from(secs).sort(), 'plodet', 'secretaria', true,  selSec);
    renderizarEstruturaHtmlDropdown('m-plodet-estagio',    Array.from(ests).sort(), 'plodet', 'estagio',    true,  selEst);
    renderizarEstruturaHtmlDropdown('m-plodet-fonte',      Array.from(fnts).sort(), 'plodet', 'fonte',      false, selFnt);
    renderizarEstruturaHtmlDropdown('m-plodet-classe',     Array.from(clss).sort(), 'plodet', 'classe',     true,  selCls);
}

function resetarFiltrosPLODetalhado() {
    ['orgao', 'secretaria', 'estagio', 'fonte', 'classe'].forEach(tipo => {
        seletoresAtivos.plodet[tipo].clear();
        let idContainer = `m-plodet-${tipo}`;
        let container = document.getElementById(idContainer);
        if (!container) return;
        let dropdownMenu = container.querySelector('.multiselect-dropdown');
        if (!dropdownMenu) return;
        let listaOpcoes = Array.from(dropdownMenu.querySelectorAll('.multiselect-item span')).map(s => s.textContent);
        renderizarEstruturaHtmlDropdown(idContainer, listaOpcoes, 'plodet', tipo, tipo !== 'fonte', new Set());
    });
    renderizarPLODetalhado();
}

