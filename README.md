# Draco Workstation

Plataforma de ferramentas de pentest e segurança (red team e blue team) com
interface visual. Site estático, sem build. Identidade de cor: preto/grafite +
terracota (Claude Code).

## Rodar

```bash
python3 -m http.server 4173
# http://localhost:4173
```

Usa ES modules — precisa de servidor HTTP, não abre por `file://`.

## Estrutura

| Arquivo | Papel |
|---|---|
| `index.html` | Início + ferramenta + Documentação, em uma página |
| `css/style.css` | Tema e componentes (dark, Inter + JetBrains Mono) |
| `js/app.js` | Roteamento por hash e construtor de comando da ferramenta |
| `js/particles.js` | Fundo ambiente: partículas em movimento que reagem a mouse, clique e digitação |

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

**Não executa** — falta o backend `draco-engine` que roda o `nmap` e transmite a
saída ao painel. "Draco Engenharia Social" e "Relatórios" são espaços reservados.
