export function getAuthRedirectUri(): string {
  return 'financia://auth/callback';
}

export async function openAuthSession(url: string, redirectUri: string) {
  const { InAppBrowser } = await import('react-native-inappbrowser-reborn');
  if (!await InAppBrowser.isAvailable()) {
    throw new Error('No hay un navegador compatible para iniciar sesión en este dispositivo.');
  }
  return InAppBrowser.openAuth(url, redirectUri, { showTitle: false, ephemeralWebSession: false });
}
