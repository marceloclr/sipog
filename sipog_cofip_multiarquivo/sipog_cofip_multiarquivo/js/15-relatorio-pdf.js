// SIPOG COFIP — js/15-relatorio-pdf.js
// Relatório PDF por Fonte (jsPDF) com identidade visual do Governo do Ceará.
// Script clássico (escopo global). Ordem de carga definida em index.html — não reordenar.
// ══════════════════════════════════════════════════════════════════════════
// RELATÓRIO PDF POR FONTE — identidade visual do Governo do Ceará
// Um arquivo .pdf por Fonte de Recurso, com Ajustes Realizados e Premissas do
// Sistema destacados no início, seguidos pelo conteúdo da aba Consolidação e
// Dashboard (cards, gráficos, consolidações por Secretaria/Órgão, grid).
// ══════════════════════════════════════════════════════════════════════════

const COR_PDF = {
    azul: [70, 85, 100],
    verde: [0, 130, 65],
    verdeEscuro: [42, 112, 80],
    dourado: [190, 155, 95],
    cinzaTexto: [60, 60, 60],
    cinzaClaro: [140, 140, 140]
};

function stripEmojiTitulo(s) {
    return s.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]+\s*/gu, '');
}

// Cria o documento jsPDF usando a fonte nativa helvetica (cobre Latin-1/pt-BR).
function prepararDocPDF() {
    const { jsPDF } = window.jspdf;
    let doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'normal');
    return doc;
}

// Cabeçalho institucional: assinatura "CEARÁ / GOVERNO DO ESTADO" +
// "SECRETARIA DO PLANEJAMENTO E GESTÃO — SEPLAG", seguindo o padrão de
// assinatura secundária com secretaria do Manual de Identidade Visual (pág. 8).
function desenharCabecalhoPDF(doc, nomeFonte) {
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFillColor(...COR_PDF.verde);
    doc.rect(0, 0, pageWidth, 26, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('CEARÁ', 12, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text('GOVERNO DO ESTADO', 12, 17.5);

    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.25);
    doc.line(55, 6, 55, 20);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('SECRETARIA DO PLANEJAMENTO E GESTÃO', 59, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(215, 220, 225);
    doc.text('SEPLAG', 59, 17);

    doc.setTextColor(...COR_PDF.verde);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.text('Relatório de Consolidação — SIPOG COFIP', 12, 35);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...COR_PDF.verdeEscuro);
    doc.text(`Fonte de Recurso: ${nomeFonte}`, 12, 42);

    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    let agora = new Date();
    doc.text(`Gerado em ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR')}`, pageWidth - 12, 42, { align: 'right' });

    doc.setDrawColor(...COR_PDF.verde);
    doc.setLineWidth(0.7);
    doc.line(12, 45, pageWidth - 12, 45);

    return 52;
}

// Rodapé de texto removido por enquanto (a pedido do usuário) — mantida a
// função vazia para não quebrar a chamada existente em gerarRelatorioPDFDeFonte.
function desenharRodapesPDF(doc) {
    // sem conteúdo por enquanto
}

// Escreve um parágrafo com quebra automática de linha e de página.
function escreverParagrafoPDF(doc, texto, x, y, larguraMax, tamanhoFonte, cor) {
    doc.setFontSize(tamanhoFonte);
    doc.setTextColor(...cor);
    let linhas = doc.splitTextToSize(texto, larguraMax);
    let pageHeight = doc.internal.pageSize.getHeight();
    linhas.forEach(linha => {
        if (y > pageHeight - 20) { doc.addPage(); y = 20; }
        doc.text(linha, x, y);
        y += tamanhoFonte * 0.42;
    });
    return y + 1.5;
}

// Seções de destaque no início do relatório: Ajustes Realizados + Premissas do Sistema.
function desenharSecoesDestaquePDF(doc, y) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const x = 12, larguraMax = pageWidth - 24;
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...COR_PDF.verde);
    doc.text('AJUSTES REALIZADOS NESTA SESSÃO', x, y);
    y += 6.5;

    let { secoes } = montarDadosAjustesRealizados();
    secoes.forEach(s => {
        if (y > pageHeight - 25) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...COR_PDF.verdeEscuro);
        doc.text(stripEmojiTitulo(s.titulo), x, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        if (s.itens.length > 0) {
            s.itens.forEach(it => { y = escreverParagrafoPDF(doc, '• ' + it, x + 2, y, larguraMax - 2, 9, COR_PDF.cinzaTexto); });
        } else {
            y = escreverParagrafoPDF(doc, s.vazio, x + 2, y, larguraMax - 2, 9, COR_PDF.cinzaClaro);
        }
        y += 2;
    });

    y += 3;
    if (y > pageHeight - 25) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...COR_PDF.verde);
    doc.text('PREMISSAS DO SISTEMA', x, y);
    y += 6.5;

    PREMISSAS_SISTEMA.forEach(s => {
        if (y > pageHeight - 25) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...COR_PDF.verdeEscuro);
        doc.text(s.titulo, x, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        s.itens.forEach(it => { y = escreverParagrafoPDF(doc, '• ' + it, x + 2, y, larguraMax - 2, 8.5, COR_PDF.cinzaTexto); });
        y += 2;
    });

    return y + 4;
}

