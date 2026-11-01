import { createElement } from 'lwc';
import FinalNavAccordion from 'c/finalNavAccordion';

/**
 * Which panels are open (IMPL_PLAN_BLOCKED_MESSAGE §3).
 *
 * The viewer hands Accordion NEW page data after every answer. Its `pages`
 * setter used to reset the panels each time, so answering a question in
 * panel 2 sent you back to panel 1, and nothing could open a closed panel
 * for the jump to the first red question. Now every open panel that is still
 * there stays open, and a blocked click's target opens its panel once.
 */
const el = (id, extra = {}) => ({
    id,
    type: 'field',
    label: id,
    render: { inputType: 'text' },
    ...extra
});
const page = (id, extra) => ({
    id,
    name: id,
    sections: [{ id: `s_${id}`, elements: [el(`el_${id}`, extra)] }]
});
const PAGES = () => [page('p1'), page('p2'), page('p3')];

const flush = () => Promise.resolve();

function mount(options = {}) {
    const cmp = createElement('c-final-nav-accordion', {
        is: FinalNavAccordion
    });
    cmp.options = options;
    cmp.pages = PAGES();
    document.body.appendChild(cmp);
    return cmp;
}

const openIds = (cmp) =>
    [...cmp.shadowRoot.querySelectorAll('button.trigger')]
        .filter((b) => b.getAttribute('aria-expanded') === 'true')
        .map((b) => b.dataset.key);

const toggle = async (cmp, key) => {
    cmp.shadowRoot.querySelector(`button[data-key="${key}"]`).click();
    await flush();
};

describe('Accordion keeps the panels the person opened', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('new page data after an answer (same pages) leaves panel 2 open', async () => {
        const cmp = mount();
        await flush();
        expect(openIds(cmp)).toEqual(['p1']);
        await toggle(cmp, 'p2');
        expect(openIds(cmp)).toEqual(['p2']);

        cmp.pages = PAGES(); // what every answer does
        await flush();
        expect(openIds(cmp)).toEqual(['p2']);
    });

    it('a rule showing or hiding ANOTHER page never closes the panel you are in', async () => {
        const cmp = mount();
        await toggle(cmp, 'p2');

        cmp.pages = [page('p1'), page('p2')]; // a rule hid p3
        await flush();
        expect(openIds(cmp)).toEqual(['p2']);

        cmp.pages = [page('p1'), page('p2'), page('p3'), page('p4')]; // and showed p4
        await flush();
        expect(openIds(cmp)).toEqual(['p2']);
    });

    it('when a rule hides the open panel itself, the first visible panel opens', async () => {
        const cmp = mount();
        await toggle(cmp, 'p2');
        cmp.pages = [page('p1'), page('p3')];
        await flush();
        expect(openIds(cmp)).toEqual(['p1']);
    });

    it('…or none, when "First panel open" is off', async () => {
        const cmp = mount({ firstPanelOpen: false });
        await toggle(cmp, 'p2');
        cmp.pages = [page('p1'), page('p3')];
        await flush();
        expect(openIds(cmp)).toEqual([]);
    });

    it('panels the person closed stay closed through answers', async () => {
        const cmp = mount();
        await toggle(cmp, 'p1');
        expect(openIds(cmp)).toEqual([]);
        cmp.pages = PAGES();
        await flush();
        expect(openIds(cmp)).toEqual([]);
    });

    it('a different form (no page in common) starts from the default again', async () => {
        const cmp = mount();
        await toggle(cmp, 'p1');
        cmp.pages = [page('x1'), page('x2')];
        await flush();
        expect(openIds(cmp)).toEqual(['x1']);
    });
});

describe('the Accordion switches still apply live in the Studio preview', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    // the layout survives an edit, and the pages setter keeps the panels
    // now, so the switches must re-seed them themselves (UX review)
    it('turning "First panel open" off closes the default panel', async () => {
        const cmp = mount();
        await flush();
        expect(openIds(cmp)).toEqual(['p1']);
        cmp.options = { firstPanelOpen: false };
        await flush();
        expect(openIds(cmp)).toEqual([]);
    });

    it('turning "Allow multiple" off collapses several open panels back to the default', async () => {
        const cmp = mount({ allowMultiple: true });
        await toggle(cmp, 'p2');
        await toggle(cmp, 'p3');
        expect(openIds(cmp)).toEqual(['p1', 'p2', 'p3']);
        cmp.options = { allowMultiple: false };
        await flush();
        expect(openIds(cmp)).toEqual(['p1']);
    });

    it('an unrelated option change (icon side) leaves the panels alone', async () => {
        const cmp = mount();
        await toggle(cmp, 'p2');
        cmp.options = { iconPosition: 'trailing' };
        await flush();
        expect(openIds(cmp)).toEqual(['p2']);
    });
});

describe('Accordion opens the panel holding the jump target', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('a red question in the second, initially closed panel opens it (instead of the first)', async () => {
        const cmp = mount();
        await flush();
        cmp.pages = [
            page('p1'),
            page('p2', { focusRequest: 9001 }),
            page('p3')
        ];
        await flush();
        expect(openIds(cmp)).toEqual(['p2']);
        // its question is drawn, so the renderer can take the cursor
        const zones = cmp.shadowRoot.querySelectorAll(
            '.body c-final-layout-zones'
        );
        expect(zones.length).toBe(1);
        expect(zones[0].sections[0].id).toBe('s_p2');
    });

    it('with "Allow multiple" it opens alongside the panel already open', async () => {
        const cmp = mount({ allowMultiple: true });
        await flush();
        cmp.pages = [
            page('p1'),
            page('p2', { focusRequest: 9002 }),
            page('p3')
        ];
        await flush();
        expect(openIds(cmp)).toEqual(['p1', 'p2']);
    });

    it('the same number arriving again does not reopen a panel the person closed', async () => {
        const cmp = mount();
        cmp.pages = [
            page('p1'),
            page('p2', { focusRequest: 9003 }),
            page('p3')
        ];
        await flush();
        await toggle(cmp, 'p2');
        expect(openIds(cmp)).toEqual([]);

        cmp.pages = [
            page('p1'),
            page('p2', { focusRequest: 9003 }),
            page('p3')
        ];
        await flush();
        expect(openIds(cmp)).toEqual([]);

        // a NEW blocked click (new number) opens it again
        cmp.pages = [
            page('p1'),
            page('p2', { focusRequest: 9004 }),
            page('p3')
        ];
        await flush();
        expect(openIds(cmp)).toEqual(['p2']);
    });
});
