/**
 * Checkpoint handling module for the Excel Translation Tool
 * Manages saving and loading of translation progress
 */

import fs from 'fs/promises';
import path from 'path';
import { config } from './config.js';

/**
 * Gets the checkpoint file path for a given input file
 * @param {string} inputPath - Path to the input Excel file
 * @returns {string} Path to the checkpoint file
 */
export function getCheckpointPath(inputPath) {
    const parsedPath = path.parse(inputPath);
    const checkpointDir = 'checkpoints';
    const checkpointFile = `${parsedPath.name}.checkpoint.json`;
    return path.join(checkpointDir, checkpointFile);
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
            // Create directory if it doesn't exist
            await fs.mkdir(dir, { recursive: true });
            console.log(`Created checkpoint directory ${dir}`);
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
export async function loadCheckpoint(checkpointPath, currentFile) {
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
export async function saveCheckpoint(checkpointPath, data) {
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