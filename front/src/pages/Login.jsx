import React, { useState } from "react";
import axios from "axios";
import "./Login.css";
import { Link, useNavigate } from "react-router-dom";

function Login() {
  const [email, setEmail] = useState("");
  const [passwd, setPassword] = useState("");
  const navigate = useNavigate(); 

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post("https://dr-mundo.onrender.com//dr-mundo/member/login", {
        email,
        passwd,
      });
      
      console.log(res.data); // 데이터 받아오기
      
      localStorage.setItem("user", JSON.stringify(res.data)); // 사용자 정보 저장하깅
      
      navigate("/roompage");
      
    } catch (err) {
      alert("로그인 실패, 이메일 또는 비밀번호가 틀렸습니다.");
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
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
          <button className="button2" type="submit">
            SIGN IN
          </button>
        </form>
        <Link to="/Register" style={{ textDecoration: "none", fontSize: 20, margin: 20}}>
          Don't have an account?
        </Link>
      </div>
    </div>
  );
}

export default Login;