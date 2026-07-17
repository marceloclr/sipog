// SIPOG COFIP — js/05-nuvem-firestore.js
// Persistência na nuvem (Firestore em chunks), cenários, e operações JSON locais (carregarJSON, limparBase).
// Script clássico (escopo global). Ordem de carga definida em index.html — não reordenar.
// === PERSISTÊNCIA NA NUVEM (FIREBASE FIRESTORE) ===
// As primitivas do SDK (db, doc, getDoc, setDoc, etc.) são expostas pelo script
// type="module" anterior em window.__fb, pois módulos ES não publicam suas
// variáveis de nível superior diretamente em window.

window.__setStatusNuvem = function (texto, ok) {
    let el = document.getElementById('status-nuvem');
    if (!el) return;
    el.textContent = texto;
    el.style.color = ok ? 'var(--success)' : 'var(--muted)';
};

async function aguardarNuvemPronta() {
    if (!window.__fb) throw new Error("SDK do Firebase não carregado.");
    let autenticado = await window.__fb.authReady;
    if (!autenticado) throw new Error("Falha na autenticação com a nuvem.");
    return window.__fb;
}

// O Firestore limita cada documento a 1 MB. A base de dados completa (dadosBrutos)
// facilmente ultrapassa esse limite, então o pacote é serializado e fragmentado em
// "chunks" de texto, gravados como subcoleção do documento principal (meta), e
// remontados na leitura.
const TAMANHO_MAX_CHUNK_CHARS = 250000; // ~500KB por chunk em UTF-8 (margem segura abaixo de 1MB)

function dividirEmChunks(textoCompleto) {
    let chunks = [];
    for (let i = 0; i < textoCompleto.length; i += TAMANHO_MAX_CHUNK_CHARS) {
        chunks.push(textoCompleto.slice(i, i + TAMANHO_MAX_CHUNK_CHARS));
    }
    return chunks.length > 0 ? chunks : [''];
}

async function gravarPacoteFragmentado(fb, colecaoOuDocRef, pacote, idDocumento) {
    // Se idDocumento fornecido → usa doc fixo (estado_atual/sessao)
    // Se não fornecido → gera ID aleatório para coleção cenarios
    let docRef = idDocumento
        ? fb.doc(fb.db, colecaoOuDocRef, idDocumento)
        : fb.doc(fb.collection(fb.db, colecaoOuDocRef));

    let textoCompleto = JSON.stringify(pacote);
    let chunks = dividirEmChunks(textoCompleto);

    let meta = {
        sistema: "SIPOG",
        versao_schema: 2,
        nome: pacote.nome || null,
        salvo_em: pacote.salvo_em || new Date().toISOString(),
        totalChunks: chunks.length,
        tamanhoTotalCaracteres: textoCompleto.length,
        totalRegistros: (pacote.dados && Array.isArray(pacote.dados.dadosBrutos)) ? pacote.dados.dadosBrutos.length : 0
    };
    if (pacote.criado_em) meta.criado_em = pacote.criado_em;

    await fb.setDoc(docRef, meta);

    let chunksCollRef = fb.collection(fb.db, docRef.path + '/chunks');
    await Promise.all(chunks.map((c, idx) =>
        fb.setDoc(fb.doc(fb.db, docRef.path + '/chunks', String(idx)), { index: idx, data: c })
    ));

    return docRef;
}

async function lerPacoteFragmentado(fb, colecao, idDocumento) {
    let docRef = fb.doc(fb.db, colecao, idDocumento);
    let metaSnap = await fb.getDoc(docRef);
    if (!metaSnap.exists()) return null;
    let meta = metaSnap.data();

    let q = fb.query(fb.collection(fb.db, colecao + '/' + idDocumento + '/chunks'), fb.orderBy('index', 'asc'));
    let chunksSnap = await fb.getDocs(q);

    let partes = [];
    chunksSnap.forEach(c => partes.push(c.data()));
    partes.sort((a, b) => a.index - b.index);

    let textoCompleto = partes.map(p => p.data).join('');
    if (!textoCompleto) return null;

    let pacote = JSON.parse(textoCompleto);
    pacote.__meta = meta;
    return pacote;
}

