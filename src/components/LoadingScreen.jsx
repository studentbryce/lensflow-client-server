import brandLogo from "../assets/images/Lensflow_brand_logo-transparent.png";
import "./LoadingScreen.css";

export default function LoadingScreen({ onSignOut }) {
  return (
    <main className="loading-screen" role="status" aria-label="Preparing your LensFlow workspace">
      <div className="loading-screen-glow" aria-hidden="true" />
      <div className="loading-screen-content">
        <img className="loading-screen-logo" src={brandLogo} alt="LensFlow" />
        <div className="loading-screen-rule" aria-hidden="true" />
        <p className="loading-screen-eyebrow">YOUR CREATIVE WORKSPACE</p>
        <div className="loading-screen-indicator" aria-hidden="true">
          <span /><span /><span />
        </div>
        <p className="loading-screen-message">Preparing your workspace…</p>
        {onSignOut && (
          <button type="button" className="loading-screen-signout" onClick={onSignOut}>
            Sign Out
          </button>
        )}
      </div>
    </main>
  );
}
