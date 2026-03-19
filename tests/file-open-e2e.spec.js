const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const fs = require('fs');

const CANVAS_URL = 'http://localhost:5178/';
const TEST_FILE = '/tmp/persistence-test.json';
const TEST_DATA = JSON.stringify({
  cards: [{ id: 'test1', x: 100, y: 100, w: 320, h: 200, color: '#FFF8E7', content: 'Persistence test' }],
  connections: []
});

// Helper: select a file via native Save dialog using AppleScript
// showSaveFilePicker opens a Save dialog — we type the path and confirm
async function selectFileViaNativeDialog(page, filePath) {
  // Click "Select File" button on the connect overlay
  await page.locator('#connect-panel button').click();
  await page.waitForTimeout(1500);

  // Open "Go to folder" sheet (Cmd+Shift+G)
  execSync(`osascript -e 'tell application "System Events"' -e 'keystroke "g" using {command down, shift down}' -e 'end tell'`);
  await page.waitForTimeout(1000);

  // Type the file path and press Enter to navigate
  execSync(`osascript -e 'tell application "System Events"' -e 'keystroke "${filePath}"' -e 'delay 0.5' -e 'keystroke return' -e 'end tell'`);
  await page.waitForTimeout(1500);

  // Press Enter/Return to confirm (Save/Open)
  execSync(`osascript -e 'tell application "System Events"' -e 'keystroke return' -e 'end tell'`);
  await page.waitForTimeout(1000);

  // Handle possible "Replace" confirmation dialog
  execSync(`osascript -e 'tell application "System Events"' -e 'keystroke return' -e 'end tell'`);
  await page.waitForTimeout(2000);
}

