const FOLDER_NAME = 'Evidencias Trazabilidad Logistica';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const folder = getOrCreateFolder_(FOLDER_NAME);
    const bytes = Utilities.base64Decode(payload.base64);
    const blob = Utilities.newBlob(bytes, payload.mimeType || 'image/jpeg', payload.fileName || `evidencia_${Date.now()}.jpg`);
    const file = folder.createFile(blob);
    file.setDescription(`Caso: ${payload.caseId || ''} · ${payload.label || ''}`);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return ContentService
      .createTextOutput(JSON.stringify({
        ok: true,
        fileId: file.getId(),
        url: file.getUrl(),
        name: file.getName()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}
