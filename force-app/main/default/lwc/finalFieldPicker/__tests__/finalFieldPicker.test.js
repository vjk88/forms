import { createElement } from 'lwc';
import FinalFieldPicker, {
    labelForPath,
    resetFieldCache
} from 'c/finalFieldPicker';
import describeLookupFields from '@salesforce/apex/FinalLookupController.describeLookupFields';

jest.mock(
    '@salesforce/apex/FinalLookupController.describeLookupFields',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const CONTACT = {
    fields: [
        { path: 'LastName', label: 'Last Name', type: 'string' },
        { path: 'Title', label: 'Title', type: 'string' }
    ],
    relationships: [{ name: 'Account', label: 'Account ID', object: 'Account' }]
};
const ACCOUNT = {
    fields: [
        { path: 'Account.Industry', label: 'Industry', type: 'picklist' },
        { path: 'Account.Name', label: 'Account Name', type: 'string' }
    ],
    relationships: []
};

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(props = {}) {
    const el = createElement('c-final-field-picker', { is: FinalFieldPicker });
    Object.assign(el, { objectApi: 'Contact' }, props);
    document.body.appendChild(el);
    return el;
}

const box = (el) => el.shadowRoot.querySelector('c-final-typeahead');

beforeEach(() => {
    resetFieldCache();
    describeLookupFields.mockImplementation(({ relationshipName }) =>
        Promise.resolve(relationshipName === 'Account' ? ACCOUNT : CONTACT)
    );
});

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
});

describe('c-final-field-picker', () => {
    it('lists the object’s own fields, then every relationship to open', async () => {
        const el = mount();
        await flush();
        const items = box(el).items;
        expect(items.map((i) => i.label)).toEqual([
            'Last Name',
            'Title',
            'Account'
        ]);
        expect(items[2]).toMatchObject({ kind: 'group', value: 'Account' });
        expect(box(el).hint).toContain('open them');
    });

    it('opening a relationship loads its fields as "Account › Industry"', async () => {
        const el = mount();
        await flush();
        box(el).dispatchEvent(
            new CustomEvent('opengroup', { detail: { value: 'Account' } })
        );
        await flush();
        const items = box(el).items;
        expect(items[0]).toMatchObject({ kind: 'back' });
        expect(items[1]).toMatchObject({
            value: 'Account.Industry',
            label: 'Account › Industry',
            meta: 'Account.Industry'
        });

        box(el).dispatchEvent(new CustomEvent('back'));
        await flush();
        // back at the top, with the opened fields searchable but not listed
        const top = box(el).items;
        expect(top.find((i) => i.value === 'Account.Industry').searchOnly).toBe(
            true
        );
        expect(box(el).hint).toBe('');
    });

    it('emits the path with its prefix, label and type', async () => {
        const el = mount({ prefix: 'record:' });
        await flush();
        const heard = [];
        el.addEventListener('fieldchange', (e) => heard.push(e.detail));
        box(el).dispatchEvent(
            new CustomEvent('pick', {
                detail: { value: 'record:Title', label: 'Title' }
            })
        );
        expect(heard).toEqual([
            { value: 'record:Title', label: 'Title', type: 'string' }
        ]);
    });

    it('describes each object and relationship once for the session', async () => {
        mount();
        mount();
        await flush();
        expect(describeLookupFields).toHaveBeenCalledTimes(1);
    });

    it('a saved related field reads as its label straight away', async () => {
        const el = mount({ value: 'Account.Industry' });
        await flush();
        await flush();
        expect(box(el).valueLabel).toBe('Account › Industry');
    });

    it('a failed read is forgotten, so the next try can work', async () => {
        describeLookupFields.mockImplementationOnce(() =>
            Promise.reject(new Error('down'))
        );
        const el = mount();
        await flush();
        expect(box(el).placeholder).toContain('couldn’t be read');
        mount();
        await flush();
        expect(describeLookupFields).toHaveBeenCalledTimes(2);
    });

    it('extra items come first and are never treated as relationships', async () => {
        const el = mount({
            objectApi: 'User',
            prefix: 'user:',
            extraItems: [{ value: 'user:Profile.Name', label: 'Profile name' }],
            value: 'user:Profile.Name'
        });
        await flush();
        expect(box(el).items[0].label).toBe('Profile name');
        expect(box(el).valueLabel).toBe('Profile name');
        // Profile.Name must not trigger a "Profile" relationship describe
        expect(
            describeLookupFields.mock.calls.some(
                ([args]) => args.relationshipName === 'Profile'
            )
        ).toBe(false);
    });
});

describe('labelForPath', () => {
    it('reads own and related fields by their labels', async () => {
        expect(await labelForPath('Contact', 'Title')).toBe('Title');
        expect(await labelForPath('Contact', 'Account.Industry')).toBe(
            'Account › Industry'
        );
        expect(await labelForPath('Contact', 'Nope__c')).toBe('Nope__c');
    });
});
