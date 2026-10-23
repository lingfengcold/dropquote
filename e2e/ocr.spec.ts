import { expect, test, type Page, type Route } from '@playwright/test';

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
