// A curated emoji set (not the full ~3000-emoji Unicode range) grouped into categories,
// used by both the composer's emoji button and the per-message reaction trigger — kept
// as a hand-rolled dataset rather than a CDN picker library, matching this app's existing
// zero-dependency conventions (see cable.js's own comment on the same tradeoff).
const EmojiPicker = {
  RECENT_KEY: "pikotchat_recent_emoji",
  MAX_RECENT: 24,

  CATEGORIES: [
    {
      name: "Smileys", icon: "😀", emoji: [
        ["😀", "grinning face happy"], ["😃", "smiling face happy"], ["😄", "smiling face happy"], ["😁", "grinning happy"],
        ["😆", "laughing happy"], ["😅", "sweat smile"], ["🤣", "rofl laughing"], ["😂", "joy tears laughing"],
        ["🙂", "slight smile"], ["😉", "wink"], ["😊", "blush smile"], ["😇", "angel innocent halo"],
        ["🥰", "hearts love smiling"], ["😍", "heart eyes love"], ["😘", "kiss love"], ["😋", "yum tongue tasty"],
        ["😛", "tongue playful"], ["🤪", "zany crazy silly"], ["🤗", "hug"], ["🤔", "thinking"],
        ["🤨", "raised eyebrow skeptical"], ["😐", "neutral"], ["😴", "sleeping"], ["🥳", "party celebration"],
      ],
    },
    {
      name: "Emotions", icon: "😢", emoji: [
        ["😢", "cry sad"], ["😭", "sob cry"], ["😡", "angry mad"], ["🤬", "swearing angry"],
        ["😱", "scream shock"], ["😨", "fearful scared"], ["😰", "anxious sweat"], ["😥", "sad relief"],
        ["😓", "sweat"], ["🥺", "pleading puppy eyes"], ["😤", "huff frustrated"], ["😩", "weary tired"],
        ["😫", "tired exhausted"], ["🥱", "yawn tired"], ["😷", "mask sick"], ["🤒", "thermometer sick"],
        ["🤕", "hurt injured"], ["🥵", "hot sweating"], ["🥶", "cold freezing"], ["🤢", "sick nauseous"],
      ],
    },
    {
      name: "Gestures", icon: "👍", emoji: [
        ["👍", "thumbs up good"], ["👎", "thumbs down bad"], ["👌", "ok"], ["✌️", "peace victory"],
        ["🤞", "fingers crossed hope"], ["🤟", "love you gesture"], ["🤘", "rock on"], ["🤙", "call me"],
        ["👋", "wave hello bye"], ["🤚", "raised hand"], ["✋", "stop hand"], ["🖖", "spock vulcan"],
        ["👏", "clap applause"], ["🙌", "raised hands celebrate"], ["🤝", "handshake deal"], ["🙏", "pray thanks please"],
        ["💪", "muscle strong flex"], ["👊", "fist bump"], ["✊", "fist power"], ["👆", "point up"],
        ["👇", "point down"], ["👈", "point left"], ["👉", "point right"], ["🤷", "shrug"],
      ],
    },
    {
      name: "Hearts", icon: "❤️", emoji: [
        ["❤️", "red heart love"], ["🧡", "orange heart"], ["💛", "yellow heart"], ["💚", "green heart"],
        ["💙", "blue heart"], ["💜", "purple heart"], ["🖤", "black heart"], ["🤍", "white heart"],
        ["🤎", "brown heart"], ["💔", "broken heart sad"], ["❣️", "heart exclamation"], ["💕", "two hearts love"],
        ["💞", "revolving hearts"], ["💓", "beating heart"], ["💗", "growing heart"], ["💖", "sparkling heart"],
      ],
    },
    {
      name: "Animals", icon: "🐶", emoji: [
        ["🐶", "dog puppy"], ["🐱", "cat kitten"], ["🐭", "mouse"], ["🐹", "hamster"],
        ["🐰", "rabbit bunny"], ["🦊", "fox"], ["🐻", "bear"], ["🐼", "panda"],
        ["🐨", "koala"], ["🐯", "tiger"], ["🦁", "lion"], ["🐮", "cow"],
        ["🐷", "pig"], ["🐸", "frog"], ["🐵", "monkey"], ["🐔", "chicken"],
        ["🐧", "penguin"], ["🐦", "bird"], ["🦄", "unicorn"], ["🐝", "bee"],
        ["🦋", "butterfly"], ["🐢", "turtle"], ["🐍", "snake"], ["🐙", "octopus"],
      ],
    },
    {
      name: "Food", icon: "🍕", emoji: [
        ["🍏", "green apple"], ["🍎", "red apple"], ["🍌", "banana"], ["🍉", "watermelon"],
        ["🍇", "grapes"], ["🍓", "strawberry"], ["🍒", "cherries"], ["🍑", "peach"],
        ["🍍", "pineapple"], ["🥑", "avocado"], ["🍕", "pizza"], ["🍔", "burger"],
        ["🍟", "fries"], ["🌭", "hot dog"], ["🍿", "popcorn"], ["🍩", "donut"],
        ["🍪", "cookie"], ["🎂", "cake birthday"], ["🍰", "cake slice"], ["🍫", "chocolate"],
        ["🍬", "candy"], ["🍭", "lollipop"], ["☕", "coffee"], ["🍺", "beer"],
      ],
    },
    {
      name: "Activities", icon: "⚽", emoji: [
        ["⚽", "soccer ball"], ["🏀", "basketball"], ["🏈", "football"], ["⚾", "baseball"],
        ["🎾", "tennis"], ["🏐", "volleyball"], ["🎱", "8ball pool"], ["🏓", "ping pong"],
        ["🎮", "video game controller"], ["🎲", "dice game"], ["🎸", "guitar music"], ["🎨", "art palette"],
        ["🎬", "movie clapper"], ["🚗", "car"], ["✈️", "airplane travel"], ["🚀", "rocket launch"],
        ["🚲", "bike bicycle"], ["⛵", "sailboat"], ["🏖️", "beach"], ["⛰️", "mountain"],
        ["🎉", "party popper celebrate"], ["🎁", "gift present"], ["🏆", "trophy win"], ["🔥", "fire lit"],
      ],
    },
    {
      name: "Symbols", icon: "💯", emoji: [
        ["💯", "100 perfect"], ["✅", "check mark done"], ["❌", "cross no wrong"], ["❓", "question mark"],
        ["❗", "exclamation mark"], ["⭐", "star"], ["🌟", "glowing star"], ["✨", "sparkles"],
        ["💥", "boom explosion"], ["💫", "dizzy stars"], ["💤", "sleep zzz"], ["💢", "anger mark"],
        ["💦", "sweat splash"], ["📱", "phone mobile"], ["💻", "laptop computer"], ["📷", "camera"],
        ["🎵", "music note"], ["🎶", "music notes"], ["💡", "idea lightbulb"], ["🔒", "lock"],
        ["🔑", "key"], ["📌", "pin"], ["🚩", "flag"], ["⏰", "alarm clock"],
      ],
    },
  ],

  getRecent() {
    try {
      return JSON.parse(localStorage.getItem(this.RECENT_KEY)) || [];
    } catch {
      return [];
    }
  },

  addRecent(emoji) {
    try {
      const recent = this.getRecent().filter((e) => e !== emoji);
      recent.unshift(emoji);
      localStorage.setItem(this.RECENT_KEY, JSON.stringify(recent.slice(0, this.MAX_RECENT)));
    } catch {
      // Private browsing / storage disabled — recents just won't persist, not fatal.
    }
  },

  searchIndex() {
    if (!this._index) this._index = this.CATEGORIES.flatMap((cat) => cat.emoji);
    return this._index;
  },

  // Builds the picker panel (search + category tabs + emoji grid) and returns it
  // unattached — the caller positions and appends it, and gets `onSelect(emoji)` on pick.
  create(onSelect) {
    const panel = document.createElement("div");
    panel.className = "emoji-picker";

    const search = document.createElement("input");
    search.type = "text";
    search.className = "emoji-picker-search";
    search.placeholder = "Search emoji…";
    panel.appendChild(search);

    const tabsEl = document.createElement("div");
    tabsEl.className = "emoji-picker-tabs";
    panel.appendChild(tabsEl);

    const grid = document.createElement("div");
    grid.className = "emoji-picker-grid";
    panel.appendChild(grid);

    const recent = this.getRecent();
    const panes = [];
    if (recent.length > 0) panes.push({ icon: "🕐", name: "Recently used", emoji: recent.map((e) => [e, ""]) });
    this.CATEGORIES.forEach((cat) => panes.push(cat));

    const renderGrid = (pairs) => {
      grid.replaceChildren();
      pairs.forEach(([emoji]) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "emoji-picker-item";
        btn.textContent = emoji;
        btn.addEventListener("click", () => {
          this.addRecent(emoji);
          onSelect(emoji);
        });
        grid.appendChild(btn);
      });
    };

    const tabButtons = panes.map((pane, index) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.textContent = pane.icon;
      tab.title = pane.name;
      tab.addEventListener("click", () => showPane(index));
      tabsEl.appendChild(tab);
      return tab;
    });

    function showPane(index) {
      tabButtons.forEach((b, i) => b.classList.toggle("active", i === index));
      renderGrid(panes[index].emoji);
    }

    search.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      if (!query) {
        showPane(0);
        return;
      }
      tabButtons.forEach((b) => b.classList.remove("active"));
      renderGrid(this.searchIndex().filter(([, keywords]) => keywords.includes(query)));
    });

    showPane(0);
    return panel;
  },
};
