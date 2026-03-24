# Manual del Propietario

¡Bienvenido a SCRUB (desarrollado por Scrubadub Solutions)! Este manual cubre todo lo que necesitas para gestionar tu negocio de limpieza.

---

## Primeros Pasos

Después de registrarte y crear tu empresa, llegarás al **Panel**. Este es tu centro de comando que muestra métricas clave de un vistazo: trabajos activos, miembros del equipo, propiedades y alertas abiertas.

## Gestión de Propiedades

Navega a **Propiedades** para agregar y gestionar las ubicaciones que tu equipo atiende.

- **Agregar una propiedad** haciendo clic en "Agregar propiedad" y completando la dirección, nombre y notas especiales.
- **Editar o archivar** una propiedad desde su página de detalles.
- Cada propiedad rastrea su historial de trabajos para que puedas revisar el trabajo pasado.

## Gestión de Empleados

Usa la sección de **Empleados** para invitar y gestionar tu equipo.

- **Invitar a un miembro del equipo** ingresando su correo electrónico. Recibirán una invitación para unirse a tu empresa.
- Asignar roles: **Limpiador** o **Mantenimiento**.
- Ver el historial de trabajos y métricas de rendimiento de cada empleado.

## Programación de Trabajos

La sección de **Trabajos** es donde creas y gestionas las asignaciones de limpieza.

### Crear un Trabajo

1. Haz clic en **Programar trabajo**.
2. Selecciona una propiedad.
3. Elige el tipo de trabajo: Estándar, Limpieza profunda, Rotación, Entrada/Salida o Mantenimiento.
4. Establece la fecha, hora de inicio y duración estimada.
5. Asigna uno o más limpiadores.

### Ciclo de Vida del Trabajo

Los trabajos pasan por estos estados:

1. **Programado** — El trabajo está creado y asignado.
2. **Confirmado** — El limpiador asignado ha confirmado que puede hacer el trabajo.
3. **En progreso** — El trabajo ha comenzado.
4. **Enviado** — El limpiador ha completado y enviado el trabajo para revisión.
5. **Aprobado** — Has revisado y aprobado el trabajo.
6. **Corrección solicitada** — Has pedido al limpiador que rehaga parte del trabajo.

También puedes **cancelar** un trabajo programado o confirmado si los planes cambian.

### Revisión de Trabajos Enviados

Cuando un limpiador envía un trabajo, aparece en tu conteo de **Pendientes de aprobación** en el panel. Abre el detalle del trabajo para revisar el formulario enviado, fotos y notas, luego elige **Aprobar** o **Solicitar corrección**.

## Calendario

La vista de **Calendario** te da una visión general de todos los trabajos programados. Úsalo para detectar vacíos o conflictos en la programación.

## Alertas

Las **Alertas** destacan problemas que necesitan atención — elementos omitidos, preocupaciones de calidad o quejas de clientes.

- Las alertas se crean automáticamente basadas en los formularios de trabajo enviados o pueden ser levantadas manualmente.
- Cada alerta tiene una **severidad** (baja, media, alta) y **categoría**.
- Resuelve las alertas desde el panel de Alertas una vez que el problema sea atendido.

## Rendimiento

La página de **Rendimiento** muestra métricas para cada miembro del equipo:

- Trabajos completados
- Tasa de aprobación
- Calificación promedio
- Conteo de alertas

Usa estos datos para identificar a los mejores trabajadores y áreas de mejora.

## Analíticas

La sección de **Analíticas** proporciona información a nivel de empresa:

- Tendencias de finalización de trabajos
- Seguimiento de ingresos
- Utilización de propiedades
- Distribución de carga de trabajo del equipo

## Notificaciones

Recibirás notificaciones para eventos clave:

- Confirmaciones y envíos de trabajos
- Alertas levantadas
- Respuestas a invitaciones de empleados

Revisa el **ícono de campana** o la página de Notificaciones para estar al día.

## Registro de Actividad

El **Registro de actividad** registra todas las acciones significativas en tu cuenta para responsabilidad y transparencia.

## Trabajos Compartidos (Propietario ↔ Propietario)

