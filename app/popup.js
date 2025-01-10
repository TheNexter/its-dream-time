document.addEventListener('DOMContentLoaded', function() {
  const sleepTimeInput = document.getElementById('sleepTime');
  const wakeTimeInput = document.getElementById('wakeTime');
  const saveButton = document.getElementById('save');
  const stopButton = document.getElementById('stop');
  const confirmationMessage = document.getElementById('confirmation');
  const stopConfirmationMessage = document.getElementById('stopConfirmation');

  let clickCount = 0;
  let clickCountNeeded = 100;
  let resetTimeout = null;

  // Load saved times from storage
  browser.storage.sync.get(['sleepTime', 'wakeTime'], function(data) {
    if (data.sleepTime) sleepTimeInput.value = data.sleepTime;
    if (data.wakeTime) wakeTimeInput.value = data.wakeTime;
  });

  // Save the new times
  saveButton.addEventListener('click', function() {
    const sleepTime = sleepTimeInput.value;
    const wakeTime = wakeTimeInput.value;
    browser.storage.sync.set({ sleepTime, wakeTime }, function() {
      // Notify the background script to schedule alarms
      browser.runtime.sendMessage({ action: 'updateSchedule' });
      // Show confirmation message
      confirmationMessage.style.display = 'block';
      // Hide the message after 2 seconds
      setTimeout(() => {
        confirmationMessage.style.display = 'none';
      }, 2000);
    });
  });

  // Stop blocking without deleting the stored times
  stopButton.addEventListener('click', function() {
    clickCount++;
    stopButton.textContent = `Stop Blocking Me (${clickCount}/${clickCountNeeded})`;

    // Change the button background color to red
    stopButton.style.backgroundColor = 'red';

    if (resetTimeout) {
      clearTimeout(resetTimeout);
    }

    resetTimeout = setTimeout(() => {
      clickCount = 0;
      stopButton.textContent = 'Stop Blocking Me';
      // Reset the button background color after 2 seconds of inactivity
      stopButton.style.backgroundColor = ''; // Reset to default button color
    }, 2000);

    if (clickCount >= clickCountNeeded) {
      // Notify the background script to stop blocking
      browser.runtime.sendMessage({ action: 'stopBlocking' });
      // Show stop confirmation message
      stopConfirmationMessage.style.display = 'block';
      // Hide the message after 2 seconds
      setTimeout(() => {
        stopConfirmationMessage.style.display = 'none';
      }, 2000);
      // Reset the counter and button text
      clickCount = 0;
      stopButton.textContent = 'Stop Blocking Me';
      // Reset the button background color
      stopButton.style.backgroundColor = '';
    }
  });
});