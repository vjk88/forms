import { createElement } from '@lwc/engine-dom';
import FormSectionRenderer from 'c/formSectionRenderer';

const sec = (cta) => ({
    key: 's1',
    title: '',
    style: 'flat',
    gridColumns: 1,
    elements: [
        {
            key: 'h1',
            type: 'Hero',
            imageUrl: '/x.png',
            headline: 'Hi there',
            subtext: 'Sub copy',
            cta
        }
    ]
});

function mount(section) {
    const el = createElement('c-form-section-renderer', { is: FormSectionRenderer });
    el.section = section;
    el.mode = 'preview';
    el.objectApiName = 'Account';
    document.body.appendChild(el);
    return el;
}
afterEach(() => {
    while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});
const flush = () => Promise.resolve();

describe('c-form-section-renderer — hero (live render)', () => {
    it('renders headline, subtext, and image', () => {
        const el = mount(sec({ label: 'Go', action: 'link', href: 'https://x.com' }));
        return flush().then(() => {
            expect(el.shadowRoot.querySelector('.el-hero__headline').textContent).toBe('Hi there');
            expect(el.shadowRoot.querySelector('.el-hero__subtext').textContent).toBe('Sub copy');
            expect(el.shadowRoot.querySelector('.el-hero__img')).not.toBeNull();
        });
    });

    it('link CTA renders an anchor with href', () => {
        const el = mount(sec({ label: 'Go', action: 'link', href: 'https://x.com' }));
        return flush().then(() => {
            const a = el.shadowRoot.querySelector('a.el-hero__cta');
            expect(a).not.toBeNull();
            expect(a.getAttribute('href')).toBe('https://x.com');
            expect(a.textContent).toBe('Go');
        });
    });

    it('start CTA renders a button (jump-to-form)', () => {
        const el = mount(sec({ label: 'Begin', action: 'start' }));
        return flush().then(() => {
            const btn = el.shadowRoot.querySelector('button.el-hero__cta');
            expect(btn).not.toBeNull();
            expect(btn.textContent).toBe('Begin');
            expect(el.shadowRoot.querySelector('a.el-hero__cta')).toBeNull();
        });
    });

    it('no CTA → no button or anchor', () => {
        const el = mount(sec(undefined));
        return flush().then(() => {
            expect(el.shadowRoot.querySelector('.el-hero__cta')).toBeNull();
            expect(el.shadowRoot.querySelector('.el-hero__headline')).not.toBeNull();
        });
    });
});
