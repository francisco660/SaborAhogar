# POS "Con Sabor a Hogar"

Sistema para el restaurante **Con Sabor a Hogar** (Cra 72 cl 20f -4, París – Bello):
pedidos en mesa, para llevar y domicilio; pantalla de cocina; inventario con
descuento automático por receta; gastos y compras; cierre de caja diario y
reporte de utilidades.

Es un proyecto **independiente** de `contabilidad-iglesia`: carpeta, repositorio,
base de datos y puerto propios (4100). No comparte nada con aquel.

## Tecnología

| Capa | Qué se usa |
|---|---|
| Base de datos | PostgreSQL 15+ (esquema `pos`). Las reglas viven en triggers. |
| Servidor | Node.js 20 + Express (`pg`, `jsonwebtoken`, `bcryptjs`) |
| Tiempo real | Server-Sent Events (cocina y caja se actualizan solas) |
| Frontend | HTML + CSS + JS sin compilación; se instala en el celular como app (PWA) |
| Tickets | Impresión desde el navegador en formato 80 mm (impresora térmica) |

```
pos-restaurante/
├── db/
│   ├── 01_esquema.sql     ← tablas, triggers, vistas y reportes
│   └── 02_semilla.sql     ← menú real, insumos y recetas DE EJEMPLO
├── server/
│   ├── src/               ← API (rutas/menu, pedidos, caja, inventario, admin)
│   └── scripts/           ← init-db.js, crear-usuario.js
├── frontend/              ← la aplicación web
├── render.yaml            ← despliegue en Render (gratis)
└── .github/workflows/     ← keep-alive opcional
```

## Reglas que garantiza la base de datos

- **Inventario = libro de movimientos inmutable.** El stock es la suma; nada se edita ni se borra.
- Cuando un plato **sale a cocina** se descuenta su receta más la de las opciones elegidas
  (p. ej. "Proteína: Chicharrón" descuenta 120 g de chicharrón).
- Si se anula un plato **antes** de prepararlo, los insumos vuelven. Si ya estaba listo, su costo queda como **merma**.
- Las compras actualizan el **costo promedio ponderado** de cada insumo.
- Un pedido **pagado** no admite ítems nuevos ni cambios de precio. Los pagos no se modifican.
- Solo hay **una caja abierta** a la vez. Un turno **cerrado** queda bloqueado.
- El efectivo de domicilios que cobra el domiciliario queda **por liquidar** hasta que lo entrega en caja.

## Roles

| Rol | Ve |
|---|---|
| `admin` | Todo: menú, precios, recetas, reportes de utilidad, usuarios |
| `cajero` | Pedidos, cobros, cocina, domicilios, caja, inventario, gastos |
| `mesero` | Mesas y toma de pedidos (en el celular) |
| `cocina` | Pantalla de cocina, con aviso sonoro |
| `domiciliario` | Solo sus domicilios: dirección, teléfono, marcar entregado |

---

## Correr en el computador (local)

Requisitos: Node.js 20+ y PostgreSQL 15+.

```bash
# 1. Base de datos nueva (NO es la de la iglesia)
createdb -U postgres pos_restaurante

# 2. Configuración
cd server
cp .env.example .env          # editar DATABASE_URL y JWT_SECRET
npm install

# 3. Crear tablas y cargar el menú
npm run db:init

# 4. Primer usuario administrador
npm run crear-usuario -- admin@correo.com SuClave123 admin "Su nombre"

# 5. Arrancar
npm start                     # http://localhost:4100
```

Desde otro dispositivo en la misma red WiFi (celular del mesero, tablet de cocina):
`http://IP-DEL-PC:4100` (la IP se ve con `ipconfig`).

> `npm run db:init -- --reiniciar` **borra** el esquema `pos` y lo crea de nuevo. Solo para pruebas.

---

## Publicar gratis en internet

Costo: **$0**. Se usan dos servicios gratuitos:

| Servicio | Para qué | Plan gratis |
|---|---|---|
| **Neon** (neon.tech) | PostgreSQL en la nube | No expira. Se "duerme" tras unos minutos sin uso y despierta en ~1 s |
| **Render** (render.com) | Servidor Node | Se duerme tras 15 min sin visitas; despertar tarda ~30–50 s |

### ⚠ Para no afectar el sistema de la iglesia

El sistema de la iglesia ya usa Render gratis con un ping cada 10 minutos, las 24 horas.
El plan gratis de Render da **750 horas al mes por workspace**, y ese servicio ya consume
casi todas (~744 h). Si el restaurante se crea en el **mismo** workspace, la suma pasa de
750 h, Render suspende los servicios gratis hasta fin de mes **y la iglesia también se cae**.

**Solución:** cree el restaurante en una **cuenta o workspace de Render aparte**
(por ejemplo, registrándose con otro correo). Así cada uno tiene sus 750 horas.

