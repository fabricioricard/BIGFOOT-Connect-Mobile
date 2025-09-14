// src/services/earningsService.js
// Sistema de tracking de earnings para BIG Points Mobile

import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  increment,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from 'firebase/firestore';
import { db } from '../config/firebase';

export class EarningsService {
  constructor(userId) {
    this.userId = userId;
    this.userEarningsRef = doc(db, 'bigpoints_mobile', userId);
    this.sessionsRef = collection(db, 'mining_sessions');
  }

  // Criar perfil inicial do usuário
  async initializeUserEarnings(userInfo) {
    const initialData = {
      userId: this.userId,
      email: userInfo.email,
      displayName: userInfo.displayName,
      
      // Totais acumulados
      totalSharesFound: 0,
      totalSharesAccepted: 0,
      totalBigPointsEarned: 0, // 1 BIG Point = 1 PKT
      totalPKTEarned: 0,       // PKT equivalente (mesmo valor que BIG Points)
      totalMiningTime: 0, // em segundos
      totalHashrate: 0,
      
      // Estatísticas
      sessionsCompleted: 0,
      averageHashrate: 0,
      shareAcceptanceRate: 0,
      
      // Timestamps
      joinDate: serverTimestamp(),
      lastActivity: serverTimestamp(),
      lastSessionDate: null,
      
      // Configurações
      preferredSettings: {
        autoStart: false,
        batteryThreshold: 30,
        thermalThreshold: 70
      },
      
      // Metas/Badges (futuro)
      badges: [],
      currentStreak: 0,
      longestStreak: 0
    };

    try {
      await setDoc(this.userEarningsRef, initialData);
      console.log('User earnings profile initialized');
      return initialData;
    } catch (error) {
      console.error('Error initializing user earnings:', error);
      throw error;
    }
  }

  // Carregar dados do usuário
  async loadUserEarnings() {
    try {
      const userDoc = await getDoc(this.userEarningsRef);
      
      if (userDoc.exists()) {
        return userDoc.data();
      } else {
        return null;
      }
    } catch (error) {
      console.error('Error loading user earnings:', error);
      throw error;
    }
  }

  // Iniciar nova sessão de mining
  async startSession(config) {
    const sessionData = {
      userId: this.userId,
      sessionId: `session_${Date.now()}`,
      startTime: serverTimestamp(),
      endTime: null,
      
      // Configurações da sessão
      config: {
        poolUrl: config.poolUrl,
        maxBandwidth: config.maxBandwidth,
        batteryThreshold: config.batteryThreshold,
        adaptivePower: config.adaptivePower
      },
      
      // Stats da sessão (serão atualizados)
      sessionStats: {
        duration: 0,
        sharesFound: 0,
        sharesAccepted: 0,
        bigPointsEarned: 0,   // BIG Points (1:1 com PKT)
        pktEarned: 0,         // PKT equivalente
        averageHashrate: 0,
        maxHashrate: 0,
        errors: 0
      },
      
      // Device info
      deviceInfo: {
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        onLine: navigator.onLine
      },
      
      status: 'active'
    };

    try {
      const sessionDocRef = await addDoc(this.sessionsRef, sessionData);
      this.currentSessionId = sessionDocRef.id;
      console.log('Session started:', this.currentSessionId);
      return this.currentSessionId;
    } catch (error) {
      console.error('Error starting session:', error);
      throw error;
    }
  }

