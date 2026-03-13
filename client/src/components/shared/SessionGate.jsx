import React, { useState } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';

export default function SessionGate({ children }) {
  const { state } = useSocket();
  const [venue, setVenue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (state.session) {
    return children;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!venue.trim()) return;
    setLoading(true);
    setError('');
    try {
      await api.post('/session/open', { venue: venue.trim() });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="session-gate">
      <form className="session-form" onSubmit={handleSubmit}>
        <h2>ShowMaster</h2>
        <p>Ouvrir une session pour commencer</p>
        <input
          type="text"
          placeholder="Nom du lieu..."
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          autoFocus
          disabled={loading}
        />
        {error && <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={loading || !venue.trim()}>
          {loading ? 'Ouverture...' : 'Ouvrir la session'}
        </button>
      </form>
    </div>
  );
}
