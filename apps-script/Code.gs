/* DinoEater Google Apps Script API. Deploy as Web App: execute as Me, access Anyone. */
const SPREADSHEET_ID = '1nPONvDcRaOL1zBVPGzcz3bYsBM7f8L6QhJF5yhR2s04';
const DRIVE_FOLDER_NAME = 'DinoEater Uploads';
const SESSION_SECONDS = 21600;

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

const DEFAULT_SETTINGS = {
  StoreName: 'DinoEater',
  StorePhone: '',
  StoreAddress: '',
  StoreLat: '',
  StoreLng: '',
  PrepMinutes: '10',
  DisputeMinutes: '10',
  FreeDeliveryDistanceKm: '2',
  DeliveryFeePerKm: '5',
  FreeDeliveryMinimum: '200',
  StampSpendAmount: '50',
  StampIcon: '',
  ThankYouMessage: 'ขอบคุณที่ใช้บริการ DinoEater',
  AcceptingOrders: 'TRUE'
};

const DEFAULT_PROMOTIONS = [
  { PromoType: 'NewMember', Condition: 'first_order', DiscountValue: '20', FreeMenuID: '', IsActive: 'TRUE' },
  { PromoType: 'MobileBanking', Condition: 'payment_transfer', DiscountValue: '10', FreeMenuID: '', IsActive: 'TRUE' },
  { PromoType: 'StampReward', Condition: '10', DiscountValue: '20', FreeMenuID: '', IsActive: 'TRUE' }
];

function doGet(e) { return reply_(dispatch_(e.parameter || {})); }
function doPost(e) { try { return reply_(dispatch_(JSON.parse((e.postData && e.postData.contents) || '{}'))); } catch (error) { return reply_({ ok: false, error: error.message }); } }
function reply_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }

function dispatch_(request) {
  try {
    const action = request.action;
    if (action === 'setupDatabase') return ok_(setupDatabase());
    if (action === 'seedDemo') return ok_(seedDemo_());
    if (action === 'getStore') return ok_(getStore_());
    if (action === 'login') return ok_(login_(request));
    if (action === 'updateProfile') return ok_(updateProfile_(request));
    if (action === 'createOrder') return ok_(createOrder_(request));
    if (action === 'getOrder') return ok_(getOrder_(request));
    if (action === 'getOrders') return ok_(getOrders_(request));
    if (action === 'updateOrderStatus') return ok_(updateStatus_(request));
    if (action === 'getMenu') return ok_(getMenu_(request));
    if (action === 'saveMenu') return ok_(saveMenu_(request));
    if (action === 'deleteMenu') return ok_(deleteMenu_(request));
    if (action === 'getPromotions') return ok_(rows_('Promotions'));
    if (action === 'savePromotion') return ok_(savePromotion_(request));
    if (action === 'saveSettings') return ok_(saveSettings_(request));
    if (action === 'getUsers') return ok_(getUsers_(request));
    if (action === 'setUserRole') return ok_(setUserRole_(request));
    if (action === 'updateUser') return ok_(updateUser_(request));
    if (action === 'deleteUser') return ok_(deleteUser_(request));
    if (action === 'adjustStamps') return ok_(adjustStamps_(request));
    if (action === 'openDispute') return ok_(openDispute_(request));
    if (action === 'sendChat') return ok_(sendChat_(request));
    if (action === 'getChat') return ok_(getChat_(request));
    if (action === 'resolveDispute') return ok_(resolveDispute_(request));
    if (action === 'getAuditLogs') return ok_(getAuditLogs_(request));
    throw new Error('Unknown action: ' + action);
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
function ok_(data) { return { ok: true, data: data }; }

function setupDatabase() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.keys(TABLES).forEach(function (name) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(TABLES[name]);
    sheet.setFrozenRows(1);
  });
  const settings = ss.getSheetByName('Settings');
  const known = rows_('Settings').map(function (row) { return String(row.Key); });
  Object.keys(DEFAULT_SETTINGS).forEach(function (key) {
    if (known.indexOf(key) < 0) settings.appendRow([key, DEFAULT_SETTINGS[key]]);
  });
  if (rows_('Promotions').length === 0) DEFAULT_PROMOTIONS.forEach(function (promo) { append_('Promotions', promo); });
  return 'Database ready';
}

