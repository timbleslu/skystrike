'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// storage.js is the single persistence seam: no other game file may touch localStorage directly
const jsDir = path.join(__dirname, '..', 'js');
for (const f of fs.readdirSync(jsDir)) {
  if (!f.endsWith('.js') || f === 'storage.js') continue;
  const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
  assert.ok(!/localStorage/.test(src), f + ' must use store.get/store.set, not localStorage');
}

const ssrc = fs.readFileSync(path.join(jsDir, 'storage.js'), 'utf8');
assert.ok(/const store\s*=/.test(ssrc), 'storage.js defines store');
assert.ok(/localStorage\.getItem/.test(ssrc) && /localStorage\.setItem/.test(ssrc), 'store wraps localStorage');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(html.indexOf('js/storage.js') !== -1 && html.indexOf('js/storage.js') < html.indexOf('js/globals.js'), 'storage.js loads before globals.js');

console.log('ok - storage seam: no direct localStorage outside storage.js');