Lo mismo con los minutos de GitHub Actions: si ambos repositorios son privados en la
misma cuenta de GitHub, comparten los 2.000 minutos gratis al mes. Por eso el keep-alive
del restaurante se hace con **cron-job.org** (paso 4) y no con GitHub Actions.

### Paso 1 — Base de datos en Neon

1. Cree una cuenta en https://neon.tech y un proyecto (región **US East**, la más cercana a Render Ohio/Virginia).
2. Copie la *connection string*. Use la conexión **directa**: la URL **sin** `-pooler`.
   Se ve así: `postgres://usuario:clave@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`
3. Desde su computador, cree las tablas en Neon:
   ```bash
   cd server
   # temporalmente ponga la URL de Neon en DATABASE_URL del .env, o:
   DATABASE_URL="postgres://...neon.tech/neondb?sslmode=require" npm run db:init
   DATABASE_URL="postgres://...neon.tech/neondb?sslmode=require" npm run crear-usuario -- admin@correo.com SuClave123 admin "Su nombre"
   ```
   En PowerShell: `$env:DATABASE_URL="postgres://..."; npm run db:init`

### Paso 2 — Repositorio en GitHub

```bash
cd pos-restaurante
git remote add origin https://github.com/SU_USUARIO/pos-restaurante.git
git push -u origin main
```

### Paso 3 — Servidor en Render (cuenta/workspace aparte)

1. En Render: **New → Blueprint** → elija el repositorio. Render lee `render.yaml`.
2. Cuando pida `DATABASE_URL`, pegue la URL de Neon. `JWT_SECRET` se genera solo.
3. Al terminar queda en `https://pos-sabor-a-hogar.onrender.com` (o el nombre que Render asigne).
   Verifique `https://…onrender.com/api/salud` → `{"ok":true}`.

### Paso 4 — Mantenerlo despierto en horario de atención (cron-job.org)

1. Cree una cuenta gratis en https://cron-job.org
2. **Create cronjob**:
   - URL: `https://SU-APP.onrender.com/api/salud`
   - Cada **10 minutos**, de **5:00 a 22:00**, hora de Colombia (zona `America/Bogota`).
3. Con 17 h/día × 31 días ≈ **527 h/mes**, queda dentro de las 750 h gratis.

En la noche el servidor se duerme. La primera persona de la mañana espera unos 30 s,
pero el ping de las 5:00 a. m. normalmente lo despierta antes de abrir.

> Alternativa: `.github/workflows/keep-alive.yml` hace lo mismo con GitHub Actions.
> Viene **desactivado**. Actívelo solo si el repositorio es **público**: en repos
> públicos los minutos son ilimitados y no afecta a la iglesia.

### Respaldo de la base de datos

Neon guarda historial de cambios por un tiempo limitado en el plan gratis. Para
tener copia propia, una vez por semana:

```bash
pg_dump "postgres://...neon.tech/neondb?sslmode=require" -n pos -Fc -f respaldo_pos_AAAA-MM-DD.dump
```

### Si se cae internet en el restaurante

El plan gratis depende de internet. Si el sector tiene cortes frecuentes, la opción
también gratuita es correr todo **en un PC del restaurante** ("Correr en el computador")
y usar los celulares por la red WiFi local, sin internet.

---

## Uso diario

1. **Caja → Abrir turno** con la base del día.
2. Mesero: **Pedidos → toca la mesa → toca los platos** (con sus opciones y notas) → **Enviar a cocina**.
3. Cocina ve el pedido al instante y marca **Listo**. El mesero marca **Entregar**.
4. Caja: **Cobrar**. Se puede pagar con varios medios a la vez (efectivo + Nequi…) y calcula el cambio.
5. Domicilios: por teléfono se buscan los clientes que ya pidieron antes. Caja asigna el domiciliario.
   Si el cliente paga en efectivo al recibir, marque *"El domiciliario cobra"*; al volver,
   **Caja → Recibir efectivo**.
6. Compras del día: **Gastos → Registrar gasto → Compra de insumos** (suma al inventario).
7. Al cerrar: **Caja → Cerrar turno** con el efectivo contado. Muestra el sobrante o faltante.
8. Admin: **Reportes** muestra ventas, costo de recetas, mermas, gastos y utilidad del día, la semana o el mes.

## Antes de usarlo de verdad

- Las **cantidades de las recetas y los costos de los insumos son ejemplos**. Ajústelos en
  **Menú → Receta** e **Inventario**. De eso depende que la utilidad sea real.
- Haga un **conteo físico inicial** (Inventario → Conteo físico) para arrancar con el stock real.
- Impuestos: los precios se manejan con todo incluido. Si el restaurante es responsable del
  **impuesto al consumo (8%)** o factura electrónicamente, eso se debe validar con un contador.
