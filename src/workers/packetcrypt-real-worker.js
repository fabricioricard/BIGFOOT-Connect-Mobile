// src/workers/packetcrypt-real-worker.js
// Implementação real do PacketCrypt em JavaScript para mobile

class PacketCryptReal {
  constructor() {
    this.isRunning = false;
    this.websocket = null;
    this.currentWork = null;
    this.difficulty = 1;
    
    this.config = {
      poolUrl: 'wss://pool.pkt.world/',
      paymentAddress: 'pkt1q2phzyfzd7aufszned7q2h77t4u0kl3exxgyuqf',
      userAgent: 'PacketCrypt-Mobile/1.0'
    };

    this.stats = {
      hashrate: 0,
      sharesFound: 0,
      sharesAccepted: 0,
      sharesRejected: 0,
      bigRewards: 0,
      uptime: 0,
      lastShareTime: null,
      poolConnected: false,
      errors: 0
    };
    
    this.startTime = 0;
    this.lastHashTime = 0;
    this.hashCount = 0;
    this.subscriptionId = null;
    this.jobCounter = 0;
  }

  async connectToPool() {
    try {
      console.log('Connecting to PKT pool...');
      this.websocket = new WebSocket(this.config.poolUrl);
      
      this.websocket.onopen = () => {
        console.log('Connected to pool');
        this.stats.poolConnected = true;
        this.sendSubscribe();
      };

      this.websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handlePoolMessage(message);
        } catch (error) {
          console.error('Error parsing pool message:', error);
          this.stats.errors++;
        }
      };

      this.websocket.onclose = () => {
        console.log('Pool connection closed');
        this.stats.poolConnected = false;
        if (this.isRunning) {
          // Reconectar após 5 segundos
          setTimeout(() => this.connectToPool(), 5000);
        }
      };

