/* DinoEater Google Apps Script API. Deploy as Web App: execute as Me, access Anyone. */
const SPREADSHEET_ID = '1nPONvDcRaOL1zBVPGzcz3bYsBM7f8L6QhJF5yhR2s04';
const DRIVE_FOLDER_NAME = 'DinoEater Uploads';
const SESSION_SECONDS = 21600;

const TABLES = {
  Settings: ['Key', 'Value'],
  Users: ['ID', 'Phone', 'PIN', 'Name', 'ProfilePic', 'Role', 'Stamps', 'CreatedAt', 'Address', 'Lat', 'Lng'],
  Menu: ['ID', 'Name', 'Description', 'Price', 'ImageURL', 'Stock', 'IsActive'],
  Orders: ['OrderID', 'UserID', 'Phone', 'OrderType', 'AddressDetail', 'Lat', 'Lng', 'Distance', 'DeliveryFee', 'PaymentMethod', 'SubTotal', 'Discount', 'Total', 'Status', 'SlipURL', 'EstimatedTime', 'CreatedAt', 'CompletedAt', 'StampEarned', 'StartedAt', 'QueuePosition', 'Options'],
  OrderItems: ['ID', 'OrderID', 'MenuID', 'Quantity', 'Price'],
  Promotions: ['PromoType', 'Condition', 'DiscountValue', 'FreeMenuID', 'IsActive'],
  OptionGroups: ['GroupID', 'Name', 'Required', 'MultiSelect', 'SortOrder', 'IsActive'],
  OptionChoices: ['ChoiceID', 'GroupID', 'Label', 'SortOrder', 'IsActive'],
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
    if (action === 'getCustomerOrders') return ok_(getCustomerOrders_(request));
    if (action === 'updateOrderStatus') return ok_(updateStatus_(request));
    if (action === 'getMenu') return ok_(getMenu_(request));
    if (action === 'saveMenu') return ok_(saveMenu_(request));
    if (action === 'deleteMenu') return ok_(deleteMenu_(request));
    if (action === 'listDriveImages') return ok_(listDriveImages_(request));
    if (action === 'useDriveImage') return ok_(useDriveImage_(request));
    if (action === 'getPromotions') return ok_(rows_('Promotions'));
    if (action === 'savePromotion') return ok_(savePromotion_(request));
    if (action === 'getOptionGroups') return ok_(getOptionGroups_(request));
    if (action === 'saveOptionGroup') return ok_(saveOptionGroup_(request));
    if (action === 'deleteOptionGroup') return ok_(deleteOptionGroup_(request));
    if (action === 'saveSettings') return ok_(saveSettings_(request));
    if (action === 'getUsers') return ok_(getUsers_(request));
    if (action === 'getMemberDetail') return ok_(getMemberDetail_(request));
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
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(TABLES[name]);
    } else {
      const width = Math.max(1, sheet.getLastColumn());
      const headers = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (value) { return String(value); });
      TABLES[name].forEach(function (key) {
        if (headers.indexOf(key) >= 0) return;
        let slot = headers.indexOf('');
        if (slot < 0) { headers.push(''); slot = headers.length - 1; }
        headers[slot] = key;
        sheet.getRange(1, slot + 1).setValue(key);
      });
    }
    sheet.setFrozenRows(1);
  });
  const settings = ss.getSheetByName('Settings');
  const known = rows_('Settings').map(function (row) { return String(row.Key); });
  Object.keys(DEFAULT_SETTINGS).forEach(function (key) {
    if (known.indexOf(key) < 0) settings.appendRow([key, DEFAULT_SETTINGS[key]]);
  });
  if (rows_('Promotions').length === 0) DEFAULT_PROMOTIONS.forEach(function (promo) { append_('Promotions', promo); });
  rows_('Orders').forEach(function (row) {
    if (String(row.Status) === 'Completed' && String(row.UserID) && String(row.StampEarned).toUpperCase() !== 'TRUE') {
      updateRow_('Orders', 'OrderID', row.OrderID, { StampEarned: 'TRUE' });
    }
  });
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
  const hasAdmin = rows_('Users').some(function (row) { return String(row.Role) === 'Admin' || String(row.Role) === 'SuperAdmin'; });
  if (!hasAdmin) append_('Users', { ID: 'U' + Date.now(), Phone: '0800000000', PIN: '', Name: 'เจ้าของร้าน', ProfilePic: '', Role: 'SuperAdmin', Stamps: 0, CreatedAt: new Date() });
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

