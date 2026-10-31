import { createElement } from 'lwc';
import FinalNavTabs from 'c/finalNavTabs';

/**
 * What a screen reader hears in Tabbed pages (DEFERRED 39): every tab names
 * the panel it controls and the panel is named by the active tab.
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

describe('Tabbed pages: the panel is tied to its tab', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('every tab controls the panel, and the panel is named by the active tab', async () => {
        const el = mount('c-final-nav-tabs', FinalNavTabs, {
            pages: PAGES,
            currentPageIndex: 0
        });
        await flush();
        const tabs = [...el.shadowRoot.querySelectorAll('[role="tab"]')];
        const panel = el.shadowRoot.querySelector('[role="tabpanel"]');
        expect(panel.id).toBeTruthy();
        tabs.forEach((tab) => {
            expect(tab.getAttribute('aria-controls')).toBe(panel.id);
        });
        expect(tabs[0].id).not.toBe(tabs[1].id);
        expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0].id);

        el.currentPageIndex = 1;
        await flush();
        expect(panel.getAttribute('aria-labelledby')).toBe(tabs[1].id);
    });

    it('section titles in a tab stay h3: the tab strip is not a heading', async () => {
        const el = mount('c-final-nav-tabs', FinalNavTabs, {
            pages: PAGES,
            currentPageIndex: 0
        });
        await flush();
        const [title] = sectionHeadings(el.shadowRoot);
        expect(title.tagName).toBe('H3');
    });
});