function seedDemo_() {
  const demoMenu = [
    { ID: 'M001', Name: 'ลูกชิ้นหมูทอด', Description: 'ลูกชิ้นหมูสูตรโบราณ ทอดร้อนๆ', Price: 40, ImageURL: '', Stock: 'Unlimited', IsActive: 'TRUE' },
    { ID: 'M002', Name: 'เกี๊ยวกรอบ', Description: 'เกี๊ยวหมูกรอบนอกนุ่มใน', Price: 35, ImageURL: '', Stock: 'Unlimited', IsActive: 'TRUE' },
    { ID: 'M003', Name: 'เฟรนช์ฟรายส์', Description: 'มันฝรั่งทอดเกลือ', Price: 30, ImageURL: '', Stock: '50', IsActive: 'TRUE' },
    { ID: 'M004', Name: 'น้ำอัดลม', Description: 'เย็นฉ่ำ แก้ว 16 ออนซ์', Price: 20, ImageURL: '', Stock: 'Unlimited', IsActive: 'TRUE' }
  ];
  if (rows_('Menu').length === 0) demoMenu.forEach(function (item) { append_('Menu', item); });
  const adminPhone = '0800000000';
  const hasAdmin = rows_('Users').some(function (row) { return phone_(row.Phone) === adminPhone; });
  if (!hasAdmin) append_('Users', { ID: 'U' + Date.now(), Phone: adminPhone, PIN: '1234', Name: 'เจ้าของร้าน', ProfilePic: '', Role: 'SuperAdmin', Stamps: 0, CreatedAt: new Date() });
  if (rows_('Promotions').length === 0) DEFAULT_PROMOTIONS.forEach(function (promo) { append_('Promotions', promo); });
  return 'Demo data ready';
}

/* ---------- sheet helpers ---------- */
function sheet_(name) { const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name); if (!sheet) throw new Error('Run setupDatabase first'); return sheet; }
function rows_(name) { const values = sheet_(name).getDataRange().getValues(); if (values.length < 2) return []; return values.slice(1).map(function (row) { return values[0].reduce(function (item, key, index) { item[key] = row[index]; return item; }, {}); }); }
function append_(table, object) { sheet_(table).appendRow(TABLES[table].map(function (key) { return object[key] === undefined ? '' : object[key]; })); }
function find_(name, key, value) { const result = rows_(name).filter(function (row) { return String(row[key]) === String(value); })[0]; if (!result) throw new Error('ไม่พบข้อมูล'); return result; }
function rowIndex_(name, key, value) {
  const values = sheet_(name).getDataRange().getValues(), index = values[0].indexOf(key);
  for (let i = 1; i < values.length; i++) { if (String(values[i][index]) === String(value)) return i + 1; }
  return -1;
}
function updateRow_(table, key, value, changes) { updateWhere_(table, key, value, changes); }
function updateWhere_(table, key, value, changes) {
  const sheet = sheet_(table), values = sheet.getDataRange().getValues(), headers = values[0], index = headers.indexOf(key);
  let updated = 0;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][index]) !== String(value)) continue;
    Object.keys(changes).forEach(function (field) { const column = headers.indexOf(field); if (column >= 0) sheet.getRange(i + 1, column + 1).setValue(changes[field]); });
    updated++;
  }
  if (!updated) throw new Error('ไม่พบข้อมูลสำหรับแก้ไข');
  return updated;
}
function deleteRow_(table, key, value) {
  const row = rowIndex_(table, key, value);
  if (row < 1) throw new Error('ไม่พบข้อมูล');
  sheet_(table).deleteRow(row);
  return 'Deleted';
}
function settings_() { return Object.assign({}, DEFAULT_SETTINGS, rows_('Settings').reduce(function (result, row) { result[row.Key] = row.Value; return result; }, {})); }
function phone_(value) { const digits = String(value === undefined || value === null ? '' : value).replace(/\D/g, ''); return digits.length === 9 ? '0' + digits : digits; }
function number_(value) { const result = Number(value); return isNaN(result) ? 0 : result; }
function promote_(promos, type) { return promos.filter(function (p) { return String(p.PromoType) === type && String(p.IsActive).toUpperCase() !== 'FALSE'; })[0] || null; }

