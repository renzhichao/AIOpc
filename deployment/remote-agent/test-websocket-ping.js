/**
 * WebSocket Ping/Pong Test
 * Tests if ping/pong frames are correctly handled through nginx proxy
 */

const WebSocket = require('ws');

const API_KEY = 'sk-remote-daeb07a8f1aa04bbdd15974a4d485d52b593bd7ae1474e0e2013e78c5eb9e29f';
const WS_URL = 'ws://118.25.0.190/remote-ws?api_key=' + API_KEY;
const INSTANCE_ID = 'inst-remote-mmu7sgpd-854b3ba8292bf177';

console.log('Connecting to:', WS_URL);

const ws = new WebSocket(WS_URL);

let pingReceived = false;
let pongReceived = false;
let connectionStartTime = Date.now();

ws.on('open', () => {
    console.log('✅ WebSocket connection established');
    console.log('Sending registration message...');

    // Send registration
    ws.send(JSON.stringify({
        type: 'register',
        instance_id: INSTANCE_ID,
        timestamp: new Date().toISOString(),
        data: {}
    }));
});

ws.on('ping', (data) => {
    pingReceived = true;
    const elapsed = Date.now() - connectionStartTime;
    console.log(`📥 [${elapsed}ms] Received PING from server, data length:`, data ? data.length : 0);
    console.log('📤 Sending PONG response...');
    ws.pong(data);
});

ws.on('pong', (data) => {
    pongReceived = true;
    const elapsed = Date.now() - connectionStartTime;
    console.log(`📥 [${elapsed}ms] Received PONG from server`);
});

ws.on('message', (data) => {
    const elapsed = Date.now() - connectionStartTime;
    console.log(`📨 [${elapsed}ms] Received message:`, data.toString());
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
    const elapsed = Date.now() - connectionStartTime;
    console.log(`🔌 [${elapsed}ms] Connection closed`);
    console.log('   Code:', code);
    console.log('   Reason:', reason.toString());
    console.log('');
    console.log('📊 Summary:');
    console.log('   - Ping received:', pingReceived);
    console.log('   - Pong received:', pongReceived);
    console.log('   - Connection duration:', elapsed + 'ms');
    process.exit(0);
});

// Monitor connection for 60 seconds
setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
        console.log('⏱️ 60 seconds elapsed, connection still alive');
        ws.close(1000, 'Test complete');
    }
}, 60000);
