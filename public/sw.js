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
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const { url, chatUid } = event.notification.data || {};
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if (chatUid) client.postMessage({ type: 'open-chat', uid: chatUid });
        return;
      }
    }
    const target = new URL(url || '/', self.registration.scope);
    if (chatUid) target.searchParams.set('chat', chatUid);
    await self.clients.openWindow(target);
  })());
});
