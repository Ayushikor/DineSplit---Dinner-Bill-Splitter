/**
 * DineSplit - Fast, Penny-Perfect Dinner Bill Splitter
 * Pure Vanilla JavaScript (Zero external libraries or frameworks)
 */
'use strict';

(function () {
  // Storage keys for persistent state across browser reloads
  const STORAGE_KEY = 'dinesplit_state_v1';
  const HISTORY_STORAGE_KEY = 'dinesplit_history_v1';

  // DOM Elements - Top Bar & Currency
  const currencySelect = document.getElementById('currencySelect');
  const billCurrencySymbol = document.getElementById('billCurrencySymbol');
  const resetAllBtn = document.getElementById('resetAllBtn');

  // History Drawer Elements
  const openHistoryBtn = document.getElementById('openHistoryBtn');
  const closeHistoryBtn = document.getElementById('closeHistoryBtn');
  const historyOverlay = document.getElementById('historyOverlay');
  const historyDrawer = document.getElementById('historyDrawer');
  const historyListContainer = document.getElementById('historyListContainer');
  const historyCountBadge = document.getElementById('historyCountBadge');
  const clearAllHistoryBtn = document.getElementById('clearAllHistoryBtn');
  const viewHistoryFooterBtn = document.getElementById('viewHistoryFooterBtn');

  // Error Banner
  const errorBanner = document.getElementById('errorBanner');
  const errorTitle = document.getElementById('errorTitle');
  const errorMessage = document.getElementById('errorMessage');
  const dismissErrorBtn = document.getElementById('dismissErrorBtn');

  // Form Inputs
  const billForm = document.getElementById('billForm');
  const occasionInput = document.getElementById('occasionInput');
  const billAmountInput = document.getElementById('billAmountInput');
  const numPeopleInput = document.getElementById('numPeopleInput');
  const decrementPeopleBtn = document.getElementById('decrementPeopleBtn');
  const incrementPeopleBtn = document.getElementById('incrementPeopleBtn');

  // Occasion and Size Presets
  const occasionPresets = document.querySelectorAll('.preset-tag');
  const partyPresets = document.querySelectorAll('.size-chip');

  // Tip Selector
  const tipButtons = document.querySelectorAll('.tip-btn');
  const tipCalculatedAmount = document.getElementById('tipCalculatedAmount');
  const customTipContainer = document.getElementById('customTipContainer');
  const customTipTypePercent = document.getElementById('customTipTypePercent');
  const customTipTypeFixed = document.getElementById('customTipTypeFixed');
  const customTipValue = document.getElementById('customTipValue');
  const customTipSuffix = document.getElementById('customTipSuffix');

  // Results State Elements
  const emptyResultsState = document.getElementById('emptyResultsState');
  const activeResultsState = document.getElementById('activeResultsState');

  // Results Fields
  const resOccasionTitle = document.getElementById('resOccasionTitle');
  const resMetricCurrency = document.getElementById('resMetricCurrency');
  const resPerPersonValue = document.getElementById('resPerPersonValue');
  const resPerPersonQualifier = document.getElementById('resPerPersonQualifier');

  const resStatSubtotal = document.getElementById('resStatSubtotal');
  const resStatTipPercent = document.getElementById('resStatTipPercent');
  const resStatTipAmount = document.getElementById('resStatTipAmount');
  const resStatTotal = document.getElementById('resStatTotal');
  const resStatPeople = document.getElementById('resStatPeople');

  const resSharesSum = document.getElementById('resSharesSum');
  const resVerificationStatus = document.getElementById('resVerificationStatus');
  const resRoundingExplanation = document.getElementById('resRoundingExplanation');

  const settledProgressCount = document.getElementById('settledProgressCount');
  const settledProgressBar = document.getElementById('settledProgressBar');
  const personListContainer = document.getElementById('personListContainer');

  const copySummaryBtn = document.getElementById('copySummaryBtn');
  const printReceiptBtn = document.getElementById('printReceiptBtn');
  const toastNotification = document.getElementById('toastNotification');
  const toastMessage = document.getElementById('toastMessage');

  // History State
  let billHistory = [];

  // Internal Reactive State
  const state = {
    currency: '$',
    occasion: '',
    billAmount: '',
    numPeople: 3,
    tipType: 'percent', // 'percent' or 'fixed'
    tipPercent: 15, // Selected percent (0, 10, 15, 18, 20, or 'custom')
    customTipValue: 0,
    isCustomTip: false,
    hasCalculated: false,
    customNames: {}, // { 0: 'Alex', 1: 'Taylor' }
    paidStatus: {}, // { 0: true, 1: false }
    activeBillId: null, // Tracks current bill in history
  };

  let toastTimeout = null;

  /* --------------------------------------------------------------------------
     Helper Functions
     -------------------------------------------------------------------------- */
  function formatMoney(amount, currency = state.currency) {
    const num = Number(amount);
    if (isNaN(num)) return `${currency}0.00`;
    return `${currency}${num.toFixed(2)}`;
  }

  function showToast(msg) {
    if (!toastNotification || !toastMessage) return;
    toastMessage.textContent = msg;
    toastNotification.style.display = 'flex';

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastNotification.style.display = 'none';
    }, 3000);
  }

  function showError(title, message) {
    if (!errorBanner) return;
    errorTitle.textContent = title;
    errorMessage.textContent = message;
    errorBanner.style.display = 'flex';

    // Per user requirement: "show a massage and no result, if the bill or the number of the people is empty, zero or negative"
    if (emptyResultsState) emptyResultsState.style.display = 'flex';
    if (activeResultsState) activeResultsState.style.display = 'none';
  }

  function hideError() {
    if (errorBanner) {
      errorBanner.style.display = 'none';
    }
  }

  /* --------------------------------------------------------------------------
     Tip Calculations
     -------------------------------------------------------------------------- */
  function getTipAmount(billAmount) {
    if (billAmount <= 0) return 0;

    if (state.isCustomTip) {
      const val = parseFloat(state.customTipValue) || 0;
      if (state.tipType === 'percent') {
        return Math.round(billAmount * (val / 100) * 100) / 100;
      } else {
        return Math.round(val * 100) / 100;
      }
    }

    const percent = parseFloat(state.tipPercent) || 0;
    return Math.round(billAmount * (percent / 100) * 100) / 100;
  }

  function updateTipPreview() {
    const billVal = parseFloat(billAmountInput.value) || 0;
    const tip = getTipAmount(billVal);

    let tipLabel = '';
    if (state.isCustomTip) {
      if (state.tipType === 'percent') {
        tipLabel = `${state.customTipValue || 0}%`;
      } else {
        tipLabel = 'fixed';
      }
    } else {
      tipLabel = `${state.tipPercent}%`;
    }

    if (tipCalculatedAmount) {
      tipCalculatedAmount.textContent = `+ ${formatMoney(tip)} (${tipLabel})`;
    }
  }

  /* --------------------------------------------------------------------------
     Exact Penny-Distribution Calculation Algorithm
     -------------------------------------------------------------------------- */
  function calculatePennyPerfectSplit(totalAmount, numPeople) {
    // Convert to exact cents using integer arithmetic
    const totalCents = Math.round(totalAmount * 100);
    const baseCents = Math.floor(totalCents / numPeople);
    const remainderCents = totalCents % numPeople;

    const shares = [];
    for (let i = 0; i < numPeople; i++) {
      // The first `remainderCents` people pay (baseCents + 1)
      const personCents = i < remainderCents ? baseCents + 1 : baseCents;
      shares.push({
        index: i,
        cents: personCents,
        amount: personCents / 100,
        hasPennyAdjustment: i < remainderCents && remainderCents > 0,
      });
    }

    // Verify sum of shares strictly equals totalAmount in cents
    const sumCents = shares.reduce((acc, curr) => acc + curr.cents, 0);
    const exactSum = sumCents / 100;

    return {
      totalAmount,
      totalCents,
      baseAmount: baseCents / 100,
      remainderCents,
      shares,
      exactSum,
      isExactMatch: sumCents === totalCents,
    };
  }

  /* --------------------------------------------------------------------------
     Render Results
     -------------------------------------------------------------------------- */
  function renderSplitResults() {
    const rawBill = billAmountInput.value.trim();
    const rawPeople = numPeopleInput.value.trim();

    // 1. Rigorous validation for Bill Amount
    if (rawBill === '') {
      showError('Bill Amount Required', 'Please enter a valid bill amount greater than 0.');
      state.hasCalculated = false;
      saveState();
      return;
    }

    const bill = parseFloat(rawBill);
    if (isNaN(bill) || bill <= 0) {
      showError('Invalid Bill Amount', 'Bill amount must be greater than 0 (e.g. 45.50). Zero and negative amounts are not allowed.');
      state.hasCalculated = false;
      saveState();
      return;
    }

    // 2. Rigorous validation for Number of People
    if (rawPeople === '') {
      showError('Party Size Required', 'Please enter the number of people splitting the bill.');
      state.hasCalculated = false;
      saveState();
      return;
    }

    const people = parseInt(rawPeople, 10);
    if (isNaN(people) || people <= 0) {
      showError('Invalid Party Size', 'Number of people must be at least 1. Empty, zero, or negative party sizes are not allowed.');
      state.hasCalculated = false;
      saveState();
      return;
    }

    // Input is valid: dismiss any previous error banner
    hideError();

    // Calculate Bill Components
    const occasion = occasionInput.value.trim() || 'Dinner with Friends';
    const tipAmount = getTipAmount(bill);
    const finalTotal = Math.round((bill + tipAmount) * 100) / 100;

    // Run exact share calculation
    const splitData = calculatePennyPerfectSplit(finalTotal, people);

    // Update state
    state.hasCalculated = true;
    state.occasion = occasion;
    state.billAmount = rawBill;
    state.numPeople = people;

    // Switch view states
    emptyResultsState.style.display = 'none';
    activeResultsState.style.display = 'flex';

    // Populate Results Header
    resOccasionTitle.textContent = occasion;

    // Populate Hero Metric
    resMetricCurrency.textContent = state.currency;
    const avgPerPerson = (finalTotal / people).toFixed(2);
    resPerPersonValue.textContent = avgPerPerson;
    if (splitData.remainderCents > 0) {
      resPerPersonQualifier.textContent = `/ person (avg)`;
    } else {
      resPerPersonQualifier.textContent = `/ person`;
    }

    // Populate Secondary Stats
    resStatSubtotal.textContent = formatMoney(bill);
    let tipPercentText = `${state.tipPercent}%`;
    if (state.isCustomTip) {
      tipPercentText = state.tipType === 'percent' ? `${state.customTipValue}%` : 'custom';
    }
    resStatTipPercent.textContent = tipPercentText;
    resStatTipAmount.textContent = formatMoney(tipAmount);
    resStatTotal.textContent = formatMoney(finalTotal);
    resStatPeople.textContent = `${people} ${people === 1 ? 'person' : 'friends'}`;

    // Populate Exact Verification Box
    resSharesSum.textContent = formatMoney(splitData.exactSum);
    if (splitData.isExactMatch) {
      resVerificationStatus.textContent = '100% exact match';
      if (splitData.remainderCents > 0) {
        resRoundingExplanation.textContent = `${splitData.remainderCents} ${splitData.remainderCents === 1 ? 'person pays' : 'people pay'} ${state.currency}0.01 extra so the sum equals the ${formatMoney(finalTotal)} bill exactly.`;
      } else {
        resRoundingExplanation.textContent = `Even split without odd cents. All shares equal ${formatMoney(splitData.baseAmount)}.`;
      }
    }

    // Render Person Cards
    renderPersonCards(splitData, bill, tipAmount, people);

    // Update Settlement Progress
    updateSettlementProgress(people);

    // Populate dedicated print receipt
    populatePrintReceipt(splitData, bill, tipAmount, people);

    // Add or update in history list
    addOrUpdateHistory(splitData, bill, tipAmount, people, occasion);

    // Persist to local storage
    saveState();
  }

  /* --------------------------------------------------------------------------
     Dedicated Printable Receipt Populator
     -------------------------------------------------------------------------- */
  function populatePrintReceipt(splitData, bill, tipAmount, totalPeople) {
    const printOccasion = document.getElementById('printReceiptTitle');
    const printDate = document.getElementById('printReceiptDate');
    const printParty = document.getElementById('printReceiptParty');
    const printTableBody = document.getElementById('printReceiptTableBody');
    const printSubtotal = document.getElementById('printRowSubtotal');
    const printTipPercent = document.getElementById('printRowTipPercent');
    const printTip = document.getElementById('printRowTip');
    const printTotal = document.getElementById('printRowTotal');
    const printSharesSum = document.getElementById('printRowSharesSum');
    const printVerification = document.getElementById('printReceiptVerification');

    if (!printTableBody) return;

    const occasion = occasionInput.value.trim() || 'Dinner with Friends';
    if (printOccasion) printOccasion.textContent = occasion;
    if (printDate) {
      const now = new Date();
      printDate.textContent = `Date: ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (printParty) printParty.textContent = `Party: ${totalPeople} ${totalPeople === 1 ? 'person' : 'people'}`;

    const baseSplit = calculatePennyPerfectSplit(bill, totalPeople);
    const tipSplit = calculatePennyPerfectSplit(tipAmount, totalPeople);

    printTableBody.innerHTML = '';
    splitData.shares.forEach((share, index) => {
      const isPaid = !!state.paidStatus[index];
      const name = state.customNames[index] || `Person ${index + 1}`;
      const basePortion = baseSplit.shares[index] ? baseSplit.shares[index].amount : 0;
      const tipPortion = tipSplit.shares[index] ? tipSplit.shares[index].amount : 0;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-left"><strong>${escapeHtml(name)}</strong></td>
        <td class="text-right">${formatMoney(basePortion)}</td>
        <td class="text-right">${formatMoney(tipPortion)}</td>
        <td class="text-right"><strong>${formatMoney(share.amount)}</strong></td>
        <td class="text-center">${isPaid ? 'PAID' : 'PENDING'}</td>
      `;
      printTableBody.appendChild(tr);
    });

    if (printSubtotal) printSubtotal.textContent = formatMoney(bill);
    if (printTipPercent) {
      printTipPercent.textContent = state.isCustomTip
        ? state.tipType === 'percent'
          ? `${state.customTipValue}%`
          : 'custom'
        : `${state.tipPercent}%`;
    }
    if (printTip) printTip.textContent = formatMoney(tipAmount);
    const finalTotal = Math.round((bill + tipAmount) * 100) / 100;
    if (printTotal) printTotal.textContent = formatMoney(finalTotal);
    if (printSharesSum) printSharesSum.textContent = formatMoney(splitData.exactSum);
    if (printVerification) {
      printVerification.textContent = `✓ Exact penny split verified (${formatMoney(splitData.exactSum)} = ${formatMoney(finalTotal)}). 100% matched to total bill.`;
    }
  }

  /* --------------------------------------------------------------------------
     Render Person Cards with Names, Breakdown, and Paid Checkboxes
     -------------------------------------------------------------------------- */
  function renderPersonCards(splitData, baseBill, tipAmount, totalPeople) {
    personListContainer.innerHTML = '';

    // Calculate individual base and tip shares for transparency
    const baseSplit = calculatePennyPerfectSplit(baseBill, totalPeople);
    const tipSplit = calculatePennyPerfectSplit(tipAmount, totalPeople);

    splitData.shares.forEach((share, index) => {
      const isPaid = !!state.paidStatus[index];
      const defaultName = `Person ${index + 1}`;
      const currentName = state.customNames[index] || defaultName;

      // Extract initials (e.g. "Alex" -> "A", "Person 1" -> "P1")
      const initials = getInitials(currentName, index + 1);

      const card = document.createElement('div');
      card.className = `person-card ${isPaid ? 'settled' : ''}`;
      card.dataset.index = index;

      const basePortion = baseSplit.shares[index] ? baseSplit.shares[index].amount : 0;
      const tipPortion = tipSplit.shares[index] ? tipSplit.shares[index].amount : 0;

      card.innerHTML = `
        <div class="person-left">
          <div class="person-avatar" aria-hidden="true">${initials}</div>
          <div class="person-meta">
            <div class="person-name-wrapper">
              <input
                type="text"
                class="person-name-input"
                value="${escapeHtml(currentName)}"
                placeholder="${defaultName}"
                data-index="${index}"
                aria-label="Name for person ${index + 1}"
                maxlength="30"
              />
            </div>
            <div class="person-subbreakdown">
              Base: ${formatMoney(basePortion)} · Tip: ${formatMoney(tipPortion)}
              ${share.hasPennyAdjustment ? '<span title="Received 1 cent balance adjustment"> (+1¢)</span>' : ''}
            </div>
          </div>
        </div>

        <div class="person-right">
          <div class="person-amount">${formatMoney(share.amount)}</div>
          <button
            type="button"
            class="btn-paid-toggle"
            data-index="${index}"
            aria-pressed="${isPaid}"
            title="${isPaid ? 'Mark as unpaid' : 'Mark as paid'}"
          >
            <span>${isPaid ? '✓ Paid' : 'Unpaid'}</span>
          </button>
          <button
            type="button"
            class="btn-copy-person"
            data-index="${index}"
            data-amount="${share.amount.toFixed(2)}"
            title="Copy share for this person"
            aria-label="Copy share for ${escapeHtml(currentName)}"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        </div>
      `;

      personListContainer.appendChild(card);
    });

    // Attach Event Listeners to individual card controls
    attachPersonCardEvents();
  }

  function getInitials(name, indexFallback) {
    if (!name) return `P${indexFallback}`;
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    if (parts[0].length >= 2 && parts[0].toLowerCase().startsWith('person')) {
      return `P${parts[0].replace(/\D/g, '') || indexFallback}`;
    }
    return parts[0].slice(0, 2).toUpperCase();
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function attachPersonCardEvents() {
    // 1. Editable Name Inputs
    const nameInputs = personListContainer.querySelectorAll('.person-name-input');
    nameInputs.forEach((input) => {
      const handleNameChange = (e) => {
        const idx = e.target.dataset.index;
        const val = e.target.value.trim();
        state.customNames[idx] = val;
        // Update avatar
        const card = e.target.closest('.person-card');
        if (card) {
          const avatar = card.querySelector('.person-avatar');
          if (avatar) avatar.textContent = getInitials(val, parseInt(idx, 10) + 1);
        }
        saveState();
      };

      input.addEventListener('input', handleNameChange);
      input.addEventListener('change', handleNameChange);

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.target.blur();
        }
      });
    });

    // 2. Paid Toggle Buttons
    const paidToggles = personListContainer.querySelectorAll('.btn-paid-toggle');
    paidToggles.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const targetBtn = e.currentTarget;
        const idx = targetBtn.dataset.index;
        const card = targetBtn.closest('.person-card');
        const currentlyPaid = !!state.paidStatus[idx];
        const nextPaid = !currentlyPaid;

        state.paidStatus[idx] = nextPaid;
        targetBtn.setAttribute('aria-pressed', nextPaid);

        if (nextPaid) {
          card.classList.add('settled');
          targetBtn.querySelector('span').textContent = '✓ Paid';
        } else {
          card.classList.remove('settled');
          targetBtn.querySelector('span').textContent = 'Unpaid';
        }

        updateSettlementProgress(parseInt(numPeopleInput.value, 10) || 1);
        saveState();
      });
    });

    // 3. Copy Individual Share Button
    const copyButtons = personListContainer.querySelectorAll('.btn-copy-person');
    copyButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const targetBtn = e.currentTarget;
        const idx = targetBtn.dataset.index;
        const amount = targetBtn.dataset.amount;
        const name = state.customNames[idx] || `Person ${parseInt(idx, 10) + 1}`;
        const occasion = occasionInput.value.trim() || 'Dinner';

        const textToCopy = `${name}'s share for ${occasion}: ${state.currency}${amount}`;
        copyTextToClipboard(textToCopy, `Copied: ${name}'s share (${state.currency}${amount})`);
      });
    });
  }

  function updateSettlementProgress(totalPeople) {
    let paidCount = 0;
    for (let i = 0; i < totalPeople; i++) {
      if (state.paidStatus[i]) {
        paidCount++;
      }
    }

    const pct = totalPeople > 0 ? Math.round((paidCount / totalPeople) * 100) : 0;
    settledProgressCount.textContent = `${paidCount} of ${totalPeople} settled (${pct}%)`;
    settledProgressBar.style.width = `${pct}%`;
  }

  /* --------------------------------------------------------------------------
     Clipboard Copying
     -------------------------------------------------------------------------- */
  function copyTextToClipboard(text, successMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => showToast(successMsg))
        .catch(() => fallbackCopyText(text, successMsg));
    } else {
      fallbackCopyText(text, successMsg);
    }
  }

  function fallbackCopyText(text, successMsg) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      showToast(successMsg);
    } catch (err) {
      showToast('Unable to auto-copy. Please copy manually.');
    }
    document.body.removeChild(textArea);
  }

  function generateFullSummaryText() {
    const occasion = occasionInput.value.trim() || 'Dinner with Friends';
    const bill = parseFloat(billAmountInput.value) || 0;
    const people = parseInt(numPeopleInput.value, 10) || 1;
    const tip = getTipAmount(bill);
    const total = bill + tip;
    const split = calculatePennyPerfectSplit(total, people);

    const lines = [];
    lines.push(`Bill Split: ${occasion}`);
    lines.push(`Total Bill: ${formatMoney(total)} (Subtotal: ${formatMoney(bill)}, Tip: ${formatMoney(tip)})`);
    lines.push(`Party Size: ${people} people`);
    lines.push(`--------------------------------`);

    split.shares.forEach((share, index) => {
      const name = state.customNames[index] || `Person ${index + 1}`;
      const isPaid = state.paidStatus[index] ? ' [PAID]' : ' [UNPAID]';
      lines.push(`• ${name}: ${formatMoney(share.amount)}${isPaid}`);
    });

    lines.push(`--------------------------------`);
    lines.push(`Exact penny-verified total: ${formatMoney(split.exactSum)}`);
    return lines.join('\n');
  }

  /* --------------------------------------------------------------------------
     Bill History Management (Persistent in localStorage)
     -------------------------------------------------------------------------- */
  function loadHistory() {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        billHistory = JSON.parse(stored) || [];
      } else {
        billHistory = [];
      }
    } catch (err) {
      console.warn('Could not load bill history', err);
      billHistory = [];
    }
    updateHistoryBadge();
    renderHistoryList();
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(billHistory));
    } catch (err) {
      console.warn('Could not save bill history', err);
    }
    updateHistoryBadge();
  }

  function updateHistoryBadge() {
    if (historyCountBadge) {
      historyCountBadge.textContent = billHistory.length;
      historyCountBadge.style.display = billHistory.length > 0 ? 'inline-block' : 'none';
    }
  }

  function addOrUpdateHistory(splitData, bill, tipAmount, people, occasion) {
    const finalTotal = Math.round((bill + tipAmount) * 100) / 100;
    const now = new Date();
    const formattedDate = `${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    let paidCount = 0;
    for (let i = 0; i < people; i++) {
      if (state.paidStatus[i]) paidCount++;
    }

    if (state.activeBillId) {
      const existing = billHistory.find((item) => item.id === state.activeBillId);
      if (existing) {
        existing.occasion = occasion;
        existing.billAmount = bill.toString();
        existing.numPeople = people;
        existing.currency = state.currency;
        existing.tipPercent = state.tipPercent;
        existing.isCustomTip = state.isCustomTip;
        existing.customTipValue = state.customTipValue;
        existing.tipType = state.tipType;
        existing.tipAmount = tipAmount;
        existing.totalWithTip = finalTotal;
        existing.perPersonAvg = (finalTotal / people).toFixed(2);
        existing.customNames = { ...state.customNames };
        existing.paidStatus = { ...state.paidStatus };
        existing.paidCount = paidCount;
        existing.formattedDate = formattedDate;
        saveHistory();
        renderHistoryList();
        return;
      }
    }

    const newItem = {
      id: 'bill_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: Date.now(),
      formattedDate: formattedDate,
      occasion: occasion,
      billAmount: bill.toString(),
      numPeople: people,
      currency: state.currency,
      tipPercent: state.tipPercent,
      isCustomTip: state.isCustomTip,
      customTipValue: state.customTipValue,
      tipType: state.tipType,
      tipAmount: tipAmount,
      totalWithTip: finalTotal,
      perPersonAvg: (finalTotal / people).toFixed(2),
      customNames: { ...state.customNames },
      paidStatus: { ...state.paidStatus },
      paidCount: paidCount,
    };

    state.activeBillId = newItem.id;
    billHistory.unshift(newItem);
    if (billHistory.length > 50) {
      billHistory = billHistory.slice(0, 50);
    }
    saveHistory();
    renderHistoryList();
  }

  function deleteHistoryItem(id) {
    const itemToDelete = billHistory.find((item) => item.id === id);
    const title = itemToDelete ? itemToDelete.occasion : 'Bill';
    billHistory = billHistory.filter((item) => item.id !== id);
    if (state.activeBillId === id) {
      state.activeBillId = null;
    }
    saveHistory();
    renderHistoryList();
    showToast(`Deleted "${title}" from history.`);
  }

  function clearAllHistory() {
    if (billHistory.length === 0) {
      showToast('History is already empty.');
      return;
    }
    billHistory = [];
    state.activeBillId = null;
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch (err) {}
    saveHistory();
    renderHistoryList();
    showToast('All bill history has been deleted.');
  }

  function loadHistoryItem(id) {
    const item = billHistory.find((b) => b.id === id);
    if (!item) return;

    state.activeBillId = item.id;
    state.currency = item.currency || '$';
    if (currencySelect) currencySelect.value = state.currency;
    if (billCurrencySymbol) billCurrencySymbol.textContent = state.currency;

    occasionInput.value = item.occasion || '';
    state.occasion = item.occasion || '';

    billAmountInput.value = item.billAmount || '';
    state.billAmount = item.billAmount || '';

    numPeopleInput.value = item.numPeople || 3;
    state.numPeople = parseInt(item.numPeople, 10) || 3;
    syncPartySizeChips(state.numPeople);

    state.tipPercent = typeof item.tipPercent !== 'undefined' ? item.tipPercent : 15;
    state.isCustomTip = !!item.isCustomTip;
    state.customTipValue = item.customTipValue || 0;
    state.tipType = item.tipType || 'percent';
    syncTipUI();

    state.customNames = item.customNames ? { ...item.customNames } : {};
    state.paidStatus = item.paidStatus ? { ...item.paidStatus } : {};

    renderSplitResults();
    closeHistoryDrawer();
    showToast(`Loaded "${item.occasion}" from history.`);
  }

  function renderHistoryList() {
    if (!historyListContainer) return;
    historyListContainer.innerHTML = '';

    if (billHistory.length === 0) {
      historyListContainer.innerHTML = `
        <div class="history-empty">
          <div class="history-empty-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <h3 class="history-empty-title">No Previous Bills</h3>
          <p class="history-empty-desc">
            Whenever you calculate a split, it will be automatically saved here so you can view, reload, or delete it anytime.
          </p>
        </div>
      `;
      return;
    }

    billHistory.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'history-card';
      card.dataset.id = item.id;

      const curr = item.currency || '$';
      const totalFmt = `${curr}${Number(item.totalWithTip || 0).toFixed(2)}`;
      const avgFmt = `${curr}${Number(item.perPersonAvg || 0).toFixed(2)}`;
      const paidText = `${item.paidCount || 0} of ${item.numPeople} paid`;

      card.innerHTML = `
        <div class="history-card-header">
          <h4 class="history-occasion-name">${escapeHtml(item.occasion || 'Dinner Split')}</h4>
          <time class="history-time">${escapeHtml(item.formattedDate || '')}</time>
        </div>

        <div class="history-metrics-row">
          <div class="history-total-block">
            <span class="history-label">Total Bill</span>
            <span class="history-total-val">${totalFmt}</span>
          </div>
          <div class="history-split-block">
            <span class="history-label">${item.numPeople} ${item.numPeople === 1 ? 'person' : 'friends'}</span>
            <span class="history-per-person">${avgFmt} / ea</span>
          </div>
        </div>

        <div class="history-card-actions">
          <span class="history-settled-badge">${paidText}</span>
          <div style="display: flex; align-items: center; gap: 0.375rem;">
            <button type="button" class="btn-load-history" data-id="${item.id}" title="Load this bill into the calculator">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
              </svg>
              <span>Load</span>
            </button>
            <button type="button" class="btn-delete-history" data-id="${item.id}" title="Delete this bill from history">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              <span>Delete</span>
            </button>
          </div>
        </div>
      `;

      historyListContainer.appendChild(card);
    });

    // Attach click events
    const loadButtons = historyListContainer.querySelectorAll('.btn-load-history');
    loadButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        loadHistoryItem(id);
      });
    });

    const deleteButtons = historyListContainer.querySelectorAll('.btn-delete-history');
    deleteButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        deleteHistoryItem(id);
      });
    });
  }

  function openHistoryDrawer() {
    if (!historyDrawer || !historyOverlay) return;
    renderHistoryList();
    historyOverlay.style.display = 'block';
    historyDrawer.classList.add('open');
    historyDrawer.setAttribute('aria-hidden', 'false');
  }

  function closeHistoryDrawer() {
    if (!historyDrawer || !historyOverlay) return;
    historyDrawer.classList.remove('open');
    historyDrawer.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
      if (!historyDrawer.classList.contains('open')) {
        historyOverlay.style.display = 'none';
      }
    }, 220);
  }

  function syncActiveBillToHistory() {
    if (!state.activeBillId) return;
    const existing = billHistory.find((item) => item.id === state.activeBillId);
    if (!existing) return;
    existing.customNames = { ...state.customNames };
    existing.paidStatus = { ...state.paidStatus };
    let paidCount = 0;
    const people = parseInt(numPeopleInput.value, 10) || 1;
    for (let i = 0; i < people; i++) {
      if (state.paidStatus[i]) paidCount++;
    }
    existing.paidCount = paidCount;
    saveHistory();
  }

  /* --------------------------------------------------------------------------
     State Persistence (localStorage)
     -------------------------------------------------------------------------- */
  function saveState() {
    try {
      const dataToSave = {
        currency: state.currency,
        occasion: occasionInput.value,
        billAmount: billAmountInput.value,
        numPeople: numPeopleInput.value,
        tipPercent: state.tipPercent,
        isCustomTip: state.isCustomTip,
        customTipValue: state.customTipValue,
        tipType: state.tipType,
        hasCalculated: state.hasCalculated,
        customNames: state.customNames,
        paidStatus: state.paidStatus,
        activeBillId: state.activeBillId,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
      syncActiveBillToHistory();
    } catch (err) {
      console.warn('Could not save DineSplit state to localStorage', err);
    }
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return false;

      const data = JSON.parse(saved);
      if (!data) return false;

      if (data.activeBillId) {
        state.activeBillId = data.activeBillId;
      }

      // Restore currency
      if (data.currency) {
        state.currency = data.currency;
        if (currencySelect) currencySelect.value = data.currency;
        if (billCurrencySymbol) billCurrencySymbol.textContent = data.currency;
      }

      // Restore form inputs
      if (typeof data.occasion === 'string') {
        occasionInput.value = data.occasion;
        state.occasion = data.occasion;
      }

      if (typeof data.billAmount === 'string') {
        billAmountInput.value = data.billAmount;
        state.billAmount = data.billAmount;
      }

      if (data.numPeople) {
        numPeopleInput.value = data.numPeople;
        state.numPeople = parseInt(data.numPeople, 10);
        syncPartySizeChips(state.numPeople);
      }

      // Restore tip selection
      if (typeof data.tipPercent !== 'undefined') {
        state.tipPercent = data.tipPercent;
        state.isCustomTip = !!data.isCustomTip;
        state.customTipValue = data.customTipValue || 0;
        state.tipType = data.tipType || 'percent';

        syncTipUI();
      }

      // Restore names and paid status
      if (data.customNames) state.customNames = data.customNames;
      if (data.paidStatus) state.paidStatus = data.paidStatus;

      // If user had already calculated previously, recalculate so the result is immediately visible
      if (data.hasCalculated && data.billAmount && Number(data.billAmount) > 0 && data.numPeople > 0) {
        renderSplitResults();
        return true;
      }
    } catch (err) {
      console.warn('Failed to parse saved DineSplit state', err);
    }
    return false;
  }

  function syncPartySizeChips(count) {
    partyPresets.forEach((chip) => {
      const size = parseInt(chip.dataset.size, 10);
      if (size === count) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  }

  function syncTipUI() {
    tipButtons.forEach((btn) => {
      const tipVal = btn.dataset.tip;
      if (state.isCustomTip && tipVal === 'custom') {
        btn.classList.add('active');
      } else if (!state.isCustomTip && tipVal === String(state.tipPercent)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (state.isCustomTip) {
      customTipContainer.style.display = 'flex';
      customTipValue.value = state.customTipValue || '';
      if (state.tipType === 'percent') {
        customTipTypePercent.classList.add('active');
        customTipTypeFixed.classList.remove('active');
        customTipSuffix.textContent = '%';
      } else {
        customTipTypePercent.classList.remove('active');
        customTipTypeFixed.classList.add('active');
        customTipSuffix.textContent = state.currency;
      }
    } else {
      customTipContainer.style.display = 'none';
    }

    updateTipPreview();
  }

  function resetAll() {
    // Clear state
    state.occasion = '';
    state.billAmount = '';
    state.numPeople = 3;
    state.tipPercent = 15;
    state.isCustomTip = false;
    state.customTipValue = 0;
    state.hasCalculated = false;
    state.customNames = {};
    state.paidStatus = {};
    state.activeBillId = null;

    // Reset inputs
    occasionInput.value = '';
    billAmountInput.value = '';
    numPeopleInput.value = '3';
    syncPartySizeChips(3);
    syncTipUI();

    // Reset view
    hideError();
    emptyResultsState.style.display = 'flex';
    activeResultsState.style.display = 'none';

    // Clear local storage
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}

    showToast('Started a fresh bill.');
    billAmountInput.focus();
  }

  /* --------------------------------------------------------------------------
     Event Listeners
     -------------------------------------------------------------------------- */
  function setupEventListeners() {
    // Form submission
    billForm.addEventListener('submit', (e) => {
      e.preventDefault();
      renderSplitResults();
    });

    // Dismiss Error
    if (dismissErrorBtn) {
      dismissErrorBtn.addEventListener('click', hideError);
    }

    // Currency selector
    if (currencySelect) {
      currencySelect.addEventListener('change', (e) => {
        state.currency = e.target.value;
        billCurrencySymbol.textContent = state.currency;
        if (state.isCustomTip && state.tipType === 'fixed') {
          customTipSuffix.textContent = state.currency;
        }
        updateTipPreview();
        if (state.hasCalculated) {
          renderSplitResults();
        } else {
          saveState();
        }
      });
    }

    // Reset button
    if (resetAllBtn) {
      resetAllBtn.addEventListener('click', resetAll);
    }

    // Occasion input autosave
    occasionInput.addEventListener('input', () => {
      state.occasion = occasionInput.value;
      saveState();
    });

    // Occasion presets
    occasionPresets.forEach((tag) => {
      tag.addEventListener('click', () => {
        occasionInput.value = tag.dataset.preset;
        state.occasion = tag.dataset.preset;
        if (state.hasCalculated) {
          renderSplitResults();
        } else {
          saveState();
        }
      });
    });

    // Party size stepper
    if (decrementPeopleBtn) {
      decrementPeopleBtn.addEventListener('click', () => {
        const current = parseInt(numPeopleInput.value, 10) || 1;
        if (current > 1) {
          numPeopleInput.value = current - 1;
          syncPartySizeChips(current - 1);
          if (state.hasCalculated) {
            renderSplitResults();
          } else {
            saveState();
          }
        }
      });
    }

    if (incrementPeopleBtn) {
      incrementPeopleBtn.addEventListener('click', () => {
        const current = parseInt(numPeopleInput.value, 10) || 1;
        if (current < 100) {
          numPeopleInput.value = current + 1;
          syncPartySizeChips(current + 1);
          if (state.hasCalculated) {
            renderSplitResults();
          } else {
            saveState();
          }
        }
      });
    }

    // Direct input on number of people
    numPeopleInput.addEventListener('input', () => {
      const val = parseInt(numPeopleInput.value, 10);
      syncPartySizeChips(val);
      if (state.hasCalculated) {
        renderSplitResults();
      } else {
        saveState();
      }
    });

    // Party size chips
    partyPresets.forEach((chip) => {
      chip.addEventListener('click', () => {
        const size = parseInt(chip.dataset.size, 10);
        numPeopleInput.value = size;
        syncPartySizeChips(size);
        if (state.hasCalculated) {
          renderSplitResults();
        } else {
          saveState();
        }
      });
    });

    // Bill input live preview of tip & autosave
    billAmountInput.addEventListener('input', () => {
      state.billAmount = billAmountInput.value;
      updateTipPreview();
      if (parseFloat(billAmountInput.value) > 0) {
        hideError();
      }
      saveState();
    });

    // Tip buttons
    tipButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tipVal = btn.dataset.tip;
        if (tipVal === 'custom') {
          state.isCustomTip = true;
        } else {
          state.isCustomTip = false;
          state.tipPercent = parseInt(tipVal, 10);
        }
        syncTipUI();
        if (state.hasCalculated) {
          renderSplitResults();
        } else {
          saveState();
        }
      });
    });

    // Custom tip type toggle (% vs fixed)
    if (customTipTypePercent) {
      customTipTypePercent.addEventListener('click', () => {
        state.tipType = 'percent';
        customTipTypePercent.classList.add('active');
        customTipTypeFixed.classList.remove('active');
        customTipSuffix.textContent = '%';
        updateTipPreview();
        if (state.hasCalculated) renderSplitResults();
        else saveState();
      });
    }

    if (customTipTypeFixed) {
      customTipTypeFixed.addEventListener('click', () => {
        state.tipType = 'fixed';
        customTipTypeFixed.classList.add('active');
        customTipTypePercent.classList.remove('active');
        customTipSuffix.textContent = state.currency;
        updateTipPreview();
        if (state.hasCalculated) renderSplitResults();
        else saveState();
      });
    }

    // Custom tip value input
    if (customTipValue) {
      customTipValue.addEventListener('input', () => {
        state.customTipValue = parseFloat(customTipValue.value) || 0;
        updateTipPreview();
        if (state.hasCalculated) renderSplitResults();
        else saveState();
      });
    }

    // Copy Summary Button
    if (copySummaryBtn) {
      copySummaryBtn.addEventListener('click', () => {
        const summaryText = generateFullSummaryText();
        copyTextToClipboard(summaryText, 'Full dinner split copied to clipboard!');
      });
    }

    // Print Receipt Button
    if (printReceiptBtn) {
      printReceiptBtn.addEventListener('click', () => {
        // If not calculated yet, run calculation first if valid
        if (!state.hasCalculated) {
          renderSplitResults();
        }
        window.print();
      });
    }

    // History Drawer Triggers
    if (openHistoryBtn) {
      openHistoryBtn.addEventListener('click', openHistoryDrawer);
    }

    if (viewHistoryFooterBtn) {
      viewHistoryFooterBtn.addEventListener('click', openHistoryDrawer);
    }

    if (closeHistoryBtn) {
      closeHistoryBtn.addEventListener('click', closeHistoryDrawer);
    }

    if (historyOverlay) {
      historyOverlay.addEventListener('click', closeHistoryDrawer);
    }

    if (clearAllHistoryBtn) {
      clearAllHistoryBtn.addEventListener('click', clearAllHistory);
    }

    // Close history drawer on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && historyDrawer && historyDrawer.classList.contains('open')) {
        closeHistoryDrawer();
      }
    });

    // Handle beforeprint event to ensure receipt is always populated
    window.addEventListener('beforeprint', () => {
      const rawBill = billAmountInput.value.trim();
      const rawPeople = numPeopleInput.value.trim();
      const bill = parseFloat(rawBill);
      const people = parseInt(rawPeople, 10);
      if (bill > 0 && people > 0) {
        const tipAmount = getTipAmount(bill);
        const finalTotal = Math.round((bill + tipAmount) * 100) / 100;
        const splitData = calculatePennyPerfectSplit(finalTotal, people);
        populatePrintReceipt(splitData, bill, tipAmount, people);
      }
    });
  }

  /* --------------------------------------------------------------------------
     Initialization
     -------------------------------------------------------------------------- */
  function init() {
    setupEventListeners();
    updateTipPreview();

    // Load saved history
    loadHistory();

    // Load saved session if existing (Persists across page reload)
    const hasLoaded = loadState();

    if (!hasLoaded) {
      // Default initial sync
      syncPartySizeChips(3);
      syncTipUI();
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
