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
    it('restores a handed-off session and Restart clears it without changing device', async () => {
        const spec = {
            ...SPEC,
            pages: [
                {
                    id: 'p',
                    sections: [
                        {
                            id: 's',
                            elements: [
                                {
                                    id: 'q',
                                    type: 'field',
                                    config: { inputType: 'text' }
                                }
                            ]
                        }
                    ]
                }
            ]
        };
        const el = await mount({ spec, preserveSession: true });
        el.shadowRoot.querySelector('[data-device="mobile"]').click();
        el.shadowRoot.querySelector('[data-zoom="actual"]').click();
        el.shadowRoot
            .querySelector('c-final-form-viewer')
            .shadowRoot.querySelector('x-test')
            .dispatchEvent(
                new CustomEvent('valuechange', {
                    detail: { elementId: 'q', value: 'Hello' }
                })
            );
        const session = el.getSession();
        el.remove();
        const restored = await mount({ spec, preserveSession: true, session });
        expect(restored.getSession().device).toBe('mobile');
        expect(restored.getSession().zoom).toBe('actual');
        expect(restored.getSession().viewer.answers.q).toBe('Hello');
        expect(
            restored.shadowRoot
                .querySelector('c-final-form-viewer')
                .shadowRoot.querySelector('x-test').pages[0].sections[0]
                .elements[0].value
        ).toBe('Hello');
        restored.shadowRoot.querySelector('.ps-refresh').click();
        await flush();
        expect(restored.getSession().device).toBe('mobile');
        expect(restored.getSession().zoom).toBe('actual');
        expect(restored.getSession().viewer.answers).toEqual({});
    });
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
        expect(el.getSession().zoom).toBe('fit');
        expect(
            el.shadowRoot
                .querySelector('[data-zoom="fit"]')
                .getAttribute('aria-pressed')
        ).toBe('true');
    });

    it.each([undefined, 'invalid'])(
        'defaults an older or invalid zoom session to Fit (%s)',
        async (zoom) => {
            const el = await mount({ session: { device: 'tablet', zoom } });
            expect(el.getSession().zoom).toBe('fit');
            expect(el.getSession().device).toBe('tablet');
        }
    );

    describe('preview sizing', () => {
        let observers;
        let frames;
        let originalResizeObserver;

        beforeEach(() => {
            observers = [];
            frames = [];
            originalResizeObserver = global.ResizeObserver;
            global.ResizeObserver = jest.fn().mockImplementation((callback) => {
                observers.push(callback);
                return { observe: jest.fn(), disconnect: jest.fn() };
            });
            jest.spyOn(window, 'requestAnimationFrame').mockImplementation(
                (callback) => frames.push(callback)
            );
            jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(
                () => {}
            );
        });

        afterEach(() => {
            global.ResizeObserver = originalResizeObserver;
            jest.restoreAllMocks();
        });

        async function resize() {
            observers.forEach((callback) => callback());
            frames.splice(0).forEach((callback) => callback());
            await flush();
        }

        it('fits a narrow pane, switches to actual size without remounting, and resets horizontal scroll on Fit', async () => {
            const el = await mount();
            const viewport = el.shadowRoot.querySelector('.ps-viewport');
            const canvas = el.shadowRoot.querySelector('.ps-canvas');
            const surface = el.shadowRoot.querySelector('.ps-surface');
            const viewer = el.shadowRoot.querySelector('c-final-form-viewer');
            Object.defineProperty(viewport, 'clientWidth', {
                configurable: true,
                value: 940
            });
            Object.defineProperty(canvas, 'offsetHeight', {
                configurable: true,
                value: 800
            });
            await resize();
            expect(canvas.style.width).toBe('1280px');
            expect(canvas.style.transform).toContain('scale(0.734375)');
            expect(surface.style.width).toBe('940px');
            expect(surface.style.height).toBe('588px');
            expect(el.shadowRoot.querySelector('.ps-scale').textContent).toBe(
                '73%'
            );

            el.shadowRoot.querySelector('[data-zoom="actual"]').click();
            await resize();
            expect(canvas.style.width).toBe('1280px');
            expect(canvas.style.transform).toContain('scale(1)');
            expect(surface.style.width).toBe('1280px');
            expect(surface.style.height).toBe('800px');
            expect(
                el.shadowRoot
                    .querySelector('[data-zoom="actual"]')
                    .getAttribute('aria-pressed')
            ).toBe('true');
            expect(el.shadowRoot.querySelector('c-final-form-viewer')).toBe(
                viewer
            );

            Object.defineProperty(viewport, 'clientWidth', {
                configurable: true,
                value: 640
            });
            await resize();
            expect(canvas.style.transform).toContain('scale(1)');
            viewport.scrollLeft = 300;
            el.shadowRoot.querySelector('[data-zoom="fit"]').click();
            await resize();
            expect(canvas.style.transform).toContain('scale(0.5)');
            expect(surface.style.width).toBe('640px');
            expect(surface.style.height).toBe('400px');
            expect(viewport.scrollLeft).toBe(0);

            Object.defineProperty(canvas, 'offsetHeight', {
                configurable: true,
                value: 1200
            });
            await resize();
            expect(surface.style.height).toBe('600px');
        });

        it('centers mobile at its natural size without upscaling and preserves zoom across device changes', async () => {
            const el = await mount();
            const viewport = el.shadowRoot.querySelector('.ps-viewport');
            const canvas = el.shadowRoot.querySelector('.ps-canvas');
            Object.defineProperty(viewport, 'clientWidth', { value: 940 });
            Object.defineProperty(canvas, 'offsetHeight', { value: 844 });
            el.shadowRoot.querySelector('[data-device="mobile"]').click();
            await resize();
            expect(canvas.style.width).toBe('390px');
            expect(canvas.style.transform).toBe('translateX(275px) scale(1)');
            el.shadowRoot.querySelector('[data-zoom="actual"]').click();
            el.shadowRoot.querySelector('[data-device="desktop"]').click();
            await resize();
            expect(el.getSession().zoom).toBe('actual');
            expect(canvas.style.transform).toBe('translateX(0px) scale(1)');
        });
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
