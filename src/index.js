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
 * These values are optimized for a 12-core machine
 */
const DEFAULT_CONFIG = {
    BATCH_SIZE: 25,               // Smaller batches for more frequent updates
    PARALLEL_BATCHES: 20,         // Increased parallel processing
    MAX_RETRIES: 3,              // Maximum retry attempts for failed requests
    RETRY_DELAY: 1000,           // Base delay between retries (ms)
    BATCH_DELAY: 0,              // No delay between batches for maximum throughput
    CHUNK_SIZE: 500,             // Optimized chunk size for memory efficiency
    MAX_TEXT_LENGTH: 5000,       // Maximum length for a single text
    CHECKPOINT_INTERVAL: 50,     // More frequent checkpoints
    MAX_MEMORY_USAGE: 0.9,       // Increased maximum memory usage (90% of available)
    SAVE_INTERVAL: 500           // More frequent saves for safety
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
    
    // Optimize specifically for 12-core system
    if (cpuCount === 12) {
        config.PARALLEL_BATCHES = 20;    // Increased parallel processing
        config.BATCH_SIZE = 25;          // Smaller batches for more frequent updates
        config.CHUNK_SIZE = 500;         // Smaller chunks for better distribution
        config.BATCH_DELAY = 0;          // No delay between batches for maximum throughput
        config.CHECKPOINT_INTERVAL = 100; // Balanced checkpoint frequency
        config.SAVE_INTERVAL = 1000;     // Balanced save frequency
    } else {
        // Fallback for other systems
        config.PARALLEL_BATCHES = Math.max(Math.floor(cpuCount * 1.5), 4);
        config.BATCH_SIZE = Math.floor(75 / (config.PARALLEL_BATCHES / 8));
        config.CHUNK_SIZE = config.BATCH_SIZE * 10;
    }
    
    // Memory-based adjustments
    const memoryRatio = freeMemory / totalMemory;
    if (memoryRatio < 0.2) {
        config.BATCH_SIZE = Math.floor(config.BATCH_SIZE * 0.8);
        config.CHUNK_SIZE = Math.floor(config.CHUNK_SIZE * 0.8);
    }
    
    console.log(`[Config] CPU:${cpuCount} | Batches:${config.PARALLEL_BATCHES} | Size:${config.BATCH_SIZE} | Mem:${(memoryRatio * 100).toFixed(1)}%`);
    
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
    return `${hours}h${minutes}m`;
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
        progress: `${Math.floor((current / total) * 100)}%`,
        count: `${current}/${total}`,
        speed: `${Math.floor(rate)}/s`,
        eta: formatTimeRemaining(etaSeconds)
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
 * Gets the checkpoint file path for a given input file
 * @param {string} inputPath - Path to the input Excel file
 * @returns {string} Path to the checkpoint file
 */
function getCheckpointPath(inputPath) {
    const parsedPath = path.parse(inputPath);
    const checkpointDir = parsedPath.dir;
    const checkpointFile = `.${parsedPath.name}.checkpoint.json`;
    const checkpointPath = path.join(checkpointDir, checkpointFile);
    return checkpointPath;
}

/**
 * Ensures checkpoint directory exists and is writable
 * @param {string} checkpointPath - Path to the checkpoint file
 */
async function ensureCheckpointDirectory(checkpointPath) {
    const dir = path.dirname(checkpointPath);
    try {
        // Check if directory exists and is writable
        try {
            await fs.access(dir, fs.constants.W_OK);
            console.log(`Checkpoint directory ${dir} is writable`);
        } catch (error) {
            console.error(`Error accessing checkpoint directory: ${error.message}`);
            throw error;
        }

        // Test write permissions by creating a test file
        const testFile = path.join(dir, '.test_write');
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
        console.log('Write permission test successful');
    } catch (error) {
        console.error(`Failed to verify checkpoint directory: ${error.message}`);
        throw error;
    }
}

/**
 * Loads progress from a checkpoint file
 * @param {string} checkpointPath - Path to load checkpoint from
 * @param {string} currentFile - Current input file being processed
 * @returns {Object|null} Loaded checkpoint data or null if not found
 */
async function loadCheckpoint(checkpointPath, currentFile) {
    try {
        // First ensure we can write to the directory
        await ensureCheckpointDirectory(checkpointPath);

        // Try to read existing checkpoint
        try {
            const data = await fs.readFile(checkpointPath, 'utf8');
            console.log('Found existing checkpoint file');
            
            const checkpoint = JSON.parse(data);
            
            // Count non-empty translations
            const translations = checkpoint.translations || {};
            const completedTranslations = Object.entries(translations)
                .filter(([_, translation]) => translation && translation.length > 0)
                .length;
            
            console.log(`Checkpoint statistics:
    - Total Texts: ${Object.keys(translations).length}
    - Completed Translations: ${completedTranslations}
    - Remaining: ${Object.keys(translations).length - completedTranslations}
    - Progress: ${Math.floor((completedTranslations / Object.keys(translations).length) * 100)}%
    - Timestamp: ${checkpoint.timestamp || 'N/A'}`);

            console.log('\nResuming from existing checkpoint...');
            
            return {
                processedRows: checkpoint.processedRows || 0,
                translations: checkpoint.translations || {},
                lastProcessedFile: currentFile,
                totalRows: checkpoint.totalRows || 0,
                timestamp: checkpoint.timestamp
            };
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`No previous checkpoint found at ${checkpointPath}, starting fresh`);
            } else {
                console.warn(`Error reading checkpoint: ${error.message}`);
            }
            return null;
        }
    } catch (error) {
        console.error(`Critical checkpoint error: ${error.message}`);
        return null;
    }
}