async function excluirPacoteFragmentado(fb, colecao, idDocumento) {
    let chunksPath = colecao + '/' + idDocumento + '/chunks';
    let chunksSnap = await fb.getDocs(fb.collection(fb.db, chunksPath));
    let exclusoes = [];
    chunksSnap.forEach(c => exclusoes.push(fb.deleteDoc(fb.doc(fb.db, chunksPath, c.id))));
    await Promise.all(exclusoes);
    await fb.deleteDoc(fb.doc(fb.db, colecao, idDocumento));
}

function montarPacoteNuvem(nomeCenario) {
    let exclusoesManuais = dadosExcluidos.filter(d => !d.isExpurgado).map(d => d.idOriginal);
    let ajustesManuais = dadosProcessados.filter(d => d.foiAjustado).map(d => ({ idOriginal: d.idOriginal, necessidade2027Ajustada: d.necessidade2027Ajustada }));
    return {
        sistema: "SIPOG",
        versao_schema: 2,
        nome: nomeCenario || null,
        salvo_em: new Date().toISOString(),
        parametros: coletarParametros(),
        dados: {
            dadosBrutos: dadosBrutos,
            totalRegistrosBase: totalRegistrosBase,
            exclusoesManuais: exclusoesManuais,
            ajustesManuais: ajustesManuais
        }
    };
}

async function aplicarPacoteNuvem(pacote, origemTexto) {
    if (!pacote || !pacote.dados || !Array.isArray(pacote.dados.dadosBrutos)) {
        alert("O pacote de dados recebido da nuvem é inválido ou está corrompido.");
        return;
    }
    dadosBrutos = pacote.dados.dadosBrutos;
    totalRegistrosBase = pacote.dados.totalRegistrosBase || dadosBrutos.length;
    dadosExcluidos = [];

    if (pacote.parametros) aplicarParametros(pacote.parametros);

    ploGerado = false; ploDataGeracao = null; atualizarStatusPLO();
    processarDados();
    if (window._filtrosPendentesRestore) {
        restaurarFiltrosSalvos(window._filtrosPendentesRestore);
        window._filtrosPendentesRestore = null;
        // Re-sanitiza: remove do seletoresAtivos quaisquer fontes/órgãos/estágios restaurados
        // que não existam nos dados atuais (mismatch de string entre save e carga corrente).
        constuírDropdownsMultiplos();
    }
    let qtdExclusoesRestauradas = reaplicarExclusoesManuais(pacote.dados.exclusoesManuais);
    let qtdAjustesRestaurados = reaplicarAjustesManuais(pacote.dados.ajustesManuais);
    // Recalcula sempre ao final — garante que d-nec27aj, gráficos e painel
    // reflitam o estado completo (ajustes + filtros restaurados) mesmo que
    // nenhum ajuste tenha sido reaplicado com sucesso (IDs não casaram).
    recalculoGeralInjetado();

    document.getElementById('info-registros').innerHTML = `
        <strong style="color:var(--success)">✅ ${totalRegistrosBase.toLocaleString('pt-BR')} registros carregados ${origemTexto || 'da nuvem'}</strong>
        ${qtdExclusoesRestauradas > 0 ? `<br><span style="color:var(--danger)">🗑️ ${qtdExclusoesRestauradas} exclusão(ões) manual(is) reaplicada(s)</span>` : ''}
        ${qtdAjustesRestaurados > 0 ? `<br><span style="color:#a29bfe">✏️ ${qtdAjustesRestaurados} ajuste(s) de Necessidade Real 2027 reaplicado(s)</span>` : ''}
    `;
}

async function salvarEstadoAtualNuvem() {
    if (dadosBrutos.length === 0) return alert("Importe e processe uma base antes de salvar o estado atual na nuvem.");
    try {
        window.__setStatusNuvem('☁️ Salvando estado atual...', true);
        let fb = await aguardarNuvemPronta();
        let pacote = montarPacoteNuvem('estado_atual');
        await gravarPacoteFragmentado(fb, 'estado_atual', pacote, 'sessao');
        window.__setStatusNuvem('☁️ Estado atual salvo na nuvem', true);
        alert("Estado atual salvo na nuvem com sucesso.");
    } catch (err) {
        console.error(err);
        window.__setStatusNuvem('☁️ Falha ao salvar na nuvem', false);
        alert("Não foi possível salvar na nuvem. Verifique a conexão e tente novamente — os dados continuam disponíveis localmente nesta sessão.");
    }
}

