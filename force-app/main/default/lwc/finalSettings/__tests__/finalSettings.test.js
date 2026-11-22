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
    q(el, 'lightning-input').dispatchEvent(
        new CustomEvent('change', { detail: { value } })
    );
    await flush();
}

describe('c-final-settings', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.resetAllMocks();
    });

    it('shows loading, then the loaded Google settings with its three steps', async () => {
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
        expect(steps).toHaveLength(3);
        expect(steps[0].textContent).toContain('Places API (New)');
        expect(steps[1].textContent).toContain('Final Address Google');
        expect(steps[2].textContent).toContain('Final Address Search');
        expect(q(el, 'lightning-input')).toBeNull();
        expect(text(el)).toContain('Connect your key');
    });

    it('None shows the plain-fields help, no steps, and Test connection is disabled', async () => {
        const el = await mount({ provider: 'None' });
        expect(q(el, '[data-id="none-help"]').textContent).toContain(
            'Address questions show plain address fields, with no search.'
        );
        expect(q(el, '[data-id="steps-google"]')).toBeNull();
        expect(q(el, '[data-id="steps-custom"]')).toBeNull();
        expect(testBtn(el).disabled).toBe(true);
        expect(saveBtn(el).disabled).toBe(true);
    });

    it('Your own shows the Apex class box and its steps', async () => {
        const el = await mount({
            provider: 'Custom',
            apexClass: 'MyAddressProvider'
        });
        const input = q(el, 'lightning-input');
        expect(input.label).toBe('Apex class name');
        expect(input.value).toBe('MyAddressProvider');
        expect(input.fieldLevelHelp).toBe(
            'A class that implements FinalAddressProvider.'
        );
        const steps = q(el, '[data-id="steps-custom"]').querySelectorAll('li');
        expect(steps).toHaveLength(3);
        expect(steps[0].textContent).toContain('FinalAddressProvider');
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
            expect(q(el, '[data-id="access-note"]').textContent).toContain(
                'This tests your own access.'
            );
        }
        expect(testAddressConnection).toHaveBeenCalledWith({
            provider: 'Google',
            apexClass: null
        });
    });

    it('explains each failure code for Google', async () => {
        const el = await mount({ provider: 'Google' });
        const expected = {
            NOT_SET_UP: 'Choose a provider first.',
            NO_KEY: 'No key has been entered yet. Follow step 2, then test again.',
            KEY_REFUSED:
                "Google refused the key. Check that it's correct and that Places API (New) is turned on for it.",
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
        }
    });

    it('explains failures for Your own provider', async () => {
        const el = await mount({
            provider: 'Custom',
            apexClass: 'MyAddressProvider'
        });
        const expected = {
            KEY_REFUSED: 'Your provider refused the request. Check its key.',
            LIMIT: 'Your provider says the key is over its limit.',
            DOWN: "Your provider didn't answer properly. Try again in a minute.",
            NOT_SET_UP:
                "That Apex class can't be used. It must exist, have a public constructor with no arguments, and implement FinalAddressProvider."
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

    it('Save sends provider and class, then says Saved.', async () => {
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
        expect(n.textContent.trim()).toBe('Saved.');
        expect(n.className).toContain('fs-notice-success');
        expect(q(el, '[data-id="access-note"]')).toBeNull();
        // nothing changed since the save
        expect(saveBtn(el).disabled).toBe(true);
    });

    it('Save sends no class for Google', async () => {
        const el = await mount({ provider: 'None' });
        await pickProvider(el, 'Google');
        saveAddressSettings.mockResolvedValue();
        saveBtn(el).click();
        await flush();
        expect(saveAddressSettings).toHaveBeenCalledWith({
            provider: 'Google',
            apexClass: null
        });
    });

    it('a save error shows the server message in failure style and keeps Save enabled', async () => {
        const el = await mount({ provider: 'None' });
        await pickProvider(el, 'Custom');
        await typeClass(el, 'Nope');
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

        testAddressConnection.mockResolvedValue({ ok: false, code: 'DOWN' });
        testBtn(el).click();
        await flush();
        expect(q(el, '[data-id="notice"]')).not.toBeNull();
        await typeClass(el, 'Abc');
        expect(q(el, '[data-id="notice"]')).toBeNull();
    });

    it('the feedback area is a polite live region', async () => {
        const el = await mount({ provider: 'Google' });
        const live = q(el, '.fs-feedback');
        expect(live.getAttribute('role')).toBe('status');
        expect(live.getAttribute('aria-live')).toBe('polite');
    });

    it('without Manage form settings: controls disabled, no buttons, warning notice', async () => {
        const el = await mount({
            provider: 'Custom',
            apexClass: 'Abc',
            canManage: false
        });
        expect(q(el, 'lightning-combobox').disabled).toBe(true);
        expect(q(el, 'lightning-input').disabled).toBe(true);
        expect(testBtn(el)).toBeNull();
        expect(saveBtn(el)).toBeNull();
        expect(q(el, '[data-id="readonly"]').textContent).toContain(
            'You can see these settings but not change them. Ask an admin for the Manage form settings permission.'
        );
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

    it('has the page title, subtitle, pane header and a one-tab rail', async () => {
        const el = await mount();
        expect(q(el, '.fs-title').textContent).toBe('Settings');
        expect(q(el, '.fs-subtitle').textContent).toContain(
            'These apply to every form and survey in your organisation.'
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
