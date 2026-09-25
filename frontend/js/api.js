const Api = {
  async healthCheck() {
    const res = await fetch(`${window.API_BASE_URL}/up`);
    if (!res.ok) throw new Error(`API health check failed: ${res.status}`);
    return res;
  },

  async login(email, password) {
    const res = await fetch(`${window.API_BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `Login failed (${res.status})`);
    }

    return data; // { token, user: { id, email, verified } }
  },

  async me(token) {
    const res = await fetch(`${window.API_BASE_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Session check failed (${res.status})`);

    return res.json(); // { user }
  },

  async signup({ email, password, passwordConfirmation, firstName, lastName, username }) {
    const res = await fetch(`${window.API_BASE_URL}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        password_confirmation: passwordConfirmation,
        first_name: firstName,
        last_name: lastName,
        username,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error((data.errors && data.errors.join(", ")) || `Signup failed (${res.status})`);
    }

    return data; // { user: { id, email, username, first_name, last_name, verified } }
  },

  async verifyEmail(token) {
    const res = await fetch(`${window.API_BASE_URL}/email_verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `Verification failed (${res.status})`);
    }

    return data; // { message }
  },
};
