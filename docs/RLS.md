# Aislamiento RLS por tenant

La migración `packages/db/migrations/0001_tenant_rls.sql` es aditiva: incorpora idempotencia por tenant, activa y fuerza RLS, y crea políticas `USING`/`WITH CHECK`.

Antes de cada transacción autenticada, el repositorio ejecuta:

```sql
select set_config('app.tenant_id', '<uuid>', true);
```

El tercer argumento limita la variable a la transacción. Las consultas públicas resuelven primero un slug o token opaco mediante políticas de lectura específicas y después fijan el tenant.

Aplicación:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f packages/db/migrations/0001_tenant_rls.sql
```

Usar dos roles distintos: uno propietario para migraciones y otro sin `BYPASSRLS` para la aplicación. Validar en staging que el rol de aplicación no puede leer ni escribir sin contexto de tenant. Las tablas hijas se acceden mediante padres filtrados; agregar `tenant_id` directo a ellas es una mejora de defensa en profundidad pendiente.
