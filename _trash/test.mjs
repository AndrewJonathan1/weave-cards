import puppeteer from 'puppeteer-core';
const CHROME = '/Users/j/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const FILE_URL = 'file:///Users/j/Dropbox/_Everything/Pinned/2026-03-19 Websites/canvas.html';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 800 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(FILE_URL, { waitUntil: 'domcontentloaded' });

async function freshCard() {
  await page.evaluate(() => { state.cards = []; state.connections = []; document.querySelectorAll('.card').forEach(el => el.remove()); });
  await new Promise(r => setTimeout(r, 100));
  await page.mouse.click(600, 400, { clickCount: 2 });
  await new Promise(r => setTimeout(r, 300));
  const card = await page.$('.card');
  const b = await card.$('.card-body');
  const box = await b.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  await new Promise(r => setTimeout(r, 300));
  const ta = await card.$('.card-textarea');
  await ta.focus();
  await new Promise(r => setTimeout(r, 100));
  return { card, ta };
}

const W = 100; // wait ms after actions

async function cursorInfo() {
  return page.evaluate(() => {
    const cursor = document.querySelector('.card-body .cursor');
    if (!cursor) return { found: false };
    const rect = cursor.getBoundingClientRect();
    const inHidden = cursor.parentElement?.classList?.contains('md-h');
    // Get text before and after cursor in the visible flow
    const prev = cursor.previousSibling;
    const next = cursor.nextSibling;
    return {
      found: true,
      visible: !inHidden && rect.height > 0,
      height: rect.height,
      x: rect.x,
      y: rect.y,
      inHidden,
      parentTag: cursor.parentElement?.tagName,
      prevText: prev?.nodeType === 3 ? prev.textContent : null,
      nextText: next?.nodeType === 3 ? next.textContent : null,
    };
  });
}

async function rawContent() {
  return page.evaluate(() => document.querySelector('.card-textarea')?.value || '');
}

async function selPos() {
  return page.evaluate(() => {
    const ta = document.querySelector('.card-textarea');
    return { start: ta?.selectionStart, end: ta?.selectionEnd };
  });
}

let pass = 0, fail = 0;
function check(name, ok, detail) {
  const msg = `${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' [' + detail + ']' : ''}`;
  console.log(msg);
  ok ? pass++ : fail++;
}

// ============================================================
// SECTION 1: BASIC TYPING AND CURSOR AT END
// ============================================================