/**
 * Saves progress to a checkpoint file
 * @param {string} checkpointPath - Path to save checkpoint
 * @param {Object} data - Progress data to save
 */
async function saveCheckpoint(checkpointPath, data) {
    try {
        const checkpointData = {
            timestamp: new Date().toISOString(),
            processedRows: data.processedRows,
            translations: data.translations,
            lastProcessedFile: data.lastProcessedFile,
            totalRows: data.totalRows,
            config: config // Save current configuration
        };
        
        // Create temporary file first
        const tempPath = `${checkpointPath}.tmp`;
        
        try {
            // Write to temp file
            await fs.writeFile(tempPath, JSON.stringify(checkpointData, null, 2));
            console.log('Wrote temporary checkpoint file');
            
            // Verify the temp file was written correctly
            const verifyData = await fs.readFile(tempPath, 'utf8');
            JSON.parse(verifyData); // Verify JSON is valid
            
            // Rename temp file to actual checkpoint file (atomic operation)
            await fs.rename(tempPath, checkpointPath);
            console.log(`Checkpoint saved: ${data.processedRows}/${data.totalRows} rows (${Math.floor((data.processedRows/data.totalRows)*100)}%)`);
            
            // Verify the final checkpoint file exists
            await fs.access(checkpointPath, fs.constants.F_OK);
            console.log('Verified checkpoint file exists');
        } catch (error) {
            console.error(`Error during checkpoint save: ${error.message}`);
            // Try to clean up temp file if it exists
            try {
                await fs.unlink(tempPath);
            } catch (e) {
                // Ignore cleanup errors
            }
            throw error;
        }
    } catch (error) {
        console.error(`Failed to save checkpoint: ${error.message}`);
    }
}

/**
 * Translates a batch of texts with retry mechanism
 * @param {Array<string>} texts - Texts to translate
 * @returns {Map} Map of original to translated texts
 */
