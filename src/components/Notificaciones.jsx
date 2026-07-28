import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

let idSeq = 0

const estiloToast = {
  entrada:    'border-green-300 bg-green-50 text-green-900',
  salida:     'border-red-300 bg-red-50 text-red-900',
  devolucion: 'border-blue-300 bg-blue-50 text-blue-900',
  po:         'border-ambar-500/60 bg-ambar-400/15 text-yellow-900',
  alerta:     'border-red-400 bg-red-100 text-red-900 font-medium',
}

const fmtHora = (f) => {
  const d = new Date(f)
  const hoy = new Date().toDateString() === d.toDateString()
  return hoy
    ? d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) + ' ' +
      d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

export default function Notificaciones() {
  const { perfil } = useAuth()
  const navigate = useNavigate()
  const [toasts, setToasts] = useState([])
  const [lista, setLista] = useState([])
  const [abierto, setAbierto] = useState(false)
  const [visto, setVisto] = useState(null)
  const panelRef = useRef(null)

  // Carga inicial: historial + marca de visto
  useEffect(() => {
    if (!perfil) return
    Promise.all([
      supabase.from('notificaciones').select('*')
        .order('fecha', { ascending: false }).limit(40),
      supabase.from('usuarios').select('notif_visto')
        .eq('email', perfil.email).single(),
    ]).then(([n, u]) => {
      setLista(n.data ?? [])
      setVisto(u.data?.notif_visto ?? new Date().toISOString())
    })
  }, [perfil])

  // Suscripción en tiempo real
  useEffect(() => {
    if (!perfil) return
    const push = (n) => {
      if (!perfil.push_notify) return
      const id = ++idSeq
      setToasts(t => [...t.slice(-4), { id, ...n }])
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 8000)
    }
    const canal = supabase.channel('notifs-centro')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, p => {
        setLista(l => [p.new, ...l].slice(0, 40))
        push(p.new)
      })
      .subscribe((status) => console.log('[Notificaciones] estado:', status))
    return () => { supabase.removeChannel(canal) }
  }, [perfil])

  // Cerrar el panel al hacer clic fuera
  useEffect(() => {
    const fn = (e) => {
      if (abierto && panelRef.current && !panelRef.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [abierto])

  const noLeidas = visto ? lista.filter(n => n.fecha > visto).length : 0

  const abrirPanel = async () => {
    const nuevo = !abierto
    setAbierto(nuevo)
    if (nuevo && noLeidas > 0) {
      await supabase.rpc('marcar_notif_visto')
      setVisto(new Date().toISOString())
    }
  }

  const irA = (n) => {
    setAbierto(false)
    if (n.ruta) navigate(n.ruta)
  }

  if (!perfil) return null

  return (
    <>
      {/* Campanita */}
      <div ref={panelRef} className="fixed top-3 right-3 z-[90]">
        <button onClick={abrirPanel}
          className="relative rounded-full bg-acero-950 text-white w-11 h-11 grid place-items-center shadow-lg hover:bg-acero-800"
          title="Notificaciones">
          <span className="text-lg">🔔</span>
          {noLeidas > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] grid place-items-center px-1">
              {noLeidas > 9 ? '9+' : noLeidas}
            </span>
          )}
        </button>

        {/* Panel */}
        {abierto && (
          <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-1.5rem)] bg-white rounded-lg border border-acero-200 shadow-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-acero-100 flex justify-between items-center">
              <span className="font-semibold text-sm">Notificaciones</span>
              <button onClick={() => setAbierto(false)} className="text-acero-600 hover:text-acero-900 text-sm">✕</button>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-acero-100">
              {lista.length === 0 && (
                <p className="p-4 text-sm text-acero-600 text-center">Sin notificaciones aún.</p>
              )}
              {lista.map(n => (
                <button key={n.id} onClick={() => irA(n)}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-acero-50 flex flex-col gap-0.5 ${
                    visto && n.fecha > visto ? 'bg-ambar-400/10' : ''}`}>
                  <span>{n.texto}</span>
                  <span className="text-[11px] text-acero-600 font-mono">{fmtHora(n.fecha)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="fixed top-16 right-3 z-[100] space-y-2 w-80 max-w-[calc(100vw-1.5rem)]">
          {toasts.map(t => (
            <div key={t.id}
              className={`rounded-lg border shadow-lg px-4 py-3 text-sm flex items-start gap-2 cursor-pointer ${estiloToast[t.tipo] ?? 'border-acero-200 bg-white'}`}
              onClick={() => { irA(t); setToasts(x => x.filter(y => y.id !== t.id)) }}>
              <span className="flex-1">{t.texto}</span>
              <button onClick={e => { e.stopPropagation(); setToasts(x => x.filter(y => y.id !== t.id)) }}
                className="opacity-50 hover:opacity-100 leading-none">✕</button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
