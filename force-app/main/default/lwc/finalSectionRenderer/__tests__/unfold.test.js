import { createElement } from 'lwc';
import FinalSectionRenderer from 'c/finalSectionRenderer';

/**
 * A folded section does not draw its questions, so a blocked click that found
 * a red question inside it unfolds it (`unfoldRequest`), once per click
 * (IMPL_PLAN_BLOCKED_MESSAGE §3). The person's own folding still wins after.
 */
const SECTION = (extra = {}) => ({
    id: 'sec_f',
    title: 'Folded',
    style: 'plain',
    columns: 1,
    collapsible: true,
    defaultCollapsed: true,
    elements: [
        {
            id: 'el_a',
            type: 'field',
            label: 'Email',
            render: { inputType: 'text' }
        }
    ],
    ...extra
});

const flush = () => Promise.resolve();

const questions = (cmp) =>
    cmp.shadowRoot.querySelectorAll('c-final-element-renderer').length;

describe('a folded section unfolds for a blocked click', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('opens on a new number, and the same number never re-opens it after the person folds it again', async () => {
        const cmp = createElement('c-final-section-renderer', {
            is: FinalSectionRenderer
        });
        cmp.section = SECTION();
        document.body.appendChild(cmp);
        await flush();
        expect(questions(cmp)).toBe(0);

        cmp.section = SECTION({ unfoldRequest: 7001 });
        await flush();
        expect(questions(cmp)).toBe(1);

        cmp.shadowRoot.querySelector('.sec-fold').click();
        await flush();
        expect(questions(cmp)).toBe(0);

        cmp.section = SECTION({ unfoldRequest: 7001 }); // an answer re-sends it
        await flush();
        expect(questions(cmp)).toBe(0);

        cmp.section = SECTION({ unfoldRequest: 7002 }); // a new blocked click
        await flush();
        expect(questions(cmp)).toBe(1);
    });

    it('a section drawn fresh with an old number stays folded', async () => {
        const cmp = createElement('c-final-section-renderer', {
            is: FinalSectionRenderer
        });
        cmp.section = SECTION({ id: 'sec_g', unfoldRequest: 7003 });
        document.body.appendChild(cmp);
        await flush();
        expect(questions(cmp)).toBe(1);
        document.body.removeChild(cmp);

        const again = createElement('c-final-section-renderer', {
            is: FinalSectionRenderer
        });
        again.section = SECTION({ id: 'sec_g', unfoldRequest: 7003 });
        document.body.appendChild(again);
        await flush();
        expect(questions(again)).toBe(0);
    });
});
