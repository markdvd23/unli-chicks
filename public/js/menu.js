/* The feast, from Firestore (menuItems via app.js) and live. */
import { auth, createMenuOrder } from './firebase.js';

const grid = document.getElementById('dishes');
const empty = document.getElementById('menuEmpty');
let shown = null;
const cart = new Map();
const cartKey = 'unli-menu-cart';

try {
  for (const line of JSON.parse(localStorage.getItem(cartKey) || '[]')) {
    if (typeof line.id === 'string' && Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= 20) {
      cart.set(line.id, line.quantity);
    }
  }
} catch { /* Ignore a stale or malformed saved cart. */ }

function dish(m) {
  const card = document.createElement('article');
  card.className = 'card dish';
  card.dataset.item = m.id;
  if (m.image) {
    const img = document.createElement('img');
    img.src = m.image;
    img.alt = m.alt || m.name;
    img.loading = 'lazy';
    img.decoding = 'async';
    // A broken photo link falls back to the dish's initial, not a broken icon.
    img.addEventListener('error', () => img.replaceWith(placeholder(m)), { once: true });
    card.append(img);
  } else {
    card.append(placeholder(m));
  }
  const text = document.createElement('div');
  const tag = Object.assign(document.createElement('p'), { className: 'label', textContent: m.tag || '' });
  const name = Object.assign(document.createElement('h2'), { textContent: m.name });
  const blurb = Object.assign(document.createElement('p'), { textContent: m.blurb || '' });
  const add = Object.assign(document.createElement('button'), { className: 'btn-primary dish-add', type: 'button', textContent: 'Add to order' });
  add.setAttribute('aria-label', 'Add ' + m.name + ' to your order');
  add.addEventListener('click', () => {
    const total = [...cart.values()].reduce((sum, quantity) => sum + quantity, 0);
    if (total >= 50) {
      Unli.toast('An order can contain up to 50 items.');
      return;
    }
    cart.set(m.id, Math.min(20, (cart.get(m.id) || 0) + 1));
    saveCart();
    renderCart();
    add.textContent = 'Added';
    setTimeout(() => { add.textContent = 'Add to order'; }, 900);
  });
  text.append(tag, name, blurb, add);
  card.append(text);
  return card;
}

