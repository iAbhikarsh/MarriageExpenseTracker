const DEFAULT_CATEGORIES = ['Venue', 'Catering', 'Decor', 'Photography', 'Attire', 'Jewelry', 'Travel', 'Gifts', 'Other'];
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const pages = ['dashboard', 'addExpense', 'expenseRecords', 'categories'];
const firebaseInitialized = typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0 && typeof firebase.firestore === 'function';
const db = firebaseInitialized ? firebase.firestore() : null;
const auth = firebaseInitialized && typeof firebase.auth === 'function' ? firebase.auth() : null;
const expenseCollection = db ? db.collection('marriage_expenses') : null;
const categoryCollection = db ? db.collection('marriage_categories') : null;
const settingsCollection = db ? db.collection('marriage_settings') : null;
const userCollection = db ? db.collection('marriage_users') : null;
let categories = [...DEFAULT_CATEGORIES];
let expenses = [];
let budget = 0;
let firebaseReady = false;
let currentUser = null;
let currentUserProfile = null;
let canEditData = false;
let authMode = 'signIn';
let toastTimer;

const elements = {
  budgetInput: document.getElementById('budgetInput'),
  totalBudget: document.getElementById('totalBudget'),
  totalSpent: document.getElementById('totalSpent'),
  budgetRemaining: document.getElementById('budgetRemaining'),
  expenseCount: document.getElementById('expenseCount'),
  budgetMessage: document.getElementById('budgetMessage'),
  budgetChart: document.getElementById('budgetChart'),
  budgetPie: document.getElementById('budgetPie'),
  chartSpent: document.getElementById('chartSpent'),
  chartRemaining: document.getElementById('chartRemaining'),
  budgetPercent: document.getElementById('budgetPercent'),
  budgetTip: document.getElementById('budgetTip'),
  categorySummary: document.getElementById('categorySummary'),
  recentExpenses: document.getElementById('recentExpenses'),
  category: document.getElementById('category'),
  expenseFilter: document.getElementById('expenseFilter'),
  editCategory: document.getElementById('editCategory'),
  categoryList: document.getElementById('categoryList'),
  categoryCount: document.getElementById('categoryCount'),
  expenseTableBody: document.querySelector('#expenseTable tbody'),
  expenseActionsHeader: document.getElementById('expenseActionsHeader'),
  recordsEmpty: document.getElementById('recordsEmpty'),
  filteredTotal: document.getElementById('filteredTotal'),
  authScreen: document.getElementById('authScreen'),
  appShell: document.getElementById('appShell'),
  authSignOutButton: document.getElementById('authSignOutButton'),
  sendVerificationButton: document.getElementById('sendVerificationButton'),
  authUser: document.getElementById('authUser'),
  authRole: document.getElementById('authRole'),
  signOutButton: document.getElementById('signOutButton'),
  authMessage: document.getElementById('authMessage'),
  authEmail: document.getElementById('authEmail'),
  authPassword: document.getElementById('authPassword'),
  authSubmit: document.getElementById('authSubmit'),
  switchAuthMode: document.getElementById('switchAuthMode'),
  toast: document.getElementById('toast')
};

function categoryDocumentId(name) {
  return Array.from(name).map(character => character.codePointAt(0).toString(16)).join('_') || 'empty';
}

function showFirebaseError(error, action = 'Firebase request failed') {
  console.error('Marriage tracker Firebase error:', error);
  if (currentUser && !firebaseReady) {
    elements.authScreen.hidden = false;
    elements.appShell.hidden = true;
    elements.authSignOutButton.hidden = false;
    elements.sendVerificationButton.hidden = currentUser.emailVerified;
    elements.authMessage.textContent = error.code === 'permission-denied'
      ? 'Your tracker profile is missing or invalid. Ask an admin to provision your email as a reader or editor.'
      : 'Could not load your tracker profile or data. Check your account setup and Firestore rules.';
    return;
  }
  const code = error && error.code ? ` (${error.code})` : '';
  showToast(`${action}${code}.`);
}

