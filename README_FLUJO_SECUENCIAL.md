# Electroingeniería · Trazabilidad Logística · Flujo Secuencial V3

## Lógica principal

```text
Ventas crea el pedido
↓
Logística recibe / valida: coordinador logístico o líder logístico
↓
Alistamiento alista: auxiliar logística
↓
Líder o coordinador compromete mercancía
↓
Líder o coordinador factura
↓
En facturación se define el tipo de entrega
↓
Según tipo de entrega se abre solo el despacho correspondiente
↓
Se cierra el caso
```

## Roles

```text
ventas
gerencia
lider_logistico
coordinador_logistico
aux_logistica
caja
inventarios
admin
auditoria
```

## Matriz de acceso

```text
Recepción de pedidos        → líder logístico / coordinador logístico
Alistamiento de mercancía   → auxiliar logística
Comprometer mercancía       → líder logístico / coordinador logístico
Facturación del pedido      → líder logístico / coordinador logístico
Cliente en punto            → coordinador logístico
Cliente recoge              → coordinador logístico
Despacho local              → coordinador logístico
Despacho nacional           → líder logístico
Despacho nacional           → líder logístico
Cierre despacho nacional    → coordinador logístico
```

## Prioridad desde ventas

```text
Ventas crea pedido prioritario
↓
Gerencia aprueba o rechaza
↓
Si aprueba, vuelve a recepción de pedidos con prioridad alta
↓
Lo toma logística primero
```

## Caja en facturación

```text
En facturación:
Si es PVC → continúa facturación logística y se define ruta de entrega
Si no es PVC → se releva a caja
Caja confirma el proceso y envía a la ruta de entrega definida
```

## Notificaciones y recordatorios

```text
Caso asignado sin aceptar por más de 10 minutos
Proceso activo por más de 30 minutos
Requerimiento en espera por más de 20 minutos
Sonido de alerta en la app
Notificación del navegador cuando el usuario la activa
```

## Tiempos trazados

```text
Lead Time total
VA por macroproceso
NVA por espera y tiempo muerto
Tiempo de resolución de requerimientos
Handoffs / relevos
Reproceso por requerimientos
FPY
WIP
Cuello de botella por macroproceso
```

## Publicación

Subir todos los archivos a la raíz de GitHub Pages.

Abrir con:

```text
?v=seq3
```

## Primer usuario

Crear en Firebase Authentication y luego en Firestore:

```text
users / UID_DEL_USUARIO
```

Ejemplo:

```json
{
  "name": "Juanes Pérez",
  "email": "correo@empresa.com",
  "role": "admin",
  "isActive": true,
  "createdAt": "2026-05-09T20:00:00.000Z"
}
```
