import { EMPTY_SIDEBAR_SECTION_FILTER, type SidebarSectionFilter } from '@/lib/sidebarSections';

type ConditionCategory = 'text' | 'states' | 'work' | 'pins' | 'kinds' | 'links' | 'projectIds' | 'folders' | 'activity';
type ConditionValues = (filter: SidebarSectionFilter, category: ConditionCategory) => readonly string[];
type ToggleCondition = (filter: SidebarSectionFilter, category: ConditionCategory, value: string) => SidebarSectionFilter;
type ClearCondition = (filter: SidebarSectionFilter, category: ConditionCategory) => SidebarSectionFilter;

export const selectedConditionValues = (filter: SidebarSectionFilter, category: ConditionCategory, conditionValues: ConditionValues): readonly string[] => (
  [...new Set([...conditionValues(filter, category), ...conditionValues(filter.exclude ?? EMPTY_SIDEBAR_SECTION_FILTER, category)])]
);

export const toggleWithExclusion = (
  filter: SidebarSectionFilter,
  category: ConditionCategory,
  value: string,
  byProjects: boolean,
  conditionValues: ConditionValues,
  toggleCondition: ToggleCondition,
): SidebarSectionFilter => {
  const excluded = filter.exclude ?? EMPTY_SIDEBAR_SECTION_FILTER;
  if (byProjects || !conditionValues(excluded, category).includes(value)) return toggleCondition(filter, category, value);
  return {
    ...(conditionValues(filter, category).includes(value) ? toggleCondition(filter, category, value) : filter),
    exclude: toggleCondition(excluded, category, value),
  };
};

export const toggleExclusionPolarity = (
  filter: SidebarSectionFilter,
  category: ConditionCategory,
  value: string,
  conditionValues: ConditionValues,
  toggleCondition: ToggleCondition,
): SidebarSectionFilter => {
  const excluded = filter.exclude ?? EMPTY_SIDEBAR_SECTION_FILTER;
  const isExcluded = conditionValues(excluded, category).includes(value);
  const isIncluded = conditionValues(filter, category).includes(value);
  return {
    ...(isIncluded === isExcluded ? filter : toggleCondition(filter, category, value)),
    exclude: toggleCondition(excluded, category, value),
  };
};

export const clearWithExclusion = (filter: SidebarSectionFilter, category: ConditionCategory, clearCondition: ClearCondition): SidebarSectionFilter => {
  const result = clearCondition(filter, category);
  if (result.exclude) result.exclude = clearCondition(result.exclude, category);
  return result;
};
