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