/**
 * Configuration module for the Excel Translation Tool
 * Contains all configuration settings and system-specific optimizations
 */

import os from 'os';

/**
 * Default configuration constants
 * These values are optimized for reliability and performance
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
export function calculateOptimalConfig() {
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

export const config = calculateOptimalConfig(); 