const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 128;
const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 254;
const MAX_NOTE_LENGTH = 5000;
const MAX_ADDRESS_LENGTH = 500;

export function validatePassword(password: string): void {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
    );
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at most ${MAX_PASSWORD_LENGTH} characters`
    );
  }
}

export function validateEmail(email: string): void {
  if (!email || email.length > MAX_EMAIL_LENGTH) {
    throw new Error("Invalid email address");
  }
  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error("Invalid email address");
  }
}

export function validateName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new Error("Name is required");
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`Name must be at most ${MAX_NAME_LENGTH} characters`);
  }
}

export function validateNote(note: string | undefined): void {
  if (note !== undefined && note.length > MAX_NOTE_LENGTH) {
    throw new Error(`Note must be at most ${MAX_NOTE_LENGTH} characters`);
  }
}

export function validateAddress(address: string): void {
  if (!address || address.trim().length === 0) {
    throw new Error("Address is required");
  }
  if (address.length > MAX_ADDRESS_LENGTH) {
    throw new Error(
      `Address must be at most ${MAX_ADDRESS_LENGTH} characters`
    );
  }
}
