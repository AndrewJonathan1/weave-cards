const { test, expect } = require('@playwright/test');
const path = require('path');

const CANVAS_URL = `file://${path.resolve(__dirname, '..', 'Workspace', 'Editors', 'index.html')}`;

async function waitForApp(page) {
  await page.goto(CANVAS_URL);
  await page.waitForSelector('#canvas-viewport');
  await page.waitForFunction(() => typeof window.startEditing === 'function');
  // Dismiss the connect overlay so tests can interact with the canvas
  await page.evaluate(() => {
    const overlay = document.getElementById('connect-overlay');
    if (overlay) overlay.classList.remove('open');
  });
}

// Create two cards at known positions via state injection (more reliable than double-click for positioning)
async function createTwoCards(page) {
  await page.evaluate(() => {
    const c1 = { id: 'sel-card-1', x: 100, y: 100, w: 200, h: 150, color: '#FFF8E7', content: 'Card One' };
    const c2 = { id: 'sel-card-2', x: 400, y: 100, w: 200, h: 150, color: '#FFE8D6', content: 'Card Two' };
    state.cards.push(c1, c2);
    renderCard(c1);
    renderCard(c2);
  });
}

async function createThreeCards(page) {
  await page.evaluate(() => {
    const c1 = { id: 'sel-card-1', x: 100, y: 100, w: 200, h: 150, color: '#FFF8E7', content: 'Card One' };
    const c2 = { id: 'sel-card-2', x: 400, y: 100, w: 200, h: 150, color: '#FFE8D6', content: 'Card Two' };
    const c3 = { id: 'sel-card-3', x: 250, y: 300, w: 200, h: 150, color: '#D8F0E0', content: 'Card Three' };
    state.cards.push(c1, c2, c3);
    renderCard(c1);
    renderCard(c2);
    renderCard(c3);
  });
}

