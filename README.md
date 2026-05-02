# Poker Hand Logger

Logger objetivo de mãos de poker para uso ao vivo na mesa. Registra cartas, posição, ação pré-flop e pós-flop, e calcula estatísticas em tempo real (VPIP, PFR, 3-Bet%, C-Bet%, WTSD, W$SD, Win Rate por posição, distribuição de ranges).

## Funcionalidades

- **Logger sequencial** com auto-scroll entre etapas (jogadores → posição → cartas → ação pré-flop → ação flop → resultado)
- **Auto-save em fold pré-flop** (sem clique extra)
- **Estatísticas corretas** em tempo real, com escopo configurável (tudo / últimas 20 / últimas 10)
- **Histórico denso** com barras de cor (win/loss) e botão de apagar
- **Exportar** histórico para clipboard (formato texto legível)
- **Importar** texto livre ou texto exportado, com preview e validação linha por linha
- **Persistência local** via `localStorage` (sobrevive entre sessões do navegador)
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

Saída em `dist/`.

## Deploy na Vercel

1. Faça push deste repositório para o GitHub.
2. No painel da Vercel, clique em **Add New → Project** e importe o repo.
3. A Vercel detecta o `vercel.json` automaticamente. Não precisa configurar nada.
4. Clique em **Deploy**.

A partir daí, todo `git push` na branch principal faz deploy automático.

## Formato de import

Aceita uma mão por linha. Ordem dos elementos não importa. Exemplos:

```
AKs CO open cbet ns_win
QQ BTN 3bet cbet sd_win
72o UTG fold
JTs BB call_open no_cbet ns_loss
```

Aliases curtos suportados: `3b`, `4b+`, `cb`, `sdw`, `nsl`, `won`, `lost`, etc. Linhas começando com `===`, `---`, `Data:`, `Total`, `Jogadores` são ignoradas (compatível com headers do export).
