import { LightningElement } from 'lwc';
import canAdminister from '@salesforce/customPermission/Final_Upload_Proof_Admin';
import createGrant from '@salesforce/apex/FinalUploadProofController.createGrant';
import inspectGrant from '@salesforce/apex/FinalUploadProofController.inspectGrant';

// Isolated transport proof. This component never enters the production answer pipeline.
export default class FinalUploadProof extends LightningElement {
    actorUserId = '';
    maxBytes = 10485760;
    grantText = '';
    activeGrant;
    message = '';
    inspection = '';
    busy = false;
    generation = 0;

    get isOperator() {
        return Boolean(canAdminister);
    }

    get accept() {
        return this.activeGrant?.accept.split(',');
    }

    get slotToken() {
        return this.activeGrant?.slotToken;
    }

    get nativeInstances() {
        return this.activeGrant ? [this.activeGrant] : [];
    }

    get markerField() {
        return this.activeGrant?.markerField;
    }

    get sizeGuidance() {
        return this.activeGrant
            ? `One file, up to ${this.activeGrant.maxBytes.toLocaleString()} bytes. Server checks the limit after transport.`
            : '';
    }

    disconnectedCallback() {
        this.generation += 1;
        this.activeGrant = undefined;
        this.grantText = '';
        this.inspection = '';
        this.busy = false;
    }

    handleActor(event) {
        this.actorUserId = event.target.value;
    }

    handleSize(event) {
        this.maxBytes = Number(event.target.value);
    }

    handleGrantText(event) {
        this.generation += 1;
        this.busy = false;
        this.activeGrant = undefined;
        this.inspection = '';
        this.message = '';
        this.grantText = event.target.value;
    }

    async handleCreate() {
        const generation = ++this.generation;
        this.busy = true;
        this.activeGrant = undefined;
        this.grantText = '';
        this.inspection = '';
        try {
            const grant = await createGrant({
                actorUserId: this.actorUserId,
                maxBytes: this.maxBytes
            });
            if (generation !== this.generation) return;
            this.grantText = JSON.stringify(grant);
            this.message =
                'Test slot issued. Keep this grant in memory; paste it into the test browser. It expires in ten minutes.';
        } catch {
            if (generation === this.generation) {
                this.message =
                    'Slot refused. Check operator permission, test environment, policy enrollment, limits, and remaining proof capacity.';
            }
        } finally {
            if (generation === this.generation) this.busy = false;
        }
    }

    handleUseGrant() {
        this.generation += 1;
        this.busy = false;
        this.inspection = '';
        this.activeGrant = undefined;
        try {
            const grant = this.parseGrant();
            if (
                !Number.isFinite(Date.parse(grant.expiresAt)) ||
                Date.parse(grant.expiresAt) <= Date.now()
            )
                throw new Error('Expired');
            this.activeGrant = { ...grant, generation: this.generation };
            this.message =
                'Native transport test ready. This does not submit a form or attach a file to a business record.';
        } catch {
            this.message =
                'Paste a complete, unexpired grant from the proof operator.';
        }
    }

    handleUploadFinished(event) {
        if (
            !this.activeGrant ||
            Number(event.currentTarget.dataset.generation) !==
                this.activeGrant.generation
        )
            return;
        // Event filenames/IDs are not evidence of receipt validity. Never render or persist them.
        this.message =
            'The native uploader reported completion. The operator must inspect the ledger and stored file before marking this test passed.';
    }

    async handleInspect() {
        const generation = ++this.generation;
        this.busy = true;
        this.inspection = '';
        try {
            const grant = this.parseGrant();
            const status = await inspectGrant({ slotToken: grant.slotToken });
            if (generation !== this.generation) return;
            this.inspection = JSON.stringify(status, null, 2);
            this.message =
                'Operator-only metadata. READY is metadata validation, not malware scanning or submission completion.';
        } catch {
            if (generation === this.generation)
                this.message =
                    'Inspection unavailable. Check the grant and operator access.';
        } finally {
            if (generation === this.generation) this.busy = false;
        }
    }

    handleReset() {
        this.generation += 1;
        this.busy = false;
        this.grantText = '';
        this.activeGrant = undefined;
        this.inspection = '';
        this.message =
            'Browser state cleared. Any uploaded file remains in the proof ledger for administrator inspection and cleanup.';
    }

    parseGrant() {
        if (this.grantText.length > 2048) throw new Error('Too long');
        const grant = JSON.parse(this.grantText);
        if (
            !grant ||
            !/^[A-Za-z0-9_-]{43}$/.test(grant.slotToken) ||
            !/^(?:[A-Za-z][A-Za-z0-9_]*__)?Final_Upload_fileupload__c$/.test(
                grant.markerField
            ) ||
            !Number.isInteger(grant.maxBytes) ||
            grant.maxBytes < 1 ||
            grant.maxBytes > 26214400 ||
            grant.accept !== '.pdf,.jpg,.jpeg,.png,.webp,.txt,.docx,.xlsx'
        ) {
            throw new Error('Invalid grant');
        }
        // Deliberately copy only the transport contract; never accept a record-id from JSON.
        return {
            slotToken: grant.slotToken,
            markerField: grant.markerField,
            maxBytes: grant.maxBytes,
            accept: grant.accept,
            expiresAt: grant.expiresAt
        };
    }
}
