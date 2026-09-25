// Minimal hand-rolled Action Cable client (raw WebSocket, no @rails/actioncable — this
// app has no build step/bundler, and Action Cable's wire protocol is simple enough to
// hand-roll: {command, identifier} JSON frames out, {type: ...} control frames and
// {identifier, message} broadcast frames in. `identifier` is always a JSON-*encoded
// string*, not a raw object.
function createCable(token) {
  const wsBase = window.API_BASE_URL.replace(/^http/, "ws");
  const subscriptions = new Map(); // identifier -> callback
  const queue = [];
  let socket;
  let open = false;
  let reconnectDelay = 1000;

  function connect() {
    socket = new WebSocket(`${wsBase}/cable?token=${encodeURIComponent(token)}`);

    socket.addEventListener("open", () => {
      open = true;
      reconnectDelay = 1000;
      queue.splice(0).forEach(send);
      subscriptions.forEach((_callback, identifier) => send({ command: "subscribe", identifier }));
    });

    socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.type) return; // welcome / ping / confirm_subscription / reject_subscription / disconnect

      const callback = subscriptions.get(data.identifier);
      if (callback) callback(data.message);
    });

    socket.addEventListener("close", () => {
      open = false;
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 15000);
    });
  }
  connect();

  function send(command) {
    if (open) {
      socket.send(JSON.stringify(command));
    } else {
      queue.push(command);
    }
  }

  function subscribe(channel, params, onReceived) {
    const identifier = JSON.stringify({ channel, ...params });
    subscriptions.set(identifier, onReceived);
    send({ command: "subscribe", identifier });

    return () => {
      send({ command: "unsubscribe", identifier });
      subscriptions.delete(identifier);
    };
  }

  function subscribeToConversation(conversationId, onReceived) {
    return subscribe("ConversationChannel", { conversation_id: conversationId }, onReceived);
  }

  // Per-user, session-long stream — subscribed once at init, never torn down, unlike
  // subscribeToConversation which swaps as the user navigates between conversations.
  function subscribeToNotifications(onReceived) {
    return subscribe("NotificationsChannel", {}, onReceived);
  }

  return { subscribeToConversation, subscribeToNotifications };
}

window.Cable = { create: createCable };
