import { createElement } from 'lwc';
import FinalPublishDialog from 'c/finalPublishDialog';

/**
 * The publish dialog exists because LightningConfirm could not hold more than
 * a sentence. It took a plain string, so three warnings arrived as one
 * paragraph with stray bullet characters mid-sentence, and the standing "the
 * live form updates immediately" note sat where it read as part of the last
 * warning.
 *
 * So what is under test is separability: one warning, one row, and the note
 * outside all of them.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

function mount({ formName = 'Untitled Freeform', warnings = [] } = {}) {
    const el = createElement('c-final-publish-dialog', {
        is: FinalPublishDialog
    });
    el.formName = formName;
    el.warnings = warnings;
    document.body.appendChild(el);
    return el;
}

const rows = (el) =>
    [...el.shadowRoot.querySelectorAll('.pd-warning-text')].map((n) =>
        n.textContent.trim()
    );

const heading = (el) =>
    el.shadowRoot.querySelector('lightning-modal-header').label;

const confirmButton = (el) =>
    [...el.shadowRoot.querySelectorAll('lightning-button')].find(
        (b) => b.variant === 'brand'
    );

describe('c-final-publish-dialog', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('gives every warning its own row instead of one paragraph', async () => {
        const el = mount({
            warnings: [
                'You are removing "Phone number", which already has answers.',
                '"File Upload" cannot accept files from people who are not signed in.'
            ]
        });
        await flush();

        expect(rows(el)).toEqual([
            'You are removing "Phone number", which already has answers.',
            '"File Upload" cannot accept files from people who are not signed in.'
        ]);
    });

    it('counts the consequences in the heading so nobody stops at the first', async () => {
        const el = mount({ warnings: ['one', 'two', 'three'] });
        await flush();
        expect(heading(el)).toBe('3 things to know before publishing');
    });

    it('says "One thing" rather than "1 things"', async () => {
        const el = mount({ warnings: ['just the one'] });
        await flush();
        expect(heading(el)).toBe('One thing to know before publishing');
    });

    it('keeps the live-form note out of the warning list', async () => {
        const el = mount({ warnings: ['a consequence'] });
        await flush();

        const note = el.shadowRoot.querySelector('.pd-note').textContent.trim();
        expect(note).toBe('The live form updates immediately.');
        // the bug being fixed: it used to be the tail of the last warning
        expect(rows(el).join(' ')).not.toContain('live form');
    });

    it('is an ordinary confirmation when there is nothing to warn about', async () => {
        // a real path: publish always opens this dialog, so that an author
        // publishing the same form twice is not handed a different one
        const el = mount();
        await flush();

        expect(el.shadowRoot.querySelector('.pd-warnings')).toBeNull();
        expect(heading(el)).toBe('Publish form');
        expect(confirmButton(el).label).toBe('Publish');
        // the note is always true, so it stays
        expect(el.shadowRoot.querySelector('.pd-note')).not.toBeNull();
    });

    it('names the act on the button rather than saying OK', async () => {
        const el = mount({ warnings: ['a consequence'] });
        await flush();
        expect(confirmButton(el).label).toBe('Publish anyway');
    });

    it('asks about the form by name', async () => {
        const el = mount({ formName: 'Partner application' });
        await flush();
        expect(
            el.shadowRoot.querySelector('.pd-question').textContent
        ).toContain('Publish "Partner application"?');
    });

    it('closes true on publish and false on cancel', async () => {
        const el = mount({ warnings: ['a consequence'] });
        await flush();
        const closed = [];
        el.addEventListener('close', (e) => closed.push(e.detail));

        confirmButton(el).click();
        expect(closed).toEqual([true]);

        [...el.shadowRoot.querySelectorAll('lightning-button')]
            .find((b) => b.label === 'Cancel')
            .click();
        expect(closed).toEqual([true, false]);
    });
});
