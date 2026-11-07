import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { scanForSecrets } from '../src/scanner.js';
import { scanLargeFiles, GITHUB_BLOCK_FILE_SIZE_BYTES } from '../src/large-files.js';
import { detectProjectTypes, ensureSmartGitignore } from '../src/gitignore.js';
import { runDoctorAudit } from '../src/doctor.js';

describe('push-to-github Test Suite', () => {

  test('Secrets Scanner: should detect high-risk API keys', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptg-test-secrets-'));
    try {
      const dummyFile = path.join(tempDir, 'config.js');
      fs.writeFileSync(dummyFile, 'const key = "AIzaSyD-fakeKeyExample1234567890123";\n', 'utf-8');

      const found = scanForSecrets(tempDir);
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0].type, 'Google Gemini / API Key');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('Secrets Scanner: should ignore safe files without secrets', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptg-test-safe-'));
    try {
      const dummyFile = path.join(tempDir, 'hello.txt');
      fs.writeFileSync(dummyFile, 'console.log("Hello, World!");\n', 'utf-8');

      const found = scanForSecrets(tempDir);
      assert.strictEqual(found.length, 0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('Large Files Scanner: should identify files exceeding GitHub limits', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptg-test-large-'));
    try {
      const dummyFile = path.join(tempDir, 'big-dataset.bin');
      // Crea file simulato di 52MB tramite sparse file / truncate
      const fd = fs.openSync(dummyFile, 'w');
      fs.ftruncateSync(fd, 52 * 1024 * 1024);
      fs.closeSync(fd);

      const found = scanLargeFiles(tempDir);
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0].isOverHardLimit, false);
      assert.ok(found[0].formattedSize.includes('52 MB'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('Smart .gitignore: should detect Node.js stack and generate correct exclusions', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptg-test-ignore-'));
    try {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}', 'utf-8');
      const types = detectProjectTypes(tempDir);
      assert.ok(types.includes('node'));

      const result = ensureSmartGitignore(tempDir);
      assert.strictEqual(result.created, true);

      const createdContent = fs.readFileSync(path.join(tempDir, '.gitignore'), 'utf-8');
      assert.ok(createdContent.includes('node_modules/'));
      assert.ok(createdContent.includes('.env'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('Doctor Audit: should compute health score and checks', () => {
    const report = runDoctorAudit(process.cwd());
    assert.ok(typeof report.score === 'number');
    assert.ok(report.score >= 0 && report.score <= 100);
    assert.ok(Array.isArray(report.checks));
    assert.ok(report.checks.length >= 5);
  });

});
