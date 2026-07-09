import { createElement } from 'lwc';
import FinalBuilderCanvas, { PALETTE_FIELD_MIME } from 'c/finalBuilderCanvas';

/** Minimal DataTransfer stand-in (jsdom has no DragEvent/DataTransfer). */
function makeDataTransfer() {
    const store = {};
    return {
        types: [],
        effectAllowed: '',
        dropEffect: '',
        setData(type, value) {
            store[type] = value;
            this.types.push(type);
        },
        getData(type) {
            return store[type] || '';
        }
    };
}

function dragEvent(type, dataTransfer, opts = {}) {
    const e = new CustomEvent(type, {
        bubbles: true,
        composed: true,
        cancelable: true
    });
    e.dataTransfer = dataTransfer;
    Object.assign(e, opts);
    return e;
}

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
                        {
                            id: 'el_1',
                            type: 'field',
                            label: 'Email',
                            required: true
                        },
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

    // ---- DnD (the legacy port, CANVAS_RULES §7) ----

    it('gatekeeper: a palette field is droppable ON a section, native no-drop over a gap (§1)', () => {
        const el = mount();
        const dt = makeDataTransfer();
        dt.types.push(PALETTE_FIELD_MIME); // mid-drag only types are visible

        const section = el.shadowRoot.querySelector('.bc-section');
        const over = dragEvent('dragover', dt);
        const pd = jest.spyOn(over, 'preventDefault');
        section.dispatchEvent(over); // capture listener on .bc sees it
        expect(pd).toHaveBeenCalled();
        expect(dt.dropEffect).toBe('copy');

        const gap = el.shadowRoot.querySelector('.bc-gap');
        const overGap = dragEvent('dragover', dt);
        const pdGap = jest.spyOn(overGap, 'preventDefault');
        gap.dispatchEvent(overGap);
        expect(pdGap).not.toHaveBeenCalled(); // rejection = native no-drop
        expect(dt.dropEffect).toBe('none');
    });

    it('palette field dropped on an element row emits dropfield with the before position', () => {
        const el = mount();
        const drops = [];
        el.addEventListener('dropfield', (e) => drops.push(e.detail));
        const dt = makeDataTransfer();
        dt.setData(
            'text/plain',
            JSON.stringify({
                t: 'palette-field',
                field: { apiName: 'Email', label: 'Email' }
            })
        );
        const row = el.shadowRoot.querySelectorAll('.bc-row')[1]; // el_2
        row.dispatchEvent(dragEvent('drop', dt));
        expect(drops).toEqual([
            {
                field: { apiName: 'Email', label: 'Email' },
                sectionId: 'sec_1',
                beforeId: 'el_2'
            }
        ]);
    });

    it('element drag → drop on a row emits moveelement; highlight is imperative (no re-render)', () => {
        const el = mount();
        const moves = [];
        el.addEventListener('moveelement', (e) => moves.push(e.detail));
        const dt = makeDataTransfer();
        const rows = el.shadowRoot.querySelectorAll('.bc-row');

        rows[1].dispatchEvent(dragEvent('dragstart', dt)); // drag Phone
        expect(JSON.parse(dt.getData('text/plain'))).toEqual({
            t: 'element',
            id: 'el_2',
            sectionId: 'sec_1'
        });

        // dragover an allowed row paints the insertion line DIRECTLY on the node
        rows[0].dispatchEvent(dragEvent('dragover', dt));
        expect(rows[0].classList.contains('bc-drop-before')).toBe(true);

        rows[0].dispatchEvent(dragEvent('drop', dt));
        expect(rows[0].classList.contains('bc-drop-before')).toBe(false); // cleared
        expect(moves).toEqual([
            { id: 'el_2', sectionId: 'sec_1', beforeId: 'el_1' }
        ]);
    });

    it('section drag: gap shows the insertion slot and drop emits movesection', () => {
        const el = mount();
        const moves = [];
        el.addEventListener('movesection', (e) => moves.push(e.detail));
        const dt = makeDataTransfer();

        const section = el.shadowRoot.querySelector('.bc-section');
        section.dispatchEvent(dragEvent('dragstart', dt));

        const endGap = el.shadowRoot.querySelector('.bc-gap-end');
        endGap.dispatchEvent(dragEvent('dragover', dt));
        expect(endGap.classList.contains('bc-gap-over')).toBe(true);

        endGap.dispatchEvent(dragEvent('drop', dt));
        expect(moves).toEqual([
            { id: 'sec_1', beforeSectionId: null, pageId: 'pg_1' }
        ]);
    });

    it('page chip accepts a dragged element (cross-page move) and a page reorder', () => {
        const el = mount();
        const got = [];
        ['moveelement', 'movepage'].forEach((t) =>
            el.addEventListener(t, (e) => got.push([t, e.detail]))
        );
        const chips = el.shadowRoot.querySelectorAll('.bc-chip');

        const dtEl = makeDataTransfer();
        el.shadowRoot
            .querySelector('.bc-row')
            .dispatchEvent(dragEvent('dragstart', dtEl));
        chips[1].dispatchEvent(dragEvent('drop', dtEl)); // onto Page 2

        const dtPg = makeDataTransfer();
        chips[1].dispatchEvent(dragEvent('dragstart', dtPg));
        chips[0].dispatchEvent(dragEvent('drop', dtPg)); // Page 2 before Page 1

        expect(got).toEqual([
            ['moveelement', { id: 'el_1', pageId: 'pg_2' }],
            ['movepage', { id: 'pg_2', beforeId: 'pg_1' }]
        ]);
    });

    it('palette block: gap shows the slot; gap drop = standalone, section drop = element inside (§1/§3)', () => {
        const el = mount();
        const drops = [];
        el.addEventListener('dropblock', (e) => drops.push(e.detail));
        const dt = makeDataTransfer();
        dt.types.push('final/palette-el');

        // gaps accept blocks (unlike fields) — highlight + preventDefault
        const gap = el.shadowRoot.querySelector('.bc-gap');
        const over = dragEvent('dragover', dt);
        const pd = jest.spyOn(over, 'preventDefault');
        gap.dispatchEvent(over);
        expect(pd).toHaveBeenCalled();
        // must agree with the palette's effectAllowed='copy' or real
        // browsers cancel the drop (the org-QA bug jsdom can't see)
        expect(dt.dropEffect).toBe('copy');
        expect(gap.classList.contains('bc-gap-over')).toBe(true);

        dt.setData(
            'text/plain',
            JSON.stringify({ t: 'palette-el', elType: 'divider' })
        );
        gap.dispatchEvent(dragEvent('drop', dt));
        // into the section body → an element, appended
        el.shadowRoot
            .querySelector('.bc-section')
            .dispatchEvent(dragEvent('drop', dt));
        expect(drops).toEqual([
            { blockType: 'divider', beforeSectionId: 'sec_1', pageId: 'pg_1' },
            { blockType: 'divider', sectionId: 'sec_1', beforeId: null }
        ]);
    });

    it('block sections render as compact rows, refuse fields, and take sibling blocks before them (§3)', () => {
        const spec = JSON.parse(JSON.stringify(SPEC));
        spec.pages[0].sections.push({
            id: 'sec_blk',
            title: '',
            style: 'plain',
            block: true,
            elements: [
                { id: 'el_blk', type: 'richText', label: 'Display text' }
            ]
        });
        const el = mount({ spec });
        const block = el.shadowRoot.querySelector('.bc-block');
        expect(block.textContent).toContain('Display text');

        // a dragged FIELD gets a native no-drop over the block
        const dtField = makeDataTransfer();
        dtField.types.push(PALETTE_FIELD_MIME);
        const overField = dragEvent('dragover', dtField);
        const pdField = jest.spyOn(overField, 'preventDefault');
        block.dispatchEvent(overField);
        expect(pdField).not.toHaveBeenCalled();

        // a palette BLOCK over it = sibling insertion line + standalone drop
        const drops = [];
        el.addEventListener('dropblock', (e) => drops.push(e.detail));
        const dtEl = makeDataTransfer();
        dtEl.types.push('final/palette-el');
        block.dispatchEvent(dragEvent('dragover', dtEl));
        expect(block.classList.contains('bc-drop-before')).toBe(true);
        dtEl.setData(
            'text/plain',
            JSON.stringify({ t: 'palette-el', elType: 'spacer' })
        );
        block.dispatchEvent(dragEvent('drop', dtEl));
        expect(drops).toEqual([
            { blockType: 'spacer', beforeSectionId: 'sec_blk', pageId: 'pg_1' }
        ]);
    });

    it('element drags cannot enter a repeater section (§2 data-context signatures)', () => {
        const spec = JSON.parse(JSON.stringify(SPEC));
        spec.pages[0].sections.push({
            id: 'sec_rep',
            title: 'Line items',
            repeat: { childObject: 'OrderItem__c' },
            elements: []
        });
        const el = mount({ spec });
        const dt = makeDataTransfer();
        el.shadowRoot
            .querySelector('.bc-row')
            .dispatchEvent(dragEvent('dragstart', dt)); // parent-context field

        const repeater = el.shadowRoot.querySelectorAll('.bc-section')[1];
        const over = dragEvent('dragover', dt);
        const pd = jest.spyOn(over, 'preventDefault');
        repeater.dispatchEvent(over);
        expect(pd).not.toHaveBeenCalled(); // native no-drop, no highlight
        expect(repeater.classList.contains('bc-drop-on')).toBe(false);
    });
});
