/**
 * Revisión automática de los textos del marketing propio de Aether
 * (ADR 0015, `src/lib/marketing/copy-review.ts` + `claims.ts`): la puerta que
 * toda pieza de la Supersuite pasa antes de publicarse. Fija que un texto
 * concreto y verdadero pasa, que uno genérico de IA no, y que ninguna
 * promesa que el producto no cumple puede salir.
 */
import { CLAIM_GUARDRAILS } from '@/lib/marketing/claims';
import { CHANNEL_RULES, MARKETING_CHANNELS } from '@/lib/marketing/brand-voice';
import { PASSING_SCORE, reviewMarketingCopy, type CopyReviewContext } from '@/lib/marketing/copy-review';

const CTX: CopyReviewContext = { preciosValidos: [], dominiosPropios: ['aether.cl'], correosPermitidos: ['ventas@aether.cl'] };
const review = (text: string, channel: (typeof MARKETING_CHANNELS)[number] = 'instagram', ctx: CopyReviewContext = CTX) => reviewMarketingCopy(text, channel, ctx);
const rules = (text: string, channel?: (typeof MARKETING_CHANNELS)[number], ctx?: CopyReviewContext) => review(text, channel, ctx).hallazgos.map((h) => h.regla);

const GOOD = [
  'Cerrar la caja no debería tomar media hora.',
  '',
  'En el punto de venta de Aether, cada cajero abre su turno con el fondo inicial. Al cerrar, cuenta el efectivo y el sistema le muestra la diferencia contra lo esperado, con cada ingreso y retiro del turno.',
  '',
  'El comprobante queda guardado por turno, para revisarlo cuando quieras.',
  '',
  'Guarda este post para tu próximo cierre. El detalle está en el enlace de la bio.',
].join('\n');

const GENERIC_AI =
  '🚀 ¡En la era digital, potencia tu negocio con Aether! 💡 Descubre cómo nuestra solución integral revoluciona tu gestión. No es solo un ERP, es tu mejor aliado. ¡No te lo pierdas! #ERP #Pymes #Chile #Emprendimiento #Negocios #Exito #Tecnologia';

describe('un texto concreto pasa; uno genérico de IA no', () => {
  it('el texto bien hecho se aprueba con puntaje completo', () => {
    const r = review(GOOD);
    expect(r.hallazgos).toEqual([]);
    expect(r).toMatchObject({ aprobado: true, puntaje: 100 });
    expect(r.metricas).toMatchObject({ hashtags: 0, emojis: 0, exclamaciones: 0 });
  });

  it('el anuncio genérico se bloquea por plantilla y suma cada muletilla', () => {
    const r = review(GENERIC_AI);
    expect(r.aprobado).toBe(false);
    const found = r.hallazgos.map((h) => h.regla);
    expect(found).toContain('plantilla');
    expect(found.filter((x) => x === 'muletilla').length).toBeGreaterThanOrEqual(5);
    expect(found).toEqual(expect.arrayContaining(['hashtags', 'exclamaciones']));
    expect(r.puntaje).toBeLessThan(PASSING_SCORE);
  });

  it('es determinista', () => {
    expect(review(GENERIC_AI)).toEqual(review(GENERIC_AI));
  });
});

describe('promesas que el producto no cumple', () => {
  // Un ejemplo real por cada regla: si alguien agrega una regla sin ejemplo, esta prueba lo exige.
  const EXAMPLES: Record<string, string> = {
    'sii-envio': 'Aether envía tus boletas directo al SII.',
    'facturacion-electronica': 'Facturación electrónica incluida en todos los planes.',
    'sii-certificacion': 'Un sistema certificado por el SII.',
    'pos-sin-conexion': 'Vende aunque te quedes sin internet.',
    webpay: 'Cobra con Webpay desde tu tienda.',
    'hardware-pos': 'Impresoras térmicas compatibles con el POS.',
    'tiendas-de-apps': 'Descárgala en Google Play.',
    'ia-reemplaza': 'Nuestra IA reemplaza a tu contador.',
    superlativos: 'El mejor ERP de Chile.',
    garantias: 'Resultados garantizados.',
    gratis: 'Pruébalo gratis.',
  };

  it('cada regla tiene su ejemplo y lo atrapa con su nivel', () => {
    expect(Object.keys(EXAMPLES).sort()).toEqual(CLAIM_GUARDRAILS.map((g) => g.id).sort());
    for (const guard of CLAIM_GUARDRAILS) {
      const finding = review(EXAMPLES[guard.id]).hallazgos.find((h) => h.regla === `afirmacion:${guard.id}`);
      expect(finding).toMatchObject({ nivel: guard.nivel });
    }
  });

  it('no importan las mayúsculas ni las tildes', () => {
    expect(rules('AETHER ENVÍA TUS FACTURAS AL SII')).toContain('afirmacion:sii-envio');
    expect(rules('facturacion electronica')).toContain('afirmacion:facturacion-electronica');
  });

  it('lo que sí es cierto no se confunde con una promesa falsa', () => {
    for (const text of [
      'Los folios los autoriza el SII: Aether los toma de tu CAF y los asigna sin dejar huecos.',
      'Envía la boleta por correo a tu cliente apenas la emites.',
      'El cálculo del F29 sale de tus documentos del mes, para que lo revises con tu contador.',
      'El IVA es el 19% del neto de cada línea afecta.',
    ]) {
      expect(review(text).hallazgos).toEqual([]);
    }
  });
});

