// SIPOG COFIP — js/01-modelo-importacao.js
// Modelo XLSX de importação em runtime (MODELO_COLUNAS, MODELO_ESTAGIOS, baixarModeloXLSX).
// Script clássico (escopo global). Ordem de carga definida em index.html — não reordenar.

// Gera o modelo padrão de importação em runtime (ExcelJS): aba DADOS com
// validações e exemplo, aba INSTRUÇÕES completa e aba LISTAS_VALIDACAO.
// Fonte única da verdade das colunas/estágios — editar aqui, não em blob.
const MODELO_COLUNAS = [
    ['MAPP', 14], ['SECRETARIA', 30], ['ORGAO', 30], ['FONTE', 22],
    ['ESTAGIO_EXECUCAO', 30], ['VLR_PROGRAMADO_2026', 20], ['VLR_LIMITE_2026', 20],
    ['VLR_EMPENHADO_2026', 20], ['VLR_PAGO_2026', 20], ['VLR_PROGRAMADO_2027', 20],
    ['CONTRATO_GESTAO', 16], ['CONTINUIDADE', 14], ['PCF_CONVENIO', 14],
    ['OPERACAO_CREDITO', 17], ['ENTREGA_PRIORITARIA', 19]
];
const MODELO_ESTAGIOS = ['EM EXECUÇÃO','EXECUÇÃO FÍSICA CONCLUÍDA','EXECUÇÃO FÍSIC/FINAN,CONCLUÍDA',
    'PARALISADO','NÃO INICIADO','EM LICITAÇÃO','CONTRATADO','ATIVIDADES PREPARATÓRIAS',
    'CONVENIADO','NÃO DEFINIDO','NÃO INFORMADO','LICITADO','CANCELADO','TRANSFERIDO','CONCLUÍDO'];

