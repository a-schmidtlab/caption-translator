/**
 * Configuration module for the Excel Translation Tool
 * Contains all configurable parameters
 */

import os from 'os';

/**
 * Default configuration constants
 * These values are optimized for reliability and performance
 */
const DEFAULT_CONFIG = {
    BATCH_SIZE: 5,                // Balanced batch size
    PARALLEL_BATCHES: 15,         // Moderate parallel processing
    MAX_RETRIES: 3,              // Keep retries focused
    RETRY_DELAY: 1000,           // Moderate delay between retries
    BATCH_DELAY: 500,            // Reduced delay between batches
    CHUNK_SIZE: 50,              // Moderate chunk size
    MAX_TEXT_LENGTH: 5000,       // Keep max text length
    CHECKPOINT_INTERVAL: 100,     // Regular checkpoints
    MAX_MEMORY_USAGE: 0.90,      // Keep memory threshold
    SAVE_INTERVAL: 1000          // Regular saves
};

/**
 * Columns to be translated
 * Only these columns (and any ending with _DE) will be processed
 */
export const COLUMNS_TO_TRANSLATE = [
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
export const COLUMNS_TO_IGNORE = [
    'IPTC_DE_Credit',
    'IPTC_DE_Aufnahmedatum'
];

/**
 * Calculates optimal configuration based on system resources
 * @returns {Object} Optimized configuration object
 */
function calculateOptimalConfig() {
    const cpuCount = os.cpus().length;
    const totalMemoryGB = os.totalmem() / (1024 * 1024 * 1024);
    
    // Conservative settings prioritizing stability
    return {
        BATCH_SIZE: 3,                    // Process 3 texts at a time
        PARALLEL_BATCHES: Math.min(5, Math.floor(cpuCount / 2)),  // Use half of CPU cores
        MAX_RETRIES: 3,                   // Maximum retry attempts
        RETRY_DELAY: 2000,                // Base delay between retries (ms)
        BATCH_DELAY: 1000,                // Delay between batches (ms)
        CHUNK_SIZE: 25,                   // Number of texts per chunk
        MAX_TEXT_LENGTH: 5000,            // Maximum combined text length per batch
        CHECKPOINT_INTERVAL: 50,          // Save progress every 50 texts
        MAX_MEMORY_USAGE: 0.85,           // Maximum memory usage (85%)
        SAVE_INTERVAL: 60000,             // Save every minute
    };
}

export const config = calculateOptimalConfig(); 