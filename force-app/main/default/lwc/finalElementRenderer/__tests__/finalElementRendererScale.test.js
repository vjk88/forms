import { createElement } from 'lwc';
import FinalElementRenderer from 'c/finalElementRenderer';

/** Survey scale family (S2): nps / rating / scale / emojiScale — one chip-row
 *  grammar, radiogroup semantics, caption machinery (round-4 ruling). */

const mount = (element) => {
    const el = createElement('c-final-element-renderer', {
        is: FinalElementRenderer
    });
    el.element = element;
    document.body.appendChild(el);
    return el;
};

const chips = (el) => [...el.shadowRoot.querySelectorAll('[role="radio"]')];

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('scale family', () => {
    it('nps renders the 0–10 row with radiogroup semantics', () => {
        const el = mount({ id: 'e1', type: 'nps', label: 'Recommend us?' });
        const group = el.shadowRoot.querySelector('[role="radiogroup"]');
        expect(group).not.toBeNull();
        const row = chips(el);
        expect(row.length).toBe(11);
        expect(row[0].textContent.trim()).toBe('0');
        expect(row[10].textContent.trim()).toBe('10');
    });

    it('rating renders 5 icons by default and 10 when max=10 (Q1: no 7)', () => {
        expect(
            chips(mount({ id: 'e1', type: 'rating', label: 'Rate' })).length
        ).toBe(5);
        expect(
            chips(
                mount({
                    id: 'e2',
                    type: 'rating',
                    label: 'Rate',
                    config: { max: 10 }
                })
            ).length
        ).toBe(10);
        // an unsupported max falls back to 5, never 7
        expect(
            chips(
                mount({
                    id: 'e3',
                    type: 'rating',
                    label: 'Rate',
                    config: { max: 7 }
                })
            ).length
        ).toBe(5);
    });

    it('clicking a chip dispatches a NUMERIC valuechange', () => {
        const el = mount({ id: 'e1', type: 'scale', label: 'Intensity' });
        const handler = jest.fn();
        el.addEventListener('valuechange', handler);
        chips(el)[3].click();
        expect(handler).toHaveBeenCalledTimes(1);
        const { elementId, value } = handler.mock.calls[0][0].detail;
        expect(elementId).toBe('e1');
        expect(value).toBe(4);
    });

    it('clicking a chip PAINTS the selection (the declared-field regression)', async () => {
        const el = mount({ id: 'e1', type: 'scale', label: 'Intensity' });
        chips(el)[3].click();
        await Promise.resolve();
        expect(chips(el)[3].className).toContain('selected');
        expect(chips(el)[3].getAttribute('aria-checked')).toBe('true');
        // rating fills LEFT-TO-RIGHT up to the pick
        const stars = mount({ id: 'e2', type: 'rating', label: 'Rate' });
        chips(stars)[3].click();
        await Promise.resolve();
        const row = chips(stars);
        expect(row[0].className).toContain('filled');
        expect(row[3].className).toContain('filled');
        expect(row[4].className).not.toContain('filled');
    });

    it('rehydrates selection from el.value after a model rebuild', async () => {
        const el = mount({
            id: 'e1',
            type: 'nps',
            label: 'Recommend?',
            value: 9
        });
        await Promise.resolve();
        const nine = chips(el).find((b) => b.textContent.trim() === '9');
        expect(nine.className).toContain('selected');
    });

    it('classic NPS coloring is opt-in and tones the ends', () => {
        const el = mount({
            id: 'e1',
            type: 'nps',
            label: 'Recommend?',
            config: { coloring: 'classic' }
        });
        const row = chips(el);
        expect(row[0].className).toContain('nps-detractor');
        expect(row[7].className).toContain('nps-passive');
        expect(row[10].className).toContain('nps-promoter');
        // default = theme accent, no tones
        const plain = chips(
            mount({ id: 'e2', type: 'nps', label: 'Recommend?' })
        );
        expect(plain[0].className).not.toContain('nps-detractor');
    });

    it('emojiScale wears the faces and speaks sentiment aria', () => {
        const row = chips(
            mount({ id: 'e1', type: 'emojiScale', label: 'Feeling?' })
        );
        expect(row.length).toBe(5);
        expect(row[4].textContent.trim()).toBe('😍');
        // owner 2026-07-31: faces carry meaning visually, aria must say it —
        // never a bare positional "2 of 5"
        expect(row[0].getAttribute('aria-label')).toBe('Very unhappy, 1 of 5');
        expect(row[4].getAttribute('aria-label')).toBe('Very happy, 5 of 5');
    });

    it('emojiScale never renders end labels, even when authored', () => {
        const el = mount({
            id: 'e1',
            type: 'emojiScale',
            label: 'Feeling?',
            config: { leftLabel: 'Bad', rightLabel: 'Great' }
        });
        expect(el.shadowRoot.querySelector('.scale-endlabels')).toBeNull();
    });

    it('caption renders as a visible line, or hides behind the help bubble', () => {
        const withCaption = mount({
            id: 'e1',
            type: 'rating',
            label: 'Rate',
            description: 'Think of your first week',
            descriptionDisplay: 'caption'
        });
        expect(
            withCaption.shadowRoot.querySelector('.field-caption').textContent
        ).toBe('Think of your first week');

        const asHelp = mount({
            id: 'e2',
            type: 'rating',
            label: 'Rate',
            description: 'Think of your first week',
            descriptionDisplay: 'help'
        });
        expect(asHelp.shadowRoot.querySelector('.field-caption')).toBeNull();
        expect(
            asHelp.shadowRoot.querySelector('lightning-helptext')
        ).not.toBeNull();
    });

    it('arrow keys move the selection (radiogroup contract)', () => {
        const el = mount({ id: 'e1', type: 'scale', label: 'Intensity' });
        const handler = jest.fn();
        el.addEventListener('valuechange', handler);
        const group = el.shadowRoot.querySelector('[role="radiogroup"]');
        group.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
        );
        expect(handler.mock.calls[0][0].detail.value).toBe(1);
        group.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'End', bubbles: true })
        );
        expect(handler.mock.calls[1][0].detail.value).toBe(5);
    });

    it('end labels render only when authored', () => {
        const el = mount({
            id: 'e1',
            type: 'nps',
            label: 'Recommend?',
            config: { leftLabel: 'Not likely', rightLabel: 'Extremely' }
        });
        expect(
            el.shadowRoot.querySelector('.scale-endlabels').textContent
        ).toContain('Not likely');
        // visual end labels are aria-hidden; the radiogroup's accessible
        // name carries their meaning (same contract as the slider)
        expect(
            el.shadowRoot
                .querySelector('[role="radiogroup"]')
                .getAttribute('aria-label')
        ).toBe('Recommend?, 0 = Not likely to 10 = Extremely');
        const bare = mount({ id: 'e2', type: 'nps', label: 'Recommend?' });
        expect(bare.shadowRoot.querySelector('.scale-endlabels')).toBeNull();
        expect(
            bare.shadowRoot
                .querySelector('[role="radiogroup"]')
                .getAttribute('aria-label')
        ).toBe('Recommend?');
    });
});

