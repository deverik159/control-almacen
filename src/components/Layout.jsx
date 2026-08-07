import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Notificaciones from './Notificaciones'

const nav = [
  { to: '/',             label: 'Inicio',        roles: null },
  { to: '/inventario',   label: 'Inventario',    roles: null },
  { to: '/recepciones',  label: 'Recepciones',   roles: null },
  { to: '/salidas',      label: 'Salidas',       roles: null },
  { to: '/devoluciones', label: 'Devoluciones',  roles: null },
  { to: '/solicitudes',  label: 'Solicitudes',   roles: null },
  { to: '/bitacora',     label: 'Bitácora',      roles: null },
  { to: '/catalogos',    label: 'Catálogos',     roles: ['Admin'] },
  { to: '/importar',     label: 'Importar',      roles: ['Admin', 'Gerente', 'Almacenista'] },
  { to: '/usuarios',     label: 'Usuarios',      roles: ['Admin'] },
]

export default function Layout() {
  const { perfil, salir } = useAuth()

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <Notificaciones />
      {/* Barra lateral */}
      <aside className="md:w-56 bg-acero-950 text-acero-200 flex md:flex-col shrink-0 md:sticky md:top-0 md:h-screen">
        <div className="hidden md:block px-5 py-6 border-b border-acero-800">
          <div className="font-mono text-ambar-400 text-xs tracking-widest">ALMACÉN</div>
          <div className="font-semibold text-white text-lg leading-tight">Control de<br/>Inventario</div>
        </div>
        <nav className="flex md:flex-col flex-1 overflow-x-auto md:overflow-x-visible md:overflow-y-auto md:py-3">
          {nav
            .filter(i => !i.roles || i.roles.includes(perfil?.rol))
            .map(i => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.to === '/'}
                className={({ isActive }) =>
                  `px-5 py-3 text-sm whitespace-nowrap border-l-2 transition-colors ${
                    isActive
                      ? 'border-ambar-400 bg-acero-800 text-white'
                      : 'border-transparent hover:bg-acero-900 hover:text-white'
                  }`
                }
              >
                {i.label}
              </NavLink>
            ))}
        </nav>
        <div className="hidden md:block px-5 py-4 border-t border-acero-800 text-xs">
          <div className="text-white font-medium truncate">{perfil?.nombre}</div>
          <div className="font-mono text-ambar-400">{perfil?.rol}</div>
          <button onClick={salir} className="mt-3 text-acero-200 underline underline-offset-2 hover:text-white">
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <main className="flex-1 p-4 md:p-8 max-w-6xl w-full mx-auto">
        {/* Barra superior en móvil */}
        <div className="md:hidden flex items-center justify-between mb-4 text-xs">
          <span className="font-mono">{perfil?.nombre} · <b className="text-ambar-500">{perfil?.rol}</b></span>
          <button onClick={salir} className="underline">Salir</button>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
