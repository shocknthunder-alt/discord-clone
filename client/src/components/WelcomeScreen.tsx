// Shown in the main area whenever nothing is open yet (no text channel selected, no DM
// conversation chosen).
export default function WelcomeScreen() {
  return (
    <div className="main-content welcome-screen">
      <img className="welcome-image" src="/welcome/chichaci.jpg" alt="" draggable={false} />
      <h1 className="welcome-title">Welcome to ШмиркаТа Чички !</h1>
    </div>
  );
}
