// Lets phones install the site as an app. It caches nothing: every page and save goes to the server behind the login.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