describe('choice family (S3)', () => {
    it('yesNo dispatches BOOLEANS from two big buttons', () => {
        const el = mount({ id: 'e1', type: 'yesNo', label: 'Coming?' });
        const handler = jest.fn();
        el.addEventListener('valuechange', handler);
        const btns = chips(el);
        expect(btns.length).toBe(2);
        btns[0].click();
        expect(handler.mock.calls[0][0].detail.value).toBe(true);
        btns[1].click();
        expect(handler.mock.calls[1][0].detail.value).toBe(false);
    });

    it('imageChoice multi toggles a value list', () => {
        const el = mount({
            id: 'e1',
            type: 'imageChoice',
            label: 'Pick designs',
            config: {
                multiple: true,
                options: [
                    { value: 'a', label: 'A' },
                    { value: 'b', label: 'B' }
                ]
            }
        });
        const handler = jest.fn();
        el.addEventListener('valuechange', handler);
        const tiles = [...el.shadowRoot.querySelectorAll('.ic-tile')];
        tiles[0].click();
        tiles[1].click();
        expect(handler.mock.calls[1][0].detail.value).toEqual(['a', 'b']);
        tiles[0].click();
        expect(handler.mock.calls[2][0].detail.value).toEqual(['b']);
    });

    it('chips optionStyle takes over a radio field and Other reveals free text', async () => {
        const el = mount({
            id: 'e1',
            type: 'field',
            label: 'Favorite?',
            config: {
                renderAs: 'Radio_Buttons',
                optionStyle: 'chips',
                allowOther: true,
                options: [
                    { value: 'red', label: 'Red' },
                    { value: 'blue', label: 'Blue' }
                ]
            }
        });
        const handler = jest.fn();
        el.addEventListener('valuechange', handler);
        const btns = [...el.shadowRoot.querySelectorAll('.choice-chip')];
        expect(btns.length).toBe(3); // two options + Other
        btns[0].click();
        expect(handler.mock.calls[0][0].detail.value).toBe('red');
        btns[2].click(); // Other…
        await Promise.resolve();
        const other = el.shadowRoot.querySelector('.choice-other');
        expect(other).not.toBeNull();
        other.value = 'chartreuse';
        other.dispatchEvent(new CustomEvent('input'));
        const last = handler.mock.calls[handler.mock.calls.length - 1];
        expect(last[0].detail.value).toBe('chartreuse');
    });
});
