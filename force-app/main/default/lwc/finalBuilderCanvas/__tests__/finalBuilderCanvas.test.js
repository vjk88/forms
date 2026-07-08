import { createElement } from 'lwc';
import FinalBuilderCanvas from 'c/finalBuilderCanvas';

const SPEC = {
    pages: [
        {
            id: 'pg_1',
            name: 'Details',
            sections: [
                {
                    id: 'sec_1',
                    title: 'Contact',
                    elements: [
                        { id: 'el_1', type: 'field', label: 'Email', required: true },
                        { id: 'el_2', type: 'field', label: 'Phone' }
                    ]
                }
            ]
        },
        { id: 'pg_2', name: 'Wrap', sections: [] }
    ]
};

function mount(props = {}) {
    const el = createElement('c-final-builder-canvas', {
        is: FinalBuilderCanvas
    });
    Object.assign(el, { spec: SPEC, currentPageIndex: 0 }, props);
    document.body.appendChild(el);
    return el;
}

describe('c-final-builder-canvas', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('renders page chips, sections, and skeleton field rows from the spec', () => {
        const el = mount();
        const chips = el.shadowRoot.querySelectorAll('.bc-chip');
        expect(chips[0].textContent.trim()).toBe('Page 1 · Details');
        expect(chips[2].textContent.trim()).toBe('+ Page');
        expect(el.shadowRoot.querySelectorAll('.bc-row')).toHaveLength(2);
        expect(el.shadowRoot.querySelectorAll('.bc-skeleton')).toHaveLength(2);
        expect(el.shadowRoot.querySelector('.bc-req')).not.toBeNull();
    });

    it('click selects elements/sections and emits intents; selection highlights', async () => {
        const el = mount({ selection: { kind: 'element', id: 'el_2' } });
        expect(
            el.shadowRoot.querySelector('.bc-row.selected .bc-row-label')
                .textContent
        ).toContain('Phone');

        const events = [];
        ['select', 'addpage', 'addsection', 'removeelement'].forEach((t) =>
            el.addEventListener(t, (e) => events.push([t, e.detail]))
        );
        el.shadowRoot.querySelector('.bc-row').click();
        el.shadowRoot.querySelector('.bc-chip.add').click();
        el.shadowRoot.querySelector('.bc-add-section').click();
        el.shadowRoot.querySelector('.bc-row .bc-x').click();
        // .bc-x stops propagation — remove fires WITHOUT a select
        expect(events.map(([t]) => t)).toEqual([
            'select',
            'addpage',
            'addsection',
            'removeelement'
        ]);
        expect(events[0][1]).toEqual({ kind: 'element', id: 'el_1' });
        expect(events[3][1]).toEqual({ id: 'el_1' });
    });

    it('empty page shows the numbered empty state', () => {
        const el = mount({ currentPageIndex: 1 });
        expect(el.shadowRoot.querySelector('.bc-empty ol')).not.toBeNull();
    });
});
