/**
 * Utilities module for the Excel Translation Tool
 * Contains common helper functions
 */

/**
 * Formats remaining time in HH:MM format
 * @param {number} seconds - Seconds to format
 * @returns {string} Formatted time string
 */
export function formatTimeRemaining(seconds) {
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
export function formatProgress(current, total, startTime) {
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
 * Monitors memory usage and performs garbage collection if needed
 * @param {number} maxMemoryUsage - Maximum memory usage ratio before GC
 */
export function checkMemory() {
    const memoryUsage = process.memoryUsage();
    const heapUsed = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const heapTotal = Math.round(memoryUsage.heapTotal / 1024 / 1024);
    console.log(`Memory Usage: ${heapUsed}MB / ${heapTotal}MB (${Math.round(heapUsed/heapTotal*100)}%)`);
    
    if (heapUsed/heapTotal > 0.95) {
        global.gc && global.gc();  // Force garbage collection if available
        console.log('Forced garbage collection');
    }
}

/**
 * Promisified sleep function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Resolves after specified time
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
} 