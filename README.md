# Excel Translation Tool

A high-performance Node.js tool for translating Excel files from German to English using LibreTranslate.

## Features

- Parallel processing with optimized batch translation
- Automatic CPU and memory optimization
- Progress tracking and checkpointing
- Resume capability after interruption
- Memory-efficient processing of large files
- Intelligent error handling and retries

## Prerequisites

- Node.js (v14 or higher)
- Docker
- Excel files in the correct format

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/excel-translator.git
cd excel-translator
```

2. Install dependencies:
```bash
npm install
```

3. Set up LibreTranslate:
```bash
docker run -d -p 5555:5000 --name libretranslate -e LT_LOAD_ONLY=de,en libretranslate/libretranslate
```

## Usage

```bash
node --expose-gc src/index.js <excel-file> [--test] [--dry-run]
```

Options:
- `--test`: Process only first 10 rows (test mode)
- `--dry-run`: Estimate processing time without translating
- `--expose-gc`: Enable manual garbage collection (recommended)

## Parallelization Strategy

The tool employs a sophisticated multi-level parallelization strategy to maximize performance while maintaining stability:

### 1. Batch Processing
- Texts are grouped into batches based on length
- Default batch size is optimized based on CPU cores
- Adaptive batch sizing prevents memory overflow
- Configurable via `BATCH_SIZE` setting

### 2. Parallel Execution
- Multiple batches are processed concurrently
- Number of parallel batches scales with CPU cores
- Default parallel batches: 20 for 12-core systems
- Configurable via `PARALLEL_BATCHES` setting

### 3. Sub-batch Processing
- Each batch is split into smaller sub-batches
- Sub-batches are processed in parallel with staggered starts
- Prevents API overload while maintaining throughput
- 3 sub-batches per batch by default

### 4. Connection Pooling
- HTTP connection pooling for efficient API usage
- Keeps connections alive for better performance
- Limited to 10 concurrent sockets
- Configurable timeout settings

### 5. Memory Management
- Regular garbage collection
- Memory usage monitoring
- Automatic cleanup of completed batches
- Configurable memory thresholds

### 6. Error Handling
- Exponential backoff for retries
- Individual batch recovery
- Timeout protection
- Checkpoint system for progress preservation

## Performance Optimization

The tool automatically optimizes its settings based on your system:

### CPU Optimization
- Detects available CPU cores
- Adjusts parallel processing accordingly
- Special optimization for 12-core systems
- Dynamic adjustment based on system load

### Memory Optimization
- Monitors available system memory
- Adjusts batch sizes based on memory
- Automatic garbage collection
- Memory-efficient data structures

### I/O Optimization
- Streaming file processing
- Efficient checkpoint system
- Batched file writes
- Progress persistence

## Project Structure

```
excel-translator/
├── src/
│   ├── index.js        # Main application file
│   ├── config.js       # Configuration and settings
│   ├── translator.js   # Translation service
│   ├── checkpoint.js   # Progress management
│   ├── excel.js        # Excel file handling
│   └── utils.js        # Utility functions
├── logs/               # Log files
├── output/             # Translated files
├── checkpoints/        # Progress checkpoints
├── package.json
└── README.md
```

## Configuration

The tool automatically configures itself based on your system resources. Key configuration options in `src/config.js`:

```javascript
{
    BATCH_SIZE: 3,                // Texts per batch
    PARALLEL_BATCHES: 20,         // Concurrent batches
    MAX_RETRIES: 5,              // Retry attempts
    RETRY_DELAY: 1000,           // Ms between retries
    BATCH_DELAY: 500,            // Ms between batches
    CHUNK_SIZE: 50,              // Texts per chunk
    MAX_TEXT_LENGTH: 5000,       // Max text length
    CHECKPOINT_INTERVAL: 100,    // Save frequency
    SAVE_INTERVAL: 1000          // Excel save frequency
}
```

## License

This work is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License.

## Handling Large Excel Files

Due to file size limitations in Git, Excel files are not stored in the repository. Here's how to handle them:

### Input Files
- Place your input Excel file in the project directory
- The file will be automatically ignored by Git
- Share input files via alternative methods (Dropbox, Google Drive, etc.)

### Output Files
The tool generates several types of files:
1. **Intermediate results** (`*_translated.xlsx`)
   - Created every 1000 rows
   - Used for progress tracking
   - Not stored in Git

2. **Checkpoint files** (`*.xlsx.checkpoint`)
   - Contains translation progress
   - Used for resuming interrupted translations
   - Not stored in Git

3. **Final output** (`*_translated_FINAL.xlsx`)
   - Complete translation results
   - Share via file sharing services

### Transferring to Another Computer

To continue translation on a different computer:
1. Copy these files to the new computer:
   - Your input Excel file
   - The latest `*_translated.xlsx` file
   - The `.xlsx.checkpoint` file
   - The entire project folder

2. Follow the installation steps above
3. Run the translation command with the same input file
4. The tool will automatically detect and resume from the last checkpoint

## Troubleshooting

If the translation process stops:
1. Check `translation.log` for errors
2. Verify LibreTranslate container is running:
   ```bash
   docker ps | grep libretranslate
   ```
3. Restart from last checkpoint if needed

## Contributing

Please note that Excel files should not be committed to the repository. Use the provided `.gitignore` settings.
