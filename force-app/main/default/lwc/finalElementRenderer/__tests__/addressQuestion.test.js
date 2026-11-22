import { createElement } from 'lwc';
import FinalElementRenderer from 'c/finalElementRenderer';

// The Address question: an optional search box above five fields. The answer
// is an object of the non-empty parts, or null when no text part is left.
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
jest.mock(
    '@salesforce/apex/FinalAddressController.suggest',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalAddressController.details',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const ADDRESS = (over = {}) => ({
    id: 'el_addr',
    type: 'field',
    label: 'Home address',
    required: false,
    help: null,
    labelPosition: 'top',
    config: { inputType: 'address', addressSearch: true },
    ...over
});

const PICKED = {
    street: '1 Market St',
    city: 'San Francisco',
    province: 'California',
    provinceCode: 'CA',
    postalCode: '94105',
    country: 'United States',
    countryCode: 'US',
    latitude: 37.79,
    longitude: -122.39
};

async function mount(element) {
    const cmp = createElement('c-final-element-renderer', {
        is: FinalElementRenderer
    });
    cmp.element = element;
    document.body.appendChild(cmp);
    await Promise.resolve();
    return cmp;
}

const part = (cmp, name) =>
    cmp.shadowRoot.querySelector(`[data-part="${name}"]:not(label)`);

function record(cmp) {
    const events = [];
    cmp.addEventListener('valuechange', (e) => events.push(e.detail));
    return events;
}

function edit(node, value) {
    node.value = value;
    node.dispatchEvent(new CustomEvent('change'));
}

