import { LightningElement, api } from 'lwc';
import getUpdatableObjects from '@salesforce/apex/FinalFormCreateController.getUpdatableObjects';

/**
 * finalConnectedObjectCard — SO-1 (SURVEY_OBJECT_SPEC V2): the survey's
 * Connected-object card on the Build pane's root view. DUMB view: the studio
 * owns the spec math (survivors/casualties) and drives the confirm state via
 * `pending`; the card only picks, asks, and relays intent.
 *
 * Events: objectpick {objectApi} · objectclear · objectconfirm · objectcancel
 */
export default class FinalConnectedObjectCard extends LightningElement {
    @api objectApi;
    @api mappedCount;
    /** {objectApi|null, casualties: [label strings], survivors: n} → the
     *  confirm view. null/undefined = no pending change. */
    @api pending;
    /** Server-refusal message from the studio ('' = none). */
    @api errorText;
    /** SO-4: the last minted record-link query string (studio sets it after a
     *  successful mint) — shown read-only with a Copy button. */
    @api mintedLink;
    /** SO-4: true while a mint / invalidate Apex call is in flight. */
    @api linkBusy;

    picking = false;
    search = '';
    objects = null;
    loadFailed = false;
    /** SO-4: the record Id the author typed to mint a link for. */
    linkRecordId = '';

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
            (o) => o.value === this.objectApi
        );
        return hit ? `${hit.label} · ${this.objectApi}` : this.objectApi;
    }

    get mappedSummary() {
        const n = this.mappedCount || 0;
        if (!n) {
            return "No questions mapped yet — pick a field in a question's inspector.";
        }
        return n === 1 ? '1 question mapped' : `${n} questions mapped`;
    }

    get filteredObjects() {
        const q = this.search.trim().toLowerCase();
        const all = this.objects || [];
        const hits = q
            ? all.filter(
                  (o) =>
                      o.label.toLowerCase().includes(q) ||
                      o.value.toLowerCase().includes(q)
              )
            : all;
        return hits.slice(0, 60);
    }

    get hasCasualties() {
        return Boolean(
            this.pending &&
            this.pending.casualties &&
            this.pending.casualties.length
        );
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
        return this.pending && this.pending.objectApi
            ? 'Change anyway'
            : 'Disconnect';
    }

    get survivorNote() {
        const s = this.pending && this.pending.survivors;
        if (!s) {
            return '';
        }
        return s === 1
            ? '1 compatible mapping will carry over.'
            : `${s} compatible mappings will carry over.`;
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

    // ----- SO-4 record links -----

    get createLinkDisabled() {
        const id = (this.linkRecordId || '').trim();
        return this.linkBusy || (id.length !== 15 && id.length !== 18);
    }

    handleLinkRecordId(event) {
        this.linkRecordId = event.target.value;
    }

    handleCreateLink() {
        const recordId = (this.linkRecordId || '').trim();
        if (recordId.length !== 15 && recordId.length !== 18) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent('mintlink', { detail: { recordId } })
        );
    }

    handleInvalidateLinks() {
        this.dispatchEvent(new CustomEvent('invalidatelinks'));
    }

    handleCopyLink() {
        if (
            this.mintedLink &&
            navigator.clipboard &&
            navigator.clipboard.writeText
        ) {
            navigator.clipboard.writeText(this.mintedLink);
        }
    }
}