async function carregarEstadoAtualNuvem() {
    try {
        window.__setStatusNuvem('☁️ Carregando estado atual...', true);
        let fb = await aguardarNuvemPronta();
        let metaSnap = await fb.getDoc(fb.doc(fb.db, 'estado_atual', 'sessao'));
        if (!metaSnap.exists()) {
            alert("Nenhum estado atual foi salvo na nuvem ainda.");
            window.__setStatusNuvem('☁️ Conectado à nuvem', true);
            return;
        }
        if (!confirm("Isso vai substituir a base de dados e os ajustes atuais pelo último estado salvo na nuvem. Deseja continuar?")) {
            window.__setStatusNuvem('☁️ Conectado à nuvem', true);
            return;
        }
        let pacote = await lerPacoteFragmentado(fb, 'estado_atual', 'sessao');
        if (!pacote) { alert("O estado salvo na nuvem está vazio ou corrompido."); return; }
        await aplicarPacoteNuvem(pacote, 'do estado atual salvo na nuvem');
        window.__setStatusNuvem('☁️ Estado atual carregado da nuvem', true);
    } catch (err) {
        console.error(err);
        window.__setStatusNuvem('☁️ Falha ao carregar da nuvem', false);
        alert("Não foi possível carregar o estado atual da nuvem. Verifique a conexão.");
    }
}

async function salvarCenarioNuvem() {
    if (dadosBrutos.length === 0) return alert("Importe e processe uma base antes de salvar um cenário na nuvem.");
    let nome = prompt("Informe um nome para identificar este cenário:");
    if (!nome) return;
    try {
        window.__setStatusNuvem('☁️ Salvando cenário...', true);
        let fb = await aguardarNuvemPronta();
        let pacote = montarPacoteNuvem(nome);
        pacote.criado_em = fb.serverTimestamp();
        await gravarPacoteFragmentado(fb, 'cenarios', pacote);
        window.__setStatusNuvem('☁️ Cenário salvo na nuvem', true);
        alert(`Cenário "${nome}" salvo na nuvem com sucesso.`);
    } catch (err) {
        console.error(err);
        window.__setStatusNuvem('☁️ Falha ao salvar cenário', false);
        alert("Não foi possível salvar o cenário na nuvem. Verifique a conexão e tente novamente.");
    }
}

async function listarCenariosNuvem() {
    let lista = document.getElementById('lista-cenarios-nuvem');
    document.getElementById('modal-cenarios-nuvem').style.display = 'flex';
    lista.innerHTML = '<div style="padding:14px;color:var(--muted)">Carregando cenários salvos...</div>';
    try {
        let fb = await aguardarNuvemPronta();
        let q = fb.query(fb.collection(fb.db, 'cenarios'), fb.orderBy('criado_em', 'desc'));
        let snap = await fb.getDocs(q);
        if (snap.empty) {
            lista.innerHTML = '<div style="padding:14px;color:var(--muted)">Nenhum cenário salvo na nuvem ainda.</div>';
            return;
        }
        let h = `<table><thead><tr><th>Nome</th><th>Salvo em</th><th>Registros</th><th style="width:230px">Ações</th></tr></thead><tbody>`;
        snap.forEach(docSnap => {
            // Os documentos da coleção "cenarios" agora guardam apenas os metadados
            // (o conteúdo completo fica fragmentado na subcoleção "chunks").
            let d = docSnap.data();
            let dataFmt = (d.criado_em && typeof d.criado_em.toDate === 'function')
                ? d.criado_em.toDate().toLocaleString('pt-BR')
                : (d.salvo_em ? new Date(d.salvo_em).toLocaleString('pt-BR') : '—');
            let qtdReg = (typeof d.totalRegistros === 'number') ? d.totalRegistros : '—';
            h += `<tr>
                <td><strong>${d.nome || 'Sem nome'}</strong></td>
                <td>${dataFmt}</td>
                <td>${qtdReg}</td>
                <td>
                    <button class="btn btn-success" style="padding:5px 10px;font-size:11px" onclick="carregarCenarioNuvemPorId('${docSnap.id}')">⚡ Carregar</button>
                    <button class="btn btn-danger" style="padding:5px 10px;font-size:11px" onclick="excluirCenarioNuvemPorId('${docSnap.id}')">🗑️ Excluir</button>
                </td>
            </tr>`;
        });
        h += '</tbody></table>';
        lista.innerHTML = h;
    } catch (err) {
        console.error(err);
        lista.innerHTML = '<div style="padding:14px;color:var(--danger)">Falha ao carregar a lista de cenários salvos na nuvem. Verifique a conexão.</div>';
    }
}

