# git2txt

Convert GitHub repositories to text files with ease. This CLI tool downloads a repository and concatenates its contents into a single text file, making it perfect for analysis, documentation, or AI training purposes.

![Screenshot](https://github.com/user-attachments/assets/846fcec4-5919-44c7-956d-ca0ee6384c77)

## Features

- 📥 Download any public GitHub repository
- 🔒 Process local Git repositories (including private ones)
- 📝 Convert repository contents to a single text file
- ⚡ Automatic binary file exclusion
- 🔧 Configurable file size threshold
- 💻 Cross-platform support (Windows, macOS, Linux)

## Installation

```bash
npm install -g git2txt
```

## Usage

You can specify the repository in several formats:

```bash
# Full HTTPS URL
git2txt https://github.com/username/repository

# Short format (username/repository)
git2txt username/repository

# SSH format
git2txt git@github.com:username/repository

# Local repository path (requires --local flag)
git2txt /path/to/local/repo --local
```

### URL Format Support

The tool accepts these GitHub repository URL formats:

- HTTPS URLs: `https://github.com/username/repository`
- Short format: `username/repository`
- SSH URLs: `git@github.com:username/repository`
- URLs with or without `.git` suffix
- URLs with or without trailing slashes
- Local paths with `--local` flag: `/path/to/repo` or `./relative/path`

### Options

```
--output, -o     Specify output file path (default: repo-name.txt)
--threshold, -t  Set file size threshold in MB (default: 0.1)
--include-all    Include all files regardless of size or type
--local         Process local repository path
--debug         Enable debug mode with verbose logging
--help          Show help
--version       Show version
```

### Examples

Download and convert a repository using different formats:
```bash
# Using HTTPS URL
git2txt https://github.com/username/repository

# Using short format
git2txt username/repository

# Using SSH URL
git2txt git@github.com:username/repository

# With custom output file
git2txt username/repository --output=output.txt

# With custom file size threshold (2MB)
git2txt username/repository --threshold=2

# Include all files (no size/type filtering)
git2txt username/repository --include-all

# Enable debug output
git2txt username/repository --debug

# Using local repository path
git2txt /path/to/local/repo --local

# Local repository with custom output
git2txt ./my-repo --local --output=output.txt

# Local repository with custom threshold
git2txt ./my-repo --local --threshold=2
```

## Default Behavior

- Files larger than 100KB are excluded by default
- Binary files are automatically excluded
- The output file is created in the current directory named after the repository
- Files are processed recursively through all subdirectories (excluding node_modules and .git)
- File paths and contents are separated by clear markers
- Relative paths are preserved in the output

## Output Format

The tool generates a text file with this format:

```
================================================================================
File: path/to/file.txt
Size: 1.2 KB
================================================================================

[File contents here]

================================================================================
File: another/file.js
Size: 4.5 KB
================================================================================

[File contents here]
```

## Contributing

Contributions are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT