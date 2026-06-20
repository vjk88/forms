import { createElement } from 'lwc';
import LayoutSectionHost from 'c/layoutSectionHost';

const heroSection = {
    key: 's1',
    title: '',
    style: 'plain',
    gridColumns: 2,
    elements: [
        {
            key: 'h1',
            type: 'Hero',
            imageUrl: '/img/x.png',
            headline: 'Welcome',
            subtext: 'Get started below',
            cta: { label: 'Start', action: 'start' }
        },
        { key: 'f1', type: 'Field', label: 'Email' }
    ]
};

function mount(section, mode = 'preview') {
    const el = createElement('c-layout-section-host', { is: LayoutSectionHost });
    el.section = section;
    el.mode = mode;
    document.body.appendChild(el);
    return el;
}
afterEach(() => {
    while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});

describe('c-layout-section-host — hero stub (preview)', () => {
    it('renders a hero stub with image, headline, subtext, cta', () => {
        const el = mount(heroSection);
        expect(el.shadowRoot.querySelector('.stub-hero')).not.toBeNull();
        expect(el.shadowRoot.querySelector('.stub-hero__h').textContent).toBe('Welcome');
        expect(el.shadowRoot.querySelector('.stub-hero__s').textContent).toBe('Get started below');
        expect(el.shadowRoot.querySelector('.stub-hero__cta').textContent).toBe('Start');
        expect(el.shadowRoot.querySelector('.stub-hero__img')).not.toBeNull();
    });

    it('hero spans full width even in a 2-column section', () => {
        const el = mount(heroSection);
        const col = el.shadowRoot.querySelector('.type-Hero');
        expect(col.className).toContain('slds-size_1-of-1');
        expect(col.className).not.toContain('slds-medium-size_1-of-2');
    });

    it('non-hero fields still render the label + control stub', () => {
        const el = mount(heroSection);
        expect(el.shadowRoot.querySelector('.type-Field .lbl')).not.toBeNull();
        expect(el.shadowRoot.querySelector('.type-Field .ctrl')).not.toBeNull();
    });
});
