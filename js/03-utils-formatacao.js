// SIPOG COFIP — js/03-utils-formatacao.js
// Utilitários de normalização/formatação (N, corrigirMojibake, S, V, F, Ftd) e mapas de label/badge de classe.
// Script clássico (escopo global). Ordem de carga definida em index.html — não reordenar.
function N(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim(); }

// Texto UTF-8 que foi lido como Windows-1252 em algum passo da extração
// ("PREPARATÃ“RIAS" em vez de "PREPARATÓRIAS"): regrava os caracteres como bytes
// 1252 e decodifica de novo como UTF-8. Só troca quando o resultado é UTF-8
// válido — textos corretos como "NÃO" e "SÃO" continuam intactos.
const CP1252_ALTOS = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C,
    'Ž': 0x8E, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F };
const DECODIFICADOR_UTF8_ESTRITO = new TextDecoder('utf-8', { fatal: true });
function corrigirMojibake(texto) {
    if (typeof texto !== 'string' || !/[ÃÂ]/.test(texto)) return texto;
    let bytes = [];
    for (let ch of texto) {
        let c = ch.codePointAt(0);
        if (c < 0x100) bytes.push(c);
        else if (CP1252_ALTOS[ch] !== undefined) bytes.push(CP1252_ALTOS[ch]);
        else return texto;
    }
    try { return DECODIFICADOR_UTF8_ESTRITO.decode(new Uint8Array(bytes)); }
    catch (e) { return texto; }
}
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

