import { LightningElement } from 'lwc';
import getAddressSettings from '@salesforce/apex/FinalSettingsController.getAddressSettings';
import saveAddressSettings from '@salesforce/apex/FinalSettingsController.saveAddressSettings';
import testAddressConnection from '@salesforce/apex/FinalSettingsController.testAddressConnection';

/**
 * finalSettings: the org-wide Settings tab (IMPL_PLAN_ADDRESS_INPUT, slice 2).
 * Address search is the only section for now. Anyone with the class can see the
 * settings; only people with Manage form settings can change them or test.
 */

const NOT_SET_UP_CLASS =
    "That Apex class can't be used. It must exist, have a public constructor with no arguments, and implement FinalAddressProvider.";

export function testMessage(result, provider) {
    const google = provider === 'Google';
    if (result && result.ok) {
        const n = result.count || 0;
        if (n === 0) {
            return 'Connected, but a test search for “1 Market St” found no addresses.';
        }
        return `Connected. A test search for “1 Market St” returned ${
            n === 1 ? '1 address' : `${n} addresses`
        }.`;
    }
    switch (result && result.code) {
        case 'NOT_SET_UP':
            return provider === 'Custom'
                ? NOT_SET_UP_CLASS
                : 'Choose a provider first.';
        case 'NO_KEY':
            return 'No key has been entered yet. Follow step 2, then test again.';
        case 'KEY_REFUSED':
            return google
                ? "Google refused the key. Check that it's correct and that Places API (New) is turned on for it."
                : 'Your provider refused the request. Check its key.';
        case 'NO_ACCESS':
            return "You can't use the key yet. Assign yourself the Final Address Search permission set, then test again.";
        case 'LIMIT':
            return google
                ? 'Google says this key is over its limit. Check its quota in Google Cloud.'
                : 'Your provider says the key is over its limit.';
        case 'DOWN':
            return google
                ? "Google didn't answer properly. Try again in a minute."
                : "Your provider didn't answer properly. Try again in a minute.";
        default:
            return "The test couldn't run. Try again.";
    }
}

/**
 * Setup steps as text runs. Written as data, not template markup, because
 * the LWC compiler drops the whitespace between a line-wrapped text node and
 * a <strong>, which rendered "turn onPlaces API" in the org. `**` marks the
 * names people look for on screen.
 */
const STEPS = {
    Google: [
        'In Google Cloud, create an API key and turn on **Places API (New)** for it.',
        'In Setup, open **Named Credentials**, then the **External Credentials** tab, then **Final Address Google**. Under **Principals**, edit **Shared_Key** and add an authentication parameter named **Key** whose value is your API key.',
        "Assign the **Final Address Search** permission set to your public site's guest user and to the people who fill in forms."
    ],
    Custom: [
        'Write an Apex class that implements **FinalAddressProvider**. It makes its own callouts, usually through its own Named Credential.',
        'Enter the class name above, then save.',
        "Give your public site's guest user and the people who fill in forms access to your class's credential, and assign them the **Final Address Search** permission set."
    ]
};

function toRuns(step, stepIndex) {
    return step.split('**').map((t, i) => ({
        key: `${stepIndex}-${i}`,
        t,
        cls: i % 2 === 1 ? 'fs-strong' : ''
    }));
}

export default class FinalSettings extends LightningElement {
    get steps() {
        return (STEPS[this.provider] || []).map((step, i) => ({
            key: `step-${i}`,
            parts: toRuns(step, i)
        }));
    }

    railTabs = [
        { key: 'address', label: 'Address search', icon: 'utility:location' }
    ];
    providerOptions = [
        { label: 'None', value: 'None' },
        { label: 'Google Places', value: 'Google' },
        { label: 'Your own (Apex class)', value: 'Custom' }
    ];

