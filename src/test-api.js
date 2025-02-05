import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function testTranslation() {
    try {
        const apiUrl = process.env.LIBRETRANSLATE_API_URL || 'http://localhost:5555';
        console.log(`Testing connection to LibreTranslate at: ${apiUrl}`);

        // First, test if the server is running by checking the languages endpoint
        const languagesResponse = await fetch(`${apiUrl}/languages`);
        if (!languagesResponse.ok) {
            throw new Error(`Cannot connect to LibreTranslate server: ${languagesResponse.status}`);
        }
        const languages = await languagesResponse.json();
        console.log('Available languages:', languages.map(l => l.code).join(', '));

        // Now test translation
        console.log('\nTesting translation...');
        const response = await fetch(`${apiUrl}/translate`, {
            method: 'POST',
            body: JSON.stringify({
                q: 'Hallo, dies ist ein Test.',
                source: 'de',
                target: 'en',
                format: 'text'
                // No API key needed for local instance
            }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }

        const data = await response.json();
        console.log('\nTest translation successful!');
        console.log('Original text: "Hallo, dies ist ein Test."');
        console.log(`Translated text: "${data.translatedText}"`);
    } catch (error) {
        console.error('\nTranslation test failed:', error.message);
        if (error.message.includes('ECONNREFUSED')) {
            console.error('\nError: Cannot connect to LibreTranslate server. Please make sure:');
            console.error('1. Docker is running');
            console.error('2. LibreTranslate container is running (docker run -it -p 5555:5000 libretranslate/libretranslate)');
            console.error('3. Port 5555 is not being used by another application');
        }
    }
}

testTranslation(); 