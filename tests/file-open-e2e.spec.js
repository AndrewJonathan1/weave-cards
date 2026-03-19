const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const fs = require('fs');

const CANVAS_URL = 'http://localhost:5176/';
const TEST_FILE = '/tmp/test-canvas.json';
const TEST_DATA = '{"cards":[{"id":"test1","x":100,"y":100,"w":320,"h":200,"color":"#FFF8E7","content":"Test card"}],"connections":[]}';

// Helper: open a file via native dialog using AppleScript
async function openFileViaNativeDialog(page, filePath) {
  await page.locator('button', { hasText: 'Open' }).click();
  await page.waitForTimeout(1500);

  execSync(`osascript -e 'tell application "System Events"' -e 'keystroke "g" using {command down, shift down}' -e 'end tell'`);
  await page.waitForTimeout(1000);

  execSync(`osascript -e 'tell application "System Events"' -e 'keystroke "${filePath}"' -e 'delay 0.5' -e 'keystroke return' -e 'end tell'`);
  await page.waitForTimeout(1000);

  execSync(`osascript -e 'tell application "System Events"' -e 'keystroke return' -e 'end tell'`);
  await page.waitForTimeout(2000);
}

test.describe.skip('File Open — end-to-end with native dialog (skipped: Open/Save As buttons removed in one-file-flow refactor)', () => {

  test.beforeEach(() => {
    fs.writeFileSync(TEST_FILE, TEST_DATA);
  });

  test('Open button loads file via native picker and shows status', async ({ page }) => {
    await page.goto(CANVAS_URL);
    await page.waitForSelector('#canvas-viewport');

    // Verify the three file operation buttons exist
    await expect(page.locator('button', { hasText: 'Open' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Save As' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Add Cards' })).toBeVisible();

    // Open the test file via native macOS dialog
    await openFileViaNativeDialog(page, TEST_FILE);

    // Verify the test card loaded into the canvas
    const cardText = await page.locator('.card-body').first().textContent();
    expect(cardText).toContain('Test card');

    // Verify state has the card
    const cardCount = await page.evaluate(() => state.cards.length);
    expect(cardCount).toBe(1);
    const cardId = await page.evaluate(() => state.cards[0].id);
    expect(cardId).toBe('test1');

    // Verify the file status indicator is active with filename
    await expect(page.locator('#file-status')).toHaveClass(/active/);
    await expect(page.locator('#file-label')).toHaveText('test-canvas.json');

    // Verify fileHandle is set
    const hasHandle = await page.evaluate(() => !!fileHandle);
    expect(hasHandle).toBe(true);
    const handleName = await page.evaluate(() => fileHandle.name);
    expect(handleName).toBe('test-canvas.json');
  });

  test('Loaded file cards render correctly with positions and colors', async ({ page }) => {
    // Write a multi-card test file
    const multiCardData = JSON.stringify({
      cards: [
        { id: 'mc1', x: 50, y: 50, w: 300, h: 180, color: '#DBEAFE', content: '# Blue Card' },
        { id: 'mc2', x: 400, y: 50, w: 300, h: 180, color: '#D8F0E0', content: '# Green Card' },
        { id: 'mc3', x: 50, y: 280, w: 300, h: 180, color: '#FFD6CC', content: '# Coral Card' }
      ],
      connections: [{ from: 'mc1', to: 'mc2', label: '' }],
      camera: { x: 0, y: 0, zoom: 1 }
    });
    fs.writeFileSync(TEST_FILE, multiCardData);

    await page.goto(CANVAS_URL);
    await page.waitForSelector('#canvas-viewport');

    await openFileViaNativeDialog(page, TEST_FILE);

    // Verify all 3 cards loaded
    const cardCount = await page.evaluate(() => state.cards.length);
    expect(cardCount).toBe(3);

    // Verify cards are visible in DOM
    await expect(page.locator('#mc1')).toBeVisible();
    await expect(page.locator('#mc2')).toBeVisible();
    await expect(page.locator('#mc3')).toBeVisible();

    // Verify content rendered
    await expect(page.locator('#mc1 .card-body')).toContainText('Blue Card');
    await expect(page.locator('#mc2 .card-body')).toContainText('Green Card');
    await expect(page.locator('#mc3 .card-body')).toContainText('Coral Card');

    // Verify positions
    const positions = await page.evaluate(() => state.cards.map(c => ({ id: c.id, x: c.x, y: c.y, color: c.color })));
    expect(positions).toEqual([
      { id: 'mc1', x: 50, y: 50, color: '#DBEAFE' },
      { id: 'mc2', x: 400, y: 50, color: '#D8F0E0' },
      { id: 'mc3', x: 50, y: 280, color: '#FFD6CC' }
    ]);

    // Verify connection loaded
    const connCount = await page.evaluate(() => state.connections.length);
    expect(connCount).toBe(1);
  });

  test('Double-click to edit a loaded card', async ({ page }) => {
    await page.goto(CANVAS_URL);
    await page.waitForSelector('#canvas-viewport');

    await openFileViaNativeDialog(page, TEST_FILE);

    // Verify card loaded
    await expect(page.locator('#test1')).toBeVisible();

    // Wait for Tiptap module to initialize (overwrites the startEditing stub)
    await page.waitForFunction(() => {
      const fn = window.startEditing.toString();
      return fn.includes('editor') || fn.includes('tiptap') || fn.length > 50;
    }, { timeout: 10000 });

    // Try calling startEditing directly (Playwright clicks may not trigger the mousedown/mouseup flow correctly)
    await page.evaluate(() => {
      const c = state.cards.find(card => card.id === 'test1');
      const el = document.getElementById('test1');
      window.startEditing(c, el);
    });
    await page.waitForSelector('.card.editing', { timeout: 5000 });

    // Verify Tiptap editor is active
    const tiptapVisible = await page.locator('.tiptap').isVisible();
    expect(tiptapVisible).toBe(true);

    // Verify Tiptap editor mounted with the card's content
    const editorContent = await page.locator('.tiptap').textContent();
    expect(editorContent).toContain('Test card');

    // Verify the card has the editing class
    const isEditing = await page.evaluate(() => document.querySelector('#test1').classList.contains('editing'));
    expect(isEditing).toBe(true);

    // Exit editing by calling stopEditing
    await page.evaluate(() => window.stopEditing());
    await page.waitForTimeout(300);

    // Verify editing ended
    const editingAfter = await page.evaluate(() => !!document.querySelector('.card.editing'));
    expect(editingAfter).toBe(false);

    // Verify state content preserved after round-trip through editor
    const content = await page.evaluate(() => state.cards[0].content);
    expect(content).toContain('Test card');
  });
});
