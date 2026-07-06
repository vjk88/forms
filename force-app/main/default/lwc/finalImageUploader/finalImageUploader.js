import { LightningElement, api } from 'lwc';
import uploadImage from '@salesforce/apex/FinalAssetController.uploadImage';
import deleteImage from '@salesforce/apex/FinalAssetController.deleteImage';

const DEFAULT_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';

/**
 * finalImageUploader — reusable image upload row (catalog §6).
 *
 * Owns the WHOLE image-storage contract so logo / backdrop / banner never
 * reinvent it: pick file → validate → upload as ContentVersion (public iff the
 * form's Allowed_Adapters has Public_Guest — the server decides), then delete
 * the replaced version. Hands the parent url + contentVersionId via `change`;
 * never base64 in the spec.
 *
 * Leaf rules: parent owns cascade/edited state and echoes url/version props;
 * this control performs the storage side-effects but stores no design state.
 */
export default class FinalImageUploader extends LightningElement {
    @api label;
    /** Current stored image (parent-echoed). */
    @api url;
    @api contentVersionId;
    /** Parent Form__c id — drives the server's public/private decision. */
    @api formId;
    @api accept = DEFAULT_ACCEPT;
    @api maxSizeMb = 5;
    @api hideThumbnail = false;
    @api hideRemove = false;
    /** Parent-owned cascade marker. */
    @api edited = false;
    @api disabled = false;

    busy = false;
    error = '';

    get hasImage() {
        return Boolean(this.url);
    }

    get showThumb() {
        return this.hasImage && !this.hideThumbnail;
    }

    get showRemove() {
        return this.hasImage && !this.hideRemove && !this.busy;
    }

    get buttonLabel() {
        return this.hasImage ? 'Replace' : 'Upload image…';
    }

    get inputDisabled() {
        return this.disabled || this.busy;
    }

    handlePick() {
        this.template.querySelector('.file-input').click();
    }

    async handleFile(event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) {
            return;
        }
        this.error = '';

        const okTypes = (this.accept || DEFAULT_ACCEPT)
            .split(',')
            .map((t) => t.trim().toLowerCase());
        if (!okTypes.includes((file.type || '').toLowerCase())) {
            this.error = 'Unsupported image type. Use PNG, JPG, GIF, or WebP.';
            return;
        }
        if (file.size > this.maxSizeMb * 1024 * 1024) {
            this.error = `Image exceeds the ${this.maxSizeMb} MB limit.`;
            return;
        }

        this.busy = true;
        const replacedVersionId = this.contentVersionId;
        try {
            const dataUrl = await readAsDataUrl(file);
            const res = await uploadImage({
                base64Data: dataUrl,
                fileName: file.name,
                formId: this.formId || null
            });
            if (replacedVersionId) {
                // fire-and-forget: orphan cleanup never blocks the edit
                deleteImage({ contentVersionId: replacedVersionId }).catch(
                    () => {}
                );
            }
            this.dispatchEvent(
                new CustomEvent('change', {
                    detail: {
                        url: res.url,
                        contentVersionId: res.contentVersionId
                    }
                })
            );
        } catch (e) {
            this.error =
                (e && e.body && e.body.message) || 'Upload failed. Try again.';
        } finally {
            this.busy = false;
        }
    }

    handleRemove() {
        this.error = '';
        if (this.contentVersionId) {
            deleteImage({ contentVersionId: this.contentVersionId }).catch(
                () => {}
            );
        }
        this.dispatchEvent(
            new CustomEvent('change', {
                detail: { url: null, contentVersionId: null }
            })
        );
    }
}

function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}
