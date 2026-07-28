# Control de Almacén — React + Supabase

## Arranque

1. Instalar dependencias:
   ```
   npm install
   ```
2. Copiar `.env.example` a `.env` y poner tus credenciales
   (Supabase → Settings → API → Project URL y anon public key):
   ```
   VITE_SUPABASE_URL=https://tuproyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
3. Correr en local:
   ```
   npm run dev
   ```

## Crear el primer usuario Admin

1. Supabase → Authentication → Users → **Add user** (email + password,
   marca "Auto confirm user").
2. El trigger lo da de alta en `usuarios` con rol `Consulta`.
3. Súbelo a Admin en SQL Editor:
   ```sql
   update usuarios set rol = 'Admin' where email = 'tu@correo.com';
   ```
4. Entra a la app con ese correo.

## Estado

- ✅ Fase 2: login, sesión, roles, rutas protegidas, layout
- ✅ Inventario con semáforo (vw_stock) y Home con resumen
- 🔧 Fase 3: forms de Entradas y Salidas
- 🔧 Fase 4: POs con recepción parcial + Bitácora
- 🔧 Fase 5: Dashboard con gráficas + Realtime + gestión de Usuarios