async function baixarModeloXLSX() {
    try {
        const wb = new ExcelJS.Workbook();

        // ── aba DADOS ──
        const wsD = wb.addWorksheet('DADOS');
        wsD.columns = MODELO_COLUNAS.map(([header, width]) => ({ header, width }));
        wsD.getRow(1).font = { bold: true };
        wsD.addRow(['2027-EXEMPLO-001','SECRETARIA EXEMPLO','ÓRGÃO EXEMPLO','(500)-(501) Tesouro',
            'EM EXECUÇÃO', 1000000, 500000, 220000, 180000, 250000, 'N','N','N','N','N']);
        wsD.getCell('A2').note = 'Esta é a linha de EXEMPLO. Apague-a antes de enviar a planilha preenchida — ela não deve entrar na base real.';
        for (let r = 3; r <= 1002; r++) {
            wsD.getCell(`E${r}`).dataValidation = { type: 'list', allowBlank: true,
                formulae: ['LISTAS_VALIDACAO!$A$1:$A$15'],
                errorStyle: 'stop', errorTitle: 'Estágio de Execução inválido',
                error: 'Selecione um valor válido da lista (ver aba INSTRUÇÕES).' };
            for (const col of ['K','L','M','N','O'])
                wsD.getCell(`${col}${r}`).dataValidation = { type: 'list', allowBlank: true,
                    formulae: ['"S,N"'], errorStyle: 'stop', errorTitle: 'Valor inválido',
                    error: 'Use apenas "S" ou "N".' };
        }

        // ── aba INSTRUÇÕES ──
        const wsI = wb.addWorksheet('INSTRUÇÕES');
        wsI.getColumn(1).width = 24; wsI.getColumn(2).width = 70; wsI.getColumn(3).width = 55;
        wsI.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
        const titulo = (row, txt, size) => { const r = wsI.getRow(row); r.getCell(1).value = txt; r.getCell(1).font = { bold: true, size: size || 11 }; };
        titulo(1, 'Modelo Padrão de Importação — SIPOG COFIP', 14);
        titulo(3, 'Regras gerais');
        const regras = [
            'Preencha os dados na aba "DADOS", a partir da linha 3 (a linha 2 é um exemplo — apague-a antes de enviar).',
            'Não altere os nomes das colunas (linha 1). O sistema lê o cabeçalho exatamente como está.',
            'Não insira nem remova colunas.',
            'Cada linha representa um MAPP. Não deixe linhas em branco no meio dos dados.',
            'Valores monetários: digite apenas o número, sem o símbolo "R$" e sem formatar a célula como texto.',
            'Nas colunas de S/N (marcação de grupo), use apenas "S" ou deixe em branco/"N". Marque no máximo UMA dessas 5 colunas por MAPP — se mais de uma vier marcada "S", o sistema usa a de maior prioridade nesta ordem: Contrato Gestão > Continuidade > PCF Convênio > Operação Crédito > Entrega Prioritária.',
            'Se nenhuma das 5 colunas de grupo estiver marcada, o MAPP é tratado como "Investimento" (grupo padrão).',
            'A coluna FONTE deve usar sempre o mesmo texto para a mesma fonte de recurso em toda a planilha (ex.: sempre "(500)-(501) Tesouro", nunca variações como "500-501" ou "Tesouro (500)(501)") — o sistema trata textos diferentes como fontes diferentes.',
            'Salve o arquivo em formato .xlsx antes de enviar.'
        ];
        regras.forEach((txt, i) => { const r = wsI.getRow(4 + i); r.getCell(1).value = '•'; r.getCell(2).value = txt; });

        titulo(14, 'Colunas e formatos');
        const cab = wsI.getRow(15); cab.getCell(1).value = 'Coluna'; cab.getCell(2).value = 'Descrição / valores aceitos';
        cab.font = { bold: true };
        const descricoes = {
            MAPP: 'Identificador único do projeto/MAPP. Texto livre, mas não pode se repetir dentro da base.',
            SECRETARIA: 'Nome da Secretaria responsável pelo MAPP.',
            ORGAO: 'Nome do Órgão responsável pelo MAPP.',
            FONTE: 'Fonte de recurso. Use sempre o mesmo padrão de texto para a mesma fonte (ex.: "(500)-(501) Tesouro"), senão o sistema trata como fontes diferentes.',
            ESTAGIO_EXECUCAO: 'Escolha um dos valores da lista suspensa (ver aba INSTRUÇÕES para o efeito de cada um).',
            VLR_PROGRAMADO_2026: 'Valor numérico. NÃO digite o símbolo R$ nem use a célula como texto — apenas o número (ex.: 1000000 ou 1000000,50).',
            VLR_LIMITE_2026: 'Valor numérico. Mesmo formato da coluna anterior.',
            VLR_EMPENHADO_2026: 'Valor numérico. Mesmo formato da coluna anterior.',
            VLR_PAGO_2026: 'Valor numérico. Mesmo formato da coluna anterior.',
            VLR_PROGRAMADO_2027: 'Valor numérico. Mesmo formato da coluna anterior.',
            CONTRATO_GESTAO: 'Marque "S" se o MAPP for de Contrato de Gestão. Senão, deixe em branco ou "N".',
            CONTINUIDADE: 'Marque "S" se o MAPP for do grupo Continuidade. Senão, deixe em branco ou "N".',
            PCF_CONVENIO: 'Marque "S" se o MAPP for PCF Convênio. Senão, deixe em branco ou "N".',
            OPERACAO_CREDITO: 'Marque "S" se o MAPP for Operação de Crédito. Senão, deixe em branco ou "N".',
            ENTREGA_PRIORITARIA: 'Marque "S" se o MAPP for Entrega Prioritária. Senão, deixe em branco ou "N".'
        };
        MODELO_COLUNAS.forEach(([col], i) => {
            const r = wsI.getRow(16 + i * 2);
            r.getCell(1).value = col; r.getCell(1).font = { bold: true };
            r.getCell(2).value = descricoes[col];
        });

        titulo(47, 'Valores aceitos para ESTAGIO_EXECUCAO e o que cada um faz');
        const cab2 = wsI.getRow(48); cab2.getCell(1).value = 'Estágio'; cab2.getCell(2).value = 'Efeito no cálculo (Empenho Previsto 2026)';
        cab2.font = { bold: true };
        const efeitos = [
            ['EM EXECUÇÃO', 'Regra do gatilho: Empenhado=0 → usa Limite 2026; Empenhado < 40% do Programado → (Empenhado/5)×12; Empenhado ≥ 40% → 100% do Programado.'],
            ['EXECUÇÃO FÍSICA CONCLUÍDA', 'Fixo = Limite 2026.'],
            ['EXECUÇÃO FÍSIC/FINAN,CONCLUÍDA', 'Fixo = 100% do Programado 2026 (sem transferência).'],
            ['PARALISADO', 'Fixo = Empenhado 2026.'],
            ['NÃO INICIADO', 'Programado 2026 × percentual configurado na Parametrização (padrão 0%).'],
            ['EM LICITAÇÃO', 'Se Limite 2026 = 0: Programado × 15%. Se Limite ≠ 0: usa o Limite 2026.'],
            ['CONTRATADO', 'Se Limite 2026 = 0: Programado × 20%. Se Limite ≠ 0: usa o Limite 2026.'],
            ['ATIVIDADES PREPARATÓRIAS', 'Se Limite 2026 = 0: Programado × 5%. Se Limite ≠ 0: usa o Limite 2026.'],
            ['CONVENIADO', 'Se Limite 2026 = 0: Programado × 20%. Se Limite ≠ 0: usa o Limite 2026.'],
            ['LICITADO', 'Se Limite 2026 = 0: Programado × 20%. Se Limite ≠ 0: usa o Limite 2026.'],
            ['NÃO DEFINIDO / NÃO INFORMADO', 'Sem regra própria: usa 100% do Programado 2026 (padrão de segurança), a menos que o MAPP já esteja em um dos grupos estratégicos (Contrato Gestão, Continuidade, PCF Convênio, Operação Crédito, Entrega Prioritária).'],
            ['CANCELADO / TRANSFERIDO / CONCLUÍDO', 'MAPP é excluído do cálculo (não entra na Necessidade 2027 nem em nenhum total).']
        ];
        efeitos.forEach(([est, ef], i) => { const r = wsI.getRow(49 + i); r.getCell(1).value = est; r.getCell(2).value = ef; });
        wsI.getCell('A62').value = 'Observação: os grupos Contrato Gestão, Continuidade, PCF Convênio, Operação Crédito e Entrega Prioritária (marcados nas colunas S/N) têm prioridade sobre o Estágio de Execução — nesses casos, o Empenho Previsto é sempre 100% do Programado 2026, independentemente do estágio informado. Só o grupo Investimento (nenhuma coluna marcada) segue a regra do Estágio de Execução.';

        // ── aba LISTAS_VALIDACAO ──
        const wsL = wb.addWorksheet('LISTAS_VALIDACAO');
        MODELO_ESTAGIOS.forEach((e, i) => { wsL.getCell(`A${i + 1}`).value = e; });

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'SIPOG_Modelo_Importacao.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error(err);
        alert('Não foi possível gerar o download do modelo. Tente novamente.');
    }
}


