/** Reglas de contraseña de las cuentas de clientes. Devuelve el problema o una cadena vacía. */
export function passwordError(password: string) {
  if (password.length < 10) return "Usá al menos 10 caracteres.";
  if (!/[a-záéíóúñ]/i.test(password) || !/[0-9]/.test(password)) return "Combiná letras y números.";
  if (password.length > 72) return "La contraseña es demasiado larga.";
  return "";
}
