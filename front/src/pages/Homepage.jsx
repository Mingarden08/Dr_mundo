import React from "react";
import "./Homepage.css";
import logo from "./assets/images/logo.png";
import { Link } from "react-router-dom";  

function Homepage() {
    return (
        <div className="homepage-container">
            <img src={logo} alt="logo" />

            <Link to="/Login">이동하기</Link>
        </div>
    );
}

export default Homepage;