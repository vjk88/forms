import { createElement } from 'lwc';
import FinalLayoutCard from 'c/finalLayoutCard';

jest.mock(
    '@salesforce/resourceUrl/formThemeAssets',
    () => ({ default: '/resource/1/formThemeAssets' }),
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(props) {
    const el = createElement('c-final-layout-card', { is: FinalLayoutCard });
    Object.assign(el, props);
    document.body.appendChild(el);
    await flush();
    return el;
}
const style = (el) =>
    el.shadowRoot.querySelector('.lc-diagram').getAttribute('style');

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

// IMPL_PLAN_SPLIT_DEFAULTS_AND_PREVIEW §3
describe('c-final-layout-card: real full-bleed and width', () => {
    it('a carded layout sits at its width share', async () => {
        const el = await mount({
            layout: 'tabs',
            themeKey: 'nordic',
            maxWidth: 'narrow'
        });
        expect(style(el)).toContain('--pv-card: 43.8%');
    });

    it('a new Split form (full-bleed off, Wide): one card, both halves', async () => {
        const el = await mount({
            layout: 'splitHero',
            themeKey: 'desertOasis',
            fullBleed: false,
            maxWidth: 'wide'
        });
        expect(el.shadowRoot.querySelector('.lt-split-bleed')).toBeNull();
        expect(el.shadowRoot.querySelector('.lt-card.flush')).not.toBeNull();
        expect(style(el)).toContain('--pv-card: 81.3%');
    });

    it('a full-bleed Split: halves touch, the form floats', async () => {
        const el = await mount({
            layout: 'splitHero',
            themeKey: 'desertOasis'
        });
        expect(el.shadowRoot.querySelector('.lt-split-bleed')).not.toBeNull();
        expect(el.shadowRoot.querySelector('.lt-float')).not.toBeNull();
        expect(
            el.shadowRoot.querySelector('.lt-stage.lt-stage-bleed')
        ).not.toBeNull();
    });

    it('Conversational Split follows the same settings', async () => {
        const el = await mount({
            layout: 'splitHero',
            paneFlow: 'oneAtATime',
            themeKey: 'neonNights',
            fullBleed: false
        });
        expect(el.shadowRoot.querySelector('.lt-split-bleed')).toBeNull();
        expect(
            el.shadowRoot.querySelector('.lt-card.lt-center-v')
        ).not.toBeNull();
    });

    it('One at a time: open page unless full-bleed is off', async () => {
        const open = await mount({
            layout: 'oneAtATime',
            themeKey: 'sandstone'
        });
        expect(
            open.shadowRoot.querySelector('.lt-card.lt-open')
        ).not.toBeNull();
        const carded = await mount({
            layout: 'oneAtATime',
            themeKey: 'sandstone',
            fullBleed: false
        });
        expect(carded.shadowRoot.querySelector('.lt-card.lt-open')).toBeNull();
    });
});

describe('c-final-layout-card: Pane side, Pane width, stacking (PR 413 review)', () => {
    it('a carded Split marks itself for the pane share and mirrors on Right', async () => {
        const el = await mount({
            layout: 'splitHero',
            themeKey: 'desertOasis',
            fullBleed: false,
            maxWidth: 'wide',
            paneSide: 'right',
            paneRatio: 'third'
        });
        const split = el.shadowRoot.querySelector('.lt-split');
        expect(split.classList.contains('lt-split-hero')).toBe(true);
        expect(split.classList.contains('lt-side-right')).toBe(true);
        expect(style(el)).toContain('--pv-pane: 33.3%');
    });

    it('a Narrow carded Split stacks', async () => {
        const el = await mount({
            layout: 'splitHero',
            themeKey: 'desertOasis',
            fullBleed: false,
            maxWidth: 'narrow'
        });
        expect(el.shadowRoot.querySelector('.lt-split-stacked')).not.toBeNull();
    });

    it('Side Nav is not a split hero: no pane share class', async () => {
        const el = await mount({ layout: 'rail', themeKey: 'nordic' });
        expect(el.shadowRoot.querySelector('.lt-split-hero')).toBeNull();
    });
});
