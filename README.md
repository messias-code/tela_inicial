# Draco Workstation

Plataforma de ferramentas de pentest e segurança (red team e blue team) com
interface visual. Site estático, sem build. Identidade de cor: preto/grafite +
terracota (Claude Code).

## Rodar

```bash
python3 draco-engine.py           # pede a senha do sudo e sobe como root em :4173
python3 draco-engine.py --no-root # sem elevar (modos furtivos caem p/ -sT)
# http://localhost:4173
```

O motor se eleva a root por padrão — o `nmap` precisa disso para SYN scan
(`-sS`), detecção de SO e traceroute. Sem o `nmap`: `sudo apt install nmap`.
Usa ES modules — não abre por `file://`.

## Estrutura

| Arquivo | Papel |
|---|---|
| `index.html` | Início + ferramenta + Documentação, em uma página |
| `css/style.css` | Tema e componentes (dark, Inter + JetBrains Mono) |
| `js/app.js` | Roteamento por hash, render do plano e streaming da saída |
| `js/particles.js` | Fundo ambiente: partículas em movimento que reagem a mouse, clique e digitação |
| `draco-engine.py` | Backend (stdlib): serve os estáticos e orquestra o pipeline de recon em `/api/scan` |

### Rotas

`#/` início · `#/ferramentas` (rola até a seção) · `#/scanner` Draco Scanner ·
`#/docs` documentação

## Ferramenta atual: Draco Scanner

Tela cheia (sem rolagem de página — só a saída e os campos rolam). Campos:
**alvo**, **perfil** (furtivo/agressivo) e **ritmo** (rápido/lento). O painel
mostra o **plano** (`GET /api/plan`) e, ao executar, faz `POST /api/scan` e
transmite a saída do pipeline em blocos numerados. Alvo padrão: `scanme.nmap.org`.

O motor não roda um comando só — encadeia etapas, usando o resultado de cada uma
para decidir a próxima:

1. Resolução e DNS (`host`/PTR; `dnsrecon` std+axfr no agressivo)
2. Descoberta de host (`-Pn` furtivo · `-sn` com sondas no agressivo)
3. Portas TCP (SYN; top 1000/2000 furtivo · `-p-` agressivo)
4. Serviços/versões/SO/NSE nas portas abertas (`-sV -sC`; `+ -O --traceroute vuln` no agressivo)
5. UDP top 100/150 (agressivo)
6. Enumeração por serviço — dispara a ferramenta certa por serviço: HTTP →
   whatweb/wafw00f/nikto/gobuster/NSE `http-*`; TLS → `ssl-enum-ciphers`/sslscan;
   SMB → nxc/enum4linux/NSE; e NSE dedicado p/ DNS, SNMP, FTP, SSH, SMTP, RDP, BD
7. Vulnerabilidades — `nmap --script vulners` + `searchsploit` nos banners (agressivo)
8. Resumo — tabela de portas/serviços e tempo total

**Perfil** controla o quanto aparece (SYN, sem SO/UDP, só scripts seguros,
fragmentação no ritmo lento). **Ritmo** controla velocidade × profundidade
(`-T`, `--min-rate`/`--max-retries`, tamanho da wordlist, limites de tempo por
etapa). Ferramentas ausentes no PATH viram etapas `(pulado)`.

"Draco Engenharia Social" e "Relatórios" são espaços reservados.
