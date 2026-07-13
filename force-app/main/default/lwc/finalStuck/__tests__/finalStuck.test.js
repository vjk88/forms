import { observeStuck } from 'c/finalStuck';

describe('c-final-stuck observeStuck', () => {
    afterEach(() => {
        delete global.IntersectionObserver;
    });

    function fakeIO() {
        const state = { callback: null, observed: null, disconnected: false };
        global.IntersectionObserver = class {
            constructor(cb) {
                state.callback = cb;
            }
            observe(el) {
                state.observed = el;
            }
            disconnect() {
                state.disconnected = true;
            }
        };
        return state;
    }

    function targetAt(top) {
        const el = document.createElement('div');
        el.getBoundingClientRect = () => ({ top });
        return el;
    }

    it('missing sentinel/target or no IO support → inert noop', () => {
        expect(typeof observeStuck(null, targetAt(0), () => {})).toBe(
            'function'
        );
        expect(
            typeof observeStuck(document.createElement('div'), null, () => {})
        ).toBe('function');
        // no global IO defined here
        expect(
            typeof observeStuck(
                document.createElement('div'),
                targetAt(0),
                () => {}
            )
        ).toBe('function');
    });

    it('pinned ONLY when the element stops following its sentinel (gap opens)', () => {
        const io = fakeIO();
        const sentinel = document.createElement('div');
        const seen = [];
        // strip held at 120 by sticky (nested scroll container top)
        observeStuck(sentinel, targetAt(120), (s) => seen.push(s));
        expect(io.observed).toBe(sentinel);

        // sentinel scrolled up past the strip → pinned
        io.callback([
            { isIntersecting: false, boundingClientRect: { top: 60 } }
        ]);
        // sentinel visible again → unpinned
        io.callback([
            { isIntersecting: true, boundingClientRect: { top: 140 } }
        ]);
        // sentinel below the fold, strip right behind it (initial load):
        // adjacent, gap < threshold → NOT pinned
        io.callback([
            { isIntersecting: false, boundingClientRect: { top: 119 } }
        ]);
        expect(seen).toEqual([true, false, false]);
    });

    it('returned disposer disconnects the observer', () => {
        const io = fakeIO();
        const stop = observeStuck(
            document.createElement('div'),
            targetAt(0),
            () => {}
        );
        stop();
        expect(io.disconnected).toBe(true);
    });
});
