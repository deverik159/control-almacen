import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Parser CSV sencillo con soporte de comillas
function parseCSV(texto) {
  const filas = []
  let fila = [], campo = '', enComillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (enComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') enComillas = false
      else campo += c
    } else if (c === '"') enComillas = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo); campo = ''
      if (fila.some(v => v.trim() !== '')) filas.push(fila)
      fila = []
    } else campo += c
  }
  if (campo !== '' || fila.length) { fila.push(campo); if (fila.some(v => v.trim() !== '')) filas.push(fila) }
  return filas
}

const COLUMNAS = ['id_item', 'nombre', 'stock_inicial', 'stock_minimo', 'unidad_medida', 'id_area', 'entradas', 'salidas']

export default function Importar() {
  const [preview, setPreview] = useState([])
  const [errores, setErrores] = useState([])
  const [resultado, setResultado] = useState('')
  const [importando, setImportando] = useState(false)

  const leerArchivo = (e) => {
    setResultado(''); setErrores([]); setPreview([])
    const archivo = e.target.files[0]
    if (!archivo) return
    const lector = new FileReader()
    lector.onload = () => {
      const filas = parseCSV(lector.result)
      if (filas.length < 2) return setErrores(['El archivo está vacío o solo tiene encabezados.'])

      const headers = filas[0].map(h => h.trim().toLowerCase())
      const obligatorias = ['id_item', 'nombre', 'stock_inicial', 'stock_minimo', 'unidad_medida', 'id_area']
      const faltan = obligatorias.filter(c => !headers.includes(c))
      if (faltan.length)
        return setErrores(['Faltan columnas obligatorias en el CSV: ' + faltan.join(', ') + '. Encontré: ' + headers.join(', ')])

      const idx = Object.fromEntries(COLUMNAS.map(c => [c, headers.indexOf(c)]))
      const errs = []
      const registros = filas.slice(1).map((f, n) => {
        const r = {
          id_item: (f[idx.id_item] ?? '').trim(),
          nombre: (f[idx.nombre] ?? '').trim(),
          stock_inicial: idx.stock_inicial >= 0 ? Number(f[idx.stock_inicial]) || 0 : 0,
          stock_minimo: idx.stock_minimo >= 0 ? Number(f[idx.stock_minimo]) || 0 : 0,
          unidad_medida: idx.unidad_medida >= 0 ? (f[idx.unidad_medida] ?? '').trim() || null : null,
          id_area: idx.id_area >= 0 ? (f[idx.id_area] ?? '').trim() || null : null,
          entradas_hist: idx.entradas >= 0 ? Number(f[idx.entradas]) || 0 : 0,
          salidas_hist: idx.salidas >= 0 ? Number(f[idx.salidas]) || 0 : 0,
          fecha_alta: new Date().toISOString(),   // último movimiento = momento de la importación
        }
        if (!r.id_item) errs.push(`Fila ${n + 2}: sin id_item, se omitirá.`)
        if (!r.nombre) errs.push(`Fila ${n + 2}: sin nombre, se omitirá.`)
        return r
      }).filter(r => r.id_item && r.nombre)

      // Duplicados dentro del mismo archivo
      const vistos = new Set()
      const limpios = registros.filter(r => {
        if (vistos.has(r.id_item)) { errs.push(`Código duplicado en el archivo: ${r.id_item} (se usa la primera aparición).`); return false }
        vistos.add(r.id_item); return true
      })

      setErrores(errs)
      setPreview(limpios)
    }
    lector.readAsText(archivo, 'utf-8')
    e.target.value = ''
  }

  const importar = async () => {
    setImportando(true); setResultado('')
    // upsert: si el id_item ya existe, actualiza nombre/mínimo/unidad/área (no toca stock_inicial)
    const { error } = await supabase
      .from('materiales_herramientas')
      .upsert(preview, { onConflict: 'id_item', ignoreDuplicates: false })
    setImportando(false)
    if (error) return setResultado('❌ Error al importar: ' + error.message)
    setResultado(`✅ Importación completa: ${preview.length} artículos cargados.`)
    setPreview([])
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Importar inventario</h1>
      <p className="text-acero-600 text-sm mb-6 max-w-2xl">
        Carga tu base de almacén desde un archivo CSV. Columnas obligatorias:{' '}
        <code className="font-mono text-xs bg-acero-50 border border-acero-200 rounded px-1">
          id_item, nombre, stock_inicial, stock_minimo, unidad_medida, id_area
        </code>. Opcionales:{' '}
        <code className="font-mono text-xs bg-acero-50 border border-acero-200 rounded px-1">entradas, salidas</code>{' '}
        (acumulados históricos: suman/restan al stock y se muestran en el detalle del artículo).
        La fecha de último movimiento y los días sin movimiento parten del momento de la importación.
        Si un código ya existe, se actualizan sus datos sin duplicarlo.
      </p>

      <div className="bg-white rounded-lg border border-acero-200 p-5 max-w-2xl mb-6">
        <label className="block text-xs font-medium text-acero-600 mb-2">Archivo CSV</label>
        <input type="file" accept=".csv,text/csv" onChange={leerArchivo}
          className="text-sm file:mr-3 file:rounded file:border-0 file:bg-acero-950 file:text-white file:px-4 file:py-2 file:text-sm file:cursor-pointer" />
        <p className="text-[11px] text-acero-600 mt-2">
          Desde Google Sheets o Excel: Archivo → Descargar → CSV (valores separados por comas).
        </p>
      </div>

      {errores.length > 0 && (
        <div className="mb-4 text-sm text-yellow-900 bg-ambar-400/15 border border-ambar-500/40 rounded px-3 py-2 max-w-2xl">
          {errores.map((e, i) => <div key={i}>⚠ {e}</div>)}
        </div>
      )}

      {resultado && (
        <p className={`mb-4 text-sm rounded border px-3 py-2 max-w-2xl ${resultado.startsWith('✅')
          ? 'text-green-800 bg-green-50 border-green-200'
          : 'text-red-700 bg-red-50 border-red-200'}`}>
          {resultado}
        </p>
      )}

      {preview.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3 max-w-4xl">
            <h2 className="font-semibold text-sm">Vista previa — {preview.length} artículos</h2>
            <button onClick={importar} disabled={importando}
              className="rounded bg-ambar-500 text-acero-950 px-5 py-2 text-sm font-semibold hover:bg-ambar-400 disabled:opacity-50">
              {importando ? 'Importando…' : 'Confirmar importación'}
            </button>
          </div>
          <div className="bg-white rounded-lg border border-acero-200 overflow-x-auto max-w-4xl">
            <table className="w-full text-sm">
              <thead className="bg-acero-50 text-acero-600 text-xs">
                <tr>
                  <th className="text-left px-4 py-2.5">id_item</th>
                  <th className="text-left px-4 py-2.5">Nombre</th>
                  <th className="text-right px-4 py-2.5">Stock inicial</th>
                  <th className="text-right px-4 py-2.5">Mínimo</th>
                  <th className="text-left px-4 py-2.5">Unidad</th>
                  <th className="text-left px-4 py-2.5">Área</th>
                  <th className="text-right px-4 py-2.5">Entradas</th>
                  <th className="text-right px-4 py-2.5">Salidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-acero-100">
                {preview.slice(0, 100).map(r => (
                  <tr key={r.id_item}>
                    <td className="px-4 py-2 font-mono text-xs">{r.id_item}</td>
                    <td className="px-4 py-2">{r.nombre}</td>
                    <td className="px-4 py-2 text-right font-mono">{r.stock_inicial}</td>
                    <td className="px-4 py-2 text-right font-mono">{r.stock_minimo}</td>
                    <td className="px-4 py-2">{r.unidad_medida ?? '—'}</td>
                    <td className="px-4 py-2">{r.id_area ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">+{r.entradas_hist}</td>
                    <td className="px-4 py-2 text-right font-mono">−{r.salidas_hist}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 100 && (
              <p className="px-4 py-2 text-xs text-acero-600">…y {preview.length - 100} más (se importan todos).</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
