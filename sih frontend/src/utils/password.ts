export interface PasswordRequirement {
  id: string;
  label: string;
  met: boolean;
}

const SEQUENCES = [
  '0123456789',
  'abcdefghijklmnopqrstuvwxyz',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
];

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'qwerty123',
  'qwerty@123',
  'admin123',
  'welcome123',
  'landguard',
  'landguard123',
]);

function hasSequentialPattern(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized.length < 4) return false;
  if (COMMON_PASSWORDS.has(normalized)) return true;

  for (let start = 0; start <= normalized.length - 4; start += 1) {
    const run = normalized.slice(start, start + 4);
    const reversedRun = [...run].reverse().join('');
    if (SEQUENCES.some((sequence) => sequence.includes(run) || sequence.includes(reversedRun))) return true;
  }
  return false;
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function getPasswordRequirements(value: string): PasswordRequirement[] {
  return [
    { id: 'length', label: 'At least 8 characters', met: value.length >= 8 },
    { id: 'uppercase', label: 'One uppercase letter', met: /[A-Z]/.test(value) },
    { id: 'lowercase', label: 'One lowercase letter', met: /[a-z]/.test(value) },
    { id: 'number', label: 'One number', met: /[0-9]/.test(value) },
    { id: 'symbol', label: 'One special character', met: /[^A-Za-z0-9\s]/.test(value) },
    { id: 'sequence', label: 'No common or sequential pattern', met: !hasSequentialPattern(value) },
  ];
}

export function passwordMeetsRequirements(value: string) {
  return getPasswordRequirements(value).every((requirement) => requirement.met);
}
