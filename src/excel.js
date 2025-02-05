/**
 * Excel handling module for the Excel Translation Tool
 * Manages reading and writing Excel files
 */

import pkg from 'xlsx';
const { readFile, utils, writeFile } = pkg;
import path from 'path';
import { COLUMNS_TO_TRANSLATE, COLUMNS_TO_IGNORE } from './config.js';

/**
 * Loads existing translations from a translated Excel file
 * @param {string} inputPath - Path to the original input file
 * @returns {Object} Map of original texts to translations
 */
export async function loadExistingTranslations(inputPath) {
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
 * Saves current progress to Excel file
 * @param {Array} jsonData - Data to save
 * @param {string} basePath - Base path for the output file
 * @param {boolean} isFinal - Whether this is the final save
 */
export async function saveToExcel(jsonData, basePath, isFinal = false) {
    const newWorksheet = utils.json_to_sheet(jsonData);
    const newWorkbook = utils.book_new();
    utils.book_append_sheet(newWorkbook, newWorksheet, 'Translated');

    const parsedPath = path.parse(basePath);
    const suffix = isFinal ? '_translated_FINAL' : '_translated';
    const outputPath = path.join(
        'output',
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
 * Reads an Excel file and returns its contents as JSON
 * @param {string} inputPath - Path to the input Excel file
 * @returns {Object} Object containing the JSON data and German columns
 */
export function readExcelFile(inputPath) {
    console.log('Reading Excel file...');
    const workbook = readFile(inputPath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = utils.sheet_to_json(worksheet);

    if (jsonData.length === 0) {
        throw new Error('Excel file is empty');
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

    return { jsonData, germanColumns };
} 