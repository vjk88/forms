/** Shared by destination controls and Studio's mutation boundary. */
export function canMoveElement(element, source, target) {
    const context = (section) => section?.repeat?.childObject || null;
    return Boolean(
        element &&
        source &&
        !source.block &&
        target &&
        !target.block &&
        !(element.type === 'file' && target.repeat) &&
        context(source) === context(target)
    );
}

export function findItem(pages, kind, id) {
    for (const page of pages) {
        if (kind === 'page' && page.id === id)
            return { item: page, page, siblings: pages };
        for (const section of page.sections || []) {
            if (kind === 'section' && section.id === id)
                return {
                    item: section,
                    section,
                    page,
                    siblings: page.sections
                };
            const item = (section.elements || []).find((el) => el.id === id);
            if (kind === 'element' && item)
                return { item, section, page, siblings: section.elements };
        }
    }
    return null;
}