SCRUB te permite compartir trabajos con propietarios socios para colaborar en propiedades entre empresas.

### Cómo Funciona

1. Abre un trabajo que hayas creado y toca **Compartir**.
2. Selecciona un socio conectado de tu lista de **Socios**.
3. El socio recibe el trabajo en su bandeja de **Trabajos compartidos entrantes** y puede **Aceptar** o **Rechazar**.

### Copia de la Propiedad

Cuando compartes un trabajo, SCRUB copia una **copia de solo lectura** de los detalles de la propiedad (nombre, dirección, camas, baños, comodidades y notas) en el trabajo compartido. Esto significa:

- Tu socio ve solo la copia — **no puede** acceder ni navegar tus registros de propiedad.
- No se filtran datos de propiedad entre empresas. La copia es una copia única incrustada en el trabajo compartido.
- Si luego actualizas la propiedad original, la copia en el trabajo compartido **no** cambia.

### Editar un Trabajo Compartido

Cuando tu socio edita un trabajo compartido que recibió:

- El **selector de propiedad está oculto** — la copia de propiedad es de solo lectura.
- Pueden cambiar los limpiadores asignados, tipo de trabajo, fecha, hora, duración y notas.
- No pueden reasignar el trabajo a una propiedad diferente.

### Estados de Trabajos Compartidos

Los trabajos compartidos pasan por: **Pendiente → Aceptado → En progreso → Completado** (o **Rechazado**).

- Si es rechazado, serás notificado y puedes compartir el trabajo con otro socio o asignarlo a tu propio limpiador.
- Cuando el socio completa el trabajo, puedes revisar el paquete de finalización (resumen de lista de verificación, notas y fotos si están habilitadas).

---

## Liquidaciones V2

Las liquidaciones rastrean el dinero adeudado entre tú y tus socios por trabajos compartidos.

### Pestañas ABIERTAS vs PAGADAS

Navega a **Liquidaciones** para ver dos pestañas:

- **ABIERTAS** — Liquidaciones que aún necesitan pago.
- **PAGADAS** — Liquidaciones que han sido completadas.

Cada liquidación muestra la empresa socia, el trabajo asociado y el monto.

### Pagar una Liquidación

Tienes dos opciones para pagar una liquidación abierta:

- **Pagar vía SCRUB** — Te redirige a una página segura de Stripe Checkout. Una vez que el pago se completa, la liquidación cambia automáticamente a **PAGADA** (no se necesita paso manual). Un enlace de recibo aparecerá en la liquidación pagada.
- **Marcar pagado** — Registra un pago fuera de la plataforma (Zelle, ACH, Efectivo, etc.). Ingresa el método de pago y una nota opcional, luego confirma.

### Después del Pago

Una vez que una liquidación está pagada:

- Se mueve a la pestaña **PAGADA**.
- La liquidación muestra quién pagó y cuándo.
- **No hay mensaje de "te debe"** después del pago — el saldo queda saldado.

---

## Stripe Connect

Stripe Connect te permite recibir pagos de socios directamente a través de SCRUB.

### Configuración

1. Ve a **Configuración** y abre la sección de **Facturación**.
2. Haz clic en **Configurar Stripe Connect** para comenzar la incorporación Express.
3. Stripe te guiará a través de la verificación de identidad y configuración de cuenta bancaria.
4. Una vez completo, tu empresa está lista para recibir pagos de liquidaciones.

### Tarifa de Plataforma

- Se cobra una tarifa fija de **$2.00** por pago de liquidación hecho vía SCRUB.
- La tarifa tiene un tope del monto de la liquidación (así que una liquidación de $1.50 incurriría solo en una tarifa de $1.50, no $2.00).

### Flujo de Dinero

Cuando el Propietario 1 paga una liquidación al Propietario 2 vía SCRUB:

1. El Propietario 1 paga el monto total de la liquidación en Stripe Checkout.
2. El Propietario 2 recibe el monto de la liquidación **menos** la tarifa de plataforma de $2.00.
3. La tarifa de plataforma va a Scrubadub Solutions.

---

## Disponibilidad del Limpiador

Tus limpiadores pueden establecer su propia disponibilidad para que el sistema de programación respete sus horarios de trabajo.

