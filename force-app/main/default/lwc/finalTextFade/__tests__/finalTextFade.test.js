import { solidSpan, watchTextFade, RAMP } from 'c/finalTextFade';

/**
 * finalTextFade (IMPL_PLAN_HEADER_FADE v6): the wash is solid from the first
 * word to the last, by the glyphs, and full until measured.
 */
const rect = (left, width, top = 0, height = 20) => ({
    left,
    right: left + width,
    top,
    bottom: top + height,
    width,
    height
});
const SURFACE = rect(100, 800, 0, 200);

/** A block whose words (one text node, in a <p> like rich text) have the
 *  glyph rects `rects`; the block's own box is `box`. */
function block(rects, box, text = true) {
    const el = document.createElement('div');
    const p = document.createElement('p');
    const words = document.createTextNode(rects.length ? 'words' : '');
    words._rects = rects;
    p.appendChild(words);
    el.appendChild(p);
    document.body.appendChild(el);
    el.getBoundingClientRect = () => box || rect(0, 0);
    return { el, text, words };
}

beforeEach(() => {
    document.createRange = () => {
        let node = null;
        return {
            selectNodeContents(n) {
                node = n;
            },
            getClientRects() {
                return (node && node._rects) || [];
            }
        };
    };
});
afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('solidSpan', () => {
    it('short left text: solid from the edge to just past the last word', () => {
        const title = block([rect(124, 150)], rect(124, 760));
        const desc = block([rect(124, 260)], rect(124, 760));
        // left 24px <= ramp: held to the edge; right 124+260-100 = 284 + 4
        expect(solidSpan(SURFACE, [title, desc])).toEqual({ from: 0, to: 288 });
    });

    it('measures the glyphs, not a block stretched to full width', () => {
        const wide = block([rect(124, 90)], rect(124, 760));
        expect(solidSpan(SURFACE, [wide]).to).toBe(118);
    });

    it('a paragraph box stretched across the block is not counted', () => {
        // only text nodes are measured, so the <p>'s full-width box never is
        const desc = block([rect(124, 120)], rect(124, 760));
        desc.el.firstChild.getClientRects = () => [rect(124, 760)];
        expect(solidSpan(SURFACE, [desc]).to).toBe(148);
    });

    it('multiline: the widest line wins', () => {
        const desc = block([rect(124, 300, 0), rect(124, 520, 22)]);
        expect(solidSpan(SURFACE, [desc]).to).toBe(548);
    });

    it('centered: solid between both edges of the text', () => {
        const title = block([rect(400, 200)]);
        expect(solidSpan(SURFACE, [title])).toEqual({ from: 296, to: 504 });
    });

    it('text reaching within the ramp of an edge holds to that edge', () => {
        const long = block([rect(124, 800 - 24 - RAMP + 10)]);
        expect(solidSpan(SURFACE, [long])).toEqual({ from: 0, to: 800 });
    });

    it('a box block (a badge) counts by its own box', () => {
        const badge = block([], rect(124, 60), false);
        expect(solidSpan(SURFACE, [badge])).toEqual({ from: 0, to: 88 });
    });

    it('a scaled surface (Studio preview) is measured in its own px', () => {
        // drawn at 0.5: an 800px surface shows 400px wide on screen
        const surface = rect(100, 400, 0, 100);
        const title = block([rect(400, 100)]);
        expect(solidSpan(surface, [title], 0.5)).toEqual({
            from: 596,
            to: 800
        });
    });

    it('hidden or empty blocks are skipped; nothing measurable = null', () => {
        const hidden = block([], rect(0, 0));
        expect(solidSpan(SURFACE, [hidden])).toBeNull();
        expect(solidSpan(SURFACE, [])).toBeNull();
        const shown = block([rect(124, 50)]);
        expect(solidSpan(SURFACE, [hidden, shown]).to).toBe(78);
    });
});

