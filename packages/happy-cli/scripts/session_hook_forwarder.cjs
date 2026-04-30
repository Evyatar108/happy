#!/usr/bin/env node
/**
 * Session Hook Forwarder
 * 
 * This script is executed by Claude hooks.
 * It reads JSON data from stdin and forwards it to Happy's hook server.
 * 
 * Usage: echo '{"session_id":"..."}' | node session_hook_forwarder.cjs <port>
 */

const http = require('http');

const port = parseInt(process.argv[2], 10);

if (!port || isNaN(port)) {
    process.exit(1);
}

const chunks = [];

process.stdin.on('data', (chunk) => {
    chunks.push(chunk);
});

process.stdin.on('end', () => {
    const body = Buffer.concat(chunks);
    let path = '/hook/session-start';

    try {
        const payload = JSON.parse(body.toString('utf8'));
        if (payload && typeof payload === 'object') {
            if (payload.hook_event_name === 'Stop') {
                path = '/hook/stop';
            } else if (payload.hook_event_name === 'UserPromptSubmit') {
                path = '/hook/user-prompt-submit';
            }
        }
    } catch {
        // Preserve the existing SessionStart fallback for malformed hook input.
    }
    
    const req = http.request({
        host: '127.0.0.1',
        port: port,
        method: 'POST',
        path,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': body.length
        }
    }, (res) => {
        res.resume(); // Drain response
    });
    
    req.on('error', () => {
        // Silently ignore errors - don't break Claude
    });
    
    req.end(body);
});

process.stdin.resume();

