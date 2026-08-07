import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Salidas() {
  const { session, perfil } = useAuth()
  const puedeCapturar = ['Admin', 'Gerente', 'Almacenista'].includes(perfil?.rol)

  const [lista, setLista] = useState([])
  const [stock, setStock] = useState([])        // vw_stock con stock > 0
  const [areas, setAreas] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [idItem, setIdItem] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [area, setArea] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = async () => {
    const [s, v, a] = await Promise.all([
      supabase.from('salidas')
        .select('*, materiales_herramientas(nombre)')
        .order('fecha_salida', { ascending: false }).limit(50),
      supabase.from('vw_stock')
        .select('id_item, nombre, stock_calculado, unidad_medida')
        .gt('stock_calculado', 0).order('nombre'),
      supabase.from('areas').select('*').eq('activo', true).order('id_area'),
    ])
    setLista(s.data ?? [])
    setStock(v.data ?? [])
    setAreas(a.data ?? [])
  }
  useEffect(() => { cargar() }, [])

  const sel = stock.find(i => i.id_item === idItem)
  const disponible = sel?.stock_calculado ?? 0

  // Aviso_Stock en vivo
  const aviso = !idItem
    ? { texto: 'Seleccione un artículo para ver el stock.', estilo: 'bg-acero-50 text-acero-600 border-acero-200' }
    : disponible <= 0
      ? { texto: '⚠️ SIN STOCK DISPONIBLE', estilo: 'bg-red-50 text-red-800 border-red-200' }
      : { texto: `✅ Stock disponible: ${disponible} ${sel?.unidad_medida ?? ''}`, estilo: 'bg-green-50 text-green-800 border-green-200' }

  const guardar = async () => {
    setError(''); setOk('')
    const cant = Number(cantidad)
    if (!idItem) return setError('Selecciona un artículo.')
    if (!cant || cant <= 0) return setError('La cantidad debe ser mayor a cero.')
    if (cant > disponible) return setError('No puedes sacar más de lo que hay en stock.')

    setGuardando(true)
    const { error: e } = await supabase.from('salidas').insert({
      id_item: idItem,
      cantidad: cant,
      area_asignada: area || null,
      usuario: session.user.id,
    })
    setGuardando(false)
    if (e) return setError(e.message.includes('stock')
      ? 'No puedes sacar más de lo que hay en stock.'
      : 'No se pudo registrar la salida: ' + e.message)

    setOk('Salida registrada.')
    setIdItem(''); setCantidad(''); setArea('')
    setAbierto(false)
    cargar()
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold">Salidas</h1>
        <input
          placeholder="Buscar por código, artículo o área…"
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          className="rounded border border-acero-200 bg-white px-3 py-2 text-sm w-full sm:w-72 order-3 sm:order-none focus:outline-none focus:ring-2 focus:ring-ambar-400"
        />
        {puedeCapturar && (
          <button onClick={() => { setAbierto(a => !a); setError(''); setOk('') }}
            className="rounded bg-acero-950 text-white px-4 py-2 text-sm font-medium hover:bg-acero-800">
            {abierto ? 'Cancelar' : '− Nueva salida'}
          </button>
        )}
      </div>

      {ok && <p className="mb-4 text-sm text-green-800 bg-green-50 border border-green-200 rounded px-3 py-2">{ok}</p>}

      {abierto && (
        <div className="bg-white rounded-lg border border-acero-200 p-5 mb-6 max-w-xl">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-acero-600 mb-1">Artículo</label>
              <select value={idItem} onChange={e => setIdItem(e.target.value)}
                className="w-full rounded border border-acero-200 px-3 py-2 text-sm bg-white">
                <option value="">— Selecciona (solo artículos con stock) —</option>
                {stock.map(i => (
                  <option key={i.id_item} value={i.id_item}>{i.id_item} · {i.nombre}</option>
                ))}
              </select>
            </div>

            <p className={`text-sm border rounded px-3 py-2 ${aviso.estilo}`}>{aviso.texto}</p>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-acero-600 mb-1">Cantidad</label>
                <input type="number" min="1" max={disponible || undefined} value={cantidad}
                  onChange={e => setCantidad(e.target.value)}
                  className="w-full rounded border border-acero-200 px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-acero-600 mb-1">Área destino</label>
                <select value={area} onChange={e => setArea(e.target.value)}
                  className="w-full rounded border border-acero-200 px-3 py-2 text-sm bg-white">
                  <option value="">— Selecciona —</option>
                  {areas.map(a => <option key={a.id_area} value={a.id_area}>{a.id_area} · {a.nombre_area}</option>)}
                </select>
              </div>
            </div>
          </div>

          {error && <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

          <button onClick={guardar} disabled={guardando || disponible <= 0}
            className="mt-4 rounded bg-ambar-500 text-acero-950 px-5 py-2 text-sm font-semibold hover:bg-ambar-400 disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Registrar salida'}
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
              <th className="text-left px-4 py-2.5">Área</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-acero-100">
            {lista.length === 0 && (
              <tr><td colSpan="4" className="px-4 py-6 text-center text-acero-600">Sin salidas registradas.</td></tr>
            )}
            {lista
              .filter(s => (s.id_item + ' ' + (s.materiales_herramientas?.nombre ?? '') + ' ' + (s.area_asignada ?? ''))
                .toLowerCase().includes(busqueda.toLowerCase()))
              .map(s => (
              <tr key={s.id_salida}>
                <td className="px-4 py-2.5 font-mono text-xs">{new Date(s.fecha_salida).toLocaleString('es-MX')}</td>
                <td className="px-4 py-2.5">
                  <span className="font-mono text-xs text-acero-600">{s.id_item}</span>{' '}
                  {s.materiales_herramientas?.nombre}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-red-700">−{s.cantidad}</td>
                <td className="px-4 py-2.5">{areas.find(a => a.id_area === s.area_asignada)?.nombre_area ?? s.area_asignada ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
