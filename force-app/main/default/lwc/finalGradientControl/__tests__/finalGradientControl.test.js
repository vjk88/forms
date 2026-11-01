import { createElement } from 'lwc';
import FinalGradientControl from 'c/finalGradientControl';

// Spoken names and states (UX review, PR 427): the control is shared by the
// Design pane and the theme dialog.

const flush = () => Promise.resolve();

function mount(props = {}) {
    const el = createElement('c-final-gradient-control', {
        is: FinalGradientControl
    });
    Object.assign(el, { label: 'Page fill', solid: '#ffffff' }, props);
    document.body.appendChild(el);
    return el;
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

it('Solid / Gradient is a labelled group that says which one is on', async () => {
    const el = mount();
    const group = el.shadowRoot.querySelector('.seg');
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Page fill type');
    const [solid, gradient] = group.querySelectorAll('button');
    expect(solid.getAttribute('aria-pressed')).toBe('true');
    expect(gradient.getAttribute('aria-pressed')).toBe('false');
    gradient.click();
    await flush();
    expect(solid.getAttribute('aria-pressed')).toBe('false');
    expect(gradient.getAttribute('aria-pressed')).toBe('true');
});

it('every gradient input and preset has its own spoken name', async () => {
    const el = mount({
        gradient: {
            type: 'linear',
            angle: 90,
            start: '#000000',
            end: '#ffffff'
        }
    });
    await flush();
    const q = (sel) => el.shadowRoot.querySelector(sel);
    expect(q('select').getAttribute('aria-label')).toBe(
        'Page fill gradient type'
    );
    expect(q('input[type="range"]').getAttribute('aria-label')).toBe(
        'Page fill gradient angle'
    );
    const colors = el.shadowRoot.querySelectorAll('input[type="color"]');
    expect(colors[0].getAttribute('aria-label')).toBe(
        'Page fill gradient start color'
    );
    expect(colors[1].getAttribute('aria-label')).toBe(
        'Page fill gradient end color'
    );
    const presets = [...el.shadowRoot.querySelectorAll('.preset')];
    expect(presets.length).toBeGreaterThan(0);
    presets.forEach((b) =>
        expect(b.getAttribute('aria-label')).toMatch(/^Preset gradient #/)
    );
});

it('the solid picker is named for its fill', () => {
    const el = mount();
    expect(
        el.shadowRoot
            .querySelector('input[type="color"]')
            .getAttribute('aria-label')
    ).toBe('Page fill color');
});
