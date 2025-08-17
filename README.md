# CyberPony Express Network Map

A real-time Meshtastic network mapping tool that visualizes donated node requests and active broadcasting nodes to optimize network expansion for supporting trafficking victims and vulnerable communities.

## Overview

This application maps requested Meshtastic node locations from CyberPony Express donors, geocodes their positions, and monitors live network activity through MQTT. It calculates network expansion probability and prioritizes deployment locations to maximize communication coverage for those who need it most.

## Features

- **Request Mapping**: Visualizes donor-requested node locations with geocoded coordinates
- **Location Classification**: Categorizes placement locations by type and strategic value
- **Live Network Monitoring**: MQTT listener tracks active broadcasting nodes in real-time
- **Expansion Analytics**: Calculates likelihood of network growth from each potential location
- **Priority Markers**: Visual indicators showing deployment priority based on network impact
- **Network Impact Analysis**: Identifies optimal placement for maximum community benefit

# Meshtastic Network Map

A mapping tool for visualizing CyberPony Express node requests and live Meshtastic network activity.

## What it does

- Maps requested node locations from people who want donated Meshtastic nodes
- Shows where people said they'd place nodes and what type of location it is
- Geocodes addresses to plot locations on the map
- Listens to MQTT for live broadcasting nodes
- Calculates which locations are most likely to expand the network
- Uses priority markers to identify optimal placement locations

## Features

- **Node Request Mapping**: Displays geocoded locations from donation requests
- **Location Types**: Shows what kind of place each requested location is
- **Live Network Data**: MQTT listener tracks active broadcasting nodes
- **Network Expansion Analysis**: Calculates likelihood of network growth
- **Priority Markers**: Visual indicators for deployment priority

## Installation

```bash
git clone https://github.com/tanahak/meshmap.git
cd meshmap
npm install
node server.js
```

Access at `https://meshmap.tanaha.dev`

## Files

- `server.js` - Main server
- `lightning-server.js` - Lightning network integration  
- `index.html` - Map interface
- `public/index.html` - Additional components

## Purpose

Community impact analysis for Meshtastic network expansion.
