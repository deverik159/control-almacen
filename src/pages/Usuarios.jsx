import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const ROLES = ['Admin', 'Gerente', 'Almacenista', 'Consulta']

export default function Usuarios() {
  const { session } = useAuth()
  const [lista, setLista] = useState([])
  const [areas, setAreas] = useState([])
  const [msg, setMsg] = useState('')

  const cargar = () =>
    Promise.all([
      supabase.from('usuarios').select('*').order('nombre'),
      supabase.from('areas').select('*').eq('activo', true).order('id_area'),
    ]).then(([u, a]) => { setLista(u.data ?? []); setAreas(a.data ?? []) })
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
              <th className="text-left px-4 py-2.5">Áreas visibles (Consulta)</th>
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
                  <AreasPicker
                    areas={areas}
                    valor={u.areas_permitidas ?? []}
                    deshabilitado={u.rol !== 'Consulta'}
                    onChange={(nuevas) => actualizar(u.id, { areas_permitidas: nuevas.length ? nuevas : null })}
                  />
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


function AreasPicker({ areas, valor, deshabilitado, onChange }) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  if (deshabilitado) return <span className="text-xs text-acero-600">Todas (por rol)</span>

  const toggle = (id) => {
    const set = new Set(valor)
    set.has(id) ? set.delete(id) : set.add(id)
    onChange([...set])
  }

  const abrir = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    // Panel de 16rem (256px); si no cabe a la derecha, se alinea hacia la izquierda
    const left = Math.min(r.left, window.innerWidth - 272)
    // Si no cabe abajo, se abre hacia arriba
    const top = r.bottom + 264 > window.innerHeight ? Math.max(8, r.top - 268) : r.bottom + 4
    setPos({ top, left })
    setAbierto(a => !a)
  }

  return (
    <>
      <button onClick={abrir}
        className="rounded border border-acero-200 px-2 py-1 text-xs hover:border-acero-600 max-w-40 truncate">
        {valor.length === 0 ? 'Todas' : valor.length === 1 ? valor[0] : valor.length + ' áreas'} ▾
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div style={{ position: 'fixed', top: pos.top, left: pos.left }}
            className="z-50 bg-white border border-acero-200 rounded-lg shadow-xl p-2 w-64 max-h-64 overflow-y-auto">
            <p className="text-[11px] text-acero-600 px-1 pb-1.5 border-b border-acero-100 mb-1">
              Sin selección = ve todo el inventario
            </p>
            {areas.map(a => (
              <label key={a.id_area} className="flex items-center gap-2 px-1 py-1 text-sm cursor-pointer hover:bg-acero-50 rounded">
                <input type="checkbox" checked={valor.includes(a.id_area)}
                  onChange={() => toggle(a.id_area)} />
                <span className="font-mono text-xs">{a.id_area}</span> {a.nombre_area}
              </label>
            ))}
          </div>
        </>
      )}
    </>
  )
}
