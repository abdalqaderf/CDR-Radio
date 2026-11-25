# Solicitud de soporte para Quintastream

**Asunto** · AutoDJ, límites de horario y repetición de un archivo en la estación 12

Hola, equipo de Quintastream:

Tenemos la estación **CDR Radio Demo**, ID **12**, identificador público `cdr_radio_demo`, en el plan gratuito Comienza. La estación usa **UTC** y la API anuncia AzuraCast **0.24.1**. La cuenta puede consultar el perfil, los horarios y el historial. Las rutas de cola, registros y configuración de Liquidsoap devuelven HTTP 403. ¿Podrían revisar los siguientes intervalos del **24 de noviembre de 2026, todos en UTC** y compartir extractos sin credenciales?

| Intervalo UTC | Evidencia que se debe correlacionar |
| --- | --- |
| 20:06:30–20:07:30 | Lista 184, horario 155, historial 45727. El primer `special-alpha` llegó al MP3 público a las **20:06:49.885**. El horario empezaba a las 20:07:00. El historial devolvió 20:06:50. |
| 20:09:30–20:10:30 | Lista 183, horario 154, historial 45752. El bloque diario programado siguiente llegó a las **20:09:57.503**. El horario empezaba a las 20:10:00. El historial devolvió 20:09:58. |
| 20:10:40–20:11:25 | Horario 154, historial 45761–45762. El marcador de la lista diaria 176 llegó 3.932 s después del comienzo del último archivo hablado, de 10.474 s. El audio de ambos archivos se solapó. |
| 20:42:45–20:43:25 | Lista 183, horario 157, historial 46091–46093. Con las transiciones sin fundido y el punto de salida y de inicio del siguiente archivo al final del WAV, un archivo adicional llegó a las **20:43:03.612** tras el cierre a las 20:43:00. La lista diaria 176 volvió a las **20:43:14.163**. El valor público `cued_at` de su siguiente marcador era 20:42:53, con `played_at` previsto a las 20:43:10. |
| 18:56:30–18:57:30 y 19:18:30–19:19:30 | Lista 181, horarios 149 y 150. En cada cierre comenzaron dos archivos especiales adicionales después del límite. |
| 19:31:30–19:34:30 y 19:35:30–19:38:30 | Lista 182, horarios 151 (estándar) y 152 (`merge`), único archivo 1375. Ambos ensayos reprodujeron contenido de la lista diaria 176 durante el bloque especial. La prevención de duplicados de la lista estaba desactivada. |

También tenemos un caso del **25 de noviembre, 04:26:35–04:27:20 UTC**. La API confirmó la lista 185 desactivada y sin horario 160 a las 04:26:54 UTC. El MP3 público reprodujo dos marcadores especiales más y volvió a la lista 176 a las 04:27:07.769 UTC. Correlacionen los registros con los historiales 51300–51301 para identificar cuándo se seleccionaron y enviaron esos archivos a Liquidsoap.

Para cada decisión relevante necesitamos el `sq_id` y su relación con la lista, el horario, el archivo y el historial. Nos ayudarían los registros de AutoDJ a nivel DEBUG, la respuesta de `nextsong`, el acuse `feedback`, y la marca real de inicio o final de Liquidsoap si se conserva. Incluyan las horas de creación de cola, comprobación del horario, reproducción prevista, envío a AutoDJ y confirmación real. Indiquen el motivo de cada selección, rechazo o retorno a la lista 176, el estado `sent_to_autodj` y la zona horaria de los registros. Por favor, confirmen también la revisión exacta de AzuraCast, la versión de Liquidsoap, la profundidad de cola y los ajustes efectivos de cue y crossfade.

¿Hay en nuestro plan gratuito una configuración o versión compatible que permita esperar a que termine el archivo en curso, comenzar el bloque a partir de su hora programada, impedir que un archivo nuevo del bloque empiece desde la hora de cierre y repetir consecutivamente el mismo archivo sin recurrir a la lista diaria? Nos interesa saber si intervinieron la comprobación adelantada de horarios, los elementos ya enviados a AutoDJ o el rechazo de una identidad repetida. Si los registros ya no se conservan, indíquennos qué registro pueden habilitar para un nuevo ensayo controlado y qué ajuste o corrección concreta probarían.

La lista diaria 176 y sus dos archivos están en servicio. Les pedimos conservarlos mientras se diagnostica el problema. Podemos aportar los MP3 de prueba y las marcas UTC si son necesarios. Gracias.
