import { createElement } from 'lwc';
import FinalDesignSearch from 'c/finalDesignSearch';

// Moved from the old toolbar strip's tests (IMPL_PLAN_DESIGN_RAIL): same
// search, now at the top of the Design pane.

const flush = () => Promise.resolve();
const entries = [
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
];

function mount() {
    const el = createElement('c-final-design-search', {
        is: FinalDesignSearch
    });
    el.entries = JSON.parse(JSON.stringify(entries));
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

it('searches aliases and paths, explains unavailable results, and only navigates to available settings', async () => {
    const el = mount();
    const select = jest.fn();
    el.addEventListener('settingselect', select);
    await search(el, 'rounded');
    const results = el.shadowRoot.querySelectorAll('.ds-result');
    expect(results).toHaveLength(2);
    expect(results[0].dataset.key).toBe('radius');
    expect(results[1].textContent).toContain('Enable embedded mode');
    results[1].click();
    expect(select).not.toHaveBeenCalled();
    results[0].click();
    expect(select.mock.calls[0][0].detail).toEqual({ key: 'radius' });
    await search(el, 'brand font');
    expect(el.shadowRoot.querySelector('.ds-result').dataset.key).toBe(
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
    const result = el.shadowRoot.querySelector('.ds-result');
    expect(el.shadowRoot.activeElement).toBe(result);
    result.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    await flush();
    expect(el.shadowRoot.querySelector('.ds-results')).toBeNull();
    expect(el.shadowRoot.activeElement).toBe(input);
    expect(input.value).toBe('font');
});

it('Enter picks the first result', async () => {
    const el = mount();
    const select = jest.fn();
    el.addEventListener('settingselect', select);
    const input = await search(el, 'corner');
    input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    expect(select.mock.calls[0][0].detail).toEqual({ key: 'radius' });
});

it('closes results when focus leaves the search, but not when it moves to a result', async () => {
    const el = mount();
    const input = await search(el, 'font');
    const result = el.shadowRoot.querySelector('.ds-result');
    input.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: result })
    );
    await flush();
    expect(el.shadowRoot.querySelector('.ds-results')).not.toBeNull();

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
    expect(el.shadowRoot.querySelector('.ds-results')).toBeNull();
    expect(input.value).toBe('font');

    input.dispatchEvent(new FocusEvent('focus'));
    await flush();
    expect(el.shadowRoot.querySelector('.ds-results')).not.toBeNull();
});

it('shows no matches, and a disabled search navigates nowhere', async () => {
    const el = mount();
    await search(el, 'no-such-setting');
    expect(el.shadowRoot.querySelector('.ds-summary').textContent).toContain(
        '0 matching'
    );
    await search(el, 'corner');
    el.disabled = true;
    await flush();
    const select = jest.fn();
    el.addEventListener('settingselect', select);
    expect(el.shadowRoot.querySelector('input').disabled).toBe(true);
    el.shadowRoot.querySelector('.ds-result').click();
    expect(select).not.toHaveBeenCalled();
});
