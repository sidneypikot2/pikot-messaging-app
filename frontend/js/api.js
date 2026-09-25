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

  async signup({ email, password, passwordConfirmation, firstName, lastName, username, avatarFile }) {
    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password);
    formData.append("password_confirmation", passwordConfirmation);
    formData.append("first_name", firstName);
    formData.append("last_name", lastName);
    formData.append("username", username);
    if (avatarFile) formData.append("avatar", avatarFile);

    // No Content-Type header here — the browser sets the multipart boundary itself.
    const res = await fetch(`${window.API_BASE_URL}/signup`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error((data.errors && data.errors.join(", ")) || `Signup failed (${res.status})`);
    }

    return data; // { user: { id, email, username, first_name, last_name, verified, avatar_url } }
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
