import { IDENTIFIER_TYPE } from "./enum";

export const classifyContactInfo = (input: string): IDENTIFIER_TYPE => {
  if (!input) return IDENTIFIER_TYPE.UNKNOWN;

  const trimmedInput = input.trim();

  // 1. Check Email
  if (isEmail(trimmedInput)) {
    return IDENTIFIER_TYPE.EMAIL;
  }

  // 2. Check Phone types
  if (isPhoneWithCountryCode(trimmedInput)) {
    return IDENTIFIER_TYPE.PHONE_WITH_COUNTRY_CODE;
  }

  if (isPhoneZeroPrefix(trimmedInput)) {
    return IDENTIFIER_TYPE.PHONE_WITH_ZERO_PREFIX;
  }

  if (isPhoneNoPrefix(trimmedInput)) {
    return IDENTIFIER_TYPE.PHONE_WITHOUT_PREFIX;
  }

  return IDENTIFIER_TYPE.UNKNOWN;
};

const isEmail = (input: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(input);
};

const isValidPhoneFormat = (input: string): boolean => {
  const digits = input.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;

  const allowedCharsRegex = /^[0-9+\-.\s()]*$/;
  return allowedCharsRegex.test(input);
};

const isPhoneWithCountryCode = (input: string): boolean => {
  return input.startsWith('+') && isValidPhoneFormat(input);
};

const isPhoneZeroPrefix = (input: string): boolean => {
  return input.startsWith('0') && isValidPhoneFormat(input);
};

const isPhoneNoPrefix = (input: string): boolean => {
  const firstChar = input.charAt(0);
  return /[1-9]/.test(firstChar) && isValidPhoneFormat(input);
};

/**
 * Joins a list of names and truncates them if they get too long.
 * @param names Array of strings (e.g. ["Hậu", "Hiếu", "Linh"])
 * @param maxLength The character limit before cutting (Default: 30)
 */
export const formatParticipantNames = (names: string[], maxLength: number = 30): string => {
  // 1. Join them nicely
  const joined = names.join(", ");

  // 2. Check if it fits
  if (joined.length <= maxLength) {
    return joined;
  }

  // 3. Truncate and add ellipsis
  // We subtract 3 so the final string (including "...") fits exactly within maxLength
  return joined.slice(0, maxLength - 3) + "...";
}
