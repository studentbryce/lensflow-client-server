import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BiUser, BiSave } from "react-icons/bi";
import { useAuth } from "../../context/AuthContext";
import { apiGetClientProfile, apiUpdateClientProfile } from "../../services/clientAccountApi";
import "./Profile.css";

const toForm = (profile) => ({ first_name: profile.first_name || "", last_name: profile.last_name || "", phone: profile.phone || "" });

export default function Profile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "" });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError("");
      setProfile(null);
      setError("");
      setSuccess("");
      try {
        if (!user?.id) throw new Error("Sign in required.");
        const { data } = await apiGetClientProfile();
        if (active) { setProfile(data); setForm(toForm(data)); }
      } catch (err) {
        console.error("Unable to load profile:", err);
        if (active) setLoadError("We couldn't load your profile. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [user?.id, retry]);

  const dirty = profile && Object.keys(form).some((key) => form[key] !== toForm(profile)[key]);
  function change(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setSuccess("");
    setError("");
  }

  async function save(event) {
    event.preventDefault();
    if (submitting.current || !dirty || !user?.id) return;
    setError("");
    setSuccess("");
    const values = { first_name: form.first_name.trim(), last_name: form.last_name.trim(), phone: form.phone.trim() || null };
    if (!values.first_name || !values.last_name) { setError("Please enter both your first and last name."); return; }
    if (values.first_name.length > 100 || values.last_name.length > 100 || (values.phone?.length || 0) > 30) {
      setError("Names must be 100 characters or fewer and phone numbers 30 characters or fewer."); return;
    }
    submitting.current = true;
    setSaving(true);
    try {
      const { data } = await apiUpdateClientProfile(values);
      setProfile(data);
      setForm(toForm(data));
      setSuccess("Your profile has been updated.");
    } catch (err) {
      console.error("Unable to save profile:", err);
      setError("We couldn't save your changes. Please try again.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="client-account-page">
      <header className="client-account-header">
        <p className="client-account-eyebrow">Your account</p>
        <h1>My Profile</h1>
        <p>Keep your personal details up to date so your photographer can stay in touch.</p>
      </header>
      {loading ? <div className="client-account-state" role="status">Loading your profile…</div> :
        loadError ? <div className="client-account-state" role="alert"><h2>Unable to load profile</h2><p>{loadError}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button></div> : profile && (
          <div className="client-account-layout">
            <aside className="client-account-card client-account-summary">
              <div className="client-account-avatar" aria-hidden="true"><BiUser size={36} /></div>
              <h2>{[profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Your profile"}</h2>
              <p className="client-account-eyebrow">Client</p>
              <p>{profile.email}</p>
              <p>{profile.phone || "No phone number added"}</p>
              <Link to="/client/bookings">View my bookings →</Link>
            </aside>
            <form className="client-account-card" onSubmit={save}>
              <h2>Personal information</h2>
              <p>These details are shared with your photographer.</p>
              <fieldset disabled={saving} className="client-account-fields" aria-label="Personal information">
                <div><label htmlFor="profile-first-name">First name</label><input id="profile-first-name" name="first_name" autoComplete="given-name" required maxLength={100} value={form.first_name} onChange={change} /></div>
                <div><label htmlFor="profile-last-name">Last name</label><input id="profile-last-name" name="last_name" autoComplete="family-name" required maxLength={100} value={form.last_name} onChange={change} /></div>
                <div className="client-account-wide"><label htmlFor="profile-email">Account email</label><input id="profile-email" type="email" value={user?.email || profile.email || ""} readOnly aria-describedby="profile-email-help" /><small id="profile-email-help">Your sign-in email is managed separately from your personal details.</small></div>
                <div className="client-account-wide"><label htmlFor="profile-phone">Phone number (optional)</label><input id="profile-phone" name="phone" type="tel" autoComplete="tel" maxLength={30} placeholder="e.g. +64 21 123 4567" value={form.phone} onChange={change} /></div>
              </fieldset>
              {error && <p className="client-account-message client-account-error" role="alert">{error}</p>}
              {success && <p className="client-account-message" role="status">{success}</p>}
              <div className="client-account-actions">
                <button type="submit" disabled={saving || !dirty}><BiSave size={18} aria-hidden="true" />{saving ? "Saving…" : "Save Changes"}</button>
                <button type="button" className="client-account-secondary" disabled={saving || !dirty} onClick={() => { setForm(toForm(profile)); setError(""); setSuccess(""); }}>Discard Changes</button>
              </div>
            </form>
          </div>
        )}
    </div>
  );
}
