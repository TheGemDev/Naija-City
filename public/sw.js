self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Naija City', body: 'You have a new update.' };
  }
  const title = typeof payload.title === 'string' ? payload.title : 'Naija City';
  const options = {
    body: typeof payload.body === 'string' ? payload.body : 'You have a new update.',
    icon: '/icons/kaduna-life.svg',
    badge: '/icons/kaduna-life.svg',
    tag: typeof payload.tag === 'string' ? payload.tag : 'kaduna-life',
    data: {
      url: '/',
      chatUid: typeof payload.chatUid === 'string' ? payload.chatUid : null,
      // The phone app the notification is about (Police, Business, Family…): tapping it opens that app.
      app: typeof payload.app === 'string' ? payload.app : null,
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const { url, chatUid, app } = event.notification.data || {};
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if (chatUid) client.postMessage({ type: 'open-chat', uid: chatUid });
        else if (app) client.postMessage({ type: 'open-app', app });
        return;
      }
    }
    const target = new URL(url || '/', self.registration.scope);
    if (chatUid) target.searchParams.set('chat', chatUid);
    else if (app) target.searchParams.set('app', app);
    await self.clients.openWindow(target);
  })());
});
