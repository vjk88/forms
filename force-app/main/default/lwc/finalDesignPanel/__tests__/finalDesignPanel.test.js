import { createElement } from 'lwc';
import FinalDesignPanel from 'c/finalDesignPanel';
import { buildSampleSpec } from 'c/finalSampleSpec';

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(spec) {
    const el = createElement('c-final-design-panel', {
        is: FinalDesignPanel
    });
    el.spec = spec || buildSampleSpec({ layout: 'stepper', themeKey: 'nordic' });
    document.body.appendChild(el);
    return el;
}

function lastSpec(handler) {
    return handler.mock.calls[handler.mock.calls.length - 1][0].detail.spec;
}

async function goAdvanced(el) {
    el.shadowRoot
        .querySelectorAll('.lens-btn')[1]
        .click();
    await flush();
}

async function openArea(el, key) {
    el.shadowRoot.querySelector(`.rail-btn[data-area="${key}"]`).click();
    await flush();
}

describe('c-final-design-panel', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('starts in Simple: no rail, essentials only', () => {
        const el = mount();
        expect(el.shadowRoot.querySelector('.rail')).toBeNull();
        expect(el.shadowRoot.querySelector('.s-card')).not.toBeNull();
    });

    it('Advanced shows the 9-area rail', async () => {
        const el = mount();
        await goAdvanced(el);
        const areas = [...el.shadowRoot.querySelectorAll('.rail-btn')].map(
            (b) => b.dataset.area
        );
        expect(areas).toEqual([
            'theme',
            'type',
            'backdrop',
            'layout',
            'paging',
            'header',
            'body',
            'fields',
            'actions'
        ]);
    });

    it('accent change writes a sparse override and emits specchange', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        const accent = el.shadowRoot.querySelector(
            'c-final-color-control[data-key="accent"]'
        );
        accent.dispatchEvent(
            new CustomEvent('change', { detail: { value: '#123456' } })
        );
        await flush();
        expect(lastSpec(handler).theme.overrides.palette.accent).toBe(
            '#123456'
        );
    });

    it('lens is not a fork: the same override reads back in Advanced with an edited dot + reset chip', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        el.shadowRoot
            .querySelector('c-final-color-control[data-key="accent"]')
            .dispatchEvent(
                new CustomEvent('change', { detail: { value: '#123456' } })
            );
        await flush();
        await goAdvanced(el);
        const adv = el.shadowRoot.querySelector(
            'c-final-color-control[data-key="accent"]'
        );
        expect(adv.value).toBe('#123456');
        expect(adv.edited).toBe(true);
        expect(el.shadowRoot.querySelector('.resetchip')).not.toBeNull();
        expect(el.shadowRoot.querySelector('.ovchip')).not.toBeNull();
    });

    it('setting a control back to the theme default deletes the override (no phantom dots)', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        const accent = el.shadowRoot.querySelector(
            'c-final-color-control[data-key="accent"]'
        );
        accent.dispatchEvent(
            new CustomEvent('change', { detail: { value: '#123456' } })
        );
        await flush();
        // nordic's own accent
        accent.dispatchEvent(
            new CustomEvent('change', { detail: { value: '#1e3a8a' } })
        );
        await flush();
        const theme = lastSpec(handler).theme;
        expect(theme.overrides.palette).toBeUndefined();
    });

    it('group reset clears only that group and emits', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        el.shadowRoot
            .querySelector('c-final-color-control[data-key="accent"]')
            .dispatchEvent(
                new CustomEvent('change', { detail: { value: '#123456' } })
            );
        await flush();
        await goAdvanced(el);
        el.shadowRoot.querySelector('.resetchip').click();
        await flush();
        expect(lastSpec(handler).theme.overrides.palette).toBeUndefined();
    });

    it('theme switch with overrides opens the confirm gate; Keep preserves them', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        el.shadowRoot
            .querySelector('c-final-color-control[data-key="accent"]')
            .dispatchEvent(
                new CustomEvent('change', { detail: { value: '#123456' } })
            );
        await flush();
        const select = el.shadowRoot.querySelector('.entry-select');
        select.value = 'editorialIvory';
        select.dispatchEvent(new CustomEvent('change'));
        await flush();
        expect(el.shadowRoot.querySelector('.confirm')).not.toBeNull();
        el.shadowRoot.querySelector('.confirm-go').click();
        await flush();
        const spec = lastSpec(handler);
        expect(spec.theme.name).toBe('editorialIvory');
        expect(spec.theme.overrides.palette.accent).toBe('#123456');
    });

    it('theme switch: Use theme as-is clears the overrides', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        el.shadowRoot
            .querySelector('c-final-color-control[data-key="accent"]')
            .dispatchEvent(
                new CustomEvent('change', { detail: { value: '#123456' } })
            );
        await flush();
        const select = el.shadowRoot.querySelector('.entry-select');
        select.value = 'editorialIvory';
        select.dispatchEvent(new CustomEvent('change'));
        await flush();
        el.shadowRoot.querySelectorAll('.confirm-alt')[0].click();
        await flush();
        const spec = lastSpec(handler);
        expect(spec.theme.name).toBe('editorialIvory');
        expect(spec.theme.overrides).toEqual({});
    });

    it('clean theme switch needs no confirm', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        const select = el.shadowRoot.querySelector('.entry-select');
        select.value = 'editorialIvory';
        select.dispatchEvent(new CustomEvent('change'));
        await flush();
        expect(el.shadowRoot.querySelector('.confirm')).toBeNull();
        expect(lastSpec(handler).theme.name).toBe('editorialIvory');
    });

    it('Simple shows the advanced-overrides chip for non-simple deviations', async () => {
        const el = mount();
        await goAdvanced(el);
        await openArea(el, 'body');
        const shadow = el.shadowRoot.querySelector('select[data-key="shadow"]');
        shadow.value = 'floating';
        shadow.dispatchEvent(new CustomEvent('change'));
        await flush();
        el.shadowRoot.querySelectorAll('.lens-btn')[0].click();
        await flush();
        const chip = el.shadowRoot.querySelector('.advchip');
        expect(chip).not.toBeNull();
        expect(chip.textContent).toContain('1');
    });

    it('paging: splitHero gets pane controls, stepper gets the parked narration', async () => {
        const el = mount(
            buildSampleSpec({ layout: 'splitHero', themeKey: 'nordic' })
        );
        await goAdvanced(el);
        await openArea(el, 'paging');
        expect(
            el.shadowRoot.querySelector('input[data-key="fullBleed"]')
        ).not.toBeNull();
        expect(el.shadowRoot.querySelector('.narrate').textContent).toContain(
            'brand pane'
        );

        const el2 = mount(
            buildSampleSpec({ layout: 'stepper', themeKey: 'nordic' })
        );
        await goAdvanced(el2);
        await openArea(el2, 'paging');
        expect(
            el2.shadowRoot.querySelector('input[data-key="fullBleed"]')
        ).toBeNull();
        expect(el2.shadowRoot.querySelector('.narrate').textContent).toContain(
            'owns its progress indicator'
        );
    });

    it('LOOK chips step radius + density (Simple drives the same registry values)', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        el.shadowRoot.querySelector('.chip[data-look="rounder"]').click();
        await flush();
        // nordic radius=soft → next step up is md
        expect(lastSpec(handler).theme.overrides.radius).toBe('md');
        el.shadowRoot.querySelector('.chip[data-look="dense"]').click();
        await flush();
        expect(lastSpec(handler).theme.overrides.density).toBe('compact');
    });

    it('plain content controls (title) write spec paths, never overrides', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        const input = el.shadowRoot.querySelector('input[data-key="title"]');
        input.value = 'New Title';
        input.dispatchEvent(new CustomEvent('change'));
        await flush();
        const spec = lastSpec(handler);
        expect(spec.header.title).toBe('New Title');
        expect(spec.theme.overrides || {}).toEqual({});
    });
});