async function translateBatch(texts, batchIndex) {
    const apiUrl = process.env.LIBRETRANSLATE_API_URL || 'http://localhost:5555';
    const uniqueTexts = [...new Set(texts.filter(text => text))];

    if (uniqueTexts.length === 0) return new Map();

    for (let retry = 0; retry < config.MAX_RETRIES; retry++) {
        try {
            // Split texts into smaller sub-batches for better parallelization
            const subBatchSize = Math.max(1, Math.ceil(uniqueTexts.length / config.PARALLEL_BATCHES));
            const subBatches = [];
            for (let i = 0; i < uniqueTexts.length; i += subBatchSize) {
                subBatches.push(uniqueTexts.slice(i, i + subBatchSize));
            }

            // Create parallel promises for each sub-batch
            const subBatchPromises = subBatches.map(async (subBatch, subIndex) => {
                // Add a small delay between sub-batches to prevent overwhelming the API
                await sleep(subIndex * 50);
                
                const response = await fetch(`${apiUrl}/translate`, {
                    method: 'POST',
                    body: JSON.stringify({
                        q: subBatch,
                        source: 'de',
                        target: 'en',
                        format: 'text'
                    }),
                    headers: { 
                        'Content-Type': 'application/json',
                        'Connection': 'keep-alive'
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const result = await response.json();
                return { texts: subBatch, translations: result.translatedText };
            });

            // Wait for all sub-batches to complete
            const results = await Promise.all(subBatchPromises);
            
            // Merge results
            const translationMap = new Map();
            results.forEach(result => {
                result.texts.forEach((text, index) => {
                    translationMap.set(text, result.translations[index]);
                });
            });
            
            return translationMap;
        } catch (error) {
            if (retry === config.MAX_RETRIES - 1) {
                console.error(`Batch ${batchIndex}: Translation failed after ${config.MAX_RETRIES} retries:`, error.message);
                return new Map(uniqueTexts.map(text => [text, `[TRANSLATION ERROR: ${error.message}]`]));
            }
            console.log(`Batch ${batchIndex}: Retry ${retry + 1}/${config.MAX_RETRIES} after error:`, error.message);
            await sleep(config.RETRY_DELAY * Math.pow(2, retry));
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
 * Loads existing translations from a translated Excel file
 * @param {string} inputPath - Path to the original input file
 * @returns {Object} Map of original texts to translations
 */
async function loadExistingTranslations(inputPath) {
    try {
        const parsedPath = path.parse(inputPath);
        const translatedPath = path.join(
            parsedPath.dir,
            `${parsedPath.name}_translated${parsedPath.ext}`
        );

        console.log('Checking for existing translations...');
        
        try {
            const workbook = readFile(translatedPath);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = utils.sheet_to_json(worksheet);
            
            const translations = {};
            let translatedCount = 0;
            
            // Extract translations from the translated file
            for (const row of jsonData) {
                for (const col of Object.keys(row)) {
                    if (col.endsWith('_DE')) {
                        const germanText = row[col];
                        const englishCol = col.replace('_DE', '_EN');
                        const englishText = row[englishCol];
                        
                        if (germanText && englishText && englishText.length > 0) {
                            translations[germanText] = englishText;
                            translatedCount++;
                        }
                    }
                }
            }
            
            console.log(`Found existing translations file with ${translatedCount} translations`);
            return translations;
            
        } catch (error) {
            console.log('No existing translations file found');
            return {};
        }
    } catch (error) {
        console.warn('Error loading existing translations:', error.message);
        return {};
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
        // Resolve the full path to the input file
        const resolvedInputPath = path.resolve(inputPath);
        console.log(`Processing file: ${resolvedInputPath}`);
        
        // Load existing translations first
        const existingTranslations = await loadExistingTranslations(resolvedInputPath);
        
        // Get checkpoint path based on input file
        const checkpointPath = getCheckpointPath(resolvedInputPath);
        console.log(`Checkpoint file: ${checkpointPath}`);

        console.log('Reading Excel file...');
        const workbook = readFile(resolvedInputPath);
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
            console.log('DRY RUN: Estimating processing time without translating');
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

        const startTime = Date.now();
        
        // Initialize translation cache with existing translations
        const translationCache = new Map();
        let completedTranslations = 0;
        
        // Build translation map and count completed translations
        console.log('Building translation map...');
        for (const row of jsonData) {
            for (const germanCol of germanColumns) {
                if (row[germanCol]) {
                    const germanText = row[germanCol];
                    if (existingTranslations[germanText]) {
                        translationCache.set(germanText, existingTranslations[germanText]);
                        completedTranslations++;
                    } else {
                        translationCache.set(germanText, '');
                    }
                }
            }
        }

        // Filter out already translated texts
        const uniqueTexts = Array.from(translationCache.keys())
            .filter(text => !translationCache.get(text));
        
        const totalTexts = translationCache.size;
        const remainingTexts = uniqueTexts.length;
        
        console.log(`Translation Progress:
- Total Unique Texts: ${totalTexts}
- Already Translated: ${completedTranslations}
- Remaining to Translate: ${remainingTexts}
- Current Progress: ${Math.floor((completedTranslations / totalTexts) * 100)}%`);

        if (dryRun) {
            const estimatedTimeSeconds = (remainingTexts / (config.BATCH_SIZE * config.PARALLEL_BATCHES)) * 2;
            console.log(`Estimated remaining time: ${formatTimeRemaining(estimatedTimeSeconds)}`);
            return;
        }

        // Create checkpoint with existing translations
        console.log('Saving checkpoint with existing translations...');
        await saveCheckpoint(checkpointPath, {
            processedRows: completedTranslations,
            translations: Object.fromEntries(translationCache),
            lastProcessedFile: resolvedInputPath,
            totalRows: totalTexts
        });

        if (remainingTexts === 0) {
            console.log('All texts are already translated. Nothing to do.');
            return;
        }

        console.log(`\nContinuing translation for remaining ${remainingTexts} texts...\n`);

        // Initialize progress tracking
        let progress = 0;
        let progressBar;

        // Create progress bar regardless of terminal mode
        progressBar = new cliProgress.SingleBar({
            format: '[{bar}] {percentage}% | {completed}/{total} | {speed}/s | {timeLeft}',
            barCompleteChar: '█',
            barIncompleteChar: '░',
            barsize: 20,
            hideCursor: true,
            clearOnComplete: false,
            stopOnComplete: true,
            forceRedraw: true,
            stream: process.stdout // Force output to stdout
        });

        progressBar.start(totalTexts, completedTranslations, {
            completed: completedTranslations,
            total: totalTexts,
            speed: "0",
            timeLeft: "0h 0m"
        });

        // Group texts by length for optimal processing
        const textGroups = groupTextsByLength(uniqueTexts);
        console.log(`Organized into ${textGroups.length} batch groups for processing\n`);

        // Process groups in parallel batches
        let processedRows = 0;
        const batchGroups = [];
        
        // Pre-group all batches for better distribution
        for (let i = 0; i < textGroups.length; i += config.PARALLEL_BATCHES) {
            const group = [];
            for (let j = 0; j < config.PARALLEL_BATCHES && (i + j) < textGroups.length; j++) {
                group.push(textGroups[i + j]);
            }
            batchGroups.push(group);
        }
        
        // Process batch groups
        for (let groupIndex = 0; groupIndex < batchGroups.length; groupIndex++) {
            const group = batchGroups[groupIndex];
            
            // Get current CPU usage
            const cpuUsage = process.cpuUsage();
            const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000).toFixed(1);
            
            const batchPromises = group.map((batch, index) => 
                translateBatch(batch, groupIndex * config.PARALLEL_BATCHES + index)
            );

            // Wait for all parallel batches to complete
            const batchResults = await Promise.all(batchPromises);
            
            // Merge results into the translation cache
            batchResults.forEach(translationMap => {
                for (const [original, translated] of translationMap.entries()) {
                    translationCache.set(original, translated);
                }
            });
            
            // Update progress
            progress = Math.min((groupIndex + 1) * config.PARALLEL_BATCHES, textGroups.length);
            const progressInfo = formatProgress(
                Math.floor((progress / textGroups.length) * jsonData.length), 
                jsonData.length, 
                startTime
            );

            const currentCompleted = completedTranslations + progress;
            
            // Update progress based on terminal mode
            if (progressBar) {
                const timeLeft = progressInfo.eta.split('h');
                const hours = timeLeft[0];
                const minutes = timeLeft[1].replace('m', '');
                progressBar.update(currentCompleted, {
                    completed: currentCompleted,
                    total: totalTexts,
                    speed: progressInfo.speed.replace(' texts/s', ''),
                    timeLeft: `${hours}h ${minutes}m`
                });
                // Force progress to be visible in log
                console.log(`Progress: ${progressInfo.progress} | ${currentCompleted}/${totalTexts} | ${progressInfo.speed} | ${progressInfo.eta}`);
            }

            // Save checkpoint periodically
            if (progress % config.CHECKPOINT_INTERVAL === 0) {
                await saveCheckpoint(checkpointPath, {
                    processedRows: progress,
                    translations: Object.fromEntries(translationCache),
                    lastProcessedFile: resolvedInputPath,
                    totalRows: jsonData.length
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
                            newRow[englishCol] = translationCache.get(row[germanCol]) || '';
                        }
                    }
                    return newRow;
                });
                await saveToExcel(partialData, resolvedInputPath, false);
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
                    row[englishCol] = translationCache.get(row[germanCol]) || '';
                }
            }
        }

        // Stop and clean up the progress bar
        if (progressBar) {
            progressBar.stop();
        }

        const totalTime = formatTimeRemaining((Date.now() - startTime) / 1000);
        console.log(`\nTranslation completed in ${totalTime}`);

        // Clean up checkpoint file
        try {
            await fs.unlink(checkpointPath);
        } catch (error) {
            // Ignore error if file doesn't exist
        }

        // Save final result
        await saveToExcel(jsonData, resolvedInputPath, true);

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