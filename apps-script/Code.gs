/* DinoEater Google Apps Script API. Deploy as Web App: execute as Me, access Anyone. */
const SPREADSHEET_ID = '1nPONvDcRaOL1zBVPGzcz3bYsBM7f8L6QhJF5yhR2s04';
const DRIVE_FOLDER_NAME = 'DinoEater Uploads';
const TABLES = {
  Settings: ['Key', 'Value'],
  Users: ['ID', 'Phone', 'PIN', 'Name', 'ProfilePic', 'Role', 'Stamps', 'CreatedAt'],
  Menu: ['ID', 'Name', 'Description', 'Price', 'ImageURL', 'Stock', 'IsActive'],
  Orders: ['OrderID', 'UserID', 'Phone', 'OrderType', 'AddressDetail', 'Lat', 'Lng', 'Distance', 'DeliveryFee', 'PaymentMethod', 'SubTotal', 'Discount', 'Total', 'Status', 'SlipURL', 'EstimatedTime', 'CreatedAt', 'CompletedAt'],
  OrderItems: ['ID', 'OrderID', 'MenuID', 'Quantity', 'Price'],
  Promotions: ['PromoType', 'Condition', 'DiscountValue', 'FreeMenuID', 'IsActive'],
  ChatDisputes: ['ChatID', 'OrderID', 'SenderRole', 'Message', 'Timestamp', 'Status'],
  AuditLogs: ['LogID', 'AdminID', 'ActionType', 'Detail', 'Timestamp']
};
const DEFAULT_SETTINGS = { StoreName: 'DinoEater', PrepMinutes: '10', DisputeMinutes: '10', FreeDeliveryDistanceKm: '2', DeliveryFeePerKm: '5', FreeDeliveryMinimum: '200', StampSpendAmount: '50', ThankYouMessage: 'ขอบคุณที่ใช้บริการ DinoEater' };

