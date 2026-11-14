import { createElement } from 'lwc';
import FinalRowDelete from 'c/finalRowDelete';

/**
 * Delete for a related list's row (slice 3): a bin, then the warning in the
 * row, then "Will be deleted when you save" with Undo. It only asks; the
 * parent marks the row and the one Save deletes it.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(props = {}) {
    const el = createElement('c-final-row-delete', { is: FinalRowDelete });
    Object.assign(el, { name: '00001026', noun: 'Case', rowKey: 'k1' }, props);
    document.body.appendChild(el);
    const asked = [];
    el.addEventListener('rowdelete', (e) => asked.push(e.detail));
    return { el, asked };
}
const $ = (el, s) => el.shadowRoot.querySelector(s);

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('c-final-row-delete', () => {
    it('the bin names its record', () => {
        const { el } = mount();
        expect($(el, '.rd-bin').getAttribute('aria-label')).toBe(
            'Delete Case 00001026'
        );
    });

    it('asks first, with the safe answer focused; Delete asks the parent to mark it', async () => {
        const { el, asked } = mount();
        $(el, '.rd-bin').click();
        await flush();
        const ask = $(el, '.rd-ask');
        expect(ask.getAttribute('role')).toBe('alertdialog');
        expect($(el, '.rd-question').textContent).toBe(
            'Delete this Case? This can’t be undone after you save.'
        );
        expect(el.shadowRoot.activeElement).toBe($(el, '.rd-no'));
        $(el, '.rd-yes').click();
        expect(asked).toEqual([{ key: 'k1', deleted: true }]);
    });

    it('Cancel and Escape go back to the bin, asking nothing', async () => {
        const { el, asked } = mount();
        $(el, '.rd-bin').click();
        await flush();
        $(el, '.rd-no').click();
        await flush();
        expect($(el, '.rd-bin')).not.toBeNull();
        $(el, '.rd-bin').click();
        await flush();
        $(el, '.rd-ask').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape' })
        );
        await flush();
        expect($(el, '.rd-ask')).toBeNull();
        expect(asked).toEqual([]);
    });

    it('a marked row says so, and Undo asks to take it back', () => {
        const { el, asked } = mount({ marked: true });
        expect($(el, '.rd-gone').textContent).toBe(
            'Will be deleted when you save'
        );
        expect($(el, '.rd-undo').getAttribute('aria-label')).toBe(
            'Undo delete of Case 00001026'
        );
        $(el, '.rd-undo').click();
        expect(asked).toEqual([{ key: 'k1', deleted: false }]);
    });
});
