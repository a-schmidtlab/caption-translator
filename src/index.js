/**
 * Excel Translation Tool
 * 
 * @file    index.js
 * @author  Axel Schmidt
 * @version 1.0.0
 * @date    2025
 * 
 * @copyright Copyright (c) 2025 Axel Schmidt
 * 
 * This work is licensed under the Creative Commons Attribution-NonCommercial 4.0 
 * International License. To view a copy of this license, visit:
 * http://creativecommons.org/licenses/by-nc/4.0/ or send a letter to:
 * Creative Commons, PO Box 1866, Mountain View, CA 94042, USA.
 * 
 * You are free to:
 * - Share: copy and redistribute the material in any medium or format
 * - Adapt: remix, transform, and build upon the material
 * 
 * Under the following terms:
 * - Attribution: You must give appropriate credit, provide a link to the license,
 *   and indicate if changes were made.
 * - NonCommercial: You may not use the material for commercial purposes.
 * 
 * For more information about the author and usage terms, please visit:
 * https://github.com/a-schmidtlab/excel-translator
 */

import pkg from 'xlsx';
const { readFile, utils, writeFile } = pkg;
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cliProgress from 'cli-progress';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

// Configuration
const BATCH_SIZE = 20; // Number of translations to process in parallel
const MAX_RETRIES = 3; // Maximum number of retries for failed translations
const RETRY_DELAY = 1000; // Delay between retries in milliseconds

// Specific columns to translate
const COLUMNS_TO_TRANSLATE = [
    'IPTC_DE_Headline',
    'IPTC_DE_Beschreibung',
    'IPTC_DE_Bundesland',
    'IPTC_DE_Land',
    'IPTC_DE_Anweisung',
    'IPTC_DE_User_Keywords',
    'AI_keywords_DE'
];

// Columns to explicitly ignore
const COLUMNS_TO_IGNORE = [
    'IPTC_DE_Credit',
    'IPTC_DE_Aufnahmedatum'
];

function formatTimeRemaining(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function translateBatch(texts) {
    const apiUrl = process.env.LIBRETRANSLATE_API_URL || 'http://localhost:5555';
    const uniqueTexts = [...new Set(texts.filter(text => text))]; // Remove duplicates and empty strings

    if (uniqueTexts.length === 0) return new Map();

    for (let retry = 0; retry < MAX_RETRIES; retry++) {
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
            // Create a map of original text to translated text
            const translationMap = new Map();
            uniqueTexts.forEach((text, index) => {
                translationMap.set(text, data.translatedText[index]);
            });
            return translationMap;
        } catch (error) {
            if (retry === MAX_RETRIES - 1) {
                console.error(`Translation batch failed after ${MAX_RETRIES} retries:`, error.message);
                return new Map(uniqueTexts.map(text => [text, `[TRANSLATION ERROR: ${error.message}]`]));
            }
            console.log(`Retry ${retry + 1}/${MAX_RETRIES} after error:`, error.message);
            await sleep(RETRY_DELAY * (retry + 1)); // Exponential backoff
        }
    }
}

async function processExcelFile(inputPath, testMode = false) {
    try {
        console.log('Reading Excel file...');
        // Read the workbook
        const workbook = readFile(inputPath);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        let jsonData = utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
            throw new Error('Excel file is empty');
        }

        // If in test mode, only process first 10 rows
        if (testMode) {
            console.log('TEST MODE: Processing only first 10 rows');
            jsonData = jsonData.slice(0, 10);
        }

        // Find columns to translate
        const headers = Object.keys(jsonData[0]);
        const germanColumns = headers.filter(header => 
            COLUMNS_TO_TRANSLATE.includes(header) || 
            (header.endsWith('_DE') && !COLUMNS_TO_IGNORE.includes(header))
        );

        if (germanColumns.length === 0) {
            throw new Error('No matching German columns found');
        }

        console.log(`Found ${germanColumns.length} German columns to translate:`);
        console.log(germanColumns);

        // Create progress bar with custom format
        const progressBar = new cliProgress.SingleBar({
            format: ' {bar} {percentage}% | Time left: {eta} | {value}/{total}',
            etaBuffer: 100
        }, cliProgress.Presets.shades_classic);
        
        const totalTranslations = jsonData.length * germanColumns.length;
        progressBar.start(totalTranslations, 0);
        let progress = 0;

        // Process in batches
        for (let i = 0; i < jsonData.length; i += BATCH_SIZE) {
            const batch = jsonData.slice(i, i + BATCH_SIZE);
            const batchTexts = [];
            const batchMappings = [];

            // Collect all texts from this batch
            for (const row of batch) {
                for (const germanCol of germanColumns) {
                    if (row[germanCol]) {
                        batchTexts.push(row[germanCol]);
                        batchMappings.push({ row, germanCol });
                    } else {
                        progress++;
                        progressBar.update(progress);
                    }
                }
            }

            // Translate the batch
            const translationMap = await translateBatch(batchTexts);

            // Apply translations
            for (let j = 0; j < batchTexts.length; j++) {
                const { row, germanCol } = batchMappings[j];
                const englishCol = germanCol.replace('_DE', '_EN');
                row[englishCol] = translationMap.get(row[germanCol]) || '';
                progress++;
                progressBar.update(progress, {
                    eta: formatTimeRemaining(progressBar.eta)
                });
            }

            // Small delay to prevent overwhelming the API
            await sleep(100);
        }

        progressBar.stop();

        // Create new workbook with translated content
        const newWorksheet = utils.json_to_sheet(jsonData);
        const newWorkbook = utils.book_new();
        utils.book_append_sheet(newWorkbook, newWorksheet, 'Translated');

        // Generate output filename
        const parsedPath = path.parse(inputPath);
        const suffix = testMode ? '_test_translated' : '_translated';
        const outputPath = path.join(
            parsedPath.dir,
            `${parsedPath.name}${suffix}${parsedPath.ext}`
        );

        // Write the file
        writeFile(newWorkbook, outputPath);
        console.log(`\nTranslation completed! Output saved to: ${outputPath}`);

    } catch (error) {
        console.error('Error processing Excel file:', error.message);
        process.exit(1);
    }
}

// Get input file from command line arguments
const inputFile = process.argv[2];
const testMode = process.argv.includes('--test');

if (!inputFile) {
    console.error('Please provide an input Excel file path');
    console.log('Usage: npm start <excel-file-path> [--test]');
    console.log('Options:');
    console.log('  --test    Process only first 10 rows (test mode)');
    process.exit(1);
}

processExcelFile(inputFile, testMode); 