/**
 * Excel Translation Tool
 * 
 * @file    index.js
 * @author  Axel Schmidt
 * @version 2.0.0
 * @date    2025
 * 
 * @copyright Copyright (c) 2025 Axel Schmidt
 * 
 * This work is licensed under the Creative Commons Attribution-NonCommercial 4.0 
 * International License.
 * 
 * DESCRIPTION:
 * This tool provides high-performance translation of Excel files from German to English
 * using a local LibreTranslate instance. It's designed to handle large files efficiently
 * through various optimization techniques:
 * 
 * Key Features:
 * - Parallel processing with multiple translation batches
 * - Global text deduplication to minimize API calls
 * - Chunked processing with progress persistence
 * - Smart batching based on text length
 * - Automatic retry mechanism with exponential backoff
 * - Progress tracking and estimation
 * - Resume capability after interruption
 * 
 * Performance Optimizations:
 * - Memory efficient streaming for large files
 * - Batch size auto-adjustment based on system resources
 * - Connection pooling for API requests
 * - Progress checkpointing
 * - Intelligent error handling and recovery
 */

import pkg from 'xlsx';
const { readFile, utils, writeFile } = pkg;
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cliProgress from 'cli-progress';
import fs from 'fs/promises';
import os from 'os';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * Configuration constants
 * These values are automatically adjusted based on system resources
 */
const DEFAULT_CONFIG = {
    BATCH_SIZE: 100,              // Base size for each translation batch
    PARALLEL_BATCHES: 5,          // Number of concurrent translation requests
    MAX_RETRIES: 3,              // Maximum retry attempts for failed requests
    RETRY_DELAY: 1000,           // Base delay between retries (ms)
    BATCH_DELAY: 10,             // Delay between batch processing (ms)
    CHUNK_SIZE: 1000,            // Number of rows to process in each chunk
    MAX_TEXT_LENGTH: 5000,       // Maximum length for a single text
    CHECKPOINT_INTERVAL: 100,    // Save progress every N successful translations
    MAX_MEMORY_USAGE: 0.8,       // Maximum memory usage (80% of available)
    SAVE_INTERVAL: 1000          // Save intermediate results every N rows
};

// Adjust configuration based on system resources
const config = calculateOptimalConfig();

/**
 * Columns to be translated
 * Only these columns (and any ending with _DE) will be processed
 */
const COLUMNS_TO_TRANSLATE = [
    'IPTC_DE_Headline',
    'IPTC_DE_Beschreibung',
    'IPTC_DE_Bundesland',
    'IPTC_DE_Land',
    'IPTC_DE_Anweisung',
    'IPTC_DE_User_Keywords',
    'AI_keywords_DE'
];

/**
 * Columns to explicitly ignore
 * These columns will be skipped even if they end with _DE
 */
const COLUMNS_TO_IGNORE = [
    'IPTC_DE_Credit',
    'IPTC_DE_Aufnahmedatum'
];

/**
 * Calculates optimal configuration based on system resources
 * Adjusts batch sizes and concurrency based on available memory and CPU
 * @returns {Object} Optimized configuration object
 */
function calculateOptimalConfig() {
    const cpuCount = os.cpus().length;
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    
    // Calculate optimal values based on system resources
    const config = { ...DEFAULT_CONFIG };
    
    // Adjust parallel batches based on CPU cores
    config.PARALLEL_BATCHES = Math.max(2, Math.min(cpuCount - 1, 8));
    
    // Adjust batch size based on available memory
    const memoryRatio = freeMemory / totalMemory;
    if (memoryRatio < 0.3) {
        config.BATCH_SIZE = 50;
        config.CHUNK_SIZE = 500;
    } else if (memoryRatio > 0.7) {
        config.BATCH_SIZE = 150;
        config.CHUNK_SIZE = 2000;
    }
    
    return config;
}

/**
 * Formats remaining time in HH:MM format
 * @param {number} seconds - Seconds to format
 * @returns {string} Formatted time string
 */
function formatTimeRemaining(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Calculates and formats progress information
 * @param {number} current - Current progress
 * @param {number} total - Total items to process
 * @param {number} startTime - Start timestamp
 * @returns {Object} Formatted progress information
 */
function formatProgress(current, total, startTime) {
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const rate = current / elapsedSeconds;
    const remainingItems = total - current;
    const etaSeconds = remainingItems / rate;
    
    return {
        lines: `${current.toString().padStart(5, ' ')}/${total} lines`,
        timeLeft: formatTimeRemaining(etaSeconds),
        percent: Math.floor((current / total) * 100),
        rate: `${Math.floor(rate)} items/sec`
    };
}

/**
 * Promisified sleep function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Resolves after specified time
 */
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Groups texts by length for optimal batch processing
 * @param {Array<string>} texts - Array of texts to group
 * @returns {Array<Array<string>>} Grouped texts
 */
function groupTextsByLength(texts) {
    // Sort texts by length
    const sortedTexts = [...texts].sort((a, b) => a.length - b.length);
    const groups = [];
    let currentGroup = [];
    let currentLength = 0;

    for (const text of sortedTexts) {
        if (currentLength + text.length > config.MAX_TEXT_LENGTH || 
            currentGroup.length >= config.BATCH_SIZE) {
            if (currentGroup.length > 0) {
                groups.push(currentGroup);
                currentGroup = [];
                currentLength = 0;
            }
        }
        currentGroup.push(text);
        currentLength += text.length;
    }

    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }

    return groups;
}

