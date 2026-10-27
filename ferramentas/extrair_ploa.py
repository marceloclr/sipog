# SIPOG COFIP — ferramentas/extrair_ploa.py
# Extrai do PLOA 2027 (Volume II, Tomos I e II — "Demonstrativo de Créditos
# Orçamentários") uma linha por crédito: órgão, UO, programa, ação, região,
# GND, modalidade, fonte (ID.FT.DT), IDUSO, RP e valor. Gera dados/loa2027_acoes.json
# para a página estudo-loa.html e confere os totais antes de gravar:
#   - Σ das ações de cada órgão × programa × fonte × GND = "Resumo do Programa" do PDF;
#   - Σ por GND (esferas Fiscal/Seguridade) = Volume I, "Despesa por Categoria, Grupo
#     de Despesa e Modalidade" (sem a modalidade 91, como o Volume I).
# Uso: python -I ferramentas/extrair_ploa.py LOA2027 dados/loa2027_acoes.json
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import pdfplumber

TOMOS = ['PLOA-2027-Volume-II-Tomo-I.pdf', 'PLOA-2027-Volume-II-Tomo-II.pdf']
VOLUME_I = 'PLOA-2027-Volume-I.pdf'
GNDS = ['31', '32', '33', '44', '45', '46', '99']  # colunas do Resumo do Programa
VALOR = r'(\d{1,3}(?:\.\d{3})*,\d{2})'

# Nome longo: a esfera "(FISCAL / SEGURIDADE SOCIAL)" pode cair na linha de baixo.
RE_ORGAO = re.compile(r'^Órgão: (\d{8}) - (.*?)(?: \((FISCAL / SEGURIDADE SOCIAL|INVESTIMENTOS ESTATAIS)\))?$')
RE_ESFERA = re.compile(r'^(.*?)\s*\((FISCAL / SEGURIDADE SOCIAL|INVESTIMENTOS ESTATAIS)\)$')
RE_PROGRAMA = re.compile(r'^Programa: (\d+) - (.*)$')
RE_UO = re.compile(r'^Unidade Orçamentária: (\d{8}) - (.*?) Total: ' + VALOR + '$')
# "OPERAÇÃO ESPECIAL:" quebra em duas linhas: "OPERAÇÃO 00020-Nome..." e "ESPECIAL: resto do nome".
RE_ACAO = re.compile(r'^(PROJETO|ATIVIDADE|OPERAÇÃO)(?: ESPECIAL)?:? (\d+)-(.*?)(?: NATUREZA DA DESPESA)?$')
TIPO_ACAO = {'PROJETO': 'PROJETO', 'ATIVIDADE': 'ATIVIDADE', 'OPERAÇÃO': 'OPERAÇÃO ESPECIAL'}
RE_RESUMO = re.compile(r'^(\d\.\d{3}\.\d{2})((?: ' + VALOR + r'){8})$')
RE_CREDITO = re.compile(r'(?:^|\s)(\d{2}) (\d) / (\d{2}) (\d{2}) (\d)\.(\d{3})\.(\d{2}) (\d) (\d{2}) ' + VALOR + '$')
RE_FUNCAO = re.compile(r'^Função: (\d+-[^\d]*?)(?= \d{2} \d / |$)')
RE_SUBFUNCAO = re.compile(r'^Subfunção: (\d+-[^\d]*?)(?= \d{2} \d / | TOTAL DA AÇÃO|$)')
CABECALHOS = ('ORÇAMENTO ANUAL', 'Demonstrativo de Créditos', 'Objetivo:', 'RESUMO DO PROGRAMA', 'FONTE VALORES',
              'ID.FT.DT', 'Dívida Correntes', '* ID:', 'REGIÃO CE/GD', 'TOTAL ', 'TOTAL DA AÇÃO')


def num(txt):
    return float(txt.replace('.', '').replace(',', '.'))


