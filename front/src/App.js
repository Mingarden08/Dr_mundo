import React from "react";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Homepage from "./pages/Homepage";
import RoomPage from "./pages/roompage";
import WaitingRoom from "./pages/WaitingRoom";
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { WebSocketProvider } from './WebSocketContext';
import GamePage from "./pages/GamePage";

function App() {
  return (
    <WebSocketProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Homepage />} />
          <Route path="/Login" element={<Login />} />
          <Route path="/Register" element={<Register />} />
          <Route path="/roompage" element={<RoomPage />} />
          <Route path="/waitingroom/:roomId" element={<WaitingRoom />} />
          <Route path="/game/:roomId" element={<GamePage />} />
        </Routes>
      </Router>
    </WebSocketProvider>
  );
}

export default App;