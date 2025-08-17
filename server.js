// server.js - Backend for Multiverse MeshMap
const express = require('express');
const mqtt = require('mqtt');
const protobuf = require('protobufjs');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Lightning bolt MQTT setup
const lightningMqttClient = mqtt.connect('mqtt://mqtt.meshtastic.org:1883', {
    username: 'meshdev',
    password: 'large4cats',
    clientId: `meshmap_lightning_${Date.now()}`
});
let lightningNodes = new Map();

// Protobuf definitions for Meshtastic
let ServiceEnvelope, MeshPacket, Position, Data;

async function initProtobuf() {
    try {
        const root = new protobuf.Root();
        
        const serviceEnvelope = new protobuf.Type('ServiceEnvelope');
        serviceEnvelope.add(new protobuf.Field('packet', 1, 'MeshPacket'));
        serviceEnvelope.add(new protobuf.Field('channel_id', 2, 'string'));
        serviceEnvelope.add(new protobuf.Field('gateway_id', 3, 'string'));
        
        const meshPacket = new protobuf.Type('MeshPacket');
        meshPacket.add(new protobuf.Field('from', 1, 'fixed32'));
        meshPacket.add(new protobuf.Field('to', 2, 'fixed32'));
        meshPacket.add(new protobuf.Field('decoded', 3, 'Data'));
        meshPacket.add(new protobuf.Field('id', 4, 'fixed32'));
        meshPacket.add(new protobuf.Field('rx_time', 5, 'fixed32'));
        meshPacket.add(new protobuf.Field('rx_snr', 6, 'float'));
        meshPacket.add(new protobuf.Field('hop_limit', 7, 'uint32'));
        meshPacket.add(new protobuf.Field('want_ack', 8, 'bool'));
        meshPacket.add(new protobuf.Field('priority', 9, 'uint32'));
        meshPacket.add(new protobuf.Field('rx_rssi', 10, 'int32'));
        
        const data = new protobuf.Type('Data');
        data.add(new protobuf.Field('portnum', 1, 'uint32'));
        data.add(new protobuf.Field('payload', 2, 'bytes'));
        
        const position = new protobuf.Type('Position');
        position.add(new protobuf.Field('latitude_i', 1, 'sfixed32'));
        position.add(new protobuf.Field('longitude_i', 2, 'sfixed32'));
        position.add(new protobuf.Field('altitude', 3, 'int32'));
        position.add(new protobuf.Field('time', 4, 'fixed32'));
        
        root.add(serviceEnvelope);
        root.add(meshPacket);
        root.add(data);
        root.add(position);
        
        ServiceEnvelope = root.lookupType('ServiceEnvelope');
        MeshPacket = root.lookupType('MeshPacket');
        Data = root.lookupType('Data');
        Position = root.lookupType('Position');
        
        console.log('⚡ Protobuf definitions loaded successfully');
    } catch (error) {
        console.error('⚡ Protobuf init error:', error);
    }
}

initProtobuf();

