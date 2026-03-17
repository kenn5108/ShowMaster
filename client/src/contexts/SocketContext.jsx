import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

const SOCKET_URL = window.location.hostname === 'localhost'
  ? `http://localhost:3000`
  : window.location.origin;

/**
 * UpdateOverlay — full-screen blocking overlay during update.
 * Shown on ALL pages (/ and /prompter) via SocketProvider.
 */
function UpdateOverlay({ elapsed }) {
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, '0')}s`
    : `${seconds}s`;

  const phase = elapsed < 5
    ? 'Téléchargement des fichiers…'
    : elapsed < 45
      ? 'Compilation de l\u2019interface…'
      : 'Redémarrage du serveur…';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        border: '4px solid rgba(255,255,255,0.15)',
        borderTopColor: '#3b82f6',
        animation: 'update-spin 1s linear infinite',
      }} />
      <h2 style={{ marginTop: 24, fontSize: 22, fontWeight: 700, margin: '24px 0 0' }}>
        Mise à jour en cours
      </h2>
      <p style={{ marginTop: 8, fontSize: 16, color: 'rgba(255,255,255,0.7)' }}>
        Veuillez patienter
      </p>
      <p style={{ marginTop: 16, fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
        {phase}
      </p>
      <p style={{
        marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.35)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {timeStr}
      </p>
      <style>{`@keyframes update-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

export function SocketProvider({ children }) {
  const [connected, setConnected] = useState(false);
  // Update overlay state
  const [updateApplying, setUpdateApplying] = useState(false);
  const [updateElapsed, setUpdateElapsed] = useState(0);

  const [state, setState] = useState({
    session: null,
    rocketshow: {
      connected: false,
      playerState: 'STOPPED',
      positionMs: 0,
      durationMs: 0,
      currentComposition: null,
      compositions: [],
    },
    queue: [],
    playback: { mode: 'auto', currentSong: null },
    stageMessage: '',
    syncOffsetMs: 0,
    serverVersion: '',
    prompter: {
      currentSong: null,
      nextSong: null,
      lyrics: [],
      syncCues: [],
      activeLine: -1,
      positionMs: 0,
      remainingMs: 0,
    },
  });

  const socketRef = useRef(null);
  const initialVersionRef = useRef(null);
  const updatePendingRef = useRef(false);

  // Called directly by SettingsView after successful API response
  // (no dependency on socket event — guaranteed to fire)
  const startUpdateOverlay = useCallback(() => {
    updatePendingRef.current = true;
    setUpdateApplying(true);
    setUpdateElapsed(0);
  }, []);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('state:full', (fullState) => {
      setState(fullState);

      // Auto-reload after update: compare server version
      if (fullState.serverVersion) {
        if (initialVersionRef.current === null) {
          initialVersionRef.current = fullState.serverVersion;
        } else if (fullState.serverVersion !== initialVersionRef.current) {
          console.log('[ShowMaster] New server version detected, reloading...');
          window.location.reload();
        }
      }

      // Also reload if we had an update:applying flag and just reconnected
      if (updatePendingRef.current) {
        console.log('[ShowMaster] Reconnected after update, reloading...');
        window.location.reload();
      }
    });

    socket.on('state:update', (partial) => {
      setState(prev => ({ ...prev, ...partial }));
    });

    // Listen for update:applying — show overlay (backup for /prompter page)
    socket.on('update:applying', () => {
      updatePendingRef.current = true;
      setUpdateApplying(true);
      setUpdateElapsed(0);
    });

    // If update failed, clear everything
    socket.on('update:failed', () => {
      updatePendingRef.current = false;
      setUpdateApplying(false);
      setUpdateElapsed(0);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // ── Polling effect: detect server return after restart ──
  useEffect(() => {
    if (!updateApplying) return;

    const timerInterval = setInterval(() => {
      setUpdateElapsed(prev => prev + 1);
    }, 1000);

    let pollInterval = null;
    let serverWentDown = false;

    const startPolling = () => {
      pollInterval = setInterval(async () => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2000);
          const r = await fetch('/api/update/check', { signal: controller.signal });
          clearTimeout(timeout);
          const data = await r.json();

          if (serverWentDown) {
            console.log('[ShowMaster] Server back after update, reloading...');
            window.location.reload();
          } else if (data.currentHash && initialVersionRef.current &&
                     data.currentHash !== initialVersionRef.current) {
            console.log('[ShowMaster] New version detected via poll, reloading...');
            window.location.reload();
          }
        } catch {
          serverWentDown = true;
        }
      }, 2000);
    };

    // Wait 5 seconds before polling (git pull + build takes time)
    const delay = setTimeout(startPolling, 5000);

    return () => {
      clearInterval(timerInterval);
      clearTimeout(delay);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [updateApplying]);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  return (
    <SocketContext.Provider value={{ connected, state, emit, socket: socketRef, startUpdateOverlay }}>
      {children}
      {updateApplying && <UpdateOverlay elapsed={updateElapsed} />}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
