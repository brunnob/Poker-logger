import { describe, it, expect } from 'vitest';
import { loadSession, serializeSession } from '../storage';
import { getPositions } from '../types';

const DEFAULT_SESSION = { hands: [], playerCount: 6, currentPositionIndex: 0 };

describe('loadSession', () => {
  it('returns the default session for corrupt JSON', () => {
    expect(loadSession('{not valid json')).toEqual(DEFAULT_SESSION);
  });

  it('returns the default session for null', () => {
    expect(loadSession(null)).toEqual(DEFAULT_SESSION);
  });

  it('returns the default session for an empty object', () => {
    expect(loadSession('{}')).toEqual(DEFAULT_SESSION);
  });

  it('returns the default session for a non-object JSON value', () => {
    expect(loadSession('42')).toEqual(DEFAULT_SESSION);
    expect(loadSession('"hello"')).toEqual(DEFAULT_SESSION);
    expect(loadSession('null')).toEqual(DEFAULT_SESSION);
  });

  describe('legacy blob handling', () => {
    const legacyBlob = {
      playerCount: 10, // out of 2..9 range -> must coerce to 6
      currentPositionIndex: 8, // out of bounds for 6-max -> must clamp
      hands: [
        {
          id: 'validhand01',
          timestamp: 1700000000000,
          position: 'CO',
          card1: 'A', card2: 'K', handType: 'suited',
          preFlopAction: 'open', flopAction: 'cbet', result: 'sd_win',
          playerCount: 6, smallStackMode: false,
          range: '5%', // legacy field removed from the Hand type - must be tolerated, not crash
        },
        {
          id: 'mphand02',
          timestamp: 1700000001000,
          position: 'MP', // C2: MP must be accepted as a valid position
          card1: 'Q', card2: 'Q', handType: 'pair',
          preFlopAction: 'call_open', flopAction: 'none', result: 'ns_loss',
          playerCount: 6, smallStackMode: false,
          // no fromImport field at all
        },
        {
          id: 'badaction03',
          timestamp: 1700000002000,
          position: 'BTN',
          card1: 'J', card2: 'T', handType: 'suited',
          preFlopAction: 'raise', // unknown/removed action string -> must be dropped
          flopAction: 'none', result: 'ns_win',
          playerCount: 6, smallStackMode: false,
        },
      ],
    };

    it('loads without crashing, coercing playerCount and clamping the index', () => {
      const session = loadSession(JSON.stringify(legacyBlob));
      expect(session.playerCount).toBe(6);
      expect(session.currentPositionIndex).toBe(getPositions(6).length - 1);
    });

    it('preserves structurally valid hands (including MP) and drops the unknown-action hand', () => {
      const session = loadSession(JSON.stringify(legacyBlob));
      expect(session.hands).toHaveLength(2);

      const ids = session.hands.map(h => h.id);
      expect(ids).toContain('validhand01');
      expect(ids).toContain('mphand02');
      expect(ids).not.toContain('badaction03');

      const mpHand = session.hands.find(h => h.id === 'mphand02');
      expect(mpHand?.position).toBe('MP');
      expect(mpHand?.fromImport).toBeUndefined();
    });

    it('strips legacy extra fields like range instead of crashing or passing them through', () => {
      const session = loadSession(JSON.stringify(legacyBlob));
      const hand = session.hands.find(h => h.id === 'validhand01') as (typeof session.hands)[number] & { range?: unknown };
      expect(hand).toBeDefined();
      expect(hand.range).toBeUndefined();
    });
  });

  it('fabricates an id and coerces a string timestamp to a number when missing/malformed', () => {
    const blob = {
      hands: [
        {
          // no id at all
          timestamp: '1700000000000', // numeric string -> must coerce
          position: 'BB',
          card1: '2', card2: '7', handType: 'offsuit',
          preFlopAction: 'fold', flopAction: 'none', result: 'ns_loss',
          playerCount: 6, smallStackMode: false,
        },
      ],
    };

    const session = loadSession(JSON.stringify(blob));
    expect(session.hands).toHaveLength(1);
    const [hand] = session.hands;
    expect(typeof hand.id).toBe('string');
    expect(hand.id.length).toBeGreaterThan(0);
    expect(hand.timestamp).toBe(1700000000000);
  });

  it('drops hands with invalid cards, handType, or result', () => {
    const blob = {
      hands: [
        { id: 'a', timestamp: 1, position: 'BB', card1: 'Z', card2: '7', handType: 'offsuit', preFlopAction: 'fold', flopAction: 'none', result: 'ns_loss', playerCount: 6, smallStackMode: false },
        { id: 'b', timestamp: 1, position: 'BB', card1: '2', card2: '7', handType: 'weird', preFlopAction: 'fold', flopAction: 'none', result: 'ns_loss', playerCount: 6, smallStackMode: false },
        { id: 'c', timestamp: 1, position: 'BB', card1: '2', card2: '7', handType: 'offsuit', preFlopAction: 'fold', flopAction: 'none', result: 'push', playerCount: 6, smallStackMode: false },
        { id: 'd', timestamp: 1, position: 'ZZ', card1: '2', card2: '7', handType: 'offsuit', preFlopAction: 'fold', flopAction: 'none', result: 'ns_loss', playerCount: 6, smallStackMode: false },
      ],
    };
    const session = loadSession(JSON.stringify(blob));
    expect(session.hands).toHaveLength(0);
  });

  it('never throws on a non-array hands field', () => {
    expect(() => loadSession(JSON.stringify({ hands: 'not-an-array', playerCount: 6, currentPositionIndex: 0 }))).not.toThrow();
    expect(loadSession(JSON.stringify({ hands: 'not-an-array' })).hands).toEqual([]);
  });
});

