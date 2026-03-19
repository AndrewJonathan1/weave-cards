const { test, expect } = require('@playwright/test');
const path = require('path');

const CANVAS_URL = `file://${path.resolve(__dirname, '..', 'canvas.html')}`;

// Helper: wait for the app to be ready
async function waitForApp(page) {
  await page.goto(CANVAS_URL);
  await page.waitForSelector('#canvas-viewport');
  await page.waitForFunction(() => typeof window.startEditing === 'function');
}

// Helper: create a card by double-clicking empty canvas area
async function createCard(page, x = 640, y = 400) {
  await page.dblclick('#canvas-viewport', { position: { x, y } });
  await page.waitForSelector('.card.editing');
}

// Helper: click away from card to stop editing
async function clickAway(page) {
  await page.click('#canvas-viewport', { position: { x: 10, y: 700 } });
  await page.waitForTimeout(200);
}

test.describe('Card Canvas - Basic Operations', () => {
  test('should load the canvas app', async ({ page }) => {
    await waitForApp(page);
    await expect(page.locator('#canvas-viewport')).toBeVisible();
    await expect(page.locator('#toolbar')).toBeVisible();
  });

  test('should create a card on double-click', async ({ page }) => {
    await waitForApp(page);
    const cardsBefore = await page.locator('.card').count();
    await createCard(page);
    const cardsAfter = await page.locator('.card').count();
    expect(cardsAfter).toBe(cardsBefore + 1);
  });

  test('should enter editing mode when card body is clicked', async ({ page }) => {
    await waitForApp(page);
    await createCard(page);
    const editingCard = page.locator('.card.editing');
    await expect(editingCard).toBeVisible();
    await expect(editingCard.locator('.tiptap')).toBeVisible();
  });

  test('should type content into a card', async ({ page }) => {
    await waitForApp(page);
    await createCard(page);
    const tiptap = page.locator('.tiptap');
    await tiptap.click();
    await page.keyboard.type('Hello World');
    await expect(tiptap).toContainText('Hello World');
  });

  test('should save content when clicking away', async ({ page }) => {
    await waitForApp(page);
    await createCard(page);
    const tiptap = page.locator('.tiptap');
    await tiptap.click();
    await page.keyboard.type('Test content saved');
    await clickAway(page);
    await expect(page.locator('.card.editing')).toHaveCount(0);
    const cardBody = page.locator('.card-body').first();
    await expect(cardBody).toContainText('Test content saved');
  });

  test('should re-edit a card on click', async ({ page }) => {
    await waitForApp(page);
    await createCard(page);
    const tiptap = page.locator('.tiptap');
    await tiptap.click();
    await page.keyboard.type('Original text');
    await clickAway(page);

    const cardBody = page.locator('.card-body').first();
    await cardBody.click();
    await page.waitForSelector('.card.editing');
    const editor = page.locator('.tiptap');
    await expect(editor).toContainText('Original text');
  });

  test('should delete a card via the X button', async ({ page }) => {
    await waitForApp(page);
    await createCard(page);
    await clickAway(page);

    const cardsCount = await page.locator('.card').count();
    const card = page.locator('.card').first();
    await card.hover();
    const delBtn = card.locator('.card-delete');
    await delBtn.click();
    await expect(page.locator('.card')).toHaveCount(cardsCount - 1);
  });
});

