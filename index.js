#!/usr/bin/env node

/**
 * git2txt - A command-line tool to convert GitHub repositories into readable text files
 * 
 * This tool clones a GitHub repository, processes its text files, and combines them
 * into a single output file. It's useful for code review, analysis, and documentation
 * purposes.
 * 
 * Features:
 * - Supports public GitHub repositories
 * - Filters binary and large files
 * - Customizable file size threshold
 * - Debug mode for troubleshooting
 * - Progress indicators for long operations
 * 
 * @module git2txt
 */

import meow from 'meow';
import ora from 'ora';
import chalk from 'chalk';
import { glob } from 'glob';
import fs from 'node:fs'; // Corrected import for fs
import { promises as fsp } from 'node:fs'; // Corrected import for fs.promises
import path from 'path';
import { fileURLToPath } from 'url';
import { filesize as formatFileSize } from 'filesize';
import { isBinaryFile } from 'isbinaryfile';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// CLI help text with usage instructions and examples
const helpText = `
  ${chalk.bold('Usage')}
    $ git2txt <repository-url>

  ${chalk.bold('Options')}
    --output, -o     Specify output file path
    --threshold, -t  Set file size threshold in MB (default: 0.5)
    --include-all    Include all files regardless of size or type
    --debug         Enable debug mode with verbose logging
    --help          Show help
    --version       Show version
    --local         Specify path to local repository

  ${chalk.bold('Examples')}
    $ git2txt https://github.com/username/repository
    $ git2txt https://github.com/username/repository --output=output.txt
    $ git2txt --local /path/to/local/repo
`;

/**
 * Custom exit function that handles both production and test environments
 * @param {number} code - Exit code to return
 * @throws {Error} In test environment instead of exiting
 */
const exit = (code) => {
    if (process.env.NODE_ENV === 'test') {
        throw new Error(`Exit called with code: ${code}`);
    } else {
        process.exit(code);
    }
};

// Initialize CLI parser with meow
export const cli = meow(helpText, {
    importMeta: import.meta,
    flags: {
        output: {
            type: 'string',
            shortFlag: 'o'
        },
        threshold: {
            type: 'number',
            shortFlag: 't',
            default: 0.1
        },
        includeAll: {
            type: 'boolean',
            default: false
        },
        debug: {
            type: 'boolean',
            default: false
        },
        local: {
            type: 'string'
        }
    }
});

/**
 * Normalizes various GitHub URL formats to a consistent format
 * @param {string} url - The GitHub repository URL to normalize
 * @returns {string} Normalized GitHub URL
 * @throws {Error} If URL format is invalid
 */
function normalizeGitHubUrl(url) {
    try {
        // Remove trailing slashes
        url = url.replace(/\/+$/, '');
        
        // Handle git@ URLs
        if (url.startsWith('git@github.com:')) {
            return url;
        }
        
        // Handle full HTTPS URLs
        if (url.startsWith('https://github.com/')) {
            return url;
        }
        
        // Handle short format (user/repo)
        if (url.match(/^[\w-]+\/[\w-]+$/)) {
            return `https://github.com/${url}`;
        }
        
        throw new Error('Invalid GitHub repository URL format');
    } catch (error) {
        throw new Error(`Invalid GitHub URL: ${url}`);
    }
}

/**
 * Validates the command line input
 * @param {string[]} input - Command line arguments
 * @returns {Promise<string>} Validated repository URL
 * @throws {Error} If input is missing or invalid
 */
export async function validateInput(input) {
    if (cli.flags.local) {
        const localPath = cli.flags.local;
        if (!fs.existsSync(localPath)) {
            throw new Error(`Local path '${localPath}' does not exist.`);
        }
        return localPath;
    }
    if (!input || input.length === 0) {
        throw new Error('Repository URL is required.');
    }

    const url = input[0];
    if (!url.includes('github.com') && !url.match(/^[\w-]+\/[\w-]+$/)) {
        throw new Error('Only GitHub repositories are supported.');
    }

    return url;
}

