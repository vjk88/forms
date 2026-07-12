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

    it('3-digit hex veils keep their opacity (review F17)', async () => {
        const cmp = await mount({ paneBg: '#fff', paneBgOpacity: 40 });
        const pane = cmp.shadowRoot.querySelector('.pane');
        expect(pane.getAttribute('style')).toContain(
            'rgba(255, 255, 255, 0.4)'
        );
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
});
