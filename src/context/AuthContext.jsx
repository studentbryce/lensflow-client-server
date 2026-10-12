import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

import { supabase } from '../lib/supabaseClient';
import { completeAccountSignup } from '../lib/completeAccountSignup';
import { apiFetch } from '../services/apiClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId) {
    try {
      await completeAccountSignup(userId);
    } catch (error) {
      console.error('Account setup failed:', error);
    }
    try {
      const result = await apiFetch('/api/auth/profile');
      setProfile(result?.data ?? null);
    } catch (error) {
      console.error('Profile loading error:', error);
      setProfile(null);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function initialiseAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        await loadProfile(session.user.id);
      }

      setLoading(false);
    }

    initialiseAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setLoading(true);
          // Supabase auth calls must run outside the auth-event callback.
          setTimeout(async () => {
            if (!mounted) return;
            await loadProfile(session.user.id);
            if (mounted) setLoading(false);
          }, 0);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email, password) {
    return await supabase.auth.signInWithPassword({
      email,
      password,
    });
  }

  async function signUp(email, password) {
    return await supabase.auth.signUp({
      email,
      password,
    });
  }

  async function requestPasswordReset(email) {
    return await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
  }

  async function updatePassword(password) {
    return await supabase.auth.updateUser({
      password,
    });
  }

  async function signOut() {
    return await supabase.auth.signOut();
  }

  const value = {
    session,
    user,
    profile,
    loading,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
