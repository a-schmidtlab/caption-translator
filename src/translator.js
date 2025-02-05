/**
 * Translation service module for the Excel Translation Tool
 * Handles all translation-related functionality and API communication
 */

import fetch from 'node-fetch';
import http from 'http';
import { config } from './config.js';

/**
 * Promisified sleep function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Resolves after specified time
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Translates a batch of texts with retry mechanism
 * @param {Array<string>} texts - Texts to translate
 * @param {number} batchIndex - Index of the current batch
 * @returns {Map} Map of original to translated texts
 */
export async function translateBatch(texts, batchIndex) {
    const apiUrl = process.env.LIBRETRANSLATE_API_URL || 'http://localhost:5555';
    const uniqueTexts = [...new Set(texts.filter(text => text))];

    if (uniqueTexts.length === 0) return new Map();

    // Create a persistent HTTP agent for connection pooling
    const agent = new http.Agent({ 
        keepAlive: true, 
        maxSockets: 5,  // Reduced from 10 to 5
        timeout: 180000 // Increased timeout
    });

    for (let retry = 0; retry < config.MAX_RETRIES; retry++) {
        try {
            // Add initial delay based on batch index to stagger requests
            await sleep(batchIndex * 200);

            // Process one text at a time for better reliability
            const results = new Map();
            
            for (const text of uniqueTexts) {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

                try {
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
                    results.set(text, result.translatedText);

                    // Add delay between individual texts
                    await sleep(500);

                } catch (error) {
                    throw error;
                } finally {
                    clearTimeout(timeout);
                }
            }
            
            return results;

        } catch (error) {
            if (retry === config.MAX_RETRIES - 1) {
                console.error(`Batch ${batchIndex}: Translation failed after ${config.MAX_RETRIES} retries:`, error.message);
                return new Map(uniqueTexts.map(text => [text, `[TRANSLATION ERROR: ${error.message}]`]));
            }
            
            // Calculate delay with exponential backoff and some randomization
            const baseDelay = config.RETRY_DELAY * Math.pow(2, retry);
            const jitter = Math.random() * 1000;
            const delay = baseDelay + jitter;
            
            console.log(`Batch ${batchIndex}: Retry ${retry + 1}/${config.MAX_RETRIES} after error: ${error.message}`);
            console.log(`Waiting ${Math.round(delay/1000)} seconds before retry...`);
            
            await sleep(delay);
        }
    }
}

/**
 * Groups texts by length for optimal batch processing
 * @param {Array<string>} texts - Array of texts to group
 * @returns {Array<Array<string>>} Grouped texts
 */
export function groupTextsByLength(texts) {
    // Sort texts by length
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