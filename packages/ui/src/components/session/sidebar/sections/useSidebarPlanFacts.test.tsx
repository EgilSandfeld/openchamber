import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { installHookTestDom } from '../test-utils/testDom';
import { EMPTY_PROJECT_CONTEXT_ENTRY, useProjectContextStore } from '@/stores/useProjectContextStore';
import { resolveProjectContextId, type ProjectRef } from '@/lib/projectContextApi';
import { EMPTY_SIDEBAR_SECTION_FILTER, matchesSidebarSectionFilter, type SidebarSectionFilter } from '@/lib/sidebarSections';
import type { Session } from '@/lib/opencode/model';
import { buildSidebarWorkFacts, EMPTY_SIDEBAR_LIVE_FACTS } from './workFacts';

import { useSidebarPlanSessions } from './useSidebarLiveFacts';
import { useSidebarPlanKnownProjects } from './useSidebarPlanKnownProjects';
const project: ProjectRef = { id: 'sidebar-project', path: '/fixture/project' };
const projects: readonly ProjectRef[] = [project];
const disabledProjects: readonly ProjectRef[] = [];
const contextId = resolveProjectContextId(project);
const linkedPlan = {
  id: 'plan', file: 'plan.md', title: 'Plan', createdAt: 1, pinned: false,
  session: { sessionId: 'session', linkedAt: 1 },
};
const session: Session = {
  id: 'session', projectID: 'p', directory: project.path, title: 'Work', cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 2 },
};
const notPlan: SidebarSectionFilter = { ...EMPTY_SIDEBAR_SECTION_FILTER,
  exclude: { ...EMPTY_SIDEBAR_SECTION_FILTER, links: ['plan'] } };
let dom: ReturnType<typeof installHookTestDom>;
let root: ReturnType<typeof createRoot>;
type PlanFacts = { sessionIds: ReturnType<typeof useSidebarPlanSessions>; knownProjectIds: ReturnType<typeof useSidebarPlanKnownProjects> };
let result: PlanFacts;

function Harness({ covered = projects }: { covered?: readonly ProjectRef[] }) {
  result = { sessionIds: useSidebarPlanSessions(covered), knownProjectIds: useSidebarPlanKnownProjects(covered) };
  return null;
}

const matchesNotPlan = (projectId: string | null = project.id) => matchesSidebarSectionFilter(notPlan,
  buildSidebarWorkFacts({ kind: 'session', key: 'session:session', rootSessionId: session.id, projectId }, {
    sessionById: new Map([[session.id, session]]), childrenMap: new Map(), runKeyBySessionId: new Map(),
    live: EMPTY_SIDEBAR_LIVE_FACTS, planSessionIds: result.sessionIds, planKnownProjectIds: result.knownProjectIds, folderByMember: new Map(),
  }), 3);

async function setEntry(overrides: Partial<typeof EMPTY_PROJECT_CONTEXT_ENTRY>) {
  await act(async () => {
    useProjectContextStore.setState({
      entries: { [contextId]: { ...EMPTY_PROJECT_CONTEXT_ENTRY, ...overrides } },
    });
  });
}

beforeEach(async () => {
  useProjectContextStore.setState({ entries: { [contextId]: { ...EMPTY_PROJECT_CONTEXT_ENTRY, loading: true } } });
  dom = installHookTestDom();
  root = createRoot(dom.container);
  await act(async () => { root.render(<Harness />); });
});

afterEach(async () => {
  try {
    await act(async () => { root.unmount(); });
  } finally {
    useProjectContextStore.setState({ entries: {} });
    dom.restore();
  }
});

test('pending and initially failed projects do not match Not Plan', async () => {
  expect([...result.knownProjectIds]).toEqual([]);
  expect(matchesNotPlan()).toBe(false);
  await setEntry({ error: 'offline' });
  expect(matchesNotPlan()).toBe(false);
});

test('a successful empty snapshot uses the sidebar ID and survives a failed refresh', async () => {
  await setEntry({ loaded: true });
  expect(contextId).not.toBe(project.id);
  expect([...result.knownProjectIds]).toEqual([project.id]);
  expect(result.knownProjectIds.has(contextId)).toBe(false);
  expect(matchesNotPlan()).toBe(true);
  expect(matchesNotPlan(null)).toBe(false);
  expect(matchesNotPlan('unrelated-project')).toBe(false);
  await setEntry({ loaded: true, loading: true });
  expect(matchesNotPlan()).toBe(true);
  await setEntry({ loaded: true, error: 'offline' });
  expect(matchesNotPlan()).toBe(true);
});

test('linked plans stay excluded during refresh and refresh failure', async () => {
  await setEntry({ loaded: true, plans: [linkedPlan] });
  expect([...result.sessionIds]).toEqual(['session']);
  expect(matchesNotPlan()).toBe(false);
  await setEntry({ loaded: true, loading: true, plans: [linkedPlan] });
  expect(matchesNotPlan()).toBe(false);
  await setEntry({ loaded: true, error: 'offline', plans: [linkedPlan] });
  expect([...result.knownProjectIds]).toEqual([project.id]);
  expect([...result.sessionIds]).toEqual(['session']);
  expect(matchesNotPlan()).toBe(false);
});

test('disabling covered projects clears facts without clearing cached entries', async () => {
  await setEntry({ loaded: true, plans: [linkedPlan] });
  const cachedEntries = useProjectContextStore.getState().entries;
  await act(async () => { root.render(<Harness covered={disabledProjects} />); });
  expect([...result.knownProjectIds]).toEqual([]);
  expect([...result.sessionIds]).toEqual([]);
  expect(useProjectContextStore.getState().entries).toBe(cachedEntries);
});
