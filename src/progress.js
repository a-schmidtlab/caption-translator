/**
 * Progress monitoring module for the Excel Translation Tool
 * Tracks translation progress and detects stalls
 */

class ProgressMonitor {
    constructor(totalTexts, startingProgress) {
        this.totalTexts = totalTexts;
        this.currentProgress = startingProgress;
        this.lastProgressUpdate = Date.now();
        this.lastProgressCount = startingProgress;
        this.stallCheckInterval = 5 * 60 * 1000; // 5 minutes
        this.lastStallCheck = Date.now();
        this.progressHistory = [];
    }

    /**
     * Update progress and check for stalls
     * @param {number} newProgress - Current progress count
     * @returns {Object} Progress status including stall detection
     */
    updateProgress(newProgress) {
        const now = Date.now();
        const timeSinceLastUpdate = now - this.lastProgressUpdate;
        
        // Record progress point
        this.progressHistory.push({
            timestamp: now,
            count: newProgress
        });

        // Keep only last 30 minutes of history
        const thirtyMinutesAgo = now - 30 * 60 * 1000;
        this.progressHistory = this.progressHistory.filter(p => p.timestamp > thirtyMinutesAgo);

        // Calculate progress rate (items per minute)
        let progressRate = 0;
        if (this.progressHistory.length > 1) {
            const oldestPoint = this.progressHistory[0];
            const timeSpan = (now - oldestPoint.timestamp) / (1000 * 60); // minutes
            const itemsProcessed = newProgress - oldestPoint.count;
            progressRate = timeSpan > 0 ? itemsProcessed / timeSpan : 0;
        }

        // Check for stalls every 5 minutes
        const isStalled = this.checkForStall(newProgress, now);

        // Update state
        this.lastProgressCount = newProgress;
        this.lastProgressUpdate = now;
        this.currentProgress = newProgress;

        // Calculate percentage and remaining
        const percentage = ((newProgress / this.totalTexts) * 100).toFixed(1);
        const remaining = this.totalTexts - newProgress;

        // Estimate time remaining
        let estimatedTimeRemaining = 'Unknown';
        if (progressRate > 0) {
            const remainingMinutes = remaining / progressRate;
            const hours = Math.floor(remainingMinutes / 60);
            const minutes = Math.floor(remainingMinutes % 60);
            estimatedTimeRemaining = `${hours}h ${minutes}m`;
        }

        return {
            current: newProgress,
            total: this.totalTexts,
            percentage,
            remaining,
            isStalled,
            progressRate: progressRate.toFixed(1),
            estimatedTimeRemaining,
            timeSinceLastProgress: Math.floor(timeSinceLastUpdate / 1000)
        };
    }

    /**
     * Check if progress has stalled
     * @param {number} currentCount - Current progress count
     * @param {number} now - Current timestamp
     * @returns {boolean} Whether progress has stalled
     */
    checkForStall(currentCount, now) {
        if (now - this.lastStallCheck < this.stallCheckInterval) {
            return false;
        }

        this.lastStallCheck = now;

        // Consider progress stalled if:
        // 1. No progress in last 5 minutes
        // 2. Progress rate dropped below 0.1 items per minute in last 10 minutes
        const fiveMinutesAgo = now - 5 * 60 * 1000;
        const tenMinutesAgo = now - 10 * 60 * 1000;
        const recentHistory = this.progressHistory.filter(p => p.timestamp > tenMinutesAgo);

        if (recentHistory.length < 2) {
            return false;
        }

        const noRecentProgress = this.progressHistory
            .filter(p => p.timestamp > fiveMinutesAgo)
            .every(p => p.count === currentCount);

        const recentProgressRate = (currentCount - recentHistory[0].count) / 10; // items per minute

        return noRecentProgress || recentProgressRate < 0.1;
    }

    /**
     * Format progress message
     * @param {Object} status - Progress status object
     * @returns {string} Formatted progress message
     */
    formatProgressMessage(status) {
        return `Progress: ${status.percentage}% | ${status.current}/${status.total} | Rate: ${status.progressRate}/min | ETA: ${status.estimatedTimeRemaining}${status.isStalled ? ' | WARNING: Progress may be stalled!' : ''}`;
    }
}

export default ProgressMonitor; 