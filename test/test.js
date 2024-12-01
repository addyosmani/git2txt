import test from 'ava';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

// Import the functions and CLI to test
import {
    validateInput,
    writeOutput,
    cleanup,
    main,
    cli
} from '../index.js';

// Helper function to create test file and verify its existence
async function createTestFile(filepath, content) {
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, content);
    const exists = await fs.access(filepath).then(() => true).catch(() => false);
    if (!exists) {
        throw new Error(`Failed to create test file: ${filepath}`);
    }
    return exists;
}

// Setup test environment
test.beforeEach(async t => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    // Store original state
    t.context.originalArgv = process.argv;
    t.context.originalInput = cli.input;
    t.context.originalEnv = process.env.NODE_ENV;
    
    // Create temp directory
    const tempDir = path.join(os.tmpdir(), `git2txt-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    t.context.tempDir = tempDir;
});

// Cleanup after each test
test.afterEach(async t => {
    // Restore original state
    process.argv = t.context.originalArgv;
    cli.input = t.context.originalInput;
    process.env.NODE_ENV = t.context.originalEnv;
    
    // Clean up temp directory
    if (t.context.tempDir) {
        await fs.rm(t.context.tempDir, { recursive: true, force: true }).catch(() => {});
    }
});

test('validateInput throws error on empty input', async t => {
    await t.throwsAsync(
        async () => validateInput([]),
        {
            message: 'Repository URL is required'
        }
    );
});

test('validateInput throws error on non-GitHub URL', async t => {
    await t.throwsAsync(
        async () => validateInput(['https://gitlab.com/user/repo']),
        {
            message: 'Only GitHub repositories are supported'
        }
    );
});

test('validateInput accepts valid GitHub URL', async t => {
    const url = 'https://github.com/octocat/Spoon-Knife';
    const result = await validateInput([url]);
    t.is(result, url);
});

test('writeOutput writes content to file', async t => {
    const outputPath = path.join(t.context.tempDir, 'output.txt');
    const content = 'Test content';
    
    await writeOutput(content, outputPath);
    
    const fileContent = await fs.readFile(outputPath, 'utf8');
    t.is(fileContent, content);
});

test('cleanup removes temporary directory', async t => {
    const tempDir = path.join(t.context.tempDir, 'cleanup-test');
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(path.join(tempDir, 'test.txt'), 'test');
    
    await cleanup(tempDir);
    
    await t.throwsAsync(
        () => fs.access(tempDir),
        { code: 'ENOENT' }
    );
});

test('main function handles missing URL', async t => {
    // Ensure test environment
    process.env.NODE_ENV = 'test';
    // Clear CLI input
    cli.input = [];
    
    // Test that main throws correct error
    await t.throwsAsync(
        async () => main(),
        {
            message: 'Repository URL is required'
        }
    );
});