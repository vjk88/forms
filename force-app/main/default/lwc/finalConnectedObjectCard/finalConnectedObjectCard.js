import { LightningElement, api } from 'lwc';
import getUpdatableObjects from '@salesforce/apex/FinalFormCreateController.getUpdatableObjects';

/**
 * Object-connection editor. The studio owns persistence and mapping math; this
 * component only presents the picker/confirmation states and emits intent.
 *
 * Events: objectpick {objectApi}, objectclear, objectconfirm, objectcancel.
 */
export default class FinalConnectedObjectCard extends LightningElement {
    @api objectApi;
    @api mappedCount;
    @api pending;
    @api errorText;

    picking = false;
    search = '';
    objects = null;
    loadFailed = false;

    get isPending() {
        return Boolean(this.pending);
    }

    get isPicking() {
        return this.picking;
    }

    get hasObject() {
        return Boolean(this.objectApi);
    }

    get displayLabel() {
        const hit = (this.objects || []).find(
            (option) => option.value === this.objectApi
        );
        return hit ? `${hit.label} · ${this.objectApi}` : this.objectApi;
    }

    get mappedSummary() {
        const count = this.mappedCount || 0;
        if (!count) {
            return "No questions mapped yet — pick a field in a question's inspector.";
        }
        return count === 1 ? '1 question mapped' : `${count} questions mapped`;
    }

    get filteredObjects() {
        const query = this.search.trim().toLowerCase();
        const objects = this.objects || [];
        const matches = query
            ? objects.filter(
                  (option) =>
                      option.label.toLowerCase().includes(query) ||
                      option.value.toLowerCase().includes(query)
              )
            : objects;
        return matches.slice(0, 60);
    }

    get hasCasualties() {
        return Boolean(this.pending?.casualties?.length);
    }

    get pendingTitle() {
        if (!this.pending) {
            return '';
        }
        return this.pending.objectApi
            ? `Change the connected object to ${this.pending.objectApi}?`
            : 'Disconnect the object?';
    }

    get pendingCta() {
        return this.pending?.objectApi ? 'Change anyway' : 'Disconnect';
    }

    get survivorNote() {
        const survivors = this.pending?.survivors;
        if (!survivors) {
            return '';
        }
        return survivors === 1
            ? '1 compatible mapping will carry over.'
            : `${survivors} compatible mappings will carry over.`;
    }

    handleOpenPicker() {
        this.picking = true;
        this.search = '';
        this.loadFailed = false;
        if (!this.objects) {
            getUpdatableObjects()
                .then((list) => {
                    this.objects = list;
                })
                .catch(() => {
                    this.loadFailed = true;
                });
        }
    }

    handleSearch(event) {
        this.search = event.target.value;
    }

    handleCancelPick() {
        this.picking = false;
    }

    handlePick(event) {
        this.picking = false;
        this.dispatchEvent(
            new CustomEvent('objectpick', {
                detail: { objectApi: event.currentTarget.dataset.value }
            })
        );
    }

    handleClear() {
        this.dispatchEvent(new CustomEvent('objectclear'));
    }

    handleConfirm() {
        this.dispatchEvent(new CustomEvent('objectconfirm'));
    }

    handleCancel() {
        this.dispatchEvent(new CustomEvent('objectcancel'));
    }
}
