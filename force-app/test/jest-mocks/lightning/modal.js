/**
 * Stub for `lightning/modal`, which sfdx-lwc-jest does not ship.
 *
 * It ships stubs for modalHeader/Body/Footer but not the base class they sit
 * in, so a component extending LightningModal cannot be mounted at all
 * without this. Mapped in jest.config.js.
 *
 * `close(value)` is what resolves the real `open()` promise; here it raises a
 * `close` event so a test can observe the value the dialog settled on.
 */
import { LightningElement, api } from 'lwc';

export default class LightningModal extends LightningElement {
    @api size;
    @api label;
    @api description;
    @api disableClose;

    @api
    close(value) {
        this.dispatchEvent(new CustomEvent('close', { detail: value }));
    }

    static open() {
        return Promise.resolve();
    }
}
