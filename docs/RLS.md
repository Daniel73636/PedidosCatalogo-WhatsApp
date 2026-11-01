# Aislamiento RLS por tenant

Las migraciones `0001_tenant_rls.sql` y `0002_child_rls_auth_payments.sql` son aditivas: incorporan idempotencia, sesiones, webhooks y `tenant_id` directo en tablas hijas; activan y fuerzan RLS con políticas `USING`/`WITH CHECK`.

Antes de cada transacción autenticada, el repositorio ejecuta:

```sql
select set_config('app.tenant_id', '<uuid>', true);
```

El tercer argumento limita la variable a la transacción. Las consultas públicas resuelven primero un slug o token opaco mediante políticas de lectura específicas y después fijan el tenant.

Aplicación recomendada:

```bash
pnpm db:migrate
```

Usar dos roles distintos: uno propietario para migraciones y otro sin `BYPASSRLS` para la aplicación. Validar en staging que el rol de aplicación no puede leer ni escribir sin contexto de tenant. Todas las tablas hijas críticas tienen `tenant_id` directo; las consultas además conservan la relación con el padre.
