import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';

// Surveys are always top-labeled (owner 2026-07-31). The clamp lands on the
// TOKEN BAG so a published resolved spec carrying a left-label theme is
// corrected too — that path never re-runs the engine.
jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => ({
        palette: { accent: '#0f766e' }
    }))
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

const LEFT_TOKENS = {
    '--c-accent': '#b34700',
    '--c-label-flow': 'row',
    '--c-label-basis': '0 0 10rem',
    '--c-label-mb': '0px',
    '--c-label-gap': '8px',
    '--c-label-align': 'center'
};

const spec = (formType) => ({
    specVersion: 1,
    form: { type: formType },
    layout: { type: 'scroll' },
    theme: { source: 'builtin', name: 'editorialIvory' },
    header: { style: 'standard', title: 'T' },
    submit: {},
    pages: [{ key: 'p1', sections: [] }],
    resolved: {
        tokens: { ...LEFT_TOKENS },
        engineVersion: 1,
        resolvedAt: '2026-07-31T00:00:00Z'
    }
});

function mount(s) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.spec = s;
    document.body.appendChild(el);
    return el;
}

describe('survey label clamp (always top)', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('survey: a left-label resolved theme is clamped to the top flow', async () => {
        const el = mount(spec('survey'));
        await flush();
        await flush();
        const frame = el.shadowRoot.querySelector('c-final-page-frame');
        expect(frame.style.getPropertyValue('--c-label-flow')).toBe('column');
        expect(frame.style.getPropertyValue('--c-label-basis')).toBe('none');
        expect(frame.style.getPropertyValue('--c-label-mb')).toBe(
            'var(--c-space-1)'
        );
        // the rest of the bag passes through untouched
        expect(frame.style.getPropertyValue('--c-accent')).toBe('#b34700');
    });

    it('form: the same theme keeps its left flow', async () => {
        const el = mount(spec('form'));
        await flush();
        await flush();
        const frame = el.shadowRoot.querySelector('c-final-page-frame');
        expect(frame.style.getPropertyValue('--c-label-flow')).toBe('row');
    });
});
