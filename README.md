# Draco Workstation

Ferramentas de segurança da informação numa interface visual, sob a constelação
do dragão. Estética: pixel-gótico (tipo _Blasphemous_) + cosmos, cores da
identidade Claude Code (preto + laranja/terracota). Primeira ferramenta:
**Draco Scanner** (camada visual sobre o `nmap`).

## Rodar

```bash
python3 -m http.server 4173
# http://localhost:4173
```

Node não é necessário para rodar (só foi instalado para lint). Os arquivos usam
ES modules, então precisa de servidor HTTP — não abre por `file://`.

## Estrutura

| Arquivo | Papel |
|---|---|
| `index.html` | Tela-título + telas internas (Draco Scanner, Grimório) |
| `css/style.css` | Tema, fontes pixel/blackletter, glitch, moldura, vinheta, grão |
| `js/dragon.js` | A constelação Draco: estrelas + linhas da cabeça do dragão |
| `js/scene.js` | Canvas: campo estelar, constelação em partículas, linhas, glitch |
| `js/app.js` | Tela-título ↔ telas, menu de jogo (teclado/mouse), construtor do comando |

### Mexer no logo (dragão em estrelas)

Em `js/dragon.js`: a silhueta vem do `PATH` (ícone `spiked-dragon-head` do
**game-icons.net**, por Lorc — CC BY 3.0). O `buildDraco()` rasteriza o path,
amostra pontos no contorno + interior (a poeira) e monta as estrelas.
`NODES_VB` = estrelas-âncora nas pontas dos espinhos; `EDGES_KEYS` = linhas de
constelação. `step` controla o espaçamento dos pontos do contorno.
Tamanho/posição por fase: `computeGoal()` em `js/scene.js`.

Créditos: ícone do dragão — game-icons.net (Lorc), CC BY 3.0.

### Ajustar animação / glitch

Em `js/scene.js`: `fireGlitch()` (força/duração), o agendamento em `glNext`,
`computeGoal()` (tamanho e posição da constelação por fase), `breath` (respiração).

## Próximo passo

O Draco Scanner monta e valida a invocação, mas **não executa**. Falta o backend
`draco-engine` que roda o `nmap` e transmite a saída para o console da tela.
