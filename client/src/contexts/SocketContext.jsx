import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

const SOCKET_URL = window.location.hostname === 'localhost'
  ? `http://localhost:3000`
  : window.location.origin;

export function SocketProvider({ children }) {
  const [connected, setConnected] = useState(false);
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
    liveLock: false,
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
          // First connection — store the version
          initialVersionRef.current = fullState.serverVersion;
        } else if (fullState.serverVersion !== initialVersionRef.current) {
          // Server restarted with a new version → reload
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

    // Listen for update:applying — set flag so we reload on reconnect
    socket.on('update:applying', () => {
      updatePendingRef.current = true;
    });

    // If update failed, clear the pending flag
    socket.on('update:failed', () => {
      updatePendingRef.current = false;
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  return (
    <SocketContext.Provider value={{ connected, state, emit, socket: socketRef }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
