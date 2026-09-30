export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="field-error">{message}</p>;
}

export function fieldClass(hasError?: string) {
  return hasError ? "field invalid" : "field";
}
