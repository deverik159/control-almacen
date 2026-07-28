// Parser CSV con soporte de comillas y saltos de línea dentro de campos
export function parseCSV(texto) {
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

// Normaliza encabezados: minúsculas, sin acentos, espacios → _
export function normalizarHeader(h) {
  return h.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

// "$5,999.00" → 5999
export function parseMonto(v) {
  if (v == null) return 0
  const n = Number(String(v).replace(/[$,\s]/g, ''))
  return isNaN(n) ? 0 : n
}

// "4/5/2026" (día/mes/año) → "2026-05-04" | null
export function parseFechaDMA(v) {
  const m = String(v ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, d, mes, a] = m
  return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
