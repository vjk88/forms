import { createElement } from 'lwc';
import FinalElementRenderer from 'c/finalElementRenderer';

/**
 * The jump to the first red question (IMPL_PLAN_BLOCKED_MESSAGE §3): a
 * blocked click stamps `focusRequest` on ONE question; its renderer puts the
 * cursor in the control and brings it to the middle of the view, smoothly
 * unless the person switched motion off. Once per number, remembered beyond
 * the renderer's own life: a renderer destroyed and recreated (an Accordion
 * panel closed and reopened) must not replay the jump.
 */
const ELEMENT = (extra = {}) => ({
    id: 'el_a',
    type: 'field',
    label: 'Email',
    render: { inputType: 'text' },
    ...extra
});

const flush = () => Promise.resolve();

let focusSpy;
let reduceMotion = false;

beforeEach(() => {
    focusSpy = jest.spyOn(HTMLElement.prototype, 'focus');
    Element.prototype.scrollIntoView = jest.fn();
    reduceMotion = false;
    window.matchMedia = jest.fn((query) => ({
        matches: query.includes('reduce') && reduceMotion
    }));
});

afterEach(() => {
    focusSpy.mockRestore();
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

function mount(element) {
    const cmp = createElement('c-final-element-renderer', {
        is: FinalElementRenderer
    });
    cmp.element = element;
    document.body.appendChild(cmp);
    return cmp;
}

describe('the renderer takes the cursor for a blocked click', () => {
    it('focuses its control and scrolls it to the middle, smoothly', async () => {
        const cmp = mount(ELEMENT({ focusRequest: 5001 }));
        await flush();
        const input = cmp.shadowRoot.querySelector('lightning-input');
        expect(focusSpy.mock.contexts || focusSpy.mock.instances).toContain(
            input
        );
        expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
            block: 'center',
            inline: 'nearest',
            behavior: 'smooth'
        });
    });

    it('jumps at once for people who switched motion off', async () => {
        reduceMotion = true;
        mount(ELEMENT({ focusRequest: 5002 }));
        await flush();
        expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
            block: 'center',
            inline: 'nearest',
            behavior: 'auto'
        });
    });

    it('does nothing without a number', async () => {
        mount(ELEMENT());
        await flush();
        expect(focusSpy).not.toHaveBeenCalled();
        expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    });

    it('acts once per number: a re-render and a recreated renderer leave the cursor alone; a new number moves it', async () => {
        const cmp = mount(ELEMENT({ focusRequest: 5003 }));
        await flush();
        expect(focusSpy).toHaveBeenCalledTimes(1);

        cmp.element = ELEMENT({ focusRequest: 5003, value: 'a' }); // an answer
        await flush();
        expect(focusSpy).toHaveBeenCalledTimes(1);

        document.body.removeChild(cmp); // the panel closes…
        mount(ELEMENT({ focusRequest: 5003 })); // …and reopens
        await flush();
        expect(focusSpy).toHaveBeenCalledTimes(1);

        mount(ELEMENT({ focusRequest: 5004 })); // a new blocked click
        await flush();
        expect(focusSpy).toHaveBeenCalledTimes(2);
    });

    it('a choice question puts the cursor on its first option', async () => {
        const cmp = mount(
            ELEMENT({
                focusRequest: 5005,
                render: { inputType: 'picklist', renderAs: 'chips' },
                config: {
                    options: [
                        { label: 'A', value: 'a' },
                        { label: 'B', value: 'b' }
                    ]
                }
            })
        );
        await flush();
        const focused = focusSpy.mock.contexts || focusSpy.mock.instances;
        expect(focused.length).toBe(1);
        expect(cmp.shadowRoot.contains(focused[0])).toBe(true);
    });

    it('a plain control glides first, then takes the cursor without a second scroll (no snap)', async () => {
        const order = [];
        Element.prototype.scrollIntoView = jest.fn(() => order.push('glide'));
        focusSpy.mockImplementation(() => order.push('focus'));
        const cmp = mount({
            id: 'el_file',
            type: 'file',
            label: 'Upload',
            config: { accept: '.pdf' },
            focusRequest: 5006
        });
        await flush();
        const focused = focusSpy.mock.contexts || focusSpy.mock.instances;
        expect(focused[0].tagName).toBe('BUTTON');
        expect(cmp.shadowRoot.contains(focused[0])).toBe(true);
        expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
        expect(order).toEqual(['glide', 'focus']);
    });

    it('a base component takes the cursor first, then the glide (its focus() cannot skip the scroll)', async () => {
        const order = [];
        Element.prototype.scrollIntoView = jest.fn(() => order.push('glide'));
        focusSpy.mockImplementation(() => order.push('focus'));
        mount(ELEMENT({ focusRequest: 5007 }));
        await flush();
        expect(order).toEqual(['focus', 'glide']);
    });
});
