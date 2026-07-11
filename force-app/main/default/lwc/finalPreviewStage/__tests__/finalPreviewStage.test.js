import { createElement } from 'lwc';
import FinalPreviewStage from 'c/finalPreviewStage';

// the stage mounts the REAL viewer — satisfy its module surface
jest.mock(
    'lightning/navigation',
    () => {
        const {
            createTestWireAdapter
        } = require('@salesforce/wire-service-jest-util');
        const Navigate = Symbol('Navigate');
        const NavigationMixin = (Base) => class extends Base {};
        NavigationMixin.Navigate = Navigate;
        return {
            CurrentPageReference: createTestWireAdapter(jest.fn()),
            NavigationMixin
        };
    },
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSpecController.getSpec',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSubmitController.submitForm',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalThemeController.getCustomTheme',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const SPEC = {
    specVersion: 1,
    form: { name: 'T' },
    layout: { type: 'scroll', options: {} },
    header: { style: 'none' },
    theme: { source: 'builtin', name: 'editorialIvory', overrides: {} },
    pages: [],
    submit: { label: 'Submit' }
};

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(props = {}) {
    const el = createElement('c-final-preview-stage', {
        is: FinalPreviewStage
    });
    Object.assign(el, { spec: SPEC, ...props });
    document.body.appendChild(el);
    await flush();
    return el;
}

describe('c-final-preview-stage', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('defaults to Desktop: 1280px canvas + synthetic device viewport offset', async () => {
        const el = await mount();
        const buttons = el.shadowRoot.querySelectorAll('.ps-device');
        expect(buttons).toHaveLength(3);
        expect(buttons[0].classList.contains('on')).toBe(true);
        expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
        const style = el.shadowRoot
            .querySelector('.ps-canvas')
            .getAttribute('style');
        expect(style).toContain('width:1280px');
        // --frame-offset trick: min-height calc resolves to the device height
        expect(style).toContain('calc(100dvh - 800px)');
    });

    it('device toggle re-lays-out the canvas at the device width', async () => {
        const el = await mount();
        el.shadowRoot.querySelector('[data-device="mobile"]').click();
        await flush();
        const style = el.shadowRoot
            .querySelector('.ps-canvas')
            .getAttribute('style');
        expect(style).toContain('width:390px');
        expect(style).toContain('calc(100dvh - 844px)');
        expect(
            el.shadowRoot
                .querySelector('[data-device="mobile"]')
                .classList.contains('on')
        ).toBe(true);
    });

    it('renders the REAL viewer with spec + authoring + forced embedded surface', async () => {
        const el = await mount({ authoring: true });
        const viewer = el.shadowRoot.querySelector('c-final-form-viewer');
        expect(viewer).not.toBeNull();
        expect(viewer.spec).toEqual(SPEC);
        expect(viewer.authoring).toBe(true);
        expect(viewer.embedded).toBe(true);
    });

    it('refresh REMOUNTS the viewer — a clean first run, not a patched one', async () => {
        const el = await mount();
        const before = el.shadowRoot.querySelector('c-final-form-viewer');
        el.shadowRoot.querySelector('.ps-refresh').click();
        await flush();
        const after = el.shadowRoot.querySelector('c-final-form-viewer');
        expect(after).not.toBeNull();
        expect(after).not.toBe(before);
    });

    it('relays elementselect across its shadow boundary (preview-click sync)', async () => {
        const el = await mount({ authoring: true });
        const seen = [];
        el.addEventListener('elementselect', (e) => seen.push(e.detail));
        el.shadowRoot.querySelector('c-final-form-viewer').dispatchEvent(
            new CustomEvent('elementselect', {
                detail: { elementId: 'el_x' }
            })
        );
        expect(seen).toEqual([{ elementId: 'el_x' }]);
    });
});
