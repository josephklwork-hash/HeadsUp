/* ============================================
   SECURITY MODULE - OWASP Best Practices
   ============================================
   This module provides:
   - Input validation & sanitization
   - Rate limiting utilities
   - Schema-based validation
   - XSS prevention
   ============================================ */

// --------------------------------------------
// RATE LIMITING CONFIGURATION
// --------------------------------------------
const RATE_LIMITS = {
  // Auth operations (prevent brute force)
  LOGIN: { maxAttempts: 5, windowMs: 60000, lockoutMs: 300000 },      // 5 attempts/min, 5min lockout
  SIGNUP: { maxAttempts: 3, windowMs: 60000, lockoutMs: 600000 },     // 3 attempts/min, 10min lockout
  PIN_JOIN: { maxAttempts: 5, windowMs: 60000, lockoutMs: 60000 },    // 5 attempts/min, 1min lockout

  // Data operations (prevent spam/abuse)
  GAME_CREATE: { maxAttempts: 10, windowMs: 3600000, lockoutMs: 0 },  // 10/hour (handled by SQL)
  MESSAGE_SEND: { maxAttempts: 30, windowMs: 60000, lockoutMs: 30000 }, // 30/min, 30s lockout
  CONNECTION_REQUEST: { maxAttempts: 20, windowMs: 3600000, lockoutMs: 0 }, // 20/hour
} as const;

export type RateLimitKey = keyof typeof RATE_LIMITS;

// In-memory rate limit tracking (resets on page refresh - for client-side protection)
// Server-side RLS provides the real protection
const rateLimitStore: Record<string, { attempts: number; firstAttempt: number; lockedUntil: number }> = {};

/**
 * Check if an action is rate limited
 * @returns { allowed: boolean, remainingAttempts: number, retryAfter: number }
 */
