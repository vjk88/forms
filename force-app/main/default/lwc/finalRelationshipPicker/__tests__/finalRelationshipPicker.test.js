import { createElement } from 'lwc';
import FinalRelationshipPicker from 'c/finalRelationshipPicker';
import describeChildRelationships from '@salesforce/apex/FinalStudioController.describeChildRelationships';

jest.mock(
    '@salesforce/apex/FinalStudioController.describeChildRelationships',
    () => {
        const {
            createApexTestWireAdapter
        } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);

const RELS = [
    {
        relationshipName: 'Contacts',
        childObject: 'Contact',
        childObjectLabel: 'Contact',
        linkingField: 'AccountId',
        linkingFieldLabel: 'Account ID'
    },
    {
        relationshipName: 'Opportunities',
        childObject: 'Opportunity',
        childObjectLabel: 'Opportunity',
        linkingField: 'AccountId',
        linkingFieldLabel: 'Account ID'
    }
];

function mount() {
    const el = createElement('c-final-relationship-picker', {
        is: FinalRelationshipPicker
    });
    el.objectApi = 'Account';
    document.body.appendChild(el);
    return el;
}

describe('c-final-relationship-picker', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('lists relationships as "{label} · via {field}" and emits pick', async () => {
        const el = mount();
        describeChildRelationships.emit(RELS);
        await Promise.resolve();

        const items = el.shadowRoot.querySelectorAll('.rp-item');
        expect(items).toHaveLength(2);
        expect(items[0].textContent).toContain('Contact');
        expect(items[0].textContent).toContain('via Account ID');

        const picks = [];
        el.addEventListener('pick', (e) => picks.push(e.detail));
        items[1].click();
        expect(picks[0].relationship.childObject).toBe('Opportunity');
        expect(picks[0].relationship.linkingField).toBe('AccountId');
    });

    it('empty list shows the honest dead-end; Cancel and overlay click both cancel', async () => {
        const el = mount();
        describeChildRelationships.emit([]);
        await Promise.resolve();
        expect(el.shadowRoot.querySelector('.rp-note').textContent).toContain(
            'no child objects'
        );

        const cancels = [];
        el.addEventListener('cancel', () => cancels.push(1));
        el.shadowRoot.querySelector('.rp-cancel').click();
        el.shadowRoot.querySelector('.rp-overlay').click();
        expect(cancels).toHaveLength(2);
    });
});
