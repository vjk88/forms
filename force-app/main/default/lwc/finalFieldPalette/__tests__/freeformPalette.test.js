import { createElement } from 'lwc';
import FinalFieldPalette from 'c/finalFieldPalette';

// The palette per form type (FREEFORM_SPEC D4): a Form gets its object's
// fields, a Survey gets its 12 questions UNCHANGED, and a Freeform gets those
// plus eight general inputs, grouped so 20 items don't read as one wall.
jest.mock(
    '@salesforce/apex/FinalStudioController.describeFields',
    () => {
        const {
            createApexTestWireAdapter
        } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);

function mount(props = {}) {
    const el = createElement('c-final-field-palette', {
        is: FinalFieldPalette
    });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el;
}

const labels = (el) =>
    [...el.shadowRoot.querySelectorAll('.fp-item .fp-label')].map((n) =>
        n.textContent.trim()
    );

const tabNames = (el) =>
    [...el.shadowRoot.querySelectorAll('.fp-tab')].map((n) =>
        n.textContent.trim()
    );

describe('field palette per form type', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('leaves the survey roster exactly as it was: 12, ungrouped', () => {
        const el = mount({ formType: 'survey' });
        expect(labels(el)).toEqual([
            'NPS',
            'Rating',
            'Opinion Scale',
            'Emoji Scale',
            'Likert',
            'Yes / No',
            'Ranking',
            'Matrix',
            'Image Choice',
            'Short Text',
            'Long Text',
            'Number'
        ]);
        expect(el.shadowRoot.querySelectorAll('.fp-group-label').length).toBe(
            0
        );
    });

    it('gives freeform the same widgets plus eight general inputs, grouped', () => {
        const el = mount({ formType: 'freeform' });
        const found = labels(el);
        expect(found).toHaveLength(20);
        // the eight that Survey never offered
        [
            'Email',
            'Phone',
            'Date',
            'Link',
            'Dropdown',
            'Single choice',
            'Multiple choice',
            'Record lookup'
        ].forEach((l) => expect(found).toContain(l));
        // and the survey widgets are still there
        ['NPS', 'Matrix', 'Likert'].forEach((l) => expect(found).toContain(l));

        const groups = [
            ...el.shadowRoot.querySelectorAll('.fp-group-label')
        ].map((n) => n.textContent.trim());
        expect(groups).toEqual(['Questions', 'Ratings & scales']);
    });

    it('offers no question roster to a Form; it gets object fields', () => {
        const el = mount({ formType: 'form', objectApi: 'Contact' });
        expect(labels(el)).toEqual([]);
    });

    it('offers Autofill on every type, and Mapping on Freeform', () => {
        expect(tabNames(mount({ formType: 'survey' }))).toContain('Autofill');
        expect(tabNames(mount({ formType: 'form' }))).toContain('Autofill');
        // Freeform's rules edit in the Studio's dialog (IMPL_PLAN_F2_AUTOFILL)
        const free = tabNames(mount({ formType: 'freeform' }));
        expect(free).toContain('Autofill');
        expect(free).toContain('Mapping');
    });

    it('emits the question type the studio mints from', () => {
        const el = mount({ formType: 'freeform' });
        const added = jest.fn();
        el.addEventListener('addquestion', added);
        [...el.shadowRoot.querySelectorAll('.fp-item')]
            .find((b) => b.textContent.includes('Multiple choice'))
            .click();
        expect(added.mock.calls[0][0].detail).toEqual({
            questionType: 'questionMultiChoice'
        });
    });
});
