import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// roles: lista opcional. Si se pasa, solo esos roles entran.
export default function ProtectedRoute({ children, roles }) {
  const { session, perfil, cargando } = useAuth()

  if (cargando) {
    return (
      <div className="min-h-screen grid place-items-center text-acero-600 font-mono text-sm">
        Cargando sesión…
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  if (roles && perfil && !roles.includes(perfil.rol)) return <Navigate to="/" replace />
  return children
}