describe('precios', () => {
  it('mientras Aether cotiza a medida, cualquier monto bloquea', () => {
    const r = review('El POS cuesta $9.990 + IVA al mes.');
    expect(r.aprobado).toBe(false);
    expect(r.hallazgos.find((h) => h.regla === 'precio')?.mensaje).toContain('no publica precios');
  });

  it('con precios publicados, solo esos montos y siempre con IVA', () => {
    const ctx = { ...CTX, preciosValidos: [24990] };
    expect(rules('Desde $24.990 + IVA al mes.', 'facebook', ctx)).toEqual([]);
    expect(rules('Desde $24.990 al mes.', 'facebook', ctx)).toEqual(['precio-iva']);
    expect(rules('Desde $25.000 + IVA al mes.', 'facebook', ctx)).toContain('precio');
  });
});

describe('forma por canal', () => {
  it('cada canal tiene sus topes', () => {
    for (const channel of MARKETING_CHANNELS) {
      const r = CHANNEL_RULES[channel];
      expect(r.maxCaracteres).toBeGreaterThan(r.ganchoMax);
    }
    expect(rules('x'.repeat(CHANNEL_RULES.facebook.maxCaracteres + 1), 'facebook')).toContain('largo');
    expect(review('x'.repeat(CHANNEL_RULES.facebook.maxCaracteres + 1), 'facebook').aprobado).toBe(false);
  });

  it('el gancho largo, los hashtags y emojis de más, y las MAYÚSCULAS avisan', () => {
    expect(rules(`${'Una primera línea que no termina nunca '.repeat(5)}\nY después el resto.`)).toContain('gancho');
    expect(rules('Cierre de caja. #pos #caja #pyme', 'linkedin')).toEqual([]);
    expect(rules('Cierre de caja. #pos #caja #pyme #chile', 'linkedin')).toContain('hashtags');
    expect(rules('Cierre de caja 🧾', 'google_business')).toContain('emojis');
    expect(rules('Esto es URGENTE y además IMPORTANTE.')).toContain('mayusculas');
    expect(rules('El SII, el IVA y el F29 en un solo lugar.')).not.toContain('mayusculas');
  });

  it('en Instagram un enlace escrito no se puede tocar; un enlace a Aether necesita su campaña', () => {
    expect(rules('Mira el módulo: https://aether.cl/modulos/punto-de-venta')).toEqual(expect.arrayContaining(['enlace-no-clicable', 'enlace-sin-campana']));
    expect(rules('Mira el módulo: https://aether.cl/modulos/punto-de-venta?utm_source=linkedin&utm_campaign=pos', 'linkedin')).toEqual([]);
  });
});

describe('lo que delata texto generado', () => {
  it('«no es solo X, es Y», «más que un ERP» y las rayas en serie avisan', () => {
    expect(rules('No es solo un sistema, es la forma de ordenar tu negocio.')).toContain('muletilla');
    expect(rules('Aether es más que un ERP.')).toContain('muletilla');
    expect(rules('Ordena la caja — cuadra el IVA — duerme tranquilo.')).toContain('rayas');
  });

  it('las cifras sin fuente avisan; el IVA no', () => {
    expect(rules('Reduce un 40% el tiempo de cierre.')).toContain('cifra');
    expect(rules('Cierra 3 veces más rápido.')).toContain('cifra');
    expect(rules('Ahorra 10 horas al mes.')).toContain('cifra');
    expect(rules('El IVA es el 19% del neto.')).not.toContain('cifra');
  });

  it('español de Chile', () => {
    expect(rules('Desde tu ordenador o el celular.')).toContain('espanol-chile');
  });
});

describe('datos personales', () => {
  it('un correo ajeno o un RUT bloquean; el correo de ventas no', () => {
    expect(review('Escríbele a maria.perez@gmail.com').aprobado).toBe(false);
    expect(review('Cliente 12.345.678-5 feliz.').aprobado).toBe(false);
    expect(rules('Escríbenos a ventas@aether.cl')).toEqual([]);
    expect(rules('Llámanos al +56 9 1234 5678')).toContain('telefono');
  });
});

it('un texto vacío no se aprueba', () => {
  expect(review('   ')).toMatchObject({ aprobado: false, puntaje: 0, hallazgos: [{ regla: 'vacio' }] });
});
