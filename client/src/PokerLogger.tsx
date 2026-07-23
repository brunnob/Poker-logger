import { useState, useEffect, useRef, useMemo } from 'react';
import { Trash2, Undo2, BarChart3, History as HistoryIcon, ClipboardList, RotateCcw, StickyNote } from 'lucide-react';
import { CardRank, HandType, PokerPosition, PreFlopAction, FlopAction, HandResult, HandRange, Hand, SessionState, CARD_RANKS, STORAGE_KEY, ACTION_LABEL, getPositions, advancePosition } from './lib/types';
import { getHandRange, TOTAL_COMBOS, BUCKET_WEIGHTS, formatExpected, handNotation } from './lib/ranges';
import { isFoldPreflop, calculateStats } from './lib/stats';
import { ParseResult, parseImport } from './lib/parser';
import { buildExportText } from './lib/export';
import { loadSession, serializeSession } from './lib/storage';

// ============================================================
// MAIN APP
// ============================================================
export default function PokerLogger() {
  const [tab, setTab] = useState<'logger' | 'stats' | 'history'>('logger');
  const [session, setSession] = useState<SessionState>({
    hands: [], playerCount: 6, currentPositionIndex: 0,
  });
  const [loaded, setLoaded] = useState(false);

  const [card1, setCard1] = useState<CardRank | null>(null);
  const [card2, setCard2] = useState<CardRank | null>(null);
  const [handType, setHandType] = useState<HandType | null>(null);
  const [preFlopAction, setPreFlopAction] = useState<PreFlopAction | null>(null);
  const [flopAction, setFlopAction] = useState<FlopAction | null>(null);
  const [result, setResult] = useState<HandResult | null>(null);
  const [notes, setNotes] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [smallStackMode, setSmallStackMode] = useState(false);

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastSaveRef = useRef(0);

  // Load from localStorage
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch {}
    setSession(loadSession(stored));
    setLoaded(true);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, serializeSession(session)); } catch {}
  }, [session, loaded]);

  useEffect(() => {
    if (card1 && card2 && card1 === card2) setHandType('pair');
  }, [card1, card2]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [tab]);

  const positions = getPositions(session.playerCount);
  const currentPos = positions[session.currentPositionIndex];
  const stats = useMemo(() => calculateStats(session.hands), [session.hands]);

  const scrollTo = (id: string) => {
    setTimeout(() => sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const resetForm = () => {
    setCard1(null); setCard2(null); setHandType(null);
    setPreFlopAction(null); setFlopAction(null); setResult(null);
    setNotes('');
  };

  // M1: a rejected duplicate tap must not mutate form state either, or the
  // stale selection bleeds into the next hand's form (SAVE-GUARD-DESYNC-1)
  const isSaveThrottled = () => Date.now() - lastSaveRef.current < 300;

  const saveHand = (overrideResult?: HandResult, overrideAction?: PreFlopAction, overrideFlopAction?: FlopAction) => {
    const finalAction = overrideAction || preFlopAction;
    const finalResult = overrideResult || result;
    const finalFlopAction = overrideFlopAction || flopAction || 'none';
    if (!card1 || !card2 || !handType || !finalAction || !finalResult) return;

    const now = Date.now();
    if (isSaveThrottled()) return;
    lastSaveRef.current = now;

    const trimmedNotes = notes.trim();
    const newHand: Hand = {
      id: Math.random().toString(36).slice(2, 11),
      timestamp: now,
      position: currentPos, card1, card2, handType,
      preFlopAction: finalAction,
      flopAction: isFoldPreflop(finalAction) ? 'none' : finalFlopAction,
      result: finalResult,
      playerCount: session.playerCount,
      smallStackMode,
      ...(trimmedNotes && { notes: trimmedNotes }),
    };

    setSession(prev => ({
      ...prev,
      hands: [newHand, ...prev.hands],
      currentPositionIndex: advancePosition(prev.currentPositionIndex, prev.playerCount),
    }));
    resetForm();
    showToast(`${handNotation(card1, card2, handType)} salva`);
    scrollTo('cards');
  };

  const handlePreFlopAction = (action: PreFlopAction) => {
    if (isFoldPreflop(action)) {
      if (isSaveThrottled()) return;
      setPreFlopAction(action);
      saveHand('ns_loss', action);
    } else {
      setPreFlopAction(action);
      scrollTo('flop');
    }
  };

  const handleFlopAction = (action: FlopAction) => {
    if (action === 'fold_to_cbet') {
      if (isSaveThrottled()) return;
      setFlopAction(action);
      saveHand('ns_loss', undefined, action);
    } else {
      setFlopAction(action);
      scrollTo('result');
    }
  };

  const handleResult = (r: HandResult) => {
    if (isSaveThrottled()) return;
    setResult(r);
    saveHand(r);
  };

  const undoLast = () => {
    if (session.hands.length === 0) return;
    setSession(prev => {
      const removed = prev.hands[0];
      // M4: imported hands never advanced the dealer position, so undoing one must not rewind it.
      const currentPositionIndex = removed.fromImport
        ? prev.currentPositionIndex
        : prev.currentPositionIndex === 0
          ? getPositions(prev.playerCount).length - 1
          : prev.currentPositionIndex - 1;
      return { ...prev, hands: prev.hands.slice(1), currentPositionIndex };
    });
    showToast('Última mão desfeita');
  };

  const deleteHand = (id: string) => {
    setSession(prev => ({ ...prev, hands: prev.hands.filter(h => h.id !== id) }));
  };

  const updateHandNote = (id: string, newNotes: string) => {
    const trimmed = newNotes.trim();
    setSession(prev => ({
      ...prev,
      hands: prev.hands.map(h => h.id === id ? { ...h, notes: trimmed || undefined } : h),
    }));
  };

  const setPlayerCount = (n: number) => {
    setSession(prev => {
      // M6: preserve the same seat by position label (e.g. HJ stays HJ) when the
      // new layout still has it; only fall back to a clamped index otherwise.
      const currentLabel = getPositions(prev.playerCount)[prev.currentPositionIndex];
      const newPositions = getPositions(n);
      const preservedIndex = newPositions.indexOf(currentLabel);
      const currentPositionIndex = preservedIndex >= 0
        ? preservedIndex
        : Math.min(Math.max(prev.currentPositionIndex, 0), newPositions.length - 1);
      return { ...prev, playerCount: n, currentPositionIndex };
    });
  };

  const setPositionIndex = (i: number) => {
    setSession(prev => ({ ...prev, currentPositionIndex: i }));
  };

  const resetSession = () => {
    setSession({ hands: [], playerCount: 6, currentPositionIndex: 0 });
    resetForm();
    setConfirmReset(false);
    showToast('Sessão zerada');
  };

  const importHands = (parsedHands: Omit<Hand, 'id' | 'timestamp'>[], mode: 'replace' | 'append') => {
    // parseImport returns hands oldest-first with playerCount already set per-hand (M5) —
    // do not override it here. Assign ascending timestamps in that same oldest-first order
    // to preserve true chronology, then reverse so state stays newest-first (C5).
    const baseTime = Date.now();
    const newHands: Hand[] = parsedHands.map((h, i) => ({
      ...h,
      fromImport: true,
      id: Math.random().toString(36).slice(2, 11),
      timestamp: baseTime - (parsedHands.length - 1 - i) * 1000,
    }));
    newHands.reverse();
    setSession(prev => ({
      ...prev,
      hands: mode === 'replace' ? newHands : [...newHands, ...prev.hands],
    }));
    showToast(`${parsedHands.length} mãos importadas`);
    setTab('stats');
  };

  const isFoldPreFlop = preFlopAction && isFoldPreflop(preFlopAction);

  if (!loaded) return <div className="p-8 font-mono text-sm text-stone-500">Carregando…</div>;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <style>{`
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .num { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
      `}</style>

      <header className="sticky top-0 z-30 bg-stone-50/95 backdrop-blur border-b border-stone-300">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-stone-900 rotate-45" />
            <h1 className="mono text-xs font-bold tracking-[0.2em] uppercase">Hand Logger</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={undoLast} disabled={session.hands.length === 0}
              className="p-2 text-stone-700 hover:bg-stone-200 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Desfazer última mão"><Undo2 className="w-4 h-4" /></button>
            <button onClick={() => setConfirmReset(true)}
              className="p-2 text-stone-700 hover:bg-stone-200 transition-colors"
              title="Zerar sessão"><RotateCcw className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 flex">
          {([
            ['logger', 'Logger', ClipboardList],
            ['stats', 'Stats', BarChart3],
            ['history', 'Histórico', HistoryIcon],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-3 mono text-xs font-bold tracking-wider uppercase border-b-2 transition-all flex items-center justify-center gap-2 ${
                tab === key ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-700'
              }`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>
      </header>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-stone-900 text-stone-50 px-4 py-2 mono text-xs font-bold tracking-wider uppercase">
          {toast}
        </div>
      )}

      {confirmReset && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 flex items-center justify-center p-4" onClick={() => setConfirmReset(false)}>
          <div className="bg-stone-50 border border-stone-900 max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="mono text-xs font-bold tracking-wider uppercase mb-2">Zerar sessão</h3>
            <p className="text-sm text-stone-700 mb-6">Apaga todas as {session.hands.length} mãos. Não dá pra desfazer.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmReset(false)} className="flex-1 py-3 border border-stone-300 mono text-xs font-bold uppercase tracking-wider hover:bg-stone-100">Cancelar</button>
              <button onClick={resetSession} className="flex-1 py-3 bg-stone-900 text-stone-50 mono text-xs font-bold uppercase tracking-wider hover:bg-stone-800">Zerar</button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-4 py-6 pb-32">
        {tab === 'logger' && (
          <div className="space-y-8">
            <div className="flex items-baseline justify-between border-b border-stone-300 pb-3">
              <div>
                <span className="mono text-[10px] font-bold tracking-widest uppercase text-stone-500">Mesa</span>
                <span className="num ml-2 text-sm font-bold">{session.playerCount}-max</span>
                <span className="mono text-stone-400 mx-2">·</span>
                <span className="mono text-[10px] font-bold tracking-widest uppercase text-stone-500">Pos</span>
                <span className="num ml-2 text-sm font-bold">{currentPos}</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setSmallStackMode(!smallStackMode)}
                  className={`px-2 py-1 border mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    smallStackMode
                      ? "bg-stone-900 text-stone-50 border-stone-900"
                      : "bg-stone-50 text-stone-900 border-stone-300 hover:border-stone-900"
                  }`}>
                  {smallStackMode ? "✓ SS" : "SS"}
                </button>
                <span className="num text-xs text-stone-500">{session.hands.length} mãos</span>
              </div>
            </div>

            <Section title="Jogadores na mesa" step="01">
              {/* "Nmax" labels + recessed tint so these can't be mistaken for
                  the white rank tiles of step 03 (both grids are numeric) */}
              <div className="grid grid-cols-8 gap-1">
                {[2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                  <button key={n} onClick={() => { setPlayerCount(n); scrollTo('position'); }}
                    className={`mono h-9 text-[11px] font-bold tracking-wide border transition-colors ${
                      session.playerCount === n
                        ? 'bg-stone-900 text-stone-50 border-stone-900'
                        : 'bg-stone-100 text-stone-600 border-stone-300 hover:border-stone-900'
                    }`}>{n}max</button>
                ))}
              </div>
            </Section>

            <div ref={el => { sectionRefs.current['position'] = el; }} className="scroll-mt-20">
              <Section title="Sua posição" step="02">
                <div className="grid grid-cols-3 gap-1">
                  {positions.map((p, i) => (
                    <button key={p} onClick={() => { setPositionIndex(i); scrollTo('cards'); }}
                      className={`mono h-10 text-xs font-bold uppercase tracking-wider border transition-colors ${
                        session.currentPositionIndex === i
                          ? 'bg-stone-900 text-stone-50 border-stone-900'
                          : 'bg-stone-50 border-stone-300 hover:border-stone-900'
                      }`}>{p}</button>
                  ))}
                </div>
              </Section>
            </div>

            <div ref={el => { sectionRefs.current['cards'] = el; }} className="scroll-mt-20">
              <Section title="Suas cartas" step="03">
                <div className="space-y-4">
                  <CardGrid label="Carta 1" rank={CARD_RANKS} selected={card1}
                    onSelect={c => { setCard1(c); setCard2(null); setHandType(null); scrollTo('card2'); }} />
                  {card1 && (
                    <div ref={el => { sectionRefs.current['card2'] = el; }} className="scroll-mt-20">
                      <CardGrid label="Carta 2" rank={CARD_RANKS} selected={card2}
                        onSelect={c => {
                          setCard2(c);
                          if (c !== card1) { setHandType(null); scrollTo('handType'); }
                          else scrollTo('preflop');
                        }} />
                    </div>
                  )}
                  {card1 && card2 && card1 !== card2 && (
                    <div ref={el => { sectionRefs.current['handType'] = el; }} className="scroll-mt-20">
                      <Label>Tipo</Label>
                      <div className="grid grid-cols-2 gap-1">
                        <button onClick={() => { setHandType('suited'); scrollTo('preflop'); }}
                          className={`mono h-10 text-xs font-bold uppercase tracking-wider border transition-colors ${
                            handType === 'suited' ? 'bg-stone-900 text-stone-50 border-stone-900' : 'bg-stone-50 border-stone-300 hover:border-stone-900'
                          }`}>Suited (s)</button>
                        <button onClick={() => { setHandType('offsuit'); scrollTo('preflop'); }}
                          className={`mono h-10 text-xs font-bold uppercase tracking-wider border transition-colors ${
                            handType === 'offsuit' ? 'bg-stone-900 text-stone-50 border-stone-900' : 'bg-stone-50 border-stone-300 hover:border-stone-900'
                          }`}>Offsuit (o)</button>
                      </div>
                    </div>
                  )}
                  {card1 && card2 && handType && (
                    <div className="num text-xs text-stone-500 pt-1">
                      Notação: <span className="font-bold text-stone-900">{handNotation(card1, card2, handType)}</span>
                      <span className="mx-2">·</span>
                      Range: <span className="font-bold text-stone-900">{getHandRange(card1, card2, handType)}</span>
                    </div>
                  )}
                </div>
              </Section>
            </div>

            {handType && (
              <div ref={el => { sectionRefs.current['preflop'] = el; }} className="scroll-mt-20">
                <Section title="Ação pré-flop" step="04">
                  <div className="grid grid-cols-2 gap-1">
                    {([
                      ['fold', 'Fold'], ['fold_to_raise', 'Fold ao Raise'],
                      ['fold_to_allin', 'Fold p/ All-in'], ['limp', 'Limp'],
                      ['limp_fold', 'Limp-Fold'],
                      ['open', 'Open'], ['call_open', 'Call Open'],
                      ['3bet', '3-Bet'], ['call_3bet', 'Call 3-Bet'],
                      ['4bet_plus', '4-Bet+'],
                      ['fold_to_3bet', 'Fold ao 3-Bet'], ['fold_to_4bet_plus', 'Fold ao 4-Bet+'],
                    ] as [PreFlopAction, string][]).map(([action, label]) => (
                      <button key={action} onClick={() => handlePreFlopAction(action)}
                        className={`mono h-11 text-xs font-bold uppercase tracking-wider border transition-colors ${
                          preFlopAction === action
                            ? 'bg-stone-900 text-stone-50 border-stone-900'
                            : 'bg-stone-50 border-stone-300 hover:border-stone-900'
                        }`}>{label}</button>
                    ))}
                  </div>
                  <p className="mono text-[10px] text-stone-500 mt-3 tracking-wider uppercase">Folds salvam automaticamente · Abriu e levou shove? Marque Fold ao 3-Bet</p>
                </Section>
              </div>
            )}

            {preFlopAction && !isFoldPreFlop && (
              <div ref={el => { sectionRefs.current['flop'] = el; }} className="scroll-mt-20">
                <Section title="Ação no flop" step="05" optional>
                  <div className="grid grid-cols-2 gap-1">
                    {([
                      ['none', 'Não vi o flop'],
                      ['cbet', 'C-Bet'],
                      ['no_cbet', 'Check (sem C-Bet)'],
                      ['call_cbet', 'Call C-Bet'],
                      ['fold_to_cbet', 'Fold ao C-Bet'],
                    ] as [FlopAction, string][]).map(([action, label]) => (
                      <button key={action} onClick={() => handleFlopAction(action)}
                        className={`mono h-11 text-xs font-bold uppercase tracking-wider border transition-colors ${
                          flopAction === action
                            ? 'bg-stone-900 text-stone-50 border-stone-900'
                            : 'bg-stone-50 border-stone-300 hover:border-stone-900'
                        }`}>{label}</button>
                    ))}
                  </div>
                  <p className="mono text-[10px] text-stone-500 mt-3 tracking-wider uppercase">Fold ao C-Bet salva automaticamente</p>
                </Section>
              </div>
            )}

            {preFlopAction && !isFoldPreFlop && (
              <Section title="Notas" step="06" optional>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Contexto, leitura do vilão, observação..."
                  rows={3}
                  className="w-full mono text-xs p-3 bg-stone-50 border border-stone-300 focus:border-stone-900 outline-none resize-y placeholder:text-stone-400"
                />
              </Section>
            )}

            {preFlopAction && !isFoldPreFlop && (
              <div ref={el => { sectionRefs.current['result'] = el; }} className="scroll-mt-20">
                <Section title="Resultado" step="07">
                  <div className="grid grid-cols-2 gap-1">
                    <ResultBtn label="SD Win" variant="sd-win" selected={result === 'sd_win'} onClick={() => handleResult('sd_win')} />
                    <ResultBtn label="SD Loss" variant="sd-loss" selected={result === 'sd_loss'} onClick={() => handleResult('sd_loss')} />
                    <ResultBtn label="NS Win" variant="ns-win" selected={result === 'ns_win'} onClick={() => handleResult('ns_win')} />
                    <ResultBtn label="NS Loss" variant="ns-loss" selected={result === 'ns_loss'} onClick={() => handleResult('ns_loss')} />
                  </div>
                  <p className="mono text-[10px] text-stone-500 mt-3 tracking-wider uppercase">SD = foi a showdown · NS = ganhou/perdeu sem mostrar</p>
                </Section>
              </div>
            )}
          </div>
        )}

        {tab === 'stats' && <StatsView stats={stats} hands={session.hands} playerCount={session.playerCount} />}
        {tab === 'history' && (
          <HistoryView hands={session.hands} existingCount={session.hands.length} playerCount={session.playerCount}
            onDelete={deleteHand} onImport={importHands} onToast={showToast}
            onUpdateNote={updateHandNote} />
        )}
      </main>

      {tab === 'logger' && card1 !== null && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-stone-50 border-t-2 border-stone-900">
          <div className="max-w-2xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
            <button onClick={resetForm}
              className="px-4 py-2 border border-stone-300 mono text-xs font-bold uppercase tracking-wider hover:bg-stone-100">Limpar</button>
            {card1 && card2 && handType && !preFlopAction ? (
              // Quick-fold shortcut for the hot path (cards -> fold): same as
              // the Fold button in step 04. Hidden once a preflop action is
              // chosen, so it can't retroactively rewrite a played hand.
              <button onClick={() => handlePreFlopAction('fold')}
                className="flex-1 py-2.5 bg-stone-900 text-stone-50 mono text-xs font-bold uppercase tracking-wider hover:bg-stone-800">Fold</button>
            ) : (
              <span className="mono text-[10px] font-bold uppercase tracking-wider text-stone-400 text-right">Resultado salva automaticamente</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, step, optional, children }: { title: string; step: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-3">
        <span className="num text-xs font-bold text-stone-400">{step}</span>
        <h2 className="text-sm font-bold tracking-tight">{title}</h2>
        {optional && <span className="mono text-[10px] uppercase tracking-wider text-stone-400">opcional</span>}
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">{children}</p>;
}

function CardGrid({ label, rank, selected, onSelect }: { label: string; rank: CardRank[]; selected: CardRank | null; onSelect: (c: CardRank) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="grid grid-cols-7 gap-1">
        {rank.map(r => (
          <button key={r} onClick={() => onSelect(r)}
            className={`num h-10 text-base font-bold border transition-colors ${
              selected === r ? 'bg-stone-900 text-stone-50 border-stone-900' : 'bg-white border-stone-300 hover:border-stone-900'
            }`}>{r}</button>
        ))}
      </div>
    </div>
  );
}

function ResultBtn({ label, variant, selected, onClick }: { label: string; variant: 'sd-win' | 'sd-loss' | 'ns-win' | 'ns-loss'; selected: boolean; onClick: () => void }) {
  const palette: Record<string, { bg: string; text: string; border: string; selBorder: string }> = {
    'sd-win':  { bg: 'bg-emerald-500',  text: 'text-white',       border: 'border-emerald-500', selBorder: 'border-emerald-900' },
    'sd-loss': { bg: 'bg-rose-500',     text: 'text-white',       border: 'border-rose-500',    selBorder: 'border-rose-900' },
    'ns-win':  { bg: 'bg-emerald-100',  text: 'text-emerald-900', border: 'border-emerald-300', selBorder: 'border-emerald-700' },
    'ns-loss': { bg: 'bg-rose-100',     text: 'text-rose-900',    border: 'border-rose-300',    selBorder: 'border-rose-700' },
  };
  const p = palette[variant];
  return (
    <button onClick={onClick}
      className={`mono h-12 text-xs font-bold uppercase tracking-wider border-2 transition-all ${p.bg} ${p.text} ${
        selected ? `${p.selBorder} ring-2 ring-offset-1 ring-stone-900` : p.border
      }`}>{label}</button>
  );
}

// ============================================================
// POSITION ROW HELPER (shared by PositionWinRate + VpipByPosition)
// ============================================================
// C2: rows are the current table's positions (UTG first, BB last, matching
// live seating order) instead of a hardcoded 9-max list that silently
// dropped MP. Any position present in the data but absent from the current
// layout (e.g. MP hands viewed while at a 9-max table) is appended at the end
// so historical hands never become invisible when the table size changes.
function getPositionRows(playerCount: number, dataKeys: string[]): PokerPosition[] {
  const layout = [...getPositions(playerCount)].reverse();
  const extra = dataKeys.filter(k => !layout.includes(k as PokerPosition)) as PokerPosition[];
  return [...layout, ...extra];
}

// ============================================================
// POSITION WIN RATE HELPER
// ============================================================
function PositionWinRate({ byPos, playerCount }: { byPos: Record<string, { hands: number; wins: number }>; playerCount: number }) {
  const rows = getPositionRows(playerCount, Object.keys(byPos));

  return (
    <div className="border border-stone-300">
      {rows.map((pos, idx) => {
        const d = byPos[pos] || { hands: 0, wins: 0 };
        const winRate = d.hands > 0 ? ((d.wins / d.hands) * 100).toFixed(0) : '0';
        return (
          <div key={pos} className={`flex items-center ${idx !== rows.length - 1 ? 'border-b border-stone-200' : ''} px-3 py-2`}>
            <span className="mono text-xs font-bold w-12">{pos}</span>
            <span className="num text-xs text-stone-500 w-12">{d.hands}m</span>
            <div className="flex-1 h-1.5 bg-stone-100 mx-3"><div className="h-full bg-stone-900" style={{ width: `${d.hands > 0 ? (d.wins / d.hands) * 100 : 0}%` }} /></div>
            <span className="num text-xs font-bold w-12 text-right">{winRate}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// VPIP BY POSITION HELPER
// ============================================================
function VpipByPosition({ byPosVpip, playerCount }: { byPosVpip: Record<string, { total: number; voluntary: number }>; playerCount: number }) {
  const rows = getPositionRows(playerCount, Object.keys(byPosVpip));

  return (
    <div className="border border-stone-300">
      {rows.map((pos, idx) => {
        const d = byPosVpip[pos] || { total: 0, voluntary: 0 };
        const vpip = d.total > 0 ? ((d.voluntary / d.total) * 100).toFixed(1) : '0.0';
        return (
          <div key={pos} className={`flex items-center ${idx !== rows.length - 1 ? 'border-b border-stone-200' : ''} px-3 py-2`}>
            <span className="mono text-xs font-bold w-12">{pos}</span>
            <span className="num text-xs text-stone-500 w-12">{d.total}m</span>
            <div className="flex-1 h-1.5 bg-stone-100 mx-3"><div className="h-full bg-stone-900" style={{ width: `${d.total > 0 ? (d.voluntary / d.total) * 100 : 0}%` }} /></div>
            <span className="num text-xs font-bold w-12 text-right">{vpip}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// RANGE DISTRIBUTION HELPER
// ============================================================
function RangeDistribution({ byRange, total, hands }: { byRange: Record<string, number>; total: number; hands: Hand[] }) {
  const rangeGroups: { label: string; ranges: HandRange[] }[] = [
    { label: 'Top 3%', ranges: ['3%'] },
    { label: 'Top 5%', ranges: ['5%'] },
    { label: 'Top 8%', ranges: ['8%'] },
    { label: 'Top 10%', ranges: ['10%'] },
    { label: 'Top 12-15%', ranges: ['12-15%'] },
    { label: 'Top 18-20%', ranges: ['18-20%'] },
    { label: 'Top 25%', ranges: ['25%'] },
    { label: 'Top 40%', ranges: ['30-35%', '40-45%'] },
    { label: 'Top 60%', ranges: ['50%'] },
    { label: 'Acima 60%', ranges: ['60-70%'] },
  ];

  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      {rangeGroups.map(group => {
        const count = group.ranges.reduce((sum, r) => sum + (byRange[r] || 0), 0);
        const combos = group.ranges.reduce((sum, r) => sum + (BUCKET_WEIGHTS[r] || 0), 0);
        const expected = total * combos / TOTAL_COMBOS;
        const pct = ((count / total) * 100).toFixed(0);
        const isOpen = expanded === group.label;
        const isClickable = count > 0;
        const groupHands = isOpen
          ? hands.filter(h => group.ranges.includes(getHandRange(h.card1, h.card2, h.handType)))
          : [];
        return (
          <div key={group.label}>
            <button
              type="button"
              onClick={() => isClickable && setExpanded(isOpen ? null : group.label)}
              disabled={!isClickable}
              className={`w-full flex items-center border px-2 py-3 transition-colors ${
                isOpen ? 'border-stone-900 bg-stone-50' : 'border-stone-300'
              } ${isClickable ? 'hover:border-stone-900 cursor-pointer' : 'cursor-default'}`}
            >
              <span className="mono text-[10px] text-stone-400 w-3">{isClickable ? (isOpen ? '−' : '+') : ''}</span>
              <span className="mono text-[11px] font-bold w-20 text-left">{group.label}</span>
              <span className={`num text-[11px] w-8 text-left ${count > 0 ? 'text-stone-500' : 'text-stone-300'}`}>{count}</span>
              <span className="num text-[11px] text-stone-400 w-12 text-left">exp: {formatExpected(expected)}</span>
              <div className="flex-1 h-1 bg-stone-100 mx-2"><div className="h-full bg-stone-900" style={{ width: `${(count / total) * 100}%` }} /></div>
              <span className={`num text-[11px] font-bold w-10 text-right ${count > 0 ? '' : 'text-stone-300'}`}>{pct}%</span>
            </button>
            {isOpen && groupHands.length > 0 && (
              <div className="border border-t-0 border-stone-900 bg-white divide-y divide-stone-100">
                {groupHands.map(h => {
                  const isWin = h.result === 'sd_win' || h.result === 'ns_win';
                  const isFold = isFoldPreflop(h.preFlopAction);
                  const resultColor = isFold ? 'text-stone-400' : isWin ? 'text-emerald-700' : 'text-rose-700';
                  return (
                    <div key={h.id} className="flex items-center gap-2 px-2 py-1.5">
                      <span className="num text-[11px] font-bold w-12">{handNotation(h.card1, h.card2, h.handType)}</span>
                      <span className="mono text-[9px] font-bold uppercase tracking-wider text-stone-500 w-10">{h.position}</span>
                      <span className="mono text-[9px] uppercase tracking-wider text-stone-700 flex-1 truncate">
                        {ACTION_LABEL[h.preFlopAction]}
                        {h.flopAction !== 'none' && <> · {ACTION_LABEL[h.flopAction]}</>}
                      </span>
                      <span className={`mono text-[9px] font-bold uppercase tracking-wider ${resultColor}`}>
                        {isFold ? 'FOLD' : h.result.replace('_', ' ').toUpperCase()}
                      </span>
                      {h.notes && <StickyNote className="w-3 h-3 text-stone-700" fill="currentColor" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// STATS VIEW
// ============================================================
function StatsView({ stats, hands, playerCount }: { stats: ReturnType<typeof calculateStats>; hands: Hand[]; playerCount: number }) {
  const [stackScope, setStackScope] = useState<'all' | 'ss' | 'nonss'>('all');
  const [scope, setScope] = useState<'all' | 'last10' | 'last20'>('all');

  // H7: stack-mode filter is applied first, then the recency slice runs on
  // top of it, so "Últ. 10/20" means the last N hands matching the stack filter.
  const stackFilteredHands = useMemo(() => {
    if (stackScope === 'ss') return hands.filter(h => h.smallStackMode);
    if (stackScope === 'nonss') return hands.filter(h => !h.smallStackMode);
    return hands;
  }, [stackScope, hands]);
  const scopedHands = useMemo(() => {
    if (scope === 'last10') return stackFilteredHands.slice(0, 10);
    if (scope === 'last20') return stackFilteredHands.slice(0, 20);
    return stackFilteredHands;
  }, [scope, stackFilteredHands]);
  const scoped = useMemo(() => {
    if (scope === 'all' && stackScope === 'all') return stats;
    return calculateStats(scopedHands);
  }, [scope, stackScope, scopedHands, stats]);

  if (hands.length === 0) {
    return <div className="text-center py-20 mono text-xs uppercase tracking-widest text-stone-400">Nenhuma mão registrada</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">Stack</h3>
        <div className="grid grid-cols-3 gap-1">
          {([['all', 'Tudo'], ['ss', 'Só SS'], ['nonss', 'Sem SS']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setStackScope(k)}
              className={`mono h-9 text-[10px] font-bold uppercase tracking-widest border transition-colors ${
                stackScope === k ? 'bg-stone-900 text-stone-50 border-stone-900' : 'bg-stone-50 border-stone-300 hover:border-stone-900'
              }`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {([['all', 'Tudo'], ['last20', 'Últ. 20'], ['last10', 'Últ. 10']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setScope(k)}
            className={`mono h-9 text-[10px] font-bold uppercase tracking-widest border transition-colors ${
              scope === k ? 'bg-stone-900 text-stone-50 border-stone-900' : 'bg-stone-50 border-stone-300 hover:border-stone-900'
            }`}>{l}</button>
        ))}
      </div>

      {scopedHands.length === 0 ? (
        <div className="text-center py-20 mono text-xs uppercase tracking-widest text-stone-400">Nenhuma mão no filtro</div>
      ) : (
        <>
          <Stat label="Total / Voluntárias" value={`${scoped.total} / ${scoped.voluntary}`} hint="mãos jogadas" />

          <div>
            <h3 className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-3">Pré-Flop</h3>
            <div className="grid grid-cols-2 gap-px bg-stone-300 border border-stone-300">
              <Metric label="VPIP" value={scoped.vpip} />
              <Metric label="PFR" value={scoped.pfr} />
              <Metric label="3-Bet" value={scoped.threeBet} />
              <Metric label="Fold 3B" value={scoped.foldTo3Bet} />
              <Metric label="ATS" value={scoped.ats} />
              <Metric label="Fold PF" value={scoped.foldPf} />
            </div>
          </div>

          <div>
            <h3 className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-3">Pós-Flop</h3>
            <div className="grid grid-cols-2 gap-px bg-stone-300 border border-stone-300">
              <Metric label="C-Bet" value={scoped.cBet} />
              <Metric label="Fold vs C-Bet" value={scoped.foldVsCbet} />
              <Metric label="WTSD" value={scoped.wtsd} />
              <Metric label="W$SD" value={scoped.wsd} />
              <Metric label="Viu Flop" value={scoped.flopSeen} />
              <Metric label="Win Rate" value={scoped.winRate} accent />
            </div>
          </div>

          <div>
            <h3 className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-3">Distribuição de Ranges</h3>
            <RangeDistribution byRange={scoped.byRange} total={scoped.total} hands={scopedHands} />
          </div>

          <div>
            <h3 className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-3">Resultados</h3>
            <ResultBars results={scoped.results} total={scoped.total} foldPf={scoped.foldPf} />
          </div>

          <div>
            <h3 className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-3">VPIP por Posição</h3>
            <VpipByPosition byPosVpip={scoped.byPosVpip} playerCount={playerCount} />
          </div>

          <div>
            <h3 className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-3">Win Rate por Posição</h3>
            <PositionWinRate byPos={scoped.byPos} playerCount={playerCount} />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="border-b border-stone-300 pb-3">
      <div className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500">{label}</div>
      <div className="num text-2xl font-bold">{value}</div>
      {hint && <div className="mono text-[10px] uppercase tracking-wider text-stone-400 mt-1">{hint}</div>}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`p-4 ${accent ? 'bg-stone-900 text-stone-50' : 'bg-stone-50'}`}>
      <div className={`mono text-[10px] font-bold uppercase tracking-widest ${accent ? 'text-stone-400' : 'text-stone-500'}`}>{label}</div>
      <div className="num text-2xl font-bold mt-1">{value.toFixed(1)}<span className="text-base">%</span></div>
    </div>
  );
}

function ResultBars({ results, total, foldPf }: { results: { sdWin: number; sdLoss: number; nsWin: number; nsLoss: number }; total: number; foldPf?: number }) {
  const foldPfCount = foldPf ? Math.round((foldPf / 100) * total) : 0;
  const nsLossAdjusted = results.nsLoss - foldPfCount;
  const items = [
    { label: 'SD Win', val: results.sdWin, color: 'bg-emerald-500' },
    { label: 'NS Win', val: results.nsWin, color: 'bg-emerald-200' },
    { label: 'NS Loss', val: nsLossAdjusted, color: 'bg-rose-200' },
    { label: 'SD Loss', val: results.sdLoss, color: 'bg-rose-500' },
  ];
  const allItems = [...items, { label: 'Fold PF', val: foldPfCount, color: 'bg-stone-400' }];
  return (
    <div className="flex gap-1">
      {allItems.map(item => (
          <div key={item.label} className="flex-1">
            <div className={`h-6 ${item.color}`} style={{ width: '100%' }} />
            <div className="mono text-[9px] font-bold text-center mt-1">{item.label}</div>
            <div className="num text-[10px] font-bold text-center">{item.val}</div>
          </div>
        ))}
    </div>
  );
}

// ============================================================
// HISTORY + IMPORT
// ============================================================
function HistoryView({ hands, existingCount, playerCount, onDelete, onImport, onToast, onUpdateNote }: {
  hands: Hand[]; existingCount: number; playerCount: number;
  onDelete: (id: string) => void;
  onImport: (hands: Omit<Hand, 'id' | 'timestamp'>[], mode: 'replace' | 'append') => void;
  onToast: (msg: string) => void;
  onUpdateNote: (id: string, notes: string) => void;
}) {
  const [showImport, setShowImport] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [editingNote, setEditingNote] = useState<Hand | null>(null);

  const exportText = async () => {
    if (hands.length === 0) return;
    const txt = buildExportText(hands, playerCount);
    try {
      await navigator.clipboard.writeText(txt);
      setExportState('copied');
      onToast(`${hands.length} mãos copiadas`);
      setTimeout(() => setExportState('idle'), 1800);
    } catch {
      setExportState('error');
      onToast('Erro ao copiar');
      setTimeout(() => setExportState('idle'), 1800);
    }
  };

  const importLabel = showImport ? 'Fechar' : 'Importar';
  const exportLabel = exportState === 'copied' ? '✓ Copiado' : exportState === 'error' ? '✗ Erro' : 'Exportar';
  const exportClasses = exportState === 'copied' ? 'bg-emerald-600 text-white border-emerald-600'
    : exportState === 'error' ? 'bg-rose-600 text-white border-rose-600'
    : 'border-stone-900 hover:bg-stone-900 hover:text-stone-50';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1">
        <button onClick={() => setShowImport(s => !s)}
          className={`py-3 mono text-xs font-bold uppercase tracking-wider border transition-colors ${
            showImport ? 'bg-stone-900 text-stone-50 border-stone-900' : 'border-stone-900 hover:bg-stone-900 hover:text-stone-50'
          }`}>{importLabel}</button>
        <button onClick={exportText} disabled={hands.length === 0}
          className={`py-3 border mono text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-stone-900 ${exportClasses}`}>
          {exportLabel}
        </button>
      </div>

      {showImport && (
        <div className="border border-stone-300 bg-white p-4">
          <ImportView existingCount={existingCount} playerCount={playerCount}
            onImport={(parsedHands, mode) => { onImport(parsedHands, mode); setShowImport(false); }} />
        </div>
      )}

      {hands.length === 0 ? (
        <div className="text-center py-20 mono text-xs uppercase tracking-widest text-stone-400">Nenhuma mão registrada</div>
      ) : (
        <div className="space-y-px">
          {hands.map((h, i) => {
            const num = hands.length - i;
            const notation = handNotation(h.card1, h.card2, h.handType);
            const isWin = h.result === 'sd_win' || h.result === 'ns_win';
            const isFold = isFoldPreflop(h.preFlopAction);
            const accent = isFold ? 'border-l-stone-300' : isWin ? 'border-l-emerald-500' : 'border-l-rose-500';
            return (
              <div key={h.id} className={`bg-stone-50 border border-stone-200 border-l-4 ${accent} p-3 flex items-center gap-3`}>
                <span className="num text-[10px] font-bold text-stone-400 w-8">#{num}</span>
                <span className="num text-base font-bold w-14">{notation}</span>
                <span className="mono text-[10px] text-stone-400">{getHandRange(h.card1, h.card2, h.handType)}</span>
                {h.smallStackMode && <span className="mono text-[10px] font-bold text-stone-400 bg-stone-200 px-2 py-0.5 rounded">SS</span>}
                <span className="mono text-[10px] font-bold uppercase tracking-wider text-stone-500 w-10">{h.position}</span>
                <span className="mono text-[10px] uppercase tracking-wider text-stone-700 flex-1 truncate">
                  {ACTION_LABEL[h.preFlopAction]}
                  {h.flopAction !== 'none' && <> · {ACTION_LABEL[h.flopAction]}</>}
                </span>
                <span className={`mono text-[10px] font-bold uppercase tracking-wider ${
                  isFold ? 'text-stone-400' : isWin ? 'text-emerald-700' : 'text-rose-700'
                }`}>{isFold ? 'FOLD' : h.result.replace('_', ' ').toUpperCase()}</span>
                <button onClick={() => setEditingNote(h)}
                  className={`transition-colors ${h.notes ? 'text-stone-700 hover:text-stone-900' : 'text-stone-300 hover:text-stone-600'}`}
                  title={h.notes ? 'Editar nota' : 'Adicionar nota'}>
                  <StickyNote className="w-3.5 h-3.5" fill={h.notes ? 'currentColor' : 'none'} />
                </button>
                <button onClick={() => onDelete(h.id)} className="text-stone-400 hover:text-rose-600 transition-colors" title="Apagar">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {editingNote && (
        <NoteModal hand={editingNote}
          onSave={(text) => { onUpdateNote(editingNote.id, text); setEditingNote(null); }}
          onClose={() => setEditingNote(null)} />
      )}
    </div>
  );
}

function NoteModal({ hand, onSave, onClose }: {
  hand: Hand;
  onSave: (notes: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(hand.notes || '');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const notation = handNotation(hand.card1, hand.card2, hand.handType);
  const summary = `${notation} · ${hand.position} · ${ACTION_LABEL[hand.preFlopAction]}${hand.flopAction !== 'none' ? ` · ${ACTION_LABEL[hand.flopAction]}` : ''}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border-2 border-stone-900 w-full max-w-md p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500">Nota da mão</h3>
          <p className="num text-sm font-bold mt-1">{summary}</p>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Contexto, leitura do vilão, observação..."
          rows={6}
          className="w-full mono text-xs p-3 bg-stone-50 border border-stone-300 focus:border-stone-900 outline-none resize-y placeholder:text-stone-400"
        />
        <div className="grid grid-cols-2 gap-1">
          <button onClick={onClose}
            className="py-2.5 mono text-xs font-bold uppercase tracking-wider border border-stone-300 hover:border-stone-900 transition-colors">
            Cancelar
          </button>
          <button onClick={() => onSave(text)}
            className="py-2.5 mono text-xs font-bold uppercase tracking-wider bg-stone-900 text-stone-50 border border-stone-900 hover:bg-stone-800 transition-colors">
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportView({ existingCount, playerCount, onImport }: { existingCount: number; playerCount: number; onImport: (hands: Omit<Hand, 'id' | 'timestamp'>[], mode: 'replace' | 'append') => void }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleParse = () => setPreview(parseImport(text, playerCount));
  const handleConfirm = (mode: 'replace' | 'append') => {
    if (!preview || preview.hands.length === 0) return;
    onImport(preview.hands, mode);
    setText(''); setPreview(null); setConfirming(false);
  };

  const sampleText = `# Cole o texto abaixo (ou seu próprio formato livre):
AKs CO open cbet ns_win
QQ BTN 3bet cbet sd_win
72o UTG fold
JTs BB call_open no_cbet ns_loss
AA HJ open cbet sd_win`;

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-600 leading-relaxed">
        Cole texto exportado pelo app ou no formato livre. Uma mão por linha. Ordem dos elementos não importa.
      </p>

      <div>
        <label className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2 block">Texto</label>
        <textarea value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }}
          placeholder={sampleText} spellCheck={false}
          className="num w-full h-48 p-3 border border-stone-300 bg-stone-50 text-xs leading-relaxed resize-y focus:outline-none focus:border-stone-900" />
      </div>

      <div className="grid grid-cols-2 gap-1">
        <button onClick={() => { setText(''); setPreview(null); }} disabled={!text}
          className="py-3 border border-stone-300 mono text-xs font-bold uppercase tracking-wider hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent">Limpar</button>
        <button onClick={handleParse} disabled={!text.trim()}
          className="py-3 bg-stone-900 text-stone-50 mono text-xs font-bold uppercase tracking-wider hover:bg-stone-800 disabled:opacity-30 disabled:hover:bg-stone-900">Analisar texto</button>
      </div>

      {preview && (
        <div className="space-y-4 border-t border-stone-300 pt-6">
          <div className="grid grid-cols-2 gap-px bg-stone-300 border border-stone-300">
            <div className="bg-stone-50 p-4">
              <div className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500">Válidas</div>
              <div className="num text-2xl font-bold text-emerald-700">{preview.hands.length}</div>
            </div>
            <div className="bg-stone-50 p-4">
              <div className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500">Puladas</div>
              <div className={`num text-2xl font-bold ${preview.errors.length > 0 ? 'text-rose-700' : 'text-stone-400'}`}>{preview.errors.length}</div>
            </div>
          </div>

          {preview.hands.length > 0 && (
            <div>
              <h3 className="mono text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">Preview (primeiras 5)</h3>
              <div className="space-y-px">
                {preview.hands.slice(0, 5).map((h, i) => {
                  const notation = handNotation(h.card1, h.card2, h.handType);
                  const isWin = h.result === 'sd_win' || h.result === 'ns_win';
                  const isFold = isFoldPreflop(h.preFlopAction);
                  const accent = isFold ? 'border-l-stone-300' : isWin ? 'border-l-emerald-500' : 'border-l-rose-500';
                  return (
                    <div key={i} className={`bg-stone-50 border border-stone-200 border-l-4 ${accent} p-2 flex items-center gap-3`}>
                      <span className="num text-base font-bold w-14">{notation}</span>
                      <span className="mono text-[10px] font-bold uppercase tracking-wider text-stone-500 w-10">{h.position}</span>
                      <span className="mono text-[10px] uppercase tracking-wider text-stone-700 flex-1 truncate">
                        {ACTION_LABEL[h.preFlopAction]}
                        {h.flopAction !== 'none' && <> · {ACTION_LABEL[h.flopAction]}</>}
                      </span>
                      <span className={`mono text-[10px] font-bold uppercase tracking-wider ${
                        isFold ? 'text-stone-400' : isWin ? 'text-emerald-700' : 'text-rose-700'
                      }`}>{isFold ? 'FOLD' : h.result.replace('_', ' ').toUpperCase()}</span>
                    </div>
                  );
                })}
                {preview.hands.length > 5 && (
                  <div className="mono text-[10px] uppercase tracking-wider text-stone-400 text-center py-2">+ {preview.hands.length - 5} mãos</div>
                )}
              </div>
            </div>
          )}

          {preview.errors.length > 0 && (
            <div>
              <h3 className="mono text-[10px] font-bold uppercase tracking-widest text-rose-700 mb-2">Linhas puladas</h3>
              <div className="space-y-1">
                {preview.errors.slice(0, 10).map((err, i) => (
                  <div key={i} className="bg-rose-50 border border-rose-200 px-3 py-2 text-xs">
                    <span className="mono text-[10px] font-bold text-rose-700 mr-2">L{err.line}</span>
                    <span className="num text-stone-700">{err.text}</span>
                    <div className="mono text-[10px] uppercase tracking-wider text-rose-600 mt-0.5">{err.reason}</div>
                  </div>
                ))}
                {preview.errors.length > 10 && (
                  <div className="mono text-[10px] uppercase tracking-wider text-stone-400 text-center py-2">+ {preview.errors.length - 10} linhas</div>
                )}
              </div>
            </div>
          )}

          {preview.hands.length > 0 && (
            <button onClick={() => setConfirming(true)}
              className="w-full py-3 bg-emerald-600 text-white mono text-xs font-bold uppercase tracking-wider hover:bg-emerald-700">
              Importar {preview.hands.length} mão{preview.hands.length > 1 ? 's' : ''} →
            </button>
          )}
        </div>
      )}

      {confirming && preview && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 flex items-center justify-center p-4" onClick={() => setConfirming(false)}>
          <div className="bg-stone-50 border border-stone-900 max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mono text-xs font-bold tracking-wider uppercase mb-3">Como importar?</h3>
            <p className="text-sm text-stone-700 mb-5 leading-relaxed">
              Você tem <span className="num font-bold">{existingCount}</span> mão{existingCount !== 1 ? 's' : ''} na sessão atual e vai importar <span className="num font-bold">{preview.hands.length}</span>.
            </p>
            <div className="space-y-2">
              <button onClick={() => handleConfirm('append')} disabled={existingCount === 0}
                className="w-full py-3 bg-stone-900 text-stone-50 mono text-xs font-bold uppercase tracking-wider hover:bg-stone-800 disabled:opacity-30 disabled:hover:bg-stone-900">Adicionar à sessão atual</button>
              <button onClick={() => handleConfirm('replace')}
                className="w-full py-3 border border-stone-900 mono text-xs font-bold uppercase tracking-wider hover:bg-stone-100">Substituir tudo</button>
              <button onClick={() => setConfirming(false)}
                className="w-full py-3 mono text-xs font-bold uppercase tracking-wider text-stone-500 hover:text-stone-900">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
