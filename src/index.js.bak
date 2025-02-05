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
import http from 'http';

import { config } from './config.js';
import { translateBatch, groupTextsByLength } from './translator.js';
import { loadCheckpoint, saveCheckpoint, getCheckpointPath } from './checkpoint.js';
import { loadExistingTranslations, saveToExcel, readExcelFile } from './excel.js';
import { formatProgress, checkMemory, sleep } from './utils.js';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * Configuration constants
 * These values are optimized for a 12-core machine
 */
const DEFAULT_CONFIG = {
    BATCH_SIZE: 3,                // Very conservative batch size
    PARALLEL_BATCHES: 20,         // Minimal parallel processing
    MAX_RETRIES: 5,              // More retries for reliability
    RETRY_DELAY: 1000,           // Long delay between retries
    BATCH_DELAY: 500,            // Significant delay between batches
    CHUNK_SIZE: 50,              // Small chunk size
    MAX_TEXT_LENGTH: 5000,       // Maximum length for a single text
    CHECKPOINT_INTERVAL: 100,    // Frequent checkpoints
    MAX_MEMORY_USAGE: 0.95,      // Higher memory usage for better performance
    SAVE_INTERVAL: 1000          // Frequent saves
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
        config.PARALLEL_BATCHES = 20;     // Very conservative parallel processing
        config.BATCH_SIZE = 3;            // Very conservative batch size
        config.CHUNK_SIZE = 50;           // Small chunk size
        config.BATCH_DELAY = 500;         // Significant delay for stability
        config.CHECKPOINT_INTERVAL = 100;  // Frequent I/O operations
        config.SAVE_INTERVAL = 1000;      // Frequent I/O operations
        config.RETRY_DELAY = 1000;        // Long retry delay
    } else {
        // Fallback for other systems
        config.PARALLEL_BATCHES = Math.max(Math.floor(cpuCount * 2), 4);
        config.BATCH_SIZE = Math.floor(50 / (config.PARALLEL_BATCHES / 8));
        config.CHUNK_SIZE = config.BATCH_SIZE * 4;
    }
    
    // Memory-based adjustments
    const memoryRatio = freeMemory / totalMemory;
    if (memoryRatio > 0.4) {  // If we have plenty of memory, be slightly more aggressive
        config.PARALLEL_BATCHES = Math.floor(config.PARALLEL_BATCHES * 1.2);
        config.CHUNK_SIZE = Math.floor(config.CHUNK_SIZE * 1.1);
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

        // Read the Excel file
        let { jsonData, germanColumns } = readExcelFile(resolvedInputPath);

        // Test mode or dry run modifications
        if (testMode) {
            console.log('TEST MODE: Processing only first 10 rows');
            jsonData = jsonData.slice(0, 10);
        } else if (dryRun) {
            console.log('DRY RUN: Estimating processing time without translating');
        }

        const startTime = Date.now();
        let lastMemoryCheck = Date.now();
        
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
        const progressBar = new cliProgress.SingleBar({
            format: '[{bar}] {percentage}% | {completed}/{total} | {speed}/s | {timeLeft}',
            barCompleteChar: '█',
            barIncompleteChar: '░',
            barsize: 20,
            hideCursor: true,
            clearOnComplete: false,
            stopOnComplete: true,
            forceRedraw: true,
            stream: process.stdout
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
            
            // Check memory usage every 30 seconds
            if (Date.now() - lastMemoryCheck > 30000) {
                checkMemory();
                lastMemoryCheck = Date.now();
            }
            
            const batchPromises = group.map((batch, index) => 
                translateBatch(batch, groupIndex * config.PARALLEL_BATCHES + index)
            );

            // Wait for all parallel batches to complete
            const batchResults = await Promise.all(batchPromises);
            
            // Clear batch promises to help garbage collection
            batchPromises.length = 0;
            
            // Merge results into the translation cache with memory optimization
            for (const translationMap of batchResults) {
                for (const [original, translated] of translationMap.entries()) {
                    translationCache.set(original, translated);
                }
                // Clear reference to help garbage collection
                translationMap.clear();
            }
            
            // Clear batch results to help garbage collection
            batchResults.length = 0;
            
            // Update progress
            const progress = Math.min((groupIndex + 1) * config.PARALLEL_BATCHES, textGroups.length);
            const progressInfo = formatProgress(
                Math.floor((progress / textGroups.length) * jsonData.length), 
                jsonData.length, 
                startTime
            );

            const currentCompleted = completedTranslations + progress;
            
            // Update progress bar
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