import { createElement } from 'lwc';
import FinalPropertyPanel from 'c/finalPropertyPanel';
import listSurveyTopics from '@salesforce/apex/FinalStudioController.listSurveyTopics';
import createSurveyTopic from '@salesforce/apex/FinalStudioController.createSurveyTopic';
import canCreateSurveyTopics from '@salesforce/apex/FinalStudioController.canCreateSurveyTopics';

/** Topics picker (IMPL_PLAN_TOPIC_JUNCTION_REMOVAL part 2, DEFERRED 31): a
 *  combobox over the active topics, "Create a topic…" only with the
 *  Create_Survey_Topics permission, an empty-state line, inactive chips. */

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
jest.mock(
    '@salesforce/apex/FinalStudioController.listSurveyTopics',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalStudioController.createSurveyTopic',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalStudioController.canCreateSurveyTopics',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalLookupController.listLookupObjects',
    () => ({ default: jest.fn(() => Promise.resolve([])) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalAssetController.uploadImage',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalAssetController.deleteImage',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const SUPPORT = { id: 'a01000000000001AAA', name: 'Support' };
const ONBOARDING = { id: 'a01000000000002AAA', name: 'Onboarding' };
const PRICING = { id: 'a01000000000003AAA', name: 'Pricing' };

const flush = async () => {
    for (let i = 0; i < 4; i++) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
    }
};

async function mount({ topics, canCreate, onQuestion = [] }) {
    listSurveyTopics.mockResolvedValue(topics);
    canCreateSurveyTopics.mockResolvedValue(canCreate);
    const el = createElement('c-final-property-panel', {
        is: FinalPropertyPanel
    });
    Object.assign(el, {
        kind: 'element',
        formType: 'survey',
        node: {
            id: 'el_nps',
            type: 'nps',
            label: 'How likely?',
            config: {},
            analytics: { topics: onQuestion }
        }
    });
    document.body.appendChild(el);
    await flush();
    return el;
}

const stubValidity = (input) => {
    input.setCustomValidity = jest.fn();
    input.reportValidity = jest.fn();
};
const focused = [];
const combo = (el) => el.shadowRoot.querySelector('.pp-topic-pick');
const openBox = async (el) => {
    combo(el).dispatchEvent(
        new CustomEvent('change', { detail: { value: '__create__' } })
    );
    await flush();
    const name = el.shadowRoot.querySelector('.pp-topic-new-name');
    stubValidity(name);
    return name;
};
const addBtn = (el) =>
    Array.from(
        el.shadowRoot.querySelectorAll('.pp-topic-new lightning-button')
    ).find((b) => b.label === 'Add');
const lastFocusIs = (cls) =>
    focused.length > 0 && focused[focused.length - 1].classList.contains(cls);
const chips = (el) =>
    Array.from(el.shadowRoot.querySelectorAll('.pp-topic-chip')).map((c) =>
        c.textContent.trim()
    );

describe('c-final-property-panel topics picker', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        focused.length = 0;
        jest.spyOn(HTMLElement.prototype, 'focus').mockImplementation(
            function track() {
                focused.push(this);
            }
        );
    });
    afterEach(() => {
        jest.restoreAllMocks();
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('lists only active topics that are not already on the question', async () => {
        const el = await mount({
            topics: [SUPPORT, ONBOARDING, PRICING],
            canCreate: false,
            onQuestion: [{ id: SUPPORT.id, name: 'Support' }]
        });
        const box = combo(el);
        expect(box.label).toBe('Add a topic');
        expect(box.placeholder).toBe('Pick a topic');
        expect(box.options.map((o) => o.label)).toEqual([
            'Onboarding',
            'Pricing'
        ]);
        expect(el.shadowRoot.querySelector('input[list]')).toBeNull();
    });

    it('picking a topic adds a chip through propchange', async () => {
        const el = await mount({
            topics: [SUPPORT, ONBOARDING],
            canCreate: false
        });
        const events = [];
        el.addEventListener('propchange', (e) => events.push(e.detail));
        combo(el).dispatchEvent(
            new CustomEvent('change', { detail: { value: ONBOARDING.id } })
        );
        expect(events).toHaveLength(1);
        expect(events[0].patch.analytics.topics).toEqual([
            { id: ONBOARDING.id, name: 'Onboarding' }
        ]);
    });

    it('offers "Create a topic…" only with the permission', async () => {
        const withIt = await mount({
            topics: [SUPPORT],
            canCreate: true
        });
        const labels = combo(withIt).options.map((o) => o.label);
        expect(labels[labels.length - 1]).toBe('Create a topic…');
        document.body.removeChild(withIt);

        const without = await mount({
            topics: [SUPPORT],
            canCreate: false
        });
        expect(combo(without).options.map((o) => o.label)).toEqual(['Support']);
    });

    it('"Create a topic…" opens an inline box that creates and adds the chip', async () => {
        const el = await mount({ topics: [SUPPORT], canCreate: true });
        createSurveyTopic.mockResolvedValue({
            id: PRICING.id,
            name: 'Pricing'
        });
        const events = [];
        el.addEventListener('propchange', (e) => events.push(e.detail));
        combo(el).dispatchEvent(
            new CustomEvent('change', {
                detail: { value: '__create__' }
            })
        );
        await flush();
        const box = el.shadowRoot.querySelector('.pp-topic-new');
        expect(box).not.toBeNull();
        expect(box.getAttribute('role')).toBe('group');

        const name = el.shadowRoot.querySelector('.pp-topic-new-name');
        name.value = 'Pricing';
        name.dispatchEvent(new CustomEvent('change'));
        const add = Array.from(box.querySelectorAll('lightning-button')).find(
            (b) => b.label === 'Add'
        );
        add.click();
        await flush();

        expect(createSurveyTopic).toHaveBeenCalledWith({
            topicName: 'Pricing'
        });
        expect(events[0].patch.analytics.topics).toEqual([
            { id: PRICING.id, name: 'Pricing' }
        ]);
        expect(el.shadowRoot.querySelector('.pp-topic-new')).toBeNull();
    });

    it('shows the server refusal and keeps the box open', async () => {
        const el = await mount({ topics: [SUPPORT], canCreate: true });
        createSurveyTopic.mockRejectedValue({
            body: { message: 'You do not have permission to create topics.' }
        });
        combo(el).dispatchEvent(
            new CustomEvent('change', { detail: { value: '__create__' } })
        );
        await flush();
        const name = el.shadowRoot.querySelector('.pp-topic-new-name');
        stubValidity(name);
        name.value = 'Billing';
        name.dispatchEvent(new CustomEvent('change'));
        Array.from(
            el.shadowRoot.querySelectorAll('.pp-topic-new lightning-button')
        )
            .find((b) => b.label === 'Add')
            .click();
        await flush();
        expect(name.setCustomValidity).toHaveBeenLastCalledWith(
            'You do not have permission to create topics.'
        );
        expect(name.reportValidity).toHaveBeenCalled();
        // announced once, by the input itself
        expect(el.shadowRoot.querySelector('[role="alert"]')).toBeNull();
        name.value = 'Billing 2';
        name.dispatchEvent(new CustomEvent('change'));
        expect(name.setCustomValidity).toHaveBeenLastCalledWith('');
        expect(el.shadowRoot.querySelector('.pp-topic-new')).not.toBeNull();
    });

    it('says so when there are no topics and no permission', async () => {
        const el = await mount({ topics: [], canCreate: false });
        expect(combo(el)).toBeNull();
        expect(el.shadowRoot.textContent).toContain(
            'No topics yet. An admin adds them on the Survey Topics tab.'
        );
    });

    it('with no topics but the permission, only "Create a topic…" is offered', async () => {
        const el = await mount({ topics: [], canCreate: true });
        expect(combo(el).options.map((o) => o.label)).toEqual([
            'Create a topic…'
        ]);
        expect(el.shadowRoot.textContent).not.toContain('No topics yet');
    });

    it('labels a deactivated topic "(inactive)" and still lets it be removed', async () => {
        const el = await mount({
            topics: [SUPPORT],
            canCreate: false,
            onQuestion: [
                { id: SUPPORT.id, name: 'Support' },
                { id: ONBOARDING.id, name: 'Onboarding' }
            ]
        });
        expect(chips(el)).toEqual(['Support', 'Onboarding (inactive)']);
        // not offered again
        expect(combo(el)).toBeNull();

        const events = [];
        el.addEventListener('propchange', (e) => events.push(e.detail));
        const remove = el.shadowRoot.querySelectorAll('.pp-topic-chip .pp-x');
        remove[1].click();
        expect(events[0].patch.analytics.topics).toEqual([
            { id: SUPPORT.id, name: 'Support' }
        ]);
    });

    it('resets the combobox value after a pick so the label does not stick', async () => {
        const el = await mount({
            topics: [SUPPORT, ONBOARDING],
            canCreate: false
        });
        const box = combo(el);
        box.value = ONBOARDING.id;
        box.dispatchEvent(
            new CustomEvent('change', { detail: { value: ONBOARDING.id } })
        );
        expect(box.value).toBe('');
    });

    it('focuses the name box when "Create a topic…" opens', async () => {
        const el = await mount({ topics: [SUPPORT], canCreate: true });
        await openBox(el);
        expect(lastFocusIs('pp-topic-new-name')).toBe(true);
    });

    it('Escape closes the box and returns focus to the combobox', async () => {
        const el = await mount({ topics: [SUPPORT], canCreate: true });
        const name = await openBox(el);
        name.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                composed: true
            })
        );
        await flush();
        expect(el.shadowRoot.querySelector('.pp-topic-new')).toBeNull();
        expect(lastFocusIs('pp-topic-pick')).toBe(true);
    });

    it('Cancel returns focus to the combobox', async () => {
        const el = await mount({ topics: [SUPPORT], canCreate: true });
        await openBox(el);
        Array.from(
            el.shadowRoot.querySelectorAll('.pp-topic-new lightning-button')
        )
            .find((b) => b.label === 'Cancel')
            .click();
        await flush();
        expect(lastFocusIs('pp-topic-pick')).toBe(true);
    });

    it('a successful Add returns focus to the combobox', async () => {
        const el = await mount({ topics: [SUPPORT], canCreate: true });
        createSurveyTopic.mockResolvedValue({
            id: PRICING.id,
            name: 'Pricing'
        });
        const name = await openBox(el);
        name.value = 'Pricing';
        name.dispatchEvent(new CustomEvent('change'));
        addBtn(el).click();
        await flush();
        expect(el.shadowRoot.querySelector('.pp-topic-new')).toBeNull();
        expect(lastFocusIs('pp-topic-pick')).toBe(true);
    });

    it('a second Add while saving does not call Apex twice', async () => {
        const el = await mount({ topics: [SUPPORT], canCreate: true });
        let finish;
        createSurveyTopic.mockReturnValue(
            new Promise((resolve) => {
                finish = resolve;
            })
        );
        const name = await openBox(el);
        name.value = 'Pricing';
        name.dispatchEvent(new CustomEvent('change'));
        addBtn(el).click();
        await flush();
        expect(addBtn(el).disabled).toBe(true);
        addBtn(el).click();
        await flush();
        expect(createSurveyTopic).toHaveBeenCalledTimes(1);
        finish({ id: PRICING.id, name: 'Pricing' });
        await flush();
    });

    it('says every topic is already on the question when none remain', async () => {
        const el = await mount({
            topics: [SUPPORT],
            canCreate: false,
            onQuestion: [{ id: SUPPORT.id, name: 'Support' }]
        });
        expect(combo(el)).toBeNull();
        expect(el.shadowRoot.textContent).toContain(
            'Every topic is already on this question.'
        );
        expect(el.shadowRoot.textContent).not.toContain('No topics yet');
    });

    it('shows neither the picker nor the empty line before the load lands', async () => {
        let resolveList;
        listSurveyTopics.mockReturnValue(
            new Promise((resolve) => {
                resolveList = resolve;
            })
        );
        canCreateSurveyTopics.mockResolvedValue(false);
        const el = createElement('c-final-property-panel', {
            is: FinalPropertyPanel
        });
        Object.assign(el, {
            kind: 'element',
            formType: 'survey',
            node: {
                id: 'el_nps',
                type: 'nps',
                label: 'How likely?',
                config: {},
                analytics: { topics: [] }
            }
        });
        document.body.appendChild(el);
        await flush();
        expect(combo(el)).toBeNull();
        expect(el.shadowRoot.textContent).not.toContain('No topics yet');
        resolveList([]);
        await flush();
        expect(el.shadowRoot.textContent).toContain('No topics yet');
    });
});
