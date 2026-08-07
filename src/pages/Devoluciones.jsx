import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Devoluciones() {
  const { session, perfil } = useAuth()
  const puedeCapturar = ['Admin', 'Gerente', 'Almacenista'].includes(perfil?.rol)

  const [lista, setLista] = useState([])
  const [salidas, setSalidas] = useState([])   // vw_salidas_devolvibles
  const [abierto, setAbierto] = useState(false)
  const [idSalida, setIdSalida] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = async () => {
    const [d, s] = await Promise.all([
      supabase.from('devoluciones')
        .select('*, materiales_herramientas(nombre)')
        .order('fecha_devolucion', { ascending: false }).limit(50),
      supabase.from('vw_salidas_devolvibles')
        .select('*').order('fecha_salida', { ascending: false }).limit(200),
    ])
    setLista(d.data ?? [])
    setSalidas(s.data ?? [])
  }
  useEffect(() => { cargar() }, [])

  const sel = salidas.find(s => s.id_salida === idSalida)

  const guardar = async () => {
    setError(''); setOk('')
    const cant = Number(cantidad)
    if (!sel) return setError('Selecciona la salida a devolver.')
    if (!cant || cant <= 0) return setError('La cantidad debe ser mayor a cero.')
    if (cant > sel.restante)
      return setError('No puedes devolver más de lo que salió. Restante: ' + sel.restante)

    setGuardando(true)
    const { error: e } = await supabase.from('devoluciones').insert({
      id_salida: sel.id_salida,
      id_item: sel.id_item,
      cantidad: cant,
      motivo: motivo || null,
      usuario: session.user.id,
    })
    setGuardando(false)
    if (e) return setError('No se pudo registrar: ' + e.message)

    setOk('Devolución registrada. El stock ya fue actualizado.')
    setIdSalida(''); setCantidad(''); setMotivo('')
    setAbierto(false)
    cargar()
  }

  const inp = "w-full rounded border border-acero-200 px-3 py-2 text-sm"
  const lbl = "block text-xs font-medium text-acero-600 mb-1"

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Devoluciones</h1>
        {puedeCapturar && (
          <button onClick={() => { setAbierto(a => !a); setError(''); setOk('') }}
            className="rounded bg-acero-950 text-white px-4 py-2 text-sm font-medium hover:bg-acero-800">
            {abierto ? 'Cancelar' : '↩ Nueva devolución'}
          </button>
        )}
      </div>

      {ok && <p className="mb-4 text-sm text-green-800 bg-green-50 border border-green-200 rounded px-3 py-2">{ok}</p>}

      {abierto && (
        <div className="bg-white rounded-lg border border-acero-200 p-5 mb-6 max-w-xl">
          <div className="space-y-4">
            <div>
              <label className={lbl}>Salida a devolver</label>
              <select value={idSalida} onChange={e => setIdSalida(e.target.value)}
                className={inp + ' bg-white'}>
                <option value="">— Selecciona una salida —</option>
                {salidas.map(s => (
                  <option key={s.id_salida} value={s.id_salida}>
                    {s.id_item} · {s.nombre}
                  </option>
                ))}
              </select>
            </div>

            {sel && (
              <p className="text-sm border rounded px-3 py-2 bg-green-50 text-green-800 border-green-200">
                ↩ Puedes devolver hasta <b className="font-mono">{sel.restante}</b> de esta salida.
              </p>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Cantidad a devolver</label>
                <input type="number" min="1" max={sel?.restante || undefined} value={cantidad}
                  onChange={e => setCantidad(e.target.value)}
                  className={inp + ' font-mono'} />
              </div>
              <div>
                <label className={lbl}>Motivo</label>
                <input value={motivo} onChange={e => setMotivo(e.target.value)}
                  placeholder="Sobrante, defectuoso, no se usó…" className={inp} />
              </div>
            </div>
          </div>

          {error && <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

          <button onClick={guardar} disabled={guardando || !sel}
            className="mt-4 rounded bg-ambar-500 text-acero-950 px-5 py-2 text-sm font-semibold hover:bg-ambar-400 disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Registrar devolución'}
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-acero-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-acero-50 text-acero-600 text-xs">
            <tr>
              <th className="text-left px-4 py-2.5">Fecha</th>
              <th className="text-left px-4 py-2.5">Artículo</th>
              <th className="text-right px-4 py-2.5">Cantidad</th>
              <th className="text-left px-4 py-2.5">Motivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-acero-100">
            {lista.length === 0 && (
              <tr><td colSpan="4" className="px-4 py-6 text-center text-acero-600">Sin devoluciones registradas.</td></tr>
            )}
            {lista.map(d => (
              <tr key={d.id_devolucion}>
                <td className="px-4 py-2.5 font-mono text-xs">{new Date(d.fecha_devolucion).toLocaleString('es-MX')}</td>
                <td className="px-4 py-2.5">
                  <span className="font-mono text-xs text-acero-600">{d.id_item}</span>{' '}
                  {d.materiales_herramientas?.nombre}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-green-700">+{d.cantidad}</td>
                <td className="px-4 py-2.5">{d.motivo ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