async function carregarCenarioNuvemPorId(id) {
    if (!confirm("Isso vai substituir a base de dados e os ajustes atuais pelo cenário selecionado. Deseja continuar?")) return;
    try {
        let fb = await aguardarNuvemPronta();
        let pacote = await lerPacoteFragmentado(fb, 'cenarios', id);
        if (!pacote) {
            alert("Este cenário não foi encontrado ou está vazio — pode ter sido excluído.");
            return;
        }
        await aplicarPacoteNuvem(pacote, 'do cenário salvo na nuvem');
        document.getElementById('modal-cenarios-nuvem').style.display = 'none';
        window.__setStatusNuvem('☁️ Cenário carregado da nuvem', true);
    } catch (err) {
        console.error(err);
        alert("Não foi possível carregar o cenário selecionado. Verifique a conexão.");
    }
}

async function excluirCenarioNuvemPorId(id) {
    if (!confirm("Tem certeza que deseja excluir definitivamente este cenário salvo na nuvem? Esta ação não pode ser desfeita.")) return;
    try {
        let fb = await aguardarNuvemPronta();
        await excluirPacoteFragmentado(fb, 'cenarios', id);
        listarCenariosNuvem();
    } catch (err) {
        console.error(err);
        alert("Não foi possível excluir o cenário selecionado. Verifique a conexão.");
    }
}

function fecharModalCenariosNuvem() {
    document.getElementById('modal-cenarios-nuvem').style.display = 'none';
}

function carregarJSON() {
    let f = document.getElementById('arquivo-json').files[0];
    if (!f) return;
    let r = new FileReader();
    r.onload = e => {
        let pacote;
        try {
            pacote = JSON.parse(e.target.result);
        } catch (err) {
            alert("Arquivo JSON inválido ou corrompido.");
            document.getElementById('arquivo-json').value = "";
            return;
        }
        if (!pacote || pacote.sistema !== "SIPOG" || !pacote.dados || !Array.isArray(pacote.dados.dadosBrutos)) {
            alert("Este arquivo não é um pacote de dados SIPOG reconhecido.");
            document.getElementById('arquivo-json').value = "";
            return;
        }

        dadosBrutos = pacote.dados.dadosBrutos;
        totalRegistrosBase = pacote.dados.totalRegistrosBase || dadosBrutos.length;
        dadosExcluidos = [];

        // Sempre restaura parâmetros se presentes — a escolha do tipo de importação é feita pelo botão usado
        if (pacote.parametros) aplicarParametros(pacote.parametros);

        ploGerado = false; ploDataGeracao = null; atualizarStatusPLO();
        processarDados(); // constuírDropdownsMultiplos() é chamado internamente
        // Após processarDados ter reconstruído os dropdowns, restaura os filtros salvos
        if (window._filtrosPendentesRestore) {
            restaurarFiltrosSalvos(window._filtrosPendentesRestore);
            window._filtrosPendentesRestore = null;
            constuírDropdownsMultiplos(); // sanitiza: remove strings restauradas que não existem nos dados atuais
        }
        let qtdExclusoesRestauradas = reaplicarExclusoesManuais(pacote.dados.exclusoesManuais);
        let qtdAjustesRestaurados = reaplicarAjustesManuais(pacote.dados.ajustesManuais);
        recalculoGeralInjetado(); // sempre recalcula ao final para garantir estado consistente

        let origem = pacote.exportado_por ? ` (exportado por ${pacote.exportado_por})` : '';
        let statusParam = pacote.parametros ? 'dados + parâmetros RESTAURADOS' : 'arquivo sem parâmetros salvos';
        let statusExclusao = qtdExclusoesRestauradas > 0 ? ` — ${qtdExclusoesRestauradas} exclusão(ões) manual(is) da lixeira reaplicada(s)` : '';
        let statusAjuste = qtdAjustesRestaurados > 0 ? ` — ${qtdAjustesRestaurados} ajuste(s) manual(is) de Necessidade Real 2027 reaplicado(s)` : '';
        document.getElementById('info-registros').innerHTML = `${totalRegistrosBase} registros carregados do JSON${origem} — ${statusParam}${statusExclusao}${statusAjuste}.`;
        document.getElementById('arquivo-json').value = "";
    };
    r.readAsText(f);
}

