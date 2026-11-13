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

    const search = async (el, text) => {
        const box = el.shadowRoot.querySelector('.rp-search');
        box.value = text;
        box.dispatchEvent(new CustomEvent('change'));
        await Promise.resolve();
    };

    it('search filters by object label, API name and link label', async () => {
        const el = mount();
        describeChildRelationships.emit([
            ...RELS,
            {
                relationshipName: 'Cases',
                childObject: 'Case',
                childObjectLabel: 'Case',
                linkingField: 'Parent_Account__c',
                linkingFieldLabel: 'Parent org'
            }
        ]);
        await Promise.resolve();
        const labels = () =>
            [...el.shadowRoot.querySelectorAll('.rp-item-label')].map((n) =>
                n.textContent.trim()
            );
        await search(el, 'cas');
        expect(labels()).toEqual(['Case']);
        await search(el, 'OPPORTUNITY');
        expect(labels()).toEqual(['Opportunity']);
        await search(el, 'parent org');
        expect(labels()).toEqual(['Case']);
        await search(el, '');
        expect(labels()).toHaveLength(3);
    });

    it('no match says so', async () => {
        const el = mount();
        describeChildRelationships.emit(RELS);
        await Promise.resolve();
        await search(el, 'xyz');
        expect(el.shadowRoot.querySelectorAll('.rp-item')).toHaveLength(0);
        expect(el.shadowRoot.querySelector('.rp-note').textContent).toBe(
            'No objects match “xyz”.'
        );
    });

    it('Escape clears the search first, then closes', async () => {
        const el = mount();
        describeChildRelationships.emit(RELS);
        await Promise.resolve();
        const cancels = [];
        el.addEventListener('cancel', () => cancels.push(1));
        await search(el, 'opp');
        const dialog = el.shadowRoot.querySelector('.rp-dialog');
        dialog.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        );
        await Promise.resolve();
        expect(cancels).toHaveLength(0);
        expect(el.shadowRoot.querySelectorAll('.rp-item')).toHaveLength(2);
        dialog.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        );
        expect(cancels).toHaveLength(1);
    });
});
