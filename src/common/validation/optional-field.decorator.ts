import { ValidateIf } from 'class-validator';

// Optional means omitted, not null. Null still goes through the actual field validators.
export const OptionalField = () => ValidateIf((_, value: unknown) => value !== undefined);
