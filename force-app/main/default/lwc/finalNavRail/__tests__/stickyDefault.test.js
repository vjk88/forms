import { createElement } from 'lwc';
import FinalNavRail from 'c/finalNavRail';

// The rail is wayfinding — sticky by DEFAULT (owner 2026-07-11); an explicit
// sticky:false opts out. (Narrow container behavior is CSS-only — jsdom
// can't evaluate container queries, so only the class contract is tested.)
async function mount(options = {}) {
    const cmp = createElement('c-final-nav-rail', { is: FinalNavRail });
    cmp.options = options;
    cmp.pages = [
        { id: 'p1', title: 'One', sections: [] },
        { id: 'p2', title: 'Two', sections: [] }
    ];
    document.body.appendChild(cmp);
    await Promise.resolve();
    return cmp;
}

describe('c-final-nav-rail sticky default', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('sticky-rail by default (no options)', async () => {
        const cmp = await mount();
        expect(cmp.shadowRoot.querySelector('.layout').className).toContain(
            'sticky-rail'
        );
    });

    it('explicit sticky:false opts out', async () => {
        const cmp = await mount({ sticky: false });
        expect(cmp.shadowRoot.querySelector('.layout').className).not.toContain(
            'sticky-rail'
        );
    });
});