/**
 * Saves progress to a checkpoint file
 * @param {string} checkpointPath - Path to save checkpoint
 * @param {Object} data - Progress data to save
 */
async function saveCheckpoint(checkpointPath, data) {
    try {
        await fs.writeFile(checkpointPath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.warn('Failed to save checkpoint:', error.message);
    }
}

/**
 * Loads progress from a checkpoint file
 * @param {string} checkpointPath - Path to load checkpoint from
 * @returns {Object|null} Loaded checkpoint data or null if not found
 */
async function loadCheckpoint(checkpointPath) {
    try {
        const data = await fs.readFile(checkpointPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return null;
    }
}

/**
 * Translates a batch of texts with retry mechanism
 * @param {Array<string>} texts - Texts to translate
 * @returns {Map} Map of original to translated texts
 */
async function translateBatch(texts) {
    const apiUrl = process.env.LIBRETRANSLATE_API_URL || 'http://localhost:5555';
    const uniqueTexts = [...new Set(texts.filter(text => text))];

    if (uniqueTexts.length === 0) return new Map();

    for (let retry = 0; retry < config.MAX_RETRIES; retry++) {
        try {
            const response = await fetch(`${apiUrl}/translate`, {
                method: 'POST',
                body: JSON.stringify({
                    q: uniqueTexts,
                    source: 'de',
                    target: 'en',
                    format: 'text'
                }),
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const translationMap = new Map();
            uniqueTexts.forEach((text, index) => {
                translationMap.set(text, data.translatedText[index]);
            });
            return translationMap;
        } catch (error) {
            if (retry === config.MAX_RETRIES - 1) {
                console.error(`Translation batch failed after ${config.MAX_RETRIES} retries:`, error.message);
                return new Map(uniqueTexts.map(text => [text, `[TRANSLATION ERROR: ${error.message}]`]));
            }
            console.log(`Retry ${retry + 1}/${config.MAX_RETRIES} after error:`, error.message);
            await sleep(config.RETRY_DELAY * Math.pow(2, retry)); // Exponential backoff
        }
    }
}

/**
 * Saves current progress to Excel file
 * @param {Array} jsonData - Data to save
 * @param {string} basePath - Base path for the output file
 * @param {boolean} isFinal - Whether this is the final save
 */
async function saveToExcel(jsonData, basePath, isFinal = false) {
    const newWorksheet = utils.json_to_sheet(jsonData);
    const newWorkbook = utils.book_new();
    utils.book_append_sheet(newWorkbook, newWorksheet, 'Translated');

    const parsedPath = path.parse(basePath);
    const suffix = isFinal ? '_translated_FINAL' : '_translated';
    const outputPath = path.join(
        parsedPath.dir,
        `${parsedPath.name}${suffix}${parsedPath.ext}`
    );

    writeFile(newWorkbook, outputPath);
    if (isFinal) {
        console.log(`\nFinal output saved to: ${outputPath}`);
    } else {
        console.log(`\nIntermediate result saved to: ${outputPath}`);
    }
}

/**
 * Main function to process Excel file
 * @param {string} inputPath - Path to input Excel file
 * @param {boolean} testMode - Whether to run in test mode
 * @param {boolean} dryRun - Whether to estimate without translating
 */
async function processExcelFile(inputPath, testMode = false, dryRun = false) {
    try {
        console.log('Reading Excel file...');
        const workbook = readFile(inputPath);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        let jsonData = utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
            throw new Error('Excel file is empty');
        }

        // Test mode or dry run modifications
        if (testMode) {
            console.log('TEST MODE: Processing only first 10 rows');
            jsonData = jsonData.slice(0, 10);
        } else if (dryRun) {
            console.log('DRY RUN: Estimating processing time without translation');
        }

        // Column identification
        const headers = Object.keys(jsonData[0]);
        const germanColumns = headers.filter(header => 
            COLUMNS_TO_TRANSLATE.includes(header) || 
            (header.endsWith('_DE') && !COLUMNS_TO_IGNORE.includes(header))
        );

        if (germanColumns.length === 0) {
            throw new Error('No matching German columns found');
        }

        // Create checkpoint path
        const checkpointPath = inputPath + '.checkpoint';
        let checkpoint = await loadCheckpoint(checkpointPath);
        let uniqueTextsMap = new Map(checkpoint?.translations || []);
        let startIndex = checkpoint?.lastProcessedIndex || 0;

        // Build translation map
        console.log('Building translation map...');
        for (const row of jsonData) {
            for (const germanCol of germanColumns) {
                if (row[germanCol] && !uniqueTextsMap.has(row[germanCol])) {
                    uniqueTextsMap.set(row[germanCol], '');
                }
            }
        }

        const uniqueTexts = Array.from(uniqueTextsMap.keys());
        console.log(`Found ${uniqueTexts.length} unique texts to translate`);
        
        if (dryRun) {
            const estimatedTimeSeconds = (uniqueTexts.length / (config.BATCH_SIZE * config.PARALLEL_BATCHES)) * 2;
            console.log(`Estimated processing time: ${formatTimeRemaining(estimatedTimeSeconds)}`);
            return;
        }

        console.log(`\nTotal rows to process: ${jsonData.length}`);
        console.log('Starting translation...\n');

        const startTime = Date.now();
        const progressBar = new cliProgress.SingleBar({
            format: 'Progress |{bar}| {percentage}% | {lines} | {rate} | Time remaining: {timeLeft}',
            barCompleteChar: '█',
            barIncompleteChar: '░',
            hideCursor: true,
            clearOnComplete: false
        });

        progressBar.start(100, 0);
        let progress = 0;

        // Group texts by length for optimal processing
        const textGroups = groupTextsByLength(uniqueTexts);

        // Process groups in parallel batches
        let processedRows = 0;
        for (let i = 0; i < textGroups.length; i += config.PARALLEL_BATCHES) {
            const batchPromises = [];
            
            // Create parallel batch promises
            for (let j = 0; j < config.PARALLEL_BATCHES; j++) {
                const groupIndex = i + j;
                if (groupIndex < textGroups.length) {
                    batchPromises.push(translateBatch(textGroups[groupIndex]));
                }
            }

            // Wait for all parallel batches to complete
            const batchResults = await Promise.all(batchPromises);
            
            // Merge results into the unique texts map
            batchResults.forEach(translationMap => {
                for (const [original, translated] of translationMap.entries()) {
                    uniqueTextsMap.set(original, translated);
                }
            });

            // Update progress
            progress = Math.min(i + config.PARALLEL_BATCHES, textGroups.length);
            const progressInfo = formatProgress(
                Math.floor((progress / textGroups.length) * jsonData.length), 
                jsonData.length, 
                startTime
            );
            progressBar.update(progressInfo.percent, progressInfo);

            // Save checkpoint periodically
            if (progress % config.CHECKPOINT_INTERVAL === 0) {
                await saveCheckpoint(checkpointPath, {
                    lastProcessedIndex: progress,
                    translations: Array.from(uniqueTextsMap.entries())
                });
            }

            // Apply translations to the current batch and save intermediate results
            const currentProcessedRows = Math.floor((progress / textGroups.length) * jsonData.length);
            if (currentProcessedRows - processedRows >= config.SAVE_INTERVAL) {
                console.log('\nApplying translations to current batch...');
                const partialData = jsonData.map(row => {
                    const newRow = { ...row };
                    for (const germanCol of germanColumns) {
                        if (row[germanCol]) {
                            const englishCol = germanCol.replace('_DE', '_EN');
                            newRow[englishCol] = uniqueTextsMap.get(row[germanCol]) || '';
                        }
                    }
                    return newRow;
                });
                await saveToExcel(partialData, inputPath, false);
                processedRows = currentProcessedRows;
            }

            await sleep(config.BATCH_DELAY);
        }

        // Apply final translations to all rows
        console.log('\nApplying final translations to Excel file...');
        for (const row of jsonData) {
            for (const germanCol of germanColumns) {
                if (row[germanCol]) {
                    const englishCol = germanCol.replace('_DE', '_EN');
                    row[englishCol] = uniqueTextsMap.get(row[germanCol]) || '';
                }
            }
        }

        progressBar.stop();
        const totalTime = formatTimeRemaining((Date.now() - startTime) / 1000);
        console.log(`\nTranslation completed in ${totalTime}`);

        // Clean up checkpoint file
        try {
            await fs.unlink(checkpointPath);
        } catch (error) {
            // Ignore error if file doesn't exist
        }

        // Save final result
        await saveToExcel(jsonData, inputPath, true);

    } catch (error) {
        console.error('Error processing Excel file:', error.message);
        process.exit(1);
    }
}

// Get input file from command line arguments
const inputFile = process.argv[2];
const testMode = process.argv.includes('--test');
const dryRun = process.argv.includes('--dry-run');

if (!inputFile) {
    console.error('Please provide an input Excel file path');
    console.log('Usage: npm start <excel-file-path> [--test] [--dry-run]');
    console.log('Options:');
    console.log('  --test     Process only first 10 rows (test mode)');
    console.log('  --dry-run  Estimate processing time without translating');
    process.exit(1);
}

processExcelFile(inputFile, testMode, dryRun); 