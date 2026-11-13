export function getAuthRedirectUri(): string {
  return window.location.origin;
}

export async function openAuthSession(_url: string, _redirectUri: string): Promise<{ type: 'cancel' }> {
  throw new Error('La autenticación web usa una redirección de página completa.');
}
