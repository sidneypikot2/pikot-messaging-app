// What this proves: the pages load without script errors, login works, and a message
// travels between two signed-in users over both real-time paths. It is a smoke test —
// one happy path through the parts everything else depends on, not feature coverage.
import { test, expect } from "@playwright/test";

// Created by tools/smoke/ensure_users.rb.
const PASSWORD = "smoke-test-password";
const ALICE = { email: "smoke-alice@example.com", name: "Smoke Alice", username: "smoke_alice" };
const BOB = { email: "smoke-bob@example.com", name: "Smoke Bob", username: "smoke_bob" };

// Uncaught exceptions and console errors: a page that renders but logs errors is broken.
function collectErrors(page, label, errors) {
  page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${label}: console: ${message.text()}`);
  });
}

// Signs in through the login form and returns once the chat is usable: the conversation
// list has loaded and the NotificationsChannel subscription is confirmed. Without the
// second wait, a message sent right away could be broadcast before this user is listening.
async function signIn(browser, user, errors) {
  const context = await browser.newContext();
  const page = await context.newPage();
  collectErrors(page, user.username, errors);

  const subscribed = new Promise((resolve) => {
    page.on("websocket", (socket) => {
      socket.on("framereceived", ({ payload }) => {
        const frame = String(payload);
        if (frame.includes("confirm_subscription") && frame.includes("NotificationsChannel")) resolve();
      });
    });
  });

  await page.goto("/login.html");
  await page.fill("#email", user.email);
  await page.fill("#password", PASSWORD);
  await page.click("#login-submit");
  await page.waitForURL("**/index.html");
  await expect(page.locator("#conversation-list")).not.toHaveAttribute("aria-busy", "true");
  await subscribed;
  return page;
}

test("the public pages load without script errors", async ({ page }) => {
  const errors = [];
  collectErrors(page, "public", errors);

  await page.goto("/login.html");
  await expect(page.locator("#login-form")).toBeVisible();
  await page.goto("/signup.html");
  await expect(page.locator("form")).toBeVisible();

  expect(errors).toEqual([]);
});

test("a wrong password is rejected with a message", async ({ page }) => {
  await page.goto("/login.html");
  await page.fill("#email", ALICE.email);
  await page.fill("#password", "not-the-password");
  await page.click("#login-submit");

  await expect(page.locator("#form-error")).toBeVisible();
  await expect(page).toHaveURL(/login\.html/);
});

test("a message reaches the other user live, in both directions", async ({ browser }) => {
  const errors = [];
  const alice = await signIn(browser, ALICE, errors);
  const bob = await signIn(browser, BOB, errors);

  const stamp = Date.now();
  const hello = `smoke hello ${stamp}`;
  const reply = `smoke reply ${stamp}`;

  // Alice finds Bob and sends a message.
  await alice.fill("#user-search", BOB.username);
  await alice.locator("#search-results li", { hasText: BOB.name }).click();
  await alice.fill("#composer-input", hello);
  await alice.click("#composer-send");
  await expect(alice.locator("#message-list")).toContainText(hello);

  // Bob doesn't have that conversation open: the only way he hears about it is his
  // NotificationsChannel, which refreshes the list preview.
  const row = bob.locator("#conversation-list li", { hasText: hello });
  await expect(row).toBeVisible();
  await row.click();
  await expect(bob.locator("#message-list")).toContainText(hello);

  // Alice has the conversation open: Bob's reply arrives on its ConversationChannel.
  await bob.fill("#composer-input", reply);
  await bob.click("#composer-send");
  await expect(alice.locator("#message-list")).toContainText(reply);

  expect(errors).toEqual([]);
});
