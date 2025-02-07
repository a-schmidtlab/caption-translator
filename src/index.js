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
import ProgressMonitor from './progress.js';

import { config } from './config.js';
import { translateBatch, groupTextsByLength } from './translator.js';
import { loadCheckpoint, saveCheckpoint, getCheckpointPath } from './checkpoint.js';
import { loadExistingTranslations, saveToExcel, readExcelFile } from './excel.js';
import { formatProgress, checkMemory, sleep, formatTimeRemaining } from './utils.js';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

// Global state for graceful shutdown
let isShuttingDown = false;

// Setup signal handlers for graceful shutdown
process.on('SIGINT', () => {
    console.log('\nGraceful shutdown initiated...');
    isShuttingDown = true;
});

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
        let lastSaveTime = Date.now();
        let consecutiveErrors = 0;
        
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

        // Initialize progress monitor
        const progressMonitor = new ProgressMonitor(totalTexts, completedTranslations);
        
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

        // Group texts by length for optimal processing
        const textGroups = groupTextsByLength(uniqueTexts);
        console.log(`\nStarting translation of remaining ${remainingTexts} texts...\n`);

        // Process groups sequentially with robust error handling
        for (let i = 0; i < textGroups.length && !isShuttingDown; i++) {
            const batch = textGroups[i];
            
            try {
                // Check memory usage periodically
                if (Date.now() - lastMemoryCheck > 30000) {
                    checkMemory();
                    lastMemoryCheck = Date.now();
                }

                // Translate batch
                const batchTranslations = await translateBatch(batch, i);
                
                // Update translations map
                for (const [original, translated] of batchTranslations) {
                    translationCache.set(original, translated);
                }

                // Update progress
                const status = progressMonitor.updateProgress(translationCache.size);
                console.log(progressMonitor.formatProgressMessage(status));

                // Check for stalls
                if (status.isStalled) {
                    console.error('\nWARNING: Translation progress appears to be stalled!');
                    console.error('Consider checking the LibreTranslate service or network connection.');
                    
                    // If stalled for too long, exit
                    if (status.timeSinceLastProgress > 15 * 60) { // 15 minutes
                        throw new Error('Translation stalled for too long, exiting...');
                    }
                }

                // Reset consecutive errors counter on success
                consecutiveErrors = 0;

                // Save progress periodically
                if (Date.now() - lastSaveTime > config.SAVE_INTERVAL) {
                    await saveCheckpoint(checkpointPath, {
                        processedRows: translationCache.size,
                        translations: Object.fromEntries(translationCache),
                        lastProcessedFile: resolvedInputPath,
                        totalRows: totalTexts
                    });
                    lastSaveTime = Date.now();
                }

                // Add delay between batches
                await sleep(config.BATCH_DELAY);
            } catch (error) {
                console.error(`\nError processing batch ${i}:`, error.message);
                
                // Track consecutive errors
                consecutiveErrors++;
                
                // If too many consecutive errors, exit
                if (consecutiveErrors >= 5) {
                    console.error('Too many consecutive errors, exiting...');
                    break;
                }

                // Save progress before continuing
                await saveCheckpoint(checkpointPath, {
                    processedRows: translationCache.size,
                    translations: Object.fromEntries(translationCache),
                    lastProcessedFile: resolvedInputPath,
                    totalRows: totalTexts
                });
                
                // Add longer delay after error
                await sleep(5000);
            }
        }

        // Final save
        await saveCheckpoint(checkpointPath, {
            processedRows: translationCache.size,
            translations: Object.fromEntries(translationCache),
            lastProcessedFile: resolvedInputPath,
            totalRows: totalTexts
        });

        // Apply translations to Excel file
        console.log('\nApplying translations to Excel file...');
        for (const row of jsonData) {
            for (const germanCol of germanColumns) {
                if (row[germanCol]) {
                    const englishCol = germanCol.replace('_DE', '_EN');
                    const translation = translationCache.get(row[germanCol]);
                    if (translation && translation !== '[TRANSLATION FAILED]') {
                        row[englishCol] = translation;
                    }
                }
            }
        }

        // Save updated Excel file
        const outputPath = resolvedInputPath.replace('.xlsx', '_translated.xlsx');
        await saveToExcel(jsonData, outputPath);

        console.log('\nTranslation process completed:');
        console.log(`- Total texts: ${totalTexts}`);
        console.log(`- Successfully translated: ${translationCache.size}`);
        console.log(`- Failed translations: ${totalTexts - translationCache.size}`);
        console.log(`- Output saved to: ${outputPath}`);

    } catch (error) {
        console.error('Fatal error:', error);
        throw error;
    }
}

// Start processing if file argument provided
const inputFile = process.argv[2];
if (!inputFile) {
    console.error('Please provide an input Excel file path');
    process.exit(1);
}

const testMode = process.argv.includes('--test');
const dryRun = process.argv.includes('--dry-run');

processExcelFile(inputFile, testMode, dryRun).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
}); 