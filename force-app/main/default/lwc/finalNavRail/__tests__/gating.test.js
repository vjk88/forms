import { createElement } from 'lwc';
import FinalNavRail from 'c/finalNavRail';

const PAGES = [
    { id: 'p1', name: 'One', sections: [] },
    { id: 'p2', name: 'Two', sections: [] },
    { id: 'p3', name: 'Three', sections: [] }
];

function mount(options) {
    const el = createElement('c-final-nav-rail', { is: FinalNavRail });
    el.pages = PAGES;
    el.pageValidity = [true, false, false];
    el.options = options;
    document.body.appendChild(el);
    return el;
}

describe('c-final-nav-rail gating', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('free navigation stays the default: no page ever locks', () => {
        const el = mount(undefined);
        const links = [...el.shadowRoot.querySelectorAll('.rail-link')];
        expect(links.map((b) => b.disabled)).toEqual([false, false, false]);
    });

    it("navigation: 'gated' locks pages past the first not-yet-valid one", () => {
        const el = mount({ navigation: 'gated' });
        const links = [...el.shadowRoot.querySelectorAll('.rail-link')];
        // page 1 valid, page 2 is the first blocked → reachable; page 3 locks
        expect(links.map((b) => b.disabled)).toEqual([false, false, true]);
    });
});
