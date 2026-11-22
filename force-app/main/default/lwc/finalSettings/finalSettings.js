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
const CLASS_REQUIRED = 'Enter the Apex class name.';
const OPENS_IN_NEW_TAB = ' (opens in a new tab)';
const SAVED = {
    Google: 'Saved. Address questions now search with Google Places.',
    Custom: 'Saved. Address questions now search with your provider.',
    None: 'Saved. Address search is off.'
};
const GROUP_TITLE = { Google: 'Connect your key', Custom: 'Set it up' };

export function testMessage(result, provider, dirty = false) {
    const google = provider === 'Google';
    if (result && result.ok) {
        const n = result.count || 0;
        const save = dirty ? ' Save to turn it on.' : '';
        if (n === 0) {
            return `Connected, but a test search for “1 Market St” found no addresses.${save}`;
        }
        return `Connected. A test search for “1 Market St” returned ${
            n === 1 ? '1 address' : `${n} addresses`
        }.${save}`;
    }
    switch (result && result.code) {
        case 'NOT_SET_UP':
            return provider === 'Custom'
                ? NOT_SET_UP_CLASS
                : 'Choose a provider first.';
        case 'NO_KEY':
            return google
                ? 'No key has been entered yet. Follow steps 2 and 3, then test again.'
                : "No key has been entered yet for your provider's credential.";
        case 'KEY_REFUSED':
            return google
                ? "Google refused the key. Check that it's correct, that Places API (New) and billing are on for its project, and that the key isn't limited to websites."
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
 * names people look for on screen; `[[text|/path]]` is one link, opened in a
 * new tab.
 */
const STEPS = {
    Google: [
        "In Google Cloud, create an API key and turn on **Places API (New)** for its project. Billing must be on for that project. Under the key's restrictions, don't choose **Websites**: Salesforce calls Google from its own servers.",
        'In Setup, open [[Named Credentials|/lightning/setup/NamedCredential/home]], then the **External Credentials** tab, then **Final Address Google**.',
        'Under **Principals**, open the menu on the **Shared_Key** row and choose **Edit**. Add an authentication parameter named exactly **Key** (capital K) and paste your API key as its value.',
        "Assign the **Final Address Search** permission set to your public site's guest user and to the people who fill in forms."
    ],
    Custom: [
        'Write an Apex class that implements **FinalAddressProvider**. It makes its own callouts, usually through its own Named Credential.',
        'Enter the class name below, then save.',
        "Give your public site's guest user and the people who fill in forms access to your class's credential, and assign them the **Final Address Search** permission set."
    ]
};

const LINK = /\[\[([^|\]]+)\|([^\]]+)\]\]/;

function toRuns(step, stepIndex) {
    const runs = [];
    step.split('**').forEach((seg, i) => {
        const bold = i % 2 === 1;
        const bits = seg.split(LINK); // text, label, href, text, ...
        for (let j = 0; j < bits.length; j += 3) {
            if (bits[j]) {
                runs.push({
                    t: bits[j],
                    cls: bold ? 'fs-strong' : '',
                    isLink: false
                });
            }
            if (j + 2 < bits.length) {
                runs.push({
                    t: bits[j + 1],
                    href: bits[j + 2],
                    assist: OPENS_IN_NEW_TAB,
                    isLink: true
                });
            }
        }
    });
    return runs.map((r, k) => ({ ...r, key: `${stepIndex}-${k}` }));
}

export default class FinalSettings extends LightningElement {
    get steps() {
        return (STEPS[this.provider] || []).map((step, i) => ({
            key: `step-${i}`,
            parts: toRuns(step, i)
        }));
    }
    get hasSteps() {
        return this.isGoogle || this.isCustom;
    }
    get stepsId() {
        return `steps-${this.provider.toLowerCase()}`;
    }
    get stepsTitle() {
        return GROUP_TITLE[this.provider] || '';
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
    get showTest() {
        return !this.isNone;
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
    get noticeIcon() {
        return this.notice && this.notice.kind === 'error'
            ? 'utility:error'
            : 'utility:success';
    }

    // ----- handlers -----

    clearNotice() {
        this._seq += 1; // a request still in flight no longer applies
        this.notice = null;
        this.busy = '';
    }

    classInput() {
        return this.template.querySelector('.fs-class');
    }

    setClassError(message) {
        const input = this.classInput();
        if (input) {
            input.setCustomValidity(message);
            input.reportValidity();
        }
    }

    // after a notice renders, bring it into view (the buttons can sit far above it)
    revealNotice() {
        Promise.resolve().then(() => {
            const n = this.template.querySelector('[data-id="notice"]');
            if (n && n.scrollIntoView) {
                n.scrollIntoView({ block: 'nearest' });
            }
        });
    }

    handleProvider(event) {
        this.setClassError('');
        this.provider = event.detail.value;
        this.clearNotice();
    }

    handleClass(event) {
        this.setClassError('');
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
        const provider = this.provider;
        if (provider === 'Custom' && !(this.apexClass || '').trim()) {
            this.notice = null;
            this.setClassError(CLASS_REQUIRED);
            return;
        }
        const seq = ++this._seq;
        this.busy = 'test';
        this.notice = null;
        let notice = null;
        let fieldError = '';
        try {
            const result = await testAddressConnection({
                provider,
                apexClass: provider === 'Custom' ? this.apexClass : null
            });
            if (
                provider === 'Custom' &&
                result &&
                !result.ok &&
                result.code === 'NOT_SET_UP'
            ) {
                fieldError = NOT_SET_UP_CLASS;
            } else {
                const ok = !!(result && result.ok);
                notice = {
                    kind: ok ? 'success' : 'error',
                    text: testMessage(result, provider, this.isDirty),
                    showAccessNote: ok
                };
            }
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
        if (fieldError) {
            this.setClassError(fieldError);
        } else {
            this.revealNotice();
        }
    }

    async handleSave() {
        if (this.saveDisabled) {
            return;
        }
        const provider = this.provider;
        const apexClass =
            provider === 'Custom' ? (this.apexClass || '').trim() : null;
        if (provider === 'Custom' && !apexClass) {
            this.notice = null;
            this.setClassError(CLASS_REQUIRED);
            return;
        }
        const seq = ++this._seq;
        this.busy = 'save';
        this.notice = null;
        let notice = null;
        let fieldError = '';
        try {
            await saveAddressSettings({ provider, apexClass });
            this.savedProvider = provider;
            this.savedClass = apexClass || '';
            notice = {
                kind: 'success',
                text: SAVED[provider] || 'Saved.',
                showAccessNote: false
            };
        } catch (e) {
            const message = e && e.body && e.body.message;
            if (provider === 'Custom' && message === NOT_SET_UP_CLASS) {
                fieldError = message;
            } else {
                notice = {
                    kind: 'error',
                    text: message || "Settings couldn't be saved. Try again.",
                    showAccessNote: false
                };
            }
        }
        if (seq !== this._seq) {
            return;
        }
        this.notice = notice;
        this.busy = '';
        if (fieldError) {
            this.setClassError(fieldError);
        } else {
            this.revealNotice();
        }
    }
}
