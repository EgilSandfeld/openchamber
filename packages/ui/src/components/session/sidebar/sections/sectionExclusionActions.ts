import { hasSidebarSectionConditions, type SidebarSectionEntry } from '@/lib/sidebarSections';

export const removeSidebarSectionCondition = (entry: SidebarSectionEntry, category: 'pins' | 'folders', id: string): SidebarSectionEntry[] => {
  if (entry.kind !== 'custom') return [entry];
  const included = entry.filter[category].includes(id);
  const excluded = entry.filter.exclude?.[category].includes(id) === true;
  if (!included && !excluded) return [entry];
  const filter = { ...entry.filter, [category]: entry.filter[category].filter((value) => value !== id) };
  if (included && filter[category].length === 0) return [];
  if (excluded && filter.exclude) {
    filter.exclude = { ...filter.exclude, [category]: filter.exclude[category].filter((value) => value !== id) };
  }
  return hasSidebarSectionConditions(filter) ? [{ ...entry, filter }] : [];
};
