import React from "react";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Homepage from "./pages/Homepage";
import RoomPage from "./pages/roompage";
import WaitingRoom from "./pages/WaitingRoom";
import { BrowserRouter, Routes, Route } from "react-router-dom";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Homepage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/roompage" element={<RoomPage />} />
        <Route path="/waiting/:roomId" element={<WaitingRoom />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;