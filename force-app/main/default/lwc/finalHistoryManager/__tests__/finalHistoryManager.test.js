import { createHistory } from 'c/finalHistoryManager';

describe('finalHistoryManager', () => {
    it('records, undoes, redoes; redo dies on a new edit', () => {
        const h = createHistory({ coalesceMs: 0 });
        h.reset('A');
        expect(h.canUndo).toBe(false);

        h.record('B', 1000);
        h.record('C', 3000);
        expect(h.canUndo).toBe(true);
        expect(h.undo()).toBe('B');
        expect(h.undo()).toBe('A');
        expect(h.undo()).toBeNull();
        expect(h.canRedo).toBe(true);
        expect(h.redo()).toBe('B');

        h.record('D', 9000); // a new edit kills the redo branch
        expect(h.canRedo).toBe(false);
        expect(h.undo()).toBe('B');
    });

    it('coalesces a typing burst into ONE undo step', () => {
        const h = createHistory({ coalesceMs: 800 });
        h.reset('start');
        h.record('t', 1000);
        h.record('ty', 1300);
        h.record('typ', 1600);
        h.record('typing', 1900);
        // one step back reaches the pre-burst state
        expect(h.undo()).toBe('start');
        expect(h.redo()).toBe('typing'); // the burst's final form survives
    });

    it('a pause starts a NEW step; identical snapshots are no-ops', () => {
        const h = createHistory({ coalesceMs: 800 });
        h.reset('a');
        h.record('b', 1000);
        h.record('c', 5000); // paused → separate step
        h.record('c', 5100); // identical → ignored
        expect(h.undo()).toBe('b');
        expect(h.undo()).toBe('a');
    });

    it('the limit drops the OLDEST step, never the present', () => {
        const h = createHistory({ limit: 2, coalesceMs: 0 });
        h.reset('s0');
        h.record('s1', 1000);
        h.record('s2', 2000);
        h.record('s3', 3000);
        expect(h.undo()).toBe('s2');
        expect(h.undo()).toBe('s1');
        expect(h.undo()).toBeNull(); // s0 fell off the cap
    });

    it('undo ends a burst — the next edit is its own step', () => {
        const h = createHistory({ coalesceMs: 800 });
        h.reset('a');
        h.record('b', 1000);
        h.undo();
        h.record('c', 1100); // within coalesceMs of the last record, but
        expect(h.undo()).toBe('a'); // it must NOT merge into thin air
    });
});
