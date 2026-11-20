import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, FileStack, LogOut, Settings as Cog, Trash2 } from 'lucide-react';
import { createContext, useContext } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router';
import { Loading } from './components/ui';
import { api, can, type Session } from './lib/api';
import { Login, Setup } from './pages/Auth';
import { PageEditor } from './pages/PageEditor';
import { PagesList } from './pages/Pages';
import { SettingsPage } from './pages/Settings';
import { StatsPage } from './pages/Stats';
import { TrashPage } from './pages/Trash';

const SessionCtx = createContext<Session | null>(null);
export const useSession = () => useContext(SessionCtx)!;
export const useCan = (role: 'viewer' | 'editor' | 'admin') => can(useSession()?.user, role);

export function App() {
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ['session'], queryFn: () => api.get<Session>('/api/v1/session') });
  if (s.isLoading) return <div className="auth"><Loading /></div>;
  if (s.error || !s.data) return <div className="auth"><div className="card">Der Server ist nicht erreichbar. Bitte später erneut versuchen.</div></div>;
  const session = s.data;
  if (session.needsSetup) return <Setup />;
  if (!session.user) return <Login session={session} />;

  const logout = async () => {
    await api.post('/api/v1/logout');
    qc.clear();
    await qc.invalidateQueries({ queryKey: ['session'] });
  };

  return (
    <SessionCtx.Provider value={session}>
      <div className="shell">
        <header className="topbar">
          <NavLink to="/" className="brand" aria-label="Folium – Startseite">
            <img src="/favicon.svg" alt="" />
            Folium
          </NavLink>
          <nav className="nav" aria-label="Hauptnavigation">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
              <FileStack className="lucide" aria-hidden="true" /> <span>Seiten</span>
            </NavLink>
            <NavLink to="/statistik" className={({ isActive }) => (isActive ? 'active' : '')}>
              <BarChart3 className="lucide" aria-hidden="true" /> <span>Statistik</span>
            </NavLink>
            <NavLink to="/papierkorb" className={({ isActive }) => (isActive ? 'active' : '')}>
              <Trash2 className="lucide" aria-hidden="true" /> <span>Papierkorb</span>
            </NavLink>
            <NavLink to="/einstellungen" className={({ isActive }) => (isActive ? 'active' : '')}>
              <Cog className="lucide" aria-hidden="true" /> <span>Einstellungen</span>
            </NavLink>
          </nav>
          <div className="spacer" />
          <div className="user">
            <span className="who">
              {session.user.name || session.user.email} · {{ admin: 'Admin', editor: 'Redaktion', viewer: 'Ansehen' }[session.user.role]}
            </span>
            <button className="btn ghost icon" onClick={logout} aria-label="Abmelden" title="Abmelden">
              <LogOut className="lucide" />
            </button>
          </div>
        </header>
        <main className="main">
          <Routes>
            <Route path="/" element={<PagesList />} />
            <Route path="/seiten/:id" element={<PageEditor />} />
            <Route path="/seiten/:id/:tab" element={<PageEditor />} />
            <Route path="/statistik" element={<StatsPage />} />
            <Route path="/papierkorb" element={<TrashPage />} />
            <Route path="/einstellungen" element={<SettingsPage />} />
            <Route path="/einstellungen/:section" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </SessionCtx.Provider>
  );
}
