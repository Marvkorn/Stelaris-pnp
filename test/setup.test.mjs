import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { checkPassword } from '../lib/auth.mjs';

test('Lokale Ersteinrichtung und Passwortrettung ohne Standardpasswort oder Datenverlust', async t => {
  const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const root = mkdtempSync(join(tmpdir(), 'sternarchiv-setup-'));
  t.after(() => {
    const parent = resolve(tmpdir());
    assert.ok(resolve(root).startsWith(parent + '\\') || resolve(root).startsWith(parent + '/'));
    assert.ok(root.includes('sternarchiv-setup-'));
    rmSync(root, { recursive: true, force: true });
  });
  mkdirSync(join(root, 'scripts'));
  cpSync(join(source, 'lib'), join(root, 'lib'), { recursive: true });
  cpSync(join(source, 'scripts', 'setup.mjs'), join(root, 'scripts', 'setup.mjs'));
  const runSetup = (args, answers) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, 'scripts', 'setup.mjs'), ...args], { windowsHide: true });
    let output = '', index = 0;
    const timer = setTimeout(() => { child.kill(); reject(new Error('Einrichtung hängt: ' + output)); }, 10000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      if (index < answers.length && output.includes(answers[index][0])) { child.stdin.write(answers[index][1] + '\n'); index++; }
    });
    child.stderr.on('data', chunk => { output += chunk.toString(); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, output }); });
  });
  const password = randomBytes(20).toString('hex');
  const result = await runSetup([], [['Benutzername der Spielleitung:', 'Neue Leitung'], ['Passwort: ', password], ['Passwort wiederholen:', password]]);
  assert.equal(result.code, 0, result.output);
  assert.ok(!result.output.includes(password));
  const db = new DatabaseSync(join(root, 'data', 'sternarchiv.sqlite'));
  try {
    const account = db.prepare('SELECT * FROM users').get(); assert.equal(account.username, 'Neue Leitung'); assert.equal(account.role, 'gm'); assert.ok(checkPassword(password, account.password));
    const second = await runSetup([], []); assert.equal(second.code, 0); assert.ok(second.output.includes('bereits eingerichtet'));
    const next = randomBytes(20).toString('hex');
    const reset = await runSetup(['--reset'], [['Gib JA ein:', 'JA'], ['Passwort: ', next], ['Passwort wiederholen:', next]]);
    assert.equal(reset.code, 0, reset.output); assert.ok(!reset.output.includes(next));
    const updated = db.prepare('SELECT * FROM users').get(); assert.equal(updated.id, account.id); assert.ok(checkPassword(next, updated.password)); assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n, 1);
  } finally { db.close(); }
});
