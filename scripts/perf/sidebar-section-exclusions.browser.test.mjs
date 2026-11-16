import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { startBrowser } from '../verify/browser.mjs';
import { resolveChrome } from './cdp.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let chrome;
try {
  chrome = resolveChrome(process.env.OPENCHAMBER_TEST_CHROME);
} catch (error) {
  if (process.env.OPENCHAMBER_TEST_CHROME) throw error;
}

test('section editor preserves independent activity bounds and work state', {
  skip: !chrome && 'Set OPENCHAMBER_TEST_CHROME to run the browser regression', timeout: 300_000,
}, async () => {
  const { createServer } = await import('vite');
  mkdirSync(path.join(repo, 'tmp'), { recursive: true });
  const fixture = mkdtempSync(path.join(repo, 'tmp/sidebar-section-exclusions-'));
  let server;
  let browser;
  let page;
  try {
    writeFileSync(path.join(fixture, 'index.html'), '<!doctype html><html><body><div id="root"></div><script type="module" src="/fixture.tsx"></script></body></html>');
    writeFileSync(path.join(fixture, 'fixture.tsx'), `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { flushSync } from 'react-dom';
      import { SidebarSectionsManager } from '@/components/session/sidebar/sections/SidebarSectionsManager';
      import { editSection, useSidebarSectionsUiStore } from '@/components/session/sidebar/sections/sectionActions';
      import { EMPTY_SIDEBAR_SECTION_FILTER } from '@/lib/sidebarSections';
      import { I18nContext } from '@/lib/i18n/react-context';
      import { dict } from '@/lib/i18n/messages/en';
      import '@/index.css';

      const i18n = {
        locale: 'en', direction: 'ltr', locales: ['en'], setLocale() {}, label: locale => locale,
        t: (key, params = {}) => (dict[key] ?? key).replace(/\\{(\\w+)\\}/g, (match, name) => String(params[name] ?? match)),
      };
      function Fixture() {
        const anchor = React.useRef(null);
        const trigger = React.useRef(null);
        return <I18nContext.Provider value={i18n}>
          <aside ref={anchor} style={{ width: 240, height: 800 }}>
            <button ref={trigger}>Sections</button>
          </aside>
          <SidebarSectionsManager anchor={anchor} trigger={trigger} pages={false} />
        </I18nContext.Provider>;
      }
      const root = createRoot(document.getElementById('root'));
      flushSync(() => root.render(<Fixture />));
      window.resetSection = () => flushSync(() => editSection({
        kind: 'custom', id: 'activity-bounds', name: 'Activity bounds',
        grouping: 'time', claims: false, hideWhenEmpty: false,
        filter: {
          ...EMPTY_SIDEBAR_SECTION_FILTER, states: ['running'], work: ['in-work'], activity: 'week',
          exclude: { ...EMPTY_SIDEBAR_SECTION_FILTER, activity: 'stalled' },
        },
      }, false));
      window.sectionDraft = () => useSidebarSectionsUiStore.getState().draft;
    `);
    server = await createServer({
      configFile: false, root: fixture, logLevel: 'error',
      cacheDir: path.join(fixture, '.vite'),
      css: { postcss: repo },
      resolve: { alias: [
        { find: '@', replacement: path.join(repo, 'packages/ui/src') },
        { find: /^@openchamber\/sdk$/, replacement: path.join(repo, 'packages/sdk/src/index.ts') },
        { find: '@openchamber/sdk/schemas', replacement: path.join(repo, 'packages/sdk/src/schemas.ts') },
      ] },
      server: { host: 'localhost', port: 0, fs: { allow: [repo, fixture] } },
    });
    await server.listen();
    browser = await startBrowser({ chrome, headed: false });
    page = await browser.newPage();
    await page.client.send('Page.navigate', { url: server.resolvedUrls.local[0] });
    assert.ok(await page.poll('typeof window.resetSection === "function"', 180_000), page.consoleErrors.join('\n'));
    await page.evaluate('window.resetSection()');
    const original = await page.evaluate('window.sectionDraft()');
    const click = async (label) => {
      assert.ok(await page.click({ selector: `button[aria-label=${JSON.stringify(label)}]` }, 10_000), `Missing button: ${label}`);
    };
    const assertDraft = async (expected) => {
      assert.deepEqual(await page.evaluate('window.sectionDraft()'), expected);
    };

    await click('Remove Last 7 days');
    await assertDraft({ ...original, filter: { ...original.filter, activity: 'any' } });

    await page.evaluate('window.resetSection()');
    await click('Remove Idle 3+ days');
    await assertDraft({ ...original, filter: { ...original.filter, exclude: { ...original.filter.exclude, activity: 'any' } } });

    await page.evaluate('window.resetSection()');
    await click('Exclude Running');
    await assertDraft({
      ...original,
      filter: { ...original.filter, states: [], exclude: { ...original.filter.exclude, states: ['running'] } },
    });
    await click('Exclude Running');
    await assertDraft(original);
    assert.deepEqual(page.consoleErrors, []);
  } finally {
    try {
      await page?.dispose();
    } finally {
      try {
        await browser?.stop();
      } finally {
        try {
          await server?.close();
        } finally {
          rmSync(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        }
      }
    }
  }
});
