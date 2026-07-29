import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [perfil, setPerfil] = useState(null)   // { nombre, rol, area, email }
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setCargando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) { setPerfil(null); setCargando(false) }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    supabase
      .from('usuarios')
      .select('nombre, rol, area, email, push_notify, areas_permitidas')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setPerfil(data)
        setCargando(false)
      })
  }, [session])

  const salir = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ session, perfil, cargando, salir }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
