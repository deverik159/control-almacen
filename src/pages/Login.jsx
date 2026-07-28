import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (session) return <Navigate to="/" replace />

  const entrar = async () => {
    setError('')
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Correo o contraseña incorrectos.')
    setEnviando(false)
  }

  return (
    <div className="min-h-screen grid place-items-center bg-acero-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="font-mono text-ambar-400 text-xs tracking-[0.3em]">CONTROL DE ALMACÉN</div>
          <h1 className="text-white text-2xl font-semibold mt-2">Iniciar sesión</h1>
        </div>
        <div className="bg-white rounded-lg shadow-xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-acero-600 mb-1">Correo</label>
            <input
              type="email" value={email} autoComplete="email"
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && entrar()}
              className="w-full rounded border border-acero-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ambar-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-acero-600 mb-1">Contraseña</label>
            <input
              type="password" value={password} autoComplete="current-password"
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && entrar()}
              className="w-full rounded border border-acero-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ambar-400"
            />
          </div>
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <button
            onClick={entrar} disabled={enviando || !email || !password}
            className="w-full rounded bg-acero-950 text-white py-2.5 text-sm font-medium hover:bg-acero-800 disabled:opacity-50 transition-colors"
          >
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
        <p className="text-acero-600 text-xs text-center mt-4">
          ¿Sin cuenta? Pide al administrador que te registre.
        </p>
      </div>
    </div>
  )
}
