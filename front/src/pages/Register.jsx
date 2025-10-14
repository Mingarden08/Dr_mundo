import React, { useState } from "react";
import axios from "axios";
import "./Register.css";
import { Link, useNavigate } from "react-router-dom";

function Register() {
    const [nickName, setName] = useState("");
    const [passwd, setPassword] = useState("");
    const [email, setEmail] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.post("http://localhost:3000/dr-mundo/member/signup", {
                nickName,
                passwd,
                email,
            });
            alert("회원가입 성공");
            console.log(res.data);
        } catch (err) {
            alert("회원가입 실패");
        }
    };

    return (
        <div>
            <div style={{ maxWidth: "400px", margin: "50px auto", textAlign: "center" }}>
                <h2>회원가입</h2>
                <form onSubmit={handleSubmit}>
                    <input
                        className="input"
                        type="text"
                        placeholder="Name"
                        value={nickName}
                        onChange={(e) => setName(e.target.value)}
                    />
                    <input
                        className="input"
                        type="password"
                        placeholder="Password"
                        value={passwd}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <input
                        className="input"
                        type="email"
                        placeholder="E-mail"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <button
                        className="button"
                        type="submit"
                    >
                        <p>SIGN UP</p>
                    </button>
                </form>
                
            </div>
        </div>
    );
}

export default Register;
