import axios from "axios";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginUser } from "../api/auth.api";
import { useAuthStore } from "../store/authStore";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { user, token } = await loginUser(email, password);
      setAuth(user, token);
      navigate("/");
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : undefined;
      setError(message ?? "Login failed");
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Welcome back!</h1>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <div className="error">{error}</div>}
        <button type="submit">Log In</button>
        <div className="switch-link">
          Need an account? <Link to="/register">Register</Link>
        </div>
      </form>
    </div>
  );
}