### Horario Semanal

Cada limpiador establece un horario semanal recurrente con horas disponibles por día. Cuando programas un trabajo, el sistema muestra qué limpiadores están disponibles en esa fecha.

### Excepciones de Día

Los limpiadores pueden marcar fechas específicas como no disponibles (para vacaciones, días personales, etc.) o explícitamente disponibles. **Las excepciones requieren al menos 14 días de anticipación.** Una vez que pasa la ventana de 14 días, la excepción se bloquea y no puede cambiarse.

### Cómo la Programación Usa la Disponibilidad

- Cuando asignas limpiadores a un trabajo, el sistema muestra el estado de disponibilidad de cada limpiador para esa fecha.
- Los limpiadores que nunca han establecido disponibilidad se tratan como disponibles por defecto.
- Los limpiadores con un horario semanal se muestran como no disponibles solo si no tienen bloques para ese día de la semana.
- Las excepciones de día tienen prioridad sobre el horario semanal.

---

## Programa de Afiliados

SCRUB incluye un programa de afiliados integrado que te permite ganar comisiones refiriendo nuevos usuarios.

### Primeros Pasos

Navega a **Afiliados** en la barra lateral para abrir el Portal de afiliados. Cuando visitas por primera vez, se genera automáticamente un código de referidos único. Tu enlace de referidos se muestra en la pestaña **Referidos** — cópialo y compártelo con cualquiera que pueda beneficiarse de SCRUB.

### Qué Se Rastrea

El Portal de afiliados tiene cuatro pestañas (más una pestaña solo para admin):

- **Referidos** — Lista a todos los que se registraron usando tu enlace de referidos. También puedes copiar un texto listo para compartir en apps de mensajería o redes sociales.
- **Ingresos** — Muestra ingresos atribuidos de tus referidos, con resúmenes de por vida, 30 días y 7 días. La comisión se calcula a una **tasa del 10%** sobre pagos de facturas atribuidas.
- **Libro mayor** — Desglosa tus ganancias en períodos mensuales o semanales. Cada período muestra ingresos atribuidos, comisión ganada y un estado: **Abierto** (aún acumulando), **Bloqueado** (finalizado y listo para pago) o **Pagado** (comisión distribuida).
- **Pagos** — Conecta tu cuenta de Stripe para recibir pagos electrónicamente. Haz clic en **Conectar Stripe para pagos de afiliados** para comenzar la incorporación Express. Si tu empresa ya tiene una cuenta Stripe Connect (de Liquidaciones), puede reutilizarse automáticamente.

### Solicitar un Pago

Una vez que uno o más períodos del libro mayor están **Bloqueados**, puedes enviar una solicitud de pago:

1. Ve a la pestaña **Libro mayor** y selecciona los períodos bloqueados que deseas cobrar.
2. Haz clic en **Solicitar pago**, agrega una nota opcional y envía.
3. Un administrador revisará tu solicitud y la aprobará, rechazará (con un motivo) o la completará como un lote de pago.

Los pagos pueden procesarse vía transferencia de Stripe (si has conectado tu cuenta) o registrarse manualmente usando Zelle, CashApp, Venmo, Efectivo u otro método.

### Limitaciones Actuales

- La tasa de comisión es fija al 10% — no hay tasas escalonadas ni personalizadas en este momento.
- Los períodos del libro mayor deben ser bloqueados por un administrador antes de que puedas solicitar un pago.
- Las transferencias de pago de Stripe son iniciadas por un administrador, no se activan automáticamente.
- La atribución se rastrea solo para referidos directos (la persona que usó tu enlace).

---

## Consejos para el Éxito

- **Revisa los trabajos enviados rápidamente** para mantener a tu equipo en movimiento.
- **Revisa las alertas diariamente** para detectar problemas temprano.
- **Usa el calendario** para asegurar cargas de trabajo equilibradas en tu equipo.
- **Monitorea las métricas de rendimiento** para premiar el buen trabajo y brindar apoyo donde sea necesario.

---

*Última actualización: 1 de marzo de 2026*

*¿Necesitas ayuda? Contacta soporte en scrubadubsolutionsllc@gmail.com*
