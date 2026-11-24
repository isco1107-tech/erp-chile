import { personFieldsSchema } from '@/modules/crm/schema';

const base = { fullName: 'Ana Pérez' };

describe('CRM — linkedinUrl solo admite enlaces web (se pinta como <a href>)', () => {
  it('acepta https y http', () => {
    expect(personFieldsSchema.safeParse({ ...base, linkedinUrl: 'https://www.linkedin.com/in/ana' }).success).toBe(true);
    expect(personFieldsSchema.safeParse({ ...base, linkedinUrl: 'http://linkedin.com/in/ana' }).success).toBe(true);
  });

  it('acepta el campo vacío u omitido', () => {
    expect(personFieldsSchema.safeParse({ ...base, linkedinUrl: '' }).success).toBe(true);
    expect(personFieldsSchema.safeParse(base).success).toBe(true);
  });

  it.each(['javascript:alert(document.cookie)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'file:///etc/passwd'])(
    'rechaza %s',
    (value) => {
      expect(personFieldsSchema.safeParse({ ...base, linkedinUrl: value }).success).toBe(false);
    },
  );
});
