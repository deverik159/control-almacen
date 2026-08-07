import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const inp = "w-full rounded border border-acero-200 px-3 py-2 text-sm"
const lbl = "block text-xs font-medium text-acero-600 mb-1"

const RAZONES = ['GIVYG', 'GCNS', 'INNOVATION BOX GROUP', 'PROYECTOS URBANOS NUVE', 'URBAN V&M PROPERTIES', 'VIA PRINT']

const badgeEstatus = {
  Pendiente:  'bg-ambar-400/20 text-yellow-800 border-ambar-500/50',
  Completada: 'bg-green-100 text-green-800 border-green-300',
  Rechazada:  'bg-red-100 text-red-800 border-red-300',
}

const formVacio = {
  nombre_producto: '', descripcion: '', razones: [],
  unidad_medida: '', categoria: 'Producto', link_producto: '', ficha: null,
}

export default function Solicitudes() {
  const { session, perfil } = useAuth()
  const esAlmacen = ['Admin', 'Gerente', 'Almacenista'].includes(perfil?.rol)

  const [lista, setLista] = useState([])
  const [unidades, setUnidades] = useState([])
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState(formVacio)
  const [resolver, setResolver] = useState(null)     // solicitud en resolución
  const [resForm, setResForm] = useState({ item: '', desc: '', motivo: '' })
  const [filtro, setFiltro] = useState('Pendiente')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = async () => {
    const [s, u] = await Promise.all([
      supabase.from('solicitudes_alta').select('*').order('fecha_solicitud', { ascending: false }).limit(300),
      supabase.from('unidades_medida').select('nombre').eq('activo', true).order('nombre'),
    ])
    setLista(s.data ?? [])
    setUnidades(u.data ?? [])
  }
  useEffect(() => { cargar() }, [])

  const limpiar = () => { setError(''); setOk('') }
  const set = (c, v) => setForm(f => ({ ...f, [c]: v }))

  // ---- Nueva solicitud (cualquier rol) ----
  const guardar = async () => {
    limpiar()
    if (!form.nombre_producto.trim()) return setError('Indica el nombre del producto.')
    if (form.razones.length === 0) return setError('Selecciona al menos una razón social.')

    setGuardando(true)

    // Ficha técnica opcional
    let fichaUrl = null
    if (form.ficha) {
      if (form.ficha.size > 8 * 1024 * 1024) { setGuardando(false); return setError('La ficha no debe pesar más de 8 MB.') }
      const ext = (form.ficha.name.split('.').pop() || 'pdf').toLowerCase()
      const path = `${Date.now()}_${form.nombre_producto.trim().slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`
      const { error: e1 } = await supabase.storage.from('fichas')
        .upload(path, form.ficha, { contentType: form.ficha.type })
      if (e1) { setGuardando(false); return setError('No se pudo subir la ficha: ' + e1.message) }
      fichaUrl = supabase.storage.from('fichas').getPublicUrl(path).data.publicUrl
    }

    const { error: e } = await supabase.from('solicitudes_alta').insert({
      nombre_producto: form.nombre_producto.trim(),
      descripcion: form.descripcion || null,
      razon_social: form.razones.join(', '),
      unidad_medida: form.unidad_medida || null,
      categoria: form.categoria,
      link_producto: form.link_producto || null,
      ficha_url: fichaUrl,
      solicitante: session.user.id,
      solicitante_email: perfil?.email ?? session.user.email,
    })
    setGuardando(false)
    if (e) return setError('No se pudo crear la solicitud: ' + e.message)
    setOk('Solicitud enviada. Almacén la atenderá y te notificará el alta.')
    setForm(formVacio); setAbierto(false); cargar()
  }

  // ---- Resolver (almacén) ----
  const completar = async () => {
    limpiar()
    if (!resForm.item.trim()) return setError('Indica el Item (ID) con el que quedó en NetSuite.')
    setGuardando(true)
    const { error: e } = await supabase.from('solicitudes_alta').update({
      estatus: 'Completada',
      item_netsuite: resForm.item.trim(),
      descripcion_netsuite: resForm.desc || null,
      resuelto_por: session.user.id,
      fecha_resolucion: new Date().toISOString(),
    }).eq('id', resolver.id)
    setGuardando(false)
    if (e) return setError('No se pudo completar: ' + e.message)
    setOk(`Alta ${resolver.folio} completada. Usa "📧 Notificar" para avisar al solicitante.`)
    setResolver(null); setResForm({ item: '', desc: '', motivo: '' }); cargar()
  }

  const rechazar = async () => {
    limpiar()
    if (!resForm.motivo.trim()) return setError('Indica el motivo del rechazo.')
    setGuardando(true)
    const { error: e } = await supabase.from('solicitudes_alta').update({
      estatus: 'Rechazada',
      motivo_rechazo: resForm.motivo.trim(),
      resuelto_por: session.user.id,
      fecha_resolucion: new Date().toISOString(),
    }).eq('id', resolver.id)
    setGuardando(false)
    if (e) return setError('No se pudo rechazar: ' + e.message)
    setResolver(null); setResForm({ item: '', desc: '', motivo: '' }); cargar()
  }

  // ---- Correo prellenado con la plantilla ----
  const mailto = (s) => {
    const asunto = `Alta de ${s.categoria} — Folio ${s.folio}`
    const cuerpo = [
      'Hola buen día,',
      '',
      'Te confirmo el alta del producto:',
      `ID: ${s.item_netsuite ?? ''}`,
      `Descripción: ${s.descripcion_netsuite ?? s.nombre_producto}`,
      '',
      'Favor de revisar con contabilidad para su liberación.',
      '',
      'Saludos,',
      'Control de Almacén',
    ].join('\n')
    return `mailto:${s.solicitante_email ?? ''}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
  }

  const visibles = lista.filter(s => filtro === 'Todas' || s.estatus === filtro)
  const pendientes = lista.filter(s => s.estatus === 'Pendiente').length

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold">
          Solicitudes de alta
          {pendientes > 0 && <span className="ml-2 text-sm font-mono bg-ambar-400/20 border border-ambar-500/50 text-yellow-800 rounded px-2 py-0.5">{pendientes} pendientes</span>}
        </h1>
        <button onClick={() => { setAbierto(a => !a); limpiar() }}
          className="rounded bg-acero-950 text-white px-4 py-2 text-sm font-medium hover:bg-acero-800">
          {abierto ? 'Cancelar' : '+ Solicitar alta de producto'}
        </button>
      </div>

      {ok && <p className="mb-4 text-sm text-green-800 bg-green-50 border border-green-200 rounded px-3 py-2">{ok}</p>}

      {/* ---- Form nueva solicitud ---- */}
      {abierto && (
        <div className="bg-white rounded-lg border border-acero-200 p-5 mb-6 max-w-2xl">
          <h2 className="font-semibold text-sm mb-4">Nueva solicitud</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={lbl}>Nombre del producto *</label>
              <input value={form.nombre_producto} onChange={e => set('nombre_producto', e.target.value)} className={inp} />
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>Descripción</label>
              <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
                rows={2} className={inp} />
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>Razón social (una o varias)</label>
              <div className="flex flex-wrap gap-2">
                {RAZONES.map(r => {
                  const sel = form.razones.includes(r)
                  return (
                    <button key={r} type="button"
                      onClick={() => set('razones', sel ? form.razones.filter(x => x !== r) : [...form.razones, r])}
                      className={`px-3 py-1.5 rounded text-xs border font-medium ${sel
                        ? 'bg-acero-950 text-white border-acero-950'
                        : 'bg-white border-acero-200 hover:border-acero-600'}`}>
                      {sel ? '✓ ' : ''}{r}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className={lbl}>Categoría</label>
              <div className="flex gap-2">
                {['Producto', 'Servicio'].map(c => (
                  <button key={c} type="button" onClick={() => set('categoria', c)}
                    className={`px-4 py-1.5 rounded text-sm border ${form.categoria === c
                      ? 'bg-acero-950 text-white border-acero-950' : 'bg-white border-acero-200'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={lbl}>Unidad de medida</label>
              <input list="dl-um-sol" value={form.unidad_medida}
                onChange={e => set('unidad_medida', e.target.value)} className={inp} />
              <datalist id="dl-um-sol">
                {unidades.map(u => <option key={u.nombre} value={u.nombre} />)}
              </datalist>
            </div>
            <div>
              <label className={lbl}>Link del producto</label>
              <input value={form.link_producto} placeholder="https://…"
                onChange={e => set('link_producto', e.target.value)} className={inp} />
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>Ficha técnica (PDF o imagen, opcional)</label>
              <input type="file" accept=".pdf,image/*"
                onChange={e => set('ficha', e.target.files[0] ?? null)}
                className="text-sm file:mr-3 file:rounded file:border-0 file:bg-acero-950 file:text-white file:px-4 file:py-2 file:text-sm file:cursor-pointer" />
            </div>
          </div>
          {error && <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <button onClick={guardar} disabled={guardando}
            className="mt-4 rounded bg-ambar-500 text-acero-950 px-5 py-2 text-sm font-semibold hover:bg-ambar-400 disabled:opacity-50">
            {guardando ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </div>
      )}

      {/* ---- Modal resolver ---- */}
      {resolver && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-5 w-full max-w-md">
            <h2 className="font-semibold mb-1">Resolver solicitud <span className="font-mono">{resolver.folio}</span></h2>
            <p className="text-sm text-acero-600 mb-4">{resolver.nombre_producto} · {resolver.razon_social}</p>
            <div className="space-y-3">
              <div>
                <label className={lbl}>Item (ID en NetSuite)</label>
                <input value={resForm.item} onChange={e => setResForm(v => ({ ...v, item: e.target.value }))}
                  className={inp + ' font-mono'} autoFocus />
              </div>
              <div>
                <label className={lbl}>Descripción en NetSuite</label>
                <input value={resForm.desc} onChange={e => setResForm(v => ({ ...v, desc: e.target.value }))}
                  className={inp} />
              </div>
              <div className="border-t border-acero-100 pt-3">
                <label className={lbl}>O motivo de rechazo</label>
                <input value={resForm.motivo} placeholder="Duplicado, falta información…"
                  onChange={e => setResForm(v => ({ ...v, motivo: e.target.value }))} className={inp} />
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={completar} disabled={guardando}
                className="flex-1 rounded bg-ambar-500 text-acero-950 py-2 text-sm font-semibold hover:bg-ambar-400 disabled:opacity-50">
                ✅ Completar alta
              </button>
              <button onClick={rechazar} disabled={guardando}
                className="rounded border border-red-300 text-red-700 px-3 py-2 text-sm hover:bg-red-50 disabled:opacity-50">
                Rechazar
              </button>
              <button onClick={() => { setResolver(null); limpiar() }}
                className="rounded border border-acero-200 px-3 py-2 text-sm hover:bg-acero-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Filtros y lista ---- */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['Pendiente', 'Completada', 'Rechazada', 'Todas'].map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 rounded text-sm border ${filtro === f
              ? 'bg-acero-950 text-white border-acero-950' : 'bg-white border-acero-200 hover:border-acero-600'}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-acero-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-acero-50 text-acero-600 text-xs">
            <tr>
              <th className="text-left px-3 py-2.5">Folio</th>
              <th className="text-left px-3 py-2.5">Fecha</th>
              <th className="text-left px-3 py-2.5">Producto</th>
              <th className="text-left px-3 py-2.5">Razón social</th>
              <th className="text-left px-3 py-2.5">Cat.</th>
              <th className="text-left px-3 py-2.5">Solicitante</th>
              <th className="text-left px-3 py-2.5">Item NetSuite</th>
              <th className="text-left px-3 py-2.5">Estatus</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-acero-100">
            {visibles.length === 0 && (
              <tr><td colSpan="9" className="px-4 py-6 text-center text-acero-600">Sin solicitudes en este filtro.</td></tr>
            )}
            {visibles.map(s => (
              <tr key={s.id}>
                <td className="px-3 py-2.5 font-mono text-xs font-semibold">{s.folio}</td>
                <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">
                  {new Date(s.fecha_solicitud).toLocaleDateString('es-MX')}
                </td>
                <td className="px-3 py-2.5 max-w-52">
                  <div className="truncate font-medium">{s.nombre_producto}</div>
                  <div className="text-xs text-acero-600 truncate">{s.descripcion}</div>
                  <div className="flex gap-2 text-[11px]">
                    {s.ficha_url && <a href={s.ficha_url} target="_blank" rel="noreferrer" className="underline text-acero-600">📎 Ficha</a>}
                    {s.link_producto && <a href={s.link_producto} target="_blank" rel="noreferrer" className="underline text-acero-600">🔗 Link</a>}
                  </div>
                  {s.estatus === 'Rechazada' && s.motivo_rechazo && (
                    <div className="text-[11px] text-red-700 mt-0.5">Motivo: {s.motivo_rechazo}</div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs">{s.razon_social}</td>
                <td className="px-3 py-2.5 text-xs">{s.categoria}</td>
                <td className="px-3 py-2.5 text-xs">{s.solicitante_email ?? '—'}</td>
                <td className="px-3 py-2.5 font-mono text-xs">
                  {s.item_netsuite ?? '—'}
                  {s.descripcion_netsuite && <div className="text-acero-600 truncate max-w-36">{s.descripcion_netsuite}</div>}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block rounded border px-2 py-0.5 text-xs font-mono ${badgeEstatus[s.estatus]}`}>
                    {s.estatus}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {esAlmacen && s.estatus === 'Pendiente' && (
                    <button onClick={() => { setResolver(s); setResForm({ item: '', desc: s.nombre_producto, motivo: '' }); limpiar() }}
                      className="rounded bg-acero-950 text-white px-3 py-1.5 text-xs font-medium hover:bg-acero-800">
                      Resolver
                    </button>
                  )}
                  {esAlmacen && s.estatus === 'Completada' && (
                    <a href={mailto(s)}
                      className="rounded border border-acero-300 px-3 py-1.5 text-xs font-medium hover:bg-acero-100 inline-block">
                      📧 Notificar
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
