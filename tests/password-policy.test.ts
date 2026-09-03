import { generateRandomPassword, passwordPolicySchema, PASSWORD_MIN_LENGTH } from '@/lib/auth/password-policy';

describe('passwordPolicySchema', () => {
  it('acepta una contraseña que cumple las 4 reglas', () => {
    expect(passwordPolicySchema.safeParse('Abcdef12').success).toBe(true);
  });

  it('rechaza menos del mínimo de caracteres', () => {
    expect(passwordPolicySchema.safeParse('Ab1defg'.slice(0, PASSWORD_MIN_LENGTH - 1)).success).toBe(false);
  });

  it('rechaza sin mayúscula', () => {
    expect(passwordPolicySchema.safeParse('abcdefg1').success).toBe(false);
  });

  it('rechaza sin minúscula', () => {
    expect(passwordPolicySchema.safeParse('ABCDEFG1').success).toBe(false);
  });

  it('rechaza sin número', () => {
    expect(passwordPolicySchema.safeParse('Abcdefgh').success).toBe(false);
  });
});

describe('generateRandomPassword', () => {
  it('siempre cumple passwordPolicySchema (100 corridas)', () => {
    for (let i = 0; i < 100; i += 1) {
      const password = generateRandomPassword();
      const result = passwordPolicySchema.safeParse(password);
      expect(result.success).toBe(true);
    }
  });

  it('tiene el formato Xxxx-Xxxx-Xxxx', () => {
    expect(generateRandomPassword()).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
  });

  it('evita caracteres ambiguos (I, l, O, 0, 1)', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateRandomPassword()).not.toMatch(/[Il0O1]/);
    }
  });

  it('no repite la misma contraseña en corridas sucesivas', () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generateRandomPassword()));
    expect(passwords.size).toBe(20);
  });
});
