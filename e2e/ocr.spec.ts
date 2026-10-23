import { expect, test, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// OCR itself is local, but a clean browser needs to download Tesseract's engine/language
// data. Keep the real-engine acceptance check opt-in so CI does not depend on a CDN.
test.use({ proxy: process.env.OCR_PROXY ? { server: process.env.OCR_PROXY, bypass: '127.0.0.1,localhost' } : undefined });
test.beforeEach(async ({ page }) => {
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
});

async function openImporter(page: Page, darkLowercase = false) {
  await page.goto(process.env.OCR_BASE_URL ?? './');
  await page.getByRole('spinbutton', { name: 'Rows', exact: true }).fill('3');
  await page.getByRole('spinbutton', { name: 'Columns', exact: true }).fill('3');
  await page.getByRole('button', { name: 'Enter letters', exact: true }).click();
  await page.getByRole('button', { name: 'Read image', exact: true }).click();
  const image = await page.evaluate(dark => {
    const canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 360;
    const context = canvas.getContext('2d')!;
    context.fillStyle = dark ? '#000' : '#fff'; context.fillRect(0, 0, 600, 360);
    if (dark) {
      context.strokeStyle = '#fff'; context.lineWidth = 4;
      context.strokeRect(2, 2, 596, 356);
      context.strokeStyle = '#35383c'; context.lineWidth = 1;
      for (const x of [200, 400]) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, 360); context.stroke(); }
      for (const y of [120, 240]) { context.beginPath(); context.moveTo(0, y); context.lineTo(600, y); context.stroke(); }
    }
    context.fillStyle = dark ? '#fff' : '#000'; context.font = 'bold 64px Arial';
    context.textAlign = 'center'; context.textBaseline = 'middle';
    // Interior and trailing blanks are deliberate: the expected columns are AD, EG, CF.
    for (const [letter, col, row] of [['A', 0, 0], ['C', 2, 0], ['D', 0, 1], ['E', 1, 1], ['F', 2, 1], ['G', 1, 2]] as const) {
      context.fillText(dark ? letter.toLowerCase() : letter, col * 200 + 100, row * 100 + 70);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, darkLowercase);
  await page.getByLabel('Upload puzzle image').setInputFiles({ name: 'unequal-column-heights.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await expect(page.getByAltText('Puzzle preview: unequal-column-heights.png')).toBeVisible();
}

test('cancel and close stop OCR even while the engine download is stalled', async ({ page, context }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await openImporter(page);
  const initialWorkers = page.workers().length;
  const stalled: Route[] = [];
  await context.route('https://cdn.jsdelivr.net/**', route => { stalled.push(route); });
  await page.getByRole('button', { name: 'Recognize letters', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel recognition', exact: true })).toBeVisible();
  await expect.poll(() => stalled.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Cancel recognition', exact: true }).click();
  await expect(page.getByText('Recognition cancelled.', { exact: false })).toBeVisible();
  await expect.poll(() => page.workers().length, { timeout: 5000 }).toBeLessThanOrEqual(initialWorkers);
  await page.getByRole('button', { name: 'Recognize letters', exact: true }).click();
  await expect.poll(() => stalled.length).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Close image importer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => page.workers().length, { timeout: 5000 }).toBeLessThanOrEqual(initialWorkers);
  for (const route of stalled) await route.abort().catch(() => undefined);
  expect(pageErrors).toEqual([]);
});

test('real OCR reads lowercase white letters on black despite a bright frame', async ({ page }) => {
  test.skip(process.env.RUN_OCR_E2E !== '1', 'Set RUN_OCR_E2E=1 to exercise the real OCR engine.');
  test.setTimeout(180000);
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await openImporter(page, true);
  await expect(page.getByLabel('Remove long grid lines')).toBeChecked();
  await page.getByRole('button', { name: 'Recognize letters', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review and edit columns' })).toBeVisible({ timeout: 150000 });
  for (const [index, text] of ['AD', 'EG', 'CF'].entries()) {
    await expect(page.getByLabel(`Letters in column ${index + 1}`, { exact: true })).toHaveValue(text);
  }
  expect(pageErrors).toEqual([]);
});

test('real OCR separates I and L and keeps every question mark in the supplied uppercase bank', async ({ page }) => {
  test.skip(process.env.RUN_OCR_E2E !== '1', 'Set RUN_OCR_E2E=1 to exercise the real OCR engine.');
  test.setTimeout(180000);
  const fixture = JSON.parse(readFileSync(new URL('../tests/fixtures/uppercase-il-bank.json', import.meta.url), 'utf8')) as { rows: number; cols: number; columns: string[] };
  await page.goto(process.env.OCR_BASE_URL ?? './');
  await page.getByRole('spinbutton', { name: 'Rows', exact: true }).fill(String(fixture.rows));
  await page.getByRole('spinbutton', { name: 'Columns', exact: true }).fill(String(fixture.cols));
  await page.getByRole('button', { name: 'Enter letters', exact: true }).click();
  await page.getByRole('button', { name: 'Read image', exact: true }).click();
  await page.getByLabel('Upload puzzle image').setInputFiles(fileURLToPath(new URL('../tests/fixtures/uppercase-il-bank.png', import.meta.url)));
  await expect(page.getByLabel('Letter case')).toHaveValue('auto');
  await page.getByRole('button', { name: 'Recognize letters', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review and edit columns' })).toBeVisible({ timeout: 150000 });
  const actual = await page.getByRole('textbox', { name: /^Letters in column \d+$/ }).evaluateAll(elements => elements.map(element => (element as HTMLTextAreaElement).value));
  expect(actual).toEqual(fixture.columns);
  expect(actual[0]).toBe('EGGIISTW');
  await page.screenshot({ path: 'test-results/uppercase-il-ocr.png', fullPage: true });
});

test('real OCR keeps lowercase l and distinguishes serif uppercase I from L', async ({ page }) => {
  test.skip(process.env.RUN_OCR_E2E !== '1', 'Set RUN_OCR_E2E=1 to exercise the real OCR engine.');
  test.setTimeout(240000);
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await openImporter(page);
  for (const sample of [
    { name: 'uppercase-serif.png', font: '64px "Times New Roman"', rows: ['AED', 'ILI', 'HTR'], columns: ['AIH', 'ELT', 'DIR'] },
  ]) {
    const image = await page.evaluate(({ font, rows }) => {
      const canvas = document.createElement('canvas');
      canvas.width = 600; canvas.height = 360;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = '#999'; context.lineWidth = 1;
      for (const x of [0.5, 200.5, 400.5, 599.5]) {
        context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke();
      }
      for (const y of [0.5, 120.5, 240.5, 359.5]) {
        context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke();
      }
      context.fillStyle = '#000'; context.font = font;
      context.textAlign = 'center'; context.textBaseline = 'middle';
      rows.forEach((row, rowIndex) => [...row].forEach((letter, columnIndex) => {
        context.fillText(letter, columnIndex * 200 + 100, rowIndex * 120 + 60);
      }));
      return canvas.toDataURL('image/png').split(',')[1];
    }, sample);
    await page.getByLabel('Upload puzzle image').setInputFiles({ name: sample.name, mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
    await expect(page.getByAltText(`Puzzle preview: ${sample.name}`)).toBeVisible();
    await expect(page.getByLabel('Letter case')).toHaveValue('auto');
    await page.getByRole('button', { name: 'Recognize letters', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Review and edit columns' })).toBeVisible({ timeout: 150000 });
    const actual = await page.getByRole('textbox', { name: /^Letters in column \d+$/ }).evaluateAll(elements => elements.map(element => (element as HTMLTextAreaElement).value));
    expect.soft(actual, sample.name).toEqual(sample.columns);
  }
  // The user's earlier lowercase screenshot contains genuine l glyphs in columns 4/5.
  // Keep those as L while correcting visually identical strokes in uppercase banks.
  await page.getByRole('button', { name: 'Close image importer' }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  const fixture = JSON.parse(readFileSync(new URL('../tests/fixtures/senses-word-list.json', import.meta.url), 'utf8')) as { rows: number; cols: number; columnLetters: string[][] };
  await page.getByRole('spinbutton', { name: 'Rows', exact: true }).fill(String(fixture.rows));
  await page.getByRole('spinbutton', { name: 'Columns', exact: true }).fill(String(fixture.cols));
  await page.getByRole('button', { name: 'Enter letters', exact: true }).click();
  await page.getByRole('button', { name: 'Read image', exact: true }).click();
  await page.getByLabel('Upload puzzle image').setInputFiles(fileURLToPath(new URL('../tests/fixtures/lowercase-bank.png', import.meta.url)));
  await page.getByLabel('Crop top percent').fill('56.7');
  await expect(page.getByLabel('Letter case')).toHaveValue('auto');
  await page.getByRole('button', { name: 'Recognize letters', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review and edit columns' })).toBeVisible({ timeout: 150000 });
  const lowercaseColumns = await page.getByRole('textbox', { name: /^Letters in column \d+$/ }).evaluateAll(elements => elements.map(element => (element as HTMLTextAreaElement).value));
  expect(lowercaseColumns).toEqual(fixture.columnLetters.map(column => column.join('')));
  expect(lowercaseColumns[3]).toBe('LUHRA');
  expect(lowercaseColumns[4]).toBe('LEIACFR');
  expect(pageErrors).toEqual([]);
});

test('real OCR preserves unequal columns, allows review, and imports only on Apply', async ({ page }) => {
  test.skip(process.env.RUN_OCR_E2E !== '1', 'Set RUN_OCR_E2E=1 to download and exercise the real OCR engine.');
  test.setTimeout(180000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await openImporter(page);
  await page.getByRole('button', { name: 'Recognize letters', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review and edit columns' })).toBeVisible({ timeout: 150000 });
  for (const [index, text] of ['AD', 'EG', 'CF'].entries()) {
    await expect(page.getByLabel(`Letters in column ${index + 1}`, { exact: true })).toHaveValue(text);
    await expect(page.getByLabel(`Column ${index + 1} letters`, { exact: true })).toHaveValue('');
  }
  // The alternate full-area mode uses true bounding boxes after a nonzero crop origin.
  await page.getByLabel('Crop left percent').fill('1');
  await page.getByLabel('Crop right percent').fill('99');
  await page.getByLabel('Crop top percent').fill('5');
  await page.getByLabel('Crop bottom percent').fill('95');
  await page.getByLabel('Recognition mode').selectOption('grid');
  await page.getByRole('button', { name: 'Recognize letters', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review and edit columns' })).toBeVisible({ timeout: 150000 });
  for (const [index, text] of ['AD', 'EG', 'CF'].entries()) {
    await expect(page.getByLabel(`Letters in column ${index + 1}`, { exact: true })).toHaveValue(text);
  }
  // The modal enforces the answer-grid height and retains the OCR review for correction.
  await page.getByLabel('Letters in column 1', { exact: true }).fill('AD??');
  await expect(page.getByRole('button', { name: 'Apply 8 letters', exact: true })).toBeDisabled();
  await expect(page.getByText('Columns 1 exceed the 3 answer rows.', { exact: false })).toBeVisible();
  await page.getByLabel('Letters in column 1', { exact: true }).fill('A?');
  await page.screenshot({ path: 'test-results/ocr-review.png', fullPage: true });
  await page.getByRole('button', { name: 'Apply 6 letters', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const [index, text] of ['A?', 'EG', 'CF'].entries()) {
    await expect(page.getByLabel(`Column ${index + 1} letters`, { exact: true })).toHaveValue(text);
  }
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
