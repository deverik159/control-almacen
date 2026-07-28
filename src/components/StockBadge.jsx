// Semáforo de stock — el mismo lenguaje visual de la app de AppSheet
const estilos = {
  '🔴 Stock Bajo':  'bg-red-100 text-red-800 border-red-300',
  '🟡 Stock Medio': 'bg-ambar-400/20 text-yellow-800 border-ambar-500/50',
  '🟢 Stock OK':    'bg-green-100 text-green-800 border-green-300',
}

export default function StockBadge({ alerta }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-mono font-medium ${estilos[alerta] ?? 'bg-acero-100 text-acero-600 border-acero-200'}`}>
      {alerta}
    </span>
  )
}
