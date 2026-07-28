import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Home from './pages/Home'
import Inventario from './pages/Inventario'
import Recepciones from './pages/Recepciones'
import Salidas from './pages/Salidas'
import Devoluciones from './pages/Devoluciones'
import Bitacora from './pages/Bitacora'
import Importar from './pages/Importar'
import Catalogos from './pages/Catalogos'
import Usuarios from './pages/Usuarios'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<Home />} />
            <Route path="/inventario" element={<Inventario />} />
            <Route path="/recepciones" element={<Recepciones />} />
            <Route path="/salidas" element={<Salidas />} />
            <Route path="/devoluciones" element={<Devoluciones />} />
            <Route path="/bitacora" element={<Bitacora />} />
            <Route path="/catalogos" element={
              <ProtectedRoute roles={['Admin']}><Catalogos /></ProtectedRoute>
            } />
            <Route path="/importar" element={
              <ProtectedRoute roles={['Admin']}><Importar /></ProtectedRoute>
            } />
            <Route path="/usuarios" element={
              <ProtectedRoute roles={['Admin']}><Usuarios /></ProtectedRoute>
            } />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
