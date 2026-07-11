import { createElement } from 'lwc';
import FinalFormsLibrary, { studioUrl } from 'c/finalFormsLibrary';
import listForms from '@salesforce/apex/FinalStudioController.listForms';

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
        jest.restoreAllMocks();
    });

    it('lists forms; Open = window.open (the LEX router aloha-wraps ALL nav-service URLs)', async () => {
        const open = jest.spyOn(window, 'open').mockReturnValue(null);
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
        expect(open).toHaveBeenCalledWith(
            '/apex/FinalStudio?c__formId=a0F1',
            '_blank'
        );
    });

    it('studioUrl targets the RAW VF host — lightning.force.com wraps /apex in LEX chrome', () => {
        const orig = window.location;
        const at = (hostname) => {
            delete window.location;
            window.location = { hostname };
        };
        try {
            at('acme.lightning.force.com');
            expect(studioUrl('a1')).toBe(
                'https://acme--c.vf.force.com/apex/FinalStudio?c__formId=a1'
            );
            at('rev-5e-dev-ed.develop.lightning.force.com');
            expect(studioUrl('a2')).toBe(
                'https://rev-5e-dev-ed--c.develop.vf.force.com/apex/FinalStudio?c__formId=a2'
            );
            at('acme--uat.sandbox.lightning.force.com');
            expect(studioUrl('a3')).toBe(
                'https://acme--uat--c.sandbox.vf.force.com/apex/FinalStudio?c__formId=a3'
            );
            // non-lightning hosts already serve /apex raw — stay relative
            at('acme.my.salesforce.com');
            expect(studioUrl('a4')).toBe('/apex/FinalStudio?c__formId=a4');
        } finally {
            window.location = orig;
        }
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
