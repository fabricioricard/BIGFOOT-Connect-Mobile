// src/components/BigfootNetworkOptimizer.jsx
import React, { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import AuthModal from './AuthModal';

const BigfootNetworkOptimizer = () => {
  // Auth state
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

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

  // User's sharing stats (from Firebase)
  const [userStats, setUserStats] = useState({
    totalDataShared: 0,
    totalBigRewards: 0,
    totalUptime: 0,
    sessionsCompleted: 0,
    joinDate: null
  });

  // Current session stats
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
    paymentAddress: 'pkt1q2phzyfzd7aufszned7q2h77t4u0kl3exxgyuqf',
    batteryThreshold: 30,
    thermalThreshold: 70,
    adaptivePower: true,
    autoStart: false,
    backgroundSharing: true,
    maxBandwidth: 50
  });

  // Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setAuthLoading(false);
      
      if (user) {
        await loadUserData(user);
      } else {
        // Reset stats when logged out
        setUserStats({
          totalDataShared: 0,
          totalBigRewards: 0,
          totalUptime: 0,
          sessionsCompleted: 0,
          joinDate: null
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // Load user data from Firestore
  const loadUserData = async (user) => {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserStats({
          totalDataShared: data.totalDataShared || 0,
          totalBigRewards: data.totalBigRewards || 0,
          totalUptime: data.totalUptime || 0,
          sessionsCompleted: data.sessionsCompleted || 0,
          joinDate: data.joinDate
        });
        
        // Load user config
        if (data.config) {
          setConfig(prev => ({ ...prev, ...data.config }));
        }
      } else {
        // Create new user document
        const newUserData = {
          email: user.email,
          displayName: user.displayName,
          totalDataShared: 0,
          totalBigRewards: 0,
          totalUptime: 0,
          sessionsCompleted: 0,
          joinDate: new Date().toISOString(),
          config: config
        };
        
        await setDoc(userDocRef, newUserData);
        setUserStats(newUserData);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  // Save session data to Firebase
  const saveSessionData = async () => {
    if (!user) return;
    
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        totalDataShared: userStats.totalDataShared + sharingStats.dataTransferred,
        totalBigRewards: userStats.totalBigRewards + sharingStats.bigRewards,
        totalUptime: userStats.totalUptime + sharingStats.uptime,
        sessionsCompleted: userStats.sessionsCompleted + 1,
        lastSession: new Date().toISOString(),
        config: config
      });
      
      // Update local state
      setUserStats(prev => ({
        ...prev,
        totalDataShared: prev.totalDataShared + sharingStats.dataTransferred,
        totalBigRewards: prev.totalBigRewards + sharingStats.bigRewards,
        totalUptime: prev.totalUptime + sharingStats.uptime,
        sessionsCompleted: prev.sessionsCompleted + 1
      }));
    } catch (error) {
      console.error('Error saving session data:', error);
    }
  };

  // Initialize sharing worker
  useEffect(() => {
    const createSharingWorker = () => {
      const workerCode = `
        class BandwidthSharing {
          constructor() {
            this.isRunning = false;
            this.config = { maxBandwidth: 50 };
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
            
            const baseSharing = this.config.maxBandwidth * 0.3;
            const variation = Math.random() * 0.4 + 0.8;
            const currentSharing = baseSharing * variation;
            
            this.stats.bandwidthShared = currentSharing;
            this.stats.dataTransferred += currentSharing / 1000;
            this.stats.bigRewards += (currentSharing / 1000) * 0.1;
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
            self.postMessage({ type: 'started' });
          }

          stop() {
            this.isRunning = false;
            this.stats.bandwidthShared = 0;
            this.sendStatsUpdate();
            self.postMessage({ type: 'stopped' });
          }
        }

        const sharing = new BandwidthSharing();
        self.onmessage = function(e) {
          const { type, config } = e.data;
          switch(type) {
            case 'start_sharing': sharing.start(config); break;
            case 'stop_sharing': sharing.stop(); break;
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
        setSharingStats(prev => ({ ...prev, ...data }));
      }
    };

    return () => worker.terminate();
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

  const handleSharingToggle = () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

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
        config: { maxBandwidth: config.maxBandwidth }
      });
      setIsSharing(true);
      
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').catch(console.error);
      }
    } else {
      workerRef.current?.postMessage({ type: 'stop_sharing' });
      setIsSharing(false);
      
      // Save session data when stopping
      saveSessionData();
    }
  };

  const handleLogout = async () => {
    if (isSharing) {
      // Save session before logout
      await saveSessionData();
      // Stop sharing
      workerRef.current?.postMessage({ type: 'stop_sharing' });
      setIsSharing(false);
    }
    
    await signOut(auth);
  };

  const formatUptime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-cyan-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-indigo-500 to-cyan-600 rounded-2xl mx-auto flex items-center justify-center mb-4 animate-pulse">
            <span className="text-white text-2xl">🌐</span>
          </div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-cyan-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-md mx-auto space-y-6">
        
        {/* Header with User Info */}
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
          
          {user ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 mt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 dark:text-indigo-400 text-sm">
                      {user.displayName ? user.displayName[0].toUpperCase() : user.email[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {user.displayName || 'User'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {user.email}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-sm text-red-500 hover:text-red-600 px-3 py-1 rounded border border-red-200 hover:border-red-300"
                >
                  Logout
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors mt-4"
            >
              Login / Sign Up
            </button>
          )}
        </div>

        {/* User Stats Summary (only if logged in) */}
        {user && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border-0 border-l-4 border-l-indigo-500">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
                  <span className="text-indigo-600 dark:text-indigo-400">📊</span>
                </div>
                Your Total Stats
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                  <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300">
                    {userStats.totalDataShared.toFixed(1)} GB
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Total Shared
                  </div>
                </div>
                <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="text-lg font-bold text-green-700 dark:text-green-300">
                    {userStats.totalBigRewards.toFixed(2)} BIG
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Total Earned
                  </div>
                </div>
                <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="text-lg font-bold text-blue-700 dark:text-blue-300">
                    {formatUptime(userStats.totalUptime)}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Total Time
                  </div>
                </div>
                <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <div className="text-lg font-bold text-purple-700 dark:text-purple-300">
                    {userStats.sessionsCompleted}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Sessions
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Login prompt if not authenticated */}
        {!user && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <span className="text-yellow-500">ℹ️</span>
              <div>
                <p className="text-sm text-yellow-700 font-medium">
                  Login Required
                </p>
                <p className="text-xs text-yellow-600">
                  Please login to start sharing bandwidth and earning BIG rewards
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Control Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border-0 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 dark:bg-indigo-900/20 rounded-full -translate-y-12 translate-x-12"></div>
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-cyan-50 dark:bg-cyan-900/20 rounded-full -translate-x-10 translate-y-10"></div>
          <div className="p-6 relative">
            <div className="text-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center justify-center gap-2">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xl">🌐</span>
                </div>
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
                    {!user ? 'Login required to start sharing' :
                     isSharing ? `Active - ${sharingStats.bandwidthShared.toFixed(1)} MB/s shared` : 
                     'Inactive - Enable to start earning BIG rewards'
                    }
                  </p>
                </div>
                
                <button
                  onClick={handleSharingToggle}
                  disabled={!navigator.onLine || (!user && !isSharing)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                    isSharing ? 'bg-green-500' : 
                    !user ? 'bg-gray-300 cursor-not-allowed' :
                    navigator.onLine ? 'bg-gray-200' : 'bg-red-300'
                  }`}
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
                    Session Data
                  </div>
                </div>
                <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <span className="text-green-500 text-xl">🪙</span>
                  <div className="text-lg font-semibold text-green-700 dark:text-green-300 mt-1">
                    {sharingStats.bigRewards.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Session BIG
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Network Activity Overview */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border-0 border-l-4 border-l-cyan-500 relative">
          <div className="absolute top-0 right-0 w-16 h-16 bg-cyan-50 dark:bg-cyan-900/10 rounded-full -translate-y-8 translate-x-8 opacity-50"></div>
          <div className="p-6 relative">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-cyan-100 dark:bg-cyan-900/30 rounded-full flex items-center justify-center">
                <span className="text-cyan-600 dark:text-cyan-400">📈</span>
              </div>
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
                <div className="text-xs text-gray-500">Session Time</div>
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

        {/* Section Separator - Device Monitoring */}
        <div className="flex items-center justify-center py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-px bg-gradient-to-r from-transparent to-gray-300 dark:to-gray-600"></div>
            <div className="bg-indigo-100 dark:bg-indigo-900/30 rounded-full p-2">
              <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
            <div className="w-8 h-px bg-gradient-to-l from-transparent to-gray-300 dark:to-gray-600"></div>
          </div>
        </div>

        {/* Device Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border-0 border-l-4 border-l-blue-500">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <span className="text-blue-600 dark:text-blue-400">📱</span>
              </div>
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

        {/* Section Separator - Configuration */}
        <div className="flex items-center justify-center py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-px bg-gradient-to-r from-transparent to-gray-300 dark:to-gray-600"></div>
            <div className="bg-purple-100 dark:bg-purple-900/30 rounded-full p-2">
              <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="w-8 h-px bg-gradient-to-l from-transparent to-gray-300 dark:to-gray-600"></div>
          </div>
        </div>

        {/* Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border-0 border-l-4 border-l-purple-500">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                <span className="text-purple-600 dark:text-purple-400">⚙️</span>
              </div>
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
                  className={`relative inline-flex h-6 w-11 items-centers rounded-full transition-colors ${
                    config.adaptivePower ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.adaptivePower ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section Separator - Rewards */}
        <div className="flex items-center justify-center py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-px bg-gradient-to-r from-transparent to-gray-300 dark:to-gray-600"></div>
            <div className="bg-green-100 dark:bg-green-900/30 rounded-full p-2">
              <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
            <div className="w-8 h-px bg-gradient-to-l from-transparent to-gray-300 dark:to-gray-600"></div>
          </div>
        </div>

        {/* BIG Rewards Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border-0 border-l-4 border-l-green-500 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-green-50 dark:bg-green-900/10 rounded-full -translate-y-10 translate-x-10"></div>
          <div className="absolute bottom-0 left-0 w-16 h-16 bg-emerald-50 dark:bg-emerald-900/10 rounded-full -translate-x-8 translate-y-8"></div>
          <div className="p-6 relative">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <span className="text-green-600 dark:text-green-400">💰</span>
              </div>
              BIG Rewards Summary
            </h3>
            
            <div className="text-center p-4 bg-gradient-to-r from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-800/20 rounded-lg mb-4">
              <div className="text-3xl font-bold text-green-700 dark:text-green-300">
                {sharingStats.bigRewards.toFixed(2)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Session BIG Earned
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
              <div>{user ? 'Enable bandwidth sharing to start earning BIG rewards' : 'Login to start sharing bandwidth'}</div>
              <div className="text-xs text-gray-400">
                Network: {deviceStats.networkStatus} | 
                Battery: {deviceStats.batteryLevel.toFixed(0)}% | 
                Temp: {deviceStats.temperature.toFixed(0)}°C
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLoginSuccess={(user) => {
          setUser(user);
          setShowAuthModal(false);
        }}
      />
    </div>
  );
};

export default BigfootNetworkOptimizer;