# Lessons Learned — Poker Logger

Retrospective de erros, correções e linhas de raciocínio equivocadas identificadas
durante o desenvolvimento. Serve como memória viva para não repetir o mesmo tropeço.
Dividido em três eixos: **Poker (domínio)**, **Programação (código/React/TS)** e
**Processo/Deploy**.

---

## 1. Poker — Domínio

### 1.1 VPIP: definição estrita, não "qualquer ação que não seja fold"

**Erro inicial:** VPIP estava sendo somado toda vez que a ação preflop era `≠ fold`.
Isso inflava o número para posições onde o jogador apenas defendia o big blind com
`check` (limp da BB é grátis, não voluntário) e para casos de `fold_to_raise`
(cujo commit já foi feito, mas o *voluntary put money in pot* é a chamada inicial,
não a fuga posterior — no cenário BB que só completa e depois foge do raise, não
houve dinheiro voluntário).

**Correção:** Whitelist explícita em `VOLUNTARY_ACTIONS`:
```
limp, open, call_open, 3bet, call_3bet, 4bet_plus, fold_to_3bet, fold_to_4bet_plus
```
Com a exceção especial: `limp` na `BB` **não** é VPIP (é apenas checar a opção
grátis; não há dinheiro voluntário adicional).

**Lição:** VPIP é conceitual, não binário-por-exclusão. Nunca derive uma stat
"exceto X" — sempre liste positivamente o que conta.

### 1.2 WTSD > 100% — numerador não-restrito

**Erro:** `wentToShowdown` estava contando qualquer mão com resultado `sd_*`, mas o
denominador `sawFlop` só contava mãos com `flopAction !== 'none'`. Isso permitia
que uma mão com resultado sd atribuído a partir de all-in preflop entrasse no
numerador sem estar no denominador → % > 100%.

**Correção:** Numerador exige **ambos**: `sawFlopThisHand && result.startsWith('sd_')`.

**Lição:** Sempre verificar `numerador ⊆ denominador` conceitualmente antes de
codificar. Um ratio > 100% é sempre um bug de conjunto, não de cálculo.

### 1.3 ATS (Attempt to Steal): opps ≠ "todas as mãos naquela posição"

**Erro:** Contava `ATS attempt / hands_in_position`. Mas ATS é medida sobre
oportunidades reais de steal — só quando o jogador é o *first in* nas posições
CO/BTN/SB, com todos anteriores tendo fugido.

**Correção:** Restringi as opps a ações que **implicam** first-in position:
`STEAL_OPP_ACTIONS = ['open', 'fold', 'limp', 'fold_to_3bet']` e attempts a
`['open', 'fold_to_3bet']`. Isso não é perfeito (o app não modela ação dos
oponentes), mas evita o pior erro de contar mãos onde alguém já entrou antes.

**Lição:** Stats de position-based steal são fundamentalmente sobre oportunidade,
não sobre resultado. Sem log dos oponentes, tem que aproximar via ação própria.

### 1.4 Classificação de 169 mãos em buckets de %

**Erro conceitual inicial:** Usar um cascade if/else derivado "no olho" (ex:
`if (isPair && rank >= T) return '5%'`). Bucket estava certo para os extremos
mas errado no meio (esp. QJo, KTo, suited connectors médios).

**Correção:** Tabela explícita `HAND_RANGE_MAP` com todas as 169 combinações,
derivada da lista ranqueada por equity heads-up + Sklansky groups. Verificação:
a soma cumulativa de combos por bucket bate com o label:

| Bucket  | Cumulativo esperado | Obs |
|---------|---------------------|-----|
| 3%      | ~2.1%               | AA-JJ, AKs                    |
| 5%      | ~4.4%               | + TT, AKo, AQs, AJs, KQs      |
| 10%     | ~9.5%               | + 99-77, AQo, ATs+, KJs+…     |
| 15%     | ~14.9%              | + suited connectors, small PP |
| ...     |                     |                                |

**Lição:** Ranking de mãos preflop é um dado tabulado por décadas de solvers e
sims — não tente derivar via heurística. Copie a tabela.

