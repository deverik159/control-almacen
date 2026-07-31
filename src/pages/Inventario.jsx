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
  const [estadoSel, setEstadoSel] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(null)   // id_inventario en proceso
  const [zoom, setZoom] = useState(null)           // url de imagen ampliada
  const [detalle, setDetalle] = useState(null)     // artículo en detalle/edición
  const [formEd, setFormEd] = useState(null)
  const [msgEd, setMsgEd] = useState('')
  const [guardandoEd, setGuardandoEd] = useState(false)
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

  // Rol Consulta con áreas asignadas: solo ve esas áreas
  const restringido = perfil?.rol === 'Consulta' && (perfil?.areas_permitidas?.length > 0)
  const permitidas = new Set(perfil?.areas_permitidas ?? [])

  const filtrados = items
    .filter(i => !restringido || permitidas.has(i.id_area))
    .filter(i => mostrarInactivas || !areasInactivas.has(i.id_area))
    .filter(i => !areaSel || i.id_area === areaSel)
    .filter(i => !diasSel || (i.dias_sin_movimiento >= diasSel && i.stock_calculado > 0))
    .filter(i => !estadoSel || i.alerta_stock === estadoSel)
    .filter(i =>
      (i.nombre + i.id_item).toLowerCase().includes(busqueda.toLowerCase())
    )

  const colorDias = (d) =>
    d >= 90 ? 'text-red-700' : d >= 30 ? 'text-yellow-700' : 'text-acero-600'

  const abrirDetalle = (i) => {
    setDetalle(i)
    setMsgEd('')
    setFormEd({
      nombre: i.nombre ?? '',
      unidad_medida: i.unidad_medida ?? '',
      stock_minimo: i.stock_minimo ?? 1,
      id_area: i.id_area ?? '',
    })
  }

  const guardarEdicion = async () => {
    setMsgEd('')
    if (!formEd.nombre.trim()) return setMsgEd('⚠ El nombre no puede quedar vacío.')
    setGuardandoEd(true)
    const { error } = await supabase.from('materiales_herramientas').update({
      nombre: formEd.nombre.trim(),
      unidad_medida: formEd.unidad_medida || null,
      stock_minimo: Number(formEd.stock_minimo) || 0,
      id_area: formEd.id_area || null,
    }).eq('id_inventario', detalle.id_inventario)
    setGuardandoEd(false)
    if (error) return setMsgEd('❌ ' + error.message)
    setMsgEd('✅ Cambios guardados y registrados en bitácora.')
    cargar()
  }

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

      {/* Detalle / edición de artículo */}
      {detalle && formEd && (
        <div className="fixed inset-0 bg-black/40 z-[94] grid place-items-center p-4" onClick={() => setDetalle(null)}>
          <div className="bg-white rounded-lg shadow-xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              {detalle.imagen
                ? <img src={detalle.imagen} alt="" className="w-16 h-16 object-cover rounded border border-acero-200" />
                : <div className="w-16 h-16 rounded border border-dashed border-acero-200 grid place-items-center text-acero-200 text-2xl">📦</div>}
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-acero-600">{detalle.id_item}</div>
                <h2 className="font-semibold leading-snug">{detalle.nombre}</h2>
                <StockBadge alerta={detalle.alerta_stock} />
              </div>
            </div>

            {/* Datos de solo lectura */}
            <div className="grid grid-cols-3 gap-2 mb-4 text-center">
              {[
                ['Stock actual', detalle.stock_calculado],
                ['Entradas', '+' + detalle.total_entradas],
                ['Salidas', '−' + detalle.total_salidas],
              ].map(([k, v]) => (
                <div key={k} className="bg-acero-50 rounded p-2.5">
                  <div className="text-[11px] text-acero-600">{k}</div>
                  <div className="font-mono text-lg">{v}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-acero-600 font-mono mb-4">
              {detalle.dias_sin_movimiento === 0 ? 'Movido hoy' : `${detalle.dias_sin_movimiento} días sin movimiento`}
              {' · '}últ. salida: {detalle.ultima_salida
                ? new Date(detalle.ultima_salida).toLocaleDateString('es-MX')
                : 'nunca'}
            </p>

            {/* Campos editables */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-acero-600 mb-1">Nombre</label>
                <input value={formEd.nombre} disabled={!puedeEditar}
                  onChange={e => setFormEd(v => ({ ...v, nombre: e.target.value }))}
                  className="w-full rounded border border-acero-200 px-3 py-2 text-sm disabled:bg-acero-50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-acero-600 mb-1">Unidad de medida</label>
                <input value={formEd.unidad_medida} disabled={!puedeEditar}
                  onChange={e => setFormEd(v => ({ ...v, unidad_medida: e.target.value }))}
                  className="w-full rounded border border-acero-200 px-3 py-2 text-sm disabled:bg-acero-50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-acero-600 mb-1">Stock mínimo</label>
                <input type="number" min="0" value={formEd.stock_minimo} disabled={!puedeEditar}
                  onChange={e => setFormEd(v => ({ ...v, stock_minimo: e.target.value }))}
                  className="w-full rounded border border-acero-200 px-3 py-2 text-sm font-mono disabled:bg-acero-50" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-acero-600 mb-1">Área</label>
                <select value={formEd.id_area} disabled={!puedeEditar}
                  onChange={e => setFormEd(v => ({ ...v, id_area: e.target.value }))}
                  className="w-full rounded border border-acero-200 px-3 py-2 text-sm bg-white disabled:bg-acero-50">
                  <option value="">— Sin área —</option>
                  {areas.filter(a => a.activo !== false || a.id_area === formEd.id_area).map(a => (
                    <option key={a.id_area} value={a.id_area}>
                      {a.id_area} · {a.nombre_area}{a.activo === false ? ' (inactiva)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {msgEd && <p className="mt-3 text-sm bg-acero-50 border border-acero-200 rounded px-3 py-2">{msgEd}</p>}

            <div className="flex gap-2 mt-4">
              {puedeEditar && (
                <button onClick={guardarEdicion} disabled={guardandoEd}
                  className="flex-1 rounded bg-ambar-500 text-acero-950 py-2 text-sm font-semibold hover:bg-ambar-400 disabled:opacity-50">
                  {guardandoEd ? 'Guardando…' : 'Guardar cambios'}
                </button>
              )}
              <button onClick={() => setDetalle(null)}
                className="rounded border border-acero-200 px-4 py-2 text-sm hover:bg-acero-50">
                Cerrar
              </button>
            </div>
            {puedeEditar && (
              <p className="text-[11px] text-acero-600 mt-2">
                Cada cambio queda registrado en la bitácora con tu usuario.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold">Inventario general</h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <select value={estadoSel} onChange={e => setEstadoSel(e.target.value)}
            className="rounded border border-acero-200 bg-white px-3 py-2 text-sm sm:w-44">
            <option value="">Todos los estados</option>
            <option value="⚫ Sin Stock">⚫ Sin Stock</option>
            <option value="🔴 Stock Bajo">🔴 Stock Bajo</option>
            <option value="🟡 Stock Medio">🟡 Stock Medio</option>
            <option value="🟢 Stock OK">🟢 Stock OK</option>
          </select>
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
              .filter(a => !restringido || permitidas.has(a.id_area))
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

      {restringido && (
        <p className="text-xs text-acero-600 mb-3 bg-acero-50 border border-acero-200 rounded px-3 py-2 inline-block">
          👁 Vista limitada a tus áreas: {[...permitidas].map(a => nombreArea(a) ?? a).join(', ')}
        </p>
      )}

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
          <div key={i.id_inventario} onClick={() => abrirDetalle(i)}
            className="bg-white rounded-lg border border-acero-200 p-4 cursor-pointer hover:border-acero-600 transition-colors">
            <div className="flex items-start gap-3">
              {/* Miniatura / botón de imagen */}
              <div className="shrink-0">
                {i.imagen ? (
                  <img src={i.imagen} alt={i.nombre}
                    onClick={e => { e.stopPropagation(); setZoom(i.imagen) }}
                    className="w-16 h-16 object-cover rounded border border-acero-200 cursor-zoom-in" />
                ) : (
                  <div className="w-16 h-16 rounded border border-dashed border-acero-200 grid place-items-center text-acero-200 text-2xl">
                    📦
                  </div>
                )}
                {puedeEditar && (
                  <button onClick={e => { e.stopPropagation(); pedirImagen(i) }} disabled={subiendo === i.id_inventario}
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
                    {i.dias_sin_movimiento != null && (
                      <div className={colorDias(i.dias_sin_movimiento)}>
                        {i.dias_sin_movimiento === 0 ? 'movido hoy' : `${i.dias_sin_movimiento} d sin mov.`}
                      </div>
                    )}
                    <div>
                      últ. salida: {i.ultima_salida
                        ? new Date(i.ultima_salida).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' })
                        : '—'}
                    </div>
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