function stampEarned_(total, settings) {
  const spend = number_(settings.StampSpendAmount);
  return spend > 0 ? Math.floor(number_(total) / spend) : 0;
}
function syncStamps_(phone, userId) {
  const user = find_('Users', 'ID', userId);
  const settings = settings_();
  let earned = 0;
  rows_('Orders').forEach(function (order) {
    if (phone_(order.Phone) !== phone) return;
    const changes = {};
    if (!String(order.UserID)) changes.UserID = userId;
    if (String(order.Status) === 'Completed' && String(order.StampEarned).toUpperCase() !== 'TRUE') {
      changes.StampEarned = 'TRUE';
      earned += stampEarned_(order.Total, settings);
    }
    if (Object.keys(changes).length) updateRow_('Orders', 'OrderID', order.OrderID, changes);
  });
  if (earned > 0) {
    const next = number_(user.Stamps) + earned;
    updateRow_('Users', 'ID', userId, { Stamps: next });
    return Object.assign({}, user, { Stamps: next });
  }
  return user;
}
function userByPhone_(phone) { return phone ? rows_('Users').filter(function (row) { return phone_(row.Phone) === phone; })[0] || null : null; }

function login_(request) {
  const phone = phone_(request.phone);
  if (!phone) throw new Error('กรุณาระบุเบอร์โทรศัพท์');
  if (!/^0\d{8,9}$/.test(phone)) throw new Error('เบอร์โทรศัพท์ไม่ถูกต้อง');
  let existing = userByPhone_(phone);
  if (!existing && request.register) {
    existing = { ID: 'U' + Date.now(), Phone: phone, PIN: '', Name: request.name || 'ลูกค้าทั่วไป', ProfilePic: '', Role: 'Customer', Stamps: 0, CreatedAt: new Date(), Address: request.address || '', Lat: request.lat || '', Lng: request.lng || '' };
    append_('Users', existing);
  }
  if (!existing) return { exists: false, Phone: phone };
  const role = String(existing.Role || 'Customer');
  if (role === 'Admin' || role === 'SuperAdmin') {
    const stored = String(existing.PIN || '').trim();
    if (!stored) {
      if (!request.pin) return { exists: true, needsPinSetup: true, Phone: phone, Name: existing.Name, Role: role };
      if (!/^\d{4,8}$/.test(String(request.pin))) throw new Error('รหัส PIN ต้องเป็นตัวเลข 4-8 หลัก');
      updateRow_('Users', 'ID', existing.ID, { PIN: String(request.pin) });
      existing.PIN = String(request.pin);
      log_(existing.ID, 'SET_PIN', 'admin set login PIN');
    } else {
      if (!request.pin) return { exists: true, requiresPin: true, Phone: phone, Name: existing.Name, Role: role };
      if (String(request.pin) !== stored) throw new Error('รหัส PIN ไม่ถูกต้อง');
    }
  }
  const user = syncStamps_(phone, existing.ID);
  const firstOrder = ordersByUser_(existing.ID).length === 0;
  return Object.assign({}, publicUser_(user), { Phone: phone, IsFirstOrder: firstOrder, exists: true, SessionToken: session_(user) });
}
function publicUser_(user) { const copy = Object.assign({}, user); delete copy.PIN; return copy; }
function updateProfile_(request) {
  const phone = phone_(request.phone);
  const user = rows_('Users').filter(function (row) { return phone_(row.Phone) === phone; })[0];
  if (!user) throw new Error('ไม่พบผู้ใช้');
  const changes = {};
  if (request.name) changes.Name = request.name;
  if (request.address !== undefined) changes.Address = request.address;
  if (request.lat !== undefined) changes.Lat = request.lat;
  if (request.lng !== undefined) changes.Lng = request.lng;
  if (request.newPin !== undefined) {
    const userRole = String(user.Role || 'Customer');
    if (userRole !== 'Admin' && userRole !== 'SuperAdmin') throw new Error('เฉพาะผู้ดูแลที่ตั้งรหัส PIN ได้');
    const stored = String(user.PIN || '').trim();
    if (stored && String(request.currentPin || '') !== stored) throw new Error('รหัส PIN ปัจจุบันไม่ถูกต้อง');
    if (!/^\d{4,8}$/.test(String(request.newPin))) throw new Error('รหัส PIN ต้องเป็นตัวเลข 4-8 หลัก');
    changes.PIN = String(request.newPin);
    log_(user.ID, 'CHANGE_PIN', 'admin changed login PIN');
  }
  if (request.profilePicBase64) changes.ProfilePic = uploadBase64_(request.profilePicBase64, 'profile-' + user.ID + '.jpg');
  if (!Object.keys(changes).length) throw new Error('ไม่มีข้อมูลที่จะแก้ไข');
  updateRow_('Users', 'ID', user.ID, changes);
  return Object.assign({}, publicUser_(user), changes);
}
function getMemberDetail_(request) {
  requireAdmin_(request.sessionToken);
  const user = find_('Users', 'ID', request.userId);
  const items = rows_('OrderItems');
  const orders = rows_('Orders').filter(function (order) { return String(order.UserID) === String(user.ID); })
    .sort(function (a, b) { return String(b.CreatedAt).localeCompare(String(a.CreatedAt)); })
    .map(function (order) { return Object.assign({}, order, { items: items.filter(function (item) { return String(item.OrderID) === String(order.OrderID); }) }); });
  const completed = orders.filter(function (order) { return String(order.Status) === 'Completed'; });
  return {
    user: publicUser_(user),
    orders: orders,
    stats: {
      orderCount: orders.length,
      completedCount: completed.length,
      totalSpent: completed.reduce(function (sum, order) { return sum + number_(order.Total); }, 0),
      cash: orders.filter(function (order) { return String(order.PaymentMethod) === 'Cash'; }).length,
      transfer: orders.filter(function (order) { return String(order.PaymentMethod) === 'Transfer'; }).length
    }
  };
}

