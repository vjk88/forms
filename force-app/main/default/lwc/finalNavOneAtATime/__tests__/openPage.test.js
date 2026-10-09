import { createElement } from 'lwc';
import FinalNavOneAtATime from 'c/finalNavOneAtATime';

// Owner 2026-10-03 (design-explorations/01-conversational-survey.html): One at a
// time is an OPEN page — a progress strip, then one question column — with no
// card and no box around the question. The viewer decides how the section drops
// its box (options.openSections); the nav applies it and keeps authored choices.
const PAGES = () => [
    {
        id: 'p1',
        sections: [
            { id: 's1', style: 'card', elements: [] },
            { id: 's2', style: 'boxed', elements: [] },
            { id: 's3', surface: { padding: 'lg' }, elements: [] }
        ]
    }
];

async function mount({ pages, ...props } = {}) {
    const cmp = createElement('c-final-nav-one-at-a-time', {
        is: FinalNavOneAtATime
    });
    cmp.pages = pages || PAGES();
    Object.assign(cmp, props);
    document.body.appendChild(cmp);
    await Promise.resolve();
    return cmp;
}

const zones = (cmp) =>
    cmp.shadowRoot.querySelector('c-final-layout-zones').sections[0];

const next = async (cmp) => {
    cmp.shadowRoot.querySelector('.primary-btn').click();
    await Promise.resolve();
};

describe('c-final-nav-one-at-a-time open page', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('Immersive on: the question column is a plain column, never a card', async () => {
        const cmp = await mount({ bleed: true });
        const body = cmp.shadowRoot.querySelector('.oaat-body');
        expect(body.classList.contains('oaat-column')).toBe(true);
        expect(cmp.shadowRoot.querySelector('.question-card')).toBeNull();
        expect(cmp.shadowRoot.querySelector('.top-chrome')).not.toBeNull();
    });

    it('Immersive off: no column wrapper (the page frame panel is the card) and inline progress', async () => {
        const cmp = await mount({ bleed: false });
        const body = cmp.shadowRoot.querySelector('.oaat-body');
        expect(body.classList.contains('oaat-column')).toBe(false);
        expect(cmp.shadowRoot.querySelector('.top-chrome')).toBeNull();
        expect(cmp.shadowRoot.querySelector('.progress-text')).not.toBeNull();
    });

    it('open page: the default card section becomes plain with no padding', async () => {
        const cmp = await mount({
            bleed: true,
            options: { openSections: true }
        });
        expect(zones(cmp).style).toBe('plain');
        expect(zones(cmp).surface.padding).toBe('none');
    });

    it('card panel: the same, and the panel inset is the one shared edge', async () => {
        const cmp = await mount({
            bleed: false,
            options: { openSections: true }
        });
        expect(zones(cmp).style).toBe('plain');
        expect(zones(cmp).surface.padding).toBe('none');
        expect(
            cmp.shadowRoot
                .querySelector('.oaat')
                .classList.contains('mode-panel')
        ).toBe(true);
    });

    it('an authored style other than the default card still wins', async () => {
        const cmp = await mount({
            bleed: true,
            options: { openSections: true }
        });
        await next(cmp);
        expect(zones(cmp).id).toBe('s2');
        expect(zones(cmp).style).toBe('boxed');
    });

    it('an authored padding still wins', async () => {
        const cmp = await mount({
            bleed: true,
            options: { openSections: true }
        });
        await next(cmp);
        await next(cmp);
        expect(zones(cmp).id).toBe('s3');
        expect(zones(cmp).surface.padding).toBe('lg');
    });

    it('a deliberate global Section style (openSections false): the section is untouched', async () => {
        const pages = PAGES();
        const cmp = await mount({
            pages,
            bleed: true,
            options: { openSections: false }
        });
        // (LWC hands the nav a read-only proxy of the section, so compare by value)
        expect(zones(cmp)).toEqual(pages[0].sections[0]);
    });

    it('keeps one source section as one stable object between renders', async () => {
        const cmp = await mount({
            bleed: true,
            options: { openSections: true }
        });
        const first = zones(cmp);
        cmp.currentPageIndex = 0;
        await Promise.resolve();
        expect(zones(cmp)).toBe(first);
    });

    it('the keyboard hint rides with the primary button on the same row', async () => {
        const cmp = await mount({
            bleed: true,
            options: { advanceTrigger: 'keyboard' }
        });
        const advance = cmp.shadowRoot.querySelector('.advance');
        expect(advance.querySelector('.primary-btn')).not.toBeNull();
        expect(advance.querySelector('.key-helper').textContent).toContain(
            'Return'
        );
    });
});
