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

    for (let retry = 0; retry < config.MAX_RETRIES; retry++) {
        try {
            // Split texts into even smaller sub-batches for better parallelization
            const subBatchSize = Math.max(1, Math.ceil(uniqueTexts.length / 3));  // Split into 3 sub-batches
            const subBatches = [];
            for (let i = 0; i < uniqueTexts.length; i += subBatchSize) {
                subBatches.push(uniqueTexts.slice(i, i + subBatchSize));
            }

            // Create parallel promises for each sub-batch with connection pooling
            const agent = new http.Agent({ 
                keepAlive: true, 
                maxSockets: 10,
                timeout: 120000
            });
            
            const subBatchPromises = subBatches.map(async (subBatch, subIndex) => {
                // Significant stagger between requests
                await sleep(subIndex * 1000);
                
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 90000);

                try {
                    const response = await fetch(`${apiUrl}/translate`, {
                        method: 'POST',
                        body: JSON.stringify({
                            q: subBatch,
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
                    return { texts: subBatch, translations: result.translatedText };
                } finally {
                    clearTimeout(timeout);
                }
            });

            // Wait for all sub-batches to complete with timeout
            const results = await Promise.race([
                Promise.all(subBatchPromises),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Translation timeout')), 100000)
                )
            ]);
            
            // Merge results
            const translationMap = new Map();
            results.forEach(result => {
                result.texts.forEach((text, index) => {
                    translationMap.set(text, result.translations[index]);
                });
            });
            
            return translationMap;
        } catch (error) {
            if (retry === config.MAX_RETRIES - 1) {
                console.error(`Batch ${batchIndex}: Translation failed after ${config.MAX_RETRIES} retries:`, error.message);
                return new Map(uniqueTexts.map(text => [text, `[TRANSLATION ERROR: ${error.message}]`]));
            }
            console.log(`Batch ${batchIndex}: Retry ${retry + 1}/${config.MAX_RETRIES} after error:`, error.message);
            await sleep(config.RETRY_DELAY * Math.pow(2, retry));  // Exponential backoff
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