function emailAuthErrorMessage(error) {
  const messages = {
    'auth/email-already-in-use': 'An account already exists for this email. Sign in instead.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Choose a password with at least 6 characters.',
    'auth/invalid-login-credentials': 'Email or password is incorrect. Check the address, or use Forgot password to reset it.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/user-not-found': 'No account exists for this email. Create an account first.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/too-many-requests': 'Too many attempts. Wait a while before trying again.',
    'auth/operation-not-allowed': 'Enable Email/Password sign-in in Firebase Authentication.'
  };
  return messages[error.code] || 'Could not complete authentication. Check your details and Firebase Authentication settings.';
}

function showAuthMode(mode) {
  authMode = mode;
  const creatingAccount = mode === 'create';
  document.getElementById('authTitle').textContent = creatingAccount ? 'Create account' : 'Sign in';
  elements.authSubmit.textContent = creatingAccount ? 'Create account' : 'Sign in';
  elements.switchAuthMode.textContent = creatingAccount ? 'I already have an account' : 'Create an account';
  elements.authMessage.textContent = creatingAccount
    ? 'Use your email address and a password of at least 6 characters.'
    : 'Sign in with your email address and password.';
}

function showAccessMessage(message) {
  elements.authScreen.hidden = false;
  elements.appShell.hidden = true;
  elements.authSignOutButton.hidden = !currentUser;
  elements.sendVerificationButton.hidden = !currentUser || currentUser.emailVerified;
  elements.authMessage.textContent = message;
}

async function loadTrackerData() {
  if (!db) {
    showAccessMessage('Firebase is not initialized. Check the SDKs and Firebase config.');
    return;
  }
  if (!currentUser) return;

  firebaseReady = false;
  elements.authMessage.textContent = 'Checking your account access...';
  if (!currentUser.emailVerified) {
    canEditData = false;
    showAccessMessage('Verify your email address before accessing the tracker.');
    return;
  }

  try {
    const userSnapshot = await userCollection.doc(currentUser.uid).get();
    if (!userSnapshot.exists) {
      currentUserProfile = null;
      canEditData = false;
      showAccessMessage(`Your account is not provisioned yet. Ask an admin to create marriage_users/${currentUser.uid} with role reader or editor.`);
      return;
    }

    currentUserProfile = userSnapshot.data();
    if (currentUserProfile.email !== currentUser.email || !['reader', 'editor'].includes(currentUserProfile.role)) {
      canEditData = false;
      showAccessMessage('Your tracker profile is invalid. Ask an admin to check your email and reader/editor role.');
      return;
    }

    canEditData = currentUserProfile.role === 'editor';
    const budgetRef = settingsCollection.doc('budget');
    const [budgetSnapshot, categorySnapshot, expenseSnapshot] = await Promise.all([
      budgetRef.get(),
      categoryCollection.get(),
      expenseCollection.get()
    ]);

    if (categorySnapshot.empty) {
      if (canEditData) {
        const batch = db.batch();
        DEFAULT_CATEGORIES.forEach(name => {
          batch.set(categoryCollection.doc(categoryDocumentId(name)), {
            name,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        });
        await batch.commit();
      }
      categories = [...DEFAULT_CATEGORIES];
    } else {
      categories = categorySnapshot.docs.map(categoryDocument => categoryDocument.data().name).filter(Boolean);
    }

    if (!budgetSnapshot.exists && canEditData) await budgetRef.set({ amount: 0 });
    if (canEditData && !expenseSnapshot.docs.some(expenseDocument => expenseDocument.id === '_metadata')) {
      await expenseCollection.doc('_metadata').set({ purpose: 'Marriage expense records' });
    }

    budget = budgetSnapshot.exists ? Number(budgetSnapshot.data().amount) || 0 : 0;
    expenses = expenseSnapshot.docs
      .filter(expenseDocument => expenseDocument.id !== '_metadata')
      .map(expenseDocument => {
        const data = expenseDocument.data();
        return {
          id: expenseDocument.id,
          date: data.date || '',
          name: data.name || '',
          category: data.category || '',
          amount: Number(data.amount) || 0,
          notes: data.notes || '',
          createdAt: data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : 0
        };
      });
    firebaseReady = true;
    elements.authRole.hidden = false;
    elements.authRole.textContent = canEditData ? 'Editor' : 'Read only';
    applyAccessControls();
    refresh();
    elements.authScreen.hidden = true;
    elements.appShell.hidden = false;
    elements.signOutButton.hidden = false;
    if (!canEditData && (!budgetSnapshot.exists || categorySnapshot.empty)) {
      showToast('Some tracker setup is pending an editor account.');
    }
  } catch (error) {
    showFirebaseError(error);
  }
}

function formatMoney(value) {
  return money.format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day));
}

