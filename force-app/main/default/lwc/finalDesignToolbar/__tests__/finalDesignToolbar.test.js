import { createElement } from 'lwc';
import FinalDesignToolbar from 'c/finalDesignToolbar';

const flush = () => Promise.resolve();
const state = {
    font: {
        options: [
            { label: 'Editorial', value: 'editorial', selected: true },
            { label: 'Brand · custom', value: 'custom:brand' }
        ]
    },
    searchEntries: [
        {
            key: 'pageRadius',
            label: 'Embedded corners',
            path: 'Page › Shape',
            available: false,
            reason: 'Enable embedded mode first.'
        },
        {
            key: 'radius',
            label: 'Corner radius',
            path: 'Page › Shape',
            available: true
        },
        {
            key: 'typography',
            label: 'Typography',
            path: 'Brand › Typography',
            available: true
        }
    ],
    colorGroups: [
        {
            key: 'brand',
            label: 'Brand',
            controls: [
                {
                    key: 'labelColor',
                    label: 'Labels',
                    isColor: true,
                    value: '#123456',
                    edited: true
                },
                {
                    key: 'pageBg',
                    label: 'Page',
                    isGradientSurface: true,
                    value: '#ffffff',
                    gradient: null
                }
            ]
        }
    ]
};

function mount() {
    const el = createElement('c-final-design-toolbar', {
        is: FinalDesignToolbar
    });
    el.state = JSON.parse(JSON.stringify(state));
    document.body.appendChild(el);
    return el;
}
async function search(el, query) {
    const input = el.shadowRoot.querySelector('input');
    input.value = query;
    input.dispatchEvent(new Event('input'));
    await flush();
    return input;
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

it('emits font and color edits without mutating the supplied state', async () => {
    const el = mount();
    const change = jest.fn();
    el.addEventListener('controlchange', change);
    const font = el.shadowRoot.querySelector('select');
    font.value = 'custom:brand';
    font.dispatchEvent(new Event('change'));
    expect(change.mock.calls[0][0].detail).toEqual({
        key: 'typography',
        kind: 'font',
        value: 'custom:brand'
    });
    el.shadowRoot.querySelector('.dt-colors-trigger').click();
    await flush();
    el.shadowRoot.querySelector('c-final-gradient-control').dispatchEvent(
        new CustomEvent('change', {
            detail: {
                solid: '#ffffff',
                gradient: {
                    type: 'linear',
                    angle: 90,
                    start: '#112233',
                    end: '#445566'
                }
            }
        })
    );
    expect(change.mock.calls[1][0].detail).toMatchObject({
        key: 'pageBg',
        kind: 'gradient',
        gradient: { angle: 90 }
    });
    el.shadowRoot.querySelector('.dt-reset').click();
    expect(change.mock.calls[2][0].detail).toEqual({
        key: 'labelColor',
        kind: 'reset'
    });
    expect(el.state).toEqual(state);
});

it('searches aliases and paths, explains unavailable results, and only navigates to available settings', async () => {
    const el = mount();
    const select = jest.fn();
    el.addEventListener('settingselect', select);
    await search(el, 'rounded');
    const results = el.shadowRoot.querySelectorAll('.dt-result');
    expect(results).toHaveLength(2);
    expect(results[0].dataset.key).toBe('radius');
    expect(results[1].textContent).toContain('Enable embedded mode');
    results[1].click();
    expect(select).not.toHaveBeenCalled();
    results[0].click();
    expect(select.mock.calls[0][0].detail).toEqual({ key: 'radius' });
    await search(el, 'brand font');
    expect(el.shadowRoot.querySelector('.dt-result').dataset.key).toBe(
        'typography'
    );
});

it('supports keyboard navigation and Escape closes results without reopening on focus', async () => {
    const el = mount();
    const input = await search(el, 'font');
    input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    );
    await flush();
    const result = el.shadowRoot.querySelector('.dt-result');
    expect(el.shadowRoot.activeElement).toBe(result);
    result.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    await flush();
    expect(el.shadowRoot.querySelector('.dt-results')).toBeNull();
    expect(el.shadowRoot.activeElement).toBe(input);
    expect(input.value).toBe('font');
});

it('closes results when focus leaves the search, but not when it moves to a result', async () => {
    const el = mount();
    const input = await search(el, 'font');
    const result = el.shadowRoot.querySelector('.dt-result');
    input.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: result })
    );
    await flush();
    expect(el.shadowRoot.querySelector('.dt-results')).not.toBeNull();

    const press = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true
    });
    result.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);

    input.dispatchEvent(
        new FocusEvent('focusout', {
            bubbles: true,
            relatedTarget: document.body
        })
    );
    await flush();
    expect(el.shadowRoot.querySelector('.dt-results')).toBeNull();
    expect(input.value).toBe('font');

    input.dispatchEvent(new FocusEvent('focus'));
    await flush();
    expect(el.shadowRoot.querySelector('.dt-results')).not.toBeNull();
});

it('shows no matches and blocks mutation events while disabled', async () => {
    const el = mount();
    await search(el, 'no-such-setting');
    expect(el.shadowRoot.querySelector('.dt-summary').textContent).toContain(
        '0 matching'
    );
    el.disabled = true;
    await flush();
    const change = jest.fn();
    el.addEventListener('controlchange', change);
    const font = el.shadowRoot.querySelector('select');
    expect(font.disabled).toBe(true);
    font.dispatchEvent(new Event('change'));
    expect(change).not.toHaveBeenCalled();
});