// Filtra a base processada para uma Fonte específica, respeitando os filtros
// de Órgão/Estágio/Classificação atualmente ativos na aba Dashboard (mas
// ignorando o filtro de Fonte em si, já que cada relatório cobre uma Fonte).
function filtrarParaRelatorioPorFonte(fonte) {
    let s = seletoresAtivos.dash;
    return dadosProcessados.filter(d =>
        s.orgao.has(d.orgao.trim()) &&
        s.estagio.has(d.estagio.trim()) &&
        s.classe.has(d.classe.trim()) &&
        d.fonte.trim() === fonte
    );
}

// Agrega todos os totais/tabelas necessários para o relatório de uma Fonte.
function agregarDadosRelatorio(lista) {
    let ag = {
        totalRegistros: lista.length,
        p26: 0, prevEmp: 0, p27: 0, trf: 0, nec: 0, trfAj: 0, necAj: 0,
        qtdAjustadosManual: 0,
        porSecretaria: {}, porOrgao: {}, porOrgaoClasse: {}, porClasse: {}
    };
    lista.forEach(d => {
        ag.p26 += d.p26; ag.prevEmp += d.prevEmp; ag.p27 += d.p27;
        ag.trf += d.trf; ag.nec += d.nec; ag.trfAj += d.trfAj; ag.necAj += d.necessidade2027Ajustada;
        if (d.foiAjustado) ag.qtdAjustadosManual++;

        let ks = d.secretaria || 'NÃO INFORMADA';
        if (!ag.porSecretaria[ks]) ag.porSecretaria[ks] = { qtd: 0, p26: 0, prevEmp: 0, trf: 0, p27: 0, nec: 0, necAj: 0 };
        let os = ag.porSecretaria[ks];
        os.qtd++; os.p26 += d.p26; os.prevEmp += d.prevEmp; os.trf += d.trf; os.p27 += d.p27; os.nec += d.nec; os.necAj += d.necessidade2027Ajustada;

        let ko = d.orgao || 'NÃO INFORMADO';
        if (!ag.porOrgao[ko]) ag.porOrgao[ko] = { qtd: 0, p26: 0, prevEmp: 0, trf: 0, p27: 0, nec: 0, necAj: 0 };
        let oo = ag.porOrgao[ko];
        oo.qtd++; oo.p26 += d.p26; oo.prevEmp += d.prevEmp; oo.trf += d.trf; oo.p27 += d.p27; oo.nec += d.nec; oo.necAj += d.necessidade2027Ajustada;

        let kg = ko + ' | ' + (d.classe || 'INVESTIMENTO');
        if (!ag.porOrgaoClasse[kg]) ag.porOrgaoClasse[kg] = { orgao: ko, classe: d.classe || 'INVESTIMENTO', qtd: 0, necAj: 0 };
        ag.porOrgaoClasse[kg].qtd++;
        ag.porOrgaoClasse[kg].necAj += d.necessidade2027Ajustada;

        let kc = d.classe || 'INVESTIMENTO';
        if (!ag.porClasse[kc]) ag.porClasse[kc] = { nec: 0, necAj: 0 };
        ag.porClasse[kc].nec += d.nec;
        ag.porClasse[kc].necAj += d.necessidade2027Ajustada;
    });
    return ag;
}

