// flow.mjs — دوال مشتركة لاختبارات السلسلة (بتشتغل عبر API السيرفر التجريبي، بدون متصفح).
// call(method, path, body) → [status, json]
import { E2E_DRIVER_ID } from '../e2e-env.mjs';

export const ITEM_NAME = 'E2E-Testburger'; // اسم فريد بنبحث عنه بصفحات المطبخ و Live Orders

export function makeOrder({ kind = 'delivery', tag = Date.now().toString(36).toUpperCase() } = {}) {
  const now = Date.now(), iso = m => new Date(now + m * 60000).toISOString();
  const code = 'E2E-' + tag;
  const cart = [{ name: ITEM_NAME, category: 'Beef Burger', quantity: 1, unitCents: 799, totalCents: 799, options: [] }];
  const base = {
    externalOrderCode: code, displayCode: code, isTest: true,
    platform: 'LANCH', brand: 'Flamo',                   // منصة بتظهر بـ Live Orders (طلبات NARA/الكاشير مخفية فيها عمداً)
    kitchenSentAt: iso(-2), kitchenStartAt: iso(-2),     // "انبعت للمطبخ" (غير هيك بيضل مسودة)
    liveStage: 'PREPARE', placedAt: iso(-2), createdAt: iso(-2), prepMinutes: 15, dueAt: iso(38),
    customerName: 'E2E Testkunde', customerPhone: '+49 151 0000000',
    payment: { method: 'ONLINE' }, cashDueCents: 0, totalCents: 799, cart,
  };
  if (kind === 'pickup') return { ...base, type: 'pickup', orderType: 'PICKUP' };
  return {
    ...base, type: 'delivery', orderType: 'DELIVERY',
    delivery: { name: 'E2E Testkunde', phone: '+49 151 0000000', street: 'Gereonstraße', house: '1', houseNumber: '1',
      address: 'Gereonstraße 1', postal: '41747', postalCode: '41747', city: 'Viersen', lat: 51.256, lng: 6.392 },
  };
}

export async function importOrder(call, order) {
  const [status, body] = await call('POST', '/api/platform-orders/import', { source: 'LANCH', order });
  if (status !== 201) throw new Error('import failed ' + status + ' ' + JSON.stringify(body));
  return body.order.id;
}
export const setKitchen = (call, orderId, kitchenStatus) => call('POST', '/api/kitchen/orders', { orderId, kitchenStatus });
export const setStage = (call, id, stage) => call('POST', '/api/live-orders/stage', { id, stage });
export const assignDriver = (call, orderId, driverId = E2E_DRIVER_ID) => call('POST', '/api/delivery/assign', { driverId, orderIds: [orderId] });
export async function driverRoute(call, driverId = E2E_DRIVER_ID) {
  const [, body] = await call('GET', '/api/driver/routes?driverId=' + encodeURIComponent(driverId));
  return (body.routes || [])[0] || null;
}
export const startRoute = (call, routeId) => call('POST', '/api/driver/start', { routeId });
export const deliver = (call, orderId) => call('POST', '/api/driver/delivered', { orderId });
export async function getOrder(call, id) {
  const [, body] = await call('GET', '/api/kasse-state?days=2');
  return (body.orders || []).find(o => o.id === id) || null;
}
export async function getKitchenOrder(call, id) {
  const [, body] = await call('GET', '/api/kitchen/orders');
  return (body.orders || []).find(o => o.id === id) || null;
}