### 1.5 Contagem de combos: 1326 total (pairs×6 + suited×4 + offsuit×12)

**Aprendizado:** Ao calcular "expected count" para o gráfico de distribuição de
ranges, o peso de cada bucket precisa considerar combos, não hands. `AA` são 6
combos; `AKs` são 4; `AKo` são 12. Um bucket "3%" com AA+KK+QQ+JJ+AKs vale
(4×6) + 4 = 28 combos = 28/1326 = 2.1% — não 5/169 = 3%.

**Lição:** Distinguir claramente "hand strings" (169) de "combos" (1326). Stats
preflop pesam por combos.

### 1.6 Small Stack (SS) mode: metadado por mão, não sessão

**Erro inicial:** Exportava `Obs: Small stack | N jogadores` como rodapé único
do dump. Isso é ambíguo — a sessão pode alternar entre SS e não-SS conforme o
stack varia.

**Correção:** `smallStackMode` virou flag por Hand. No export vai inline
(`| SS mode`) na linha da mão. Parser reconhece.

**Lição:** Contexto tático (stack effective, número de jogadores) é atributo da
mão, não da sessão. Modelar assim desde o início.

### 1.7 Fold ao All-in: fold preflop legítimo, não uma outra categoria

**Correção final:** Adicionado `fold_to_allin` como quinto fold preflop, ao lado
de `fold`, `fold_to_raise`, `fold_to_3bet`, `fold_to_4bet_plus`. Todos:
- Auto-save `ns_loss`
- **Não** contam VPIP (exceto `fold_to_3bet`/`fold_to_4bet_plus`, que já cometeram
  dinheiro voluntário no open/3bet original)
- Contam `foldPf`

**Lição:** Um "fold" preflop pode acontecer em N pontos da árvore de decisão.
Modele cada um; não colapse em `fold` genérico.

---

## 2. Programação — Código

### 2.1 Bug de closure estável em `setTimeout`

**Erro:** `handleFlopAction` disparava `setTimeout(() => saveHand('ns_loss'), 30)`
para dar tempo do `setFlopAction(action)` propagar. Mas `saveHand` lia
`flopAction` do escopo — que ainda era o valor antigo (`'none'`) porque setState
é assíncrono.

**Correção:** Introduzir parâmetros de override em `saveHand`:
```ts
saveHand(overrideResult?, overrideAction?, overrideFlopAction?)
```
e passar `action` diretamente:
```ts
setTimeout(() => saveHand('ns_loss', undefined, action), 30);
```

**Lição:** Sempre que precisar do valor "novo" imediatamente após um setState,
passe explicitamente. Nunca confie que a closure "vai ler o valor atualizado" —
ela lê o que capturou no momento da definição. Esse é o clássico *stale closure*
do React.

### 2.2 Auto-scroll indesejado após save/refresh na aba History

**Erro:** Ao voltar/entrar na aba History, a página fazia scroll pra baixo. Causas
combinadas:
1. `scrollTo('cards')` era chamado no `saveHand` para preparar próxima mão.
   Como o elemento estava numa aba não-visível, o browser rolava mesmo assim.
2. `history.scrollRestoration` (default `'auto'` no browser) restaurava a posição
   do refresh anterior.

**Correção:**
```ts
useEffect(() => {
  // on mount
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo({ top: 0, behavior: 'auto' });
}, []);
useEffect(() => {
  window.scrollTo({ top: 0, behavior: 'auto' });
}, [tab]);
```

**Lição:** `scrollTo` age no documento inteiro, não na aba lógica atual. Sempre
resetar o scroll ao trocar de "tela lógica" e desabilitar a restauração do
browser em SPAs multi-tab.

### 2.3 Salvar `range` no objeto Hand foi um erro

**Erro:** Guardar o bucket calculado (`h.range`) junto com a mão. Consequência:
quando a tabela de classificação era corrigida, hands antigas ficavam com bucket
desatualizado. Stats por range mostravam algo incorreto.

**Correção:** `calculateStats.byRange` deriva o bucket toda vez via
`getHandRange(card1, card2, handType)`. `h.range` foi deprecado no runtime
(mantido apenas para retrocompatibilidade do parse).