lightningMqttClient.on('connect', () => {
    console.log('⚡ Connected to Meshtastic MQTT - tracking lightning nodes');
    // Subscribe to US region instead of global
    lightningMqttClient.subscribe('msh/US/#', (err) => {
        if (err) console.error('Lightning MQTT subscription error:', err);
        else console.log('⚡ Subscribed to msh/US/# - US region lightning strikes!');
    });
lightningMqttClient.on('message', (topic, message) => {
    try {
        // First try to extract text data (node names, IDs, firmware) for fallback
        const messageStr = message.toString();
        const nodeNameMatch = messageStr.match(/([A-Z0-9-]{3,})\s+([A-Z0-9-]{2,})/);
        const nodeIdMatch = messageStr.match(/!([a-f0-9]{8})/);
        const firmwareMatch = messageStr.match(/(\d+\.\d+\.\d+\.[a-f0-9]+)/);
        
        let nodeName = 'Unknown';
        let shortName = 'UNK';
        let nodeId = 'unknown';
        let firmware = 'unknown';
        
        if (nodeNameMatch) {
            nodeName = nodeNameMatch[1];
            shortName = nodeNameMatch[2];
        }
        if (nodeIdMatch) {
            nodeId = nodeIdMatch[1];
        }
        if (firmwareMatch) {
            firmware = firmwareMatch[1];
        }
        
        // Try to parse as protobuf ServiceEnvelope
        if (ServiceEnvelope) {
            try {
                const envelope = ServiceEnvelope.decode(message);
                if (envelope.packet && envelope.packet.decoded) {
                    const packet = envelope.packet;
                    
                    // Check if this is a position packet (portnum 3 = POSITION_APP)
                    if (packet.decoded.portnum === 3) {
                        const positionData = Position.decode(packet.decoded.payload);
                        
                        // Convert from integer coordinates to decimal degrees
                        const latitude = positionData.latitude_i / 10000000;
                        const longitude = positionData.longitude_i / 10000000;
                        
                        // Validate coordinates
                        if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 && 
                            latitude !== 0 && longitude !== 0) {
                            const fromId = packet.from.toString(16).padStart(8, '0');
                            
                            lightningNodes.set(fromId, {
                                id: fromId,
                                name: nodeName,
                                shortName: shortName,
                                firmware: firmware,
                                latitude: latitude,
                                longitude: longitude,
                                timestamp: Date.now(),
                                topic: topic,
                                region: topic.split('/')[1],
                                type: 'live_transmission',
                                snr: packet.rx_snr || null,
                                rssi: packet.rx_rssi || null,
                                time: positionData.time || null
                            });
                            
                            console.log(`⚡ Lightning node: ${nodeName} (${fromId}) at ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
                            return;
                        }
                    }
                }
            } catch (protobufError) {
                // Not a valid protobuf, fall back to text parsing
            }
        }
        
        // Fallback: If protobuf parsing fails, store with random coords (temporary)
        if (nodeNameMatch && nodeIdMatch) {
            const randomLat = 25 + Math.random() * 25;
            const randomLng = -125 + Math.random() * 50;
            
            lightningNodes.set(nodeIdMatch[1], {
                id: nodeIdMatch[1],
                name: nodeName,
                shortName: shortName,
                firmware: firmware,
                latitude: randomLat,
                longitude: randomLng,
                timestamp: Date.now(),
                topic: topic,
                region: topic.split('/')[1],
                type: 'live_transmission_fallback'
            });
            console.log(`⚡ Lightning node (fallback): ${nodeName} (${nodeIdMatch[1]}) - random coords`);
        }
        
    } catch (err) {
        console.error('Lightning MQTT parse error:', err);
    }
});

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static files (your HTML file)
app.use(express.static('public'));

// API endpoint to fetch Meshtastic nodes (bypasses CORS)
app.get('/api/nodes', async (req, res) => {
    try {
        console.log('Fetching nodes from meshmap.net...');
        
        
        // Try multiple sources for Meshtastic node data
        const sources = [
            'https://meshmap.net/nodes.json',
            'https://meshtastic.liamcottle.net/api/nodes', // Alternative API
            'https://api.meshtastic.org/nodes' // Another possible source
        ];
        
        for (const url of sources) {
            try {
                console.log('Trying: ' + url);
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Multiverse-MeshMap/1.0'
                    },
                    timeout: 10000 // 10 second timeout
                });
                
                if (!response.ok) {
                    console.log(url + ' failed with status: ' + response.status);
                    continue;
                }
                
                const data = await response.json();
                
                // Handle meshmap.net format: object with node IDs as keys
                let nodes;
                if (Array.isArray(data)) {
                    nodes = data;
                } else if (typeof data === 'object' && data !== null) {
                    nodes = Object.values(data);
                    console.log('Converted object with ' + nodes.length + ' nodes to array');
                } else {
                    console.log(url + ' returned invalid data: ' + typeof data);
                    continue;
                }
                
                console.log('Success! Got ' + nodes.length + ' nodes from ' + url);
                
                // Normalize the data format
                const normalizedNodes = nodes.map(node => {
                    // Handle different API response formats
                    const lat = node.latitude || node.lat || node.position?.lat || node.position?.latitude;
                    const lng = node.longitude || node.lng || node.lon || node.position?.lng || node.position?.longitude;
                    
                    return {
                        id: node.id || node.node_id || node.hex_id,
                        name: node.name || node.longName || node.long_name || node.shortName || node.short_name,
                        latitude: parseFloat(lat) / 10000000, // Convert meshmap.net coordinates
                        longitude: parseFloat(lng) / 10000000, // Convert meshmap.net coordinates
                        hardware: node.hardware || node.hwModel || node.hw_model,
                        lastSeen: node.last_seen || node.lastSeen || node.updated_at
                    };
                }).filter(node => {
                    // Filter out nodes without valid coordinates
                    return !isNaN(node.latitude) && !isNaN(node.longitude) &&
                           node.latitude >= -90 && node.latitude <= 90 &&
                           node.longitude >= -180 && node.longitude <= 180;
                });
                
                console.log('Returning ' + normalizedNodes.length + ' valid nodes');
                return res.json(normalizedNodes);
                
            } catch (fetchError) {
                console.log('Error fetching from ' + url + ': ' + fetchError.message);
                continue;
            }
        }
        
        // If all sources fail, return test data
        console.log('All sources failed, returning test data');
        const testNodes = [
            { 
                id: "test1", 
                name: "Test Node NYC", 
                latitude: 40.7128, 
                longitude: -74.0060,
                hardware: "Test Hardware"
            },
            { 
                id: "test2", 
                name: "Test Node LA", 
                latitude: 34.0522, 
                longitude: -118.2437,
                hardware: "Test Hardware"
            },
            { 
                id: "test3", 
                name: "Test Node Chicago", 
                latitude: 41.8781, 
                longitude: -87.6298,
                hardware: "Test Hardware"
            },
            { 
                id: "test4", 
                name: "Test Node Houston", 
                latitude: 29.7604, 
                longitude: -95.3698,
                hardware: "Test Hardware"
            },
            { 
                id: "test5", 
                name: "Test Node Philadelphia", 
                latitude: 39.9526, 
                longitude: -75.1652,
                hardware: "Test Hardware"
            }
        ];
        
        res.json(testNodes);
        
    } catch (error) {
        console.error('Error in /api/nodes:', error);
        res.status(500).json({ 
            error: 'Failed to fetch node data', 
            message: error.message 
        });
    }
});

// API endpoint for lightning bolt nodes
app.get('/api/lightning-nodes', (req, res) => {
    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
    for (const [nodeId, node] of lightningNodes.entries()) {
        if (node.timestamp < tenMinutesAgo) {
            lightningNodes.delete(nodeId);
        }
    }
    const nodes = Array.from(lightningNodes.values());
    console.log(`⚡ Serving ${nodes.length} lightning nodes`);
    res.json(nodes);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'Multiverse MeshMap Backend',
        lightningMqttConnected: lightningMqttClient.connected,
        lightningNodes: lightningNodes.size
    });
});

// Catch-all handler: send back React app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('Server running on http://0.0.0.0:' + PORT);
    console.log('API endpoints:');
    console.log('  GET /api/nodes - Fetch Meshtastic nodes');
    console.log('  GET /api/lightning-nodes - Live lightning nodes ⚡');
    console.log('  GET /api/health - Health check');
    console.log('  Static files served from ./public/');
});

// Handle server errors gracefully
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
