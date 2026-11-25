import { createElement } from 'lwc';
import FinalUploadSettings from 'c/finalUploadSettings';
import getUploadSettings from '@salesforce/apex/FinalSettingsController.getUploadSettings';
import saveUploadSettings from '@salesforce/apex/FinalSettingsController.saveUploadSettings';
jest.mock(
    '@salesforce/apex/FinalSettingsController.getUploadSettings',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSettingsController.saveUploadSettings',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
const flush = () => Promise.resolve().then(() => Promise.resolve());
afterEach(() => {
    document.body.replaceChildren();
    jest.clearAllMocks();
});
it('edits guest defaults in bytes and explains that signed-in respondents have no defaults', async () => {
    getUploadSettings.mockResolvedValue({
        enabled: true,
        canManage: true,
        maxFileBytes: 10485760,
        maxTotalBytes: 26214400,
        maxFiles: 5,
        maxEntries: 20
    });
    saveUploadSettings.mockResolvedValue(undefined);
    const el = createElement('c-final-upload-settings', {
        is: FinalUploadSettings
    });
    document.body.appendChild(el);
    await flush();
    const size = el.shadowRoot.querySelector('[data-setting="maxFileMiB"]');
    size.value = '30';
    size.dispatchEvent(new CustomEvent('change'));
    await flush();
    el.shadowRoot.querySelectorAll('lightning-input').forEach((input) => {
        input.reportValidity = jest.fn(() => true);
    });
    el.shadowRoot.querySelector('lightning-button').click();
    await flush();
    expect(saveUploadSettings).toHaveBeenCalledWith(
        expect.objectContaining({ maxFileBytes: 31457280, maxFiles: 5 })
    );
    expect(el.shadowRoot.textContent).toContain(
        'Signed-in respondents have no app default'
    );
});