def extrair_tomo(caminho, creditos, resumos, resumos_orgao):
    org = prog = uo = acao = None
    funcao = subfuncao = ''
    with pdfplumber.open(caminho) as pdf:
        for pagina in pdf.pages:
            texto = pagina.extract_text() or ''
            if 'Demonstrativo de Créditos Orçamentários' not in texto:
                continue
            # Página final de cada órgão: "Resumo do Órgão" (fonte × GND de todos os programas)
            # — não tem créditos; guarda para conferir e pula.
            if 'RESUMO DO ÓRGÃO' in texto:
                for linha in texto.splitlines():
                    m = RE_RESUMO.match(linha.strip())
                    if m and org:
                        resumos_orgao.setdefault((org['cod'], m.group(1)), [num(v) for v in m.group(2).split()])
                acao = None
                continue
            linhas = [l.strip() for l in texto.splitlines()]
            for i, linha in enumerate(linhas):
                if linha is None:
                    continue
                # Nome longo: o fim do nome e/ou a esfera caem na linha de baixo
                # ("... (FISCAL /" + "SEGURIDADE SOCIAL)"): junta as duas.
                if linha.startswith('Órgão:') and not RE_ESFERA.match(linha) and i + 1 < len(linhas) and linhas[i + 1]:
                    linha = linha + ' ' + linhas[i + 1]
                    linhas[i + 1] = None
                m = RE_ORGAO.match(linha)
                if m:
                    novo = {'cod': m.group(1), 'nome': m.group(2).strip(), 'esfera': m.group(3) or ''}
                    if not org or novo['cod'] != org['cod']:
                        uo = acao = None
                    org = novo
                    continue
                m = RE_PROGRAMA.match(linha)
                if m:
                    novo = {'cod': m.group(1).zfill(3), 'nome': m.group(2).strip()}
                    if not prog or novo['cod'] != prog['cod']:
                        acao = None
                    prog = novo
                    continue
                m = RE_UO.match(linha)
                if m:
                    uo = {'cod': m.group(1), 'nome': m.group(2).strip()}
                    acao = None
                    continue
                m = RE_RESUMO.match(linha)
                if m and org and prog:
                    valores = [num(v) for v in m.group(2).split()]
                    chave = (org['cod'], prog['cod'], m.group(1))
                    # O resumo se repete quando o programa continua na página seguinte: guarda uma vez.
                    resumos.setdefault(chave, valores)
                    continue
                m = RE_ACAO.match(linha)
                if m:
                    acao = {'tipo': TIPO_ACAO[m.group(1)], 'cod': m.group(2), 'nome': m.group(3).strip(), 'creditos': []}
                    funcao = subfuncao = ''
                    continue
                mf = RE_FUNCAO.match(linha)
                if mf:
                    funcao = mf.group(1).strip()
                ms = RE_SUBFUNCAO.match(linha)
                if ms:
                    subfuncao = ms.group(1).strip()
                    # A subfunção vem na linha de baixo do 1º crédito da ação: completa os anteriores.
                    for c in (acao or {}).get('creditos', []):
                        c['subfuncao'] = c['subfuncao'] or subfuncao
                m = RE_CREDITO.search(linha)
                if m and org and prog and acao:
                    regiao, cat, gnd, mod, ident, ft, dt, iduso, rp, valor = m.groups()
                    acao['creditos'].append({
                        'esfera': org['esfera'], 'codOrgao': org['cod'], 'orgao': org['nome'],
                        'codUO': uo['cod'] if uo else org['cod'], 'uo': uo['nome'] if uo else org['nome'],
                        'programa': prog['cod'], 'nomePrograma': prog['nome'],
                        'tipoAcao': acao['tipo'], 'codAcao': acao['cod'], 'acao': acao['nome'],
                        'funcao': funcao, 'subfuncao': subfuncao,
                        'regiao': regiao, 'categoria': cat, 'gnd': gnd, 'modalidade': mod,
                        'id': ident, 'ft': ft, 'dt': dt, 'iduso': iduso, 'rp': rp, 'valor': num(valor)})
                    creditos.append(acao['creditos'][-1])
                    continue
                # Continuação do nome da ação (quebra antes de "NATUREZA DA DESPESA"; às vezes o
                # fim do nome vem colado ao cabeçalho "REGIÃO CE/GD ...").
                if acao and linha and not acao.get('fechada') and not linha.startswith(CABECALHOS) \
                        and not RE_FUNCAO.match(linha) and not RE_SUBFUNCAO.match(linha) and not re.match(r'^\d+$', linha):
                    resto = linha.split('REGIÃO CE/GD')[0].strip()
                    if resto.endswith('NATUREZA DA DESPESA'):
                        resto = resto[:-len('NATUREZA DA DESPESA')].strip()
                    if resto.startswith('ESPECIAL:'):
                        resto = resto[len('ESPECIAL:'):].strip()
                    if resto:
                        acao['nome'] = (acao['nome'] + ' ' + resto).strip()
                if acao and 'REGIÃO CE/GD' in linha:
                    acao['fechada'] = True


