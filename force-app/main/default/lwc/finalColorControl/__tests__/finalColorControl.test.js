import { createElement } from 'lwc';
import FinalColorControl from 'c/finalColorControl';

function mount(props = {}) {
    const el = createElement('c-final-color-control', {
        is: FinalColorControl
    });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el;
}

describe('c-final-color-control', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('renders label, hex readout, and picker with the normalized value', () => {
        const el = mount({ label: 'Accent', value: '#0D9488' });
        expect(el.shadowRoot.querySelector('.label').textContent).toBe('Accent');
        expect(el.shadowRoot.querySelector('.hex').textContent).toBe('#0d9488');
        expect(el.shadowRoot.querySelector('.picker').value).toBe('#0d9488');
    });

    it('normalizes 3-digit hex and rejects garbage (keeps last good value)', () => {
        const el = mount({ label: 'Text', value: '#abc' });
        expect(el.value).toBe('#aabbcc');
        el.value = 'not-a-color';
        expect(el.value).toBe('#aabbcc');
    });

    it('flattens rgb()/rgba() theme defaults to opaque hex (alpha dropped)', () => {
        const el = mount({ label: 'Subtitle', value: 'rgba(255, 255, 255, 0.7)' });
        expect(el.value).toBe('#ffffff');
        el.value = 'rgb(17, 34, 51)';
        expect(el.value).toBe('#112233');
    });

    it('emits change with the picked value', () => {
        const el = mount({ label: 'Accent', value: '#0d9488' });
        const handler = jest.fn();
        el.addEventListener('change', handler);
        const picker = el.shadowRoot.querySelector('.picker');
        picker.value = '#123456';
        picker.dispatchEvent(new CustomEvent('input'));
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.value).toBe('#123456');
    });

    it('renders no badge without contrast-with', () => {
        const el = mount({ label: 'Accent', value: '#0d9488' });
        expect(el.shadowRoot.querySelector('.badge')).toBeNull();
    });

    it('badge: >=4.5 is AA pass', () => {
        const el = mount({
            label: 'Text',
            value: '#1f2937',
            contrastWith: '#ffffff'
        });
        const badge = el.shadowRoot.querySelector('.badge');
        expect(badge.className).toContain('pass');
        expect(badge.textContent).toContain('AA ✓');
        expect(el.shadowRoot.querySelector('.hint')).toBeNull();
    });

    it('badge: 3–4.5 is large-text-only with a fix hint naming the subject', () => {
        const el = mount({
            label: 'Accent',
            value: '#0d9488',
            contrastWith: '#ffffff',
            subject: 'Button labels'
        });
        const badge = el.shadowRoot.querySelector('.badge');
        expect(badge.className).toContain('large');
        expect(badge.textContent).toContain('large text only');
        expect(el.shadowRoot.querySelector('.hint').textContent).toContain(
            'Button labels needs 4.5:1'
        );
    });

    it('badge: <3 fails AA', () => {
        const el = mount({
            label: 'Accent',
            value: '#ffff00',
            contrastWith: '#ffffff'
        });
        const badge = el.shadowRoot.querySelector('.badge');
        expect(badge.className).toContain('fail');
        expect(badge.textContent).toContain('fails AA');
    });

    it('badge reacts to picker input (live verdict, parent echo not required)', async () => {
        const el = mount({
            label: 'Accent',
            value: '#0d9488',
            contrastWith: '#ffffff'
        });
        const picker = el.shadowRoot.querySelector('.picker');
        picker.value = '#0b6e65';
        picker.dispatchEvent(new CustomEvent('input'));
        await Promise.resolve();
        expect(
            el.shadowRoot.querySelector('.badge').className
        ).toContain('pass');
    });

    it('shows the edited dot only when the parent says so', () => {
        const el = mount({ label: 'Accent', value: '#0d9488', edited: true });
        expect(el.shadowRoot.querySelector('.dot')).not.toBeNull();
        const el2 = mount({ label: 'Accent', value: '#0d9488' });
        expect(el2.shadowRoot.querySelector('.dot')).toBeNull();
    });
});
