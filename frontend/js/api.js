// The only place that calls fetch(): the Api object, one method per backend endpoint,
// used by every page. No UI.

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

    return res.json(); // { user, status } — status is the user's own chosen status (KAN-39)
  },

  // Online / Idle / Do Not Disturb / Offline ("online" | "idle" | "dnd" | "offline") (KAN-39)
  // durationMinutes (Do Not Disturb / Offline only): 10, 30, 60, 360 or 1440; null = until turned off.
  async updateStatus(token, status, durationMinutes = null) {
    const res = await fetch(`${window.API_BASE_URL}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status, duration_minutes: durationMinutes }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.errors || [])[0] || `Failed to update status (${res.status})`);
    return data; // { status, status_until }
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

    return res.json(); // { conversations: [{ id, kind, name, members, other_user, created_at, ... }] }
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

  // Group chat (KAN-35): the creator plus memberIds (at least 2 other people).
  async createGroupchat(token, name, memberIds) {
    const res = await fetch(`${window.API_BASE_URL}/groupchats`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, member_ids: memberIds }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.errors && data.errors.join(", ")) || `Failed to create group (${res.status})`);

    return data; // { conversation }
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

  async sendMessage(token, conversationId, body, replyToMessageId) {
    const payload = { body };
    if (replyToMessageId) payload.reply_to_message_id = replyToMessageId;

    const res = await fetch(`${window.API_BASE_URL}/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
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

  // scope: "everyone" (unsend for everyone) or "me" (unsend for you only) — KAN-30.
  async deleteMessage(token, messageId, scope = "everyone") {
    const res = await fetch(`${window.API_BASE_URL}/messages/${messageId}?scope=${encodeURIComponent(scope)}`, {
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

  async conversation(token, conversationId) {
    const res = await fetch(`${window.API_BASE_URL}/conversations/${conversationId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Failed to load conversation (${res.status})`);
    return res.json();
  },

  async markConversationRead(token, conversationId) {
    const res = await fetch(`${window.API_BASE_URL}/conversations/${conversationId}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Failed to mark conversation as read (${res.status})`);
  },

  // --- Conversation settings (KAN-41) ---
  // Each returns { conversation } with the changes applied, except the two that take the
  // conversation away from the current user (removeMember on yourself, deleteConversation).

  // Any of { name (groups only), theme }; theme "" goes back to the default.
  async updateConversation(token, conversationId, changes) {
    return this._settingsRequest(token, "PATCH", `/conversations/${conversationId}`, changes);
  },

  async setNickname(token, conversationId, userId, nickname) {
    return this._settingsRequest(token, "PATCH", `/conversations/${conversationId}/members/${userId}`, { nickname });
  },

  async addMembers(token, conversationId, memberIds) {
    return this._settingsRequest(token, "POST", `/conversations/${conversationId}/members`, { member_ids: memberIds });
  },

  // Removing yourself is leaving the group.
  async removeMember(token, conversationId, userId) {
    return this._settingsRequest(token, "DELETE", `/conversations/${conversationId}/members/${userId}`);
  },

  // durationMinutes: 15, 60, 480 or 1440; null = until turned back on.
  async muteConversation(token, conversationId, durationMinutes) {
    return this._settingsRequest(token, "PUT", `/conversations/${conversationId}/mute`, { duration_minutes: durationMinutes });
  },

  async unmuteConversation(token, conversationId) {
    return this._settingsRequest(token, "DELETE", `/conversations/${conversationId}/mute`);
  },

  // Pinned note (KAN-44): any member can set it; a blank body removes it.
  async updateConversationNote(token, conversationId, body) {
    return this._settingsRequest(token, "PUT", `/conversations/${conversationId}/note`, { body });
  },

  // "Delete chat" — for the current user only.
  async deleteConversation(token, conversationId) {
    return this._settingsRequest(token, "DELETE", `/conversations/${conversationId}`);
  },

  async _settingsRequest(token, method, path, body) {
    const res = await fetch(`${window.API_BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.errors || [])[0] || data.error || `Something went wrong (${res.status})`);
    return data;
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
