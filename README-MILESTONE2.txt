LensFlow COMP.7214 — Milestone 2 overlay

Copy the contents of this ZIP into the ROOT of your cloned lensflow-client-server repo.
It replaces server/package.json, server/.env.example, and server/src/app.js.
It adds the auth middleware, auth controller, auth routes, Supabase Auth configuration,
and the React API client helper.

Your real server/.env is intentionally NOT included or replaced.

1. In server/.env, keep PORT=3001 and add SUPABASE_URL and SUPABASE_ANON_KEY.
   Copy values from root .env VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
   Do not use a service-role or secret key here.
2. From server/: npm install
3. From server/: npm run dev
4. From repo root/: npm run dev
5. Visit http://localhost:5173/api/health (should still work).
6. Visit http://localhost:5173/api/auth/me (without Authorization header): 401.
7. Log in to LensFlow locally. In that logged-in browser tab, open DevTools Console and run:
   const { apiGetMe } = await import('/src/services/apiClient.js');
   await apiGetMe();
   Expected: { success: true, data: { user_id: '...', email: '...' } }
8. Invalid token test in DevTools Console:
   const r = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer invalid-token' } });
   console.log(r.status, await r.json());
   Expected: 401 UNAUTHORIZED.
9. Test with both a photographer and client account. Do not paste access tokens into chat.

No database changes, RLS changes, or Stripe changes are involved.
