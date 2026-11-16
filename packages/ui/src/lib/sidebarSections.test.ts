import { describe, expect, test } from 'bun:test';
import {
  EMPTY_SIDEBAR_SECTION_FILTER,
  hasSidebarSectionConditions,
  matchesSidebarSectionFilter,
  sidebarSectionReadsLiveState,
  sidebarSectionReadsPlans,
  sidebarSectionReadsActivity,
  sidebarPinListsSchema,
  sidebarSectionsSchema,
  type SidebarWorkFacts,
  type SidebarSectionFilter,
} from './sidebarSections';

const facts = (overrides: Partial<SidebarWorkFacts> = {}): SidebarWorkFacts => ({
  kind: 'session', projectId: 'p1', folderId: null, pin: null, inWork: false, done: false, running: false, needsAnswer: false,
  unread: false, failed: false, looksDone: false, hasPr: false, hasIssue: false, hasTrackerItem: false, hasPlan: false, planKnown: true, hasGoal: false, lastActivityAt: 0, texts: [], scheduled: false, ...overrides,
});

describe('sidebarSectionsSchema', () => {
  test('an empty list is the default order, and what is not a list is rejected', () => {
    expect(sidebarSectionsSchema.parse([]).map((entry) => entry.id)).toEqual(['pages', 'chats', 'pinned', 'work', 'projects']);
    expect(sidebarSectionsSchema.safeParse('junk').success).toBe(false);
  });

  test('drops broken and repeated entries and puts missing built-in sections back in their default place', () => {
    const sections = sidebarSectionsSchema.parse([
      { kind: 'builtin', id: 'projects' },
      { kind: 'custom', id: 'mine', name: '  Mine  ', filter: { states: ['running', 'bogus'] } },
      { kind: 'custom', id: 'mine', name: 'Again' },
      { kind: 'custom', id: 'work', name: 'Takes a built-in id' },
      { kind: 'custom', id: 'nameless', name: '' },
      'junk',
      { kind: 'builtin', id: 'chats' },
    ]);
    // Pages leads, Pinned follows Chats, as by default, and In work follows Pinned.
    expect(sections.map((entry) => entry.id)).toEqual(['pages', 'projects', 'mine', 'chats', 'pinned', 'work']);
    const mine = sections.find((entry) => entry.id === 'mine');
    expect(mine).toMatchObject({ kind: 'custom', name: 'Mine', grouping: 'time', claims: false, hideWhenEmpty: true });
    expect(mine?.kind === 'custom' ? mine.filter.states : null).toEqual(['running']);
  });

  test('an order saved before Pages existed gets it first', () => {
    const sections = sidebarSectionsSchema.parse([
      { kind: 'builtin', id: 'chats' },
      { kind: 'builtin', id: 'pinned' },
      { kind: 'custom', id: 'mine', name: 'Mine' },
      { kind: 'builtin', id: 'work' },
      { kind: 'builtin', id: 'projects' },
    ]);
    expect(sections.map((entry) => entry.id)).toEqual(['pages', 'chats', 'pinned', 'mine', 'work', 'projects']);
  });

  test('an order that has Pages keeps it where the user put it', () => {
    const sections = sidebarSectionsSchema.parse([
      { kind: 'builtin', id: 'chats' },
      { kind: 'builtin', id: 'pinned' },
      { kind: 'builtin', id: 'work' },
      { kind: 'builtin', id: 'projects' },
      { kind: 'builtin', id: 'pages' },
    ]);
    expect(sections.map((entry) => entry.id)).toEqual(['chats', 'pinned', 'work', 'projects', 'pages']);
  });

  test('a section keeps the folders it asks for, and a group of projects drops them', () => {
    const sections = sidebarSectionsSchema.parse([
      { kind: 'custom', id: 'mine', name: 'Mine', filter: { folders: ['f1', 'f1', 7] } },
      { kind: 'custom', id: 'clients', name: 'Clients', grouping: 'project', filter: { folders: ['f1'] } },
    ]);
    const mine = sections.find((entry) => entry.id === 'mine');
    const clients = sections.find((entry) => entry.id === 'clients');
    expect(mine?.kind === 'custom' ? mine.filter.folders : null).toEqual(['f1']);
    expect(clients?.kind === 'custom' ? clients.filter.folders : null).toEqual([]);
  });

  test('a folder condition matches the works filed there', () => {
    const filter = { ...EMPTY_SIDEBAR_SECTION_FILTER, folders: ['f1'] };
    expect(matchesSidebarSectionFilter(filter, facts({ folderId: 'f1' }), 0)).toBe(true);
    expect(matchesSidebarSectionFilter(filter, facts({ folderId: 'f2' }), 0)).toBe(false);
    expect(matchesSidebarSectionFilter(filter, facts(), 0)).toBe(false);
  });

  test('a group of projects keeps only its projects', () => {
    const entry = sidebarSectionsSchema.parse([{ kind: 'custom', id: 'g', name: 'Clients', grouping: 'project', filter: { projectIds: ['p1'], states: ['running'] } }])
      .find((section) => section.id === 'g');
    expect(entry?.kind === 'custom' ? entry.filter : null).toEqual({ ...EMPTY_SIDEBAR_SECTION_FILTER, projectIds: ['p1'] });
  });

  test('keeps a project named by a long folder path', () => {
    // A project's id is `path_` and its folder path encoded, longer than the ids sections make.
    const id = `path_${'L1VzZXJzL2J0cmlhcGl0c3lu'.repeat(4)}`;
    const entry = sidebarSectionsSchema.parse([{ kind: 'custom', id: 'g', name: 'Clients', grouping: 'project', filter: { projectIds: [id] } }])
      .find((section) => section.id === 'g');
    expect(entry?.kind === 'custom' ? entry.filter.projectIds : null).toEqual([id]);
  });

  test('keeps phrases trimmed, short and once, and reads one saved as a string or none at all', () => {
    const parsed = sidebarSectionsSchema.parse([
      { kind: 'custom', id: 't', name: 'Relay', filter: { text: `  relay ${'x'.repeat(200)}` } },
      { kind: 'custom', id: 'l', name: 'Topics', filter: { text: [' relay ', 'relay', '', 42, 'mobile'] } },
      { kind: 'custom', id: 'o', name: 'Old', filter: { states: ['running'] } },
    ]);
    const textOf = (id: string) => {
      const entry = parsed.find((section) => section.id === id);
      return entry?.kind === 'custom' ? entry.filter.text : null;
    };
    expect(textOf('t')).toEqual([`relay ${'x'.repeat(94)}`]);
    expect(textOf('l')).toEqual(['relay', 'mobile']);
    expect(textOf('o')).toEqual([]);
  });
});

