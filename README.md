# 🎵 Calliope

Calliope es un reproductor de música local diseñado para organizar y escuchar tu biblioteca personal de forma privada y sencilla.

A diferencia de otros reproductores que dependen de servicios externos, Calliope funciona con tu propia colección de música. Seleccionas una carpeta de tu dispositivo y la aplicación crea una biblioteca con tus canciones, álbumes y listas de reproducción.

## 🔒 Privacidad

Tu música es tuya.

Calliope no sube tus archivos a ningún servidor, no necesita una cuenta y no recopila tu biblioteca musical.

La aplicación solo utiliza la carpeta que tú eliges para leer la información necesaria de tus canciones y reproducirlas localmente.

## ✨ Características

- 📁 Selección de una carpeta de música local.
- 🎶 Lectura de información de canciones (título, artista, álbum y portada).
- 💿 Organización por canciones y álbumes.
- 📃 Creación de playlists personalizadas.
- ❤️ Canciones favoritas.
- 👥 Perfiles locales con preferencias y datos personales separados.
- 📦 Importación, exportación y copia JSON de perfiles.
- ▶️ Reproductor con cola de reproducción.
- 💾 Guardado de biblioteca y configuración entre sesiones.

## Perfiles musicales y copias JSON

Los perfiles reutilizan el almacén IndexedDB existente. Cada perfil conserva su
identificador estable, preferencias del reproductor, listas (incluidos
favoritos), valoraciones, historial y métricas. Las listas, el historial, las
valoraciones y las estadísticas se leen y escriben usando el ID del perfil.
Los favoritos antiguos que estaban duplicados en la caché global de canciones
se migran una sola vez a una lista de perfil y se dejan de persistir como
metadato global.

La biblioteca física, sus referencias de canciones y la caché de metadatos
musicales siguen siendo compartidas en la instalación: moverlas a un espacio
por perfil requeriría una migración distinta y podría duplicar o perder
metadatos existentes. Los datos globales de perfiles artísticos y portadas
personalizadas de artistas también permanecen en su almacén actual y no se
incluyen en el respaldo personal. Las imágenes binarias, credenciales, rutas de
acceso y archivos de audio no se exportan.

El documento JSON usa `format: "calliope-profile"` y `formatVersion: 3`.
Incluye ID estable, nombre visible, username normalizado y preferencias del perfil, listas/favoritos, valoraciones,
métricas e historial. Incluye la foto de perfil y portadas personalizadas de
playlists cuando son imágenes rasterizadas compatibles; imágenes locales se
incrustan en el JSON y las URLs HTTP(S) se conservan como referencias. Cada
imagen incrustada está limitada a 5 MiB y el archivo completo a 25 MiB. No se
incluyen imágenes de la biblioteca musical compartida. Las entradas de historial
conservan sus campos propios de presentación (título, artista/subtítulo,
duración, fecha, contador y tipo de publicación) además de las referencias;
así siguen siendo legibles aunque la canción todavía no esté disponible en el
dispositivo. No se exporta la caché compartida de metadatos ni las portadas
musicales del historial. Los eventos, las valoraciones y la cola conservan
referencias a canciones, no copias de sus metadatos. Los títulos de listas sí
se conservan porque son datos creados por el usuario. Las referencias de canciones y álbumes se serializan
como identificadores opacos deterministas derivados de los IDs internos, para
no exponer rutas locales; al importar, se resuelven únicamente comparándolos
con los IDs actuales de la biblioteca, nunca por nombre o ruta. Las estadísticas
de artistas y álbumes usan claves opacas y conservan sus contadores, no sus
nombres. Los resúmenes de canciones guardan sus contadores asociados a la
referencia opaca, sin títulos ni portadas.
Los perfiles artísticos y sus portadas personalizadas se almacenan actualmente
como ajustes globales, no como datos de un perfil, y no se exportan.

