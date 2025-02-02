/**
 * Excel Translation Tool
 * 
 * @file    index.js
 * @author  Axel Schmidt
 * @version 1.0.0
 * @date    2024
 * 
 * @copyright Copyright (c) 2024 Axel Schmidt
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
 * https://github.com/yourusername/excel-translator
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

async function translateText(text) {
    try {
        const apiUrl = process.env.LIBRETRANSLATE_API_URL || 'http://localhost:5555';
        const response = await fetch(`${apiUrl}/translate`, {
            method: 'POST',
            body: JSON.stringify({
                q: text,
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
        return data.translatedText;
    } catch (error) {
        console.error(`Translation failed for text "${text}":`, error.message);
        return `[TRANSLATION ERROR: ${error.message}]`;
    }
}

async function processExcelFile(inputPath) {
    try {
        console.log('Reading Excel file...');
        // Read the workbook
        const workbook = readFile(inputPath);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
            throw new Error('Excel file is empty');
        }

        // Find columns ending with _DE
        const headers = Object.keys(jsonData[0]);
        const germanColumns = headers.filter(header => header.endsWith('_DE'));

        if (germanColumns.length === 0) {
            throw new Error('No columns ending with _DE found');
        }

        console.log(`Found ${germanColumns.length} German columns to translate`);
        console.log('German columns:', germanColumns);

        // Create progress bar
        const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        const totalTranslations = jsonData.length * germanColumns.length;
        progressBar.start(totalTranslations, 0);
        let progress = 0;

        // Process each row
        for (const row of jsonData) {
            for (const germanCol of germanColumns) {
                const englishCol = germanCol.replace('_DE', '_EN');
                if (row[germanCol]) {
                    row[englishCol] = await translateText(row[germanCol]);
                } else {
                    row[englishCol] = '';
                }
                progress++;
                progressBar.update(progress);
            }
        }

        progressBar.stop();

        // Create new workbook with translated content
        const newWorksheet = utils.json_to_sheet(jsonData);
        const newWorkbook = utils.book_new();
        utils.book_append_sheet(newWorkbook, newWorksheet, 'Translated');

        // Generate output filename
        const parsedPath = path.parse(inputPath);
        const outputPath = path.join(
            parsedPath.dir,
            `${parsedPath.name}_translated${parsedPath.ext}`
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
if (!inputFile) {
    console.error('Please provide an input Excel file path');
    console.log('Usage: npm start <excel-file-path>');
    process.exit(1);
}

processExcelFile(inputFile); 