// SIPOG COFIP — js/03-utils-formatacao.js
// Utilitários de normalização/formatação (N, S, V, F, Ftd) e mapas de label/badge de classe.
// Script clássico (escopo global). Ordem de carga definida em index.html — não reordenar.
function N(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim(); }
function S(v) { return ['SIM', 'S', '1', 'TRUE'].includes(N(v)); }
function V(v) { 
    let t = String(v || 0).trim(); 
    if(t.includes(',')) { t = t.replace(/\./g, '').replace(',', '.'); } 
    return parseFloat(t) || 0; 
}
function F(v) {
    let n = Number(v) || 0;
    if (Math.abs(n) < 0.005) return '-';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
// Variante de F() para uso em células de tabela (innerHTML): quando o valor é
// zero, envolve o "-" num <span> com tooltip explicando que é R$ 0,00 de fato
// (não ausência de dado/erro de leitura) — evita a leitura de "traço = branco".
function Ftd(v) {
    let n = Number(v) || 0;
    if (Math.abs(n) < 0.005) return '<span title="R$ 0,00 — o grupo tem MAPPs, mas o valor somado desta coluna é zero (não é ausência de dado).">-</span>';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const CLASSE_BADGE_MAP = {
    'CONTRATO_GESTAO': 'badge-warning',
    'CONTINUIDADE': 'badge-accent',
    'PCF_CONVENIO': 'badge-purple',
    'OPERACAO_CREDITO': 'badge-teal',
    'ENTREGA_PRIORITARIA': 'badge-pink',
    'INVESTIMENTO': 'badge-success'
};
// Rótulo de exibição por classe — a CHAVE interna de classificação ('INVESTIMENTO')
// não muda (usada em filtros, comparações e persistência), só o texto mostrado ao
// usuário. Grupos sem entrada aqui exibem a própria chave como rótulo.
const CLASSE_LABEL_MAP = {
    'INVESTIMENTO': 'DEMAIS PROJETOS'
};
function labelClasse(classe) {
    return CLASSE_LABEL_MAP[classe] || classe;
}
function badgeClasse(classe) {
    let cls = CLASSE_BADGE_MAP[classe] || 'badge-default';
    return `<span class="badge ${cls}">${labelClasse(classe)}</span>`;
}


// Normaliza valores de célula do ExcelJS para primitivos (equivalente ao
// sheet_to_json do SheetJS): richText → texto, fórmula → resultado, etc.
function valorCelulaExcelJS(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
        if (v.richText) return v.richText.map(t => t.text).join('');
        if (v.result !== undefined) return valorCelulaExcelJS(v.result);
        if (v.text !== undefined) return v.text;
        if (v instanceof Date) return v.toLocaleDateString('pt-BR');
        if (v.error) return '';
    }
    return v;
}

