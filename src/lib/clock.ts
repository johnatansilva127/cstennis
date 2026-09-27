/**
 * Instante da requisição para Server Components (renderizados uma vez por
 * requisição no servidor). Centralizado para facilitar testes e evitar uso de
 * Date.now() em componentes de cliente.
 */
export function requestNow(): number {
  return Date.now();
}