function desenharCardsPDF(doc, y, ag, nomeFonte) {
    const pageWidth = doc.internal.pageSize.getWidth();
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...COR_PDF.verde);
    doc.text('RESUMO — CENÁRIO ORIGINAL E AJUSTADO', 12, y);
    y += 3;

    let teto = tetosPorFonte[nomeFonte] || 0;
    let saldo = teto - ag.necAj;
    let rotuloSaldo = 'Saldo do Teto (Teto − Necessidade 2027 Ajustada)';

    let linhas = [
        ['Registros na Fonte', ag.totalRegistros.toString()],
        ['Programado 2026', F(ag.p26)],
        ['Previsão de Empenho 2026', F(ag.prevEmp)],
        ['Programado 2027', F(ag.p27)],
        ['TRF 2026 (Transferência)', F(ag.trf)],
        ['Necessidade Real 2027', F(ag.nec)],
        ['TRF 2026 Ajustada', F(ag.trfAj)],
        ['Necessidade 2027 Ajustada', F(ag.necAj)],
        ['MAPPs Ajustados Individualmente', ag.qtdAjustadosManual.toString()],
        ['Teto Orçamentário Disponibilizado', F(teto)],
        [rotuloSaldo, F(saldo)]
    ];
    doc.autoTable({
        startY: y,
        margin: { left: 12, right: 12, bottom: 22 },
        body: linhas,
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 1.6 },
        columnStyles: {
            0: { fontStyle: 'normal', textColor: [80, 80, 80] },
            1: { fontStyle: 'bold', textColor: [40, 45, 55], halign: 'right' }
        }
    });
    return doc.lastAutoTable.finalY + 8;
}

// Abreviações de Classificação — usadas na tabela pivotada (colunas estreitas).
const ABREV_CLASSE = {
    'CONTRATO_GESTAO': 'C. G.',
    'CONTINUIDADE': 'Cont.',
    'PCF_CONVENIO': 'PCF Conv.',
    'OPERACAO_CREDITO': 'Op. Créd.',
    'INVESTIMENTO': 'Dem. Proj.'
};
const ORDEM_CLASSES_PDF = Object.keys(CLASSE_BADGE_MAP);

// Pivota "Órgão × Classificação" (Necessidade 2027 Ajustada): uma linha por
// Órgão, uma coluna por Classificação presente na Fonte (dinâmico) + Total.
function montarPivotOrgaoClasse(porOrgaoClasse) {
    let classesPresentes = [...new Set(Object.values(porOrgaoClasse).map(g => g.classe))];
    classesPresentes.sort((a, b) => ORDEM_CLASSES_PDF.indexOf(a) - ORDEM_CLASSES_PDF.indexOf(b));

    let porOrgao = {};
    Object.values(porOrgaoClasse).forEach(g => {
        if (!porOrgao[g.orgao]) porOrgao[g.orgao] = {};
        porOrgao[g.orgao][g.classe] = (porOrgao[g.orgao][g.classe] || 0) + g.necAj;
    });

    let colunas = ['Órgão', ...classesPresentes.map(c => ABREV_CLASSE[c] || c), 'Total'];

    let linhasComTotal = Object.entries(porOrgao).map(([orgao, valores]) => {
        let total = 0;
        let linha = [orgao];
        classesPresentes.forEach(c => {
            let v = valores[c] || 0;
            total += v;
            linha.push(v > 0 ? F(v) : '-');
        });
        linha.push(F(total));
        return { linha, total };
    }).sort((a, b) => b.total - a.total);

    let linhas = linhasComTotal.map(o => o.linha);

    let totalPorClasse = classesPresentes.map(c => Object.values(porOrgao).reduce((s, v) => s + (v[c] || 0), 0));
    let totalGeral = totalPorClasse.reduce((s, v) => s + v, 0);
    let linhaTotal = ['TOTAL', ...totalPorClasse.map(v => F(v)), F(totalGeral)];

    return { colunas, linhas, linhaTotal };
}

