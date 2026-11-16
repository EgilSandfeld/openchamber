import { z } from 'zod';

const sidebarSectionIdSchema = z.string().trim().min(1).max(64);
const sidebarChips = <const T extends readonly [string, ...string[]]>(values: T) => z.array(z.unknown()).transform((entries) => (
  [...new Set(entries.flatMap((entry) => {
    const parsed = z.enum(values).safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  }))]
));
const sidebarIdList = (schema: z.ZodType<string>) => z.array(z.unknown()).transform((entries) => (
  [...new Set(entries.flatMap((entry) => {
    const parsed = schema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  }))]
));
const sidebarIds = sidebarIdList(sidebarSectionIdSchema);
const sidebarProjectIds = sidebarIdList(z.string().trim().min(1).max(4096));

const sidebarFilterValuesSchema = z.object({
  states: sidebarChips(['running', 'needs-answer', 'unread', 'failed', 'looks-done']).catch([]),
  work: sidebarChips(['in-work', 'done']).catch([]),
  pins: sidebarIds.catch([]),
  kinds: sidebarChips(['session', 'worktree', 'space', 'run', 'scheduled']).catch([]),
  links: sidebarChips(['pr', 'issue', 'tracker', 'plan', 'goal']).catch([]),
  projectIds: sidebarProjectIds.catch([]),
  folders: sidebarIds.catch([]),
  activity: z.enum(['any', 'today', 'two-days', 'week', 'stalled']).catch('any'),
  text: z.union([z.string().transform((value) => [value]), z.array(z.unknown())]).transform((entries) => (
    [...new Set(entries.flatMap((entry) => {
      const phrase = z.string().trim().transform((value) => value.slice(0, 100)).safeParse(entry);
      return phrase.success && phrase.data ? [phrase.data] : [];
    }))].slice(0, 12)
  )).catch([]),
}).partial();

export const sidebarSectionFilterSchema = sidebarFilterValuesSchema
  .extend({ exclude: sidebarFilterValuesSchema.optional().catch(undefined) })
  .catch({});