/**
 * Downloads a GitHub repository to a temporary directory or uses local path
 * @param {string} url - GitHub repository URL or local path
 * @returns {Promise<Object>} Object containing temporary directory path and repository name
 * @throws {Error} If download or local path access fails
 */
export async function downloadRepository(url) {
    const spinner = process.env.NODE_ENV !== 'test' ? ora('Downloading/Accessing repository...').start() : null;
    let tempDir;
    let repoName;

    try {
        if (url.startsWith('http')) {
            // Normalize the GitHub URL
            const normalizedUrl = normalizeGitHubUrl(url);
            repoName = url.split('/').pop().replace('.git', '');
            tempDir = path.join(os.tmpdir(), `git2txt-${Date.now()}`);
            
            if (cli.flags.debug) {
                console.log(chalk.blue('Debug: Normalized URL:'), normalizedUrl);
                console.log(chalk.blue('Debug: Temp directory:'), tempDir);
            }

            // Create temp directory
            await fsp.mkdir(tempDir, { recursive: true });

            // Clone the repository
            const cloneCommand = `git clone --depth 1 ${normalizedUrl} ${tempDir}`;
            
            if (cli.flags.debug) {
                console.log(chalk.blue('Debug: Executing command:'), cloneCommand);
            }

            await execAsync(cloneCommand, {
                maxBuffer: 1024 * 1024 * 100 // 100MB buffer
            });
        } else {
            // Use local path directly
            tempDir = url;
            repoName = path.basename(path.resolve(url)); // Get the actual name of the directory
            if (cli.flags.debug) {
                console.log(chalk.blue('Debug: Using local path:'), tempDir);
            }
            const files = await fsp.readdir(tempDir);
            if (files.length === 0) {
                throw new Error(`Local path '${tempDir}' appears to be empty.`);
            }
        }
        
        // Verify the download/access
        

        if (spinner) spinner.succeed('Repository accessed successfully');
        return { tempDir, repoName };
    } catch (error) {
        if (spinner) spinner.fail('Failed to access repository');
        
        if (cli.flags.debug) {
            console.log(chalk.blue('Debug: Full error:'), error);
        }
        
        if (process.env.NODE_ENV !== 'test') {
            console.error(chalk.red('Error: Could not access the repository. Please check:'));
            if (url.startsWith('http')) {
                console.error(chalk.yellow('  1. The repository exists and is public'));
                console.error(chalk.yellow('  2. You have the correct repository URL'));
                console.error(chalk.yellow('  3. GitHub is accessible from your network'));
                console.error(chalk.yellow('  4. Git is installed and accessible from command line'));
            } else {
                console.error(chalk.yellow('  1. The repository exists'));
                console.error(chalk.yellow('  2. You have the correct path'));
            }
        }
        
        await cleanup(tempDir);
        throw error;
    }
}

/**
 * Processes files in the repository directory and combines them into a single text output
 * @param {string} directory - Path to the repository directory
 * @param {Object} options - Processing options
 * @param {number} options.threshold - File size threshold in MB
 * @param {boolean} options.includeAll - Whether to include all files regardless of size/type
 * @returns {Promise<string>} Combined content of all processed files
 * @throws {Error} If file processing fails
 */
export async function processFiles(directory, options) {
    let spinner = process.env.NODE_ENV !== 'test' ? ora('Processing files...').start() : null;
    const thresholdBytes = options.threshold * 1024 * 1024;
    
    try {
        const output = await processDirectory(directory, options);
        if (spinner) {
            spinner.succeed(`Processed ${output.processedFiles} files successfully (${output.skippedFiles} skipped)`);
        }
        return output.content;
    } catch (error) {
        if (spinner) {
            spinner.fail('Failed to process files');
        }
        throw error;
    }
}

/**
 * Recursively processes files in a directory
 * @param {string} dir - Directory to process
 * @param {Object} options - Processing options
 * @returns {Promise<{content: string, processedFiles: number, skippedFiles: number}>}
 */
