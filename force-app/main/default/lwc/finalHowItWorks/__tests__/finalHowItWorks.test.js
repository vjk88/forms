import { createElement } from 'lwc';
import FinalHowItWorks from 'c/finalHowItWorks';

function mount(topic) {
    const el = createElement('c-final-how-it-works', { is: FinalHowItWorks });
    el.topic = topic;
    document.body.appendChild(el);
    return el;
}

const flush = () => Promise.resolve();
const panel = (el) => el.shadowRoot.querySelector('.hw-panel');
const wrap = (el) => el.shadowRoot.querySelector('.hw');

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('c-final-how-it-works', () => {
    it('stays closed until someone hovers, and closes when they leave', async () => {
        const el = mount('autofill');
        expect(panel(el)).toBeNull();
        wrap(el).dispatchEvent(new CustomEvent('mouseenter'));
        await flush();
        const titles = [
            ...el.shadowRoot.querySelectorAll('.hw-text strong')
        ].map((n) => n.textContent);
        expect(titles).toEqual([
            'Someone opens the form',
            'We read one record',
            'Answers start filled in'
        ]);
        wrap(el).dispatchEvent(new CustomEvent('mouseleave'));
        await flush();
        expect(panel(el)).toBeNull();
    });

    it('a click keeps it open; Escape closes it without reaching the dialog', async () => {
        const el = mount('mapping');
        el.shadowRoot.querySelector('lightning-button-icon').click();
        await flush();
        wrap(el).dispatchEvent(new CustomEvent('mouseleave'));
        await flush();
        expect(panel(el)).not.toBeNull();
        expect(el.shadowRoot.querySelector('.hw-text strong').textContent).toBe(
            'Someone submits'
        );
        const heard = jest.fn();
        document.body.addEventListener('keydown', heard);
        wrap(el).dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                composed: true
            })
        );
        await flush();
        expect(panel(el)).toBeNull();
        expect(heard).not.toHaveBeenCalled();
        document.body.removeEventListener('keydown', heard);
    });

    it('Escape closes a hovered panel before the dialog hears it', async () => {
        const el = mount('autofill');
        wrap(el).dispatchEvent(new CustomEvent('mouseenter'));
        await flush();
        expect(panel(el)).not.toBeNull();
        const heard = jest.fn();
        window.addEventListener('keydown', heard);
        document.body.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        );
        await flush();
        expect(panel(el)).toBeNull();
        expect(heard).not.toHaveBeenCalled();
        window.removeEventListener('keydown', heard);
    });
});