test.describe('Card Canvas - File Sync', () => {
  test('should track state correctly for file sync', async ({ page }) => {
    await waitForApp(page);

    await createCard(page);
    const tiptap = page.locator('.tiptap');
    await tiptap.click();
    await page.keyboard.type('# Sync Test Card');
    await clickAway(page);

    // state is now a var (global), accessible via window
    const cardContent = await page.evaluate(() => {
      const cards = state.cards;
      if (!cards || cards.length === 0) return null;
      return cards[cards.length - 1].content;
    });
    expect(cardContent).toBeTruthy();
    expect(cardContent).toContain('Sync Test Card');
  });

  test('should write state to file via mocked File System Access API', async ({ page }) => {
    await waitForApp(page);

    await createCard(page);
    const tiptap = page.locator('.tiptap');
    await tiptap.click();
    await page.keyboard.type('File sync test content');
    await clickAway(page);

    // Mock the File System Access API with proper async methods
    const savedData = await page.evaluate(async () => {
      let writtenData = '';
      const mockWritable = {
        write: async (data) => { writtenData = data; },
        close: async () => {},
      };
      const mockHandle = {
        name: 'test-canvas.json',
        getFile: async () => new File(['{}'], 'test-canvas.json', { type: 'application/json' }),
        createWritable: async () => mockWritable,
      };

      fileHandle = mockHandle;
      await writeToFile();
      return writtenData;
    });

    const parsed = JSON.parse(savedData);
    expect(parsed.cards).toBeDefined();
    expect(parsed.cards.length).toBeGreaterThan(0);
    const lastCard = parsed.cards[parsed.cards.length - 1];
    expect(lastCard.content).toContain('File sync test content');
  });

  test('should autosave after editing with mocked file handle', async ({ page }) => {
    await waitForApp(page);

    // Set up mock file handle
    await page.evaluate(() => {
      window._savedContent = [];
      const mockWritable = {
        write: async (data) => { window._savedContent.push(data); },
        close: async () => {},
      };
      fileHandle = {
        name: 'test-autosave.json',
        getFile: async () => new File(['{}'], 'test-autosave.json'),
        createWritable: async () => mockWritable,
      };
    });

    // Create and edit a card
    await createCard(page);
    const tiptap = page.locator('.tiptap');
    await tiptap.click();
    await page.keyboard.type('Initial content');
    await clickAway(page);

    // Wait for autosave (500ms debounce + extra)
    await page.waitForTimeout(1000);

    const saveCount1 = await page.evaluate(() => window._savedContent.length);
    expect(saveCount1).toBeGreaterThan(0);

    const lastSave1 = await page.evaluate(() => window._savedContent[window._savedContent.length - 1]);
    const data1 = JSON.parse(lastSave1);
    expect(data1.cards[data1.cards.length - 1].content).toContain('Initial content');

    // Edit the card again
    const cardBody = page.locator('.card-body').first();
    await cardBody.click();
    await page.waitForSelector('.card.editing');
    const editor = page.locator('.tiptap');
    await editor.click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.type('Updated content');
    await clickAway(page);

    // Wait for autosave
    await page.waitForTimeout(1000);

    const lastSave2 = await page.evaluate(() => window._savedContent[window._savedContent.length - 1]);
    const data2 = JSON.parse(lastSave2);
    expect(data2.cards[data2.cards.length - 1].content).toContain('Updated content');
  });
});

test.describe('Card Canvas - Markdown Rendering', () => {
  test('should render headings correctly in display mode', async ({ page }) => {
    await waitForApp(page);
    await createCard(page);
    const tiptap = page.locator('.tiptap');
    await tiptap.click();
    await page.keyboard.type('# My Heading');
    await clickAway(page);

    const cardBody = page.locator('.card-body').first();
    const h1 = cardBody.locator('h1');
    await expect(h1).toContainText('My Heading');
  });

  test('should render bullet lists in display mode', async ({ page }) => {
    await waitForApp(page);

    // Inject a card with bullet content via the global state and renderCard
    await page.evaluate(() => {
      const c = {
        id: 'test-bullet',
        x: 200, y: 200, w: 300, h: 200,
        color: '#FFF8E7',
        content: '- Item one\n- Item two\n- Item three'
      };
      state.cards.push(c);
      renderCard(c);
    });

    const cardBody = page.locator('#test-bullet .card-body');
    const listItems = cardBody.locator('li');
    await expect(listItems).toHaveCount(3);
    await expect(listItems.nth(0)).toContainText('Item one');
  });
});
