/**
 * El valor de esta capa es que un despliegue hecho ANTES de contratar
 * Cloudflare R2 no deje caídas las 13 rutas de subida de archivos (fotos de
 * candidatas, logos, contratos, adjuntos de mensajería). R2 es opt-in: manda
 * solo cuando están todas sus variables.
 */

const r2Vars = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'] as const;

const sent: unknown[] = [];
const vercelUploads: { pathname: string; options: unknown }[] = [];

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send(command: unknown) { sent.push(command); return Promise.resolve({}); }
  },
  PutObjectCommand: class { constructor(public input: unknown) {} },
  DeleteObjectCommand: class { constructor(public input: unknown) {} },
  DeleteObjectsCommand: class { constructor(public input: unknown) {} },
}));

jest.mock('@vercel/blob', () => ({
  put: (pathname: string, _body: unknown, options: unknown) => {
    vercelUploads.push({ pathname, options });
    return Promise.resolve({ url: `https://tienda.public.blob.vercel-storage.com/${pathname}`, pathname });
  },
  del: jest.fn(),
}));

const original: Record<string, string | undefined> = {};

beforeEach(() => {
  sent.length = 0;
  vercelUploads.length = 0;
  jest.resetModules();
  for (const name of r2Vars) {
    original[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of r2Vars) {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }
});

describe('Subida de archivos con R2 sin configurar', () => {
  it('sube por Vercel Blob en vez de fallar', async () => {
    const { put } = await import('@/lib/storage/blob');

    const result = await put('branding/cmp_1/logo-1.png', Buffer.from('imagen'), {
      access: 'public',
      contentType: 'image/png',
      addRandomSuffix: false,
    });

    expect(sent).toHaveLength(0);
    expect(vercelUploads).toEqual([
      {
        pathname: 'branding/cmp_1/logo-1.png',
        options: { access: 'public', contentType: 'image/png', addRandomSuffix: false, allowOverwrite: false },
      },
    ]);
    // La URL devuelta es la que queda guardada en la base: debe ser la real
    // del proveedor que efectivamente recibió el archivo.
    expect(result.url).toBe('https://tienda.public.blob.vercel-storage.com/branding/cmp_1/logo-1.png');
  });

  it('tampoco usa R2 con las variables a medio definir', async () => {
    process.env.R2_ACCOUNT_ID = 'cuenta';
    process.env.R2_ACCESS_KEY_ID = 'clave';
    // Faltan R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME y R2_PUBLIC_URL.
    const { put } = await import('@/lib/storage/blob');

    await put('candidatas/cmp_1/foto.jpg', Buffer.from('foto'), { access: 'public', contentType: 'image/jpeg' });

    expect(sent).toHaveLength(0);
    expect(vercelUploads).toHaveLength(1);
  });

  it('no pisa un archivo existente por defecto (allowOverwrite ausente)', async () => {
    const { put } = await import('@/lib/storage/blob');

    await put('candidates/zapsign-signed/doc-1.pdf', Buffer.from('pdf'), {
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: false,
    });

    // Sin `allowOverwrite`, el fallback a `@vercel/blob` mantiene su
    // comportamiento por defecto (no sobrescribe) para no cambiar a los
    // demás 13 call-sites que dependen de que una colisión de nombre falle.
    expect(vercelUploads[0]?.options).toMatchObject({ allowOverwrite: false });
  });

  it('pasa allowOverwrite: true cuando el llamador lo pide (webhook de ZapSign, reintentable)', async () => {
    const { put } = await import('@/lib/storage/blob');

    await put('candidates/zapsign-signed/doc-1.pdf', Buffer.from('pdf'), {
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    // Sin esto, un reintento del webhook (mismo docToken -> mismo pathname)
    // choca contra el `put` de `@vercel/blob`, que por defecto lanza si el
    // archivo ya existe, y el contrato nunca queda marcado como firmado.
    expect(vercelUploads[0]?.options).toMatchObject({ allowOverwrite: true });
  });
});

describe('Subida de archivos con R2 configurado', () => {
  it('sube a R2 y devuelve la URL pública del bucket', async () => {
    process.env.R2_ACCOUNT_ID = 'cuenta';
    process.env.R2_ACCESS_KEY_ID = 'clave';
    process.env.R2_SECRET_ACCESS_KEY = 'secreto';
    process.env.R2_BUCKET_NAME = 'aether';
    process.env.R2_PUBLIC_URL = 'https://archivos.aether.cl/';
    const { put } = await import('@/lib/storage/blob');

    const result = await put('contratos/cmp_1/doc.pdf', Buffer.from('pdf'), {
      access: 'public',
      contentType: 'application/pdf',
    });

    expect(vercelUploads).toHaveLength(0);
    expect(sent).toHaveLength(1);
    expect((sent[0] as { input: Record<string, unknown> }).input).toMatchObject({
      Bucket: 'aether',
      Key: 'contratos/cmp_1/doc.pdf',
      ContentType: 'application/pdf',
    });
    // La barra final de R2_PUBLIC_URL no debe duplicarse en la URL guardada.
    expect(result.url).toBe('https://archivos.aether.cl/contratos/cmp_1/doc.pdf');
  });
});
