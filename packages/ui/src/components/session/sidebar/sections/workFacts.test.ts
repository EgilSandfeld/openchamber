import { describe, expect, test } from 'bun:test';
import type { Session } from '@/lib/opencode/model';
import { buildSidebarWorkFacts, EMPTY_SIDEBAR_LIVE_FACTS } from './workFacts';
import { EMPTY_SIDEBAR_SECTION_FILTER, matchesSidebarSectionFilter, type SidebarSectionFilter } from '@/lib/sidebarSections';

const session = (metadata: Session['metadata']): Session => ({
  id: 's1', projectID: 'p', directory: '/p', title: 'Nightly triage', cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 2 }, metadata,
});

const factsFor = (record: Session) => buildSidebarWorkFacts(
  { kind: 'session', key: 'session:s1', projectId: 'p', rootSessionId: 's1' },
  { sessionById: new Map([['s1', record]]), childrenMap: new Map(), runKeyBySessionId: new Map(), live: EMPTY_SIDEBAR_LIVE_FACTS, planSessionIds: new Set(), planKnownProjectIds: new Set(), folderByMember: new Map([['s1', { folderId: 'folder', projectId: 'p' }]]) },
);

describe('buildSidebarWorkFacts', () => {
  test('a session names the folder holding it', () => {
    expect(factsFor(session({})).folderId).toBe('folder');
  });

  test('a session updated into a new record is read again', () => {
    const before = session({ openchamber: { kind: 'scheduled' } });
    expect(factsFor(before)).toMatchObject({ scheduled: true, inWork: false });
    expect(factsFor(before)).toMatchObject({ scheduled: true, inWork: false });
    const after = session({ openchamber: { kind: 'scheduled', work: { state: 'open', at: 3 } } });
    expect(factsFor(after)).toMatchObject({ scheduled: true, inWork: true });
  });

  test('a running child excludes its open parent even while that child needs an answer', () => {
    const root = session({ openchamber: { work: { state: 'open', at: 3 } } });
    const child = { ...session({}), id: 'child', parentID: root.id };
    const live = { ...EMPTY_SIDEBAR_LIVE_FACTS, activeIds: new Set(['child']), blockingIds: new Set(['child']) };
    const context = { sessionById: new Map([[root.id, root], [child.id, child]]), childrenMap: new Map([[root.id, [child]]]),
      runKeyBySessionId: new Map<string, string>(), live, planSessionIds: new Set<string>(), planKnownProjectIds: new Set<string>(), folderByMember: new Map() };
    const ref = { kind: 'session' as const, key: 'session:s1', projectId: 'p', rootSessionId: root.id };
    const filter: SidebarSectionFilter = { ...EMPTY_SIDEBAR_SECTION_FILTER, work: ['in-work'],
      exclude: { ...EMPTY_SIDEBAR_SECTION_FILTER, states: ['running'] } };
    const waiting = buildSidebarWorkFacts(ref, context);
    expect(waiting).toMatchObject({ inWork: true, running: true, needsAnswer: true });
    expect(matchesSidebarSectionFilter(filter, waiting, 4)).toBe(false);
    expect(matchesSidebarSectionFilter(filter, buildSidebarWorkFacts(ref, { ...context, live: EMPTY_SIDEBAR_LIVE_FACTS }), 4)).toBe(true);
  });
});
