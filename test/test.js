import test from 'ava';
import path from 'path';
import { promises as fsp } from 'node:fs'; // Corrected import for fs.promises
import os from 'os';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

// Import the functions and CLI to test
import {
    validateInput,
    processFiles,
    writeOutput,
    cleanup,
    main,
    cli,
    processDirectory
} from '../index.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper function to create test file and verify its existence
async function createTestFile(filepath, content) {
    try {
        await fsp.mkdir(path.dirname(filepath), { recursive: true });
        await fsp.writeFile(filepath, content);
        return true;
    } catch (error) {
        console.error(`Error creating test file ${filepath}:`, error);
        return false;
    }
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
    await fsp.mkdir(tempDir, { recursive: true });
    t.context.tempDir = tempDir;
});

// Cleanup after each test
test.afterEach.always(async t => {
    // Restore original state
    process.argv = t.context.originalArgv;
    cli.input = t.context.originalInput;
    process.env.NODE_ENV = t.context.originalEnv;
    
    // Clean up temp directory
    if (t.context.tempDir) {
        await fsp.rm(t.context.tempDir, { recursive: true, force: true }).catch(() => {});
    }
});

test.serial('validateInput throws error on empty input', async t => {
    await t.throwsAsync(
        async () => validateInput([]),
        {
            message: 'Repository URL is required.'
        }
    );
});

test.serial('validateInput throws error on non-GitHub URL', async t => {
    await t.throwsAsync(
        async () => validateInput(['https://gitlab.com/user/repo']),
        {
            message: 'Only GitHub repositories are supported.'
        }
    );
});

test.serial('validateInput accepts valid GitHub URL', async t => {
    const url = 'https://github.com/octocat/Spoon-Knife';
    const result = await validateInput([url]);
    t.is(result, url);
});

test.serial('writeOutput writes content to file', async t => {
    const outputPath = path.join(t.context.tempDir, 'output.txt');
    const content = 'Test content';
    
    await writeOutput(content, outputPath);
    
    const fileContent = await fsp.readFile(outputPath, 'utf8');
    t.is(fileContent, content);
});

test.serial('cleanup removes temporary directory', async t => {
    const tempDir = path.join(t.context.tempDir, 'cleanup-test');
    await fsp.mkdir(tempDir, { recursive: true });
    await fsp.writeFile(path.join(tempDir, 'test.txt'), 'test');
    
    await cleanup(tempDir);
    
    await t.throwsAsync(
        () => fsp.access(tempDir),
        { code: 'ENOENT' }
    );
});

test.serial('processFiles processes repository files', async t => {
    const testDir = t.context.tempDir;
    const testContent = 'Hello, world!';
    const testFile = path.join(testDir, 'test.txt');
    const expectedRelativeFilePath = path.relative(testDir, testFile); // Generate expected path

    // Set the TEMP_DIR environment variable for the processFiles test
    process.env.TEMP_DIR = testDir;

    const fileCreated = await createTestFile(testFile, testContent);
    if (!fileCreated) {
        t.fail('Failed to create test file');
        return;
    }

    try {
        const output = await processDirectory(testDir, { threshold: 1, includeAll: true });
        console.log('processFiles output:', output.content);
        if (output.content) { // Check if output.content is not empty
            const expectedRegex = new RegExp(`File:\\s*${expectedRelativeFilePath}`); // Use generated path
            t.regex(output.content, expectedRegex); // Corrected syntax
            t.regex(output.content, /Hello, world!/);
        } else {
            t.fail('processFiles returned empty output');
        }
    } catch (error) {
        console.error("Error in processFiles test:", error);
        t.fail(`processFiles test failed unexpectedly: ${error.message}`);
    }
});

test.serial('main function handles missing URL', async t => {
    process.env.NODE_ENV = 'test';
    cli.input = [];
    
    await t.throwsAsync(
        async () => main(),
        {
            message: 'Repository URL is required.'
        }
    );
});
