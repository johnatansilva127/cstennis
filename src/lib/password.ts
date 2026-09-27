/** Política de senha (espelha a configuração do Supabase Auth: mínimo 10, letras e números). */
export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < 10) return "Use pelo menos 10 caracteres.";
  if (password.length > 128) return "Use no máximo 128 caracteres.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use letras e números.";
  if (password !== confirm) return "As senhas não conferem.";
  return null;
}