**Lição:** Não persistir campos que são **função pura** de outros. Calcule on
demand. Isso permite corrigir a lógica sem migrar dados.

### 2.4 Round-trip de export/import: notes em linha separada quebrava tudo

**Erro:** Primeira versão punha `\n   Notes: ...` como linha extra. O parser lia
uma mão por linha; a linha "Notes: ..." virava uma mão inválida na próxima
importação.

**Correção:** Notes inline (`| Notes: ${text}`) na mesma linha da mão. Parser
extrai via regex ANTES de tokenizar o resto:
```ts
const notesMatch = line.match(/[|·]?\s*Notes?\s*:\s*(.+?)\s*$/i);
if (notesMatch) { notes = notesMatch[1].trim(); line = line.slice(0, notesMatch.index); }
```

**Lição:** Formatos texto-linha devem preservar 1 registro = 1 linha. Nunca
espalhe um registro por múltiplas linhas se o parser é line-based.

### 2.5 Consolidar "listas mágicas" em constantes

**Erro:** Havia várias linhas com `['fold', 'fold_to_3bet', 'fold_to_4bet_plus']`
duplicadas em `saveHand`, `calculateStats`, ATS opps, etc. Adicionar
`fold_to_allin` exigiu caçar cada ocorrência — arriscado.

**Correção:**
```ts
const FOLD_PREFLOP_ACTIONS: PreFlopAction[] = [
  'fold', 'fold_to_raise', 'fold_to_3bet', 'fold_to_4bet_plus', 'fold_to_allin',
];
const isFoldPreflop = (a: PreFlopAction) => FOLD_PREFLOP_ACTIONS.includes(a);
```

**Lição:** Toda vez que a mesma tupla literal aparecer em ≥2 lugares, extraia.
Não é premature abstraction — é single source of truth.

### 2.6 `handNotation` sem canonicalização gerava keys duplicadas

**Erro:** `KJs` e `JKs` acabavam sendo strings diferentes. Lookup na tabela
`HAND_RANGE_MAP` (chaveada por `KJs`) falhava metade das vezes.

**Correção:** Sempre carta maior primeiro:
```ts
const [higher, lower] = RANK_ORDER[c1] >= RANK_ORDER[c2] ? [c1, c2] : [c2, c1];
```

**Lição:** Notação de mão de poker tem convenção canônica (maior primeiro).
Force isso na função que gera a string, não confie no chamador.

### 2.7 Erros pré-existentes de TS no `master` (posição MP)

**Aprendizado defensivo:** Ao rebasear a feature branch em cima de master, apareceu
um erro TS sobre posição `MP`. Vite build passava, mas `tsc --noEmit` reclamava.
Escolha: consertar (fora do escopo) ou ignorar (Vercel usa Vite, que compila
apesar). Escolhi ignorar.

**Lição:** Nem sempre `tsc` estrito == build de produção. Saber a diferença.
Documentar quando decidir intencionalmente deixar red no linter.

---

## 3. Processo / Deploy

### 3.1 Vercel deploy: branch importa

**Erro:** Fiz mudança na feature branch, testei local, e o usuário reportou "não
vejo azul no Vercel". Vercel produção está atrelada a `master`. Feature branch
sozinha não deploya para o domínio principal.

**Correção:** Merge (fast-forward) da feature branch em `master` + push.

**Lição:** Sempre confirmar qual branch a plataforma deploy usa. Preview branches
existem mas têm URLs próprias.

### 3.2 Rebase antes de merge quando master avançou

**Erro:** Master ganhou commits durante o desenvolvimento (ATS feature,
RangeDistribution component). Merge direto teria criado merge commit ou conflito.

**Correção:** `git rebase master` na feature branch, resolvendo conflitos linha
por linha (mantendo melhorias do master como `isFold ? 'FOLD' : ...`), depois
`git merge --ff-only`.

**Lição:** Feature branches longas devem `rebase master` periodicamente. Deixar
para o fim multiplica conflitos.

### 3.3 Blue-background test isolou o problema de deploy

