import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Field, Spinner } from '../components/ui';
import { api, ApiError, type Session } from '../lib/api';

function useSubmit() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['session'] });
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

export function Login({ session }: { session: Session }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => api.post('/api/v1/login', { email, password }));
  };
  return (
    <div className="auth">
      <form className="card" onSubmit={submit} noValidate>
        <img src="/favicon.svg" alt="" width={40} height={40} />
        <h1>Anmelden</h1>
        <p className="muted" style={{ marginTop: 0 }}>Folium – Linkseiten auf dem eigenen Server</p>
        {error && (
          <div className="callout bad" role="alert" style={{ marginBottom: 14 }}>
            {error.message}
          </div>
        )}
        {session.localLogin && (
          <>
            <Field label="E-Mail-Adresse">{(id) => <input id={id} className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Field>
            <Field label="Passwort">{(id) => <input id={id} className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>
            <button className="btn primary" style={{ width: '100%' }} disabled={busy || !email || !password}>
              {busy ? <Spinner /> : null} Anmelden
            </button>
          </>
        )}
        {session.oidc && (
          <a className="btn" style={{ width: '100%', marginTop: 10 }} href="/api/v1/auth/oidc/start">
            {session.oidc.label}
          </a>
        )}
      </form>
    </div>
  );
}

export function Setup() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => api.post('/api/v1/setup', { code, name, email, password }));
  };
  const err = (f: string) => (error?.field === f ? error.message : null);
  return (
    <div className="auth">
      <form className="card" onSubmit={submit} noValidate>
        <img src="/favicon.svg" alt="" width={40} height={40} />
        <h1>Folium einrichten</h1>
        <p className="muted" style={{ marginTop: 0 }}>Legen Sie das erste Admin-Konto an. Den Einrichtungscode finden Sie im Serverprotokoll (<code>docker compose logs folium</code>).</p>
        {error && !error.field && (
          <div className="callout bad" role="alert" style={{ marginBottom: 14 }}>
            {error.message}
          </div>
        )}
        <Field label="Einrichtungscode" error={err('code')}>{(id) => <input id={id} className="input" inputMode="numeric" placeholder="123-456-789" value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
        <Field label="Ihr Name">{(id) => <input id={id} className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="E-Mail-Adresse" error={err('email')}>{(id) => <input id={id} className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Passwort" hint="Mindestens 12 Zeichen." error={err('password')}>
          {(id) => <input id={id} className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <button className="btn primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? <Spinner /> : null} Konto anlegen
        </button>
      </form>
    </div>
  );
}
