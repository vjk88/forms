import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';
import { getBuiltinTheme } from 'c/finalThemeCatalog';

// The P2 gate at unit level: the published (resolved) path must NEVER import
// the theme catalog — managed recipes stay out of the delivered render. The
// mock intercepts the viewer's dynamic import too.
jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => ({
        palette: { accent: '#0f766e' }
    }))
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

const baseSpec = () => ({
    specVersion: 1,
    layout: { type: 'scroll' },
    theme: { source: 'builtin', name: 'editorialIvory' },
    header: { style: 'standard', title: 'T' },
    submit: {},
    pages: [{ key: 'p1', sections: [] }]
});

function mount(spec) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.spec = spec;
    document.body.appendChild(el);
    return el;
}

describe('resolved-spec render path (resolve-at-publish gate)', () => {
    beforeEach(() => jest.clearAllMocks());
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('published spec: tokens come from the snapshot; the catalog is never touched', async () => {
        const spec = baseSpec();
        spec.resolved = {
            tokens: { '--c-accent': '#b34700' },
            engineVersion: 1,
            resolvedAt: '2026-07-06T00:00:00Z'
        };
        const el = mount(spec);
        await flush();
        await flush();
        expect(getBuiltinTheme).not.toHaveBeenCalled();
        const frame = el.shadowRoot.querySelector('c-final-page-frame');
        expect(frame).not.toBeNull();
        // pageFrame writes tokens as inline custom properties on its host
        expect(frame.style.getPropertyValue('--c-accent')).toBe('#b34700');
    });

    it('draft spec: the catalog loads and the engine runs live', async () => {
        const el = mount(baseSpec());
        await flush();
        await flush();
        expect(getBuiltinTheme).toHaveBeenCalledWith('editorialIvory');
        const frame = el.shadowRoot.querySelector('c-final-page-frame');
        expect(frame.style.getPropertyValue('--c-accent')).toBe('#0f766e');
    });
});