// 1.1 Empty card — cursor visible
{ const {} = await freshCard();
  const c = await cursorInfo();
  check('Empty card: cursor found', c.found);
  check('Empty card: cursor visible', c.visible);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 1.2 Type plain text — cursor at end
{ const { ta } = await freshCard();
  await ta.type('hello world', { delay: 20 }); await new Promise(r => setTimeout(r, W));
  const c = await cursorInfo();
  check('Plain text: cursor visible', c.visible);
  check('Plain text: cursor after text', c.prevText === 'hello world');
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 1.3 Type heading — cursor at end of heading text
{ const { ta } = await freshCard();
  await ta.type('# Title', { delay: 20 }); await new Promise(r => setTimeout(r, W));
  const c = await cursorInfo();
  check('Heading: cursor visible', c.visible);
  check('Heading: not in hidden span', !c.inHidden);
  check('Heading: cursor after Title', c.prevText === 'Title');
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 1.4 Type bold — cursor after closing **
{ const { ta } = await freshCard();
  await ta.type('**bold**', { delay: 20 }); await new Promise(r => setTimeout(r, W));
  const c = await cursorInfo();
  check('Bold: cursor visible', c.visible);
  check('Bold: not in hidden', !c.inHidden);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 1.5 Type italic
{ const { ta } = await freshCard();
  await ta.type('*italic*', { delay: 20 }); await new Promise(r => setTimeout(r, W));
  const c = await cursorInfo();
  check('Italic: cursor visible', c.visible);
  check('Italic: not in hidden', !c.inHidden);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 1.6 Type code
{ const { ta } = await freshCard();
  await ta.type('use `code` here', { delay: 20 }); await new Promise(r => setTimeout(r, W));
  const c = await cursorInfo();
  check('Code: cursor visible', c.visible);
  check('Code: cursor after "here"', c.prevText === ' here');
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 1.7 Type bullet
{ const { ta } = await freshCard();
  await ta.type('- item one', { delay: 20 }); await new Promise(r => setTimeout(r, W));
  const c = await cursorInfo();
  check('Bullet: cursor visible', c.visible);
  check('Bullet: not in hidden', !c.inHidden);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// ============================================================
// SECTION 2: ENTER KEY
// ============================================================

// 2.1 Enter at end of plain text — cursor on new line
{ const { ta } = await freshCard();
  await ta.type('hello'); await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, W));
  const c = await cursorInfo();
  const raw = await rawContent();
  check('Enter@end: raw has newline', raw === 'hello\n');
  check('Enter@end: cursor visible', c.visible);
  check('Enter@end: cursor not in hidden', !c.inHidden);
  // Cursor should be on a DIFFERENT line (higher y) than "hello"
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 2.2 Enter then type more — both lines visible, cursor after second
{ const { ta } = await freshCard();
  await ta.type('line1'); await page.keyboard.press('Enter'); await ta.type('line2');
  await new Promise(r => setTimeout(r, W));
  const c = await cursorInfo();
  check('Enter+type: cursor after line2', c.prevText === 'line2');
  check('Enter+type: cursor visible', c.visible);
  const html = await page.evaluate(() => document.querySelector('.card-body').innerHTML);
  check('Enter+type: has <br>', html.includes('<br>'));
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 2.3 Double Enter — paragraph break, cursor on blank line
{ const { ta } = await freshCard();
  await ta.type('para1'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, W));
  const c = await cursorInfo();
  check('DblEnter: cursor visible', c.visible);
  check('DblEnter: cursor not in hidden', !c.inHidden);
  check('DblEnter: cursor has height', c.height > 0);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 2.4 Double Enter then type — two paragraphs, cursor in second
{ const { ta } = await freshCard();
  await ta.type('para1'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await ta.type('para2');
  await new Promise(r => setTimeout(r, W));
  const c = await cursorInfo();
  const html = await page.evaluate(() => document.querySelector('.card-body').innerHTML);
  const pCount = (html.match(/<p>/g) || []).length;
  check('DblEnter+type: 2 paragraphs', pCount === 2);
  check('DblEnter+type: cursor after para2', c.prevText === 'para2');
  check('DblEnter+type: cursor visible', c.visible);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 2.5 Triple Enter — should produce paragraph break + blank line
{ const { ta } = await freshCard();
  await ta.type('top');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, W));
  const c = await cursorInfo();
  check('TripleEnter: cursor visible', c.visible);
  check('TripleEnter: cursor has height', c.height > 0);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 2.6 Enter in heading context — heading then new line
{ const { ta } = await freshCard();
  await ta.type('# Title'); await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, W));
  const c = await cursorInfo();
  check('Enter after heading: cursor visible', c.visible);
  check('Enter after heading: not in hidden', !c.inHidden);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// ============================================================
// SECTION 3: BACKSPACE
// ============================================================

// 3.1 Backspace at end of word
{ const { ta } = await freshCard();
  await ta.type('abc', { delay: 20 }); await page.keyboard.press('Backspace');
  await new Promise(r => setTimeout(r, W));
  const raw = await rawContent();
  const c = await cursorInfo();
  check('Backspace: raw is "ab"', raw === 'ab');
  check('Backspace: cursor visible', c.visible);
  check('Backspace: cursor after "ab"', c.prevText === 'ab');
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 3.2 Backspace deleting newline (join lines)
{ const { ta } = await freshCard();
  await ta.type('line1'); await page.keyboard.press('Enter'); await ta.type('line2');
  // Move to start of line2
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace'); // delete the \n
  await new Promise(r => setTimeout(r, W));
  const raw = await rawContent();
  const c = await cursorInfo();
  check('Backspace newline: lines joined', raw === 'line1line2');
  check('Backspace newline: cursor visible', c.visible);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 3.3 Backspace to empty
{ const { ta } = await freshCard();
  await ta.type('a'); await page.keyboard.press('Backspace');
  await new Promise(r => setTimeout(r, W));
  const raw = await rawContent();
  const c = await cursorInfo();
  check('Backspace to empty: raw empty', raw === '');
  check('Backspace to empty: cursor visible', c.visible);
  check('Backspace to empty: cursor has height', c.height > 0);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 3.4 Multiple backspaces
{ const { ta } = await freshCard();
  await ta.type('abcde', { delay: 20 });
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await new Promise(r => setTimeout(r, W));
  const raw = await rawContent();
  check('Multi backspace: raw is "ab"', raw === 'ab');
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// ============================================================
// SECTION 4: ARROW KEYS (cursor movement without editing)
// ============================================================

// 4.1 Left arrow from end
{ const { ta } = await freshCard();
  await ta.type('abcde', { delay: 20 });
  await page.keyboard.press('ArrowLeft');
  await new Promise(r => setTimeout(r, W));
  const c = await cursorInfo();
  const s = await selPos();
  check('ArrowLeft: sel at 4', s.start === 4);
  check('ArrowLeft: cursor visible', c.visible);
  check('ArrowLeft: prev is "abcd"', c.prevText === 'abcd');
  check('ArrowLeft: next is "e"', c.nextText === 'e');
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 4.2 Right arrow after left
{ const { ta } = await freshCard();
  await ta.type('abcde', { delay: 20 });
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await new Promise(r => setTimeout(r, W));
  const s = await selPos();
  const c = await cursorInfo();
  check('ArrowRight: sel at 4', s.start === 4);
  check('ArrowRight: cursor visible', c.visible);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 4.3 Home key
{ const { ta } = await freshCard();
  await ta.type('hello', { delay: 20 });
  await page.keyboard.press('Home');
  await new Promise(r => setTimeout(r, W));
  const s = await selPos();
  const c = await cursorInfo();
  check('Home: sel at 0', s.start === 0);
  check('Home: cursor visible', c.visible);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 4.4 End key after Home
{ const { ta } = await freshCard();
  await ta.type('hello', { delay: 20 });
  await page.keyboard.press('Home');
  await page.keyboard.press('End');
  await new Promise(r => setTimeout(r, W));
  const s = await selPos();
  const c = await cursorInfo();
  check('End: sel at 5', s.start === 5);
  check('End: cursor visible', c.visible);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 4.5 Left arrow across newline boundary
{ const { ta } = await freshCard();
  await ta.type('ab'); await page.keyboard.press('Enter'); await ta.type('cd');
  // cursor at end (pos 5: a,b,\n,c,d)
  await page.keyboard.press('ArrowLeft'); // pos 4 (after c)
  await page.keyboard.press('ArrowLeft'); // pos 3 (after \n, before c)
  await page.keyboard.press('ArrowLeft'); // pos 2 (after b, before \n)
  await new Promise(r => setTimeout(r, W));
  const s = await selPos();
  const c = await cursorInfo();
  check('Left across newline: sel at 2', s.start === 2);
  check('Left across newline: cursor visible', c.visible);
  check('Left across newline: prev is "ab"', c.prevText === 'ab');
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 4.6 Left arrow into heading prefix area
{ const { ta } = await freshCard();
  await ta.type('# Hi', { delay: 20 });
  // pos 4: #, space, H, i
  await page.keyboard.press('ArrowLeft'); // pos 3 (between H and i)
  await page.keyboard.press('ArrowLeft'); // pos 2 (before H, after "# ")
  await new Promise(r => setTimeout(r, W));
  const c = await cursorInfo();
  check('Left into heading: cursor visible', c.visible);
  check('Left into heading: not in hidden', !c.inHidden);
  // One more left puts us at pos 1 (inside "# " prefix)
  await page.keyboard.press('ArrowLeft'); // pos 1
  await new Promise(r => setTimeout(r, W));
  const c2 = await cursorInfo();
  check('Left inside prefix: cursor visible', c2.visible);
  check('Left inside prefix: not in hidden', !c2.inHidden);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// ============================================================
// SECTION 5: DELETE (forward delete)
// ============================================================

// 5.1 Delete key from middle
{ const { ta } = await freshCard();
  await ta.type('abcde', { delay: 20 });
  await page.keyboard.press('Home');
  await page.keyboard.press('Delete');
  await new Promise(r => setTimeout(r, W));
  const raw = await rawContent();
  const c = await cursorInfo();
  check('Delete: raw is "bcde"', raw === 'bcde');
  check('Delete: cursor visible', c.visible);
  check('Delete: cursor at start', c.prevText === null || c.prevText === '');
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 5.2 Delete at a newline
{ const { ta } = await freshCard();
  await ta.type('ab'); await page.keyboard.press('Enter'); await ta.type('cd');
  // Go to end of first line (pos 2)
  await page.keyboard.press('Home'); // this goes to start of "cd" line
  // Set cursor to end of first line (pos 2) via JS
  await page.evaluate(() => { const t = document.querySelector('.card-textarea'); t.selectionStart = t.selectionEnd = 2; });
  await page.keyboard.press('Delete'); // delete the \n
  await new Promise(r => setTimeout(r, W));
  const raw = await rawContent();
  check('Delete newline: joined', raw === 'abcd');
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// ============================================================
// SECTION 6: INSERT IN MIDDLE
// ============================================================

// 6.1 Type character in middle of text
{ const { ta } = await freshCard();
  await ta.type('abde', { delay: 20 });
  await page.keyboard.press('ArrowLeft'); // before e
  await page.keyboard.press('ArrowLeft'); // before d
  await ta.type('c');
  await new Promise(r => setTimeout(r, W));
  const raw = await rawContent();
  const c = await cursorInfo();
  check('Insert mid: raw is "abcde"', raw === 'abcde');
  check('Insert mid: cursor visible', c.visible);
  check('Insert mid: cursor after c', c.prevText === 'abc');
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 6.2 Type at very beginning
{ const { ta } = await freshCard();
  await ta.type('ello', { delay: 20 });
  await page.keyboard.press('Home');
  await ta.type('h');
  await new Promise(r => setTimeout(r, W));
  const raw = await rawContent();
  check('Insert@start: raw is "hello"', raw === 'hello');
  const c = await cursorInfo();
  check('Insert@start: cursor visible', c.visible);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// ============================================================
// SECTION 7: SELECT ALL + DELETE/REPLACE
// ============================================================

// 7.1 Cmd+A then Backspace — clears everything
{ const { ta } = await freshCard();
  await ta.type('some text here', { delay: 20 });
  await page.evaluate(() => document.querySelector('.card-textarea').select());
  await page.keyboard.press('Backspace');
  await new Promise(r => setTimeout(r, W));
  const raw = await rawContent();
  const c = await cursorInfo();
  check('SelectAll+Del: raw empty', raw === '');
  check('SelectAll+Del: cursor visible', c.visible);
  check('SelectAll+Del: cursor has height', c.height > 0);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 7.2 Cmd+A then type — replaces everything
{ const { ta } = await freshCard();
  await ta.type('old text', { delay: 20 });
  await page.evaluate(() => document.querySelector('.card-textarea').select());
  await ta.type('new');
  await new Promise(r => setTimeout(r, W));
  const raw = await rawContent();
  check('SelectAll+type: raw is "new"', raw === 'new');
  const c = await cursorInfo();
  check('SelectAll+type: cursor visible', c.visible);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// ============================================================
// SECTION 8: ESCAPE (exit editing)
// ============================================================

// 8.1 Escape exits editing
{ const { ta } = await freshCard();
  await ta.type('test', { delay: 20 });
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, W * 2));
  const hasTa = await page.evaluate(() => !!document.querySelector('.card-textarea'));
  const hasCursor = await page.evaluate(() => !!document.querySelector('.card-body .cursor'));
  check('Escape: textarea removed', !hasTa);
  check('Escape: cursor removed', !hasCursor);
  const html = await page.evaluate(() => document.querySelector('.card-body').innerHTML);
  check('Escape: content preserved', html.includes('test'));
}

// ============================================================
// SECTION 9: RAPID TYPING (performance/correctness)
// ============================================================

// 9.1 Fast typing doesn't lose characters
{ const { ta } = await freshCard();
  await ta.type('The quick brown fox jumps over the lazy dog', { delay: 5 });
  await new Promise(r => setTimeout(r, W));
  const raw = await rawContent();
  check('Fast type: all chars preserved', raw === 'The quick brown fox jumps over the lazy dog');
  const c = await cursorInfo();
  check('Fast type: cursor visible', c.visible);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// ============================================================
// SECTION 10: MIXED MARKDOWN + CURSOR
// ============================================================

// 10.1 Heading then Enter then bullet
{ const { ta } = await freshCard();
  await ta.type('# Title');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await ta.type('- item');
  await new Promise(r => setTimeout(r, W));
  const html = await page.evaluate(() => document.querySelector('.card-body').innerHTML);
  check('Mixed H+bullet: has h1', html.includes('<h1>'));
  check('Mixed H+bullet: has ul', html.includes('<ul>'));
  const c = await cursorInfo();
  check('Mixed H+bullet: cursor visible', c.visible);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 10.2 Bold in the middle of a sentence
{ const { ta } = await freshCard();
  await ta.type('this is **important** stuff', { delay: 10 });
  await new Promise(r => setTimeout(r, W));
  const c = await cursorInfo();
  check('Mid bold: cursor visible', c.visible);
  check('Mid bold: cursor after stuff', c.prevText?.includes('stuff'));
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 10.3 Navigate left through bold markers
{ const { ta } = await freshCard();
  await ta.type('a**b**c', { delay: 20 });
  // pos 7: a,*,*,b,*,*,c — cursor after c
  await page.keyboard.press('ArrowLeft'); // pos 6 before c
  await new Promise(r => setTimeout(r, W));
  let c = await cursorInfo();
  check('Nav bold: cursor before c visible', c.visible);
  await page.keyboard.press('ArrowLeft'); // pos 5 — inside closing **
  await new Promise(r => setTimeout(r, W));
  c = await cursorInfo();
  check('Nav bold: cursor after closing ** visible', c.visible);
  check('Nav bold: not in hidden', !c.inHidden);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// ============================================================
// SECTION 11: BLUR AND RE-EDIT
// ============================================================

// 11.1 Content preserved across edit cycles
{ const { ta } = await freshCard();
  await ta.type('# Heading\n\nParagraph with **bold**', { delay: 10 });
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, 200));
  // Re-open
  const b = await page.$('.card .card-body');
  const box = await b.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  await new Promise(r => setTimeout(r, 300));
  const val = await rawContent();
  check('Re-edit: content preserved', val === '# Heading\n\nParagraph with **bold**');
  const c = await cursorInfo();
  check('Re-edit: cursor visible', c.visible);
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, W));
}

// 11.2 Edit, blur, re-edit, modify, blur — final content correct
{ const { ta } = await freshCard();
  await ta.type('first');
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, 200));
  const b = await page.$('.card .card-body');
  const box = await b.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  await new Promise(r => setTimeout(r, 300));
  const ta2 = await page.$('.card .card-textarea');
  await ta2.focus(); await new Promise(r => setTimeout(r, 50));
  await ta2.type(' second');
  await page.mouse.click(100, 100); await new Promise(r => setTimeout(r, 200));
  const html = await page.evaluate(() => document.querySelector('.card-body').innerHTML);
  check('Multi-edit: final has both words', html.includes('first second'));
}

// ============================================================
// RESULTS
// ============================================================

console.log(`\n${'='.repeat(50)}`);
console.log(`${pass} passed, ${fail} failed out of ${pass + fail} tests`);
if (errors.length) console.log('JS Errors:', errors);
else console.log('No JS errors');
await browser.close();
