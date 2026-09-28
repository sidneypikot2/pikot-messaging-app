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

  async conversations(token) {
    const res = await fetch(`${window.API_BASE_URL}/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Failed to load conversations (${res.status})`);

    return res.json(); // { conversations: [{ id, other_user, created_at }] }
  },

  async createConversation(token, otherUserId) {
    const res = await fetch(`${window.API_BASE_URL}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ user_id: otherUserId }),
    });

    if (!res.ok) throw new Error(`Failed to start conversation (${res.status})`);

    return res.json(); // { conversation }
  },

  async messages(token, conversationId, beforeCursor) {
    const url = new URL(`${window.API_BASE_URL}/conversations/${conversationId}/messages`);
    if (beforeCursor) url.searchParams.set("before", beforeCursor);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Failed to load messages (${res.status})`);

    return res.json(); // { messages: [...], has_more }
  },

  async sendMessage(token, conversationId, body) {
    const res = await fetch(`${window.API_BASE_URL}/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ body }),
    });

    if (!res.ok) throw new Error(`Failed to send message (${res.status})`);

    return res.json(); // { message }
  },

  async updateMessage(token, messageId, body) {
    const res = await fetch(`${window.API_BASE_URL}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ body }),
    });

    if (!res.ok) throw new Error(`Failed to edit message (${res.status})`);

    return res.json(); // { message }
  },

  async deleteMessage(token, messageId) {
    const res = await fetch(`${window.API_BASE_URL}/messages/${messageId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Failed to delete message (${res.status})`);
  },

  async toggleReaction(token, messageId, emoji) {
    const res = await fetch(`${window.API_BASE_URL}/messages/${messageId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ emoji }),
    });

    if (!res.ok) throw new Error(`Failed to react (${res.status})`);
  },

  async markConversationRead(token, conversationId) {
    const res = await fetch(`${window.API_BASE_URL}/conversations/${conversationId}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Failed to mark conversation as read (${res.status})`);
  },

  async searchUsers(token, query) {
    const url = new URL(`${window.API_BASE_URL}/users/search`);
    url.searchParams.set("q", query);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Search failed (${res.status})`);

    return res.json(); // { users: [...] }
  },
};
