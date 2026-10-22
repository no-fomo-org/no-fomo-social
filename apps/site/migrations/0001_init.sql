-- Messages from the contact form.
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- People who asked to hear when new report types ship. One row per email.
CREATE TABLE waitlist (
  email TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
