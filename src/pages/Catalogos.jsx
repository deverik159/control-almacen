import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseCSV, normalizarHeader } from '../lib/csv'

const inp = "w-full rounded border border-acero-200 px-3 py-2 text-sm"
const lbl = "block text-xs font-medium text-acero-600 mb-1"

export default function Catalogos() {
  const [tab, setTab] = useState('proveedores')
  const [areas, setAreas] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [requisitores, setRequisitores] = useState([])
  const [msg, setMsg] = useState('')
  const [formProv, setFormProv] = useState({ nombre: '', rfc: '', contacto: '', telefono: '', email: '' })
  const [formReq, setFormReq] = useState({ nombre: '', id_area: '', email: '' })
  const [formArea, setFormArea] = useState({ id_area: '', nombre_area: '' })

  const cargar = async () => {
    const [a, p, r] = await Promise.all([
      supabase.from('areas').select('*').order('id_area'),
      supabase.from('proveedores').select('*').order('nombre'),
      supabase.from('requisitores').select('*').order('nombre'),
    ])
    setAreas(a.data ?? []); setProveedores(p.data ?? []); setRequisitores(r.data ?? [])
  }
  useEffect(() => { cargar() }, [])

  const guardarProv = async () => {
    setMsg('')
    if (!formProv.nombre.trim()) return setMsg('⚠ Indica el nombre del proveedor.')
    const { error } = await supabase.from('proveedores').insert({
      nombre: formProv.nombre.trim(), rfc: formProv.rfc || null,
      contacto: formProv.contacto || null, telefono: formProv.telefono || null,
      email: formProv.email || null,
    })
    if (error) return setMsg(error.message.includes('duplicate')
      ? '⚠ Ese proveedor ya existe.' : '❌ ' + error.message)
    setMsg('✅ Proveedor dado de alta.'); setFormProv({ nombre: '', rfc: '', contacto: '', telefono: '', email: '' }); cargar()
  }

  const guardarReq = async () => {
    setMsg('')
    if (!formReq.nombre.trim()) return setMsg('⚠ Indica el nombre del requisitor.')
    const { error } = await supabase.from('requisitores').insert({
      nombre: formReq.nombre.trim(), id_area: formReq.id_area || null, email: formReq.email || null,
    })
    if (error) return setMsg(error.message.includes('duplicate')
      ? '⚠ Ese requisitor ya existe.' : '❌ ' + error.message)
    setMsg('✅ Requisitor dado de alta.'); setFormReq({ nombre: '', id_area: '', email: '' }); cargar()
  }

  const guardarArea = async () => {
    setMsg('')
    if (!formArea.id_area.trim() || !formArea.nombre_area.trim())
      return setMsg('⚠ Indica ID y nombre del área.')
    const { error } = await supabase.from('areas').insert({
      id_area: formArea.id_area.trim().toUpperCase(), nombre_area: formArea.nombre_area.trim(),
    })
    if (error) return setMsg(error.message.includes('duplicate')
      ? '⚠ Ese ID de área ya existe.' : '❌ ' + error.message)
    setMsg('✅ Área agregada.'); setFormArea({ id_area: '', nombre_area: '' }); cargar()
  }

  const toggleActivo = async (tabla, idCol, id, activo) => {
    await supabase.from(tabla).update({ activo }).eq(idCol, id)
    cargar()
  }

  // Import CSV genérico para proveedores y requisitores
  const importarCSV = (tipo) => (e) => {
    setMsg('')
    const archivo = e.target.files[0]
    if (!archivo) return
    const lector = new FileReader()
    lector.onload = async () => {
      const filas = parseCSV(lector.result)
      if (filas.length < 2) return setMsg('⚠ El archivo está vacío o solo tiene encabezados.')
      const h = filas[0].map(normalizarHeader)
      const col = n => h.indexOf(n)
      let registros = []
      if (tipo === 'proveedores') {
        const iN = col('nombre') >= 0 ? col('nombre') : col('proveedor')
        if (iN < 0) return setMsg('⚠ El CSV necesita una columna "nombre" (o "proveedor").')
        registros = filas.slice(1).map(f => ({
          nombre: String(f[iN] ?? '').trim(),
          rfc: col('rfc') >= 0 ? String(f[col('rfc')] ?? '').trim() || null : null,
          contacto: col('contacto') >= 0 ? String(f[col('contacto')] ?? '').trim() || null : null,
          telefono: col('telefono') >= 0 ? String(f[col('telefono')] ?? '').trim() || null : null,
          email: col('email') >= 0 ? String(f[col('email')] ?? '').trim() || null : null,
        }))
      } else {
        const iN = col('nombre') >= 0 ? col('nombre') : col('requisitor')
        if (iN < 0) return setMsg('⚠ El CSV necesita una columna "nombre" (o "requisitor").')
        registros = filas.slice(1).map(f => ({
          nombre: String(f[iN] ?? '').trim(),
          id_area: col('id_area') >= 0 ? String(f[col('id_area')] ?? '').trim().toUpperCase() || null : null,
          email: col('email') >= 0 ? String(f[col('email')] ?? '').trim() || null : null,
        }))
      }
      const vistos = new Set()
      registros = registros.filter(r => {
        if (!r.nombre || vistos.has(r.nombre.toLowerCase())) return false
        vistos.add(r.nombre.toLowerCase()); return true
      })
      // Validar áreas de requisitores
      if (tipo === 'requisitores') {
        const idsArea = new Set(areas.map(a => a.id_area))
        registros = registros.map(r => idsArea.has(r.id_area) ? r : { ...r, id_area: null })
      }
      const { error } = await supabase.from(tipo).upsert(registros, { onConflict: 'nombre' })
      if (error) return setMsg('❌ Error al importar: ' + error.message)
      setMsg(`✅ Importación completa: ${registros.length} ${tipo}.`)
      cargar()
    }
    lector.readAsText(archivo, 'utf-8')
    e.target.value = ''
  }

  const nombreArea = (id) => areas.find(a => a.id_area === id)?.nombre_area ?? id ?? '—'

  const Tabs = () => (
    <div className="flex gap-2 mb-5 flex-wrap">
      {[['proveedores', 'Proveedores'], ['requisitores', 'Requisitores'], ['areas', 'Áreas']].map(([k, t]) => (
        <button key={k} onClick={() => { setTab(k); setMsg('') }}
          className={`px-4 py-1.5 rounded text-sm border ${tab === k
            ? 'bg-acero-950 text-white border-acero-950' : 'bg-white border-acero-200 hover:border-acero-600'}`}>
          {t}
        </button>
      ))}
    </div>
  )

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Catálogos</h1>
      <Tabs />
      {msg && <p className="mb-4 text-sm bg-acero-50 border border-acero-200 rounded px-3 py-2 max-w-2xl">{msg}</p>}

      {/* ---------- PROVEEDORES ---------- */}
      {tab === 'proveedores' && (
        <>
          <div className="bg-white rounded-lg border border-acero-200 p-5 mb-5 max-w-3xl">
            <h2 className="font-semibold text-sm mb-3">Nuevo proveedor</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className={lbl}>Nombre / Razón social *</label>
                <input value={formProv.nombre} onChange={e => setFormProv(v => ({ ...v, nombre: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className={lbl}>RFC</label>
                <input value={formProv.rfc} onChange={e => setFormProv(v => ({ ...v, rfc: e.target.value }))} className={inp + ' font-mono'} />
              </div>
              <div>
                <label className={lbl}>Contacto</label>
                <input value={formProv.contacto} onChange={e => setFormProv(v => ({ ...v, contacto: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className={lbl}>Teléfono</label>
                <input value={formProv.telefono} onChange={e => setFormProv(v => ({ ...v, telefono: e.target.value }))} className={inp + ' font-mono'} />
              </div>
              <div>
                <label className={lbl}>Email</label>
                <input value={formProv.email} onChange={e => setFormProv(v => ({ ...v, email: e.target.value }))} className={inp} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <button onClick={guardarProv}
                className="rounded bg-ambar-500 text-acero-950 px-5 py-2 text-sm font-semibold hover:bg-ambar-400">
                Dar de alta
              </button>
              <label className="text-sm text-acero-600 cursor-pointer underline">
                o importar CSV (nombre, rfc, contacto, telefono, email)
                <input type="file" accept=".csv" onChange={importarCSV('proveedores')} className="hidden" />
              </label>
            </div>
          </div>
          <Lista
            filas={proveedores}
            cols={[['nombre', 'Nombre'], ['rfc', 'RFC'], ['contacto', 'Contacto'], ['telefono', 'Teléfono'], ['email', 'Email']]}
            idCol="id_proveedor" tabla="proveedores" onToggle={toggleActivo} />
        </>
      )}

      {/* ---------- REQUISITORES ---------- */}
      {tab === 'requisitores' && (
        <>
          <div className="bg-white rounded-lg border border-acero-200 p-5 mb-5 max-w-3xl">
            <h2 className="font-semibold text-sm mb-3">Nuevo requisitor</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className={lbl}>Nombre *</label>
                <input value={formReq.nombre} onChange={e => setFormReq(v => ({ ...v, nombre: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className={lbl}>Área</label>
                <select value={formReq.id_area} onChange={e => setFormReq(v => ({ ...v, id_area: e.target.value }))}
                  className={inp + ' bg-white'}>
                  <option value="">— Sin área —</option>
                  {areas.filter(a => a.activo).map(a => (
                    <option key={a.id_area} value={a.id_area}>{a.id_area} · {a.nombre_area}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>Email</label>
                <input value={formReq.email} onChange={e => setFormReq(v => ({ ...v, email: e.target.value }))} className={inp} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <button onClick={guardarReq}
                className="rounded bg-ambar-500 text-acero-950 px-5 py-2 text-sm font-semibold hover:bg-ambar-400">
                Dar de alta
              </button>
              <label className="text-sm text-acero-600 cursor-pointer underline">
                o importar CSV (nombre, id_area, email)
                <input type="file" accept=".csv" onChange={importarCSV('requisitores')} className="hidden" />
              </label>
            </div>
          </div>
          <Lista
            filas={requisitores.map(r => ({ ...r, area: nombreArea(r.id_area) }))}
            cols={[['nombre', 'Nombre'], ['area', 'Área'], ['email', 'Email']]}
            idCol="id_requisitor" tabla="requisitores" onToggle={toggleActivo} />
        </>
      )}

      {/* ---------- ÁREAS ---------- */}
      {tab === 'areas' && (
        <>
          <div className="bg-white rounded-lg border border-acero-200 p-5 mb-5 max-w-xl">
            <h2 className="font-semibold text-sm mb-3">Nueva área</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className={lbl}>ID (ej. A21)</label>
                <input value={formArea.id_area} onChange={e => setFormArea(v => ({ ...v, id_area: e.target.value }))}
                  className={inp + ' font-mono'} />
              </div>
              <div className="sm:col-span-2">
                <label className={lbl}>Nombre del área</label>
                <input value={formArea.nombre_area} onChange={e => setFormArea(v => ({ ...v, nombre_area: e.target.value }))} className={inp} />
              </div>
            </div>
            <button onClick={guardarArea}
              className="mt-4 rounded bg-ambar-500 text-acero-950 px-5 py-2 text-sm font-semibold hover:bg-ambar-400">
              Agregar área
            </button>
          </div>
          <Lista
            filas={areas}
            cols={[['id_area', 'ID'], ['nombre_area', 'Nombre']]}
            idCol="id_area" tabla="areas" onToggle={toggleActivo} />
        </>
      )}
    </div>
  )
}

function Lista({ filas, cols, idCol, tabla, onToggle }) {
  return (
    <div className="bg-white rounded-lg border border-acero-200 overflow-x-auto max-w-4xl">
      <table className="w-full text-sm">
        <thead className="bg-acero-50 text-acero-600 text-xs">
          <tr>
            {cols.map(([k, t]) => <th key={k} className="text-left px-4 py-2.5">{t}</th>)}
            <th className="text-center px-4 py-2.5">Activo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-acero-100">
          {filas.length === 0 && (
            <tr><td colSpan={cols.length + 1} className="px-4 py-6 text-center text-acero-600">Sin registros.</td></tr>
          )}
          {filas.map(f => (
            <tr key={f[idCol]} className={f.activo === false ? 'opacity-50' : ''}>
              {cols.map(([k]) => <td key={k} className="px-4 py-2.5">{f[k] ?? '—'}</td>)}
              <td className="px-4 py-2.5 text-center">
                <input type="checkbox" checked={f.activo !== false}
                  onChange={e => onToggle(tabla, idCol, f[idCol], e.target.checked)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