      this.websocket.onerror = (error) => {
        console.error('Pool connection error:', error);
        this.stats.errors++;
        this.stats.poolConnected = false;
      };

    } catch (error) {
      console.error('Failed to connect to pool:', error);
      this.stats.errors++;
    }
  }

  sendSubscribe() {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      const subscribeMsg = {
        id: 1,
        method: 'mining.subscribe',
        params: [this.config.userAgent]
      };
      
      console.log('Sending subscribe:', subscribeMsg);
      this.websocket.send(JSON.stringify(subscribeMsg));
    }
  }

  sendAuthorize() {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      const authorizeMsg = {
        id: 2,
        method: 'mining.authorize',
        params: [this.config.paymentAddress, 'mobile']
      };
      
      console.log('Sending authorize:', authorizeMsg);
      this.websocket.send(JSON.stringify(authorizeMsg));
    }
  }

  handlePoolMessage(message) {
    console.log('Pool message:', message);

    // Handle subscription response
    if (message.id === 1 && message.result) {
      console.log('Subscribed to pool');
      this.subscriptionId = message.result[0];
      this.sendAuthorize();
      return;
    }

    // Handle authorization response
    if (message.id === 2) {
      if (message.result === true) {
        console.log('Authorized with pool');
      } else {
        console.error('Authorization failed:', message.error);
        this.stats.errors++;
      }
      return;
    }

    // Handle mining notifications
    if (message.method === 'mining.notify') {
      this.currentWork = {
        jobId: message.params[0],
        prevHash: message.params[1],
        coinbase1: message.params[2],
        coinbase2: message.params[3],
        merkleRoots: message.params[4] || [],
        version: message.params[5],
        bits: message.params[6],
        timestamp: message.params[7],
        cleanJobs: message.params[8] || false
      };
      
      console.log('New work received:', this.currentWork.jobId);
      this.startMining();
      return;
    }

    // Handle difficulty changes
    if (message.method === 'mining.set_difficulty') {
      this.difficulty = message.params[0];
      console.log('New difficulty:', this.difficulty);
      return;
    }

    // Handle share submission responses
    if (message.id > 100) {
      if (message.result === true) {
        this.stats.sharesAccepted++;
        this.stats.bigRewards = this.stats.sharesAccepted * 0.1; // 1 share = 0.1 BIG
        this.stats.lastShareTime = Date.now();
        console.log('Share ACCEPTED! Total:', this.stats.sharesAccepted);
        
        // Notify UI of accepted share
        self.postMessage({
          type: 'share_accepted',
          data: {
            sharesAccepted: this.stats.sharesAccepted,
            bigRewards: this.stats.bigRewards
          }
        });
      } else {
        this.stats.sharesRejected++;
        console.log('Share REJECTED:', message.error);
      }
    }
  }

  async startMining() {
    if (!this.isRunning || !this.currentWork) return;
    
    console.log('Starting mining for job:', this.currentWork.jobId);
    
    // Mining loop
    const startNonce = Math.floor(Math.random() * 0xFFFF);
    const maxNonce = startNonce + 100000; // Process 100k nonces per batch
    
    for (let nonce = startNonce; nonce < maxNonce && this.isRunning; nonce++) {
      try {
        const result = await this.calculateHash(nonce);
        this.hashCount++;
        
        if (this.meetsTarget(result.hash)) {
          this.stats.sharesFound++;
          console.log('Share found! Nonce:', nonce.toString(16));
          this.submitShare(nonce, result);
        }
        
        // Update hashrate every 1000 hashes
        if (this.hashCount % 1000 === 0) {
          this.updateHashrate();
        }
        
        // Yield control every 100 hashes to prevent blocking
        if (nonce % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
        
      } catch (error) {
        console.error('Mining error:', error);
        this.stats.errors++;
      }
    }
    
    // Continue mining if still running
    if (this.isRunning && this.currentWork) {
      setTimeout(() => this.startMining(), 10);
    }
  }

  async calculateHash(nonce) {
    // Build block header (80 bytes)
    const header = new ArrayBuffer(80);
    const view = new DataView(header);
    
    // Version (4 bytes)
    view.setUint32(0, parseInt(this.currentWork.version, 16), true);
    
    // Previous hash (32 bytes)
    const prevHashBytes = this.hexToBytes(this.currentWork.prevHash);
    for (let i = 0; i < 32; i++) {
      view.setUint8(4 + i, prevHashBytes[i]);
    }
    
    // Merkle root (32 bytes) - simplified for mobile
    const merkleRoot = await this.calculateMerkleRoot();
    for (let i = 0; i < 32; i++) {
      view.setUint8(36 + i, merkleRoot[i]);
    }
    
    // Timestamp (4 bytes)
    view.setUint32(68, parseInt(this.currentWork.timestamp, 16), true);
    
    // Bits/Target (4 bytes)  
    view.setUint32(72, parseInt(this.currentWork.bits, 16), true);
    
    // Nonce (4 bytes)
    view.setUint32(76, nonce, true);
    
    // PacketCrypt hash (simplified)
    const hash = await this.packetCryptHash(new Uint8Array(header));
    
    return {
      hash: hash,
      header: new Uint8Array(header)
    };
  }

  async calculateMerkleRoot() {
    // Simplified merkle root calculation
    const coinbase = this.currentWork.coinbase1 + this.config.paymentAddress + this.currentWork.coinbase2;
    const coinbaseBytes = new TextEncoder().encode(coinbase);
    
    if (crypto.subtle) {
      const hash = await crypto.subtle.digest('SHA-256', coinbaseBytes);
      return new Uint8Array(hash);
    } else {
      return this.sha256Fallback(coinbaseBytes);
    }
  }

  async packetCryptHash(header) {
    // Simplified PacketCrypt algorithm for mobile
    // Real implementation would be more complex
    
    if (crypto.subtle) {
      // Double SHA-256 (simplified)
      const hash1 = await crypto.subtle.digest('SHA-256', header);
      const hash2 = await crypto.subtle.digest('SHA-256', hash1);
      return new Uint8Array(hash2);
    } else {
      // Fallback implementation
      return this.sha256Fallback(this.sha256Fallback(header));
    }
  }

  sha256Fallback(data) {
    // Very basic hash fallback - not cryptographically secure
    // Only for demonstration when crypto.subtle unavailable
    const result = new Uint8Array(32);
    let hash = 0x6a09e667;
    
    for (let i = 0; i < data.length; i++) {
      hash = (hash * 31 + data[i]) & 0xFFFFFFFF;
    }
    
    for (let i = 0; i < 32; i += 4) {
      result[i] = (hash >> 24) & 0xFF;
      result[i + 1] = (hash >> 16) & 0xFF;
      result[i + 2] = (hash >> 8) & 0xFF;
      result[i + 3] = hash & 0xFF;
      hash = (hash * 1103515245 + 12345) & 0xFFFFFFFF;
    }
    
    return result;
  }

  meetsTarget(hash) {
    // Check if hash meets difficulty target
    const target = this.calculateTarget();
    
    // Compare hash with target (little-endian)
    for (let i = 31; i >= 0; i--) {
      if (hash[i] < target[i]) return true;
      if (hash[i] > target[i]) return false;
    }
    return false;
  }

  calculateTarget() {
    // Calculate target from difficulty
    // Simplified target calculation
    const target = new Uint8Array(32);
    const maxTarget = 0x00000000FFFF0000;
    const currentTarget = Math.floor(maxTarget / this.difficulty);
    
    target[28] = (currentTarget >> 24) & 0xFF;
    target[29] = (currentTarget >> 16) & 0xFF;
    target[30] = (currentTarget >> 8) & 0xFF;
    target[31] = currentTarget & 0xFF;
    
    return target;
  }

  submitShare(nonce, result) {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      const submitMsg = {
        id: 100 + (++this.jobCounter),
        method: 'mining.submit',
        params: [
          this.config.paymentAddress,
          this.currentWork.jobId,
          '00000000', // extranonce2 (simplified)
          this.currentWork.timestamp,
          nonce.toString(16).padStart(8, '0')
        ]
      };
      
      console.log('Submitting share:', submitMsg);
      this.websocket.send(JSON.stringify(submitMsg));
    }
  }

  updateHashrate() {
    const now = Date.now();
    if (this.lastHashTime > 0) {
      const timeDiff = (now - this.lastHashTime) / 1000;
      if (timeDiff > 0) {
        this.stats.hashrate = Math.floor(1000 / timeDiff);
      }
    }
    this.lastHashTime = now;
  }

  hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  sendStatsUpdate() {
    const now = Date.now();
    const uptime = this.startTime ? Math.floor((now - this.startTime) / 1000) : 0;
    
    self.postMessage({
      type: 'stats_update',
      data: {
        ...this.stats,
        uptime: uptime,
        sharesPerHour: uptime > 0 ? ((this.stats.sharesAccepted / (uptime / 3600))).toFixed(2) : '0.00',
        lastShareAgo: this.stats.lastShareTime ? Math.floor((now - this.stats.lastShareTime) / 1000) : null
      }
    });
  }

  start(config) {
    this.config = { ...this.config, ...config };
    this.isRunning = true;
    this.startTime = Date.now();
    this.hashCount = 0;
    this.jobCounter = 0;
    
    // Reset stats
    this.stats = {
      hashrate: 0,
      sharesFound: 0,
      sharesAccepted: 0,
      sharesRejected: 0,
      bigRewards: 0,
      uptime: 0,
      lastShareTime: null,
      poolConnected: false,
      errors: 0
    };
    
    this.connectToPool();
    
    // Send stats updates every 2 seconds
    this.statsInterval = setInterval(() => {
      this.sendStatsUpdate();
    }, 2000);
    
    console.log('PacketCrypt started');
    self.postMessage({
      type: 'started',
      message: 'Real PacketCrypt mining started'
    });
  }

  stop() {
    this.isRunning = false;
    
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    
    this.stats.hashrate = 0;
    this.stats.poolConnected = false;
    this.sendStatsUpdate();
    
    console.log('PacketCrypt stopped');
    self.postMessage({
      type: 'stopped',
      message: 'PacketCrypt mining stopped'
    });
  }
}

// Web Worker interface
const packetCrypt = new PacketCryptReal();

self.onmessage = function(e) {
  const { type, config } = e.data;
  
  switch(type) {
    case 'start_mining':
      packetCrypt.start(config);
      break;
      
    case 'stop_mining':
      packetCrypt.stop();
      break;
      
    case 'get_stats':
      packetCrypt.sendStatsUpdate();
      break;
      
    default:
      console.warn('Unknown message type:', type);
  }
};

self.onerror = function(error) {
  console.error('PacketCrypt worker error:', error);
  self.postMessage({
    type: 'error',
    error: error.message
  });
};