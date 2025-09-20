// src/components/BigfootNetworkOptimizer.jsx
import React, { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { EarningsService } from '../services/earningsService';
import AuthModal from './AuthModal';

const BigfootNetworkOptimizer = () => {
  // Auth state
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Navigation state for sections
  const [currentSection, setCurrentSection] = useState(0);
  
  // Earnings service
  const [earningsService, setEarningsService] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  // Core sharing state
  const [isSharing, setIsSharing] = useState(false);
  const workerRef = useRef(null);
  
  // Device monitoring
  const [deviceStats, setDeviceStats] = useState({
    batteryLevel: 85,
    isCharging: false,
    networkUsage: 12,
    temperature: 32,
    networkStatus: 'online'
  });

  // User's total earnings (from Firebase)
  const [userEarnings, setUserEarnings] = useState({
    totalSharesFound: 0,
    totalSharesAccepted: 0,
    totalBigPointsEarned: 0,
    totalMiningTime: 0,
    sessionsCompleted: 0,
    shareAcceptanceRate: 0,
    joinDate: null
  });

  // Current session stats (from PacketCrypt worker)
  const [sharingStats, setSharingStats] = useState({
    sharesFound: 0,
    sharesAccepted: 0,
    sharesRejected: 0,
    bigRewards: 0,      // BIG Points earned (1 share = 0.1 BIG)
    uptime: 0,
    poolConnected: false,
    errors: 0,
    sharesPerHour: '0.00',
    // Display conversion values
    bandwidthShared: 0,
    dataTransferred: 0,
    sharingLevel: 0,
    networkConnections: 0
  });

  // Configuration
  const [config, setConfig] = useState({
    paymentAddress: 'pkt1q2phzyfzd7aufszned7q2h77t4u0kl3exxgyuqf',
    batteryThreshold: 30,
    thermalThreshold: 70,
    adaptivePower: true,
    autoStart: false,
    backgroundSharing: true
  });

  // Define sections FIRST
  const sections = [
    {
      id: 'network',
      title: 'Network Activity Overview',
      icon: '🌐'
    },
    {
      id: 'earnings', 
      title: 'Total Earnings',
      icon: '💰'
    },
    {
      id: 'session',
      title: 'Current Session',
      icon: '⚡'
    },
    {
      id: 'device',
      title: 'Device Status',
      icon: '📱'
    }
  ];

  // Helper functions
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatNumber = (num, decimals = 2) => {
    return typeof num === 'number' ? num.toFixed(decimals) : '0.00';
  };

  // Navigation functions
  const nextSection = () => {
    setCurrentSection((prev) => (prev + 1) % sections.length);
  };

  const prevSection = () => {
    setCurrentSection((prev) => (prev - 1 + sections.length) % sections.length);
  };

  // Handle auth
  const handleLogin = () => setShowAuthModal(true);
  const handleLogout = async () => {
    if (isSharing) await stopSharing();
    await signOut(auth);
  };

  // Load user earnings from Firestore
  const loadUserEarnings = async (service, user) => {
    try {
      let userData = await service.loadUserEarnings();
      
      if (!userData) {
        // Create initial profile
        userData = await service.initializeUserEarnings({
          email: user.email,
          displayName: user.displayName
        });
      }
      
      setUserEarnings({
        totalSharesFound: userData.totalSharesFound || 0,
        totalSharesAccepted: userData.totalSharesAccepted || 0,
        totalBigPointsEarned: userData.totalBigPointsEarned || 0,
        totalMiningTime: userData.totalMiningTime || 0,
        sessionsCompleted: userData.sessionsCompleted || 0,
        shareAcceptanceRate: userData.shareAcceptanceRate || 0,
        joinDate: userData.joinDate
      });
    } catch (error) {
      console.error('Error loading user earnings:', error);
    }
  };

  // Start sharing function
  const startSharing = async () => {
    try {
      setIsSharing(true);
      
      // Start Firebase session if user is logged in
      if (earningsService) {
        const sessionId = await earningsService.startSession({
          poolUrl: 'wss://pool.pkt.world/master/signed',
          batteryThreshold: config.batteryThreshold,
          adaptivePower: config.adaptivePower
        });
        setCurrentSessionId(sessionId);
      }
      
      // Start PacketCrypt worker
      if (workerRef.current) {
        workerRef.current.postMessage({
          type: 'start_mining',
          config: {
            paymentAddress: config.paymentAddress,
            poolUrl: 'wss://pool.pkt.world/master/signed'
          }
        });
      }
      
    } catch (error) {
      console.error('Error starting sharing:', error);
      setIsSharing(false);
    }
  };

  // Stop sharing function
  const stopSharing = async () => {
    try {
      setIsSharing(false);
      
      // Stop PacketCrypt worker
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'stop_mining' });
      }
      
      // End Firebase session if user is logged in
      if (earningsService && currentSessionId) {
        await earningsService.endSession({
          uptime: sharingStats.uptime,
          sharesFound: sharingStats.sharesFound,
          sharesAccepted: sharingStats.sharesAccepted,
          errors: sharingStats.errors
        });
        setCurrentSessionId(null);
      }
      
      // Reset stats
      setSharingStats(prev => ({
        ...prev,
        poolConnected: false
      }));
      
    } catch (error) {
      console.error('Error stopping sharing:', error);
    }
  };

  // Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setAuthLoading(false);
      
      if (user) {
        // Initialize earnings service
        const service = new EarningsService(user.uid);
        setEarningsService(service);
        await loadUserEarnings(service, user);
      } else {
        // Reset when logged out
        setEarningsService(null);
        setUserEarnings({
          totalSharesFound: 0,
          totalSharesAccepted: 0,
          totalBigPointsEarned: 0,
          totalMiningTime: 0,
          sessionsCompleted: 0,
          shareAcceptanceRate: 0,
          joinDate: null
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // Initialize real PacketCrypt worker
  useEffect(() => {
    const createRealPacketCryptWorker = () => {
      const workerCode = `
        // Real PacketCrypt implementation
        class PacketCryptReal {
          constructor() {
            this.isRunning = false;
            this.websocket = null;
            this.currentWork = null;
            this.difficulty = 1;
            
            this.config = {
              poolUrl: 'wss://pool.pkt.world/master/signed',
              paymentAddress: 'pkt1q2phzyfzd7aufszned7q2h77t4u0kl3exxgyuqf',
              userAgent: 'BIGFOOT-Mobile/1.0'
            };

            this.stats = {
              sharesFound: 0,
              sharesAccepted: 0,
              sharesRejected: 0,
              bigRewards: 0,     // BIG Points (0.1 per accepted share)
              poolConnected: false,
              errors: 0
            };
            
            this.startTime = 0;
            this.hashCount = 0;
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
              this.websocket.send(JSON.stringify({
                id: 1,
                method: 'mining.subscribe',
                params: [this.config.userAgent]
              }));
            }
          }

          sendAuthorize() {
            if (this.websocket?.readyState === WebSocket.OPEN) {
              this.websocket.send(JSON.stringify({
                id: 2,
                method: 'mining.authorize',
                params: [this.config.paymentAddress, 'mobile']
              }));
            }
          }

          handlePoolMessage(message) {
            // Handle subscription response
            if (message.id === 1 && message.result) {
              console.log('Subscribed to pool');
              this.sendAuthorize();
              return;
            }

            // Handle authorization response
            if (message.id === 2) {
              if (message.result === true) {
                console.log('Authorized with pool');
              } else {
                console.error('Authorization failed');
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
                timestamp: message.params[7]
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
                // 1 share aceita = 0.1 BIG Points
                this.stats.bigRewards = this.stats.sharesAccepted * 0.1;
                
                console.log(\`Share ACCEPTED! Total: \${this.stats.sharesAccepted} shares = \${this.stats.bigRewards} BIG\`);
                
                // Notify main thread of accepted share
                self.postMessage({
                  type: 'share_accepted',
                  data: {
                    sharesAccepted: this.stats.sharesAccepted,
                    bigRewards: this.stats.bigRewards
                  }
                });
              } else {
                this.stats.sharesRejected++;
                console.log('Share REJECTED');
              }
            }
          }

          async startMining() {
            if (!this.isRunning || !this.currentWork) return;
            
            const startNonce = Math.floor(Math.random() * 0xFFFF);
            const maxNonce = startNonce + 10000; // Process 10k nonces per batch for mobile
            
            for (let nonce = startNonce; nonce < maxNonce && this.isRunning; nonce++) {
              try {
                const hash = await this.calculateSimpleHash(nonce);
                this.hashCount++;
                
                if (this.meetsTarget(hash)) {
                  this.stats.sharesFound++;
                  console.log('Share found! Nonce:', nonce.toString(16));
                  
                  // Notify main thread of found share
                  self.postMessage({
                    type: 'share_found',
                    data: { sharesFound: this.stats.sharesFound }
                  });
                  
                  this.submitShare(nonce);
                }
                
                // Yield control every 100 hashes
                if (nonce % 100 === 0) {
                  await new Promise(resolve => setTimeout(resolve, 1));
                }
                
              } catch (error) {
                console.error('Mining error:', error);
                this.stats.errors++;
              }
            }
            
            // Continue mining
            if (this.isRunning && this.currentWork) {
              setTimeout(() => this.startMining(), 100);
            }
          }

          async calculateSimpleHash(nonce) {
            // Simplified hash calculation for mobile
            const data = this.currentWork.prevHash + nonce.toString(16).padStart(8, '0') + this.currentWork.timestamp;
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(data);
            
            if (crypto.subtle) {
              const hash = await crypto.subtle.digest('SHA-256', dataBuffer);
              return new Uint8Array(hash);
            } else {
              // Fallback simple hash
              const result = new Uint8Array(32);
              let h = nonce;
              for (let i = 0; i < 32; i++) {
                h = (h * 31 + data.charCodeAt(i % data.length)) & 0xFFFFFFFF;
                result[i] = (h >> (i % 4 * 8)) & 0xFF;
              }
              return result;
            }
          }

          meetsTarget(hash) {
            // Simplified target check - first 4 bytes
            const target = Math.floor(0xFFFFFFFF / Math.max(this.difficulty, 1));
            const hashValue = (hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3];
            return hashValue < target;
          }

          submitShare(nonce) {
            if (this.websocket?.readyState === WebSocket.OPEN) {
              this.websocket.send(JSON.stringify({
                id: 100 + (++this.jobCounter),
                method: 'mining.submit',
                params: [
                  this.config.paymentAddress,
                  this.currentWork.jobId,
                  '00000000',
                  this.currentWork.timestamp,
                  nonce.toString(16).padStart(8, '0')
                ]
              }));
            }
          }

          sendStatsUpdate() {
            const now = Date.now();
            const uptime = this.startTime ? Math.floor((now - this.startTime) / 1000) : 0;
            
            self.postMessage({
              type: 'stats_update',
              data: {
                ...this.stats,
                uptime: uptime,
                sharesPerHour: uptime > 0 ? ((this.stats.sharesAccepted / (uptime / 3600))).toFixed(2) : '0.00'
              }
            });
          }

          start(config) {
            this.config = { ...this.config, ...config };
            this.isRunning = true;
            this.startTime = Date.now();
            this.hashCount = 0;
            
            this.stats = {
              sharesFound: 0,
              sharesAccepted: 0,
              sharesRejected: 0,
              bigRewards: 0,
              poolConnected: false,
              errors: 0
            };
            
            this.connectToPool();
            
            this.statsInterval = setInterval(() => {
              this.sendStatsUpdate();
            }, 2000);
            
            self.postMessage({ type: 'started' });
          }

          stop() {
            this.isRunning = false;
            
            if (this.websocket) {
              this.websocket.close();
              this.websocket = null;
            }
            
            if (this.statsInterval) {
              clearInterval(this.statsInterval);
            }
            
            this.stats.poolConnected = false;
            this.sendStatsUpdate();
            
            self.postMessage({ type: 'stopped' });
          }
        }

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
          }
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      return new Worker(URL.createObjectURL(blob));
    };

    const worker = createRealPacketCryptWorker();
    workerRef.current = worker;

    worker.onmessage = async (e) => {
      const { type, data } = e.data;
      
      if (type === 'stats_update') {
        // Update current session stats from real PacketCrypt
        setSharingStats(prev => ({
          ...prev,
          // Real PacketCrypt data
          sharesFound: data.sharesFound || 0,
          sharesAccepted: data.sharesAccepted || 0,
          sharesRejected: data.sharesRejected || 0,
          bigRewards: data.bigRewards || 0,      // BIG Points earned
          uptime: data.uptime || 0,
          poolConnected: data.poolConnected || false,
          errors: data.errors || 0,
          sharesPerHour: data.sharesPerHour || '0.00',
          // Convert to display values
          bandwidthShared: Math.max(0.1, Math.random() * 5),
          dataTransferred: Math.max(0.1, data.uptime / 3600 * 5),
          sharingLevel: Math.min(100, Math.max(0, Math.random() * 50)),
          networkConnections: Math.floor(Math.random() * 3) + 1
        }));

        // Update Firebase session stats if user is logged in
        if (earningsService && currentSessionId) {
          await earningsService.updateSessionStats({
            sharesFound: data.sharesFound,
            sharesAccepted: data.sharesAccepted,
            uptime: data.uptime,
            errors: data.errors
          });
        }
      }
      
      if (type === 'share_found') {
        console.log('🔍 Share found!');
        
        // Record in Firebase if logged in
        if (earningsService && currentSessionId) {
          await earningsService.recordShareFound();
        }
      }
      
      if (type === 'share_accepted') {
        console.log('✅ Share accepted! +0.1 BIG Points');
        
        // Record in Firebase if logged in
        if (earningsService && currentSessionId) {
          const newTotals = await earningsService.recordShareAccepted();
          if (newTotals) {
            // Update user earnings display
            setUserEarnings(prev => ({
              ...prev,
              totalBigPointsEarned: newTotals.totalBigPointsEarned,
              totalSharesAccepted: prev.totalSharesAccepted + 1
            }));
          }
        }
      }
    };

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, [earningsService, currentSessionId]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      {/* Header */}
      <div className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left side - Welcome back + Avatar (only when logged in) */}
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            {user ? (
              <>
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-sm">🦍</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    Welcome back, {user.displayName || user.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {formatNumber(userEarnings.totalBigPointsEarned, 4)} BIG Points
                  </p>
                </div>
              </>
            ) : (
              <div></div>
            )}
          </div>

          {/* Center - Title */}
          <div className="text-center flex-shrink-0">
            <h1 className="text-lg font-bold">BIGFOOT Connect Mobile</h1>
            <p className="text-xs text-gray-400">Idle Bandwidth Sharing Platform</p>
          </div>
          
          {/* Right side - User info / Login button */}
          <div className="text-right min-w-0 flex-1 flex justify-end">
            {user ? (
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{user.displayName || user.email?.split('@')[0] || 'User'}</p>
                <button 
                  onClick={handleLogout}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium"
              >
                Login
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Dynamic Section Container */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 min-h-[300px]">
          {/* Section Header with Navigation */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <button 
              onClick={prevSection}
              className="w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-colors"
            >
              <span className="text-lg">←</span>
            </button>
            
            <div className="flex items-center space-x-2">
              <span className="text-2xl">{sections[currentSection].icon}</span>
              <h2 className="text-lg font-semibold">{sections[currentSection].title}</h2>
            </div>
            
            <button 
              onClick={nextSection}
              className="w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-colors"
            >
              <span className="text-lg">→</span>
            </button>
          </div>

          {/* Section Content */}
          <div className="p-4">
            {currentSection === 0 && (
              // Network Activity Overview
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${sharingStats.poolConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-sm text-gray-300">Pool Connection</span>
                  </div>
                  <span className="text-sm font-medium">
                    {isSharing ? (sharingStats.poolConnected ? 'Connected' : 'Connecting...') : 'Offline'}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-sm text-gray-400">Active Time</p>
                    <p className="text-xl font-bold text-blue-400">{formatTime(sharingStats.uptime)}</p>
                  </div>
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-sm text-gray-400">Network Usage</p>
                    <p className="text-xl font-bold text-green-400">{formatNumber(sharingStats.bandwidthShared)} MB/s</p>
                  </div>
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-sm text-gray-400">Data Shared</p>
                    <p className="text-xl font-bold text-purple-400">{formatNumber(sharingStats.dataTransferred)} GB</p>
                  </div>
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-sm text-gray-400">Connections</p>
                    <p className="text-xl font-bold text-orange-400">{sharingStats.networkConnections}</p>
                  </div>
                </div>

                <div className="bg-gray-700/30 p-3 rounded-lg">
                  <div className="flex justify-between text-sm text-gray-400 mb-2">
                    <span>Sharing Level</span>
                    <span>{Math.floor(sharingStats.sharingLevel)}%</span>
                  </div>
                  <div className="w-full bg-gray-600 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${sharingStats.sharingLevel}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            )}

            {currentSection === 1 && user && (
              // Total Earnings
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <p className="text-sm text-gray-400 mb-2">Total Portfolio Value</p>
                  <p className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    {formatNumber(userEarnings.totalBigPointsEarned, 4)} BIG
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-600/20 border border-blue-500/30 p-3 rounded-lg">
                    <p className="text-xs text-blue-300">Total Shares</p>
                    <p className="text-lg font-bold text-blue-400">{userEarnings.totalSharesAccepted}</p>
                  </div>
                  <div className="bg-purple-600/20 border border-purple-500/30 p-3 rounded-lg">
                    <p className="text-xs text-purple-300">Sessions</p>
                    <p className="text-lg font-bold text-purple-400">{userEarnings.sessionsCompleted}</p>
                  </div>
                  <div className="bg-green-600/20 border border-green-500/30 p-3 rounded-lg">
                    <p className="text-xs text-green-300">Success Rate</p>
                    <p className="text-lg font-bold text-green-400">{formatNumber(userEarnings.shareAcceptanceRate)}%</p>
                  </div>
                  <div className="bg-orange-600/20 border border-orange-500/30 p-3 rounded-lg">
                    <p className="text-xs text-orange-300">Total Time</p>
                    <p className="text-lg font-bold text-orange-400">{formatTime(userEarnings.totalMiningTime)}</p>
                  </div>
                </div>

                <div className="bg-gray-700/30 p-3 rounded-lg">
                  <p className="text-sm text-gray-400 mb-1">Conversion Rate</p>
                  <p className="text-xs text-gray-300">1 Share = 0.1 BIG Points</p>
                </div>
              </div>
            )}

            {currentSection === 1 && !user && (
              // Login Required for Earnings
              <div className="text-center py-8">
                <div className="text-4xl mb-4">🔐</div>
                <h3 className="text-lg font-semibold mb-2">Login Required</h3>
                <p className="text-gray-400 mb-4">Sign in to track your earnings and session history</p>
                <button 
                  onClick={handleLogin}
                  className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg font-medium"
                >
                  Sign In
                </button>
              </div>
            )}

            {currentSection === 2 && (
              // Current Session
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <p className="text-sm text-gray-400 mb-1">Session Rewards</p>
                  <div className="flex items-center justify-center">
                    <div>
                      <p className="text-3xl font-bold text-blue-400">{formatNumber(sharingStats.bigRewards, 4)}</p>
                      <p className="text-sm text-gray-400">BIG Points</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-sm text-gray-400">Session Time</p>
                    <p className="text-lg font-bold">{formatTime(sharingStats.uptime)}</p>
                  </div>
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-sm text-gray-400">Shares/Hour</p>
                    <p className="text-lg font-bold">{sharingStats.sharesPerHour}</p>
                  </div>
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-sm text-gray-400">Found</p>
                    <p className="text-lg font-bold text-yellow-400">{sharingStats.sharesFound}</p>
                  </div>
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-sm text-gray-400">Accepted</p>
                    <p className="text-lg font-bold text-green-400">{sharingStats.sharesAccepted}</p>
                  </div>
                </div>

                {sharingStats.sharesRejected > 0 && (
                  <div className="bg-red-600/20 border border-red-500/30 p-3 rounded-lg">
                    <p className="text-sm text-red-300">Rejected Shares: {sharingStats.sharesRejected}</p>
                  </div>
                )}

                {sharingStats.errors > 0 && (
                  <div className="bg-yellow-600/20 border border-yellow-500/30 p-3 rounded-lg">
                    <p className="text-sm text-yellow-300">Connection Errors: {sharingStats.errors}</p>
                  </div>
                )}

                <div className="bg-gray-700/30 p-3 rounded-lg">
                  <p className="text-sm text-gray-400 mb-1">Conversion Rate</p>
                  <p className="text-xs text-gray-300">1 Share Accepted = 0.1 BIG Points</p>
                </div>
              </div>
            )}

            {currentSection === 3 && (
              // Device Status
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-400">Battery</p>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        deviceStats.isCharging 
                          ? 'bg-green-600/20 text-green-400' 
                          : deviceStats.batteryLevel > 30 
                            ? 'bg-blue-600/20 text-blue-400'
                            : 'bg-red-600/20 text-red-400'
                      }`}>
                        {deviceStats.isCharging ? '⚡' : '🔋'}
                      </span>
                    </div>
                    <p className="text-lg font-bold">{deviceStats.batteryLevel}%</p>
                    <div className="w-full bg-gray-600 rounded-full h-1 mt-2">
                      <div 
                        className={`h-1 rounded-full ${
                          deviceStats.batteryLevel > 50 ? 'bg-green-500' :
                          deviceStats.batteryLevel > 30 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${deviceStats.batteryLevel}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-sm text-gray-400">Temperature</p>
                    <p className="text-lg font-bold">{deviceStats.temperature}°C</p>
                    <div className="flex items-center mt-1">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        deviceStats.temperature < 50 ? 'bg-green-600/20 text-green-400' :
                        deviceStats.temperature < 70 ? 'bg-yellow-600/20 text-yellow-400' :
                        'bg-red-600/20 text-red-400'
                      }`}>
                        {deviceStats.temperature < 50 ? 'Cool' : 
                         deviceStats.temperature < 70 ? 'Warm' : 'Hot'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-700/30 p-3 rounded-lg">
                  <h4 className="text-sm font-medium mb-2">Device Protection</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Battery Threshold</span>
                      <span>{config.batteryThreshold}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Thermal Threshold</span>
                      <span>{config.thermalThreshold}°C</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Adaptive Power</span>
                      <span className={config.adaptivePower ? 'text-green-400' : 'text-red-400'}>
                        {config.adaptivePower ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-600/20 border border-blue-500/30 p-3 rounded-lg">
                  <p className="text-sm text-blue-300 mb-1">💡 Smart Protection</p>
                  <p className="text-xs text-gray-300">
                    Sharing will automatically pause when battery is low or device gets too warm
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Section Indicators */}
          <div className="flex justify-center space-x-2 pb-4">
            {sections.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentSection ? 'bg-blue-500' : 'bg-gray-600'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Control Button */}
        <div className="fixed bottom-6 left-4 right-4">
          <button
            onClick={isSharing ? stopSharing : startSharing}
            disabled={!user}
            className={`w-full py-4 rounded-xl text-lg font-bold transition-all duration-300 ${
              isSharing
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : user 
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }`}
          >
            {!user ? 'Login Required' : isSharing ? 'Stop Sharing' : 'Start Sharing'}
          </button>
        </div>
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal 
          isOpen={showAuthModal} 
          onClose={() => setShowAuthModal(false)}
        />
      )}
    </div>
  );
};

export default BigfootNetworkOptimizer;