function localDateValue() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 3800);
}

function showPage(pageId) {
  if (!canEditData && pageId === 'addExpense') {
    showToast('Your account has read-only access.');
    return;
  }
  pages.forEach(id => {
    const page = document.getElementById(id);
    const active = id === pageId;
    page.classList.toggle('active', active);
    page.hidden = !active;
  });
  document.querySelectorAll('.nav-link').forEach(button => {
    const active = button.dataset.page === pageId;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const activeLink = document.querySelector(`.nav-link[data-page="${pageId}"]`);
  document.getElementById('pageTitle').textContent = activeLink ? {
    dashboard: 'Overview',
    addExpense: 'Add expense',
    expenseRecords: 'Expense records',
    categories: 'Categories'
  }[pageId] : 'Overview';
  if (pageId === 'expenseRecords') renderRecords();
}

function addOption(select, label, value) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function renderCategoryOptions() {
  [elements.category, elements.editCategory].forEach(select => {
    const selected = select.value;
    select.replaceChildren();
    categories.forEach(category => addOption(select, category, category));
    if (categories.includes(selected)) select.value = selected;
  });
  const filterValue = elements.expenseFilter.value;
  elements.expenseFilter.replaceChildren();
  addOption(elements.expenseFilter, 'All categories', 'all');
  categories.forEach(category => addOption(elements.expenseFilter, category, category));
  if (categories.includes(filterValue)) elements.expenseFilter.value = filterValue;

  elements.categoryList.replaceChildren();
  categories.forEach(category => {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = category;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'category-delete';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${category} category`);
    const isUsed = expenses.some(expense => expense.category === category);
    remove.hidden = !canEditData;
    remove.disabled = isUsed || !canEditData;
    remove.title = isUsed ? 'This category is used by an expense' : `Remove ${category}`;
    remove.addEventListener('click', () => removeCategory(category));
    item.append(name, remove);
    elements.categoryList.append(item);
  });
  elements.categoryCount.textContent = categories.length;
}

function renderDashboard() {
  const spent = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const remaining = budget - spent;
  const percent = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const chartRemaining = Math.max(remaining, 0);
  const spentAngle = budget > 0 ? Math.min(spent / budget, 1) * 360 : spent > 0 ? 360 : 0;
  elements.totalBudget.textContent = formatMoney(budget);
  elements.totalSpent.textContent = formatMoney(spent);
  elements.budgetRemaining.textContent = formatMoney(remaining);
  elements.budgetRemaining.classList.toggle('over-budget', remaining < 0);
  elements.expenseCount.textContent = `Across ${expenses.length} ${expenses.length === 1 ? 'expense' : 'expenses'}`;
  elements.budgetMessage.textContent = budget <= 0 ? 'Set a budget to get started' : remaining < 0 ? 'You are over your budget' : 'Available for upcoming expenses';
  elements.budgetPercent.textContent = `${percent}% used`;
  elements.budgetPie.style.setProperty('--spent-angle', `${spentAngle}deg`);
  elements.budgetPie.classList.toggle('no-budget', budget <= 0 && spent <= 0);
  elements.chartSpent.textContent = formatMoney(spent);
  elements.chartRemaining.textContent = formatMoney(chartRemaining);
  elements.budgetChart.setAttribute('aria-label', budget > 0
    ? `Budget chart: ${formatMoney(spent)} spent, ${formatMoney(chartRemaining)} remaining, ${percent}% used`
    : `Budget chart: ${formatMoney(spent)} spent, no budget set`);
  elements.budgetTip.textContent = budget <= 0
    ? 'Add your total budget above to keep an eye on spending as plans come together.'
    : remaining < 0
      ? `Spending is ${formatMoney(Math.abs(remaining))} above the planned budget.`
      : `${formatMoney(remaining)} remains for the plans still to come.`;

  const totals = categories.map(category => ({
    category,
    total: expenses.filter(expense => expense.category === category).reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  })).filter(item => item.total > 0).sort((a, b) => b.total - a.total);
  elements.categorySummary.replaceChildren();
  if (!totals.length) {
    const empty = document.createElement('p');
    empty.className = 'summary-empty';
    empty.textContent = 'Category totals will appear after you add an expense.';
    elements.categorySummary.append(empty);
  } else {
    const max = totals[0].total;
    totals.slice(0, 6).forEach(item => {
      const row = document.createElement('div');
      row.className = 'summary-row';
      const label = document.createElement('span');
      label.className = 'summary-name';
      label.textContent = item.category;
      const bar = document.createElement('span');
      bar.className = 'summary-bar';
      const fill = document.createElement('span');
      fill.style.width = `${(item.total / max) * 100}%`;
      bar.append(fill);
      const amount = document.createElement('span');
      amount.className = 'summary-amount';
      amount.textContent = formatMoney(item.total);
      row.append(label, bar, amount);
      elements.categorySummary.append(row);
    });
  }

  elements.recentExpenses.replaceChildren();
  const recent = [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 4);
  if (!recent.length) {
    const empty = document.createElement('p');
    empty.className = 'recent-empty';
    empty.textContent = 'Your latest expenses will appear here.';
    elements.recentExpenses.append(empty);
  } else {
    recent.forEach(expense => {
      const row = document.createElement('div');
      row.className = 'recent-item';
      const name = document.createElement('span');
      name.className = 'recent-name';
      name.textContent = expense.name;
      const category = document.createElement('span');
      category.className = 'recent-category';
      category.textContent = expense.category;
      const amount = document.createElement('span');
      amount.className = 'recent-amount';
      amount.textContent = formatMoney(expense.amount);
      row.append(name, category, amount);
      elements.recentExpenses.append(row);
    });
  }
}

function renderRecords() {
  const selectedCategory = elements.expenseFilter.value;
  const selectedDate = document.getElementById('dateFilter').value;
  const records = [...expenses]
    .filter(expense => selectedCategory === 'all' || !selectedCategory || expense.category === selectedCategory)
    .filter(expense => !selectedDate || expense.date === selectedDate)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  elements.expenseTableBody.replaceChildren();
  records.forEach(expense => {
    const row = document.createElement('tr');
    const values = [formatDate(expense.date), expense.name, expense.category, expense.notes || ''];
    values.forEach(value => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    });
    const amount = document.createElement('td');
    amount.className = 'amount-col';
    amount.textContent = formatMoney(expense.amount);
    row.append(amount);
    const actions = document.createElement('td');
    actions.className = 'actions';
    if (canEditData) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'row-action';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => openEdit(expense));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'row-action delete';
      remove.textContent = 'Delete';
      remove.addEventListener('click', () => deleteExpense(expense.id));
      actions.append(edit, remove);
    } else {
      actions.hidden = true;
    }
    row.append(actions);
    elements.expenseTableBody.append(row);
  });
  elements.expenseActionsHeader.hidden = !canEditData;
  elements.recordsEmpty.hidden = records.length > 0;
  document.querySelector('.table-wrap').hidden = records.length === 0;
  const total = records.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  elements.filteredTotal.textContent = `${formatMoney(total)} total`;
}

function applyAccessControls() {
  document.querySelectorAll('[data-page="addExpense"], [data-go="addExpense"]').forEach(control => {
    control.hidden = !canEditData;
  });
  document.getElementById('budgetForm').hidden = !canEditData;
  document.getElementById('categoryForm').hidden = !canEditData;
  elements.expenseActionsHeader.hidden = !canEditData;
  elements.authRole.hidden = !currentUserProfile;
  elements.authRole.textContent = canEditData ? 'Editor' : 'Read only';
}

function refresh() {
  renderCategoryOptions();
  renderDashboard();
  renderRecords();
  elements.budgetInput.value = budget || '';
}

function openEdit(expense) {
  if (!canEditData) return showToast('Your account has read-only access.');
  document.getElementById('editId').value = expense.id;
  document.getElementById('editDate').value = expense.date;
  document.getElementById('editName').value = expense.name;
  document.getElementById('editCategory').value = expense.category;
  document.getElementById('editAmount').value = expense.amount;
  document.getElementById('editNotes').value = expense.notes || '';
  document.getElementById('editDialog').showModal();
}

async function deleteExpense(id) {
  if (!canEditData) return showToast('Your account has read-only access.');
  if (!window.confirm('Delete this expense record?')) return;
  try {
    await expenseCollection.doc(id).delete();
    expenses = expenses.filter(expense => expense.id !== id);
    showToast('Expense deleted.');
  } catch (error) {
    showFirebaseError(error);
  }
  refresh();
}

async function removeCategory(category) {
  if (!canEditData) return showToast('Your account has read-only access.');
  if (expenses.some(expense => expense.category === category)) {
    showToast('Remove or recategorize its expenses first.');
    return;
  }
  if (!window.confirm(`Remove the ${category} category?`)) return;
  try {
    await categoryCollection.doc(categoryDocumentId(category)).delete();
    categories = categories.filter(item => item !== category);
    showToast('Category removed.');
  } catch (error) {
    showFirebaseError(error);
  }
  refresh();
}

document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.page)));
document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.go)));

document.getElementById('budgetForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!canEditData) return showToast('Your account has read-only access.');
  if (!firebaseReady) return showToast('Waiting for the Firebase connection.');
  const nextBudget = Number(elements.budgetInput.value);
  if (!Number.isFinite(nextBudget) || nextBudget < 0) return;
  try {
    await settingsCollection.doc('budget').set({ amount: nextBudget, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    budget = nextBudget;
    showToast('Budget updated.');
    renderDashboard();
  } catch (error) {
    showFirebaseError(error, 'Budget was not saved');
  }
});

document.getElementById('expenseForm').addEventListener('submit', async event => {
  event.preventDefault();
  const expenseForm = event.currentTarget;
  if (!canEditData) return showToast('Your account has read-only access.');
  if (!firebaseReady) return showToast('Waiting for the Firebase connection.');
  const expense = {
    date: document.getElementById('date').value,
    name: document.getElementById('name').value.trim(),
    category: elements.category.value,
    amount: Number(document.getElementById('amount').value),
    notes: document.getElementById('notes').value.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  try {
    const expenseDocument = await expenseCollection.add(expense);
    expenses = [...expenses, { ...expense, id: expenseDocument.id, createdAt: Date.now() }];
    expenseForm.reset();
    document.getElementById('date').value = localDateValue();
    showToast('Expense saved successfully.');
    showPage('dashboard');
    refresh();
  } catch (error) {
    showFirebaseError(error, 'Expense was not saved');
  }
});

document.getElementById('categoryForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!canEditData) return showToast('Your account has read-only access.');
  if (!firebaseReady) return showToast('Waiting for the Firebase connection.');
  const input = document.getElementById('newCategory');
  const value = input.value.trim();
  const duplicate = categories.some(category => category.toLocaleLowerCase() === value.toLocaleLowerCase());
  if (!value || duplicate) {
    document.getElementById('categoryHint').textContent = duplicate ? 'That category already exists.' : 'Enter a category name.';
    input.focus();
    return;
  }
  try {
    await categoryCollection.doc(categoryDocumentId(value)).set({ name: value, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    categories = [...categories, value];
    input.value = '';
    document.getElementById('categoryHint').textContent = 'Categories can be up to 40 characters.';
    showToast(`${value} category added.`);
    renderCategoryOptions();
    elements.category.value = value;
    renderDashboard();
  } catch (error) {
    showFirebaseError(error);
  }
});

document.getElementById('editForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!canEditData) return showToast('Your account has read-only access.');
  if (!firebaseReady) return showToast('Waiting for the Firebase connection.');
  const id = document.getElementById('editId').value;
  const updatedExpense = {
    date: document.getElementById('editDate').value,
    name: document.getElementById('editName').value.trim(),
    category: elements.editCategory.value,
    amount: Number(document.getElementById('editAmount').value),
    notes: document.getElementById('editNotes').value.trim()
  };
  try {
    await expenseCollection.doc(id).update(updatedExpense);
    expenses = expenses.map(expense => expense.id === id ? { ...expense, ...updatedExpense } : expense);
    document.getElementById('editDialog').close();
    showToast('Expense updated.');
    refresh();
  } catch (error) {
    showFirebaseError(error);
  }
});

document.getElementById('closeDialog').addEventListener('click', () => document.getElementById('editDialog').close());
document.getElementById('cancelEdit').addEventListener('click', () => document.getElementById('editDialog').close());
elements.expenseFilter.addEventListener('change', renderRecords);
document.getElementById('dateFilter').addEventListener('change', renderRecords);
document.getElementById('clearFilters').addEventListener('click', () => {
  elements.expenseFilter.value = 'all';
  document.getElementById('dateFilter').value = '';
  renderRecords();
});

document.getElementById('emailAuthForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!auth) return;
  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;
  try {
    if (authMode === 'create') {
      const credential = await auth.createUserWithEmailAndPassword(email, password);
      await credential.user.sendEmailVerification();
      elements.authMessage.textContent = 'Verification email sent. Verify your address, then sign in again.';
    } else {
      await auth.signInWithEmailAndPassword(email, password);
    }
    elements.authPassword.value = '';
  } catch (error) {
    elements.authMessage.textContent = emailAuthErrorMessage(error);
  }
});

elements.switchAuthMode.addEventListener('click', () => {
  showAuthMode(authMode === 'signIn' ? 'create' : 'signIn');
});

document.getElementById('passwordReset').addEventListener('click', async () => {
  const email = elements.authEmail.value.trim();
  if (!email) {
    elements.authMessage.textContent = 'Enter your email address first, then choose Forgot password.';
    elements.authEmail.focus();
    return;
  }
  try {
    await auth.sendPasswordResetEmail(email);
    elements.authMessage.textContent = 'Password reset email sent. Check your inbox.';
  } catch (error) {
    elements.authMessage.textContent = emailAuthErrorMessage(error);
  }
});

elements.sendVerificationButton.addEventListener('click', async () => {
  if (!currentUser) return;
  try {
    await currentUser.sendEmailVerification();
    elements.authMessage.textContent = 'Verification email sent. Verify your address, then sign out and back in.';
  } catch (error) {
    elements.authMessage.textContent = emailAuthErrorMessage(error);
  }
});

elements.signOutButton.addEventListener('click', async () => {
  try {
    await auth.signOut();
  } catch (error) {
    showFirebaseError(error);
  }
});

elements.authSignOutButton.addEventListener('click', async () => {
  try {
    await auth.signOut();
  } catch (error) {
    elements.authMessage.textContent = 'Could not sign out. Please try again.';
  }
});

document.getElementById('date').value = localDateValue();
refresh();
showPage('dashboard');

if (!auth) {
  elements.authMessage.textContent = 'Firebase Authentication is not initialized. Check the SDK and Firebase config.';
} else {
  auth.onAuthStateChanged(user => {
    currentUser = user;
    currentUserProfile = null;
    canEditData = false;
    firebaseReady = false;
    elements.authScreen.hidden = false;
    elements.appShell.hidden = true;
    elements.authSignOutButton.hidden = !user;
    elements.sendVerificationButton.hidden = !user || user.emailVerified;
    elements.authUser.hidden = !user;
    elements.authUser.textContent = user ? user.email || 'Signed in' : '';
    elements.authRole.hidden = true;

    if (user) {
      loadTrackerData();
      return;
    }

    categories = [...DEFAULT_CATEGORIES];
    expenses = [];
    budget = 0;
    elements.authMessage.textContent = 'Sign in with an approved account to load your tracker.';
    applyAccessControls();
    refresh();
  }, showFirebaseError);
}