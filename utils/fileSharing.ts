import ReactNativeBlobUtil from 'react-native-blob-util';
import Share from 'react-native-share';

export async function shareFile(path: string, mimeType: string, title: string): Promise<void> {
  await Share.open({ url: path.startsWith('file://') ? path : `file://${path}`, type: mimeType, title, failOnCancel: false });
}

export async function shareTextFile(fileName: string, contents: string, mimeType: string, title: string): Promise<void> {
  const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`;
  await ReactNativeBlobUtil.fs.writeFile(path, contents, 'utf8');
  await shareFile(path, mimeType, title);
}

export async function sharePdf(html: string, title: string): Promise<void> {
  const { generatePDF } = await import('react-native-html-to-pdf');
  const result = await generatePDF({ html, fileName: `Financia_${Date.now()}`, width: 612, height: 792, padding: 20, base64: false });
  if (!result.filePath) throw new Error('No se pudo generar el PDF.');
  await shareFile(result.filePath, 'application/pdf', title);
}
