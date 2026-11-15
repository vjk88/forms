import { createElement } from 'lwc';
import FinalElementRenderer from 'c/finalElementRenderer';

/** A11y for custom radiogroups: one Tab stop per matrix row (roving
 *  tabindex + arrow keys, same contract as the scale rows) and
 *  aria-required on every radiogroup of a required question. */

const mount = (element) => {
    const el = createElement('c-final-element-renderer', {
        is: FinalElementRenderer
    });
    el.element = element;
    document.body.appendChild(el);
    return el;
};

const matrix = (extra = {}) => ({
    id: 'm1',
    type: 'matrix',
    label: 'How do you feel?',
    config: {
        rows: [
            { value: 'r1', label: 'Row one' },
            { value: 'r2', label: 'Row two' }
        ]
    },
    ...extra
});

const rowCells = (el, row) => [
    ...el.shadowRoot.querySelectorAll(`[data-row="${row}"][role="radio"]`)
];

const key = (el, row, k, index = 0) => {
    rowCells(el, row)[index].dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true })
    );
};

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('matrix roving tabindex', () => {
    it('unanswered rows: one tab stop per row, on the first cell', () => {
        const el = mount(matrix());
        ['r1', 'r2'].forEach((row) => {
            const tabs = rowCells(el, row).map((b) =>
                b.getAttribute('tabindex')
            );
            expect(tabs).toEqual(['0', '-1', '-1', '-1']);
        });
    });

    it('answering a row moves that row tab stop to the chosen cell', async () => {
        const el = mount(matrix());
        rowCells(el, 'r1')[2].click();
        await Promise.resolve();
        expect(
            rowCells(el, 'r1').map((b) => b.getAttribute('tabindex'))
        ).toEqual(['-1', '-1', '0', '-1']);
        // the other row is untouched
        expect(
            rowCells(el, 'r2').map((b) => b.getAttribute('tabindex'))
        ).toEqual(['0', '-1', '-1', '-1']);
    });

    it('ArrowRight/Left select and move focus like scale rows; Home/End go to the ends', async () => {
        const el = mount(matrix());
        const handler = jest.fn();
        el.addEventListener('valuechange', handler);

        // unanswered + ArrowRight selects the first point (scale: cur == null -> min)
        key(el, 'r1', 'ArrowRight');
        await Promise.resolve();
        expect(handler.mock.calls[0][0].detail.value).toEqual({ r1: 1 });
        expect(el.shadowRoot.activeElement).toBe(rowCells(el, 'r1')[0]);

        key(el, 'r1', 'ArrowRight', 0);
        await Promise.resolve();
        expect(handler.mock.calls[1][0].detail.value).toEqual({ r1: 2 });
        expect(el.shadowRoot.activeElement).toBe(rowCells(el, 'r1')[1]);

        key(el, 'r1', 'ArrowLeft', 1);
        await Promise.resolve();
        expect(handler.mock.calls[2][0].detail.value).toEqual({ r1: 1 });

        key(el, 'r1', 'End', 0);
        await Promise.resolve();
        expect(handler.mock.calls[3][0].detail.value).toEqual({ r1: 4 });
        expect(el.shadowRoot.activeElement).toBe(rowCells(el, 'r1')[3]);

        key(el, 'r1', 'Home', 3);
        await Promise.resolve();
        expect(handler.mock.calls[4][0].detail.value).toEqual({ r1: 1 });
        expect(el.shadowRoot.activeElement).toBe(rowCells(el, 'r1')[0]);
    });

    it('arrow keys in one row never touch the other row', async () => {
        const el = mount(matrix());
        const handler = jest.fn();
        el.addEventListener('valuechange', handler);
        key(el, 'r2', 'End');
        await Promise.resolve();
        expect(handler.mock.calls[0][0].detail.value).toEqual({ r2: 4 });
    });
});

describe('aria-required on custom radiogroups', () => {
    it('required question: every radiogroup says aria-required="true"', () => {
        const el = mount(matrix({ required: true }));
        const groups = [
            ...el.shadowRoot.querySelectorAll('[role="radiogroup"]')
        ];
        expect(groups.length).toBe(2);
        groups.forEach((g) =>
            expect(g.getAttribute('aria-required')).toBe('true')
        );

        const scale = mount({
            id: 'e1',
            type: 'scale',
            label: 'Intensity',
            required: true
        });
        expect(
            scale.shadowRoot
                .querySelector('[role="radiogroup"]')
                .getAttribute('aria-required')
        ).toBe('true');

        const yn = mount({
            id: 'e2',
            type: 'yesNo',
            label: 'Coming?',
            required: true
        });
        expect(
            yn.shadowRoot
                .querySelector('[role="radiogroup"]')
                .getAttribute('aria-required')
        ).toBe('true');
    });

    it('not required: no aria-required attribute on any radiogroup', () => {
        const el = mount(matrix());
        el.shadowRoot
            .querySelectorAll('[role="radiogroup"]')
            .forEach((g) =>
                expect(g.hasAttribute('aria-required')).toBe(false)
            );
        const scale = mount({ id: 'e1', type: 'scale', label: 'Intensity' });
        expect(
            scale.shadowRoot
                .querySelector('[role="radiogroup"]')
                .hasAttribute('aria-required')
        ).toBe(false);
    });
});
