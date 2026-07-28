import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, PieChart, Pie, Cell,
} from 'recharts'

const DIAS_GRAFICA = 14

export default function Home() {
  const { perfil } = useAuth()
  const [bajos, setBajos] = useState([])
  const [pendientes, setPendientes] = useState([])
  const [serie, setSerie] = useState([])       // movimientos por día
  const [alertas, setAlertas] = useState([])   // distribución del semáforo
  const [topSalidas, setTopSalidas] = useState([])
  const [muertos, setMuertos] = useState([])

  useEffect(() => {
    const desde = new Date()
    desde.setDate(desde.getDate() - DIAS_GRAFICA)
    const desdeISO = desde.toISOString()

    Promise.all([
      supabase.from('vw_stock').select('id_item, nombre, stock_calculado, stock_minimo, alerta_stock'),
      supabase.from('vw_stock')
        .select('id_item, nombre, stock_calculado, dias_sin_movimiento')
        .gt('stock_calculado', 0).gte('dias_sin_movimiento', 90)
        .order('dias_sin_movimiento', { ascending: false }).limit(8),
      supabase.from('vw_pos').select('id_po, po, articulo, pendiente')
        .eq('estatus', 'Parcial').gt('pendiente', 0).limit(8),
      supabase.from('entradas').select('fecha_entrada, cantidad_recepcion').gte('fecha_entrada', desdeISO),
      supabase.from('salidas').select('fecha_salida, cantidad, id_item').gte('fecha_salida', desdeISO),
      supabase.from('devoluciones').select('fecha_devolucion, cantidad').gte('fecha_devolucion', desdeISO),
    ]).then(([stock, mtos, pos, ent, sal, dev]) => {
      setMuertos(mtos.data ?? [])
      const s = stock.data ?? []
      setBajos(s.filter(i => i.alerta_stock === '🔴 Stock Bajo').slice(0, 8))
      setPendientes(pos.data ?? [])

      // Distribución del semáforo
      const conteo = { '🔴 Stock Bajo': 0, '🟡 Stock Medio': 0, '🟢 Stock OK': 0 }
      s.forEach(i => { conteo[i.alerta_stock] = (conteo[i.alerta_stock] ?? 0) + 1 })
      setAlertas([
        { name: 'Bajo',  value: conteo['🔴 Stock Bajo'],  color: '#dc2626' },
        { name: 'Medio', value: conteo['🟡 Stock Medio'], color: '#f5b301' },
        { name: 'OK',    value: conteo['🟢 Stock OK'],    color: '#16a34a' },
      ].filter(x => x.value > 0))

      // Serie diaria: entradas (+devoluciones) vs salidas
      const dias = {}
      for (let i = DIAS_GRAFICA - 1; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i)
        const k = d.toISOString().slice(0, 10)
        dias[k] = { dia: d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }), Entradas: 0, Salidas: 0 }
      }
      ;(ent.data ?? []).forEach(e => {
        const k = e.fecha_entrada.slice(0, 10)
        if (dias[k]) dias[k].Entradas += Number(e.cantidad_recepcion)
      })
      ;(dev.data ?? []).forEach(d => {
        const k = d.fecha_devolucion.slice(0, 10)
        if (dias[k]) dias[k].Entradas += Number(d.cantidad)
      })
      ;(sal.data ?? []).forEach(x => {
        const k = x.fecha_salida.slice(0, 10)
        if (dias[k]) dias[k].Salidas += Number(x.cantidad)
      })
      setSerie(Object.values(dias))

      // Top 5 artículos con más salidas
      const porItem = {}
      ;(sal.data ?? []).forEach(x => { porItem[x.id_item] = (porItem[x.id_item] ?? 0) + Number(x.cantidad) })
      const nombres = Object.fromEntries(s.map(i => [i.id_item, i.nombre]))
      setTopSalidas(
        Object.entries(porItem)
          .sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([id, cant]) => ({ nombre: nombres[id] ?? id, Salidas: cant }))
      )
    })
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Hola, {perfil?.nombre?.split(' ')[0]}</h1>
      <p className="text-acero-600 text-sm mb-6">Estado del almacén al día de hoy.</p>

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        {/* Movimientos por día */}
        <section className="bg-white rounded-lg border border-acero-200 p-4">
          <h2 className="font-semibold text-sm mb-3">Movimientos — últimos {DIAS_GRAFICA} días</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={serie} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9ebee" />
              <XAxis dataKey="dia" tick={{ fontSize: 10 }} interval={1} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Entradas" fill="#16a34a" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Salidas" fill="#dc2626" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        {/* Semáforo del inventario */}
        <section className="bg-white rounded-lg border border-acero-200 p-4">
          <h2 className="font-semibold text-sm mb-3">Salud del inventario</h2>
          {alertas.length === 0
            ? <p className="text-sm text-acero-600 py-8 text-center">Sin artículos aún. Importa o registra tu primera recepción.</p>
            : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={alertas} dataKey="value" nameKey="name"
                    innerRadius={55} outerRadius={85} paddingAngle={2}>
                    {alertas.map(a => <Cell key={a.name} fill={a.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Top salidas */}
        <section className="bg-white rounded-lg border border-acero-200 p-4">
          <h2 className="font-semibold text-sm mb-3">Top 5 — más salidas ({DIAS_GRAFICA} días)</h2>
          {topSalidas.length === 0
            ? <p className="text-sm text-acero-600">Sin salidas en el periodo.</p>
            : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={topSalidas} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="nombre" width={110} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="Salidas" fill="#f5b301" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
        </section>

        {/* Stock bajo */}
        <section className="bg-white rounded-lg border border-acero-200">
          <header className="px-4 py-3 border-b border-acero-100 flex justify-between items-center">
            <h2 className="font-semibold text-sm">🔴 Stock bajo</h2>
            <Link to="/inventario" className="text-xs underline text-acero-600">Inventario</Link>
          </header>
          {bajos.length === 0
            ? <p className="p-4 text-sm text-acero-600">Sin alertas.</p>
            : <ul className="divide-y divide-acero-100">
                {bajos.map(i => (
                  <li key={i.id_item} className="px-4 py-2.5 flex justify-between text-sm gap-2">
                    <span className="truncate">{i.nombre}</span>
                    <span className="font-mono whitespace-nowrap">{i.stock_calculado} / mín {i.stock_minimo}</span>
                  </li>
                ))}
              </ul>}
        </section>

        {/* Inventario muerto */}
        <section className="bg-white rounded-lg border border-acero-200">
          <header className="px-4 py-3 border-b border-acero-100 flex justify-between items-center">
            <h2 className="font-semibold text-sm">🕸 Inventario muerto (90+ días)</h2>
            <Link to="/inventario" className="text-xs underline text-acero-600">Inventario</Link>
          </header>
          {muertos.length === 0
            ? <p className="p-4 text-sm text-acero-600">Sin artículos estancados. Todo se mueve. 💪</p>
            : <ul className="divide-y divide-acero-100">
                {muertos.map(i => (
                  <li key={i.id_item} className="px-4 py-2.5 flex justify-between text-sm gap-2">
                    <span className="truncate">{i.nombre}</span>
                    <span className="font-mono whitespace-nowrap text-red-700">{i.dias_sin_movimiento} d · stock {i.stock_calculado}</span>
                  </li>
                ))}
              </ul>}
        </section>

        {/* POs pendientes */}
        <section className="bg-white rounded-lg border border-acero-200">
          <header className="px-4 py-3 border-b border-acero-100 flex justify-between items-center">
            <h2 className="font-semibold text-sm">📦 POs pendientes</h2>
            <Link to="/recepciones" className="text-xs underline text-acero-600">Recepciones</Link>
          </header>
          {pendientes.length === 0
            ? <p className="p-4 text-sm text-acero-600">Sin POs parciales.</p>
            : <ul className="divide-y divide-acero-100">
                {pendientes.map(p => (
                  <li key={p.id_po} className="px-4 py-2.5 flex justify-between text-sm gap-2">
                    <span className="truncate"><b className="font-mono">{p.po}</b> · {p.articulo}</span>
                    <span className="font-mono whitespace-nowrap">faltan {p.pendiente}</span>
                  </li>
                ))}
              </ul>}
        </section>
      </div>
    </div>
  )
}
