import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import StockBadge from '../components/StockBadge'

export default function Inventario() {
  const { perfil } = useAuth()
  const puedeEditar = ['Admin', 'Almacenista'].includes(perfil?.rol)

  const [items, setItems] = useState([])
  const [areas, setAreas] = useState([])
  const [areaSel, setAreaSel] = useState('')
  const [mostrarInactivas, setMostrarInactivas] = useState(false)
  const [diasSel, setDiasSel] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(null)   // id_inventario en proceso
  const [zoom, setZoom] = useState(null)           // url de imagen ampliada
  const fileRef = useRef(null)
  const itemImagen = useRef(null)

  const cargar = () =>
    Promise.all([
      supabase.from('vw_stock').select('*').order('nombre'),
      supabase.from('areas').select('*').order('id_area'),
    ]).then(([v, a]) => {
      setItems(v.data ?? []); setAreas(a.data ?? []); setCargando(false)
    })
  useEffect(() => { cargar() }, [])

  const nombreArea = (id) => areas.find(a => a.id_area === id)?.nombre_area
  const areasInactivas = new Set(areas.filter(a => a.activo === false).map(a => a.id_area))

  const filtrados = items
    .filter(i => mostrarInactivas || !areasInactivas.has(i.id_area))
    .filter(i => !areaSel || i.id_area === areaSel)
    .filter(i => !diasSel || (i.dias_sin_movimiento >= diasSel && i.stock_calculado > 0))
    .filter(i =>
      (i.nombre + i.id_item).toLowerCase().includes(busqueda.toLowerCase())
    )

  const colorDias = (d) =>
    d >= 90 ? 'text-red-700' : d >= 30 ? 'text-yellow-700' : 'text-acero-600'

  const pedirImagen = (item) => {
    itemImagen.current = item
    fileRef.current?.click()
  }

  const subirImagen = async (e) => {
    const file = e.target.files[0]
    const item = itemImagen.current
    e.target.value = ''
    if (!file || !item) return
    if (file.size > 4 * 1024 * 1024) return alert('La imagen no debe pesar más de 4 MB.')

    setSubiendo(item.id_inventario)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${item.id_item}.${ext}`

    const { error: e1 } = await supabase.storage.from('articulos')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (e1) { setSubiendo(null); return alert('No se pudo subir la imagen: ' + e1.message) }

    const { data } = supabase.storage.from('articulos').getPublicUrl(path)
    const url = data.publicUrl + '?t=' + Date.now()   // evitar caché al reemplazar

    const { error: e2 } = await supabase.from('materiales_herramientas')
      .update({ imagen: url }).eq('id_inventario', item.id_inventario)
    setSubiendo(null)
    if (e2) return alert('Imagen subida pero no se pudo guardar la referencia: ' + e2.message)
    cargar()
  }

  return (
    <div>
      <input type="file" accept="image/*" ref={fileRef} onChange={subirImagen} className="hidden" />

      {/* Imagen ampliada */}
      {zoom && (
        <div className="fixed inset-0 bg-black/70 z-[95] grid place-items-center p-4" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" className="max-h-[85vh] max-w-full rounded-lg shadow-2xl" />
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold">Inventario general</h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <select value={diasSel} onChange={e => setDiasSel(Number(e.target.value))}
            className="rounded border border-acero-200 bg-white px-3 py-2 text-sm sm:w-52">
            <option value={0}>Cualquier movimiento</option>
            <option value={30}>🕸 Sin movimiento +30 días</option>
            <option value={60}>🕸 Sin movimiento +60 días</option>
            <option value={90}>🕸 Sin movimiento +90 días</option>
            <option value={180}>🕸 Sin movimiento +180 días</option>
          </select>
          <select value={areaSel} onChange={e => setAreaSel(e.target.value)}
            className="rounded border border-acero-200 bg-white px-3 py-2 text-sm sm:w-56">
            <option value="">Todas las áreas</option>
            {areas
              .filter(a => mostrarInactivas || a.activo !== false)
              .map(a => <option key={a.id_area} value={a.id_area}>{a.id_area} · {a.nombre_area}{a.activo === false ? ' (inactiva)' : ''}</option>)}
          </select>
          <input
            placeholder="Buscar por nombre o código…"
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            className="rounded border border-acero-200 bg-white px-3 py-2 text-sm w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-ambar-400"
          />
        </div>
      </div>

      {areasInactivas.size > 0 && (
        <label className="flex items-center gap-2 text-xs text-acero-600 mb-4 cursor-pointer">
          <input type="checkbox" checked={mostrarInactivas}
            onChange={e => { setMostrarInactivas(e.target.checked); if (!e.target.checked && areasInactivas.has(areaSel)) setAreaSel('') }} />
          Mostrar artículos de áreas inactivas ({items.filter(i => areasInactivas.has(i.id_area)).length})
        </label>
      )}

      {cargando && <p className="text-acero-600 text-sm font-mono">Cargando inventario…</p>}
      {!cargando && filtrados.length === 0 && (
        <p className="text-acero-600 text-sm">Sin artículos en este filtro.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtrados.map(i => (
          <div key={i.id_inventario} className="bg-white rounded-lg border border-acero-200 p-4">
            <div className="flex items-start gap-3">
              {/* Miniatura / botón de imagen */}
              <div className="shrink-0">
                {i.imagen ? (
                  <img src={i.imagen} alt={i.nombre}
                    onClick={() => setZoom(i.imagen)}
                    className="w-16 h-16 object-cover rounded border border-acero-200 cursor-zoom-in" />
                ) : (
                  <div className="w-16 h-16 rounded border border-dashed border-acero-200 grid place-items-center text-acero-200 text-2xl">
                    📦
                  </div>
                )}
                {puedeEditar && (
                  <button onClick={() => pedirImagen(i)} disabled={subiendo === i.id_inventario}
                    className="mt-1 w-16 text-[10px] text-acero-600 underline hover:text-acero-900 disabled:opacity-50">
                    {subiendo === i.id_inventario ? 'Subiendo…' : (i.imagen ? 'Cambiar' : '+ Imagen')}
                  </button>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-acero-600">{i.id_item}</div>
                    <div className="font-semibold leading-snug">{i.nombre}</div>
                    {i.id_area && (
                      <div className="text-[11px] text-acero-600 mt-0.5">
                        {nombreArea(i.id_area) ? `${i.id_area} · ${nombreArea(i.id_area)}` : i.id_area}
                      </div>
                    )}
                  </div>
                  <StockBadge alerta={i.alerta_stock} />
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <div>
                    <div className="text-3xl font-mono font-semibold">{i.stock_calculado}</div>
                    <div className="text-xs text-acero-600">{i.unidad_medida ?? 'unidades'} · mín. {i.stock_minimo}</div>
                  </div>
                  <div className="text-right text-xs text-acero-600 font-mono">
                    <div>+{i.total_entradas} ent.</div>
                    <div>−{i.total_salidas} sal.</div>
                    {i.dias_sin_movimiento != null && (
                      <div className={colorDias(i.dias_sin_movimiento)}>
                        {i.dias_sin_movimiento === 0 ? 'movido hoy' : `${i.dias_sin_movimiento} d sin mov.`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
