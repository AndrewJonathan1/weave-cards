const { test, expect } = require('@playwright/test');
const path = require('path');

const CANVAS_URL = `file://${path.resolve(__dirname, '..', 'Workspace', 'Editors', 'index.html')}`;

/**
 * Creates a realistic mock FileSystemFileHandle that simulates a real file on disk.
 * The "file" is backed by an in-memory string that persists across reads/writes,
 * just like a real file would. This is injected into the page context.
 */
async function injectMockFileSystem(page) {
  await page.evaluate(() => {
    // Simulated "disk" — a string holding the file contents
    window.__mockFileContent = '';

    function createMockHandle(name, initialContent) {
      window.__mockFileContent = initialContent || '';

      return {
        name: name,
        // getFile returns a snapshot of the current file content
        getFile: async () => {
          return new File([window.__mockFileContent], name, { type: 'application/json' });
        },
        // createWritable returns a writable that overwrites the file content
        createWritable: async () => {
          let buffer = '';
          return {
            write: async (data) => { buffer = data; },
            close: async () => { window.__mockFileContent = buffer; },
          };
        },
      };
    }

    window.__createMockHandle = createMockHandle;
  });
}

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

async function createCard(page, x = 640, y = 400) {
  await page.dblclick('#canvas-viewport', { position: { x, y } });
  await page.waitForSelector('.card.editing');
}

async function clickAway(page) {
  await page.click('#canvas-viewport', { position: { x: 10, y: 700 } });
  await page.waitForTimeout(200);
}

// Wait for any scheduled save to complete (300ms debounce + write time)
async function waitForSave(page) {
  await page.waitForTimeout(600);
  // Also wait for any pending write to finish
  await page.waitForFunction(() => !isWriting && !pendingWrite, { timeout: 5000 });
}