    loadState = 'loading'; // loading | ready | failed
    canManage = false;
    provider = 'None';
    apexClass = '';
    savedProvider = 'None';
    savedClass = '';
    busy = ''; // '' | 'test' | 'save'
    notice = null; // { kind: 'success' | 'error', text, showAccessNote }
    _seq = 0;

    connectedCallback() {
        this.load();
    }

    async load() {
        this.loadState = 'loading';
        try {
            const s = await getAddressSettings();
            this.provider = s.provider || 'None';
            this.apexClass = s.apexClass || '';
            this.savedProvider = this.provider;
            this.savedClass = this.apexClass;
            this.canManage = !!s.canManage;
            this.loadState = 'ready';
        } catch {
            this.loadState = 'failed';
        }
    }

    // ----- state getters -----

    get isLoading() {
        return this.loadState === 'loading';
    }
    get isFailed() {
        return this.loadState === 'failed';
    }
    get isReadOnly() {
        return !this.canManage;
    }
    get canAct() {
        return this.canManage;
    }
    get isNone() {
        return this.provider === 'None';
    }
    get isGoogle() {
        return this.provider === 'Google';
    }
    get isCustom() {
        return this.provider === 'Custom';
    }
    get isDirty() {
        if (this.provider !== this.savedProvider) {
            return true;
        }
        return (
            this.provider === 'Custom' &&
            (this.apexClass || '').trim() !== (this.savedClass || '')
        );
    }
    get testLabel() {
        return this.busy === 'test' ? 'Testing…' : 'Test connection';
    }
    get saveLabel() {
        return this.busy === 'save' ? 'Saving…' : 'Save';
    }
    get testDisabled() {
        return this.isNone || this.busy !== '';
    }
    get saveDisabled() {
        return !this.isDirty || this.busy !== '';
    }
    get hasNotice() {
        return !!this.notice;
    }
    get noticeClass() {
        return this.notice && this.notice.kind === 'error'
            ? 'fs-notice fs-notice-error'
            : 'fs-notice fs-notice-success';
    }

    // ----- handlers -----

    clearNotice() {
        this._seq += 1; // a request still in flight no longer applies
        this.notice = null;
        this.busy = '';
    }

    handleProvider(event) {
        this.provider = event.detail.value;
        this.clearNotice();
    }

    handleClass(event) {
        this.apexClass = event.detail.value;
        this.clearNotice();
    }

    handleRetry() {
        this.load();
    }

    async handleTest() {
        if (this.testDisabled) {
            return;
        }
        const seq = ++this._seq;
        const provider = this.provider;
        this.busy = 'test';
        this.notice = null;
        let notice;
        try {
            const result = await testAddressConnection({
                provider,
                apexClass: provider === 'Custom' ? this.apexClass : null
            });
            notice = {
                kind: result && result.ok ? 'success' : 'error',
                text: testMessage(result, provider),
                showAccessNote: true
            };
        } catch (e) {
            notice = {
                kind: 'error',
                text:
                    (e && e.body && e.body.message) ||
                    "The test couldn't run. Try again.",
                showAccessNote: false
            };
        }
        if (seq !== this._seq) {
            return;
        }
        this.notice = notice;
        this.busy = '';
    }

    async handleSave() {
        if (this.saveDisabled) {
            return;
        }
        const seq = ++this._seq;
        const provider = this.provider;
        const apexClass = provider === 'Custom' ? this.apexClass.trim() : null;
        this.busy = 'save';
        this.notice = null;
        let notice;
        try {
            await saveAddressSettings({ provider, apexClass });
            this.savedProvider = provider;
            this.savedClass = apexClass || '';
            notice = { kind: 'success', text: 'Saved.', showAccessNote: false };
        } catch (e) {
            notice = {
                kind: 'error',
                text:
                    (e && e.body && e.body.message) ||
                    "Settings couldn't be saved. Try again.",
                showAccessNote: false
            };
        }
        if (seq !== this._seq) {
            return;
        }
        this.notice = notice;
        this.busy = '';
    }
}
