import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { parseCSV, normalizarHeader, parseMonto, parseFechaDMA } from '../lib/csv'

export default function Salidas() {
  const { session, perfil } = useAuth()
  const puedeCapturar = ['Admin', 'Gerente', 'Almacenista'].includes(perfil?.rol)

  const [lista, setLista] = useState([])
  const [stock, setStock] = useState([])        // vw_stock con stock > 0
  const [areas, setAreas] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [panelImport, setPanelImport] = useState(false)
  const [previewSal, setPreviewSal] = useState([])
  const [avisosSal, setAvisosSal] = useState([])
  const [importando, setImportando] = useState(false)
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

  const leerCSVSalidas = (e) => {
    setError(''); setOk(''); setPreviewSal([]); setAvisosSal([])
    const archivo = e.target.files[0]
    if (!archivo) return
    const lector = new FileReader()
    lector.onload = () => {
      const filas = parseCSV(lector.result)
      if (filas.length < 2) return setAvisosSal(['El archivo está vacío o solo tiene encabezados.'])
      const h = filas[0].map(normalizarHeader)
      const col = n => h.indexOf(n)
      const idx = { id_item: col('id_item'), cantidad: col('cantidad'), fecha: col('fecha'), area: col('area') }
      if (idx.id_item < 0 || idx.cantidad < 0)
        return setAvisosSal(['El CSV necesita al menos: id_item, cantidad. Opcionales: fecha (d/m/aaaa), area. Encontré: ' + h.join(', ')])

      const avisos = []
      const idsStock = new Set(stock.map(i => i.id_item))
      const regs = filas.slice(1).map((f, n) => {
        const v = i => i >= 0 ? String(f[i] ?? '').trim() : ''
        const r = {
          id_item: v(idx.id_item),
          cantidad: parseMonto(v(idx.cantidad)),
          fecha: parseFechaDMA(v(idx.fecha)),
          area: v(idx.area) || null,
        }
        if (!r.id_item) avisos.push(`Fila ${n + 2}: sin id_item, se omite.`)
        if (!r.cantidad || r.cantidad <= 0) { avisos.push(`Fila ${n + 2}: cantidad inválida, se omite.`); r.cantidad = 0 }
        if (idx.fecha >= 0 && v(idx.fecha) && !r.fecha) avisos.push(`Fila ${n + 2}: fecha "${v(idx.fecha)}" no reconocida (usa d/m/aaaa); se usará la fecha de hoy.`)
        return r
      }).filter(r => r.id_item && r.cantidad > 0)

      const desconocidos = [...new Set(regs.filter(r => !idsStock.has(r.id_item)).map(r => r.id_item))]
      if (desconocidos.length)
        avisos.push(`Ojo: ${desconocidos.length} códigos no aparecen con stock actual (${desconocidos.slice(0, 8).join(', ')}${desconocidos.length > 8 ? '…' : ''}). Si no existen en el maestro o exceden el stock, la importación se rechazará completa.`)

      setAvisosSal(avisos)
      setPreviewSal(regs)
    }
    lector.readAsText(archivo, 'utf-8')
    e.target.value = ''
  }

  const importarSalidas = async () => {
    setImportando(true); setError(''); setOk('')
    const { data: n, error: e } = await supabase.rpc('importar_salidas_historicas', { filas: previewSal })
    setImportando(false)
    if (e) return setError('No se importó nada: ' + (e.message.includes('stock')
      ? 'una fila intenta sacar más de lo que hay en stock (importa primero el inventario y las recepciones). Detalle: ' + e.message
      : e.message))
    setOk(`✅ ${n ?? previewSal.length} salidas históricas importadas. Reimportar reemplaza esta carga sin duplicar.`)
    setPreviewSal([]); setAvisosSal([]); setPanelImport(false)
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
          <div className="flex gap-2">
            <button onClick={() => { setAbierto(a => !a); setPanelImport(false); setError(''); setOk('') }}
              className="rounded bg-acero-950 text-white px-4 py-2 text-sm font-medium hover:bg-acero-800">
              {abierto ? 'Cancelar' : '− Nueva salida'}
            </button>
            <button onClick={() => { setPanelImport(p => !p); setAbierto(false); setError(''); setOk(''); setPreviewSal([]); setAvisosSal([]) }}
              className="rounded border border-acero-950 px-4 py-2 text-sm font-medium hover:bg-acero-100">
              {panelImport ? 'Cancelar' : '⬆ Importar salidas'}
            </button>
          </div>
        )}
      </div>

      {ok && <p className="mb-4 text-sm text-green-800 bg-green-50 border border-green-200 rounded px-3 py-2">{ok}</p>}

      {panelImport && (
        <div className="bg-white rounded-lg border border-acero-200 p-5 mb-6">
          <h2 className="font-semibold text-sm mb-2">Importar salidas históricas (CSV)</h2>
          <p className="text-xs text-acero-600 mb-3 max-w-3xl">
            Columnas: <code className="font-mono bg-acero-50 border border-acero-100 rounded px-1">id_item, cantidad</code> obligatorias;{' '}
            <code className="font-mono bg-acero-50 border border-acero-100 rounded px-1">fecha</code> (d/m/aaaa) y{' '}
            <code className="font-mono bg-acero-50 border border-acero-100 rounded px-1">area</code> opcionales.
            Cada fila se vuelve una salida real con su fecha: alimenta historial, bitácora y stock.
            Importa primero el inventario y las recepciones. Reimportar reemplaza la carga anterior.
          </p>
          <input type="file" accept=".csv,text/csv" onChange={leerCSVSalidas}
            className="text-sm file:mr-3 file:rounded file:border-0 file:bg-acero-950 file:text-white file:px-4 file:py-2 file:text-sm file:cursor-pointer" />

          {avisosSal.length > 0 && (
            <div className="mt-3 text-sm text-yellow-900 bg-ambar-400/15 border border-ambar-500/40 rounded px-3 py-2 max-h-40 overflow-y-auto">
              {avisosSal.map((a, i) => <div key={i}>⚠ {a}</div>)}
            </div>
          )}
          {error && <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

          {previewSal.length > 0 && (
            <>
              <div className="flex items-center justify-between mt-4 mb-2">
                <h3 className="font-semibold text-sm">Vista previa — {previewSal.length} salidas</h3>
                <button onClick={importarSalidas} disabled={importando}
                  className="rounded bg-ambar-500 text-acero-950 px-5 py-2 text-sm font-semibold hover:bg-ambar-400 disabled:opacity-50">
                  {importando ? 'Importando…' : 'Confirmar importación'}
                </button>
              </div>
              <div className="border border-acero-200 rounded overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-acero-50 text-acero-600 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">id_item</th>
                      <th className="text-right px-3 py-2">Cantidad</th>
                      <th className="text-left px-3 py-2">Fecha</th>
                      <th className="text-left px-3 py-2">Área</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-acero-100">
                    {previewSal.slice(0, 100).map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-mono">{r.id_item}</td>
                        <td className="px-3 py-1.5 text-right font-mono">−{r.cantidad}</td>
                        <td className="px-3 py-1.5 font-mono">{r.fecha ?? 'hoy'}</td>
                        <td className="px-3 py-1.5">{r.area ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewSal.length > 100 && (
                  <p className="px-3 py-2 text-xs text-acero-600">…y {previewSal.length - 100} más (se importan todas).</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

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
