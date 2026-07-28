import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const TIPOS = ['Todos', 'Entrada', 'Salida', 'Devolución', 'PO']

const badge = {
  'Entrada':    'bg-green-100 text-green-800 border-green-300',
  'Salida':     'bg-red-100 text-red-800 border-red-300',
  'Devolución': 'bg-blue-100 text-blue-800 border-blue-300',
  'PO':         'bg-ambar-400/20 text-yellow-800 border-ambar-500/50',
}

export default function Bitacora() {
  const [movs, setMovs] = useState([])
  const [tipo, setTipo] = useState('Todos')
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let q = supabase.from('bitacora_inventario')
      .select('*')
      .order('fecha_movimiento', { ascending: false })
      .limit(300)
    if (tipo !== 'Todos') q = q.eq('tipo_movimiento', tipo)
    q.then(({ data }) => { setMovs(data ?? []); setCargando(false) })
  }, [tipo])

  const filtrados = movs.filter(m =>
    (m.id_item + ' ' + (m.usuario ?? '') + ' ' + (m.observaciones ?? ''))
      .toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold">Bitácora de inventario</h1>
        <input
          placeholder="Buscar por código, usuario u observación…"
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          className="rounded border border-acero-200 bg-white px-3 py-2 text-sm w-full sm:w-80 focus:outline-none focus:ring-2 focus:ring-ambar-400"
        />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {TIPOS.map(t => (
          <button key={t} onClick={() => setTipo(t)}
            className={`px-3 py-1.5 rounded text-sm border ${tipo === t
              ? 'bg-acero-950 text-white border-acero-950'
              : 'bg-white border-acero-200 hover:border-acero-600'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-acero-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-acero-50 text-acero-600 text-xs">
            <tr>
              <th className="text-left px-4 py-2.5">Fecha</th>
              <th className="text-left px-4 py-2.5">Movimiento</th>
              <th className="text-left px-4 py-2.5">Artículo</th>
              <th className="text-right px-4 py-2.5">Cantidad</th>
              <th className="text-right px-4 py-2.5">Stock</th>
              <th className="text-left px-4 py-2.5">Usuario</th>
              <th className="text-left px-4 py-2.5">Observaciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-acero-100">
            {cargando && (
              <tr><td colSpan="7" className="px-4 py-6 text-center text-acero-600 font-mono text-xs">Cargando…</td></tr>
            )}
            {!cargando && filtrados.length === 0 && (
              <tr><td colSpan="7" className="px-4 py-6 text-center text-acero-600">Sin movimientos registrados.</td></tr>
            )}
            {filtrados.map(m => (
              <tr key={m.id_bitacora}>
                <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                  {new Date(m.fecha_movimiento).toLocaleString('es-MX')}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block rounded border px-2 py-0.5 text-xs font-mono ${badge[m.tipo_movimiento] ?? 'bg-acero-100 border-acero-200'}`}>
                    {m.tipo_movimiento}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">{m.id_item}</td>
                <td className="px-4 py-2.5 text-right font-mono">{m.cantidad ?? '—'}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                  {m.stock_antes != null ? `${m.stock_antes} → ${m.stock_despues}` : '—'}
                </td>
                <td className="px-4 py-2.5 text-xs">{m.usuario ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-acero-600">{m.observaciones ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-acero-600 mt-2">
        La bitácora es de solo lectura: se escribe automáticamente con cada movimiento y nadie puede editarla.
      </p>
    </div>
  )
}