/* ---------- auth ---------- */
function session_(user) { const token = Utilities.getUuid(); CacheService.getScriptCache().put('session:' + token, JSON.stringify({ ID: user.ID, Role: String(user.Role || 'Customer') }), SESSION_SECONDS); return token; }
function sessionUser_(token) { if (!token) return null; const value = CacheService.getScriptCache().get('session:' + token); return value ? JSON.parse(value) : null; }
function requireAdmin_(token) {
  const user = sessionUser_(token);
  if (!user) throw new Error('กรุณาเข้าสู่ระบบผู้ดูแล');
  if (['Admin', 'SuperAdmin'].indexOf(user.Role) < 0) throw new Error('ไม่มีสิทธิ์ผู้ดูแล');
  return user;
}
function requireSuper_(token) { const user = requireAdmin_(token); if (user.Role !== 'SuperAdmin') throw new Error('เฉพาะ SuperAdmin เท่านั้น'); return user; }
function log_(adminId, actionType, detail) { append_('AuditLogs', { LogID: 'L' + Utilities.getUuid(), AdminID: adminId || '', ActionType: actionType, Detail: detail, Timestamp: new Date() }); }

function login_(request) {
  const phone = phone_(request.phone);
  if (!phone) throw new Error('กรุณาระบุเบอร์โทรศัพท์');
  if (!/^0\d{8,9}$/.test(phone)) throw new Error('เบอร์โทรศัพท์ไม่ถูกต้อง');
  const existing = rows_('Users').filter(function (row) { return phone_(row.Phone) === phone; })[0];
  if (existing) {
    if (request.pin && String(existing.PIN) !== String(request.pin)) throw new Error('PIN ไม่ถูกต้อง');
    if (request.register && !String(existing.PIN)) updateRow_('Users', 'ID', existing.ID, { PIN: request.pin || '' });
    const firstOrder = ordersByUser_(existing.ID).length === 0;
    return Object.assign({}, existing, { Phone: phone, IsFirstOrder: firstOrder, SessionToken: session_(existing) });
  }
  if (!request.register) throw new Error('ยังไม่มีบัญชีนี้ กรุณาสมัครสมาชิก');
  const user = { ID: 'U' + Date.now(), Phone: phone, PIN: request.pin || '', Name: request.name || 'ลูกค้า DinoEater', ProfilePic: '', Role: 'Customer', Stamps: 0, CreatedAt: new Date() };
  append_('Users', user);
  return Object.assign({}, user, { IsFirstOrder: true, SessionToken: session_(user) });
}
function updateProfile_(request) {
  const phone = phone_(request.phone);
  const user = rows_('Users').filter(function (row) { return phone_(row.Phone) === phone; })[0];
  if (!user) throw new Error('ไม่พบผู้ใช้');
  const changes = {};
  if (request.name) changes.Name = request.name;
  if (request.profilePicBase64) changes.ProfilePic = uploadBase64_(request.profilePicBase64, 'profile-' + user.ID + '.jpg');
  if (!Object.keys(changes).length) throw new Error('ไม่มีข้อมูลที่จะแก้ไข');
  updateRow_('Users', 'ID', user.ID, changes);
  return Object.assign({}, user, changes);
}

/* ---------- store ---------- */
function getStore_() {
  const settings = settings_();
  const menu = rows_('Menu').filter(function (row) { return String(row.IsActive).toUpperCase() !== 'FALSE'; });
  const promos = rows_('Promotions').filter(function (row) { return String(row.IsActive).toUpperCase() !== 'FALSE'; });
  return { settings: settings, menu: menu, promotions: promos };
}
function getMenu_(request) { if (request.sessionToken) requireAdmin_(request.sessionToken); return rows_('Menu'); }
function getPromotions_() { return rows_('Promotions'); }

