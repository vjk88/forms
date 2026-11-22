import { createElement } from 'lwc';
import FinalPropertyPanel from 'c/finalPropertyPanel';
import addressStatus from '@salesforce/apex/FinalAddressController.status';

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
jest.mock(
    '@salesforce/apex/FinalAddressController.status',
    () => {
        const {
            createApexTestWireAdapter
        } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);

const ADDRESS = (config = {}) => ({
    id: 'el_addr',
    type: 'field',
    label: 'Home address',
    binding: null,
    required: false,
    validation: [],
    config: { inputType: 'address', addressSearch: true, ...config }
});

function mount(node) {
    const el = createElement('c-final-property-panel', {
        is: FinalPropertyPanel
    });
    el.kind = 'element';
    el.node = node;
    document.body.appendChild(el);
    return el;
}

const flush = () => Promise.resolve().then(() => Promise.resolve());

const toggle = (el) =>
    el.shadowRoot.querySelector('lightning-input[data-rule="addressSearch"]');
const hint = (el) => {
    const t = toggle(el);
    return t
        .closest('.pp-rule')
        .querySelector('.pp-rule-hint')
        .textContent.trim();
};

describe('address question inspector', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    describe('Address search switch, provider set up', () => {
        const CONFIGURED = {
            configured: true,
            provider: 'Google',
            providerLabel: 'Google Places',
            attribution: 'Results by Google'
        };

        it('shows the switch on, enabled, with the provider named', async () => {
            const el = mount(ADDRESS());
            addressStatus.emit(CONFIGURED);
            await flush();
            expect(toggle(el)).not.toBeNull();
            expect(toggle(el).checked).toBe(true);
            expect(toggle(el).disabled).toBeFalsy();
            expect(hint(el)).toBe(
                "Suggests addresses as people type, using Google Places. Each search counts against your organization's account with that provider."
            );
        });

        it('shows it off when the question has search off', async () => {
            const el = mount(ADDRESS({ addressSearch: false }));
            addressStatus.emit(CONFIGURED);
            await flush();
            expect(toggle(el).checked).toBe(false);
        });

        it('writes config.addressSearch when flipped', async () => {
            const el = mount(ADDRESS());
            addressStatus.emit(CONFIGURED);
            await flush();
            const got = [];
            el.addEventListener('configchange', (e) => got.push(e.detail));
            const t = toggle(el);
            t.checked = false;
            t.dispatchEvent(new CustomEvent('change'));
            expect(got).toEqual([{ patch: { addressSearch: false } }]);
        });
    });

    describe('Address search switch, no provider', () => {
        it('shows off and disabled, whatever the question says, and points to Final Settings', async () => {
            const el = mount(ADDRESS({ addressSearch: true }));
            addressStatus.emit({ configured: false });
            await flush();
            expect(toggle(el).checked).toBe(false);
            expect(toggle(el).disabled).toBe(true);
            expect(hint(el)).toBe(
                'No address search is set up for your organization, so people type the address. An admin can set it up on the Final Settings tab.'
            );
        });

        it('is locked and says nothing until the status arrives', async () => {
            const el = mount(ADDRESS());
            await flush();
            expect(toggle(el).disabled).toBe(true);
            expect(hint(el)).toBe('');
        });
    });

    describe('what an address question does not offer', () => {
        it('hides the Checks group, the Placeholder box and Display-as', async () => {
            const el = mount(ADDRESS());
            addressStatus.emit({ configured: true, providerLabel: 'Google' });
            await flush();
            const titles = [
                ...el.shadowRoot.querySelectorAll('.pp-grouptitle')
            ].map((h) => h.textContent.trim());
            expect(titles).not.toContain('Checks');
            expect(
                el.shadowRoot.querySelector('c-final-validation-editor')
            ).toBeNull();
            expect(
                el.shadowRoot.querySelector(
                    'lightning-input[data-prop="placeholder"]'
                )
            ).toBeNull();
            expect(el.shadowRoot.querySelector('.pp-renderas')).toBeNull();
        });

        it('has no Map to field (an address maps to no single field)', async () => {
            const el = mount(ADDRESS());
            addressStatus.emit({ configured: true });
            await flush();
            expect(
                el.shadowRoot.querySelector('select[data-prop="mapping"]')
            ).toBeNull();
            expect(el.shadowRoot.textContent).not.toContain('Map to field');
        });

        it('keeps Label, Required and Read only', async () => {
            const el = mount(ADDRESS());
            addressStatus.emit({ configured: true });
            await flush();
            expect(
                el.shadowRoot.querySelector(
                    'lightning-input[data-prop="label"]'
                )
            ).not.toBeNull();
            expect(
                el.shadowRoot.querySelector(
                    'lightning-input[data-rule="required"]'
                )
            ).not.toBeNull();
        });

        it('other field types keep Checks and Placeholder, and get no search switch', async () => {
            const el = mount({
                id: 'el_t',
                type: 'field',
                label: 'Name',
                binding: null,
                validation: [],
                config: { inputType: 'text' }
            });
            await flush();
            expect(toggle(el)).toBeNull();
            expect(
                el.shadowRoot.querySelector('c-final-validation-editor')
            ).not.toBeNull();
            expect(
                el.shadowRoot.querySelector(
                    'lightning-input[data-prop="placeholder"]'
                )
            ).not.toBeNull();
        });
    });
});
