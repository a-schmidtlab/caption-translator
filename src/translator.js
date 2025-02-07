/**
 * Translation service module for the Excel Translation Tool
 * Handles all translation-related functionality and API communication
 */

import fetch from 'node-fetch';
import http from 'http';
import { config } from './config.js';

// Create a persistent HTTP agent with conservative settings
const agent = new http.Agent({
    keepAlive: true,
    maxSockets: 3,        // Limit concurrent connections
    timeout: 60000,       // 1 minute timeout
    maxFreeSockets: 2,    // Keep fewer idle sockets
    scheduling: 'fifo'    // Predictable request ordering
});

// Rate limiter implementation
class RateLimiter {
    constructor(maxRequests, timeWindow) {
        this.maxRequests = maxRequests;
        this.timeWindow = timeWindow;
        this.requests = [];
    }

    async waitForSlot() {
        const now = Date.now();
        this.requests = this.requests.filter(time => time > now - this.timeWindow);
        
        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = this.requests[0];
            const waitTime = (oldestRequest + this.timeWindow) - now;
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return this.waitForSlot();
        }
        
        this.requests.push(now);
    }
}

// Create rate limiter: max 30 requests per 10 seconds
const rateLimiter = new RateLimiter(30, 10000);

/**
 * Translates a single text with robust error handling
 * @param {string} text - Text to translate
 * @param {number} retryCount - Current retry attempt
 * @returns {Promise<string>} Translated text
 */
async function translateSingle(text, retryCount = 0) {
    const apiUrl = process.env.LIBRETRANSLATE_API_URL || 'http://localhost:5555';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
        // Wait for rate limiter
        await rateLimiter.waitForSlot();

        const response = await fetch(`${apiUrl}/translate`, {
            method: 'POST',
            body: JSON.stringify({
                q: text,
                source: 'de',
                target: 'en',
                format: 'text'
            }),
            headers: {
                'Content-Type': 'application/json',
                'Connection': 'keep-alive'
            },
            agent,
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result.translatedText;
    } catch (error) {
        if (retryCount < config.MAX_RETRIES) {
            // Calculate delay with exponential backoff and jitter
            const baseDelay = config.RETRY_DELAY * Math.pow(1.5, retryCount);
            const jitter = Math.random() * 1000;
            const delay = baseDelay + jitter;
            
            console.log(`Translation failed (attempt ${retryCount + 1}/${config.MAX_RETRIES}). Retrying in ${Math.round(delay)}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            return translateSingle(text, retryCount + 1);
        }
        throw new Error(`Translation failed after ${config.MAX_RETRIES} retries: ${error.message}`);
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Translates a batch of texts with improved error handling
 * @param {Array<string>} texts - Texts to translate
 * @param {number} batchIndex - Index of the current batch
 * @returns {Map} Map of original to translated texts
 */
export async function translateBatch(texts, batchIndex) {
    const uniqueTexts = [...new Set(texts.filter(text => text))];
    if (uniqueTexts.length === 0) return new Map();

    const results = new Map();
    const failedTexts = [];

    // Process texts sequentially with controlled delays
    for (let i = 0; i < uniqueTexts.length; i++) {
        const text = uniqueTexts[i];
        
        try {
            // Add delay based on position in batch
            const delay = i * 200; // 200ms between texts
            await new Promise(resolve => setTimeout(resolve, delay));

            const translation = await translateSingle(text);
            results.set(text, translation);

            // Log progress
            console.log(`Batch ${batchIndex}: ${i + 1}/${uniqueTexts.length} texts completed`);
        } catch (error) {
            console.error(`Failed to translate text in batch ${batchIndex}:`, error.message);
            failedTexts.push(text);
            
            // Add longer delay after failure
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    // Handle failed texts
    if (failedTexts.length > 0) {
        console.log(`Batch ${batchIndex}: ${failedTexts.length} texts failed, marking as failed`);
        for (const text of failedTexts) {
            results.set(text, `[TRANSLATION FAILED]`);
        }
    }

    return results;
}

/**
 * Groups texts by length for optimal batch processing
 * @param {Array<string>} texts - Array of texts to group
 * @returns {Array<Array<string>>} Grouped texts
 */
export function groupTextsByLength(texts) {
    const sortedTexts = [...texts].sort((a, b) => a.length - b.length);
    const groups = [];
    let currentGroup = [];
    let currentLength = 0;

    for (const text of sortedTexts) {
        if (currentLength + text.length > config.MAX_TEXT_LENGTH || 
            currentGroup.length >= config.BATCH_SIZE) {
            if (currentGroup.length > 0) {
                groups.push(currentGroup);
                currentGroup = [];
                currentLength = 0;
            }
        }
        currentGroup.push(text);
        currentLength += text.length;
    }

    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }

    return groups;
} 