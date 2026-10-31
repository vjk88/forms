import { createElement } from 'lwc';
import FinalNavAccordion from 'c/finalNavAccordion';

/**
 * What a screen reader hears in Accordion (DEFERRED 39): the panel title is an
 * h2, a page like Scroll's divider, so the h3 section titles inside an open
 * panel read as its children, not as more panels.
 */
const PAGES = [
    {
        id: 'p1',
        name: 'Details',
        sections: [{ id: 's1', title: 'Contact details', elements: [] }]
    },
    {
        id: 'p2',
        name: 'Preferences',
        sections: [{ id: 's2', title: 'How to reach you', elements: [] }]
    }
];

const flush = () => Promise.resolve();

function mount(tag, Ctor, props) {
    const el = createElement(tag, { is: Ctor });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el;
}

/** The section titles rendered inside a host, through the zones shadow. */
function sectionHeadings(root) {
    return [...root.querySelectorAll('c-final-layout-zones')].flatMap((z) =>
        [...z.shadowRoot.querySelectorAll('c-final-section-renderer')].map(
            (s) => s.shadowRoot.querySelector('.sec-title')
        )
    );
}

describe('Accordion: section titles sit one level below the panel title', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('the panel title is h2 and the section title inside it is h3', async () => {
        const el = mount('c-final-nav-accordion', FinalNavAccordion, {
            pages: PAGES
        });
        await flush();
        expect(el.shadowRoot.querySelector('h2.head')).not.toBeNull();
        expect(el.shadowRoot.querySelector('h3.head')).toBeNull();
        const titles = sectionHeadings(el.shadowRoot);
        expect(titles).toHaveLength(1);
        expect(titles[0].tagName).toBe('H3');
        expect(titles[0].className).toBe('sec-title');
        expect(titles[0].textContent).toBe('Contact details');
    });

    it('a second panel opened later also gets h3 titles under its h2', async () => {
        const el = mount('c-final-nav-accordion', FinalNavAccordion, {
            pages: PAGES,
            options: { allowMultiple: true }
        });
        await flush();
        el.shadowRoot.querySelectorAll('.trigger')[1].click();
        await flush();
        const titles = sectionHeadings(el.shadowRoot);
        expect(titles.map((t) => t.tagName)).toEqual(['H3', 'H3']);
    });
});