describe('c-final-element-renderer: address question', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    describe('what it draws', () => {
        it('renders five fields, street as a two-line text area', async () => {
            const cmp = await mount(ADDRESS());
            expect(part(cmp, 'street').tagName).toBe('LIGHTNING-TEXTAREA');
            ['city', 'province', 'postalCode', 'country'].forEach((p) =>
                expect(part(cmp, p).tagName).toBe('LIGHTNING-INPUT')
            );
            // and no catch-all text box on top of them
            expect(
                cmp.shadowRoot.querySelectorAll('lightning-input')
            ).toHaveLength(4);
        });

        it('labels the parts from the runtime labels, in order', async () => {
            const cmp = await mount(ADDRESS());
            const labels = [
                ...cmp.shadowRoot.querySelectorAll('label.addr-label')
            ].map((l) => l.textContent.trim());
            expect(labels).toEqual([
                'Street',
                'City',
                'State / Province',
                'Zip / Postal code',
                'Country'
            ]);
            expect(part(cmp, 'province').label).toBe('State / Province');
            expect(part(cmp, 'postalCode').label).toBe('Zip / Postal code');
        });

        it('limits each part to the lengths the server keeps', async () => {
            const cmp = await mount(ADDRESS());
            expect(
                ['street', 'city', 'province', 'postalCode', 'country'].map(
                    (p) => Number(part(cmp, p).maxLength)
                )
            ).toEqual([255, 40, 80, 20, 80]);
        });

        it('names the group by the question label', async () => {
            const cmp = await mount(ADDRESS());
            const group = cmp.shadowRoot.querySelector('.addr');
            expect(group.getAttribute('role')).toBe('group');
            expect(group.getAttribute('aria-label')).toBe('Home address');
        });

        it('shows the question label above, like any other field', async () => {
            const cmp = await mount(ADDRESS({ help: 'We post things' }));
            expect(
                cmp.shadowRoot.querySelector('label.field-label').textContent
            ).toContain('Home address');
            expect(
                cmp.shadowRoot.querySelector('lightning-helptext')
            ).not.toBeNull();
        });

        it('fills the parts from the answer object', async () => {
            const cmp = await mount(
                ADDRESS({
                    value: { street: '1 Main St', city: 'Reno', country: 'US' }
                })
            );
            expect(part(cmp, 'street').value).toBe('1 Main St');
            expect(part(cmp, 'city').value).toBe('Reno');
            expect(part(cmp, 'country').value).toBe('US');
            expect(part(cmp, 'province').value).toBe('');
        });
    });

    describe('search box', () => {
        it('appears only when the viewer says it is searchable', async () => {
            const on = await mount(
                ADDRESS({ address: { formId: 'a0F1', searchable: true } })
            );
            expect(
                on.shadowRoot.querySelector('c-final-address-search')
            ).not.toBeNull();

            const off = await mount(
                ADDRESS({ address: { formId: 'a0F1', searchable: false } })
            );
            expect(
                off.shadowRoot.querySelector('c-final-address-search')
            ).toBeNull();

            const bare = await mount(ADDRESS());
            expect(
                bare.shadowRoot.querySelector('c-final-address-search')
            ).toBeNull();
        });

        it('hands the search the form and the question', async () => {
            const cmp = await mount(
                ADDRESS({ address: { formId: 'a0F1', searchable: true } })
            );
            const box = cmp.shadowRoot.querySelector('c-final-address-search');
            expect(box.formId).toBe('a0F1');
            expect(box.elementId).toBe('el_addr');
            expect(box.label).toBe('Search for an address');
        });

        it('sits before the fields', async () => {
            const cmp = await mount(
                ADDRESS({ address: { formId: 'a0F1', searchable: true } })
            );
            const group = cmp.shadowRoot.querySelector('.addr');
            expect(group.firstElementChild.tagName).toBe(
                'DIV' // .addr-search wraps the box
            );
            expect(group.firstElementChild.className).toBe('addr-search');
        });

        it('a pick replaces every part and keeps the codes and coordinates', async () => {
            const cmp = await mount(
                ADDRESS({
                    value: { street: 'old', city: 'old', postalCode: '00000' },
                    address: { formId: 'a0F1', searchable: true }
                })
            );
            const events = record(cmp);
            cmp.shadowRoot
                .querySelector('c-final-address-search')
                .dispatchEvent(
                    new CustomEvent('addresspick', { detail: PICKED })
                );
            expect(events).toHaveLength(1);
            expect(events[0].elementId).toBe('el_addr');
            expect(events[0].value).toEqual(PICKED);
        });

        it('a pick with missing parts leaves them out rather than keeping old ones', async () => {
            const cmp = await mount(
                ADDRESS({
                    value: { street: 'old', province: 'Nevada' },
                    address: { formId: 'a0F1', searchable: true }
                })
            );
            const events = record(cmp);
            cmp.shadowRoot
                .querySelector('c-final-address-search')
                .dispatchEvent(
                    new CustomEvent('addresspick', {
                        detail: {
                            street: '5 Elm St',
                            city: 'Austin',
                            country: 'USA',
                            province: null,
                            latitude: null
                        }
                    })
                );
            expect(events[0].value).toEqual({
                street: '5 Elm St',
                city: 'Austin',
                country: 'USA'
            });
        });
    });

    describe('typing by hand', () => {
        it('merges the edit into the answer, keeping only parts that hold text', async () => {
            const cmp = await mount(
                ADDRESS({ value: { street: '1 Main St', city: 'Reno' } })
            );
            const events = record(cmp);
            edit(part(cmp, 'postalCode'), '89501');
            expect(events[0].value).toEqual({
                street: '1 Main St',
                city: 'Reno',
                postalCode: '89501'
            });
        });

        it('an edit drops the coordinates and both codes', async () => {
            const cmp = await mount(ADDRESS({ value: { ...PICKED } }));
            const events = record(cmp);
            edit(part(cmp, 'city'), 'Oakland');
            expect(events[0].value).toEqual({
                street: '1 Market St',
                city: 'Oakland',
                province: 'California',
                postalCode: '94105',
                country: 'United States'
            });
            expect(events[0].value.latitude).toBeUndefined();
            expect(events[0].value.provinceCode).toBeUndefined();
            expect(events[0].value.countryCode).toBeUndefined();
        });

        it('emptying a part removes it', async () => {
            const cmp = await mount(
                ADDRESS({ value: { street: '1 Main St', city: 'Reno' } })
            );
            const events = record(cmp);
            edit(part(cmp, 'city'), '');
            expect(events[0].value).toEqual({ street: '1 Main St' });
        });

        it('emptying the last part makes the answer null, not an empty object', async () => {
            const cmp = await mount(ADDRESS({ value: { city: 'Reno' } }));
            const events = record(cmp);
            edit(part(cmp, 'city'), '');
            expect(events[0].value).toBeNull();
        });

        it('whitespace alone counts as empty', async () => {
            const cmp = await mount(ADDRESS());
            const events = record(cmp);
            edit(part(cmp, 'street'), '   ');
            expect(events[0].value).toBeNull();
        });

        it('keeps a typed trailing space so the next word can follow', async () => {
            const cmp = await mount(ADDRESS());
            const events = record(cmp);
            edit(part(cmp, 'street'), '12 ');
            expect(events[0].value).toEqual({ street: '12 ' });
        });

        it('codes and coordinates alone never make an answer', async () => {
            const cmp = await mount(
                ADDRESS({ value: { street: 'x', countryCode: 'US' } })
            );
            const events = record(cmp);
            edit(part(cmp, 'street'), '');
            expect(events[0].value).toBeNull();
        });
    });

    describe('required', () => {
        it('puts an asterisk on street, city and country only', async () => {
            const cmp = await mount(ADDRESS({ required: true }));
            const starred = [
                ...cmp.shadowRoot.querySelectorAll('.addr abbr.field-req')
            ].map((a) => a.parentElement.getAttribute('data-part'));
            expect(starred).toEqual(['street', 'city', 'country']);
            expect(part(cmp, 'street').required).toBe(true);
            expect(part(cmp, 'province').required).toBeFalsy();
            expect(part(cmp, 'postalCode').required).toBeFalsy();
        });

        it('has no part asterisks when the question is optional', async () => {
            const cmp = await mount(ADDRESS());
            expect(
                cmp.shadowRoot.querySelectorAll('.addr abbr.field-req')
            ).toHaveLength(0);
        });
    });

    describe('errors', () => {
        it('shows the question error the way other fields do', async () => {
            const cmp = await mount(
                ADDRESS({ required: true, errors: ['City is required.'] })
            );
            expect(
                cmp.shadowRoot.querySelector('.field-errors').textContent
            ).toContain('City is required.');
        });

        it('marks the part the error names, and clears the others', async () => {
            const cmp = await mount(
                ADDRESS({ required: true, errors: ['City is required.'] })
            );
            const city = part(cmp, 'city');
            // The base component's own validity state is the part's red mark.
            city.setCustomValidity = jest.fn();
            city.reportValidity = jest.fn();
            const street = part(cmp, 'street');
            street.setCustomValidity = jest.fn();
            cmp.element = ADDRESS({
                required: true,
                errors: ['City is required.'],
                value: { street: 's' }
            });
            await Promise.resolve();
            expect(city.setCustomValidity).toHaveBeenCalledWith(
                'City is required.'
            );
            expect(city.reportValidity).toHaveBeenCalled();
            expect(street.setCustomValidity).toHaveBeenCalledWith('');
        });

        it('a generic required message marks no part', async () => {
            const cmp = await mount(
                ADDRESS({ required: true, errors: ['This field is required'] })
            );
            const city = part(cmp, 'city');
            city.setCustomValidity = jest.fn();
            city.reportValidity = jest.fn();
            cmp.element = ADDRESS({
                required: true,
                errors: ['This field is required'],
                value: null
            });
            await Promise.resolve();
            expect(city.reportValidity).not.toHaveBeenCalled();
        });
    });
});
