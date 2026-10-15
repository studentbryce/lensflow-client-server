import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authStore";
import "./ResetPassword.css";
import brandLogo from "../../assets/images/Lensflow_brand_logo-transparent.png";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPassword() {
  const navigate = useNavigate();
  const {
    session,
    loading: authLoading,
    updatePassword,
    signOut,
  } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const linkError = useMemo(() => {
    const hashParams = new URLSearchParams(
      window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash
    );

    const queryParams = new URLSearchParams(window.location.search);

    const errorCode =
      hashParams.get("error_code") || queryParams.get("error_code");
    const errorDescription =
      hashParams.get("error_description") ||
      queryParams.get("error_description");

    if (!errorCode && !errorDescription) {
      return "";
    }

    return (
      errorDescription?.replace(/\+/g, " ") ||
      "This password reset link is invalid or has expired."
    );
  }, []);

  function validatePassword() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
    }

    if (password !== confirmPassword) {
      return "The passwords do not match.";
    }

    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const validationError = validatePassword();

    if (validationError) {
      setError(validationError);
      return;
    }

    if (!session?.user) {
      setError(
        "Your password reset session is no longer available. Please request a new reset link."
      );
      return;
    }

    try {
      setSaving(true);

      const { error: updateError } = await updatePassword(password);

      if (updateError) {
        throw updateError;
      }

      setPassword("");
      setConfirmPassword("");
      setSuccess("Your password has been updated successfully. Redirecting you to sign in...");

      // End the temporary recovery/authenticated session so the user verifies
      // the new password by signing in normally.
      const { error: signOutError } = await signOut();

      if (signOutError) {
        console.error("Unable to sign out after password reset:", signOutError);
      }

      window.setTimeout(() => {
        navigate("/login", {
          replace: true,
          state: {
            passwordReset: true,
          },
        });
      }, 1200);
    } catch (err) {
      console.error("Password update failed:", err);

      setError(
        err.message ||
          "Unable to update your password. Please request a new reset link and try again."
      );
    } finally {
      setSaving(false);
    }
  }

  const recoveryUnavailable =
    !authLoading && !session?.user && !success;

  return (
    <main className="reset-password-page">
      <button
        type="button"
        className="reset-password-logo"
        onClick={() => navigate("/")}
        aria-label="Go to LensFlow home"
      >
        <img
          className="reset-password-logo-img"
          src={brandLogo}
          alt="LensFlow"
        />
      </button>

      <section className="reset-password-card">
        <div className="reset-password-heading">
          <p className="reset-password-eyebrow">Account recovery</p>
          <h1>Create a new password</h1>
          <p>
            Choose a new password for your LensFlow account. Use at least eight
            characters and avoid reusing a password from another service.
          </p>
        </div>

        {authLoading && !linkError ? (
          <div className="reset-password-state" role="status">
            <div className="reset-password-spinner" />
            <strong>Checking reset link...</strong>
            <span>Please wait while LensFlow verifies your recovery session.</span>
          </div>
        ) : recoveryUnavailable || linkError ? (
          <>
            <div className="reset-password-message reset-password-error" role="alert">
              {error ||
                "This password reset link is invalid or has expired. Please request a new one."}
            </div>

            <button
              type="button"
              className="reset-password-submit"
              onClick={() => navigate("/forgot-password")}
            >
              Request New Reset Link <span>→</span>
            </button>
          </>
        ) : (
          <form className="reset-password-form" onSubmit={handleSubmit}>
            <div className="reset-password-field">
              <label htmlFor="new-password">New Password</label>
              <input
                id="new-password"
                name="new-password"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                autoComplete="new-password"
                placeholder="Enter a new password"
                minLength={MIN_PASSWORD_LENGTH}
                required
                disabled={saving || Boolean(success)}
              />
              <small>Minimum {MIN_PASSWORD_LENGTH} characters.</small>
            </div>

            <div className="reset-password-field">
              <label htmlFor="confirm-password">Confirm New Password</label>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setError("");
                }}
                autoComplete="new-password"
                placeholder="Re-enter your new password"
                minLength={MIN_PASSWORD_LENGTH}
                required
                disabled={saving || Boolean(success)}
              />
            </div>

            {error && (
              <div className="reset-password-message reset-password-error" role="alert">
                {error}
              </div>
            )}

            {success && (
              <div className="reset-password-message reset-password-success" role="status">
                {success}
              </div>
            )}

            <button
              type="submit"
              className="reset-password-submit"
              disabled={saving || Boolean(success)}
            >
              {saving ? "Updating..." : "Update Password"}
              {!saving && !success && <span>→</span>}
            </button>
          </form>
        )}

        <button
          type="button"
          className="reset-password-back"
          onClick={() => navigate("/login")}
          disabled={saving}
        >
          ← Back to Sign In
        </button>
      </section>

      <p className="reset-password-footer">
        LensFlow · Photography Business Management
      </p>
    </main>
  );
}