// Get the screen position of a card's center (accounting for canvas transform)
async function getCardScreenCenter(page, cardId) {
  return await page.evaluate((id) => {
    const el = document.getElementById(id);
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, cardId);
}

test.describe('Multi-Select', () => {
  test('Shift+Click should add card to selection', async ({ page }) => {
    await waitForApp(page);
    await createTwoCards(page);

    const pos1 = await getCardScreenCenter(page, 'sel-card-1');
    await page.click('#sel-card-1 .card-body', { position: { x: 50, y: 50 }, modifiers: ['Shift'] });

    const isSelected = await page.evaluate(() => selectedCards.has('sel-card-1'));
    expect(isSelected).toBe(true);
    await expect(page.locator('#sel-card-1')).toHaveClass(/selected/);
  });

  test('Shift+Click should toggle card out of selection', async ({ page }) => {
    await waitForApp(page);
    await createTwoCards(page);

    // Select card 1
    await page.click('#sel-card-1 .card-body', { position: { x: 50, y: 50 }, modifiers: ['Shift'] });
    await expect(page.locator('#sel-card-1')).toHaveClass(/selected/);

    // Shift+Click again to deselect
    await page.click('#sel-card-1 .card-body', { position: { x: 50, y: 50 }, modifiers: ['Shift'] });
    const isSelected = await page.evaluate(() => selectedCards.has('sel-card-1'));
    expect(isSelected).toBe(false);
    await expect(page.locator('#sel-card-1')).not.toHaveClass(/selected/);
  });

  test('Shift+Click should select multiple cards', async ({ page }) => {
    await waitForApp(page);
    await createTwoCards(page);

    await page.click('#sel-card-1 .card-body', { position: { x: 50, y: 50 }, modifiers: ['Shift'] });
    await page.click('#sel-card-2 .card-body', { position: { x: 50, y: 50 }, modifiers: ['Shift'] });

    const count = await page.evaluate(() => selectedCards.size);
    expect(count).toBe(2);
    await expect(page.locator('#sel-card-1')).toHaveClass(/selected/);
    await expect(page.locator('#sel-card-2')).toHaveClass(/selected/);
  });

  test('Click without Shift should clear selection', async ({ page }) => {
    await waitForApp(page);
    await createTwoCards(page);

    // Select both cards
    await page.click('#sel-card-1 .card-body', { position: { x: 50, y: 50 }, modifiers: ['Shift'] });
    await page.click('#sel-card-2 .card-body', { position: { x: 50, y: 50 }, modifiers: ['Shift'] });

    // Click on empty canvas to clear
    await page.click('#canvas-viewport', { position: { x: 10, y: 700 } });

    const count = await page.evaluate(() => selectedCards.size);
    expect(count).toBe(0);
    await expect(page.locator('#sel-card-1')).not.toHaveClass(/selected/);
    await expect(page.locator('#sel-card-2')).not.toHaveClass(/selected/);
  });

  test('Selected cards should have visual indicator', async ({ page }) => {
    await waitForApp(page);
    await createTwoCards(page);

    await page.click('#sel-card-1 .card-body', { position: { x: 50, y: 50 }, modifiers: ['Shift'] });

    // Check the card has the selected class and blue border
    const card = page.locator('#sel-card-1');
    await expect(card).toHaveClass(/selected/);
    const borderColor = await card.evaluate(el => getComputedStyle(el).borderColor);
    // Should be some shade of blue (from var(--link))
    expect(borderColor).toBeTruthy();
  });

  test('Dragging a selected card should move all selected cards', async ({ page }) => {
    await waitForApp(page);
    await createTwoCards(page);

    // Select both cards with Shift+Click
    await page.click('#sel-card-1 .card-body', { position: { x: 50, y: 50 }, modifiers: ['Shift'] });
    await page.click('#sel-card-2 .card-body', { position: { x: 50, y: 50 }, modifiers: ['Shift'] });

    // Get initial positions
    const pos1Before = await page.evaluate(() => {
      const c = state.cards.find(c => c.id === 'sel-card-1');
      return { x: c.x, y: c.y };
    });
    const pos2Before = await page.evaluate(() => {
      const c = state.cards.find(c => c.id === 'sel-card-2');
      return { x: c.x, y: c.y };
    });

    // Drag card 1 by 50px to the right and 30px down
    const card1Center = await getCardScreenCenter(page, 'sel-card-1');
    await page.mouse.move(card1Center.x, card1Center.y);
    await page.mouse.down();
    await page.mouse.move(card1Center.x + 50, card1Center.y + 30, { steps: 5 });
    await page.mouse.up();

    // Verify both cards moved by approximately the same amount
    const pos1After = await page.evaluate(() => {
      const c = state.cards.find(c => c.id === 'sel-card-1');
      return { x: c.x, y: c.y };
    });
    const pos2After = await page.evaluate(() => {
      const c = state.cards.find(c => c.id === 'sel-card-2');
      return { x: c.x, y: c.y };
    });

    const delta1X = pos1After.x - pos1Before.x;
    const delta1Y = pos1After.y - pos1Before.y;
    const delta2X = pos2After.x - pos2Before.x;
    const delta2Y = pos2After.y - pos2Before.y;

    // Both deltas should be roughly equal (within 5px tolerance for zoom/rounding)
    expect(Math.abs(delta1X - delta2X)).toBeLessThan(5);
    expect(Math.abs(delta1Y - delta2Y)).toBeLessThan(5);
    // And they should have actually moved
    expect(Math.abs(delta1X)).toBeGreaterThan(10);
    expect(Math.abs(delta1Y)).toBeGreaterThan(10);
  });

  test('Delete key should delete all selected cards', async ({ page }) => {
    await waitForApp(page);
    await createThreeCards(page);

    // Select cards 1 and 2
    await page.click('#sel-card-1 .card-body', { position: { x: 50, y: 50 }, modifiers: ['Shift'] });
    await page.click('#sel-card-2 .card-body', { position: { x: 50, y: 50 }, modifiers: ['Shift'] });

    // Mock confirm to return true
    await page.evaluate(() => { window.confirm = () => true; });

    // Press Delete
    await page.keyboard.press('Delete');

    // Card 3 should remain, cards 1 and 2 should be gone
    await expect(page.locator('#sel-card-1')).toHaveCount(0);
    await expect(page.locator('#sel-card-2')).toHaveCount(0);
    await expect(page.locator('#sel-card-3')).toHaveCount(1);

    // State should reflect deletion
    const remaining = await page.evaluate(() => state.cards.map(c => c.id));
    expect(remaining).toEqual(['sel-card-3']);
  });

  test('Delete key with single selected card should not prompt', async ({ page }) => {
    await waitForApp(page);
    await createTwoCards(page);

    // Select one card
    await page.click('#sel-card-1 .card-body', { position: { x: 50, y: 50 }, modifiers: ['Shift'] });

    // Track if confirm was called
    await page.evaluate(() => {
      window._confirmCalled = false;
      window.confirm = () => { window._confirmCalled = true; return true; };
    });

    await page.keyboard.press('Delete');

    const confirmCalled = await page.evaluate(() => window._confirmCalled);
    expect(confirmCalled).toBe(false); // Single card delete should not confirm

    await expect(page.locator('#sel-card-1')).toHaveCount(0);
    await expect(page.locator('#sel-card-2')).toHaveCount(1);
  });
});
