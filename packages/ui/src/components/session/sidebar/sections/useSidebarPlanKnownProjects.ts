import React from 'react';
import { useProjectContextStore } from '@/stores/useProjectContextStore';
import { resolveProjectContextId, type ProjectRef } from '@/lib/projectContextApi';

export const useSidebarPlanKnownProjects = (projects: readonly ProjectRef[]): ReadonlySet<string> => {
  const enabled = projects.length > 0;
  const entries = useProjectContextStore((state) => (enabled ? state.entries : null));
  return React.useMemo(() => new Set(projects.filter((project) => entries?.[resolveProjectContextId(project)]?.loaded).map((project) => project.id)), [entries, projects]);
};
