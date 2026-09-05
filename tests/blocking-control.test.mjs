import test from 'node:test';
import assert from 'node:assert/strict';
import {
  durationLabel,
  pauseSelection,
  remainingSeconds,
} from '../lib/blocking-control.mjs';
import { fixtureFetch } from './fixtures/pihole-fixture.mjs';

test('pause picker translates presets, custom units and explicit indefinite choice', () => {
  assert.deepEqual(pauseSelection('indefinite'), {
    timer: null,
    label: 'indefinitely',
  });
  for (const value of ['10', '30', '60', '300', '1800', '3600'])
    assert.equal(pauseSelection(value).timer, Number(value));
  assert.equal(pauseSelection('custom', '45', 'seconds').timer, 45);
  assert.equal(pauseSelection('custom', '7', 'minutes').timer, 420);
  assert.equal(pauseSelection('custom', '24', 'hours').timer, 86400);
});

test('invalid duration cannot silently disable blocking indefinitely', () => {
  for (const value of [
    '',
    '0',
    '-1',
    '0.5',
    '1e3',
    'Infinity',
    'NaN',
    ' 5 ',
    '86401',
  ]) {
    assert.ok(pauseSelection('custom', value, 'seconds').error);
    assert.ok(pauseSelection(value).error);
  }
  assert.ok(pauseSelection('custom', '25', 'hours').error);
  assert.ok(pauseSelection('custom', '1', 'days').error);
});

test('countdown is readable and elapsed time never produces negative values', () => {
  assert.equal(durationLabel(3661), '1 hour 1 minute 1 second');
  assert.equal(durationLabel(90), '1 minute 30 seconds');
  assert.equal(durationLabel(0), '0 seconds');
  assert.equal(remainingSeconds(10, 1500), 9);
  assert.equal(remainingSeconds(10, 12000), 0);
  assert.equal(remainingSeconds(10, -1000), 10);
});

test('synthetic engine resumes on expiry without a browser and indefinite pause cancels a timer', async () => {
  let now = 10000;
  const api = fixtureFetch({ clock: () => now });
  const read = async () =>
    (await api.request('http://fixture.example/api/dns/blocking')).json();
  const post = async (blocking, timer) =>
    api.request('http://fixture.example/api/dns/blocking', {
      method: 'POST',
      body: JSON.stringify({ blocking, timer }),
    });
  await post(false, 10);
  now += 4000;
  assert.deepEqual(await read(), { blocking: 'disabled', timer: 6 });
  now += 7000;
  assert.deepEqual(await read(), { blocking: 'enabled', timer: null });
  await post(false, 10);
  await post(false, null);
  now += 20000;
  assert.deepEqual(await read(), { blocking: 'disabled', timer: null });
  await post(true, null);
  assert.deepEqual(await read(), { blocking: 'enabled', timer: null });
});
