import { createElement } from 'lwc';
import FinalFieldPalette from 'c/finalFieldPalette';
import describeFields from '@salesforce/apex/FinalStudioController.describeFields';

jest.mock(
    '@salesforce/apex/FinalStudioController.describeFields',
    () => {
        const {
            createApexTestWireAdapter
        } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);

const FIELDS = [
    {
        apiName: 'LastName',
        label: 'Last Name',
        inputType: 'text',
        required: true
    },
    { apiName: 'Email', label: 'Email', inputType: 'email', required: false }
];

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(props = {}) {
    const el = createElement('c-final-field-palette', {
        is: FinalFieldPalette
    });
    Object.assign(el, { objectApi: 'Contact' }, props);
    document.body.appendChild(el);
    return el;
}

describe('c-final-field-palette', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('lists describe fields; used ones dim as ADDED and refuse re-add', async () => {
        const el = mount({ usedFields: ['Email'] });
        describeFields.emit(FIELDS);
        await flush();
        const items = el.shadowRoot.querySelectorAll('.fp-item');
        expect(items).toHaveLength(2);
        expect(
            el.shadowRoot.querySelector('.fp-item.added .fp-label').textContent
        ).toContain('Email');

        const handler = jest.fn();
        el.addEventListener('addfield', handler);
        items[1].click(); // Email = added → refused
        expect(handler).not.toHaveBeenCalled();
        items[0].click();
        expect(handler.mock.calls[0][0].detail.field.apiName).toBe('LastName');
    });

    it('Fields header names the primary object; absent without one', async () => {
        const el = mount();
        describeFields.emit(FIELDS);
        await flush();
        expect(el.shadowRoot.querySelector('.fp-head-label').textContent).toBe(
            'Fields — Contact'
        );
        expect(el.shadowRoot.querySelector('.fp-head-sub').textContent).toBe(
            'primary object'
        );

        el.objectApi = undefined; // no target object → note, no header
        await flush();
        expect(el.shadowRoot.querySelector('.fp-head')).toBeNull();
        expect(el.shadowRoot.querySelector('.fp-note')).not.toBeNull();

        el.objectApi = 'Contact';
        await flush();
        el.shadowRoot.querySelector('[data-tab="blocks"]').click();
        await flush();
        // Blocks has its OWN header — never the object one
        expect(el.shadowRoot.querySelector('.fp-head-label').textContent).toBe(
            'Content blocks'
        );
    });

    it('search filters; Blocks/Logic tabs are honest stubs', async () => {
        const el = mount();
        describeFields.emit(FIELDS);
        await flush();
        const search = el.shadowRoot.querySelector('.fp-search');
        search.value = 'email';
        search.dispatchEvent(new Event('input'));
        await flush();
        expect(el.shadowRoot.querySelectorAll('.fp-item')).toHaveLength(1);

        el.shadowRoot.querySelector('[data-tab="logic"]').click();
        await flush();
        expect(el.shadowRoot.querySelector('.fp-note').textContent).toContain(
            'rules slice'
        );
    });

    it('dragstart stamps the typed marker + JSON payload; ADDED rows refuse the drag', async () => {
        const { PALETTE_FIELD_MIME } = require('c/finalBuilderCanvas');
        const el = mount({ usedFields: ['Email'] });
        describeFields.emit(FIELDS);
        await flush();
        const items = el.shadowRoot.querySelectorAll('.fp-item');

        const store = {};
        const dt = {
            types: [],
            effectAllowed: '',
            setData(t, v) {
                store[t] = v;
                this.types.push(t);
            }
        };
        const start = new CustomEvent('dragstart', { cancelable: true });
        start.dataTransfer = dt;
        items[0].dispatchEvent(start); // LastName — draggable
        expect(dt.types).toContain(PALETTE_FIELD_MIME);
        expect(dt.effectAllowed).toBe('copy');
        expect(JSON.parse(store['text/plain'])).toEqual({
            t: 'palette-field',
            field: expect.objectContaining({ apiName: 'LastName' })
        });

        const blocked = new CustomEvent('dragstart', { cancelable: true });
        blocked.dataTransfer = dt;
        items[1].dispatchEvent(blocked); // Email is ADDED
        expect(blocked.defaultPrevented).toBe(true);
    });

    it('unbound legacy elements dedupe by LABEL — canvas is the truth (owner rule)', async () => {
        // "Last Name" exists on the canvas as an unbound demo element: the
        // palette must show it ADDED and refuse click-add and drag alike
        const el = mount({ usedFields: [], usedLabels: ['last name'] });
        describeFields.emit(FIELDS);
        await flush();
        const items = el.shadowRoot.querySelectorAll('.fp-item');
        expect(items[0].classList.contains('added')).toBe(true); // LastName

        const handler = jest.fn();
        el.addEventListener('addfield', handler);
        items[0].click();
        expect(handler).not.toHaveBeenCalled();

        const start = new CustomEvent('dragstart', { cancelable: true });
        start.dataTransfer = { types: [], setData() {} };
        items[0].dispatchEvent(start);
        expect(start.defaultPrevented).toBe(true);
    });

    it('Blocks tab lists the schema roster; click-add + drag stamp palette-el', async () => {
        const { PALETTE_EL_MIME } = require('c/finalBuilderCanvas');
        const el = mount();
        describeFields.emit(FIELDS);
        await flush();
        el.shadowRoot.querySelector('[data-tab="blocks"]').click();
        await flush();

        const items = el.shadowRoot.querySelectorAll('.fp-item[data-type]');
        expect([...items].map((i) => i.dataset.type)).toEqual([
            'richText',
            'image',
            'divider',
            'spacer'
        ]);

        const adds = [];
        el.addEventListener('addblock', (e) => adds.push(e.detail));
        items[2].click();
        items[2].click(); // blocks repeat freely — no ADDED dedupe
        expect(adds).toEqual([
            { blockType: 'divider' },
            { blockType: 'divider' }
        ]);

        const store = {};
        const dt = {
            types: [],
            effectAllowed: '',
            setData(t, v) {
                store[t] = v;
                this.types.push(t);
            }
        };
        const start = new CustomEvent('dragstart', { cancelable: true });
        start.dataTransfer = dt;
        items[0].dispatchEvent(start);
        expect(dt.types).toContain(PALETTE_EL_MIME);
        expect(dt.effectAllowed).toBe('copy');
        expect(JSON.parse(store['text/plain'])).toEqual({
            t: 'palette-el',
            elType: 'richText'
        });
    });

    it('Repeating Group is a first-class item (§4): click + typed drag; disabled without an object', async () => {
        const { PALETTE_REP_MIME } = require('c/finalBuilderCanvas');
        const el = mount();
        describeFields.emit(FIELDS);
        await flush();
        el.shadowRoot.querySelector('[data-tab="blocks"]').click();
        await flush();

        const item = el.shadowRoot.querySelector('.fp-item:not([data-type])');
        expect(item.textContent).toContain('Repeating Group');
        expect(item.disabled).toBe(false);

        const adds = [];
        el.addEventListener('addrepeater', () => adds.push(1));
        item.click();
        expect(adds).toHaveLength(1);

        const store = {};
        const dt = {
            types: [],
            effectAllowed: '',
            setData(t, v) {
                store[t] = v;
                this.types.push(t);
            }
        };
        const start = new CustomEvent('dragstart', { cancelable: true });
        start.dataTransfer = dt;
        item.dispatchEvent(start);
        expect(dt.types).toContain(PALETTE_REP_MIME);
        expect(dt.effectAllowed).toBe('copy');
        expect(JSON.parse(store['text/plain'])).toEqual({ t: 'palette-rep' });

        // §4.5: no primary context object → inform-and-abort (disabled + why)
        el.objectApi = undefined;
        await flush();
        const dead = el.shadowRoot.querySelector('.fp-item:not([data-type])');
        expect(dead.disabled).toBe(true);
        expect(dead.title).toContain('target object');
        const blocked = new CustomEvent('dragstart', { cancelable: true });
        blocked.dataTransfer = dt;
        dead.dispatchEvent(blocked);
        expect(blocked.defaultPrevented).toBe(true);
    });
});
