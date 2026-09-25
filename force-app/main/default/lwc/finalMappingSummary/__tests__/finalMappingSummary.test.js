import { createElement } from 'lwc';
import FinalMappingSummary from 'c/finalMappingSummary';
import listCreatableObjects from '@salesforce/apex/FinalMappingController.listCreatableObjects';
import describeQuestions from '@salesforce/apex/FinalMappingController.describeQuestions';

jest.mock(
    '@salesforce/apex/FinalMappingController.listCreatableObjects',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalMappingController.describeQuestions',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(actions) {
    listCreatableObjects.mockResolvedValue([
        { value: 'Contact', label: 'Contact' }
    ]);
    describeQuestions.mockResolvedValue([]);
    const el = createElement('c-final-mapping-summary', {
        is: FinalMappingSummary
    });
    el.spec = { pages: [], mapping: actions ? { actions } : undefined };
    document.body.appendChild(el);
    return el;
}

describe('c-final-mapping-summary', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('with no steps, offers to set mapping up', async () => {
        const el = mount(null);
        await flush();
        expect(el.shadowRoot.querySelector('.msu-empty')).toBeTruthy();
        expect(el.shadowRoot.querySelector('.msu-open').label).toBe(
            'Set up mapping'
        );
    });

    it('counts the steps and says which are not finished', async () => {
        const el = mount([
            { id: 'act_1', object: 'Contact', operation: 'create', fields: [] }
        ]);
        await flush();
        expect(el.shadowRoot.querySelector('.msu-count').textContent).toBe(
            '1 step · 1 not finished'
        );
        const step = el.shadowRoot.querySelector('.msu-step');
        expect(step.textContent).toContain('1. Contact');
        expect(step.textContent).toContain('Always create');
        expect(step.textContent).toContain('Not finished');
        expect(el.shadowRoot.querySelector('.msu-open').label).toBe(
            'Open mapping'
        );
    });

    it('asks the Studio to open the mapping dialog', async () => {
        const el = mount(null);
        const got = [];
        el.addEventListener('openmapping', (e) => got.push(e.detail));
        await flush();
        el.shadowRoot.querySelector('.msu-open').click();
        expect(got).toEqual([{ target: null }]);
    });
});
