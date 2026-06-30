import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { AgoraApp } from './components/agora/AgoraApp';
import { setupPhaser } from './game/Game';

// Phaser stays mounted (hidden) purely as the live Colyseus connection engine:
// it owns the room and re-dispatches every server message onto eventBus, which
// the Agora console consumes. Start it first so the room is connecting while
// React mounts.
setupPhaser('phaser-container');

// Agora operations console — the real, live view.
const rootElement = document.getElementById('ui-root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<AgoraApp />);
}
