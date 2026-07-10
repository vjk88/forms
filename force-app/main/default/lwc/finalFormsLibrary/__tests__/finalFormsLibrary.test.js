import { createElement } from 'lwc';
import FinalFormsLibrary from 'c/finalFormsLibrary';
import listForms from '@salesforce/apex/FinalStudioController.listForms';

const NAVIGATE = [];
jest.mock(
    'lightning/navigation',
    () => {
        const {
            createTestWireAdapter
        } = require('@salesforce/wire-service-jest-util');
        const Navigate = Symbol('Navigate');
        const NavigationMixin = (Base) =>
            class extends Base {
                [Navigate](pageRef) {
                    NAVIGATE.push(pageRef);
                }
            };
        NavigationMixin.Navigate = Navigate;
        return {
            CurrentPageReference: createTestWireAdapter(jest.fn()),
            NavigationMixin
        };
    },
    { virtual: true }
);

jest.mock(
    '@salesforce/apex/FinalStudioController.listForms',
    () => {
        const {
            createApexTestWireAdapter
        } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('c-final-forms-library', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        NAVIGATE.length = 0;
    });

    it('lists forms and opens the full-page studio host with c__formId', async () => {
        const el = createElement('c-final-forms-library', {
            is: FinalFormsLibrary
        });
        document.body.appendChild(el);
        listForms.emit([
            {
                id: 'a0F1',
                name: 'Contact us',
                objectApi: 'Case',
                modified: '2026-07-08T00:00:00.000Z',
                activeVersion: 3,
                hasDraft: true
            }
        ]);
        await flush();
        const cells = el.shadowRoot.querySelectorAll('td');
        expect(cells[0].textContent).toBe('Contact us');
        expect(cells[2].textContent).toBe('v3 + draft');

        el.shadowRoot.querySelector('.lib-open').click();
        expect(NAVIGATE[0].type).toBe('standard__webPage');
        expect(NAVIGATE[0].attributes.url).toBe(
            '/apex/FinalStudio?c__formId=a0F1'
        );
    });

    it('empty list → gallery-first empty state, not a blank void', async () => {
        const el = createElement('c-final-forms-library', {
            is: FinalFormsLibrary
        });
        document.body.appendChild(el);
        listForms.emit([]);
        await flush();
        expect(el.shadowRoot.querySelector('.lib-empty h3').textContent).toBe(
            'No forms yet'
        );
    });
});