// Desenha uma tabela sempre começando no topo de uma nova página. Usa paisagem
// quando `paisagem` é true (tabelas com muitas colunas), e pode incluir uma
// linha de total fixa no rodapé da tabela.
function desenharTabelaPDF(doc, y, titulo, colunas, linhas, opcoes) {
    opcoes = opcoes || {};
    doc.addPage('a4', opcoes.paisagem ? 'landscape' : 'portrait');
    y = 20;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...COR_PDF.verde);
    doc.text(titulo, 12, y);

    doc.autoTable({
        startY: y + 5,
        margin: { left: 12, right: 12, bottom: 22 },
        head: [colunas],
        body: linhas,
        foot: opcoes.linhaTotal ? [opcoes.linhaTotal] : undefined,
        theme: 'striped',
        headStyles: { fillColor: COR_PDF.verde, textColor: [255, 255, 255], font: 'helvetica', fontStyle: 'bold', fontSize: 8.5 },
        bodyStyles: { font: 'helvetica', fontSize: 8, textColor: [50, 50, 50] },
        footStyles: { fillColor: COR_PDF.verdeEscuro, textColor: [255, 255, 255], font: 'helvetica', fontStyle: 'bold', fontSize: 8.5 },
        alternateRowStyles: { fillColor: [232, 244, 236] }
    });
    return doc.lastAutoTable.finalY + 8;
}

// Renderiza um gráfico Chart.js em um canvas invisível (fora da tela) e captura
// como imagem PNG — usado para embutir os mesmos gráficos do Dashboard no PDF,
// sem tocar nos gráficos visíveis da tela.
const PLUGIN_FUNDO_BRANCO_PDF = {
    id: 'fundoBrancoPdf',
    beforeDraw: (chart) => {
        let ctx = chart.canvas.getContext('2d');
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, chart.width, chart.height);
        ctx.restore();
    }
};

function capturarGraficoComoImagem(config, largura, altura) {
    return new Promise(resolve => {
        let canvas = document.createElement('canvas');
        canvas.width = largura;
        canvas.height = altura;
        canvas.style.position = 'fixed';
        canvas.style.left = '-99999px';
        canvas.style.top = '0';
        document.body.appendChild(canvas);
        config.options = config.options || {};
        config.options.animation = false;
        config.options.responsive = false;
        config.options.devicePixelRatio = 2;
        config.plugins = config.plugins || [];
        config.plugins.push(PLUGIN_FUNDO_BRANCO_PDF);
        let chart = new Chart(canvas.getContext('2d'), config);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            let dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            chart.destroy();
            document.body.removeChild(canvas);
            resolve(dataUrl);
        }));
    });
}

