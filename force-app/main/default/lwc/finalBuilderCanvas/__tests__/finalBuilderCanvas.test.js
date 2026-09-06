import { createElement } from 'lwc';
import FinalBuilderCanvas, {
    PALETTE_FIELD_MIME,
    PALETTE_EL_MIME,
    PALETTE_FILE_MIME
} from 'c/finalBuilderCanvas';

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
    it('switches from ordinary sections to a page mixing repeaters and standalone blocks', async () => {
        const spec = JSON.parse(JSON.stringify(SPEC));
        spec.pages[1].sections = [
            {
                id: 'r2',
                repeat: { childObject: 'Contact' },
                elements: [{ id: 'child', type: 'field' }]
            },
            { id: 'r3', repeat: { childObject: 'Case' }, elements: [] },
            {
                id: 'block',
                block: true,
                elements: [{ id: 'text', type: 'richText' }]
            }
        ];
        const el = mount({ spec });
        el.currentPageIndex = 1;
        await Promise.resolve();
        expect(el.shadowRoot.querySelectorAll('.bc-section')).toHaveLength(2);
        expect(el.shadowRoot.querySelectorAll('.bc-block')).toHaveLength(1);
        el.currentPageIndex = 0;
        await Promise.resolve();
        expect(el.shadowRoot.querySelectorAll('.bc-section')).toHaveLength(1);
    });
    it('uses native selection buttons with named delete actions and keyboard focus navigation', () => {
        const el = mount();
        const root = el.shadowRoot;
        const buttons = [...root.querySelectorAll('[data-nav]')];
        expect(buttons.every((button) => button.tagName === 'BUTTON')).toBe(
            true
        );
        expect(
            root.querySelector('.bc-row .bc-x').getAttribute('aria-label')
        ).toBe('Remove Email');
        const first = buttons.find((button) => button.dataset.id === 'el_1');
        first.focus();
        first.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'ArrowDown',
                bubbles: true,
                cancelable: true
            })
        );
        expect(root.activeElement.dataset.id).toBe('el_2');
        root.activeElement.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Home',
                bubbles: true,
                cancelable: true
            })
        );
        expect(root.activeElement.dataset.id).toBe('pg_1');
        const selected = jest.fn();
        el.addEventListener('select', selected);
        first.click(); // native button activation used by Enter/Space
        expect(selected.mock.calls[0][0].detail).toEqual({
            kind: 'element',
            id: 'el_1'
        });
    });

    it('opens selected actions with F2, supports Alt+Down and restores focus after a confirmed move', async () => {
        const el = mount();
        el.addEventListener('select', (event) => {
            el.selection = event.detail;
        });
        const root = el.shadowRoot;
        const first = root.querySelector('[data-nav][data-id="el_1"]');
        first.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'F2',
                bubbles: true,
                cancelable: true
            })
        );
        await Promise.resolve();
        expect(root.activeElement.textContent.trim()).toBe('Move down');
        expect(root.querySelector('.bc-actions button').disabled).toBe(true);
        const moves = [];
        el.addEventListener('moveelement', (event) => {
            moves.push(event.detail);
            const next = JSON.parse(JSON.stringify(SPEC));
            next.pages[0].sections[0].elements.reverse();
            el.spec = next;
        });
        first.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'ArrowDown',
                altKey: true,
                bubbles: true,
                cancelable: true
            })
        );
        await Promise.resolve();
        await Promise.resolve();
        expect(moves).toEqual([
            { id: 'el_1', sectionId: 'sec_1', beforeId: null }
        ]);
        expect(root.activeElement.dataset.id).toBe('el_1');
        expect(root.querySelector('[role="status"]').textContent).toContain(
            'position 2 of 2'
        );
    });

    it('offers compatible destinations and a new section on an empty page; Escape cancels', async () => {
        const structured = JSON.parse(JSON.stringify(SPEC));
        structured.pages[0].sections.push(
            { id: 'parent', title: 'Other section', elements: [] },
            {
                id: 'child',
                title: 'Contacts',
                repeat: { childObject: 'Contact' },
                elements: []
            },
            { id: 'block', block: true, elements: [{ type: 'richText' }] }
        );
        const el = mount({
            spec: structured,
            selection: { kind: 'element', id: 'el_1' }
        });
        const root = el.shadowRoot;
        root.querySelector('.bc-move-to').click();
        await Promise.resolve();
        const select = root.querySelector('select');
        expect(root.activeElement).toBe(select);
        expect([...select.options].map((option) => option.value)).toEqual([
            '',
            'parent',
            'page:pg_2'
        ]);
        select.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                cancelable: true
            })
        );
        await Promise.resolve();
        expect(root.querySelector('select')).toBeNull();
        expect(root.activeElement).toBe(root.querySelector('.bc-move-to'));
        root.querySelector('.bc-move-to').click();
        await Promise.resolve();
        expect(root.querySelector('select').options).toHaveLength(3);
    });

    it('focuses the next question after delete, and never announces a rejected mutation as success', async () => {
        const el = mount();
        const root = el.shadowRoot;
        root.querySelector('.bc-row .bc-x').click();
        // Host declines the deletion and later sends an unrelated edit.
        el.spec = JSON.parse(JSON.stringify(SPEC));
        await Promise.resolve();
        expect(root.querySelector('[role="status"]').textContent).toBe('');
        root.querySelector('.bc-row .bc-x').click();
        const next = JSON.parse(JSON.stringify(SPEC));
        next.pages[0].sections[0].elements.shift();
        el.spec = next;
        await Promise.resolve();
        await Promise.resolve();
        expect(root.activeElement.dataset.id).toBe('el_2');
        expect(root.querySelector('[role="status"]').textContent).toBe(
            'Email removed.'
        );
    });
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

    it('palette repeater: sibling line on sections, gap + chip drops emit droprepeater (§4)', () => {
        const el = mount();
        const drops = [];
        el.addEventListener('droprepeater', (e) => drops.push(e.detail));
        const dt = makeDataTransfer();
        dt.types.push('final/palette-rep');

        // over a section → allowed, copy, sibling insertion line (never IN)
        const section = el.shadowRoot.querySelector('.bc-section');
        const over = dragEvent('dragover', dt);
        const pd = jest.spyOn(over, 'preventDefault');
        section.dispatchEvent(over);
        expect(pd).toHaveBeenCalled();
        expect(dt.dropEffect).toBe('copy');
        expect(section.classList.contains('bc-drop-before')).toBe(true);

        dt.setData('text/plain', JSON.stringify({ t: 'palette-rep' }));
        section.dispatchEvent(dragEvent('drop', dt));

        const gap = el.shadowRoot.querySelector('.bc-gap-end');
        gap.dispatchEvent(dragEvent('dragover', dt));
        expect(gap.classList.contains('bc-gap-over')).toBe(true);
        gap.dispatchEvent(dragEvent('drop', dt));

        const chips = el.shadowRoot.querySelectorAll('.bc-chip');
        chips[1].dispatchEvent(dragEvent('drop', dt));

        expect(drops).toEqual([
            { beforeSectionId: 'sec_1', pageId: 'pg_1' },
            { beforeSectionId: null, pageId: 'pg_1' },
            { pageId: 'pg_2' }
        ]);
    });

    it('repeat sections wear the child-object chip on the blueprint', () => {
        const spec = JSON.parse(JSON.stringify(SPEC));
        spec.pages[0].sections.push({
            id: 'sec_rep',
            title: 'Line items',
            repeat: { childObject: 'OrderItem__c' },
            elements: []
        });
        const el = mount({ spec });
        const chip = el.shadowRoot.querySelector('.bc-repeat');
        expect(chip.textContent).toContain('OrderItem__c');
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

    // ---- schema §4.1: no file elements inside repeatable sections ----
    //
    // A flat `files` array keyed by elementId can't tell entry 1's file from
    // entry 2's, so it could never be attached to the right child record — and
    // N × the base64 cap is a heap bomb. `file` is a BLOCK, and blocks
    // otherwise land anywhere, so this needs its own guard.

    /** SPEC + a repeatable section, mounted. */
    function mountWithRepeater() {
        const spec = JSON.parse(JSON.stringify(SPEC));
        spec.pages[0].sections.push({
            id: 'sec_rep',
            title: 'Line items',
            repeat: { childObject: 'OrderItem__c' },
            elements: []
        });
        return mount({ spec });
    }

    /** Mid-drag, only dataTransfer TYPES are readable — a file block stamps
     *  the generic block marker plus its own narrower one. */
    function blockDrag(isFile) {
        const dt = makeDataTransfer();
        dt.types.push(PALETTE_EL_MIME);
        if (isFile) {
            dt.types.push(PALETTE_FILE_MIME);
        }
        return dt;
    }

    function dragOver(node, dt) {
        const over = dragEvent('dragover', dt);
        const pd = jest.spyOn(over, 'preventDefault');
        node.dispatchEvent(over);
        return pd;
    }

    it('§4.1: a File Upload block is refused over a repeatable section', () => {
        const el = mountWithRepeater();
        const repeater = el.shadowRoot.querySelectorAll('.bc-section')[1];
        const dt = blockDrag(true);

        expect(dragOver(repeater, dt)).not.toHaveBeenCalled(); // native no-drop
        expect(dt.dropEffect).toBe('none');
    });

    it('§4.1: the same File Upload block IS accepted over a plain section', () => {
        const el = mountWithRepeater();
        const plain = el.shadowRoot.querySelectorAll('.bc-section')[0];
        const dt = blockDrag(true);

        expect(dragOver(plain, dt)).toHaveBeenCalled();
        expect(dt.dropEffect).toBe('copy');
    });

    it('§4.1: a File Upload block still drops in a gap (outside every section)', () => {
        const el = mountWithRepeater();
        const gap = el.shadowRoot.querySelector('.bc-gap');
        const dt = blockDrag(true);

        expect(dragOver(gap, dt)).toHaveBeenCalled();
        expect(dt.dropEffect).toBe('copy');
    });

    it('§4.1 is scoped to file: other blocks still enter a repeatable section', () => {
        const el = mountWithRepeater();
        const repeater = el.shadowRoot.querySelectorAll('.bc-section')[1];
        const dt = blockDrag(false); // e.g. Rich text / Divider

        expect(dragOver(repeater, dt)).toHaveBeenCalled();
        expect(dt.dropEffect).toBe('copy');
    });
});
