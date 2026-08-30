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
| `js/app.js` | Roteamento por hash, construtor de comando e streaming da saída |
| `js/particles.js` | Fundo ambiente: partículas em movimento que reagem a mouse, clique e digitação |
| `draco-engine.py` | Backend (stdlib): serve os estáticos e roda o `nmap` em `/api/scan`, transmitindo a saída |

### Rotas

`#/` início · `#/ferramentas` (rola até a seção) · `#/scanner` Draco Conhecendo
o Alvo · `#/docs` documentação

## Ferramenta atual: Draco Conhecendo o Alvo

Camada visual sobre o `nmap`, em tela cheia (sem rolagem de página — só a saída
e os campos rolam). Dois campos: **alvo** e **modo de varredura**:

| Modo | Flags |
|---|---|
| Furtivo · rápido | `-sS -Pn -T3` |
| Furtivo · lento | `-sS -Pn -T1` |
| Agressivo · rápido | `-A -T4` |
| Agressivo · lento | `-A -T2` |

Monta e valida o comando ao vivo; a saída aparece ao lado. Alvo padrão:
`scanme.nmap.org`.

Executa via `draco-engine.py`: o painel faz `POST /api/scan`, o motor roda o
`nmap` e transmite a saída linha a linha. Sem root, `-sS` cai para `-sT` (connect
scan). "Draco Engenharia Social" e "Relatórios" são espaços reservados.
