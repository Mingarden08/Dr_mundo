import React, { useState } from "react";
import axios from "axios";
import "./Login.css";

function Login() {
  const [email, setEmail] = useState("");
  const [passwd, setPassword] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post("http://localhost:3000/dr-mundo/member/login", {
        email,
        passwd,
      });
      alert("로그인 성공");
      console.log(res.data);
    } catch (err) {
      alert("로그인 실패, 이메일 또는 비밀번호가 틀렸습니다.");
    }
  };

  return (
    <div style={{ maxWidth: "400px", margin: "50px auto", textAlign: "center" }}>
      <h2>로그인</h2>
      <form onSubmit={handleSubmit}>
        <input
          className="input"
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={passwd}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="button2"
          type="submit"
        >
          로그인
        </button>
      </form>
    </div>
  );
}

export default Login;
