import { createElement } from 'lwc';
import FinalNavSplitHero from 'c/finalNavSplitHero';

const fs = require('fs');
const path = require('path');

/**
 * The Split phone strip (owner 2026-10-31): brand, title and progress
 * ("Step 1 of 2" with a thin bar), no subtitle. On 2026-07-12 the title moved
 * to the pane's middle zone while the phone rule still hid that zone, so
 * phones showed no title; the progress was never shown there at all.
 */
const css = fs
    .readFileSync(path.join(__dirname, '..', 'finalNavSplitHero.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the phone (narrow Split) container rule. */
function phoneRule() {
    const at = css.indexOf('@container split (max-width: 540px)');
    let depth = 0;
    for (let i = css.indexOf('{', at); i < css.length; i++) {
        if (css[i] === '{') depth += 1;
        if (css[i] === '}') depth -= 1;
        if (depth === 0) {
            return css.slice(at, i + 1);
        }
    }
    return '';
}

/** Selectors the phone rule sets to display: none. */
function hiddenOnPhone() {
    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    const body = phoneRule().replace(/^[^{]*\{/, '');
    for (const m of body.matchAll(re)) {
        if (/display:\s*none/.test(m[2])) {
            m[1].split(',').forEach((s) => out.push(s.trim()));
        }
    }
    return out;
}

const PAGES = [
    { id: 'p1', name: 'One', sections: [] },
    { id: 'p2', name: 'Two', sections: [] }
];

function mount(options) {
    const el = createElement('c-final-nav-split-hero', {
        is: FinalNavSplitHero
    });
    el.pages = PAGES;
    el.currentPageIndex = 0;
    el.options = options;
    document.body.appendChild(el);
    return el;
}

describe('Split phone strip', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('never hides the title zone or the progress', () => {
        const hidden = hiddenOnPhone();
        expect(hidden).not.toContain('.zone-center');
        expect(hidden).not.toContain('.zone-top');
        expect(hidden).not.toContain('.pane-title');
        expect(hidden).not.toContain('.pane-progress');
        expect(hidden).not.toContain('.progress-text');
    });

    it('hides the subtitle, the dots and the bottom zone, shows the thin bar', () => {
        const hidden = hiddenOnPhone();
        expect(hidden).toEqual(
            expect.arrayContaining([
                '.pane-subtitle',
                '.dots',
                '.zone-bottom',
                '.pane.pane--bare'
            ])
        );
        expect(phoneRule()).toMatch(/\.phone-bar\s*\{\s*display:\s*block;/);
    });

    it('the dots progress also carries the thin bar for the phone', () => {
        const el = mount({ paneTitle: 'Title' });
        const progress = el.shadowRoot.querySelector('.pane-progress');
        expect(progress.querySelector('.dots')).not.toBeNull();
        const bar = progress.querySelector('.phone-bar');
        expect(bar).not.toBeNull();
        expect(bar.getAttribute('aria-hidden')).toBe('true');
        expect(
            bar.querySelector('.progress-fill').getAttribute('style')
        ).toContain('scaleX(0.5)');
        expect(progress.querySelector('.progress-text').textContent).toBe(
            'Step 1 of 2'
        );
    });

    it('no brand, title or progress: the strip is marked bare (hidden)', () => {
        const el = createElement('c-final-nav-split-hero', {
            is: FinalNavSplitHero
        });
        el.pages = [PAGES[0]];
        el.options = {};
        document.body.appendChild(el);
        expect(el.shadowRoot.querySelector('aside').className).toBe(
            'pane pane--bare'
        );
    });

    it('a title alone keeps the strip', () => {
        const el = mount({ paneTitle: 'Title' });
        expect(el.shadowRoot.querySelector('aside').className).toBe('pane');
    });

    it('a logo alone keeps the strip', () => {
        const el = createElement('c-final-nav-split-hero', {
            is: FinalNavSplitHero
        });
        el.pages = [PAGES[0]];
        el.options = { paneLogo: { url: '/logo.png' } };
        document.body.appendChild(el);
        expect(el.shadowRoot.querySelector('aside').className).toBe('pane');
    });

    it('empty boxes take no room on a phone: empty zones and brand are marked', () => {
        const el = mount({ paneTitle: 'Title' });
        const zones = [...el.shadowRoot.querySelectorAll('.zone')].map(
            (z) => z.className
        );
        expect(zones).toEqual([
            'zone zone-top zone--empty',
            'zone zone-center',
            'zone zone-bottom zone--empty'
        ]);
        expect(el.shadowRoot.querySelector('.brand').className).toBe(
            'brand brand--empty'
        );
        expect(hiddenOnPhone()).toEqual(
            expect.arrayContaining(['.zone--empty', '.brand--empty'])
        );
        const branded = mount({ paneTitle: 'Title', paneBrandName: 'Acme' });
        expect(branded.shadowRoot.querySelector('.brand').className).toBe(
            'brand'
        );
    });

    it('the phone title uses the compact title size, as every layout does', () => {
        expect(phoneRule()).toMatch(
            /\.pane-title\s*\{\s*font-size:\s*var\(--c-fs-title-compact\);/
        );
    });

    it("progress style 'horizontal' keeps its own bar; 'none' shows none", () => {
        const bar = mount({ paneTitle: 'T', progressStyle: 'horizontal' });
        expect(bar.shadowRoot.querySelector('.dots')).toBeNull();
        expect(
            bar.shadowRoot.querySelector('.pane-progress .progress-track')
        ).not.toBeNull();
        const none = mount({ paneTitle: 'T', progressStyle: 'none' });
        expect(none.shadowRoot.querySelector('.pane-progress')).toBeNull();
    });
});