  // Atualizar stats da sessão em tempo real
  async updateSessionStats(stats) {
    if (!this.currentSessionId) return;

    const sessionRef = doc(this.sessionsRef, this.currentSessionId);
    
    // 1 share aceita = 0.1 PKT = 0.1 BIG Points
    const bigPointsEarned = (stats.sharesAccepted || 0) * 0.1;
    const pktEarned = bigPointsEarned; // 1 BIG Point = 1 PKT
    
    try {
      await updateDoc(sessionRef, {
        'sessionStats.sharesFound': stats.sharesFound || 0,
        'sessionStats.sharesAccepted': stats.sharesAccepted || 0,
        'sessionStats.bigPointsEarned': bigPointsEarned,
        'sessionStats.pktEarned': pktEarned,
        'sessionStats.averageHashrate': stats.hashrate || 0,
        'sessionStats.maxHashrate': stats.maxHashrate || stats.hashrate || 0,
        'sessionStats.errors': stats.errors || 0,
        'sessionStats.duration': stats.uptime || 0,
        lastUpdate: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating session stats:', error);
    }
  }

  // Registrar share encontrada
  async recordShareFound() {
    if (!this.currentSessionId) return;

    try {
      // Atualizar sessão atual
      const sessionRef = doc(this.sessionsRef, this.currentSessionId);
      await updateDoc(sessionRef, {
        'sessionStats.sharesFound': increment(1),
        lastUpdate: serverTimestamp()
      });

      // Atualizar totais do usuário
      await updateDoc(this.userEarningsRef, {
        totalSharesFound: increment(1),
        lastActivity: serverTimestamp()
      });

      console.log('Share found recorded');
    } catch (error) {
      console.error('Error recording share found:', error);
    }
  }

  // Registrar share aceita (+ 0.1 PKT = + 0.1 BIG Points)
  async recordShareAccepted() {
    if (!this.currentSessionId) return;

    const pktReward = 0.1;      // 1 share aceita = 0.1 PKT
    const bigPointReward = 0.1; // 1 BIG Point = 1 PKT, então 0.1 PKT = 0.1 BIG Point

    try {
      // Atualizar sessão atual
      const sessionRef = doc(this.sessionsRef, this.currentSessionId);
      await updateDoc(sessionRef, {
        'sessionStats.sharesAccepted': increment(1),
        'sessionStats.bigPointsEarned': increment(bigPointReward),
        'sessionStats.pktEarned': increment(pktReward),
        lastUpdate: serverTimestamp()
      });

      // Atualizar totais do usuário
      await updateDoc(this.userEarningsRef, {
        totalSharesAccepted: increment(1),
        totalBigPointsEarned: increment(bigPointReward),
        totalPKTEarned: increment(pktReward),
        lastActivity: serverTimestamp()
      });

      console.log(`Share accepted recorded: +${bigPointReward} BIG Points (+${pktReward} PKT)`);
      
      // Retornar novo total para UI
      const userDoc = await getDoc(this.userEarningsRef);
      const userData = userDoc.data();
      return {
        totalBigPointsEarned: userData.totalBigPointsEarned,
        totalPKTEarned: userData.totalPKTEarned
      };
      
    } catch (error) {
      console.error('Error recording share accepted:', error);
      return null;
    }
  }

  // Finalizar sessão
  async endSession(finalStats) {
    if (!this.currentSessionId) return;

    const sessionRef = doc(this.sessionsRef, this.currentSessionId);
    
    // Calcular rewards finais
    const bigPointsEarned = (finalStats.sharesAccepted || 0) * 0.1;
    const pktEarned = bigPointsEarned; // 1:1 ratio
    
    try {
      // Atualizar sessão com dados finais
      await updateDoc(sessionRef, {
        endTime: serverTimestamp(),
        status: 'completed',
        'sessionStats.duration': finalStats.uptime || 0,
        'sessionStats.sharesFound': finalStats.sharesFound || 0,
        'sessionStats.sharesAccepted': finalStats.sharesAccepted || 0,
        'sessionStats.bigPointsEarned': bigPointsEarned,
        'sessionStats.pktEarned': pktEarned,
        'sessionStats.averageHashrate': finalStats.hashrate || 0,
        'sessionStats.errors': finalStats.errors || 0
      });

      // Atualizar estatísticas do usuário
      const currentUserData = await this.loadUserEarnings();
      const newSessionsCount = currentUserData.sessionsCompleted + 1;
      const newTotalTime = currentUserData.totalMiningTime + (finalStats.uptime || 0);
      const newAverageHashrate = Math.floor(
        ((currentUserData.averageHashrate * currentUserData.sessionsCompleted) + (finalStats.hashrate || 0)) / newSessionsCount
      );
      const newAcceptanceRate = currentUserData.totalSharesFound > 0 
        ? (currentUserData.totalSharesAccepted / currentUserData.totalSharesFound * 100).toFixed(2)
        : 0;

      await updateDoc(this.userEarningsRef, {
        sessionsCompleted: newSessionsCount,
        totalMiningTime: newTotalTime,
        averageHashrate: newAverageHashrate,
        shareAcceptanceRate: parseFloat(newAcceptanceRate),
        lastSessionDate: serverTimestamp(),
        lastActivity: serverTimestamp()
      });

      console.log('Sharing session ended successfully');
      this.currentSessionId = null;

      return {
        sessionId: this.currentSessionId,
        duration: finalStats.uptime,
        sharesAccepted: finalStats.sharesAccepted,
        bigPointsEarned: bigPointsEarned,
        pktEarned: pktEarned
      };

    } catch (error) {
      console.error('Error ending session:', error);
      throw error;
    }
  }

  // Buscar histórico de sessões do usuário
  async getUserSessions(limitCount = 10) {
    try {
      const q = query(
        this.sessionsRef,
        where('userId', '==', this.userId),
        orderBy('startTime', 'desc'),
        limit(limitCount)
      );

      const querySnapshot = await getDocs(q);
      const sessions = [];

      querySnapshot.forEach((doc) => {
        sessions.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return sessions;
    } catch (error) {
      console.error('Error fetching user sessions:', error);
      return [];
    }
  }

  // Calcular stats diárias/semanais/mensais
  async getEarningsStats(period = 'week') {
    try {
      const now = new Date();
      let startDate;

      switch (period) {
        case 'day':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      const q = query(
        this.sessionsRef,
        where('userId', '==', this.userId),
        where('startTime', '>=', startDate),
        orderBy('startTime', 'desc')
      );

      const querySnapshot = await getDocs(q);
      let totalBigPoints = 0;
      let totalPKT = 0;
      let totalShares = 0;
      let totalTime = 0;
      let sessionCount = 0;

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.sessionStats) {
          totalBigPoints += data.sessionStats.bigPointsEarned || 0;
          totalPKT += data.sessionStats.pktEarned || 0;
          totalShares += data.sessionStats.sharesAccepted || 0;
          totalTime += data.sessionStats.duration || 0;
          sessionCount++;
        }
      });

      return {
        period,
        totalBigPoints,
        totalPKT,
        totalShares,
        totalTime,
        sessionCount,
        averagePerSession: sessionCount > 0 ? (totalBigPoints / sessionCount).toFixed(4) : 0,
        averagePKTPerSession: sessionCount > 0 ? (totalPKT / sessionCount).toFixed(4) : 0
      };

    } catch (error) {
      console.error('Error calculating earnings stats:', error);
      return null;
    }
  }

  // Leaderboard (top earners)
  async getTopEarners(limitCount = 10) {
    try {
      const q = query(
        collection(db, 'bigpoints_mobile'),
        orderBy('totalBigPointsEarned', 'desc'),
        limit(limitCount)
      );

      const querySnapshot = await getDocs(q);
      const topEarners = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        topEarners.push({
          userId: doc.id,
          displayName: data.displayName || 'Anonymous',
          totalBigPointsEarned: data.totalBigPointsEarned || 0,
          totalPKTEarned: data.totalPKTEarned || 0,
          totalSharesAccepted: data.totalSharesAccepted || 0,
          sessionsCompleted: data.sessionsCompleted || 0,
          joinDate: data.joinDate
        });
      });

      return topEarners;
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      return [];
    }
  }
}