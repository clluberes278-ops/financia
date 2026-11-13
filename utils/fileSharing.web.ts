export async function shareTextFile(fileName: string, contents: string, mimeType: string, _title: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function sharePdf(html: string, _title: string): Promise<void> {
  const win = window.open('', '_blank');
  if (!win) throw new Error('No se pudo abrir la vista de impresión. Permite las ventanas emergentes.');
  win.opener = null;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
