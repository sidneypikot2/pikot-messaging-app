const Api = {
  async healthCheck() {
    const res = await fetch(`${window.API_BASE_URL}/up`);
    if (!res.ok) throw new Error(`API health check failed: ${res.status}`);
    return res;
  },
};
