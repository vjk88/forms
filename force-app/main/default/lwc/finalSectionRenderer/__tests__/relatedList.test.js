import { createElement } from 'lwc';
import FinalSectionRenderer from 'c/finalSectionRenderer';

// Related lists on a record page (IMPL_PLAN_RELATED_RECORDS Part 2, slice 1):
// existing records, read-only, as Cards or a Table that falls back to Cards
// when this component is too narrow for a column per question.
const LIST = (extra = {}) => ({
    state: 'ready',
    ready: true,
    loading: false,
    failed: false,
    empty: false,
    nameLabel: 'Case',
    openText: 'Open Case',
    columns: [
        { key: 'el_subj', label: 'Subject' },
        { key: 'el_prio', label: 'Priority' },
        { key: 'el_area', label: 'Area' }
    ],
    rows: [
        {
            id: '500A',
            name: '00001026',
            href: '/lightning/r/Case/500A/view',
            openLabel: 'Open Case 00001026',
            openSr: ' 00001026 (opens in a new tab)',
            cells: [
                {
                    key: 'el_subj',
                    label: 'Subject',
                    value: 'Printer',
                    empty: false
                },
                { key: 'el_prio', label: 'Priority', value: '', empty: true },
                {
                    key: 'el_area',
                    label: 'Area',
                    value: '',
                    hidden: true,
                    empty: false
                }
            ],
            cardCells: [
                {
                    key: 'el_subj',
                    label: 'Subject',
                    value: 'Printer',
                    empty: false
                },
                { key: 'el_prio', label: 'Priority', value: '', empty: true }
            ]
        }
    ],
    moreText: 'Showing 1 of 312.',
    viewAllHref: '/lightning/r/Contact/003A/related/Cases/view',
    ...extra
});

const SECTION = (style = 'stacked', list = LIST()) => ({
    id: 'sec_cases',
    title: 'Open cases',
    columns: 1,
    repeat: { childObject: 'Case', relationshipField: 'ContactId', style },
    elements: [],
    entries: [],
    repeatLimits: { min: 0, max: 0 },
    list
});

const flush = () => Promise.resolve();

async function mount(section, width = 1000) {
    const el = createElement('c-final-section-renderer', {
        is: FinalSectionRenderer
    });
    el.getBoundingClientRect = () => ({ width });
    el.section = section;
    document.body.appendChild(el);
    await flush();
    await flush();
    return el;
}

describe('c-final-section-renderer related lists', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('Cards: the record name heads each card, with Open Case in a new tab', async () => {
        const el = await mount(SECTION());
        const card = el.shadowRoot.querySelector('.rl-card');
        expect(card.getAttribute('aria-label')).toBe('00001026');
        expect(card.querySelector('.rl-card-name').textContent).toBe(
            '00001026'
        );
        const open = card.querySelector('.rl-open');
        expect(open.getAttribute('href')).toBe('/lightning/r/Case/500A/view');
        expect(open.getAttribute('target')).toBe('_blank');
        expect(open.textContent.replace(/\s+/g, ' ')).toContain(
            'Open Case 00001026 (opens in a new tab)'
        );
        // a question a rule hides is left out of the card
        expect(card.querySelectorAll('dt')).toHaveLength(2);
        const dds = card.querySelectorAll('dd');
        expect(dds[0].textContent.trim()).toBe('Printer');
        expect(dds[1].textContent).toContain('No value');
        // read-only: nothing to type into, no Add, no ×
        expect(
            el.shadowRoot.querySelector('c-final-element-renderer')
        ).toBeNull();
        expect(el.shadowRoot.querySelector('.rep-add')).toBeNull();
        expect(el.shadowRoot.querySelector('.rep-remove')).toBeNull();
        expect(el.shadowRoot.querySelector('.rl-more').textContent).toContain(
            'Showing 1 of 312.'
        );
    });

    it('Table when chosen and there is room; Cards when there is not', async () => {
        const wide = await mount(SECTION('table'), 1000);
        // 140 + 3 × 140 = 560 needed
        const table = wide.shadowRoot.querySelector('.rl-table');
        expect(table).not.toBeNull();
        expect(
            [...table.querySelectorAll('thead th')].map((t) =>
                t.textContent.trim()
            )
        ).toEqual(['Case', 'Subject', 'Priority', 'Area']);
        expect(table.getAttribute('aria-label')).toBe('Open cases');
        const link = table.querySelector('tbody th a');
        expect(link.textContent.replace(/\s+/g, ' ')).toContain(
            '00001026 (opens in a new tab)'
        );
        // the hidden cell is empty in the table, not "No value"
        expect(table.querySelectorAll('tbody td')[2].textContent.trim()).toBe(
            ''
        );
        expect(link.getAttribute('href')).toBe('/lightning/r/Case/500A/view');

        const narrow = await mount(SECTION('table'), 300);
        expect(narrow.shadowRoot.querySelector('.rl-table')).toBeNull();
        expect(narrow.shadowRoot.querySelector('.rl-card')).not.toBeNull();
    });

    it('loading, empty and failed say so; Try again asks the viewer', async () => {
        const loading = await mount(
            SECTION(
                'stacked',
                LIST({
                    state: 'loading',
                    loading: true,
                    ready: false,
                    loadingText: 'Loading Cases…',
                    rows: [],
                    moreText: ''
                })
            )
        );
        expect(
            loading.shadowRoot.querySelector('.rl-status').textContent.trim()
        ).toBe('Loading Cases…');
        const empty = await mount(
            SECTION(
                'stacked',
                LIST({
                    empty: true,
                    emptyText: 'No Cases yet.',
                    rows: [],
                    moreText: ''
                })
            )
        );
        expect(
            empty.shadowRoot.querySelector('.rl-status').textContent.trim()
        ).toBe('No Cases yet.');
        const failed = await mount(
            SECTION(
                'stacked',
                LIST({
                    state: 'failed',
                    failed: true,
                    ready: false,
                    errorText: 'These Cases couldn’t be loaded.',
                    rows: [],
                    moreText: ''
                })
            )
        );
        const asks = [];
        document.body.addEventListener('relatedlistretry', (e) =>
            asks.push(e.detail)
        );
        failed.shadowRoot.querySelector('.rl-retry').click();
        expect(asks).toEqual([{ sectionId: 'sec_cases' }]);
        expect(failed.shadowRoot.activeElement).toBe(
            failed.shadowRoot.querySelector('.rl')
        );
    });

    it('the Studio preview shows a read-only list as one line', async () => {
        const section = SECTION();
        delete section.list;
        section.listNote = 'Existing records appear here on a record page.';
        const el = await mount(section);
        expect(el.shadowRoot.querySelector('.rl-status').textContent).toBe(
            'Existing records appear here on a record page.'
        );
        expect(el.shadowRoot.querySelector('.rep-add')).toBeNull();
    });
});