La importación valida estructura, tamaño e identidad antes de escribir. La identidad
se resuelve por ID y username único; el nombre visible puede repetirse. Una
restauración del mismo ID requiere confirmación, un username ocupado permite
proponer otro si el ID está libre y una colisión entre dos perfiles distintos
se detiene sin modificar ninguno. Los archivos antiguos sin username conservan
sus datos y requieren completar uno al importarse como perfil nuevo; los perfiles
locales antiguos quedan marcados para completar el campo desde el perfil.
Los archivos v1
anteriores se migran al formato reducido: se eliminan sus metadatos de
biblioteca y los campos musicales duplicados, conservando las referencias y
los contadores existentes. Un perfil nuevo obtiene un ID local distinto; la
importación conserva el ID del archivo si está disponible; la actualización reemplaza sus datos personales en una transacción IndexedDB y
no abre ni modifica el almacén de metadatos compartidos. Las referencias se
comparan solo por ID estable; las que no existen en la biblioteca de destino
se conservan como referencias opacas pendientes y se vuelven a resolver cuando
se selecciona una biblioteca. No se vinculan a otra canción por nombre o ruta.

La copia externa conserva la estructura
`profile_data/<nombre-del-perfil>/profile_data.json`, pero solo se escribe
cuando el usuario solicita expresamente «Exportar perfil» o «Actualizar copia
externa». Los cambios de las stores se guardan en IndexedDB y marcan la copia
como pendiente; no hay sincronización automática ni tareas en segundo plano.
La operación manual verifica el archivo y evita reemplazar una copia
perteneciente a otro ID. Si se pierde el permiso o falla la escritura, los datos
internos permanecen intactos y Ajustes informa del estado. Tras renombrar un
perfil, la ubicación externa solo cambia en la siguiente exportación manual.

La web utiliza File System Access API solo cuando está disponible y autorizado;
en caso contrario conserva el perfil en IndexedDB y permite exportar JSON de
forma manual. Android usa el selector SAF de carpetas existente y solicita
acceso de lectura/escritura persistente. Si el proveedor SAF no admite
reemplazos seguros, la actualización manual de la copia externa falla sin
alterar los datos internos; la exportación manual permite elegir un destino. Eliminar un perfil borra sus
datos internos personales y su asociación local, pero no elimina la copia JSON
externa ni modifica archivos de música.

La carpeta musical se recuerda localmente por ID de perfil, junto con los
permisos que la plataforma pueda conservar. No se incluye su ruta ni URI en el
JSON portable. Restaurar un perfil existente en el mismo dispositivo conserva
su asociación local; un perfil importado como nuevo tendrá que seleccionar y
autorizar su carpeta en ese dispositivo. Las asociaciones globales antiguas se
migran una sola vez al primer perfil que las recupere, para evitar compartirlas
accidentalmente con perfiles posteriores.

La pantalla de bienvenida permite importar un perfil JSON. Si no coincide el ID
ni el username, crea el perfil con el ID del archivo y lo activa al terminar. Si
el ID ya existe, solicita confirmación antes de reemplazar transaccionalmente
sus listas, favoritos, preferencias, cola, valoraciones, historial y métricas.
Los conflictos de username permiten cambiarlo para la importación solo cuando
el ID no pertenece a otro perfil. La biblioteca compartida no se modifica.
Desde Perfil → Ajustes, «Exportar perfil» guarda los cambios pendientes y
actualiza la copia JSON asociada únicamente por acción manual; si no hay carpeta
disponible, informa que los datos siguen guardados internamente.

## 🚀 Sobre el proyecto
Calliope nace con la idea de recuperar la experiencia de tener una biblioteca musical propia, ofreciendo una interfaz moderna sin depender de plataformas externas.

Actualmente es una aplicación web desarrollada con tecnologías modernas, con la intención de evolucionar en el futuro hacia una aplicación móvil.

## 📌 Sobre el uso de la música

Calliope es un reproductor de música local. La aplicación no proporciona canciones, no incluye servicios de descarga y no almacena archivos en servidores externos.

El usuario es responsable de utilizar archivos de audio obtenidos de forma legal y sobre los que tenga los derechos o permisos necesarios.

Calliope únicamente lee la biblioteca musical seleccionada por el usuario y organiza la información disponible en sus archivos.