export function checkRateLimit(key: RateLimitKey, identifier: string = 'default'): {
  allowed: boolean;
  remainingAttempts: number;
  retryAfter: number;
  message: string;
} {
  const config = RATE_LIMITS[key];
  const storeKey = `${key}:${identifier}`;
  const now = Date.now();

  // Initialize or get existing record
  if (!rateLimitStore[storeKey]) {
    rateLimitStore[storeKey] = { attempts: 0, firstAttempt: now, lockedUntil: 0 };
  }

  const record = rateLimitStore[storeKey];

  // Check if currently locked out
  if (record.lockedUntil > now) {
    const retryAfter = Math.ceil((record.lockedUntil - now) / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfter,
      message: `Too many attempts. Please try again in ${retryAfter} seconds.`
    };
  }

  // Reset window if expired
  if (now - record.firstAttempt > config.windowMs) {
    record.attempts = 0;
    record.firstAttempt = now;
  }

  // Check if over limit
  if (record.attempts >= config.maxAttempts) {
    record.lockedUntil = now + config.lockoutMs;
    const retryAfter = Math.ceil(config.lockoutMs / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfter,
      message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`
    };
  }

  return {
    allowed: true,
    remainingAttempts: config.maxAttempts - record.attempts,
    retryAfter: 0,
    message: ''
  };
}

/**
 * Record an attempt for rate limiting
 */
export function recordRateLimitAttempt(key: RateLimitKey, identifier: string = 'default'): void {
  const storeKey = `${key}:${identifier}`;
  if (!rateLimitStore[storeKey]) {
    rateLimitStore[storeKey] = { attempts: 0, firstAttempt: Date.now(), lockedUntil: 0 };
  }
  rateLimitStore[storeKey].attempts++;
}

/**
 * Reset rate limit (e.g., after successful login)
 */
export function resetRateLimit(key: RateLimitKey, identifier: string = 'default'): void {
  const storeKey = `${key}:${identifier}`;
  delete rateLimitStore[storeKey];
}

// --------------------------------------------
// INPUT VALIDATION SCHEMAS
// --------------------------------------------
const VALIDATION_SCHEMAS = {
  email: {
    pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    maxLength: 254,
    minLength: 5,
    errorMessage: 'Please enter a valid email address'
  },
  password: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecial: false,
    errorMessage: 'Password must be at least 8 characters with uppercase, lowercase, and number'
  },
  name: {
    pattern: /^[a-zA-Z\s'-]+$/,
    maxLength: 50,
    minLength: 1,
    errorMessage: 'Name can only contain letters, spaces, hyphens, and apostrophes'
  },
  linkedinUrl: {
    pattern: /^(https?:\/\/)?(www\.)?linkedin\.com\/in\/[\w-]+(\/)?(\?.*)?$/i,
    maxLength: 200,
    minLength: 0, // Optional
    errorMessage: 'Please enter a valid LinkedIn URL (e.g., https://linkedin.com/in/yourname)'
  },
  gamePin: {
    pattern: /^\d{4}$/,
    maxLength: 4,
    minLength: 4,
    errorMessage: 'PIN must be exactly 4 digits'
  },
  message: {
    maxLength: 2000,
    minLength: 1,
    errorMessage: 'Message must be between 1 and 2000 characters'
  },
  generalText: {
    maxLength: 200,
    minLength: 0,
    errorMessage: 'Text exceeds maximum length'
  }
} as const;

type ValidationSchemaKey = keyof typeof VALIDATION_SCHEMAS;

/**
 * Validate input against a schema
 * @returns { valid: boolean, sanitized: string, error: string }
 */
export function validateInput(
  value: string,
  schemaKey: ValidationSchemaKey,
  options?: { required?: boolean }
): { valid: boolean; sanitized: string; error: string } {
  const schema = VALIDATION_SCHEMAS[schemaKey];
  const required = options?.required ?? false;

  // Handle empty values
  if (!value || value.trim() === '') {
    if (required) {
      return { valid: false, sanitized: '', error: 'This field is required' };
    }
    return { valid: true, sanitized: '', error: '' };
  }

  // Sanitize: trim whitespace, remove null bytes, strip HTML tags
  let sanitized = value
    .trim()
    .replace(/\0/g, '')           // Remove null bytes
    .replace(/<[^>]*>/g, '')      // Strip HTML tags
    .replace(/[<>]/g, '')         // Remove remaining angle brackets
    .slice(0, schema.maxLength);  // Enforce max length

  // Check minimum length
  if ('minLength' in schema && sanitized.length < schema.minLength) {
    return {
      valid: false,
      sanitized,
      error: schema.errorMessage
    };
  }

  // Check pattern if exists
  if ('pattern' in schema && schema.pattern && !schema.pattern.test(sanitized)) {
    return {
      valid: false,
      sanitized,
      error: schema.errorMessage
    };
  }

  return { valid: true, sanitized, error: '' };
}

/**
 * Validate password with detailed requirements
 */
export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong';
} {
  const errors: string[] = [];
  const schema = VALIDATION_SCHEMAS.password;

  if (password.length < schema.minLength) {
    errors.push(`Password must be at least ${schema.minLength} characters`);
  }
  if (password.length > schema.maxLength) {
    errors.push(`Password must be less than ${schema.maxLength} characters`);
  }
  if (schema.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter');
  }
  if (schema.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain a lowercase letter');
  }
  if (schema.requireNumber && !/[0-9]/.test(password)) {
    errors.push('Password must contain a number');
  }
  if (schema.requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain a special character');
  }

  // Calculate strength
  let strength: 'weak' | 'medium' | 'strong' = 'weak';
  if (errors.length === 0) {
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const isLong = password.length >= 12;
    if (hasSpecial && isLong) {
      strength = 'strong';
    } else if (hasSpecial || isLong) {
      strength = 'medium';
    } else {
      strength = 'medium';
    }
  }

  return { valid: errors.length === 0, errors, strength };
}

/**
 * Validate email format with strict validation
 */
export function validateEmail(email: string): { valid: boolean; sanitized: string; error: string } {
  const result = validateInput(email, 'email', { required: true });
  if (!result.valid) return result;

  const sanitized = result.sanitized.toLowerCase();
  const [localPart, domain] = sanitized.split('@');

  // Require at least 3 characters before @
  if (!localPart || localPart.length < 3) {
    return { valid: false, sanitized, error: 'Please enter a valid email address' };
  }

  // Block common fake/test domains
  const blockedDomains = [
    'a.com', 'b.com', 'c.com', 'test.com', 'fake.com', 'example.com',
    'asdf.com', 'qwerty.com', 'temp.com', 'trash.com', 'junk.com',
    'aa.com', 'ab.com', 'abc.com', 'xyz.com', 'aaa.com', 'bbb.com',
    'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.com',
    '10minutemail.com', 'fakeinbox.com', 'trashmail.com'
  ];

  if (!domain || blockedDomains.includes(domain)) {
    return { valid: false, sanitized, error: 'Please use a valid email address (no temporary or fake emails)' };
  }

  // Require domain to have at least 4 characters (e.g., a.co)
  if (domain.length < 4) {
    return { valid: false, sanitized, error: 'Please enter a valid email address' };
  }

  return { valid: true, sanitized, error: '' };
}

/**
 * Sanitize and validate a profile object
 * Rejects unexpected fields (defense against mass assignment)
 */
export function validateProfileData(data: Record<string, unknown>): {
  valid: boolean;
  sanitized: Record<string, string>;
  errors: Record<string, string>;
} {
  const allowedFields = ['firstName', 'lastName', 'email', 'year', 'major', 'school', 'company', 'workTitle', 'linkedinUrl'];
  const sanitized: Record<string, string> = {};
  const errors: Record<string, string> = {};

  // Reject unexpected fields
  for (const key of Object.keys(data)) {
    if (!allowedFields.includes(key)) {
      errors[key] = `Unexpected field: ${key}`;
    }
  }

  // Validate each allowed field
  const fieldValidations: Record<string, { schema: ValidationSchemaKey; required: boolean }> = {
    firstName: { schema: 'name', required: true },
    lastName: { schema: 'name', required: true },
    email: { schema: 'email', required: true },
    year: { schema: 'generalText', required: false },
    major: { schema: 'generalText', required: false },
    school: { schema: 'generalText', required: false },
    company: { schema: 'generalText', required: false },
    workTitle: { schema: 'generalText', required: false },
    linkedinUrl: { schema: 'linkedinUrl', required: false },
  };

  for (const [field, config] of Object.entries(fieldValidations)) {
    const value = data[field];
    if (typeof value === 'string' || value === undefined || value === null) {
      const result = validateInput(String(value || ''), config.schema, { required: config.required });
      sanitized[field] = result.sanitized;
      if (!result.valid) {
        errors[field] = result.error;
      }
    } else {
      errors[field] = 'Invalid type: expected string';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    sanitized,
    errors
  };
}

/**
 * Validate message content
 */
export function validateMessage(text: string): { valid: boolean; sanitized: string; error: string } {
  if (!text || text.trim() === '') {
    return { valid: false, sanitized: '', error: 'Message cannot be empty' };
  }

  const result = validateInput(text, 'message', { required: true });

  // Additional XSS prevention for messages
  result.sanitized = result.sanitized
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .replace(/data:/gi, '');

  return result;
}
