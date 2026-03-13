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
    });

    socket.on('state:update', (partial) => {
      setState(prev => ({ ...prev, ...partial }));
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
