import { LightningElement, track } from 'lwc';

/**
 * SLICE 0 SPIKE — throwaway. Proves what `lightning-record-picker` actually
 * does with a runtime-changing `filter`, in the real hosts, before
 * IMPL_PLAN_DEPENDENT_LOOKUP builds anything on top of it.
 *
 * Delete once the evidence is recorded. Not wired to Forms, imports nothing
 * from the product.
 */
export default class FinalLookupSpike extends LightningElement {
    @track accountId = null;
    @track contactId = null;
    @track log = [];
    remountOnFilterChange = false;
    generation = 0;

    matchingInfo = { primaryField: { fieldPath: 'Name', mode: 'startsWith' } };
    displayInfo = { primaryField: 'Name', additionalFields: ['Title'] };

    /** The whole point: does the native control re-query when this object
     *  identity changes on an already-mounted instance? */
    get contactFilter() {
        return {
            criteria: [
                {
                    fieldPath: 'AccountId',
                    operator: 'eq',
                    value: this.accountId
                }
            ]
        };
    }

    get contactDisabled() {
        return !this.accountId;
    }

    get filterJson() {
        return JSON.stringify(this.contactFilter);
    }

    /** LWC only remounts on a changed `key`, and `key` is a for:each-only
     *  directive — so a one-item list is the legitimate remount idiom. */
    get generations() {
        return [this.generation];
    }

    get readout() {
        return `account=${this.accountId || 'none'} contact=${
            this.contactId || 'none'
        } gen=${this.generation}`;
    }

    get logText() {
        return this.log.join(' | ');
    }

    note(msg) {
        this.log = [...this.log, msg].slice(-8);
    }

    handleAccount(event) {
        const next = (event.detail && event.detail.recordId) || null;
        const changed = next !== this.accountId;
        this.accountId = next;
        this.note(`account->${next || 'null'}`);
        if (changed) {
            // v1 rule under test: does the child KEEP a now-invalid selection
            // if we do nothing? Only clear when the checkbox says to.
            if (this.remountOnFilterChange) {
                this.generation += 1;
                this.contactId = null;
                this.note('remounted child');
            }
        }
    }

    handleContact(event) {
        this.contactId = (event.detail && event.detail.recordId) || null;
        this.note(`contact->${this.contactId || 'null'}`);
    }

    handleError(event) {
        const d = event.detail || {};
        this.note(`ERROR ${JSON.stringify(d).slice(0, 120)}`);
    }

    handleReady() {
        this.note('child ready');
    }

    handleRemountToggle(event) {
        this.remountOnFilterChange = event.target.checked;
    }

    /** The plan warns: do NOT assume a native checkValidity() exists, or that
     *  reportValidity() returns a boolean. Ask the real control. */
    handleProbe() {
        const out = [];
        for (const id of ['account', 'contact']) {
            const p = this.template.querySelector(`[data-id="${id}"]`);
            if (!p) {
                out.push(`${id}:MISSING`);
                continue;
            }
            const t = (n) => typeof p[n];
            let cv = 'n/a';
            let rv = 'n/a';
            try {
                cv =
                    typeof p.checkValidity === 'function'
                        ? JSON.stringify(p.checkValidity())
                        : 'absent';
            } catch (err) {
                cv = 'threw: ' + String(err).slice(0, 40);
            }
            try {
                rv =
                    typeof p.reportValidity === 'function'
                        ? JSON.stringify(p.reportValidity())
                        : 'absent';
            } catch (err) {
                rv = 'threw: ' + String(err).slice(0, 40);
            }
            out.push(
                `${id}[focus:${t('focus')} setCustomValidity:${t(
                    'setCustomValidity'
                )} checkValidity()=${cv} reportValidity()=${rv}]`
            );
        }
        this.log = out;
    }

    handleClearContact() {
        this.contactId = null;
        this.note('cleared contact programmatically');
    }
}