describe('c-final-section-renderer editable related lists (slice 2)', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const EDITABLE = (style = 'stacked') => ({
        id: 'sec_cases',
        title: 'Open cases',
        columns: 1,
        repeat: {
            childObject: 'Case',
            relationshipField: 'ContactId',
            entryLabel: 'Case {index}',
            style
        },
        elements: [
            {
                id: 'el_subj',
                type: 'field',
                label: 'Subject',
                config: { inputType: 'text' }
            },
            {
                id: 'el_prio',
                type: 'field',
                label: 'Priority',
                config: { inputType: 'text' }
            }
        ],
        repeatLimits: { min: 0, max: 5 },
        nextEntrySeq: 1,
        listRevision: 3,
        listMore: '',
        entries: [
            {
                key: '500A',
                values: { el_subj: 'Printer', el_prio: 'High' },
                existing: {
                    name: '00001026',
                    href: '/lightning/r/Case/500A/view',
                    openSr: ' 00001026 (opens in a new tab)',
                    canEdit: true,
                    locked: ['el_prio'],
                    labels: {}
                }
            },
            {
                key: '500B',
                values: { el_subj: 'Login' },
                existing: {
                    name: '00001027',
                    href: null,
                    openSr: '',
                    canEdit: false,
                    locked: [],
                    labels: {}
                }
            },
            { key: 'en_0', values: { el_subj: 'New one' } }
        ]
    });

    const els = (el) =>
        [...el.shadowRoot.querySelectorAll('c-final-element-renderer')].map(
            (r) => r.element
        );

    it('Cards: loaded rows carry their name and link, no ×; locked fields are read-only', async () => {
        const el = await mount(EDITABLE());
        const labels = [
            ...el.shadowRoot.querySelectorAll('.rep-entry-label')
        ].map((n) => n.textContent);
        expect(labels).toEqual(['00001026', '00001027', 'New Case 1']);
        const entries = el.shadowRoot.querySelectorAll('.rep-entry');
        expect(
            entries[0]
                .querySelector('.rl-open')
                .textContent.replace(/\s+/g, ' ')
        ).toBe('Open 00001026 (opens in a new tab)');
        expect(entries[0].querySelector('.rep-remove')).toBeNull();
        expect(entries[2].querySelector('.rep-remove')).not.toBeNull();
        const byId = new Map(els(el).map((e) => [e.id, e]));
        expect(byId.get('el_subj::500A').readOnly).toBeUndefined();
        expect(byId.get('el_prio::500A').readOnly).toBe(true);
        expect(byId.get('el_subj::500B').readOnly).toBe(true); // no edit access
        expect(byId.get('el_subj::en_0').value).toBe('New one');
    });

    it('Table: a control per cell without its own label, × only on new rows', async () => {
        const el = await mount(EDITABLE('table'), 1000);
        const table = el.shadowRoot.querySelector('.rl-table');
        expect(table).not.toBeNull();
        const rows = table.querySelectorAll('tbody tr');
        expect(rows).toHaveLength(3);
        const cell = rows[0].querySelector('td c-final-element-renderer');
        expect(cell.element.labelPosition).toBe('hidden');
        expect(cell.element.id).toBe('el_subj::500A');
        expect(rows[0].querySelector('.rep-remove')).toBeNull();
        expect(rows[2].querySelector('.rep-remove')).not.toBeNull();
        // an editable cell needs 200px: 140 + 2 × 200 = 540 > 440 → cards
        const mid = await mount(EDITABLE('table'), 440);
        expect(mid.shadowRoot.querySelector('.rl-table')).toBeNull();
        // too narrow: the same rows as cards
        const narrow = await mount(EDITABLE('table'), 300);
        expect(narrow.shadowRoot.querySelector('.rl-table')).toBeNull();
        expect(narrow.shadowRoot.querySelectorAll('.rep-entry')).toHaveLength(
            3
        );
    });
});