export async function processDirectory(dir, options) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    console.log(`Found ${entries.length} entries in ${dir}`);
    let output = '';
    let processedFiles = 0;
    let skippedFiles = 0;

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
            const result = await processDirectory(fullPath, options);
            output += result.content;
            processedFiles += result.processedFiles;
            skippedFiles += result.skippedFiles;
            continue;
        }

        if (!entry.isFile()) {
            console.log('Skipping non-file:', fullPath);
            continue;
        }

        try {
            const stats = await fsp.stat(fullPath);

            // Skip if file is too large and we're not including all files
            if (!options.includeAll && stats.size > options.threshold * 1024 * 1024) {
                if (process.env.DEBUG) console.log(`Skipping large file: ${entry.name}`);
                skippedFiles++;
                continue;
            }

            // Skip binary files unless includeAll is true
            if (!options.includeAll) {
                if (await isBinaryFile(fullPath)) {
                    if (process.env.DEBUG) console.log(`Skipping binary file: ${entry.name}`);
                    skippedFiles++;
                    continue;
                }
            }

            const content = await fsp.readFile(fullPath, 'utf8');
            const relativePath = path.relative(dir, fullPath);

            output += `\n${'='.repeat(80)}\n`;
            output += `File: ${relativePath}\n`;
            output += `Size: ${formatFileSize(stats.size)}\n`;
            output += `${'='.repeat(80)}\n\n`;
            output += `${content}\n`;

            processedFiles++;

            if (process.env.DEBUG) {
                console.log(`Processed file: ${relativePath}`);
            }
        } catch (error) {
            console.log('Error occurred:', error);
            if (process.env.DEBUG) {
                console.error(`Error processing ${entry.name}:`, error);
            }
            skippedFiles++;
        }
    }

    console.log(`Processed ${processedFiles} files, skipped ${skippedFiles} in ${dir}`);

    return { content: output, processedFiles, skippedFiles };
}

/**
 * Writes the processed content to an output file
 * @param {string} content - Content to write
 * @param {string} outputPath - Path to the output file
 * @returns {Promise<void>}
 * @throws {Error} If writing fails
 */
export async function writeOutput(content, outputPath) {
    let spinner = process.env.NODE_ENV !== 'test' ? ora('Writing output file...').start() : null;

    try {
        await fsp.writeFile(outputPath, content);
        if (spinner) spinner.succeed(`Output saved to ${chalk.green(outputPath)}`);
    } catch (error) {
        if (spinner) spinner.fail('Failed to write output file');
        if (process.env.NODE_ENV !== 'test') {
            console.error(chalk.red('Write error:'), error);
        }
        throw error;
    }
}

/**
 * Cleans up temporary files and directories
 * @param {string} directory - Directory to clean up
 * @returns {Promise<void>}
 */
export async function cleanup(directory) {
    try {
        // Skip cleanup if the directory is the current temp directory used by processFiles test
        if (process.env.NODE_ENV === 'test' && directory === process.env.TEMP_DIR) {
            console.log(`Skipping cleanup for temp directory used by processFiles test: ${directory}`);
            return;
        }

        if (directory && directory !== '.') { // Avoid cleaning up the current working directory
            await fsp.rm(directory, { recursive: true, force: true });
        }
    } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
            console.error(chalk.yellow('Warning: Failed to clean up temporary files'));
        }
    }
}

/**
 * Main application function that orchestrates the entire process
 * @returns {Promise<void>}
 */
export async function main() {
    let tempDir;
    try {
        const url = await validateInput(cli.input);
        if (process.env.NODE_ENV !== 'test') {
            const result = await downloadRepository(url);
            tempDir = result.tempDir;
            
            const outputPath = cli.flags.output || `${result.repoName}.txt`;
            const content = await processFiles(tempDir, {
                threshold: cli.flags.threshold,
                includeAll: cli.flags.includeAll
            });

            if (!content) {
                throw new Error('No content was generated from the repository');
            }

            await writeOutput(content, outputPath);
        }
    } catch (error) {
        if (process.env.NODE_ENV === 'test') {
            throw error;
        } else {
            console.error(chalk.red('\nAn unexpected error occurred:'));
            console.error(error.message || error);
            exit(1);
        }
    } finally {
        await cleanup(tempDir);
    }
}

// Only run main if not in test environment
if (process.env.NODE_ENV !== 'test') {
    main();
}
