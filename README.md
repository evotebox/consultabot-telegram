# consultabot-telegram

consultaBOT es un bot de Telegram (es decir, una aplicación de Telegram) diseñado para permitir la participacion en una consulta telemática de forma anónima, segura, fiable, transparente y libre.

** Resumen de características de consultaBOT:

1. Sistema de votación anónimo.
2. Verificación de participantes a través de correo electrónico.
3. Cifrado de información de verificación.
4. Transparencia y fiabilidad de los resultados mediante réplica en múltiples localizaciones y envío de información en tiempo real a las personas interventoras.
5. Código abierto para garantizar su auditabilidad.
6. Publicado con licencia GNU-GPL para permitir su reutilización.

** Características de consultaBOT:

- Objetivo: Permite al usuario la participación en una consulta compuesta por una o más preguntas (pudiendo plantearse un "itinerario" de preguntas diferente según las respuestas que vaya dando el participante).

- Anonimidad: Las respuestas dadas a la consulta se almacenan de forma anónima. En ningún momento se asocian las respuestas dadas al participante.

- Verificación de participantes: Se verifica que un usuario puede participar a través del envío de un código a su correo electrónico. De este modo, se puede restringir la participación a una lista dada de direcciones de correo electrónico, o a todas las direcciones de correo electrónico de un dominio o subdominio concreto (por ejemplo, participación restringida a los miembros de una organización que tiene un dominio o subdominio propio para sus cuentas de correo electrónico).

- Verificación de voto único: Se verifica que un usuario solo participa una vez a través del almacenamiento de su dirección de correo electrónico (o parte de ella) de forma cifrada. Nadie, ni siquiera el organizador de la consulta, puede descifrar las direcciones de correo electrónico almacenadas.

- Protección de datos: El bot permite mostrar al usuario la política de protección de datos planteada por el organizador. Por defecto, el único dato personal que se almacena es (parte de) la dirección de correo electrónico del participante (para verificar que el voto es único). Este dato se almacena de forma cifrada, de forma que nadie, ni siquiera el organizador de la consulta, pueda descifrar las direcciones de correo electrónico almacenadas. El fichero de direcciones de correo electrónico cifradas puede suprimirse en el momento de la finalización del período de la consulta, con lo que no se conserva ningún dato personal.

- Fiabilidad: El fichero de respuestas de la consulta se replicará en múltiples servidores (para impedir manipulaciones).

- Transparencia: El bot permite la participación de interventores en la consulta; los interventores reciben prueba de cada voto emitido, para poder verificar que el número de votos contados se ajusta al de emitidos. La participación y los resultados pueden publicarse en tiempo real y/o en el momento de finalizar la consulta.

- Auditabilidad: La publicación con licencia de código abierto garantiza su auditabilidad.

- Personalización: El organizador de la consulta puede personalizar el código del bot para adaptarlo a las necesidades de la consulta: preguntas, respuestas, quién puede participar, política de protección de datos...

** Uso de consultaBOT para participar en una consulta:

El participante solo necesita acceder a Telegram, buscar el bot de la consulta (por el nombre del bot) y seguir las instrucciones que recibirá del bot:

1. El bot mostrará la política de protección de datos. Al aceptar iniciar el bot, el participante acepta la política de protección de datos.
2. El bot pedirá el correo electrónico del participante para que este lo introduzca. El bot comprobará que la dirección de correo electrónico esté entre las permitidas, y que el participante no haya votado antes. El bot enviará un código de verificación al correo electrónico del participante.
3. El participante introducirá el código de verificación recibido. El bot comprobará que sea correcto.
4. El bot planteará las preguntas de la consulta. El participante elegirá sus respuestas.
5. El bot repetirá las respuestas recibidas para que el participante confirme que sean correctas.

** Uso de consultaBOT para organizar una consulta:

El organizador de la consulta puede personalizar el código del bot para definir quién puede participar en la consulta.

El organizador deberá disponer de los siguientes medios para plantear su consulta:

- El código de consultaBOT (personalizado para su consulta).
- Un servidor (o más, para réplicas) en el que alojar el bot durante la consulta.
- Alguna forma de enviar mensajes (de correo electrónico) automáticos a los participantes (para enviarles su código de verificación).

** Origen de consultaBOT:

consultaBOT fue desarrollado por civic hackers para la "Consulta sobre el model d'estat a la Universitat Politècnica de València" (13D 2018) organizada por la Plataforma pel referèndum sobre el model d'estat a la Universitat Politècnica de València (http://twitter.com/ReferendumUPV). El bot nació para permitir la realización de una consulta organizada por y para la comunidad universitaria de la UPV, de forma telemática, anónima, segura, fiable, transparente y libre.

** Licencia de consultaBOT:

El código de consultaBOT se publica con licencia libre GNU GPL 3.0 para permitir su auditabilidad y su adaptación para el uso en cualquier consulta.
