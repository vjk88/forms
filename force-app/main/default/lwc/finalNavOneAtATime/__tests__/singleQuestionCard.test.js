import { createElement } from 'lwc';
import FinalNavOneAtATime from 'c/finalNavOneAtATime';

// Owner tuning 2026-10-03: on a phone a Single question screen (survey set to
// "One question per page") gets a tighter card (26px, not 32px). The nav only
// tags the card; the width test lives in the stylesheet.
const PAGES = [
    {
        id: 'p1',
        sections: [
            { id: 's1', convo: true, elements: [] },
            { id: 's2', elements: [] }
        ]
    }
];

async function mount(props = {}) {
    const cmp = createElement('c-final-nav-one-at-a-time', {
        is: FinalNavOneAtATime
    });
    cmp.pages = PAGES;
    Object.assign(cmp, props);
    document.body.appendChild(cmp);
    await Promise.resolve();
    return cmp;
}

const card = (cmp) => cmp.shadowRoot.querySelector('.oaat-body');

describe('c-final-nav-one-at-a-time single question card', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('a conversational screen in the floating card is tagged card-single', async () => {
        const cmp = await mount({ bleed: true });
        expect(card(cmp).classList.contains('question-card')).toBe(true);
        expect(card(cmp).classList.contains('card-single')).toBe(true);
    });

    it('the tag follows the screen: a normal section is not tagged', async () => {
        const cmp = await mount({ bleed: true });
        cmp.shadowRoot.querySelector('.primary-btn').click();
        await Promise.resolve();
        expect(card(cmp).classList.contains('card-single')).toBe(false);
    });

    it('not in bleed: there is no floating card to tighten', async () => {
        const cmp = await mount({ bleed: false });
        expect(card(cmp).classList.contains('question-card')).toBe(false);
        expect(card(cmp).classList.contains('card-single')).toBe(false);
    });
});