/* ---------- store ---------- */
function getStore_() {
  const settings = settings_();
  const menu = rows_('Menu').filter(function (row) { return String(row.IsActive).toUpperCase() !== 'FALSE'; });
  const promos = rows_('Promotions').filter(function (row) { return String(row.IsActive).toUpperCase() !== 'FALSE'; });
  return { settings: settings, menu: menu, promotions: promos, options: optionGroups_(true) };
}
function getMenu_(request) { if (request.sessionToken) requireAdmin_(request.sessionToken); return rows_('Menu'); }
function getPromotions_() { return rows_('Promotions'); }

/* ---------- option groups (ตัวเลือกเสริม) ---------- */
function optionGroups_(activeOnly) {
  let groups = [], choices = [];
  try { groups = rows_('OptionGroups'); } catch (error) { return []; }
  try { choices = rows_('OptionChoices'); } catch (error) { choices = []; }
  return groups
    .filter(function (group) { return !activeOnly || String(group.IsActive).toUpperCase() !== 'FALSE'; })
    .sort(function (a, b) { return number_(a.SortOrder) - number_(b.SortOrder); })
    .map(function (group) {
      return {
        GroupID: group.GroupID,
        Name: group.Name,
        Required: String(group.Required).toUpperCase() === 'TRUE',
        MultiSelect: String(group.MultiSelect).toUpperCase() === 'TRUE',
        IsActive: String(group.IsActive).toUpperCase() !== 'FALSE',
        SortOrder: number_(group.SortOrder),
        choices: choices
          .filter(function (choice) { return String(choice.GroupID) === String(group.GroupID); })
          .sort(function (a, b) { return number_(a.SortOrder) - number_(b.SortOrder); })
          .map(function (choice) { return { ChoiceID: choice.ChoiceID, Label: choice.Label }; })
      };
    });
}
function getOptionGroups_(request) {
  requireAdmin_(request.sessionToken);
  return optionGroups_(false);
}
function saveOptionGroup_(request) {
  const admin = requireAdmin_(request.sessionToken);
  const group = request.group || {};
  const name = String(group.Name || '').trim();
  if (!name) throw new Error('กรุณาระบุชื่อตัวเลือกเสริม');
  const labels = (Array.isArray(request.choices) ? request.choices : []).map(function (label) { return String(label).trim(); }).filter(function (label) { return label; });
  if (!labels.length) throw new Error('กรุณาเพิ่มตัวเลือกอย่างน้อย 1 อย่าง');
  const id = group.GroupID || 'OG' + Date.now();
  const record = {
    GroupID: id,
    Name: name,
    Required: String(group.Required).toLowerCase() === 'true' ? 'TRUE' : 'FALSE',
    MultiSelect: String(group.MultiSelect).toLowerCase() === 'true' ? 'TRUE' : 'FALSE',
    SortOrder: group.GroupID ? number_(group.SortOrder) : rows_('OptionGroups').length,
    IsActive: String(group.IsActive).toLowerCase() === 'false' ? 'FALSE' : 'TRUE'
  };
  if (group.GroupID) updateRow_('OptionGroups', 'GroupID', id, record); else append_('OptionGroups', record);
  rows_('OptionChoices').filter(function (choice) { return String(choice.GroupID) === String(id); }).forEach(function (choice) { deleteRow_('OptionChoices', 'ChoiceID', choice.ChoiceID); });
  labels.forEach(function (label, index) { append_('OptionChoices', { ChoiceID: 'OC' + Utilities.getUuid(), GroupID: id, Label: label, SortOrder: index, IsActive: 'TRUE' }); });
  log_(admin.ID, group.GroupID ? 'OPTION_UPDATE' : 'OPTION_CREATE', name);
  return optionGroups_(false).filter(function (item) { return String(item.GroupID) === String(id); })[0];
}
function deleteOptionGroup_(request) {
  const admin = requireAdmin_(request.sessionToken);
  const group = find_('OptionGroups', 'GroupID', request.groupId);
  rows_('OptionChoices').filter(function (choice) { return String(choice.GroupID) === String(group.GroupID); }).forEach(function (choice) { deleteRow_('OptionChoices', 'ChoiceID', choice.ChoiceID); });
  deleteRow_('OptionGroups', 'GroupID', group.GroupID);
  log_(admin.ID, 'OPTION_DELETE', String(group.Name));
  return 'Deleted';
}

