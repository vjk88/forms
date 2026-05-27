import { LightningElement, api, track } from "lwc";
import createForm from "@salesforce/apex/FormDesignerController.createForm";

export default class NewFormDialog extends LightningElement {
  @api objectOptions = [];

  @track formName = "";
  @track objectApiName = "";
  @track formType = "Form";
  @track layoutMode = "Single_Page";

  isCreating = false;

  get formTypeOptions() {
    return [
      { label: "Form", value: "Form" },
      { label: "Survey", value: "Survey" }
    ];
  }

  get layoutModeOptions() {
    return [
      { label: "Single Page", value: "Single_Page" },
      { label: "Vertical Navigation", value: "Vertical_Navigation" }
    ];
  }

  get createDisabled() {
    return this.isCreating || !this.formName.trim() || !this.objectApiName;
  }

  handleNameChange(event) {
    this.formName = event.detail.value;
  }

  handleObjectChange(event) {
    this.objectApiName = event.detail.value;
  }

  handleTypeChange(event) {
    this.formType = event.detail.value;
  }

  handleLayoutChange(event) {
    this.layoutMode = event.detail.value;
  }

  handleClose() {
    this.dispatchEvent(new CustomEvent("close"));
  }

  handleCreate() {
    if (this.createDisabled) return;

    this.isCreating = true;
    createForm({
      formName: this.formName.trim(),
      objectApiName: this.objectApiName,
      formType: this.formType,
      layoutMode: this.layoutMode
    })
      .then((result) => {
        this.isCreating = false;
        this.dispatchEvent(
          new CustomEvent("formcreated", {
            detail: {
              formId: result.formId,
              versionId: result.versionId
            }
          })
        );
      })
      .catch((error) => {
        this.isCreating = false;
        const msg = error.body ? error.body.message : error.message;
        // Re-throw as a toast from the parent — just close for now
        console.error("Create form error:", msg);
      });
  }
}
