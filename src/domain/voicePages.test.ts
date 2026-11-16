import test from 'node:test';
import assert from 'node:assert/strict';
import { matchPage, VOICE_HINT, voicePages } from './voicePages.ts';

const everyone = { seesOwner: true, owner: true, setup: true };
const cashier = { seesOwner: false, owner: false, setup: false };

test('a cashier is offered only what a cashier can open; the owner everything', () => {
  assert.deepEqual(voicePages(cashier).map((p) => p.id), ['register', 'kitchen', 'cashout']);
  assert.deepEqual(voicePages(everyone).map((p) => p.id), ['register', 'kitchen', 'owner', 'cashout', 'menu', 'setup']);
});

test('plain words open their page without the model', () => {
  const pages = voicePages(everyone);
  assert.equal(matchPage('Open cash out.', pages)?.hash, '#cashout');
  assert.equal(matchPage('Kitchen', pages)?.hash, '#kitchen');
  assert.equal(matchPage('back to the register', pages)?.hash, '');
  assert.equal(matchPage('show the menu', pages)?.hash, '#items/finished');
});

test('anything less plain goes to the model: no word, or words of two pages', () => {
  const pages = voicePages(everyone);
  assert.equal(matchPage('how much did we sell today', pages), null);
  assert.equal(matchPage('kitchen and menu', pages), null); // two pages
});

test("the brief's requests open the shop's real pages", () => {
  const pages = voicePages(everyone);
  assert.equal(matchPage("Show today's sales", pages)?.hash, '#owner');
  assert.equal(matchPage('Return to dashboard', pages)?.hash, '#owner');
  assert.equal(matchPage('go home', pages)?.hash, '');
});

test('Sinhala-English as staff say it: the English words find the page', () => {
  const pages = voicePages(everyone);
  assert.equal(matchPage('ada sales keeyada', pages)?.hash, '#owner');
  assert.equal(matchPage('cash out eka', pages)?.hash, '#cashout');
  // Sinhala script between the words drops out; the English stays.
  assert.equal(matchPage('kitchen එක බලන්න', pages)?.hash, '#kitchen');
});

test("the words Whisper is told to expect are the shop's own", () => {
  assert.match(VOICE_HINT, /Cash out/);
  assert.match(VOICE_HINT, /kottu/);
  assert.doesNotMatch(VOICE_HINT, /Margherita|pizza/i);
  assert.ok(VOICE_HINT.length < 400, 'Whisper reads only the last part of a long prompt');
});

test('a page the person may not open is never matched', () => {
  assert.equal(matchPage('settings', voicePages(cashier)), null);
  assert.equal(matchPage("today's sales", voicePages(cashier)), null);
});
