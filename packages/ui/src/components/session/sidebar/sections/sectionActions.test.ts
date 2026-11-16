import { afterEach, expect, test } from 'bun:test';
import { EMPTY_SIDEBAR_SECTION_FILTER, DEFAULT_SIDEBAR_SECTIONS, type CustomSidebarSection } from '@/lib/sidebarSections';
import { useSessionDisplayStore } from '@/stores/useSessionDisplayStore';

import { deleteSidebarPinList, removeFolderFromSections } from './sectionActions';

afterEach(() => useSessionDisplayStore.getState().setSections([...DEFAULT_SIDEBAR_SECTIONS]));

for (const category of ['pins', 'folders'] as const) {
  test(`deleting ${category} cleans exclusions without broadening included filters`, () => {
    const make = (id: string, included: string[], excluded: string[], inWork = false): CustomSidebarSection => ({
      kind: 'custom', id, name: id, grouping: 'time', claims: false, hideWhenEmpty: false,
      filter: { ...EMPTY_SIDEBAR_SECTION_FILTER, [category]: included, work: inWork ? ['in-work'] : [],
        exclude: { ...EMPTY_SIDEBAR_SECTION_FILTER, [category]: excluded } },
    });
    useSessionDisplayStore.getState().setSections([
      make('keep', [], ['deleted'], true),
      make('remove-empty', [], ['deleted']),
      make('remove-included', ['deleted'], ['other'], true),
      make('keep-other', [], ['deleted', 'other']),
    ]);
    if (category === 'pins') deleteSidebarPinList('deleted');
    else removeFolderFromSections('deleted');
    const sections = useSessionDisplayStore.getState().sections.filter((entry) => entry.kind === 'custom');
    expect(sections.map((entry) => entry.id)).toEqual(['keep', 'keep-other']);
    expect(sections[0]?.filter.work).toEqual(['in-work']);
    expect(sections[0]?.filter.exclude?.[category]).toEqual([]);
    expect(sections[1]?.filter.exclude?.[category]).toEqual(['other']);
  });
}