function doGet(e) { return reply_(dispatch_(e.parameter || {})); }
function doPost(e) { try { return reply_(dispatch_(JSON.parse(e.postData.contents || '{}'))); } catch (error) { return reply_({ ok: false, error: error.message }); } }
function reply_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
function dispatch_(request) {
  try {
    const action = request.action;
    if (action === 'setupDatabase') return { ok: true, data: setupDatabase() };
    if (action === 'seedDemo') return { ok: true, data: seedDemo_() };
    if (action === 'getStore') return { ok: true, data: { settings: settings_(), menu: rows_('Menu').filter(r => String(r.IsActive).toUpperCase() !== 'FALSE') } };
    if (action === 'login') return { ok: true, data: login_(request) };
    if (action === 'createOrder') return { ok: true, data: createOrder_(request) };
    if (action === 'getOrder') return { ok: true, data: find_('Orders', 'OrderID', request.orderId) };
    if (action === 'getOrders') { requireAdmin_(request.sessionToken); return { ok: true, data: rows_('Orders').sort((a, b) => String(b.CreatedAt).localeCompare(String(a.CreatedAt))).slice(0, 100) }; }
    if (action === 'updateOrderStatus') return { ok: true, data: updateStatus_(request) };
    if (action === 'saveSettings') return { ok: true, data: saveSettings_(request.settings, request.sessionToken) };
    if (action === 'deleteUser') return { ok: true, data: deleteUser_(request) };
    throw new Error('Unknown action');
  } catch (error) { return { ok: false, error: error.message }; }
}
function setupDatabase() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.keys(TABLES).forEach(name => { let sheet = ss.getSheetByName(name); if (!sheet) sheet = ss.insertSheet(name); if (sheet.getLastRow() === 0) sheet.appendRow(TABLES[name]); sheet.setFrozenRows(1); });
  const settings = sheet_('Settings'); if (settings.getLastRow() < 2) Object.keys(DEFAULT_SETTINGS).forEach(key => settings.appendRow([key, DEFAULT_SETTINGS[key]]));
  return 'Database ready';
}
function seedDemo_() {
  const demoMenu = [
    { ID: 'M001', Name: 'ลูกชิ้นหมูทอด', Description: 'ลูกชิ้นหมูสูตรโบราณ ทอดร้อนๆ', Price: 40, ImageURL: '', Stock: 'Unlimited', IsActive: 'TRUE' },
    { ID: 'M002', Name: 'เกี๊ยวกรอบ', Description: 'เกี๊ยวหมูกรอบนอกนุ่มใน', Price: 35, ImageURL: '', Stock: 'Unlimited', IsActive: 'TRUE' },
    { ID: 'M003', Name: 'เฟรนช์ฟรายส์', Description: 'มันฝรั่งทอดเกลือ', Price: 30, ImageURL: '', Stock: '50', IsActive: 'TRUE' },
    { ID: 'M004', Name: 'น้ำอัดลม', Description: 'เย็นฉ่ำ แก้ว 16 ออนซ์', Price: 20, ImageURL: '', Stock: 'Unlimited', IsActive: 'TRUE' }
  ];
  if (rows_('Menu').length === 0) demoMenu.forEach(item => append_('Menu', item));
  const adminPhone = '0800000000';
  if (!rows_('Users').some(r => phone_(r.Phone) === adminPhone)) {
    append_('Users', { ID: 'U' + Date.now(), Phone: adminPhone, PIN: '1234', Name: 'เจ้าของร้าน', ProfilePic: '', Role: 'SuperAdmin', Stamps: 0, CreatedAt: new Date() });
  }
  return 'Demo data ready';
}
function sheet_(name) { const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name); if (!sheet) throw new Error('Run setupDatabase first'); return sheet; }
function rows_(name) { const sheet = sheet_(name); const values = sheet.getDataRange().getValues(); if (values.length < 2) return []; return values.slice(1).map(row => values[0].reduce((item, key, index) => { item[key] = row[index]; return item; }, {})); }
function find_(name, key, value) { const result = rows_(name).find(row => String(row[key]) === String(value)); if (!result) throw new Error('ไม่พบข้อมูล'); return result; }
function settings_() { return Object.assign({}, DEFAULT_SETTINGS, rows_('Settings').reduce((result, row) => { result[row.Key] = row.Value; return result; }, {})); }
function phone_(value) { const digits = String(value === undefined || value === null ? '' : value).replace(/\D/g, ''); return digits.length === 9 ? '0' + digits : digits; }
function login_(request) { const phone = phone_(request.phone); if (!phone) throw new Error('กรุณาระบุเบอร์โทรศัพท์'); const existing = rows_('Users').find(row => phone_(row.Phone) === phone); if (existing) { if (request.pin && String(existing.PIN) !== String(request.pin)) throw new Error('PIN ไม่ถูกต้อง'); if (request.name && request.name !== existing.Name) updateRow_('Users', 'ID', existing.ID, { Name: request.name }); return Object.assign(existing, { Phone: phone, Name: request.name || existing.Name, SessionToken: session_(existing) }); } const user = { ID: 'U' + Date.now(), Phone: phone, PIN: request.pin || '', Name: request.name || 'ลูกค้า DinoEater', ProfilePic: '', Role: 'Customer', Stamps: 0, CreatedAt: new Date() }; append_('Users', user); user.SessionToken = session_(user); return user; }
function createOrder_(request) { if (!request.order || !request.items || !request.items.length) throw new Error('ข้อมูลออเดอร์ไม่ครบ'); const lock = LockService.getScriptLock(); lock.waitLock(20000); try { const o = request.order, id = 'DE' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss') + Math.floor(Math.random() * 100); const slip = o.slipBase64 ? uploadBase64_(o.slipBase64, 'slip-' + id + '.jpg') : ''; const order = { OrderID: id, UserID: o.userId || '', Phone: o.phone, OrderType: o.orderType, AddressDetail: o.addressDetail || '', Lat: o.lat || '', Lng: o.lng || '', Distance: o.distance || 0, DeliveryFee: o.deliveryFee || 0, PaymentMethod: o.paymentMethod, SubTotal: o.subTotal, Discount: o.discount || 0, Total: o.total, Status: 'Pending', SlipURL: slip, EstimatedTime: o.estimatedTime || settings_().PrepMinutes, CreatedAt: new Date(), CompletedAt: '' }; append_('Orders', order); request.items.forEach(item => append_('OrderItems', { ID: 'OI' + Utilities.getUuid(), OrderID: id, MenuID: item.menuId, Quantity: item.quantity, Price: item.price })); return order; } finally { lock.releaseLock(); } }
function updateStatus_(request) { const admin = requireAdmin_(request.sessionToken), order = find_('Orders', 'OrderID', request.orderId); const changes = { Status: request.status }; if (request.status === 'Completed') { changes.CompletedAt = new Date(); if (order.UserID) { const user = find_('Users', 'ID', order.UserID); const earned = Math.floor(Number(order.Total) / Number(settings_().StampSpendAmount)); updateRow_('Users', 'ID', user.ID, { Stamps: Number(user.Stamps || 0) + earned }); } } updateRow_('Orders', 'OrderID', request.orderId, changes); append_('AuditLogs', { LogID: 'L' + Utilities.getUuid(), AdminID: admin.ID, ActionType: 'ORDER_STATUS', Detail: request.orderId + ' -> ' + request.status, Timestamp: new Date() }); return find_('Orders', 'OrderID', request.orderId); }
function deleteUser_(request) { const admin = requireAdmin_(request.sessionToken); if (admin.Role !== 'SuperAdmin') throw new Error('เฉพาะ SuperAdmin เท่านั้น'); const sheet = sheet_('Users'), values = sheet.getDataRange().getValues(), index = values[0].indexOf('ID'); const row = values.findIndex((r, i) => i > 0 && String(r[index]) === String(request.userId)); if (row < 1) throw new Error('ไม่พบผู้ใช้'); sheet.deleteRow(row + 1); append_('AuditLogs', { LogID: 'L' + Utilities.getUuid(), AdminID: admin.ID, ActionType: 'DELETE_USER', Detail: request.userId, Timestamp: new Date() }); return 'Deleted'; }
function saveSettings_(settings, sessionToken) { const admin = requireAdmin_(sessionToken); Object.keys(settings || {}).forEach(key => { const existing = rows_('Settings').find(row => row.Key === key); if (existing) updateRow_('Settings', 'Key', key, { Value: settings[key] }); else append_('Settings', { Key: key, Value: settings[key] }); }); append_('AuditLogs', { LogID: 'L' + Utilities.getUuid(), AdminID: admin.ID, ActionType: 'SETTINGS_UPDATE', Detail: JSON.stringify(settings), Timestamp: new Date() }); return settings_(); }
function session_(user) { const token = Utilities.getUuid(); CacheService.getScriptCache().put('session:' + token, JSON.stringify({ ID: user.ID, Role: user.Role }), 21600); return token; }
function requireAdmin_(token) { if (!token) throw new Error('กรุณาเข้าสู่ระบบผู้ดูแล'); const value = CacheService.getScriptCache().get('session:' + token); if (!value) throw new Error('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่'); const user = JSON.parse(value); if (['Admin', 'SuperAdmin'].indexOf(user.Role) < 0) throw new Error('ไม่มีสิทธิ์ผู้ดูแล'); return user; }
function append_(table, object) { const headers = TABLES[table]; sheet_(table).appendRow(headers.map(key => object[key] === undefined ? '' : object[key])); }
function updateRow_(table, key, value, changes) { const sheet = sheet_(table), values = sheet.getDataRange().getValues(), headers = values[0], index = headers.indexOf(key); const row = values.findIndex((r, i) => i > 0 && String(r[index]) === String(value)); if (row < 1) throw new Error('ไม่พบข้อมูลสำหรับแก้ไข'); Object.keys(changes).forEach(field => { const column = headers.indexOf(field); if (column >= 0) sheet.getRange(row + 1, column + 1).setValue(changes[field]); }); }
function uploadBase64_(dataUrl, filename) { const matches = dataUrl.match(/^data:(.+);base64,(.+)$/); if (!matches) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง'); const folder = getFolder_(); const blob = Utilities.newBlob(Utilities.base64Decode(matches[2]), matches[1], filename); const file = folder.createFile(blob); file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); return file.getUrl(); }
function getFolder_() { const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME); return folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME); }
