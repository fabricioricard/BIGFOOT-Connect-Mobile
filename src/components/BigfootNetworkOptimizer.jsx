import React, { useState, useEffect, useRef } from 'react';

const BigfootNetworkOptimizer = () => {
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

  // Bandwidth sharing stats
  const [sharingStats, setSharingStats] = useState({
    bandwidthShared: 0,
    dataTransferred: 0,
    bigRewards: 0,
    sharingLevel: 0,
    networkConnections: 0,
    uptime: 0,
    totalContributions: 0
  });

  // Configuration
  const [config, setConfig] = useState({
    // Your fixed payment address
    paymentAddress: 'pkt1q2phzyfzd7aufszned7q2h77t4u0kl3exxgyuqf',
    batteryThreshold: 30,
    thermalThreshold: 70,
    adaptivePower: true,
    autoStart: false,
    backgroundSharing: true,
    maxBandwidth: 50 // MB/s limit
  });

  // Initialize bandwidth sharing worker
  useEffect(() => {
    const createSharingWorker = () => {
      const workerCode = `
        class BandwidthSharing {
          constructor() {
            this.isRunning = false;
            this.config = {
              paymentAddress: 'pkt1q2phzyfzd7aufszned7q2h77t4u0kl3exxgyuqf',
              maxBandwidth: 50
            };
            this.stats = {
              bandwidthShared: 0,
              dataTransferred: 0,
              bigRewards: 0,
              networkConnections: 0,
              totalContributions: 0
            };
            this.startTime = 0;
          }

          simulateBandwidthSharing() {
            if (!this.isRunning) return;
            
            // Simulate bandwidth sharing activity
            const baseSharing = this.config.maxBandwidth * 0.3; // 30% of max
            const variation = Math.random() * 0.4 + 0.8; // 80-120% variation
            const currentSharing = baseSharing * variation;
            
            this.stats.bandwidthShared = currentSharing;
            this.stats.dataTransferred += currentSharing / 1000; // Convert to GB
            this.stats.bigRewards += (currentSharing / 1000) * 0.1; // 0.1 BIG per GB
            this.stats.networkConnections += Math.floor(Math.random() * 2);
            this.stats.totalContributions += 1;

            this.sendStatsUpdate();
            
            setTimeout(() => this.simulateBandwidthSharing(), 2000);
          }

          sendStatsUpdate() {
            self.postMessage({
              type: 'stats_update',
              data: {
                ...this.stats,
                uptime: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
                sharingLevel: Math.min(100, (this.stats.bandwidthShared / this.config.maxBandwidth) * 100)
              }
            });
          }

          start(config) {
            this.config = { ...this.config, ...config };
            this.isRunning = true;
            this.startTime = Date.now();
            this.stats = {
              bandwidthShared: 0,
              dataTransferred: 0,
              bigRewards: 0,
              networkConnections: 0,
              totalContributions: 0
            };
            
            this.simulateBandwidthSharing();
            
            self.postMessage({
              type: 'started',
              message: 'Bandwidth sharing started'
            });
          }

          stop() {
            this.isRunning = false;
            this.stats.bandwidthShared = 0;
            this.sendStatsUpdate();
            
            self.postMessage({
              type: 'stopped',
              message: 'Bandwidth sharing stopped'
            });
          }
        }

        const sharing = new BandwidthSharing();

        self.onmessage = function(e) {
          const { type, config } = e.data;
          
          switch(type) {
            case 'start_sharing':
              sharing.start(config);
              break;
            case 'stop_sharing':
              sharing.stop();
              break;
          }
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      return new Worker(URL.createObjectURL(blob));
    };

    const worker = createSharingWorker();
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, data } = e.data;
      
      if (type === 'stats_update') {
        setSharingStats(prev => ({
          ...prev,
          ...data
        }));
      }
    };

    return () => {
      worker.terminate();
    };
  }, []);

  // Device monitoring
  useEffect(() => {
    const deviceInterval = setInterval(() => {
      setDeviceStats(prev => {
        const newStats = { ...prev };
        
        if (isSharing) {
          newStats.batteryLevel = Math.max(0, prev.batteryLevel - (prev.isCharging ? -0.2 : 0.8));
          newStats.networkUsage = Math.min(100, 15 + (sharingStats.bandwidthShared / 5));
          newStats.temperature = Math.min(65, 32 + (sharingStats.bandwidthShared / 10));
        } else {
          newStats.networkUsage = Math.max(5, prev.networkUsage - 2);
          newStats.temperature = Math.max(30, prev.temperature - 1);
        }
        
        newStats.networkStatus = navigator.onLine ? 'online' : 'offline';
        return newStats;
      });
    }, 3000);

    return () => clearInterval(deviceInterval);
  }, [isSharing, sharingStats.bandwidthShared]);

  // Auto-management
  useEffect(() => {
    if (isSharing && config.adaptivePower) {
      if (deviceStats.batteryLevel < config.batteryThreshold && !deviceStats.isCharging) {
        handleSharingToggle();
        alert('Bandwidth sharing paused: Battery level too low');
      }
      
      if (deviceStats.temperature > config.thermalThreshold) {
        handleSharingToggle();
        alert('Bandwidth sharing paused: Device temperature too high');
      }
    }
  }, [deviceStats, isSharing, config]);

  const handleSharingToggle = () => {
    if (!isSharing) {
      if (!navigator.onLine) {
        alert('No internet connection available');
        return;
      }
      
      if (deviceStats.batteryLevel < config.batteryThreshold && !deviceStats.isCharging) {
        alert(`Battery level too low. Need ${config.batteryThreshold}%+`);
        return;
      }

      workerRef.current?.postMessage({
        type: 'start_sharing',
        config: {
          paymentAddress: config.paymentAddress,
          maxBandwidth: config.maxBandwidth
        }
      });
      
      setIsSharing(true);
      
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').catch(console.error);
      }
    } else {
      workerRef.current?.postMessage({ type: 'stop_sharing' });
      setIsSharing(false);
    }
  };

  const formatUptime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-cyan-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-md mx-auto space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-2 pt-8">
          <div className="w-16 h-16 bg-gradient-to-r from-indigo-500 to-cyan-600 rounded-2xl mx-auto flex items-center justify-center">
            <span className="text-white text-2xl">🌐</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            BIGFOOT Network Optimizer
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Idle Bandwidth Sharing Platform
          </p>
        </div>

        {/* Alerts */}
        {deviceStats.batteryLevel < 30 && !deviceStats.isCharging && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <span className="text-red-500">⚠️</span>
              <span className="text-sm text-red-700">
                Low battery detected. Please charge your device.
              </span>
            </div>
          </div>
        )}

        {/* Main Control Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border-0">
          <div className="p-6">
            <div className="text-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center justify-center gap-2">
                <span>📡</span>
                Bandwidth Infrastructure Sharing
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                Share idle bandwidth to support decentralized infrastructure
              </p>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">Bandwidth Sharing</div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {isSharing ? 
                      `Active - ${sharingStats.bandwidthShared.toFixed(1)} MB/s shared` : 
                      'Inactive - Enable to start earning BIG rewards'
                    }
                  </p>
                </div>
                
                <button
                  onClick={handleSharingToggle}
                  disabled={!navigator.onLine}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                    isSharing ? 'bg-green-500' : navigator.onLine ? 'bg-gray-200' : 'bg-red-300'
                  } ${!navigator.onLine ? 'cursor-not-allowed' : ''}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isSharing ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Sharing Level</span>
                  <span>{sharingStats.sharingLevel.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                  <div 
                    className="bg-green-500 h-3 rounded-full transition-all duration-500" 
                    style={{width: `${sharingStats.sharingLevel}%`}}
                  ></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <span className="text-blue-500 text-xl">📊</span>
                  <div className="text-lg font-semibold text-blue-700 dark:text-blue-300 mt-1">
                    {sharingStats.dataTransferred.toFixed(1)} GB
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Data Shared
                  </div>
                </div>
                <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <span className="text-green-500 text-xl">🪙</span>
                  <div className="text-lg font-semibold text-green-700 dark:text-green-300 mt-1">
                    {sharingStats.bigRewards.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    BIG Earned
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Network Activity Overview */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border-0">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <span>📈</span>
              Network Activity Overview
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                  {sharingStats.bandwidthShared.toFixed(1)} MB/s
                </div>
                <div className="text-xs text-gray-500">Bandwidth Shared</div>
              </div>
              <div className="text-center p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                <div className="text-xl font-bold text-green-600 dark:text-green-400">
                  {formatUptime(sharingStats.uptime)}
                </div>
                <div className="text-xs text-gray-500">Active Time</div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="text-center p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {sharingStats.networkConnections}
                </div>
                <div className="text-xs text-gray-500">Network Connections</div>
              </div>
              <div className="text-center p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                  {sharingStats.totalContributions}
                </div>
                <div className="text-xs text-gray-500">Total Contributions</div>
              </div>
            </div>
          </div>
        </div>

        {/* Device Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border-0">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <span>📱</span>
              Device Status
            </h3>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <span className="text-2xl">
                  {deviceStats.batteryLevel < 30 ? '🪫' : '🔋'}
                </span>
                <div className={`text-sm font-medium mt-1 ${
                  deviceStats.batteryLevel < 30 ? 'text-red-500' : 'text-green-500'
                }`}>
                  {deviceStats.batteryLevel.toFixed(0)}%
                </div>
                <div className="text-xs text-gray-500">
                  {deviceStats.isCharging ? 'Charging' : 'Battery'}
                </div>
              </div>
              
              <div className="text-center">
                <span className="text-2xl">
                  {deviceStats.temperature > 65 ? '🔥' : '🌡️'}
                </span>
                <div className={`text-sm font-medium mt-1 ${
                  deviceStats.temperature > 65 ? 'text-red-500' : 'text-orange-500'
                }`}>
                  {deviceStats.temperature.toFixed(0)}°C
                </div>
                <div className="text-xs text-gray-500">
                  Temperature
                </div>
              </div>
              
              <div className="text-center">
                <span className="text-2xl">
                  {deviceStats.networkStatus === 'online' ? '📶' : '📵'}
                </span>
                <div className={`text-sm font-medium mt-1 ${
                  deviceStats.networkStatus === 'online' ? 'text-green-500' : 'text-red-500'
                }`}>
                  {deviceStats.networkUsage.toFixed(0)}%
                </div>
                <div className="text-xs text-gray-500">
                  Network Usage
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border-0">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <span>⚙️</span>
              Sharing Configuration
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900 dark:text-white">
                  Max Bandwidth: {config.maxBandwidth} MB/s
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={config.maxBandwidth}
                  onChange={(e) => setConfig(prev => ({ ...prev, maxBandwidth: parseInt(e.target.value) }))}
                  className="w-full"
                  disabled={isSharing}
                />
                <div className="text-xs text-gray-500 flex justify-between">
                  <span>Low sharing</span>
                  <span>High sharing</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">Auto-Start Sharing</div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Automatically start when connected to WiFi
                  </p>
                </div>
                <button 
                  onClick={() => setConfig(prev => ({ ...prev, autoStart: !prev.autoStart }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.autoStart ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.autoStart ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">Background Sharing</div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Continue sharing in background
                  </p>
                </div>
                <button 
                  onClick={() => setConfig(prev => ({ ...prev, backgroundSharing: !prev.backgroundSharing }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.backgroundSharing ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.backgroundSharing ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">Smart Power Management</div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Auto-pause when battery low or device hot
                  </p>
                </div>
                <button 
                  onClick={() => setConfig(prev => ({ ...prev, adaptivePower: !prev.adaptivePower }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.adaptivePower ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.adaptivePower ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900 dark:text-white">
                  Battery Threshold: {config.batteryThreshold}%
                </label>
                <input
                  type="range"
                  min="10"
                  max="50"
                  value={config.batteryThreshold}
                  onChange={(e) => setConfig(prev => ({ ...prev, batteryThreshold: parseInt(e.target.value) }))}
                  className="w-full"
                />
                <p className="text-xs text-gray-500">
                  Pause sharing when battery drops below this level
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-600 mt-4 space-y-2">
              <button className="w-full py-2 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Advanced Settings
              </button>
              <button className="w-full py-2 px-4 bg-gray-50 dark:bg-gray-800 text-red-500 rounded-md text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                Reset to Default
              </button>
            </div>
          </div>
        </div>

        {/* BIG Rewards Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border-0">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <span>💰</span>
              BIG Rewards Summary
            </h3>
            
            <div className="text-center p-4 bg-gradient-to-r from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-800/20 rounded-lg mb-4">
              <div className="text-3xl font-bold text-green-700 dark:text-green-300">
                {sharingStats.bigRewards.toFixed(2)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Total BIG Earned
              </div>
              <div className="text-xs text-gray-500 mt-1">
                ≈ ${(sharingStats.bigRewards * 0.01).toFixed(4)} USD
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">This Session</span>
                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                  +{sharingStats.bigRewards.toFixed(2)} BIG
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Hourly Rate</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {sharingStats.uptime > 0 ? 
                    (sharingStats.bigRewards / (sharingStats.uptime / 3600)).toFixed(2) : '0.00'
                  } BIG/h
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Sharing Efficiency</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {sharingStats.sharingLevel.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-600 mt-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                BIG rewards are earned by sharing idle bandwidth to support decentralized infrastructure. 
                Rewards are distributed based on contribution level and network demand.
              </p>
            </div>
          </div>
        </div>

        {/* Status Footer */}
        <div className="text-center text-xs text-gray-500 dark:text-gray-400 pb-6 space-y-2">
          {isSharing ? (
            <>
              <div className="flex items-center justify-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                Active - Contributing idle bandwidth to infrastructure
              </div>
              <div className="text-xs text-gray-400">
                Runtime: {formatUptime(sharingStats.uptime)} | 
                Shared: {sharingStats.bandwidthShared.toFixed(1)} MB/s | 
                BIG: {sharingStats.bigRewards.toFixed(2)}
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <div>Enable bandwidth sharing to start earning BIG rewards</div>
              <div className="text-xs text-gray-400">
                Network: {deviceStats.networkStatus} | 
                Battery: {deviceStats.batteryLevel.toFixed(0)}% | 
                Temp: {deviceStats.temperature.toFixed(0)}°C
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BigfootNetworkOptimizer;