describe('watchTextFade', () => {
    let observers;
    class FakeResizeObserver {
        constructor(cb) {
            this.cb = cb;
            this.targets = [];
            observers.push(this);
        }
        observe(t) {
            this.targets.push(t);
        }
        disconnect() {
            this.targets = [];
        }
    }

    function setup(blocks) {
        const surface = document.createElement('div');
        surface.getBoundingClientRect = () => SURFACE;
        const wash = document.createElement('div');
        surface.appendChild(wash);
        document.body.appendChild(surface);
        const watch = watchTextFade({
            surface: () => surface,
            layer: () => wash,
            blocks: () => blocks
        });
        return { surface, wash, watch };
    }

    beforeEach(() => {
        observers = [];
        global.ResizeObserver = FakeResizeObserver;
    });
    afterEach(() => {
        delete global.ResizeObserver;
    });

    it('writes the measured edges and the ramp on the wash', () => {
        const title = block([rect(124, 150)]);
        const { wash, watch } = setup([title]);
        watch.measure();
        expect(wash.style.getPropertyValue('--fade-from')).toBe('0px');
        expect(wash.style.getPropertyValue('--fade-to')).toBe('178px');
        expect(wash.style.getPropertyValue('--fade-ramp')).toBe(`${RAMP}px`);
    });

    it('a late image load (a logo) re-measures', () => {
        const title = block([rect(124, 150)]);
        const { surface, wash, watch } = setup([title]);
        watch.measure();
        // the logo loads and pushes the title right; nothing watched resized
        title.words._rects = [rect(224, 150)];
        const img = document.createElement('img');
        surface.appendChild(img);
        img.dispatchEvent(new Event('load'));
        expect(wash.style.getPropertyValue('--fade-to')).toBe('278px');
        watch.disconnect();
        title.words._rects = [rect(324, 150)];
        img.dispatchEvent(new Event('load'));
        expect(wash.style.getPropertyValue('--fade-to')).toBe('278px');
    });

    it('a web font that lands later re-measures; disconnect stops it', () => {
        const listeners = {};
        const fonts = {
            ready: new Promise(() => {}),
            addEventListener: (type, fn) => {
                listeners[type] = fn;
            },
            removeEventListener: (type) => {
                delete listeners[type];
            }
        };
        Object.defineProperty(document, 'fonts', {
            configurable: true,
            value: fonts
        });
        const title = block([rect(124, 150)]);
        const { wash, watch } = setup([title]);
        watch.measure();
        title.words._rects = [rect(124, 250)];
        listeners.loadingdone();
        expect(wash.style.getPropertyValue('--fade-to')).toBe('278px');
        watch.disconnect();
        expect(listeners.loadingdone).toBeUndefined();
        delete document.fonts;
    });

    it('re-measures on resize (wrapping, fonts, content)', () => {
        const title = block([rect(124, 150)]);
        const { wash, watch } = setup([title]);
        watch.measure();
        title.words._rects = [rect(124, 300)];
        observers[0].cb([]);
        expect(wash.style.getPropertyValue('--fade-to')).toBe('328px');
    });

    it('nothing measurable: the full wash stays (no edges written)', () => {
        const { wash, watch } = setup([block([], rect(0, 0))]);
        watch.measure();
        expect(wash.style.getPropertyValue('--fade-from')).toBe('');
        expect(wash.style.getPropertyValue('--fade-to')).toBe('');
    });

    it('no ResizeObserver: never narrows, the full wash stays', () => {
        delete global.ResizeObserver;
        const { wash, watch } = setup([block([rect(124, 150)])]);
        watch.measure();
        expect(wash.style.getPropertyValue('--fade-to')).toBe('');
    });

    it('re-attaches when a watched block is replaced, and disconnects', () => {
        const a = block([rect(124, 150)]);
        const list = [a];
        const { watch } = setup(list);
        watch.measure();
        expect(observers).toHaveLength(1);
        watch.measure();
        expect(observers).toHaveLength(1);
        list[0] = block([rect(124, 90)]);
        watch.measure();
        expect(observers).toHaveLength(2);
        expect(observers[0].targets).toEqual([]);
        watch.disconnect();
        expect(observers[1].targets).toEqual([]);
    });
});
