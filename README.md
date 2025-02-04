# Caption Translator

A Node.js tool for translating large Excel files containing captions from German to English using LibreTranslate.

## Features

- Batch translation of Excel files
- Checkpoint system for resuming interrupted translations
- Progress tracking with intermediate saves
- Handles large files efficiently
- Docker-based translation service

## Prerequisites

- Node.js (v14 or higher)
- Docker
- Excel files in the correct format

## Installation

1. Clone the repository:
```bash
git clone https://github.com/a-schmidtlab/caption-translator.git
cd caption-translator
```

2. Install dependencies:
```bash
npm install
```

3. Start the LibreTranslate service:
```bash
docker run -d -p 5555:5000 --name libretranslate -e LT_LOAD_ONLY=de,en libretranslate/libretranslate
```

## Usage

Run the translation tool:
```bash
node src/index.js "path/to/your/input.xlsx"
```

The tool will:
- Create checkpoints every 1000 rows
- Save intermediate results with "_translated.xlsx" suffix
- Create final output with "_translated_FINAL.xlsx" suffix

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
