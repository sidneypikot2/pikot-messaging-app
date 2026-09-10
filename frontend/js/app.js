document.getElementById("api-url").textContent = window.API_BASE_URL;

const statusEl = document.getElementById("api-status");

Api.healthCheck()
  .then(() => {
    statusEl.textContent = "API connected";
    statusEl.className = "status status--ok";
  })
  .catch(() => {
    statusEl.textContent = "API unreachable";
    statusEl.className = "status status--error";
  });
