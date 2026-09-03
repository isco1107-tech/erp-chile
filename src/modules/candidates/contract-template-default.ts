/**
 * Texto inicial sugerido para la plantilla `CANDIDATE_CONTRACT`, transcrito
 * del contrato real que entregó la directora (plantilla genérica de
 * participación en certamen de belleza, con nota de que debe revisarla un
 * abogado antes de usarla — esa responsabilidad es de la empresa, no del
 * sistema). Los campos con dato real disponible quedan como
 * `{{variable}}` (ver `DOCUMENT_TEMPLATE_VARIABLES.CANDIDATE_CONTRACT`); los
 * campos entre `[CORCHETES]` son decisiones de negocio/legales (plazos,
 * franquicia licenciante, seguro, edades, premios) que la directora completa
 * una vez en el editor antes de usarla — no se inventan valores acá.
 *
 * Formato de línea que interpreta `contract-pdf.service.ts`:
 * `# ` título principal, `## ` título de cláusula, `- ` ítem de lista,
 * `> ` línea de recuadro de nota, línea vacía = separador de párrafo.
 */
export const CANDIDATE_CONTRACT_DEFAULT_TEMPLATE = `# CONTRATO DE PARTICIPACIÓN EN CERTAMEN DE BELLEZA
PROCESO CLASIFICATORIO — SEDE [CIUDAD], [REGIÓN]
{{projectName}}

> NOTA PARA QUIEN UTILICE ESTA PLANTILLA: Este documento es una plantilla general de contrato civil de participación, redactada conforme a prácticas habituales de certámenes de belleza y a la legislación chilena vigente. No constituye asesoría legal para un caso concreto. Antes de usarla debe: (1) completar todos los campos entre corchetes [ ]; (2) verificar que la entidad organizadora cuenta con la licencia o autorización vigente del titular de la marca "Miss Universo" / "Miss Universe" y de su franquicia nacional para usar ese nombre y esas insignias en esta sede; y (3) hacerla revisar por un abogado o abogada habilitado en Chile antes de su firma, especialmente si participan menores de edad.

## COMPARECENCIA

En [CIUDAD], [REGIÓN], República de Chile, a {{date}}, comparecen:

De una parte, {{organizationName}}, Rol Único Tributario N.° {{organizationRut}}, representada legalmente para estos efectos por don/doña [NOMBRE DEL REPRESENTANTE LEGAL], cédula de identidad N.° [RUT REPRESENTANTE], ambos domiciliados en [DIRECCIÓN], comuna de [CIUDAD] (en adelante, "LA ORGANIZACIÓN"); y

De la otra parte, doña {{candidateName}}, de nacionalidad [NACIONALIDAD], cédula de identidad o pasaporte N.° {{candidateRut}}, con domicilio en [DIRECCIÓN], comuna de [COMUNA], [REGIÓN] (en adelante, "LA CANDIDATA").

En caso de que LA CANDIDATA sea menor de edad, comparece también, autorizando y obligándose solidariamente en los términos de la Cláusula Décimo Segunda, su padre, madre o representante legal, cuyos datos se consignan en el bloque de firma correspondiente.

LA ORGANIZACIÓN y LA CANDIDATA se denominarán conjuntamente "LAS PARTES", quienes exponen lo siguiente:

## ANTECEDENTES

PRIMERO: Que LA ORGANIZACIÓN es la entidad encargada de organizar, coordinar y desarrollar esta etapa o sede del certamen de belleza {{projectName}} (en adelante, "EL CERTAMEN"), instancia clasificatoria dentro del proceso de selección de la candidata que optará a representar a [REGIÓN / PAÍS] en etapas posteriores del proceso Miss Universo, para lo cual LA ORGANIZACIÓN declara contar con la licencia, autorización o franquicia vigente otorgada por [ENTIDAD LICENCIANTE, p. ej. Miss Universo Chile / Miss Universe Organization], según consta en [documento de referencia de la licencia].

SEGUNDO: Que LA CANDIDATA ha manifestado su voluntad libre, informada y espontánea de participar en EL CERTAMEN, declarando conocer y aceptar íntegramente sus bases, el reglamento interno (Anexo N.° 5) y el presente contrato.

TERCERO: Que, en mérito de lo anterior, LAS PARTES acuerdan celebrar el presente contrato de participación en certamen de belleza (en adelante, "EL CONTRATO"), el que se regirá por las cláusulas siguientes:

## CLÁUSULA PRIMERA: OBJETO DEL CONTRATO

EL CONTRATO tiene por objeto regular los derechos y obligaciones de LAS PARTES durante todo el proceso de preparación, desarrollo y etapas posteriores de EL CERTAMEN, incluyendo, sin limitarse a ello, la participación de LA CANDIDATA en actividades de formación (oratoria, pasarela, protocolo, acondicionamiento físico), sesiones fotográficas y audiovisuales, actividades de proyección social, entrevistas con el jurado, eventos promocionales y la gala final, así como —en caso de resultar electa— el ejercicio de su reinado o representación durante el período que corresponda.

## CLÁUSULA SEGUNDA: REQUISITOS DE ELEGIBILIDAD Y DECLARACIONES DE LA CANDIDATA

LA CANDIDATA declara y garantiza que, a la fecha de suscripción de EL CONTRATO, cumple los siguientes requisitos:

- Tener entre [EDAD MÍNIMA, sugerido 18] y [EDAD MÁXIMA, si aplica] años cumplidos a la fecha de la gala final, o encontrarse debidamente autorizada conforme a la Cláusula Décimo Segunda si es menor de edad;
- Poseer nacionalidad chilena o residencia legal vigente en Chile, y acreditar el vínculo con la región que exijan las bases del certamen;
- No haber sido condenada por crimen o simple delito que merezca pena aflictiva, ni encontrarse formalizada por hechos incompatibles con la naturaleza del certamen;
- No mantener vínculo contractual vigente de representación exclusiva con otro certamen de belleza de alcance regional, nacional o internacional;
- Gozar de un estado de salud física y psicológica compatible con las exigencias del certamen, lo que acreditará mediante certificado médico (Anexo N.° 3);
- No haber sido descalificada previamente de un certamen afiliado al proceso Miss Universo por incumplimiento grave de sus normas;
- Haber proporcionado a LA ORGANIZACIÓN información veraz, completa y actualizada en su ficha de inscripción.

Conforme a los estándares vigentes del proceso Miss Universo, no se exige a LA CANDIDATA acreditar un estado civil determinado, ausencia de hijos o hijas, ni límite máximo de edad salvo el que fijen expresamente las bases del certamen; cualquier restricción de esa naturaleza deberá revisarse conforme a la normativa chilena antidiscriminación vigente al momento de aplicar esta plantilla.

LA ORGANIZACIÓN podrá verificar en cualquier momento el cumplimiento de estos requisitos. La falsedad, inexactitud u omisión relevante en lo declarado constituirá causal de descalificación inmediata, sin derecho a indemnización alguna a favor de LA CANDIDATA, conforme a la Cláusula Décima.

## CLÁUSULA TERCERA: OBLIGACIONES DE LA CANDIDATA

LA CANDIDATA se obliga a:

- Asistir puntualmente a la totalidad de los ensayos, capacitaciones, sesiones fotográficas o de video, entrevistas, actividades de proyección social y demás actividades oficiales que LA ORGANIZACIÓN calendarice, salvo causa justificada comunicada con la debida antelación;
- Mantener en todo momento una conducta acorde a la dignidad del certamen, absteniéndose de actos que afecten la imagen, el prestigio o la reputación de LA ORGANIZACIÓN, sus patrocinadores, autoridades, otras candidatas o del certamen en general;
- Abstenerse de realizar declaraciones públicas o en redes sociales que resulten ofensivas, discriminatorias, difamatorias o contrarias al reglamento del certamen;
- No participar simultáneamente, durante la vigencia de EL CONTRATO, en otro certamen de belleza de carácter regional, nacional o internacional, salvo autorización expresa y por escrito de LA ORGANIZACIÓN;
- Informar oportunamente cualquier cambio relevante en su situación personal, de salud, académica o legal que pueda afectar su participación;
- Cuidar y restituir en buen estado el vestuario, accesorios, banda y demás bienes que LA ORGANIZACIÓN le entregue para su uso durante EL CERTAMEN, salvo el desgaste propio de su uso normal;
- Cumplir el reglamento interno del certamen (Anexo N.° 5), que forma parte integrante e indivisible de EL CONTRATO.

## CLÁUSULA CUARTA: OBLIGACIONES DE LA ORGANIZACIÓN

LA ORGANIZACIÓN se obliga a:

- Proporcionar a LA CANDIDATA la capacitación, asesoría de imagen y demás medios razonablemente necesarios para su preparación y participación;
- Informar con antelación razonable el calendario de actividades y cualquier modificación relevante a este;
- Contratar, a su costo, un seguro de accidentes personales que cubra a LA CANDIDATA durante las actividades oficiales del certamen, con la compañía y cobertura que se detallan en [detallar aseguradora, N.° de póliza y cobertura];
- Cubrir los costos de [detallar ítems que asume la organización, p. ej. vestuario oficial, transporte a actividades, alojamiento en la gala], quedando a cargo de LA CANDIDATA los gastos de [detallar ítems que no cubre, p. ej. vestuario personal, insumos de cuidado personal];
- Respetar la dignidad, integridad física y psicológica, y los derechos fundamentales de LA CANDIDATA durante todas las instancias del certamen;
- Entregar a LA CANDIDATA copia íntegra de EL CONTRATO, sus anexos y el reglamento del certamen, debidamente suscritos por ambas partes.

## CLÁUSULA QUINTA: AUTORIZACIÓN DE USO DE IMAGEN, VOZ Y DATOS PERSONALES

LA CANDIDATA autoriza expresa, libre e informadamente a LA ORGANIZACIÓN para captar, fijar, reproducir y difundir su imagen, voz, nombre y biografía en fotografías, videos, transmisiones en vivo y material gráfico o digital, con fines exclusivos de promoción, difusión y desarrollo de EL CERTAMEN y de sus patrocinadores oficiales, en Chile y en el extranjero, por los siguientes medios: [televisión, radio, prensa escrita, sitios web, redes sociales oficiales, vía pública, material de patrocinadores, etc.], durante la vigencia de EL CONTRATO y por un período adicional de [PLAZO, p. ej. 24 meses] contado desde su término.

Esta autorización es gratuita respecto de los usos aquí descritos, no implica cesión de derechos de autor sobre obras derivadas ni habilita usos con fines distintos a los señalados; en especial, no autoriza usos degradantes, difamatorios, sexualizados o contrarios a la dignidad de LA CANDIDATA. Toda utilización adicional o con fines comerciales directos de terceros ajenos al certamen requerirá autorización específica y por escrito de LA CANDIDATA, la que podrá pactarse en condiciones económicas separadas.

El tratamiento de los datos personales de LA CANDIDATA se sujetará a la Ley N.° 19.628 sobre Protección de la Vida Privada y demás normativa vigente. LA ORGANIZACIÓN adoptará además, en forma anticipada, las medidas de adecuación pertinentes a la Ley N.° 21.719 sobre Protección de Datos Personales. LA CANDIDATA podrá ejercer sus derechos de acceso, rectificación, cancelación, oposición y portabilidad mediante comunicación escrita dirigida a [correo electrónico o domicilio de contacto de LA ORGANIZACIÓN].

El detalle específico de medios, plazos y patrocinadores autorizados se consigna en el Anexo N.° 4 (Autorización específica de uso de imagen), que LA CANDIDATA suscribe conjuntamente con EL CONTRATO.

## CLÁUSULA SEXTA: CÓDIGO DE CONDUCTA

Durante la vigencia de EL CONTRATO, LA CANDIDATA se obliga a abstenerse de:

- Consumir alcohol, tabaco o sustancias sujetas a control legal durante actividades oficiales del certamen, o presentarse a ellas bajo sus efectos;
- Incurrir en actos de acoso, discriminación, violencia o maltrato hacia otras candidatas, integrantes del jurado, staff, patrocinadores o público;
- Utilizar la banda, corona, título o insignias del certamen para fines ajenos a los autorizados por LA ORGANIZACIÓN, o para promover productos, servicios o causas sin autorización previa;
- Divulgar información reservada del certamen conforme a la Cláusula Novena.

El incumplimiento de este código de conducta se sujetará al procedimiento y a las consecuencias establecidas en la Cláusula Décima.

## CLÁUSULA SÉPTIMA: SALUD Y SEGURIDAD

LA CANDIDATA declara no padecer condiciones de salud que le impidan participar en las actividades del certamen y se obliga a informar por escrito, con carácter previo, cualquier alergia, condición médica preexistente o tratamiento en curso, según el formulario del Anexo N.° 3. LA ORGANIZACIÓN se obliga a disponer de asistencia médica básica durante los ensayos y la gala final, y a suspender la participación de LA CANDIDATA en cualquier actividad que represente un riesgo cierto para su salud, sin que ello constituya incumplimiento de EL CONTRATO por parte de LA ORGANIZACIÓN.

## CLÁUSULA OCTAVA: NATURALEZA CIVIL DEL VÍNCULO Y ASPECTOS ECONÓMICOS

- EL CONTRATO tiene naturaleza civil y no constituye relación laboral entre LAS PARTES, por lo que no genera remuneración, cotizaciones previsionales ni prestaciones propias del Código del Trabajo, sin perjuicio de que LAS PARTES puedan suscribir, en forma separada y expresa, un contrato de trabajo o de prestación de servicios si la naturaleza de una actividad específica así lo requiriese;
- Los premios, distinciones o beneficios que correspondan a la ganadora y a las finalistas de EL CERTAMEN se detallan en el reglamento interno (Anexo N.° 5), incluyendo [detallar: monto, especie, viajes, becas, contrato de representación, etc.];
- Los gastos de inscripción, si los hubiere, y demás condiciones económicas de la participación se detallan en [documento de inscripción / bases del certamen].

## CLÁUSULA NOVENA: CONFIDENCIALIDAD

LAS PARTES se obligan a mantener reserva sobre la información no pública relativa al proceso de calificación, los criterios y deliberaciones del jurado, y los datos personales de otras candidatas a los que tengan acceso con ocasión de EL CERTAMEN, absteniéndose de divulgarlos a terceros o en redes sociales.

## CLÁUSULA DÉCIMA: CAUSALES DE DESCALIFICACIÓN Y TÉRMINO ANTICIPADO

Constituyen causales de descalificación de LA CANDIDATA y de término anticipado de EL CONTRATO, sin derecho a indemnización:

- La falsedad o inexactitud relevante en las declaraciones formuladas conforme a la Cláusula Segunda;
- El incumplimiento grave o reiterado de las obligaciones establecidas en las Cláusulas Tercera y Sexta;
- La comisión de un delito o de actos que afecten gravemente la imagen o reputación del certamen, de LA ORGANIZACIÓN o de sus patrocinadores;
- La renuncia voluntaria de LA CANDIDATA, comunicada por escrito con al menos [PLAZO] días de anticipación;
- El mutuo acuerdo de LAS PARTES.

Salvo en casos de urgencia justificada, LA ORGANIZACIÓN comunicará por escrito a LA CANDIDATA los hechos que motivan una eventual descalificación y le otorgará un plazo razonable, no inferior a [PLAZO, p. ej. 5 días hábiles], para presentar sus descargos antes de adoptar una decisión definitiva, dejando constancia escrita de lo resuelto. Declarada la descalificación, LA CANDIDATA deberá restituir a LA ORGANIZACIÓN los bienes, vestuario e insignias que le hayan sido entregados, dentro de los [PLAZO] días siguientes.

## CLÁUSULA UNDÉCIMA: EFECTOS DE RESULTAR ELECTA

En caso de que LA CANDIDATA resulte ganadora de esta sede y sea designada para representar a [REGIÓN] en la etapa nacional del proceso Miss Universo, LAS PARTES dejan constancia de que:

- Durante el período de su reinado local, LA CANDIDATA se obliga a asistir a las actividades de representación, proyección social y promoción que LA ORGANIZACIÓN le asigne dentro de la región, en los términos y condiciones que se detallen en el reglamento interno (Anexo N.° 5);
- Los derechos, obligaciones y condiciones económicas correspondientes a la etapa nacional o internacional del proceso Miss Universo serán materia de un contrato o autorización separada entre LA CANDIDATA y la entidad titular de la franquicia nacional respectiva, no siendo LA ORGANIZACIÓN responsable de las condiciones que en dicha instancia se pacten;
- LA ORGANIZACIÓN facilitará a LA CANDIDATA la información y contacto necesarios para dicha etapa, sin que ello implique responsabilidad solidaria respecto de obligaciones asumidas ante terceros.

## CLÁUSULA DÉCIMO SEGUNDA: PARTICIPACIÓN DE MENORES DE EDAD

En caso de que las bases del certamen permitan la participación de candidatas menores de 18 años, su padre, madre o representante legal deberá comparecer y suscribir EL CONTRATO y el Anexo N.° 2 (Autorización de representante legal), declarando conocer y aceptar sus términos, autorizar la participación de la menor y las autorizaciones de imagen de la Cláusula Quinta, y obligándose solidariamente con ella respecto del cumplimiento de las obligaciones que le sean exigibles conforme a la ley. LA ORGANIZACIÓN adoptará medidas reforzadas de protección y acompañamiento respecto de las candidatas menores de edad, incluyendo la presencia de un adulto responsable designado en las actividades que correspondan.

## CLÁUSULA DÉCIMO TERCERA: PROPIEDAD INTELECTUAL

Las marcas, logotipos, título, corona, banda y demás elementos distintivos del certamen y del proceso Miss Universo son de propiedad o uso autorizado de LA ORGANIZACIÓN y/o de sus licenciantes. LA CANDIDATA no adquiere, por su participación, derecho de propiedad alguno sobre dichos elementos, y su uso posterior a la vigencia de EL CONTRATO, o fuera de las actividades autorizadas, requerirá autorización previa y escrita.

## CLÁUSULA DÉCIMO CUARTA: CASO FORTUITO O FUERZA MAYOR

Ninguna de LAS PARTES incurrirá en responsabilidad por el incumplimiento total o parcial de sus obligaciones cuando este derive de caso fortuito o fuerza mayor en los términos del artículo 45 del Código Civil, debiendo la parte afectada notificar a la otra a la brevedad posible y adoptar las medidas razonables para mitigar sus efectos.

## CLÁUSULA DÉCIMO QUINTA: MODIFICACIONES

Toda modificación a EL CONTRATO deberá constar por escrito y ser suscrita por LAS PARTES (y por el representante legal, si LA CANDIDATA fuere menor de edad), no produciendo efecto alguno los acuerdos verbales.

## CLÁUSULA DÉCIMO SEXTA: LEY APLICABLE Y RESOLUCIÓN DE CONTROVERSIAS

EL CONTRATO se rige e interpreta conforme a las leyes de la República de Chile. LAS PARTES procurarán resolver amistosamente cualquier controversia derivada de EL CONTRATO. De no lograrse acuerdo dentro de [PLAZO, p. ej. 15 días corridos], la controversia será sometida al conocimiento de los tribunales ordinarios de justicia con asiento en [CIUDAD].

## CLÁUSULA DÉCIMO SÉPTIMA: VIGENCIA Y DOMICILIO

EL CONTRATO entra en vigencia en la fecha de su suscripción y se extiende hasta [fecha de término del certamen / cumplimiento íntegro de las obligaciones asumidas, incluida la entrega de premios]. Para todos los efectos legales derivados de EL CONTRATO, LAS PARTES fijan domicilio en [CIUDAD] y se someten a la competencia de sus tribunales.

En señal de conformidad, LAS PARTES suscriben EL CONTRATO en [N.° de ejemplares] ejemplares de igual tenor y fecha, quedando uno en poder de cada parte.

## ANEXOS QUE FORMAN PARTE INTEGRANTE DE EL CONTRATO

- Anexo N.° 1: Declaración jurada simple de cumplimiento de requisitos de elegibilidad.
- Anexo N.° 2: Autorización de padre, madre o representante legal (candidatas menores de edad).
- Anexo N.° 3: Ficha médica y declaración de salud, alergias y contactos de emergencia.
- Anexo N.° 4: Autorización específica de uso de imagen, voz y datos personales (medios y patrocinadores).
- Anexo N.° 5: Reglamento interno del certamen (requisitos de admisión, sistema de puntaje, jurado y causales de descalificación).`;