**Boa prática:** Quando o usuário disse "não estou vendo minha mudança", pintei
o `<body>` de azul e pedi para verificar. Isso isolou "código não deployado" de
"lógica está errada". Confirmação clara em segundos.

**Lição:** Marcador visual óbvio é a forma mais rápida de descartar problema de
deploy vs. problema de código.

### 3.4 Não amend em commits publicados

**Prática seguida:** Sempre novo commit em cima, nunca `--amend` após push.
Salvou o histórico do que foi tentado — útil na review pelo usuário e para
reverter passo a passo.

**Lição:** Amend só pré-push. Depois, commits novos.

---

## 4. Meta — Sobre linhas de raciocínio erradas

### 4.1 "Bucket está certo, só o cálculo está errado" — não estava

**Erro de escuta:** O usuário disse "conta expected errada, bucket certo".
Interpretei literal e mexi só na fórmula. Depois ele pediu revisão total, e
descobri que o bucketing também tinha problemas em várias mãos do meio.

**Lição:** "Está certo" do usuário é frequentemente "não notei estar errado".
Quando ele pede revisão geral, revisar geral — não confiar em auto-avaliações
específicas de partes.

### 4.2 "Reveja todas as contas" ≠ "revise uma"

Quando o usuário diz "reveja todas as contas de stats", não parar no primeiro
bug encontrado (WTSD). Ler o guia de referência (PokerTracker), varrer VPIP,
PFR, 3-Bet, C-Bet, ATS por posição, W$SD, etc., um a um.

**Lição:** Instrução em varredura pede saída em varredura. Um único fix não
resolve o pedido.

### 4.3 Confiar nos dados persistidos (localStorage) foi ingênuo

**Erro conceitual:** Como o app persiste hands no localStorage, mudanças na
lógica de cálculo aplicam retroativamente na próxima renderização. Isso é bom
para stats derivadas, ruim para bucket armazenado em `h.range`. Ver 2.3.

**Lição:** Ao mudar lógica de derivação, pensar: "o que já está persistido? o
que preciso recomputar on the fly vs. migrar?".

### 4.4 Testes manuais > confiança no `tsc`

Repetidamente o `npm run build` passava com bugs vivos: closure estável,
scroll bug, VPIP acima de 100%. Sem testes automatizados, cada fix precisa
passar por verificação manual no browser.

**Lição:** TypeScript pega tipagem, não semântica. Um app sem testes precisa
de smoke test manual disciplinado após cada mudança.

---

## 5. Padrões que Funcionaram Bem

- **Discriminated unions** para `PreFlopAction` / `FlopAction` / `HandRange` —
  o compilador ajudou a pegar cases faltando em switches.
- **Single-file architecture** (`PokerLogger.tsx`) — para uma app deste tamanho
  (< 2k linhas), colocar tudo num arquivo com seções claramente comentadas foi
  mais rápido do que estruturar módulos.
- **`isFoldPreflop`, `isVoluntary`** — helpers de 1 linha em cima de whitelist
  centralizada. Fácil auditar, fácil estender.
- **Override params em `saveHand`** — evita a tentação de refatorar setState
  para promises. Ganhou robustez sem virar o modelo mental.
- **Export inline "| separated"** — texto legível para humano, parseável por
  regex, round-trippable.

---

## 6. O Que Faria Diferente Numa v2

1. **Testes unitários** para `calculateStats`, `getHandRange`, `parseLine`,
   `exportText`. São funções puras — testar sem UI é trivial.
2. **Schema/migração explícita** do localStorage: hoje é `poker_session_v1`.
   Se o modelo Hand mudar de forma incompatível, precisa de migration path.
3. **Storybook ou route de dev** para cada tela (Input, History, Stats) com
   fixtures — hoje testar `RangeDistribution` requer jogar 20 mãos.
4. **Separar cálculos em `stats.ts`** — hoje conviver com o componente cria
   circular concerns; teste do cálculo depende de mockar o React state.
5. **CI**: `tsc --noEmit` + `vite build` no PR, antes de merge para master.
   Vercel não bloqueia PR se `tsc` falha.