function exportarSomenteParametros() {
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

    let pacote = {
        sistema: "SIPOG",
        tipo: "apenas_parametros",
        versao_schema: 2,
        exportado_em: agora.toISOString(),
        exportado_por: nomeUsuario,
        parametros: coletarParametros()
    };

    let blob = new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = `SIPOG_params_${nomeSeguro}_${dataArq}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function carregarSomenteParametros() {
    let f = document.getElementById('arquivo-params').files[0];
    if (!f) return;
    let r = new FileReader();
    r.onload = e => {
        let pacote;
        try { pacote = JSON.parse(e.target.result); }
        catch (err) { alert("Arquivo JSON inválido ou corrompido."); document.getElementById('arquivo-params').value = ""; return; }
        if (!pacote || pacote.sistema !== "SIPOG" || !pacote.parametros) {
            alert("Este arquivo não contém parâmetros SIPOG reconhecidos.");
            document.getElementById('arquivo-params').value = "";
            return;
        }
        aplicarParametros(pacote.parametros);
        // Se há dados processados, aplica os filtros restaurados imediatamente
        if (dadosProcessados.length > 0 && window._filtrosPendentesRestore) {
            restaurarFiltrosSalvos(window._filtrosPendentesRestore);
            window._filtrosPendentesRestore = null;
            constuírDropdownsMultiplos();
            recalculoGeralInjetado();
        }
        document.getElementById('arquivo-params').value = "";
        alert("Parâmetros restaurados com sucesso! Clique em 'Processar Cenário' para recalcular.");
    };
    r.readAsText(f);
}

function limparBase() {
    if(confirm("Deseja realmente limpar toda a base de dados ativa, contadores, lixeira e tetos definidos?\n\nTodos os ajustes e configurações serão perdidos.")) {
        dadosBrutos = []; dadosProcessados = []; dadosExcluidos = [];
        totalRegistrosBase = 0; totalRegistrosExpurgados = 0;
        tetosPorFonte = {}; subtetosPorFonteGrupo = {}; monFonteSelecionada = '';
        ploGerado = false; ploDataGeracao = null;
        atualizarStatusPLO();
        seletoresAtivos.plodet = { orgao: new Set(), secretaria: new Set(), estagio: new Set(), fonte: new Set(), classe: new Set() };
        document.getElementById('tab-plodet-pivot').innerHTML = '';

        document.getElementById('info-registros').innerHTML = "Nenhum registro importado";
        document.getElementById('arquivo').value = "";
        let arqJson = document.getElementById('arquivo-json');
        if (arqJson) arqJson.value = "";

        zerarFiltrosEstrutura();
        atualizarDashboardZerado();
        renderizarGestao(1);
        renderizarConsolidados();
        renderizarLixeira();
        renderizarTabelaTetosPorFonte(false);
        atualizarSeletorFontePainel();
        atualizarPainelMonitoramento();
        atualizarEstadoGateImportacao();
        atualizarResumoParametrizacaoEstagio();
        atualizarResumoRedutor();
        atualizarResumoPLO();
        atualizarPainelAjustesRealizados();
        resetarTrilhaImp();
        showView('v-imp');
    }
}

