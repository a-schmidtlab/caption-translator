import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function testDocker() {
    console.log('Docker Test Results:');
    console.log('------------------');
    
    try {
        // Test Docker version
        const { stdout: versionOutput } = await execAsync('docker --version');
        console.log('Docker Version:', versionOutput.trim());
        
        // Test Docker service
        const { stdout: psOutput } = await execAsync('docker ps');
        console.log('\nRunning Containers:');
        console.log(psOutput);
        
        // Test LibreTranslate specific container
        const { stdout: ltOutput } = await execAsync('docker ps | grep libretranslate');
        if (ltOutput) {
            console.log('\nLibreTranslate container is running:', ltOutput.trim());
        } else {
            console.log('\nLibreTranslate container not found');
        }
    } catch (error) {
        console.error('\nError:', error.message);
        if (error.message.includes('permission denied')) {
            console.log('\nPermission Issues Detected:');
            console.log('1. Check if user is in docker group');
            console.log('2. Check Docker socket permissions');
            console.log('3. Try running Docker commands with sudo');
        }
    }
    console.log('------------------');
}

testDocker(); 