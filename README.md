# Poker Hand Logger

Logger objetivo de mãos de poker para uso ao vivo na mesa. Registra cartas, posição, ação pré-flop e pós-flop, e calcula estatísticas em tempo real (VPIP, PFR, 3-Bet%, C-Bet%, WTSD, W$SD, Win Rate por posição, distribuição de ranges).

## Funcionalidades

- **Logger sequencial** com auto-scroll entre etapas (jogadores → posição → cartas → ação pré-flop → ação flop → notas → resultado)
- **Auto-save em fold pré-flop, fold ao C-Bet e ao tocar no resultado** — nenhuma etapa terminal exige clique extra em "Salvar"
- **Ações pré-flop e flop completas**, incluindo Limp-Fold e Call C-Bet (cobre a linha de quem paga o c-bet, antes inexistente)
- **Estatísticas corretas** em tempo real — VPIP, PFR, 3-Bet%, Fold 3B, Fold PF, ATS, C-Bet%, Fold vs C-Bet, WTSD, W$SD, Viu Flop, Win Rate — com filtro por stack (Tudo / Só SS / Sem SS) e por janela (tudo / últimas 20 / últimas 10)
- **Histórico denso** com barras de cor (win/loss) e botão de apagar
- **Exportar** histórico para clipboard (tokens de máquina, mão mais antiga primeiro, com cabeçalho Data/Total/Jogadores)
- **Importar** texto livre, exportado pelo próprio app (formato atual ou antigo) ou colado manualmente, com preview e validação linha por linha
- **Painéis por posição** (VPIP e Win Rate) seguem o layout real da mesa (UTG → BB), incluindo MP
- **Mapa de 169 ranges** gerado por simulação Monte Carlo determinística (`scripts/gen-hand-rankings.mjs`)
- **Persistência local** via `localStorage`, com validação e descarte de dados corrompidos ou de esquema antigo ao carregar
- **Undo da última mão** com 1 clique
- **Reset da sessão** com confirmação

## Stack

- React 19 + TypeScript
- Vite 7
- Tailwind CSS 4
- lucide-react (ícones)

## Rodando localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Build

```bash
npm run build
```

Roda `tsc --noEmit` antes do `vite build` — erro de tipo interrompe o build (e portanto o deploy na Vercel). Saída em `dist/`.

## Deploy na Vercel

1. Faça push deste repositório para o GitHub.
2. No painel da Vercel, clique em **Add New → Project** e importe o repo.
3. A Vercel detecta o `vercel.json` automaticamente. Não precisa configurar nada.
4. Clique em **Deploy**.

A partir daí, todo `git push` na branch principal faz deploy automático.

## Formato de import

O **Exportar** copia o histórico para a área de transferência no formato canônico: tokens de máquina (não os rótulos exibidos na tela), da mão mais antiga para a mais nova (`#1` = mais antiga), com um cabeçalho `Data:` / `Total:` / `Jogadores:`. Exemplo:

```
=== POKER HAND LOGGER ===
Data: 23/07/2026, 14:30:00
Total: 2 mãos
Jogadores: 6

#1 14:28:10 | AKs CO | open → cbet | ns_win
#2 14:29:40 | QQ BTN | 3bet → cbet | sd_win
```

A linha `Jogadores: N` traz o tamanho de mesa predominante entre as mãos exportadas e o restaura ao importar; mãos jogadas em mesa de outro tamanho carregam um marcador próprio na linha (ex.: `| 7max`), então sessões que mudaram de tamanho no meio fazem o round-trip por mão, sem re-carimbar o histórico. O **Importar** aceita esse formato de volta e também:

- **Exports antigos**: rótulos por extenso (`Call Open`, `SD WIN`, `Fold 3B`...) e numeração decrescente (mão mais nova primeiro no arquivo) são detectados e normalizados automaticamente.
- **Texto livre**, uma mão por linha, ordem dos elementos não importa:

```
AKs CO open cbet ns_win
QQ BTN 3bet cbet sd_win
72o UTG fold
JTs BB call_open no_cbet ns_loss
```

Aliases curtos suportados: `3b`, `4b+`, `cb`, `sdw`, `nsl`, `won`, `lost`, etc. Linhas começando com `===`, `---`, `Data:`, `Total`, `Jogadores` são ignoradas (compatível com headers do export, atuais e antigos).
