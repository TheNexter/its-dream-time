let sleepTime = null;
let wakeTime = null;
let enforcedTabs = {}; // Track enforced tabs per window
let isUserBlocked = false; // Track if the user is currently blocked

// Load saved times and blocking state from storage
browser.storage.sync.get(['sleepTime', 'wakeTime', 'isUserBlocked'], function(data) {
  if (data.sleepTime) sleepTime = data.sleepTime;
  if (data.wakeTime) wakeTime = data.wakeTime;
  if (data.isUserBlocked !== undefined) isUserBlocked = data.isUserBlocked;

  // If the user is blocked but the current time is not within the sleep period, unblock them
  if (isUserBlocked && !isSleepTime()) {
    isUserBlocked = false;
    browser.storage.sync.set({ isUserBlocked: false });
  }

  scheduleAlarms();
});

// Convert HH:MM to minutes since midnight
function timeToMinutes(time) {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Convert HH:MM to a Date object for today
function timeToDate(time) {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  const now = new Date();
  now.setHours(hours, minutes, 0, 0);
  return now;
}

// Schedule alarms for sleep and wake times
function scheduleAlarms() {
  if (!sleepTime || !wakeTime) return;

  browser.alarms.clearAll();

  const sleepDate = timeToDate(sleepTime);
  browser.alarms.create('sleepAlarm', { when: sleepDate.getTime() });

  const wakeDate = timeToDate(wakeTime);
  if (wakeDate <= sleepDate) {
    wakeDate.setDate(wakeDate.getDate() + 1);
  }
  browser.alarms.create('wakeAlarm', { when: wakeDate.getTime() });
}

// Handle alarm events
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sleepAlarm') {
    isUserBlocked = true;
    browser.storage.sync.set({ isUserBlocked: true });
    enforceSleepSchedule();
  } else if (alarm.name === 'wakeAlarm') {
    isUserBlocked = false;
    browser.storage.sync.set({ isUserBlocked: false });
    stopEnforcing();
  }
});

// Enforce the sleep schedule
async function enforceSleepSchedule() {
  if (!isUserBlocked) return;

  const windows = await browser.windows.getAll();
  for (const window of windows) {
    const tabs = await browser.tabs.query({ windowId: window.id });
    const hasEnforcedTab = tabs.some(tab => tab.url.endsWith("tab.html"));

    if (!hasEnforcedTab) {
      openEnforcedTab(window.id);
    }
  }
}

// Stop enforcing the sleep schedule
async function stopEnforcing() {
  for (const windowId in enforcedTabs) {
    if (enforcedTabs[windowId]) {
      await browser.tabs.remove(enforcedTabs[windowId]);
    }
  }
  enforcedTabs = {}; // Clear the enforcedTabs
}

// Open the enforced tab in a window
async function openEnforcedTab(windowId) {
  // Ensure windowId is an integer
  const intWindowId = parseInt(windowId, 10);
  if (isNaN(intWindowId)) {
    console.error("Invalid windowId:", windowId);
    return;
  }

  try {
    const tab = await browser.tabs.create({
      url: "tab.html",
      windowId: intWindowId,
      active: true
    });
    enforcedTabs[windowId] = tab.id; // Store the tab ID for the specific window
  } catch (error) {
    console.error("Failed to create tab in window:", intWindowId, error);
    delete enforcedTabs[windowId]; // Remove the window from enforcedTabs if the tab creation fails
  }
}

// Force the user back to the enforced tab if they try to switch
browser.tabs.onActivated.addListener(async (activeInfo) => {
  if (!isUserBlocked) return;

  const windowId = activeInfo.windowId;
  if (enforcedTabs[windowId] && activeInfo.tabId !== enforcedTabs[windowId]) {
    await browser.tabs.update(enforcedTabs[windowId], { active: true });
  }
});

// Reopen the enforced tab if the user closes it
browser.tabs.onRemoved.addListener(async (tabId) => {
  if (isUserBlocked) {
    for (const windowId in enforcedTabs) {
      if (enforcedTabs[windowId] === tabId) {
        // Add a small delay to ensure the window removal event is processed first
        setTimeout(() => {
          if (enforcedTabs[windowId]) {
            openEnforcedTab(windowId);
          }
        }, 100); // 100ms delay to allow the window removal event to update enforcedTabs
        break;
      }
    }
  }
});

// Handle new windows
browser.windows.onCreated.addListener(async (window) => {
  if (isUserBlocked) {
    openEnforcedTab(window.id);
  }
});

// Handle window removal
browser.windows.onRemoved.addListener((windowId) => {
  if (enforcedTabs[windowId]) {
    delete enforcedTabs[windowId]; // Remove the window from enforcedTabs
  }
});

// Handle the "stopBlocking" message
browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === 'stopBlocking') {
    isUserBlocked = false;
    browser.storage.sync.set({ isUserBlocked: false });
    await stopEnforcing();
    browser.alarms.clearAll();
  } else if (message.action === 'updateSchedule') {
    browser.storage.sync.get(['sleepTime', 'wakeTime'], function(data) {
      if (data.sleepTime) sleepTime = data.sleepTime;
      if (data.wakeTime) wakeTime = data.wakeTime;
      scheduleAlarms();
    });
  }
});

// Check if the current time is within the sleep period
function isSleepTime() {
  if (!sleepTime || !wakeTime) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const sleepMinutes = timeToMinutes(sleepTime);
  const wakeMinutes = timeToMinutes(wakeTime);

  if (sleepMinutes < wakeMinutes) {
    return currentMinutes >= sleepMinutes && currentMinutes < wakeMinutes;
  } else {
    return currentMinutes >= sleepMinutes || currentMinutes < wakeMinutes;
  }
}

// Enforce the schedule when the extension starts
if (isUserBlocked && isSleepTime()) {
  enforceSleepSchedule();
}

// Block navigation away from tab.html
browser.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (!isUserBlocked) return;

  const tabId = details.tabId;
  const windowId = details.windowId;

  // Check if this is an enforced tab
  if (enforcedTabs[windowId] === tabId && !details.url.endsWith("tab.html")) {
    // Block navigation and redirect back to tab.html
    await browser.tabs.update(tabId, { url: "tab.html" });
  }
});