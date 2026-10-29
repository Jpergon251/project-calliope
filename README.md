# 🎵 Calliope

Calliope es un reproductor de música local diseñado para organizar y escuchar tu biblioteca personal de forma privada y sencilla.

A diferencia de otros reproductores que dependen de servicios externos, Calliope funciona con tu propia colección de música. Seleccionas una carpeta de tu dispositivo y la aplicación crea una biblioteca con tus canciones, álbumes y listas de reproducción.

## 🔒 Privacidad

Tu música es tuya.

Calliope no sube tus archivos a ningún servidor, no necesita una cuenta y no recopila tu biblioteca musical.

La aplicación solo utiliza la carpeta que tú eliges para leer la información
necesaria de tus canciones y reproducirlas localmente. Opcionalmente, si
vinculas Google Drive y pulsas guardar, sube únicamente el JSON portátil del
perfil; nunca sube canciones.

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

### Copias manuales en Google Drive

Cada perfil local puede vincular una cuenta de Google independiente desde la
pantalla de bienvenida o Perfil → Ajustes. La vinculación y los IDs técnicos de
Drive se guardan en IndexedDB bajo el ID estable del perfil; los tokens OAuth
solo permanecen en memoria y nunca se incluyen en el archivo portable. Google
Drive no se modifica al conectar o desvincular una cuenta. Guardar y restaurar
son acciones manuales y requieren autorización vigente.
Desvincular elimina la asociación local de ese perfil, pero no borra el archivo
remoto ni revoca permisos de Google que puedan estar compartidos con otros
perfiles de la misma instalación; el usuario puede retirar el permiso desde su
cuenta de Google.

La copia usa exactamente el exportador `calliope-profile` existente y se
organiza como
`Calliope/profiles/<nombre del perfil>/<username>_profile_data.json`, usando
el username normalizado del perfil. Las copias anteriores llamadas
`profile_data.json` se reconocen y se actualizan por su mismo ID, cambiando
su nombre junto con el contenido validado. Si hay más de un archivo candidato,
la operación se detiene sin sobrescribir ni borrar ninguno.
Restaurar valida el archivo y la identidad por ID y username, muestra un resumen
y requiere confirmación antes de reemplazar los datos personales del perfil.
No se descargan canciones ni se reemplaza la biblioteca compartida.

Para desarrollo, copia `.env.example` a `.env` y define
`VITE_GOOGLE_CLIENT_ID`. En GitHub Pages define también la variable de
repositorio `VITE_GOOGLE_CLIENT_ID` para el workflow de despliegue. En Google
Cloud habilita Google Drive API, configura la pantalla de consentimiento y
registra un cliente OAuth de tipo aplicación web con los orígenes autorizados
`http://localhost:5173` y el origen HTTPS desplegado (por ejemplo,
`https://jpergon251.github.io`). No se necesita un client secret ni un URI de
redirección para este flujo de Google Identity Services.
Configurar el Client ID por sí solo no habilita la API: debe estar habilitada
en el mismo proyecto de Google Cloud asociado al cliente OAuth. Si Drive devuelve
HTTP 403, Calliope muestra ahora la causa reconocida (API deshabilitada,
permisos, política de organización o cuota) sin exponer credenciales. Tras
cambiar `.env`, reinicia Vite para que cargue el Client ID actualizado.

Se solicita `drive.file` para crear y actualizar los archivos de Calliope, y
`openid email` únicamente para identificar y mostrar qué cuenta está vinculada
a cada perfil. `drive.file` limita las operaciones a elementos creados o
abiertos/seleccionados con esta aplicación; la API no permite descubrir con
certeza carpetas preexistentes creadas manualmente y nunca compartidas con
Calliope. Antes de crear una primera carpeta raíz que no sea visible para la
aplicación, Calliope pide comprobar Drive y confirmarlo, porque continuar puede
crear una segunda carpeta si ya existe otra inaccesible. Para no solicitar
acceso completo al Drive, la integración solo reutiliza carpetas que Google
expone bajo ese alcance, y detiene los casos ambiguos o los IDs registrados
que desaparecen. Android/Capacitor WebView no
usa GIS: por ahora la conexión está limitada a la aplicación web hasta añadir
un flujo OAuth nativo compatible.

## 🚀 Sobre el proyecto
Calliope nace con la idea de recuperar la experiencia de tener una biblioteca musical propia, ofreciendo una interfaz moderna sin depender de plataformas externas.

Actualmente es una aplicación web desarrollada con tecnologías modernas, con la intención de evolucionar en el futuro hacia una aplicación móvil.

## 📌 Sobre el uso de la música

Calliope es un reproductor de música local. La aplicación no proporciona canciones, no incluye servicios de descarga y no almacena archivos en servidores externos.

El usuario es responsable de utilizar archivos de audio obtenidos de forma legal y sobre los que tenga los derechos o permisos necesarios.

Calliope únicamente lee la biblioteca musical seleccionada por el usuario y organiza la información disponible en sus archivos.