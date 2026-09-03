export interface ChileRegion {
  name: string;
  code: string;
  comunas: string[];
}

export const regions: ChileRegion[] = [
  {
    name: 'Región de Arica y Parinacota',
    code: 'XV',
    comunas: ['Arica', 'Camarones', 'Putre', 'General Lagos'],
  },
  {
    name: 'Región de Tarapacá',
    code: 'I',
    comunas: ['Iquique', 'Alto Hospicio', 'Pozo Almonte', 'Camiña', 'Colchane', 'Huara', 'Pica'],
  },
  {
    name: 'Región de Antofagasta',
    code: 'II',
    comunas: [
      'Antofagasta', 'Mejillones', 'Sierra Gorda', 'Taltal', 'Calama',
      'Ollagüe', 'San Pedro de Atacama', 'Tocopilla', 'María Elena',
    ],
  },
  {
    name: 'Región de Atacama',
    code: 'III',
    comunas: [
      'Copiapó', 'Caldera', 'Tierra Amarilla', 'Chañaral', 'Diego de Almagro',
      'Vallenar', 'Freirina', 'Huasco', 'Alto del Carmen',
    ],
  },
  {
    name: 'Región de Coquimbo',
    code: 'IV',
    comunas: [
      'La Serena', 'Coquimbo', 'Andacollo', 'La Higuera', 'Paiguano', 'Vicuña',
      'Illapel', 'Canela', 'Los Vilos', 'Salamanca',
      'Ovalle', 'Combarbalá', 'Monte Patria', 'Punitaqui', 'Río Hurtado',
    ],
  },
  {
    name: 'Región de Valparaíso',
    code: 'V',
    comunas: [
      'Valparaíso', 'Casablanca', 'Concón', 'Juan Fernández', 'Puchuncaví', 'Quintero', 'Viña del Mar',
      'Isla de Pascua',
      'Los Andes', 'Calle Larga', 'Rinconada', 'San Esteban',
      'La Ligua', 'Cabildo', 'Papudo', 'Petorca', 'Zapallar',
      'Quillota', 'Calera', 'Hijuelas', 'La Cruz', 'Nogales',
      'San Antonio', 'Algarrobo', 'Cartagena', 'El Quisco', 'El Tabo', 'Santo Domingo',
      'San Felipe', 'Catemu', 'Llaillay', 'Panquehue', 'Putaendo', 'Santa María',
      'Quilpué', 'Limache', 'Olmué', 'Villa Alemana',
    ],
  },
  {
    name: 'Región del Libertador General Bernardo O’Higgins',
    code: 'VI',
    comunas: [
      'Rancagua', 'Codegua', 'Coinco', 'Coltauco', 'Doñihue', 'Graneros', 'Las Cabras',
      'Machalí', 'Malloa', 'Mostazal', 'Olivar', 'Peumo', 'Pichidegua',
      'Quinta de Tilcoco', 'Rengo', 'Requínoa', 'San Vicente',
      'Pichilemu', 'La Estrella', 'Litueche', 'Marchihue', 'Navidad', 'Paredones',
      'San Fernando', 'Chépica', 'Chimbarongo', 'Lolol', 'Nancagua', 'Palmilla',
      'Peralillo', 'Placilla', 'Pumanque', 'Santa Cruz',
    ],
  },
  {
    name: 'Región del Maule',
    code: 'VII',
    comunas: [
      'Talca', 'Constitución', 'Curepto', 'Empedrado', 'Maule', 'Pelarco', 'Pencahue',
      'Río Claro', 'San Clemente', 'San Rafael',
      'Cauquenes', 'Chanco', 'Pelluhue',
      'Curicó', 'Hualañé', 'Licantén', 'Molina', 'Rauco', 'Romeral', 'Sagrada Familia', 'Teno', 'Vichuquén',
      'Linares', 'Colbún', 'Longaví', 'Parral', 'Retiro', 'San Javier', 'Villa Alegre', 'Yerbas Buenas',
    ],
  },
  {
    name: 'Región de Ñuble',
    code: 'XVI',
    comunas: [
      'Chillán', 'Bulnes', 'Chillán Viejo', 'El Carmen', 'Pemuco', 'Pinto', 'Quillón', 'San Ignacio', 'Yungay',
      'Cobquecura', 'Coelemu', 'Ninhue', 'Portezuelo', 'Quirihue', 'Ránquil', 'Treguaco',
      'San Carlos', 'Coihueco', 'Ñiquén', 'San Fabián', 'San Nicolás',
    ],
  },
  {
    name: 'Región del Biobío',
    code: 'VIII',
    comunas: [
      'Concepción', 'Coronel', 'Chiguayante', 'Florida', 'Hualqui', 'Lota', 'Penco',
      'San Pedro de la Paz', 'Santa Juana', 'Talcahuano', 'Tomé', 'Hualpén',
      'Lebu', 'Arauco', 'Cañete', 'Contulmo', 'Curanilahue', 'Los Álamos', 'Tirúa',
      'Los Ángeles', 'Antuco', 'Cabrero', 'Laja', 'Mulchén', 'Nacimiento', 'Negrete',
      'Quilaco', 'Quilleco', 'San Rosendo', 'Santa Bárbara', 'Tucapel', 'Yumbel', 'Alto Biobío',
    ],
  },
  {
    name: 'Región de La Araucanía',
    code: 'IX',
    comunas: [
      'Temuco', 'Carahue', 'Cunco', 'Curarrehue', 'Freire', 'Galvarino', 'Gorbea', 'Lautaro',
      'Loncoche', 'Melipeuco', 'Nueva Imperial', 'Padre las Casas', 'Perquenco', 'Pitrufquén',
      'Pucón', 'Saavedra', 'Teodoro Schmidt', 'Toltén', 'Vilcún', 'Villarrica', 'Cholchol',
      'Angol', 'Collipulli', 'Curacautín', 'Ercilla', 'Lonquimay', 'Los Sauces', 'Lumaco',
      'Purén', 'Renaico', 'Traiguén', 'Victoria',
    ],
  },
  {
    name: 'Región de Los Ríos',
    code: 'XIV',
    comunas: [
      'Valdivia', 'Corral', 'Lanco', 'Los Lagos', 'Máfil', 'Mariquina', 'Paillaco', 'Panguipulli',
      'La Unión', 'Futrono', 'Lago Ranco', 'Río Bueno',
    ],
  },
  {
    name: 'Región de Los Lagos',
    code: 'X',
    comunas: [
      'Puerto Montt', 'Calbuco', 'Cochamó', 'Fresia', 'Frutillar', 'Los Muermos', 'Llanquihue', 'Maullín', 'Puerto Varas',
      'Castro', 'Ancud', 'Chonchi', 'Curaco de Vélez', 'Dalcahue', 'Puqueldón', 'Queilén', 'Quellón', 'Quemchi', 'Quinchao',
      'Osorno', 'Puerto Octay', 'Purranque', 'Puyehue', 'Río Negro', 'San Juan de la Costa', 'San Pablo',
      'Chaitén', 'Futaleufú', 'Hualaihué', 'Palena',
    ],
  },
  {
    name: 'Región de Aysén del General Carlos Ibáñez del Campo',
    code: 'XI',
    comunas: [
      'Coyhaique', 'Lago Verde', 'Aysén', 'Cisnes', 'Guaitecas',
      'Cochrane', 'O’Higgins', 'Tortel', 'Chile Chico', 'Río Ibáñez',
    ],
  },
  {
    name: 'Región de Magallanes y de la Antártica Chilena',
    code: 'XII',
    comunas: [
      'Punta Arenas', 'Laguna Blanca', 'Río Verde', 'San Gregorio',
      'Cabo de Hornos', 'Antártica', 'Porvenir', 'Primavera', 'Timaukel',
      'Natales', 'Torres del Paine',
    ],
  },
  {
    name: 'Región Metropolitana de Santiago',
    code: 'RM',
    comunas: [
      'Santiago', 'Cerrillos', 'Cerro Navia', 'Conchalí', 'El Bosque', 'Estación Central',
      'Huechuraba', 'Independencia', 'La Cisterna', 'La Florida', 'La Granja', 'La Pintana',
      'La Reina', 'Las Condes', 'Lo Barnechea', 'Lo Espejo', 'Lo Prado', 'Macul', 'Maipú',
      'Ñuñoa', 'Pedro Aguirre Cerda', 'Peñalolén', 'Providencia', 'Pudahuel', 'Quilicura',
      'Quinta Normal', 'Recoleta', 'Renca', 'San Joaquín', 'San Miguel', 'San Ramón', 'Vitacura',
      'Puente Alto', 'Pirque', 'San José de Maipo',
      'Colina', 'Lampa', 'Til Til',
      'San Bernardo', 'Buin', 'Calera de Tango', 'Paine',
      'Melipilla', 'Alhué', 'Curacaví', 'María Pinto', 'San Pedro',
      'Talagante', 'El Monte', 'Isla de Maipo', 'Padre Hurtado', 'Peñaflor',
    ],
  },
];

export default regions;
