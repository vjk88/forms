import { createElement } from 'lwc';
import FinalCreationGallery from 'c/finalCreationGallery';

// The new-form live preview shrinks to fit its pane (owner 2026-10-31):
// the frame keeps laying out at its real device width, and a scale
// transform draws it smaller, so nothing is cut off on the right.
jest.mock(
    '@salesforce/apex/FinalFormCreateController.getUpdatableObjects',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalFormCreateController.createForm',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalFormCreateController.createSurveyFromTemplate',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalFormCreateController.createFreeformFromTemplate',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

let observers = [];
class FakeResizeObserver {
    constructor(cb) {
        this.cb = cb;
        this.targets = [];
        observers.push(this);
    }
    observe(t) {
        this.targets.push(t);
    }
    disconnect() {
        this.targets = [];
    }
}

function size(node, props) {
    for (const [key, value] of Object.entries(props)) {
        Object.defineProperty(node, key, { configurable: true, value });
    }
}

async function openDetails() {
    const el = createElement('c-final-creation-gallery', {
        is: FinalCreationGallery
    });
    document.body.appendChild(el);
    await flush();
    [...el.shadowRoot.querySelectorAll('.type-card')]
        .find((c) => c.querySelector('.type-name').textContent === 'Freeform')
        .click();
    await flush();
    el.shadowRoot.querySelector('.tpl-grid .tpl-card').click();
    await flush();
    el.shadowRoot
        .querySelector('c-final-layout-card')
        .dispatchEvent(
            new CustomEvent('select', { detail: { layout: 'scroll' } })
        );
    await flush();
    el.shadowRoot
        .querySelector('c-final-theme-gallery')
        .dispatchEvent(
            new CustomEvent('themeselect', { detail: { themeKey: 'nordic' } })
        );
    await flush();
    return el;
}

/** Give the pane and the frame sizes, then fire the observer. */
async function measure(el, stageWidth, frameWidth, frameHeight) {
    const stage = el.shadowRoot.querySelector('.d-stage');
    const frame = stage.querySelector('.pv-fit > div');
    // jsdom keeps the stylesheet's 1rem padding unresolved: zero it so the
    // room is the whole client width
    stage.style.padding = '0px';
    size(stage, { clientWidth: stageWidth });
    size(frame, { offsetWidth: frameWidth, offsetHeight: frameHeight });
    const live = observers.find((o) => o.targets.includes(stage));
    live.cb([]);
    await flush();
    return {
        fit: el.shadowRoot.querySelector('.pv-fit'),
        frame: el.shadowRoot.querySelector('.pv-fit > div')
    };
}

describe('new-form preview shrinks to fit', () => {
    beforeEach(() => {
        observers = [];
        global.ResizeObserver = FakeResizeObserver;
    });
    afterEach(() => {
        delete global.ResizeObserver;
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('a 1024px desktop in a narrower pane is drawn smaller, laid out full size', async () => {
        const el = await openDetails();
        const { fit, frame } = await measure(el, 768, 1024, 2000);
        expect(frame.style.width).toBe('1024px');
        expect(frame.style.transform).toBe('scale(0.75)');
        expect(frame.style.transformOrigin).toBe('0 0');
        expect(fit.style.width).toBe('768px');
        expect(fit.style.height).toBe('1500px');
    });

    it('switching device re-fits the same frame: a phone needs no shrink', async () => {
        const el = await openDetails();
        await measure(el, 768, 1024, 2000);
        el.shadowRoot.querySelector('.dev-btn[data-value="mobile"]').click();
        await flush();
        const { fit, frame } = await measure(el, 768, 390, 1200);
        expect(frame.style.width).toBe('390px');
        expect(frame.style.transform).toBe('');
        expect(fit.getAttribute('style')).toBeFalsy();
    });

    it('leaving the step and coming back watches the new pane', async () => {
        const el = await openDetails();
        const first = observers.length;
        el.shadowRoot.querySelector('.d-back').click();
        await flush();
        el.shadowRoot
            .querySelector('c-final-theme-gallery')
            .dispatchEvent(
                new CustomEvent('themeselect', {
                    detail: { themeKey: 'nordic' }
                })
            );
        await flush();
        expect(observers.length).toBe(first + 1);
        expect(observers[first - 1].targets).toEqual([]);
        const { frame } = await measure(el, 512, 1024, 1000);
        expect(frame.style.transform).toBe('scale(0.5)');
    });

    it('a pane wide enough draws it at real size, untouched', async () => {
        const el = await openDetails();
        const { fit, frame } = await measure(el, 1400, 1024, 2000);
        expect(frame.style.width).toBe('1024px');
        expect(frame.style.transform).toBe('');
        expect(fit.getAttribute('style')).toBeFalsy();
    });

    it('stops watching when the gallery closes', async () => {
        const el = await openDetails();
        const stage = el.shadowRoot.querySelector('.d-stage');
        const live = observers.find((o) => o.targets.includes(stage));
        document.body.removeChild(el);
        expect(live.targets).toEqual([]);
    });
});
