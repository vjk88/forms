import { createElement } from 'lwc';
import FinalElementRenderer from 'c/finalElementRenderer';

/**
 * A scale row wraps by what is measured (finalScaleLayout), so the renderer has
 * to measure at the right moments: after it renders, and whenever its column
 * changes width (a resize, a panel or tab opening). jsdom has no layout, so the
 * widths come from a stubbed getComputedStyle and a stubbed ResizeObserver.
 */
const real = window.getComputedStyle.bind(window);

let observers;
let styles;

const mount = (element) => {
    const el = createElement('c-final-element-renderer', {
        is: FinalElementRenderer
    });
    el.element = element;
    document.body.appendChild(el);
    return el;
};

/** Gives the column, the row and every button of a mounted scale a size. */
const size = (el, { column, button, gap }) => {
    const root = el.shadowRoot;
    const field = root.querySelector('.field');
    const row = root.querySelector('.scale-row');
    styles.set(field, {
        width: `${column}px`,
        paddingLeft: '0px',
        paddingRight: '0px'
    });
    styles.set(row, { columnGap: `${gap}px` });
    row.querySelectorAll('button').forEach((b) =>
        styles.set(b, { width: `${button}px` })
    );
    return { field, row };
};

beforeEach(() => {
    observers = [];
    styles = new Map();
    global.ResizeObserver = class {
        constructor(callback) {
            this.callback = callback;
            this.observed = [];
            this.disconnected = false;
            observers.push(this);
        }

        observe(node) {
            this.observed.push(node);
        }

        disconnect() {
            this.disconnected = true;
        }
    };
    window.getComputedStyle = (node) => {
        const mine = styles.get(node);
        return mine ? { boxSizing: 'content-box', ...mine } : real(node);
    };
});

afterEach(() => {
    delete global.ResizeObserver;
    window.getComputedStyle = real;
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('a scale is measured when it renders and when its column resizes', () => {
    const NPS = { id: 'n1', type: 'nps', label: 'Recommend us?' };

    it('watches the column of a scale', () => {
        const el = mount(NPS);
        const field = el.shadowRoot.querySelector('.field');
        expect(observers).toHaveLength(1);
        expect(observers[0].observed).toEqual([field]);
    });

    it('caps a row that has to wrap, and lets it go when the column grows', () => {
        const el = mount(NPS);
        const { row } = size(el, { column: 238, button: 44, gap: 4 });
        // nothing measured yet (jsdom had no layout at render): no cap
        expect(row.style.getPropertyValue('--scale-row-max')).toBe('');
        // the column resized: 11 buttons do not fit, so 4 + 4 + 3
        observers[0].callback();
        expect(row.style.getPropertyValue('--scale-row-max')).toBe('190px');
        // the column grew to hold all eleven: no cap, one row
        size(el, { column: 524, button: 44, gap: 4 });
        observers[0].callback();
        expect(row.style.getPropertyValue('--scale-row-max')).toBe('');
    });

    it('measures again after a render (an answer is picked)', async () => {
        const el = mount(NPS);
        const { row } = size(el, { column: 238, button: 44, gap: 4 });
        el.element = { ...NPS, value: 7 };
        await Promise.resolve();
        // the re-render kept the same buttons, so the sizes above still apply
        expect(row.style.getPropertyValue('--scale-row-max')).toBe('190px');
    });

    it('is the same for the rating, opinion scale and emoji faces', () => {
        ['rating', 'scale', 'emojiScale'].forEach((type) => {
            const el = mount({ id: type, type, label: 'Question' });
            const { row } = size(el, { column: 200, button: 44, gap: 4 });
            observers[observers.length - 1].callback();
            // five buttons need 236px; 200px holds four, so 3 + 2
            expect(row.style.getPropertyValue('--scale-row-max')).toBe('142px');
        });
    });

    it('stops watching when the question leaves the page', () => {
        const el = mount(NPS);
        document.body.removeChild(el);
        expect(observers[0].disconnected).toBe(true);
    });

    it('does not watch anything that is not a scale', () => {
        mount({
            id: 't1',
            type: 'field',
            label: 'Name',
            config: { inputType: 'text' }
        });
        expect(observers).toHaveLength(0);
    });

    it('still renders where ResizeObserver does not exist', () => {
        delete global.ResizeObserver;
        const el = mount(NPS);
        expect(el.shadowRoot.querySelector('.scale-row')).not.toBeNull();
    });
});