describe('serializeSession + loadSession round-trip', () => {
  it('is stable across repeated load/serialize cycles, starting from a messy legacy blob', () => {
    const legacyBlob = {
      playerCount: 10,
      currentPositionIndex: 8,
      hands: [
        {
          id: 'validhand01',
          timestamp: 1700000000000,
          position: 'CO',
          card1: 'A', card2: 'K', handType: 'suited',
          preFlopAction: 'open', flopAction: 'cbet', result: 'sd_win',
          playerCount: 6, smallStackMode: false,
          range: '5%',
        },
        {
          id: 'mphand02',
          timestamp: 1700000001000,
          position: 'MP',
          card1: 'Q', card2: 'Q', handType: 'pair',
          preFlopAction: 'call_open', flopAction: 'none', result: 'ns_loss',
          playerCount: 9, smallStackMode: true,
          notes: '  villain overbet river  ',
          fromImport: true,
        },
      ],
    };

    const first = loadSession(JSON.stringify(legacyBlob));
    const second = loadSession(serializeSession(first));
    expect(second).toEqual(first);

    const third = loadSession(serializeSession(second));
    expect(third).toEqual(second);
  });

  it('round-trips a freshly-created default session unchanged', () => {
    const first = loadSession(null);
    const second = loadSession(serializeSession(first));
    expect(second).toEqual(first);
  });
});

describe('AUD-2 - cross-field poker invariant on load', () => {
  it('coerces a fold-type hand carrying a flop action and showdown result back to none/ns_loss', () => {
    const blob = JSON.stringify({
      playerCount: 6,
      currentPositionIndex: 0,
      hands: [{
        id: 'x', timestamp: 1, position: 'UTG', card1: 'A', card2: 'K', handType: 'offsuit',
        preFlopAction: 'fold', flopAction: 'cbet', result: 'sd_win', playerCount: 6, smallStackMode: false,
      }],
    });
    const session = loadSession(blob);
    expect(session.hands).toHaveLength(1);
    expect(session.hands[0].flopAction).toBe('none');
    expect(session.hands[0].result).toBe('ns_loss');
  });
});
