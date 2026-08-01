import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));

// SURVEY_PLAN §10 Q4: settings.onePerScreen — render-time auto-split. The
// authored spec keeps its pages/sections; the viewer mints one virtual page
// per question, headers ride only the section's first question, repeaters
// stay atomic, and scroll (non-paginating) ignores the toggle.
const el = (id) => ({
    id,
    type: 'field',
    label: id,
    render: { inputType: 'text' }
});

const SPEC = (layoutType, onePerScreen, formType) => ({
    specVersion: 1,
    form: { name: 'S', type: formType || 'survey' },
    layout: { type: layoutType },
    header: { style: 'none' },
    theme: null,
    submit: { label: 'Send' },
    settings: { onePerScreen },
    pages: [
        {
            id: 'pg_1',
            name: 'One',
            sections: [
                {
                    id: 'sec_1',
                    title: 'About you',
                    style: 'plain',
                    columns: 1,
                    elements: [el('el_a'), el('el_b')]
                },
                {
                    id: 'sec_2',
                    title: 'Repeat',
                    style: 'plain',
                    columns: 1,
                    repeat: { min: 1 },
                    elements: [el('el_r1'), el('el_r2')]
                }
            ]
        },
        {
            id: 'pg_2',
            name: 'Two',
            sections: [
                {
                    id: 'sec_3',
                    title: 'Wrap up',
                    style: 'plain',
                    columns: 1,
                    elements: [el('el_c')]
                }
            ]
        }
    ]
});

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(spec) {
    const cmp = createElement('c-final-form-viewer', { is: FinalFormViewer });
    cmp.spec = spec;
    document.body.appendChild(cmp);
    await flush();
    await flush();
    return cmp;
}

// the dynamic nav (lwc:is) mounts as x-test under sfdx-lwc-jest; it still
// carries the real nav @api surface (pages etc.)
function nav(cmp) {
    const frame = cmp.shadowRoot.querySelector('c-final-page-frame');
    return frame.querySelector('x-test');
}

describe('one question per screen (survey auto-split)', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('splits questions into virtual pages; repeaters stay atomic', async () => {
        const cmp = await mount(SPEC('stepper', true));
        const pages = nav(cmp).pages;
        // el_a, el_b, repeater (whole), el_c → 4 screens from 2 authored pages
        expect(pages.length).toBe(4);
        expect(pages[0].sections[0].elements[0].id).toBe('el_a');
        expect(pages[1].sections[0].elements[0].id).toBe('el_b');
        expect(pages[2].sections[0].repeat).toBeTruthy();
        expect(pages[2].sections[0].elements.length).toBe(2);
        expect(pages[3].sections[0].elements[0].id).toBe('el_c');
        // virtual identities are unique
        expect(new Set(pages.map((p) => p.id)).size).toBe(4);
    });

    it('elements without ids still get unique virtual page keys (no p~undefined collisions)', async () => {
        const spec = SPEC('stepper', true);
        // hand-authored JSON is the only id-less path — the builder stamps ids
        delete spec.pages[0].sections[0].elements[0].id;
        delete spec.pages[0].sections[0].elements[1].id;
        const cmp = await mount(spec);
        const pages = nav(cmp).pages;
        expect(pages.length).toBe(4);
        const ids = pages.map((p) => p.id);
        expect(new Set(ids).size).toBe(4);
        expect(ids.some((id) => String(id).includes('undefined'))).toBe(false);
    });

    it('section header rides only the FIRST question of its section', async () => {
        const cmp = await mount(SPEC('stepper', true));
        const pages = nav(cmp).pages;
        expect(pages[0].sections[0].showHeader).not.toBe(false);
        expect(pages[0].sections[0].title).toBe('About you');
        expect(pages[1].sections[0].showHeader).toBe(false);
    });

    it('virtual sections carry the conversational-scale stamp; repeaters do not', async () => {
        const cmp = await mount(SPEC('stepper', true));
        const pages = nav(cmp).pages;
        expect(pages[0].sections[0].convo).toBe(true);
        expect(pages[1].sections[0].convo).toBe(true);
        // a repeater screen is a whole unit, not a lone headline question
        expect(pages[2].sections[0].convo).toBeUndefined();
    });

    it('keepTogether sections ride ONE screen through the split', async () => {
        const spec = SPEC('stepper', true);
        spec.pages[0].sections[0].keepTogether = true; // el_a + el_b together
        const cmp = await mount(spec);
        const pages = nav(cmp).pages;
        // [el_a + el_b], repeater, el_c → 3 screens instead of 4
        expect(pages.length).toBe(3);
        expect(pages[0].sections[0].elements.length).toBe(2);
        // a multi-input screen keeps the normal type scale, not the headline
        expect(pages[0].sections[0].convo).toBeUndefined();
    });

    it('toggle off / non-survey / scroll layout: no split', async () => {
        const off = await mount(SPEC('stepper', false));
        expect(nav(off).pages.length).toBe(2);

        const form = await mount(SPEC('stepper', true, 'form'));
        expect(nav(form).pages.length).toBe(2);

        const scroll = await mount(SPEC('scroll', true));
        expect(nav(scroll).pages.length).toBe(2);
    });

    it('a rule-hidden question drops its screen instead of going blank', async () => {
        const spec = SPEC('stepper', true);
        spec.pages[0].sections[0].elements[1].visibility = {
            action: 'show',
            logic: 'all',
            rules: [{ source: 'el_a', operator: 'equals', value: 'show-b' }]
        };
        const cmp = await mount(spec);
        // el_b hidden until el_a === 'show-b' → 3 screens
        expect(nav(cmp).pages.length).toBe(3);
        expect(nav(cmp).pages.map((p) => p.sections[0].elements[0].id)).toEqual(
            ['el_a', 'el_r1', 'el_c']
        );
    });
});
