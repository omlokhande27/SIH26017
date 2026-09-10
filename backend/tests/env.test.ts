/**
 * env.test.ts — environment validation rules.
 *
 * `parseEnv` is exercised directly rather than by importing the module for its
 * side effect, because the module exits the process on failure. The two things
 * worth protecting here are the production guard on ML_SERVICE_URL and the
 * optionality of the LLM key.
 */
import { describe, it, expect } from 'vitest';
import { parseEnv } from '../src/config/env';

/** The minimum set of variables a valid configuration must carry. */
const base = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  JWT_SECRET: 'secret',
} satisfies NodeJS.ProcessEnv;

/** The same configuration expressed with the new-format key names. */
const newFormat = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
} satisfies NodeJS.ProcessEnv;

describe('required configuration', () => {
  it('accepts a complete development configuration', () => {
    const result = parseEnv({ ...base, NODE_ENV: 'development' });
    expect(result.success).toBe(true);
  });

  it.each(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])(
    'rejects a configuration missing %s',
    (key) => {
      const incomplete: NodeJS.ProcessEnv = { ...base };
      delete incomplete[key];
      expect(parseEnv(incomplete).success).toBe(false);
    },
  );

  it('does NOT require JWT_SECRET by default', () => {
    // An asymmetric project has no shared secret to configure. Requiring one
    // unconditionally would make a JWKS project impossible to boot.
    const noSecret: NodeJS.ProcessEnv = { ...base };
    delete noSecret.JWT_SECRET;
    expect(parseEnv(noSecret).success).toBe(true);
  });

  it('rejects a malformed SUPABASE_URL', () => {
    expect(parseEnv({ ...base, SUPABASE_URL: 'not-a-url' }).success).toBe(false);
  });
});

