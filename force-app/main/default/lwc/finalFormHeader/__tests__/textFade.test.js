import { createElement } from 'lwc';
import FinalFormHeader from 'c/finalFormHeader';

/**
 * The header text fade (IMPL_PLAN_HEADER_FADE v6). The viewer hands the header
 * `{ on, eligible, exposed }`; the header paints the wash only when eligible
 * and on, softens its edges when exposed, and fits the wash to its words
 * (c/finalTextFade). Jest checks the markup contract and the wiring; the
 * gradient itself is checked in a real browser.
 */
const ARRANGEMENTS = {
    stacked: 'arr-stacked',
    logoBeside: 'arr-logo-beside',
    textOnly: 'arr-text-only',
    inline: 'arr-inline',
    centered: 'arr-centered'
};

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

function mount(header, fade) {
    const el = createElement('c-final-form-header', { is: FinalFormHeader });
    el.header = {
        title: 'Title',
        description: 'Description',
        brandName: 'Brand',
        highlight: { text: 'New', variant: 'badge' },
        ...header
    };
    if (fade !== undefined) {
        el.fade = fade;
    }
    document.body.appendChild(el);
    return el;
}

const ON = { on: true, eligible: true, exposed: false };
const root = (el) => el.shadowRoot.querySelector('header.hdr');
const layer = (el) => el.shadowRoot.querySelector('.hdr-fade');

describe('c-final-form-header: text fade', () => {
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

    it('no fade context (old hosts) or no plate: no wash', () => {
        expect(layer(mount({}))).toBeNull();
        expect(
            layer(mount({}, { on: true, eligible: false, exposed: false }))
        ).toBeNull();
    });

    it('On -> Off -> On: the wash comes and goes, nothing else moves', async () => {
        const el = mount({}, ON);
        const cls = root(el).className;
        expect(layer(el)).not.toBeNull();
        expect(layer(el).getAttribute('aria-hidden')).toBe('true');

        el.fade = { ...ON, on: false };
        await Promise.resolve();
        expect(layer(el)).toBeNull();
        expect(root(el).className).toBe(cls);

        el.fade = ON;
        await Promise.resolve();
        expect(layer(el)).not.toBeNull();
        expect(root(el).className).toBe(cls);
    });

    it('paints in order: banner, wash, text', () => {
        const el = mount({ bgImage: { url: '/banner.jpg' } }, ON);
        const kids = [...root(el).children].map((n) => n.className);
        expect(kids.indexOf('banner-layer')).toBe(0);
        expect(kids.indexOf('hdr-fade')).toBe(1);
        expect(kids.indexOf('lockup-text')).toBeGreaterThan(1);
    });

    it('watches the header and every protected block, never a banner bar', () => {
        mount({ highlight: { text: 'Now open', variant: 'banner' } }, ON);
        const watched = observers[observers.length - 1].targets.map(
            (t) => t.className || t.tagName
        );
        expect(watched).toEqual([
            expect.stringContaining('hdr '),
            'brand-wordmark',
            'hdr-title',
            'hdr-desc'
        ]);
    });

    it('a badge or inline highlight is protected by its box', () => {
        mount({ highlight: { text: 'New', variant: 'inline' } }, ON);
        const last = observers[observers.length - 1].targets;
        expect(last[last.length - 1].tagName).toBe('C-FINAL-FORM-HIGHLIGHT');
    });

    it('stops watching while switched off, and watches again when on', async () => {
        const el = mount({}, ON);
        const first = observers[observers.length - 1];
        el.fade = { ...ON, on: false };
        await Promise.resolve();
        expect(first.targets).toEqual([]);
        el.fade = ON;
        await Promise.resolve();
        expect(observers[observers.length - 1]).not.toBe(first);
        expect(observers[observers.length - 1].targets.length).toBeGreaterThan(
            0
        );
    });

    it('stops watching when the header goes', () => {
        const el = mount({}, ON);
        const live = observers[observers.length - 1];
        expect(live.targets.length).toBeGreaterThan(0);
        document.body.removeChild(el);
        expect(live.targets).toEqual([]);
    });

    it('exposed: the edge class, in both switch states', async () => {
        const el = mount({}, { on: true, eligible: true, exposed: true });
        expect(root(el).classList.contains('hdr--exposed')).toBe(true);
        el.fade = { on: false, eligible: true, exposed: true };
        await Promise.resolve();
        expect(root(el).classList.contains('hdr--exposed')).toBe(true);
        expect(layer(el)).toBeNull();
    });

    it.each(Object.entries(ARRANGEMENTS))(
        '%s keeps its arrangement and markup',
        (arrangement, cls) => {
            const el = mount({ arrangement }, ON);
            const hdr = root(el);
            expect(hdr.classList.contains(cls)).toBe(true);
            expect(hdr.querySelector(':scope > .hdr-fade')).not.toBeNull();
            expect(hdr.querySelector(':scope > .lockup-text')).not.toBeNull();
            expect(
                hdr.querySelector(':scope > c-final-form-highlight')
            ).not.toBeNull();
        }
    );

    it('a banner highlight is marked; a badge or inline one is not', () => {
        const bar = mount(
            { highlight: { text: 'Now', variant: 'banner' } },
            ON
        );
        expect(
            bar.shadowRoot.querySelector('c-final-form-highlight').className
        ).toBe('hdr-highlight hdr-highlight--bar');
        const inline = mount(
            { highlight: { text: 'Now', variant: 'inline' } },
            ON
        );
        expect(
            inline.shadowRoot.querySelector('c-final-form-highlight').className
        ).toBe('hdr-highlight');
    });
});
