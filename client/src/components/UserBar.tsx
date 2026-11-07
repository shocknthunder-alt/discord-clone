import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import UserSettingsModal from "./UserSettingsModal";

export default function UserBar() {
  const user = useAuthStore((s) => s.user);
  const [showSettings, setShowSettings] = useState(false);

  if (!user) return null;

  return (
    <div className="user-bar">
      {user.avatarUrl ? (
        <img className="user-bar-avatar" src={user.avatarUrl} alt="" />
      ) : (
        <div className="user-bar-avatar placeholder">{user.username.slice(0, 2).toUpperCase()}</div>
      )}
      <div className="user-bar-name">{user.username}</div>
      <button className="user-bar-settings-button" onClick={() => setShowSettings(true)} title="User Settings">
        ⚙️
      </button>

      {showSettings && <UserSettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