describe('ML_SERVICE_URL production guard', () => {
  it('is optional in development', () => {
    const result = parseEnv({ ...base, NODE_ENV: 'development' });
    expect(result.success).toBe(true);
  });

  it('is REQUIRED in production — no silent localhost default', () => {
    // The previous schema defaulted to http://localhost:8000 unconditionally,
    // so a production deploy that forgot the variable booted cleanly and
    // pointed at its own loopback.
    const result = parseEnv({ ...base, NODE_ENV: 'production' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.flatMap((i) => i.path);
      expect(paths).toContain('ML_SERVICE_URL');
    }
  });

  it('accepts production when ML_SERVICE_URL is supplied explicitly', () => {
    const result = parseEnv({
      ...base,
      NODE_ENV: 'production',
      ML_SERVICE_URL: 'https://ml.internal.example',
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ['bare host:port', 'localhost:8000'],
    ['no scheme', 'ml.internal.example'],
    ['wrong scheme', 'ftp://ml.internal.example'],
    ['empty', ''],
  ])('rejects a malformed ML_SERVICE_URL: %s', (_label, value) => {
    // `localhost:8000` is the important one — `new URL()` parses it as scheme
    // "localhost", so a plain `.url()` check would let it through.
    expect(parseEnv({ ...base, ML_SERVICE_URL: value }).success).toBe(false);
  });

  it.each([
    ['http', 'http://localhost:8000'],
    ['https', 'https://ml.internal.example'],
  ])('accepts a well-formed %s URL', (_label, value) => {
    expect(parseEnv({ ...base, ML_SERVICE_URL: value }).success).toBe(true);
  });

  it('applies the same protocol rule to SUPABASE_URL', () => {
    expect(parseEnv({ ...base, SUPABASE_URL: 'localhost:54321' }).success).toBe(false);
  });
});

describe('optional secrets', () => {
  it('runs without OPENAI_API_KEY — the LLM layer is optional', () => {
    // The core system must never depend on the LLM being configured.
    const result = parseEnv({ ...base });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.OPENAI_API_KEY).toBeUndefined();
  });

  it('accepts OPENAI_API_KEY when supplied', () => {
    const result = parseEnv({ ...base, OPENAI_API_KEY: 'sk-test-placeholder' });
    expect(result.success).toBe(true);
  });

  it('runs without ML_SERVICE_API_KEY', () => {
    expect(parseEnv({ ...base }).success).toBe(true);
  });
});

describe('LOG_LEVEL', () => {
  it('defaults to info', () => {
    const result = parseEnv({ ...base });
    if (result.success) expect(result.data.LOG_LEVEL).toBe('info');
  });

  it.each(['debug', 'info', 'warn', 'error'])('accepts %s', (level) => {
    expect(parseEnv({ ...base, LOG_LEVEL: level }).success).toBe(true);
  });

  it('rejects an unknown level', () => {
    expect(parseEnv({ ...base, LOG_LEVEL: 'verbose' }).success).toBe(false);
  });
});

describe('secret hygiene', () => {
  it('never places a secret value in a validation error message', () => {
    // A validation failure must not put the offending key into a log line.
    const result = parseEnv({
      ...base,
      SUPABASE_URL: 'not-a-url',
      JWT_SECRET: 'super-secret-value-abc123',
      OPENAI_API_KEY: 'sk-should-never-be-logged',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const serialised = JSON.stringify(result.error.issues);
      expect(serialised).not.toContain('super-secret-value-abc123');
      expect(serialised).not.toContain('sk-should-never-be-logged');
    }
  });
});


describe('API key migration — both generations accepted', () => {
  it('accepts the legacy pair (anon + service_role)', () => {
    expect(parseEnv(base).success).toBe(true);
  });

  it('accepts the new pair (publishable + secret)', () => {
    expect(parseEnv(newFormat).success).toBe(true);
  });

  it('accepts a half-migrated configuration', () => {
    // New publishable key, legacy secret key — what a real migration looks
    // like partway through.
    const mixed = {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    };
    expect(parseEnv(mixed).success).toBe(true);
  });

  it('rejects a configuration with NEITHER publishable nor anon key', () => {
    const missing: NodeJS.ProcessEnv = { ...base };
    delete missing.SUPABASE_ANON_KEY;
    const result = parseEnv(missing);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.flatMap((i) => i.path);
      expect(paths).toContain('SUPABASE_PUBLISHABLE_KEY');
    }
  });

  it('rejects a configuration with NEITHER secret nor service_role key', () => {
    const missing: NodeJS.ProcessEnv = { ...base };
    delete missing.SUPABASE_SERVICE_ROLE_KEY;
    const result = parseEnv(missing);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.flatMap((i) => i.path);
      expect(paths).toContain('SUPABASE_SECRET_KEY');
    }
  });

  it('names both acceptable variables in the error message', () => {
    // One clear message beats two confusing "required" errors for keys that
    // are alternatives to each other.
    const missing: NodeJS.ProcessEnv = { ...base };
    delete missing.SUPABASE_ANON_KEY;
    const result = parseEnv(missing);
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join(' ');
      expect(message).toContain('SUPABASE_PUBLISHABLE_KEY');
      expect(message).toContain('SUPABASE_ANON_KEY');
    }
  });

  it('warns in the message that the secret key bypasses RLS', () => {
    const missing: NodeJS.ProcessEnv = { ...base };
    delete missing.SUPABASE_SERVICE_ROLE_KEY;
    const result = parseEnv(missing);
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join(' ');
      expect(message).toContain('BYPASSES');
    }
  });
});

describe('JWT verification mode', () => {
  it('defaults to auto', () => {
    const result = parseEnv(base);
    if (result.success) expect(result.data.SUPABASE_JWT_MODE).toBe('auto');
  });

  it.each(['auto', 'hs256', 'jwks'])('accepts mode %s', (mode) => {
    expect(parseEnv({ ...base, SUPABASE_JWT_MODE: mode }).success).toBe(true);
  });

  it('rejects an unknown mode', () => {
    expect(parseEnv({ ...base, SUPABASE_JWT_MODE: 'hs512' }).success).toBe(false);
  });

  it('REQUIRES JWT_SECRET when the mode is explicitly hs256', () => {
    const noSecret: NodeJS.ProcessEnv = { ...base, SUPABASE_JWT_MODE: 'hs256' };
    delete noSecret.JWT_SECRET;
    const result = parseEnv(noSecret);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.flatMap((i) => i.path)).toContain('JWT_SECRET');
    }
  });

  it('does not require JWT_SECRET in jwks mode', () => {
    const jwksOnly: NodeJS.ProcessEnv = { ...newFormat, SUPABASE_JWT_MODE: 'jwks' };
    expect(parseEnv(jwksOnly).success).toBe(true);
  });

  it('defaults the audience to "authenticated"', () => {
    const result = parseEnv(base);
    if (result.success) expect(result.data.SUPABASE_JWT_AUDIENCE).toBe('authenticated');
  });
});
