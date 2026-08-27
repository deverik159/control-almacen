import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { parseCSV, normalizarHeader, parseMonto, parseFechaDMA, leerArchivoTexto } from '../lib/csv'

const MOTIVOS_ESPECIALES = {
  SIN_PO: 'Entrada legítima que no tiene orden de compra: compra directa, urgencia, caja chica.',
  AJUSTE: 'Corrección de inventario: conteo físico, merma o diferencia encontrada.',
  EXCEPCIONAL: 'Fuera de proceso: garantía repuesta por proveedor, donación, material regresado.',
}

const poVacia = {
  po: '', fecha_po: new Date().toISOString().slice(0, 10),
  tipo_articulo: 'Existente', id_item: '', nombre_nuevo: '',
  stock_minimo: 1, um: '', requisitor: '', proveedor: '',
  area_asignada: '', cantidad_po: '', pu: '', ir: '', observaciones: '',
  cantidad_recepcion: '', factura_remision: '',
}
const espVacia = {
  tipo_articulo: 'Existente', id_item: '', nombre_nuevo: '', stock_minimo: 1,
  unidad_medida: '', po_codigo: 'SIN_PO', cantidad: '', proveedor: '', area_asignada: '',
}
const recepVacia = { cantidad: '', factura_remision: '', ir: '', observaciones: '', fecha: new Date().toISOString().slice(0, 10) }

const money = (n) => n == null ? '—' :
  Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const inp = "w-full rounded border border-acero-200 px-3 py-2 text-sm"
const lbl = "block text-xs font-medium text-acero-600 mb-1"

const fmtFecha = (v) => {
  if (!v) return '—'
  const d = new Date(String(v).slice(0, 10) + 'T12:00')
  return isNaN(d) ? '—' : d.toLocaleDateString('es-MX')
}

