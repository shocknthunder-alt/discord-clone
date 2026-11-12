import PasswordInput from "../components/PasswordInput";
import axios from "axios";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { changePassword, loginUser } from "../api/auth.api";
import { useAuthStore } from "../store/authStore";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "changePassword">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  const [cpEmail, setCpEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cpSaving, setCpSaving] = useState(false);
  const [cpError, setCpError] = useState<string | null>(null);
  const [cpSuccess, setCpSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { user, token } = await loginUser(email, password);
      setAuth(user, token, rememberMe);
      navigate("/");
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : undefined;
      setError(message ?? "Login failed");
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setCpError(null);
    setCpSuccess(false);

    if (newPassword.length < 6) {
      setCpError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setCpError("New passwords don't match.");
      return;
    }

    setCpSaving(true);
    try {
      await changePassword(cpEmail, currentPassword, newPassword);
      setCpSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : undefined;
      setCpError(message ?? "Could not change password.");
    } finally {
      setCpSaving(false);
    }
  }

  if (mode === "changePassword") {
    return (
      <div className="auth-page">
        <form className="auth-card" onSubmit={handleChangePassword}>
          <h1>Change Password</h1>

          <label htmlFor="cp-email">Email</label>
          <input id="cp-email" type="email" value={cpEmail} onChange={(e) => setCpEmail(e.target.value)} required />

          <label htmlFor="cp-current">Current Password</label>
          <PasswordInput
            id="cp-current"
            
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />

          <label htmlFor="cp-new">New Password</label>
          <PasswordInput
            id="cp-new"
            
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />

          <label htmlFor="cp-confirm">Confirm New Password</label>
          <PasswordInput
            id="cp-confirm"
            
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          {cpError && <div className="error">{cpError}</div>}
          {cpSuccess && <div className="success">Password changed — you can log in now.</div>}

          <button type="submit" disabled={cpSaving}>
            {cpSaving ? "Saving…" : "Change Password"}
          </button>

          <div className="switch-link">
            <a onClick={() => setMode("login")}>Back to Log In</a>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Welcome back!</h1>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="password">Password</label>
        <PasswordInput
          id="password"
          
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <label className="checkbox-label">
          <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
          Remember me
        </label>
        {error && <div className="error">{error}</div>}
        <button type="submit">Log In</button>
        <div className="switch-link">
          Need an account? <Link to="/register">Register</Link>
        </div>
        <div className="switch-link">
          <a onClick={() => setMode("changePassword")}>Change your password</a>
        </div>
      </form>
    </div>
  );
}
