import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';
import { ROUTES as HOME_ROUTES } from '../src/features/home/navigation/home-routes.js';
import { ROUTES } from '../src/features/profile/navigation/profile-routes.js';

function openProfile(options, stored) {
  const app = createApp(options);
  if (stored) app.container.get('storage').write(`profile.${stored.id}`, stored);
  app.navigator.navigate(HOME_ROUTES.HOME);
  const rendered = app.navigator.navigate(ROUTES.EDIT, { id: stored?.id ?? 'u1' });
  return { ...app, screen: app.screens.profile.edit, rendered };
}

const ADA = { id: 'u1', displayName: 'Ada', bio: 'Math', joined: '2026-01-02' };

test('the edit screen is registered under profile/edit with a title', () => {
  const { navigator, screen } = openProfile();
  assert.ok(navigator.routes().includes('profile/edit'));
  assert.equal(screen.title, 'Edit profile');
});

test('rendering with the id of a stored profile shows its values', () => {
  const { rendered } = openProfile({}, ADA);
  assert.match(rendered, /Ada/);
  assert.match(rendered, /Math/);
});

test('rendering with an unknown id shows empty fields', () => {
  const { rendered } = openProfile();
  assert.match(rendered, /^Display name \[[^\]]+\]: $/m);
  assert.match(rendered, /^Bio \[[^\]]+\]: $/m);
});

test('a blank display name is refused and nothing is stored', () => {
  const { navigator, container, screen } = openProfile({}, ADA);
  screen.set('displayName', '   ');
  const result = screen.save();
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors), ['displayName']);
  assert.deepEqual(container.get('storage').read('profile.u1'), ADA);
  assert.equal(navigator.current(), ROUTES.EDIT);
});

test('a bio longer than 160 characters is refused', () => {
  const { container, screen } = openProfile({}, ADA);
  screen.set('bio', 'x'.repeat(161));
  const result = screen.save();
  assert.deepEqual(Object.keys(result.errors), ['bio']);
  assert.deepEqual(container.get('storage').read('profile.u1'), ADA);
});

test('saving a valid draft stores it merged and returns to home', () => {
  const { navigator, container, screen } = openProfile({}, ADA);
  screen.set('displayName', '  Grace ');
  const result = screen.save();
  assert.equal(result.ok, true);
  assert.deepEqual(container.get('storage').read('profile.u1'), { ...ADA, displayName: 'Grace' });
  assert.equal(navigator.current(), HOME_ROUTES.HOME);
});

test('a save the storage refuses keeps the draft, stays and returns a form message', () => {
  const { navigator, container, screen } = openProfile({}, ADA);
  const storage = container.get('storage');
  const write = storage.write;
  storage.write = () => {
    const error = new Error('quota exceeded');
    error.code = 'storage-full';
    throw error;
  };
  screen.set('displayName', 'Grace');
  const result = screen.save();
  storage.write = write;
  assert.equal(result.ok, false);
  assert.equal(typeof result.errors.form, 'string');
  assert.doesNotMatch(result.errors.form, /quota exceeded/);
  assert.equal(navigator.current(), ROUTES.EDIT);
  assert.deepEqual(storage.read('profile.u1'), ADA);
  assert.match(screen.render({ id: 'u1' }), /Grace/);
});

test('leaving a dirty draft stays on the screen by default', () => {
  const { navigator, screen } = openProfile({}, ADA);
  screen.set('bio', 'Physics');
  assert.equal(screen.leave(), false);
  assert.equal(navigator.current(), ROUTES.EDIT);
});

test('leaving a dirty draft goes back when the discard is confirmed', () => {
  const { navigator, screen } = openProfile({ confirmDiscard: () => true }, ADA);
  screen.set('bio', 'Physics');
  screen.leave();
  assert.equal(navigator.current(), HOME_ROUTES.HOME);
});

test('leaving a clean draft goes back without asking', () => {
  let asked = false;
  const { navigator, screen } = openProfile({ confirmDiscard: () => { asked = true; return false; } }, ADA);
  screen.leave();
  assert.equal(asked, false);
  assert.equal(navigator.current(), HOME_ROUTES.HOME);
});