async function desenharGraficosPDF(doc, y, ag, sufixo, tituloBar, tituloPie, valorChave, paletaBar, paletaPie) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const larguraImg = pageWidth - 24;
    const alturaImg = larguraImg * (420 / 900);
    const alturaPie = larguraImg * (620 / 900) * 0.75;
    const limiteInferior = pageHeight - 22; // mesma reserva de rodapé usada nas tabelas

    let orgArr = Object.entries(ag.porOrgao).map(([k, v]) => ({ label: k, value: v[valorChave] })).sort((a, b) => b.value - a.value).slice(0, 15);
    let clsArr = Object.entries(ag.porClasse).map(([k, v]) => ({ label: k, value: v[valorChave] })).sort((a, b) => b.value - a.value);

    let alturaNecessariaBar = 3 + alturaImg + 10;
    if (y + alturaNecessariaBar > limiteInferior) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...COR_PDF.verde);
    doc.text(tituloBar, 12, y);
    y += 3;
    let imgBar = await capturarGraficoComoImagem({
        type: 'bar',
        data: { labels: orgArr.map(o => o.label), datasets: [{ data: orgArr.map(o => o.value), backgroundColor: paletaBar.slice(0, orgArr.length) }] },
        options: {
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 30, callback: (v, i) => { let l = orgArr[i] ? orgArr[i].label : ''; return l.length > 18 ? l.substring(0, 16) + '…' : l; } } },
                y: { ticks: { callback: v => 'R$ ' + (v / 1e6).toFixed(1) + 'M' } }
            }
        }
    }, 900, 420);
    doc.addImage(imgBar, 'JPEG', 12, y + 2, larguraImg, alturaImg);
    y += alturaImg + 10;

    let alturaNecessariaPie = 3 + alturaPie + 10;
    if (y + alturaNecessariaPie > limiteInferior) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...COR_PDF.verde);
    doc.text(tituloPie, 12, y);
    y += 3;
    let imgPie = await capturarGraficoComoImagem({
        type: 'doughnut',
        data: { labels: clsArr.map(c => c.label), datasets: [{ data: clsArr.map(c => c.value), backgroundColor: paletaPie }] },
        options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, cutout: '52%' }
    }, 900, 620);
    doc.addImage(imgPie, 'JPEG', 12 + (larguraImg - larguraImg*0.75)/2, y + 2, larguraImg*0.75, alturaPie);
    y += alturaPie + 10;

    return y;
}

function formatarLinhasAgregado(mapa) {
    return Object.entries(mapa).sort((a, b) => b[1].necAj - a[1].necAj).map(([nome, v]) => [
        nome, v.qtd.toString(), F(v.p26), F(v.prevEmp), F(v.trf), F(v.p27), F(v.nec), F(v.necAj)
    ]);
}

// Linha de TOTAL (rodapé) para as tabelas de Consolidação por Secretaria/Órgão —
// soma cada coluna numérica a partir do mesmo mapa agregado.
function calcularLinhaTotalAgregado(mapa) {
    let valores = Object.values(mapa);
    let qtd = valores.reduce((s, v) => s + v.qtd, 0);
    let p26 = valores.reduce((s, v) => s + v.p26, 0);
    let prevEmp = valores.reduce((s, v) => s + v.prevEmp, 0);
    let trf = valores.reduce((s, v) => s + v.trf, 0);
    let p27 = valores.reduce((s, v) => s + v.p27, 0);
    let nec = valores.reduce((s, v) => s + v.nec, 0);
    let necAj = valores.reduce((s, v) => s + v.necAj, 0);
    return ['TOTAL', qtd.toString(), F(p26), F(prevEmp), F(trf), F(p27), F(nec), F(necAj)];
}

