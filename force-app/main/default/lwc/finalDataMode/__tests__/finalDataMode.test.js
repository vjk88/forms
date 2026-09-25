import { createElement } from 'lwc';
import FinalDataMode from 'c/finalDataMode';

jest.mock(
    '@salesforce/apex/FinalMappingController.listCreatableObjects',
    () => ({ default: jest.fn(() => Promise.resolve([])) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalMappingController.compatibility',
    () => ({ default: jest.fn(() => Promise.resolve({})) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalMappingController.describeQuestions',
    () => ({ default: jest.fn(() => Promise.resolve([])) }),
    { virtual: true }
);

describe('c-final-data-mode', () => {
    afterEach(() => {
        while (document.body.firstChild)
            document.body.removeChild(document.body.firstChild);
    });

    it('counts the records the mapping makes', () => {
        const el = createElement('c-final-data-mode', { is: FinalDataMode });
        el.spec = { mapping: { actions: [{ id: 'act_1' }, { id: 'act_2' }] } };
        document.body.appendChild(el);
        expect(el.shadowRoot.querySelector('.dm-count').textContent).toBe(
            '2 records'
        );
    });

    it('relays the editor’s spec change', () => {
        const el = createElement('c-final-data-mode', { is: FinalDataMode });
        el.spec = {};
        document.body.appendChild(el);
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        el.shadowRoot.querySelector('c-final-mapping-editor').dispatchEvent(
            new CustomEvent('specchange', {
                detail: { spec: { next: true } }
            })
        );
        expect(handler.mock.calls[0][0].detail.spec).toEqual({ next: true });
    });
});