/* ---------- orders ---------- */
function ordersByUser_(userId) { return rows_('Orders').filter(function (row) { return String(row.UserID) === String(userId); }); }
function getOrder_(request) { const order = find_('Orders', 'OrderID', request.orderId); return Object.assign({}, order, { items: rows_('OrderItems').filter(function (row) { return String(row.OrderID) === String(order.OrderID); }) }); }
function getOrders_(request) {
  requireAdmin_(request.sessionToken);
  return rows_('Orders').sort(function (a, b) { return String(b.CreatedAt).localeCompare(String(a.CreatedAt)); }).slice(0, 100);
}
function createOrder_(request) {
  if (!request.order || !request.items || !request.items.length) throw new Error('ข้อมูลออเดอร์ไม่ครบ');
  const settings = settings_();
  if (String(settings.AcceptingOrders).toUpperCase() === 'FALSE') throw new Error('ร้านปิดรับออเดอร์ชั่วคราว');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const o = request.order;
    const id = 'DE' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss') + Math.floor(Math.random() * 100);
    const redeem = o.redeemStamps && o.userId ? prepareStampRedemption_(o.userId, id) : null;
    const slip = o.slipBase64 ? uploadBase64_(o.slipBase64, 'slip-' + id + '.jpg') : '';
    const order = {
      OrderID: id, UserID: o.userId || '', Phone: phone_(o.phone), OrderType: o.orderType, AddressDetail: o.addressDetail || '',
      Lat: o.lat || '', Lng: o.lng || '', Distance: number_(o.distance), DeliveryFee: number_(o.deliveryFee),
      PaymentMethod: o.paymentMethod, SubTotal: number_(o.subTotal), Discount: number_(o.discount), Total: number_(o.total),
      Status: 'Pending', SlipURL: slip, EstimatedTime: number_(o.estimatedTime) || number_(settings.PrepMinutes), CreatedAt: new Date(), CompletedAt: ''
    };
    append_('Orders', order);
    request.items.forEach(function (item) { append_('OrderItems', { ID: 'OI' + Utilities.getUuid(), OrderID: id, MenuID: item.menuId, Quantity: number_(item.quantity), Price: number_(item.price) }); });
    if (redeem) updateRow_('Users', 'ID', redeem.userId, { Stamps: redeem.remaining });
    return getOrder_({ orderId: order.OrderID });
  } finally {
    lock.releaseLock();
  }
}
function prepareStampRedemption_(userId, orderId) {
  const user = find_('Users', 'ID', userId);
  const reward = promote_(rows_('Promotions'), 'StampReward');
  if (!reward) throw new Error('ยังไม่เปิดใช้การแลกแสตมป์');
  const cost = number_(reward.Condition);
  if (cost < 1) throw new Error('ตั้งค่าแสตมป์ไม่ถูกต้อง');
  if (number_(user.Stamps) < cost) throw new Error('แสตมป์ไม่เพียงพอ');
  append_('AuditLogs', { LogID: 'L' + Utilities.getUuid(), AdminID: '', ActionType: 'REDEEM_STAMPS', Detail: userId + ' -' + cost + ' stamps for ' + orderId, Timestamp: new Date() });
  return { userId: user.ID, remaining: number_(user.Stamps) - cost };
}
function updateStatus_(request) {
  const admin = requireAdmin_(request.sessionToken);
  const order = find_('Orders', 'OrderID', request.orderId);
  const allowed = ['Pending', 'Accepted', 'Ready', 'Completed', 'Cancelled'];
  if (allowed.indexOf(request.status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  const changes = { Status: request.status };
  if (request.estimatedTime) changes.EstimatedTime = number_(request.estimatedTime);
  if (request.status === 'Completed') {
    changes.CompletedAt = new Date();
    if (order.UserID) {
      const user = rows_('Users').filter(function (row) { return String(row.ID) === String(order.UserID); })[0];
      if (user) {
        const earned = Math.floor(number_(order.Total) / number_(settings_().StampSpendAmount));
        updateRow_('Users', 'ID', user.ID, { Stamps: number_(user.Stamps) + earned });
      }
    }
  }
  updateRow_('Orders', 'OrderID', order.OrderID, changes);
  log_(admin.ID, 'ORDER_STATUS', order.OrderID + ' -> ' + request.status);
  return getOrder_(request);
}

/* ---------- menu ---------- */
function saveMenu_(request) {
  const admin = requireAdmin_(request.sessionToken);
  const item = request.menu || {};
  if (!item.Name) throw new Error('กรุณาระบุชื่อเมนู');
  const image = item.imageBase64 ? uploadBase64_(item.imageBase64, 'menu-' + Utilities.getUuid() + '.jpg') : '';
  const record = {
    ID: item.ID || 'M' + Date.now(),
    Name: item.Name,
    Description: item.Description || '',
    Price: number_(item.Price),
    ImageURL: image || item.ImageURL || '',
    Stock: item.Stock === '' || item.Stock === undefined ? 'Unlimited' : item.Stock,
    IsActive: String(item.IsActive) === 'false' ? 'FALSE' : 'TRUE'
  };
  if (item.ID) updateRow_('Menu', 'ID', item.ID, record); else append_('Menu', record);
  log_(admin.ID, item.ID ? 'MENU_UPDATE' : 'MENU_CREATE', record.Name);
  return record;
}
function deleteMenu_(request) {
  const admin = requireAdmin_(request.sessionToken);
  updateRow_('Menu', 'ID', request.menuId, { IsActive: 'FALSE' });
  log_(admin.ID, 'MENU_DELETE', request.menuId);
  return 'Deleted';
}

/* ---------- promotions & settings ---------- */
function savePromotion_(request) {
  const admin = requireAdmin_(request.sessionToken);
  const promo = request.promotion || {};
  const record = { PromoType: promo.PromoType, Condition: promo.Condition, DiscountValue: number_(promo.DiscountValue), FreeMenuID: promo.FreeMenuID || '', IsActive: String(promo.IsActive) === 'false' ? 'FALSE' : 'TRUE' };
  if (rows_('Promotions').some(function (row) { return String(row.PromoType) === String(record.PromoType); })) updateRow_('Promotions', 'PromoType', record.PromoType, record);
  else append_('Promotions', record);
  log_(admin.ID, 'PROMO_UPDATE', record.PromoType);
  return record;
}
function saveSettings_(request) {
  const admin = requireAdmin_(request.sessionToken);
  const incoming = request.settings || {};
  Object.keys(incoming).forEach(function (key) {
    if (key === 'StampIconBase64') return;
    if (rows_('Settings').some(function (row) { return String(row.Key) === key; })) updateRow_('Settings', 'Key', key, { Value: incoming[key] });
    else append_('Settings', { Key: key, Value: incoming[key] });
  });
  if (incoming.StampIconBase64) {
    const url = uploadBase64_(incoming.StampIconBase64, 'stamp-icon.jpg');
    if (rows_('Settings').some(function (row) { return String(row.Key) === 'StampIcon'; })) updateRow_('Settings', 'Key', 'StampIcon', { Value: url });
    else append_('Settings', { Key: 'StampIcon', Value: url });
  }
  log_(admin.ID, 'SETTINGS_UPDATE', Object.keys(incoming).join(','));
  return settings_();
}

/* ---------- users (admin) ---------- */
function getUsers_(request) {
  requireAdmin_(request.sessionToken);
  return rows_('Users').map(function (row) { return { ID: row.ID, Phone: phone_(row.Phone), Name: row.Name, ProfilePic: row.ProfilePic, Role: row.Role, Stamps: number_(row.Stamps), CreatedAt: row.CreatedAt }; });
}
function setUserRole_(request) {
  const admin = requireSuper_(request.sessionToken);
  if (['Admin', 'SuperAdmin', 'Customer'].indexOf(request.role) < 0) throw new Error('บทบาทไม่ถูกต้อง');
  updateRow_('Users', 'ID', request.userId, { Role: request.role });
  log_(admin.ID, 'USER_ROLE', request.userId + ' -> ' + request.role);
  return 'Updated';
}
function updateUser_(request) {
  const admin = requireAdmin_(request.sessionToken);
  const changes = {};
  if (request.name) changes.Name = request.name;
  if (request.role) { if (admin.Role !== 'SuperAdmin') throw new Error('เฉพาะ SuperAdmin เท่านั้น'); if (['Admin', 'SuperAdmin', 'Customer'].indexOf(request.role) < 0) throw new Error('บทบาทไม่ถูกต้อง'); changes.Role = request.role; }
  if (!Object.keys(changes).length) throw new Error('ไม่มีข้อมูลที่จะแก้ไข');
  updateRow_('Users', 'ID', request.userId, changes);
  log_(admin.ID, 'USER_UPDATE', request.userId + ' ' + Object.keys(changes).join(','));
  return find_('Users', 'ID', request.userId);
}
function deleteUser_(request) {
  const admin = requireSuper_(request.sessionToken);
  deleteRow_('Users', 'ID', request.userId);
  log_(admin.ID, 'DELETE_USER', request.userId);
  return 'Deleted';
}
function adjustStamps_(request) {
  const admin = requireAdmin_(request.sessionToken);
  const user = find_('Users', 'ID', request.userId);
  const next = number_(user.Stamps) + number_(request.amount);
  updateRow_('Users', 'ID', user.ID, { Stamps: next < 0 ? 0 : next });
  log_(admin.ID, 'STAMPS_ADJUST', request.userId + ' ' + request.amount);
  return { ID: user.ID, Stamps: next < 0 ? 0 : next };
}

/* ---------- disputes & chat ---------- */
function openDispute_(request) {
  const order = find_('Orders', 'OrderID', request.orderId);
  if (String(order.Status) !== 'Completed') throw new Error('ยังไม่สามารถรายงานปัญหาได้');
  const window_ = number_(settings_().DisputeMinutes);
  if (order.CompletedAt && window_ > 0) {
    const elapsed = (new Date().getTime() - new Date(order.CompletedAt).getTime()) / 60000;
    if (elapsed > window_) throw new Error('พ้นเวลารายงานปัญหาแล้ว');
  }
  const existing = rows_('ChatDisputes').filter(function (row) { return String(row.OrderID) === String(order.OrderID); });
  if (!existing.length) append_('ChatDisputes', { ChatID: 'C' + Utilities.getUuid(), OrderID: order.OrderID, SenderRole: 'Customer', Message: request.message || 'รายงานปัญหา', Timestamp: new Date(), Status: 'Open' });
  else if (request.message) sendChat_({ orderId: order.OrderID, senderRole: 'Customer', message: request.message, sessionToken: request.sessionToken });
  return getChat_({ orderId: order.OrderID, sessionToken: request.sessionToken, customerPhone: order.Phone });
}
function sendChat_(request) {
  const order = find_('Orders', 'OrderID', request.orderId);
  let role = 'Customer';
  if (request.sessionToken && sessionUser_(request.sessionToken)) { const admin = requireAdmin_(request.sessionToken); role = 'Admin'; log_(admin.ID, 'CHAT_REPLY', request.orderId); }
  else if (phone_(order.Phone) !== phone_(request.customerPhone)) throw new Error('ไม่มีสิทธิ์ในห้องแชทนี้');
  append_('ChatDisputes', { ChatID: 'C' + Utilities.getUuid(), OrderID: order.OrderID, SenderRole: role, Message: request.message, Timestamp: new Date(), Status: 'Open' });
  return getChat_({ orderId: order.OrderID, sessionToken: request.sessionToken, customerPhone: request.customerPhone });
}
function getChat_(request) {
  const order = find_('Orders', 'OrderID', request.orderId);
  const token = request.sessionToken;
  const isAdmin = token && sessionUser_(token) && ['Admin', 'SuperAdmin'].indexOf(sessionUser_(token).Role) >= 0;
  if (!isAdmin && phone_(order.Phone) !== phone_(request.customerPhone)) throw new Error('ไม่มีสิทธิ์ในห้องแชทนี้');
  const messages = rows_('ChatDisputes').filter(function (row) { return String(row.OrderID) === String(order.OrderID); });
  return { orderId: order.OrderID, status: messages.some(function (row) { return String(row.Status) === 'Resolved'; }) ? 'Resolved' : (messages.length ? 'Open' : 'None'), messages: messages };
}
function resolveDispute_(request) {
  const admin = requireAdmin_(request.sessionToken);
  updateWhere_('ChatDisputes', 'OrderID', request.orderId, { Status: 'Resolved' });
  log_(admin.ID, 'DISPUTE_RESOLVED', request.orderId);
  return 'Resolved';
}
function getAuditLogs_(request) {
  requireSuper_(request.sessionToken);
  return rows_('AuditLogs').sort(function (a, b) { return String(b.Timestamp).localeCompare(String(a.Timestamp)); }).slice(0, 200);
}

/* ---------- drive ---------- */
function uploadBase64_(dataUrl, filename) {
  const matches = String(dataUrl).match(/^data:(.+);base64,(.+)$/);
  if (!matches) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
  const folder = getFolder_();
  const blob = Utilities.newBlob(Utilities.base64Decode(matches[2]), matches[1], filename);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';
}
function getFolder_() {
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);
}