def totais_gnd_volume_i(caminho):
    """Volume I: 'Demonstrativo da Despesa por Categoria, Grupo de Despesa e Modalidade'."""
    with pdfplumber.open(caminho) as pdf:
        for pagina in pdf.pages:
            texto = pagina.extract_text() or ''
            if 'Demonstrativo da Despesa por Categoria, Grupo de Despesa' not in texto:
                continue
            totais = {}
            for linha in texto.splitlines():
                m = re.match(r'^(\d{2}) [A-ZÁÉÍÓÚÂÊÔÃÕÇ ]+? ' + VALOR + r'(?: ' + VALOR + r')?(?: ' + VALOR + r')?$', linha.strip())
                if m and m.group(1) in ('02', '31', '32', '33', '44', '45', '46') and m.group(1) not in totais:
                    valores = [v for v in m.groups()[1:] if v]
                    totais[m.group(1)] = num(valores[-1])
            if totais:
                return totais
    return {}


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    pasta =Path(sys.argv[1] if len(sys.argv) > 1 else 'LOA2027')
    saida = Path(sys.argv[2] if len(sys.argv) > 2 else 'dados/loa2027_acoes.json')
    creditos, resumos, resumos_orgao = [], {}, {}
    for tomo in TOMOS:
        extrair_tomo(pasta / tomo, creditos, resumos, resumos_orgao)
        print(f'{tomo}: {len(creditos)} créditos acumulados')

    # 1) Σ ações × Resumo do Programa (órgão, programa, fonte, GND) e × Resumo do Órgão.
    # A Reserva de Contingência vem como GND "02" no crédito e na coluna "99" do resumo.
    coluna = lambda gnd: '99' if gnd == '02' else gnd
    soma, soma_org = defaultdict(float), defaultdict(float)
    for c in creditos:
        fonte = f"{c['id']}.{c['ft']}.{c['dt']}"
        soma[(c['codOrgao'], c['programa'], fonte, coluna(c['gnd']))] += c['valor']
        soma_org[(c['codOrgao'], fonte, coluna(c['gnd']))] += c['valor']
    divergencias = []
    for (org, prog, fonte), valores in resumos.items():
        for gnd, esperado in zip(GNDS, valores[:7]):
            lido = soma.pop((org, prog, fonte, gnd), 0.0)
            if abs(lido - esperado) > 0.5:
                divergencias.append((org, prog, fonte, gnd, esperado, lido))
    sobras = {k: v for k, v in soma.items() if abs(v) > 0.5}
    for (org, fonte), valores in resumos_orgao.items():
        for gnd, esperado in zip(GNDS, valores[:7]):
            lido = soma_org.pop((org, fonte, gnd), 0.0)
            if abs(lido - esperado) > 0.5:
                divergencias.append(('ÓRGÃO', org, fonte, gnd, esperado, lido))
    orgaos_sem_resumo = {k[0] for k, v in soma_org.items() if abs(v) > 0.5}
    print(f'Resumos de programa: {len(resumos)} · resumos de órgão: {len(resumos_orgao)} · '
          f'divergências: {len(divergencias)} · créditos sem resumo: {len(sobras)} · órgãos sem resumo: {sorted(orgaos_sem_resumo)}')
    for d in divergencias[:15]:
        print('  DIVERGE', d)
    for k, v in list(sobras.items())[:15]:
        print('  SEM RESUMO', k, v)

    # 2) Σ por GND (todas as esferas, sem modalidade 91) × Volume I. O Volume I soma as
    # Investimentos Estatais no GND 44 (5.750.897.507 = fiscal/seguridade + estatais).
    vol1 = totais_gnd_volume_i(pasta / VOLUME_I) if (pasta / VOLUME_I).exists() else {}
    por_gnd = defaultdict(float)
    for c in creditos:
        if c['modalidade'] != '91':
            por_gnd[c['gnd']] += c['valor']
    print('GND (sem mod. 91) — extraído × Volume I:')
    dif_gnd = {}
    for gnd in sorted(set(por_gnd) | set(vol1)):
        esperado = vol1.get(gnd)
        if esperado is not None and abs(por_gnd[gnd] - esperado) > 0.5:
            dif_gnd[gnd] = esperado - por_gnd[gnd]
        print(f"  {gnd}: {por_gnd[gnd]:,.2f} × {esperado if esperado is None else f'{esperado:,.2f}'} {'DIVERGE' if gnd in dif_gnd else 'ok'}")
    estatais = sum(c['valor'] for c in creditos if 'INVESTIMENTOS ESTATAIS' in c['esfera'].upper())
    print(f'Investimentos Estatais (todas as GND): {estatais:,.2f}')

    # O próprio PDF tem resumos que somam linhas não impressas (ex.: SAP, UO 18100009: total
    # R$ 12.070.033, ações impressas R$ 10.216.763). Diferença pequena e só em resumo de
    # programa/órgão = registrada no arquivo; qualquer outra coisa = erro e nada é gravado.
    total = sum(c['valor'] for c in creditos)
    dif_resumos = sum(abs(d[4] - d[5]) for d in divergencias if d[0] != 'ÓRGÃO')
    if sobras or dif_resumos > total * 1e-4 or any(abs(v) > total * 1e-4 for v in dif_gnd.values()):
        print('ERRO: a extração não confere — nada foi gravado.')
        sys.exit(1)
    if divergencias or dif_gnd:
        print(f'AVISO: diferenças do próprio PDF registradas no arquivo (Σ {dif_resumos:,.2f}).')
    saida.parent.mkdir(parents=True, exist_ok=True)
    pacote = {'fonte': 'PLOA 2027 — Volume II (Tomos I e II), Demonstrativo de Créditos Orçamentários',
              'conferencia': {'resumosPrograma': len(resumos), 'resumosOrgao': len(resumos_orgao), 'gndVolumeI': vol1, 'estatais': estatais,
                              'difGndVolumeI': dif_gnd,
                              'difResumos': [{'nivel': 'órgão' if d[0] == 'ÓRGÃO' else 'programa', 'orgao': d[1] if d[0] == 'ÓRGÃO' else d[0],
                                              'programa': None if d[0] == 'ÓRGÃO' else d[1], 'fonte': d[2], 'gnd': d[3],
                                              'resumo': d[4], 'creditos': d[5]} for d in divergencias]},
              'creditos': creditos}
    saida.write_text(json.dumps(pacote, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'Gravado {saida} ({len(creditos)} créditos, {saida.stat().st_size / 1e6:.1f} MB)')


if __name__ == '__main__':
    main()
