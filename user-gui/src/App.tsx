import { useEffect, useState, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Settings from '@/pages/Settings';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (initializing) {
    return (
      <div className="splash">
        <div className="splash-card">
          <p className="text">HorseBetを起動しています...</p>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        <Route
          path="/login"
          element={session ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/"
          element={
            <Protected session={session}>
              <Dashboard />
            </Protected>
          }
        />
        <Route
          path="/settings"
          element={
            <Protected session={session}>
              <Settings />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  );
}

function Protected({ session, children }: { session: Session | null; children: ReactNode }) {
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
