import React, { useState } from 'react';
import { Mail, Lock, UserPlus, LogIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// M9 email/password form (Spanish), alongside the Google button in Navbar.
// Rollback: delete this file + its Navbar usage; Google-only login remains.
export const EmailAuthForm: React.FC<{ onDone?: () => void }> = ({ onDone }) => {
  const { signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setLocalError(null);
    try {
      if (mode === 'signin') await signInWithEmail(email, password);
      else await signUpWithEmail(email, password);
      onDone?.();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'No se pudo iniciar sesión con correo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-2" aria-label={mode === 'signin' ? 'Iniciar sesión con correo' : 'Crear cuenta con correo'}>
      <label className="flex items-center gap-2 rounded-xl bg-[#120a06] border border-[#d4af37]/20 px-3 focus-within:border-[#d4af37]/60">
        <Mail className="w-4 h-4 text-[#8a7265] shrink-0" />
        <span className="sr-only">Correo electrónico</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Correo electrónico"
          aria-label="Correo electrónico"
          className="w-full min-h-[44px] bg-transparent text-xs text-[#fcf8f2] placeholder:text-[#8a7265] focus:outline-none"
        />
      </label>
      <label className="flex items-center gap-2 rounded-xl bg-[#120a06] border border-[#d4af37]/20 px-3 focus-within:border-[#d4af37]/60">
        <Lock className="w-4 h-4 text-[#8a7265] shrink-0" />
        <span className="sr-only">Contraseña</span>
        <input
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña (mínimo 6 caracteres)"
          aria-label="Contraseña"
          className="w-full min-h-[44px] bg-transparent text-xs text-[#fcf8f2] placeholder:text-[#8a7265] focus:outline-none"
        />
      </label>
      {localError !== null && (
        <p role="alert" className="text-[11px] text-[#f0a6a6]">{localError}</p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="min-h-[44px] rounded-xl bg-[#d4af37] text-[#1a0f08] text-xs font-bold hover:bg-[#e5c158] transition-colors disabled:opacity-60 cursor-pointer flex items-center justify-center gap-1.5"
      >
        {mode === 'signin' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
        {busy ? 'Cargando…' : mode === 'signin' ? 'Entrar con correo' : 'Crear cuenta'}
      </button>
      <button
        type="button"
        onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setLocalError(null) }}
        className="text-[11px] text-[#bda393] hover:text-[#e5c158] underline underline-offset-2 cursor-pointer py-1"
      >
        {mode === 'signin' ? '¿Sin cuenta? Crea una aquí' : '¿Ya tienes cuenta? Inicia sesión'}
      </button>
    </form>
  );
};
