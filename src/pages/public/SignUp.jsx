import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { apiGetPublicPhotographers } from "../../services/publicWebsiteApi";
import "./Login.css";
import brandLogo from "../../assets/images/Lensflow_brand_logo-transparent.png";

export default function SignUp() {
  const location = useLocation();
  const params = new URLSearchParams(location.state?.from?.search || "");
  const [photographerId, setPhotographerId] = useState(params.get("photographer") || "");
  const [photographers, setPhotographers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setLoadError("");
      try {
        const data = await apiGetPublicPhotographers();
        if (active) setPhotographers(data || []);
      } catch { if (active) setLoadError("Unable to load photographers. Please try again."); }
      finally { if (active) setLoading(false); }
    }
    load(); return () => { active = false; };
  }, [retry]);

  async function submit(event) {
    event.preventDefault();
    if (lock.current) return;
    setError("");
    if (!firstName.trim() || !lastName.trim()) { setError("Please enter your first and last name."); return; }
    if (password !== confirm) { setError("Your passwords do not match."); return; }
    if (!photographers.some((item) => item.photographer_id === photographerId)) { setError("Please select an available photographer."); return; }
    lock.current = true; setSaving(true);
    const query = new URLSearchParams({ photographer: photographerId });
    if (params.get("service") && params.get("photographer") === photographerId) query.set("service", params.get("service"));
    const destination = `/client/bookings/new?${query}`;
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password, options: {
          data: { signup_type: "client", first_name: firstName.trim(), last_name: lastName.trim(), photographer_id: photographerId },
          emailRedirectTo: `${window.location.origin}${destination}`,
        }
      });
      if (error) throw error;
      if (data.session) {
        // Reload so authenticated account setup finishes before protected routes render.
        window.location.assign(destination);
      } else {
        setMessage("Check your email for a confirmation link to finish creating your account. If you already have an account, sign in below.");
        setPassword(""); setConfirm("");
      }
    } catch (err) { setError(err.message || "Unable to create your account. Please try again."); }
    finally { lock.current = false; setSaving(false); }
  }

  return <main className="login-page">
      <button
        type="button"
        className="login-logo"
      >
        <span >
          <Link to="/">
          <img className="login-logo-img" src={brandLogo} alt="LensFlow" />
          </Link>
        </span>

      </button>

    <section className="login-card">
      <div className="login-heading"><p className="login-eyebrow">Your photography journey</p><h1>Create a client account</h1><p>Book sessions and access your galleries and invoices.</p></div>
      {message ? <p role="status">{message}</p> : loading ? <p role="status">Loading photographers…</p> : loadError ? <div role="alert"><p>{loadError}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button></div> : photographers.length === 0 ? <p>No photographers are accepting online sign-ups yet. Please contact your photographer for access.</p> : <form className="login-form" onSubmit={submit}>
        <div className="login-field"><label htmlFor="signup-first">First name</label><input id="signup-first" autoComplete="given-name" required maxLength={100} value={firstName} onChange={(event) => setFirstName(event.target.value)} disabled={saving} /></div>
        <div className="login-field"><label htmlFor="signup-last">Last name</label><input id="signup-last" autoComplete="family-name" required maxLength={100} value={lastName} onChange={(event) => setLastName(event.target.value)} disabled={saving} /></div>
        <div className="login-field"><label htmlFor="signup-photographer">Your photographer</label><select id="signup-photographer" required value={photographerId} onChange={(event) => setPhotographerId(event.target.value)} disabled={saving}><option value="">Select your photographer</option>{photographers.map((item) => <option key={item.photographer_id} value={item.photographer_id}>{item.business_name}</option>)}</select><small className="login-field-note">Only photographers with a published LensFlow website are available for online client signup.</small></div>
        <div className="login-field"><label htmlFor="signup-email">Email</label><input id="signup-email" type="email" autoComplete="email" required maxLength={255} value={email} onChange={(event) => setEmail(event.target.value)} disabled={saving} /></div>
        <div className="login-field"><label htmlFor="signup-password">Password (at least 8 characters)</label><input id="signup-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} disabled={saving} /></div>
        <div className="login-field"><label htmlFor="signup-confirm">Confirm password</label><input id="signup-confirm" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} disabled={saving} /></div>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button type="submit" className="login-submit" disabled={saving}>{saving ? "Creating account…" : "Create Account"}</button>
      </form>}
      <div className="login-account-links">
        <p>Already have an account? <Link to="/login" state={location.state}>Sign in</Link></p>
        <p>Are you a photographer? <Link to="/signup/photographer">Create a photographer account</Link></p>
      </div>
    </section>
  </main>;
}