function SelectorArticulo({ f, setF, items }) {
  return (
    <>
      <div className="sm:col-span-2">
        <label className={lbl}>Tipo de artículo</label>
        <div className="flex gap-2">
          {['Existente', 'Nuevo'].map(t => (
            <button key={t} type="button" onClick={() => setF(v => ({ ...v, tipo_articulo: t }))}
              className={`px-4 py-1.5 rounded text-sm border ${f.tipo_articulo === t
                ? 'bg-acero-950 text-white border-acero-950' : 'bg-white border-acero-200'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {f.tipo_articulo === 'Existente' ? (
        <div className="sm:col-span-2">
          <label className={lbl}>Artículo</label>
          <select value={f.id_item}
            onChange={e => {
              const it = items.find(x => x.id_item === e.target.value)
              setF(v => ({ ...v, id_item: e.target.value, um: it?.unidad_medida ?? v.um ?? '' }))
            }}
            className={inp + ' bg-white'}>
            <option value="">— Selecciona —</option>
            {items.map(i => <option key={i.id_item} value={i.id_item}>{i.id_item} · {i.nombre}</option>)}
          </select>
        </div>
      ) : (
        <>
          <div>
            <label className={lbl}>Código nuevo (ID_Item)</label>
            <input value={f.id_item} onChange={e => setF(v => ({ ...v, id_item: e.target.value }))}
              className={inp + ' font-mono'} />
          </div>
          <div>
            <label className={lbl}>Nombre / Descripción</label>
            <input value={f.nombre_nuevo} onChange={e => setF(v => ({ ...v, nombre_nuevo: e.target.value }))}
              className={inp} />
          </div>
        </>
      )}
    </>
  )
}

export default function Recepciones() {
  const { session, perfil } = useAuth()
  const puedeCapturar = ['Admin', 'Gerente', 'Almacenista'].includes(perfil?.rol)
  const puedeCorregir = ['Admin', 'Gerente'].includes(perfil?.rol)
  const esAdmin = perfil?.rol === 'Admin'

  const [pos, setPos] = useState([])
  const [items, setItems] = useState([])
  const [areas, setAreas] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [requisitores, setRequisitores] = useState([])
  const [unidades, setUnidades] = useState([])
  const [editar, setEditar] = useState(null)   // PO en edición (solo Admin)
  const [panel, setPanel] = useState(null)        // 'po' | 'especial' | 'importar' | null
  const [recibir, setRecibir] = useState(null)
  const [formRecep, setFormRecep] = useState(recepVacia)
  const [formPO, setFormPO] = useState(poVacia)
  const [formEsp, setFormEsp] = useState(espVacia)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [soloPendientes, setSoloPendientes] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [detalle, setDetalle] = useState(null)
  const [historial, setHistorial] = useState(null)   // recepciones de la PO en detalle
  const [listasDoc, setListasDoc] = useState(null)    // IRs y facturas acumuladas de la PO
  const [editHist, setEditHist] = useState(null)     // recepción del historial en corrección
  // Importación
  const [previewPOs, setPreviewPOs] = useState([])
  const [previewParciales, setPreviewParciales] = useState([])
  const [avisosImport, setAvisosImport] = useState([])
  const [importando, setImportando] = useState(false)

  const cargar = async () => {
    const [p, m, a, pr, rq, um] = await Promise.all([
      supabase.from('vw_pos').select('*').order('fecha_po', { ascending: false }).limit(500),
      supabase.from('materiales_herramientas').select('id_item, nombre, unidad_medida').order('nombre'),
      supabase.from('areas').select('*').eq('activo', true).order('id_area'),
      supabase.from('proveedores').select('nombre').eq('activo', true).order('nombre'),
      supabase.from('requisitores').select('nombre').eq('activo', true).order('nombre'),
      supabase.from('unidades_medida').select('nombre').eq('activo', true).order('nombre'),
    ])
    setPos(p.data ?? [])
    setItems(m.data ?? [])
    setAreas(a.data ?? [])
    setProveedores(pr.data ?? [])
    setRequisitores(rq.data ?? [])
    setUnidades(um.data ?? [])
  }
  useEffect(() => { cargar() }, [])

  const limpiar = () => { setError(''); setOk('') }
  const nombreArea = (id) => areas.find(a => a.id_area === id)?.nombre_area ?? id ?? '—'
  const existeItem = (codigo) => items.some(i => i.id_item === String(codigo).trim())

  const altaSiEsNuevo = async (f) => {
    if (f.tipo_articulo !== 'Nuevo') return null
    if (existeItem(f.id_item))
      return 'Ese código ya existe en inventario. Selecciona Existente.'
    if (!f.nombre_nuevo.trim()) return 'Indica el nombre del artículo nuevo.'
    const { error: e } = await supabase.from('materiales_herramientas').insert({
      id_item: f.id_item.trim(),
      nombre: f.nombre_nuevo.trim(),
      stock_inicial: 0,
      stock_minimo: Number(f.stock_minimo) || 1,   // default 1; editable después en Inventario/Importar
      unidad_medida: f.um || f.unidad_medida || null,
      id_area: f.area_asignada || null,
    })
    return e ? 'No se pudo dar de alta el artículo: ' + e.message : null
  }

  // ---- Nueva PO ----
  const guardarPO = async () => {
    limpiar()
    const f = formPO
    if (!f.po.trim()) return setError('Indica el número de PO.')
    if (!f.id_item.trim()) return setError('Indica el artículo.')
    if (f.tipo_articulo === 'Existente' && !existeItem(f.id_item))
      return setError('Ese código no existe. Selecciona Nuevo para darlo de alta.')
    const cant = Number(f.cantidad_po)
    if (!cant || cant <= 0) return setError('La cantidad de la PO debe ser mayor a cero.')

    const recibidaAhora = Number(f.cantidad_recepcion) || 0
    if (recibidaAhora < 0) return setError('La cantidad recibida no puede ser negativa.')
    if (recibidaAhora > cant)
      return setError('La cantidad recibida (' + recibidaAhora + ') no puede ser mayor a la cantidad de la PO (' + cant + ').')

    setGuardando(true)
    const errAlta = await altaSiEsNuevo(f)
    if (errAlta) { setGuardando(false); return setError(errAlta) }

    const { data: poCreada, error: e } = await supabase.from('pos').insert({
      po: f.po.trim(),
      fecha_po: f.fecha_po || null,
      id_item: f.id_item.trim(),
      articulo: f.tipo_articulo === 'Nuevo'
        ? f.nombre_nuevo.trim()
        : items.find(i => i.id_item === f.id_item)?.nombre,
      um: f.um || items.find(i => i.id_item === f.id_item)?.unidad_medida || null,
      requisitor: f.requisitor || null,
      proveedor: f.proveedor || null,
      area_asignada: f.area_asignada || null,
      cantidad_po: cant,
      pu: parseMonto(f.pu),
      ir: f.ir || null,
      observaciones: f.observaciones || null,
      creado_por: session.user.id,
    }).select('id_po, po').single()
    if (e) { setGuardando(false); return setError('No se pudo crear la PO: ' + e.message) }

    // Primera recepción capturada en el mismo form (afecta stock y estatus)
    if (recibidaAhora > 0) {
      const { error: e2 } = await supabase.from('entradas').insert({
        id_item: f.id_item.trim(),
        id_po: poCreada.id_po,
        po_codigo: poCreada.po,
        tipo_articulo: 'Existente',
        cantidad_recepcion: recibidaAhora,
        proveedor: f.proveedor || null,
        area_asignada: f.area_asignada || null,
        factura_remision: f.factura_remision || null,
        ir: f.ir || null,
        usuario: session.user.id,
      })
      if (e2) { setGuardando(false); return setError('PO creada, pero falló la recepción inicial: ' + e2.message + '. Regístrala con el botón Recibir.') }
    }

    setGuardando(false)
    setOk(recibidaAhora > 0
      ? (recibidaAhora >= cant
          ? 'PO creada y recibida completa.'
          : 'PO creada como Parcial: recibiste ' + recibidaAhora + ' de ' + cant + ', faltan ' + (cant - recibidaAhora) + '.')
      : 'PO creada. Ya puedes recibir contra ella.')
    setFormPO(poVacia); setPanel(null); cargar()
  }

  // ---- Recibir contra PO ----
  const guardarRecepcion = async () => {
    limpiar()
    const cant = Number(formRecep.cantidad)
    if (!cant || cant <= 0) return setError('La cantidad debe ser mayor a cero.')
    if (cant > recibir.pendiente)
      return setError('No puedes recibir más de lo pendiente (' + recibir.pendiente + ').')

    setGuardando(true)
    const { error: e } = await supabase.from('entradas').insert({
      id_item: recibir.id_item,
      id_po: recibir.id_po,
      po_codigo: recibir.po,
      tipo_articulo: 'Existente',
      cantidad_recepcion: cant,
      proveedor: recibir.proveedor,
      area_asignada: recibir.area_asignada,
      factura_remision: formRecep.factura_remision || null,
      ir: formRecep.ir || null,
      observaciones: formRecep.observaciones || null,
      usuario: session.user.id,
      fecha_entrada: formRecep.fecha ? new Date(formRecep.fecha + 'T12:00').toISOString() : undefined,
    })
    setGuardando(false)
    if (e) return setError('No se pudo registrar la recepción: ' + e.message)
    setOk('Recepción registrada.')
    setRecibir(null); setFormRecep(recepVacia); cargar()
  }

  // ---- Editar PO (solo Admin) ----
  const guardarEdicion = async () => {
    limpiar()
    const f = editar
    const cant = Number(f.cantidad_po)
    if (!f.po.trim()) return setError('Indica el número de PO.')
    if (!cant || cant <= 0) return setError('La cantidad debe ser mayor a cero.')
    if (cant < f.total_recibido)
      return setError('La cantidad no puede ser menor a lo ya recibido (' + f.total_recibido + ').')

    setGuardando(true)
    const { error: e } = await supabase.from('pos').update({
      po: f.po.trim(),
      fecha_po: f.fecha_po ? String(f.fecha_po).slice(0, 10) : null,
      articulo: f.articulo || null,
      um: f.um || null,
      requisitor: f.requisitor || null,
      proveedor: f.proveedor || null,
      area_asignada: f.area_asignada || null,
      cantidad_po: cant,
      pu: parseMonto(f.pu),
      ir: f.ir || null,
      factura_remision: f.factura_remision || null,
      observaciones: f.observaciones || null,
      estatus: f.total_recibido >= cant ? 'Completo' : 'Parcial',
    }).eq('id_po', f.id_po)
    setGuardando(false)
    if (e) return setError('No se pudo actualizar la PO: ' + e.message)
    setOk('PO actualizada.')
    setEditar(null); cargar()
  }

  // ---- Recepción especial ----
  const guardarEspecial = async () => {
    limpiar()
    const f = formEsp
    const cant = Number(f.cantidad)
    if (!f.id_item.trim()) return setError('Indica el artículo.')
    if (f.tipo_articulo === 'Existente' && !existeItem(f.id_item))
      return setError('Ese código no existe. Selecciona Nuevo para darlo de alta.')
    if (!cant || cant <= 0) return setError('La cantidad debe ser mayor a cero.')

    setGuardando(true)
    const errAlta = await altaSiEsNuevo(f)
    if (errAlta) { setGuardando(false); return setError(errAlta) }

    const { error: e } = await supabase.from('entradas').insert({
      id_item: f.id_item.trim(),
      po_codigo: f.po_codigo,
      tipo_articulo: f.tipo_articulo,
      cantidad_recepcion: cant,
      proveedor: f.proveedor || null,
      area_asignada: f.area_asignada || null,
      usuario: session.user.id,
    })
    setGuardando(false)
    if (e) return setError('No se pudo registrar: ' + e.message)
    setOk('Recepción especial registrada.')
    setFormEsp(espVacia); setPanel(null); cargar()
  }

  // ---- Importación de POs (CSV de AppSheet) ----
  const leerCSVPOs = (e) => {
    limpiar(); setPreviewPOs([]); setPreviewParciales([]); setAvisosImport([])
    const archivo = e.target.files[0]
    if (!archivo) return
    leerArchivoTexto(archivo).then((texto) => {
      const filas = parseCSV(texto)
      if (filas.length < 2) return setAvisosImport(['El archivo está vacío o solo tiene encabezados.'])

      const h = filas[0].map(normalizarHeader)
      const col = (nombre) => h.indexOf(nombre)
      const modoSinIdPo = col('id_po') < 0 && col('po') >= 0
      const idx = {
        legacy: col('id_po'), fecha: col('fecha_recepcion'), po: col('po'),
        area: col('area'), requisitor: col('requisitor'), id_item: col('id_item'),
        desc: col('descripcion'), um: col('um'), cant_po: col('cantidad_po'),
        cant_rec: col('cantidad_recepcion'), pu: col('pu'), estatus: col('estatus'),
        factura: col('factura_y_o_remision'), proveedor: col('proveedor'),
        obs: col('observaciones'), ir: col('ir'), origen: col('id_po_origen'),
      }
      if (idx.po < 0 || idx.id_item < 0 || idx.cant_po < 0)
        return setAvisosImport(['El CSV debe incluir al menos: PO, ID_Item y Cantidad PO. Encontré: ' + h.join(', ')])

      const avisos = []
      const v = (f, i) => i >= 0 ? String(f[i] ?? '').trim() : ''
      const registros = filas.slice(1).map((f, n) => {
        const cantPO = parseMonto(v(f, idx.cant_po))
        const recibido = parseMonto(v(f, idx.cant_rec))
        const r = {
          id_po_legacy: (v(f, idx.legacy) || (modoSinIdPo ? (v(f, idx.po) + '::' + v(f, idx.item)) : '')) || null,
          po: v(f, idx.po),
          fecha_po: parseFechaDMA(v(f, idx.fecha)),
          id_item: v(f, idx.id_item),
          articulo: v(f, idx.desc) || null,
          um: v(f, idx.um) || null,
          area_asignada: v(f, idx.area) || null,
          requisitor: v(f, idx.requisitor) || null,
          cantidad_po: cantPO,
          recibido_historico: 0,   // el recibido se importa como recepciones reales (historial)
          _recepcion: Math.min(recibido, cantPO),
          pu: parseMonto(v(f, idx.pu)),
          estatus: ['Completo', 'Parcial'].includes(v(f, idx.estatus))
            ? v(f, idx.estatus)
            : (recibido >= cantPO ? 'Completo' : 'Parcial'),
          factura_remision: v(f, idx.factura) || null,
          proveedor: v(f, idx.proveedor) || null,
          observaciones: v(f, idx.obs) || null,
          ir: v(f, idx.ir) || null,
        }
        if (!r.po) avisos.push(`Fila ${n + 2}: sin número de PO, se omite.`)
        if (!r.id_item) avisos.push(`Fila ${n + 2}: sin ID_Item, se omite.`)
        if (!r.cantidad_po || r.cantidad_po <= 0) { avisos.push(`Fila ${n + 2}: Cantidad PO inválida, se omite.`); r.cantidad_po = 0 }
        if (recibido > cantPO) avisos.push(`Fila ${n + 2}: recibido (${recibido}) mayor a la PO (${cantPO}); se ajusta a ${cantPO}.`)
        return r
      }).filter(r => r.po && r.id_item && r.cantidad_po > 0)

      // MODO SIN ID_PO (listado de recepciones): filas repetidas de PO+artículo
      // son recepciones parciales de la MISMA PO → una sola PO, varias recepciones.
      if (modoSinIdPo) {
        const grupos = new Map()
        registros.forEach(r => {
          if (!grupos.has(r.id_po_legacy)) grupos.set(r.id_po_legacy, [])
          grupos.get(r.id_po_legacy).push(r)
        })
        const posAgrupadas = []
        const recepsSueltas = []
        grupos.forEach(g => {
          g.sort((a, b) => String(a.fecha_po).localeCompare(String(b.fecha_po)))
          const base = { ...g[0] }
          base.cantidad_po = Math.max(...g.map(x => Number(x.cantidad_po) || 0))
          base.estatus = g[g.length - 1].estatus
          base._recepcion = 0
          base._rec_display = g.reduce((t, x) => t + (x._recepcion > 0 ? x._recepcion : 0), 0)
          posAgrupadas.push(base)
          g.forEach(x => {
            if (x._recepcion > 0) recepsSueltas.push({
              id_po_legacy: x.id_po_legacy,
              id_item: x.id_item,
              cantidad: x._recepcion,
              fecha: x.fecha_po,
              po: x.po,
              proveedor: x.proveedor,
              area: x.area_asignada,
              factura: x.factura_remision,
              ir: x.ir,
            })
          })
          if (base._rec_display > base.cantidad_po)
            avisos.push(`⚠ ${base.po} · ${base.id_item}: recepciones suman ${base._rec_display} y la PO es de ${base.cantidad_po}. Se importa tal cual — corrígela después desde el historial (✏).`)
        })
        const nDup = registros.length - posAgrupadas.length
        if (nDup > 0) avisos.push(`${nDup} filas repetidas de PO+artículo se agruparon como recepciones parciales de su PO.`)
        setPreviewParciales(recepsSueltas)
        setPreviewPOs(posAgrupadas)
        setAvisosImport(avisos)
        return
      }

      // Filas con ID_PO_Origen: son recepciones parciales de OTRA PO (modelo AppSheet).
      // Se cargan como recepciones de la PO original, NO como POs nuevas.
      const conOrigen = filas.slice(1).map((f) => idx.origen >= 0 ? String(f[idx.origen] ?? '').trim() : '')
      const parciales = []
      const soloPOs = registros.filter((r, i) => {
        const origen = conOrigen[i]
        if (origen && origen !== r.id_po_legacy) {
          if (r._recepcion > 0) parciales.push({
            id_po_legacy: origen,
            id_item: r.id_item,
            cantidad: r._recepcion,
            fecha: r.fecha_po,
            po: r.po,
            proveedor: r.proveedor,
            area: r.area_asignada,
            factura: r.factura_remision,
            ir: r.ir,
          })
          return false
        }
        return true
      })
      if (parciales.length)
        avisos.push(`${parciales.length} filas son recepciones parciales de otra PO (ID_PO_Origen): se cargarán como recepciones de la PO original, no como POs nuevas.`)

      // Duplicados por id_po_legacy dentro del archivo
      const vistos = new Set()
      const limpios = soloPOs.filter(r => {
        if (!r.id_po_legacy) return true
        if (vistos.has(r.id_po_legacy)) { avisos.push(`ID_PO duplicado en archivo: ${r.id_po_legacy} (se usa el primero).`); return false }
        vistos.add(r.id_po_legacy); return true
      })
      setPreviewParciales(parciales)

      const faltantes = [...new Set(limpios.filter(r => !existeItem(r.id_item)).map(r => r.id_item))]
      if (faltantes.length)
        avisos.push(`${faltantes.length} artículos no existen en el maestro y se darán de alta automáticamente (stock 0): ${faltantes.slice(0, 10).join(', ')}${faltantes.length > 10 ? '…' : ''}`)

      setAvisosImport(avisos)
      setPreviewPOs(limpios)
    })
    e.target.value = ''
  }

  const importarPOs = async () => {
    setImportando(true); limpiar()

    // 1) Alta de artículos faltantes (como Bot 5, stock 0)
    //    Cubre POs Y recepciones parciales: un artículo puede venir solo en parciales.
    const todosMov = [...previewPOs, ...previewParciales]
    const faltantes = [...new Set(todosMov.filter(r => r.id_item && !existeItem(r.id_item)).map(r => r.id_item))]
    if (faltantes.length) {
      const nuevos = faltantes.map(id => {
        const fila = todosMov.find(r => r.id_item === id)
        const areaCod = areas.find(a =>
          a.id_area === (fila?.area_asignada ?? fila?.area) ||
          a.nombre_area?.toLowerCase() === String(fila?.area_asignada ?? fila?.area ?? '').toLowerCase()
        )?.id_area ?? fila?.area_asignada ?? fila?.area ?? null
        return {
          id_item: id,
          nombre: fila?.articulo || ('Artículo ' + id),
          stock_inicial: 0, stock_minimo: 0,
          unidad_medida: fila?.um || null,
          id_area: areaCod,
        }
      })
      const { error: e1 } = await supabase.from('materiales_herramientas')
        .upsert(nuevos, { onConflict: 'id_item' })
      if (e1) { setImportando(false); return setError('Error al dar de alta artículos: ' + e1.message) }
    }

    // 2) Upsert de POs: si el id_po_legacy ya existe, se actualiza sin duplicar
    const limpiarAux = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_')))
    const conLegacy = previewPOs.filter(r => r.id_po_legacy).map(limpiarAux)
    const sinLegacy = previewPOs.filter(r => !r.id_po_legacy).map(limpiarAux)
    let err = null
    if (conLegacy.length) {
      const { error: e2 } = await supabase.from('pos')
        .upsert(conLegacy, { onConflict: 'id_po_legacy' })
      err = e2
    }
    if (!err && sinLegacy.length) {
      const { error: e3 } = await supabase.from('pos').insert(sinLegacy)
      err = e3
    }
    if (err) { setImportando(false); return setError('Error al importar POs: ' + err.message) }

    // 3) Recepciones históricas → filas reales en entradas (historial visible)
    const recepciones = [
      ...previewPOs
        .filter(r => r._recepcion > 0)
        .map(r => ({
          id_po_legacy: r.id_po_legacy,
          id_item: r.id_item,
          cantidad: r._recepcion,
          fecha: r.fecha_po,
          po: r.po,
          proveedor: r.proveedor,
          area: r.area_asignada,
          factura: r.factura_remision,
          ir: r.ir,
        })),
      ...previewParciales,
    ].filter(r => r.id_item)
    let creadas = 0
    if (recepciones.length) {
      const { data: n, error: e4 } = await supabase.rpc('importar_recepciones_historicas', { filas: recepciones })
      if (e4) { setImportando(false); return setError('POs cargadas, pero falló el historial de recepciones: ' + e4.message) }
      creadas = n ?? recepciones.length
    }
    setImportando(false)

    setOk(`✅ Importación completa: ${previewPOs.length} POs y ${creadas} recepciones históricas cargadas.` +
      (recepciones.length && creadas === 0 ? ' ⚠ Se esperaban ' + recepciones.length + ' recepciones y no se creó ninguna: revisa que los parches SQL v8/v9 estén ejecutados.' : ''))
    setPreviewPOs([]); setPreviewParciales([]); setAvisosImport([]); setPanel(null)
    cargar()
  }

  const guardarCorreccion = async () => {
    limpiar()
    const cant = Number(editHist.cantidad)
    if (!cant || cant <= 0) return setError('La cantidad debe ser mayor a cero.')
    const nuevoTotal = detalle.total_recibido - editHist.original + cant
    if (nuevoTotal > detalle.cantidad_po)
      return setError('Con esa corrección el total recibido (' + nuevoTotal + ') excedería la cantidad de la PO (' + detalle.cantidad_po + ').')

    setGuardando(true)
    const { error: e } = await supabase.from('entradas').update({
      cantidad_recepcion: cant,
      factura_remision: editHist.factura || null,
    }).eq('id_entrada', editHist.id_entrada)
    setGuardando(false)
    if (e) return setError('No se pudo corregir: ' + e.message)
    setOk('Recepción corregida y registrada en bitácora.')
    setEditHist(null); setHistorial(null); setDetalle(null)
    cargar()
  }

  const cargarListasDoc = async (p) => {
    setListasDoc(null)
    const { data } = await supabase.from('entradas')
      .select('ir, factura_remision').eq('id_po', p.id_po)
    const unicos = (arr) => [...new Set(arr.filter(Boolean).map(x => String(x).trim()).filter(Boolean))]
    setListasDoc({
      irs: unicos([p.ir, ...(data ?? []).map(x => x.ir)]).join(', '),
      facturas: unicos([p.factura_remision, ...(data ?? []).map(x => x.factura_remision)]).join(', '),
    })
  }

  const verHistorial = async () => {
    if (historial) { setHistorial(null); return }
    const { data } = await supabase.from('entradas')
      .select('id_entrada, cantidad_recepcion, fecha_entrada, factura_remision, ir, usuario')
      .eq('id_po', detalle.id_po)
      .order('fecha_entrada', { ascending: true })
    setHistorial(data ?? [])
  }

  const visibles = pos
    .filter(p => !soloPendientes || p.pendiente > 0)
    .filter(p => (p.po + ' ' + p.id_item + ' ' + (p.articulo ?? '') + ' ' + (p.proveedor ?? '') + ' ' + (p.requisitor ?? ''))
      .toLowerCase().includes(busqueda.toLowerCase()))


  return (
    <div>
      <datalist id="dl-proveedores">
        {proveedores.map(x => <option key={x.nombre} value={x.nombre} />)}
      </datalist>
      <datalist id="dl-requisitores">
        {requisitores.map(x => <option key={x.nombre} value={x.nombre} />)}
      </datalist>
      <datalist id="dl-um">
        {unidades.map(u => <option key={u.nombre} value={u.nombre} />)}
      </datalist>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold">Recepciones</h1>
        {puedeCapturar && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setPanel(panel === 'po' ? null : 'po'); limpiar() }}
              className="rounded bg-acero-950 text-white px-4 py-2 text-sm font-medium hover:bg-acero-800">
              {panel === 'po' ? 'Cancelar' : '+ Nueva Recepción'}
            </button>
            <button onClick={() => { setPanel(panel === 'especial' ? null : 'especial'); limpiar() }}
              className="rounded border border-acero-950 px-4 py-2 text-sm font-medium hover:bg-acero-100">
              Recepción sin PO
            </button>
            {puedeCapturar && (
              <button onClick={() => { setPanel(panel === 'importar' ? null : 'importar'); limpiar(); setPreviewPOs([]); setAvisosImport([]) }}
                className="rounded border border-acero-950 px-4 py-2 text-sm font-medium hover:bg-acero-100">
                ⬆ Importar POs
              </button>
            )}
          </div>
        )}
      </div>

      {ok && <p className="mb-4 text-sm text-green-800 bg-green-50 border border-green-200 rounded px-3 py-2">{ok}</p>}
      {error && !panel && !recibir && (
        <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      {/* ---- Form Nueva PO (estructura completa) ---- */}
      {panel === 'po' && (
        <div className="bg-white rounded-lg border border-acero-200 p-5 mb-6 max-w-3xl">
          <h2 className="font-semibold text-sm mb-4">Nueva recepción</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className={lbl}>Número de PO</label>
              <input value={formPO.po} onChange={e => setFormPO(v => ({ ...v, po: e.target.value }))}
                placeholder="PO-XXX-000" className={inp + ' font-mono'} />
            </div>
            <div>
              <label className={lbl}>Fecha</label>
              <input type="date" value={formPO.fecha_po}
                onChange={e => setFormPO(v => ({ ...v, fecha_po: e.target.value }))} className={inp} />
            </div>
            <div>
              <label className={lbl}>Requisitor</label>
              <input list="dl-requisitores" value={formPO.requisitor}
                onChange={e => setFormPO(v => ({ ...v, requisitor: e.target.value }))}
                className={inp} />
            </div>
            <div className="sm:col-span-3 grid sm:grid-cols-2 gap-4">
              <SelectorArticulo f={formPO} setF={setFormPO} items={items} />
            </div>
            <div>
              <label className={lbl}>Área</label>
              <select value={formPO.area_asignada}
                onChange={e => setFormPO(v => ({ ...v, area_asignada: e.target.value }))}
                className={inp + ' bg-white'}>
                <option value="">— Selecciona —</option>
                {areas.map(a => <option key={a.id_area} value={a.id_area}>{a.id_area} · {a.nombre_area}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Cantidad PO</label>
              <input type="number" min="1" value={formPO.cantidad_po}
                onChange={e => setFormPO(v => ({ ...v, cantidad_po: e.target.value }))}
                className={inp + ' font-mono'} />
            </div>
            <div>
              <label className={lbl}>Unidad (UM)</label>
              <input list="dl-um" value={formPO.um} placeholder="Pieza, Cubeta…"
                onChange={e => setFormPO(v => ({ ...v, um: e.target.value }))} className={inp} />
            </div>
            <div>
              <label className={lbl}>Cantidad recibida ahora</label>
              <input type="number" min="0" value={formPO.cantidad_recepcion}
                placeholder="0 si aún no llega"
                onChange={e => setFormPO(v => ({ ...v, cantidad_recepcion: e.target.value }))}
                className={inp + ' font-mono'} />
            </div>
            <div>
              <label className={lbl}>Precio unitario (PU)</label>
              <input value={formPO.pu} placeholder="$0.00"
                onChange={e => setFormPO(v => ({ ...v, pu: e.target.value }))}
                className={inp + ' font-mono'} />
            </div>
            <div>
              <label className={lbl}>Proveedor</label>
              <input list="dl-proveedores" value={formPO.proveedor}
                onChange={e => setFormPO(v => ({ ...v, proveedor: e.target.value }))}
                className={inp} />
            </div>
            <div>
              <label className={lbl}>Factura y/o Remisión</label>
              <input value={formPO.factura_remision}
                onChange={e => setFormPO(v => ({ ...v, factura_remision: e.target.value }))}
                className={inp + ' font-mono'} />
            </div>
            <div>
              <label className={lbl}>IR</label>
              <input value={formPO.ir} placeholder="IR-0000"
                onChange={e => setFormPO(v => ({ ...v, ir: e.target.value }))} className={inp + ' font-mono'} />
            </div>
            <div>
              <label className={lbl}>Observaciones</label>
              <input value={formPO.observaciones} onChange={e => setFormPO(v => ({ ...v, observaciones: e.target.value }))}
                className={inp} />
            </div>
          </div>
          {formPO.cantidad_po && Number(formPO.cantidad_recepcion) > 0 && Number(formPO.cantidad_recepcion) < Number(formPO.cantidad_po) && (
            <p className="mt-3 text-xs text-yellow-800 bg-ambar-400/15 border border-ambar-500/40 rounded px-3 py-2">
              Se creará como <b>Parcial</b>: pendiente de recibir {Number(formPO.cantidad_po) - Number(formPO.cantidad_recepcion)} de {formPO.cantidad_po}.
            </p>
          )}
          {formPO.pu && formPO.cantidad_po && (
            <p className="mt-3 text-xs text-acero-600 font-mono">
              Importe estimado: {money(parseMonto(formPO.pu) * Number(formPO.cantidad_po))} + IVA = {money(parseMonto(formPO.pu) * Number(formPO.cantidad_po) * 1.16)}
            </p>
          )}
          {error && <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <button onClick={guardarPO} disabled={guardando}
            className="mt-4 rounded bg-ambar-500 text-acero-950 px-5 py-2 text-sm font-semibold hover:bg-ambar-400 disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Crear recepción'}
          </button>
        </div>
      )}

      {/* ---- Form Recepción sin PO ---- */}
      {panel === 'especial' && (
        <div className="bg-white rounded-lg border border-acero-200 p-5 mb-6 max-w-2xl">
          <h2 className="font-semibold text-sm mb-1">Recepción especial</h2>
          <p className="text-xs text-acero-600 mb-4">Para entradas que no vienen de una orden de compra. Elige el motivo que la clasifica.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <SelectorArticulo f={formEsp} setF={setFormEsp} items={items} />
            <div className="sm:col-span-2">
              <label className={lbl}>Motivo (queda registrado en la bitácora)</label>
              <div className="flex gap-2 flex-wrap">
                {Object.keys(MOTIVOS_ESPECIALES).map(c => (
                  <button key={c} type="button"
                    onClick={() => setFormEsp(v => ({ ...v, po_codigo: c }))}
                    className={`px-3 py-1.5 rounded text-sm border font-mono ${formEsp.po_codigo === c
                      ? 'bg-acero-950 text-white border-acero-950' : 'bg-white border-acero-200 hover:border-acero-600'}`}>
                    {c}
                  </button>
                ))}
              </div>
              <p className="text-xs text-acero-600 mt-2 bg-acero-50 border border-acero-100 rounded px-3 py-2">
                {MOTIVOS_ESPECIALES[formEsp.po_codigo]}
              </p>
            </div>
            <div>
              <label className={lbl}>Cantidad recibida</label>
              <input type="number" min="1" value={formEsp.cantidad}
                onChange={e => setFormEsp(v => ({ ...v, cantidad: e.target.value }))}
                className={inp + ' font-mono'} />
            </div>
            <div>
              <label className={lbl}>Proveedor</label>
              <input list="dl-proveedores" value={formEsp.proveedor}
                onChange={e => setFormEsp(v => ({ ...v, proveedor: e.target.value }))}
                className={inp} />
            </div>
            <div>
              <label className={lbl}>Área asignada</label>
              <select value={formEsp.area_asignada}
                onChange={e => setFormEsp(v => ({ ...v, area_asignada: e.target.value }))}
                className={inp + ' bg-white'}>
                <option value="">— Selecciona —</option>
                {areas.map(a => <option key={a.id_area} value={a.id_area}>{a.id_area} · {a.nombre_area}</option>)}
              </select>
            </div>
          </div>
          {error && <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <button onClick={guardarEspecial} disabled={guardando}
            className="mt-4 rounded bg-ambar-500 text-acero-950 px-5 py-2 text-sm font-semibold hover:bg-ambar-400 disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Registrar recepción'}
          </button>
        </div>
      )}

      {/* ---- Panel Importar POs ---- */}
      {panel === 'importar' && (
        <div className="bg-white rounded-lg border border-acero-200 p-5 mb-6">
          <h2 className="font-semibold text-sm mb-2">Importar POs desde CSV (AppSheet)</h2>
          <p className="text-xs text-acero-600 mb-3 max-w-3xl">
            Acepta dos formatos: la hoja de POs de AppSheet (con ID_PO) o el listado mensual de recepciones (sin ID_PO — las POs se identifican por PO + artículo y las filas repetidas se agrupan como recepciones parciales). Se leen: ID_PO, Fecha Recepción, PO, Área, Requisitor,
            ID_Item, Descripción, UM, Cantidad PO, Cantidad Recepción, PU, Estatus, Factura y/o Remisión,
            Proveedor, Observaciones e IR. Los importes y faltantes se calculan solos. Lo ya recibido se importa como <b>recepciones reales con su fecha</b>: alimenta el historial 📜,
            la bitácora y el stock (stock = inicial + entradas − salidas, así que el stock_inicial del
            maestro debe ser la base ANTES de estos movimientos). Reimportar reemplaza el historial
            importado anterior, sin duplicar.
          </p>
          <input type="file" accept=".csv,text/csv" onChange={leerCSVPOs}
            className="text-sm file:mr-3 file:rounded file:border-0 file:bg-acero-950 file:text-white file:px-4 file:py-2 file:text-sm file:cursor-pointer" />

          {avisosImport.length > 0 && (
            <div className="mt-3 text-sm text-yellow-900 bg-ambar-400/15 border border-ambar-500/40 rounded px-3 py-2 max-h-40 overflow-y-auto">
              {avisosImport.map((a, i) => <div key={i}>⚠ {a}</div>)}
            </div>
          )}
          {error && <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

          {previewPOs.length > 0 && (
            <>
              <div className="flex items-center justify-between mt-4 mb-2">
                <h3 className="font-semibold text-sm">
                  Vista previa — {previewPOs.length} POs
                  {previewParciales.length > 0 && <span className="text-acero-600 font-normal"> + {previewParciales.length} recepciones parciales de esas POs</span>}
                </h3>
                <button onClick={importarPOs} disabled={importando}
                  className="rounded bg-ambar-500 text-acero-950 px-5 py-2 text-sm font-semibold hover:bg-ambar-400 disabled:opacity-50">
                  {importando ? 'Importando…' : 'Confirmar importación'}
                </button>
              </div>
              <div className="border border-acero-200 rounded overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-acero-50 text-acero-600 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">PO</th>
                      <th className="text-left px-3 py-2">Fecha</th>
                      <th className="text-left px-3 py-2">Artículo</th>
                      <th className="text-right px-3 py-2">Cant.</th>
                      <th className="text-right px-3 py-2">Recibido</th>
                      <th className="text-right px-3 py-2">PU</th>
                      <th className="text-left px-3 py-2">Estatus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-acero-100">
                    {previewPOs.slice(0, 100).map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-mono">{r.po}</td>
                        <td className="px-3 py-1.5 font-mono">{r.fecha_po ?? '—'}</td>
                        <td className="px-3 py-1.5"><span className="font-mono text-acero-600">{r.id_item}</span> {r.articulo}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.cantidad_po}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{r._rec_display ?? r._recepcion}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{money(r.pu)}</td>
                        <td className="px-3 py-1.5">{r.estatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewPOs.length > 100 && (
                  <p className="px-3 py-2 text-xs text-acero-600">…y {previewPOs.length - 100} más (se importan todas).</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- Modal Recibir ---- */}
      {recibir && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-5 w-full max-w-md">
            <h2 className="font-semibold mb-1">Recibir PO <span className="font-mono">{recibir.po}</span></h2>
            <p className="text-sm text-acero-600 mb-4">
              <span className="font-mono text-xs">{recibir.id_item}</span> {recibir.articulo}
              {recibir.proveedor && <> · {recibir.proveedor}</>}
            </p>
            <div className="grid grid-cols-3 gap-2 mb-4 text-sm">
              <div className="bg-acero-50 rounded p-3">
                <div className="text-xs text-acero-600">Cantidad PO</div>
                <div className="font-mono text-lg">{recibir.cantidad_po}</div>
              </div>
              <div className="bg-acero-50 rounded p-3">
                <div className="text-xs text-acero-600">Recibido</div>
                <div className="font-mono text-lg">{recibir.total_recibido}</div>
              </div>
              <div className="bg-ambar-400/15 border border-ambar-500/40 rounded p-3">
                <div className="text-xs text-acero-600">Pendiente</div>
                <div className="font-mono text-lg">{recibir.pendiente}</div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className={lbl}>Cantidad a recibir ahora</label>
                <input type="number" min="1" max={recibir.pendiente} value={formRecep.cantidad}
                  onChange={e => setFormRecep(v => ({ ...v, cantidad: e.target.value }))} autoFocus
                  className={inp + ' font-mono text-lg'} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>Fecha de la recepción</label>
                  <input type="date" value={formRecep.fecha}
                    onChange={e => setFormRecep(v => ({ ...v, fecha: e.target.value }))}
                    className={inp} />
                </div>
                <div>
                  <label className={lbl}>IR de esta recepción</label>
                  <input value={formRecep.ir} placeholder="IR-0000"
                    onChange={e => setFormRecep(v => ({ ...v, ir: e.target.value }))}
                    className={inp + ' font-mono'} />
                </div>
              </div>
              <div>
                <label className={lbl}>Factura y/o Remisión</label>
                <input value={formRecep.factura_remision}
                  onChange={e => setFormRecep(v => ({ ...v, factura_remision: e.target.value }))}
                  className={inp + ' font-mono'} />
              </div>
              <div>
                <label className={lbl}>Observaciones</label>
                <input value={formRecep.observaciones}
                  onChange={e => setFormRecep(v => ({ ...v, observaciones: e.target.value }))}
                  className={inp} />
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={guardarRecepcion} disabled={guardando}
                className="flex-1 rounded bg-ambar-500 text-acero-950 py-2 text-sm font-semibold hover:bg-ambar-400 disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Confirmar recepción'}
              </button>
              <button onClick={() => { setRecibir(null); limpiar() }}
                className="rounded border border-acero-200 px-4 py-2 text-sm hover:bg-acero-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Modal Editar PO (solo Admin) ---- */}
      {editar && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="font-semibold mb-1">Editar PO <span className="font-mono">{editar.po}</span></h2>
            <p className="text-xs text-acero-600 mb-4">
              <span className="font-mono">{editar.id_item}</span> · Recibido hasta ahora: <b className="font-mono">{editar.total_recibido}</b>
            </p>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className={lbl}>Número de PO</label>
                <input value={editar.po} onChange={e => setEditar(v => ({ ...v, po: e.target.value }))}
                  className={inp + ' font-mono'} />
              </div>
              <div>
                <label className={lbl}>Fecha</label>
                <input type="date" value={editar.fecha_po ? String(editar.fecha_po).slice(0, 10) : ''}
                  onChange={e => setEditar(v => ({ ...v, fecha_po: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className={lbl}>Requisitor</label>
                <input list="dl-requisitores" value={editar.requisitor ?? ''}
                  onChange={e => setEditar(v => ({ ...v, requisitor: e.target.value }))} className={inp} />
              </div>
              <div className="sm:col-span-2">
                <label className={lbl}>Descripción del artículo</label>
                <input value={editar.articulo ?? ''}
                  onChange={e => setEditar(v => ({ ...v, articulo: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className={lbl}>UM</label>
                <input list="dl-um" value={editar.um ?? ''}
                  onChange={e => setEditar(v => ({ ...v, um: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className={lbl}>Cantidad PO</label>
                <input type="number" min={editar.total_recibido || 1} value={editar.cantidad_po}
                  onChange={e => setEditar(v => ({ ...v, cantidad_po: e.target.value }))}
                  className={inp + ' font-mono'} />
              </div>
              <div>
                <label className={lbl}>PU</label>
                <input value={editar.pu ?? ''} onChange={e => setEditar(v => ({ ...v, pu: e.target.value }))}
                  className={inp + ' font-mono'} />
              </div>
              <div>
                <label className={lbl}>Proveedor</label>
                <input list="dl-proveedores" value={editar.proveedor ?? ''}
                  onChange={e => setEditar(v => ({ ...v, proveedor: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className={lbl}>Área</label>
                <select value={editar.area_asignada ?? ''}
                  onChange={e => setEditar(v => ({ ...v, area_asignada: e.target.value }))}
                  className={inp + ' bg-white'}>
                  <option value="">— Sin área —</option>
                  {areas.map(a => <option key={a.id_area} value={a.id_area}>{a.id_area} · {a.nombre_area}</option>)}
                  {editar.area_asignada && !areas.some(a => a.id_area === editar.area_asignada) && (
                    <option value={editar.area_asignada}>{editar.area_asignada}</option>
                  )}
                </select>
              </div>
              <div>
                <label className={lbl}>IR</label>
                <input value={editar.ir ?? ''} onChange={e => setEditar(v => ({ ...v, ir: e.target.value }))}
                  className={inp + ' font-mono'} />
              </div>
              <div>
                <label className={lbl}>Factura y/o Remisión</label>
                <input value={editar.factura_remision ?? ''}
                  onChange={e => setEditar(v => ({ ...v, factura_remision: e.target.value }))}
                  className={inp + ' font-mono'} />
              </div>
              <div className="sm:col-span-3">
                <label className={lbl}>Observaciones</label>
                <input value={editar.observaciones ?? ''}
                  onChange={e => setEditar(v => ({ ...v, observaciones: e.target.value }))} className={inp} />
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={guardarEdicion} disabled={guardando}
                className="flex-1 rounded bg-ambar-500 text-acero-950 py-2 text-sm font-semibold hover:bg-ambar-400 disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button onClick={() => { setEditar(null); limpiar() }}
                className="rounded border border-acero-200 px-4 py-2 text-sm hover:bg-acero-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Modal Detalle PO ---- */}
      {detalle && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50" onClick={() => setDetalle(null)}>
          <div className="bg-white rounded-lg shadow-xl p-5 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold mb-3 font-mono">{detalle.po}</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                ['Fecha', fmtFecha(detalle.fecha_po)],
                ['Estatus', detalle.estatus],
                ['Artículo', `${detalle.id_item} · ${detalle.articulo ?? ''}`],
                ['UM', detalle.um ?? '—'],
                ['Requisitor', detalle.requisitor ?? '—'],
                ['Área', nombreArea(detalle.area_asignada)],
                ['Proveedor', detalle.proveedor ?? '—'],
                ['IR', listasDoc ? (listasDoc.irs || '—') : (detalle.ir ?? '—')],
                ['Cantidad PO', detalle.cantidad_po],
                ['Recibido', detalle.total_recibido],
                ['Pendiente', detalle.pendiente],
                ['PU', money(detalle.pu)],
                ['Subtotal', money(detalle.subtotal)],
                ['Total (IVA 16%)', money(detalle.total)],
                ['Factura/Remisión', listasDoc ? (listasDoc.facturas || '—') : (detalle.factura_remision ?? '—')],
              ].map(([k, val]) => (
                <div key={k}>
                  <dt className="text-xs text-acero-600">{k}</dt>
                  <dd className="font-mono text-sm">{val}</dd>
                </div>
              ))}
            </dl>
            {detalle.observaciones && (
              <div className="mt-3 border-t border-acero-100 pt-2">
                <dt className="text-xs text-acero-600">Observaciones</dt>
                <dd className="text-sm">{detalle.observaciones}</dd>
              </div>
            )}

            {/* Historial de recepciones */}
            <button onClick={verHistorial}
              className="mt-4 rounded bg-acero-950 text-white px-4 py-2 text-sm font-medium hover:bg-acero-800">
              {historial ? 'Ocultar historial' : '📜 Historial de recepciones'}
            </button>
            {historial && (
              <div className="mt-3 border border-acero-200 rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-acero-50 text-acero-600">
                    <tr>
                      <th className="text-left px-3 py-2">Fecha</th>
                      <th className="text-right px-3 py-2">Cantidad</th>
                      <th className="text-right px-3 py-2">Monto</th>
                      <th className="text-left px-3 py-2">IR</th>
                      <th className="text-left px-3 py-2">Factura/Remisión</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-acero-100">
                    {historial.length === 0 && (
                      <tr><td colSpan="6" className="px-3 py-3 text-center text-acero-600">
                        Sin recepciones registradas en el sistema{detalle.recibido_historico > 0 ? ` (${detalle.recibido_historico} recibidas en el histórico importado)` : ''}.
                      </td></tr>
                    )}
                    {historial.map((h, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-mono">{new Date(h.fecha_entrada).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="px-3 py-2 text-right font-mono">+{h.cantidad_recepcion}</td>
                        <td className="px-3 py-2 text-right font-mono">{money(h.cantidad_recepcion * (detalle.pu ?? 0))}</td>
                        <td className="px-3 py-2 font-mono">{h.ir ?? '—'}</td>
                        <td className="px-3 py-2 font-mono">{h.factura_remision ?? '—'}</td>
                        <td className="px-3 py-2 text-right">
                          {puedeCorregir && (
                            <button onClick={() => setEditHist({
                              id_entrada: h.id_entrada,
                              cantidad: String(h.cantidad_recepcion),
                              original: h.cantidad_recepcion,
                              factura: h.factura_remision ?? '',
                            })}
                              className="rounded border border-acero-300 px-2 py-1 text-[11px] hover:bg-acero-100">
                              ✏ Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {historial.length > 0 && detalle.recibido_historico > 0 && (
                      <tr className="bg-acero-50">
                        <td className="px-3 py-2 text-acero-600" colSpan="1">Histórico importado</td>
                        <td className="px-3 py-2 text-right font-mono">+{detalle.recibido_historico}</td>
                        <td className="px-3 py-2 text-right font-mono">{money(detalle.recibido_historico * (detalle.pu ?? 0))}</td>
                        <td className="px-3 py-2">—</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {editHist && (
              <div className="mt-3 border border-ambar-500/50 bg-ambar-400/10 rounded p-3">
                <p className="text-xs font-semibold mb-2">Corregir recepción</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-acero-600 mb-1">Cantidad</label>
                    <input type="number" min="1" value={editHist.cantidad}
                      onChange={e => setEditHist(v => ({ ...v, cantidad: e.target.value }))}
                      className={inp + ' font-mono'} />
                  </div>
                  <div>
                    <label className="block text-[11px] text-acero-600 mb-1">Factura y/o Remisión</label>
                    <input value={editHist.factura}
                      onChange={e => setEditHist(v => ({ ...v, factura: e.target.value }))}
                      className={inp + ' font-mono'} />
                  </div>
                </div>
                {error && <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</p>}
                <div className="flex gap-2 mt-2">
                  <button onClick={guardarCorreccion} disabled={guardando}
                    className="rounded bg-ambar-500 text-acero-950 px-4 py-1.5 text-xs font-semibold hover:bg-ambar-400 disabled:opacity-50">
                    {guardando ? 'Guardando…' : 'Guardar corrección'}
                  </button>
                  <button onClick={() => { setEditHist(null); limpiar() }}
                    className="rounded border border-acero-200 px-3 py-1.5 text-xs hover:bg-acero-50">Cancelar</button>
                </div>
                <p className="text-[10px] text-acero-600 mt-1.5">La corrección ajusta stock y estatus de la PO, y queda en bitácora con tu usuario.</p>
              </div>
            )}

            <button onClick={() => { setDetalle(null); setHistorial(null); setEditHist(null) }}
              className="mt-4 ml-2 rounded border border-acero-200 px-4 py-2 text-sm hover:bg-acero-50">Cerrar</button>
          </div>
        </div>
      )}

      {/* ---- Filtros y lista ---- */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={soloPendientes}
            onChange={e => setSoloPendientes(e.target.checked)} />
          Solo POs con pendiente
        </label>
        <input placeholder="Buscar PO, artículo, proveedor, requisitor…"
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          className="rounded border border-acero-200 bg-white px-3 py-1.5 text-sm w-full sm:w-80" />
      </div>

      <div className="bg-white rounded-lg border border-acero-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-acero-50 text-acero-600 text-xs">
            <tr>
              <th className="text-left px-3 py-2.5">PO</th>
              <th className="text-left px-3 py-2.5">Fecha</th>
              <th className="text-left px-3 py-2.5">Artículo</th>
              <th className="text-left px-3 py-2.5">Requisitor</th>
              <th className="text-right px-3 py-2.5">Cant. PO</th>
              <th className="text-right px-3 py-2.5">Total PO</th>
              <th className="text-right px-3 py-2.5">Recibido</th>
              <th className="text-right px-3 py-2.5">Total recibido</th>
              <th className="text-right px-3 py-2.5">Pend.</th>
              <th className="text-left px-3 py-2.5">Estatus</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-acero-100">
            {visibles.length === 0 && (
              <tr><td colSpan="11" className="px-4 py-6 text-center text-acero-600">
                {soloPendientes ? 'Sin POs pendientes de recibir.' : 'Sin POs registradas.'}
              </td></tr>
            )}
            {visibles.map(p => (
              <tr key={p.id_po} className="hover:bg-acero-50 cursor-pointer" onClick={() => { setDetalle(p); setHistorial(null); cargarListasDoc(p) }}>
                <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{p.po}</td>
                <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">
                  {fmtFecha(p.fecha_po)}
                </td>
                <td className="px-3 py-2.5 max-w-56 truncate">
                  <span className="font-mono text-xs text-acero-600">{p.id_item}</span> {p.articulo}
                </td>
                <td className="px-3 py-2.5 text-xs">{p.requisitor ?? '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono">{p.cantidad_po}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{money(p.total)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-green-700">{p.total_recibido}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap text-green-700">{money((p.pu ?? 0) * p.total_recibido * 1.16)}</td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold">{p.pendiente}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block rounded border px-2 py-0.5 text-xs font-mono ${
                    p.estatus === 'Completo'
                      ? 'bg-green-100 text-green-800 border-green-300'
                      : 'bg-ambar-400/20 text-yellow-800 border-ambar-500/50'}`}>
                    {p.estatus}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                  {puedeCapturar && (
                    <button onClick={() => { setEditar({ ...p }); limpiar() }}
                      className="rounded border border-acero-300 px-2.5 py-1.5 text-xs font-medium hover:bg-acero-100 mr-1.5">
                      Editar
                    </button>
                  )}
                  {puedeCapturar && p.pendiente > 0 && (
                    <button onClick={() => { setRecibir(p); setFormRecep({ ...recepVacia, cantidad: String(p.pendiente) }); limpiar() }}
                      className="rounded bg-acero-950 text-white px-3 py-1.5 text-xs font-medium hover:bg-acero-800">
                      Recibir
                    </button>
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
