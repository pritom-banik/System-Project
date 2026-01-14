// Load saved API key on popup open
document.addEventListener('DOMContentLoaded', async () => {
  const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey');
  if (geminiApiKey) {
    document.getElementById('apiKey').value = geminiApiKey;
  }
});

// Save API key
document.getElementById('saveBtn').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value.trim();
  const statusDiv = document.getElementById('status');
  
  if (!apiKey) {
    statusDiv.className = 'status error';
    statusDiv.textContent = 'Please enter an API key';
    return;
  }
  
  try {
    await chrome.storage.sync.set({ geminiApiKey: apiKey });
    statusDiv.className = 'status success';
    statusDiv.textContent = 'API key saved successfully!';
    
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  } catch (error) {
    statusDiv.className = 'status error';
    statusDiv.textContent = 'Failed to save API key';
  }
});