function slugify(texto) {
    return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').substring(0, 40);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Gera um arquivo PDF completo para uma única Fonte.
async function gerarRelatorioPDFDeFonte(fonte) {
    let lista = filtrarParaRelatorioPorFonte(fonte);
    let ag = agregarDadosRelatorio(lista);

    let doc = prepararDocPDF();
    let y = desenharCabecalhoPDF(doc, fonte);
    y = desenharSecoesDestaquePDF(doc, y);
    doc.addPage(); y = 20;
    y = desenharCardsPDF(doc, y, ag, fonte);
    y = await desenharGraficosPDF(doc, y, ag, '', 'Top 15 Órgãos — Necessidade Real 2027', 'Necessidade Real 2027 por Classificação', 'nec', PALETTE_COLS, PALETTE_PIE);

    let temAjuste = Math.abs(ag.nec - ag.necAj) > 0.005;
    if (temAjuste) {
        let paletaBarAj = PALETTE_COLS.map((_, i) => PALETTE_PIE_AJ[i % PALETTE_PIE_AJ.length]);
        y = await desenharGraficosPDF(doc, y, ag, 'aj', 'Top 15 Órgãos — Necessidade 2027 Ajustada', 'Necessidade 2027 Ajustada por Classificação', 'necAj', paletaBarAj, PALETTE_PIE_AJ);
    }

    y = desenharTabelaPDF(doc, y, 'Consolidação por Secretaria', ['Secretaria', 'MAPPs', 'Programado 2026', 'Prev. Empenho', 'TRF 2026', 'Programado 2027', 'Necessidade Real 2027', 'Necessidade Real 2027 Aj.'], formatarLinhasAgregado(ag.porSecretaria), { paisagem: true, linhaTotal: calcularLinhaTotalAgregado(ag.porSecretaria) });
    y = desenharTabelaPDF(doc, y, 'Consolidação por Órgão', ['Órgão', 'MAPPs', 'Programado 2026', 'Prev. Empenho', 'TRF 2026', 'Programado 2027', 'Necessidade Real 2027', 'Necessidade Real 2027 Aj.'], formatarLinhasAgregado(ag.porOrgao), { paisagem: true, linhaTotal: calcularLinhaTotalAgregado(ag.porOrgao) });

    let pivot = montarPivotOrgaoClasse(ag.porOrgaoClasse);
    y = desenharTabelaPDF(doc, y, 'Necessidade 2027 Ajustada por Órgão e Classificação', pivot.colunas, pivot.linhas, { paisagem: true, linhaTotal: pivot.linhaTotal });

    desenharRodapesPDF(doc);

    let dataSlug = new Date().toISOString().slice(0, 10);
    doc.save(`Relatorio_SIPOG_${slugify(fonte)}_${dataSlug}.pdf`);
}

// Ponto de entrada: gera um PDF completo para cada Fonte de Recurso presente
// na base (respeitando os filtros de Órgão/Estágio/Classificação da aba
// Dashboard), com uma pequena pausa entre downloads.
async function gerarRelatoriosPorFonte() {
    if (dadosProcessados.length === 0) { alert('Carregue e processe uma base antes de gerar relatórios.'); return; }

    let s = seletoresAtivos.dash;
    let baseFiltrada = dadosProcessados.filter(d => s.orgao.has(d.orgao.trim()) && s.estagio.has(d.estagio.trim()) && s.classe.has(d.classe.trim()));
    let todasFontesPresentes = [...new Set(baseFiltrada.map(d => d.fonte.trim()))].filter(f => f).sort();

    // Só gera relatório para fontes que têm Teto Orçamentário definido (> 0).
    let fontes = todasFontesPresentes.filter(f => tetosPorFonte[f] > 0);

    if (fontes.length === 0) {
        alert('Nenhuma Fonte com Teto Orçamentário definido foi encontrada.\n\nDefina o teto na tabela "Tetos Orçamentários por Fonte" (aba Carga e Ajustes) antes de gerar os relatórios.');
        return;
    }

    let mensagemConfirmacao = `Serão gerados ${fontes.length} relatório(s) em PDF, para as seguintes Fontes de Recurso:\n\n${fontes.join('\n')}\n\nFontes sem Teto Orçamentário definido não terão relatório gerado.\n\nSeu navegador pode pedir permissão para baixar múltiplos arquivos. Deseja continuar?`;
    if (!confirm(mensagemConfirmacao)) return;

    let overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:99999; display:flex; align-items:center; justify-content:center; flex-direction:column; color:#fff; font-family:Kanit,Arial,sans-serif; gap:12px;';
    overlay.innerHTML = `<div style="font-size:16px; font-weight:700;">📄 Gerando relatórios em PDF...</div><div id="progresso-relatorio-pdf" style="font-size:13px; color:#ccc;">Preparando...</div>`;
    document.body.appendChild(overlay);

    try {
        for (let i = 0; i < fontes.length; i++) {
            let progEl = document.getElementById('progresso-relatorio-pdf');
            if (progEl) progEl.innerText = `Fonte ${i + 1} de ${fontes.length}: ${fontes[i]}`;
            await gerarRelatorioPDFDeFonte(fontes[i]);
            await sleep(400);
        }
    } catch (err) {
        console.error(err);
        alert('Ocorreu um erro ao gerar os relatórios. Verifique o console para detalhes.');
    } finally {
        document.body.removeChild(overlay);
    }
}
