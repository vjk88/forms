import { createElement } from 'lwc';
import FinalNavSplitHero from 'c/finalNavSplitHero';

const PAGES = () => [
    {
        id: 'p1',
        sections: [
            { id: 's1', elements: [] },
            { id: 's2', elements: [] }
        ]
    },
    { id: 'p2', sections: [{ id: 's3', elements: [] }] }
];

async function mount(options = {}, pages = PAGES()) {
    const cmp = createElement('c-final-nav-split-hero', {
        is: FinalNavSplitHero
    });
    cmp.options = options;
    cmp.pages = pages;
    document.body.appendChild(cmp);
    await Promise.resolve();
    return cmp;
}

describe('c-final-nav-split-hero', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('re-assigning pages preserves the screen position (review F10)', async () => {
        const cmp = await mount({ paneFlow: 'oneAtATime' });
        const text = () =>
            cmp.shadowRoot.querySelector('.progress-text').textContent;
        expect(text()).toBe('Step 1 of 3');
        cmp.shadowRoot.querySelector('.advance-btn').click();
        await Promise.resolve();
        expect(text()).toBe('Step 2 of 3');

        cmp.pages = PAGES();
        await Promise.resolve();
        expect(text()).toBe('Step 2 of 3');
    });

    it('theme-dressed pane (no config) consumes header tokens', async () => {
        const cmp = await mount({});
        const pane = cmp.shadowRoot.querySelector('.pane');
        expect(pane.getAttribute('style')).toContain('var(--c-header-bg)');
        expect(pane.getAttribute('style')).toContain('var(--c-header-text)');
    });

    it('legacy paneBg is ignored — pane stays theme-dressed (sweep slice 3a)', async () => {
        const cmp = await mount({ paneBg: '#fff', paneBgOpacity: 40 });
        const pane = cmp.shadowRoot.querySelector('.pane');
        expect(pane.getAttribute('style')).toContain('var(--c-header-bg)');
        expect(pane.getAttribute('style')).not.toContain('rgba(255');
    });

    it('mapped banner image layers under a header-fill veil at (100 − opacity)%', async () => {
        const cmp = await mount({
            paneImage: { url: 'https://x/img.png', opacity: 40 }
        });
        const style = cmp.shadowRoot
            .querySelector('.pane')
            .getAttribute('style');
        expect(style).toContain('url("https://x/img.png")');
        expect(style).toContain(
            'color-mix(in srgb, var(--c-header-bg) 60%, transparent)'
        );
        expect(style).toContain('var(--c-header-text)');
    });

    it('viewer bleed prop wins over options; options stay the direct-mount fallback', async () => {
        // prop false beats the default-ON fullBleed option
        let cmp = await mount({});
        cmp.bleed = false;
        await Promise.resolve();
        expect(cmp.shadowRoot.querySelector('.layout').className).not.toContain(
            'mode-bleed'
        );
        // prop true beats an explicit fullBleed:false
        cmp = await mount({ fullBleed: false });
        cmp.bleed = true;
        await Promise.resolve();
        expect(cmp.shadowRoot.querySelector('.layout').className).toContain(
            'mode-bleed'
        );
    });

    it('conversational controls row honors the arrangement (audit fix)', async () => {
        const cmp = await mount({ paneFlow: 'oneAtATime' });
        // default = this layout's registry split
        expect(cmp.shadowRoot.querySelector('.controls').className).toContain(
            'arr-split'
        );
        cmp.arrangement = 'together-left';
        await Promise.resolve();
        expect(cmp.shadowRoot.querySelector('.controls').className).toContain(
            'arr-start'
        );
        cmp.arrangement = 'together-right';
        await Promise.resolve();
        expect(cmp.shadowRoot.querySelector('.controls').className).toContain(
            'arr-end'
        );
    });

    it('carded pane pins by default; bleed never; sticky:false opts out', async () => {
        // carded (fullBleed:false) → sticky-pane by default
        let cmp = await mount({ fullBleed: false });
        expect(cmp.shadowRoot.querySelector('.layout').className).toContain(
            'sticky-pane'
        );
        // explicit opt-out
        cmp = await mount({ fullBleed: false, sticky: false });
        expect(cmp.shadowRoot.querySelector('.layout').className).not.toContain(
            'sticky-pane'
        );
        // bleed (default): sticky would unstretch the full-height half
        cmp = await mount({ sticky: true });
        expect(cmp.shadowRoot.querySelector('.layout').className).not.toContain(
            'sticky-pane'
        );
    });

    it('progress dots carry no hard-coded color classes (review F5 rides currentColor)', async () => {
        const cmp = await mount({});
        const dots = cmp.shadowRoot.querySelectorAll('.dot');
        expect(dots.length).toBe(2); // Pages flow: one per page
        expect(dots[0].className).toBe('dot active');
    });

    it('title + subtitle default to the CENTER zone (owner arrangement 2026-07-12)', async () => {
        const cmp = await mount({ paneTitle: 'T', paneSubtitle: 'S' });
        expect(
            cmp.shadowRoot.querySelector('.zone-center .pane-title')
        ).not.toBeNull();
        expect(
            cmp.shadowRoot.querySelector('.zone-center .pane-subtitle')
        ).not.toBeNull();
        expect(cmp.shadowRoot.querySelector('.zone-top').children.length).toBe(
            0
        );
    });

    it('Pane side + width options drive layout classes (sweep BUILD slice 2)', async () => {
        const cmp = await mount({ side: 'right', ratio: 'third' });
        const layout = cmp.shadowRoot.querySelector('.layout');
        expect(layout.classList.contains('side-right')).toBe(true);
        expect(layout.classList.contains('ratio-third')).toBe(true);

        const def = await mount({});
        const dl = def.shadowRoot.querySelector('.layout');
        expect(dl.classList.contains('side-left')).toBe(true);
        expect(dl.classList.contains('ratio-half')).toBe(true);
    });

    it('blockPlacement is ignored (reader deleted — sweep DELETE 2026-07-18)', async () => {
        const cmp = await mount({
            paneTitle: 'T',
            blockPlacement: { title: 'top' }
        });
        expect(
            cmp.shadowRoot.querySelector('.zone-top .pane-title')
        ).toBeNull();
        expect(
            cmp.shadowRoot.querySelector('.zone-center .pane-title')
        ).not.toBeNull();
    });

    it('highlight placement aboveTitle renders the kicker BEFORE the title, no divider', async () => {
        const cmp = await mount({
            paneTitle: 'T',
            paneHighlight: { text: 'H', placement: 'aboveTitle' }
        });
        const center = cmp.shadowRoot.querySelector('.zone-center');
        const kids = Array.from(center.children).map((el) =>
            el.tagName.toLowerCase()
        );
        expect(kids[0]).toBe('c-final-form-highlight');
        expect(kids[1]).toBe('div'); // .pane-title follows the kicker
        expect(cmp.shadowRoot.querySelector('.pane-divider')).toBeNull();
    });

    it('bottom highlight = highlight → divider → progress; no highlight, no divider', async () => {
        let cmp = await mount({ paneHighlight: { text: 'H' } });
        expect(
            cmp.shadowRoot.querySelector('.zone-bottom c-final-form-highlight')
        ).not.toBeNull();
        const divider = cmp.shadowRoot.querySelector('.pane-divider');
        expect(divider).not.toBeNull();
        // divider sits between the zones and the progress footer
        expect(
            divider.nextElementSibling.className.includes('pane-progress')
        ).toBe(true);

        cmp = await mount({});
        expect(cmp.shadowRoot.querySelector('.pane-divider')).toBeNull();
    });

    it('pane title renders rich text (header.title is a richtext field)', async () => {
        const cmp = await mount({
            paneTitle: '<p>See <em>your</em> numbers</p>'
        });
        const rich = cmp.shadowRoot.querySelector(
            '.pane-title lightning-formatted-rich-text'
        );
        expect(rich).not.toBeNull();
        expect(rich.value).toBe('<p>See <em>your</em> numbers</p>');
    });
});
