/**
 * Datos sensibles (certificado médico, contratos de candidata): con el bucket
 * privado configurado el archivo no tiene URL pública; sin él se degrada a la
 * subida pública de siempre en vez de romper la subida.
 */
import { isAllowedStoredFile, isPrivateRef, privateKeyFromRef, blobPathnameStartsWith } from '@/lib/security/blob-url';

const sent: { input: Record<string, unknown> }[] = [];

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send(command: { input: Record<string, unknown> }) {
      sent.push(command);
      return Promise.resolve({});
    }
  },
  PutObjectCommand: class { constructor(public input: Record<string, unknown>) {} },
  GetObjectCommand: class { constructor(public input: Record<string, unknown>) {} },
  DeleteObjectCommand: class { constructor(public input: Record<string, unknown>) {} },
  DeleteObjectsCommand: class { constructor(public input: Record<string, unknown>) {} },
}));

jest.mock('@vercel/blob', () => ({
  put: (pathname: string) => Promise.resolve({ url: `https://tienda.public.blob.vercel-storage.com/${pathname}`, pathname }),
  del: jest.fn(),
}));

const vars = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL', 'R2_PRIVATE_BUCKET_NAME'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  sent.length = 0;
  jest.resetModules();
  for (const name of vars) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of vars) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

function configurePrivate() {
  process.env.R2_ACCOUNT_ID = 'acc';
  process.env.R2_ACCESS_KEY_ID = 'key';
  process.env.R2_SECRET_ACCESS_KEY = 'secret';
  process.env.R2_PRIVATE_BUCKET_NAME = 'privado';
}

describe('referencias privadas', () => {
  it('reconoce la referencia y extrae la clave', () => {
    expect(isPrivateRef('r2private:///candidates/c1/documents/x.pdf')).toBe(true);
    expect(privateKeyFromRef('r2private:///candidates/c1/documents/x.pdf')).toBe('candidates/c1/documents/x.pdf');
  });

  it('rechaza referencias vacías o con ..', () => {
    expect(privateKeyFromRef('r2private:///')).toBeNull();
    expect(privateKeyFromRef('r2private:///a/../b')).toBeNull();
    expect(privateKeyFromRef('https://evil.example/x')).toBeNull();
  });

  it('un fileUrl guardado solo puede ser storage propio o referencia privada', () => {
    expect(isAllowedStoredFile('r2private:///candidates/c1/x.pdf')).toBe(true);
    expect(isAllowedStoredFile('https://tienda.public.blob.vercel-storage.com/x.pdf')).toBe(true);
    expect(isAllowedStoredFile('http://169.254.169.254/latest/meta-data')).toBe(false);
  });

  it('el prefijo de la empresa se valida también en referencias privadas', () => {
    expect(blobPathnameStartsWith('r2private:///candidates/c1/documents/p-1.pdf', 'candidates/c1/documents/p-')).toBe(true);
    expect(blobPathnameStartsWith('r2private:///candidates/c2/documents/p-1.pdf', 'candidates/c1/documents/p-')).toBe(false);
  });
});

describe('putPrivate', () => {
  it('con bucket privado sube a ese bucket y devuelve una referencia, no una URL', async () => {
    configurePrivate();
    const { putPrivate } = await import('@/lib/storage/blob');
    const result = await putPrivate('candidates/c1/documents/x.pdf', Buffer.from('%PDF'), { contentType: 'application/pdf' });
    expect(result.url).toBe('r2private:///candidates/c1/documents/x.pdf');
    expect(sent).toHaveLength(1);
    expect(sent[0].input.Bucket).toBe('privado');
    expect(sent[0].input.Key).toBe('candidates/c1/documents/x.pdf');
  });

  it('sin bucket privado cae a la subida pública en vez de fallar', async () => {
    const { putPrivate } = await import('@/lib/storage/blob');
    const result = await putPrivate('candidates/c1/documents/x.pdf', Buffer.from('%PDF'), { contentType: 'application/pdf' });
    expect(result.url).toMatch(/^https:\/\/.*blob\.vercel-storage\.com\//);
  });

  it('del() borra las referencias privadas del bucket privado', async () => {
    configurePrivate();
    const { del } = await import('@/lib/storage/blob');
    await del(['r2private:///candidates/c1/documents/x.pdf']);
    expect(sent).toHaveLength(1);
    expect(sent[0].input.Bucket).toBe('privado');
  });
});