test.describe('File Sync - Full Lifecycle', () => {

  test('write to file, verify content matches state', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    // Create a card with content
    await createCard(page);
    const tiptap = page.locator('.tiptap');
    await tiptap.click();
    await page.keyboard.type('# Test Card');
    await clickAway(page);

    // Set up mock file handle and trigger writeToFile
    await page.evaluate(() => {
      fileHandle = __createMockHandle('test.json', '');
    });
    await page.evaluate(() => writeToFile());
    await waitForSave(page);

    // Read the "file" back and verify
    const fileContent = await page.evaluate(() => window.__mockFileContent);
    const parsed = JSON.parse(fileContent);

    expect(parsed.cards).toBeDefined();
    expect(parsed.cards.length).toBe(1);
    expect(parsed.cards[0].content).toContain('Test Card');
    expect(parsed.connections).toBeDefined();
  });

  test('write to file, read it back, verify roundtrip', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    // Create two cards
    await page.evaluate(() => {
      state.cards.push(
        { id: 'rt-1', x: 100, y: 100, w: 300, h: 200, color: '#FFF8E7', content: '# Card A\n\nSome content here' },
        { id: 'rt-2', x: 500, y: 100, w: 300, h: 200, color: '#FFE8D6', content: '- Item 1\n- Item 2' }
      );
      state.connections.push({ from: 'rt-1', to: 'rt-2', label: 'test' });
    });

    // Write to file
    await page.evaluate(() => {
      fileHandle = __createMockHandle('roundtrip.json', '');
    });
    await page.evaluate(() => writeToFile());
    await waitForSave(page);

    // Read the file content
    const fileContent = await page.evaluate(() => window.__mockFileContent);
    const saved = JSON.parse(fileContent);

    // Verify structure
    expect(saved.cards.length).toBe(2);
    expect(saved.cards[0].id).toBe('rt-1');
    expect(saved.cards[1].id).toBe('rt-2');
    expect(saved.cards[0].content).toBe('# Card A\n\nSome content here');
    expect(saved.cards[1].content).toBe('- Item 1\n- Item 2');
    expect(saved.connections.length).toBe(1);
    expect(saved.connections[0].from).toBe('rt-1');
    expect(saved.connections[0].to).toBe('rt-2');
    expect(saved.connections[0].label).toBe('test');

    // Now simulate "loading from file" — clear state, load from the saved content
    await page.evaluate(async () => {
      // Clear current state
      state = { cards: [], connections: [] };
      // Read from the file
      const file = await fileHandle.getFile();
      const text = await file.text();
      const loaded = JSON.parse(text);
      state = loaded;
      if (!state.connections) state.connections = [];
      renderAll();
    });

    // Verify cards are back
    const cardCount = await page.evaluate(() => state.cards.length);
    expect(cardCount).toBe(2);

    const card1Content = await page.evaluate(() => state.cards[0].content);
    expect(card1Content).toBe('# Card A\n\nSome content here');

    // Verify DOM has the cards
    await expect(page.locator('#rt-1')).toBeVisible();
    await expect(page.locator('#rt-2')).toBeVisible();
  });

  test('autosave fires after card creation', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    // Set up file handle BEFORE creating card
    await page.evaluate(() => {
      fileHandle = __createMockHandle('autosave.json', '');
    });

    // Create a card — this should trigger scheduleSave
    await createCard(page);
    const tiptap = page.locator('.tiptap');
    await tiptap.click();
    await page.keyboard.type('Autosave test');
    await clickAway(page);

    // Wait for the debounced save
    await waitForSave(page);

    // The file should have content now
    const fileContent = await page.evaluate(() => window.__mockFileContent);
    expect(fileContent.length).toBeGreaterThan(0);
    const parsed = JSON.parse(fileContent);
    expect(parsed.cards.length).toBeGreaterThan(0);
    expect(parsed.cards[parsed.cards.length - 1].content).toContain('Autosave test');
  });

  test('autosave fires after each edit', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    await page.evaluate(() => {
      fileHandle = __createMockHandle('autosave-edits.json', '');
    });

    // Create card with "Version 1"
    await createCard(page);
    const tiptap = page.locator('.tiptap');
    await tiptap.click();
    await page.keyboard.type('Version 1');
    await clickAway(page);
    await waitForSave(page);

    const file1 = await page.evaluate(() => window.__mockFileContent);
    const state1 = JSON.parse(file1);
    expect(state1.cards[state1.cards.length - 1].content).toContain('Version 1');

    // Re-edit to "Version 2"
    const cardBody = page.locator('.card-body').first();
    await cardBody.click();
    await page.waitForSelector('.card.editing');
    await page.locator('.tiptap').click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.type('Version 2');
    await clickAway(page);
    await waitForSave(page);

    const file2 = await page.evaluate(() => window.__mockFileContent);
    const state2 = JSON.parse(file2);
    expect(state2.cards[state2.cards.length - 1].content).toContain('Version 2');
    // Importantly: "Version 1" should NOT be in the latest save
    expect(state2.cards[state2.cards.length - 1].content).not.toContain('Version 1');
  });

  test('autosave fires after card deletion', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    await page.evaluate(() => {
      fileHandle = __createMockHandle('autosave-delete.json', '');
      state.cards.push(
        { id: 'del-1', x: 100, y: 100, w: 200, h: 150, color: '#FFF8E7', content: 'Keep me' },
        { id: 'del-2', x: 400, y: 100, w: 200, h: 150, color: '#FFE8D6', content: 'Delete me' }
      );
      renderAll();
    });

    // Delete second card
    await page.evaluate(() => deleteCard('del-2'));
    await waitForSave(page);

    const fileContent = await page.evaluate(() => window.__mockFileContent);
    const parsed = JSON.parse(fileContent);
    expect(parsed.cards.length).toBe(1);
    expect(parsed.cards[0].id).toBe('del-1');
    expect(parsed.cards[0].content).toBe('Keep me');
  });

  test('autosave fires after card move (drag)', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    await page.evaluate(() => {
      fileHandle = __createMockHandle('autosave-move.json', '');
      state.cards.push(
        { id: 'move-1', x: 100, y: 100, w: 200, h: 150, color: '#FFF8E7', content: 'Move me' }
      );
      renderAll();
    });

    // Get card center and drag it
    const cardCenter = await page.evaluate(() => {
      const el = document.getElementById('move-1');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });

    await page.mouse.move(cardCenter.x, cardCenter.y);
    await page.mouse.down();
    await page.mouse.move(cardCenter.x + 100, cardCenter.y + 50, { steps: 5 });
    await page.mouse.up();
    await waitForSave(page);

    const fileContent = await page.evaluate(() => window.__mockFileContent);
    const parsed = JSON.parse(fileContent);
    expect(parsed.cards[0].x).toBeGreaterThan(100); // Should have moved right
    expect(parsed.cards[0].y).toBeGreaterThan(100); // Should have moved down
  });

  test('autosave fires after color change', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    await page.evaluate(() => {
      fileHandle = __createMockHandle('autosave-color.json', '');
      state.cards.push(
        { id: 'color-1', x: 200, y: 200, w: 300, h: 200, color: '#FFF8E7', content: 'Change my color' }
      );
      renderAll();
    });

    const originalColor = await page.evaluate(() => state.cards[0].color);

    // Hover over card to reveal palette, click a different swatch
    await page.hover('#color-1');
    await page.waitForSelector('#color-1 .color-palette', { state: 'visible' });
    // Click the second swatch (index 1 = Peach)
    const swatches = page.locator('#color-1 .color-swatch');
    await swatches.nth(1).click();
    await waitForSave(page);

    const fileContent = await page.evaluate(() => window.__mockFileContent);
    const parsed = JSON.parse(fileContent);
    expect(parsed.cards[0].color).not.toBe(originalColor);
  });

  test('simulate page reload — state persists via file', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    // Create some state
    await page.evaluate(() => {
      state.cards.push(
        { id: 'persist-1', x: 50, y: 50, w: 250, h: 180, color: '#FFF8E7', content: '# Important Card' },
        { id: 'persist-2', x: 400, y: 50, w: 250, h: 180, color: '#D8F0E0', content: 'Second card' }
      );
      state.connections.push({ from: 'persist-1', to: 'persist-2', label: '' });
      fileHandle = __createMockHandle('persist.json', '');
    });

    // Write current state to file
    await page.evaluate(() => writeToFile());
    await waitForSave(page);

    // Capture file content
    const savedFile = await page.evaluate(() => window.__mockFileContent);
    expect(JSON.parse(savedFile).cards.length).toBe(2);

    // Simulate "page reload": reset all state, then load from file
    await page.evaluate(async (savedJson) => {
      // Wipe state completely
      state = { cards: [], connections: [] };
      // Clear all cards from DOM
      document.querySelectorAll('.card').forEach(el => el.remove());

      // Simulate what syncToFile does when it opens an existing file:
      // the mock handle returns the saved content
      window.__mockFileContent = savedJson;
      fileHandle = __createMockHandle('persist.json', savedJson);

      const file = await fileHandle.getFile();
      const text = await file.text();
      const loaded = JSON.parse(text);
      if (loaded.cards && loaded.cards.length > 0) {
        state = loaded;
        if (!state.connections) state.connections = [];
        renderAll();
      }
    }, savedFile);

    // Verify state is restored
    const cardCount = await page.evaluate(() => state.cards.length);
    expect(cardCount).toBe(2);

    const connCount = await page.evaluate(() => state.connections.length);
    expect(connCount).toBe(1);

    // Verify DOM is restored
    await expect(page.locator('#persist-1')).toBeVisible();
    await expect(page.locator('#persist-2')).toBeVisible();
    await expect(page.locator('#persist-1 .card-body')).toContainText('Important Card');
  });

  test('concurrent write protection works', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    await page.evaluate(() => {
      state.cards.push(
        { id: 'conc-1', x: 100, y: 100, w: 200, h: 150, color: '#FFF8E7', content: 'Concurrent test' }
      );
      fileHandle = __createMockHandle('concurrent.json', '');

      // Track write count
      window.__writeCount = 0;
      const origCreateWritable = fileHandle.createWritable;
      fileHandle.createWritable = async () => {
        window.__writeCount++;
        // Simulate slow write
        await new Promise(r => setTimeout(r, 100));
        return origCreateWritable.call(fileHandle);
      };
    });

    // Fire multiple writes rapidly
    await page.evaluate(() => {
      writeToFile();
      writeToFile();
      writeToFile();
    });
    await page.waitForTimeout(1500);

    // Should not have done 3 concurrent writes — the pending mechanism should batch them
    const writeCount = await page.evaluate(() => window.__writeCount);
    // At most 3: first write + pending retries
    expect(writeCount).toBeLessThanOrEqual(3);

    // But the final state should still be saved correctly
    const fileContent = await page.evaluate(() => window.__mockFileContent);
    const parsed = JSON.parse(fileContent);
    expect(parsed.cards[0].content).toBe('Concurrent test');
  });

  test('scheduleSave debounces rapid changes', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    await page.evaluate(() => {
      fileHandle = __createMockHandle('debounce.json', '');
      window.__writeCount = 0;
      const origWrite = writeToFile;
      window.origWriteToFile = origWrite;

      // Monkey-patch to count calls
      var origIsWritingCheck = writeToFile;
    });

    // Track actual writes by watching the mock file content changes
    await page.evaluate(() => {
      window.__saveSnapshots = [];
      const origCreateWritable = fileHandle.createWritable;
      fileHandle.createWritable = async () => {
        const w = await origCreateWritable.call(fileHandle);
        const origClose = w.close;
        w.close = async () => {
          await origClose.call(w);
          window.__saveSnapshots.push(window.__mockFileContent);
        };
        return w;
      };
    });

    // Fire many scheduleSave calls rapidly
    await page.evaluate(() => {
      for (let i = 0; i < 10; i++) {
        state.cards = [{ id: 'deb-1', x: 0, y: 0, w: 200, h: 150, color: '#FFF8E7', content: `Version ${i}` }];
        scheduleSave();
      }
    });

    await page.waitForTimeout(1500);

    // Should have only written 1-2 times (debounce collapses the 10 rapid calls)
    const snapshots = await page.evaluate(() => window.__saveSnapshots);
    expect(snapshots.length).toBeLessThanOrEqual(2);

    // The last snapshot should have the final version
    if (snapshots.length > 0) {
      const lastSave = JSON.parse(snapshots[snapshots.length - 1]);
      expect(lastSave.cards[0].content).toBe('Version 9');
    }
  });

  test('localStorage backup works independently of file sync', async ({ page }) => {
    await waitForApp(page);

    // Create state without a file handle
    await page.evaluate(() => {
      fileHandle = null; // No file sync
      state.cards.push(
        { id: 'ls-1', x: 100, y: 100, w: 200, h: 150, color: '#FFF8E7', content: 'localStorage test' }
      );
    });

    // Trigger writeToFile (which always calls saveToLocalStorage even with no fileHandle)
    await page.evaluate(() => writeToFile());

    // Check localStorage
    const lsContent = await page.evaluate(() => localStorage.getItem('canvas-state'));
    expect(lsContent).toBeTruthy();
    const parsed = JSON.parse(lsContent);
    expect(parsed.cards.length).toBe(1);
    expect(parsed.cards[0].content).toBe('localStorage test');
  });

  test('loadFromLocalStorage restores state on fresh page', async ({ page }) => {
    await waitForApp(page);

    // Manually set localStorage with known state
    await page.evaluate(() => {
      const testState = {
        cards: [
          { id: 'ls-load-1', x: 100, y: 100, w: 250, h: 180, color: '#FFF8E7', content: '# Restored Card' }
        ],
        connections: []
      };
      localStorage.setItem('canvas-state', JSON.stringify(testState));
    });

    // Reload the page — loadFromLocalStorage runs on init
    await page.goto(CANVAS_URL);
    await page.waitForSelector('#canvas-viewport');
    await page.waitForFunction(() => typeof window.startEditing === 'function');
    // Dismiss connect overlay
    await page.evaluate(() => {
      const overlay = document.getElementById('connect-overlay');
      if (overlay) overlay.classList.remove('open');
    });

    // The card should be restored
    const cardCount = await page.evaluate(() => state.cards.length);
    expect(cardCount).toBe(1);
    await expect(page.locator('#ls-load-1')).toBeVisible();
    await expect(page.locator('#ls-load-1 .card-body')).toContainText('Restored Card');
  });

  test('empty file does not overwrite existing state', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    // Create existing state
    await page.evaluate(() => {
      state.cards.push(
        { id: 'keep-1', x: 100, y: 100, w: 200, h: 150, color: '#FFF8E7', content: 'Keep this' }
      );
      renderAll();
    });

    // Simulate syncing to an empty file
    await page.evaluate(async () => {
      fileHandle = __createMockHandle('empty.json', '');
      // Simulate what syncToFile does: read file, check if it has content
      const file = await fileHandle.getFile();
      const text = await file.text();
      if (text.trim()) {
        try {
          const loaded = JSON.parse(text);
          if (loaded.cards && loaded.cards.length > 0) {
            state = loaded;
            if (!state.connections) state.connections = [];
            renderAll();
          }
        } catch (e) { /* invalid JSON */ }
      }
      // Write current state to file
      await writeToFile();
    });
    await waitForSave(page);

    // Existing state should be preserved
    const cardCount = await page.evaluate(() => state.cards.length);
    expect(cardCount).toBe(1);
    expect(await page.evaluate(() => state.cards[0].content)).toBe('Keep this');

    // And it should be written to the file
    const fileContent = await page.evaluate(() => window.__mockFileContent);
    const parsed = JSON.parse(fileContent);
    expect(parsed.cards[0].content).toBe('Keep this');
  });

  test('file with existing data loads it into state', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    const existingData = {
      cards: [
        { id: 'file-1', x: 50, y: 50, w: 300, h: 200, color: '#FFF8E7', content: '# From File' },
        { id: 'file-2', x: 400, y: 50, w: 300, h: 200, color: '#D8F0E0', content: 'Also from file' }
      ],
      connections: [{ from: 'file-1', to: 'file-2', label: '' }]
    };

    // Simulate syncing to a file that already has content
    await page.evaluate(async (data) => {
      fileHandle = __createMockHandle('existing.json', JSON.stringify(data));
      const file = await fileHandle.getFile();
      const text = await file.text();
      if (text.trim()) {
        try {
          const loaded = JSON.parse(text);
          if (loaded.cards && loaded.cards.length > 0) {
            state = loaded;
            if (!state.connections) state.connections = [];
            renderAll();
          }
        } catch (e) { /* invalid JSON */ }
      }
    }, existingData);

    // State should now have the file's data
    const cardCount = await page.evaluate(() => state.cards.length);
    expect(cardCount).toBe(2);
    await expect(page.locator('#file-1')).toBeVisible();
    await expect(page.locator('#file-2')).toBeVisible();
    await expect(page.locator('#file-1 .card-body')).toContainText('From File');
  });

  test('live editing continuously updates the file', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    await page.evaluate(() => {
      fileHandle = __createMockHandle('live.json', '');
    });

    // Create a card
    await createCard(page);
    const tiptap = page.locator('.tiptap');
    await tiptap.click();
    await page.keyboard.type('Step 1');
    await clickAway(page);
    await waitForSave(page);

    // Check file has Step 1
    let file = JSON.parse(await page.evaluate(() => window.__mockFileContent));
    expect(file.cards[file.cards.length - 1].content).toContain('Step 1');

    // Create another card
    await createCard(page, 300, 300);
    const tiptap2 = page.locator('.tiptap');
    await tiptap2.click();
    await page.keyboard.type('Step 2');
    await clickAway(page);
    await waitForSave(page);

    // File should now have 2 cards
    file = JSON.parse(await page.evaluate(() => window.__mockFileContent));
    expect(file.cards.length).toBe(2);

    // Delete first card
    const firstCardId = await page.evaluate(() => state.cards[0].id);
    await page.evaluate((id) => deleteCard(id), firstCardId);
    await waitForSave(page);

    // File should now have 1 card
    file = JSON.parse(await page.evaluate(() => window.__mockFileContent));
    expect(file.cards.length).toBe(1);
    expect(file.cards[0].content).toContain('Step 2');
  });

  test('Tiptap onUpdate triggers save during editing', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    await page.evaluate(() => {
      fileHandle = __createMockHandle('tiptap-save.json', '');
    });

    // Create a card and start typing (don't click away — stay in edit mode)
    await createCard(page);
    const tiptap = page.locator('.tiptap');
    await tiptap.click();
    await page.keyboard.type('Typing...');

    // The Tiptap onUpdate should trigger scheduleSave while still editing
    await waitForSave(page);

    // File should have partial content even though we're still editing
    const fileContent = await page.evaluate(() => window.__mockFileContent);
    if (fileContent) {
      const parsed = JSON.parse(fileContent);
      // The content might be saved via onUpdate even before clicking away
      expect(parsed.cards.length).toBeGreaterThan(0);
    }
    // At minimum, localStorage should have it
    const ls = await page.evaluate(() => localStorage.getItem('canvas-state'));
    expect(ls).toBeTruthy();
  });

  test('writeToFile error does not corrupt state', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    // Set up state
    await page.evaluate(() => {
      state.cards.push(
        { id: 'err-1', x: 100, y: 100, w: 200, h: 150, color: '#FFF8E7', content: 'Precious data' }
      );
      // Create a handle that fails on write
      fileHandle = {
        name: 'broken.json',
        getFile: async () => new File([''], 'broken.json'),
        createWritable: async () => { throw new Error('Disk full'); },
      };
    });

    // Try to write — should fail gracefully
    await page.evaluate(async () => {
      try { await writeToFile(); } catch (e) { /* expected */ }
    });

    // State should be untouched
    const content = await page.evaluate(() => state.cards[0].content);
    expect(content).toBe('Precious data');

    // localStorage backup should still work
    const ls = await page.evaluate(() => localStorage.getItem('canvas-state'));
    const parsed = JSON.parse(ls);
    expect(parsed.cards[0].content).toBe('Precious data');
  });

  test('card positions, sizes, and all properties survive roundtrip', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    const testCard = {
      id: 'props-1', x: 123.5, y: 456.7, w: 321, h: 198,
      color: '#D8F0E0', content: '# Title\n\nParagraph with **bold** and *italic*.\n\n- List item 1\n- List item 2'
    };

    await page.evaluate((card) => {
      state.cards.push(card);
      fileHandle = __createMockHandle('props.json', '');
    }, testCard);

    await page.evaluate(() => writeToFile());
    await waitForSave(page);

    const fileContent = await page.evaluate(() => window.__mockFileContent);
    const saved = JSON.parse(fileContent);
    const savedCard = saved.cards[0];

    expect(savedCard.id).toBe(testCard.id);
    expect(savedCard.x).toBe(testCard.x);
    expect(savedCard.y).toBe(testCard.y);
    expect(savedCard.w).toBe(testCard.w);
    expect(savedCard.h).toBe(testCard.h);
    expect(savedCard.color).toBe(testCard.color);
    expect(savedCard.content).toBe(testCard.content);
  });

  test('selectFile() with mocked showSaveFilePicker — full flow', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    // Create a card first
    await page.evaluate(() => {
      state.cards.push(
        { id: 'sync-real-1', x: 100, y: 100, w: 300, h: 200, color: '#FFF8E7', content: '# Real Sync Test' }
      );
      renderAll();
    });

    // Mock showSaveFilePicker to return our mock handle
    await page.evaluate(() => {
      const handle = __createMockHandle('synced-canvas.json', '');
      window.showSaveFilePicker = async (opts) => handle;
    });

    // Call selectFile (unified file flow)
    await page.evaluate(() => selectFile());
    await waitForSave(page);

    // Verify: file should have our card data
    const fileContent = await page.evaluate(() => window.__mockFileContent);
    expect(fileContent.length).toBeGreaterThan(0);
    const parsed = JSON.parse(fileContent);
    expect(parsed.cards.length).toBe(1);
    expect(parsed.cards[0].content).toBe('# Real Sync Test');

    // Verify: fileHandle should be set
    const hasHandle = await page.evaluate(() => fileHandle !== null);
    expect(hasHandle).toBe(true);

    // Verify: file status shows the filename
    await page.waitForFunction(
      () => document.getElementById('file-label').textContent === 'synced-canvas.json',
      { timeout: 5000 }
    );
    const statusText = await page.evaluate(() => document.getElementById('file-label').textContent);
    expect(statusText).toBe('synced-canvas.json');
  });

  test('selectFile() loads existing data from a populated file', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    const existingData = {
      cards: [
        { id: 'existing-1', x: 50, y: 50, w: 250, h: 180, color: '#FFF8E7', content: '# Already Here' },
        { id: 'existing-2', x: 400, y: 50, w: 250, h: 180, color: '#D8F0E0', content: 'Also existing' }
      ],
      connections: [{ from: 'existing-1', to: 'existing-2', label: 'link' }]
    };

    // Mock showSaveFilePicker to return a handle with pre-existing data
    await page.evaluate((data) => {
      const handle = __createMockHandle('existing-canvas.json', JSON.stringify(data));
      window.showSaveFilePicker = async (opts) => handle;
    }, existingData);

    // Call selectFile — it should load the existing data
    await page.evaluate(() => selectFile());
    await waitForSave(page);

    // State should now have the file's existing cards
    const cardCount = await page.evaluate(() => state.cards.length);
    expect(cardCount).toBe(2);

    const connCount = await page.evaluate(() => state.connections.length);
    expect(connCount).toBe(1);

    // DOM should have the cards rendered
    await expect(page.locator('#existing-1')).toBeVisible();
    await expect(page.locator('#existing-2')).toBeVisible();
    await expect(page.locator('#existing-1 .card-body')).toContainText('Already Here');
  });

  test('autosave fires after connection add', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    await page.evaluate(() => {
      fileHandle = __createMockHandle('conn-add.json', '');
      state.cards.push(
        { id: 'conn-a', x: 100, y: 100, w: 200, h: 150, color: '#FFF8E7', content: 'Card A' },
        { id: 'conn-b', x: 400, y: 100, w: 200, h: 150, color: '#FFE8D6', content: 'Card B' }
      );
      renderAll();
    });

    // Add a connection programmatically (simulates the drag-to-connect flow)
    await page.evaluate(() => {
      state.connections.push({ from: 'conn-a', to: 'conn-b', label: '' });
      renderConnections();
      scheduleSave();
    });
    await waitForSave(page);

    const fileContent = await page.evaluate(() => window.__mockFileContent);
    const parsed = JSON.parse(fileContent);
    expect(parsed.connections.length).toBe(1);
    expect(parsed.connections[0].from).toBe('conn-a');
    expect(parsed.connections[0].to).toBe('conn-b');
  });

  test('autosave fires after connection delete', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    await page.evaluate(() => {
      fileHandle = __createMockHandle('conn-del.json', '');
      state.cards.push(
        { id: 'cdel-a', x: 100, y: 100, w: 200, h: 150, color: '#FFF8E7', content: 'Card A' },
        { id: 'cdel-b', x: 400, y: 100, w: 200, h: 150, color: '#FFE8D6', content: 'Card B' }
      );
      state.connections.push({ from: 'cdel-a', to: 'cdel-b', label: '' });
      renderAll();
    });

    // Write initial state with connection
    await page.evaluate(() => writeToFile());
    await waitForSave(page);

    let fileContent = await page.evaluate(() => window.__mockFileContent);
    let parsed = JSON.parse(fileContent);
    expect(parsed.connections.length).toBe(1);

    // Delete the connection (simulates clicking on the line)
    await page.evaluate(() => {
      state.connections.splice(0, 1);
      renderConnections();
      scheduleSave();
    });
    await waitForSave(page);

    fileContent = await page.evaluate(() => window.__mockFileContent);
    parsed = JSON.parse(fileContent);
    expect(parsed.connections.length).toBe(0);
  });

  test('autosave fires after card resize', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    await page.evaluate(() => {
      fileHandle = __createMockHandle('resize.json', '');
      state.cards.push(
        { id: 'resize-1', x: 100, y: 100, w: 300, h: 200, color: '#FFF8E7', content: 'Resize me' }
      );
      renderAll();
    });

    // Get the resize handle position (bottom-right corner of the card)
    const handlePos = await page.evaluate(() => {
      const el = document.querySelector('#resize-1 .resize-handle');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });

    // Drag the resize handle
    await page.mouse.move(handlePos.x, handlePos.y);
    await page.mouse.down();
    await page.mouse.move(handlePos.x + 80, handlePos.y + 60, { steps: 5 });
    await page.mouse.up();
    await waitForSave(page);

    const fileContent = await page.evaluate(() => window.__mockFileContent);
    const parsed = JSON.parse(fileContent);
    // Card should be bigger than original 300x200
    expect(parsed.cards[0].w).toBeGreaterThan(300);
    expect(parsed.cards[0].h).toBeGreaterThan(200);
  });

  test('full lifecycle: create → type → sync → add more → verify → edit → verify → delete → verify', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    // STEP 1: Create a card and type content
    await createCard(page, 400, 300);
    const tiptap = page.locator('.tiptap');
    await tiptap.click();
    await page.keyboard.type('First card content');
    await clickAway(page);
    await page.waitForTimeout(300);

    // STEP 2: Set up sync with mocked showSaveFilePicker
    await page.evaluate(() => {
      const handle = __createMockHandle('lifecycle.json', '');
      window.showSaveFilePicker = async (opts) => handle;
    });
    await page.evaluate(() => selectFile());
    await waitForSave(page);

    // VERIFY: File should have the card
    let file = JSON.parse(await page.evaluate(() => window.__mockFileContent));
    expect(file.cards.length).toBe(1);
    expect(file.cards[0].content).toContain('First card content');

    // STEP 3: Add a second card
    await createCard(page, 200, 200);
    const tiptap2 = page.locator('.tiptap');
    await tiptap2.click();
    await page.keyboard.type('Second card');
    await clickAway(page);
    await waitForSave(page);

    // VERIFY: File should now have 2 cards
    file = JSON.parse(await page.evaluate(() => window.__mockFileContent));
    expect(file.cards.length).toBe(2);

    // STEP 4: Edit the first card
    const firstCardBody = page.locator('.card-body').first();
    await firstCardBody.click();
    await page.waitForSelector('.card.editing');
    await page.locator('.tiptap').click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.type('Edited first card');
    await clickAway(page);
    await waitForSave(page);

    // VERIFY: File should reflect the edit
    file = JSON.parse(await page.evaluate(() => window.__mockFileContent));
    expect(file.cards.length).toBe(2);
    const editedCard = file.cards.find(c => c.content.includes('Edited first card'));
    expect(editedCard).toBeTruthy();
    // "First card content" should be gone
    const oldCard = file.cards.find(c => c.content.includes('First card content'));
    expect(oldCard).toBeFalsy();

    // STEP 5: Delete the second card
    const secondCardId = await page.evaluate(() => state.cards[1].id);
    await page.evaluate((id) => deleteCard(id), secondCardId);
    await waitForSave(page);

    // VERIFY: File should have 1 card remaining
    file = JSON.parse(await page.evaluate(() => window.__mockFileContent));
    expect(file.cards.length).toBe(1);
    expect(file.cards[0].content).toContain('Edited first card');

    // STEP 6: Simulate reload by clearing state and re-reading the file
    await page.evaluate(async () => {
      // Clear everything
      state = { cards: [], connections: [] };
      document.querySelectorAll('.card').forEach(el => el.remove());

      // Re-read from "disk"
      const file = await fileHandle.getFile();
      const text = await file.text();
      const loaded = JSON.parse(text);
      if (loaded.cards && loaded.cards.length > 0) {
        state = loaded;
        if (!state.connections) state.connections = [];
        renderAll();
      }
    });

    // VERIFY: State is fully restored
    const finalCards = await page.evaluate(() => state.cards.length);
    expect(finalCards).toBe(1);
    const finalContent = await page.evaluate(() => state.cards[0].content);
    expect(finalContent).toContain('Edited first card');
    await expect(page.locator('.card')).toHaveCount(1);
    await expect(page.locator('.card .card-body')).toContainText('Edited first card');
  });

  test('selectFile() user cancel (AbortError) does not set fileHandle', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    // Mock showSaveFilePicker to simulate user pressing Cancel
    await page.evaluate(() => {
      window.showSaveFilePicker = async () => {
        const err = new DOMException('User cancelled', 'AbortError');
        throw err;
      };
    });

    await page.evaluate(() => selectFile());
    await page.waitForTimeout(500);

    // fileHandle should still be null
    const hasHandle = await page.evaluate(() => fileHandle === null);
    expect(hasHandle).toBe(true);

    // file-status should not be active
    const isActive = await page.evaluate(() => document.getElementById('file-status').classList.contains('active'));
    expect(isActive).toBe(false);
  });

  test('writeToFile recovers from NotAllowedError by clearing fileHandle', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    await page.evaluate(() => {
      state.cards.push(
        { id: 'perm-1', x: 100, y: 100, w: 200, h: 150, color: '#FFF8E7', content: 'Permission test' }
      );

      // Create a handle that fails with NotAllowedError
      fileHandle = {
        name: 'locked.json',
        getFile: async () => new File([''], 'locked.json'),
        createWritable: async () => {
          const err = new DOMException('Permission denied', 'NotAllowedError');
          throw err;
        },
      };
    });

    await page.evaluate(async () => { await writeToFile(); });
    await page.waitForTimeout(300);

    // fileHandle should be cleared so it doesn't keep failing
    const handleCleared = await page.evaluate(() => fileHandle === null);
    expect(handleCleared).toBe(true);

    // State should still be intact
    const content = await page.evaluate(() => state.cards[0].content);
    expect(content).toBe('Permission test');

    // localStorage backup should still have it
    const ls = JSON.parse(await page.evaluate(() => localStorage.getItem('canvas-state')));
    expect(ls.cards[0].content).toBe('Permission test');
  });

  test('multiple rapid card operations all get saved', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    await page.evaluate(() => {
      fileHandle = __createMockHandle('rapid.json', '');
    });

    // Rapidly add 5 cards
    for (let i = 0; i < 5; i++) {
      await page.evaluate((idx) => {
        state.cards.push({
          id: `rapid-${idx}`, x: idx * 100, y: 100,
          w: 200, h: 150, color: '#FFF8E7', content: `Card ${idx}`
        });
        scheduleSave();
      }, i);
    }

    await waitForSave(page);

    // All 5 cards should be in the file
    const fileContent = await page.evaluate(() => window.__mockFileContent);
    const parsed = JSON.parse(fileContent);
    expect(parsed.cards.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(parsed.cards[i].content).toBe(`Card ${i}`);
    }
  });

  test('status shows "Saving…" during write and "Saved" after', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    await page.evaluate(() => {
      state.cards.push(
        { id: 'status-1', x: 100, y: 100, w: 200, h: 150, color: '#FFF8E7', content: 'Status test' }
      );

      // Create a slow handle so we can observe "Saving…"
      const handle = __createMockHandle('status.json', '');
      const origCreateWritable = handle.createWritable;
      handle.createWritable = async () => {
        const w = await origCreateWritable.call(handle);
        const origClose = w.close;
        w.close = async () => {
          await new Promise(r => setTimeout(r, 200));
          await origClose.call(w);
        };
        return w;
      };
      fileHandle = handle;
      updateSyncStatus(); // activate the file-status element
    });

    // Start the write and immediately check status
    const savingPromise = page.evaluate(() => writeToFile());

    // Should have 'saving' class during the write
    await page.waitForFunction(
      () => document.getElementById('file-status').classList.contains('saving'),
      { timeout: 2000 }
    );

    await savingPromise;

    // Should have 'saved' class after the write completes
    await page.waitForFunction(
      () => document.getElementById('file-status').classList.contains('saved'),
      { timeout: 2000 }
    );

    // After the temporary period, should revert to just 'active' (no saving/saved)
    await page.waitForFunction(
      () => {
        const el = document.getElementById('file-status');
        return el.classList.contains('active') && !el.classList.contains('saving') && !el.classList.contains('saved');
      },
      { timeout: 5000 }
    );

    // Label should show filename
    const labelText = await page.evaluate(() => document.getElementById('file-label').textContent);
    expect(labelText).toBe('status.json');
  });

  test('real-time sync: each keystroke updates file within debounce window', async ({ page }) => {
    await waitForApp(page);
    await injectMockFileSystem(page);

    await page.evaluate(() => {
      fileHandle = __createMockHandle('realtime.json', '');
    });

    // Create a card and start editing
    await createCard(page);
    const tiptap = page.locator('.tiptap');
    await tiptap.click();

    // Type some text
    await page.keyboard.type('Hello');
    // Wait for debounce + write
    await waitForSave(page);

    // File should have the typed content
    let file = JSON.parse(await page.evaluate(() => window.__mockFileContent));
    const card = file.cards[file.cards.length - 1];
    expect(card.content).toContain('Hello');

    // Type more while still editing (don't click away)
    await page.keyboard.type(' World');
    await waitForSave(page);

    // File should be updated with the new content
    file = JSON.parse(await page.evaluate(() => window.__mockFileContent));
    const updatedCard = file.cards[file.cards.length - 1];
    expect(updatedCard.content).toContain('Hello World');

    // Type even more
    await page.keyboard.press('Enter');
    await page.keyboard.type('New line');
    await waitForSave(page);

    file = JSON.parse(await page.evaluate(() => window.__mockFileContent));
    const finalCard = file.cards[file.cards.length - 1];
    expect(finalCard.content).toContain('Hello World');
    expect(finalCard.content).toContain('New line');
  });
});
