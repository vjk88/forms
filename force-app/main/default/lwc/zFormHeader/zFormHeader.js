import { LightningElement, api } from 'lwc';

export default class ZFormHeader extends LightningElement {
    @api config = {}; // { logoUrl, title, subtitle, highlights, richText }
}