describe('sidebar section exclusions', () => {
  const now = Date.UTC(2026, 10, 16, 12);
  const inbox: SidebarSectionFilter = {
    ...EMPTY_SIDEBAR_SECTION_FILTER,
    work: ['in-work'],
    exclude: { ...EMPTY_SIDEBAR_SECTION_FILTER, states: ['running'] },
  };

  test('idle open work survives reading, leaves while running and returns when idle', () => {
    for (const unread of [true, false]) {
      expect(matchesSidebarSectionFilter(inbox, facts({ inWork: true, unread }), now)).toBe(true);
    }
    expect(matchesSidebarSectionFilter(inbox, facts({ inWork: true, running: true }), now)).toBe(false);
    expect(matchesSidebarSectionFilter(inbox, facts({ inWork: true, running: false }), now)).toBe(true);
    expect(matchesSidebarSectionFilter(inbox, facts({ done: true }), now)).toBe(false);
    expect(matchesSidebarSectionFilter(inbox, facts(), now)).toBe(false);
  });

  test('running and needs-answer are independent facts, with no implicit exception', () => {
    const waiting = facts({ inWork: true, running: true, needsAnswer: true });
    expect(matchesSidebarSectionFilter(inbox, waiting, now)).toBe(false);
    expect(matchesSidebarSectionFilter({ ...EMPTY_SIDEBAR_SECTION_FILTER, states: ['needs-answer'] }, waiting, now)).toBe(true);
  });

  test('exclusion-only sections register conditions and their update dependencies', () => {
    expect(hasSidebarSectionConditions({ ...EMPTY_SIDEBAR_SECTION_FILTER, exclude: EMPTY_SIDEBAR_SECTION_FILTER })).toBe(false);
    const live = { ...EMPTY_SIDEBAR_SECTION_FILTER, exclude: inbox.exclude };
    expect(hasSidebarSectionConditions(live)).toBe(true);
    expect(sidebarSectionReadsLiveState(live)).toBe(true);
    expect(matchesSidebarSectionFilter(live, facts(), now)).toBe(true);
    expect(matchesSidebarSectionFilter(live, facts({ running: true }), now)).toBe(false);
    const plans: SidebarSectionFilter = { ...EMPTY_SIDEBAR_SECTION_FILTER, exclude: { ...EMPTY_SIDEBAR_SECTION_FILTER, links: ['plan'] } };
    expect(sidebarSectionReadsPlans(plans)).toBe(true);
    expect(sidebarSectionReadsPlans(EMPTY_SIDEBAR_SECTION_FILTER)).toBe(false);
    expect(sidebarSectionReadsLiveState(plans)).toBe(false);
    const activity: SidebarSectionFilter = { ...EMPTY_SIDEBAR_SECTION_FILTER, exclude: { ...EMPTY_SIDEBAR_SECTION_FILTER, activity: 'stalled' } };
    expect(hasSidebarSectionConditions(activity)).toBe(true);
    expect(sidebarSectionReadsActivity(activity)).toBe(true);
    expect(sidebarSectionReadsActivity(EMPTY_SIDEBAR_SECTION_FILTER)).toBe(false);
  });

  test('included values use OR, categories use AND, and any exclusion vetoes', () => {
    const filter: SidebarSectionFilter = {
      ...EMPTY_SIDEBAR_SECTION_FILTER, states: ['unread', 'needs-answer'], projectIds: ['p1', 'p2'],
      exclude: { ...EMPTY_SIDEBAR_SECTION_FILTER, states: ['running', 'failed'], projectIds: ['p2'] },
    };
    expect(matchesSidebarSectionFilter(filter, facts({ unread: true }), now)).toBe(true);
    expect(matchesSidebarSectionFilter(filter, facts({ needsAnswer: true }), now)).toBe(true);
    expect(matchesSidebarSectionFilter(filter, facts(), now)).toBe(false);
    expect(matchesSidebarSectionFilter(filter, facts({ unread: true, projectId: 'p3' }), now)).toBe(false);
    expect(matchesSidebarSectionFilter(filter, facts({ unread: true, running: true }), now)).toBe(false);
    expect(matchesSidebarSectionFilter(filter, facts({ unread: true, failed: true }), now)).toBe(false);
    expect(matchesSidebarSectionFilter(filter, facts({ unread: true, projectId: 'p2' }), now)).toBe(false);
    expect(matchesSidebarSectionFilter({ ...filter, exclude: { ...EMPTY_SIDEBAR_SECTION_FILTER, states: ['unread'] } }, facts({ unread: true }), now)).toBe(false);
  });

  test('each exclusion vetoes independently and absent values do not match it', () => {
    const cases: { exclude: Partial<NonNullable<SidebarSectionFilter['exclude']>>; matching: Partial<SidebarWorkFacts>; other?: Partial<SidebarWorkFacts> }[] = [
      { exclude: { states: ['needs-answer'] }, matching: { needsAnswer: true } },
      { exclude: { states: ['looks-done'] }, matching: { looksDone: true } },
      { exclude: { work: ['in-work'] }, matching: { inWork: true } },
      { exclude: { work: ['done'] }, matching: { done: true } },
      { exclude: { pins: ['favorites'] }, matching: { pin: 'favorites' } },
      { exclude: { kinds: ['session'] }, matching: { kind: 'session' }, other: { kind: 'worktree' } },
      { exclude: { kinds: ['scheduled'] }, matching: { kind: 'worktree', scheduled: true } },
      { exclude: { links: ['pr'] }, matching: { hasPr: true } },
      { exclude: { links: ['issue'] }, matching: { hasIssue: true } },
      { exclude: { links: ['tracker'] }, matching: { hasTrackerItem: true } },
      { exclude: { links: ['plan'] }, matching: { hasPlan: true } },
      { exclude: { links: ['goal'] }, matching: { hasGoal: true } },
      { exclude: { projectIds: ['p1'] }, matching: { projectId: 'p1' }, other: { projectId: null } },
      { exclude: { folders: ['f1'] }, matching: { folderId: 'f1' } },
      { exclude: { text: ['relay fix'] }, matching: { texts: ['Fix the relay'] } },
    ];
    for (const { exclude, matching, other } of cases) {
      const filter = { ...EMPTY_SIDEBAR_SECTION_FILTER, exclude: { ...EMPTY_SIDEBAR_SECTION_FILTER, ...exclude } };
      expect(matchesSidebarSectionFilter(filter, facts(matching), now)).toBe(false);
      expect(matchesSidebarSectionFilter(filter, facts(other), now)).toBe(true);
    }
  });

  test('not stalled keeps unknown activity and the exact three-day boundary', () => {
    const filter: SidebarSectionFilter = { ...EMPTY_SIDEBAR_SECTION_FILTER, exclude: { ...EMPTY_SIDEBAR_SECTION_FILTER, activity: 'stalled' } };
    const boundary = now - 3 * 24 * 60 * 60 * 1000;
    for (const lastActivityAt of [0, boundary, boundary + 1]) {
      expect(matchesSidebarSectionFilter(filter, facts({ lastActivityAt }), now)).toBe(true);
    }
    expect(matchesSidebarSectionFilter(filter, facts({ lastActivityAt: boundary - 1 }), now)).toBe(false);
  });

  test('Not Plan waits for known plan data while positive Plan keeps matching known links', () => {
    const negative: SidebarSectionFilter = { ...EMPTY_SIDEBAR_SECTION_FILTER,
      exclude: { ...EMPTY_SIDEBAR_SECTION_FILTER, links: ['plan'] } };
    expect(matchesSidebarSectionFilter(negative, { ...facts(), planKnown: false }, now)).toBe(false);
    expect(matchesSidebarSectionFilter(negative, { ...facts(), planKnown: true }, now)).toBe(true);
    expect(matchesSidebarSectionFilter(negative, { ...facts({ hasPlan: true }), planKnown: true }, now)).toBe(false);
    expect(matchesSidebarSectionFilter({ ...EMPTY_SIDEBAR_SECTION_FILTER, links: ['plan'] },
      { ...facts({ hasPlan: true }), planKnown: false }, now)).toBe(true);
  });

  test('schema round-trip validates exclusions without changing legacy filters or project groups', () => {
    const legacy = { ...EMPTY_SIDEBAR_SECTION_FILTER, work: ['in-work'] };
    const parsed = sidebarSectionsSchema.parse([
      { kind: 'custom', id: 'negative', name: 'Negative', filter: { exclude: {
        states: ['running', 'running', 'unknown'], links: ['plan', 42], text: [' relay ', 'relay'],
        exclude: { states: ['unread'] },
      } } },
      { kind: 'custom', id: 'legacy', name: 'Legacy', filter: legacy },
      { kind: 'custom', id: 'malformed', name: 'Malformed', filter: { ...legacy, exclude: 42 } },
      { kind: 'custom', id: 'group', name: 'Projects', grouping: 'project', filter: { ...inbox, projectIds: ['p1'] } },
    ]);
    const filterOf = (id: string) => {
      const section = parsed.find((entry) => entry.id === id);
      if (!section || section.kind !== 'custom') throw new Error(`Missing section ${id}`);
      return section.filter;
    };
    expect(filterOf('negative').exclude).toEqual({ ...EMPTY_SIDEBAR_SECTION_FILTER, states: ['running'], links: ['plan'], text: ['relay'] });
    expect(filterOf('legacy')).toEqual(legacy);
    expect(filterOf('malformed')).toEqual(legacy);
    expect(filterOf('group')).toEqual({ ...EMPTY_SIDEBAR_SECTION_FILTER, projectIds: ['p1'] });
    expect(sidebarSectionsSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  test('stored positive and negative activity bounds both apply', () => {
    const filter: SidebarSectionFilter = { ...EMPTY_SIDEBAR_SECTION_FILTER, activity: 'week',
      exclude: { ...EMPTY_SIDEBAR_SECTION_FILTER, activity: 'stalled' } };
    const parsed = sidebarSectionsSchema.parse([{ kind: 'custom', id: 'active', name: 'Active', filter }]);
    const section = parsed.find((entry) => entry.id === 'active');
    if (!section || section.kind !== 'custom') throw new Error('Missing active section');
    expect(section.filter).toEqual(filter);
    expect(matchesSidebarSectionFilter(section.filter, facts({ lastActivityAt: now - 60_000 }), now)).toBe(true);
    expect(matchesSidebarSectionFilter(section.filter, facts({ lastActivityAt: now - 4 * 24 * 60 * 60 * 1000 }), now)).toBe(false);
    expect(matchesSidebarSectionFilter(section.filter, facts({ lastActivityAt: now - 8 * 24 * 60 * 60 * 1000 }), now)).toBe(false);
  });

  test('explicitly undefined exclusion fields receive the same defaults as included fields', () => {
    const sections = sidebarSectionsSchema.parse([{ kind: 'custom', id: 'partial', name: 'Partial', filter: {
      exclude: { states: undefined, work: undefined, pins: undefined, kinds: undefined, links: undefined,
        projectIds: undefined, folders: undefined, activity: undefined, text: undefined },
    } }]);
    const section = sections.find((entry) => entry.id === 'partial');
    if (!section || section.kind !== 'custom') throw new Error('Missing partial section');
    expect(section.filter.exclude).toEqual(EMPTY_SIDEBAR_SECTION_FILTER);
    expect(hasSidebarSectionConditions(section.filter)).toBe(false);
    expect(matchesSidebarSectionFilter(section.filter, facts(), now)).toBe(true);
  });
});

describe('sidebarPinListsSchema', () => {
  test('keeps named lists once and never one named like Pinned', () => {
    expect(sidebarPinListsSchema.parse([{ id: 'a', name: 'Release' }, { id: 'a', name: 'Dup' }, { id: 'pinned', name: 'Clash' }, { id: 'b', name: ' ' }]))
      .toEqual([{ id: 'a', name: 'Release' }]);
  });
});

describe('matchesSidebarSectionFilter', () => {
  const now = new Date(2026, 9, 31, 15, 0).getTime();
  test('any chip in a row matches, and every row with a chip must match', () => {
    const filter = { ...EMPTY_SIDEBAR_SECTION_FILTER, states: ['running', 'needs-answer'] as const, kinds: ['worktree'] as const };
    expect(matchesSidebarSectionFilter({ ...filter, states: [...filter.states], kinds: [...filter.kinds] }, facts({ kind: 'worktree', needsAnswer: true }), now)).toBe(true);
    expect(matchesSidebarSectionFilter({ ...filter, states: [...filter.states], kinds: [...filter.kinds] }, facts({ kind: 'session', needsAnswer: true }), now)).toBe(false);
    expect(matchesSidebarSectionFilter({ ...filter, states: [...filter.states], kinds: [...filter.kinds] }, facts({ kind: 'worktree' }), now)).toBe(false);
  });

  test('pins match by list, and an unpinned work matches no pin', () => {
    const filter = { ...EMPTY_SIDEBAR_SECTION_FILTER, pins: ['release'] };
    expect(matchesSidebarSectionFilter(filter, facts({ pin: 'release' }), now)).toBe(true);
    expect(matchesSidebarSectionFilter(filter, facts({ pin: 'pinned' }), now)).toBe(false);
    expect(matchesSidebarSectionFilter(filter, facts(), now)).toBe(false);
  });

  test('a scheduled run is a type of its own beside what the work is', () => {
    const scheduled = { ...EMPTY_SIDEBAR_SECTION_FILTER, kinds: ['scheduled' as const] };
    expect(matchesSidebarSectionFilter(scheduled, facts({ scheduled: true }), now)).toBe(true);
    expect(matchesSidebarSectionFilter(scheduled, facts({ kind: 'worktree', scheduled: true }), now)).toBe(true);
    expect(matchesSidebarSectionFilter(scheduled, facts(), now)).toBe(false);
    // With a title: the runs of one task.
    expect(matchesSidebarSectionFilter({ ...scheduled, text: ['nightly triage'] }, facts({ scheduled: true, texts: ['Nightly triage 2026-10-31'] }), now)).toBe(true);
    expect(matchesSidebarSectionFilter({ ...scheduled, text: ['nightly triage'] }, facts({ texts: ['Nightly triage notes'] }), now)).toBe(false);
  });

  test('text: every word of a phrase in a title or the branch, as the sidebar search matches', () => {
    const filter = { ...EMPTY_SIDEBAR_SECTION_FILTER, text: ['relay fix'] };
    expect(matchesSidebarSectionFilter(filter, facts({ texts: ['Fix the Relay reconnect'] }), now)).toBe(true);
    expect(matchesSidebarSectionFilter(filter, facts({ texts: ['Relay pairing', 'fix/relay-pairing'] }), now)).toBe(true);
    expect(matchesSidebarSectionFilter(filter, facts({ texts: ['Relay pairing'] }), now)).toBe(false);
    expect(matchesSidebarSectionFilter({ ...filter, text: [] }, facts(), now)).toBe(true);
  });

  test('text: any one of the phrases', () => {
    const filter = { ...EMPTY_SIDEBAR_SECTION_FILTER, text: ['relay', 'mobile drawer'] };
    expect(matchesSidebarSectionFilter(filter, facts({ texts: ['Relay pairing'] }), now)).toBe(true);
    expect(matchesSidebarSectionFilter(filter, facts({ texts: ['Mobile drawer scroll'] }), now)).toBe(true);
    expect(matchesSidebarSectionFilter(filter, facts({ texts: ['Mobile sheet'] }), now)).toBe(false);
  });

  test('activity: today and the last two days from local midnight, stalled after three quiet days', () => {
    const today = { ...EMPTY_SIDEBAR_SECTION_FILTER, activity: 'today' as const };
    const stalled = { ...EMPTY_SIDEBAR_SECTION_FILTER, activity: 'stalled' as const };
    expect(matchesSidebarSectionFilter(today, facts({ lastActivityAt: new Date(2026, 9, 31, 0, 5).getTime() }), now)).toBe(true);
    expect(matchesSidebarSectionFilter(today, facts({ lastActivityAt: new Date(2026, 9, 30, 23, 55).getTime() }), now)).toBe(false);
    const twoDays = { ...EMPTY_SIDEBAR_SECTION_FILTER, activity: 'two-days' as const };
    expect(matchesSidebarSectionFilter(twoDays, facts({ lastActivityAt: new Date(2026, 9, 30, 0, 5).getTime() }), now)).toBe(true);
    expect(matchesSidebarSectionFilter(twoDays, facts({ lastActivityAt: new Date(2026, 9, 29, 23, 55).getTime() }), now)).toBe(false);
    expect(matchesSidebarSectionFilter(stalled, facts({ lastActivityAt: now - 4 * 24 * 60 * 60 * 1000 }), now)).toBe(true);
    expect(matchesSidebarSectionFilter(stalled, facts({ lastActivityAt: now - 60_000 }), now)).toBe(false);
    expect(matchesSidebarSectionFilter(stalled, facts({ lastActivityAt: 0 }), now)).toBe(false);
  });
});