/* ---------- orders ---------- */
const ACTIVE_STATUSES = ['Pending', 'Accepted'];
function ordersByUser_(userId) { return rows_('Orders').filter(function (row) { return String(row.UserID) === String(userId); }); }
function activeOrders_() {
  return rows_('Orders')
    .filter(function (row) { return ACTIVE_STATUSES.indexOf(String(row.Status)) >= 0; })
    .sort(function (a, b) { return new Date(a.CreatedAt).getTime() - new Date(b.CreatedAt).getTime(); });
}
function orderMinutes_(order, settings) { return number_(order.EstimatedTime) || number_(settings.PrepMinutes) || 10; }
function queueInfo_(order) {
  if (ACTIVE_STATUSES.indexOf(String(order.Status)) < 0) return null;
  const settings = settings_();
  const active = activeOrders_();
  const index = active.map(function (row) { return String(row.OrderID); }).indexOf(String(order.OrderID));
  if (index < 0) return null;
  const now = new Date().getTime();
  let wait = 0;
  for (let i = 0; i <= index; i++) {
    const row = active[i];
    let contribution = orderMinutes_(row, settings);
    if (i === 0 && String(row.Status) === 'Accepted' && row.StartedAt) {
      const elapsed = (now - new Date(row.StartedAt).getTime()) / 60000;
      contribution = Math.max(0, contribution - elapsed);
    }
    wait += contribution;
  }
  return { position: index + 1, ahead: index, waitingMinutes: Math.round(wait), totalInQueue: active.length };
}
function ensureCooking_() {
  const active = activeOrders_();
  const cooking = active.filter(function (row) { return String(row.Status) === 'Accepted'; })[0];
  if (cooking && !cooking.StartedAt) updateRow_('Orders', 'OrderID', cooking.OrderID, { StartedAt: new Date() });
}
function getOrder_(request) {
  const order = find_('Orders', 'OrderID', request.orderId);
  return Object.assign({}, order, { items: rows_('OrderItems').filter(function (row) { return String(row.OrderID) === String(order.OrderID); }), queue: queueInfo_(order) });
}
function getOrders_(request) {
  requireAdmin_(request.sessionToken);
  return rows_('Orders').sort(function (a, b) { return String(b.CreatedAt).localeCompare(String(a.CreatedAt)); }).slice(0, 100)
    .map(function (order) { return Object.assign({}, order, { queue: queueInfo_(order) }); });
}
function getCustomerOrders_(request) {
  const phone = phone_(request.phone);
  if (!/^0\d{8,9}$/.test(phone)) throw new Error('เบอร์โทรศัพท์ไม่ถูกต้อง');
  const items = rows_('OrderItems');
  return rows_('Orders').filter(function (order) { return phone_(order.Phone) === phone; })
    .sort(function (a, b) { return String(b.CreatedAt).localeCompare(String(a.CreatedAt)); })
    .slice(0, 50)
    .map(function (order) { return Object.assign({}, order, { items: items.filter(function (item) { return String(item.OrderID) === String(order.OrderID); }) }); });
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
    const phone = phone_(o.phone);
    let userId = o.userId || '';
    if (!userId && phone) { const match = userByPhone_(phone); if (match) userId = match.ID; }
    const redeem = o.redeemStamps && userId ? prepareStampRedemption_(userId, id) : null;
    const slip = o.slipBase64 ? uploadBase64_(o.slipBase64, 'slip-' + id + '.jpg') : '';
    const queuePosition = activeOrders_().length + 1;
    const options = validateOrderOptions_(o.options);
    const order = {
      OrderID: id, UserID: userId, Phone: phone, OrderType: o.orderType, AddressDetail: o.addressDetail || '',
      Lat: o.lat || '', Lng: o.lng || '', Distance: number_(o.distance), DeliveryFee: number_(o.deliveryFee),
      PaymentMethod: o.paymentMethod, SubTotal: number_(o.subTotal), Discount: number_(o.discount), Total: number_(o.total),
      Status: 'Pending', SlipURL: slip, EstimatedTime: number_(o.estimatedTime) || number_(settings.PrepMinutes), CreatedAt: new Date(), CompletedAt: '', StampEarned: '', StartedAt: '', QueuePosition: queuePosition,
      Options: options.length ? JSON.stringify(options) : ''
    };
    append_('Orders', order);
    request.items.forEach(function (item) { append_('OrderItems', { ID: 'OI' + Utilities.getUuid(), OrderID: id, MenuID: item.menuId, Quantity: number_(item.quantity), Price: number_(item.price) }); });
    if (redeem) updateRow_('Users', 'ID', redeem.userId, { Stamps: redeem.remaining });
    return getOrder_({ orderId: order.OrderID });
  } finally {
    lock.releaseLock();
  }
}
function validateOrderOptions_(incoming) {
  const selections = Array.isArray(incoming) ? incoming : [];
  const groups = optionGroups_(true);
  const result = [];
  groups.forEach(function (group) {
    const selected = selections.filter(function (item) { return String(item.groupId) === String(group.GroupID); });
    const labels = selected.length && Array.isArray(selected[0].choices) ? selected[0].choices : [];
    const chosen = labels.filter(function (label) { return group.choices.some(function (choice) { return String(choice.Label) === String(label); }); });
    if (group.Required && !chosen.length) throw new Error('กรุณาเลือก "' + group.Name + '"');
    if (chosen.length) result.push({ groupId: group.GroupID, groupName: group.Name, choices: chosen });
  });
  return result;
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
  const allowed = ['Pending', 'Accepted', 'Ready', 'OutForDelivery', 'Completed', 'Cancelled'];
  if (allowed.indexOf(request.status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  const changes = { Status: request.status };
  if (request.estimatedTime) changes.EstimatedTime = number_(request.estimatedTime);
  if (request.status === 'Accepted') changes.EstimatedTime = number_(request.estimatedTime) || orderMinutes_(order, settings_());
  if (request.status === 'Completed') {
    changes.CompletedAt = new Date();
    let userId = order.UserID;
    if (!userId && phone_(order.Phone)) { const match = userByPhone_(phone_(order.Phone)); if (match) { userId = match.ID; changes.UserID = match.ID; } }
    if (userId && String(order.StampEarned).toUpperCase() !== 'TRUE') {
      const user = rows_('Users').filter(function (row) { return String(row.ID) === String(userId); })[0];
      if (user) {
        updateRow_('Users', 'ID', user.ID, { Stamps: number_(user.Stamps) + stampEarned_(order.Total, settings_()) });
        changes.StampEarned = 'TRUE';
      }
    }
  }
  updateRow_('Orders', 'OrderID', order.OrderID, changes);
  if (['Accepted', 'Ready', 'OutForDelivery', 'Completed', 'Cancelled'].indexOf(request.status) >= 0) ensureCooking_();
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
    IsActive: String(item.IsActive).toLowerCase() === 'false' ? 'FALSE' : 'TRUE'
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
  if (request.pin !== undefined) { if (admin.Role !== 'SuperAdmin') throw new Error('เฉพาะ SuperAdmin เท่านั้น'); if (request.pin && !/^\d{4,8}$/.test(String(request.pin))) throw new Error('รหัส PIN ต้องเป็นตัวเลข 4-8 หลัก'); changes.PIN = String(request.pin || ''); }
  if (!Object.keys(changes).length) throw new Error('ไม่มีข้อมูลที่จะแก้ไข');
  updateRow_('Users', 'ID', request.userId, changes);
  log_(admin.ID, 'USER_UPDATE', request.userId + ' ' + Object.keys(changes).join(','));
  return publicUser_(find_('Users', 'ID', request.userId));
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
function listDriveImages_(request) {
  requireAdmin_(request.sessionToken);
  const files = getFolder_().getFiles();
  const images = [];
  while (files.hasNext() && images.length < 300) {
    const file = files.next();
    if (file.getMimeType().indexOf('image/') !== 0) continue;
    images.push({ id: file.getId(), name: file.getName() });
  }
  images.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
  return images;
}
function useDriveImage_(request) {
  requireAdmin_(request.sessionToken);
  const id = String(request.fileId || '');
  if (!id) throw new Error('ไม่พบไฟล์ที่เลือก');
  const file = DriveApp.getFileById(id);
  if (file.getMimeType().indexOf('image/') !== 0) throw new Error('ไฟล์ที่เลือกไม่ใช่รูปภาพ');
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';
}