function placeholder(m) {
  const ph = document.createElement('span');
  ph.className = 'dish-ph';
  ph.setAttribute('aria-hidden', 'true');
  ph.textContent = m.name.charAt(0);
  return ph;
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function saveCart() {
  try { localStorage.setItem(cartKey, JSON.stringify([...cart].map(([id, quantity]) => ({ id, quantity })))); }
  catch { /* The cart still works for this page view when storage is unavailable. */ }
}

const orderPanel = node('section', 'order-panel');
orderPanel.id = 'order';
orderPanel.setAttribute('aria-labelledby', 'orderTitle');
const orderHead = node('div', 'order-head');
orderHead.append(node('p', 'eyebrow', 'Your table, your feast'), Object.assign(node('h2', 'section-title', 'Build your order'), { id: 'orderTitle' }));
const cartSummary = node('p', 'order-count', 'Your order is empty.');
const cartList = node('ul', 'order-list');
const orderForm = document.createElement('form');
orderForm.className = 'order-form';
orderForm.noValidate = true;
const fulfillmentLabel = node('label', 'form-field');
fulfillmentLabel.append(node('span', 'field-label', 'How are you feasting?'));
const fulfillment = Object.assign(node('select', 'form-input'), { id: 'orderFulfillment', name: 'fulfillment' });
fulfillment.add(new Option('Dine in', 'dine-in'));
fulfillment.add(new Option('Pick up', 'pickup'));
fulfillmentLabel.append(fulfillment);
const branchLabel = node('label', 'form-field');
branchLabel.append(node('span', 'field-label', 'Branch'));
const branch = Object.assign(node('select', 'form-input'), { id: 'orderBranch', name: 'branch', required: true });
branchLabel.append(branch);
const nameLabel = node('label', 'form-field');
nameLabel.append(node('span', 'field-label', 'Name for the order'));
const customerName = Object.assign(node('input', 'form-input'), { id: 'orderName', name: 'name', required: true, maxLength: 60, autocomplete: 'name' });
nameLabel.append(customerName);
const partyLabel = node('label', 'form-field');
partyLabel.append(node('span', 'field-label', 'Guests'));
const party = Object.assign(node('input', 'form-input'), { id: 'orderParty', name: 'party', type: 'number', min: '1', max: '20', value: '2', inputMode: 'numeric' });
partyLabel.append(party);
const notesLabel = node('label', 'form-field');
notesLabel.append(node('span', 'field-label', 'Notes (optional)'));
const notes = Object.assign(node('textarea', 'form-input'), { id: 'orderNotes', name: 'notes', maxLength: 160, rows: 3 });
notesLabel.append(notes);
const paymentNote = node('p', 'form-hint', 'No online payment is taken. Pay at the restaurant or when you pick up.');
const orderError = node('p', 'form-error');
orderError.setAttribute('role', 'alert');
orderError.hidden = true;
const submitOrder = Object.assign(node('button', 'btn-primary', 'Check out'), { type: 'submit' });
const checkoutLink = Object.assign(node('a', 'text-link', 'Sign in to check out'), { href: 'login.html?next=' + encodeURIComponent('menu.html#order'), hidden: true });
orderForm.append(fulfillmentLabel, branchLabel, nameLabel, partyLabel, notesLabel, paymentNote, orderError, submitOrder, checkoutLink);
orderPanel.append(orderHead, cartSummary, cartList, orderForm);
grid.parentElement.append(orderPanel);

fulfillment.addEventListener('change', () => { partyLabel.hidden = fulfillment.value !== 'dine-in'; });
partyLabel.hidden = fulfillment.value !== 'dine-in';
window.addEventListener('unli-auth-ready', () => {
  if (auth.currentUser && !customerName.value) customerName.value = auth.currentUser.displayName || Unli.session().name;
}, { once: true });

function renderBranches() {
  if (!window.Unli || !Unli.store.branchesLoaded()) return;
  const current = branch.value;
  const active = Unli.store.branches().filter(item => item.active === true);
  branch.replaceChildren(new Option(active.length ? 'Choose a branch' : 'No branches taking orders', ''));
  active.forEach(item => branch.add(new Option(item.name, item.id)));
  if (active.some(item => item.id === current)) branch.value = current;
  branch.disabled = active.length === 0;
  submitOrder.disabled = active.length === 0;
}

function renderCart() {
  const available = new Map((Unli?.store.menu() || []).filter(item => item.hidden !== true).map(item => [item.id, item]));
  for (const id of cart.keys()) if (!available.has(id)) cart.delete(id);
  saveCart();
  const total = [...cart.values()].reduce((sum, quantity) => sum + quantity, 0);
  cartSummary.textContent = total ? `${total} ${total === 1 ? 'item' : 'items'} in your order` : 'Your order is empty.';
  cartList.replaceChildren();
  for (const [id, quantity] of cart) {
    const item = available.get(id);
    if (!item) continue;
    const row = node('li', 'order-row');
    const title = node('span', 'order-item-name', `${item.name} × ${quantity}`);
    const controls = node('div', 'order-quantity');
    const decrease = Object.assign(node('button', 'btn-ghost', '−'), { type: 'button', 'aria-label': `Remove one ${item.name}` });
    const increase = Object.assign(node('button', 'btn-ghost', '+'), { type: 'button', 'aria-label': `Add one ${item.name}` });
    decrease.addEventListener('click', () => {
      if (quantity === 1) cart.delete(id); else cart.set(id, quantity - 1);
      renderCart();
    });
    increase.addEventListener('click', () => { cart.set(id, Math.min(20, quantity + 1)); renderCart(); });
    increase.disabled = total >= 50 || quantity >= 20;
    controls.append(decrease, increase);
    row.append(title, controls);
    cartList.append(row);
  }
  cartSummary.textContent = total > 50
    ? `${total} items in your order · Remove ${total - 50} to check out`
    : total ? `${total} ${total === 1 ? 'item' : 'items'} in your order` : 'Your order is empty.';
  submitOrder.disabled = !total || total > 50 || branch.disabled;
}

orderForm.addEventListener('submit', async event => {
  event.preventDefault();
  orderError.hidden = true;
  await UnliSession.whenReady();
  if (!auth.currentUser) {
    checkoutLink.hidden = false;
    checkoutLink.focus();
    return;
  }
  if (!cart.size) { orderError.textContent = 'Add at least one dish to your order.'; orderError.hidden = false; return; }
  if (!branch.value) { orderError.textContent = 'Choose a branch that is taking orders.'; orderError.hidden = false; return; }
  if (!customerName.value.trim()) { orderError.textContent = 'Enter a name for the order.'; orderError.hidden = false; customerName.focus(); return; }
  if (fulfillment.value === 'dine-in' && (!Number.isInteger(Number(party.value)) || Number(party.value) < 1 || Number(party.value) > 20)) {
    orderError.textContent = 'Choose a guest count from 1 to 20.';
    orderError.hidden = false;
    party.focus();
    return;
  }

  submitOrder.disabled = true;
  submitOrder.textContent = 'Sending order…';
  try {
    const result = await createMenuOrder({
      branch: branch.value,
      fulfillment: fulfillment.value,
      name: customerName.value.trim(),
      party: fulfillment.value === 'dine-in' ? Number(party.value) : null,
      notes: notes.value.trim(),
      items: [...cart].map(([id, quantity]) => ({ id, quantity })),
    });
    cart.clear();
    saveCart();
    orderPanel.replaceChildren(
      node('p', 'eyebrow', fulfillment.value === 'dine-in' ? 'Order sent to the kitchen' : 'Pickup order sent'),
      node('h2', 'section-title', `You’re all set, ${customerName.value.trim()}.`),
      node('p', 'lede', `Order #${result.no} is confirmed. Pay at the restaurant or when you pick up.`),
      Object.assign(node('a', 'btn-primary', 'View order'), { href: `accounts/user/ticket.html?id=${encodeURIComponent(result.id)}` }),
    );
  } catch (error) {
    console.warn('Could not place order:', error.code || error);
    orderError.textContent = error.code === 'functions/failed-precondition'
      ? 'A dish or branch is no longer available. Refresh the menu and try again.'
      : 'Couldn’t send your order. Check your connection and try again.';
    orderError.hidden = false;
    submitOrder.disabled = false;
    submitOrder.textContent = 'Check out';
  }
});

function render() {
  if (!window.Unli || !Unli.store.menuLoaded()) return;
  renderBranches();
  renderCart();
  const list = Unli.store.menu().filter(m => m.hidden !== true);
  // Only rebuild when something visible changed.
  const sig = JSON.stringify(list.map(m => [m.id, m.name, m.tag, m.blurb, m.image, m.alt]));
  if (sig === shown) return;
  shown = sig;
  grid.replaceChildren(...list.map(dish));
  grid.removeAttribute('aria-busy');
  empty.hidden = list.length > 0;
}

window.addEventListener('unli-data-changed', render);
render();