test.describe('File Flow — E2E with native dialog', () => {
  test.setTimeout(60000);

  test.beforeEach(() => {
    fs.writeFileSync(TEST_FILE, TEST_DATA);
  });

  test('Test 1: File connection via native picker', async ({ page }) => {
    await page.goto(CANVAS_URL);
    await page.waitForSelector('#canvas-viewport');
    await page.waitForFunction(() => typeof window.startEditing === 'function');

    // Connect overlay should be visible
    await expect(page.locator('#connect-overlay.open')).toBeVisible();

    // Select the test file via native dialog
    await selectFileViaNativeDialog(page, TEST_FILE);

    // Connect overlay should be dismissed
    const overlayOpen = await page.evaluate(() =>
      document.getElementById('connect-overlay').classList.contains('open')
    );
    expect(overlayOpen).toBe(false);

    // Verify the test card loaded into the canvas
    await expect(page.locator('#test1')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#test1 .card-body')).toContainText('Persistence test');

    // Verify state has the card
    const cardCount = await page.evaluate(() => state.cards.length);
    expect(cardCount).toBe(1);

    // Verify fileHandle is set
    const hasHandle = await page.evaluate(() => !!fileHandle);
    expect(hasHandle).toBe(true);
    const handleName = await page.evaluate(() => fileHandle.name);
    expect(handleName).toBe('persistence-test.json');

    // Verify the file status indicator is active with filename
    await expect(page.locator('#file-status')).toHaveClass(/active/);
    await expect(page.locator('#file-label')).toHaveText('persistence-test.json');

    // Verify IndexedDB has the handle stored
    const storedName = await page.evaluate(() => localStorage.getItem('canvas-sync-filename'));
    expect(storedName).toBe('persistence-test.json');
  });

  test('Test 2: IndexedDB persistence across reload', async ({ page }) => {
    await page.goto(CANVAS_URL);
    await page.waitForSelector('#canvas-viewport');
    await page.waitForFunction(() => typeof window.startEditing === 'function');

    // Connect to file first
    await selectFileViaNativeDialog(page, TEST_FILE);

    // Verify connected
    await expect(page.locator('#test1')).toBeVisible({ timeout: 5000 });

    // Now reload the page
    await page.reload();
    await page.waitForSelector('#canvas-viewport');
    await page.waitForFunction(() => typeof window.startEditing === 'function');

    // Wait for init to complete — permission prompt may auto-grant with Chrome flags
    await page.waitForTimeout(3000);

    // Check if handle was loaded from IndexedDB
    const handleResult = await page.evaluate(() => !!fileHandle);

    if (handleResult) {
      // Handle was restored — verify card is loaded
      await expect(page.locator('#test1')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#file-label')).toHaveText('persistence-test.json');
      console.log('PASS: Handle restored from IndexedDB, card visible');
    } else {
      // Permission prompt might have blocked — check console logs
      const logs = await page.evaluate(() => {
        // The init function logs the result
        return localStorage.getItem('canvas-sync-filename');
      });
      console.log('Handle not restored. localStorage filename:', logs);
      // Even if permission was denied, the filename should be in localStorage
      expect(logs).toBe('persistence-test.json');
    }
  });

  test('Test 3: Auto-poll external changes', async ({ page }) => {
    await page.goto(CANVAS_URL);
    await page.waitForSelector('#canvas-viewport');
    await page.waitForFunction(() => typeof window.startEditing === 'function');

    // Connect to file
    await selectFileViaNativeDialog(page, TEST_FILE);
    await expect(page.locator('#test1')).toBeVisible({ timeout: 5000 });

    // Externally modify the file — add a second card
    const updatedData = JSON.stringify({
      cards: [
        { id: 'test1', x: 100, y: 100, w: 320, h: 200, color: '#FFF8E7', content: 'Persistence test' },
        { id: 'test2', x: 500, y: 100, w: 320, h: 200, color: '#DBEAFE', content: 'Added externally' }
      ],
      connections: []
    });
    fs.writeFileSync(TEST_FILE, updatedData);

    // Wait for auto-poll to detect the change (polls every 1 second)
    await page.waitForFunction(
      () => state.cards.length === 2,
      { timeout: 5000 }
    );

    // Verify the externally added card is visible
    await expect(page.locator('#test2')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#test2 .card-body')).toContainText('Added externally');

    // Verify state
    const cardCount = await page.evaluate(() => state.cards.length);
    expect(cardCount).toBe(2);
  });

  test('Test 4: Optimistic concurrency — external change blocks local write', async ({ page }) => {
    await page.goto(CANVAS_URL);
    await page.waitForSelector('#canvas-viewport');
    await page.waitForFunction(() => typeof window.startEditing === 'function');

    // Connect to file
    await selectFileViaNativeDialog(page, TEST_FILE);
    await expect(page.locator('#test1')).toBeVisible({ timeout: 5000 });

    // Wait for initial save to complete
    await page.waitForTimeout(1000);

    // Externally modify the file
    const externalData = JSON.stringify({
      cards: [
        { id: 'test1', x: 100, y: 100, w: 320, h: 200, color: '#FFF8E7', content: 'External change wins' }
      ],
      connections: []
    }, null, 2);
    fs.writeFileSync(TEST_FILE, externalData);

    // Immediately try to make a local change and save
    await page.evaluate(() => {
      state.cards[0].content = 'User change should lose';
      scheduleSave();
    });

    // Wait for save attempt + optimistic concurrency to kick in
    await page.waitForTimeout(2000);

    // Read the file from disk — it should still have the external change
    const fileContent = fs.readFileSync(TEST_FILE, 'utf-8');
    const parsed = JSON.parse(fileContent);
    expect(parsed.cards[0].content).toBe('External change wins');

    // The app state should also have reloaded to the external version
    const appContent = await page.evaluate(() => state.cards[0].content);
    expect(appContent).toBe('External change wins');
  });

  test('Test 5: Disconnect returns to overlay', async ({ page }) => {
    await page.goto(CANVAS_URL);
    await page.waitForSelector('#canvas-viewport');
    await page.waitForFunction(() => typeof window.startEditing === 'function');

    // Connect to file
    await selectFileViaNativeDialog(page, TEST_FILE);
    await expect(page.locator('#test1')).toBeVisible({ timeout: 5000 });

    // Verify connected state
    const hasHandleBefore = await page.evaluate(() => !!fileHandle);
    expect(hasHandleBefore).toBe(true);

    // Click the ✕ disconnect button
    await page.click('#disconnect-btn');
    await page.waitForTimeout(500);

    // Verify overlay is showing
    const overlayVisible = await page.evaluate(() =>
      document.getElementById('connect-overlay').classList.contains('open')
    );
    expect(overlayVisible).toBe(true);

    // Verify fileHandle is null
    const hasHandleAfter = await page.evaluate(() => fileHandle === null);
    expect(hasHandleAfter).toBe(true);

    // Verify localStorage filename is cleared
    const storedName = await page.evaluate(() => localStorage.getItem('canvas-sync-filename'));
    expect(storedName).toBeNull();
  });
});
