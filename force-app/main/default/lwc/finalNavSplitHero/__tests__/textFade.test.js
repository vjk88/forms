import { createElement } from 'lwc';
import FinalNavSplitHero from 'c/finalNavSplitHero';

/**
 * The header text fade in the Split brand pane (IMPL_PLAN_HEADER_FADE v6). The
 * viewer maps the switch (paneTextFade) and the eligibility it read from the
 * tokens (paneFadeEligible); the pane fits the wash to its words, the
 * progress text included (c/finalTextFade).
 */
const PAGES = [
    { id: 'p1', name: 'One', sections: [] },
    { id: 'p2', name: 'Two', sections: [] }
];

let observers = [];
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

function mount(options) {
    const el = createElement('c-final-nav-split-hero', {
        is: FinalNavSplitHero
    });
    el.pages = PAGES;
    el.currentPageIndex = 0;
    el.options = {
        paneTitle: 'Pane title',
        paneSubtitle: 'Pane subtitle',
        paneBrandName: 'Brand',
        paneHighlight: { text: 'Now open', variant: 'badge' },
        progressStyle: 'default',
        ...options
    };
    document.body.appendChild(el);
    return el;
}

const layer = (el) => el.shadowRoot.querySelector('.pane > .pane-fade');

describe('c-final-nav-split-hero: text fade', () => {
    beforeEach(() => {
        observers = [];
        global.ResizeObserver = FakeResizeObserver;
    });
    afterEach(() => {
        delete global.ResizeObserver;
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('no eligibility (old hosts, no plate): no wash', () => {
        expect(layer(mount({}))).toBeNull();
        expect(layer(mount({ paneTextFade: true }))).toBeNull();
    });

    it('On -> Off -> On', async () => {
        const el = mount({ paneFadeEligible: true });
        expect(layer(el)).not.toBeNull();
        expect(layer(el).getAttribute('aria-hidden')).toBe('true');
        el.options = { ...el.options, paneTextFade: false };
        await Promise.resolve();
        expect(layer(el)).toBeNull();
        el.options = { ...el.options, paneTextFade: true };
        await Promise.resolve();
        expect(layer(el)).not.toBeNull();
    });

    it('protects every pane text block, the progress text too', () => {
        mount({ paneFadeEligible: true });
        const watched = observers[observers.length - 1].targets.map(
            (t) => t.className || t.tagName
        );
        expect(watched[0]).toContain('pane');
        for (const cls of [
            'brand-wordmark',
            'pane-title',
            'pane-subtitle',
            'progress-text',
            'pane-hl'
        ]) {
            expect(watched).toContain(cls);
        }
    });

    it('a banner bar is left out (it paints its own fill)', () => {
        const el = mount({
            paneFadeEligible: true,
            paneHighlight: { text: 'Now open', variant: 'banner' }
        });
        expect(
            el.shadowRoot.querySelector('c-final-form-highlight').className
        ).toBe('pane-hl pane-hl--bar');
        const watched = observers[observers.length - 1].targets;
        expect(
            watched.some((t) => t.tagName === 'C-FINAL-FORM-HIGHLIGHT')
        ).toBe(false);
    });

    it('the pane no longer passes plate spacing to its text', () => {
        const style = mount({ paneFadeEligible: true })
            .shadowRoot.querySelector('aside')
            .getAttribute('style');
        expect(style).toContain('--hdr-plate:');
        expect(style).not.toMatch(/--hdr-plate-(pad|outset|fit)/);
    });
});
