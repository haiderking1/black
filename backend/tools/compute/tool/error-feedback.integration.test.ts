import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executePlan } from './testing/execute.ts';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function temporary() {
  const path = await mkdtemp(join(tmpdir(), 'black-compute-feedback-'));
  directories.push(path);
  return path;
}

test('trailing semicolon feedback explains the fix and confirms no side effects', async () => {
  const cwd = await temporary();
  const body = 'async () => {\n await workspace.write({ path: "marker", content: "once" });\n return 42;\n}';
  const failed = await executePlan(cwd, body + ';');
  expect(failed.isError).toBe(true);
  const text = failed.content[0].text;
  expect(text).toContain('Nothing ran');
  expect(text).toContain('semicolon after the closing brace');
  expect(text).toContain('Semicolons inside the body are valid');
  expect(text).toContain('SyntaxError');
  expect(text).toContain('[plan line 4]');
  expect(await readdir(cwd)).toEqual([]);
  const fixed = await executePlan(cwd, body);
  expect(fixed.isError).not.toBe(true);
  expect(fixed.content[0].text).toBe('42');
  expect(await readFile(join(cwd, 'marker'), 'utf8')).toBe('once');
}, 20000);

test('runtime SyntaxError preserves completed writes and warns against replay', async () => {
  const cwd = await temporary();
  const result = await executePlan(cwd, 'async () => {\n await workspace.write({ path: "marker", content: "once" });\n return JSON.parse("invalid");\n}');
  expect(result.isError).toBe(true);
  const text = result.content[0].text;
  expect(text).toContain('SyntaxError');
  expect(text).toContain('Plan execution failed');
  expect(text).toContain('Earlier operations may have succeeded');
  expect(text).not.toContain('Nothing ran');
  expect(text).toContain('[plan line 3');
  expect(result.details.codeModeCalls).toHaveLength(1);
  expect(await readFile(join(cwd, 'marker'), 'utf8')).toBe('once');
}, 20000);

test('provider failures retain method identity alongside recovery guidance', async () => {
  const result = await executePlan(await temporary(), 'async () => await workspace.read({ path: "missing.txt" })');
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain('workspace.read');
  expect(result.content[0].text).toContain('completed-call trace and current state');
  expect(result.content[0].text).not.toContain('Nothing ran');
}, 20000);
