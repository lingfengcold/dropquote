import { test, expect, type Page } from '@playwright/test';
import { createPuzzle, puzzleFromText, EXAMPLE_TEXT, DRAFT_KEY } from '../src/lib/puzzle';
import type { Puzzle } from '../src/lib/puzzle';
import { readFileSync } from 'node:fs';

async function ready(page: Page) {
  await page.goto('./');
  await expect(page.getByText(/words · local dictionary/)).toBeVisible();
}
async function importPuzzle(page: Page, puzzle: Puzzle) {
  await page.getByLabel('Import puzzle JSON').setInputFiles({ name: 'puzzle.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(puzzle)) });
  await expect(page.getByRole('heading', { name: 'Set the shape of the quote' })).toBeVisible();
}

test('production worker solves with only local assets and keeps the intended quote first', async ({ page }) => {
  const pageErrors: string[] = [];
  const externalRequests: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/') && !request.url().startsWith('data:')) externalRequests.push(request.url()); });
  await ready(page);
  await page.getByRole('button', { name: 'Try an example' }).click();
  await page.getByRole('button', { name: 'Find quotes' }).click();
  await expect(page.getByText('Search completed for this dictionary and these constraints.')).toBeVisible({ timeout: 20000 });
  const first = page.getByRole('button', { name: /#1 Score/ });
  await expect(first).toContainText(EXAMPLE_TEXT);
  await expect(page.getByRole('heading', { name: 'Candidate #1' })).toBeVisible();
  expect(externalRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: 'test-results/example-results.png', fullPage: true });
});

test('missing letters are filled only in their own column and reported in results', async ({ page }) => {
  await ready(page);
  const puzzle = puzzleFromText('THE', 3);
  puzzle.columnLetters[1] = [];
  await importPuzzle(page, puzzle);
  await expect(page.getByRole('button', { name: 'Find quotes' })).toBeDisabled();
  await page.getByRole('button', { name: 'Fill 1 missing letters with ?' }).click();
  await expect(page.getByRole('button', { name: 'Find quotes' })).toBeEnabled();
  await page.getByRole('button', { name: 'Find quotes' }).click();
  await expect(page.getByRole('heading', { name: 'Letters supplied for ?' })).toBeVisible();
  await expect(page.getByText('Column 2:')).toContainText('H');
  await expect(page.getByRole('button', { name: /#1 Score/ })).toContainText('THE');
});

test('the supplied themed word-list puzzle solves without injecting answer words', async ({ page }) => {
  await ready(page);
  const puzzle = JSON.parse(readFileSync(new URL('../tests/fixtures/senses-word-list.json', import.meta.url), 'utf8')) as Puzzle;
  await importPuzzle(page, puzzle);
  await page.getByLabel('Search time').selectOption('5');
  await page.getByLabel('Allow joined words').check();
  await page.getByRole('button', { name: 'Find quotes' }).click();
  const reference = page.getByRole('button').filter({ hasText: 'ODORLESS WATCHTOWER EARSHOT HEARSAY FORESIGHT NOSECLIP TASTEABLE TOUCHDOWN EARRING HANDCRAFT NOSEGUARD' });
  await expect(reference).toBeVisible({ timeout: 20000 });
  await reference.click();
  await expect(page.getByText('Joined word candidates to review:')).toContainText('NOSECLIP');
  await page.screenshot({ path: 'test-results/senses-word-list.png', fullPage: true });
  // The pool also permits ROSECLIP/EARNING. One genuine known letter can resolve
  // that ambiguity without altering frequency ranks or injecting whole answers.
  await page.getByRole('button', { name: 'Adjust puzzle' }).click();
  await page.getByRole('button', { name: 'Known letters' }).click();
  await page.getByRole('textbox', { name: 'Known letter row 3 column 15' }).fill('N');
  await expect(page.getByLabel('Allow joined words')).toBeChecked();
  await page.getByRole('button', { name: 'Find quotes' }).click();
  await expect(page.getByRole('button', { name: /#1 Score/ })).toContainText('ODORLESS WATCHTOWER EARSHOT HEARSAY FORESIGHT NOSECLIP TASTEABLE TOUCHDOWN EARRING HANDCRAFT NOSEGUARD', { timeout: 20000 });
});

test('a large ambiguous search stays responsive and can be immediately cancelled', async ({ page }) => {
  await ready(page);
  const puzzle = puzzleFromText((EXAMPLE_TEXT + ' ').repeat(25), 30);
  puzzle.columnLetters = puzzle.columnLetters.map(col => col.map(() => '?'));
  await importPuzzle(page, puzzle);
  await page.getByRole('button', { name: 'Find quotes' }).click();
  const cancel = page.getByRole('button', { name: 'Cancel search' });
  await expect(cancel).toBeVisible();
  const ticks = await page.evaluate(async () => {
    let ticks = 0;
    const id = setInterval(() => ticks++, 25);
    await new Promise(resolve => setTimeout(resolve, 250));
    clearInterval(id);
    return ticks;
  });
  expect(ticks).toBeGreaterThanOrEqual(5);
  const start = Date.now();
  await cancel.click();
  await expect(page.getByRole('heading', { name: 'Set the shape of the quote' })).toBeVisible();
  expect(Date.now() - start).toBeLessThan(3000);
  await expect(page.getByText('Search cancelled. You can edit the puzzle and start again.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find quotes' })).toBeEnabled();
});

test('known letters, puzzle downloads and saved drafts survive editing', async ({ page }) => {
  await ready(page);
  await importPuzzle(page, puzzleFromText('THE', 3));
  await page.getByRole('button', { name: 'Known letters' }).click();
  await page.getByRole('textbox', { name: 'Known letter row 1 column 2' }).fill('H');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').fixedLetters?.[0]?.[1], DRAFT_KEY)).toBe('H');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save puzzle' }).click();
  expect((await download).suggestedFilename()).toBe('dropquote-puzzle.json');
  await page.reload();
  await page.getByRole('button', { name: 'Continue saved puzzle (1 × 3)' }).click();
  await page.getByRole('button', { name: 'Known letters' }).click();
  await expect(page.getByRole('textbox', { name: 'Known letter row 1 column 2' })).toHaveValue('H');
});

test('search settings survive column editing and punctuation in extra names is normalized', async ({ page }) => {
  await ready(page);
  await importPuzzle(page, puzzleFromText('ZORBLAX', 7));
  await page.getByLabel('Search time').selectOption('15');
  await page.getByLabel('Search effort').selectOption('100000');
  await page.getByLabel('Extra words / names').fill("ZOR'BLAX");
  await page.getByRole('button', { name: 'Edit column letters' }).click();
  await page.getByRole('button', { name: 'Set black squares' }).click();
  await expect(page.getByLabel('Search time')).toHaveValue('15');
  await expect(page.getByLabel('Search effort')).toHaveValue('100000');
  await expect(page.getByLabel('Extra words / names')).toHaveValue("ZOR'BLAX");
  await page.getByRole('button', { name: 'Find quotes' }).click();
  await expect(page.getByRole('button', { name: /#1 Score/ })).toContainText('ZORBLAX');
});

test('invalid imports and invalid grid sizes give actionable errors', async ({ page }) => {
  await ready(page);
  await page.getByLabel('Import puzzle JSON').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...createPuzzle(2, 2), rows: 100000 })) });
  await expect(page.getByText(/at most 5,000 cells/)).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Rows' }).fill('0');
  await page.getByRole('button', { name: 'Enter letters' }).click();
  await expect(page.getByRole('heading', { name: 'Drop the letters. Find the quote.' })).toBeVisible();
});

test('mobile results do not create page-wide horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByRole('button', { name: 'Try an example' }).click();
  await page.getByRole('button', { name: 'Find quotes' }).click();
  await expect(page.getByRole('heading', { name: 'Candidate #1' })).toBeVisible({ timeout: 20000 });
  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  await page.screenshot({ path: 'test-results/mobile-results.png', fullPage: true });
});
