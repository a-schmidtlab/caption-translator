# Excel Translation Tool - Technical Specification

## Overview
A command-line application that processes large Excel files to translate German text content to English using the LibreTranslate API.

## Setup

### LibreTranslate Setup
The application uses LibreTranslate for translations, which can be run locally using Docker:

```bash
# Pull and run LibreTranslate container with German-English only
docker run -d -p 5555:5000 --name libretranslate -e LT_LOAD_ONLY=de,en libretranslate/libretranslate
```

The local LibreTranslate instance will be available at `http://localhost:5555`. No API key is required for local usage.

## Core Requirements

### File Processing
- Processes individual Excel files (.xlsx/.xls)
- Handles large-scale Excel files efficiently through stream processing
- Preserves original file structure and content
- Creates a new output file rather than modifying the original

### Column Identification and Creation
- Scans the header row for columns ending with '_DE'
- For each identified German column, creates a corresponding English column
  - Example: 'product_description_DE' → 'product_description_EN'
- Places new English columns adjacent to their German counterparts
- Maintains all non-translated columns unchanged

### Translation Processing
- Integration with LibreTranslate API (local or remote)
- Source language: German (DE)
- Target language: English (EN)
- Processes cells sequentially to manage API load
- Implements error handling for API failures
- Includes retry mechanism for failed translations

### Performance Considerations
- Implements batched processing for large files
- Uses memory-efficient file reading techniques
- Implements progress tracking for long-running translations
- Provides status updates during processing

### Error Handling
- Validates input file format and accessibility
- Verifies column header structure
- Handles API connection issues gracefully
- Logs translation failures for review
- Preserves partial progress in case of interruption

## Command Line Interface
```bash
excel-translator <input_file>
```

### Output
- Creates a new Excel file with the translated columns in the same directory as the input file
- Original filename format: `original_name_translated.xlsx`
- Maintains all Excel formatting and formulas
- Includes processing summary upon completion

## Technical Implementation Details

### Architecture Overview
The tool is built using Node.js and follows a modular architecture with the following main components:

1. **Excel Processing Module**
   - Uses `xlsx` library for Excel file operations
   - Implements streaming for large file handling
   - Converts Excel data to JSON for processing
   - Maintains workbook structure and formatting

2. **Translation Service**
   - Interfaces with LibreTranslate API
   - Handles HTTP requests using `node-fetch`
   - Implements retry logic for failed requests
   - Manages request rate limiting

3. **Progress Tracking**
   - Uses `cli-progress` for real-time progress display
   - Calculates total operations needed
   - Shows completion percentage and ETA

### Data Flow
1. **Input Processing**
   ```
   Excel File → XLSX Parser → JSON Data Structure
   ```
   - Reads Excel file using `readFile` from xlsx library
   - Converts to JSON maintaining column relationships
   - Validates file structure and content

2. **Column Analysis**
   ```
   JSON Headers → Filter '_DE' Columns → Create '_EN' Mappings
   ```
   - Scans first row for column headers
   - Identifies German columns (ending in '_DE')
   - Creates mapping for English columns

3. **Translation Pipeline**
   ```
   Row → German Text → API Request → English Text → Updated Row
   ```
   - Processes each row sequentially
   - Extracts German text from '_DE' columns
   - Sends translation requests to LibreTranslate
   - Stores English translations in new '_EN' columns

4. **Output Generation**
   ```
   Updated JSON → Excel Worksheet → Formatted Output File
   ```
   - Converts processed JSON back to Excel format
   - Maintains original formatting and formulas
   - Creates new file with '_translated' suffix

### Error Handling Strategy
1. **File Operations**
   - Validates file existence and permissions
   - Checks file format compatibility
   - Ensures sufficient disk space for output

2. **Translation Errors**
   - Implements exponential backoff for retries
   - Logs failed translations for review
   - Continues processing on non-fatal errors

3. **API Communication**
   - Handles network timeouts and errors
   - Validates API responses
   - Provides meaningful error messages

### Performance Optimizations
1. **Memory Management**
   - Uses streaming for large files
   - Implements batch processing
   - Garbage collects processed data

2. **API Efficiency**
   - Reuses HTTP connections
   - Implements request queuing
   - Optimizes payload size

3. **Progress Tracking**
   - Updates progress bar efficiently
   - Calculates accurate ETAs
   - Minimizes console output overhead

### Configuration
The tool uses environment variables for configuration:
```
LIBRETRANSLATE_API_URL=http://localhost:5555  # API endpoint
LT_LOAD_ONLY=de,en                           # Language pair limitation
```

### Dependencies
- `xlsx`: Excel file processing
- `node-fetch`: HTTP requests
- `cli-progress`: Progress visualization
- `dotenv`: Environment configuration

### Future Improvements
1. **Scalability**
   - Implement parallel processing
   - Add batch translation support
   - Optimize memory usage for larger files

2. **Reliability**
   - Add checkpointing for long operations
   - Implement automatic recovery
   - Add detailed logging system

3. **Features**
   - Support additional file formats
   - Add custom column mapping
   - Implement translation memory 