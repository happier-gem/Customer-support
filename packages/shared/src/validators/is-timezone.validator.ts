import { registerDecorator, type ValidationOptions } from 'class-validator';

/** Whether `value` is a timezone name the JS runtime's ICU data recognizes (e.g. "America/New_York"). */
export function isValidTimezone(value: unknown): boolean {
  if (typeof value !== 'string' || !value) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Validates that a string is a real IANA timezone name, e.g. "America/New_York" or "UTC". */
export function IsTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isTimezone',
      target: object.constructor,
      propertyName,
      options: { message: 'timezone must be a valid IANA timezone name', ...validationOptions },
      validator: {
        validate: isValidTimezone,
      },
    });
  };
}
