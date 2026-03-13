import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { useSocket } from './contexts/SocketContext';
import ControlLayout from './components/control/ControlLayout';
import PrompterView from './components/prompter/PrompterView';
import SessionGate from './components/shared/SessionGate';

export default function App() {
  const { connected } = useSocket();

  return (
    <Routes>
      <Route path="/prompter" element={<PrompterView />} />
      <Route path="/*" element={
        <SessionGate>
          <ControlLayout />
        </SessionGate>
      } />
    </Routes>
  );
}
