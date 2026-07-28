import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const ROLES = ['Admin', 'Almacenista', 'Consulta']

export default function Usuarios() {
  const { session } = useAuth()
  const [lista, setLista] = useState([])
  const [msg, setMsg] = useState('')

  const cargar = () =>
    supabase.from('usuarios').select('*').order('nombre')
      .then(({ data }) => setLista(data ?? []))
  useEffect(() => { cargar() }, [])

  const actualizar = async (id, cambios) => {
    setMsg('')
    if (id === session.user.id && cambios.rol && cambios.rol !== 'Admin')
      return setMsg('⚠ No puedes quitarte tu propio rol de Admin.')
    const { error } = await supabase.from('usuarios').update(cambios).eq('id', id)
    if (error) return setMsg('❌ ' + error.message)
    setMsg('✅ Cambios guardados.')
    cargar()
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Usuarios</h1>
      <p className="text-acero-600 text-sm mb-6 max-w-2xl">
        Los usuarios nuevos se crean en Supabase (Authentication → Add user) y entran
        automáticamente con rol <b>Consulta</b>. Aquí les asignas su rol definitivo.
      </p>

      {msg && <p className="mb-4 text-sm bg-acero-50 border border-acero-200 rounded px-3 py-2 max-w-2xl">{msg}</p>}

      <div className="bg-white rounded-lg border border-acero-200 overflow-x-auto max-w-3xl">
        <table className="w-full text-sm">
          <thead className="bg-acero-50 text-acero-600 text-xs">
            <tr>
              <th className="text-left px-4 py-2.5">Nombre</th>
              <th className="text-left px-4 py-2.5">Correo</th>
              <th className="text-left px-4 py-2.5">Área</th>
              <th className="text-left px-4 py-2.5">Rol</th>
              <th className="text-center px-4 py-2.5">Notificaciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-acero-100">
            {lista.map(u => (
              <tr key={u.id}>
                <td className="px-4 py-2.5">{u.nombre}{u.id === session.user.id && <span className="text-xs text-acero-600"> (tú)</span>}</td>
                <td className="px-4 py-2.5 text-xs">{u.email}</td>
                <td className="px-4 py-2.5">
                  <input defaultValue={u.area ?? ''} placeholder="—"
                    onBlur={e => e.target.value !== (u.area ?? '') && actualizar(u.id, { area: e.target.value || null })}
                    className="w-28 rounded border border-acero-200 px-2 py-1 text-sm" />
                </td>
                <td className="px-4 py-2.5">
                  <select value={u.rol} onChange={e => actualizar(u.id, { rol: e.target.value })}
                    className="rounded border border-acero-200 px-2 py-1 text-sm bg-white">
                    {ROLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <input type="checkbox" checked={u.push_notify}
                    onChange={e => actualizar(u.id, { push_notify: e.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
