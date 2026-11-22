import { createElement } from 'lwc';
import FinalSettings from 'c/finalSettings';
import getAddressSettings from '@salesforce/apex/FinalSettingsController.getAddressSettings';
import saveAddressSettings from '@salesforce/apex/FinalSettingsController.saveAddressSettings';
import testAddressConnection from '@salesforce/apex/FinalSettingsController.testAddressConnection';

jest.mock(
    '@salesforce/apex/FinalSettingsController.getAddressSettings',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSettingsController.saveAddressSettings',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSettingsController.testAddressConnection',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const BAD_CLASS =
    "That Apex class can't be used. It must exist, have a public constructor with no arguments, and implement FinalAddressProvider.";

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(settings = {}) {
    getAddressSettings.mockResolvedValue({
        provider: 'None',
        apexClass: null,
        canManage: true,
        ...settings
    });
    const el = createElement('c-final-settings', { is: FinalSettings });
    document.body.appendChild(el);
    await flush();
    return el;
}

const q = (el, sel) => el.shadowRoot.querySelector(sel);
const text = (el) => el.shadowRoot.textContent.replace(/\s+/g, ' ');
const testBtn = (el) => q(el, 'lightning-button.fs-test');
const saveBtn = (el) => q(el, 'lightning-button.fs-save');

async function pickProvider(el, value) {
    q(el, 'lightning-combobox').dispatchEvent(
        new CustomEvent('change', { detail: { value } })
    );
    await flush();
}

async function typeClass(el, value) {
    q(el, 'lightning-input.fs-class').dispatchEvent(
        new CustomEvent('change', { detail: { value } })
    );
    await flush();
}

function spyClass(el) {
    const input = q(el, 'lightning-input.fs-class');
    return {
        validity: jest.spyOn(input, 'setCustomValidity'),
        report: jest.spyOn(input, 'reportValidity')
    };
}

describe('c-final-settings', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.resetAllMocks();
        jest.restoreAllMocks();
    });

    it('shows loading, then the loaded Google settings with its four steps', async () => {
        let resolve;
        getAddressSettings.mockReturnValue(
            new Promise((r) => {
                resolve = r;
            })
        );
        const el = createElement('c-final-settings', { is: FinalSettings });
        document.body.appendChild(el);
        await flush();
        expect(text(el)).toContain('Loading settings…');
        expect(q(el, 'lightning-combobox')).toBeNull();
        expect(q(el, '[data-id="failed"]')).toBeNull();

        resolve({ provider: 'Google', apexClass: null, canManage: true });
        await flush();
        expect(q(el, '[data-id="loading"]')).toBeNull();
        expect(q(el, 'lightning-combobox').value).toBe('Google');
        const steps = q(el, '[data-id="steps-google"]').querySelectorAll('li');
        expect(steps).toHaveLength(4);
        // the org once rendered "turn onPlaces API": words keep their spaces
        expect(steps[0].textContent).toBe(
            "In Google Cloud, create an API key and turn on Places API (New) for its project. Billing must be on for that project. Under the key's restrictions, don't choose Websites: Salesforce calls Google from its own servers."
        );
        expect(steps[0].querySelector('.fs-strong').textContent).toBe(
            'Places API (New)'
        );
        expect(steps[1].textContent).toBe(
            'In Setup, open Named Credentials (opens in a new tab), then the External Credentials tab, then Final Address Google.'
        );
        expect(steps[2].textContent).toContain('(capital K)');
        expect(steps[3].textContent).toContain('Final Address Search');
        expect(q(el, 'lightning-input')).toBeNull();
        const group = q(el, '[data-id="steps-google"]');
        expect(group.querySelector('h4.fs-group-name').textContent).toBe(
            'Connect your key'
        );
        expect(group.querySelector('ol').getAttribute('aria-label')).toBe(
            'Connect your key'
        );
    });

    it('the one link opens in a new tab and says so for screen readers', async () => {
        const el = await mount({ provider: 'Google' });
        const links = el.shadowRoot.querySelectorAll('.fs-steps a');
        expect(links).toHaveLength(1);
        expect(links[0].getAttribute('href')).toBe(
            '/lightning/setup/NamedCredential/home'
        );
        expect(links[0].getAttribute('target')).toBe('_blank');
        expect(links[0].getAttribute('rel')).toBe('noopener');
        expect(links[0].firstChild.textContent).toBe('Named Credentials');
        expect(links[0].querySelector('.slds-assistive-text').textContent).toBe(
            ' (opens in a new tab)'
        );
    });

    it('None shows the plain-fields help in the combobox row, no steps, and no Test button', async () => {
        const el = await mount({ provider: 'None' });
        const help = q(el, '[data-id="none-help"]');
        expect(help.textContent).toContain(
            'Address questions show plain address fields, with no search.'
        );
        expect(help.parentElement.querySelector('lightning-combobox')).not.toBe(
            null
        );
        expect(q(el, '[data-id="steps-google"]')).toBeNull();
        expect(q(el, '[data-id="steps-custom"]')).toBeNull();
        expect(testBtn(el)).toBeNull();
        expect(saveBtn(el).disabled).toBe(true);
    });

    it('Your own shows its steps, then the Apex class box with a visible help line', async () => {
        const el = await mount({
            provider: 'Custom',
            apexClass: 'MyAddressProvider'
        });
        const group = q(el, '[data-id="steps-custom"]');
        const input = group.querySelector('lightning-input.fs-class');
        expect(input.label).toBe('Apex class name');
        expect(input.value).toBe('MyAddressProvider');
        expect(input.fieldLevelHelp).toBeUndefined();
        expect(group.querySelector('.fs-class-row .fs-help').textContent).toBe(
            'A class that implements FinalAddressProvider.'
        );
        expect(group.querySelector('h4.fs-group-name').textContent).toBe(
            'Set it up'
        );
        expect(group.querySelector('ol').getAttribute('aria-label')).toBe(
            'Set it up'
        );
        // the box comes after the steps, inside the same group
        expect(
            group.querySelector('ol').compareDocumentPosition(input) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
        const steps = group.querySelectorAll('li');
        expect(steps).toHaveLength(3);
        expect(steps[0].textContent).toContain('FinalAddressProvider');
        expect(steps[1].textContent).toBe(
            'Enter the class name below, then save.'
        );
        expect(q(el, '[data-id="none-help"]')).toBeNull();
    });

    it('Test connection reports the count: plural, singular and zero', async () => {
        const el = await mount({ provider: 'Google' });
        const cases = [
            [
                3,
                'Connected. A test search for “1 Market St” returned 3 addresses.'
            ],
            [
                1,
                'Connected. A test search for “1 Market St” returned 1 address.'
            ],
            [
                0,
                'Connected, but a test search for “1 Market St” found no addresses.'
            ]
        ];
        for (const [count, msg] of cases) {
            testAddressConnection.mockResolvedValueOnce({ ok: true, count });
            testBtn(el).click();
            // eslint-disable-next-line no-await-in-loop -- each case must settle before the next click
            await flush();
            expect(q(el, '[data-id="notice"]').textContent.trim()).toBe(msg);
            expect(q(el, '[data-id="notice"]').className).toContain(
                'fs-notice-success'
            );
            expect(q(el, '[data-id="notice"] lightning-icon').iconName).toBe(
                'utility:success'
            );
            expect(q(el, '[data-id="access-note"]').textContent.trim()).toBe(
                'This tests your own access. Guests and the people who fill in forms also need the last step.'
            );
        }
        expect(testAddressConnection).toHaveBeenCalledWith({
            provider: 'Google',
            apexClass: null
        });
    });

    it('explains each failure code for Google, with no access note', async () => {
        const el = await mount({ provider: 'Google' });
        const expected = {
            NOT_SET_UP: 'Choose a provider first.',
            NO_KEY: 'No key has been entered yet. Follow steps 2 and 3, then test again.',
            KEY_REFUSED:
                "Google refused the key. Check that it's correct, that Places API (New) and billing are on for its project, and that the key isn't limited to websites.",
            NO_ACCESS:
                "You can't use the key yet. Assign yourself the Final Address Search permission set, then test again.",
            LIMIT: 'Google says this key is over its limit. Check its quota in Google Cloud.',
            DOWN: "Google didn't answer properly. Try again in a minute.",
            WHATEVER: "The test couldn't run. Try again."
        };
        for (const code of Object.keys(expected)) {
            testAddressConnection.mockResolvedValueOnce({ ok: false, code });
            testBtn(el).click();
            // eslint-disable-next-line no-await-in-loop -- each case must settle before the next click
            await flush();
            const n = q(el, '[data-id="notice"]');
            expect(n.textContent.trim()).toBe(expected[code]);
            expect(n.className).toContain('fs-notice-error');
            expect(q(el, '[data-id="notice"] lightning-icon').iconName).toBe(
                'utility:error'
            );
            expect(q(el, '[data-id="access-note"]')).toBeNull();
        }
    });

    it('explains failures for Your own provider', async () => {
        const el = await mount({
            provider: 'Custom',
            apexClass: 'MyAddressProvider'
        });
        const expected = {
            NO_KEY: "No key has been entered yet for your provider's credential.",
            KEY_REFUSED: 'Your provider refused the request. Check its key.',
            LIMIT: 'Your provider says the key is over its limit.',
            DOWN: "Your provider didn't answer properly. Try again in a minute."
        };
        for (const code of Object.keys(expected)) {
            testAddressConnection.mockResolvedValueOnce({ ok: false, code });
            testBtn(el).click();
            // eslint-disable-next-line no-await-in-loop -- each case must settle before the next click
            await flush();
            expect(q(el, '[data-id="notice"]').textContent.trim()).toBe(
                expected[code]
            );
        }
        expect(testAddressConnection).toHaveBeenLastCalledWith({
            provider: 'Custom',
            apexClass: 'MyAddressProvider'
        });
    });

    it('a Custom test that is NOT_SET_UP errors on the class box, not in the notice', async () => {
        const el = await mount({
            provider: 'Custom',
            apexClass: 'MyAddressProvider'
        });
        const { validity, report } = spyClass(el);
        testAddressConnection.mockResolvedValue({
            ok: false,
            code: 'NOT_SET_UP'
        });
        testBtn(el).click();
        await flush();
        expect(validity).toHaveBeenLastCalledWith(BAD_CLASS);
        expect(report).toHaveBeenCalled();
        expect(q(el, '[data-id="notice"]')).toBeNull();
    });

    it('a blank class box errors on the field for Test and Save, with no server call', async () => {
        const el = await mount({ provider: 'None' });
        await pickProvider(el, 'Custom');
        const { validity, report } = spyClass(el);
        testBtn(el).click();
        await flush();
        expect(validity).toHaveBeenLastCalledWith('Enter the Apex class name.');
        expect(report).toHaveBeenCalledTimes(1);
        saveBtn(el).click();
        await flush();
        expect(validity).toHaveBeenLastCalledWith('Enter the Apex class name.');
        expect(report).toHaveBeenCalledTimes(2);
        expect(testAddressConnection).not.toHaveBeenCalled();
        expect(saveAddressSettings).not.toHaveBeenCalled();
        expect(q(el, '[data-id="notice"]')).toBeNull();
    });

    it('a Save refused for the bad class errors on the box; typing or switching clears it', async () => {
        const el = await mount({ provider: 'None' });
        await pickProvider(el, 'Custom');
        await typeClass(el, 'Nope');
        const { validity, report } = spyClass(el);
        saveAddressSettings.mockRejectedValue({ body: { message: BAD_CLASS } });
        saveBtn(el).click();
        await flush();
        expect(validity).toHaveBeenLastCalledWith(BAD_CLASS);
        expect(report).toHaveBeenCalled();
        expect(q(el, '[data-id="notice"]')).toBeNull();

        await typeClass(el, 'Other');
        expect(validity).toHaveBeenLastCalledWith('');
        validity.mockClear();
        await pickProvider(el, 'Google');
        expect(validity).toHaveBeenCalledWith('');
    });

    it('a successful test with unsaved changes says to save; a saved setup does not', async () => {
        const el = await mount({ provider: 'None' });
        await pickProvider(el, 'Google');
        testAddressConnection.mockResolvedValue({ ok: true, count: 2 });
        testBtn(el).click();
        await flush();
        expect(q(el, '[data-id="notice"]').textContent.trim()).toBe(
            'Connected. A test search for “1 Market St” returned 2 addresses. Save to turn it on.'
        );
        document.body.removeChild(el);

        const saved = await mount({ provider: 'Google' });
        testBtn(saved).click();
        await flush();
        expect(q(saved, '[data-id="notice"]').textContent).not.toContain(
            'Save to turn it on.'
        );
    });

    it('scrolls the notice into view once it shows', async () => {
        const el = await mount({ provider: 'Google' });
        const scroll = jest.fn();
        Element.prototype.scrollIntoView = scroll;
        testAddressConnection.mockResolvedValue({ ok: true, count: 1 });
        testBtn(el).click();
        await flush();
        expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
        delete Element.prototype.scrollIntoView;
    });

    it('shows only the Test button busy while testing', async () => {
        const el = await mount({ provider: 'Google' });
        let resolve;
        testAddressConnection.mockReturnValue(
            new Promise((r) => {
                resolve = r;
            })
        );
        testBtn(el).click();
        await flush();
        expect(testBtn(el).label).toBe('Testing…');
        expect(testBtn(el).disabled).toBe(true);
        resolve({ ok: true, count: 2 });
        await flush();
        expect(testBtn(el).label).toBe('Test connection');
        expect(testBtn(el).disabled).toBe(false);
    });

    it('Save sends provider and class, then says what changed', async () => {
        const el = await mount({ provider: 'None' });
        expect(saveBtn(el).disabled).toBe(true);
        await pickProvider(el, 'Custom');
        expect(saveBtn(el).disabled).toBe(false);
        await typeClass(el, ' MyAddressProvider ');
        saveAddressSettings.mockResolvedValue();
        saveBtn(el).click();
        await flush();
        expect(saveAddressSettings).toHaveBeenCalledWith({
            provider: 'Custom',
            apexClass: 'MyAddressProvider'
        });
        const n = q(el, '[data-id="notice"]');
        expect(n.textContent.trim()).toBe(
            'Saved. Address questions now search with your provider.'
        );
        expect(n.className).toContain('fs-notice-success');
        expect(q(el, '[data-id="access-note"]')).toBeNull();
        // nothing changed since the save
        expect(saveBtn(el).disabled).toBe(true);
    });

    it('Save sends no class for Google and says Google Places', async () => {
        const el = await mount({ provider: 'None' });
        await pickProvider(el, 'Google');
        saveAddressSettings.mockResolvedValue();
        saveBtn(el).click();
        await flush();
        expect(saveAddressSettings).toHaveBeenCalledWith({
            provider: 'Google',
            apexClass: null
        });
        expect(q(el, '[data-id="notice"]').textContent.trim()).toBe(
            'Saved. Address questions now search with Google Places.'
        );
    });

    it('saving None says search is off', async () => {
        const el = await mount({ provider: 'Google' });
        await pickProvider(el, 'None');
        saveAddressSettings.mockResolvedValue();
        saveBtn(el).click();
        await flush();
        expect(q(el, '[data-id="notice"]').textContent.trim()).toBe(
            'Saved. Address search is off.'
        );
    });

    it('a save error shows the server message in failure style and keeps Save enabled', async () => {
        const el = await mount({ provider: 'None' });
        await pickProvider(el, 'Google');
        saveAddressSettings.mockRejectedValue({
            body: { message: 'Choose a provider from the list.' }
        });
        saveBtn(el).click();
        await flush();
        const n = q(el, '[data-id="notice"]');
        expect(n.textContent.trim()).toBe('Choose a provider from the list.');
        expect(n.className).toContain('fs-notice-error');
        expect(saveBtn(el).disabled).toBe(false);
    });

    it('changing the provider or class clears the notice', async () => {
        const el = await mount({ provider: 'Google' });
        testAddressConnection.mockResolvedValue({ ok: true, count: 2 });
        testBtn(el).click();
        await flush();
        expect(q(el, '[data-id="notice"]')).not.toBeNull();
        await pickProvider(el, 'Custom');
        expect(q(el, '[data-id="notice"]')).toBeNull();

        await typeClass(el, 'Abc');
        testAddressConnection.mockResolvedValue({ ok: false, code: 'DOWN' });
        testBtn(el).click();
        await flush();
        expect(q(el, '[data-id="notice"]')).not.toBeNull();
        await typeClass(el, 'Abcd');
        expect(q(el, '[data-id="notice"]')).toBeNull();
    });

    it('the feedback area is a polite live region', async () => {
        const el = await mount({ provider: 'Google' });
        const live = q(el, '.fs-feedback');
        expect(live.getAttribute('role')).toBe('status');
        expect(live.getAttribute('aria-live')).toBe('polite');
    });

    it('without Manage form settings: controls disabled, no buttons, info notice', async () => {
        const el = await mount({
            provider: 'Custom',
            apexClass: 'Abc',
            canManage: false
        });
        expect(q(el, 'lightning-combobox').disabled).toBe(true);
        expect(q(el, 'lightning-input.fs-class').disabled).toBe(true);
        expect(testBtn(el)).toBeNull();
        expect(saveBtn(el)).toBeNull();
        const ro = q(el, '[data-id="readonly"]');
        expect(ro.textContent.replace(/\s+/g, ' ')).toContain(
            'You can see these settings but not change them. Ask an admin for the Manage form settings permission.'
        );
        expect(ro.className).toContain('fs-notice-info');
        expect(ro.className).not.toContain('warning');
        const icon = ro.querySelector('lightning-icon');
        expect(icon.iconName).toBe('utility:info');
        expect(icon.size).toBe('x-small');
        expect(icon.alternativeText).toBe('');
    });

    it('a failed load shows the failed state, and Retry loads again', async () => {
        getAddressSettings.mockRejectedValueOnce(new Error('boom'));
        const el = createElement('c-final-settings', { is: FinalSettings });
        document.body.appendChild(el);
        await flush();
        expect(q(el, '[data-id="failed"]').textContent).toContain(
            "Settings couldn't be loaded."
        );
        expect(q(el, '[data-id="loading"]')).toBeNull();
        expect(q(el, 'lightning-combobox')).toBeNull();

        getAddressSettings.mockResolvedValue({
            provider: 'Google',
            apexClass: null,
            canManage: true
        });
        q(el, 'lightning-button.fs-retry').click();
        await flush();
        expect(getAddressSettings).toHaveBeenCalledTimes(2);
        expect(q(el, '[data-id="failed"]')).toBeNull();
        expect(q(el, 'lightning-combobox').value).toBe('Google');
    });

    it('has the subtitle (no page title), pane header and a one-tab rail', async () => {
        const el = await mount();
        expect(q(el, '.fs-title')).toBeNull();
        expect(q(el, 'h2')).toBeNull();
        expect(q(el, '.fs-subtitle').textContent).toContain(
            'These apply to every form and survey in your organization.'
        );
        expect(q(el, '.fs-pane-title').textContent.trim()).toBe(
            'Address search'
        );
        const rail = q(el, 'c-final-studio-rail');
        expect(rail.value).toBe('address');
        expect(rail.tabs).toEqual([
            {
                key: 'address',
                label: 'Address search',
                icon: 'utility:location'
            }
        ]);
        expect(rail.label).toBe('Settings sections');
    });
});
